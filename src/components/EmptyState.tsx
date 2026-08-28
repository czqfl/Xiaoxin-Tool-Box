/** 统一空状态：强制各模块消费同一结构（图标 + 主文案 + 副文案 + 操作），
 *  样式基于 base.css 的 .empty-state */
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** 图标：Icon 组件或文本符号 */
  icon?: ReactNode;
  title?: string;
  description?: string;
  /** 操作区（如"新建"按钮） */
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon != null && <div className="empty-icon">{icon}</div>}
      {title && <div className="empty-title">{title}</div>}
      {description && <div className="empty-desc">{description}</div>}
      {action}
    </div>
  );
}
