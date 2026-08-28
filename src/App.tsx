/** 按窗口 label 路由：各面板窗口 + 翻译弹窗 + 悬浮工具栏 + 设置窗口共用一个入口 */
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { AppConfig } from "./types";
import { EVT_CONFIG_CHANGED, onEvent } from "./core/events";
import { useConfigStore } from "./stores/configStore";
import { ClipboardPanel } from "./modules/clipboard/ClipboardPanel";
import { FolderPanel } from "./modules/folder/FolderPanel";
import { CredentialPanel } from "./modules/credential/CredentialPanel";
import { PortPanel } from "./modules/port/PortPanel";
import { QuickFilesPanel } from "./modules/quickfiles/QuickFilesPanel";
import { SnippetPanel } from "./modules/snippets/SnippetPanel";
import { CommandPalette } from "./modules/palette/CommandPalette";
import { TranslatePopup } from "./modules/translate/TranslatePopup";
import { Toolbar } from "./modules/toolbar/Toolbar";
import { ToolbarTip } from "./modules/toolbar/ToolbarTip";
import { TIP_WINDOW } from "./modules/toolbar/tip";
import { ScreenshotOverlay } from "./modules/screenshot/ScreenshotOverlay";
import { PinWindow } from "./modules/pin/PinWindow";
import PinMenu from "./modules/pin/PinMenu";
import { ScrollShotBar } from "./modules/scrollshot/ScrollShotBar";
import { ScrollShotFrame } from "./modules/scrollshot/ScrollShotFrame";
import { RecorderSelect } from "./modules/recorder/RecorderSelect";
import { RecorderBar } from "./modules/recorder/RecorderBar";
import { SettingsApp } from "./settings/SettingsApp";
import { diagLog } from "./core/tauri";

// 预热贴图右键菜单单例窗：应用启动（设置窗挂载即触发）预建 pin-menu（隐藏），
// 之后任何右键直接复用，首弹也即时，不卡
let pinMenuEnsured = false;
function ensurePinMenu() {
  if (pinMenuEnsured) return;
  pinMenuEnsured = true;
  void WebviewWindow.getByLabel("pin-menu").then((w) => {
    if (w) return;
    try {
      new WebviewWindow("pin-menu", {
        url: "index.html",
        width: 180, height: 40,
        decorations: false, transparent: true,
        alwaysOnTop: true, focus: true, resizable: false, shadow: false,
        visible: false, skipTaskbar: true,
      });
    } catch { /* 已存在则忽略 */ }
  });
}

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

  // 启动即预热右键菜单窗（隐藏待命），保证首次右键也能瞬时弹出
  useEffect(() => { ensurePinMenu(); }, []);

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
  if (label === "files-panel") {
    return <QuickFilesPanel />;
  }
  if (label === "snippets-panel") {
    return <SnippetPanel />;
  }
  if (label === "palette") {
    return <CommandPalette />;
  }
  if (label === "translate-popup") {
    return <TranslatePopup />;
  }
  if (label === "toolbar") {
    return <Toolbar />;
  }
  if (label === TIP_WINDOW) {
    return <ToolbarTip />;
  }
  if (label.startsWith("shot-overlay")) {
    return <ScreenshotOverlay />;
  }
  if (label.startsWith("scrollshot-frame")) {
    return <ScrollShotFrame />;
  }
  if (label.startsWith("scrollshot-bar")) {
    return <ScrollShotBar />;
  }
  if (label.startsWith("rec-select")) {
    return <RecorderSelect />;
  }
  if (label.startsWith("rec-bar")) {
    return <RecorderBar />;
  }
  if (label.startsWith("pin-menu")) {
    return <PinMenu />;
  }
  if (label.startsWith("pin-")) {
    return <PinWindow />;
  }
  return <SettingsApp />;
}
