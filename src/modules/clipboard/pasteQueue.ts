/** 粘贴队列：四种粘贴模式的顺序计算 */
import type { ClipEntry, PasteMode } from "../../types";

/** 按模式构建粘贴顺序队列 */
export function buildQueue(entries: ClipEntry[], mode: PasteMode): ClipEntry[] {
  switch (mode) {
    case "fifo":
      // 先进先出：按复制时间从旧到新
      return [...entries].sort((a, b) => a.created_at - b.created_at);
    case "lifo":
      // 先进后出：按复制时间从新到旧
      return [...entries].sort((a, b) => b.created_at - a.created_at);
    case "pinned":
      // 置顶优先：仅置顶条目
      return entries.filter((e) => e.pinned);
    default:
      return entries;
  }
}

/** 顺序粘贴模式（FIFO / LIFO / 置顶）需要维护队列游标 */
export function isSequentialMode(mode: PasteMode): boolean {
  return mode === "fifo" || mode === "lifo" || mode === "pinned";
}

export const PASTE_MODE_LABELS: Record<PasteMode, string> = {
  normal: "普通",
  fifo: "FIFO",
  lifo: "LIFO",
  pinned: "置顶",
};
