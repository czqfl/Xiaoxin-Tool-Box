/** 统一加载指示器：三档尺寸，替代各模块 13~26px 的四种自绘 spinner */
import "./Spinner.css";

export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return <span className={`spinner spinner-${size}`} role="status" aria-label="加载中" />;
}
