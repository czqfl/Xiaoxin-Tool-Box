/** 玻璃风格下拉选择器：替代原生 <select>。
 *  原生 select 的选项列表由系统渲染（方框、白底、无模糊），与应用风格违和；
 *  本组件自绘弹出层：毛玻璃面板、圆角、hover 高亮、选中打勾，与应用完全一致。 */
import { useEffect, useRef, useState } from "react";
import "../styles/glass-select.css";

export interface GlassOption {
  value: string;
  label: string;
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
  return (
    <div className="glass-select" ref={rootRef}>
      <button
        type="button"
        className={`glass-select-btn${open ? " open" : ""}`}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="glass-select-label">{current?.label ?? value}</span>
        <span className="glass-select-caret">▾</span>
      </button>
      {open && (
        <div className="glass-select-pop">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`glass-select-opt${o.value === value ? " selected" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="glass-select-opt-label">{o.label}</span>
              {o.value === value && <span className="glass-select-opt-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
