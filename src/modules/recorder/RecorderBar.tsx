import { useEffect, useRef, useState } from "react";
import { listen, emitTo } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { Square, Film, FolderOpen, X, Pause, Play, LoaderCircle, Mic, MicOff, Volume2 } from "lucide-react";
import {
  EVT_REC_TICK, EVT_REC_DONE,
  recorderStop, recorderPause, recorderResume, recorderCancel,
  recDismiss, revealFile, recorderAudioRec, recorderAudioState, recorderAudioVolumeGet,
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

// 音量浮窗（独立小窗 rec-vol）尺寸，必须与 volume-popover.css 的内容盒一致：
// 宽 = 数值 40 + 两侧余量；高 = 12 + 滑杆 64 + 8 + 数值 11 + 12
const VOLP_W = 56;
const VOLP_H = 112;

export function RecorderBar() {
  const [phase, setPhase] = useState<Phase>("recording");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<RecDonePayload | null>(null);
  // 录音：本次录制是否【支持】录音（决定按钮显隐）+ 当前是否正在录音。
  // 显隐只看格式（MP4 即支持），与启动时音源是否为 off 无关——MP4 一律预留
  // 音轨，音源 off 只是开局不采集，用户仍可在录制条上随时开录。
  const [recSupported, setRecSupported] = useState(false);
  const [recOn, setRecOn] = useState(false);
  // 开启失败时的短提示（无可用音频设备等），避免按钮点了没反应像坏了
  const [recErr, setRecErr] = useState("");
  // 音量调节：0~200（100=原声）；滑杆展开态
  const [volume, setVolume] = useState(100);
  const [volOpen, setVolOpen] = useState(false);
  const stoppingRef = useRef(false);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 录制线程起来后才会置「支持录音」标志（MP4 即 true）。立即查询必然读到
    // false，按钮就永远不出现——这正是上一版"加了按钮却看不到"的原因之一。
    // 延迟到录制线程就绪后再查一次；MP4 标志在录制线程开头即写，无需等太长。
    const t = setTimeout(() => {
      void recorderAudioState()
        .then(([available, on]) => { setRecSupported(available); setRecOn(on); })
        .catch(() => setRecSupported(false));
      void recorderAudioVolumeGet()
        .then((v) => setVolume(v))
        .catch(() => {});
    }, 500);
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
    // 停止/完成后收起音量面板：下面紧接着要把窗口缩成右下角通知卡尺寸，
    // 面板若还开着会跟着被压扁、露出半截
    setVolOpen(false);
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

  // 音量面板是【独立浮窗】（rec-vol），录制条本身始终保持 36px 的条状外观。
  // 曾试过临时撑高录制条窗口来塞下竖条，结果窗口的亚克力层跟着铺满新增区域，
  // 变成一整块大白框——亚克力是窗口级效果，撑高多少就铺多少，压不住。
  // 独立小窗则两边互不干扰：录制条还是那条，面板悬在按钮下方。
  const volBtnRef = useRef<HTMLButtonElement>(null);
  const closeVolPop = () => {
    if (!volOpen) return;
    setVolOpen(false);
    void emitTo("rec-vol", "rec-vol-hide", {}).catch(() => {});
  };
  const openVolPop = async () => {
    // 音量按钮的屏幕逻辑坐标：窗口物理位置 ÷ DPR + 按钮在视口内的偏移
    const btn = volBtnRef.current;
    if (!btn) return;
    let x = 0;
    let y = 0;
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const dpr = window.devicePixelRatio || 1;
      const r = btn.getBoundingClientRect();
      x = pos.x / dpr + r.left + r.width / 2 - VOLP_W / 2;
      y = pos.y / dpr + r.bottom + 6;
    } catch { /* 取不到窗口位置就退回按钮视口坐标，仍可显示 */ }
    setVolOpen(true);
    const params = new URLSearchParams({
      x: String(Math.round(x)),
      y: String(Math.round(y)),
    });
    // 复用单例：重建 WebView2 窗口要几百毫秒，第二次起必须瞬时
    const existing = await WebviewWindow.getByLabel("rec-vol").catch(() => null);
    if (existing) {
      void existing
        .setPosition(new LogicalPosition(Math.round(x), Math.round(y)))
        .then(() => existing.show())
        .then(() => existing.setFocus())
        .catch(() => {});
      return;
    }
    try {
      new WebviewWindow("rec-vol", {
        url: `index.html?${params.toString()}`,
        width: VOLP_W,
        height: VOLP_H,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        focus: true,
        resizable: false,
        shadow: false,
        visible: false,
        skipTaskbar: true,
      });
    } catch { /* 建窗失败静默 */ }
  };

  // 面板侧失焦 / Esc 都会发这个事件回来，据此让按钮状态与面板保持一致
  useEffect(() => {
    let un: (() => void) | undefined;
    void listen("rec-vol-closed", () => {
      setVolOpen(false);
      // 面板里可能改过音量，收起后重读一次刷新按钮提示
      void recorderAudioVolumeGet().then(setVolume).catch(() => {});
    }).then((f) => { un = f; });
    return () => { un?.(); };
  }, []);

  // 关闭录音 / 停止录制时收起面板：按钮都消失了，面板不该还挂着
  useEffect(() => {
    if (!volOpen) return;
    if (!recOn || phase !== "recording") closeVolPop();
  }, [recOn, phase, volOpen]);

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

  // 录音开关：开=按需启动采集并混入真实音频；关=停采集，音轨继续写零帧，
  // 因此音画时间线不中断，重新开启能无缝接回。
  // 以 Rust 返回的真实状态为准——设备不可用时命令返回 false，回滚并提示，
  // 绝不留下"看着开着实际没录"的假象
  const toggleRec = () => {
    const next = !recOn;
    setRecOn(next);
    setRecErr("");
    void recorderAudioRec(next)
      .then((v) => {
        if (v === next) return;
        setRecOn(v);
        if (next) setRecErr("无音频设备");
      })
      .catch(() => {
        setRecOn(!next);
        setRecErr("切换失败");
      });
  };

  // 失败提示自动消失（录制条只有 36px 高，不长期占位）
  useEffect(() => {
    if (!recErr) return;
    const t = setTimeout(() => setRecErr(""), 2400);
    return () => clearTimeout(t);
  }, [recErr]);

  // 音量的写入已移到独立浮窗 VolumePopover 内（那边拖动直接调命令），
  // 这里只保留读取：用于按钮提示文案，以及面板收起后刷新一次

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
        // 面板开着时 Esc 先收面板：否则调个音量顺手按 Esc，会把整段录制结束掉
        if (volOpen) { closeVolPop(); return; }
        if (phase === "recording") stop();
        else void recDismiss().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, volOpen]);

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
          {recSupported && (
            <>
              <button
                className={`recb-btn recb-icon${recOn ? " recb-rec-on" : " recb-rec-off"}`}
                onClick={toggleRec}
                title={recOn ? "关闭录音（音轨保留，可随时重开）" : "开启录音（录制中随时可开）"}
              >
                {recOn ? <Mic size={12} /> : <MicOff size={12} />}
              </button>
              {/* 切换失败提示：内联在录音按钮旁。录制条窗口仅 36px 高，窗口外
                  放气泡会被裁掉，只能内联；文案刻意极短以省下横向空间 */}
              {recErr && <span className="recb-rec-tip">{recErr}</span>}
              {/* 音量只在录音开启时才有意义（没在收声调它没效果）。点击拉起独立
                  浮窗 rec-vol：录制条只有 36px 高，竖条根本塞不进来 */}
              {recOn && (
                <button
                  ref={volBtnRef}
                  className={`recb-btn recb-icon${volOpen ? " recb-vol-on" : ""}`}
                  onClick={() => { if (volOpen) closeVolPop(); else void openVolPop(); }}
                  title={`录制音量 ${volume}%（点击调节）`}
                >
                  <Volume2 size={12} />
                </button>
              )}
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
