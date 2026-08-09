/** 通用右键菜单：fixed 定位 + 点击外部关闭 */
import { useEffect, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  /** 该项之后插入分割线 */
  dividerAfter?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  // 视口边界防溢出
  const style = {
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - items.length * 36 - 20),
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* 透明遮罩捕获外部点击 */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 999 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div className="context-menu" style={style}>
        {items.map((item) => (
          <div key={item.label}>
            <button
              className={`context-menu-item ${item.danger ? "danger" : ""}`}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.icon}
              {item.label}
            </button>
            {item.dividerAfter && <div className="context-menu-divider" />}
          </div>
        ))}
      </div>
    </>
  );
}
