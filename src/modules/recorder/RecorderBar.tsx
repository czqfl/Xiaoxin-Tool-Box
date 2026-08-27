import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { Square, Film, FolderOpen, X } from "lucide-react";
import {
  EVT_REC_TICK, EVT_REC_DONE,
  recorderStop, recDismiss, revealFile,
  type RecDonePayload,
} from "./api";
import "./recorder.css";

type Phase = "recording" | "stopping" | "done" | "error";

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

export function RecorderBar() {
  const [phase, setPhase] = useState<Phase>("recording");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RecDonePayload | null>(null);
  const stoppingRef = useRef(false);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);

  useEffect(() => {
    const un1 = listen<{ elapsed_ms: number; frames: number }>(EVT_REC_TICK, (e) => {
      setElapsed(e.payload.elapsed_ms);
    });
    const un2 = listen<RecDonePayload>(EVT_REC_DONE, (e) => {
      setResult(e.payload);
      setPhase(e.payload.ok ? "done" : "error");
    });
    return () => { void un1.then((u) => u()); void un2.then((u) => u()); };
  }, []);

  // 停止后即把控制条变为右下角通知：立即出现（避免停止后空窗期卡顿感），
  // 用 window.screen.avail*（已排除任务栏）定位到当前显示器右下角；
  // done/error 状态 6 秒后自动关闭
  useEffect(() => {
    if (phase === "recording") return;
    const place = async () => {
      try {
        const win = getCurrentWindow();
        const dpr = window.devicePixelRatio || 1;
        // window.screen.* 描述本窗口所在显示器的工作区（已排除任务栏），
        // availLeft/Top 为全局原点，多显示器（含位于主屏左侧的副屏）也正确
        const s = window.screen as Screen & { availLeft: number; availTop: number };
        const al = s.availLeft;
        const at = s.availTop;
        const aw = s.availWidth;
        const ah = s.availHeight;
        const PW = 336, PH = 60;
        await win.setSize(new LogicalSize(PW, PH));
        await win.setPosition(new PhysicalPosition(
          Math.round((al + aw - PW - 16) * dpr),
          Math.round((at + ah - PH - 16) * dpr),
        ));
      } catch { /* 定位失败不应阻塞弹窗内容 */ }
    };
    void place();
    if (phase === "done" || phase === "error") {
      autoCloseRef.current = setTimeout(() => {
        void recDismiss().catch(() => {});
      }, 6000);
    }
    return () => { if (autoCloseRef.current) clearTimeout(autoCloseRef.current); };
  }, [phase]);

  const stop = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setPhase("stopping");
    void recorderStop().catch(() => {});
  };

  // 用系统默认程序直接打开（播放）视频/动图；失败回退到打开所在文件夹
  const openVideo = (path: string) => {
    void invoke("quickfiles_open", { path, opener: null }).catch(() => {
      void revealFile(path).catch(() => {});
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "recording") stop();
        else void recDismiss().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const dismiss = () => void recDismiss().catch(() => {});

  return (
    <div className={`recb-root${phase !== "recording" ? " recb-toast" : ""}`}>
      {/* 录制中：顶部迷你条（红点 + REC + 时间 + 停止） */}
      {phase === "recording" && (
        <>
          <span className="recb-dot" />
          <span className="recb-rec">REC</span>
          <span className="recb-time">{fmt(elapsed)}</span>
          <button
            className="recb-btn recb-stop"
            onClick={stop}
            title="停止录制 (Esc)"
          >
            <Square size={10} fill="currentColor" stroke="none" />
            停止
          </button>
        </>
      )}

      {/* 停止中：即时给出反馈，消除"卡一下"的空窗期 */}
      {phase === "stopping" && (
        <>
          <span className="recb-dot off" />
          <span className="recb-saving">正在保存…</span>
        </>
      )}

      {/* 完成 / 错误：右下角通知卡 */}
      {(phase === "done" || phase === "error") && result && (
        <>
          {result.ok && result.path ? (
            <>
              <span className="recb-ic"><Film size={15} /></span>
              <div className="recb-info">
                <div className="recb-title">
                  已保存 {(() => {
                    const e = result.path!.split(".").pop()?.toLowerCase();
                    return e === "gif" ? "GIF 动图" : e === "mp4" ? "MP4 视频" : "AVI 视频";
                  })()}
                </div>
                <div className="recb-sub">
                  {fmt(result.duration_ms)} · {fmtSize(result.bytes)}
                </div>
              </div>
              <button className="recb-btn recb-open" onClick={() => openVideo(result.path!)} title="用默认程序打开/播放">
                打开
              </button>
              <button className="recb-btn recb-folder" onClick={() => void revealFile(result.path!).catch(() => {})} title="打开所在文件夹">
                <FolderOpen size={13} />
              </button>
            </>
          ) : (
            <span className="recb-err">{result.error ?? "录制失败"}</span>
          )}
          <button className="recb-btn recb-close" onClick={dismiss} title="关闭">
            <X size={13} />
          </button>
        </>
      )}
    </div>
  );
}
