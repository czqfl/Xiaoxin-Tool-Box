/** 贴图 OCR 划选：贴图图片加载后后台自动识别文字（PP-OCR ONNX 本地引擎，
 *  走 pin_ocr 命令由 Rust 直读贴图文件），结果静默缓存；单击 Alt 切换"文字选择
 *  模式"（再按一次退出），模式内左键划选文字 → 半透明蓝色高亮保持，
 *  Ctrl+C 手动复制选中文本。本窗无键盘焦点时按的 Alt 收不到 keydown，
 *  mousedown 侧用系统修饰键 e.altKey 兜底，保证划选始终可用。
 *
 *  设计要点：
 *  - 默认左键拖动仍是原生 startDragging 移动窗口，本 hook 不参与——只有
 *    文字模式开启时 PinWindow 的 onMouseDown 先询问 onMouseDown() 且返回
 *    true 才拦截，不命中原样走拖拽，体验与改造前零差异
 *  - OCR 结果只存文本+矩形（无像素拷贝）；识别失败/超时静默降级，
 *    贴图其余功能完全不受影响
 *  - 坐标系换算：OCR 返回【原图物理像素】矩形；高亮渲染前经 img 的
 *    getBoundingClientRect + objectFit:contain 实际绘制区域映射到当前
 *    显示尺寸——贴图任意缩放后高亮仍精确贴合文字
 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { copyText, pinOcr, type ShotOcrLine } from "../../core/tauri";

/** 显示坐标系（CSS 像素、相对视口）中的高亮矩形 */
export interface SelRect { x: number; y: number; w: number; h: number }

/** img 显示几何快照：绘制区左上角 + 原图像素/CSS 像素缩放比 */
interface Geom { left: number; top: number; kx: number; ky: number }

interface Options {
  /** 是否对该贴图跑自动 OCR（仅图片贴图） */
  autoRun: boolean;
  /** 是否允许进入选词模式（图片贴图且未旋转/翻转——旋转后坐标映射不成立） */
  interactive: boolean;
  /** 贴图 id：Rust 直读 pins/{id} 文件识别（免 fetch 整图 + IPC 回传） */
  id: string;
  /** 贴图图片协议地址（变化即重跑 OCR，staging 复用窗换图场景） */
  src: string;
  imgRef: { current: HTMLImageElement | null };
  onFeedback: (text: string, ms?: number, cls?: string) => void;
}

export function usePinOcrSelect({ autoRun, interactive, id, src, imgRef, onFeedback }: Options) {
  // OCR 行数据：state 驱动"有无文字"的重渲染；ref 供鼠标事件闭包读最新值
  const [lines, setLines] = useState<ShotOcrLine[] | null>(null);
  const linesRef = useRef<ShotOcrLine[] | null>(null);
  // 识别进行中：Alt 按下但结果未就绪时给用户角标反馈（否则像功能坏了）。
  // 只需 ref——反馈经 onFeedback 走 PinWindow 角标，hook 内无需触发渲染
  const ocrBusyRef = useRef(false);
  // 文字选择模式开关（单击 Alt 切换；光标 I-beam + 提示底纹）
  const [altActive, setAltActive] = useState(false);
  const modeRef = useRef(false);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  // 当前选中词（行号+词号，指向 OCR 原图坐标系矩形）：显示矩形在每次渲染
  // 时按当前窗口几何现算——滚轮缩放贴图后高亮自动跟随新尺寸，绝不残留
  // 旧视口坐标（存显示坐标的话，缩放后高亮位置全错）
  const [picked, setPicked] = useState<{ li: number; wi: number }[]>([]);
  const pickedRef = useRef<{ li: number; wi: number }[]>([]);
  const hasSelectionRef = useRef(false);
  // resize 计数器：仅用于触发重渲染，让待命底纹/选区按新几何重新映射
  const [, setResizeTick] = useState(0);
  const feedbackRef = useRef(onFeedback);
  feedbackRef.current = onFeedback;

  const applyPicked = (p: { li: number; wi: number }[]) => {
    pickedRef.current = p;
    hasSelectionRef.current = p.length > 0;
    setPicked(p);
  };
  const clearSelection = () => applyPicked([]);
  /** 退出文字模式并清高亮（Esc / 失焦 / 交互失效共用） */
  const exitMode = () => {
    modeRef.current = false;
    setAltActive(false);
    clearSelection();
  };

  // 贴图滚轮缩放 / 系统 DPI 变化会 resize 窗口：强制重渲染一次，
  // 底纹与已有选区按最新 img 绘制区域重新映射（否则缩放后位置全错）
  useEffect(() => {
    const h = () => setResizeTick((t) => t + 1);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ---- 自动 OCR：src 变化即后台识别（Rust 直读贴图文件，前端零传图） ----
  useEffect(() => {
    // 代际令牌：staging 复用窗跨多张贴图存活，旧请求晚到绝不覆盖新贴图结果；
    // 换图同时清掉上一张的选区与识别缓存
    let stale = false;
    linesRef.current = null;
    setLines(null);
    clearSelection();
    if (!autoRun || !id || !src) return;
    ocrBusyRef.current = true;
    pinOcr(id)
      .then((res) => {
        if (stale) return;
        linesRef.current = res;
        setLines(res);
      })
      .catch(() => { /* 识别失败静默降级：仅文字选择不可用 */ })
      .finally(() => {
        if (stale) return;
        ocrBusyRef.current = false;
      });
    return () => { stale = true; };
  }, [autoRun, id, src]);

  // ---- Alt 开关跟踪（单击切换，无需一直按住）----
  // keydown 切换 + blur 退出两路维护：blur（Alt+Tab 切窗等）立即退出模式并清高亮。
  // keydown preventDefault：拦下 WebView 里单独按 Alt 触发菜单焦点转移的行为
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || e.repeat || !interactiveRef.current) return;
      e.preventDefault();
      // 没有识别结果：区分"还在识别中"与"识别完但没有文字"给角标反馈——
      // 大图识别耗时明显，无反馈时用户会以为文字选择功能坏了
      if (!linesRef.current?.length) {
        feedbackRef.current(ocrBusyRef.current ? "文字识别中，请稍候…" : "未识别到文字", 1400);
        return;
      }
      modeRef.current = !modeRef.current;
      setAltActive(modeRef.current);
      if (!modeRef.current) clearSelection();
    };
    const blur = () => exitMode();
    window.addEventListener("keydown", kd);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // OCR 完成（或清空）时同步一次模式状态：识别刚完成也要立即可选
  useEffect(() => {
    setAltActive(modeRef.current && !!lines?.length && interactiveRef.current);
    if (!lines?.length) clearSelection();
  }, [lines]);

  // ---- 选区相关按键（由 PinWindow 的 keydown 最先调用；返回 true=已消费）----
  // Esc = 清高亮并退出文字模式；Ctrl+C = 复制选中文本（无选区时不消费，
  // PinWindow 继续走默认的「复制为图片」）
  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (e.key === "Escape" && hasSelectionRef.current) {
      e.preventDefault();
      exitMode();
      return true;
    }
    // 注意：这里【不】要求 !e.altKey——进文字模式的姿势就是"按住 Alt 拖选"，
    // 要求松开 Alt 再按 Ctrl+C 会让这一路组合彻底静默（本分支和 PinWindow 的
    // "复制为图片"分支都带 !e.altKey，谁都不消费 → 无角标、剪贴板也没内容）
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey
      && (e.key === "c" || e.key === "C") && hasSelectionRef.current) {
      e.preventDefault();
      const text = buildText(pickedRef.current);
      if (text) {
        copyText(text, true)
          .then(() => feedbackRef.current(`已复制 ${text.length} 字`, 1200, "copied"))
          .catch(() => feedbackRef.current("复制失败", 1500, "failed"));
      }
      return true;
    }
    return false;
  };

  // 旋转/翻回等使交互失效时清状态
  useEffect(() => {
    if (!interactive) exitMode();
  }, [interactive]);

  // ---- 坐标映射 ----
  // img 元素实际绘制区域（objectFit:contain 有留白时取居中子区域）
  const computeGeom = (): Geom | null => {
    const el = imgRef.current;
    if (!el || !el.naturalWidth || !el.naturalHeight) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const natW = el.naturalWidth, natH = el.naturalHeight;
    const s = Math.min(r.width / natW, r.height / natH);
    const dw = natW * s, dh = natH * s;
    return {
      left: r.left + (r.width - dw) / 2,
      top: r.top + (r.height - dh) / 2,
      kx: natW / dw,
      ky: natH / dh,
    };
  };
  const toOrig = (cx: number, cy: number, g: Geom) => ({ x: (cx - g.left) * g.kx, y: (cy - g.top) * g.ky });
  const toDisp = (x: number, y: number, w: number, h: number, g: Geom): SelRect =>
    ({ x: g.left + x / g.kx, y: g.top + y / g.ky, w: w / g.kx, h: h / g.ky });

  // 【按行吸附的划选命中】荧光笔语义，两步：
  //  1) 行级：行矩形与划选框垂直相交 ≥ 行高 40%，或行中心在框内，
  //     或划选框整体落在行的垂直范围内 → 该行激活。旧版逐词算面积占比，
  //     细而扁的拖拽框垂直方向只盖住几个像素就整词丢弃——"很难选中"
  //  2) 行内：激活行里水平方向与划选框有任何相交的词全部选中——从起点
  //     词到终点词整段拿走，与文本编辑器选择行为一致，不会拖着拖着词掉
  const collect = (x0: number, y0: number, x1: number, y1: number) => {
    const L = linesRef.current ?? [];
    const picked: { li: number; wi: number }[] = [];
    for (let li = 0; li < L.length; li++) {
      const line = L[li];
      const ly0 = line.y, ly1 = line.y + line.h, lcy = line.y + line.h / 2;
      const iy = Math.min(y1, ly1) - Math.max(y0, ly0);
      const contained = y0 >= ly0 && y1 <= ly1; // 小框整体在行内：精确点选场景
      if (!(iy >= line.h * 0.4 || (lcy >= y0 && lcy <= y1) || contained)) continue;
      const words = line.words;
      for (let wi = 0; wi < words.length; wi++) {
        const wd = words[wi];
        const ix = Math.min(x1, wd.x + wd.w) - Math.max(x0, wd.x);
        const cx = wd.x + wd.w / 2;
        if (ix > 0 || (cx >= x0 && cx <= x1)) picked.push({ li, wi });
      }
    }
    return picked;
  };

  // 选中文本重组：按行（y 序）→ 行内按 x 排序；词间水平间隙超过行高的
  // 35% 视为英文单词边界补空格（中文 OCR 词间隙极小不受影响）
  const buildText = (picked: { li: number; wi: number }[]): string => {
    const L = linesRef.current;
    if (!L || !picked.length) return "";
    const byLine = new Map<number, { x: number; w: number; h: number; t: string }[]>();
    for (const p of picked) {
      const wd = L[p.li]?.words[p.wi];
      if (!wd || !wd.t) continue;
      let arr = byLine.get(p.li);
      if (!arr) { arr = []; byLine.set(p.li, arr); }
      arr.push(wd);
    }
    return [...byLine.entries()]
      .sort((a, b) => L[a[0]].y - L[b[0]].y)
      .map(([, ws]) => {
        ws.sort((a, b) => a.x - b.x);
        let out = "";
        let prevRight = NaN, prevH = NaN;
        for (const w of ws) {
          if (!Number.isNaN(prevRight) && w.x - prevRight > prevH * 0.35) out += " ";
          out += w.t;
          prevRight = w.x + w.w;
          prevH = Math.max(prevH || 0, w.h);
        }
        return out.trim();
      })
      .filter(Boolean)
      .join("\n");
  };

  // 活动手势的清理函数引用。【关键防御】手势收尾若只依赖 mouseup，鼠标在
  // 窗口外松开时 webview 收不到 mouseup → move 监听泄漏；下一次划选时新旧
  // 两个 move 同帧互相覆盖选区状态——"拖着拖着部分词突然丢选中"的元凶。
  // 三路兜底：document mouseout(离开页面) / window blur / 下一次 mousedown
  const teardownRef = useRef<(() => void) | null>(null);

  // ---- 划选主入口：PinWindow 的 onMouseDown 先问这里 ----
  // 返回 true 表示已接管（文字模式开启），调用方不得再触发窗口拖拽。
  // 松开只保持高亮，复制由用户 Ctrl+C 手动触发（onKeyDown）
  const onMouseDown = (e: MouseEvent): boolean => {
    if (e.button !== 0 || !interactiveRef.current) return false;
    // 模式开关由本窗 Alt keydown 切换，但 keydown 只在本窗【持有键盘焦点】时
    // 才会送达——刚从别的应用切过来直接按 Alt+拖拽时 modeRef 还是关的，
    // 表现为"经常划不动、偶尔才行"。用系统真实修饰键 e.altKey 兜底：
    // 只要物理上按着 Alt 就进划选，并把模式同步为开（光标/底纹立即就位）
    if (!modeRef.current && !e.altKey) return false;
    if (!modeRef.current && e.altKey) { modeRef.current = true; setAltActive(true); }
    const L = linesRef.current;
    if (!L || !L.length) return false;
    const g = computeGeom();
    if (!g) return false;
    e.preventDefault();
    // 划选靠 mousedown（有 e.altKey 兜底，无需焦点），但 Ctrl+C 是 keydown——本窗
    // 没有键盘焦点时按键根本送不进来，表现就是"高亮有了、复制没反应"。
    // 接管这次按下的同时把焦点要过来（setFocus 可能因他窗持有前台而失败，忽略）
    void getCurrentWindow().setFocus().catch(() => {});
    teardownRef.current?.(); // 防御：拆掉可能残留的上一场手势
    hasSelectionRef.current = true;
    const a = toOrig(e.clientX, e.clientY, g);
    let raf = 0;
    let done = false;
    let lastPicked: { li: number; wi: number }[] = [];
    const move = (ev: MouseEvent) => {
      if (done) return;
      const b = toOrig(ev.clientX, ev.clientY, g);
      lastPicked = collect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
      // rAF 合帧：一帧至多一次 setState，拖动高亮稳定 60fps
      if (!raf) {
        raf = requestAnimationFrame(() => { raf = 0; applyPicked(lastPicked); });
      }
    };
    const teardown = () => {
      done = true;
      teardownRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      document.removeEventListener("mouseleave", onDocLeave);
      window.removeEventListener("blur", cancel);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const finish = () => {
      if (done) return;
      teardown();
      if (lastPicked.length) {
        applyPicked(lastPicked); // 高亮保持，等用户 Ctrl+C
      } else {
        clearSelection(); // 空白处点击 = 取消高亮
      }
    };
    const cancel = () => { if (!done) { teardown(); clearSelection(); } };
    // 光标甩出贴图窗（webview 视口）：这里必然收不到 mouseup，就地视作松手
    // 结算——否则手势悬挂到下次按下才被拆除，期间高亮处于半更新状态
    const onDocLeave = () => finish();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    document.addEventListener("mouseleave", onDocLeave);
    window.addEventListener("blur", cancel);
    teardownRef.current = teardown;
    return true;
  };

  // ---- 渲染期坐标映射：每次渲染按当前窗口几何把原图矩形映到视口 ----
  // Alt 待命提示底纹：已识别文字行铺淡蓝底色。【有选区也继续显示】——
  // 底纹是模式内常驻的"哪些文字可选"指引，选中的词有高亮蓝压在上面
  const geom = computeGeom();
  const hintRects: SelRect[] = [];
  if (altActive && geom && lines) {
    for (const line of lines) {
      if (line.w > 0 && line.h > 0) hintRects.push(toDisp(line.x, line.y, line.w, line.h, geom));
    }
  }
  // 划选高亮：由选中词索引现算显示矩形
  const selRects: SelRect[] =
    geom && picked.length
      ? picked.map((p) => {
          const wd = linesRef.current?.[p.li]?.words[p.wi];
          return wd ? toDisp(wd.x, wd.y, wd.w, wd.h, geom) : null;
        }).filter((r): r is SelRect => !!r)
      : [];

  return { altActive, selRects, hintRects, onMouseDown, onKeyDown, clearSelection, hasSelectionRef };
}
