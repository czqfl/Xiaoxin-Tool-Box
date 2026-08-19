/** 主题应用：system 模式移除 data-theme 交由媒体查询，light/dark 手动覆盖 */
import type { ThemeMode } from "../types";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
  // 系统标题栏（设置窗口有原生边框）颜色跟随应用主题——否则浅色主题下
  // 窗口顶部仍是 Windows 系统深色标题栏（黑色一条）。无边框窗口调用无副作用。
  // system 模式传 null（Tauri 语义：跟随系统默认）；mint/skyblue 属浅色系 → light。
  // 【注意】此调用依赖 capabilities 里的 core:window:allow-set-theme 权限，
  // 缺失时会被权限系统拒绝（曾导致设置窗口标题栏切主题不变色）。
  // catch 保留日志便于排查，但不中断配置保存链路。
  try {
    const windowTheme =
      mode === "mint" || mode === "skyblue" ? "light" : mode === "system" ? null : mode;
    getCurrentWindow()
      .setTheme(windowTheme)
      .catch((e) => console.warn("[theme] setTheme 失败:", e));
  } catch (e) {
    console.warn("[theme] setTheme 异常:", e);
  }
}

/**
 * 面板外壳底色不透明度（0-1）。
 * 亚克力关闭时强制 1：外壳全不透明，避免圆角边缝露出窗口底色。
 */
export function applyPanelStyle(opacity: number, acrylicEnabled: boolean) {
  const a = Math.min(100, Math.max(0, opacity)) / 100;
  document.documentElement.style.setProperty(
    "--panel-opacity",
    String(acrylicEnabled ? a : 1)
  );
}
