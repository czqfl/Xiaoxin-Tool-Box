/** 粘贴队列：三种粘贴模式的顺序计算 */
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
    default:
      return entries;
  }
}

/** 顺序粘贴模式（FIFO / LIFO）需要维护队列游标，粘贴一个消耗一个 */
export function isSequentialMode(mode: PasteMode): boolean {
  return mode === "fifo" || mode === "lifo";
}

export const PASTE_MODE_LABELS: Record<PasteMode, string> = {
  normal: "普通",
  fifo: "FIFO",
  lifo: "LIFO",
};

export const PASTE_MODE_DESCS: Record<PasteMode, string> = {
  normal: "点击或回车粘贴所选条目",
  fifo: "按复制先后顺序逐条粘贴，任意位置按 Ctrl+V 直接带出下一条",
  lifo: "按复制先后倒序逐条粘贴，任意位置按 Ctrl+V 直接带出下一条",
};
