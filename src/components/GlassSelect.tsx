/** 玻璃风格下拉选择器：替代原生 <select>。
 *  原生 select 的选项列表由系统渲染（方框、白底、无模糊），与应用风格违和；
 *  本组件自绘弹出层：毛玻璃面板、圆角、hover 高亮、选中打勾，与应用完全一致。
 *  支持：选项图标（data URL）、分组标题（group）、禁用项（disabled）。
 *
 *  弹出层用 position:fixed 按触发按钮的视口坐标定位——可逃逸任何祖先的
 *  overflow:hidden（如设置卡片 .setting-group 的圆角裁切），选项不再被遮挡；
 *  贴底/贴边时自动向上翻转、水平夹回视口内。 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number }>({
    top: 0,
    left: 0,
    minWidth: 0,
  });

  // 按触发按钮的视口坐标定位弹出层；空间不足时向上翻转、贴边时夹回视口
  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pop = popRef.current;
    const popH = pop?.offsetHeight ?? 220;
    const popW = pop?.offsetWidth ?? r.width;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.bottom + 4;
    if (top + popH > vh - 8) {
      const up = r.top - 4 - popH;
      top = up >= 8 ? up : Math.max(8, vh - 8 - popH);
    }
    let left = r.left;
    if (left + popW > vw - 8) left = Math.max(8, vw - 8 - popW);
    setCoords({ top, left, minWidth: r.width });
  }, []);

  // 打开后先布局再定位：layout effect 在绘制前执行，弹出层不会闪现到 (0,0)
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // 点击外部关闭；滚动（非弹出层内部）与窗口缩放时关闭/重定位
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      // 弹出层自身内容滚动（overflow-y:auto）不应关闭它
      if (popRef.current && popRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => place();
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, place]);

  const current = options.find((o) => o.value === value);
  let lastGroup: string | undefined;
  return (
    <div className="glass-select" ref={rootRef}>
      <button
        ref={btnRef}
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
        <div
          ref={popRef}
          className="glass-select-pop"
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            minWidth: coords.minWidth,
          }}
        >
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
