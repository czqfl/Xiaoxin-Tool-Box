import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { Square, Film, FolderOpen, X, Pause, Play, LoaderCircle, Mic, MicOff, Volume2 } from "lucide-react";
import {
  EVT_REC_TICK, EVT_REC_DONE,
  recorderStop, recorderPause, recorderResume, recorderCancel,
  recDismiss, revealFile, recorderAudioMute, recorderAudioState, recorderAudioVolume, recorderAudioVolumeGet,
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
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<RecDonePayload | null>(null);
  // 音频：本次录制是否带音轨（决定静音按钮显隐）+ 当前静音状态。
  // 未录音（GIF / 音源关 / 端点不可用）时按钮不出现，避免摆一个点不动的死按钮。
  const [audioOn, setAudioOn] = useState(false);
  const [muted, setMuted] = useState(false);
  // 音量调节：0~200（100=原声）；滑杆展开态
  const [volume, setVolume] = useState(100);
  const [volOpen, setVolOpen] = useState(false);
  const stoppingRef = useRef(false);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 音频引擎在录制线程启动后约 200ms 才设置 AUDIO_STATE；立即查询必然读到
    // "未启用"（静音按钮显隐与实际音轨脱节）。延迟到引擎就绪后再查询
    const t = setTimeout(() => {
      void recorderAudioState()
        .then(([available, m]) => { setAudioOn(available); setMuted(m); })
        .catch(() => setAudioOn(false));
      void recorderAudioVolumeGet()
        .then((v) => setVolume(v))
        .catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);

  useEffect(() => {
    const un1 = listen<{ elapsed_ms: number; frames: number }>(EVT_REC_TICK, (e) => {
      setElapsed(e.payload.elapsed_ms);
    });
    const un2 = listen<RecDonePayload>(EVT_REC_DONE, (e) => {
      // 用户主动取消：不弹通知，直接收掉控制条
      if (e.payload.canceled) {
        void recDismiss().catch(() => {});
        return;
      }
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

  // 暂停/继续：暂停时不采集不写入，计时冻结；继续后视频时间线跳过暂停段
  const togglePause = () => {
    if (phase !== "recording") return;
    const next = !paused;
    setPaused(next);
    void (next ? recorderPause() : recorderResume()).catch(() => {});
  };

  // 静音：写零帧而不是停流，因此音画时间线不中断，取消静音可无缝接回。
  // 以 Rust 返回的真实状态为准（命令失败时回滚本地状态）
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    void recorderAudioMute(next)
      .then((v) => setMuted(v))
      .catch(() => setMuted(!next));
  };

  // 音量：拖动滑杆实时调节（0=无声 100=原声 200=两倍），下一混音周期即生效
  const changeVolume = (v: number) => {
    setVolume(v);
    void recorderAudioVolume(v).catch(() => {});
  };

  // 取消：丢弃本次录制（不保存）
  const cancel = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    void recorderCancel().catch(() => {});
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
    <div className={`recb-root${phase !== "recording" ? " recb-toast" : ""}${paused && phase === "recording" ? " paused" : ""}${phase === "done" || phase === "error" ? " recb-final" : ""}`}>
      {/* 录制中：顶部迷你条（红点 + 时间 + 暂停/停止/取消，全部纯图标 + 悬浮说明）。
          窗口仅 312×36，此前还塞了「REC」与「Esc 停止并保存」兩段文字导致溢出错乱，
          现一律改图标，语义靠 title 与按钮配色表达。 */}
      {phase === "recording" && (
        <>
          <span className={`recb-dot${paused ? " off" : ""}`} />
          <span className="recb-time">{fmt(elapsed)}</span>
          {audioOn && (
            <>
              <button
                className={`recb-btn recb-icon${muted ? " recb-muted" : ""}`}
                onClick={toggleMute}
                title={muted ? "取消静音" : "静音（不中断录制，可随时切回）"}
              >
                {muted ? <MicOff size={12} /> : <Mic size={12} />}
              </button>
              <div className="recb-vol-wrap">
                <button
                  className="recb-btn recb-icon"
                  onClick={() => setVolOpen((o) => !o)}
                  title={`录制音量 ${volume}%（点击调节）`}
                >
                  <Volume2 size={12} />
                </button>
                {volOpen && (
                  <div className="recb-vol-pop">
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={volume}
                      onChange={(e) => changeVolume(Number(e.target.value))}
                      title="0=无声 100=原声 200=两倍"
                    />
                    <span className="recb-vol-val">{volume}%</span>
                  </div>
                )}
              </div>
            </>
          )}
          <button
            className={`recb-btn recb-icon${paused ? " recb-resume" : ""}`}
            onClick={togglePause}
            title={paused ? "继续录制" : "暂停录制"}
          >
            {paused ? <Play size={12} fill="currentColor" stroke="none" /> : <Pause size={12} fill="currentColor" stroke="none" />}
          </button>
          <button
            className="recb-btn recb-icon recb-stop"
            onClick={stop}
            title="停止并保存（Esc）"
          >
            <Square size={10} fill="currentColor" stroke="none" />
          </button>
          <button
            className="recb-btn recb-icon recb-cancel"
            onClick={cancel}
            title="取消录制（不保存）"
          >
            <X size={12} />
          </button>
        </>
      )}

      {/* 停止中：旋转反馈，消除"卡一下"的空窗期 */}
      {phase === "stopping" && (
        <>
          <LoaderCircle size={13} className="recb-spin" />
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
                    return e === "gif" ? "GIF 动图" : "MP4 视频";
                  })()}
                </div>
                <div className="recb-sub">
                  {fmt(result.duration_ms)} · {fmtSize(result.bytes)}
                </div>
              </div>
              <button className="recb-btn recb-icon recb-open" onClick={() => openVideo(result.path!)} title="打开 / 播放">
                <Play size={12} fill="currentColor" stroke="none" />
              </button>
              <button className="recb-btn recb-icon recb-folder" onClick={() => void revealFile(result.path!).catch(() => {})} title="打开所在文件夹">
                <FolderOpen size={12} />
              </button>
            </>
          ) : (
            <span className="recb-err">{result.error ?? "录制失败"}</span>
          )}
          <button className="recb-btn recb-icon recb-close" onClick={dismiss} title="关闭">
            <X size={13} />
          </button>
        </>
      )}
    </div>
  );
}
