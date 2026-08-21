/** 设置页共享小组件：行、分组、开关、分段选择 */
import type { ReactNode } from "react";

export function SettingGroup({ children }: { children: ReactNode }) {
  return <div className="setting-group">{children}</div>;
}

interface RowProps {
  title: string;
  desc?: string;
  children?: ReactNode;
  /** 布局方式：
   *  - "row"   默认：左标题 + 右控件（行内水平，适合开关/分段/输入框等窄控件）
   *  - "block" 块状：标题在上、控件在下（垂直堆叠，适合多行列表/文本区域等会换行的内容，
   *                避免控件把左侧标题+长描述挤成竖排一字一行） */
  layout?: "row" | "block";
}

export function SettingRow({ title, desc, children, layout = "row" }: RowProps) {
  return (
    <div className={`setting-row${layout === "block" ? " block" : ""}`}>
      <div className="setting-info">
        <div className="setting-title">{title}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      {children && <div className="setting-control">{children}</div>}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={`switch ${checked ? "on" : ""}`}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min = 0,
  max = 100,
  onChange,
  disabled = false,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
