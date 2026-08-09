/** 悬浮面板公共行为：加载配置与主题、响应配置广播、失焦自动隐藏 */
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConfigStore } from "../stores/configStore";
import { EVT_CONFIG_CHANGED, onEvent } from "./events";
import type { AppConfig } from "../types";

export function hideCurrentWindow() {
  getCurrentWindow().hide().catch(console.error);
}

export function usePanelCommon() {
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);

  useEffect(() => {
    load();

    const cleanup: Array<() => void> = [];

    // 设置窗口保存配置后同步主题与行为参数
    onEvent<AppConfig>(EVT_CONFIG_CHANGED, (cfg) => sync(cfg)).then((un) =>
      cleanup.push(un)
    );

    // 失焦自动隐藏（不占任务栏，Esc 由面板组件处理）
    const onBlur = () => hideCurrentWindow();
    window.addEventListener("blur", onBlur);
    cleanup.push(() => window.removeEventListener("blur", onBlur));

    return () => cleanup.forEach((fn) => fn());
  }, [load, sync]);
}
