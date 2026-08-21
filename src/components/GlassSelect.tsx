/** 玻璃风格下拉选择器：替代原生 <select>。
 *  原生 select 的选项列表由系统渲染（方框、白底、无模糊），与应用风格违和；
 *  本组件自绘弹出层：毛玻璃面板、圆角、hover 高亮、选中打勾，与应用完全一致。
 *  支持：选项图标（data URL）、分组标题（group）、禁用项（disabled）。 */
import { useEffect, useRef, useState } from "react";
import "../styles/glass-select.css";

export interface GlassOption {
  value: string;
  label: string;
  /** 选项图标（PNG data URL），显示在文字左侧 */
  icon?: string;
  /** 分组标题：首次出现该 group 的选项前渲染分组头 */
  group?: string;
  /** 禁用项：不可点击、半透明（如"正在扫描…"、自定义占位） */
  disabled?: boolean;
}

export function GlassSelect({
  value,
  onChange,
  options,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  options: GlassOption[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const current = options.find((o) => o.value === value);
  let lastGroup: string | undefined;
  return (
    <div className="glass-select" ref={rootRef}>
      <button
        type="button"
        className={`glass-select-btn${open ? " open" : ""}`}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.icon && (
          <img className="glass-select-btn-icon" src={current.icon} alt="" draggable={false} />
        )}
        <span className="glass-select-label">{current?.label ?? value}</span>
        <span className="glass-select-caret">▾</span>
      </button>
      {open && (
        <div className="glass-select-pop">
          {options.map((o) => {
            const header =
              o.group && o.group !== lastGroup ? (
                <div className="glass-select-group" key={`g-${o.group}`}>
                  {o.group}
                </div>
              ) : null;
            lastGroup = o.group ?? undefined;
            return (
              <span key={o.value}>
                {header}
                <button
                  type="button"
                  className={`glass-select-opt${o.value === value ? " selected" : ""}${
                    o.disabled ? " disabled" : ""
                  }`}
                  disabled={o.disabled}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span className="glass-select-opt-label">
                    {o.icon && (
                      <img className="glass-select-opt-icon" src={o.icon} alt="" draggable={false} />
                    )}
                    <span className="glass-select-opt-text">{o.label}</span>
                  </span>
                  {o.value === value && <span className="glass-select-opt-check">✓</span>}
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
