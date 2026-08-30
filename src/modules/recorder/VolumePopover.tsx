/** 录制条音量面板（独立浮窗 label=rec-vol）。
 *
 *  【为什么必须独立成窗】录制条窗口只有 36px 高，且用户明确不要"撑高整个
 *  进度栏"——竖条音量面板只能放不下，必须独立小窗悬浮在按钮下方。
 *
 *  【定位归录制条管】窗口位置由 RecorderBar 在每次打开时按【物理像素】算好
 *  并 setPosition/setSize，本组件不做任何定位——尤其不能读 URL 参数定位：
 *  复用窗口在 DEV 下 show 会整页重载，重载后若再用旧 URL 参数 setPosition，
 *  会把录制条刚设好的正确位置覆盖掉（"音量条错位"根因）。
 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, emitTo } from "@tauri-apps/api/event";
import { recorderAudioVolume, recorderAudioVolumeGet } from "./api";
import "./volume-popover.css";

const MAX = 200;

export function VolumePopover() {
  const [volume, setVolume] = useState(100);
  const draggingRef = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.window = "panel";

    // 音量锚在 Rust 侧，进来先读一次，避免显示 100% 而实际是别的值
    void recorderAudioVolumeGet()
      .then((v) => setVolume(v))
      .catch(() => {});
  }, []);

  // 失焦 / Esc / 录制条再次点击音量按钮 → 收起。
  // 一律走 hide 而非 close：重建 WebView2 窗口要几百毫秒，复用才有瞬时手感。
  useEffect(() => {
    const hide = () => {
      void emitTo("rec-bar", "rec-vol-closed", {}).catch(() => {});
      void getCurrentWindow().hide().catch(() => {});
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); hide(); }
    };
    let un: (() => void) | undefined;
    void listen("rec-vol-hide", () => hide()).then((f) => { un = f; });
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      un?.();
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const commit = (v: number) => {
    const clamped = Math.min(MAX, Math.max(0, Math.round(v)));
    setVolume(clamped);
    void recorderAudioVolume(clamped).catch(() => {});
  };

  const calcFromClientY = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (rect.bottom - clientY) / rect.height));
    commit(ratio * MAX);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    trackRef.current?.setPointerCapture(e.pointerId);
    calcFromClientY(e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    calcFromClientY(e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    trackRef.current?.releasePointerCapture(e.pointerId);
  };

  const pct = Math.round((volume / MAX) * 100);

  return (
    <div className="volp-root">
      <div
        className="volp-track-area"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        title="向上拖动增大，向下拖动减小（0=无声，100=原声，200=两倍）"
      >
        <div className="volp-line">
          <div className="volp-fill" style={{ height: `${pct}%` }} />
          <div className="volp-thumb" style={{ bottom: `${pct}%` }} />
        </div>
      </div>
      <span className="volp-val">{volume}%</span>
    </div>
  );
}
