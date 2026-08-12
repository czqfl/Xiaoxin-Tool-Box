import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import "./styles/base.css";

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
if (panelLabels.includes(getCurrentWindow().label)) {
  document.documentElement.dataset.window = "panel";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
