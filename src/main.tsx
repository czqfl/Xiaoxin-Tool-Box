import { getCurrentWindow } from "@tauri-apps/api/window";

async function bootstrap() {
  const label = getCurrentWindow().label;

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
    "toolbar",
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
