import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { scrollFrameRect, type FrameInfo } from "./api";

/** 长截图边框指示窗：全屏覆盖所在显示器、鼠标穿透、采集排除（Rust 侧
 *  WDA_EXCLUDEFROMCAPTURE）。只画区域外侧的细边框条，提示用户正在捕获的范围；
 *  窗口本体拍不进长图，区域内侧零遮挡。 */
export function ScrollShotFrame() {
  const [info, setInfo] = useState<FrameInfo | null>(null);

  useEffect(() => {
    const query = () => {
      void scrollFrameRect().then((v) => { if (v) setInfo(v); }).catch(() => {});
    };
    let tries = 0;
    // 页面可能先于 Rust 设置几何加载：短暂重试直到拿到
    const poll = () => {
      void scrollFrameRect().then((v) => {
        if (v) setInfo(v);
        else if (++tries < 40) window.setTimeout(poll, 100);
      }).catch(() => {});
    };
    poll();
    // 复用窗：几何更新时重查
    const un = listen("scrollshot://frame-move", query);
    return () => { void un.then((f) => f()); };
  }, []);

  const dpr = window.devicePixelRatio || 1;
  const B = 3; // 边框条粗细（CSS px）
  let strips: Array<React.CSSProperties> = [];
  if (info) {
    const [wx, wy] = info.win;
    const [rx, ry, rw, rh] = info.region;
    // 区域相对窗口原点的 CSS 坐标
    const x = (rx - wx) / dpr;
    const y = (ry - wy) / dpr;
    const w = rw / dpr;
    const h = rh / dpr;
    strips = [
      { left: x - B - 1, top: y - B - 1, width: w + 2 * B + 2, height: B },          // 上
      { left: x - B - 1, top: y + h + 1, width: w + 2 * B + 2, height: B },          // 下
      { left: x - B - 1, top: y - B - 1, width: B, height: h + 2 * B + 2 },          // 左
      { left: x + w + 1, top: y - B - 1, width: B, height: h + 2 * B + 2 },          // 右
    ];
  }

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
      {strips.map((s, i) => (
        <div key={i} style={{
          position: "absolute",
          ...s,
          background: "rgba(var(--accent-rgb), 0.9)",
          boxShadow: "0 0 6px rgba(var(--accent-rgb), 0.8)",
          borderRadius: 1,
        }} />
      ))}
    </div>
  );
}
