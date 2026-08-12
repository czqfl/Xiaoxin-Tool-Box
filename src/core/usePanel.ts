/** 悬浮面板公共行为：加载配置与主题、响应配置广播、失焦自动隐藏 */
import { useEffect, useRef } from "react";
import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
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
   *  WebView2 会瞬时失焦触发 DOM blur——失焦隐藏不能监听 DOM blur（会把面板
   *  误关，见 onFocusChanged 注释），守卫仅作窗口级焦点的额外兜底。 */
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

    // 失焦自动隐藏：用窗口级 onFocusChanged 判断"焦点真正离开本窗口（点到别的
    // 程序）"才隐藏，【不要用 DOM window blur】——点击/拖动 data-tauri-drag-region
    // 头部触发原生拖动时，WebView2 会瞬时失焦触发 blur，误把面板关掉（这正是
    // "一点击拖动区域面板就关闭"的根因）。窗口级焦点在内部点击/拖动时不会改变，
    // 仅当焦点离开本窗口才隐藏；置顶常驻与原生对话框期间例外。
    // 【互不影响】本应用内窗口之间切换焦点（如点开另一个面板）不隐藏——
    // 仅当焦点离开整个应用（没有任何本应用窗口持有焦点）才隐藏。
    let wasFocused = false;
    const focusUn = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      const prev = wasFocused;
      wasFocused = focused;
      if (!prev || focused) return;
      if (nativeDialogOpen || stayVisible) return;
      if (dragGuardRef.current) return;
      // 延时再查：目标窗口刚夺焦时 isFocused 可能尚未刷新（IPC 异步竞态）
      window.setTimeout(() => {
        void getAllWindows()
          .then((wins) => Promise.all(wins.map((w) => w.isFocused())))
          .then((states) => {
            if (!states.some(Boolean)) hideCurrentWindow();
          })
          .catch(() => hideCurrentWindow());
      }, 80);
    });
    cleanup.push(() => focusUn.then((un) => un()));

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
