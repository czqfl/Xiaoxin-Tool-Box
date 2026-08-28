import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Square, Play, X, Loader2, Ban } from "lucide-react";
import {
  EVT_SCROLLSHOT_PROGRESS, EVT_SCROLLSHOT_DONE, EVT_BAR_RESET,
  scrollStop, scrollCancel, scrollDismiss, scrollStartScroll,
  scrollSetSpeed, scrollGetSpeed,
  type ScrollDonePayload,
} from "./api";
import "./scrollshot.css";

type Phase = "running" | "encoding" | "done" | "error";

export function ScrollShotBar() {
  const [phase, setPhase] = useState<Phase>("running");
  // 自动滚动是否已开始：进入长截图先待命，空格/「开始」才启动
  const [scrolling, setScrolling] = useState(false);
  const [height, setHeight] = useState(0);
  const [result, setResult] = useState<ScrollDonePayload | null>(null);
  // 自动滚动速度档位（1..=10）：进度条上实时可调，滚动线程每步读取
  const [speed, setSpeed] = useState(5);
  const stoppingRef = useRef(false);

  useEffect(() => {
    void scrollGetSpeed().then((v) => setSpeed(v)).catch(() => {});
    const un1 = listen<{ height: number }>(EVT_SCROLLSHOT_PROGRESS, (e) => {
      setHeight(e.payload.height);
    });
    const un2 = listen<ScrollDonePayload>(EVT_SCROLLSHOT_DONE, (e) => {
      setResult(e.payload);
      if (e.payload.ok) setPhase("done");
      else if (e.payload.error === "已取消") dismiss();
      else setPhase("error");
    });
    // 窗口复用：每次呼出清掉上一次会话的残留状态
    const un3 = listen(EVT_BAR_RESET, () => {
      stoppingRef.current = false;
      setHeight(0);
      setResult(null);
      setScrolling(false);
      setPhase("running");
    });
    return () => {
      void un1.then((u) => u());
      void un2.then((u) => u());
      void un3.then((u) => u());
    };
  }, []);

  // 自动关闭计时器：done/error 状态停留 ~2.5s 后自动收起进度条
  const autoCloseRef = useRef(0);
  useEffect(() => {
    if (phase !== "done" && phase !== "error") return;
    window.clearTimeout(autoCloseRef.current);
    autoCloseRef.current = window.setTimeout(dismiss, 2500);
    return () => window.clearTimeout(autoCloseRef.current);
  }, [phase]);

  const stop = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setPhase("encoding");
    void scrollStop().catch(() => {});
  };

  /** Esc / 取消：退出长截图模式，不保存；是否再截图由用户自己决定 */
  const cancelToShot = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    void scrollCancel().catch(() => {});
  };

  /** 空格 / 开始：启动自动滚动 */
  const beginScroll = () => {
    if (stoppingRef.current) return;
    setScrolling(true);
    void scrollStartScroll().catch(() => setScrolling(false));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "running") cancelToShot();
        else dismiss();
      } else if (e.key === " " && phase === "running" && !stoppingRef.current) {
        // 空格 = 开始滚动；再次按 = 结束（保存并贴图）
        e.preventDefault();
        if (!scrolling) beginScroll();
        else stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, scrolling]);

  function dismiss() { void scrollDismiss().catch(() => {}); }

  const changeSpeed = (v: number) => {
    setSpeed(v);
    void scrollSetSpeed(v).catch(() => {});
  };

  return (
    <div className="ssb-root">
      {(phase === "running" || phase === "encoding") && (
        <>
          <div className="ssb-head">
            <span className="ssb-dot" />
            <span className="ssb-title">滚动长截图</span>
            {phase === "running" ? (
              <span className="ssb-status">已捕获 <b>{Math.round(height)}</b> px</span>
            ) : (
              <span className="ssb-status"><Loader2 size={12} className="ssb-spin" /> 正在生成…</span>
            )}
            <span className="ssb-flex" />
            {phase === "running" && (
              <>
                {!scrolling ? (
                  <button className="ssb-btn ssb-go" onClick={beginScroll} title="开始自动滚动 (空格)">
                    <Play size={10} fill="currentColor" /> 开始
                  </button>
                ) : (
                  <button className="ssb-btn ssb-stop" onClick={stop} title="结束并保存贴到桌面 (空格)">
                    <Square size={10} fill="currentColor" /> 结束
                  </button>
                )}
                <button className="ssb-btn ssb-cancel" onClick={cancelToShot} title="取消并回到截图 (Esc)">
                  <Ban size={11} /> 取消
                </button>
              </>
            )}
          </div>
          <div className="ssb-tip">
            <span>{!scrolling
              ? "把鼠标放在要滚动的页面内，按 空格 或点「开始」；Esc 取消退出"
              : "滚轮跟随鼠标（保持在页面内即滚动），按 空格 或「结束」完成拼接"}</span>
            <span className="ssb-flex" />
            <span className="ssb-speed" title="每档 = 每步滚动 40px">
              步高
              <input type="range" min={1} max={10} step={1} value={speed}
                onChange={(e) => changeSpeed(+e.target.value)} />
              <b>{speed * 40}px</b>
            </span>
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="ssb-head">
          <span className="ssb-dot ok" />
          <span className="ssb-title">完成（{Math.round(result?.height ?? height)} px）已贴到桌面</span>
          <span className="ssb-flex" />
          <button className="ssb-btn" onClick={dismiss} title="关闭"><X size={12} /></button>
        </div>
      )}

      {phase === "error" && (
        <div className="ssb-head">
          <span className="ssb-dot err" />
          <span className="ssb-status ssb-err">{result?.error ?? "失败"}</span>
          <span className="ssb-flex" />
          <button className="ssb-btn" onClick={dismiss} title="关闭"><X size={12} /></button>
        </div>
      )}
    </div>
  );
}
