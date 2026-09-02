import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Play, VolumeX, Mic, MonitorSpeaker, AudioLines } from "lucide-react";
import {
  recorderStart, recorderStop, recSelectCancel,
  EVT_REC_DONE, type RecDonePayload,
  type RecRect, type RecOptions, type AudioSource,
} from "./api";
import type { AppConfig } from "../../types";
import "./recorder.css";

/** 分辨率预设（按选区高度换算缩放比，不超过原始尺寸） */
type ResPreset = "raw" | "1080" | "720" | "360";
const RES_HEIGHT: Record<ResPreset, number> = { raw: 0, "1080": 1080, "720": 720, "360": 360 };
const RES_LIST: ResPreset[] = ["raw", "1080", "720", "360"];

/** 帧率允许区间（与 Rust 侧 recorder.rs 的 MIN_FPS/MAX_FPS 保持一致） */
const MIN_FPS = 5;
const MAX_FPS = 60;

/** 音源：图标（按钮本体）+ 完整名称（tooltip）。面板空间有限，不用文字 */
const AUDIO_LIST: AudioSource[] = ["off", "mic", "system", "mix"];
const AUDIO_ICON: Record<AudioSource, ReactNode> = {
  off: <VolumeX size={13} />,
  mic: <Mic size={13} />,
  system: <MonitorSpeaker size={13} />,
  mix: <AudioLines size={13} />,
};
const AUDIO_LABEL: Record<AudioSource, string> = {
  off: "不录音",
  mic: "麦克风",
  system: "系统声音",
  mix: "麦克风 + 系统声音",
};

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
  // 录制参数：格式 / 帧率 / 画质（默认值均取自设置页）；
  // 分辨率预设单独存，开始录制时按选区高度换算成 scale
  const [opts, setOpts] = useState<RecOptions>({ fmt: "mp4", fps: 12, scale: 1, quality: "normal", audio: "off" });
  const [res, setRes] = useState<ResPreset>("raw");
  // 录制中遮罩模式：Rust 不再销毁选区窗，而是让它转入"黑遮罩镂空录制区"
  // （鼠标已在窗口级穿透），与选区阶段视觉统一
  const [masking, setMasking] = useState(false);

  // 默认值全部来自设置页：录制面板只暴露最常用的「格式」，分辨率/画质/帧率沿用设置。
  // 两处因此是同一套配置的两种用法——设置项 = 持久默认，面板改动只影响本次录制。
  useEffect(() => {
    invoke<AppConfig>("config_load").then((cfg) => {
      const r = cfg.recorder;
      if (!r) return;
      const fmt: RecOptions["fmt"] = r.fmt === "gif" ? "gif" : "mp4";
      const res = (RES_LIST.includes(r.res as ResPreset) ? r.res : "raw") as ResPreset;
      const quality = (["high", "normal", "fast"].includes(r.quality)
        ? r.quality : "normal") as RecOptions["quality"];
      const fps = Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(r.fps ?? 12)));
      const audio = (AUDIO_LIST.includes(r.audio as AudioSource)
        ? r.audio : "off") as AudioSource;
      setOpts((o) => ({ ...o, fmt, quality, fps, audio }));
      setRes(res);
    }).catch(() => {});
  }, []);

  // 双保险：确保 html 标记为面板级透明底
  useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);

  // masking 镜像 ref：失焦回调读最新遮罩态（录制中点击其他应用是正常动作，
  // 绝不能因失焦把充当录制遮罩的选区窗收掉）
  const maskingRef = useRef(false);
  useEffect(() => { maskingRef.current = masking; }, [masking]);

  // Rust 侧驱动的状态迁移：
  // select-reset —— 窗口被复用呼出（只 hide 不销毁），清空回到选区模式；
  // mask         —— recorder_start 成功，转入录制遮罩模式（窗口已鼠标穿透）；
  // done         —— 录制结束（Rust 会 hide 本窗），这里同步退出遮罩兜底
  useEffect(() => {
    const un1 = listen("recorder://select-reset", () => {
      startingRef.current = false;
      setStarting(false);
      setError("");
      setMasking(false);
      setBoth(null);
    });
    const un2 = listen("recorder://mask", () => {
      setStarting(false);
      setMasking(true);
    });
    // 录制结束把选区/拖拽状态一并清空：窗口 hide 后状态必须归零，否则下次
    // 复用呼出时 show 的第一帧会用【上一次的选区】渲染（"闪出上次录制区域"）
    const un3 = listen<RecDonePayload>(EVT_REC_DONE, () => {
      setMasking(false);
      setBoth(null);
      setDragging(false);
      startingRef.current = false;
      setStarting(false);
    });
    return () => {
      void un1.then((u) => u());
      void un2.then((u) => u());
      void un3.then((u) => u());
    };
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
      }, {
        fmt: opts.fmt, fps: opts.fps, scale, quality: opts.quality,
        // GIF 容器不支持音频，强制关掉（Rust 侧也会忽略，这里先兜住避免误解）
        audio: opts.fmt === "mp4" ? opts.audio : "off",
      });
    } catch (err) {
      console.error("recorder_start failed", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  // P1#5: 错误提示 10 秒后自动消失（3 秒根本来不及看完报错原因），
  // 点击提示条可立即清除。
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 10000);
    return () => clearTimeout(t);
  }, [error]);

  // start 的 ref 镜像 + 监听一次性注册：旧 effect 无 deps，框选拖动时每帧
  // setBoth 重渲染 → 每帧 remove/add 4 个 window 监听（keydown/contextmenu/
  // blur/focus），纯开销且 blur 计时行为依赖重挂时序
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (startingRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        // 录制中（遮罩模式）：Esc = 停止并保存。控制条已移除，
        // 这是除"再按一次录制快捷键"之外的兜底停止入口（焦点还在本窗时可用）
        if (maskingRef.current) {
          void recorderStop().catch(() => {});
          return;
        }
        void recSelectCancel().catch(() => {});
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (maskingRef.current) return; // 录制中忽略 Enter，避免重复触发 recorder_start
        void startRef.current();
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
      if (maskingRef.current) return;
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
  }, []);

  // ---- 选区模式 ----
  const valid = rect != null && rect.w >= 24 && rect.h >= 24;
  // 面板位置：紧挨录制区【外部右下角】——在选区正下方、右缘对齐选区右缘；
  // 若该处剩余空间放不下，回退到录制区【内部右下角】（面板右下角对齐选区右下角）。
  // 初始估算用固定尺寸，layout effect 用真实尺寸精确夹回。
  // 面板已简化为单行（格式平铺 + 开始录制），宽高都按内容自适应；
  // 内边距对齐截图工具栏（8px 10px）后整体更矮
  // MP4 时面板多一排音源按钮，估算宽度相应加宽（真实宽度由 layout effect 夹回）
  const PANEL_W_EST = opts.fmt === "mp4" ? 268 : 172;
  const PANEL_H_EST = 34;
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
          {/* 遮罩模式（录制中）只保留黑遮罩：描边交给原生边框环（recframe.rs），
              前端不再画框——否则两套虚线重叠，且尺寸标签会一直挂在录制区上 */}
          {!masking && (
            <div
              className="rec-frame"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            >
              <i className="rec-corner tl" /><i className="rec-corner tr" />
              <i className="rec-corner bl" /><i className="rec-corner br" />
              <span className="rec-size">{Math.round(rect.w)} × {Math.round(rect.h)}</span>
            </div>
          )}
          {!dragging && !masking && (
            <div
              ref={panelRef}
              className="rec-panel"
              style={{ left: panelLeft, top: panelTop }}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              {/* 一行搞定：格式平铺点选（纯文字，去图标），与「开始录制」同排。
                  开始录制也是纯图标（红色录制点）；右键可清空选区重新框选 */}
              <div className="rec-quick-row">
                {(["mp4", "gif"] as const).map((v) => (
                  <button
                    key={v}
                    className={`rec-fmt-btn${opts.fmt === v ? " active" : ""}`}
                    onClick={() => setOpts((o) => ({ ...o, fmt: v }))}
                    title={v === "mp4" ? "视频 MP4" : "动图 GIF"}
                  >
                    {v === "mp4" ? "MP4" : "GIF"}
                  </button>
                ))}
                {/* 音源：仅 MP4 显示（GIF 容器不支持音频）。
                    设置页的 audio 是持久默认值，这里的改动只影响本次录制。 */}
                {opts.fmt === "mp4" && (
                  <>
                    <i className="rec-quick-sep" />
                    {AUDIO_LIST.map((v) => (
                      <button
                        key={v}
                        className={`rec-fmt-btn rec-audio-btn${opts.audio === v ? " active" : ""}`}
                        onClick={() => setOpts((o) => ({ ...o, audio: v }))}
                        title={`音源：${AUDIO_LABEL[v]}（录制中可在顶部控制条随时开关）`}
                      >
                        {AUDIO_ICON[v]}
                      </button>
                    ))}
                  </>
                )}
                <i className="rec-quick-sep" />
                <button className="rec-start" onClick={() => void start()} title="开始录制（Enter）">
                  <Play size={13} fill="currentColor" stroke="none" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {!valid && <div className="rec-hint">拖拽框选录制区域</div>}
      {error && (
        <div
          className="rec-hint rec-hint-error"
          style={{ cursor: "pointer" }}
          title="点击关闭"
          onClick={() => setError("")}
        >
          启动失败：{error}
        </div>
      )}
      {starting && <div className="rec-hint">正在启动录制…</div>}
    </div>
  );
}
