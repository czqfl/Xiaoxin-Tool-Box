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

/** 贴图边框随机定格色板（Snipaste 式：贴图瞬间彩闪几下，随后定格其中一色） */
const PIN_ACCENTS = ["#0a84ff", "#ff453a", "#32d74b", "#bf5af2", "#ff9f0a", "#64d2ff"];

export function PinWindow() {
  // 边框主题色：每次贴图从调色板随机取一个——开场彩闪结束后定格于此
  const [accent, setAccent] = useState(() =>
    PIN_ACCENTS[Math.floor(Math.random() * PIN_ACCENTS.length)]);
  const [introDone, setIntroDone] = useState(false);
  // 每张贴图都重放开场彩闪并重摇主题色（staging 复用窗跨多张贴图存活）
  const replayIntro = () => {
    setAccent(PIN_ACCENTS[Math.floor(Math.random() * PIN_ACCENTS.length)]);
    setIntroDone(false);
  };
  const [src, setSrc] = useState<string>("");
  const [opacity, setOpacity] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH] = useState(false);
  const [flipV] = useState(false);
  const [shadow, setShadow] = useState(true);
  const [clickThrough, setClickThrough] = useState(false);
  const [dragging, setDragging] = useState(false);
  // 缩放比例角标（左上角）：滚轮缩放时出现，停止 ~1s 后淡出
  const [zoomLabel, setZoomLabel] = useState<string | null>(null);
  const zoomHideTimer = useRef(0);
  // 图片原始宽度（naturalWidth）：缩放比例 = 当前窗宽 / 原始宽
  const baseWRef = useRef(0);
  const dragStart = useRef<{x:number;y:number;wx:number;wy:number}|null>(null);

  const winLabel = getCurrentWindow().label;
  const isStaging = winLabel === "pin-staging";
  // 贴图 id：常规窗取自 label；复用窗等 assign 事件分配
  const idRef = useRef<string>(isStaging ? "" : winLabel.replace(/^pin-/, ""));
  // 图片加载失败自愈重试：只重试一次（协议偶发抖动），绝不反复刷
  const retriedRef = useRef(false);

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
      replayIntro();
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

  // 缩放角标：显示比例，停止滚动 ~1s 后自动隐藏
  const showZoomBadge = (scale: number) => {
    setZoomLabel(`${Math.round(scale * 100)}%`);
    window.clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = window.setTimeout(() => setZoomLabel(null), 1000);
  };

  // mouse wheel: 普通滚动=缩放；左键按住滚动=透明度 ±5%（范围 5%~100%）
  useEffect(() => {
    const md = (e: MouseEvent) => { if (e.button === 0) btnHeld.current = true; };
    const mu = () => { btnHeld.current = false; };
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const win = getCurrentWindow();
      // Ctrl+滚轮 或 左键按住+滚轮：调透明度 ±5%（范围 5%~100%，Snipaste 同款）
      if ((e.ctrlKey || btnHeld.current) && idRef.current) {
        setOpacity((o) => Math.min(1, Math.max(0.05, +(o - Math.sign(e.deltaY) * 0.05).toFixed(2))));
        debouncePersist();
        return;
      }
      win.outerSize().then((size) => {
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const nw = Math.max(40, Math.round(size.width * factor));
        const nh = Math.max(40, Math.round(size.height * factor));
        win.setSize(new PhysicalSize(nw, nh)).catch(() => {});
        // 左上角实时缩放比例：当前窗宽 / 图片原始宽（未缩放即 100%）
        if (baseWRef.current > 0) showZoomBadge(nw / baseWRef.current);
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
    <div className={`pin-window${shadow ? " pin-shadow" : ""}${dragging ? " pin-dragging" : ""}`}
      style={{ opacity, "--pin-accent": accent } as React.CSSProperties}
      onMouseDown={onMouseDown} onContextMenu={onContext}
      onDoubleClick={() => { if (idRef.current) pinClose(idRef.current).catch(() => {}); }}>
      {src && (
        <img src={src} draggable={false}
          onLoad={(e) => {
            baseWRef.current = (e.target as HTMLImageElement).naturalWidth || 0;
            readyWhenPainted();
          }}
          onError={() => {
            // 加载失败绝不调用 pinReady——那会 show 出一块空白/底色矩形（必闪）。
            // 换查询参数自愈重试一次；staging 仍失败则由 Rust 侧 1.5s 兜底重建
            const id = idRef.current;
            if (!id || retriedRef.current) return;
            retriedRef.current = true;
            const base = pinImageUrl(id);
            setSrc(base + (base.includes("?") ? "&" : "?") + "r=" + Date.now());
          }}
          style={{
            transform: `rotate(${rotation}deg) scaleX(${flipH?-1:1}) scaleY(${flipV?-1:1})`,
            width: "100%", height: "100%", objectFit: "contain",
          }} />
      )}
      {/* Snipaste 式边框：贴图瞬间彩闪几下定格随机主题色；此后悬停/拖动时
          显示主题色、闲置时白色，让贴图边界在任何桌面都清晰可辨 */}
      <div
        className={`pin-border${introDone ? "" : " pin-border-flash"}`}
        onAnimationEnd={() => setIntroDone(true)} />
      {zoomLabel && <div className="pin-zoom-badge">{zoomLabel}</div>}
    </div>
  );
}
