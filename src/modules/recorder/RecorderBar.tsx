import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Square, FolderOpen, X } from "lucide-react";
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
  const [frames, setFrames] = useState(0);
  const [result, setResult] = useState<RecDonePayload | null>(null);
  const stoppingRef = useRef(false);

  // 透明底双保险（同 RecorderSelect）
  useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);

  useEffect(() => {
    const un1 = listen<{ elapsed_ms: number; frames: number }>(EVT_REC_TICK, (e) => {
      setElapsed(e.payload.elapsed_ms);
      setFrames(e.payload.frames);
    });
    const un2 = listen<RecDonePayload>(EVT_REC_DONE, (e) => {
      setResult(e.payload);
      setPhase(e.payload.ok ? "done" : "error");
    });
    return () => { void un1.then((u) => u()); void un2.then((u) => u()); };
  }, []);

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
  });

  const dismiss = () => void recDismiss().catch(() => {});

  return (
    <div className="recb-root">
      {(phase === "recording" || phase === "stopping") && (
        <>
          <span className={`recb-dot${phase === "stopping" ? " off" : ""}`} />
          <span className="recb-time">{fmt(elapsed)}</span>
          <span className="recb-frames">{frames} 帧</span>
          <button
            className="recb-btn recb-stop"
            onClick={stop}
            disabled={phase === "stopping"}
            title="停止录制"
          >
            <Square size={11} fill="currentColor" stroke="none" />
            {phase === "stopping" ? "生成中…" : "停止"}
          </button>
        </>
      )}

      {phase === "done" && result?.path && (
        <>
          <span className="recb-ok">已保存 GIF · {fmt(result.duration_ms)} · {fmtSize(result.bytes)}</span>
          <button className="recb-btn" onClick={() => void revealFile(result.path!).catch(() => {})} title="打开位置">
            <FolderOpen size={12} /> 位置
          </button>
          <button className="recb-btn" onClick={dismiss} title="关闭"><X size={12} /></button>
        </>
      )}

      {phase === "error" && (
        <>
          <span className="recb-err">{result?.error ?? "录制失败"}</span>
          <button className="recb-btn" onClick={dismiss}><X size={12} /></button>
        </>
      )}
    </div>
  );
}
