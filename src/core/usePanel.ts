/** 悬浮面板公共行为：加载配置与主题、响应配置广播、失焦自动隐藏 */
import { useEffect, useRef } from "react";
import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useConfigStore } from "../stores/configStore";
import { EVT_CONFIG_CHANGED, EVT_PANEL_VISIBILITY, onEvent } from "./events";
import { emit } from "@tauri-apps/api/event";
import type { AppConfig } from "../types";

/**
 * 鼠标悬停/点击窗口即请求聚焦。WebView2 在窗口未激活（失焦）时不响应滚轮，
 * 导致"面板呼出后滚不动、必须点一下空白才可用"。裸 setFocus 在 Windows 前台锁
 * 下偶发被系统拒绝（"有时候"鼠标放上去不聚焦），这里改走 Rust 命令
 * panel_focus_foreground —— 内部是 force_foreground_robust（AttachThreadInput
 * 抢前台，不受前台锁限制），鼠标移入即聚焦，滚轮立即可用。
 * 节流：300ms 内只发一次 IPC；DOM 已有焦点（hasFocus）直接跳过。
 * 返回清理函数。挂载方：usePanelCommon 的面板 + 设置窗/翻译弹窗等未走
 * usePanelCommon 的悬浮窗口（App.tsx）。
 */
export function bindHoverFocus() {
  const label = getCurrentWindow().label;
  let throttle = false;
  const attempt = () => {
    if (throttle || document.hasFocus()) return;
    throttle = true;
    window.setTimeout(() => {
      throttle = false;
    }, 300);
    void invoke("panel_focus_foreground", { label }).catch(() => undefined);
  };
  const onOver = () => attempt();
  const onDown = () => attempt();
  document.addEventListener("mouseover", onOver);
  document.addEventListener("mousedown", onDown);
  return () => {
    document.removeEventListener("mouseover", onOver);
    document.removeEventListener("mousedown", onDown);
  };
}

/** 隐藏当前窗口并广播显隐事件（工具栏据此熄灭/点亮图标高亮）。
 *  面板的所有前端关闭路径（失焦自动隐藏 / Esc / 关闭按钮）都走这里，
 *  事件与后端 toggle_panel 的广播互补，保证工具栏状态实时准确。 */
export function hideCurrentWindow() {
  const label = getCurrentWindow().label;
  void emit(EVT_PANEL_VISIBILITY, { label, visible: false });
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
    let disposed = false;

    // 配置变更后同步主题与行为参数；payload 缺失时回退为重新加载
    onEvent<AppConfig | undefined>(EVT_CONFIG_CHANGED, (cfg) => {
      if (cfg) sync(cfg);
      else void load();
    }).then((un) => (disposed ? un() : cleanup.push(un)));

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

    // 鼠标悬停/点击面板即请求聚焦（见 bindHoverFocus 注释：robust 抢前台，
    // 不受前台锁限制，滚轮立即可用）
    cleanup.push(bindHoverFocus());

    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [load, sync, stayVisible]);
}
