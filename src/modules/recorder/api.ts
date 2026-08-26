import { invoke } from "@tauri-apps/api/core";

/** 录制区域：选区窗内【局部物理像素】矩形（Rust 端叠加窗口位置换算全局坐标） */
export interface RecRect { x: number; y: number; w: number; h: number }

/** 呼出录屏区域选择窗（托盘入口同款） */
export const recBegin = () => invoke<void>("rec_begin");

export const recSelectCancel = () => invoke<void>("rec_select_cancel");

export const recorderStart = (rect: RecRect) =>
  invoke<void>("recorder_start", { x: rect.x, y: rect.y, w: rect.w, h: rect.h });

export const recorderStop = () => invoke<void>("recorder_stop");

export const recDismiss = () => invoke<void>("rec_dismiss");

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
}

/** 在资源管理器中定位文件（复用 quickfiles 模块既有命令） */
export const revealFile = (path: string) =>
  invoke<void>("quickfiles_reveal", { path });
