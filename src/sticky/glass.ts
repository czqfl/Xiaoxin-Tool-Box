// 统一毛玻璃工具：自定义背景图片 + CSS 高斯模糊。
// 强度直接映射为模糊半径（0% 原图无模糊，100% ≈ MAX_BLUR_PX 强模糊）。
// 半径变化用 rAF 平滑过渡（见 blur-anim.ts），纯前端可控、开销小。
//
// 为什么自定义背景走 CSS 模糊而非系统 Acrylic：
// - Windows 系统级 Acrylic 的模糊半径固定不可调，强度 1% 和 100% 观感几乎无差别；
// - Acrylic 必然叠加一层 tint 着色（浅色下就是"白蒙版"），低强度时蒙版更浓，
//   与「自定义背景图片 + CSS 模糊」的观感差异明显。
// 透明主题则反过来：为实时性直接用 DWM 原生亚克力（见 main.rs set_acrylic），
// 模糊半径由系统固定，不透明度由“背景不透明度”滑块调节（见 note.ts applyAcrylic）。

import { tweenGlassBlur } from "./blur-anim";

/** 背景磨砂的最大模糊半径（px），对应强度 100% */
export const MAX_BLUR_PX = 40;

/** 解析 CSS 颜色（#rrggbb / rgb()）为 0xRRGGBB；解析失败返回 null。
 *  透明主题把 --bg（主题面板色）作为 SWCA 亚克力的 tint，避免黑/白蒙版。 */
export function parseColorToRgbInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) return parseInt(hex[1], 16);
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (rgb) {
    return (parseInt(rgb[1], 10) << 16) | (parseInt(rgb[2], 10) << 8) | parseInt(rgb[3], 10);
  }
  return null;
}

export interface GlassOptions {
  /** 设置了背景图且带 .glass 的元素（其 ::before 承载背景图） */
  target: HTMLElement | null;
  /** 强度 0~100：0%（或关闭）原图无模糊；100% 强模糊（≈ MAX_BLUR_PX） */
  strength: number;
  /** 毛玻璃总开关（关闭时回到"无模糊"） */
  enabled: boolean;
}

/** 统一入口：把「毛玻璃强度」应用到背景图。幂等，可随时改强度/开关反复调用。 */
export function applyGlassBlur(opts: GlassOptions): void {
  const target = opts.target;
  if (!target) return;
  const pct = Math.max(0, Math.min(100, Math.round(opts.strength)));

  target.style.removeProperty("--glass-blur");
  if (!opts.enabled || pct <= 0) {
    if (target.classList.contains("glass")) {
      // 关闭：先平滑退到 0 再摘除 glass，避免模糊瞬间消失的跳变
      tweenGlassBlur(target, 0, {
        onDone: () => {
          target.classList.remove("glass");
          target.style.removeProperty("--glass-blur");
        },
      });
    } else {
      target.classList.remove("glass");
      target.style.removeProperty("--glass-blur");
    }
    return;
  }
  const px = Math.round((pct / 100) * MAX_BLUR_PX);
  // 首次开启（尚无 .glass）：直接落定目标模糊半径——呼出/打开窗口时「一出现就是磨砂」，
  // 不做 0→目标 的 280ms 渐变（否则先清晰后糊上来）。已在磨砂态下改强度/开关则仍走
  // rAF 平滑过渡，滑块拖动、开关切换不跳变。
  if (!target.classList.contains("glass")) {
    target.classList.add("glass");
    target.style.setProperty("--glass-blur", px + "px");
    return;
  }
  tweenGlassBlur(target, px);
}

/** 加载一张图片（resolve 为 HTMLImageElement；失败 resolve null）。 */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * 【用户方案：预渲染"模糊好的效果图"】把自定义背景图按当前模糊半径渲染成一张
 * 现成的静态模糊图（canvas 烘焙，dataURL）。呼出/打开便签时背景层直接显示这张
 * 图——无需实时 CSS filter 计算/重采样，也不参与成形动画裁切，背景模糊"一出现
 * 就是好的"（"提前模糊好放后台，打开时换出来"）。
 * 返回 dataURL；无背景图 / 模糊未开启 / 渲染失败时返回 null（调用方回退实时
 * filter 管线）。
 */
export async function renderBlurredBackground(target: HTMLElement): Promise<string | null> {
  try {
    const cs = getComputedStyle(target);
    const m = /url\((['"]?)([\s\S]*?)\1\)/.exec(cs.getPropertyValue("--note-bg-img") || "");
    const url = m ? m[2] : "";
    if (!url) return null;
    const px = parseFloat(cs.getPropertyValue("--glass-blur") || "") || 0;
    if (px <= 0) return null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const img = await loadImage(url);
    if (!img || !img.naturalWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(dpr, dpr);
    // cover 适配 + 向外扩展容纳模糊边缘。
    // 【关键】扩展量固定为 48px，与 CSS `.note-window.has-bg::before` 的
    // `inset: -48px` 完全一致——若按"模糊半径×2+8"缩放，模糊越强 cover 目标
    // 区域越大，背景图被放得越大，从"无模糊切到有模糊"时图片会突然放大（用户
    // 反馈）。48px 足够容纳最大模糊（MAX_BLUR_PX=40px）的边缘溢出。
    const ext = 48;
    ctx.filter = `blur(${px}px)`;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const ir = iw / ih;
    const fr = w / h;
    let dw: number, dh: number, dx: number, dy: number;
    if (ir > fr) {
      dh = h + ext * 2;
      dw = dh * ir;
      dx = (w - dw) / 2;
      dy = -ext;
    } else {
      dw = w + ext * 2;
      dh = dw / ir;
      dx = -ext;
      dy = (h - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.filter = "none";
    // JPEG 压缩（透明背景图罕见，此处非透明主题才走本路径）以控制内存
    try {
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch {
      return canvas.toDataURL();
    }
  } catch {
    return null;
  }
}
