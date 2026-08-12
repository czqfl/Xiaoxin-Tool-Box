/** 按窗口 label 路由：各面板窗口 + 翻译弹窗 + 悬浮工具栏 + 设置窗口共用一个入口 */
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppConfig } from "./types";
import { EVT_CONFIG_CHANGED, onEvent } from "./core/events";
import { useConfigStore } from "./stores/configStore";
import { ClipboardPanel } from "./modules/clipboard/ClipboardPanel";
import { FolderPanel } from "./modules/folder/FolderPanel";
import { CredentialPanel } from "./modules/credential/CredentialPanel";
import { PortPanel } from "./modules/port/PortPanel";
import { TranslatePopup } from "./modules/translate/TranslatePopup";
import { Toolbar } from "./modules/toolbar/Toolbar";
import { SettingsApp } from "./settings/SettingsApp";
import { diagLog } from "./core/tauri";

export default function App() {
  const label = getCurrentWindow().label;
  void diagLog(`App mounted: ${label}`);

  // 【统一主题加载】所有窗口（含翻译弹窗/工具栏）都在入口加载配置并应用主题。
  // 此前只有各面板经 usePanelCommon 加载，翻译弹窗是独立组件没走它 →
  // html 无 data-theme → 只跟随系统，浅色配置下翻译面板仍显示深色。
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);
  useEffect(() => {
    load();
    let cleanup: (() => void) | undefined;
    let disposed = false;
    onEvent<AppConfig | undefined>(EVT_CONFIG_CHANGED, (cfg) => {
      if (cfg) sync(cfg);
      else void load();
    }).then((un) => {
      if (disposed) un();
      else cleanup = un;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [load, sync]);

  if (label === "clipboard-panel") {
    return <ClipboardPanel />;
  }
  if (label === "folder-panel") {
    return <FolderPanel />;
  }
  if (label === "credential-panel") {
    return <CredentialPanel />;
  }
  if (label === "port-panel") {
    return <PortPanel />;
  }
  if (label === "translate-popup") {
    return <TranslatePopup />;
  }
  if (label === "toolbar") {
    return <Toolbar />;
  }
  return <SettingsApp />;
}
