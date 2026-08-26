import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Circle, Square } from "lucide-react";
import { recorderStart, recSelectCancel, type RecRect } from "./api";
import "./recorder.css";

/** 录屏区域选择：全屏透明窗（覆盖光标所在显示器），拖拽框选 + Enter/按钮确认。
 *  与截图模块解耦：只依赖自身窗口几何（outerPosition）做坐标换算。 */
export function RecorderSelect() {
  const win = getCurrentWindow();
  const [rect, setRect] = useState<RecRect | null>(null);
  const dragRef = useRef<{ sx: number; sy: number } | null>(null);
  const rectRef = useRef<RecRect | null>(null);
  const startingRef = useRef(false);
  const [monSize, setMonSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // 双保险：确保 html 标记为面板级透明底（main.tsx 已按 label 设置，这里幂等兜底，
  // 否则主题的 app 底色会铺满整屏——表现为"一开录制屏幕全黑"）
  useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);

  useEffect(() => {
    void win.outerSize().then((s) => setMonSize({ w: s.width / (window.devicePixelRatio || 1), h: s.height / (window.devicePixelRatio || 1) }));
  }, [win]);

  const setBoth = (r: RecRect | null) => { rectRef.current = r; setRect(r); };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || startingRef.current) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY };
    setBoth({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(d.sx, e.clientX);
    const y = Math.min(d.sy, e.clientY);
    const w = Math.abs(e.clientX - d.sx);
    const h = Math.abs(e.clientY - d.sy);
    setBoth({ x, y, w, h });
  };

  const onUp = () => { dragRef.current = null; };

  const start = async () => {
    const r = rectRef.current;
    if (!r || startingRef.current) return;
    if (r.w < 24 || r.h < 24) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    const sc = window.devicePixelRatio || 1;
    try {
      await recorderStart({
        x: Math.round(r.x * sc), y: Math.round(r.y * sc),
        w: Math.round(r.w * sc), h: Math.round(r.h * sc),
      });
      // 成功时 Rust 端会关闭本窗口
    } catch (err) {
      // 失败要可见：恢复可重试并显示原因（此前只写 console，用户视角是"点了没反应"）
      console.error("recorder_start failed", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (startingRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        void recSelectCancel().catch(() => {});
      } else if (e.key === "Enter") {
        e.preventDefault();
        void start();
      }
    };
    // 右键：已有选区先清除，没有选区直接取消——绝不让全屏窗静默滞留
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      if (startingRef.current) return;
      if (rectRef.current) setBoth(null);
      else void recSelectCancel().catch(() => {});
    };
    // 失焦（点击了本窗以外的任何应用）：自动取消。
    // 全屏置顶透明窗若在失焦后仍滞留，会隐形吃掉整屏输入，
    // 表现为"系统像卡死/有一层东西挡着"——必须杜绝
    const onBlur = () => {
      if (!startingRef.current) {
        dragRef.current = null;
        void recSelectCancel().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("blur", onBlur);
    };
  });

  const valid = rect != null && rect.w >= 8 && rect.h >= 8;

  return (
    <div className="rec-select" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      {valid && rect && (
        <>
          {/* 四向压暗遮罩，中间镂空为选区 */}
          <div className="rec-shade" style={{ left: 0, top: 0, width: "100%", height: rect.y }} />
          <div className="rec-shade" style={{ left: 0, top: rect.y, width: rect.x, height: rect.h }} />
          <div className="rec-shade" style={{ left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h }} />
          <div className="rec-shade" style={{ left: 0, top: rect.y + rect.h, width: "100%", bottom: 0 }} />
          <div
            className="rec-frame"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          >
            <span className="rec-size">{Math.round(rect.w)} × {Math.round(rect.h)}</span>
            <div className="rec-confirm">
              <button onClick={(e) => { e.stopPropagation(); void start(); }}>
                <Circle size={11} fill="currentColor" stroke="none" /> 开始录制
              </button>
              <button onClick={(e) => { e.stopPropagation(); setBoth(null); }}>
                <Square size={10} /> 重选
              </button>
            </div>
          </div>
        </>
      )}
      {!valid && (
        <div className="rec-hint">拖拽框选录制区域 · Enter 开始录制 · 右键 / Esc 取消</div>
      )}
      {error && <div className="rec-hint rec-hint-error">启动失败：{error}</div>}
      {starting && <div className="rec-hint">正在启动录制…</div>}
      {monSize.w === 0 && <div />}
    </div>
  );
}
