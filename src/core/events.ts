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

export function broadcastConfigChanged(config: unknown): Promise<void> {
  return emit(EVT_CONFIG_CHANGED, config);
}

export function onEvent<T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}
