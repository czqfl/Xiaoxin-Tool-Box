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
  // system 模式传 null（Tauri 语义：跟随系统默认）；mint 属浅色系 → light。
  // try/catch 兜底：setTheme 若有同步异常也不能中断配置保存链路
  // （否则设置页"所有配置保存无效"）。
  try {
    const windowTheme = mode === "mint" ? "light" : mode === "system" ? null : mode;
    getCurrentWindow()
      .setTheme(windowTheme)
      .catch(() => undefined);
  } catch {
    /* 窗口不支持 setTheme 时忽略 */
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
