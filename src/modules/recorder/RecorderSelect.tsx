import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Circle, RotateCcw, Film } from "lucide-react";
import { recorderStart, recSelectCancel, type RecRect, type RecOptions } from "./api";
import { GlassSelect } from "../../components/GlassSelect";
import type { AppConfig } from "../../types";
import "./recorder.css";

/** 分辨率预设（按选区高度换算缩放比，不超过原始尺寸） */
type ResPreset = "raw" | "1080" | "720" | "360";
const RES_HEIGHT: Record<ResPreset, number> = { raw: 0, "1080": 1080, "720": 720, "360": 360 };

/** 录屏区域选择：呼出即全屏磨砂（窗口级实时模糊），拖拽框选后弹出配置面板，
 *  确认后开始录制——选区窗随即关闭，录制区域由原生边框环（Rust 侧）标示。 */
export function RecorderSelect() {
  const [rect, setRect] = useState<RecRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number } | null>(null);
  const rectRef = useRef<RecRect | null>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  // 录制参数：格式 / 帧率(GIF) / 画质；分辨率预设单独存（开始录制时换算 scale）
  const [opts, setOpts] = useState<RecOptions>({ fmt: "mp4", fps: 12, scale: 1, quality: "normal" });
  const [res, setRes] = useState<ResPreset>("raw");

  // 从配置读取默认帧率（设置页可调），面板选项覆盖之
  useEffect(() => {
    invoke<AppConfig>("config_load").then((cfg) => {
      const fps = cfg.recorder?.fps ?? 12;
      setOpts((o) => ({ ...o, fps }));
    }).catch(() => {});
  }, []);

  // 双保险：确保 html 标记为面板级透明底
  useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);

  const setBoth = (r: RecRect | null) => { rectRef.current = r; setRect(r); };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || startingRef.current) return;
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

  const onUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    setDragging(false);
    // 释放指针捕获：拖拽后若不释放，捕获会把后续点击都路由给捕获元素，
    // 导致面板上的按钮（如下拉框）点了没反应
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* 未捕获则忽略 */ }
  };

  const start = async () => {
    const r = rectRef.current;
    if (!r || startingRef.current) return;
    if (r.w < 24 || r.h < 24) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    // 分辨率预设 → 缩放比：按选区高度换算，目标高度超过选区则用原始尺寸
    const target = RES_HEIGHT[res];
    const scale = target > 0 ? Math.min(1, Math.max(0.25, target / r.h)) : 1;
    const sc = window.devicePixelRatio || 1;
    // recorder_start 成功即由 Rust 关闭本窗口；失败则留在选区模式提示错误
    try {
      await recorderStart({
        x: Math.round(r.x * sc), y: Math.round(r.y * sc),
        w: Math.round(r.w * sc), h: Math.round(r.h * sc),
      }, { fmt: opts.fmt, fps: opts.fps, scale, quality: opts.quality });
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
      if (startingRef.current) return;
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
      if (startingRef.current) return;
      if (rectRef.current) setBoth(null);
      else void recSelectCancel().catch(() => {});
    };
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const onBlur = () => {
      if (startingRef.current) return;
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

  // ---- 选区模式 ----
  const valid = rect != null && rect.w >= 24 && rect.h >= 24;
  // 面板位置：紧挨录制区【外部右下角】——在选区正下方、右缘对齐选区右缘；
  // 若该处剩余空间放不下，回退到录制区【内部右下角】（面板右下角对齐选区右下角）。
  // 初始估算用固定尺寸，layout effect 用真实尺寸精确夹回。
  const PANEL_W_EST = 320;
  const PANEL_H_EST = 214;
  let panelLeft = 0, panelTop = 0;
  if (valid && rect) {
    // 外部右下角：正下方 + 右对齐选区右缘
    let left = rect.x + rect.w - PANEL_W_EST - 4;
    let top = rect.y + rect.h + 8;
    const outsideFits = top + PANEL_H_EST <= window.innerHeight - 4
      && left >= 4 && left + PANEL_W_EST <= window.innerWidth - 4;
    if (!outsideFits) {
      // 回退：录制区内部右下角
      left = rect.x + rect.w - PANEL_W_EST - 6;
      top = rect.y + rect.h - PANEL_H_EST - 6;
      left = Math.max(rect.x + 4, Math.min(left, rect.x + rect.w - PANEL_W_EST - 4));
      top = Math.max(rect.y + 4, Math.min(top, rect.y + rect.h - PANEL_H_EST - 4));
    }
    panelLeft = Math.max(4, Math.min(left, window.innerWidth - PANEL_W_EST - 4));
    panelTop = Math.max(4, Math.min(top, window.innerHeight - PANEL_H_EST - 4));
  }

  // 面板真实尺寸夹回：render 后量一次，避免估算偏差
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!valid || !el || !rect) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = rect.x + rect.w - w - 4;
    let top = rect.y + rect.h + 8;
    const outsideFits = top + h <= window.innerHeight - 4
      && left >= 4 && left + w <= window.innerWidth - 4;
    if (!outsideFits) {
      left = rect.x + rect.w - w - 6;
      top = rect.y + rect.h - h - 6;
      left = Math.max(rect.x + 4, Math.min(left, rect.x + rect.w - w - 4));
      top = Math.max(rect.y + 4, Math.min(top, rect.y + rect.h - h - 4));
    }
    el.style.left = `${Math.max(4, Math.min(left, window.innerWidth - w - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(top, window.innerHeight - h - 4))}px`;
  }, [rect, valid, dragging]);

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
            <i className="rec-corner tl" /><i className="rec-corner tr" />
            <i className="rec-corner bl" /><i className="rec-corner br" />
            <span className="rec-size">{Math.round(rect.w)} × {Math.round(rect.h)}</span>
          </div>
          {!dragging && (
            <div
              ref={panelRef}
              className="rec-panel"
              style={{ left: panelLeft, top: panelTop }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <div className="rec-panel-head">
                <span className="rec-panel-title"><Film size={13} /> 屏幕录制</span>
                <span className="rec-panel-hint"><kbd>Enter</kbd> 开始 · <kbd>Esc</kbd> 取消</span>
              </div>

              <div className="rec-field">
                <span className="rec-label">格式</span>
                <GlassSelect
                  value={opts.fmt}
                  onChange={(v) => setOpts((o) => ({ ...o, fmt: v as RecOptions["fmt"] }))}
                  options={[
                    { value: "mp4", label: "视频 MP4" },
                    { value: "gif", label: "动图 GIF" },
                  ]}
                  title="选择输出格式"
                />
              </div>

              <div className="rec-field">
                <span className="rec-label">分辨率</span>
                <div className="rec-seg">
                  {(["raw", "1080", "720", "360"] as ResPreset[]).map((p) => (
                    <button key={p} className={res === p ? "active" : ""}
                      onClick={() => setRes(p)}>{p === "raw" ? "原始" : `${p}p`}</button>
                  ))}
                </div>
              </div>

              <div className="rec-field">
                <span className="rec-label">画质</span>
                <div className="rec-seg">
                  {([["high", "高"], ["normal", "标准"], ["fast", "快速"]] as const).map(([v, l]) => (
                    <button key={v} className={opts.quality === v ? "active" : ""}
                      onClick={() => setOpts((o) => ({ ...o, quality: v }))}>{l}</button>
                  ))}
                </div>
              </div>

              {opts.fmt === "gif" && (
                <div className="rec-field">
                  <span className="rec-label">帧率</span>
                  <div className="rec-seg">
                    {[8, 12, 15, 20].map((f) => (
                      <button key={f} className={opts.fps === f ? "active" : ""}
                        onClick={() => setOpts((o) => ({ ...o, fps: f }))}>{f}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rec-actions">
                <button onClick={() => setBoth(null)}>
                  <RotateCcw size={11} /> 重选
                </button>
                <button className="rec-start" onClick={() => void start()}>
                  <Circle size={11} fill="currentColor" stroke="none" /> 开始录制
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {!valid && (
        <div className="rec-hint">
          拖拽框选录制区域 <kbd>Enter</kbd> 开始 · <kbd>Esc</kbd> 取消
        </div>
      )}
      {error && <div className="rec-hint rec-hint-error">启动失败：{error}</div>}
      {starting && <div className="rec-hint">正在启动录制…</div>}
    </div>
  );
}
