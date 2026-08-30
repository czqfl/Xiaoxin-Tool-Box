import { invoke } from "@tauri-apps/api/core";

/** 录制区域：选区窗内【局部物理像素】矩形（Rust 端叠加窗口位置换算全局坐标） */
export interface RecRect { x: number; y: number; w: number; h: number }

/** 呼出录屏区域选择窗（托盘入口同款） */
export const recBegin = () => invoke<void>("rec_begin");

export const recSelectCancel = () => invoke<void>("rec_select_cancel");

/** 音源：off = 不录音 / mic = 麦克风 / system = 系统声音 / mix = 两者 */
export type AudioSource = "off" | "mic" | "system" | "mix";

/** 录制参数：格式与画质 */
export interface RecOptions {
  /** "gif" = 动图；"mp4" = H.264 视频（Media Foundation 硬件/软件编码） */
  fmt: "gif" | "mp4";
  /** 帧率（5–60，GIF 与 MP4 均生效；达不到时按真实间隔写时间戳，视频不会快进） */
  fps: number;
  /** 分辨率缩放 0.25~1（由分辨率预设按选区高度换算） */
  scale: number;
  /** 画质：high / normal / fast */
  quality: "high" | "normal" | "fast";
  /** 音源；仅 MP4 生效（GIF 容器不支持音频） */
  audio: AudioSource;
}

export const recorderStart = (rect: RecRect, o: RecOptions) =>
  invoke<void>("recorder_start", {
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    fmt: o.fmt, fps: o.fps, scale: o.scale, quality: o.quality,
    audio: o.audio,
  });

/** 录制中切换静音。静音=写零帧、不断流，因此不会音画脱同步。
 *  返回切换后的静音状态。 */
export const recorderAudioMute = (on: boolean) =>
  invoke<boolean>("recorder_audio_mute", { on });

/** 设置录制音量（0~200，100=原声）。录制中实时生效 */
export const recorderAudioVolume = (volume: number) =>
  invoke<number>("recorder_audio_volume", { volume: Math.round(volume) });

/** 查询录制音量 */
export const recorderAudioVolumeGet = () =>
  invoke<number>("recorder_audio_volume_get");

/** 查询录音状态：[本次录制是否支持录音, 当前是否正在录音]。
 *  前一个值只取决于格式（MP4=true，GIF=false），与启动时音源是否为 off 无关：
 *  MP4 一律预留音轨，音源 off 只是开局不采集，仍可中途开录。 */
export const recorderAudioState = () =>
  invoke<[boolean, boolean]>("recorder_audio_state");

/** 录制中随时开启/关闭录音。开启时会按需动态启动采集（音源 off 时默认用麦克风），
 *  关闭时停采集、音轨继续写零帧（时间线不断，之后可无缝重开）。
 *  返回操作后的真实状态：端点不可用等失败情形返回 false，前端应回滚按钮。 */
export const recorderAudioRec = (on: boolean) =>
  invoke<boolean>("recorder_audio_rec", { on });

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
