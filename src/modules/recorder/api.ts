import { invoke } from "@tauri-apps/api/core";

/** 录制区域：选区窗内【局部物理像素】矩形（Rust 端叠加窗口位置换算全局坐标） */
export interface RecRect { x: number; y: number; w: number; h: number }

/** 呼出录屏区域选择窗（托盘入口同款） */
export const recBegin = () => invoke<void>("rec_begin");

export const recSelectCancel = () => invoke<void>("rec_select_cancel");

/** 录制参数：格式与画质 */
export interface RecOptions {
  /** "gif" = 动图；"avi" = 视频(MJPEG) */
  fmt: "gif" | "avi";
  /** 帧率（GIF 生效；视频固定 30fps） */
  fps: number;
  /** 分辨率缩放 0.5 / 0.75 / 1 */
  scale: number;
}

export const recorderStart = (rect: RecRect, o: RecOptions) =>
  invoke<void>("recorder_start", {
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    fmt: o.fmt, fps: o.fps, scale: o.scale,
  });

export const recorderStop = () => invoke<void>("recorder_stop");

/** 录制完成：控制条 → 右下角小弹窗 */
export const recorderBarPopup = () => invoke<void>("recorder_bar_popup");

export const recDismiss = () => invoke<void>("rec_dismiss");

export const EVT_REC_TICK = "recorder://tick";
export const EVT_REC_DONE = "recorder://done";
export const EVT_REC_STARTED = "recorder://started";

export interface RecTickPayload { elapsed_ms: number; frames: number }

export interface RecDonePayload {
  ok: boolean;
  path: string | null;
  duration_ms: number;
  frames: number;
  bytes: number;
  error: string | null;
}

/** 在资源管理器中定位文件（复用 quickfiles 模块既有命令） */
export const revealFile = (path: string) =>
  invoke<void>("quickfiles_reveal", { path });
