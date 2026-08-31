/** OCR 行级结果 → 段落归并（纯几何，展示/复制/翻译共用）。
 *
 * 背景：PP-OCR 检测端只给「文本行」级框——一段换行的话会碎成 N 个框，
 * 有时一行还会因样式/间隙被切成多个框，直接逐行展示/复制就"零零散散"。
 * 这里按版面几何两步还原阅读结构：
 *   ① 同一视觉行的碎片先并成整行（垂直中心贴近 + 水平间隔不太远）；
 *   ② 相邻整行再按「连续排版」特征并段：行距小、字号相近、左右对齐、
 *      上一行写满到块右缘（是换行而非段尾），且上一行不以句末标点收尾。
 * 段内拼接：缝两侧是 ASCII 字母数字时补空格（英文换行），中文直接连写。
 *
 * 注意：只用于文本重组。划词高亮/选区仍用原始行与词矩形（保持行级粒度）。
 */
import type { ShotOcrLine } from "../../core/tauri";

interface Row {
  x: number; y: number; w: number; h: number;
  text: string;
}

interface Para extends Row {
  /** 段落块左缘 / 到过的最右缘 */
  left: number; right: number;
  /** 末行底缘（行距阈值基准） */
  bottom: number;
  /** 末行右缘（判断是否"写满右缘 = 换行"） */
  lastRight: number;
  /** 末行行高（行距/字号阈值基准） */
  lastH: number;
}

const isAsciiAlnum = (c: string): boolean => /[0-9A-Za-z]/.test(c);

/** 文本拼接：缝两侧为 ASCII 字母数字 → 补空格（英文断行），否则直接连写（中文断行） */
const seam = (a: string, b: string): string => {
  if (!a) return b;
  if (!b) return a;
  return isAsciiAlnum(a[a.length - 1]) && isAsciiAlnum(b[0]) ? a + " " + b : a + b;
};

/** 句末标点（含后置闭引号/括号）：上一行以此收尾则必是段尾，不再并入 */
const END_PUNCT = new Set("。．！？!?；;…");
const CLOSER = new Set("」』”’）)】》〉>");
const endsSentence = (t: string): boolean => {
  const cs = [...t];
  let i = cs.length - 1;
  if (i >= 0 && CLOSER.has(cs[i])) i--;
  return i >= 0 && END_PUNCT.has(cs[i]);
};

export function groupOcrParagraphs(lines: ShotOcrLine[]): string[] {
  const rows: Row[] = [];
  // 按垂直中心自上而下处理
  const src = lines
    .filter((l) => l.text.trim())
    .sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));

  // ---- ① 同一视觉行的碎片并成整行 ----
  for (const l of src) {
    const cy = l.y + l.h / 2;
    // 已有行里找垂直中心贴近的（同行框中心差通常 <0.3× 行高；相邻行 ≥1.2×）
    let bi = -1, bd = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const d = Math.abs(cy - (r.y + r.h / 2));
      if (d <= 0.55 * Math.min(r.h, l.h) && d < bd) { bi = i; bd = d; }
    }
    if (bi < 0) { rows.push({ x: l.x, y: l.y, w: l.w, h: l.h, text: l.text }); continue; }
    const r = rows[bi];
    // 水平相隔太远（同高的多栏版面）→ 不硬并，留给分栏各自成段
    const gap = l.x >= r.x + r.w ? l.x - (r.x + r.w) : r.x - (l.x + l.w);
    if (gap > 1.2 * Math.max(r.h, l.h)) { rows.push({ x: l.x, y: l.y, w: l.w, h: l.h, text: l.text }); continue; }
    const before = l.x < r.x;
    const [t0, t1] = before ? [l.text, r.text] : [r.text, l.text];
    // 间隙超过 0.35× 行高视为词间大空格（如"姓名：    张三"）
    r.text = gap > 0.35 * Math.max(r.h, l.h) ? t0 + " " + t1 : seam(t0, t1);
    const x0 = Math.min(r.x, l.x), y0 = Math.min(r.y, l.y);
    const x1 = Math.max(r.x + r.w, l.x + l.w), y1 = Math.max(r.y + r.h, l.y + l.h);
    r.x = x0; r.y = y0; r.w = x1 - x0; r.h = y1 - y0;
  }

  // ---- ② 相邻整行按连续排版特征并段 ----
  rows.sort((a, b) => a.y - b.y || a.x - b.x);
  const paras: Para[] = [];
  for (const r of rows) {
    const p = paras[paras.length - 1];
    if (p && !endsSentence(p.text)) {
      const hAvg = (p.lastH + r.h) / 2;
      const gap = r.y - p.bottom;
      const overlap = Math.min(p.right, r.x + r.w) - Math.max(p.left, r.x);
      const aligned = overlap >= 0.3 * Math.min(p.right - p.left, r.w)
        || Math.abs(r.x - p.left) <= 0.8 * hAvg;
      // 上一行写满块右缘 → 是换行（可并）；没写满 → 段尾/短行（列表、菜单、聊天条目），不并
      const wrapped = p.lastRight >= p.right - 0.6 * p.lastH;
      if (
        gap >= -0.4 * hAvg && gap <= 0.9 * hAvg &&
        r.h >= p.lastH * 0.65 && r.h <= p.lastH * 1.55 &&
        aligned && wrapped &&
        r.x >= p.left - 1.2 * hAvg
      ) {
        p.text = seam(p.text, r.text);
        p.right = Math.max(p.right, r.x + r.w);
        p.left = Math.min(p.left, r.x);
        p.bottom = r.y + r.h;
        p.lastRight = r.x + r.w;
        p.lastH = r.h;
        continue;
      }
    }
    paras.push({ ...r, left: r.x, right: r.x + r.w, bottom: r.y + r.h, lastRight: r.x + r.w, lastH: r.h });
  }
  return paras.map((p) => p.text);
}
