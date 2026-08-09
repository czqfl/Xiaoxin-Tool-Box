/** 跨窗口事件名与简单封装 */
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Rust 侧剪贴板变化事件（由监听线程广播） */
export const EVT_CLIPBOARD_CHANGED = "clipboard://changed";
/** 启动时热键注册失败（payload: "clipboard" | "folder"） */
export const EVT_SHORTCUT_FAILED = "shortcut://register-failed";
/** 配置已变更（设置窗口保存后广播，其他窗口同步主题与行为） */
export const EVT_CONFIG_CHANGED = "config://changed";

export function broadcastConfigChanged(): Promise<void> {
  return emit(EVT_CONFIG_CHANGED);
}

export function onEvent<T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}
