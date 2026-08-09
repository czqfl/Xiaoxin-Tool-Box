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
