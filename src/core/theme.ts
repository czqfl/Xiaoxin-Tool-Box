/** 主题应用：system 模式移除 data-theme 交由媒体查询，light/dark 手动覆盖 */
import type { ThemeMode } from "../types";

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
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
