/** Fullscreen screenshot overlay: frozen screen + selection + magnifier + toolbar */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import {
  shotGeometry, shotImageDataRaw, shotWindowRectAt, shotUiRectAt, shotReady, shotFrameUrl,
  shotOutputPost, shotPinPost, shotCropOutput, shotCancel, shotSaveRegion, diagLog, copyText,
  shotDragBegin, shotDragEnd,
  shotHistoryList, shotHistoryStep, shotHistoryUrl, ShotHistItem, shotHistorySaveRegion,
  shotHistoryDelete, shotHistoryClear,
  shotOcrPost, ShotOcrLine,
} from "../../core/tauri";
import { translateLines } from "../../core/tauri";
import { EVT_TRANSLATE_LINE } from "../../core/events";
import { useConfigStore } from "../../stores/configStore";
import { scrollBegin } from "../scrollshot/api";
import { Pencil, Undo2, Redo2, X, Download, Copy } from "lucide-react";
import { ARROW_ICON_PATH } from "./arrow-path.const";
import "./screenshot.css";

type Tool = "select"|"rect"|"ellipse"|"arrow"|"line"|"brush"|"mosaic"|"text"|"number";
type Phase = "idle"|"selected";
interface Pt { x: number; y: number; }
interface Rect { x: number; y: number; w: number; h: number; }
interface Anno {
  kind: Tool; x1: number; y1: number; x2: number; y2: number;
  color: string; width: number; points?: Pt[]; text?: string; num?: number;
  /** 马赛克笔画专属：落下顺序号，索引「当时画面」快照（时序马赛克） */
  sid?: number;
}

const MAG = 168, MAG_Z = 2;
/** 放大镜整体宽度：与镜头同宽（168px，镜头适当放大），镜头左右不留卡片边条。
 *  168px 下信息区一行可放下「色块 + RGB 色值(255 , 255 , 255) + 格式徽标」，
 *  无需换行；此前 140px 时 RGB 色值放不下会挤压/换行（用户反馈文字排列不齐）。
 *  位置翻转阈值同样按此宽度计算 */
const MAG_BOX_W = 168;

/* 画布位图(物理像素)与 CSS 像素的比例由组件内的 cssScale() 提供（见下方定义），
   统一在「往画布画 / 采样冻结帧」两处边界乘以它——彻底消除高 DPI（150%）下
   矩形右下角随光标漂移（旧版每个消费点各自推导比例、一处偏差整体错位）。
   所有 UI 坐标（选区/标注/提示/工具栏定位）统一用【CSS 像素】存储与运算。 */

/* ---- 取色：颜色显示格式（Shift 切换）与文本格式化 ---- */
type ColorFmt = "rgb" | "hex";
const fmtHex = (c: [number, number, number]) =>
  "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
/** 面板展示：RGB 显示分量（Snipaste 式「20 , 20 , 20」）、HEX 显示 #RRGGBB */
const fmtDisplay = (c: [number, number, number], fmt: ColorFmt) =>
  fmt === "hex" ? fmtHex(c) : `${c[0]} , ${c[1]} , ${c[2]}`;
/** 复制文本跟随当前显示格式：RGB → "rgb(20,20,20)"，HEX → "#141414" */
const fmtCopy = (c: [number, number, number], fmt: ColorFmt) =>
  fmt === "hex" ? fmtHex(c) : `rgb(${c[0]},${c[1]},${c[2]})`;

/* ---- 工具图标：Lucide React 矢量图标（Snipaste 同风格描线），统一 22px / strokeWidth 2。
   两个组合图标（形状组、线组）由 Lucide 单图标叠合而成 ---- */
const IC = { size: 22, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
// 矩形：圆角矩形，比上一版整体放大（更占满画布、识别度更高）；与形状组 IcoShape 视觉一致
const IcoRect = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
  </svg>
);
// 椭圆（扁椭圆，比 Lucide 正圆 Circle 更扁、更接近\"椭圆\"语义）
const IcoEllipse = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="12" rx="11" ry="7.5" />
  </svg>
);
// 形状组图标：矩形（圆角）+ 椭圆叠合（Snipaste 第一格风格）。统一 22×22，
// 矩形加 rx 与其他自绘图标保持一致的圆润观感；viewBox 24×24，几何稍外推
const IcoShape = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2.5" y="4.5" width="14" height="11" rx="3.5"/>
    <circle cx="17" cy="16.5" r="5"/>
  </svg>
);
// 箭头：翼形流线箭头（尾部窄、头部宽），来自用户提供的企微风格箭头 PNG；
// trace 出来的水平 path 加 rotate(-45 12 12) 转到斜向上方向（粗端朝右上）
const IcoArrow = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d={ARROW_ICON_PATH} transform="rotate(-45 12 12)" />
  </svg>
);
// 直线：一条左下→右上的斜线（Lucide 无"纯直线"图标，TrendingUp 是折线+箭头，
// 曾被误用作直线图标）。自绘与 Lucide 描线风格一致
const IcoLine = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="4.5" y1="19.5" x2="19.5" y2="4.5" />
  </svg>
);
// 线组图标：折线+箭头叠合（Snipaste 第二格趋势线）。统一 22×22 与其他
// 图标对齐，去掉超尺寸浮起感
const IcoLineGroup = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 17 9 11 13 14 20 6"/>
    <polyline points="15 6 20 6 20 11"/>
  </svg>
);
const IcoBrush = () => <Pencil {...IC} />;
// 马赛克：一个圆角方框 + 左上/右下两个放大的填充格（像素化的对角示意）
const IcoMosaic = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4"/>
    <rect x="5.5" y="5.5" width="6" height="6" rx="1" fill="currentColor" stroke="none"/>
    <rect x="12.5" y="12.5" width="6" height="6" rx="1" fill="currentColor" stroke="none"/>
  </svg>
);
// 文字：一横 + 一竖的极简 T（Lucide Type 顶部带衬线端点的"刺"观感）
const IcoTextT = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="6" x2="19" y2="6" />
    <line x1="12" y1="6" x2="12" y2="19" />
  </svg>
);
// 序号：Lucide 无对应，保留精简自绘（描线风格统一）
const IcoNumber = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12.5 8.2V16"/><path d="M12.5 8.2L10.3 9.8"/>
  </svg>
);
// OCR 文字识别：四角取景框 + 文本行（自绘描线风格，Lucide 无对应）
const IcoOcr = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" />
    <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
    <path d="M21 16v2.5A2.5 2.5 0 0 1 18.5 21H16" />
    <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
    <path d="M7 9h4M13 9h4M7 12.5h2.5M14.5 12.5H17M7 16h4M13 16h4" />
  </svg>
);
const IcoUndo = () => <Undo2 {...IC} />;const IcoRedo = () => <Redo2 {...IC} />;
const IcoClose = () => <X {...IC} />;
// 贴图（pin to screen）：用户提供的实心贴图剪影一比一复刻（trace 自 PNG，
// 单路径 24×24 viewBox 居中 2.4KB 矢量）
import { PIN_ICON_PATH } from "./pin-path.const";
const IcoPin = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={PIN_ICON_PATH} />
  </svg>
);
const IcoSaveAs = () => <Download {...IC} />;
const IcoCopy = () => <Copy {...IC} />;
// 长截图：竖向长页面 + 一个向下箭头（表示继续往下滚动拼接）
const IcoLongShot = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3.5h10a2.5 2.5 0 0 1 2.5 2.5V19a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5V6a2.5 2.5 0 0 1 2.5-2.5Z"/>
    <path d="M12 8v5"/>
    <path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
  </svg>
);

/** 工具条按钮（Snipaste 式）：同类形状合并为一键，重复点击在组内循环切换
 *  （矩形→椭圆→矩形…），悬停提示「名称、名称 (Ctrl+N)」，Ctrl+数字直达。
 *  每组图标带主题色：常态即彩色描边，激活时同色底+白色描边 */
const TOOL_BUTTONS: { items: [Tool, () => JSX.Element, string, string][]; groupIcon?: () => JSX.Element; hotkey: string }[] = [
  // 形状组：未激活显示组合图标（IcoShape），激活后显示当前子工具图标
  { items: [["rect", IcoRect, "矩形", "#64d2ff"], ["ellipse", IcoEllipse, "椭圆", "#64d2ff"]], groupIcon: IcoShape, hotkey: "Ctrl+1" },
  // 线组：箭头排前面（默认选中箭头，更常用）
  { items: [["arrow", IcoArrow, "箭头", "#32d74b"], ["line", IcoLine, "直线", "#32d74b"]], groupIcon: IcoLineGroup, hotkey: "Ctrl+2" },
  { items: [["brush", IcoBrush, "画笔", "#ff9f0a"]], hotkey: "Ctrl+3" },
  { items: [["mosaic", IcoMosaic, "马赛克", "#bf5af2"]], hotkey: "Ctrl+4" },
  { items: [["text", IcoTextT, "文字", "#ffd60a"]], hotkey: "Ctrl+5" },
  { items: [["number", IcoNumber, "序号", "#ff453a"]], hotkey: "Ctrl+6" },
];

/** 按钮的悬停提示文案：「矩形、椭圆 (Ctrl+1)」；单工具为「画笔 (Ctrl+3)」 */
const btnTip = (b: { items: [Tool, () => JSX.Element, string, string][]; hotkey: string }) =>
  `${b.items.map(([, , n]) => n).join("、")} (${b.hotkey})`;

/** 标注色板内置色（8 色）。自定义色在其后追加；自定义色上限 ANNO_MAX_CUSTOM */
const ANNO_DEFAULT_COLORS = ["#e5484d","#ff8d1a","#ffd60a","#36b37e","#4c8dff","#b06fd6","#ffffff","#000000"];
/** 自定义色上限：色板总长 = 内置 8 色 + 最多 6 个自定义（防色条无限变长） */
const ANNO_MAX_CUSTOM = 6;

// ---- 马赛克整图层缓存（模块级：drawShape 是模块函数，无组件状态） ----
// key = 底图画布（WeakMap 自动随画布回收）；帧内容变化时 bump mosaicFrameStamp
// 使旧层失效（换帧/新会话由 reloadFrameOnly / loadSession 递增）
interface MosaicLayer { bs: number; w: number; h: number; stamp: number; pix: HTMLCanvasElement }
const mosaicLayerCache = new WeakMap<HTMLCanvasElement, MosaicLayer>();
const mosaicScratch: { mask?: HTMLCanvasElement; comp?: HTMLCanvasElement } = {};
let mosaicFrameStamp = 0;
/** 帧内容已更换：马赛克整图层作废（下一帧重绘时重建） */
function invalidateMosaicLayer() { mosaicFrameStamp++; }

// ---- 时序马赛克快照 ----
// 每条马赛克笔画落下瞬间，把「当时的画面」（底图 + 先于它的全部标注）拍成
// 快照；重绘/导出时用快照做采样源——只像素化当时存在的内容，之后新加的
// 图形/文字不受影响、清晰盖在其上。key = 笔画的 sid（拖动中对象会被重建，
// 对象身份不可靠，顺序号稳定）
const mosaicSnapshots = new Map<number, HTMLCanvasElement>();
let mosaicSid = 0;
/** 换帧/新会话：旧快照全部作废（旧标注已清空，快照随之失效） */
function clearMosaicSnapshots() { mosaicSnapshots.clear(); }

function drawShape(
  ctx: CanvasRenderingContext2D,
  s: Anno,
  src?: HTMLCanvasElement | null,
  _mosaicCache?: Map<string, string>,
  scale = 1,
) {
  ctx.save();
  ctx.strokeStyle = s.color;
  // 标注坐标(x1/y1/x2/y2/points)均为【CSS 像素】，而传入的 ctx 画布位图是
  // 【物理像素】——统一乘以 scale 映射到物理位图。否则在 150% 等高 DPI 下
  // 画出来的形状整体偏小、右下角不跟光标（"画矩形错位"根因之一）
  ctx.lineWidth = Math.max(0.5, s.width * scale);
  ctx.fillStyle = s.color;
  const X1 = s.x1 * scale, Y1 = s.y1 * scale, X2 = s.x2 * scale, Y2 = s.y2 * scale;
  if (s.kind === "rect") {
    ctx.strokeRect(X1, Y1, X2 - X1, Y2 - Y1);
  } else if (s.kind === "ellipse") {
    const cx = (X1 + X2) / 2, cy = (Y1 + Y2) / 2;
    const rx = Math.abs(X2 - X1) / 2, ry = Math.abs(Y2 - Y1) / 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (s.kind === "arrow") {
    const dx = X2 - X1, dy = Y2 - Y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2 * scale) { ctx.restore(); return; }
    ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke();
    const angle = Math.atan2(dy, dx);
    const hl = Math.min(16 * scale, len * 0.3);
    ctx.beginPath();
    ctx.moveTo(X2, Y2);
    ctx.lineTo(X2 - hl * Math.cos(angle - 0.4), Y2 - hl * Math.sin(angle - 0.4));
    ctx.moveTo(X2, Y2);
    ctx.lineTo(X2 - hl * Math.cos(angle + 0.4), Y2 - hl * Math.sin(angle + 0.4));
    ctx.stroke();
  } else if (s.kind === "line") {
    ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke();
  } else if (s.kind === "brush" && s.points && s.points.length > 1) {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(s.points[0].x * scale, s.points[0].y * scale);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * scale, s.points[i].y * scale);
    ctx.stroke();
    } else if (s.kind === "mosaic" && s.points && s.points.length > 0 && src && src.width > 0) {
    // 真马赛克（像素化笔刷）——【整图层 + 蒙版合成】写法（tui.image-editor /
    // fabric.js 等开源画板的标准做法）：
    //   1) 整帧降采样成小图再关平滑放大回原尺寸 → 得到全图马赛克层
    //      （降采样的双线性平均 = 每格取平均色，与逐格 getImageData 等价）；
    //   2) 笔迹描成圆头粗线画进蒙版；
    //   3) 马赛克层 destination-in 蒙版 → 只在笔迹内透出像素块。
    // 全程 GPU 合成、无 getImageData、无逐格循环、无缓存失效问题——
    // 旧"逐格采样"方案在笔画定稿后缓存被清，此后每帧重绘都要对整个
    // 笔迹包围盒读像素（4K 下 30MB+ × 每帧 × 两层），越用越卡且偶发无效果。
    // 【时序采样源】有快照（笔画落下时拍下的当时画面）就用快照——
    // 先于它的图形/文字一并被像素化；无快照（拖动中）退化为底图
    const sampleSrc = (s.sid !== undefined ? mosaicSnapshots.get(s.sid) : undefined) ?? src;
    const bs = Math.max(4, 12 * scale);
    const W = sampleSrc.width, H = sampleSrc.height;
    // 1) 整图马赛克层（按 采样源+格子尺寸 缓存；快照内容不变故免失效戳）
    let layer = mosaicLayerCache.get(sampleSrc);
    if (!layer || layer.bs !== bs || layer.w !== W || layer.h !== H || (sampleSrc === src && layer.stamp !== mosaicFrameStamp)) {
      const pw = Math.max(1, Math.ceil(W / bs)), ph = Math.max(1, Math.ceil(H / bs));
      const pix = document.createElement("canvas");
      pix.width = pw; pix.height = ph;
      const pctx = pix.getContext("2d")!;
      pctx.imageSmoothingEnabled = true; // 降采样平滑 = 区域平均色
      pctx.drawImage(sampleSrc, 0, 0, pw, ph);
      layer = { bs, w: W, h: H, stamp: mosaicFrameStamp, pix };
      mosaicLayerCache.set(src, layer);
    }
    // 2) 笔迹蒙版 + 合成【只在笔迹包围盒内进行】：整屏大小的 clear/合成
    //    每帧 ×2 层在弱 GPU 上会拖垮整页（"一用马赛克就卡死"），包围盒
    //    通常只有笔迹那么大，成本与之成正比
    const pts = s.points!.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const pad = bs * 2.2;
    let bw2 = 0, bh2 = 0;
    let bx = Infinity, by = Infinity, bx2 = -Infinity, by2 = -Infinity;
    for (const p of pts) {
      bx = Math.min(bx, p.x); by = Math.min(by, p.y);
      bx2 = Math.max(bx2, p.x); by2 = Math.max(by2, p.y);
    }
    bx = Math.max(0, Math.floor(bx - pad)); by = Math.max(0, Math.floor(by - pad));
    bw2 = Math.min(W, Math.ceil(bx2 + pad)) - bx; bh2 = Math.min(H, Math.ceil(by2 + pad)) - by;
    if (bw2 <= 0 || bh2 <= 0) return;
    let mask = mosaicScratch.mask;
    if (!mask) { mask = document.createElement("canvas"); mosaicScratch.mask = mask; }
    if (mask.width !== bw2) mask.width = bw2;
    if (mask.height !== bh2) mask.height = bh2;
    const mctx = mask.getContext("2d")!;
    mctx.clearRect(0, 0, bw2, bh2);
    mctx.fillStyle = "#000"; mctx.strokeStyle = "#000";
    mctx.lineCap = "round"; mctx.lineJoin = "round";
    mctx.lineWidth = bs * 2.2;
    if (pts.length === 1) {
      mctx.beginPath(); mctx.arc(pts[0].x - bx, pts[0].y - by, bs * 1.1, 0, Math.PI * 2); mctx.fill();
    } else {
      mctx.beginPath();
      mctx.moveTo(pts[0].x - bx, pts[0].y - by);
      for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i].x - bx, pts[i].y - by);
      mctx.stroke();
    }
    // 3) 合成：马赛克层区域 ∩ 笔迹蒙版 → 贴回目标画布对应位置
    let comp = mosaicScratch.comp;
    if (!comp) { comp = document.createElement("canvas"); mosaicScratch.comp = comp; }
    if (comp.width !== bw2) comp.width = bw2;
    if (comp.height !== bh2) comp.height = bh2;
    const cc = comp.getContext("2d")!;
    cc.globalCompositeOperation = "source-over";
    cc.clearRect(0, 0, bw2, bh2);
    cc.imageSmoothingEnabled = false; // 放大不平滑 = 硬边像素块
    cc.drawImage(layer.pix, bx / bs, by / bs, bw2 / bs, bh2 / bs, 0, 0, bw2, bh2);
    cc.globalCompositeOperation = "destination-in";
    cc.drawImage(mask, 0, 0);
    cc.globalCompositeOperation = "source-over";
    ctx.drawImage(comp, bx, by);} else if (s.kind === "text" && s.text) {
    // 与编辑器输入框【完全一致】的字体/字号/行盒：16px 加粗、baseline=top
    // 对齐 DOM 行盒顶部；坐标取整避免亚像素渲染发虚
    ctx.font = `bold ${Math.round(16 * scale)}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(s.text, Math.round(X1), Math.round(Y1));
    ctx.textBaseline = "alphabetic";
  } else if (s.kind === "number" && s.num !== undefined) {
    const r = 14 * scale;
    ctx.beginPath(); ctx.arc(X1, Y1, r, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(s.num), X1, Y1);
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}

export function ScreenshotOverlay() {
  const [geom, setGeom] = useState<{index:number;x:number;y:number;width:number;height:number;picker:boolean}|null>(null);
  const [bgReady, setBgReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [region, setRegion] = useState<Rect>({x:0,y:0,w:0,h:0});
  const [snap, setSnap] = useState<Rect|null>(null);
  const [tool, setTool] = useState<Tool>("select");
  // 子工具选择 popover：哪个组展开了下拉菜单（index or null）
  const [submenuOpen, setSubmenuOpen] = useState<number | null>(null);
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
  const updateCfg = useConfigStore((s) => s.update);
  // 自定义颜色：隐藏的原生取色 input，由色板里的彩虹按钮触发（Snipaste 同款）
  const customColorRef = useRef<HTMLInputElement>(null);
  // 取色确认入库：input 的【原生 change】事件在「确定」时触发一次（React 的
  // onChange 对应原生 input 事件、拖动调色盘时连续触发——旧版把每个中间色都
  // 存进色板，拖一下就刷出一大串）。仅在确认时把【一个】颜色追加进色板并
  // 持久化；自定义色数量封顶 ANNO_MAX_CUSTOM，超出丢最旧的自定义色。
  useEffect(() => {
    const el = customColorRef.current;
    if (!el) return;
    const onCommit = (ev: Event) => {
      const hex = (ev.target as HTMLInputElement).value;
      setColor(hex);
      const cur = cfg.annotate?.colors?.length ? cfg.annotate.colors : ANNO_DEFAULT_COLORS;
      if (cur.some((x) => x.toLowerCase() === hex)) return;
      const next = [...cur, hex];
      const trimmed =
        next.length > ANNO_DEFAULT_COLORS.length + ANNO_MAX_CUSTOM
          ? [...next.slice(0, ANNO_DEFAULT_COLORS.length), ...next.slice(-ANNO_MAX_CUSTOM)]
          : next;
      void updateCfg({ ...cfg, annotate: { ...cfg.annotate, colors: trimmed } });
    };
    el.addEventListener("change", onCommit);
    return () => el.removeEventListener("change", onCommit);
  }, [cfg.annotate?.colors]); // eslint-disable-line react-hooks/exhaustive-deps
  // 遮罩窗复用：加载中又收到 shot-refresh 时置位，当前轮结束后立刻再来一轮
  const loadingRef = useRef(false);
  const rerunRef = useRef(false);
  // 会话令牌：每次呼出自增；旧会话迟到的帧数据绝不允许画进本会话画布
  const sessionRef = useRef(0);
  // 帧数据加载完成（供放大镜/导出合成）；亮窗不等它，输出前 await 即可
  const frameReadyRef = useRef<Promise<void>>(Promise.resolve());
   // 马赛克格子颜色缓存：同格采样结果复用，拖动重绘不再反复 getImageData
   const mosaicCacheRef = useRef(new Map<string, string>());
   // 【性能】屏显层只画 annoRef 一份；「背景帧+标注」的合成源由导出路径
   // 按需构建（buildComposite 复用同一块暂存画布）——旧版在标注 effect 里
   // 每次变化都全屏重建一份合成源，但导出路径各自重建、它从未被消费，
   // 画笔拖动时等于每 move 白做一次整屏 clear+blit（4K 约 16MB 内存带宽）
   const prevAnnoLenRef = useRef(0);
  // 输出单飞锁：Ctrl+T 按住自动重复/连点贴图不会并发创建多个贴图
  const outputtingRef = useRef(false);
  // 文字编辑镜像 ref：commitText 不依赖过期闭包（点击别处提交时不丢内容）
  const textEditRef = useRef<{x:number;y:number;value:string}|null>(null);
  useEffect(() => { textEditRef.current = textEdit; }, [textEdit]);
  // 文字编辑输入框 ref：提交时量取实际渲染位置（消除错位）+ 自动聚焦
  const textInputRef = useRef<HTMLInputElement|null>(null);
  useEffect(() => {
    if (textEdit) {
      const t = window.setTimeout(() => {
        textInputRef.current?.focus({ preventScroll: true });
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [textEdit?.x, textEdit?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  // 当前工具镜像：键盘 Ctrl+数字切换工具时读 ref，避免 keydown 闭包捕获旧值
  const toolRef = useRef<Tool>("select");
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // ---- 取色 ----
  // 颜色显示格式（Shift 切 RGB/HEX）；ref 镜像供 rAF 绘制路径直读
  const [colorFmt, setColorFmt] = useState<ColorFmt>("rgb");
  const colorFmtRef = useRef<ColorFmt>("rgb");
  useEffect(() => { colorFmtRef.current = colorFmt; }, [colorFmt]);
  const toggleColorFmt = () => setColorFmt((f) => {
    const nf: ColorFmt = f === "rgb" ? "hex" : "rgb";
    // 【立即刷新】面板文本只在鼠标移动时由 rAF 路径重写，切格式若不主动
    // 刷一次，显示会一直停留在旧格式直到下次移动鼠标
    const col = pickedRef.current;
    if (col) {
      if (magValRef.current) magValRef.current.textContent = fmtDisplay(col, nf);
      if (pickerValRef.current) pickerValRef.current.textContent = fmtDisplay(col, nf);
    }
    syncFmtBadges(nf);
    return nf;
  });
  // 最近一次采样的光标下像素颜色（C 复制用）
  const pickedRef = useRef<[number, number, number] | null>(null);
  // bgReady / picker 模式镜像：rAF 回调闭包里读，避免过期 state
  const bgReadyRef = useRef(false);
  useEffect(() => { bgReadyRef.current = bgReady; }, [bgReady]);
  const pickerModeRef = useRef(false);
  useEffect(() => { pickerModeRef.current = !!geom?.picker; }, [geom?.picker]);

  /** 从冻结帧画布采样光标下像素（帧未就绪/越界/读取异常时返回 null）。
   *  bg ctx 以 willReadFrequently 创建，单像素 getImageData 走 CPU 快路径 */
  const sampleColor = (x: number, y: number): [number, number, number] | null => {
    const c = bgRef.current;
    if (!c || !bgReadyRef.current || x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
    try {
      const d = c.getContext("2d")!.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    } catch { return null; }
  };
  // 复制反馈的自动复位定时器（放大镜面板与取色面板共用）
  const copyTimerRef = useRef(0);
  /** 复制当前取色（格式跟随显示格式），并在面板上短暂反馈；close=true 时顺带收场 */
  const copyPicked = (close: boolean) => {
    const col = pickedRef.current;
    if (!col) return;
    const text = fmtCopy(col, colorFmtRef.current);
    void copyText(text).catch(() => {});
    const el = (pickerModeRef.current ? pickerCopiedRef.current : magCopiedRef.current);
    if (el) {
      el.textContent = `✓ 已复制 ${text}`;
      el.style.display = "block";
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => { el.style.display = "none"; }, 1400);
    }
    if (close) void shotCancel().catch(() => {});
  };
  /** 激活某个工具条按钮：若当前已在组内则循环切到下一个兄弟工具
   *  （矩形→椭圆→矩形…，Snipaste 同款交互），否则取组内第一个。
   *  【不】在此收起子菜单：点击组按钮 = 选默认工具 + 展开枚举，两者共存 */
  const applyToolButton = (b: { items: [Tool, () => JSX.Element, string, string][] }) => {
    const idx = b.items.findIndex(([t]) => t === toolRef.current);
    setTool(b.items[(idx + 1) % b.items.length][0]);
  };
  // 枚举面板收起只靠：再点一级图标（toggle）/ Esc。
  // 【不能】用"点击面板外部关闭"——用户在选区内按下开始画图形时，mousedown
  // 落在面板外，会把刚选好的图形/颜色面板一并关掉（主人反馈的 bug，线组同病）
  useEffect(() => {
    if (submenuOpen === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSubmenuOpen(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [submenuOpen]);

  // 压暗遮罩淡入：show() 那一刻原生冻结层立即上屏（全亮度），webview 的
  // 压暗层要晚 1~2 帧才首次 present——硬切就是一次"亮→暗"的闪。
  // 亮窗前先启动淡入动画，把这次跳变抹成 ~180ms 的平滑压暗
  const [dimFx, setDimFx] = useState(false);

  // 左下角提示区：选区矩形覆盖到提示区时整体隐藏。
  // 拖拽中 region state 不再逐帧更新（快速直绘路径），提示区直接隐藏，
  // 松手后 region 提交、本 effect 重跑恢复正确显隐
  const hintRef = useRef<HTMLDivElement|null>(null);
  const [hintCovered, setHintCovered] = useState(false);
  useEffect(() => {
    const el = hintRef.current;
    if (!el || !geom) { return; }
    if (dragging || phase !== "selected") { setHintCovered(false); return; }
    // region 是本地【CSS 像素】，hr 也是 CSS 像素——直接比较，不再 ×scale
    const hr = el.getBoundingClientRect();
    const x1 = region.x, y1 = region.y;
    const x2 = (region.x + region.w), y2 = (region.y + region.h);
    setHintCovered(!(x2 < hr.left || x1 > hr.right || y2 < hr.top || y1 > hr.bottom));
  }, [phase, dragging, region, geom]);

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
    clearMosaicSnapshots();
    // 历史位图缓存一并作废：close 释放位图显存，下一会话重新预热
    for (const b of histBmpRef.current.values()) b.close();
    histBmpRef.current.clear();
    prevAnnoLenRef.current = 0;
    // 窗口快照缓存同步作废：新会话由 geometry 带回新表
    candsRef.current = null;
    // 主题色缓存失效：两次会话之间用户可能改过主题
    accentRef.current = null;
    // 【一次性】会话 UI 状态复位：放在循环外——rerun（加载中又收到刷新事件）
    // 只刷新几何/帧数据，不再重复复位。复位若发生在已亮窗的会话上，
    // 智能高亮会被清掉再重画，表现为"呼出瞬间选框来回闪几下"
    dragRef.current = null; resizeRef.current = null; downPtRef.current = null;
    // 原生拖拽层复位：上一会话若在拖拽中被强制收场，这里兜底停更+还原；
    // 并挂上重置标记隐藏旧工具栏等浮层 DOM（原生即时亮窗后、本页收到
    // shot-refresh 前的窗口期，防止残留 UI 在新画面上闪现）
    if (nativeDragRef.current) { nativeDragRef.current = false; void shotDragEnd().catch(() => {}); }
    rootRef.current?.setAttribute("data-resetting", "1");
    setAnnos([]); setUndos([]); setTextEdit(null); setNumCnt(1); setShowMag(false);
    // OCR 状态复位：新会话不保留上一场的识别结果
    resetOcr();
    // 历史浏览状态复位：新会话永远从实时画面开始
    // （历史切换走 shot://history-changed 轻量路径，不经过 loadSession）
    histOpenRef.current = false; setHistOpen(false); setHistViewing(false);
    histItemsRef.current = null; setHistItems(null); setHistPos(-1);
    setRegion({x:0,y:0,w:0,h:0}); regRef.current = {x:0,y:0,w:0,h:0};
    setPhase("idle"); setSnap(null); setDragging(false); phaseRef.current = "idle";
    lastRectRef.current = null; snapRef.current = null; pngCacheRef.current = null;
    snapChainRef.current = null; snapIdxRef.current = 0; setChainLen(0);
    chainWinRef.current = null;
    elemFailAtRef.current = 0;
    lastDiagRef.current = null;
    // 复位淡入：先摘掉动画类，稍后亮窗前重新挂上才会重放
    setDimFx(false);
    // 取色状态复位：采样颜色清空、面板/十字线移出屏外、复制反馈隐藏
    pickedRef.current = null;
    if (pickerPanelRef.current) pickerPanelRef.current.style.left = "-9999px";
    if (pickerLineHRef.current) pickerLineHRef.current.style.top = "-9999px";
    if (pickerLineVRef.current) pickerLineVRef.current.style.left = "-9999px";
    if (pickerDotRef.current) { pickerDotRef.current.style.left = "-9999px"; pickerDotRef.current.style.top = "-9999px"; }
    if (magCopiedRef.current) magCopiedRef.current.style.display = "none";
    if (pickerCopiedRef.current) pickerCopiedRef.current.style.display = "none";
    while (true) {
      rerunRef.current = false;
      try {
        // 几何信息：Rust 端在截图瞬间就完成智能识别，snap 随 geometry 直接带回，
        // 无需等整屏 RGBA 传完——遮罩窗一出现高亮框就在
        const g = await shotGeometry();
        if (mySession !== sessionRef.current) break;
        setGeom(g);
        candsRef.current = g.cands ?? null;
        if (!g) break;
        if (g.snap) {
          // snap 是 Rust 端【显示器局部物理像素】；选区/高亮层统一用 CSS 像素，
          // 须 ÷cssScale 归一——否则 150% 下初始高亮框比实际窗口大 1.5 倍
          const sc = cssScale();
          const s = { x: g.snap.x / sc, y: g.snap.y / sc, w: g.snap.width / sc, h: g.snap.height / sc };
          setSnap(s);
          snapRef.current = s;
          // 预填识别缓存：保持【全局物理】坐标（与鼠标全局物理 hit-test 同系）
          lastRectRef.current = { x: g.snap.x + g.x, y: g.snap.y + g.y, w: g.snap.width, h: g.snap.height };
        } else if (g.prefill) {
          // 智能识别未命中时才回退到记忆区域（Snipaste 行为：优先智能识别）；
          // prefill 同为显示器局部物理像素，须归一到 CSS 像素再当本地选区
          const sc = cssScale();
          const r = { x: g.prefill.x / sc, y: g.prefill.y / sc, w: g.prefill.width / sc, h: g.prefill.height / sc };
          setRegion(r); regRef.current = r; setPhase("selected");
        }
        // 遮罩+高亮是纯 SVG/DOM：画好即可亮窗（冻结画面由 Rust 原生冻结层直接贴出）
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        // 先启动压暗淡入、再等一帧确保动画已开跑，然后才请 Rust 亮窗：
        // 冻结层上屏瞬间遮罩已有部分不透明度，随后平滑过渡到目标亮度，
        // 不再有"冻结帧全亮一闪→遮罩砸下来"的跳变
        setDimFx(true);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await shotReady().catch(() => {});
        // 本会话 UI 已就绪：解除重置标记，工具栏/提示等浮层恢复可见
        rootRef.current?.removeAttribute("data-resetting");
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
              // willReadFrequently：取色需逐帧单像素 getImageData，走 CPU 快路径
              c.getContext("2d", { willReadFrequently: true })!.drawImage(bmp, 0, 0);
              invalidateMosaicLayer();
              setBgReady(true);
              // 预热实时帧位图缓存：首次按 < 回实时零延迟（后台拉取，不阻塞）
              void loadHistBmp("__live__", shotFrameUrl(g.index));
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
                  c.getContext("2d", { willReadFrequently: true })!.putImageData(new ImageData(bytes, g.width, g.height), 0, 0);
                  invalidateMosaicLayer();
                  setBgReady(true);
                }
              }
            } catch {}
          }
        })();
      } catch {}
      if (!rerunRef.current) break;
    }
    // 兜底：会话加载中途失败（几何拉取异常等）也要解除重置标记，
    // 否则浮层 DOM 永久隐藏、遮罩只剩冻结画面无法交互提示
    rootRef.current?.removeAttribute("data-resetting");
    loadingRef.current = false;
  };

  useEffect(() => { loadSession(); }, []);
  // ---------- 历史帧位图缓存（前端侧） ----------
  // 旧方案：Rust 发 history-changed → 尾沿去抖 60ms → 拉整屏 BMP → 解码 → 上画。
  // 选区还原却在命令返回瞬间就落地，表现为"选区先跳、画面后到"，且每次
  // 翻页都要付一次整屏传输+解码，手感迟钝。
  // 新方案：位图按帧文件名缓存（实时="__live__"），命中时换帧 = 一次同步
  // drawImage；stepHistoryCore 里 await 画完才还选区——两者严格同帧落地。
  // 相邻帧后台预取后，连续按 < / > 全程缓存直绘，接近瞬时（Snipaste 手感）
  const histBmpRef = useRef<Map<string, ImageBitmap>>(new Map());
  // 缓存上限：当前帧+前后邻帧+实时 ≈ 4 张整屏位图（1440p 约 60MB），超 FIFO 淘汰
  const HIST_BMP_MAX = 4;
  /** 取一帧位图：命中直接返回；未命中经协议拉取解码并入缓存。失败返回 null */
  const loadHistBmp = async (key: string, url: string): Promise<ImageBitmap | null> => {
    const hit = histBmpRef.current.get(key);
    if (hit) return hit;
    try {
      const ac = new AbortController();
      const ft = window.setTimeout(() => ac.abort(), 8000);
      const resp = await fetch(url, { signal: ac.signal }).catch(() => null);
      window.clearTimeout(ft);
      if (!resp || !resp.ok) return null;
      const bmp = await createImageBitmap(await resp.blob());
      histBmpRef.current.set(key, bmp);
      while (histBmpRef.current.size > HIST_BMP_MAX) {
        const oldest = histBmpRef.current.keys().next().value as string | undefined;
        if (!oldest || oldest === key) break;
        histBmpRef.current.get(oldest)?.close();
        histBmpRef.current.delete(oldest);
      }
      return bmp;
    } catch { return null; }
  };
  /** 把一帧画进背景画布（历史切换的可见路径；同步执行、当帧渲染） */
  const drawHistFrame = (bmp: ImageBitmap): boolean => {
    const g = geomRef.current;
    const c = bgRef.current;
    if (!g || !c || bmp.width !== g.width || bmp.height !== g.height) return false;
    c.width = g.width; c.height = g.height;
    c.getContext("2d", { willReadFrequently: true })!.drawImage(bmp, 0, 0);
    invalidateMosaicLayer();
    setBgReady(true);
    return true;
  };
  /** 切换历史帧后的完整可见刷新：作废标注/合成缓存 → 画新帧 → 后台预取邻帧 */
  const showHistFrame = async (file: string) => {
    setAnnos([]); setUndos([]);
    mosaicCacheRef.current.clear();
    clearMosaicSnapshots();
    prevAnnoLenRef.current = 0;
    pngCacheRef.current = null;
    const a = annoRef.current;
    if (a) a.getContext("2d")?.clearRect(0, 0, a.width, a.height);
    const g = geomRef.current;
    if (!g) return;
    const key = file || "__live__";
    // 主源 /frame/{idx}：Rust 在命令返回前已把目标帧解码进 shots，直出 BMP
    // （零压缩 + SIMD 解码最快路径）。失败回退 /history/{file} 原图 PNG
    let bmp = await loadHistBmp(key, `${shotFrameUrl(g.index)}?v=${encodeURIComponent(key)}`);
    if (!bmp && file) bmp = await loadHistBmp(key, shotHistoryUrl(file));
    if (bmp) drawHistFrame(bmp);
    // 相邻两帧预取。【必须走 /history/{file}】——浏览历史时 /frame 服务的是
    // 当前历史帧，拿它预热 "__live__" 会把错误画面存进实时槽位；
    // 实时帧只在身处实时时预热（loadSession 里做了一次）
    void (async () => {
      const items = histItemsRef.current ?? [];
      const idx = items.findIndex((i) => i.file === file);
      if (file && idx >= 0) {
        if (idx + 1 < items.length) await loadHistBmp(items[idx + 1].file, shotHistoryUrl(items[idx + 1].file));
        if (idx - 1 >= 0) await loadHistBmp(items[idx - 1].file, shotHistoryUrl(items[idx - 1].file));
      }
    })();
  };
  // 原生拖拽层首帧握手事件：保留监听但【不再清空 webview 选区画布】——
  // 之前的"让位"清屏会把拖拽中的实时细边框一并清掉（只剩原生粗边框，
  // 用户反馈"拖动选区时实时边框没有了"）；webview 持续自绘即恢复
  useEffect(() => {
    const un = listen("shot://drag-first-paint", () => {});
    return () => { un.then((f) => f()); };
  }, []);
  // 遮罩窗被 Rust 复用时收到刷新事件 → 重载新画面（窗口不销毁，免去重建开销）
  useEffect(() => {
    const un = listen("shot-refresh", () => { loadSession(); });
    return () => { un.then((f) => f()); };
  }, []);
  // Rust 周期性刷新的窗口 Z 序快照（350ms）：会话期间新弹出的弹窗/下拉即时
  // 进入本地扫描表，悬停识别不再命中弹窗后面的窗口。同时作废窗口级缓存——
  // 否则光标在旧窗口矩形内移动会被缓存吞掉，永远发现不了新弹窗
  useEffect(() => {
    const un = listen<{x:number;y:number;width:number;height:number}[]>("shot://cands", (e) => {
      candsRef.current = e.payload;
      lastRectRef.current = null;
    });
    return () => { un.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (!geom || !bgReady) return;
    const c = annoRef.current; if (!c) return;
    // 仅在尺寸变化时重设位图（赋值即重置画布，逐帧赋值纯属浪费）
    if (c.width !== geom.width) c.width = geom.width;
    if (c.height !== geom.height) c.height = geom.height;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, geom.width, geom.height);
    // 标注数量变化（新增标注/撤销）→ 马赛克采样缓存作废。
    // 同一标注拖拽中（长度不变）缓存依然有效
    if (annos.length !== prevAnnoLenRef.current) mosaicCacheRef.current.clear();
    prevAnnoLenRef.current = annos.length;
    const scale = cssScale();
    annos.forEach((s) => {
      drawShape(ctx, s, bgRef.current, mosaicCacheRef.current, scale);   // 屏显层
    });
  }, [annos, geom, bgReady]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // 文字标注输入中：不触发截图快捷键（Enter/Escape 由输入框自行处理）
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") {
        e.preventDefault();
        // 历史列表开着：先关列表，不退出会话
        if (histOpenRef.current) { histOpenRef.current = false; setHistOpen(false); return; }
        // OCR 模式：先清除拖选文字 → 再关 OCR 面板 → 最后才是退出截图
        // OCR 面板开着：先退出 OCR（面板内文本可直接划选复制），再按才是退出截图
        if (ocrActiveRef.current) { resetOcr(); return; }
        void shotCancel().catch(() => {});
      }
      // 独立取色模式键位：C 复制颜色（保持取色）、Enter 复制并退出、Shift 切 RGB/HEX
      else if (pickerModeRef.current) {
        if (e.code === "KeyC" && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault(); if (!e.repeat) copyPicked(false);
        } else if (e.key === "Enter") {
          e.preventDefault(); if (!e.repeat) copyPicked(true);
        } else if (e.key === "Shift" && !e.repeat) {
          toggleColorFmt();
        }
      }
      else if (e.key === "Enter" && phase === "selected") {
        // OCR 面板内有划选时放行：Enter 是确认/换行的通用键，不能被劫持为复制收场
        const sel = ocrActiveRef.current ? (window.getSelection?.()?.toString() ?? "") : "";
        if (sel.trim()) return;
        e.preventDefault(); if (!e.repeat) void doOutput("copy");
      }
      // 字母键用 e.code 判定：中文输入法激活时 e.key 可能是 "Process"，e.code 始终是物理键
      // OCR 面板内划选的文字由浏览器原生 Ctrl+C 复制（面板文本可选中）：
      // 有划选时【必须原样放行】——这条分支原本无条件 preventDefault + doOutput("copy")，
      // 结果是"复制没生效、截图会话还结束了"，表现为一按复制整个界面就关掉
      // 【智能选区免点击】idle 态已有悬停高亮窗口时，Ctrl+C 直接采纳该窗口为
      // 选区并复制——无需鼠标左键确认（与贴图热键的免点击采纳同一逻辑）
      else if (e.code === "KeyC" && e.ctrlKey && phase === "idle") {
        const s = snapRef.current;
        if (!s) return; // 无智能高亮 → 放行（无操作）
        e.preventDefault();
        if (e.repeat) return;
        regRef.current = s; setRegion(s);
        snapRef.current = null; setSnap(null);
        setPhase("selected"); phaseRef.current = "selected";
        const g = geomRef.current; const sc = cssScale();
        void shotSaveRegion([s.x*sc + (g?.x ?? 0), s.y*sc + (g?.y ?? 0), s.w*sc, s.h*sc]).catch(() => {});
        void doOutput("copy");
      }
      else if (e.code === "KeyC" && e.ctrlKey && phase === "selected") {
        const sel = ocrActiveRef.current ? (window.getSelection?.()?.toString() ?? "") : "";
        if (sel.trim()) return;
        e.preventDefault();
        if (!e.repeat) void doOutput("copy");
      }
      // P = 直接贴图（与工具栏贴图钮等效）
      else if (e.code === "KeyP" && phase === "selected" && !e.ctrlKey && !e.altKey) {
        const sel = ocrActiveRef.current ? (window.getSelection?.()?.toString() ?? "") : "";
        if (sel.trim()) return;
        e.preventDefault();
        if (!e.repeat) void doOutput("pin");
      }
      // 贴图不再用内置 Ctrl+T/F8：全局「显示/隐藏贴图」热键（用户可在快捷键页
      // 自定义，如 F8）在截图会话中由 Rust 转发 shot://pin-hotkey 事件触发贴图
      // Ctrl+1~6 直达工具条按钮；重复按同键在组内循环（仅矩形?椭圆/直线?箭头成组，
      // 其余工具各占一键、按一下即选中；组按钮的子选择 popover 由右侧下拉箭头触发）
      else if (e.ctrlKey && e.code.startsWith("Digit") && phase === "selected") {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= TOOL_BUTTONS.length) {
          e.preventDefault();
          if (!e.repeat) { applyToolButton(TOOL_BUTTONS[n - 1]); setSubmenuOpen(null); }
        }
      }
      // 截图取色：C 复制光标处颜色、Shift 切换 RGB/HEX（Snipaste 同款）。
      // 【idle 与 selected 都可用】确认选区后放大镜仍跟随光标，取色/切格式
      // 不能失效；文字标注输入中除外（输入法打字母/Shift 切中英不能被劫持）
      else if ((phase === "idle" || phase === "selected") && !textEditRef.current
        && e.code === "KeyC" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault(); if (!e.repeat) copyPicked(false);
      }
      else if ((phase === "idle" || phase === "selected") && !textEditRef.current
        && e.key === "Shift" && !e.repeat) {
        toggleColorFmt();
      }
      // Tab 切换放大镜形状（方形/圆形）：仅放大镜可见时接管，阻止焦点跳转。
      // 形状存入配置（magnifier_round）持久化，下次截图会话保持
      else if (e.key === "Tab" && showMagRef.current && !pickerModeRef.current && !textEditRef.current) {
        e.preventDefault();
        if (e.repeat) return;
        const next = !magCircleRef.current;
        magCircleRef.current = next;
        setMagCircle(next);
        // 持久化：读最新配置再写回（闭包里的 cfg 可能过期）
        const st = useConfigStore.getState();
        void updateCfg({ ...st.config, shot: { ...st.config.shot, magnifier_round: next } });
        if (magCopiedRef.current) {
          magCopiedRef.current.textContent = next ? "已切换为圆形" : "已切换为方形";
          magCopiedRef.current.style.display = "";
          window.clearTimeout(copyTimerRef.current);
          copyTimerRef.current = window.setTimeout(() => {
            if (magCopiedRef.current) magCopiedRef.current.style.display = "none";
          }, 900);
        }
      }
      // 截图历史：< 向左（更新一帧 / 回实时）、> 向右（更旧一帧）——
      // 缩略条从左到右就是「实时→新→旧」，键位与列表滚动方向一致。
      // 点击缩略图跳转后处于选中态也允许继续翻页（选区保留可重新框选）
      else if ((phase === "idle" || phase === "selected") && cfg.shot.history_enabled !== false
        && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "<" || e.key === ",")) {
        e.preventDefault(); if (!e.repeat) void stepHistory(1);
      }
      else if ((phase === "idle" || phase === "selected") && cfg.shot.history_enabled !== false
        && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === ">" || e.key === ".")) {
        e.preventDefault(); if (!e.repeat) void stepHistory(-1);
      }
      else if (phase === "idle" && cfg.shot.history_enabled !== false
        && !e.ctrlKey && !e.altKey && !e.metaKey && (e.code === "KeyH")) {
        e.preventDefault(); if (!e.repeat) void toggleHistPanel();
      }
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

  // 统一在 CSS 像素空间工作：覆盖层固定在视口 (0,0)，clientX/Y 即画布坐标，
  // 不再做 物理px/CSSpx 的换算——这是消除高 DPI 矩形错位的根基
  const toCanvas = (e: React.MouseEvent): Pt => {
    const r = bgRef.current?.getBoundingClientRect();
    if (!r || !geom) return {x:0,y:0};
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** 选区层绘制（普通 2D 画布，非 desynchronized）：
   *  压暗遮罩 + 选区镂空 + 智能高亮 + 边框 + 8 手柄，全部读 ref 直绘。
   *  【为什么不能用 desynchronized】该低延迟模式在 DPR≠1（如 150% 缩放）的
   *  Chromium 下存在合成偏移：内容按 DPR=1 合成、窗口是 1.5×，越远离原点
   *  偏移越大——正是"矩形框右下角不跟手"的元凶。 */
  const paintSelCanvas = (phaseNow?: Phase) => {
    const cv = selCanvasRef.current;
    if (!cv || !geom || geom.picker) return;
    if (cv.width !== geom.width) cv.width = geom.width;
    if (cv.height !== geom.height) cv.height = geom.height;
    // 注意：此处【不能】用 desynchronized:true 低延迟画布。
    // 该模式在 DPR≠1（如用户 150% 缩放）的 Chromium 下存在合成偏移 bug——
    // 画布内容按 DPR=1 合成而窗口是 1.5×，导致越远离原点偏移越大：起点
    // （左上、靠原点）看着对，右下角（远原点）整体偏出去、不跟手。这正是
    // "矩形框又错位"的根因。去 desync 后，拖拽中的逐帧直绘（onMove 快速
    // 路径）已足够低延迟，不会回退成卡顿。
    const ctx = selCtxRef.current ??= cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, geom.width, geom.height);
    const rc = bgRef.current?.getBoundingClientRect();
    const scale = rc && rc.width > 0 ? geom.width / rc.width : 1; // 物理px/CSSpx
    // 主题色缓存：getComputedStyle 每次调用都可能触发样式重算，
    // 逐事件调用是拖拽卡顿的帮凶；会话开始时取一次即可
    const accent = accentRef.current ??= `rgb(${(getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb") || "76,141,255").trim()})`;
    // phase 显式传入优先：phaseRef 由更靠后声明的 effect 异步同步，
    // 确认选区当帧的立即重绘若读 ref 会拿到过期 "idle"，导致边框/压暗整层消失
    const selected = (phaseNow ?? phaseRef.current) === "selected";
    const draggingNow = !!dragRef.current || !!resizeRef.current;
    const reg = regRef.current;
    const snap = snapRef.current;
    // 压暗遮罩【常驻】——与旧 SVG 行为一致：整个会话期间屏幕都保持压暗，
    // 只有智能高亮窗口/选定区域透出原亮度。此前只在拖拽/选中时才画遮罩，
    // 空闲态重绘会把遮罩整层清掉（"黑一下然后遮罩没了"的根因）
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, geom.width, geom.height);
    if (selected || draggingNow) {
      // 选定/拖拽中：区域镂空 + 单层主题色描边。reg 为 CSS 像素，画布是物理像素，
      // 必须 ×scale 映射到物理位图（否则 150% 下选区框整体偏小、右下角不跟手）。
      // 旧版"深色衬底+亮色主线"双层描边会在蓝线两侧各露一圈黑边，呈"黑+蓝+黑"，
      // 已按需求去掉黑色衬底，仅留主题色细线
      const rx = reg.x * scale, ry = reg.y * scale, rw = reg.w * scale, rh = reg.h * scale;
      ctx.clearRect(rx, ry, rw, rh);
      ctx.strokeStyle = accent; ctx.lineWidth = 2 * scale;
      ctx.strokeRect(rx, ry, rw, rh);
    } else if (snap) {
      // 智能高亮：窗口镂空 + 单层主题色描边（去掉黑色衬底）。snap 已归一为
      // 【CSS 像素】（与 reg 同系），画布是物理像素，同样 ×scale 映射
      const sx = snap.x * scale, sy = snap.y * scale, sw2 = snap.w * scale, sh2 = snap.h * scale;
      ctx.clearRect(sx, sy, sw2, sh2);
      ctx.strokeStyle = accent; ctx.lineWidth = 2.5 * scale;
      ctx.strokeRect(sx, sy, sw2, sh2);
    }
    if (selected) {
      const hs = 8 * scale;
      ctx.lineWidth = Math.max(1, scale);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = accent;
      for (const [hx, hy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
        const x = (reg.x + (hx === -1 ? 0 : hx === 1 ? reg.w : reg.w / 2)) * scale;
        const y = (reg.y + (hy === -1 ? 0 : hy === 1 ? reg.h : reg.h / 2)) * scale;
        ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
        ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
      }
    }
  };

  // 状态驱动的选区层重绘：确认选区（手柄出现）、悬停高亮更新、会话重载等。
  // 拖拽中的逐帧重绘走 onMove 快速路径 + queueSelPaint 合并，不依赖本 effect。
  // 显式传 phase（闭包新值）：本 effect 声明早于 phaseRef 的同步 effect，
  // 读 ref 会拿到过期相位
  useEffect(() => { paintSelCanvas(phase); }, [region, snap, phase, dragging, geom, bgReady]);

  /** 把一次选区层重绘合并进最近的刷新周期：同帧内任意多次排队只画一次，
   *  且画的必然是最新矩形（regRef 已在事件里同步更新） */
  const queueSelPaint = () => {
    if (selPaintRafRef.current) return;
    selPaintRafRef.current = requestAnimationFrame(() => {
      selPaintRafRef.current = 0;
      paintSelCanvas();
    });
  };
  const cancelSelPaint = () => {
    if (selPaintRafRef.current) { cancelAnimationFrame(selPaintRafRef.current); selPaintRafRef.current = 0; }
  };
  // 智能识别在途/待补查状态 + 上次命中窗口缓存（全局坐标）：
  // 光标还在同一窗口内时零 IPC 开销；跨窗瞬间只发一次查询，杜绝乱序覆盖
  const detectBusyRef = useRef(false);
  const detectPendingRef = useRef(false);
  const mouseGlobalRef = useRef<Pt>({x:0,y:0});
  const lastRectRef = useRef<{x:number;y:number;w:number;h:number}|null>(null);
  // 元素级（UIA）查询最近一次失败的时刻：失败后同窗悬停仍按 ~350ms 节奏
  // 重试（Chromium 首次激活可达秒级），成功后清零——否则窗口级缓存会把
  // 后续所有重试吞掉，表现为"浏览器里永远只有窗口框"
  const elemFailAtRef = useRef(0);
  // 过期结果连续补查计数（防 provider 异常矩形导致无限重查；移动时重置）
  const staleRefireCountRef = useRef(0);
  // 悬停识别诊断：上次记录的结果签名（变化才写 diag，避免刷屏）
  const lastDiagRef = useRef<string|null>(null);
  // 最近一次智能高亮矩形（本地坐标）。mousedown 会把可视 snap 清掉，
  // 但点击确认选区仍需它——松手时按此判定"点击采纳窗口"（Snipaste 行为）
  const snapRef = useRef<Rect|null>(null);
  // UIA 元素【候选链】（本地 CSS 像素，内→外，链[0] 最精确）+ 滚轮当前层级：
  // 悬停高亮链[idx]，滚轮在层级间切换（PixPin 式"按钮→工具条→面板→整窗"）。
  // 链只在收到元素级识别结果时更新；idx 在每次新链落地/新会话时归零
  const snapChainRef = useRef<Rect[]|null>(null);
  const snapIdxRef = useRef(0);
  // 当前高亮/链所属的【窗口矩形】（全局物理坐标）：
  // 同窗口内的重查不重画窗口框（否则每次移动都"窗口框→元素框"闪一遍）
  const chainWinRef = useRef<{x:number;y:number;width:number;height:number}|null>(null);
  // 链长度的 state 镜像（仅驱动提示区"滚轮切换"行显隐；变更才重渲染）
  const [chainLen, setChainLen] = useState(0);

  // ---- 截图历史（< > 翻页重截 / H 缩略图列表）----
  const [histOpen, setHistOpen] = useState(false);
  // 开关走 ref：keydown effect 依赖少、闭包易过期，ref 永远最新
  const histOpenRef = useRef(false);
  const [histItems, setHistItems] = useState<ShotHistItem[] | null>(null);
  const histItemsRef = useRef<ShotHistItem[] | null>(null);
  // 当前翻页位置（-1=实时，0=最新…）：驱动缩略条活动项高亮与滚动跟随
  const [histPos, setHistPos] = useState(-1);
  const histPanelRef = useRef<HTMLDivElement | null>(null);
  // 正在浏览历史帧（true 时左下角提示区显示"返回实时"引导）
  const [histViewing, setHistViewing] = useState(false);
  const histBusyRef = useRef(false);
  /** 拉取历史列表（带 ref 缓存：会话内只拉一次，步进时同步可读） */
  const ensureHistItems = async (): Promise<ShotHistItem[]> => {
    if (histItemsRef.current) return histItemsRef.current;
    try {
      const l = await shotHistoryList();
      histItemsRef.current = l;
      setHistItems(l);
    } catch { /* 拉取失败不缓存，下次再试 */ }
    return histItemsRef.current ?? [];
  };
  /** 翻历史核心：Rust 已替换冻结帧并返回帧标识 → 前端画帧（缓存直绘/拉取）
      → 画完才返回，调用方随后还原该帧选区（画面与选区同帧落地） */
  const stepHistoryCore = async (dir: number, index?: number) => {
    if (histBusyRef.current || dragRef.current || resizeRef.current || pickerModeRef.current) return;
    histBusyRef.current = true;
    try {
      const r = await shotHistoryStep(dir, index);
      if (r === undefined) return undefined;
      // 【先画帧、后还选区】await 保证可见画面与新选区同一时刻落地，
      // 消除旧方案"选区先跳、画面后到"的错位感。位图缓存命中时此
      // await ≈ 0ms；未命中付一次拉帧解码（随后被缓存+预取覆盖）
      await showHistFrame(r === "live" ? "" : r);
      setHistViewing(r !== "live");
      // 同步拉列表并计算当前位置：缩略条据此高亮/滚动到当前帧
      const items = await ensureHistItems();
      setHistPos(r === "live" ? -1 : items.findIndex((i) => i.file === r));
      return r;
    } catch { return undefined; }
    finally { histBusyRef.current = false; }
  };
  /** 翻历史：< / > 步进。首次步进自动展开缩略条——切换过程中能直接看到
      列表随翻页滚动、当前帧高亮（Snipaste 式浏览体验）。
      与缩略图点击（jumpHistory）同语义：步进后还原【该帧自己记忆的框选范围】，
      回到实时帧则保持现状不做还原 */
  const stepHistory = (dir: number) => void (async () => {
    const r = await stepHistoryCore(dir);
    if (r === undefined) return;
    await applyHistRegion(r === "live" ? "" : r);
    if (!histOpenRef.current) {
      histOpenRef.current = true;
      setHistOpen(true);
    }
  })();
  // 跳转还原选区时置位：防止「还原」本身被当成一次新确认又写回 sidecar
  const histRestoreRef = useRef(false);
  // 选区确认后把范围写进当前查看帧的历史档（sidecar）：
  // 之后从缩略图列表点回这一帧即可还原「当时的框选范围」。
  // 防抖 250ms：方向键微调选区时只落最终值
  const histSaveTimer = useRef(0);
  useEffect(() => {
    if (phase !== "selected" || dragging || textEdit || !geom) return;
    if (histRestoreRef.current) { histRestoreRef.current = false; return; }
    window.clearTimeout(histSaveTimer.current);
    histSaveTimer.current = window.setTimeout(() => {
      const r = regRef.current;
      if (r.w <= 0 || r.h <= 0) return;
      const sc = cssScale();
      void shotHistorySaveRegion([
        Math.round(r.x * sc), Math.round(r.y * sc),
        Math.round(r.w * sc), Math.round(r.h * sc),
      ]).catch(() => {});
    }, 250);
    return () => { window.clearTimeout(histSaveTimer.current); };
  }, [phase, dragging, region, textEdit, geom]);
  /** 跳转成功后还原「那一帧自己的框选范围」（局部物理像素 → 本屏 CSS 像素），
      而不是套用全局最后选区 */
  const applyHistRegion = async (file: string) => {
    const g = geomRef.current;
    if (!g) return;
    const it = histItemsRef.current?.find((i) => i.file === file);
    if (!it?.region || it.region.length !== 4) return;
    const sc = cssScale();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const w = Math.max(8, Math.min(it.region[2] / sc, vw));
    const h = Math.max(8, Math.min(it.region[3] / sc, vh));
    const x = Math.max(0, Math.min(it.region[0] / sc, vw - w));
    const y = Math.max(0, Math.min(it.region[1] / sc, vh - h));
    const reg = { x, y, w, h };
    histRestoreRef.current = true;
    setRegion(reg); regRef.current = reg;
    setPhase("selected"); phaseRef.current = "selected";
  };
  /** 直接跳到某条历史（-1=实时）；缩略条保持展开便于继续浏览，
      跳转成功后顺带还原该帧自己记忆的框选范围 */
  const jumpHistory = (index: number) => void (async () => {
    const r = await stepHistoryCore(0, index);
    if (r === undefined) return;
    await applyHistRegion(r === "live" ? "" : r);
  })();
  /** 删除单条历史记录；若删的是当前正在查看的帧，先回到实时画面 */
  const deleteHist = (file: string) => void (async () => {
    const old = histItemsRef.current ?? [];
    const delIdx = old.findIndex((i) => i.file === file);
    const wasCurrent = delIdx >= 0 && histPos === delIdx;
    try { await shotHistoryDelete(file); } catch { return; }
    if (wasCurrent) await stepHistoryCore(0, -1);
    try {
      const l = await shotHistoryList();
      histItemsRef.current = l; setHistItems(l);
      setHistPos((p) => (wasCurrent ? -1 : p > delIdx ? p - 1 : p));
    } catch {}
  })();
  /** 清空全部历史记录并回到实时画面 */
  const clearHist = () => void (async () => {
    await shotHistoryClear().catch(() => {});
    await stepHistoryCore(0, -1).catch(() => {});
    histItemsRef.current = []; setHistItems([]); setHistPos(-1); setHistViewing(false);
  })();

  /** 打开/关闭历史列表（每次打开都重新拉取，缩略图经协议直出） */
  const toggleHistPanel = async () => {
    const next = !histOpenRef.current;
    histOpenRef.current = next;
    setHistOpen(next);
    if (next) {
      try { const l = await shotHistoryList(); histItemsRef.current = l; setHistItems(l); }
      catch { histItemsRef.current = []; setHistItems([]); }
    }
  };
  // 当前位置变化时让活动缩略图滚入可视区。【只在不可见时才滚】：点击已可见
  // 的项若也触发平滑滚动，会把悬停高亮带到相邻项上，看起来"两个都选中了"
  useEffect(() => {
    const panel = histPanelRef.current;
    if (!histOpen || !panel) return;
    const el = panel.querySelector<HTMLElement>(".shot-hist-item.active");
    if (!el) return;
    const pr = panel.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (er.left < pr.left || er.right > pr.right) {
      panel.scrollTo({ left: el.offsetLeft - (panel.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [histPos, histOpen, histItems]);

  // ---- OCR 文字识别 ----
  // 点击工具栏「文字识别」→ 整个选区送 Windows.Media.Ocr；
  // 结果面板出现在选区右侧，可整段复制/逐行复制；
  // 在选区内按住左键拖动可框选部分行，松手弹出 复制/翻译 按钮，Ctrl+C 亦可复制
  type OcrPhase = "idle" | "loading" | "done" | "error";
  const [ocrPhase, setOcrPhase] = useState<OcrPhase>("idle");
  const [ocrLines, setOcrLines] = useState<ShotOcrLine[]>([]);
  const [ocrError, setOcrError] = useState("");
  const ocrBusyRef = useRef(false);
  const [ocrTranslating, setOcrTranslating] = useState(false);
  // 逐行对照结果：pairs 与送译的原文行一一对齐。点「翻译」时先把原文整列铺出来，
  // 译文按后端事件逐行回填（pending 的行先显示占位骨架）
  const [ocrTrans, setOcrTrans] = useState<{
    pairs: { src: string; out: string; ok: boolean; pending: boolean }[];
    err: string;
  } | null>(null);
  // keydown effect 闭包不依赖 ocrPhase：经此 ref 读「OCR 是否激活」
  const ocrActiveRef = useRef(false);
  useEffect(() => { ocrActiveRef.current = ocrPhase !== "idle"; }, [ocrPhase]);

  const resetOcr = () => {
    setOcrPhase("idle"); setOcrLines([]); setOcrError("");
    setOcrTrans(null); setOcrTranslating(false);
  };

  // 译文逐行回填：Rust 每译完一行推一行（并发请求，完成顺序不定，按行号对上）
  useEffect(() => {
    let un: (() => void) | undefined;
    listen<{ i: number; out: string; ok: boolean }>(EVT_TRANSLATE_LINE, (e) => {
      const { i, out, ok } = e.payload;
      setOcrTrans((prev) =>
        !prev || i >= prev.pairs.length
          ? prev
          : { ...prev, pairs: prev.pairs.map((p, k) => (k === i ? { ...p, out, ok, pending: false } : p)) },
      );
    }).then((f) => { un = f; });
    return () => { un?.(); };
  }, []);

  /** 识别整个选定区域：裁剪原始冻结帧（不含标注）→ PNG → 内置 PP-OCR 引擎 */
  const runOcr = async () => {
    if (ocrBusyRef.current) return;
    const bg = bgRef.current;
    const r = regRef.current;
    if (!bg || !geom || bg.width <= 0) return;
    const sc = cssScale();
    const rp = { x: Math.round(r.x * sc), y: Math.round(r.y * sc), w: Math.round(r.w * sc), h: Math.round(r.h * sc) };
    if (rp.w < 2 || rp.h < 2) return;
    const c = document.createElement("canvas");
    c.width = rp.w; c.height = rp.h;
    c.getContext("2d")!.drawImage(bg, rp.x, rp.y, rp.w, rp.h, 0, 0, rp.w, rp.h);
    ocrBusyRef.current = true;
    setOcrPhase("loading");
    try {
      const blob = await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/png"));
      if (!blob) throw new Error("图像编码失败");
      const lines = await shotOcrPost(blob);
      setOcrLines(lines);
      setOcrPhase("done");
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : "识别失败");
      setOcrPhase("error");
    } finally { ocrBusyRef.current = false; }
  };

  /** 翻译当前框选的文字（逐行对照展示在 OCR 面板内）。
   *  逐行送译而不是整段一次：整段只有一组方向，中英混排时英文行会被原样返回，
   *  而且服务商会折叠换行导致译文与原文行号对不上。
   *  点下即铺出原文 + 译文占位，后端每译完一行推事件回填一行；返回值仅作最终校准。 */
  const doTranslate = async () => {
    const sel = window.getSelection?.()?.toString().trim() || "";
    const srcs = (sel || ocrLines.map((l) => l.text).join("\n"))
      .split("\n").map((s) => s.trim()).filter(Boolean);
    if (!srcs.length) return;
    setOcrTranslating(true);
    setOcrTrans({
      err: "",
      pairs: srcs.map((s) => ({ src: s, out: "", ok: true, pending: true })),
    });
    try {
      const res = await translateLines(srcs);
      setOcrTrans({
        err: "",
        pairs: srcs.map((s, i) => ({
          src: s, out: res[i]?.out ?? s, ok: res[i]?.ok !== false, pending: false,
        })),
      });
    } catch (err) {
      setOcrTrans({ pairs: [], err: err instanceof Error ? err.message : String(err) });
    } finally {
      setOcrTranslating(false);
    }
  };

  /** 复制全部识别文本：与面板内 DOM 划选的 Ctrl+C 一致，正常记入剪贴板历史 */
  const copyAllOcr = () => {
    const all = ocrLines.map((l) => l.text).join("\n");
    if (all) void copyText(all, true);
  };

  /** 复制译文（按行重拼；还没译出的行跳过，避免粘出一堆空行） */
  const copyTransOut = () => {
    if (!ocrTrans?.pairs.length) return;
    const all = ocrTrans.pairs.filter((p) => !p.pending).map((p) => p.out).join("\n");
    if (all) void copyText(all, true);
  };

  const querySmartRect = async () => {
    const mySession = sessionRef.current;
    const g = geom;
    const mg = mouseGlobalRef.current;
    if (!g) return;
      // 窗口级 + 元素级（UIA）两段式：窗口级查表零开销、【先到先画】；
      // 元素级随后择优细化（取更精细的命中）。
      // 【不能】用 Promise.all 等两者齐才画——元素级限时 250ms（Chromium 系
      // 应用首次被 UIA 查询会触发无障碍树激活、可达数秒），旧版悬停高亮
      // 总要陪它等满 250ms 才出现，表现为"智能选区出来慢"
      const wantElem = cfg.shot.smart_element !== false;
      type GRect = { x: number; y: number; width: number; height: number };
      type WRect = GRect | null;
      // best 是【全局物理像素】；高亮/选区层用本地 CSS 像素——减显示器原点再 ÷scale，
      // 否则 150% 下悬停高亮框比实际窗口大 1.5 倍、点击采纳的选区整体错位
      const sc = cssScale();
      const toLocal = (r: { x: number; y: number; width: number; height: number }) =>
        ({ x: (r.x - g.x) / sc, y: (r.y - g.y) / sc, w: r.width / sc, h: r.height / sc });
      let locked = false; // 元素级细化后锁定：迟到的窗口级结果不得回退覆盖
      const commit = (best: WRect) => {
        // 响应到达时已开始拖拽/缩放（或进入取色）：丢弃这份迟到的识别结果——
        // 否则刚被拖拽清掉的智能高亮会在此"复活"，与手动选区边框同屏（两个框）
        if (dragRef.current || resizeRef.current || pickerModeRef.current) return;
        // 上一会话的在途响应：绝不画进本会话——否则呼出瞬间会闪现旧窗口高亮框
        if (mySession !== sessionRef.current) return;
        lastRectRef.current = best ? { x: best.x, y: best.y, w: best.width, h: best.height } : null;
        const local = best ? toLocal(best) : null;
        // 与当前高亮完全一致时不再 setState：悬停中的重复识别不触发重绘
        // （每次 setSnap 都会让选区层重绘一遍，重复绘制表现为高亮框"闪"）
        const cur = snapRef.current;
        const same = (cur === null && local === null) ||
          (cur !== null && local !== null && cur.x === local.x && cur.y === local.y && cur.w === local.w && cur.h === local.h);
        snapRef.current = local;
        if (!same) setSnap(local);
      };
      // 【本地窗口命中】cands 与 Rust candidate_at 同表同序（Z 序顶→底），
      // 纯数组扫描零 IPC——高亮首帧延迟从一次 IPC 往返(~10-20ms)降到 <0.1ms，
      // 与 Snipaste 同级跟手。快照缺失时回退服务端查表（保持并发，不阻塞 UIA）
      let wr: WRect = null;
      let wrDone: Promise<WRect | null> | null = null;
      const cands = candsRef.current;
      // 窗口级命中没有元素链：滚轮层级切换随旧链一并失效
      const clearChain = () => { snapChainRef.current = null; snapIdxRef.current = 0; setChainLen(0); chainWinRef.current = null; };
      // 同窗口且已有可见高亮：跳过窗口框重画，保留当前元素高亮等 er 细化——
      // 否则元素区内每次移动都"窗口框→元素框"闪一遍（移动中狂闪的根因）
      const sameWinAsShown = (win: WRect) => {
        const cw = chainWinRef.current;
        return !!(cw && win && cw.x === win.x && cw.y === win.y
          && cw.width === win.width && cw.height === win.height && snapRef.current);
      };
      if (cands) {
        for (const c of cands) {
          if (mg.x >= c.x && mg.x < c.x + c.width && mg.y >= c.y && mg.y < c.y + c.height) { wr = c; break; }
        }
        if (!sameWinAsShown(wr)) {
          clearChain();
          commit(wr);
          chainWinRef.current = wr;
        }
      } else {
        const wrPromise = shotWindowRectAt(mg.x, mg.y).catch(() => null);
        void wrPromise.then((r) => {
          if (locked || sameWinAsShown(r)) return;
          clearChain();
          commit(r);
          chainWinRef.current = r;
        });
        wrDone = wrPromise;
      }
      // —— 元素级：单飞门控，只挡本段 ——
      // 窗口级高亮已在上方即时提交（悬停跟手由它保证）；元素级查一次 ~60-320ms，
      // 在途时后来的请求只挂 pending、等本次结束在 finally 里补查最新位置。
      // 【早退必须在 try/finally 之外】在 try 内早退会触发 finally：既误把别人
      // 在途的锁释放掉，又因 pending 仍为真而立刻重入，形成自旋。
      if (detectBusyRef.current) { detectPendingRef.current = true; return; }
      detectBusyRef.current = true;
      // 过期结果标记：提交后光标已离开结果矩形 → finally 里补查当前位置
      let staleRefire = false;
      try {
      // 链落地：UIA 全局链 erArr +（与链最外层明显不同时）末尾补窗口矩形，
      // 一次产出【本地 chain】与【全局 levels】两个严格等长的数组。
      // 【必须成对维护】高亮提交只能按下标取 levels：改取 erArr[idx] 会在
      // "补了窗口层"的链上越界拿到 undefined → 高亮被清空 → 下一帧整窗框复活
      // → 再下一帧回到元素框，正是"鼠标在区域内移动、选区来回向上扩展再还原"
      const landChain = (g0: GRect, erArr: GRect[], winRect: WRect) => {
        const s0 = cssScale();
        const lv: GRect[] = erArr.slice();
        const ch: Rect[] = erArr.map((r) => ({
          x: (r.x - g0.x) / s0, y: (r.y - g0.y) / s0, w: r.width / s0, h: r.height / s0,
        }));
        if (winRect) {
          const wl: Rect = {
            x: (winRect.x - g0.x) / s0, y: (winRect.y - g0.y) / s0,
            w: winRect.width / s0, h: winRect.height / s0,
          };
          const last = ch[ch.length - 1];
          if (Math.abs(last.x - wl.x) > 1 || Math.abs(last.y - wl.y) > 1 ||
              Math.abs(last.w - wl.w) > 1 || Math.abs(last.h - wl.h) > 1) {
            ch.push(wl);
            lv.push(winRect);
          }
        }
        return { ch, lv };
      };
      // 新链落地时决定滚轮档位：优先沿用"当前显示矩形正好对应的那一层"。
      // 【不能只在整条链逐字节相等时保持】——窗口层补与不补会让链长差 1，
      // 整链比对随即失败，把用户刚滚出来的档位拽回最内层。
      // 【门禁：必须已有元素链】光标刚进新窗口时首绘画的是窗口框兜底
      // （那一步 clearChain 过），它在窗口层进链后必然匹配到最外层——不拦就
      // 永远停在整窗级、再也不向元素细化（智能选区"只认整窗"的由来）
      const pickIdx = (ch: Rect[], fallback: number) => {
        const cur = snapRef.current;
        if (snapChainRef.current && cur) {
          const i = ch.findIndex((r) => Math.abs(r.x - cur.x) <= 1 && Math.abs(r.y - cur.y) <= 1
            && Math.abs(r.w - cur.w) <= 1 && Math.abs(r.h - cur.h) <= 1);
          if (i >= 0) return i;
        }
        return Math.min(Math.max(fallback, 0), ch.length - 1);
      };
      // 竞速窗口必须 ≥ 命令侧 recv_timeout(300ms)：前端先于后端放弃时，worker
      // 算好的整条链随接收端一起丢弃，只能靠"迟到采纳"接住，而每接一次就多一轮
      // 清缓存→重画→重查。旧值 200ms 短于 Chrome 实测单趟（113~190ms 纯查询
      // + 排队/IPC 开销），大量悬停白走超时路径——浏览器里高亮反复闪的放大器
      const erTimeout = new Promise<null>((res) => setTimeout(() => res(null), 320));
      // UIA 返回【候选链】（内→外，链[0] 最精确）：旧版只有单矩形，
      // 滚轮层级切换（按钮→工具条→整窗）需要整条链
      const erPromise: Promise<GRect[] | null> =
        wantElem ? shotUiRectAt(mg.x, mg.y).catch(() => null) : Promise.resolve(null);
      const er = wantElem
        ? await Promise.race([erPromise, erTimeout])
        : await erPromise;
      // 竞速超时/未命中 ≠ 放弃：Chromium 首次激活无障碍树可达数秒，结果迟到时
      // 只要光标没走远、没开始拖拽，照样把链画出来（"浏览器第一次永远没反应"的解药）
      if (!er || er.length === 0 || !(er[0].width > 0 && er[0].height > 0)) {
        elemFailAtRef.current = Date.now();
        // 失败即清缓存：否则旧高亮框留在原地，光标在其内移动被缓存吞掉，
        // 要等滑出旧框才重查——正是"高亮时有时无/卡在旧位置"的根因
        lastRectRef.current = null;
        void erPromise.then((late) => {
          if (!late || late.length === 0 || !(late[0].width > 0 && late[0].height > 0)) return;
          if (dragRef.current || resizeRef.current || pickerModeRef.current) return;
          if (mySession !== sessionRef.current) return;
          const g2 = geomRef.current;
          if (!g2) return;
          // 光标仍在这份结果【最内层矩形内】(±8px 容差)才采纳——迟到的结果
          // 描的就是光标停留的位置；已离开说明在等别处的结果，丢弃让下次
          // 移动重新查询。不能用固定距离判定：慢查询期间光标原地微动几像素
          // 很正常，固定距离会把原地等待的结果也误杀（"有时触发不来"根因）
          const mgi = mouseGlobalRef.current;
          const inner = late[0];
          const inside = mgi.x >= inner.x - 8 && mgi.x <= inner.x + inner.width + 8
            && mgi.y >= inner.y - 8 && mgi.y <= inner.y + inner.height + 8;
          if (!inside) return;
          // 与正常路径同构：本地链与全局层级成对产出，档位按当前显示矩形匹配
          // （旧写法硬置 idx=0，用户刚滚出来的层级会被一份迟到结果冲掉）
          const { ch, lv } = landChain(g2, late, wr);
          const idx = pickIdx(ch, 0);
          snapChainRef.current = ch;
          snapIdxRef.current = idx;
          setChainLen(ch.length);
          chainWinRef.current = wr;
          lastRectRef.current = { x: lv[idx].x, y: lv[idx].y, w: lv[idx].width, h: lv[idx].height };
          const r = ch[idx];
          snapRef.current = r;
          setSnap(r);
          elemFailAtRef.current = 0;
        });
        return;
      }
      elemFailAtRef.current = 0;
      // 择优取【更精细】的命中：链[0]（最精确元素）显著小于窗口矩形（<98%）
      // 时采用——悬停浏览器页面时能直接框选按钮/输入框等组件；全屏级
      // （≥90% 屏幕）无意义剔除。元素缺失/异常自动保持窗口级
      const wrFinal = wrDone ? await wrDone : wr;
      // 过期守卫：元素级查询要 ~60-320ms，落地时光标可能已划出这份结果所属的
      // 窗口（窗口级高亮每次移动即时提交、早就跟过去了）。此时画旧窗口的元素框
      // 会闪一下错误位置——直接丢弃，交给下方补查/下次移动重查当前位置
      if (wrFinal) {
        const mgn = mouseGlobalRef.current;
        if (mgn.x < wrFinal.x || mgn.x > wrFinal.x + wrFinal.width ||
            mgn.y < wrFinal.y || mgn.y > wrFinal.y + wrFinal.height) {
          staleRefire = true;
          return;
        }
      }
      const er0 = er[0];
      const { ch, lv } = landChain(g, er, wrFinal);
      const ea = er0.width * er0.height;
      const wa = wrFinal ? wrFinal.width * wrFinal.height : Infinity;
      const screenArea = g.width * g.height;
      const preferInner = ea < wa * 0.98 && ea < screenArea * 0.9;
      // 档位判定：当前显示矩形能在新链里匹配到对应层就沿用该层（同元素内微动、
      // 重查、以及窗口层补与不补导致的链长变化都不掉档）；匹配不上才回默认档——
      // 元素显著小于窗口取最内层，否则落到最外层（= 窗口级）
      const idx = pickIdx(ch, preferInner ? 0 : ch.length - 1);
      snapChainRef.current = ch;
      snapIdxRef.current = idx;
      setChainLen(ch.length);
      locked = true;
      commit(lv[idx]);
      chainWinRef.current = wrFinal;
      // 【过期结果补查】提交后光标已不在结果矩形内（查询按发起时的位置做的，
      // 快速划动/结果迟到时光标早走了）：标记补查——在 finally 里立刻重查
      // 当前位置，不依赖下一次 mousemove。否则鼠标一停，高亮就冻结在旧框上
      //（"鼠标明明已经在外面了，框选区域还是没变"的根因）
      const cb = lastRectRef.current;
      const mgNow = mouseGlobalRef.current;
      staleRefire = !!cb && (mgNow.x < cb.x - 8 || mgNow.x > cb.x + cb.w + 8
        || mgNow.y < cb.y - 8 || mgNow.y > cb.y + cb.h + 8);
    } catch {} finally {
      // 先释放锁、再补查：查询期间光标又动了 → 立即补查最新位置。
      // 【绝不能在 try 里递归调用】——递归入口会看到 busy 仍为 true 而只把
      // 请求挂到 pending，若此时跳过本行释放，busy 永久为 true，
      // 后续所有悬停识别都被吞掉（"只有第一次识别生效"的根因）
      detectBusyRef.current = false;
      if (staleRefire) {
        // 防循环上限：provider 返回异常矩形（永远不含光标）时最多连补 3 次；
        // 正常场景光标移动会重置计数
        staleRefireCountRef.current += 1;
        if (staleRefireCountRef.current <= 3) detectPendingRef.current = true;
      }
      if (detectPendingRef.current && mySession === sessionRef.current &&
          !dragRef.current && !resizeRef.current && !pickerModeRef.current) {
        detectPendingRef.current = false;
        void querySmartRect();
      }
    }
  };

  // 拖动/缩放的视觉更新经 rAF 合并：一帧内多次 mousemove 只渲染一次，
  // 范围框才能跟手（直接 setState 会因 React 调度产生可感知延迟）
  const moveRafRef = useRef(0);
  const movePtRef = useRef<Pt>({x:0,y:0});
  // 选区层低延迟画布：拖拽期间每帧直绘（不经 React、不走合成器排队），
  // 边框右下角与光标严格逐帧重合
  const selCanvasRef = useRef<HTMLCanvasElement|null>(null);
  const selCtxRef = useRef<CanvasRenderingContext2D|null>(null);
  // 鼠标事件层：手柄悬停时动态切换光标（手柄由画布绘制，无 CSS :hover）
  const handlersRef = useRef<HTMLDivElement|null>(null);
  // 选区层重绘合并 + 主题色缓存：鼠标回报率（125~1000Hz）远高于刷新率，
  // 逐事件全屏重绘（50% 黑填充 + 镂空 + 描边）会让光栅/合成过载反而掉帧。
  // 合并到每帧一次：事件里只更新 regRef 并排队，rAF 用【最新】矩形画一次
  const selPaintRafRef = useRef(0);
  const accentRef = useRef<string | null>(null);
  // 放大镜命令式节点：位置/坐标文本/画布采样全部直改，不经 React
  const magBoxRef = useRef<HTMLDivElement>(null);
  const magCanvasRef = useRef<HTMLCanvasElement>(null);
  /** 镜头形状（React state 驱动 className，避免命令式 classList 被重渲染抹掉）：
   *  false=方形 / true=圆形；随配置持久化（cfg.shot.magnifier_round），
   *  下次打开/下次截图会话保持上次形状 */
  const [magCircle, setMagCircle] = useState(false);
  /** magCircle 镜像：keydown 闭包读最新值（state 闭包会过期） */
  const magCircleRef = useRef(false);
  useEffect(() => { magCircleRef.current = magCircle; }, [magCircle]);
  /** 配置加载/变更（含每次截图会话挂载）→ 应用持久化的放大镜形状 */
  useEffect(() => {
    setMagCircle(cfg.shot.magnifier_round ?? false);
  }, [cfg.shot.magnifier_round]);
  /** showMag 镜像：keydown 闭包读最新值（state 闭包会过期） */
  const showMagRef = useRef(false);
  useEffect(() => { showMagRef.current = showMag; }, [showMag]);
  const magCoordRef = useRef<HTMLSpanElement>(null);
  // 放大镜取色：色块背景 / 颜色值文本 / 复制反馈行 / 当前格式徽标
  const magSwatchRef = useRef<HTMLSpanElement>(null);
  const magValRef = useRef<HTMLSpanElement>(null);
  const magFmtRef = useRef<HTMLSpanElement>(null);
  const magCopiedRef = useRef<HTMLDivElement>(null);
  // 取色模式命令式节点：全屏十字线 / 中心点 / 信息面板（坐标、色块、颜色值、反馈）
  const pickerLineHRef = useRef<HTMLDivElement>(null);
  const pickerLineVRef = useRef<HTMLDivElement>(null);
  const pickerDotRef = useRef<HTMLDivElement>(null);
  const pickerPanelRef = useRef<HTMLDivElement>(null);
  const pickerCoordRef = useRef<HTMLSpanElement>(null);
  const pickerSwatchRef = useRef<HTMLSpanElement>(null);
  const pickerValRef = useRef<HTMLSpanElement>(null);
  const pickerFmtRef = useRef<HTMLSpanElement>(null);
  const pickerCopiedRef = useRef<HTMLDivElement>(null);
  /** 格式徽标直改（RGB/HEX）：让用户随时知道当前颜色格式 */
  const syncFmtBadges = (f: ColorFmt) => {
    const t = f.toUpperCase();
    if (magFmtRef.current) magFmtRef.current.textContent = t;
    if (pickerFmtRef.current) pickerFmtRef.current.textContent = t;
  };
  // geom 镜像：rAF 回调闭包里读最新几何（state 闭包会过期）
  const geomRef = useRef(geom);
  useEffect(() => { geomRef.current = geom; }, [geom]);
  // 窗口 Z 序快照镜像（全局物理坐标，顶→底）：悬停窗口级命中本地扫描用
  const candsRef = useRef<{ x: number; y: number; width: number; height: number }[] | null>(null);
  /** 画布位图（物理像素）与 CSS 像素的比例 = geom.width / innerWidth。
   *  所有 UI 坐标统一用【CSS 像素】存储与运算，只在「往画布画」或
   *  「采样冻结帧」这两个边界乘以它——消除高 DPI（150%）下错位。
   *  【多屏混合 DPI 兜底】窗口跨缩放比不同的显示器移动/复用窗被 set_size
   *  后，innerWidth 可能滞后一拍仍是旧屏的值——按它算出的 scale 会把智能
   *  高亮框放大/缩小错位。devicePixelRatio 随所在屏幕即时更新，两者偏差
   *  超过舍入误差时以 DPR 为准 */
  const cssScale = (): number => {
    const g = geomRef.current;
    if (!g || window.innerWidth <= 0) return 1;
    const byViewport = g.width / window.innerWidth;
    const dpr = window.devicePixelRatio || 1;
    return Math.abs(byViewport - dpr) > 0.02 ? dpr : byViewport;
  };
  // phase 镜像：rAF 回调里判断当前阶段（选区确认后放大镜立即退场，
  // 否则它叠在刚出现的按钮栏旁边会造成视觉闪动）
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* ---- 原生拖拽层接管 ----
   * 拖拽/缩放热路径下沉到 Rust：原生线程高频轮询光标、把压暗+镂空+边框
   * 直绘进冻结层 DIB（webview 之下），从光标移动到像素上屏只隔一次 DWM
   * 合成，与 Snipaste 同级延迟。前端只在【首次移动】和【松手】各发一次 IPC。
   * nativeDrag=true 期间本组件的选区画布保持全透明（清空 + 跳过重绘）让位，
   * 否则 webview 的压暗层会盖住原生绘制。 */
  const nativeDragRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  /** CSS 像素 → 全局物理坐标（原生层工作在物理像素，无 DPI 折算误差） */
  const cssToGlobal = (pt: Pt): Pt => {
    const g = geomRef.current;
    const k = cssScale();
    return g ? { x: Math.round(pt.x * k) + g.x, y: Math.round(pt.y * k) + g.y } : { x: pt.x, y: pt.y };
  };
  /** 从缓存的主题色字符串 "rgb(r,g,b)" 解析 RGB（解析失败回退默认强调色） */
  const accentRGB = (): [number, number, number] => {
    const m = (accentRef.current ?? "").match(/\d+/g);
    return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [76, 141, 255];
  };
  /** 激活原生绘制并清空 webview 选区画布让位（幂等；每场拖拽只发一次 IPC） */
  const beginNativeDrag = (mode: number, hx = 0, hy = 0, start?: Rect) => {
    if (nativeDragRef.current || pickerModeRef.current) return;
    nativeDragRef.current = true;
    cancelSelPaint();
    const g = geomRef.current;
    const anchor = mode === 0 && dragRef.current ? cssToGlobal(dragRef.current) : { x: 0, y: 0 };
    let s = { sx: 0, sy: 0, sw: 0, sh: 0 };
    if (start && g) {
      const sp = cssToGlobal({ x: start.x, y: start.y });
      const k = cssScale();
      s = { sx: sp.x, sy: sp.y, sw: Math.round(start.w * k), sh: Math.round(start.h * k) };
    }
    void shotDragBegin({
      mode, ax: anchor.x, ay: anchor.y, hx, hy, ...s,
      accent: accentRGB(), scale: cssScale(),
    }).catch(() => {});
  };
  /** 松手交还：先解除让位标志让 webview 能重画最终矩形，画完再通知 Rust
   *  还原冻结层——两个提交落在同一刷新周期，无缝衔接无闪烁。
   *  shotDragEnd 延后双 rAF：等本帧 webview 画面真正合成上屏后再还原原生
   *  压暗，否则会出现「原生先撤、webview 未合成上来」的一帧全亮闪屏 */
  const handoverNativeDrag = (paint: () => void) => {
    const wasNative = nativeDragRef.current;
    nativeDragRef.current = false;
    paint();
    if (wasNative) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        void shotDragEnd().catch(() => {});
      }));
    }
  };

  // 放大镜逐帧绘制（在 applyMoveVisual 的 rAF 里调用）：
  // 直改 style + canvas.drawImage 采样冻结帧，无 setState → 拖动零重渲染
  const drawMagnifier = () => {
    const box = magBoxRef.current, c = magCanvasRef.current;
    const g = geomRef.current;
    if (!box || !c || !g || !bgRef.current) return;
    const m = mouseRef.current;
    // mouseRef 已是【CSS 像素】坐标（toCanvas 产出）。放大镜用 position:fixed
    // 定位，left/top 本就应是 CSS 像素——直接用 m.x/m.y，不再折算（旧版
    // m.x*rc.width/g.width 反而多乘了一次、整体偏移一个 DPI 系数）。
    // 但镜头采样/取色要读【物理像素】的冻结帧 bg：物理 = CSS × scale。
    const scale = cssScale();
    const mx = m.x, my = m.y; // 定位用 CSS 像素，直接
    const vw = window.innerWidth, vh = window.innerHeight;
    // 放大镜【水平居中】于光标（位于光标正下方），并做左右边缘钳制避免越屏；
    // 旧版 left=mx+20 把整盒推到光标右侧，呈现"右下方"错位 → 改为居中
    const halfW = MAG_BOX_W / 2;
    let left = mx - halfW;
    if (left < 4) left = 4;
    else if (left + MAG_BOX_W > vw - 4) left = vw - MAG_BOX_W - 4;
    box.style.left = `${left}px`;
    // 整体高约 镜头140 + 信息区~80：下缘预留不足时翻到光标上方
    box.style.top = `${my < vh - MAG - 130 ? my + 20 : my - MAG - 150}px`;
    c.width = MAG; c.height = MAG;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const src = MAG / MAG_Z; // 镜头覆盖的【CSS 像素】边长
    ctx.clearRect(0, 0, MAG, MAG);
    // 采样框换算到 bg 的物理像素：中心 m×scale，边长 src×scale
    const sx = (m.x - src / 2) * scale, sy = (m.y - src / 2) * scale, sSize = src * scale;
    ctx.drawImage(bgRef.current, sx, sy, sSize, sSize, 0, 0, MAG, MAG);
    // center cross
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(MAG/2,0); ctx.lineTo(MAG/2,MAG); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,MAG/2); ctx.lineTo(MAG,MAG/2); ctx.stroke();
    if (magCoordRef.current) magCoordRef.current.textContent = `(${m.x},${m.y})`;
    // 取色：采样中心像素（物理坐标）并直改色块/颜色值文本（无 setState，拖动零重渲染）
    const col = sampleColor(m.x * scale, m.y * scale);
    if (col) {
      pickedRef.current = col;
      if (magSwatchRef.current) magSwatchRef.current.style.background = `rgb(${col[0]},${col[1]},${col[2]})`;
      if (magValRef.current) magValRef.current.textContent = fmtDisplay(col, colorFmtRef.current);
      syncFmtBadges(colorFmtRef.current);
    }
  };

  /** 取色模式逐帧视觉更新：全屏十字线/中心点/信息面板全部直改 DOM，
   *  与放大镜同款零重渲染策略（组件不因鼠标移动重渲染） */
  const updatePickerVisual = (pt: Pt) => {
    const g = geomRef.current;
    const panel = pickerPanelRef.current;
    if (!g || !panel || !bgRef.current) return;
    // pt 已是【CSS 像素】坐标（toCanvas 产出）。十字线/面板/中心点用 position:fixed
    // 定位，left/top 本就应是 CSS 像素——直接用 pt.x/pt.y（旧版 ×rc.width/g.width
    // 多乘一次、整体偏移一个 DPI 系数）。但采样要读【物理像素】冻结帧：物理 = CSS×scale。
    const scale = cssScale();
    const px = pt.x, py = pt.y; // 定位用 CSS 像素，直接
    if (pickerLineHRef.current) pickerLineHRef.current.style.top = `${py}px`;
    if (pickerLineVRef.current) pickerLineVRef.current.style.left = `${px}px`;
    if (pickerDotRef.current) {
      pickerDotRef.current.style.left = `${px - 5}px`;
      pickerDotRef.current.style.top = `${py - 5}px`;
    }
    // 面板默认出现在右下方，靠近右/下边缘时翻到另一侧
    // （CSS width:196 为 content-box，加左右内边距与描边后实际约 220px 宽）
    const pw = 220, ph = 130;
    const vw = window.innerWidth, vh = window.innerHeight;
    panel.style.left = `${px + 18 + pw > vw ? px - 18 - pw : px + 18}px`;
    panel.style.top = `${py + 18 + ph > vh ? py - 18 - ph : py + 18}px`;
    if (pickerCoordRef.current) {
      // 显示全局物理坐标（跨显示器与系统坐标系一致）：CSS×scale + 显示器原点
      pickerCoordRef.current.textContent = `(${Math.round(pt.x * scale) + g.x} , ${Math.round(pt.y * scale) + g.y})`;
    }
    const col = sampleColor(pt.x * scale, pt.y * scale);
    if (col) {
      pickedRef.current = col;
      if (pickerSwatchRef.current) pickerSwatchRef.current.style.background = `rgb(${col[0]},${col[1]},${col[2]})`;
      if (pickerValRef.current) pickerValRef.current.textContent = fmtDisplay(col, colorFmtRef.current);
      syncFmtBadges(colorFmtRef.current);
    }
  };

  const applyMoveVisual = (pt: Pt) => {
    mouseRef.current = pt;
    // 取色模式：只更新十字线+信息面板，不进选区/放大镜逻辑
    if (pickerModeRef.current) { updatePickerVisual(pt); return; }
    // 放大镜全程可用（悬停/拖拽选区/确认后调整边缘），仅取色与文字编辑时退场
    setShowMag(true);
    drawMagnifier();
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
      // 只写 ref + 直改 DOM，不 setState——拖拽/缩放期间任何 setState 都会
      // 触发整组件重渲染，是掉帧延迟的根源；state 在松手时（onUp）统一提交
      if (w >= 2 && h >= 2) {
        const r = {x,y,w,h}; regRef.current = r;
        beginNativeDrag(1, hx, hy, start); // 首次移动时原生层接管（幂等）
        queueSelPaint(); // 原生接管后此调用为空操作（paintSelCanvas 内部让位）
      }
      return;
    }
    // phase 必须读 ref：mousedown 刚把 phase 置回 idle 时 React 还没提交，
    // rAF 闭包里的 state 仍是 "selected"，会导致拖拽中清不掉旧智能高亮
    if (phaseRef.current === "idle" && dragRef.current) {
      const s = dragRef.current;
      const r = { x: Math.min(s.x,pt.x), y: Math.min(s.y,pt.y), w: Math.abs(pt.x-s.x), h: Math.abs(pt.y-s.y) };
      regRef.current = r;
      // 纯点击（几乎未拖动）绝不唤起原生层：原生拖拽层接管/交还存在瞬态
      // 窗口期（原生压暗与 webview 画面前后衔接的间隙），点击确认智能框选
      // 时概率性闪一下屏的根源就在这——0×0 矩形走 onUp 的纯 webview 路径
      if (r.w > 2 || r.h > 2) {
        beginNativeDrag(0); // 首次移动时原生层接管（幂等）
        queueSelPaint();
        // 兜底再清一次智能高亮引用（可视 snap 已在 mousedown 时立即隐藏）
        if (snapRef.current) { snapRef.current = null; setSnap(null); }
      }
    }
  };

  const onMove = (e: React.MouseEvent) => {
    const pt = toCanvas(e);
    if (geom) {
      // 全局物理坐标（窗口识别/hit-test 用）：pt 是本地 CSS 像素，须 ×scale
      // 转物理后再加显示器原点。【必须 Math.round】——Rust 命令参数是 i32，
      // 带小数的坐标会让 invoke 反序列化失败直接 reject（表现恰为"识别一次
      // 后全部失效"：初始识别在 Rust 端用整数光标坐标所以正常）
      const sc = cssScale();
      mouseGlobalRef.current = {
        x: Math.round(pt.x * sc + geom.x),
        y: Math.round(pt.y * sc + geom.y),
      };
    }
    movePtRef.current = pt;
    // 【原生快速路径】拖拽/缩放热路径由 Rust 直绘冻结层：首次移动时发一次
    // shotDragBegin 登记锚点，此后拖动过程零 IPC——原生线程高频轮询光标
    // 自绘，从光标移动到像素上屏只隔一次 DWM 合成（Snipaste 级延迟）。
    // 本画布被清空让位；regRef 持续更新供松手时提交最终矩形
    if (dragRef.current && phaseRef.current === "idle") {
      const s = dragRef.current;
      const r = { x: Math.min(s.x,pt.x), y: Math.min(s.y,pt.y), w: Math.abs(pt.x-s.x), h: Math.abs(pt.y-s.y) };
      regRef.current = r;
      beginNativeDrag(0);
      queueSelPaint(); // 原生接管后为空操作（paintSelCanvas 内部让位）
      if ((r.w > 2 || r.h > 2) && snapRef.current) { snapRef.current = null; setSnap(null); }
    } else if (resizeRef.current) {
      const { hx, hy, start, startPt } = resizeRef.current;
      const dx = pt.x - startPt.x, dy = pt.y - startPt.y;
      let x = start.x, y = start.y, w = start.w, h = start.h;
      if (hx === -1) { x = start.x + dx; w = start.w - dx; }
      else if (hx === 1) { w = start.w + dx; }
      if (hy === -1) { y = start.y + dy; h = start.h - dy; }
      else if (hy === 1) { h = start.h + dy; }
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
      if (w >= 2 && h >= 2) {
        const r = {x,y,w,h}; regRef.current = r;
        beginNativeDrag(1, hx, hy, start);
        queueSelPaint();
      }
    }
    // 手柄悬停光标反馈（手柄由画布绘制，无 CSS :hover 可用）
    if (phaseRef.current === "selected" && !dragRef.current && !resizeRef.current) {
      const el = handlersRef.current;
      if (el) el.style.cursor = hitHandle(pt) ? "pointer" : "crosshair";
    }
    if (!moveRafRef.current) {
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0;
        applyMoveVisual(movePtRef.current);
      });
    }
    // 取色模式不做智能窗口识别（无选区概念），省掉悬停查询开销
    if (phase === "idle" && !dragRef.current && cfg.shot.smart_detect && geom && !pickerModeRef.current) {
      staleRefireCountRef.current = 0;   // 光标在动：过期补查计数重置
      const mg = mouseGlobalRef.current;
      const lr = lastRectRef.current;
      // 命中缓存：仅【纯窗口级】结果（无元素链）可缓存——光标仍在识别过的窗口内
      // 跳过查询（悬停零开销）。有元素链时不缓存：链[0] 是元素矩形（可能是
      // 面板/工具条级别的大元素），光标在其内移动也必须重查，否则大元素内部
      // 的小组件永远识别不出来（"大区域内部识别不出小区域"根因）。
      // 全屏级矩形（桌面）同样不缓存——否则光标永远"在框内"
      const coversScreen = lr ? lr.w * lr.h >= geom.width * geom.height * 0.9 : false;
      const haveChain = snapChainRef.current !== null;
      const retryDue = elemFailAtRef.current > 0 && Date.now() - elemFailAtRef.current > 350;
      if (retryDue) elemFailAtRef.current = Date.now();
      if (lr && !coversScreen && !haveChain && !retryDue
          && mg.x >= lr.x && mg.x < lr.x + lr.w && mg.y >= lr.y && mg.y < lr.y + lr.h) return;
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
      // 文本起点取输入框【实际渲染位置】（getBoundingClientRect，CSS 像素）：
      // 显示在哪就画到哪——旧版存的是鼠标点击点，与编辑器被边界钳制后的
      // 实际位置、以及左对齐垂直居中的偏移都对不上（"保存后错位"根因）
      let ox = te.x, oy = te.y;
      const r = textInputRef.current?.getBoundingClientRect();
      if (r) { ox = r.left; oy = r.top; }
      setAnnos((arr)=>[...arr, { kind:"text", x1:ox, y1:oy, x2:ox, y2:oy,
        color, width: sw, text: te.value }]);
    }
    setTextEdit(null);
  };

  /** 【时序马赛克】拍当前画面快照（底图 + 已存在的全部标注，物理分辨率）：
   *  作为该条马赛克笔画终生的采样源 */
  const captureMosaicUnderlay = (): HTMLCanvasElement | null => {
    const bg = bgRef.current;
    if (!bg || bg.width <= 0 || !geom) return null;
    const snap = document.createElement("canvas");
    snap.width = geom.width; snap.height = geom.height;
    const sctx = snap.getContext("2d")!;
    sctx.drawImage(bg, 0, 0);
    const sc = cssScale();
    for (const s of annos) drawShape(sctx, s, bg, undefined, sc);
    return snap;
  };

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // 取色模式：单击 = 复制当前颜色并退出（即点即得）
    if (pickerModeRef.current) { e.preventDefault(); copyPicked(true); return; }
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
      // 【时序马赛克】落下瞬间拍「当时画面」快照（底图 + 已存在的全部标注）：
      // 之后这条马赛克永远像素化这一帧状态；后续新标注不受影响
      if (tool==="mosaic") {
        a.sid = ++mosaicSid;
        const snap = captureMosaicUnderlay();
        if (snap) mosaicSnapshots.set(a.sid, snap);
      }
      setAnnos((arr)=>[...arr, a]);
      const onM = (ev: MouseEvent) => {
        const rc = bgRef.current?.getBoundingClientRect(); if (!rc||!geom) return;
        // 与 onDown 的 toCanvas 保持一致：统一用【CSS 像素】坐标。
        // 旧版这里又乘了 geom.width/rc.width 转成物理像素，导致 x1(CSS) 与
        // x2(物理) 不同坐标系、矩形右下角不跟光标——正是"画矩形错位"的根因
        const mx = Math.round(ev.clientX - rc.left);
        const my = Math.round(ev.clientY - rc.top);
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
    // 按下左键瞬间：若有智能高亮，把它【无缝】转成"拖拽中的选区"——
    // 同位置、同亮度、同色边框，肉眼零变化：
    // 1) 点击采纳窗口：全程不经历"整屏压暗再恢复"，绝不闪烁；
    // 2) 手动拖拽：该边框从第一帧起跟随手动矩形，智能边框绝不残留在原窗口轮廓；
    // snapRef 保留——松手时"点击采纳窗口"仍要用它；
    // 在途的悬停识别结果会因 dragRef 已置位而被 querySmartRect 丢弃，不会复活
    if (snapRef.current && phase === "idle") {
      const sr = snapRef.current;
      setRegion(sr); regRef.current = sr;
      setSnap(null);
    }
    dragRef.current = pt; setTextEdit(null); setPhase("idle"); setDragging(true);
    lastRectRef.current = null;
  };

  const onUp = (e: React.MouseEvent) => {
    // 取消未执行的 rAF 并同步应用最后位置，避免松手时选区落后一帧
    if (moveRafRef.current) { cancelAnimationFrame(moveRafRef.current); moveRafRef.current = 0; }
    applyMoveVisual(toCanvas(e));
    cancelSelPaint(); // applyMoveVisual 里排队的重绘作废，下面按最终状态显式重画
    if (resizeRef.current) {
      resizeRef.current = null;
      // 拖拽期间走的是原生直绘路径，松手把最终矩形同步回 state 并按最终状态重画
      //（手柄出现、边框定型），随后交还原生层还原冻结帧
      setRegion(regRef.current);
      handoverNativeDrag(() => paintSelCanvas());
      const sc = cssScale();
      shotSaveRegion([regRef.current.x*sc+(geom?.x??0),regRef.current.y*sc+(geom?.y??0),regRef.current.w*sc,regRef.current.h*sc]); return;
    }
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
      // 同步 ref：下面的立即重绘在 React 提交前执行，读 ref 会拿到过期 "idle"
      phaseRef.current = "selected";
      // 关键：上面 applyMoveVisual 已把画布清成 0×0（点击时起点=终点），
      // 必须立即按最终矩形重画，否则边框和亮区消失
      handoverNativeDrag(() => paintSelCanvas("selected"));
      const sc = cssScale();
      shotSaveRegion([r.x*sc+(geom?.x??0),r.y*sc+(geom?.y??0),r.w*sc,r.h*sc]);
      return;
    }
    const r = {x:Math.min(s.x,pt.x),y:Math.min(s.y,pt.y),w:Math.abs(pt.x-s.x),h:Math.abs(pt.y-s.y)};
    if (r.w > 2 && r.h > 2) {
      setRegion(r); regRef.current = r; setPhase("selected");
      phaseRef.current = "selected";
      handoverNativeDrag(() => paintSelCanvas("selected"));
      const sc = cssScale();
      shotSaveRegion([r.x*sc+(geom?.x??0),r.y*sc+(geom?.y??0),r.w*sc,r.h*sc]);
    }
    else { setPhase("idle"); phaseRef.current = "idle"; handoverNativeDrag(() => paintSelCanvas("idle")); }
  };

  // 选区 PNG 预编码缓存：选区/标注稳定后空闲时提前编码，
  // 点击复制/贴图/保存时直接取用（toBlob 由 Chromium 后台线程编码，不卡 UI）
  const pngCacheRef = useRef<{ key: string; blob: Blob } | null>(null);

  const selectionKey = () => {
    const r = regRef.current;
    return [r.x, r.y, r.w, r.h, annos.length,
      // 含 color/width：否则"改颜色/粗细后重画同轨迹笔迹"会命中过期缓存，
      // 复制到的是旧标注的图（"画笔没复制上"的一种成因）
      annos.map((a) => `${a.kind}:${a.x1},${a.y1},${a.x2},${a.y2},${a.points?.length ?? 0}:${a.num ?? ""}:${a.color}:${a.width}:${a.text ?? ""}`).join("|"),
    ].join("#");
  };

  // 「背景帧 + 全部标注」合成源的复用暂存画布：跨多次输出/预编码共享一块
  // 位图（4K 整屏约 16MB），避免每次分配触发 GC 卡顿
  const compScratchRef = useRef<HTMLCanvasElement | null>(null);
  /** 现场重建与屏显一致的合成源（物理分辨率）：导出/贴图裁剪的像素来源。
   *  马赛克采样源同样是原始冻结帧 bg（与屏显层一致），导出与屏显完全一致 */
  const buildComposite = (): HTMLCanvasElement | null => {
    const bg = bgRef.current;
    if (!bg || !geom || bg.width <= 0) return null;
    let comp = compScratchRef.current;
    if (!comp) { comp = document.createElement("canvas"); compScratchRef.current = comp; }
    if (comp.width !== bg.width) comp.width = bg.width;
    if (comp.height !== bg.height) comp.height = bg.height;
    const cctx = comp.getContext("2d")!;
    cctx.clearRect(0, 0, comp.width, comp.height);
    cctx.drawImage(bg, 0, 0);
    annos.forEach((s) => drawShape(cctx, s, bg, mosaicCacheRef.current, cssScale()));
    return comp;
  };

  /** 选区原始像素（BGRA，物理分辨率）：贴图最快路径专用。
   *  与 encodeSelection 同样的合成逻辑（背景+标注），但不做 PNG 编码，
   *  getImageData 一次回读后 R/B 交换成 BMP 字节序 */
  const cropSelectionRaw = (): { data: Uint8Array; w: number; h: number } | null => {
    const r = regRef.current;
    const bg = bgRef.current;
    if (!bg || !geom || bg.width <= 0) return null;
    const sc = cssScale();
    const rp = { x: Math.round(r.x * sc), y: Math.round(r.y * sc), w: Math.round(r.w * sc), h: Math.round(r.h * sc) };
    if (rp.w <= 0 || rp.h <= 0) return null;
    const src = annos.length > 0 ? buildComposite() : bg;
    if (!src) return null;
    const c = document.createElement("canvas");
    c.width = rp.w; c.height = rp.h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, rp.x, rp.y, rp.w, rp.h, 0, 0, rp.w, rp.h);
    const img = ctx.getImageData(0, 0, rp.w, rp.h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const rr = d[i]; d[i] = d[i + 2]; d[i + 2] = rr; d[i + 3] = 255;
    }
    // 直接移交 ImageData 底层 buffer：shotPinPost 对整段 buffer 零拷贝直传，
    // 不再 slice 复制一份（大选区十几 MB 的纯开销）
    return { data: new Uint8Array(d.buffer), w: rp.w, h: rp.h };
  };


  const encodeSelection = async (): Promise<Blob> => {
    const r = regRef.current;
    const bg = bgRef.current!;
    // reg(选区) 是【CSS 像素】，冻结帧/合成源 comp 是【物理像素】——
    // 必须把选区统一换算到物理像素再裁剪，否则 150% 下导出的图是物理画布
    // 左上角的"小一号"区域（与屏显选区错位、尺寸偏小）。标注同理要 ×scale
    const sc = cssScale();
    const rp = { x: Math.round(r.x * sc), y: Math.round(r.y * sc), w: Math.round(r.w * sc), h: Math.round(r.h * sc) };
    const c = document.createElement("canvas");
    c.width = rp.w; c.height = rp.h;
    const ctx = c.getContext("2d")!;
    // 合成源按需构建（复用暂存画布）：有标注时是 bg+标注，无标注时直接用
    // 冻结帧本身——省一次整屏 blit
    const src = annos.length > 0 ? buildComposite() : bg;
    if (!src) throw new Error("composite unavailable");
    ctx.drawImage(src, rp.x, rp.y, rp.w, rp.h, 0, 0, rp.w, rp.h);
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
    if (outputtingRef.current) return;
    outputtingRef.current = true;
    try {
      // 【零像素传输】未画任何标注（文字编辑器也未打开）时，三种输出都让
      // Rust 直接从本屏冻结帧裁剪——冻结帧就是呼出瞬间原始桌面像素，结果
      // 与前端合成路径逐字节一致；省掉 getImageData 回读 + 整块像素过桥
      // IPC + PNG 编解码，4K 选区可省 100~400ms。此路径不依赖 bg 画布，
      // 也无需等 frameReady
      const canCrop = annos.length === 0 && !textEdit;
      if (!canCrop) {
        try {
          await Promise.race([
            frameReadyRef.current,
            new Promise<void>((r) => setTimeout(r, 5000)),
          ]);
        } catch {}
      }
      if ((!canCrop && (!bgRef.current || bgRef.current.width <= 0)) || !geom) {
        void diagLog(`[shot] output ${action} skipped: canCrop=${canCrop} bgW=${bgRef.current?.width ?? -1} geom=${!!geom}`);
        // 守卫失败也必须收遮罩：否则全屏遮罩继续吞输入，用户侧"无反应"
        await shotCancel().catch(() => {});
        return;
      }
      const r = regRef.current;
      if (r.w <= 0 || r.h <= 0) {
        void diagLog(`[shot] output ${action} skipped: region ${r.w}x${r.h}`);
        await shotCancel().catch(() => {});
        return;
      }
      // PNG 编码惰性化：贴图最快路径（原始像素直传）完全用不到 PNG，
      // 绝不为它白编码一整张——大选区 toBlob 要 100~400ms，是贴图点下到
      // 弹出的纯浪费。只有复制/另存/回退路径真正需要时才编码
      const key = selectionKey();
      let blob = pngCacheRef.current?.key === key ? pngCacheRef.current.blob : null;
      // 复制链路诊断：标注摘要 + 缓存命中 + blob 魔数——定位"画笔没复制上"
      // 时区分：标注没进 annos / 缓存过期 / PNG 编码异常
      if (action === "copy" || annos.length > 0) {
        void diagLog(`[shot] output ${action}: annos=[${annos.map((a) =>
          `${a.kind}(${a.points?.length ?? 0}pts)`).join(",")}] cacheHit=${blob !== null} key=${key.slice(-160)}`);
      }
      const ensureBlob = async (): Promise<Blob> => {
        if (blob) return blob;
        try {
          blob = await encodeSelection();
          if (pngCacheRef.current?.key !== key) pngCacheRef.current = { key, blob };
          return blob;
        } catch (encErr) {
          void diagLog(`[shot] output ${action} encode failed: ${String(encErr)}`);
          throw encErr;
        }
      };
      // 贴图目标位置：r 是【CSS 像素】，geom.x/y 是全局【物理像素】原点——
      // 必须 ×cssScale 归一到物理像素再相加，否则 125%/150% 缩放下贴图
      // 相对原选区向左上偏移 (scale-1)×选区坐标（"贴图和原图有偏移"根因）
      const sc = cssScale();
      const gx = Math.round(r.x * sc) + geom.x, gy = Math.round(r.y * sc) + geom.y;
      const pw = Math.round(r.w * sc), ph = Math.round(r.h * sc);
      let sent = false;
      try {
        if (action === "pin") {
          if (canCrop) {
            await shotCropOutput("pin", { x: gx, y: gy, w: pw, h: ph }); sent = true;
          } else {
            // 【最快路径】贴图不再走 PNG：直接取选区原始像素（getImageData 一次
            // GPU 回读），Rust 包成 BMP（零压缩）落盘/直出——省掉前端 PNG 编码
            // 与 WebView2 PNG 解码两大耗时
            const raw = cropSelectionRaw();
            if (raw) {
              await shotPinPost(raw.data, raw.w, raw.h, gx, gy);
              sent = true;
            } else {
              await shotOutputPost("pin", await ensureBlob(), { x: gx, y: gy }); sent = true;
            }
          }
        } else if (action === "copy") {
          if (canCrop) {
            await shotCropOutput("copy", { x: gx, y: gy, w: pw, h: ph }); sent = true;
          } else {
            await shotOutputPost("copy", await ensureBlob()); sent = true;
          }
        } else {
          // 另存为：系统保存对话框选位置与文件名；取消则留在截图继续编辑
          const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
          const base = cfg.shot.save_dir ? cfg.shot.save_dir.replace(/[\\/]+$/, "/") : "";
          const picked = await save({
            defaultPath: `${base}screenshot-${ts}.png`,
            filters: [{ name: "PNG 图片", extensions: ["png"] }],
          });
          if (!picked) return;
          if (canCrop) {
            await shotCropOutput("save", { x: gx, y: gy, w: pw, h: ph }, picked); sent = true;
          } else {
            await shotOutputPost("save", await ensureBlob(), { path: picked }); sent = true;
          }
        }
      } finally {
        // 双保险收遮罩：复制/另存由 Rust 收过，这里幂等补收。
        // 【pin 绝不在此收】invoke 返回时贴图窗才刚开始加载图片，此刻收遮罩会
        // 露出裸桌面、等贴图弹出——正是"贴图闪一下"的根源；贴图的遮罩统一由
        // Rust pin_ready 在贴图画好显示之后才收（staging 页面异常也有 1.5s 兜底）
        if (sent && action !== "pin") await shotCancel().catch(() => {});
      }
    } catch (e) {
      void diagLog(`[shot] output ${action} failed: ${String(e)}`);
      // 兜底：输出失败也必须收起遮罩
      await shotCancel().catch(() => {});
    } finally {
      outputtingRef.current = false;
    }
  };

  // 长截图：把当前选区（换算全局物理像素）交给 scrollshot 模块，
  // Rust 端收掉遮罩并接管后续流程（滚动+拼接+落盘），本页不再参与
  const startLongShot = () => {
    const r = regRef.current;
    if (!geom || r.w <= 0 || r.h <= 0) return;
    const sc = cssScale();
    void scrollBegin({
      x: Math.round(r.x * sc) + geom.x,
      y: Math.round(r.y * sc) + geom.y,
      w: Math.round(r.w * sc),
      h: Math.round(r.h * sc),
    }).catch(async (e) => {
      void diagLog(`[shot] longshot begin failed: ${String(e)}`);
      await shotCancel().catch(() => {});
    });
  };

  // doOutput 的 ref 镜像：下方事件监听只注册一次，经此始终调到最新闭包
  const doOutputRef = useRef<typeof doOutput | null>(null);
  useEffect(() => { doOutputRef.current = doOutput; });

  // 全局贴图热键转发：截图会话中按下用户配置的「显示/隐藏贴图」键（如 F8）时，
  // 按键被 RegisterHotKey/钩子吞掉、webview 收不到 keydown，由 Rust 发此事件代为
  // 触发贴图。取色模式/拖拽中不响应；若尚未左键确认但已有智能高亮窗口，
  // 直接采纳高亮区域为选区——快捷键一步完成贴图，免去「先点击确认」
  useEffect(() => {
    const un = listen("shot://pin-hotkey", () => {
      if (pickerModeRef.current || dragRef.current || resizeRef.current) return;
      if (phaseRef.current === "idle") {
        const s = snapRef.current;
        if (!s) return;
        regRef.current = s;
        setRegion(s);
        snapRef.current = null;
        setSnap(null);
        setPhase("selected");
        phaseRef.current = "selected";
        const g = geomRef.current;
        const sc = cssScale();
        void shotSaveRegion([s.x*sc + (g?.x ?? 0), s.y*sc + (g?.y ?? 0), s.w*sc, s.h*sc]).catch(() => {});
      } else if (phaseRef.current !== "selected") {
        return;
      }
      void doOutputRef.current?.("pin");
    });
    return () => { un.then((f) => f()); };
  }, []);

  // render
  if (!geom) return null;
  const displayW = "100vw", displayH = "100vh";

  return (
    <div ref={rootRef} className="shot-overlay" style={{width:displayW,height:displayH,position:"fixed",top:0,left:0,overflow:"hidden",cursor:"crosshair"}}
      onWheel={(ev) => {
        // 悬停阶段（idle 未拖拽、有可见高亮）：智能候选链滚轮切换层级——
        // 上滚更精细（链内层），下滚更粗（外层，直至整窗），PixPin 式。
        // 单击采纳的就是当前层级矩形（onDown/onUp 读 snapRef 天然生效）。
        // 无高亮（snapRef 空）时不响应：拖拽失败回 idle 等场景不得复活旧链
        if (phase === "idle" && !dragRef.current && !pickerModeRef.current && cfg.shot.smart_detect) {
          const chain = snapChainRef.current;
          if (chain && chain.length > 1 && snapRef.current) {
            const ni = Math.min(chain.length - 1, Math.max(0, snapIdxRef.current + (ev.deltaY > 0 ? 1 : -1)));
            if (ni !== snapIdxRef.current) {
              snapIdxRef.current = ni;
              const r = chain[ni];
              snapRef.current = r;
              setSnap(r); // 选区层 effect 随 snap 重绘高亮
            }
            return;
          }
        }
        // 选区阶段滚轮=无级调节画笔粗细（1~24px，一格 1px，与速度无关）；
        // 面板里的三挡位保留作为快捷预设
        if (phase !== "selected" || textEdit) return;
        const dir = ev.deltaY > 0 ? -1 : 1;
        const nv = Math.min(24, Math.max(1, sw + dir));
        setSw(nv); setSwBadge(nv);
        window.clearTimeout(swBadgeTimer.current);
        swBadgeTimer.current = window.setTimeout(() => setSwBadge(null), 800);
      }}>
      {/* 底图画布：位图是物理分辨率、CSS 尺寸是逻辑视口，非整数 DPI（如
          1.4997）下合成器会做带亚像素错位的双线性重采样导致预览发糊。
          imageRendering:pixelated 强制最近邻采样——位图与设备像素本就一一
          对应，最近邻即逐像素直出，文字边缘恢复锐利；只影响显示插值，
          放大镜采样/导出合成读的是同一位图数据，不受影响。
          【不能隐藏此画布让原生冻结层透出】WebView2 透明区域不会合成到
          同窗的 GDI 子窗（冻结层）上，会直接渲染成黑色——拖拽选区镂空处
          变黑的根源，故画布必须保持可见 */}
      <canvas ref={bgRef} style={{position:"absolute",top:0,left:0,width:displayW,height:displayH,imageRendering:"pixelated"}} />
      <canvas ref={annoRef} style={{position:"absolute",top:0,left:0,width:displayW,height:displayH,pointerEvents:"none"}} />

      {/* 选区层：普通 2D 画布（非 desynchronized，避免 DPR≠1 合成偏移），
          压暗遮罩+选区镂空+智能高亮+边框+手柄。全部由 paintSelCanvas 读 ref
          直绘——SVG 方案属性更新必须走合成器完整帧调度，快速拖动时边框落后
          光标一两帧（"错位/不跟手"根因）；改用事件内同步直绘解决。
          取色模式不渲染：所见即真实屏幕颜色 */}
      {!geom.picker && (
        <canvas ref={selCanvasRef} className={dimFx ? "shot-dim-fade" : undefined}
          style={{position:"absolute",top:0,left:0,width:displayW,height:displayH,pointerEvents:"none"}} />
      )}

      {/* mouse handlers layer */}
      <div ref={handlersRef} style={{position:"absolute",top:0,left:0,width:displayW,height:displayH,zIndex:10}}
        onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={()=>setShowMag(false)} />

      {/* 文字标注编辑器：左侧垂直中点锚定鼠标点（translateY(-50%)），
          字体颜色实时跟随色板；× 丢弃本次输入；Enter 提交 / Esc 取消 /
          点击别处自动提交。onMouseDown 拦截冒泡——点击编辑器内部绝不会
          落到画布层误触选区 */}
      {textEdit && (() => {
        // textEdit 已是【CSS 像素】（toCanvas 产出），left/top 直接用
        const vw = window.innerWidth, vh = window.innerHeight;
        const estW = 190, estH = 30;
        const ex = Math.min(Math.max(textEdit.x, 4), Math.max(4, vw - estW - 4));
        const ey = Math.min(Math.max(textEdit.y, estH / 2 + 4), Math.max(4, vh - estH - 4));
        return (
          <div className="shot-text-editor" style={{ left: ex, top: ey }}
            onMouseDown={(ev)=>ev.stopPropagation()} onMouseUp={(ev)=>ev.stopPropagation()}>
            <input ref={textInputRef} value={textEdit.value}
              style={{ color, caretColor: color }}
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
            <button className="shot-text-x" title="丢弃此文字"
              onMouseDown={(ev)=>ev.stopPropagation()} onMouseUp={(ev)=>ev.stopPropagation()}
              onClick={(ev)=>{ ev.stopPropagation(); setTextEdit(null); }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
            </button>
          </div>
        );
      })()}

      {/* magnifier（命令式绘制：位置/坐标/采样由 drawMagnifier 在 rAF 直改，
          组件不因鼠标移动重渲染。镜头区固定 MAG×MAG 正方形，信息区在镜头下方
          分三行：坐标 / 颜色值+色块 / 操作提示——文字不再挤压截断。
          全程跟随（悬停、拖拽选区、确认后调整边缘），取色与文字编辑时退场 */}
      {showMag && bgReady && cfg.shot.magnifier && !geom.picker && !textEdit && (
        <div ref={magBoxRef} className="shot-mag" style={{
          position:"fixed", left:-9999, top:-9999,
          width: MAG_BOX_W, pointerEvents:"none",
        }}>
          <div className={`shot-mag-lens${magCircle ? " shot-mag-lens--circle" : ""}`}><canvas ref={magCanvasRef} /></div>
          <div className="shot-mag-info">
            <div className="shot-mag-row"><span ref={magCoordRef}>(0 , 0)</span></div>
            <div className="shot-mag-row shot-mag-colorline">
              <span ref={magSwatchRef} className="shot-mag-liveswatch" />
              <span ref={magValRef} className="shot-color-val">--</span>
              <span ref={magFmtRef} className="shot-mag-fmt">RGB</span>
            </div>
            <div className="shot-mag-row shot-mag-hints">
              <div><b>C</b> 复制</div>
              <div><b>Shift</b> 换格式</div>
              <div><b>Tab</b> 圆形/方形</div>
            </div>
            <div ref={magCopiedRef} className="shot-copied shot-copied-center" style={{display:"none"}} />
          </div>
        </div>
      )}

      {/* 屏幕取色模式（独立快捷键呼出）：全屏十字线 + 中心取样点 + 坐标/颜色面板。
          C 复制颜色并保持取色、单击复制并退出、Enter 复制退出、Shift 切格式、Esc 收场。
          全部视觉经 refs 直改，鼠标移动零重渲染 */}
      {geom.picker && (
        <>
          <div ref={pickerLineHRef} className="shot-picker-line shot-picker-line-h" style={{top:-9999}} />
          <div ref={pickerLineVRef} className="shot-picker-line shot-picker-line-v" style={{left:-9999}} />
          <div ref={pickerDotRef} className="shot-picker-dot" style={{left:-9999,top:-9999}} />
          <div ref={pickerPanelRef} className="shot-picker-panel" style={{left:-9999,top:-9999}}>
            <div className="shot-picker-coord"><span ref={pickerCoordRef}>(0 , 0)</span></div>
            <div className="shot-picker-color">
              <span ref={pickerSwatchRef} className="shot-color-swatch shot-color-swatch-md" />
              <span ref={pickerValRef} className="shot-color-val shot-color-val-md">--</span>
              <span ref={pickerFmtRef} className="shot-mag-fmt">RGB</span>
            </div>
            <div className="shot-picker-hints">
              <div>按 <b>C</b> 复制颜色 · 单击复制并退出</div>
              <div>按 <b>Shift</b> 切换颜色格式</div>
            </div>
            <div ref={pickerCopiedRef} className="shot-copied shot-copied-center" style={{display:"none"}} />
          </div>
        </>
      )}

      {/* toolbar：Snipaste 式单行扁平图标条，贴在选区右下角外侧；下方空间
          不足时放进选区内右下角。同类形状合并一键（再点循环切换），悬停
          按钮在条下方显示「名称 (快捷键)」提示；所有工具的二次选项（子图形/
          颜色/粗细）统一平铺在一级图标正下方。右缘锚定不依赖实测宽度——
          首帧即最终位置 */}
      {phase === "selected" && (() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        // region 已是 CSS 像素，工具栏用 position:fixed 定位（CSS 像素）直接算，
        // 不再 ×scale（旧版 ×rc.width/geom.width 把 CSS 又缩了一次、工具栏偏移）
        const rightEdge = region.x + region.w;
        const rightPx = Math.min(Math.max(vw - rightEdge, 8), Math.max(8, vw - 60));
        // 枚举展开时主面板不重复显示（枚举面板里已带颜色/粗细）——
        // 所有工具统一：二次选项一律挂在【一级图标正下方】，不再单独
        // 在主条下方拼接配置面板（旧版单工具与形状/线组行为不一致）
        const menuOpen = submenuOpen !== null;
        // 主条 barH≈40px，二次选项面板 panelH≈52px。条的位置【只按条本身】能否
        // 放下决定——开合二级选项时条不跳动；面板方向独立判定：条下方有空间就
        // 向下展开，没有就翻到条上方（向上扩展）
        const barH = 40, panelH = 52;
        const bottomEdge = region.y + region.h;
        let ty = bottomEdge + 8;   // 默认：条放选区下方
        let tipsAbove = false;
        if (ty + barH > vh - 6) {
          // 条在选区下方放不下 → 收进选区内并【贴选区下缘】。二级选项从条
          // 上方向上展开（旧版把条+面板整组上移，条悬在选区中间、面板反而
          // 在条下方——即"一级跑上方、二级在下方"；现改为条贴底、面板上翻）
          tipsAbove = true;
          ty = Math.max(bottomEdge - barH - 6, 8);
        }
        let panelAbove = false;
        if (menuOpen) {
          // 条底到屏底的剩余空间不足 → 面板向上翻（覆盖选区底部区域，无碍）
          const belowRoom = vh - 6 - (ty + barH);
          if (belowRoom < panelH + 8) {
            panelAbove = true;
            // 面板在条上方：整体顶 = ty - panelH - 4，越过屏幕顶则整体下移贴屏顶
            if (ty - panelH - 4 < 8) ty = panelH + 12;
          }
        }
        // 颜色/粗细面板：可复用片段——单工具激活时显示在主条下方；
        // 形状/线枚举展开时拼在子图形行下方，一步选完图形+颜色
        const renderConfigPanel = (
          <div className="shot-toolbar-panel">
            {/* 马赛克无颜色概念（像素化采样自原图），只保留粗细——
                否则与画笔混淆，色板纯属误导 */}
            {tool !== "mosaic" && (
              <>
                {(cfg.annotate?.colors?.length ? cfg.annotate.colors : ANNO_DEFAULT_COLORS).map((c) => (
                  <button key={c} className={`shot-color-btn${color===c?" active":""}`}
                    style={{background:c}} onClick={()=>setColor(c)} />
                ))}
                {/* 自定义颜色：彩虹按钮唤起原生取色器。拖动调色盘只实时预览
                    （onInput→setColor）；确认（原生 change 事件）才追加一个颜色
                    进色板并持久化，且自定义色数量封顶（见 ANNO_MAX_CUSTOM）——
                    避免拖一下刷出一大串 */}
                <input ref={customColorRef} type="color" value={color} tabIndex={-1}
                  onInput={(ev) => setColor((ev.target as HTMLInputElement).value)}
                  style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none", border: 0, padding: 0 }} />
                <button className="shot-color-custom" title="自定义颜色" aria-label="自定义颜色"
                  onClick={() => customColorRef.current?.click()} />
              </>
            )}
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
        );
        return (
          <div className={`shot-toolbar-float${tipsAbove ? " tips-above" : ""}${panelAbove ? " panel-above" : ""}`} style={{ right: rightPx, top: ty }}>
            <div className="shot-toolbar">
              {TOOL_BUTTONS.map((b, i) => {
                const active = b.items.some(([t]) => t === tool);
                // 一级图标【恒定不变】：形状/线组固定显示类别图标（矩形+椭圆、
                // 折线+箭头），不随激活变成子工具图标——保持主排图标稳定可认
                const MainIcon = b.groupIcon ?? b.items[0][1];
                const isGroup = b.items.length > 1;
                return (
                  <div key={i} className={`shot-toolbtn${active ? " active" : ""}${isGroup ? " has-submenu" : ""}`}>
                    <button className={"shot-toolbtn-main" + (active ? " active" : "")} data-tip={btnTip(b)}
                      onClick={() => {
                        // 所有工具统一交互：点一级图标 = 选中默认工具 + 在图标
                        // 正下方展开二次选项（子图形+颜色/粗细）；已展开再点收起。
                        // 当前工具已在该组则保持不切换（与形状/线组行为一致）
                        if (submenuOpen === i) {
                          setSubmenuOpen(null);
                        } else {
                          setSubmenuOpen(i);
                          if (!b.items.some(([t]) => t === toolRef.current)) {
                            setTool(b.items[0][0]);
                          }
                        }
                      }}>
                      {/* Snipaste 式单色白图标：激活反白，不按功能染色 */}
                      <span style={{ display: "inline-flex" }}><MainIcon /></span>
                    </button>
                    {/* 二次选项枚举：平铺在一级图标正下方，子图形 + 颜色/粗细
                        同行展示。所有工具统一此逻辑；单工具无子图形、只显示
                        颜色/粗细。选完后面板保持展开；收起靠再点一级图标或 Esc */}
                    {submenuOpen === i && (
                      <div className={`shot-toolbtn-submenu${panelAbove ? " above" : ""}`} onClick={(ev) => ev.stopPropagation()}>
                        {isGroup && b.items.map(([t, Ic, name]) => (
                          <button key={t} className={tool === t ? "active" : ""} data-tip={name}
                            onClick={() => setTool(t)}>
                            <span style={{ display: "inline-flex" }}><Ic /></span>
                          </button>
                        ))}
                        {isGroup && <span className="shot-submenu-divider" />}
                        {renderConfigPanel}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="shot-toolbar-sep" />
              <button data-tip="撤销 (Ctrl+Z)" disabled={annos.length===0}
                onClick={()=>{if(annos.length>0){setUndos(u=>[...u,[...annos]]);setAnnos(a=>a.slice(0,-1));}}}><IcoUndo/></button>
              <button data-tip="重做 (Ctrl+Shift+Z)" disabled={undos.length===0}
                onClick={()=>{if(undos.length>0){setAnnos(undos[undos.length-1]);setUndos(u=>u.slice(0,-1));}}}><IcoRedo/></button>
              <div className="shot-toolbar-sep" />
              <div className="shot-toolbar-group shot-toolbar-actions">
                <button data-tip="长截图（自动滚动拼接长图）" onClick={startLongShot}>
                  <span style={{ display: "inline-flex" }}><IcoLongShot /></span></button>
                <button data-tip="文字识别 (OCR)" className={ocrPhase !== "idle" ? "active" : ""}
                  onClick={() => { if (ocrPhase === "idle" || ocrPhase === "error") void runOcr(); else resetOcr(); }}>
                  <span style={{ display: "inline-flex" }}><IcoOcr /></span></button>
                <button data-tip="另存为..." onClick={()=>doOutput("save")}>
                  <span style={{ display: "inline-flex" }}><IcoSaveAs/></span></button>
                <button data-tip="复制 (Enter)" onClick={()=>doOutput("copy")}>
                  <span style={{ display: "inline-flex" }}><IcoCopy/></span></button>
                <button data-tip={`贴图 (${cfg.shortcuts.pins})`} onClick={()=>doOutput("pin")}>
                  <span style={{ display: "inline-flex" }}><IcoPin/></span></button>
                <button data-tip="取消 (Esc)" onClick={()=>void shotCancel().catch(()=>{})}>
                  <span style={{ display: "inline-flex" }}><IcoClose/></span></button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 滚轮调粗细时的即时反馈徽标 */}
      {swBadge != null && (
        <div className="shot-sw-badge">画笔粗细 {swBadge}px</div>
      )}

      {/* initial hint */}
      {/* 左下角固定操作提示区（Snipaste 式）：黑色半透明底 + 键帽快捷键。
          未选区 → 基础操作提示；选定后 → 选区操作提示，
          且当选区矩形覆盖提示区时整体隐藏（需求：覆盖不显示、未覆盖显示） */}
      {!geom.picker && (
        <div ref={hintRef} className="shot-hint-panel"
          style={{ visibility: (dragging || hintCovered) ? "hidden" : "visible" }}>
          {(phase === "selected" || dragging) ? (
            <>
              <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>Enter</kbd></span><span className="shot-hint-desc">复制到剪贴板</span></div>
              <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>{cfg.shortcuts.pins}</kbd></span><span className="shot-hint-desc">贴到屏幕</span></div>
              {annos.length > 0 && <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>Ctrl+Z</kbd></span><span className="shot-hint-desc">撤销标注</span></div>}
              <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>Esc</kbd></span><span className="shot-hint-desc">退出截图</span></div>
            </>
          ) : (
            <>
              {histViewing && (
                <div className="shot-hint-row shot-hint-viewing"><span className="shot-hint-keys"><kbd>&lt;</kbd></span><span className="shot-hint-desc">正在查看历史截屏，按 &lt; 返回实时画面</span></div>
              )}
              {cfg.shot.smart_detect && <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>左键点击</kbd></span><span className="shot-hint-desc">采纳识别的窗口</span></div>}
              {cfg.shot.smart_detect && chainLen > 1 && <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>滚轮</kbd></span><span className="shot-hint-desc">切换识别层级（元素⇄窗口）</span></div>}
              <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>左键拖拽</kbd></span><span className="shot-hint-desc">自定义框选区域</span></div>
              {cfg.shot.history_enabled !== false && (
                <>
                  <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>&lt;</kbd><kbd>&gt;</kbd></span><span className="shot-hint-desc">翻看历史截屏，可重新框选</span></div>
                  <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>H</kbd></span><span className="shot-hint-desc">历史截屏列表</span></div>
                </>
              )}
              <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>C</kbd></span><span className="shot-hint-desc">取色</span></div>
              <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>{cfg.shortcuts.pins}</kbd></span><span className="shot-hint-desc">快速贴图</span></div>
              <div className="shot-hint-row"><span className="shot-hint-keys"><kbd>Esc</kbd></span><span className="shot-hint-desc">退出截图</span></div>
            </>
          )}
        </div>
      )}

      {/* 截图历史缩略图列表（H 开关；< > 步进时自动展开并跟随滚动）：
          底部居中横排缩略图 + 时间标注，点击直接跳到该帧重新框选；
          首项「实时画面」回到当前屏幕；当前帧高亮；
          缩略图上叠加当时框选范围的描边（整屏快照 → 小框标出真正圈住的区域） */}
      {histOpen && (
        <div className="shot-hist-panel" ref={histPanelRef} onMouseDown={(e) => e.stopPropagation()}>
          <div className="shot-hist-head">
            <span className="shot-hist-title">历史截屏</span>
            {(histItems ?? []).length > 0 && (
              <div className="shot-hist-clear" onClick={() => void clearHist()}>清空历史</div>
            )}
          </div>
          <div className="shot-hist-row" onWheel={(e) => {
            // 鼠标悬停时滚轮→横向滚动缩略图（鼠标滚轮仅有 deltaY）；
            // 始终 stopPropagation，防止事件冒泡到根遮罩的滚轮
            //（选区阶段滚轮=调画笔粗细，会误改画笔）
            const row = e.currentTarget;
            const max = row.scrollWidth - row.clientWidth;
            if (max > 0) {
              row.scrollLeft = Math.min(max, Math.max(0, row.scrollLeft + e.deltaY));
            }
            e.stopPropagation();
          }}>
            <div className={`shot-hist-item${histPos === -1 ? " active" : ""}`}
              onClick={() => void jumpHistory(-1)}>
              <div className="shot-hist-thumb shot-hist-live">实时</div>
              <span>当前画面</span>
            </div>
            {(histItems ?? []).map((it, i) => {
              const hasRegion = Array.isArray(it.region) && it.region.length === 4 &&
                (it.width ?? 0) > 0 && (it.height ?? 0) > 0;
              return (
                <div key={it.file} className={`shot-hist-item${histPos === i ? " active" : ""}`}
                  onClick={() => void jumpHistory(i)}>
                  <div className="shot-hist-thumbwrap">
                    <img src={shotHistoryUrl(it.file.replace(".png", ".thumb.png"))} draggable={false} />
                    {hasRegion && (
                      <div className="shot-hist-region" style={{
                        left: `${(it.region![0] / it.width!) * 100}%`,
                        top: `${(it.region![1] / it.height!) * 100}%`,
                        width: `${(it.region![2] / it.width!) * 100}%`,
                        height: `${(it.region![3] / it.height!) * 100}%`,
                      }} />
                    )}
                    <button className="shot-hist-del" title="删除此记录"
                      onClick={(e) => { e.stopPropagation(); void deleteHist(it.file); }}>×</button>
                  </div>
                  <span>{new Date(it.ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              );
            })}
            {histItems !== null && histItems.length === 0 && (
              <div className="shot-hist-empty">暂无历史截屏</div>
            )}
          </div>
        </div>
      )}

      {/* OCR 结果面板：贴在选区右侧；放不下翻到左侧。
          识别文本【可直接划选】（像普通文本一样拖动选中 → Ctrl+C 复制）。
          翻译态换成宽面板 + 原文/译文两列对照，避免"译文出来了原文被挤没" */}
      {ocrPhase !== "idle" && (() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const transMode = !!ocrTrans || ocrTranslating;
        const pw = transMode ? Math.min(560, vw - 16) : 320;
        const phMax = Math.min(transMode ? 520 : 380, vh - 16);
        const tTotal = ocrTrans?.pairs.length ?? 0;
        const tDone = ocrTrans?.pairs.filter((p) => !p.pending).length ?? 0;
        let px2 = region.x + region.w + 10;
        if (px2 + pw > vw - 8) px2 = Math.max(8, region.x - pw - 10);
        const py2 = Math.max(8, Math.min(region.y, vh - phMax - 8));
        return (
          <div className="shot-ocr-panel" style={{ left: px2, top: py2, width: pw, maxHeight: phMax }}
            onMouseDown={(ev) => ev.stopPropagation()} onMouseUp={(ev) => ev.stopPropagation()}>
            <div className="shot-ocr-head">
              <b>文字识别</b>
              <span style={{ flex: 1 }} />
              {ocrPhase === "done" && ocrLines.length > 0 && (
                <>
                  {ocrTrans && <button onClick={() => setOcrTrans(null)}>返回原文</button>}
                  {ocrTrans
                    ? (tDone > 0 && <button onClick={copyTransOut}>复制译文</button>)
                    : <button onClick={copyAllOcr}>复制全部</button>}
                  {!ocrTrans && <button onClick={() => void doTranslate()}>翻译</button>}
                </>
              )}
              <button onClick={resetOcr}>关闭</button>
            </div>
            {ocrPhase === "loading" && <div className="shot-ocr-body shot-ocr-muted">识别中…</div>}
            {ocrPhase === "error" && <div className="shot-ocr-body shot-ocr-err">{ocrError}</div>}
            {ocrPhase === "done" && (
              ocrTrans ? (
                ocrTrans.err ? <div className="shot-ocr-body shot-ocr-err">翻译失败：{ocrTrans.err}</div> : (
                  <div className="shot-ocr-trans">
                    <div className="shot-ocr-thead">
                      <span>原文</span>
                      <span>{ocrTranslating ? `译文 ${tDone}/${tTotal}…` : "译文"}</span>
                    </div>
                    <div className="shot-ocr-pairs">
                      {ocrTrans.pairs.map((p, i) => (
                        <div key={i} className="shot-ocr-pair">
                          <div className="shot-ocr-pcell">{p.src}</div>
                          {p.pending ? (
                            <div className="shot-ocr-pcell"><i className="shot-ocr-pwait" /></div>
                          ) : (
                            <div className={`shot-ocr-pcell shot-ocr-pout${p.ok ? "" : " shot-ocr-pfail"}`}>{p.out}</div>
                          )}
                        </div>
                      ))}
                    </div>
                    {!ocrTranslating && ocrTrans.pairs.some((p) => !p.ok) && (
                      <div className="shot-ocr-note">部分行未翻译（网络/配额或行数超出上限），已回退显示原文</div>
                    )}
                  </div>
                )
              ) : (
                <div className="shot-ocr-lines">
                  {ocrLines.length === 0 && <div className="shot-ocr-body shot-ocr-muted">未识别到文字（可调整选区后重新点击识别）</div>}
                  {ocrLines.map((l, i) => (
                    <div key={i} className="shot-ocr-line">{l.text}</div>
                  ))}
                </div>
              )
            )}
            {ocrPhase === "done" && ocrLines.length > 0 && (
              <div className="shot-ocr-selbar">
                {ocrTrans ? "划选任一列文字后 Ctrl+C 复制，或点上方「复制译文」" : "划选文字后 Ctrl+C 复制，或点上方「复制全部」"}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
