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
