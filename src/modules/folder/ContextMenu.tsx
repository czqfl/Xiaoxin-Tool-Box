/** 通用右键菜单：fixed 定位 + 点击外部关闭 */
import { useEffect, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  /** 该项之后插入分割线 */
  dividerAfter?: boolean;
  /** 子菜单：有 children 时该项作为展开入口，hover 展示 */
  children?: MenuItem[];
  onClick?: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  // 视口边界防溢出：菜单本体不超出右下角
  const menuW = 180;
  const menuH = items.length * 36 + 20;
  const menuLeft = Math.min(x, window.innerWidth - menuW);
  const menuTop = Math.min(y, window.innerHeight - menuH);
  // 子菜单展开方向的估算：向右约 210px、向下约 300px；
  // 空间不足时反向展开，避免子菜单伸出面板窗口被裁剪（悬停看不到内容）
  const flipX = menuLeft + menuW + 210 > window.innerWidth;
  const flipY = menuTop + menuH + 300 > window.innerHeight;
  const style = {
    left: menuLeft,
    top: menuTop,
  };
  const cls = [
    "context-menu",
    flipX ? "submenu-left" : "",
    flipY ? "submenu-top" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const renderItem = (item: MenuItem) => {
    if (item.children?.length) {
      return (
        <div className="context-menu-item has-submenu">
          {item.icon}
          {item.label}
          <span className="submenu-arrow">▶</span>
          <div className="context-submenu">
            {item.children.map((child) => (
              <button
                key={child.label}
                className={`context-menu-item ${child.danger ? "danger" : ""}`}
                onClick={() => {
                  child.onClick?.();
                  onClose();
                }}
              >
                {child.icon}
                {child.label}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <button
        className={`context-menu-item ${item.danger ? "danger" : ""}`}
        onClick={() => {
          item.onClick?.();
          onClose();
        }}
      >
        {item.icon}
        {item.label}
      </button>
    );
  };

  return (
    <>
      {/* 透明遮罩捕获外部点击；阻止冒泡：菜单可能挂在带 onClick 的条目内部 */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 999 }}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className={cls}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <div key={item.label}>
            {renderItem(item)}
            {item.dividerAfter && <div className="context-menu-divider" />}
          </div>
        ))}
      </div>
    </>
  );
}
