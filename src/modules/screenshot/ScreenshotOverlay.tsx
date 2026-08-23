/** Fullscreen screenshot overlay: frozen screen + selection + magnifier + toolbar */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import {
  shotGeometry, shotImageDataRaw, shotWindowRectAt, shotReady, shotFrameUrl,
  shotOutputPost, shotCancel, shotSaveRegion, diagLog,
} from "../../core/tauri";
import { useConfigStore } from "../../stores/configStore";
import "./screenshot.css";

type Tool = "select"|"rect"|"ellipse"|"arrow"|"line"|"brush"|"mosaic"|"text"|"number";
type Phase = "idle"|"selected";
interface Pt { x: number; y: number; }
interface Rect { x: number; y: number; w: number; h: number; }
interface Anno {
  kind: Tool; x1: number; y1: number; x2: number; y2: number;
  color: string; width: number; points?: Pt[]; text?: string; num?: number;
}

const MAG = 140, MAG_Z = 8;

/* ---- 工具图标：本地绘制，统一 24 viewBox / 1.7 圆头细线描边 / currentColor。
   不再共用全局图标库——截图工具条需要一套粗细一致、视觉更轻的专用图标 ---- */
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IcoSelect = () => <Svg><rect x="4.5" y="4.5" width="15" height="15" rx="2" strokeDasharray="3.2 2.6"/></Svg>;
const IcoRect = () => <Svg><rect x="5" y="6" width="14" height="12" rx="1.5"/></Svg>;
const IcoEllipse = () => <Svg><ellipse cx="12" cy="12" rx="8" ry="6.2"/></Svg>;
const IcoArrow = () => <Svg><path d="M5 19L19 5M11.8 5H19v7.2"/></Svg>;
const IcoLine = () => <Svg><path d="M5 19L19 5"/></Svg>;
const IcoBrush = () => <Svg><path d="M17.2 3.9l2.9 2.9L9.3 17.6l-4.3 1.4L6.4 14z"/><path d="M14.8 6.3l2.9 2.9"/></Svg>;
const IcoMosaic = () => <Svg><rect x="4.5" y="4.5" width="6.4" height="6.4"/><rect x="13.1" y="4.5" width="6.4" height="6.4"/><rect x="4.5" y="13.1" width="6.4" height="6.4"/><rect x="13.1" y="13.1" width="6.4" height="6.4"/></Svg>;
const IcoTextT = () => <Svg><path d="M5.5 7V5h13v2M12 5v14M9.5 19h5"/></Svg>;
const IcoNumber = () => <Svg><circle cx="12" cy="12" r="8"/><path d="M10.2 9.4l2.1-1.4v8"/></Svg>;
const IcoUndo = () => <Svg><path d="M8 5L3 10l5 5"/><path d="M3 10h10.5a5.75 5.75 0 0 1 0 11.5H10"/></Svg>;
const IcoRedo = () => <Svg><path d="M16 5l5 5-5 5"/><path d="M21 10H10.5a5.75 5.75 0 0 0 0 11.5H14"/></Svg>;
const IcoCopy = () => <Svg><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></Svg>;
const IcoPin = () => <Svg><path d="M9.5 3.5h5M12 3.5V8"/><path d="M7.8 8h8.4l1.7 5.4H6.1z"/><path d="M12 13.4V20.5"/></Svg>;
const IcoSaveAs = () => <Svg><path d="M12 3.5V14M8.5 10.5L12 14l3.5-3.5"/><path d="M4.5 16.5v2A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-2"/></Svg>;
const IcoClose = () => <Svg><path d="M6 6l12 12M18 6L6 18"/></Svg>;

/** 工具条按钮配置（Snipaste 式图标化排列） */
const TOOLS: [Tool, () => JSX.Element, string][] = [
  ["select", IcoSelect, "选区/重选"],
  ["rect", IcoRect, "矩形"],
  ["ellipse", IcoEllipse, "椭圆"],
  ["arrow", IcoArrow, "箭头"],
  ["line", IcoLine, "直线"],
  ["brush", IcoBrush, "画笔"],
  ["mosaic", IcoMosaic, "马赛克"],
  ["text", IcoTextT, "文字：点击选区内位置输入"],
  ["number", IcoNumber, "序号"],
];

/** 这些工具激活时在工具条下方弹出颜色/粗细配置面板 */
const NEEDS_CONFIG: Tool[] = ["rect","ellipse","arrow","line","brush","mosaic","text","number"];

function drawShape(
  ctx: CanvasRenderingContext2D,
  s: Anno,
  src?: HTMLCanvasElement | null,
  mosaicCache?: Map<string, string>,
) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.fillStyle = s.color;
  if (s.kind === "rect") {
    ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.x1);
  } else if (s.kind === "ellipse") {
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
    const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (s.kind === "arrow") {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) { ctx.restore(); return; }
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    const angle = Math.atan2(dy, dx);
    const hl = Math.min(16, len * 0.3);
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - hl * Math.cos(angle - 0.4), s.y2 - hl * Math.sin(angle - 0.4));
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - hl * Math.cos(angle + 0.4), s.y2 - hl * Math.sin(angle + 0.4));
    ctx.stroke();
  } else if (s.kind === "line") {
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  } else if (s.kind === "brush" && s.points && s.points.length > 1) {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
  } else if (s.kind === "mosaic" && s.points && s.points.length > 0) {
    // 真马赛克（像素化）：每格取【底层画面】的平均色填充——不是灰色贴片。
    // 1) 插值收集路径覆盖的所有格子；相邻采样跨对角时补两个正交邻格，
    //    保证块块相连——轨迹紧密程度与拖动速度完全无关
    // 2) 包围盒一次 getImageData，逐格求平均 RGB（Set 去重避免重复计算）
    const bs = 12;
    const cells = new Set<string>();
    let prevFx: number | null = null, prevFy: number | null = null;
    const mark = (x: number, y: number) => {
      const fx = Math.floor(x / bs), fy = Math.floor(y / bs);
      cells.add(fx + "," + fy);
      if (prevFx !== null && prevFy !== null && fx !== prevFx && fy !== prevFy) {
        cells.add(prevFx + "," + fy);
        cells.add(fx + "," + prevFy);
      }
      prevFx = fx; prevFy = fy;
    };
    mark(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1], b = s.points[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (bs / 2)));
      for (let t = 1; t <= steps; t++) mark(a.x + ((b.x - a.x) * t) / steps, a.y + ((b.y - a.y) * t) / steps);
    }
    const fillCell = (k: string, color: string) => {
      const [cx, cy] = k.split(",").map(Number);
      ctx.fillStyle = color;
      ctx.fillRect(cx * bs, cy * bs, bs, bs);
    };
    let sampled = false;
    if (src && src.width > 0 && src.height > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cells.forEach((k) => {
        const [cx, cy] = k.split(",").map(Number);
        minX = Math.min(minX, cx * bs); minY = Math.min(minY, cy * bs);
        maxX = Math.max(maxX, (cx + 1) * bs); maxY = Math.max(maxY, (cy + 1) * bs);
      });
      minX = Math.max(0, Math.floor(minX)); minY = Math.max(0, Math.floor(minY));
      maxX = Math.min(src.width, Math.ceil(maxX)); maxY = Math.min(src.height, Math.ceil(maxY));
      const bw = maxX - minX, bh = maxY - minY;
      if (bw > 0 && bh > 0) {
        try {
          const data = src.getContext("2d")!.getImageData(minX, minY, bw, bh).data;
          cells.forEach((k) => {
            const hit = mosaicCache?.get(k);
            if (hit) { fillCell(k, hit); return; }
            const [cx, cy] = k.split(",").map(Number);
            const x0 = cx * bs - minX, y0 = cy * bs - minY;
            let r = 0, g = 0, b = 0, n = 0;
            for (let y = y0; y < y0 + bs; y++) {
              for (let x = x0; x < x0 + bs; x++) {
                const i = (y * bw + x) * 4;
                r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
              }
            }
            if (!n) return;
            const color = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
            mosaicCache?.set(k, color);
            fillCell(k, color);
          });
          sampled = true;
        } catch {}
      }
    }
    // 底图不可用（帧未加载等）时才退化为灰色占位
    if (!sampled) {
      ctx.fillStyle = "rgba(180,180,180,0.85)";
      cells.forEach((k) => fillCell(k, "rgba(180,180,180,0.85)"));
    }
  } else if (s.kind === "text" && s.text) {
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(s.text, s.x1, s.y1 + 18);
  } else if (s.kind === "number" && s.num !== undefined) {
    const r = 14;
    ctx.beginPath(); ctx.arc(s.x1, s.y1, r, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(s.num), s.x1, s.y1);
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}

export function ScreenshotOverlay() {
  const [geom, setGeom] = useState<{index:number;x:number;y:number;width:number;height:number}|null>(null);
  const [bgReady, setBgReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [region, setRegion] = useState<Rect>({x:0,y:0,w:0,h:0});
  const [snap, setSnap] = useState<Rect|null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#e5484d");
  const [sw, setSw] = useState(3);
  // 滚轮无级调节粗细时的提示徽标（短暂显示当前像素值）
  const [swBadge, setSwBadge] = useState<number | null>(null);
  const swBadgeTimer = useRef(0);
  const [annos, setAnnos] = useState<Anno[]>([]);
  const [undos, setUndos] = useState<Anno[][]>([]);
  // 鼠标位置走 ref 不走 state：拖动选区时每帧只直改放大镜 DOM/画布，
  // 组件零重渲染——旧版 setMouse 每帧触发整树 re-render（含 SVG mask、
  // 工具条定位、各 effect 重跑），是"拖动选区卡顿不跟手"的主因
  const mouseRef = useRef<Pt>({x:0,y:0});
  const [showMag, setShowMag] = useState(false);
  const [numCnt, setNumCnt] = useState(1);
  const [textEdit, setTextEdit] = useState<{x:number;y:number;value:string}|null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<Pt|null>(null);
  const regRef = useRef<Rect>({x:0,y:0,w:0,h:0});
  // 手柄缩放状态：hx/hy ∈ {-1,0,1}（-1=左/上边，1=右/下边，0=该轴不动）
  const resizeRef = useRef<{hx:number;hy:number;start:Rect;startPt:Pt}|null>(null);
  const downPtRef = useRef<Pt|null>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const annoRef = useRef<HTMLCanvasElement>(null);
  const cfg = useConfigStore((s) => s.config);
  // 遮罩窗复用：加载中又收到 shot-refresh 时置位，当前轮结束后立刻再来一轮
  const loadingRef = useRef(false);
  const rerunRef = useRef(false);
  // 会话令牌：每次呼出自增；旧会话迟到的帧数据绝不允许画进本会话画布
  const sessionRef = useRef(0);
  // 帧数据加载完成（供放大镜/导出合成）；亮窗不等它，输出前 await 即可
  const frameReadyRef = useRef<Promise<void>>(Promise.resolve());
  // 马赛克格子颜色缓存：同格采样结果复用，拖动重绘不再反复 getImageData
  const mosaicCacheRef = useRef(new Map<string, string>());
  // 输出单飞锁：Ctrl+T 按住自动重复/连点贴图不会并发创建多个贴图
  const outputtingRef = useRef(false);
  // 文字编辑镜像 ref：commitText 不依赖过期闭包（点击别处提交时不丢内容）
  const textEditRef = useRef<{x:number;y:number;value:string}|null>(null);
  useEffect(() => { textEditRef.current = textEdit; }, [textEdit]);

  // 加载一次截图会话（挂载首拉 + 每次呼出的 shot-refresh 事件共用）
  const loadSession = async () => {
    if (loadingRef.current) { rerunRef.current = true; return; }
    loadingRef.current = true;
    const mySession = ++sessionRef.current;
    // 立即清空上一会话残留的画布位图：webview 画布叠在原生冻结层【之上】，
    // 不清空的话亮窗瞬间旧图会盖在新冻结帧上，等 33MB 新帧加载完才换——
    // 正是"点击选中区域时先出现以前的截图、再变当前画面 + 闪一下"的根因。
    // 标注层同样要清：否则下一次截图会短暂看到上一会话画的画笔/马赛克。
    // 清空后 webview 透明区域直接透出下层已更新的原生冻结帧，所见即本会话。
    {
      const c0 = bgRef.current;
      if (c0) c0.getContext("2d")?.clearRect(0, 0, c0.width, c0.height);
      const a0 = annoRef.current;
      if (a0) a0.getContext("2d")?.clearRect(0, 0, a0.width, a0.height);
      setBgReady(false);
      setTool("select"); // 每次会话工具复位：避免残留标注模式导致误触绘制
    }
    mosaicCacheRef.current.clear();
    while (true) {
      rerunRef.current = false;
      try {
        // 复用窗口里残留上一次会话的 UI 状态，全部归零
        dragRef.current = null; resizeRef.current = null; downPtRef.current = null;
        setAnnos([]); setUndos([]); setTextEdit(null); setNumCnt(1); setShowMag(false);
        setRegion({x:0,y:0,w:0,h:0}); regRef.current = {x:0,y:0,w:0,h:0};
        setPhase("idle"); setSnap(null); setDragging(false);
        lastRectRef.current = null; snapRef.current = null; pngCacheRef.current = null;
        // 几何信息：Rust 端在截图瞬间就完成智能识别，snap 随 geometry 直接带回，
        // 无需等整屏 RGBA 传完——遮罩窗一出现高亮框就在
        const g = await shotGeometry();
        if (mySession !== sessionRef.current) break;
        setGeom(g);
        if (!g) break;
        if (g.snap) {
          const s = { x: g.snap.x, y: g.snap.y, w: g.snap.width, h: g.snap.height };
          setSnap(s);
          snapRef.current = s;
          // 预填识别缓存：光标未离开该窗口前悬停查询零开销
          lastRectRef.current = { x: s.x + g.x, y: s.y + g.y, w: s.w, h: s.h };
        } else if (g.prefill) {
          // 智能识别未命中时才回退到记忆区域（Snipaste 行为：优先智能识别）
          const r = { x: g.prefill.x, y: g.prefill.y, w: g.prefill.width, h: g.prefill.height };
          setRegion(r); regRef.current = r; setPhase("selected");
        }
        // 遮罩+高亮是纯 SVG/DOM：画好即可亮窗（冻结画面由 Rust 原生冻结层直接贴出）
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        await shotReady().catch(() => {});
        // 帧数据后台加载进 bg canvas：供放大镜与输出合成，不阻塞显示。
        // 必须带超时兜底：自定义协议 fetch / IPC 兜底一旦挂起，frameReady 永不
        // resolve → doOutput 卡死 → 遮罩永不隐藏 → 全屏吞输入（历史卡死根因）。
        frameReadyRef.current = (async () => {
          try {
            const ac = new AbortController();
            const ft = setTimeout(() => ac.abort(), 8000);
            const resp = await fetch(shotFrameUrl(g.index), { signal: ac.signal }).catch(() => {
              // 协议不可用（挂起/超时/未注册）时抛错走 IPC 兜底
              throw new Error("frame protocol unavailable");
            });
            clearTimeout(ft);
            if (!resp.ok) throw new Error(`frame ${resp.status}`);
            const bmp = await createImageBitmap(await resp.blob());
            // 旧会话迟到的帧：直接丢弃，绝不画进本会话画布
            if (mySession !== sessionRef.current) { bmp.close(); return; }
            const c = bgRef.current;
            if (c && bmp.width === g.width && bmp.height === g.height) {
              c.width = g.width; c.height = g.height;
              c.getContext("2d")!.drawImage(bmp, 0, 0);
              setBgReady(true);
            }
            bmp.close();
          } catch {
            try {
              const buf = await shotImageDataRaw();
              if (mySession !== sessionRef.current) return;
              const bytes = new Uint8ClampedArray(buf);
              if (bytes.length === g.width * g.height * 4) {
                // Rust 端存的是 BGRA，这里换回 RGBA
                for (let i = 0; i < bytes.length; i += 4) {
                  const b = bytes[i]; bytes[i] = bytes[i + 2]; bytes[i + 2] = b;
                }
                const c = bgRef.current;
                if (c) {
                  c.width = g.width; c.height = g.height;
                  c.getContext("2d")!.putImageData(new ImageData(bytes, g.width, g.height), 0, 0);
                  setBgReady(true);
                }
              }
            } catch {}
          }
        })();
      } catch {}
      if (!rerunRef.current) break;
    }
    loadingRef.current = false;
  };

  useEffect(() => { loadSession(); }, []);
  // 遮罩窗被 Rust 复用时收到刷新事件 → 重载新画面（窗口不销毁，免去重建开销）
  useEffect(() => {
    const un = listen("shot-refresh", () => { loadSession(); });
    return () => { un.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (!geom || !bgReady) return;
    const c = annoRef.current; if (!c) return;
    c.width = geom.width; c.height = geom.height;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, geom.width, geom.height);
    annos.forEach((s) => drawShape(ctx, s, bgRef.current, mosaicCacheRef.current));
  }, [annos, geom, bgReady]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // 文字标注输入中：不触发截图快捷键（Enter/Escape 由输入框自行处理）
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") { e.preventDefault(); void shotCancel().catch(() => {}); }
      else if (e.key === "Enter" && phase === "selected") { e.preventDefault(); if (!e.repeat) void doOutput("copy"); }
      // 字母键用 e.code 判定：中文输入法激活时 e.key 可能是 "Process"，e.code 始终是物理键
      else if (e.code === "KeyC" && e.ctrlKey && phase === "selected") { e.preventDefault(); if (!e.repeat) void doOutput("copy"); }
      else if (e.code === "KeyT" && (e.ctrlKey || (!e.ctrlKey && !e.altKey && !e.shiftKey)) && phase === "selected") { e.preventDefault(); if (!e.repeat) void doOutput("pin"); }
      // F8 贴图：与全局热键（贴图显示/隐藏）语义区分——截图模式中 Rust 侧会忽略
      // 全局 F8（见 shortcut.rs pins 分支的 shooting 判断），此处 F8 = 把选区贴到桌面
      else if (e.code === "F8" && phase === "selected") { e.preventDefault(); if (!e.repeat) void doOutput("pin"); }
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault(); const d = e.shiftKey ? 10 : 1;
        const r = {...regRef.current};
        if (e.key === "ArrowLeft") r.x -= d; else if (e.key === "ArrowRight") r.x += d;
        else if (e.key === "ArrowUp") r.y -= d; else r.y += d;
        setRegion(r); regRef.current = r;
      } else if (e.code === "KeyZ" && e.ctrlKey && !e.shiftKey) {
        e.preventDefault(); if (annos.length > 0) { setUndos((u)=>[...u,[...annos]]); setAnnos((a)=>a.slice(0,-1)); }
      } else if (e.code === "KeyZ" && e.ctrlKey && e.shiftKey) {
        e.preventDefault(); if (undos.length > 0) { setAnnos(undos[undos.length-1]); setUndos((u)=>u.slice(0,-1)); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [phase, annos, undos]);

  const toCanvas = (e: React.MouseEvent): Pt => {
    const r = bgRef.current?.getBoundingClientRect();
    if (!r || !geom) return {x:0,y:0};
    return { x: Math.round((e.clientX - r.left) * geom.width / r.width), y: Math.round((e.clientY - r.top) * geom.height / r.height) };
  };

  // 智能识别在途/待补查状态 + 上次命中窗口缓存（全局坐标）：
  // 光标还在同一窗口内时零 IPC 开销；跨窗瞬间只发一次查询，杜绝乱序覆盖
  const detectBusyRef = useRef(false);
  const detectPendingRef = useRef(false);
  const mouseGlobalRef = useRef<Pt>({x:0,y:0});
  const lastRectRef = useRef<{x:number;y:number;w:number;h:number}|null>(null);
  // 最近一次智能高亮矩形（本地坐标）。mousedown 会把可视 snap 清掉，
  // 但点击确认选区仍需它——松手时按此判定"点击采纳窗口"（Snipaste 行为）
  const snapRef = useRef<Rect|null>(null);

  const querySmartRect = async () => {
    if (detectBusyRef.current) { detectPendingRef.current = true; return; }
    detectBusyRef.current = true;
    try {
      const g = geom;
      const mg = mouseGlobalRef.current;
      if (!g) return;
      const r = await shotWindowRectAt(mg.x, mg.y);
      // 响应期间光标又动了：立即补查最新位置（保证高亮始终跟随当前窗口）
      if (detectPendingRef.current) {
        detectPendingRef.current = false;
        detectBusyRef.current = false;
        void querySmartRect();
        return;
      }
      lastRectRef.current = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      const local = r ? { x: r.x - g.x, y: r.y - g.y, w: r.width, h: r.height } : null;
      snapRef.current = local;
      setSnap(local);
    } catch {} finally {
      detectBusyRef.current = false;
    }
  };

  // 拖动/缩放的视觉更新经 rAF 合并：一帧内多次 mousemove 只渲染一次，
  // 范围框才能跟手（直接 setState 会因 React 调度产生可感知延迟）
  const moveRafRef = useRef(0);
  const movePtRef = useRef<Pt>({x:0,y:0});
  // 放大镜命令式节点：位置/坐标文本/画布采样全部直改，不经 React
  const magBoxRef = useRef<HTMLDivElement>(null);
  const magCanvasRef = useRef<HTMLCanvasElement>(null);
  const magCoordRef = useRef<HTMLSpanElement>(null);
  // geom 镜像：rAF 回调闭包里读最新几何（state 闭包会过期）
  const geomRef = useRef(geom);
  useEffect(() => { geomRef.current = geom; }, [geom]);
  // phase 镜像：rAF 回调里判断当前阶段（选区确认后放大镜立即退场，
  // 否则它叠在刚出现的按钮栏旁边会造成视觉闪动）
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // 放大镜逐帧绘制（在 applyMoveVisual 的 rAF 里调用）：
  // 直改 style + canvas.drawImage 采样冻结帧，无 setState → 拖动零重渲染
  const drawMagnifier = () => {
    const box = magBoxRef.current, c = magCanvasRef.current;
    const g = geomRef.current;
    if (!box || !c || !g || !bgRef.current) return;
    const m = mouseRef.current;
    box.style.left = `${m.x < g.width - MAG - 20 ? m.x + 20 : m.x - MAG - 20}px`;
    box.style.top = `${m.y < g.height - MAG - 40 ? m.y + 20 : m.y - MAG - 40}px`;
    c.width = MAG; c.height = MAG;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const src = MAG / MAG_Z;
    ctx.clearRect(0, 0, MAG, MAG);
    ctx.drawImage(bgRef.current, m.x - src/2, m.y - src/2, src, src, 0, 0, MAG, MAG);
    // center cross
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(MAG/2,0); ctx.lineTo(MAG/2,MAG); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,MAG/2); ctx.lineTo(MAG,MAG/2); ctx.stroke();
    if (magCoordRef.current) magCoordRef.current.textContent = `(${m.x},${m.y})`;
  };

  const applyMoveVisual = (pt: Pt) => {
    mouseRef.current = pt;
    // 放大镜只在选区阶段（idle）有意义：确认选区后继续跟随只会在
    // 按钮栏旁边晃动，看起来像"闪一下"；selected 阶段立即退场
    if (phaseRef.current === "idle") { setShowMag(true); drawMagnifier(); }
    if (resizeRef.current) {
      // 手柄缩放：按住的方向调整对应边，最小 2px
      const { hx, hy, start, startPt } = resizeRef.current;
      const dx = pt.x - startPt.x, dy = pt.y - startPt.y;
      let x = start.x, y = start.y, w = start.w, h = start.h;
      if (hx === -1) { x = start.x + dx; w = start.w - dx; }
      else if (hx === 1) { w = start.w + dx; }
      if (hy === -1) { y = start.y + dy; h = start.h - dy; }
      else if (hy === 1) { h = start.h + dy; }
      // 越过对边时翻转矩形
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
      if (w >= 2 && h >= 2) { const r = {x,y,w,h}; setRegion(r); regRef.current = r; }
      return;
    }
    if (phase === "idle" && dragRef.current) {
      const s = dragRef.current;
      const r = { x: Math.min(s.x,pt.x), y: Math.min(s.y,pt.y), w: Math.abs(pt.x-s.x), h: Math.abs(pt.y-s.y) };
      setRegion(r); regRef.current = r;
      // 真正拖出选区（超过几像素）后才清掉智能高亮：点击采纳场景全程保持高亮，
      // 视觉无缝过渡为选区；拖拽场景则在新选区成形时让旧高亮退场
      if ((r.w > 6 || r.h > 6) && snapRef.current) { snapRef.current = null; setSnap(null); }
    }
  };

  const onMove = (e: React.MouseEvent) => {
    const pt = toCanvas(e);
    if (geom) mouseGlobalRef.current = { x: pt.x + geom.x, y: pt.y + geom.y };
    movePtRef.current = pt;
    if (!moveRafRef.current) {
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0;
        applyMoveVisual(movePtRef.current);
      });
    }
    if (phase === "idle" && !dragRef.current && cfg.shot.smart_detect && geom) {
      const mg = mouseGlobalRef.current;
      const lr = lastRectRef.current;
      // 命中缓存：光标仍在识别过的窗口内，跳过查询（悬停零开销）。
      // 全屏级矩形（桌面）不缓存——否则光标永远"在框内"，再移到窗口上也不会重新识别
      const coversScreen = lr ? lr.w * lr.h >= geom.width * geom.height * 0.9 : false;
      if (lr && !coversScreen && mg.x >= lr.x && mg.x < lr.x + lr.w && mg.y >= lr.y && mg.y < lr.y + lr.h) return;
      void querySmartRect();
    }
  };

  const HANDLE_HIT = 8;
  const hitHandle = (pt: Pt): [number, number] | null => {
    if (phase !== "selected") return null;
    const r = regRef.current;
    const xs: [number, number][] = [[r.x, -1], [r.x + r.w / 2, 0], [r.x + r.w, 1]];
    const ys: [number, number][] = [[r.y, -1], [r.y + r.h / 2, 0], [r.y + r.h, 1]];
    for (const [py, hy] of ys) for (const [px, hx] of xs) {
      if (hx === 0 && hy === 0) continue;
      if (Math.abs(pt.x - px) <= HANDLE_HIT && Math.abs(pt.y - py) <= HANDLE_HIT) return [hx, hy];
    }
    return null;
  };

  /** 提交当前文字编辑（读 ref 不读 state：点击别处触发时闭包不过期、内容不丢） */
  const commitText = () => {
    const te = textEditRef.current;
    if (te && te.value.trim()) {
      setAnnos((arr)=>[...arr, { kind:"text", x1:te.x, y1:te.y, x2:te.x, y2:te.y,
        color, width: sw, text: te.value }]);
    }
    setTextEdit(null);
  };

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // 编辑中的文字先落盘：点击别处=确认上一条并继续下一步操作（内容不丢）
    if (textEditRef.current) commitText();
    const pt = toCanvas(e);
    if (phase === "selected" && tool === "text") {
      // 文字工具：点击位置弹出输入框，Enter 或"确定"提交；Esc 取消
      setTextEdit({ x: pt.x, y: pt.y, value: "" });
      return;
    }
    if (phase === "selected" && tool !== "select") {
      const a: Anno = { kind: tool, x1:pt.x, y1:pt.y, x2:pt.x, y2:pt.y, color, width: sw,
        points: (tool==="brush"||tool==="mosaic") ? [pt] : undefined,
        num: tool==="number" ? numCnt : undefined };
      if (tool==="number") setNumCnt((n)=>n+1);
      setAnnos((arr)=>[...arr, a]);
      const onM = (ev: MouseEvent) => {
        const rc = bgRef.current?.getBoundingClientRect(); if (!rc||!geom) return;
        const mx = Math.round((ev.clientX-rc.left)*geom.width/rc.width);
        const my = Math.round((ev.clientY-rc.top)*geom.height/rc.height);
        setAnnos((arr)=>{ const last=[...arr]; const s={...last[last.length-1]}; s.x2=mx;s.y2=my;
          if(s.points)s.points=[...s.points,{x:mx,y:my}]; last[last.length-1]=s; return last; });
      };
      const onU = () => { window.removeEventListener("mousemove",onM); window.removeEventListener("mouseup",onU); };
      window.addEventListener("mousemove",onM); window.addEventListener("mouseup",onU);
      return;
    }
    if (phase === "selected") {
      const hnd = hitHandle(pt);
      if (hnd) { resizeRef.current = { hx:hnd[0], hy:hnd[1], start:{...regRef.current}, startPt:pt }; return; }
    }
    downPtRef.current = pt;
    // 注意1：这里只清可视 snap 的【引用时机】推迟到真正拖动时——点击采纳
    // 窗口的短暂按下期间必须保持高亮原样，否则按下瞬间高亮消失、整屏变暗，
    // 松手才恢复（"圈定区域闪一下、边框消失又出现"的根因）
    // 注意2：不清 snapRef——松手时"点击采纳窗口"还要用它
    dragRef.current = pt; setTextEdit(null); setPhase("idle"); setDragging(true);
    lastRectRef.current = null;
  };

  const onUp = (e: React.MouseEvent) => {
    // 取消未执行的 rAF 并同步应用最后位置，避免松手时选区落后一帧
    if (moveRafRef.current) { cancelAnimationFrame(moveRafRef.current); moveRafRef.current = 0; }
    applyMoveVisual(toCanvas(e));
    if (resizeRef.current) { resizeRef.current = null; shotSaveRegion([regRef.current.x+(geom?.x??0),regRef.current.y+(geom?.y??0),regRef.current.w,regRef.current.h]); return; }
    if (!dragRef.current) return;
    setDragging(false);
    const pt = toCanvas(e); const s = dragRef.current; dragRef.current = null;
    // 点击（几乎未拖动）且此前有智能高亮窗口：直接采纳该窗口为选区并显示工具栏
    const moved = downPtRef.current ? Math.abs(pt.x-downPtRef.current.x)+Math.abs(pt.y-downPtRef.current.y) : 999;
    downPtRef.current = null;
    if (moved < 4 && snapRef.current && phase === "idle") {
      const r = snapRef.current;
      snapRef.current = null;
      setRegion(r); regRef.current = r; setPhase("selected");
      shotSaveRegion([r.x+(geom?.x??0),r.y+(geom?.y??0),r.w,r.h]);
      return;
    }
    const r = {x:Math.min(s.x,pt.x),y:Math.min(s.y,pt.y),w:Math.abs(pt.x-s.x),h:Math.abs(pt.y-s.y)};
    if (r.w > 2 && r.h > 2) { setRegion(r); regRef.current = r; setPhase("selected");
      shotSaveRegion([r.x+(geom?.x??0),r.y+(geom?.y??0),r.w,r.h]); }
    else setPhase("idle");
  };

  // 选区 PNG 预编码缓存：选区/标注稳定后空闲时提前编码，
  // 点击复制/贴图/保存时直接取用（toBlob 由 Chromium 后台线程编码，不卡 UI）
  const pngCacheRef = useRef<{ key: string; blob: Blob } | null>(null);

  const selectionKey = () => {
    const r = regRef.current;
    return [r.x, r.y, r.w, r.h, annos.length,
      annos.map((a) => `${a.kind}:${a.x1},${a.y1},${a.x2},${a.y2},${a.points?.length ?? 0}:${a.num ?? ""}`).join("|"),
    ].join("#");
  };

  /** 合成选区画布（冻结帧裁剪 + 标注叠加）并异步编码为 PNG Blob。
   *  旧版 toDataURL 是同步编码：大区域点"贴图"会冻住遮罩页数秒 */
  const encodeSelection = async (): Promise<Blob> => {
    const r = regRef.current;
    const c = document.createElement("canvas");
    c.width = r.w; c.height = r.h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bgRef.current!, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    if (annos.length > 0) {
      const ac = document.createElement("canvas"); ac.width = r.w; ac.height = r.h;
      const actx = ac.getContext("2d")!;
      actx.translate(-r.x, -r.y);
      annos.forEach((s) => drawShape(actx, s, bgRef.current, mosaicCacheRef.current));
      ctx.drawImage(ac, 0, 0);
    }
    return new Promise((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob null"))), "image/png"));
  };

  // 选定后内容一有变化就安排一次空闲预编码
  useEffect(() => {
    if (phase !== "selected" || dragging || textEdit) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (regRef.current.w <= 0 || regRef.current.h <= 0 || !bgRef.current) return;
      const key = selectionKey();
      if (pngCacheRef.current?.key !== key) {
        try { const blob = await encodeSelection(); if (!cancelled && pngCacheRef.current?.key !== key) pngCacheRef.current = { key, blob }; } catch {}
      }
    }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  // 显式依赖：仅在选区/标注/工具参数真正变化时重新调度。
  }, [phase, dragging, textEdit, annos, region, sw, color]);

  const doOutput = async (action: "copy"|"save"|"pin") => {
    // 单飞：按住 Ctrl+T 自动重复或快速连点不会并发输出多份
    if (outputtingRef.current) return;
    outputtingRef.current = true;
    try {
      // 极快确认（呼出瞬间回车）时帧可能尚未加载进 canvas：等它就绪再合成。
      // 5s 兜底：帧加载异常挂起时也继续输出流程（遮罩必收，绝不卡死在屏幕）
      try {
        await Promise.race([
          frameReadyRef.current,
          new Promise<void>((r) => setTimeout(r, 5000)),
        ]);
      } catch {}
      if (!bgRef.current || !geom) return;
      // 读 ref 而非 state：键盘 handler 闭包可能捕获旧 render 的 doOutput，
      // 方向键移动选区后 region state 未触发重注册，state 会是过期值
      const r = regRef.current;
      if (r.w <= 0 || r.h <= 0) return;
      // 命中预编码缓存则零等待；未命中才编码
      const key = selectionKey();
      let blob = pngCacheRef.current?.key === key ? pngCacheRef.current.blob : null;
      if (!blob) { try { blob = await encodeSelection(); } catch { return; } }
      const gx = r.x + geom.x, gy = r.y + geom.y;
      let sent = false;
      try {
        if (action === "pin") {
          await shotOutputPost("pin", blob, { x: gx, y: gy }); sent = true;
        } else if (action === "copy") {
          await shotOutputPost("copy", blob); sent = true;
        } else {
          // 另存为：系统保存对话框选位置与文件名；取消则留在截图继续编辑
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const base = cfg.shot.save_dir ? cfg.shot.save_dir.replace(/[\\/]+$/, "/") : "";
          const picked = await save({
            defaultPath: `${base}screenshot-${ts}.png`,
            filters: [{ name: "PNG 图片", extensions: ["png"] }],
          });
          if (!picked) return;
          await shotOutputPost("save", blob, { path: picked }); sent = true;
        }
      } finally {
        // 双保险收遮罩：Rust 端成功后已 hide_all，这里幂等地再收一次——
        // 确保任何情况下全屏遮罩都不会滞留屏幕吞掉整个桌面的点击
        if (sent) await shotCancel().catch(() => {});
      }
    } catch (e) {
      void diagLog(`[shot] output ${action} failed: ${String(e)}`);
      // 兜底：输出失败也必须收起遮罩
      await shotCancel().catch(() => {});
    } finally {
      outputtingRef.current = false;
    }
  };

  // render
  if (!geom) return null;
  const displayW = "100vw", displayH = "100vh";

  return (
    <div className="shot-overlay" style={{width:displayW,height:displayH,position:"fixed",top:0,left:0,overflow:"hidden",cursor:"crosshair"}}
      onWheel={(ev) => {
        // 选区阶段滚轮=无级调节画笔粗细（1~24px，一格 1px，与速度无关）；
        // 面板里的三挡位保留作为快捷预设
        if (phase !== "selected" || textEdit) return;
        const dir = ev.deltaY > 0 ? -1 : 1;
        const nv = Math.min(24, Math.max(1, sw + dir));
        setSw(nv); setSwBadge(nv);
        window.clearTimeout(swBadgeTimer.current);
        swBadgeTimer.current = window.setTimeout(() => setSwBadge(null), 800);
      }}>
      <canvas ref={bgRef} style={{position:"absolute",top:0,left:0,width:displayW,height:displayH,imageRendering:"auto"}} />
      <canvas ref={annoRef} style={{position:"absolute",top:0,left:0,width:displayW,height:displayH,pointerEvents:"none"}} />

      {/* dim mask + selection cutout（选中区/拖拽中的选区/智能高亮区保持原亮度，其余压暗） */}
      <svg style={{position:"absolute",top:0,left:0,width:displayW,height:displayH,pointerEvents:"none"}}>
        <defs><mask id="selMask">
          <rect width="100%" height="100%" fill="white" />
          {(phase==="selected" || dragging) && <rect x={region.x} y={region.y} width={region.w} height={region.h} fill="black" />}
          {phase==="idle" && snap && <rect x={snap.x} y={snap.y} width={snap.w} height={snap.h} fill="black" />}
        </mask></defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#selMask)" />
        {snap && phase==="idle" && (
          <rect x={snap.x} y={snap.y} width={snap.w} height={snap.h} fill="none" stroke="#4c8dff" strokeWidth="2" />
        )}
        {(phase==="selected" || dragging) && (
          <rect x={region.x} y={region.y} width={region.w} height={region.h} fill="none" stroke="#4c8dff" strokeWidth="1.5" />
        )}
        {phase==="selected" && (
          <>
            {/* 8 handles */}
            {[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]].map(([hx,hy],i) => {
              const hx2 = region.x + (hx===-1?0:hx===1?region.w:region.w/2);
              const hy2 = region.y + (hy===-1?0:hy===1?region.h:region.h/2);
              return <rect key={i} x={hx2-4} y={hy2-4} width={8} height={8} fill="#fff" stroke="#4c8dff" strokeWidth="1" style={{cursor:"pointer"}} />;
            })}
          </>
        )}
      </svg>

      {/* mouse handlers layer */}
      <div style={{position:"absolute",top:0,left:0,width:displayW,height:displayH,zIndex:10}}
        onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={()=>setShowMag(false)} />

      {/* 文字标注编辑器：透明底 + 白边框（Snipaste 风格），autoFocus 光标
          直接入框；onMouseDown 拦截冒泡——点击编辑器内部绝不会落到画布层
          误触选区。Enter 提交 / Esc 取消 / 点击别处自动提交 */}
      {textEdit && (() => {
        const bgRect = bgRef.current?.getBoundingClientRect();
        const scale = bgRect ? bgRect.width / geom.width : 1;
        const vw = window.innerWidth, vh = window.innerHeight;
        const ex = Math.min(Math.max(textEdit.x * scale, 4), Math.max(4, vw - 200));
        const ey = Math.min(Math.max(textEdit.y * scale, 4), Math.max(4, vh - 50));
        return (
          <div className="shot-text-editor" style={{ left: ex, top: ey }}
            onMouseDown={(ev)=>ev.stopPropagation()} onMouseUp={(ev)=>ev.stopPropagation()}>
            <input autoFocus value={textEdit.value}
              placeholder="输入文字，Enter 确定"
              onChange={(ev)=>setTextEdit({ ...textEditRef.current!, value: ev.target.value })}
              onKeyDown={(ev)=>{
                // 中文输入法合成期间（选候选词）的 Enter/Escape 不做提交/关闭，
                // 否则打字到一半回车上屏候选词会把标注一起提交、输入框被关掉
                if (ev.nativeEvent.isComposing) { ev.stopPropagation(); return; }
                if (ev.key==="Enter") { ev.preventDefault(); commitText(); }
                else if (ev.key==="Escape") setTextEdit(null);
                ev.stopPropagation();
              }} />
          </div>
        );
      })()}

      {/* magnifier（命令式绘制：位置/坐标/采样由 drawMagnifier 在 rAF 直改，
          组件不因鼠标移动重渲染；拖动中关闭以减少每帧开销） */}
      {showMag && bgReady && phase==="idle" && !dragging && cfg.shot.magnifier && (
        <div ref={magBoxRef} className="shot-mag" style={{
          position:"fixed", left:-9999, top:-9999,
          width: MAG, height: MAG + 28, pointerEvents:"none",
        }}>
          <canvas ref={magCanvasRef} />
          <div className="shot-mag-info" style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#fff",padding:"2px 4px"}}>
            <span ref={magCoordRef}>(0,0)</span>
            <span style={{display:"inline-block",width:14,height:14,background:color,borderRadius:2,border:"1px solid #fff",verticalAlign:"middle"}} />
          </div>
        </div>
      )}

      {/* toolbar：贴在选区右下角外侧；下方空间不足时放进选区内右下角。
          主条只放 [工具|撤销重做|动作]，颜色/粗细收纳进子面板——选中某个
          标注工具时才在其下方弹出对应配置，主条更短更稳不再错乱。
          【右缘锚定】不依赖工具条实测宽度：宽度测量回环（按估宽渲染→实测
          →重渲染换位）正是确认选区瞬间工具条"跳一下/闪一下"的来源，
          右锚定后首帧即最终位置 */}
      {phase === "selected" && (() => {
        const bgRect = bgRef.current?.getBoundingClientRect();
        const scale = bgRect ? bgRect.width / geom.width : 1;
        const vw = window.innerWidth, vh = window.innerHeight;
        const rightEdge = (region.x + region.w) * scale;
        const rightPx = Math.min(Math.max(vw - rightEdge, 8), Math.max(8, vw - 60));
        const outsideY = (region.y + region.h) * scale + 8;
        const insideY = (region.y + region.h) * scale - 40;
        const ty = outsideY + 32 <= vh - 6 ? outsideY : Math.max(insideY, 8);
        return (
          <div className="shot-toolbar-float" style={{ right: rightPx, top: ty }}>
            <div className="shot-toolbar">
              <div className="shot-toolbar-group">
                {TOOLS.map(([t, Ic, label]) => (
                  <button key={t} className={tool===t?"active":""} onClick={()=>setTool(t)} title={label}>
                    <Ic />
                  </button>
                ))}
              </div>
              <div className="shot-toolbar-sep" />
              <div className="shot-toolbar-group">
                <button onClick={()=>{if(annos.length>0){setUndos(u=>[...u,[...annos]]);setAnnos(a=>a.slice(0,-1));}}} disabled={annos.length===0} title="撤销 (Ctrl+Z)"><IcoUndo/></button>
                <button onClick={()=>{if(undos.length>0){setAnnos(undos[undos.length-1]);setUndos(u=>u.slice(0,-1));}}} disabled={undos.length===0} title="重做 (Ctrl+Shift+Z)"><IcoRedo/></button>
              </div>
              <div className="shot-toolbar-sep" />
              <div className="shot-toolbar-group shot-toolbar-actions">
                <button className="shot-btn-primary" onClick={()=>doOutput("copy")} title="复制 (Enter)"><IcoCopy/></button>
                <button className="shot-btn-pin" onClick={()=>doOutput("pin")} title="贴图 (Ctrl+T)"><IcoPin/></button>
                <button onClick={()=>doOutput("save")} title="另存为..."><IcoSaveAs/></button>
                <button onClick={()=>void shotCancel().catch(()=>{})} title="取消 (Esc)"><IcoClose/></button>
              </div>
            </div>
            {NEEDS_CONFIG.includes(tool) && (
              <div className="shot-toolbar-panel">
                <span className="shot-panel-label">颜色</span>
                {(cfg.annotate?.colors||["#e5484d","#ff8d1a","#ffd60a","#36b37e","#4c8dff","#b06fd6","#ffffff","#000000"]).map((c) => (
                  <button key={c} className={`shot-color-btn${color===c?" active":""}`}
                    style={{background:c}} onClick={()=>setColor(c)} />
                ))}
                <span className="shot-panel-label">粗细</span>
                {/* 单圆点=当前粗细的直观映射：鼠标悬停其上滚动滚轮即无级缩放
                    （1~24px 连续等级），圆点本身随数值放大缩小 */}
                <button className="shot-sw-wheel" title="悬停滚动滚轮调节粗细（1~24px 无级）"
                  onWheel={(ev) => {
                    ev.stopPropagation();
                    const dir = ev.deltaY > 0 ? -1 : 1;
                    const nv = Math.min(24, Math.max(1, sw + dir));
                    setSw(nv); setSwBadge(nv);
                    window.clearTimeout(swBadgeTimer.current);
                    swBadgeTimer.current = window.setTimeout(() => setSwBadge(null), 800);
                  }}>
                  <span style={{ width: Math.min(4 + sw * 1.2, 26), height: Math.min(4 + sw * 1.2, 26) }} />
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* 滚轮调粗细时的即时反馈徽标 */}
      {swBadge != null && (
        <div className="shot-sw-badge">画笔粗细 {swBadge}px</div>
      )}

      {/* initial hint */}
      {phase === "idle" && !dragging && (
        <div className="shot-hint">
          {cfg.shot.smart_detect ? "点击窗口直接截取，或拖拽自定义区域 | Esc 取消" : "拖拽选择截图区域 | Esc 取消"}
        </div>
      )}
      {/* 选区确定后：明确告知贴图/复制快捷键——按错键不迷茫 */}
      {phase === "selected" && !textEdit && (
        <div className="shot-hint">
          <b>F8</b> 贴图 · <b>Ctrl+T</b> 贴图 · <b>Ctrl+C</b> 复制 · <b>Enter</b> 复制 · <b>Esc</b> 取消
        </div>
      )}
    </div>
  );
}
