/** 跨窗口事件名与简单封装 */
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Rust 侧剪贴板变化事件（由监听线程广播） */
export const EVT_CLIPBOARD_CHANGED = "clipboard://changed";
/** 启动时热键注册失败（payload: "clipboard" | "folder"） */
export const EVT_SHORTCUT_FAILED = "shortcut://register-failed";
/** 录入捕获期间钩子拦到的 Win 组合键（payload: "Super+X" 组合串） */
export const EVT_SHORTCUT_WIN_CAPTURED = "shortcut://win-captured";
/** 配置已变更（保存配置后广播给其他窗口，payload 为最新完整配置） */
export const EVT_CONFIG_CHANGED = "config://changed";
/** 文件夹数据变化（资源管理器追踪新增/计数时由后端广播） */
export const EVT_FOLDER_CHANGED = "folder://changed";
/** 面板显隐变化（后端在各显隐变化点广播；payload: { label, visible }，
 *  工具栏据此给当前打开的面板图标加高亮标志） */
export const EVT_PANEL_VISIBILITY = "panel://visibility-changed";
/** 全盘文件名索引构建进度（payload: { entries }） */
export const EVT_FSINDEX_PROGRESS = "fsindex://progress";
/** 全盘文件名索引构建结束（payload: { ok }） */
export const EVT_FSINDEX_DONE = "fsindex://done";
/** 逐行翻译的单行结果（payload: { i, out, ok }）：译文逐行冒出来用 */
export const EVT_TRANSLATE_LINE = "translate://line";
/** 反馈有新回复（Rust 轮询线程广播，payload: 新回复条数；
 *  设置窗口据此刷新「关于」页回复列表与侧栏红点） */
export const EVT_FEEDBACK_REPLIES = "feedback://replies";

export function broadcastConfigChanged(config: unknown): Promise<void> {
  return emit(EVT_CONFIG_CHANGED, config);
}

export function onEvent<T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}
