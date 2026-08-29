import { getCurrentWindow } from "@tauri-apps/api/window";

/** 全局入口：按窗口 label 分流——
 *  便签相关窗口（note_* / sticky-*）挂载 vanilla 便签应用（样式完全隔离），
 *  其余窗口挂载工具箱 React 应用。
 *  工具箱设置页"便签设置"用 iframe 嵌入便签自己的设置面板：
 *  iframe 加载 index.html?view=sticky-settings（label 是父窗口的 "settings"，
 *  故 URL 参数优先于 label 判断）。
 *  【设置归属】便签设置存于便签自己的 sticky_settings.json，不进工具箱
 *  AppConfig——界面统一挂在工具箱设置里，底层配置保持独立。 */
async function bootstrap() {
  const label = getCurrentWindow().label;

  const params = new URLSearchParams(window.location.search);
  // 便签设置面板嵌入模式（iframe）：加载便签自己的设置面板（settings.ts，
  // 内部按 label=settings 走 standalone 全屏铺满模式），样式仅作用于 iframe
  if (params.get("view") === "sticky-settings") {
    document.documentElement.dataset.window = "sticky";
    await import("./sticky/styles.css");
    const { openSettingsModal } = await import("./sticky/settings");
    openSettingsModal().catch((e) => console.error("便签设置面板加载失败:", e));
    return;
  }

  const isSticky =
    label.startsWith("note_") ||
    label === "sticky-history" ||
    // 全屏透明粒子层窗口（label 与 tauri.conf.json / glow-particles 查找一致）
    label === "particles" ||
    label === "sticky-imageviewer" ||
    label === "sticky-settings";

  // 便签窗口：动态加载便签样式与应用（不注入工具箱 base.css，避免样式污染）
  if (isSticky) {
    document.documentElement.dataset.window = "sticky";
    await import("./sticky/styles.css");
    const { mountStickyByLabel } = await import("./sticky/sticky-main");
    mountStickyByLabel();
    return;
  }

  // 面板窗口：标记 html，由 CSS 将 webview 背景置为透明，
  // 露出后端应用的亚克力层；否则不透明背景会在圆角外画出黑色矩形
  const panelLabels = [
    "clipboard-panel",
    "folder-panel",
    "credential-panel",
    "port-panel",
    "files-panel",
    "snippets-panel",
    "translate-popup",
    "palette",
    "toolbar",
    // 悬浮控制条/指示窗：同一套透明底 + 主题变量（亚克力由 Rust 端应用）
    "scrollshot-bar",
    "scrollshot-frame",
    "rec-select",
    "rec-bar",
  ];
  if (panelLabels.includes(label)) {
    document.documentElement.dataset.window = "panel";
  }
  // 截图遮罩窗：webview 背景透明，露出底下的原生冻结层（Rust 子 HWND 直贴位图）
  if (label.startsWith("shot-overlay")) {
    document.documentElement.dataset.window = "shot";
  }
  // 贴图窗：页面背景必须透明——show 后 WebView2 首帧 present 前的未绘制瞬间，
  // 不透明主题底色会闪出一块实色矩形；透明则该瞬间不可见，绝无闪烁
  if (label.startsWith("pin-")) {
    document.documentElement.dataset.window = "pin";
  }
  // 贴图右键菜单窗（pin-menu-*）：同一套透明上下文，玻璃底随主题；实际渲染由
  // App 按 label 分流到 PinMenu 组件（startsWith 覆盖 pin-menu-<timestamp> 唯一标签）
  if (label.startsWith("pin-menu")) {
    document.documentElement.dataset.window = "pin";
  }

  const [{ default: React }, { default: ReactDOM }, { default: App }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("./App"),
  ]);
  await import("./styles/base.css");
  ReactDOM.createRoot(document.getElementById("root")!).render(
    React.createElement(React.StrictMode, null, React.createElement(App))
  );
}

void bootstrap();
