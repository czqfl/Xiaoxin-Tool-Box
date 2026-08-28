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

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
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
    </Modal>
  );
}
