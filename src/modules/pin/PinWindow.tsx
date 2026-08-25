/** Pin window: always-on-top floating image with zoom/opacity/rotate.
 *  两种形态：常规窗(pin-{id}) 与 复用窗(pin-staging)。
 *  复用窗启动即预建、屏幕外隐藏待命；贴图时由 Rust 经 pin://assign 分配任务，
 *  图片就绪后才显示——免去临时建 WebView2 窗口的数百毫秒开销与闪烁 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { PhysicalSize } from "@tauri-apps/api/dpi";
import {
  pinImageUrl, pinUpdate, pinClose, pinSetClickThrough, pinReady, pinHideOne, pinResize, pinKind, diagLog,
  pinCopyOriginal, pinCopyImageBytes,
} from "../../core/tauri";
import { useConfigStore } from "../../stores/configStore";
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
  // 角标（左上角）：缩放比例/透明度/复制反馈，停止 ~1s 后淡出。
  // cls 可选附加样式类（如 copied=绿色高亮，让复制反馈一眼可辨）
  const [zoomLabel, setZoomLabel] = useState<{ text: string; cls?: string } | null>(null);
  const zoomHideTimer = useRef(0);
  // 图片原始宽度（naturalWidth）：缩放比例 = 当前窗宽 / 原始宽
  const baseWRef = useRef(0);

  const winLabel = getCurrentWindow().label;
  // 待命复用窗是池化的（pin-staging / pin-staging-2 / …），按前缀识别；
  // 贴图 id：常规窗取自 label；复用窗等 assign 事件分配
  const isStaging = winLabel.startsWith("pin-staging");
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
  // kind 镜像：键盘 effect 只挂载一次，经此读最新类型
  const kindRef = useRef<"image" | "html">("image");
  kindRef.current = kind;
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
  /** 富文本底色自适应：企业微信等深色主题应用复制的片段不带背景色，
   *  贴图窗又是透明背景——文字直接叠在桌面上看不清（QQ 复制自带白底所以没事）。
   *  采样子树里实际显示文字元素的前景色平均亮度：偏亮配深底、偏暗配白底；
   *  片段自带的背景色样式照常覆盖，不受影响 */
  const pickHtmlBackdrop = (el: HTMLElement): string => {
    const lum = (c: string): number | null => {
      const m = c.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      return m ? (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 : null;
    };
    let sum = 0, n = 0;
    if (el.textContent?.trim()) {
      const l = lum(getComputedStyle(el).color);
      if (l !== null) { sum += l; n += 1; }
    }
    const walk = (node: HTMLElement, depth: number) => {
      if (n >= 60 || depth > 12) return;
      for (const child of Array.from(node.children) as HTMLElement[]) {
        if (n < 60
          && Array.from(child.childNodes).some((x) => x.nodeType === 3 && x.textContent?.trim())) {
          const l = lum(getComputedStyle(child).color);
          if (l !== null) { sum += l; n += 1; }
        }
        walk(child, depth + 1);
      }
    };
    walk(el, 1);
    if (n === 0) return "#ffffff";
    return sum / n > 0.55 ? "#1e1f22" : "#ffffff";
  };

  useEffect(() => {
    if (html === null || !idRef.current || htmlSizedRef.current) return;
    const el = htmlRef.current;
    if (!el) return;
    htmlSizedRef.current = true;
    // 先补底色再量尺寸：背景不影响布局，但保证量到的就是最终呈现状态
    el.style.background = pickHtmlBackdrop(el);
    const natW = el.offsetWidth, natH = el.offsetHeight;
    htmlNatRef.current = { w: natW, h: natH };
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(40, Math.min(4000, Math.round(natW * dpr)));
    const h = Math.max(40, Math.min(6000, Math.round(natH * dpr)));
    void pinResize(idRef.current, w, h).then(() => {
      diagLog(`[pin] html sized ${w}x${h} +${Date.now() - tAssignRef.current}ms, ready`);
      // 【绝不能等 rAF】staging 复用窗是隐藏窗，WebView2 会把隐藏页面的
      // requestAnimationFrame 节流到近乎停摆——readyWhenPainted(null) 的双 rAF
      // 迟迟不触发，最终只能靠 Rust 1.5s 兜底重建才显示出来，这正是
      // "复制富文本后按贴图快捷键要等一两秒才弹出"的根因。
      // 图片路径用 img.decode() 不依赖 rAF 所以没事；HTML 路径量完尺寸直接就绪
      // （Rust 显窗前本就有 ~80ms 合成缓冲，不会闪空白）
      void pinReady().catch(() => {});
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

  // opacity 镜像：滚轮 effect 只挂载一次，经此读取最新值
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  // 角标：缩放比例 / 透明度 / 操作提示（左上角），默认 ~1s 后自动隐藏
  const showBadge = (text: string, ms = 1000, cls?: string) => {
    setZoomLabel({ text, cls });
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

  // mouse wheel: 普通滚动=缩放；Ctrl+滚轮=透明度 ±5%（范围 5%~100%）
  // 【不能用"左键按住+滚轮"调透明度】原生拖放循环期间 webview 收不到
  // mouseup，左键按住状态会卡在 true——之后滚轮全变成调透明度
  // （"没按任何键滚轮却在调透明度"的根因）。Ctrl 修饰键由系统状态给出，
  // 不存在卡住问题
  useEffect(() => {
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const win = getCurrentWindow();
      // Ctrl+滚轮：调透明度 ±5%，左上角角标实时提示当前透明度
      if (e.ctrlKey && idRef.current) {
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
    window.addEventListener("wheel", h, { passive: false });
    return () => {
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
      // 右键菜单开着：Esc 只关菜单，不关贴图
      if (menuRef.current) {
        if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
        return;
      }
      if (!idRef.current) return;
      // Esc/Delete=关闭此贴图（与右键菜单「关闭此贴图」同一接口 pinClose）。
      // 此前 Esc=仅隐藏，但隐藏走 window.hide() 且依赖焦点链路，实测不可靠；
      // 关闭接口验证正常，用户明确要求 Esc 与菜单行为一致
      if (e.key === "Delete" || e.key === "Escape") {
        // 关闭失败（贴图已成幽灵条目：窗口与存储脱节）时回退为隐藏窗口——
        // 保证 Esc 永远能退出贴图
        pinClose(idRef.current).catch(() => { void pinHideOne().catch(() => {}); });
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "c" || e.key === "C")) {
        // 【默认复制为图片（贴图视觉）】：文本/富文本贴图经 DOM 渲染导出 PNG；
        // 复制原文本走右键菜单。仅失败时红标提示
        showBadge("已复制图片", 1200, "copied");
        const job = kindRef.current === "html"
          ? copyPinAsImage()
          : pinCopyOriginal(idRef.current).then(() => undefined);
        job.catch(() => showBadge("复制失败", 1500, "failed"));
      } else if (e.key === "r" && e.ctrlKey) {
        setRotation((r) => (r + 90) % 360);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // drag
  const dragClearRef = useRef(0);
  const clearDragState = () => { window.clearTimeout(dragClearRef.current); setDragging(false); };
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !idRef.current) return;
    setDragging(true);
    // 原生拖放循环里 webview 收不到 mouseup（纯点击无移动时也没有 onMoved），
    // 拖拽态由「onMoved 停稳 180ms」或此超时兜底清除
    window.clearTimeout(dragClearRef.current);
    dragClearRef.current = window.setTimeout(clearDragState, 800);
    // 【原生拖拽】交给 OS 模态拖放循环（WM_NCLBUTTONDOWN 语义）：拖动过程
    // 由系统逐帧移动窗口，JS 零参与、零 IPC——此前 webview 里逐 mousemove
    // 调 setPosition（一次 IPC 往返）无论怎么合并帧率都追不上原生丝滑度
    getCurrentWindow().startDragging().catch(() => {});
  };

  // 拖动中的位置持久化与拖拽态复位：onMoved 持续触发视为拖拽中，停稳
  // ~180ms 视为松手；位置持久化沿用 400ms 防抖
  useEffect(() => {
    let un: (() => void) | undefined;
    void getCurrentWindow().onMoved(() => {
      debouncePersist();
      window.clearTimeout(dragClearRef.current);
      dragClearRef.current = window.setTimeout(clearDragState, 180);
    }).then((f) => { un = f; });
    return () => { un?.(); window.clearTimeout(dragClearRef.current); };
  }, []);

  // persist position on move end
  useEffect(() => {
    const h = () => { void persistNowRef.current(); };
    window.addEventListener("mouseup", h);
    return () => window.removeEventListener("mouseup", h);
  }, []);

  // context menu
  const config = useConfigStore((s) => s.config);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = () => {
    menuRef.current?.remove();
    menuRef.current = null;
  };
  // 左键点菜单外任意处 → 关闭菜单（mousedown 而非 click：点击空白处会触发
  // 原生拖拽循环，click 事件在拖放循环里永远不会回到 webview）。
  // 常驻监听 + menuRef 判空：避免闭包身份不一致导致监听器移除失效
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const m = menuRef.current;
      if (m && !m.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, []);
  // ---- 文本/富文本贴图「复制为图片」----
  // 把贴图 DOM 克隆进 SVG foreignObject → 画进 canvas（按 DPR 放大保清晰）
  // → 导出 PNG → 原生二进制直传 Rust 写剪贴板位图
  const copyPinAsImage = async (): Promise<void> => {
    const el = htmlRef.current, wrap = htmlWrapRef.current;
    if (!el || !wrap) throw new Error("no html");
    const natW = Math.max(1, el.offsetWidth), natH = Math.max(1, el.offsetHeight);
    const dpr = window.devicePixelRatio || 1;
    const clone = el.cloneNode(true) as HTMLElement;
    const holder = document.createElement("div");
    holder.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    holder.appendChild(clone);
    const xml = new XMLSerializer().serializeToString(holder);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${natW}" height="${natH}">` +
      `<foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("svg render failed"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    const c = document.createElement("canvas");
    c.width = Math.round(natW * dpr); c.height = Math.round(natH * dpr);
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.drawImage(img, 0, 0, natW, natH);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (!blob) throw new Error("toBlob null");
    await pinCopyImageBytes(blob);
  };

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const id = idRef.current;
    if (!id) return;
    closeMenu();
    // 文本/富文本贴图：原文本与图片两种复制都给（Ctrl+C 默认复制为图片）
    const copyActions = kind === "html"
      ? [
          { label: "复制原文本", action: () => { showBadge("已复制文本", 1200, "copied"); pinCopyOriginal(id).catch(() => showBadge("复制失败", 1500, "failed")); } },
          { label: "复制为图片", action: () => { showBadge("已复制图片", 1200, "copied"); copyPinAsImage().catch(() => showBadge("复制失败", 1500, "failed")); } },
        ]
      : [
          { label: "复制", action: () => { showBadge("已复制图片", 1200, "copied"); pinCopyOriginal(id).catch(() => showBadge("复制失败", 1500, "failed")); } },
        ];
    const actions = [
      ...copyActions,
      { label: shadow ? "关闭阴影" : "开启阴影", action: () => setShadow(!shadow) },
      // 鼠标穿透：点击/滚轮全部穿过贴图直达下面的窗口（Snipaste 同款）。
      // 穿透后贴图收不到任何鼠标事件——出口是贴图热键（隐藏后唤回自动解除）
      { label: clickThrough ? "取消鼠标穿透" : "开启鼠标穿透",
        action: () => {
          const turningOn = !clickThrough;
          pinSetClickThrough(turningOn).then(() => {
            setClickThrough(turningOn);
            if (turningOn) showBadge("已鼠标穿透 · 按贴图热键唤回", 4000);
          }).catch(() => {});
        } },
      { label: "隐藏贴图", action: () => pinHideOne().catch(() => {}) },
      { label: "关闭贴图", action: () => pinClose(id).catch(() => {}) },
    ];
    const menu = document.createElement("div");
    menu.className = "pin-ctx-menu";
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.visibility = "hidden";
    // 【跟随系统主题 + 通用设置】底色用主题面板色，透明度/毛玻璃由
    // 通用设置的「亚克力 + 不透明度」统一管理（与各面板外壳同源）
    const g = config?.general;
    const acrylic = g?.acrylic_enabled !== false;
    const op = Math.min(100, Math.max(0, g?.acrylic_opacity ?? 60)) / 100;
    const rgb = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-panel-rgb").trim() || "24, 24, 28";
    menu.style.background = `rgba(${rgb}, ${acrylic ? op : 1})`;
    menu.style.backdropFilter = acrylic ? "blur(18px)" : "none";
    for (const a of actions) {
      const btn = document.createElement("div");
      btn.className = "pin-ctx-item";
      btn.textContent = a.label;
      btn.onclick = () => { closeMenu(); a.action(); };
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    menuRef.current = menu;
    // 【钳回可视区】菜单渲染在贴图窗自己的 webview 里，贴图较小时点击点
    // 附近放不下会整个溢出窗界被裁掉（表现为"菜单只显示一半/看不见"）。
    // 先隐藏渲染量出实际尺寸，再钳进窗口可视范围内
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = `${Math.max(2, Math.min(e.clientX, vw - mw - 2))}px`;
    menu.style.top = `${Math.max(2, Math.min(e.clientY, vh - mh - 2))}px`;
    menu.style.visibility = "visible";
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

  // 【空壳零渲染】待命复用窗在屏幕外可见待命（合成器预热），未分配贴图前
  // 绝不能画出边框/阴影等任何可见元素——否则一旦窗口意外落在可视区
  // （DPI 换算、窗口管理器调整等），用户就会看到一块"透明带框、Esc 无效"的幽灵矩形。
  // 分配贴图后才有内容，才渲染边框与阴影
  const hasContent = (!!src && kind === "image") || (kind === "html" && html !== null);

  // 选中（窗口聚焦）态：贴图获得键盘焦点时边框点亮为主题色 + 辉光，
  // 点别处自动熄灭——一眼看出当前操作的是哪张贴图
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);

  return (
    <div className={`pin-window${shadow && hasContent ? " pin-shadow" : ""}${dragging ? " pin-dragging" : ""}${focused ? " pin-focused" : ""}`}
      style={{ opacity: hasContent ? opacity : 0, "--pin-accent": accent, "--pin-m": `${pinMarginCss()}px` } as React.CSSProperties}
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
          显示主题色、闲置时白色，让贴图边界在任何桌面都清晰可辨。
          【只在有内容后渲染】——空壳待命窗绝不画边框 */}
      {hasContent && (
        <div
          className={`pin-border${introDone ? "" : " pin-border-flash"}`}
          onAnimationEnd={() => setIntroDone(true)} />
      )}
      {zoomLabel && (
        <div className={`pin-zoom-badge${zoomLabel.cls ? " " + zoomLabel.cls : ""}`}>{zoomLabel.text}</div>
      )}
    </div>
  );
}
