/** 悬浮面板公共行为：加载配置与主题、响应配置广播、失焦自动隐藏、焦点标记 */
import { useEffect } from "react";
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

/** 标记面板焦点状态：失焦时 DWM 亚克力被系统退化为实色（Win11 设计），
 *  CSS 借此把底色加深一档，让"实色面板"看起来是刻意设计 */
function markPanelFocused(focused: boolean) {
  const root = document.documentElement;
  if (focused) root.dataset.panelFocused = "1";
  else delete root.dataset.panelFocused;
}

/** stayVisible：置顶开启时面板常驻可见，失焦不再自动隐藏（Esc/热键仍可隐藏） */
export function usePanelCommon(stayVisible = false) {
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);

  useEffect(() => {
    load();
    // 面板呼出即处于聚焦状态；window focus 事件可能早于 React 挂载，先补一次
    markPanelFocused(true);

    const cleanup: Array<() => void> = [];

    // 配置变更后同步主题与行为参数；payload 缺失时回退为重新加载
    onEvent<AppConfig | undefined>(EVT_CONFIG_CHANGED, (cfg) => {
      if (cfg) sync(cfg);
      else void load();
    }).then((un) => cleanup.push(un));

    // 失焦自动隐藏（不占任务栏，Esc 由面板组件处理）；置顶常驻与原生对话框期间例外
    const onBlur = () => {
      markPanelFocused(false);
      if (nativeDialogOpen || stayVisible) return;
      hideCurrentWindow();
    };
    const onFocus = () => markPanelFocused(true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    cleanup.push(() => window.removeEventListener("blur", onBlur));
    cleanup.push(() => window.removeEventListener("focus", onFocus));

    return () => cleanup.forEach((fn) => fn());
  }, [load, sync, stayVisible]);
}
