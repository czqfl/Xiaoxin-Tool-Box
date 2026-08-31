/** 二次确认弹窗：替代 window.confirm（Tauri 透明窗口下原生对话框不可靠）。
 *  内部组合 Modal + 全局 .btn 类，danger 变体用于删除类操作。 */
import { useState } from "react";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";
import type { ReactNode } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** 确认回调；返回 Promise 时按钮自动进入 loading 并等待完成 */
  onConfirm: () => void | Promise<void>;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      // 必须捕获：否则异常会变成 unhandledrejection，
      // finally 虽然复位了 busy，但弹窗会静默卡住——既不关闭也不报错，
      // 用户只能反复点确认却永远不知道失败原因。
      console.error("[ConfirmDialog] 确认操作失败:", e);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      danger={danger}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy && <Spinner size="sm" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {message}
      {err && (
        <p className="inline-error" role="alert">
          {err}
        </p>
      )}
    </Modal>
  );
}
