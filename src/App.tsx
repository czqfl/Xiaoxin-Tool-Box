/** 按窗口 label 路由：各面板窗口 + 翻译弹窗 + 悬浮工具栏 + 设置窗口共用一个入口 */
import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { AppConfig } from "./types";
import { EVT_CONFIG_CHANGED, onEvent } from "./core/events";
import { useConfigStore } from "./stores/configStore";
import { bindHoverFocus } from "./core/usePanel";
import { ClipboardPanel } from "./modules/clipboard/ClipboardPanel";
import { FolderPanel } from "./modules/folder/FolderPanel";
import { GitRunWindow } from "./modules/folder/GitRunWindow";
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
import PinOcrWindow from "./modules/pin/PinOcrWindow";
import { RecorderSelect } from "./modules/recorder/RecorderSelect";
import { RecorderBar } from "./modules/recorder/RecorderBar";
import { VolumePopover } from "./modules/recorder/VolumePopover";
import { SettingsApp } from "./settings/SettingsApp";
import { runStartupUpdateCheckOnce } from "./core/updater";
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

  // 应用启动即调度一次静默更新检查（延迟 8s，进程内仅一次，跨窗口不重复）；
  // 此前误放在设置窗里，不开设置窗就永不检查。发现新版会反映到标题栏/关于页
  useEffect(() => { runStartupUpdateCheckOnce(); }, []);

  // 启动即预热右键菜单窗（隐藏待命），保证首次右键也能瞬时弹出
  useEffect(() => { ensurePinMenu(); }, []);

  // 前端就绪上报：工具栏（主窗口）挂载完成 = 主前端加载完毕，Rust 侧放开
  // 功能门禁。启动早期触发截图会在遮罩窗页面未加载时被亮出，全屏透明
  // webview 吃掉所有输入且无法 Esc（Rust 侧 app_frontend_ready 注释）
  useEffect(() => {
    if (label === "toolbar") void invoke("app_frontend_ready").catch(() => {});
  }, [label]);

  // 设置窗未走 usePanelCommon（它常驻不隐藏），补挂「鼠标悬停即聚焦」——
  // WebView2 失焦不响应滚轮，鼠标移入即 robust 抢前台，滚轮无需先点一下。
  // 工具窗（截图遮罩/贴图/录制/粒子等）不挂：抢焦点会打断它们自身的交互语义。
  useEffect(() => {
    if (label === "settings") return bindHoverFocus();
    return undefined;
  }, [label]);

  if (label === "clipboard-panel") {
    return <ClipboardPanel />;
  }
  if (label === "folder-panel") {
    return <FolderPanel />;
  }
  // Git 命令执行状态：独立窗口（智能停靠面板一侧，可拖动，执行期间面板照常可操作）
  if (label === "git-run") {
    return <GitRunWindow />;
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
  if (label.startsWith("rec-select")) {
    return <RecorderSelect />;
  }
  if (label.startsWith("rec-bar")) {
    return <RecorderBar />;
  }
  if (label.startsWith("rec-vol")) {
    return <VolumePopover />;
  }
  if (label.startsWith("pin-menu")) {
    return <PinMenu />;
  }
  if (label.startsWith("pin-ocr")) {
    return <PinOcrWindow />;
  }
  if (label.startsWith("pin-")) {
    return <PinWindow />;
  }
  return <SettingsApp />;
}
