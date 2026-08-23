/** Pin window: always-on-top floating image with zoom/opacity/rotate.
 *  两种形态：常规窗(pin-{id}) 与 复用窗(pin-staging)。
 *  复用窗启动即预建、屏幕外隐藏待命；贴图时由 Rust 经 pin://assign 分配任务，
 *  图片就绪后才显示——免去临时建 WebView2 窗口的数百毫秒开销与闪烁 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import {
  pinImageUrl, pinUpdate, pinClose, pinSetClickThrough, pinCopyImage, pinReady,
} from "../../core/tauri";
import "./pin.css";

export function PinWindow() {
  const [src, setSrc] = useState<string>("");
  const [opacity, setOpacity] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH] = useState(false);
  const [flipV] = useState(false);
  const [shadow, setShadow] = useState(true);
  const [clickThrough, setClickThrough] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{x:number;y:number;wx:number;wy:number}|null>(null);

  const winLabel = getCurrentWindow().label;
  const isStaging = winLabel === "pin-staging";
  // 贴图 id：常规窗取自 label；复用窗等 assign 事件分配
  const idRef = useRef<string>(isStaging ? "" : winLabel.replace(/^pin-/, ""));

  // 常规窗：直接加载图片（自定义协议 GET /pin/{id} 文件字节直出，
  // WebView2 原生读盘+解码，取代旧 base64 data URL 的数秒等待）
  useEffect(() => {
    if (!isStaging && winLabel.startsWith("pin-") && idRef.current) {
      setSrc(pinImageUrl(idRef.current));
    }
  }, []);

  // 复用窗：等待 Rust 分配贴图任务，领到后立即加载
  useEffect(() => {
    if (!isStaging) return;
    let un: (() => void) | undefined;
    void listen<{ id: string }>("pin://assign", (e) => {
      idRef.current = e.payload.id;
      setSrc(pinImageUrl(e.payload.id));
    }).then((f) => { un = f; });
    return () => { un?.(); };
  }, [isStaging]);

  // 持久化：每渲染刷新闭包（旧版一次性 ref 会把过期状态写回覆盖用户调整）
  const persistNowRef = useRef(async () => {});
  persistNowRef.current = async () => {
    const id = idRef.current;
    if (!id) return;
    const win = getCurrentWindow();
    try {
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      await pinUpdate(id, {
        x: pos.x, y: pos.y, width: size.width, height: size.height,
        opacity, rotation, flip_h: flipH, flip_v: flipV, shadow, click_through: clickThrough,
      });
    } catch {}
  };
  const zoomTimer = useRef<number>(0);
  const debouncePersist = () => {
    window.clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => { void persistNowRef.current(); }, 400);
  };

  // 左键按住状态：左键+滚轮 = 调透明度（Snipaste 同款交互）
  const btnHeld = useRef(false);

  // mouse wheel: 普通滚动=缩放；左键按住滚动=透明度 ±5%（范围 5%~100%）
  useEffect(() => {
    const md = (e: MouseEvent) => { if (e.button === 0) btnHeld.current = true; };
    const mu = () => { btnHeld.current = false; };
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const win = getCurrentWindow();
      if (btnHeld.current && idRef.current) {
        setOpacity((o) => Math.min(1, Math.max(0.05, +(o - Math.sign(e.deltaY) * 0.05).toFixed(2))));
        debouncePersist();
        return;
      }
      win.outerSize().then((size) => {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const nw = Math.max(40, Math.round(size.width * factor));
        const nh = Math.max(40, Math.round(size.height * factor));
        win.setSize(new PhysicalSize(nw, nh)).catch(() => {});
        debouncePersist();
      });
    };
    window.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    window.addEventListener("wheel", h, { passive: false });
    return () => {
      window.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("wheel", h);
    };
  }, []);

  // 热键整体显示贴图时自动解除鼠标穿透：穿透中的 webview 收不到任何
  // 事件、无法自救，由本监听代劳（Rust 侧显隐已精简为纯 show/hide）
  const clickThroughRef = useRef(clickThrough);
  clickThroughRef.current = clickThrough;
  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<boolean>("pin://visibility-changed", (e) => {
      if (e.payload === true && clickThroughRef.current && idRef.current) {
        setClickThrough(false);
        pinSetClickThrough(false).catch(() => {});
        void persistNowRef.current();
      }
    }).then((f) => { un = f; });
    return () => { un?.(); };
  }, []);

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!idRef.current) return;
      if (e.key === "Delete" || e.key === "Escape") {
        pinClose(idRef.current).catch(() => {});
      } else if (e.key === "r" && e.ctrlKey) {
        setRotation((r) => (r + 90) % 360);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // drag
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !idRef.current) return;
    getCurrentWindow().outerPosition().then((pos) => {
      dragStart.current = { x: e.screenX, y: e.screenY, wx: pos.x, wy: pos.y };
      setDragging(true);
    });
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const d = dragStart.current;
      const nx = d.wx + (e.screenX - d.x);
      const ny = d.wy + (e.screenY - d.y);
      getCurrentWindow().setPosition(new PhysicalPosition(nx, ny)).catch(() => {});
    };
    const onUp = () => {
      setDragging(false);
      dragStart.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  // persist position on move end
  useEffect(() => {
    const h = () => { void persistNowRef.current(); };
    window.addEventListener("mouseup", h);
    return () => window.removeEventListener("mouseup", h);
  }, []);

  // context menu
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const id = idRef.current;
    if (!id) return;
    const actions = [
      { label: "复制到剪贴板", action: () => pinCopyImage(id).catch(() => {}) },
      { label: shadow ? "关闭阴影" : "开启阴影", action: () => setShadow(!shadow) },
      { label: clickThrough ? "取消鼠标穿透" : "开启鼠标穿透",
        action: () => pinSetClickThrough(!clickThrough).then(() => setClickThrough(!clickThrough)).catch(() => {}) },
      { label: "关闭此贴图", action: () => pinClose(id).catch(() => {}) },
    ];
    const menu = document.createElement("div");
    menu.className = "pin-ctx-menu";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    for (const a of actions) {
      const btn = document.createElement("div");
      btn.className = "pin-ctx-item";
      btn.textContent = a.label;
      btn.onclick = () => { a.action(); menu.remove(); };
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    const close = () => { menu.remove(); document.removeEventListener("click", close); };
    setTimeout(() => document.addEventListener("click", close), 0);
  };

  // 图片解码完成后等两帧再亮窗：img.onload 只代表解码入队，
  // 首次合成可能晚一拍，立即 show 会闪一帧透明/空窗
  const readyWhenPainted = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => { void pinReady().catch(() => {}); }));

  return (
    <div className={`pin-window${shadow ? " pin-shadow" : ""}`} style={{ opacity }}
      onMouseDown={onMouseDown} onContextMenu={onContext}
      onDoubleClick={() => { if (idRef.current) pinClose(idRef.current).catch(() => {}); }}>
      {src && (
        <img src={src} draggable={false}
          onLoad={readyWhenPainted}
          onError={readyWhenPainted}
          style={{
            transform: `rotate(${rotation}deg) scaleX(${flipH?-1:1}) scaleY(${flipV?-1:1})`,
            width: "100%", height: "100%", objectFit: "contain",
          }} />
      )}
    </div>
  );
}
