/** 全局入口：按窗口 label 分流——
 *  便签相关窗口（note_* / sticky-*）挂载 vanilla 便签应用（样式完全隔离），
 *  其余窗口挂载工具箱 React 应用。 */
import { getCurrentWindow } from "@tauri-apps/api/window";

async function bootstrap() {
  const label = getCurrentWindow().label;
  const isSticky =
    label.startsWith("note_") ||
    label === "sticky-history" ||
    label === "sticky-particles" ||
    label === "sticky-imageviewer";

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
    "translate-popup",
    "toolbar",
  ];
  if (panelLabels.includes(label)) {
    document.documentElement.dataset.window = "panel";
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
