/** Pin window: always-on-top floating image with zoom/opacity/rotate.
 *  两种形态：常规窗(pin-{id}) 与 复用窗(pin-staging)。
 *  复用窗启动即预建、屏幕外隐藏待命；贴图时由 Rust 经 pin://assign 分配任务，
 *  图片就绪后才显示——免去临时建 WebView2 窗口的数百毫秒开销与闪烁 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import {
  pinImageUrl, pinUpdate, pinClose, pinSetClickThrough, pinCopyImage, pinReady, pinHideOne, pinResize, pinKind, diagLog,
} from "../../core/tauri";
import "./pin.css";

/** 贴图边框随机定格色板（Snipaste 式：贴图瞬间彩闪几下，随后定格其中一色） */
const PIN_ACCENTS = ["#0a84ff", "#ff453a", "#32d74b", "#bf5af2", "#ff9f0a", "#64d2ff"];

/** 贴图窗四周透明边距（【物理像素】，与 Rust 端 PIN_MARGIN 严格一致）。
 *  窗口比图片四周各大 12px：CSS 边框贴图片边缘画，向外泛光落在边距里。
 *  旧版窗口=图片尺寸时，box-shadow 光晕整个落在客户区外被裁掉，
 *  且高 DPI 下逻辑视口舍入会裁掉最右/最下一行——"缩放后边框消失"的根因 */
const PIN_MARGIN = 12;
/** CSS 像素边距：物理边距 ÷ 当前 DPI 缩放 */
const pinMarginCss = () => PIN_MARGIN / (window.devicePixelRatio || 1);

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
      tAssignRef.current = Date.now();
      // 新贴图由 Rust 重设了窗口尺寸：作废旧缓存，下次滚轮重新拉取
      sizeRef.current = null;
      htmlSizedRef.current = false;
      // 自愈重试额度按贴图重置（复用窗跨多张贴图存活，不复位会导致
      // 第一张失败后所有后续贴图永远失去重试机会）
      retriedRef.current = false;
      setHtml(null);
      setKind("image");
      setSrc(pinImageUrl(e.payload.id));
    }).then((f) => { un = f; });
    return () => { un?.(); };
  }, [isStaging]);

  // ---- HTML 贴图（剪贴板富文本/纯文本）----
  // 【不能用 src 后缀判断】协议 URL /pin/{id} 不带扩展名——旧版
  // src.endsWith(".html") 永远判不中，HTML 贴图整条链路失效（前端永不调
  // pinReady → Rust 1.5s 兜底重建 → 表现为"贴图极慢/卡"）。
  // 现经 pin_kind 查询内容类型：html 拉取文本渲染（保留剪贴板内联样式），
  // 量完实际尺寸回填窗口再亮窗；image 走 <img> 原路
  const [kind, setKind] = useState<"image" | "html">("image");
  const [html, setHtml] = useState<string | null>(null);
  const htmlWrapRef = useRef<HTMLDivElement | null>(null);
  const htmlRef = useRef<HTMLDivElement | null>(null);
  // HTML 自然尺寸（首次渲染量出）：滚轮缩放窗口时按 窗口宽/自然宽 比例
  // transform:scale 内容——文字贴图缩放必须像图片一样整体跟随边框
  const htmlNatRef = useRef<{ w: number; h: number } | null>(null);
  const htmlSizedRef = useRef(false);
  const tAssignRef = useRef(0);
  useEffect(() => {
    if (!idRef.current || !src) return;
    let alive = true;
    pinKind(idRef.current).then((k) => { if (alive) setKind(k); }).catch(() => {});
    return () => { alive = false; };
  }, [src]);
  useEffect(() => {
    if (kind !== "html" || !src) { setHtml(null); return; }
    let alive = true;
    fetch(src).then((r) => r.text()).then((t) => { if (alive) setHtml(t); }).catch(() => {});
    return () => { alive = false; };
  }, [kind, src]);
  useEffect(() => {
    if (html === null || !idRef.current || htmlSizedRef.current) return;
    const el = htmlRef.current;
    if (!el) return;
    htmlSizedRef.current = true;
    const natW = el.offsetWidth, natH = el.offsetHeight;
    htmlNatRef.current = { w: natW, h: natH };
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(40, Math.min(4000, Math.round(natW * dpr)));
    const h = Math.max(40, Math.min(6000, Math.round(natH * dpr)));
    void pinResize(idRef.current, w, h).then(() => {
      diagLog(`[pin] html sized ${w}x${h} +${Date.now() - tAssignRef.current}ms, ready`);
      readyWhenPainted(null);
      applyHtmlScale();
    }).catch(() => {});
  }, [html]);

  /** 按当前窗口内容宽 / HTML 自然宽 计算 scale 并直改 DOM。
   *  监听 webview resize（滚轮 setSize 会触发）：贴图放大缩小，
   *  文字/富文本与图片一样整体跟随边框变化 */
  const applyHtmlScale = () => {
    const wrap = htmlWrapRef.current, inner = htmlRef.current;
    const nat = htmlNatRef.current;
    if (!wrap || !inner || !nat || nat.w < 1) return;
    const availW = Math.max(1, wrap.clientWidth);
    const k = availW / nat.w;
    inner.style.transformOrigin = "0 0";
    inner.style.transform = `scale(${k})`;
    wrap.style.height = `${Math.round(nat.h * k)}px`;
  };
  useEffect(() => {
    if (kind !== "html") return;
    window.addEventListener("resize", applyHtmlScale);
    return () => window.removeEventListener("resize", applyHtmlScale);
  }, [kind]);

  // 持久化：每渲染刷新闭包（旧版一次性 ref 会把过期状态写回覆盖用户调整）
  const persistNowRef = useRef(async () => {});
  persistNowRef.current = async () => {
    const id = idRef.current;
    if (!id) return;
    const win = getCurrentWindow();
    try {
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      // 持久化的是【图片区域】几何：窗口坐标/尺寸扣掉四周透明边距，
      // 与 Rust 端约定一致（落窗时由 Rust 加回），恢复/缩放比例才不会漂移
      const m = PIN_MARGIN;
      await pinUpdate(id, {
        x: pos.x + m, y: pos.y + m,
        width: Math.max(1, size.width - m * 2), height: Math.max(1, size.height - m * 2),
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
  // opacity 镜像：滚轮 effect 只挂载一次，经此读取最新值
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  // 角标：缩放比例 / 透明度 / 操作提示（左上角），默认 ~1s 后自动隐藏
  const showBadge = (text: string, ms = 1000) => {
    setZoomLabel(text);
    window.clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = window.setTimeout(() => setZoomLabel(null), ms);
  };

  // ---- 滚轮缩放的尺寸缓存与 rAF 合并 ----
  // 【为什么不能逐事件 outerSize()】每次滚轮都异步查窗口尺寸再 setSize，
  // 连续滚动时多个在途 IPC 返回的"过期尺寸"互相覆盖 → 窗口忽大忽小闪烁。
  // 缓存当前尺寸后同步累乘，rAF 把同帧内多次滚动合并成一次 setSize
  const sizeRef = useRef<{ w: number; h: number } | null>(null);
  const pendingSizeRef = useRef<{ w: number; h: number } | null>(null);
  const zoomRafRef = useRef(0);

  // mouse wheel: 普通滚动=缩放；左键按住滚动=透明度 ±5%（范围 5%~100%）
  useEffect(() => {
    const md = (e: MouseEvent) => { if (e.button === 0) btnHeld.current = true; };
    const mu = () => { btnHeld.current = false; };
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const win = getCurrentWindow();
      // Ctrl+滚轮 或 左键按住+滚轮：调透明度 ±5%（范围 5%~100%，Snipaste 同款），
      // 左上角角标实时提示当前透明度
      if ((e.ctrlKey || btnHeld.current) && idRef.current) {
        const nv = Math.min(1, Math.max(0.05, +(opacityRef.current - Math.sign(e.deltaY) * 0.05).toFixed(2)));
        setOpacity(nv);
        showBadge(`透明度 ${Math.round(nv * 100)}%`);
        debouncePersist();
        return;
      }
      let base = sizeRef.current;
      if (!base) {
        // 首次滚动：拉一次当前窗口尺寸建立缓存（此后全部同步计算）。
        // 缓存与缩放计算都用【图片区域】尺寸（窗口扣掉四周透明边距），
        // 落窗 setSize 时再加回边距
        void win.outerSize().then((s) => {
          sizeRef.current = { w: Math.max(40, s.width - PIN_MARGIN * 2), h: Math.max(40, s.height - PIN_MARGIN * 2) };
        }).catch(() => {});
        return;
      }
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const nw = Math.max(40, Math.round(base.w * factor));
      const nh = Math.max(40, Math.round(base.h * factor));
      sizeRef.current = { w: nw, h: nh };
      // 窗口尺寸 = 图片尺寸 + 四周透明边距（Rust 端同款约定）
      pendingSizeRef.current = { w: nw + PIN_MARGIN * 2, h: nh + PIN_MARGIN * 2 };
      if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = 0;
          const p = pendingSizeRef.current;
          if (p) getCurrentWindow().setSize(new PhysicalSize(p.w, p.h)).catch(() => {});
        });
      }
      // 左上角实时缩放比例：当前窗宽 / 图片原始宽（未缩放即 100%）
      if (baseWRef.current > 0) showBadge(`${Math.round((nw / baseWRef.current) * 100)}%`);
      debouncePersist();
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
      // Delete=彻底删除；Esc=仅隐藏（贴图热键可整批唤回，Snipaste 行为）
      if (e.key === "Delete") {
        pinClose(idRef.current).catch(() => {});
      } else if (e.key === "Escape") {
        pinHideOne().catch(() => {});
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
      // 鼠标穿透：点击/滚轮全部穿过贴图直达下面的窗口（Snipaste 同款）。
      // 穿透后贴图收不到任何鼠标事件——出口是贴图热键（隐藏后唤回自动解除）
      { label: clickThrough ? "取消鼠标穿透" : "开启鼠标穿透（贴图热键唤回）",
        action: () => {
          const turningOn = !clickThrough;
          pinSetClickThrough(turningOn).then(() => {
            setClickThrough(turningOn);
            if (turningOn) showBadge("已鼠标穿透 · 按贴图热键隐藏/唤回", 4000);
          }).catch(() => {});
        } },
      { label: "隐藏此贴图（贴图热键唤回）", action: () => pinHideOne().catch(() => {}) },
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

  // 图片就绪信号：decode() 在解码完成（可无闪烁呈现）时才 resolve，
  // 比 onload 更早且语义更准；省掉旧版"等两帧 rAF"的额外 1~2 帧延迟
  const readyWhenPainted = (img: HTMLImageElement | null) => {
    const fire = () => { void pinReady().catch(() => {}); };
    if (img?.decode) {
      img.decode().then(fire, fire);
    } else {
      requestAnimationFrame(() => requestAnimationFrame(fire));
    }
  };

  return (
    <div className={`pin-window${shadow ? " pin-shadow" : ""}${dragging ? " pin-dragging" : ""}`}
      style={{ opacity, "--pin-accent": accent, "--pin-m": `${pinMarginCss()}px` } as React.CSSProperties}
      onMouseDown={onMouseDown} onContextMenu={onContext}
      onDoubleClick={() => { if (idRef.current) pinClose(idRef.current).catch(() => {}); }}>
      {src && kind === "image" && (
        <img src={src} draggable={false}
          onLoad={(e) => {
            const el = e.target as HTMLImageElement;
            baseWRef.current = el.naturalWidth || 0;
            if (tAssignRef.current) diagLog(`[pin] img decoded +${Date.now() - tAssignRef.current}ms`);
            readyWhenPainted(el);
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
      {/* HTML 贴图（剪贴板富文本/纯文本）：保留剪贴板内联样式原样渲染；
          外层 wrap 跟随窗口宽度，内层按比例 transform:scale 整体缩放 */}
      {kind === "html" && html !== null && (
        <div ref={htmlWrapRef} className="pin-html-wrap">
          <div ref={htmlRef} className="pin-html"
            dangerouslySetInnerHTML={{ __html: html }} />
        </div>
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
