/** 通用右键菜单：portal 到 body（逃逸父容器 overflow 裁切）+ 实测尺寸防溢出 +
 *  Esc 层叠关闭（菜单打开时 Esc 只关菜单，不连带关闭面板） */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscLayer } from "../../hooks/useEscLayered";

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [flip, setFlip] = useState({ x: false, y: false });
  useEscLayer(true, onClose);

  // 视口边界防溢出：用实测宽高替代 items.length*36 估算（含子菜单/分割线时
  // 估算不准会溢出视口底部）。useLayoutEffect 在绘制前执行，收拢无闪烁
  useLayoutEffect(() => {
    const menuW = menuRef.current?.offsetWidth ?? 180;
    const menuH = menuRef.current?.offsetHeight ?? items.length * 36 + 20;
    const left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));
    setPos({ left, top });
    // 子菜单展开方向的估算：向右约 210px、向下约 300px；
    // 空间不足时反向展开，避免子菜单伸出视口被裁剪（悬停看不到内容）
    setFlip({
      x: left + menuW + 210 > window.innerWidth,
      y: top + menuH + 300 > window.innerHeight,
    });
  }, [x, y, items]);

  const cls = [
    "context-menu",
    flip.x ? "submenu-left" : "",
    flip.y ? "submenu-top" : "",
  ]
    .filter(Boolean)
    .join(" ");

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

  return createPortal(
    <>
      {/* 透明遮罩捕获外部点击；阻止冒泡：菜单可能挂在带 onClick 的条目内部
          （portal 后 React 合成事件仍沿虚拟树冒泡） */}
      <div
        className="context-menu-mask"
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
        ref={menuRef}
        className={cls}
        style={pos}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <div key={item.label}>
            {renderItem(item)}
            {item.dividerAfter && <div className="context-menu-divider" />}
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}
