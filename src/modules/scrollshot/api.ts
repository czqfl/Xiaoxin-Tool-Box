import { invoke } from "@tauri-apps/api/core";

/** 滚动长截图：全局物理像素选区 */
export interface LongShotRect { x: number; y: number; w: number; h: number }

export const scrollBegin = (rect: LongShotRect) =>
  invoke<void>("scrollshot_begin", { x: rect.x, y: rect.y, w: rect.w, h: rect.h });

export const scrollStop = () => invoke<void>("scrollshot_stop");

/** 取消：中止且不保存不贴图 */
export const scrollCancel = () => invoke<void>("scrollshot_cancel");

export const scrollDismiss = () => invoke<void>("scrollshot_dismiss");

/** 开始自动滚动（空格 / 「开始」按钮） */
export const scrollStartScroll = () => invoke<void>("scrollshot_start_scroll");

/** 自动滚动速度档位（1..=10） */
export const scrollSetSpeed = (speed: number) =>
  invoke<void>("scrollshot_set_speed", { speed });

export const scrollGetSpeed = () => invoke<number>("scrollshot_get_speed");

/** 边框指示窗几何（全局物理像素）：win=指示窗矩形，region=被捕获区域 */
export interface FrameInfo { win: [number, number, number, number]; region: [number, number, number, number] }

export const scrollFrameRect = () =>
  invoke<FrameInfo | null>("scrollshot_frame_info");

/** 另存为：把已保存的 PNG 复制到用户指定位置 */
export const scrollSaveAs = (src: string, dest: string) =>
  invoke<void>("scrollshot_save_as", { src, dest });

/** 进度：已捕获高度（物理像素） */
export const EVT_SCROLLSHOT_PROGRESS = "scrollshot://progress";
/** 结束：ok/path/height/error */
export const EVT_SCROLLSHOT_DONE = "scrollshot://done";
/** 进度条窗每次呼出时重置 UI 状态 */
export const EVT_BAR_RESET = "scrollshot://reset";

export interface ScrollDonePayload {
  ok: boolean;
  path: string | null;
  height: number;
  error: string | null;
}

/** 在资源管理器中定位文件（复用 quickfiles 模块既有命令） */
export const revealFile = (path: string) =>
  invoke<void>("quickfiles_reveal", { path });
