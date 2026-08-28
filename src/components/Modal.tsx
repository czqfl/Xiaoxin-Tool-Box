/** 统一模态对话框：portal 到 body 逃逸父容器裁切，内置 Esc 层叠关闭与焦点圈定。
 *  按钮复用全局 .btn / .btn-primary / .btn-danger CSS 类。 */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscLayer } from "../hooks/useEscLayered";
import "./Modal.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** 底部操作区（取消/确认按钮） */
  actions?: ReactNode;
  /** 点击遮罩关闭，默认 true */
  closeOnBackdrop?: boolean;
  /** 危险语义：标题文字标红（删除确认等） */
  danger?: boolean;
  /** 宽幅变体（表单类弹窗），默认窄幅（确认类） */
  wide?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  closeOnBackdrop = true,
  danger = false,
  wide = false,
}: ModalProps) {
  useEscLayer(open, onClose);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 打开时聚焦弹窗本体（可接收键盘事件），关闭时不做事
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  // Tab 焦点圈定：循环在弹窗内部可聚焦元素之间
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const activeEl = document.activeElement;
    if (e.shiftKey && (activeEl === first || activeEl === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && activeEl === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        className={`modal${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div className={`modal-title${danger ? " danger" : ""}`}>{title}</div>
        )}
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
