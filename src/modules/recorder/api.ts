import { invoke } from "@tauri-apps/api/core";

/** 录制区域：选区窗内【局部物理像素】矩形（Rust 端叠加窗口位置换算全局坐标） */
export interface RecRect { x: number; y: number; w: number; h: number }

/** 呼出录屏区域选择窗（托盘入口同款） */
export const recBegin = () => invoke<void>("rec_begin");

export const recSelectCancel = () => invoke<void>("rec_select_cancel");

/** 录制参数：格式与画质 */
export interface RecOptions {
  /** "gif" = 动图；"mp4" = H.264 视频（Media Foundation 硬件/软件编码） */
  fmt: "gif" | "mp4";
  /** 帧率（GIF 生效；MP4 固定 30fps） */
  fps: number;
  /** 分辨率缩放 0.25~1（由分辨率预设按选区高度换算） */
  scale: number;
  /** 画质：high / normal / fast */
  quality: "high" | "normal" | "fast";
}

export const recorderStart = (rect: RecRect, o: RecOptions) =>
  invoke<void>("recorder_start", {
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    fmt: o.fmt, fps: o.fps, scale: o.scale, quality: o.quality,
  });

export const recorderStop = () => invoke<void>("recorder_stop");

/** 暂停录制：不采集不写入，恢复后视频时间线跳过暂停段 */
export const recorderPause = () => invoke<void>("recorder_pause");

/** 恢复录制：从当前画面继续 */
export const recorderResume = () => invoke<void>("recorder_resume");

/** 取消录制：停止且不保存（区别于 recorder_stop 的"停止并保存"） */
export const recorderCancel = () => invoke<void>("recorder_cancel");

/** 录制完成：控制条 → 右下角小弹窗 */
export const recorderBarPopup = () => invoke<void>("recorder_bar_popup");

export const recDismiss = () => invoke<void>("rec_dismiss");

/** 打开录屏保存目录（设置页入口） */
export const recorderOpenDir = () => invoke<void>("recorder_open_dir");

export const EVT_REC_TICK = "recorder://tick";
export const EVT_REC_DONE = "recorder://done";

export interface RecTickPayload { elapsed_ms: number; frames: number }

export interface RecDonePayload {
  ok: boolean;
  path: string | null;
  duration_ms: number;
  frames: number;
  bytes: number;
  error: string | null;
  /** 用户主动取消（不保存）：直接关闭控制条，不弹通知 */
  canceled: boolean;
}

/** 在资源管理器中定位文件（复用 quickfiles 模块既有命令） */
export const revealFile = (path: string) =>
  invoke<void>("quickfiles_reveal", { path });
