/** 悬浮面板公共行为：加载配置与主题、响应配置广播、失焦自动隐藏 */
import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConfigStore } from "../stores/configStore";
import { EVT_CONFIG_CHANGED, onEvent } from "./events";
import type { AppConfig } from "../types";

export function hideCurrentWindow() {
  getCurrentWindow().hide().catch(console.error);
}

/** 系统原生对话框（如文件夹选择）打开期间，抑制失焦自动隐藏 */
let nativeDialogOpen = false;

/** 在回调期间保持面板可见（系统弹窗会抢走焦点），关闭后重新聚焦面板 */
export async function withNativeDialog<T>(fn: () => Promise<T>): Promise<T> {
  nativeDialogOpen = true;
  try {
    return await fn();
  } finally {
    nativeDialogOpen = false;
    getCurrentWindow().setFocus().catch(() => undefined);
  }
}

/** stayVisible：置顶开启时面板常驻可见，失焦不再自动隐藏（Esc/热键仍可隐藏） */
export function usePanelCommon(stayVisible = false) {
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);
  /** 拖动守卫：点击/拖动 data-tauri-drag-region 头部启动原生窗口拖动时，
   *  WebView2 会瞬时失焦触发 window blur——若没有守卫会把面板误关
   *  （"一点击拖动区域面板就关闭"）。按下置位、松开后短暂延时清除。 */
  const dragGuardRef = useRef(false);

  useEffect(() => {
    load();

    const cleanup: Array<() => void> = [];

    // 配置变更后同步主题与行为参数；payload 缺失时回退为重新加载
    onEvent<AppConfig | undefined>(EVT_CONFIG_CHANGED, (cfg) => {
      if (cfg) sync(cfg);
      else void load();
    }).then((un) => cleanup.push(un));

    // 点击/拖动头部期间：置位拖动守卫（原生拖动导致瞬时失焦，期间不许隐藏）
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-tauri-drag-region]")) {
        dragGuardRef.current = true;
      }
    };
    const onMouseUp = () => {
      // 松开后短暂延时解除守卫（覆盖原生拖动期间/之后的瞬时失焦）
      window.setTimeout(() => {
        dragGuardRef.current = false;
      }, 250);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    cleanup.push(() => document.removeEventListener("mousedown", onMouseDown));
    cleanup.push(() => document.removeEventListener("mouseup", onMouseUp));

    // 失焦自动隐藏（不占任务栏，Esc 由面板组件处理）；置顶常驻、原生对话框
    // 与拖动头部期间例外。模糊走 SWCA BLURBEHIND，与窗口是否激活无关。
    const onBlur = () => {
      if (nativeDialogOpen || stayVisible) return;
      if (dragGuardRef.current) return;
      hideCurrentWindow();
    };
    window.addEventListener("blur", onBlur);
    cleanup.push(() => window.removeEventListener("blur", onBlur));

    // 鼠标悬停/点击面板即请求聚焦：WebView2 在窗口非活动（失焦）时不响应滚轮，
    // 导致"呼出后面板滚不动、要点一下才行"。鼠标一进面板就补一次 setFocus，
    // 滚轮立即可用（有真实鼠标输入时 Windows 允许置前，通常能成功）。
    const onMouseActivate = () => {
      if (!document.hasFocus()) {
        getCurrentWindow().setFocus().catch(() => undefined);
      }
    };
    document.addEventListener("mouseover", onMouseActivate);
    document.addEventListener("mousedown", onMouseActivate);
    cleanup.push(() => document.removeEventListener("mouseover", onMouseActivate));
    cleanup.push(() => document.removeEventListener("mousedown", onMouseActivate));

    return () => cleanup.forEach((fn) => fn());
  }, [load, sync, stayVisible]);
}
