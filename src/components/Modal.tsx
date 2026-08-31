/** 统一模态对话框：portal 到 body 逃逸父容器裁切，内置 Esc 层叠关闭与焦点圈定。
 *  按钮复用全局 .btn / .btn-primary / .btn-danger CSS 类。
 *
 *  可访问性约定：
 *  - role="dialog" + aria-modal；有 title 时经 aria-labelledby 关联，
 *    无 title 时由调用方传 ariaLabel（否则读屏只能念出"对话框"）；
 *  - 关闭后将焦点归还给触发者，键盘用户不会丢失位置；
 *  - Tab 圈定会跑过 display:none / visibility:hidden 的元素，
 *    否则会 Tab 到"看不见的按钮"。 */
import { useEffect, useId, useRef, type ReactNode } from "react";
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
  /** 无 title 时的无障碍名称（有 title 时优先用 aria-labelledby） */
  ariaLabel?: string;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]),' +
  ' textarea:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]),' +
  ' a[href], [tabindex]:not([tabindex="-1"])';

/** 元素是否真的可见：display:none / visibility:hidden 的元素
 *  不可聚焦，但仍会被 querySelectorAll 命中——不过滤就会
 *  Tab 到"看不见的按钮"。（仅 opacity:0 的元素仍可聚焦，
 *  那类情况应在 CSS 里改用 visibility 行制，而非在此处碌补） */
function isVisible(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  return el.getClientRects().length > 0;
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
  ariaLabel,
}: ModalProps) {
  useEscLayer(open, onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // useId() 含冒号，会导致 CSS 属性选择器失效，这里去掉
  const titleId = `modal-title-${useId().replace(/:/g, "")}`;

  // 打开：记录触发者并聚焦对话框；关闭：将焦点归还触发者
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    restoreRef.current = prev && prev !== document.body ? prev : null;
    const d = dialogRef.current;
    if (d && !d.contains(document.activeElement)) d.focus();
    return () => {
      const target = restoreRef.current;
      restoreRef.current = null;
      // 延后一帧：等弹窗真正卸载，否则焦点刚还回去就可能被父层逻辑再次抢走
      if (target && document.contains(target)) {
        requestAnimationFrame(() => target.focus());
      }
    };
  }, [open]);

  // Tab 焦点圈定：循环在弹窗内部【可见】的可聚焦元素之间
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(isVisible);
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
        aria-labelledby={title != null ? titleId : undefined}
        aria-label={title != null ? undefined : ariaLabel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div id={titleId} className={`modal-title${danger ? " danger" : ""}`}>
            {title}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
