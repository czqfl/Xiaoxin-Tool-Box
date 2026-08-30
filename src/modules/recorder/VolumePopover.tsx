/** 录制条音量面板（独立浮窗 label=rec-vol）。
 *
 *  【为什么必须独立成窗】录制条窗口只有 36px 高，而 WebView 会裁掉一切超出
 *  窗口边界的内容——竖条音量面板放不进去。早期尝试"临时把录制条窗口撑高"，
 *  副作用是窗口的亚克力层跟着铺满新增区域，视觉上变成一整块大白框，与
 *  "只在音量按钮下方浮出一个小竖条"相去甚远。独立透明小窗则完全不动录制条：
 *  它保持 36px 的条状外观，面板悬在按钮下方，各自管各自的背景。
 *
 *  数据只需单向流通：音量真实值存在 Rust 侧，本窗挂载时读一次、拖动时写回，
 *  因此不必与录制条同步数值（录制条会在本窗关闭时重读一次刷新自己的提示）。
 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
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

    // 定位到录制条音量按钮正下方（坐标由录制条按按钮屏幕位置算好后传入）
    const place = async () => {
      try {
        const p = new URLSearchParams(window.location.search);
        const x = Number(p.get("x") ?? 0);
        const y = Number(p.get("y") ?? 0);
        const win = getCurrentWindow();
        await win.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
        await win.show();
        await win.setFocus();
      } catch { /* 定位失败也要显示，否则等于点了没反应 */ }
    };
    void place();
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
        <div className="volp-track">
          <div className="volp-fill" style={{ height: `${pct}%` }} />
          <div className="volp-thumb" style={{ bottom: `${pct}%` }} />
        </div>
      </div>
      <span className="volp-val">{volume}%</span>
    </div>
  );
}
