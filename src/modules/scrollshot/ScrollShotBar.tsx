import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { Square, FolderOpen, X, Loader2, Image as ImageIcon, Ban } from "lucide-react";
import {
  EVT_SCROLLSHOT_PROGRESS, EVT_SCROLLSHOT_DONE, EVT_BAR_RESET,
  scrollStop, scrollCancel, scrollDismiss, revealFile, scrollSaveAs,
  type ScrollDonePayload,
} from "./api";
import "./scrollshot.css";

type Phase = "running" | "encoding" | "done" | "error";

export function ScrollShotBar() {
  const [phase, setPhase] = useState<Phase>("running");
  const [height, setHeight] = useState(0);
  const [result, setResult] = useState<ScrollDonePayload | null>(null);
  const stoppingRef = useRef(false);

  useEffect(() => {
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
      setPhase("running");
    });
    return () => {
      void un1.then((u) => u());
      void un2.then((u) => u());
      void un3.then((u) => u());
    };
  }, []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "running") cancelToShot();
        else dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function dismiss() { void scrollDismiss().catch(() => {}); }

  const saveAs = async () => {
    if (!result?.path) return;
    const picked = await save({
      defaultPath: result.path.split(/[\\/]/).pop() || "长截图.png",
      filters: [{ name: "PNG 图片", extensions: ["png"] }],
    });
    if (!picked) return;
    await scrollSaveAs(result.path, picked);
    void revealFile(picked).catch(() => {});
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
                <button className="ssb-btn ssb-stop" onClick={stop} title="保存并贴到桌面">
                  <Square size={10} fill="currentColor" /> 完成
                </button>
                <button className="ssb-btn ssb-cancel" onClick={cancelToShot} title="取消并回到截图 (Esc)">
                  <Ban size={11} /> 取消
                </button>
              </>
            )}
          </div>
          <div className="ssb-tip">自行滚动页面内容，边框内为捕获范围；Esc 取消退出</div>
        </>
      )}

      {phase === "done" && result?.path && (
        <div className="ssb-head">
          <span className="ssb-dot ok" />
          <span className="ssb-title">已保存（{Math.round(result.height)} px）并贴到桌面</span>
          <span className="ssb-flex" />
          <button className="ssb-btn" onClick={() => void revealFile(result.path!).catch(() => {})} title="打开位置">
            <FolderOpen size={12} />
          </button>
          <button className="ssb-btn" onClick={() => void saveAs().catch(() => {})} title="另存为…">
            <ImageIcon size={12} />
          </button>
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
