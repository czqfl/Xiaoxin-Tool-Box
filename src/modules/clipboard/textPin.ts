/**
 * 文字贴图：把剪贴板条目的文字渲染成一张卡片 PNG，经 pin_create 贴到屏幕上。
 *
 * 三条硬约定（改动前必读，踩过就懂）：
 * 1. Rust `create_from_b64` 直接 `base64::decode(b64)`，**不剥离 data: URL 前缀**——
 *    传参必须是去掉 `data:image/png;base64,` 的纯 base64，否则解码直接失败。
 * 2. `pin_create` 的 x/y 是【物理像素】屏幕坐标（与截图贴图路径同一约定）；
 *    PNG 的像素尺寸即贴图窗口尺寸，故渲染按 monitor.scaleFactor 放大，
 *    保证 125%/150% 缩放下贴图上的文字视觉大小恒定、且不会发虚。
 * 3. 贴图按显示器中心落位：面板要点谁就贴在谁旁边不现实（按钮位置就是面板位置，
 *    贴上去会被面板自己盖住），居中 + 贴完隐藏面板是最稳的组合。
 */
import { currentMonitor } from "@tauri-apps/api/window";
import { pinCreate } from "../../core/tauri";

/** 卡片样式（CSS 像素基准；最终按 scaleFactor 放大到物理像素） */
const FONT_SIZE = 15;
const LINE_HEIGHT = 24;
const PAD_X = 18;
const PAD_Y = 15;
const RADIUS = 12;
const MAX_TEXT_WIDTH = 460;
/** 超长文本兜底：最多 30 行 / 4000 字符，超出截断加省略号（避免贴图高过屏幕） */
const MAX_LINES = 30;
const MAX_CHARS = 4000;
/** 深灰蓝卡片 + 浅字：浅色/深色桌面上都保持高对比与高级感 */
const BG = "#20232e";
const EDGE = "rgba(255, 255, 255, 0.10)";
const FG = "#e9edf6";
const FONT = '"Microsoft YaHei", "Segoe UI", system-ui, -apple-system, sans-serif';

/** 圆角矩形路径：Path2D.roundRect 在部分 WebView2 版本缺失，手写保证兼容 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 断行单元：CJK 与中文标点逐字可断，连续的西文/数字作为一个词（不在词中间断行） */
function tokenize(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of line) {
    // ASCII 转义写范围：避免源文件编码差异导致字符类被改写
    const isCjk = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch);
    const isPunct = /[，。；：！？、）】》」』]/.test(ch);
    if (/\s/.test(ch)) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(ch);
    } else if (isCjk || isPunct) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** 按最大宽度排版为多行（保留原文的硬换行与空行） */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const src = text.replace(/\r\n?/g, "\n").replace(/\t/g, "  ");
  for (const para of src.split("\n")) {
    if (!para) {
      lines.push("");
      continue;
    }
    // 单 token 就超宽（长 URL / 无空格长串）先按字符硬切成可容纳的小段
    const tokens: string[] = [];
    for (const tk of tokenize(para)) {
      if (ctx.measureText(tk).width <= maxWidth) {
        tokens.push(tk);
        continue;
      }
      let buf = "";
      for (const ch of tk) {
        if (buf && ctx.measureText(buf + ch).width > maxWidth) {
          tokens.push(buf);
          buf = ch;
        } else {
          buf += ch;
        }
      }
      if (buf) tokens.push(buf);
    }
    let cur = "";
    for (const tk of tokens) {
      // 行首空格丢弃（换行的缩进不保留，避免首行参差）
      if (tk === " " && !cur) continue;
      if (cur && ctx.measureText(cur + tk).width > maxWidth) {
        lines.push(cur.replace(/\s+$/, ""));
        cur = tk === " " ? "" : tk;
      } else {
        cur += tk;
      }
    }
    if (cur.trim()) lines.push(cur.replace(/\s+$/, ""));
  }
  return lines;
}

/**
 * 把一段文字渲染成卡片并贴到屏幕（显示器中心）。
 * @param text 要贴的文字（空内容抛错，由调用方提示）
 */
export async function pinTextToScreen(text: string): Promise<void> {
  const src = (text ?? "").trim();
  if (!src) throw new Error("内容为空，无法贴图");

  const mon = await currentMonitor().catch(() => null);
  const scale = Math.min(3, Math.max(1, mon?.scaleFactor ?? 1));

  // 先用 1× 上下文量文字（CSS 像素单位），再按 scale 放大绘制
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("画布初始化失败");
  measure.font = `${FONT_SIZE}px ${FONT}`;
  let lines = wrap(measure, src.slice(0, MAX_CHARS), MAX_TEXT_WIDTH);
  if (lines.length > MAX_LINES) {
    lines = lines.slice(0, MAX_LINES);
    const last = lines[MAX_LINES - 1];
    lines[MAX_LINES - 1] = `${last.slice(0, 60)}…`;
  }

  const widest = lines.reduce((m, l) => Math.max(m, measure.measureText(l).width), 0);
  const textW = Math.min(MAX_TEXT_WIDTH, Math.max(40, widest));
  const cssW = Math.round(textW + PAD_X * 2);
  const cssH = Math.round(lines.length * LINE_HEIGHT + PAD_Y * 2);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssW * scale);
  canvas.height = Math.round(cssH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画布初始化失败");
  ctx.scale(scale, scale);
  ctx.fillStyle = BG;
  roundRect(ctx, 0.5, 0.5, cssW - 1, cssH - 1, RADIUS);
  ctx.fill();
  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `${FONT_SIZE}px ${FONT}`;
  ctx.fillStyle = FG;
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.fillText(line, PAD_X, PAD_Y + i * LINE_HEIGHT + LINE_HEIGHT / 2);
  });

  // PNG → 纯 base64（Rust 侧不剥离 data: 前缀）
  const url = canvas.toDataURL("image/png");
  const b64 = url.slice(url.indexOf(",") + 1);

  // 落位：当前显示器中心（物理像素）
  const mw = mon?.size.width ?? Math.round(1920 * scale);
  const mh = mon?.size.height ?? Math.round(1080 * scale);
  const mx = mon?.position.x ?? 0;
  const my = mon?.position.y ?? 0;
  const x = Math.round(mx + (mw - canvas.width) / 2);
  const y = Math.round(my + (mh - canvas.height) / 2);
  await pinCreate(b64, x, y);
}
