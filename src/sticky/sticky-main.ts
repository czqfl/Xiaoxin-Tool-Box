/** 便签窗口分流入口（工具箱集成版）：
 *  工具箱的 index.html 被多个窗口复用，按窗口 label 分流：
 *    note_<id>          → 便签本体（URL noteId 参数指定，如 noteId=main）
 *    sticky-history     → 便签历史/管理窗口
 *    sticky-settings    → 便签自带“设置”窗口（原版完整设置面板）
 *    particles          → 全屏粒子层（关闭动画粒子可飘出便签窗口）
 *    sticky-imageviewer → 图片预览窗口
 *  便签样式（styles.css）由 main.tsx 在分流时动态 import，仅便签窗口加载，
 *  与工具箱 React 样式完全隔离，互不污染。 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { mountHistoryApp } from "./history";
import { mountImageViewer } from "./image-viewer";
import { mountParticlesLayer } from "./particles-layer";
import { mountNoteApp } from "./note";

export async function mountStickyByLabel() {
  const label = getCurrentWindow().label;
  const params = new URLSearchParams(window.location.search);
  const noteId = params.get("noteId") || "main";
  const preset = params.get("preset") || "";

  if (label === "sticky-history") {
    mountHistoryApp();
  } else if (label === "sticky-settings") {
    // 独立“设置”窗口入口：settings-window.ts 自带样式与首帧兜底，顶层执行
    // openSettingsModal()（standalone 路径），paint 完成后自行 show 窗口。
    await import("./settings-window");
  } else if (label === "sticky-imageviewer") {
    mountImageViewer().catch((e) => console.error("图片预览加载失败:", e));
  } else if (label === "particles") {
    // 全屏透明粒子层（label "particles"，与 tauri.conf.json 声明一致）：
    // 粒子消散动画的粒子可飘出便签矩形、在整个屏幕渲染（glow-particles 按
    // 此 label 查找窗口）
    mountParticlesLayer().catch((e) => console.error("粒子层初始化失败:", e));
  } else {
    mountNoteApp(noteId, preset);
  }
}
