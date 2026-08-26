import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Circle, RotateCcw, Film } from "lucide-react";
import { recorderStart, recSelectCancel, EVT_REC_STARTED, type RecRect, type RecOptions } from "./api";
import type { AppConfig } from "../../types";
import "./recorder.css";

/** 录屏区域选择：呼出即全屏压暗，拖拽框选后弹出配置面板，确认后开始录制。
 *  录制中窗口不关闭——只显示选区边框（脉冲动画），直到录制结束自动关闭。 */
export function RecorderSelect() {
  const [rect, setRect] = useState<RecRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number } | null>(null);
  const rectRef = useRef<RecRect | null>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  // 录制参数：格式 / 帧率(GIF) / 分辨率缩放
  const [opts, setOpts] = useState<RecOptions>({ fmt: "avi", fps: 12, scale: 1 });
  // 录制中：收到 started 事件后切换，只显示边框
  const [recording, setRecording] = useState(false);
  const [recRegion, setRecRegion] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // 从配置读取默认帧率（设置页可调），面板选项覆盖之
  useEffect(() => {
    invoke<AppConfig>("config_load").then((cfg) => {
      const fps = cfg.recorder?.fps ?? 12;
      setOpts((o) => ({ ...o, fps }));
    }).catch(() => {});
  }, []);

  // 监听 Rust 发来的 started 事件：切换到录制中模式（只显示边框）
  useEffect(() => {
    const un = listen<{ x: number; y: number; w: number; h: number }>(EVT_REC_STARTED, (e) => {
      setRecording(true);
      setRecRegion(e.payload);
    });
    return () => { void un.then((u) => u()); };
  }, []);

  // 双保险：确保 html 标记为面板级透明底
  useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);

  const setBoth = (r: RecRect | null) => { rectRef.current = r; setRect(r); };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || startingRef.current || recording) return;
    if ((e.target as Element).closest(".rec-panel")) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY };
    setDragging(true);
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

  const onUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

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
      }, opts);
      // Rust 发回 EVT_REC_STARTED 后切换到录制中模式
    } catch (err) {
      console.error("recorder_start failed", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  // P1#5: 错误提示 3 秒后自动消失
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 3000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (startingRef.current || recording) return;
      if (e.key === "Escape") {
        e.preventDefault();
        void recSelectCancel().catch(() => {});
      } else if (e.key === "Enter") {
        e.preventDefault();
        void start();
      }
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      if (startingRef.current || recording) return;
      if (rectRef.current) setBoth(null);
      else void recSelectCancel().catch(() => {});
    };
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const onBlur = () => {
      if (startingRef.current || recording) return;
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) {
          dragRef.current = null;
          setDragging(false);
          void recSelectCancel().catch(() => {});
        }
      }, 300);
    };
    const onFocus = () => {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      if (blurTimer) clearTimeout(blurTimer);
    };
  });

  // ---- 录制中模式：遮罩 + 脉冲边框（不可交互） ----
  if (recording && recRegion) {
    return (
      <div className="rec-select rec-select-recording">
        {/* 四向遮罩镂空选区 */}
        <div className="rec-shade" style={{ left: 0, top: 0, width: "100%", height: recRegion.y }} />
        <div className="rec-shade" style={{ left: 0, top: recRegion.y, width: recRegion.x, height: recRegion.h }} />
        <div className="rec-shade" style={{ left: recRegion.x + recRegion.w, top: recRegion.y, right: 0, height: recRegion.h }} />
        <div className="rec-shade" style={{ left: 0, top: recRegion.y + recRegion.h, width: "100%", bottom: 0 }} />
        {/* 脉冲边框 */}
        <div
          className="rec-frame rec-frame-recording"
          style={{ left: recRegion.x, top: recRegion.y, width: recRegion.w, height: recRegion.h }}
        />
      </div>
    );
  }

  // ---- 选区模式 ----
  const valid = rect != null && rect.w >= 24 && rect.h >= 24;
  const PANEL_W_EST = 310;
  const panelLeft = valid ? Math.max(8, Math.min(rect!.x + rect!.w - PANEL_W_EST, window.innerWidth - PANEL_W_EST - 8)) : 0;
  const panelAbove = valid ? rect!.y + rect!.h + 118 > window.innerHeight : false;
  const panelTop = valid ? (panelAbove ? rect!.y - 8 : rect!.y + rect!.h + 10) : 0;

  return (
    <div className="rec-select" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      {!valid && <div className="rec-shade rec-shade-full" />}
      {valid && rect && (
        <>
          <div className="rec-shade" style={{ left: 0, top: 0, width: "100%", height: rect.y }} />
          <div className="rec-shade" style={{ left: 0, top: rect.y, width: rect.x, height: rect.h }} />
          <div className="rec-shade" style={{ left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h }} />
          <div className="rec-shade" style={{ left: 0, top: rect.y + rect.h, width: "100%", bottom: 0 }} />
          <div
            className="rec-frame"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          >
            <span className="rec-size">{Math.round(rect.w)} × {Math.round(rect.h)}</span>
          </div>
          {!dragging && (
            <div
              className={`rec-panel${panelAbove ? " rec-panel-above" : ""}`}
              style={{ left: panelLeft, top: panelTop }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <div className="rec-row">
                <span className="rec-label"><Film size={12} /> 格式</span>
                <div className="rec-seg">
                  <button className={opts.fmt === "avi" ? "active" : ""}
                    onClick={() => setOpts((o) => ({ ...o, fmt: "avi" }))}>视频 AVI</button>
                  <button className={opts.fmt === "gif" ? "active" : ""}
                    onClick={() => setOpts((o) => ({ ...o, fmt: "gif" }))}>动图 GIF</button>
                </div>
              </div>
              <div className="rec-row">
                <span className="rec-label">帧率</span>
                {opts.fmt === "gif" ? (
                  <div className="rec-seg">
                    {[8, 12, 15, 20].map((f) => (
                      <button key={f} className={opts.fps === f ? "active" : ""}
                        onClick={() => setOpts((o) => ({ ...o, fps: f }))}>{f}</button>
                    ))}
                  </div>
                ) : (
                  <span className="rec-value">30 帧/秒</span>
                )}
                <span className="rec-label">分辨率</span>
                <div className="rec-seg">
                  {([0.5, 0.75, 1] as const).map((s) => (
                    <button key={s} className={opts.scale === s ? "active" : ""}
                      onClick={() => setOpts((o) => ({ ...o, scale: s }))}>{s * 100}%</button>
                  ))}
                </div>
              </div>
              <div className="rec-actions">
                <button className="rec-start" onClick={() => void start()}>
                  <Circle size={11} fill="currentColor" stroke="none" /> 开始录制
                </button>
                <button onClick={() => setBoth(null)}>
                  <RotateCcw size={11} /> 重选
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {!valid && (
        <div className="rec-hint">拖拽框选录制区域 · Enter 开始录制 · 右键 / Esc 取消</div>
      )}
      {error && <div className="rec-hint rec-hint-error">启动失败：{error}</div>}
      {starting && <div className="rec-hint">正在启动录制…</div>}
    </div>
  );
}
