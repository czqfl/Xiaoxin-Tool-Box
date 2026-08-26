import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Square, FolderOpen, X } from "lucide-react";
import {
  EVT_REC_TICK, EVT_REC_DONE,
  recorderStop, recorderBarPopup, recDismiss, revealFile,
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

  // 完成后：窗口移到右下角，5秒自动关闭
  useEffect(() => {
    if (phase === "done" && result?.ok) {
      void recorderBarPopup().catch(() => {});
      autoCloseRef.current = setTimeout(() => {
        void recDismiss().catch(() => {});
      }, 5000);
    }
    if (phase === "error") {
      void recorderBarPopup().catch(() => {});
      autoCloseRef.current = setTimeout(() => {
        void recDismiss().catch(() => {});
      }, 5000);
    }
    return () => { if (autoCloseRef.current) clearTimeout(autoCloseRef.current); };
  }, [phase, result]);

  const stop = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setPhase("stopping");
    void recorderStop().catch(() => {});
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
    <div className={`recb-root${phase === "done" || phase === "error" ? " recb-toast" : ""}`}>
      {/* 录制中 / 停止中：迷你条 */}
      {(phase === "recording" || phase === "stopping") && (
        <>
          <span className={`recb-dot${phase === "stopping" ? " off" : ""}`} />
          <span className="recb-time">{fmt(elapsed)}</span>
          <button
            className="recb-btn recb-stop"
            onClick={stop}
            disabled={phase === "stopping"}
            title="停止录制 (Esc)"
          >
            <Square size={10} fill="currentColor" stroke="none" />
            {phase === "stopping" ? "生成中…" : "停止"}
          </button>
        </>
      )}

      {/* 完成 / 错误：右下角小弹窗 */}
      {(phase === "done" || phase === "error") && result && (
        <>
          {result.ok && result.path ? (
            <>
              <span className="recb-ok">
                已保存 {result.path.endsWith(".gif") ? "GIF" : "视频"} · {fmt(result.duration_ms)} · {fmtSize(result.bytes)}
              </span>
              <button className="recb-btn recb-action" onClick={() => void revealFile(result.path!).catch(() => {})} title="打开文件位置">
                <FolderOpen size={12} /> 打开
              </button>
            </>
          ) : (
            <span className="recb-err">{result.error ?? "录制失败"}</span>
          )}
          <button className="recb-btn recb-close" onClick={dismiss} title="关闭">
            <X size={12} />
          </button>
        </>
      )}
    </div>
  );
}
