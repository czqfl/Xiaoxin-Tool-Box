/** 统一 Toast 反馈：替代 window.alert（Tauri 透明窗口下原生对话框不可靠）
 *  与各模块自绘的成功/失败提示。每个窗口各自挂 Provider，底部居中弹出，
 *  自动计时消失，最多叠 3 条。 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./Toast.css";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
  leaving: boolean;
}

interface ToastApi {
  show: (msg: string, type?: ToastType, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((msg: string, type: ToastType = "info", durationMs = 2600) => {
    const id = ++idRef.current;
    setItems((xs) => [...xs.slice(-2), { id, msg, type, leaving: false }]);
    window.setTimeout(() => {
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    }, durationMs);
    window.setTimeout(() => {
      setItems((xs) => xs.filter((x) => x.id !== id));
    }, durationMs + 260);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}${t.leaving ? " leaving" : ""}`}>
            <span className={`toast-dot toast-dot-${t.type}`} aria-hidden>
              {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "i"}
            </span>
            <span className="toast-msg">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
