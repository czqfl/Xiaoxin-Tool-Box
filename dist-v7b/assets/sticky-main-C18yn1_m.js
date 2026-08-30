const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/settings-DikDMGDC.js","assets/index-B-gap5mw.js","assets/glow-particles-DsHbf4sR.js","assets/webviewWindow-Cr3D_jCO.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload, g as getCurrentWindow, l as listen, i as invoke, c as currentMonitor, P as PhysicalPosition, a as PhysicalSize, L as LogicalSize, e as emit } from "./index-B-gap5mw.js";
import { g as getSettings, o as onSettingsChanged, n as normalizeOpacity, s as setAcrylic, a as startDragging, c as closeWindow, b as newNoteId, d as createNoteWindow, l as listNotes, e as getOpenNotes, f as setNotePriority, h as deleteNote, i as openNoteWindow, j as saveNote, m as minimizeToTray, k as markNoteClosed, p as normalizeGlassPct, q as getShortcut, r as setAlwaysOnTop, t as loadNote, u as formatWithLLM, v as readMdCustom } from "./settings-DikDMGDC.js";
import { P as PIN_ICON_PATH } from "./pin-path.const-Bic-ch4A.js";
let wallpaperDataUrlCache = null;
function getWallpaperDataUrl() {
  if (wallpaperDataUrlCache) return wallpaperDataUrlCache;
  wallpaperDataUrlCache = (async () => {
    try {
      const { getWallpaper, readBgImage } = await __vitePreload(async () => {
        const { getWallpaper: getWallpaper2, readBgImage: readBgImage2 } = await import("./settings-DikDMGDC.js").then((n) => n.w);
        return { getWallpaper: getWallpaper2, readBgImage: readBgImage2 };
      }, true ? __vite__mapDeps([0,1]) : void 0);
      const wp = await getWallpaper();
      if (!wp) return "";
      const dataUrl = await readBgImage(wp);
      if (!dataUrl || !dataUrl.startsWith("data:")) return "";
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("壁纸解码失败"));
        img.src = dataUrl;
      });
      const maxEdge = 1920;
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas2 = document.createElement("canvas");
      canvas2.width = w;
      canvas2.height = h;
      const ctx = canvas2.getContext("2d");
      if (!ctx) return "";
      ctx.drawImage(img, 0, 0, w, h);
      return canvas2.toDataURL("image/jpeg", 0.82);
    } catch (e) {
      console.warn("读取桌面壁纸失败:", e);
      return "";
    }
  })();
  return wallpaperDataUrlCache;
}
async function resolveGlobalBg(path) {
  if (path.startsWith("data:")) return path;
  try {
    const { readBgImage } = await __vitePreload(async () => {
      const { readBgImage: readBgImage2 } = await import("./settings-DikDMGDC.js").then((n) => n.w);
      return { readBgImage: readBgImage2 };
    }, true ? __vite__mapDeps([0,1]) : void 0);
    return await readBgImage(path);
  } catch (e) {
    console.warn("读取背景图失败:", e);
    return "";
  }
}
async function applyPanelBackground(el, s, opts = {}) {
  const transparent = s.theme === "transparent";
  let bgUrl = opts.bgUrl ?? "";
  if (!bgUrl) {
    if (transparent) {
      bgUrl = await getWallpaperDataUrl();
    } else if (s.bg_image) {
      bgUrl = await resolveGlobalBg(s.bg_image);
    }
  }
  if (bgUrl) {
    el.style.setProperty("--note-bg-img", `url("${bgUrl}")`);
    el.style.setProperty("--note-bg-opacity", "1");
    el.classList.add("has-bg");
  } else {
    el.style.removeProperty("--note-bg-img");
    el.style.removeProperty("--note-bg-opacity");
    el.classList.remove("has-bg");
  }
  el.classList.toggle("bg-transparent", transparent);
  await applyAdaptiveColors(el, bgUrl);
}
function bgLuminance(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        const size = 32;
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(0.5);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        resolve(sum / (size * size) / 255);
      } catch {
        resolve(0.5);
      }
    };
    img.onerror = () => resolve(0.5);
    img.src = dataUrl;
  });
}
async function applyAdaptiveColors(el, bgUrl) {
  let dark = false;
  if (bgUrl) {
    try {
      dark = await bgLuminance(bgUrl) < 0.45;
    } catch {
      dark = false;
    }
  }
  el.classList.toggle("on-dark-bg", dark);
}
const reduceMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeInOutCubic = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const state = /* @__PURE__ */ new WeakMap();
function tweenGlassBlur(target, toPx, opts) {
  const duration = opts?.duration ?? 280;
  const onDone = opts?.onDone;
  const raw = target.style.getPropertyValue("--glass-blur");
  const from = raw ? parseFloat(raw) || 0 : 0;
  const to = Math.max(0, toPx);
  const prev = state.get(target);
  if (prev) {
    cancelAnimationFrame(prev.raf);
    prev.alive = false;
  }
  if (reduceMotion || from === to || duration <= 0) {
    target.style.setProperty("--glass-blur", to + "px");
    onDone?.();
    state.delete(target);
    return;
  }
  target.classList.add("animating");
  let startTs = 0;
  const step2 = (now) => {
    const st = state.get(target);
    if (!st || !st.alive) return;
    if (!startTs) startTs = now;
    const t = Math.min(1, (now - startTs) / duration);
    const v = from + (to - from) * easeInOutCubic(t);
    target.style.setProperty("--glass-blur", v.toFixed(2) + "px");
    if (t < 1) {
      st.raf = requestAnimationFrame(step2);
    } else {
      target.style.setProperty("--glass-blur", to + "px");
      target.classList.remove("animating");
      st.alive = false;
      onDone?.();
      state.delete(target);
    }
  };
  const entry = { raf: 0, alive: true };
  state.set(target, entry);
  entry.raf = requestAnimationFrame(step2);
}
const MAX_BLUR_PX = 40;
function parseColorToRgbInt(value) {
  if (!value) return null;
  const s = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) return parseInt(hex[1], 16);
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (rgb) {
    return parseInt(rgb[1], 10) << 16 | parseInt(rgb[2], 10) << 8 | parseInt(rgb[3], 10);
  }
  return null;
}
function applyGlassBlur(opts) {
  const target = opts.target;
  if (!target) return;
  const pct = Math.max(0, Math.min(100, Math.round(opts.strength)));
  target.style.removeProperty("--glass-blur");
  if (!opts.enabled || pct <= 0) {
    if (target.classList.contains("glass")) {
      tweenGlassBlur(target, 0, {
        onDone: () => {
          target.classList.remove("glass");
          target.style.removeProperty("--glass-blur");
        }
      });
    } else {
      target.classList.remove("glass");
      target.style.removeProperty("--glass-blur");
    }
    return;
  }
  const px = Math.round(pct / 100 * MAX_BLUR_PX);
  if (!target.classList.contains("glass")) {
    target.classList.add("glass");
    target.style.setProperty("--glass-blur", px + "px");
    return;
  }
  tweenGlassBlur(target, px);
}
const glass$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  MAX_BLUR_PX,
  applyGlassBlur,
  parseColorToRgbInt
}, Symbol.toStringTag, { value: "Module" }));
function mountHistoryApp() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="history-window">
      <div class="titlebar">
        <div class="titlebar-left">
          <span class="dot">●</span>
          <span class="title-text">历史便签</span>
        </div>
        <!-- 新建便签按钮：标题栏直接子元素，absolute 居中相对整个标题栏（非右侧容器） -->
        <button class="new-note-btn" id="btn-new" title="新建便签">
          <!-- SVG 加号：颜色跟随 currentColor（可被 CSS 控制）——之前的 ➕
               是 emoji，自带颜色，CSS color 无效（用户反馈"没变绿"的根因） -->
          <span class="btn-plus">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10"/>
            </svg>
          </span>
          <span class="btn-label">新建便签</span>
        </button>
        <div class="titlebar-right">
          <button class="icon-btn close" id="btn-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="history-list" id="history-list"></div>
    </div>
  `;
  const listEl = document.getElementById("history-list");
  const titlebar = document.querySelector(".titlebar");
  const btnClose = document.getElementById("btn-close");
  const btnNew = document.getElementById("btn-new");
  async function createNewNote() {
    try {
      const id = await newNoteId();
      await createNoteWindow(id);
    } catch (err) {
      console.error("新建便签失败:", err);
    }
  }
  btnNew.addEventListener("click", () => void createNewNote());
  getSettings().then((s) => {
    const root = document.documentElement;
    root.classList.remove("theme-dark");
    if (s.theme === "dark" || s.theme === "transparent") root.classList.add("theme-dark");
    void applyHistoryBg(s);
    getCurrentWindow().show().then(() => getCurrentWindow().setFocus()).catch(() => {
    });
  }).catch((e) => {
    console.error("读取主题失败:", e);
    getCurrentWindow().show().catch(() => {
    });
  });
  onSettingsChanged(() => {
    getSettings().then((s) => void applyHistoryBg(s)).catch(() => {
    });
  });
  let renderPending = false;
  let pointerActive = false;
  const requestRender = () => {
    if (renderPending) return;
    renderPending = true;
    window.setTimeout(() => {
      renderPending = false;
      if (pointerActive) {
        window.setTimeout(requestRender, 60);
        return;
      }
      void render2();
    }, 0);
  };
  listEl.addEventListener("pointerdown", () => {
    pointerActive = true;
  }, true);
  window.addEventListener("pointerup", () => {
    pointerActive = false;
    requestRender();
  }, true);
  window.addEventListener("pointercancel", () => {
    pointerActive = false;
    requestRender();
  }, true);
  listen("sticky://state-changed", requestRender).catch((e) => console.error("监听便签状态失败:", e));
  getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) requestRender();
  }).catch((e) => console.error("监听窗口焦点失败:", e));
  requestRender();
  async function applyHistoryBg(s) {
    const root = document.querySelector(".history-window");
    if (!root) return;
    document.documentElement.classList.remove("theme-dark");
    if (s.theme === "dark" || s.theme === "transparent") {
      document.documentElement.classList.add("theme-dark");
    }
    const transparent = s.theme === "transparent";
    if (transparent) {
      root.classList.remove("has-bg", "on-dark-bg", "glass", "transparent-clear");
      root.classList.add("bg-transparent");
      root.style.removeProperty("--note-bg-img");
      root.style.removeProperty("--note-bg-opacity");
      root.style.removeProperty("--glass-blur");
      document.documentElement.style.removeProperty("--trans-opacity");
      root.style.removeProperty("--trans-opacity");
      const o = normalizeOpacity(s.transparent_opacity);
      if (o < 2) {
        root.classList.add("transparent-clear");
        root.style.setProperty("--trans-opacity", "0");
        document.documentElement.style.setProperty("--trans-opacity", "0");
        setAcrylic(false, 0, 0).catch(() => {
        });
      } else {
        root.classList.remove("transparent-clear");
        const capped = Math.round(o * 0.6);
        root.style.setProperty("--trans-opacity", String(capped));
        document.documentElement.style.setProperty("--trans-opacity", String(capped));
        const tint = parseColorToRgbInt(getComputedStyle(root).getPropertyValue("--bg")) ?? 0;
        setAcrylic(true, 1, tint).catch((e) => console.error("应用实时模糊失败:", e));
      }
      applyGlassBlur({ target: root, strength: 0, enabled: false });
    } else {
      root.classList.remove("bg-transparent");
      document.documentElement.style.removeProperty("--trans-opacity");
      root.style.removeProperty("--trans-opacity");
      setAcrylic(false, 0, 0).catch(() => {
      });
      await applyPanelBackground(root, s);
      const hasBg = root.classList.contains("has-bg");
      const pct = s.glass_blur ?? 55;
      const enabled = s.glass_enabled !== false;
      applyGlassBlur({ target: root, strength: hasBg ? pct : 0, enabled: hasBg && enabled });
    }
  }
  titlebar.addEventListener("mousedown", (e) => {
    if (e.target.closest(".icon-btn, .new-note-btn")) return;
    startDragging();
  });
  btnClose.addEventListener("click", () => {
    closeWindow().catch((e) => console.error("关闭失败:", e));
  });
  let lastSig = "";
  async function render2() {
    let items;
    let openSet = /* @__PURE__ */ new Set();
    try {
      const [notes, open] = await Promise.all([listNotes(), getOpenNotes().catch(() => [])]);
      items = notes;
      openSet = new Set(open);
    } catch (err) {
      console.error("加载列表失败:", err);
      listEl.innerHTML = `<div class="empty-state"><div class="empty-text">加载失败，请重试</div></div>`;
      return;
    }
    const sig = items.map(
      (i) => `${i.id}|${i.updated}|${i.title}|${i.snippet}|${openSet.has(i.id) ? 1 : 0}|${i.top_priority ? 1 : 0}`
    ).join("~");
    if (sig === lastSig) return;
    lastSig = sig;
    listEl.innerHTML = "";
    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <button class="new-note-cta" id="new-note-cta" title="新建便签">
            <span class="cta-icon">➕</span>
            <span class="cta-text">新建便签</span>
          </button>
        </div>
      `;
      document.getElementById("new-note-cta")?.addEventListener("click", () => void createNewNote());
      return;
    }
    try {
      items.forEach((item) => {
        const isOpen = openSet.has(item.id);
        const card = document.createElement("div");
        card.className = "history-card" + (isOpen ? " open-note" : "");
        card.dataset.id = item.id;
        if (isOpen) {
          card.style.borderLeft = "3px solid #22c55e";
        }
        const title = (item.title || "").trim();
        const primary = title || item.snippet;
        const secondary = title ? `<div class="card-snippet">${escapeHtml$1(item.snippet)}</div>` : "";
        const delBtnHtml = `<button class="card-delete" title="删除">✕</button>`;
        const pinBtnHtml = `<button class="card-pin${item.top_priority ? " active" : ""}" title="${item.top_priority ? "已置顶（快捷键优先操作此便签）" : "设为置顶（快捷键优先操作此便签）"}"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="${PIN_ICON_PATH}"/></svg></button>`;
        card.innerHTML = `
          <div class="card-info">
            <div class="card-title">${escapeHtml$1(primary)}</div>
            ${secondary}
            <div class="card-meta">
              <span class="card-time">${escapeHtml$1(item.updatedStr)}</span>
            </div>
          </div>
          <div class="card-actions">
            ${pinBtnHtml}
            ${delBtnHtml}
          </div>
        `;
        listEl.appendChild(card);
      });
      if (!listEl.dataset.delegated) {
        listEl.dataset.delegated = "1";
        listEl.addEventListener("click", (e) => {
          const target = e.target;
          const card = target.closest(".history-card");
          if (!card || !card.dataset.id) return;
          const id = card.dataset.id;
          if (target.closest(".card-pin")) {
            setNotePriority(id).catch((err) => console.error("设置置顶失败:", err));
            return;
          }
          const delBtn = target.closest(".card-delete");
          if (delBtn) {
            if (delBtn.classList.contains("confirming")) {
              deleteNote(id).then(() => requestRender()).catch((err) => {
                console.error("删除失败:", err);
                delBtn.classList.remove("confirming");
                delBtn.textContent = "✕";
              });
            } else {
              delBtn.classList.add("confirming");
              delBtn.textContent = "确认?";
              window.setTimeout(() => {
                if (delBtn.isConnected) {
                  delBtn.classList.remove("confirming");
                  delBtn.textContent = "✕";
                }
              }, 3e3);
            }
            return;
          }
          openNoteWindow(id).catch((err) => console.error("打开便签失败:", err));
        });
      }
    } catch (err) {
      console.error("渲染历史列表失败:", err);
    }
  }
  render2();
}
function escapeHtml$1(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
let urls = [];
let idx = 0;
function getEl(sel) {
  return document.querySelector(sel);
}
function render() {
  if (!urls.length) return;
  const img = getEl(".iv-img");
  img.src = urls[idx];
  getEl(".iv-count").textContent = `${idx + 1} / ${urls.length}`;
}
function step$1(d) {
  if (!urls.length) return;
  idx = (idx + d + urls.length) % urls.length;
  render();
}
function closeViewer() {
  getCurrentWindow().close();
}
async function load() {
  try {
    const data = await invoke("get_viewer_data");
    if (!data || !data.urls || data.urls.length === 0) {
      closeViewer();
      return;
    }
    urls = data.urls;
    idx = Math.min(Math.max(0, data.index), urls.length - 1);
    render();
  } catch (e) {
    console.error("加载图片预览失败:", e);
    closeViewer();
  }
}
async function mountImageViewer() {
  document.body.innerHTML = `
    <div class="iv-root">
      <div class="iv-stage"><img class="iv-img" alt="图片预览"></div>
      <button class="iv-nav iv-prev" type="button" title="上一张">‹</button>
      <button class="iv-nav iv-next" type="button" title="下一张">›</button>
      <div class="iv-count"></div>
    </div>`;
  getEl(".iv-prev").onclick = () => step$1(-1);
  getEl(".iv-next").onclick = () => step$1(1);
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") step$1(-1);
    else if (e.key === "ArrowRight") step$1(1);
  });
  const img = getEl(".iv-img");
  img.addEventListener("dragstart", (e) => e.preventDefault());
  await load();
  listen("viewer-reload", () => load());
  if (!urls.length) return;
  try {
    await getCurrentWindow().show();
    await getCurrentWindow().setFocus();
  } catch (e) {
    console.error("显示图片预览窗口失败:", e);
  }
}
let canvas = null;
let gl = null;
let rafId = 0;
let backupId = 0;
let layerEnded = true;
let dpr = 1;
let started = false;
let lastPaint = 0;
let anims = [];
let glData = new Float32Array(65536 * 7);
const ensureGlData = (n) => {
  if (n * 7 <= glData.length) return;
  const g = new Float32Array(Math.max(glData.length * 2, n * 7));
  g.set(glData);
  glData = g;
};
const sampleColor = (inst, lxPhys, lyPhys) => {
  if (!inst.fieldData || inst.fieldData.length < 4) return [235, 240, 255];
  const lx = lxPhys / inst.noteDpr;
  const ly = lyPhys / inst.noteDpr;
  let fx = Math.round(lx / inst.rectW * inst.fieldW);
  if (fx < 0) fx = 0;
  else if (fx >= inst.fieldW) fx = inst.fieldW - 1;
  let fy = Math.round(ly / inst.rectH * inst.fieldH);
  if (fy < 0) fy = 0;
  else if (fy >= inst.fieldH) fy = inst.fieldH - 1;
  const idx2 = (fy * inst.fieldW + fx) * 4;
  if (idx2 + 2 >= inst.fieldData.length) return [235, 240, 255];
  const r = inst.fieldData[idx2], g = inst.fieldData[idx2 + 1], b = inst.fieldData[idx2 + 2];
  const max = Math.max(r, g, b);
  if (!isFinite(max)) return [235, 240, 255];
  if (max >= 158) return [r, g, b];
  const f = 158 / Math.max(1, max);
  return [Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)];
};
const spawn = (inst, sx, sy, age) => {
  if (inst.pcount >= inst.maxP) return;
  let life = Math.round((3e3 + Math.random() * 2200) * inst.k);
  const fit = inst.duration - age - 40;
  if (fit < 120) return;
  if (life > fit) life = fit;
  const i = inst.pcount++;
  inst.px[i] = sx;
  inst.py[i] = sy;
  inst.pang[i] = (Math.random() - 0.5) * (110 * Math.PI / 180);
  inst.pv0[i] = (20 + Math.random() * 15) * inst.noteDpr;
  inst.pv1[i] = 150 * inst.noteDpr;
  inst.plife[i] = life;
  inst.page[i] = 0;
  inst.psize[i] = 1.9 + Math.random() * 0.7;
  inst.pseed[i] = Math.random() * Math.PI * 2;
  inst.psway[i] = (Math.random() - 0.5) * 100 * inst.noteDpr + inst.windPx;
  const [r, g, b] = sampleColor(inst, sx - inst.originX, sy - inst.originY);
  inst.pr[i] = r / 255;
  inst.pg[i] = g / 255;
  inst.pb[i] = b / 255;
};
function buildAnim(p) {
  const noteDpr = Math.max(1, p.dprNote || 1);
  const rectW = Math.max(1, p.width);
  const rectH = Math.max(1, p.height);
  const fieldW = p.fieldW || 8;
  const fieldH = p.fieldH || 8;
  const fieldData = p.fieldData || [];
  const tW = p.tW || 8;
  const tH = p.tH || 8;
  const tField = p.tField || [];
  const spacing = 3;
  const ecx = Math.max(2, Math.ceil(rectW / spacing));
  const ecy = Math.max(2, Math.ceil(rectH / spacing));
  const ecount = ecx * ecy;
  const emitX = new Float32Array(ecount);
  const emitY = new Float32Array(ecount);
  const emitT = new Float32Array(ecount);
  const emitDone = new Uint8Array(ecount);
  const sampleT = (lx, ly) => {
    let fx = Math.round(lx / rectW * tW);
    if (fx < 0) fx = 0;
    else if (fx >= tW) fx = tW - 1;
    let fy = Math.round(ly / rectH * tH);
    if (fy < 0) fy = 0;
    else if (fy >= tH) fy = tH - 1;
    return tField[fy * tW + fx];
  };
  let ei = 0;
  let maxEmitT = 0;
  for (let iy = 0; iy < ecy; iy++) {
    for (let ix = 0; ix < ecx; ix++) {
      const lx = (ix + 0.5) * spacing;
      const ly = (iy + 0.5) * spacing;
      emitX[ei] = p.originX + lx * noteDpr;
      emitY[ei] = p.originY + ly * noteDpr;
      let T = sampleT(lx, ly);
      if (!isFinite(T) || T < 0) T = 0;
      emitT[ei] = T;
      if (T > maxEmitT) maxEmitT = T;
      ei++;
    }
  }
  const binSize = 20;
  const binCount = Math.ceil(maxEmitT / binSize) + 2;
  const binPts = [];
  for (let b = 0; b < binCount; b++) binPts.push([]);
  for (let i = 0; i < ecount; i++) {
    let b = Math.floor(emitT[i] / binSize);
    if (b < 0) b = 0;
    else if (b >= binCount) b = binCount - 1;
    binPts[b].push(i);
  }
  const density = Math.max(0, Math.min(100, p.density ?? 50)) / 100;
  const keepProb = Math.max(0.015, density);
  const peakAlive = Math.round(ecount * (0.03 + 0.97 * density));
  const maxP = peakAlive + 1500;
  const k = Math.max(0.25, Math.min(4, 100 / Math.max(10, p.speed ?? 100)));
  return {
    seq: p.seq ?? 0,
    originX: p.originX,
    originY: p.originY,
    rectW,
    rectH,
    fieldW,
    fieldH,
    fieldData,
    tW,
    tH,
    tField,
    noteDpr,
    emitX,
    emitY,
    emitT,
    emitDone,
    binPts,
    ecount,
    layerStartAt: p.startAt ?? Date.now(),
    duration: Math.round(2400 * k),
    k,
    keepProb,
    windPx: (p.wind ?? 0) * noteDpr,
    done: false,
    maxP,
    px: new Float32Array(maxP),
    py: new Float32Array(maxP),
    pang: new Float32Array(maxP),
    pv0: new Float32Array(maxP),
    pv1: new Float32Array(maxP),
    plife: new Float32Array(maxP),
    page: new Float32Array(maxP),
    psize: new Float32Array(maxP),
    pseed: new Float32Array(maxP),
    psway: new Float32Array(maxP),
    pr: new Float32Array(maxP),
    pg: new Float32Array(maxP),
    pb: new Float32Array(maxP),
    pcount: 0
  };
}
function stopLayer() {
  layerEnded = true;
  cancelAnimationFrame(rafId);
  if (backupId) {
    window.clearInterval(backupId);
    backupId = 0;
  }
  anims = [];
  if (gl) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  getCurrentWindow().hide().catch(() => {
  });
}
const frame = (now) => {
  if (layerEnded) return;
  if (!started) {
    started = true;
    lastPaint = now;
  }
  const dt = Math.min(0.05, Math.max(1e-3, (now - lastPaint) / 1e3));
  lastPaint = now;
  if (!gl) return;
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  let drawCount = 0;
  for (let a = anims.length - 1; a >= 0; a--) {
    const inst = anims[a];
    const age = Date.now() - inst.layerStartAt;
    if (age >= inst.duration) {
      inst.done = true;
      anims.splice(a, 1);
      continue;
    }
    const globalFade = age > inst.duration - 200 ? Math.max(0, (inst.duration - age) / 200) : 1;
    const b1 = Math.min(inst.binPts.length - 1, Math.floor(age / 20));
    for (let b = 0; b <= b1; b++) {
      const pts = inst.binPts[b];
      for (let z = 0; z < pts.length; z++) {
        const idx2 = pts[z];
        if (inst.emitDone[idx2] === 0) {
          inst.emitDone[idx2] = 1;
          if (Math.random() < inst.keepProb) spawn(inst, inst.emitX[idx2], inst.emitY[idx2], age);
        }
      }
    }
    ensureGlData(drawCount + inst.pcount);
    for (let i = 0; i < inst.pcount; i++) {
      const a2 = inst.page[i] + dt * 1e3;
      inst.page[i] = a2;
      const life = inst.plife[i];
      const u = a2 / life;
      if (u >= 1) {
        const last = --inst.pcount;
        if (i !== last) {
          inst.px[i] = inst.px[last];
          inst.py[i] = inst.py[last];
          inst.pang[i] = inst.pang[last];
          inst.pv0[i] = inst.pv0[last];
          inst.pv1[i] = inst.pv1[last];
          inst.plife[i] = inst.plife[last];
          inst.page[i] = inst.page[last];
          inst.psize[i] = inst.psize[last];
          inst.pseed[i] = inst.pseed[last];
          inst.psway[i] = inst.psway[last];
          inst.pr[i] = inst.pr[last];
          inst.pg[i] = inst.pg[last];
          inst.pb[i] = inst.pb[last];
        }
        i--;
        continue;
      }
      const aSec = a2 / 1e3;
      const tLife = life / 1e3;
      const rise = 1 - Math.exp(-aSec / 0.3);
      const ease = 1 - 0.3 * Math.min(1, aSec / Math.max(0.6, tLife));
      const speed = (inst.pv0[i] + inst.pv1[i] * rise * ease) * (1 + 0.3 * Math.sin(a2 * 21e-4 + inst.pseed[i] * 3));
      const dx = Math.sin(inst.pang[i]);
      const dy = -Math.cos(inst.pang[i]);
      const s1 = Math.sin(a2 * 25e-4 + inst.pseed[i]) * 85 * inst.noteDpr;
      const s2 = Math.sin(a2 * 9e-3 + inst.pseed[i] * 2.3) * 55 * inst.noteDpr;
      const s3 = Math.sin(a2 * 0.024 + inst.pseed[i] * 4.1) * 20 * inst.noteDpr;
      const swayX = inst.psway[i] + s1 + s2 + s3;
      const bobY = Math.sin(a2 * 62e-4 + inst.pseed[i] * 1.7) * 55 * inst.noteDpr * (0.35 + 0.65 * rise);
      inst.px[i] += (dx * speed + swayX) * dt;
      inst.py[i] += (dy * speed + bobY) * dt;
      const t = 1 - u;
      const twinkle = 0.8 + 0.2 * Math.sin(a2 * 0.02 + inst.pseed[i] * 5);
      const alpha = t * Math.pow(t, 0.2) * globalFade * twinkle;
      if (alpha < 0.02) continue;
      const pulse = 1 + 0.22 * Math.sin(a2 * 7e-3 + inst.pseed[i] * 2);
      const haloR = inst.psize[i] * pulse * 1.3;
      const o = drawCount * 7;
      glData[o] = inst.px[i];
      glData[o + 1] = inst.py[i];
      glData[o + 2] = haloR * 2 * inst.noteDpr;
      glData[o + 3] = alpha;
      glData[o + 4] = inst.pr[i];
      glData[o + 5] = inst.pg[i];
      glData[o + 6] = inst.pb[i];
      drawCount++;
    }
  }
  if (drawCount > 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, glData.subarray(0, drawCount * 7), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(aParamLoc);
    gl.vertexAttribPointer(aParamLoc, 2, gl.FLOAT, false, 28, 8);
    gl.enableVertexAttribArray(aColorLoc);
    gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 28, 16);
    gl.drawArrays(gl.POINTS, 0, drawCount);
  }
  if (anims.length === 0) {
    stopLayer();
  }
};
const step = (now) => {
  frame(now);
  if (!layerEnded) rafId = requestAnimationFrame(step);
};
async function startLayer(p) {
  const now = Date.now();
  anims = anims.filter((a) => now - a.layerStartAt < a.duration);
  anims = anims.filter((a) => !(Math.abs(a.originX - p.originX) < 4 && Math.abs(a.originY - p.originY) < 4));
  const inst = buildAnim(p);
  anims.push(inst);
  if (layerEnded) {
    layerEnded = false;
    started = false;
    rafId = requestAnimationFrame(step);
    backupId = window.setInterval(() => {
      if (layerEnded) return;
      const now2 = performance.now();
      if (now2 - lastPaint > 60) {
        lastPaint = now2;
        frame(now2);
      }
    }, 40);
  }
  const win = getCurrentWindow();
  try {
    await win.show();
  } catch {
  }
  try {
    await win.setAlwaysOnTop(true);
  } catch {
  }
  win.setFocus().catch(() => {
  });
  window.setTimeout(() => {
    win.setAlwaysOnTop(true).catch(() => {
    });
  }, 120);
}
async function calibrateLayerWindow() {
  const mon = await Promise.race([
    currentMonitor(),
    new Promise((res) => setTimeout(() => res(null), 1500))
  ]).catch(() => null);
  const fallbackW = Math.round((window.screen.width || window.innerWidth || 1920) * (window.devicePixelRatio || 1));
  const fallbackH = Math.round((window.screen.height || window.innerHeight || 1080) * (window.devicePixelRatio || 1));
  const pw = Math.max(1, mon?.size?.width ?? fallbackW);
  const ph = Math.max(1, mon?.size?.height ?? fallbackH);
  if (canvas && (canvas.width !== pw || canvas.height !== ph)) {
    canvas.width = pw;
    canvas.height = ph;
    gl = null;
    buf = null;
    aPosLoc = 0;
    aParamLoc = 0;
    aColorLoc = 0;
    if (!setupGL()) {
      console.error("粒子层 WebGL 重建失败");
    }
  }
}
let buf = null;
let aPosLoc = 0;
let aParamLoc = 0;
let aColorLoc = 0;
function setupGL() {
  if (!canvas) return false;
  const glOpts = { alpha: true, premultipliedAlpha: false, antialias: false, depth: false };
  const ctx = canvas.getContext("webgl", glOpts) || canvas.getContext("experimental-webgl", glOpts);
  if (!ctx) return false;
  gl = ctx;
  const VS_SRC = `
    attribute vec2 a_pos;
    attribute vec2 a_param;
    attribute vec3 a_color;
    uniform vec2 u_res;
    varying float v_alpha;
    varying vec3 v_color;
    void main() {
      vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
      clip.y = -clip.y;
      gl_Position = vec4(clip, 0.0, 1.0);
      gl_PointSize = a_param.x;
      v_alpha = a_param.y;
      v_color = a_color;
    }`;
  const FS_SRC = `
    precision mediump float;
    varying float v_alpha;
    varying vec3 v_color;
    uniform sampler2D u_sprite;
    void main() {
      // 圆形发光纹理：alpha 决定形状（点精灵在部分驱动上 discard 圆形不可靠 → 用纹理兜底）
      vec4 c = texture2D(u_sprite, gl_PointCoord);
      if (c.a < 0.01) discard;
      gl_FragColor = vec4(v_color * 1.5, v_alpha * c.a);
    }`;
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VS_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FS_SRC);
  if (!vs || !fs) return false;
  const prog = gl.createProgram();
  if (!prog) return false;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
  gl.useProgram(prog);
  aPosLoc = gl.getAttribLocation(prog, "a_pos");
  aParamLoc = gl.getAttribLocation(prog, "a_param");
  aColorLoc = gl.getAttribLocation(prog, "a_color");
  gl.uniform2f(gl.getUniformLocation(prog, "u_res"), canvas.width, canvas.height);
  const spriteLoc = gl.getUniformLocation(prog, "u_sprite");
  if (spriteLoc) gl.uniform1i(spriteLoc, 0);
  const SS = 32;
  const spr = document.createElement("canvas");
  spr.width = SS;
  spr.height = SS;
  const sctx = spr.getContext("2d");
  if (sctx) {
    const g = sctx.createRadialGradient(SS / 2, SS / 2, 0, SS / 2, SS / 2, SS / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.75)");
    g.addColorStop(0.75, "rgba(255,255,255,0.2)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, SS, SS);
  }
  const tex = gl.createTexture();
  if (tex) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, spr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  return true;
}
async function mountParticlesLayer() {
  const win = getCurrentWindow();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  await calibrateLayerWindow();
  const ww = window.screen.width || window.innerWidth;
  const hh = window.screen.height || window.innerHeight;
  const pw = Math.max(1, Math.round(ww * dpr));
  const ph = Math.max(1, Math.round(hh * dpr));
  win.setIgnoreCursorEvents(true).catch(() => {
  });
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.background = "transparent";
  canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "2147483647";
  canvas.style.pointerEvents = "none";
  document.body.appendChild(canvas);
  if (!setupGL()) {
    console.error("粒子层 WebGL 初始化失败");
    return;
  }
  void listen("particles-start", (e) => {
    startLayer(e.payload).catch((err) => console.error("粒子层启动失败:", err));
  });
  void listen("particles-cancel", (e) => {
    const seq = e?.payload?.seq ?? 0;
    const ox = e?.payload?.originX;
    const oy = e?.payload?.originY;
    if (seq !== 0) {
      anims = anims.filter(
        (a) => !(a.seq === seq && (ox === void 0 || Math.abs(a.originX - ox) < 1) && (oy === void 0 || Math.abs(a.originY - oy) < 1))
      );
    } else {
      anims = [];
    }
    if (anims.length === 0) stopLayer();
  });
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatInline(escaped) {
  let out = escaped.replace(/\n/g, "<br/>");
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const safe = /^(https?:|mailto:|\/|#)/i.test(u) ? u : "#";
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${t}</a>`;
  });
  return out;
}
function renderMarkdown(src) {
  const text = (src || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  let html = "";
  let i = 0;
  let listType = "";
  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = "";
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      closeList();
      i++;
      const buf2 = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf2.push(lines[i]);
        i++;
      }
      i++;
      html += `<pre><code>${escapeHtml(buf2.join("\n"))}</code></pre>`;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      html += `<h${level}>${formatInline(escapeHtml(h[2]))}</h${level}>`;
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(trimmed)) {
      closeList();
      html += "<hr/>";
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      const bq = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bq.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html += `<blockquote>${renderMarkdown(bq.join("\n"))}</blockquote>`;
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${formatInline(escapeHtml(ul[1]))}</li>`;
      i++;
      continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${formatInline(escapeHtml(ol[1]))}</li>`;
      i++;
      continue;
    }
    if (trimmed === "") {
      closeList();
      i++;
      continue;
    }
    closeList();
    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].trim().startsWith("```") && !/^#{1,6}\s+/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^\s*([-*_])\1{2,}\s*$/.test(lines[i].trim())) {
      para.push(lines[i]);
      i++;
    }
    html += `<p>${formatInline(escapeHtml(para.join("\n")))}</p>`;
  }
  closeList();
  return html;
}
const DEFAULT_MD_CSS = `
:root {
  --bg: #fffefb;
  --bg-bar: #f7f4ee;
  --border: #ebe5da;
  --text: #3a3a3a;
  --text-sub: #a39c90;
  --accent: #6b9fd9;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 16px;
  font-family: "Microsoft YaHei UI", "PingFang SC", system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text);
  background: var(--bg);
  word-wrap: break-word;
  min-height: 100vh;
}
h1, h2, h3, h4, h5, h6 { margin: 12px 0 8px; line-height: 1.35; font-weight: 700; color: var(--text); }
h1 { font-size: 22px; }
h2 { font-size: 19px; }
h3 { font-size: 17px; }
h4 { font-size: 15px; }
h5, h6 { font-size: 14px; color: var(--text-sub); }
h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
p { margin: 8px 0; }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 3px 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12.5px; background: var(--bg-bar); border: 1px solid var(--border); border-radius: 4px; padding: 1px 4px; color: #b5553a; }
pre { margin: 10px 0; background: var(--bg-bar); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
pre code { background: transparent; border: none; padding: 0; color: var(--text); font-size: 12.5px; line-height: 1.5; }
blockquote { margin: 10px 0; padding: 6px 12px; border-left: 3px solid var(--accent); background: var(--bg-bar); border-radius: 0 6px 6px 0; color: var(--text-sub); }
hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
strong { font-weight: 700; }
body::-webkit-scrollbar { width: 6px; }
body::-webkit-scrollbar-track { background: transparent; }
body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
body::-webkit-scrollbar-thumb:hover { background: var(--text-sub); }
`;
const DEFAULT_MD_CSS_DARK = `
:root {
  --bg: #23232a;
  --bg-bar: #2d2d35;
  --border: #3c3c45;
  --text: #e6e4df;
  --text-sub: #9a948b;
  --accent: #7fb0e6;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 16px;
  font-family: "Microsoft YaHei UI", "PingFang SC", system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text);
  background: var(--bg);
  color-scheme: dark;
  word-wrap: break-word;
  min-height: 100vh;
}
h1, h2, h3, h4, h5, h6 { margin: 12px 0 8px; line-height: 1.35; font-weight: 700; color: var(--text); }
h1 { font-size: 22px; }
h2 { font-size: 19px; }
h3 { font-size: 17px; }
h4 { font-size: 15px; }
h5, h6 { font-size: 14px; color: var(--text-sub); }
h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
p { margin: 8px 0; }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 3px 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 12.5px; background: var(--bg-bar); border: 1px solid var(--border); border-radius: 4px; padding: 1px 4px; color: #e89b7d; }
pre { margin: 10px 0; background: var(--bg-bar); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
pre code { background: transparent; border: none; padding: 0; color: var(--text); font-size: 12.5px; line-height: 1.5; }
blockquote { margin: 10px 0; padding: 6px 12px; border-left: 3px solid var(--accent); background: var(--bg-bar); border-radius: 0 6px 6px 0; color: var(--text-sub); }
hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
strong { font-weight: 700; }
body::-webkit-scrollbar { width: 6px; }
body::-webkit-scrollbar-track { background: transparent; }
body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
body::-webkit-scrollbar-thumb:hover { background: var(--text-sub); }
`;
const THEME_CSS = {
  github: `
:root {
  --text: #1f2328;
  --bg: #ffffff;
  --bg-bar: #f6f8fa;
  --border: #d0d7de;
  --accent: #0969da;
  --text-sub: #656d76;
}
h1, h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
code { background: rgba(175, 184, 193, 0.2); }
`,
  "rose-pine": `
:root {
  --text: #e0def4;
  --bg: #191724;
  --bg-bar: #1f1d2e;
  --border: #403d52;
  --accent: #eb6f92;
  --text-sub: #908caa;
  color-scheme: dark;
}
code { background: rgba(255, 255, 255, 0.06); }
blockquote { color: var(--text-sub); }
`,
  solarized: `
:root {
  --text: #657b83;
  --bg: #fdf6e3;
  --bg-bar: #eee8d5;
  --border: #e3dcc3;
  --accent: #268bd2;
  --text-sub: #93a1a1;
}
code { background: var(--bg-bar); }
`,
  "monokai": `
:root {
  --text: #f8f8f2;
  --bg: #272822;
  --bg-bar: #1e1f1c;
  --border: #3e3d39;
  --accent: #66d9ef;
  --text-sub: #75715e;
  color-scheme: dark;
}
code { background: rgba(255, 255, 255, 0.06); }
blockquote { color: var(--text-sub); }
`,
  "ayu-dark": `
:root {
  --text: #e6e1cf;
  --bg: #0a0e14;
  --bg-bar: #0f141b;
  --border: #1c2530;
  --accent: #ffb454;
  --text-sub: #7e8a96;
  color-scheme: dark;
}
code { background: rgba(255, 255, 255, 0.05); }
blockquote { color: var(--text-sub); }
`,
  "solarized-dark": `
:root {
  --text: #93a1a1;
  --bg: #002b36;
  --bg-bar: #013640;
  --border: #0a4853;
  --accent: #2aa198;
  --text-sub: #586e75;
  color-scheme: dark;
}
code { background: rgba(255, 255, 255, 0.06); }
`,
  "github-dark": `
:root {
  --text: #e6edf3;
  --bg: #0d1117;
  --bg-bar: #161b22;
  --border: #30363d;
  --accent: #58a6ff;
  --text-sub: #8b949e;
  color-scheme: dark;
}
h1, h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
code { background: rgba(110, 118, 129, 0.4); }
`
};
const MD_BG_CSS = `
body.has-bg-img { background: transparent; }
body.has-bg-img::before {
  content: "";
  position: fixed;
  /* 向外扩展以容纳模糊半径的采样范围（最大 40px），
     否则预览区边缘的模糊会因采样落到图外而减弱 */
  inset: -48px;
  z-index: -1;
  background-image: var(--md-bg-img);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  filter: blur(var(--md-blur, 16px));
  transform: translateZ(0);
}
body.has-bg-img::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--bg);
  /* 不透明度越高（更不透明），蒙版越淡、背景图越清晰；调低则蒙版更厚、便于阅读 */
  opacity: calc(0.82 - var(--md-bg-opacity, 1) * 0.42);
}
/* 透明主题：预览区与便签一致——透明 + 高斯模糊，仅保留一层极淡的蒙版保证文字可读 */
body.has-bg-img.md-transparent::after {
  opacity: 0.12;
}
`;
function getThemeCss(theme, customCss = "") {
  if (theme === "custom") return customCss || "";
  if (theme === "default") return "";
  return THEME_CSS[theme] || "";
}
let flame;
let glow;
let inhale;
let glass;
let loading = null;
function loadAnimModules() {
  if (!loading) {
    loading = Promise.all([
      __vitePreload(() => import("./flame-C83Qncsj.js"), true ? [] : void 0).then((m) => flame = m),
      __vitePreload(() => import("./glow-particles-DsHbf4sR.js"), true ? __vite__mapDeps([2,1,3]) : void 0).then((m) => glow = m),
      __vitePreload(() => import("./glow-particles-inhale-INjPCi_r.js"), true ? [] : void 0).then((m) => inhale = m),
      __vitePreload(() => import("./glass-shatter-BxLsUlQL.js"), true ? [] : void 0).then((m) => glass = m)
    ]).then(() => void 0);
  }
  return loading;
}
const anim = {
  load: loadAnimModules,
  get flame() {
    return flame;
  },
  get glow() {
    return glow;
  },
  get inhale() {
    return inhale;
  },
  get glass() {
    return glass;
  }
};
const SAVE_DELAY = 250;
const ICON_MAX = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
const ICON_RESTORE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>`;
function mountNoteApp(noteId, preset = "") {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="note-window">
      <div class="titlebar">
        <div class="titlebar-left">
          <input class="title-input" id="note-title" placeholder="便签" maxlength="40" spellcheck="false" title="点击编辑标题" />
        </div>
        <div class="titlebar-grip" id="drag-grip" title="拖动便签"><span class="grip-dots"></span></div>
        <div class="titlebar-right">
          <button class="icon-btn" id="btn-toolbar-toggle" title="显示/隐藏格式工具栏" aria-pressed="false">
            <span class="tb-toggle-ico" aria-hidden="true">Aa</span>
          </button>
          <button class="icon-btn" id="btn-pin" title="置顶" aria-pressed="true">
            <span class="nail" aria-hidden="true">
              <svg class="pin-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="${PIN_ICON_PATH}"></path>
              </svg>
            </span>
          </button>
          <button class="icon-btn" id="btn-max" title="最大化">${ICON_MAX}</button>
          <button class="icon-btn" id="btn-tray" title="最小化到托盘">&#9661;</button>
          <button class="icon-btn close" id="btn-close" title="关闭">&#10005;</button>
        </div>
      </div>
      <!-- 新建便签默认隐藏格式工具栏（display:none 兜底，避免首帧闪现；加载后按设置恢复）。
           【必须用 HTML 注释】此处是 innerHTML 模板字符串而非 JSX——JSX 风格的
           {&#47;* ... *&#47;} 在 HTML 里是一行真实文本节点，会把标题栏与工具栏之间
           撑出一条无垫底空隙，壁纸从那里透出（"中间多一条深色横带"的根因） -->
      <div class="toolbar" style="display:none">
        <div class="tool-color wps" id="tool-fg-wrap" title="字体颜色">
          <button type="button" class="cc-main" id="tool-fg-apply" title="应用当前字体颜色">
            <span class="cc-letter">A</span>
            <span class="cc-bar" id="tool-fg-bar"></span>
          </button>
          <button type="button" class="cc-drop" id="tool-fg-drop" title="选择字体颜色">▾</button>
          <input type="color" class="color-swatch-input" id="tool-fg" value="#3a3a3a" title="选择颜色">
        </div>
        <div class="tool-color wps" id="tool-bg-wrap" title="背景颜色">
          <button type="button" class="cc-main cc-main-bg" id="tool-bg-apply" title="应用当前背景颜色">
            <span class="cc-letter">B</span>
            <span class="cc-bar" id="tool-bg-bar"></span>
          </button>
          <button type="button" class="cc-drop" id="tool-bg-drop" title="选择背景颜色">▾</button>
          <input type="color" class="color-swatch-input" id="tool-bg" value="#fffefb" title="选择背景色">
        </div>
        <div class="tool-color wps" id="tool-size-wrap" title="文字大小">
          <button type="button" class="cc-main" id="tool-size-main" title="选择文字大小">
            <span class="cc-letter ts-letter" aria-hidden="true">A</span>
            <span class="ts-num" id="tool-size-num">14</span>
          </button>
          <button type="button" class="cc-drop" id="tool-size-drop" title="选择字号">▾</button>
        </div>
        <div class="tool-md" id="tool-md" title="Markdown 预览模式">
          <button type="button" class="md-btn" id="btn-md-preview" title="Markdown 预览：把内容渲染为 Markdown">预览</button>
          <button type="button" class="md-btn" id="btn-md-split" title="拆分预览：左侧编辑、右侧实时预览">拆分</button>
        </div>
        <div class="tool-format" id="tool-format" title="用大模型整理格式（选择 Markdown / 纯文本）">
          <button type="button" class="md-btn" id="btn-fmt" title="调用大模型整理便签格式">整理</button>
        </div>
      </div>
      <div class="editor-area" id="editor-area">
        <div class="editor" id="editor" contenteditable="true" data-placeholder="写点什么..."></div>
        <iframe class="md-preview" id="md-preview"></iframe>
      </div>
      <div class="cc-panel" id="tool-fg-panel" hidden></div>
      <div class="cc-panel" id="tool-bg-panel" hidden></div>
      <!-- 自动保存提示（左下角浮动，短暂显示） -->
      <span class="save-status" id="save-status"></span>
    </div>
  `;
  const editor = document.getElementById("editor");
  const appWindow = getCurrentWindow();
  const titlebar = document.querySelector(".titlebar");
  const btnPin = document.getElementById("btn-pin");
  const btnToolbarToggle = document.getElementById("btn-toolbar-toggle");
  const btnClose = document.getElementById("btn-close");
  const btnTray = document.getElementById("btn-tray");
  const titleInput = document.getElementById("note-title");
  const saveStatus = document.getElementById("save-status");
  let suppressSaveStatus = false;
  const toolFg = document.getElementById("tool-fg");
  const toolBg = document.getElementById("tool-bg");
  const toolFgApply = document.getElementById("tool-fg-apply");
  const toolBgApply = document.getElementById("tool-bg-apply");
  const toolSizeWrap = document.getElementById("tool-size-wrap");
  const toolSizeMain = document.getElementById("tool-size-main");
  const toolSizeDrop = document.getElementById("tool-size-drop");
  const toolSizeNum = document.getElementById("tool-size-num");
  const btnMax = document.getElementById("btn-max");
  const editorArea = document.getElementById("editor-area");
  const mdPreview = document.getElementById("md-preview");
  const btnMdPreview = document.getElementById("btn-md-preview");
  const btnMdSplit = document.getElementById("btn-md-split");
  const btnFmt = document.getElementById("btn-fmt");
  const noteWindow = document.querySelector(".note-window");
  let current = {
    content: "",
    title: "",
    md: "none",
    pinned: true,
    created: Date.now(),
    updated: Date.now(),
    width: 420,
    height: 440
  };
  let saveTimer;
  let sizeSaveTimer;
  let posSaveTimer;
  let deleted = false;
  let savedRange = null;
  let toolbarOff = null;
  const toolbar = document.querySelector(".toolbar");
  const applyToolbarVisible = (visible) => {
    toolbar.style.display = visible ? "" : "none";
    btnToolbarToggle.classList.toggle("active", visible);
    btnToolbarToggle.setAttribute("aria-pressed", String(visible));
  };
  btnToolbarToggle.addEventListener("click", () => {
    const visible = toolbar.style.display === "none";
    applyToolbarVisible(visible);
    current.toolbar_visible = visible;
    saveNote(noteId, current).catch((e) => console.error("保存工具栏配置失败:", e));
  });
  let savedBounds = null;
  let isMaximizedState = false;
  let programmaticResize = false;
  let lastMdSource = "";
  titlebar.addEventListener("mousedown", (e) => {
    if (e.target.closest(".icon-btn, input, select, textarea")) return;
    startDragging();
  });
  const titlebarRightButtons = [btnToolbarToggle, btnPin, btnMax, btnTray];
  const TB_GRIP_W = 76;
  const TB_PAD = 16;
  const TB_GRIP_GAP = 8;
  const TB_CLOSE_W = 31;
  const TB_BTN_W = 31;
  function adaptTitlebar() {
    const total = titlebar.clientWidth;
    const rest = Math.max(0, total - TB_GRIP_W - TB_PAD);
    const col3 = rest * 1.15 / 2.15;
    const available = col3 - TB_GRIP_GAP - TB_CLOSE_W;
    const keep = Math.max(0, Math.min(titlebarRightButtons.length, Math.floor(available / TB_BTN_W)));
    titlebarRightButtons.forEach((btn, i) => {
      btn.style.display = i < keep ? "" : "none";
    });
    btnClose.style.display = "";
  }
  function adaptToolbar() {
    toolbar.classList.remove("crowded");
    const overflow = toolbar.scrollWidth > toolbar.clientWidth + 1;
    toolbar.classList.toggle("crowded", overflow);
  }
  requestAnimationFrame(() => {
    adaptToolbar();
    adaptTitlebar();
  });
  try {
    appWindow.onResized(() => {
      adaptToolbar();
      adaptTitlebar();
    });
  } catch {
  }
  try {
    const ro = new ResizeObserver(() => {
      adaptToolbar();
      adaptTitlebar();
    });
    ro.observe(document.documentElement);
  } catch {
  }
  editor.addEventListener("blur", () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  });
  toolbar.addEventListener("mousedown", () => {
    toolbarOff = getSelectionOffsets();
  }, true);
  function getSelectionOffsets() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      return {
        start: textOffsetAt(range.startContainer, range.startOffset),
        end: textOffsetAt(range.endContainer, range.endOffset)
      };
    }
    if (savedRange && !savedRange.collapsed) {
      return {
        start: textOffsetAt(savedRange.startContainer, savedRange.startOffset),
        end: textOffsetAt(savedRange.endContainer, savedRange.endOffset)
      };
    }
    return null;
  }
  function restoreSelectionOffsets(off) {
    if (!off) return;
    try {
      editor.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const s = positionAt(off.start);
      const e = positionAt(off.end);
      const range = document.createRange();
      range.setStart(s.node, s.offset);
      range.setEnd(e.node, e.offset);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {
      console.error("还原选区失败:", err);
    }
  }
  function textOffsetAt(container, offset) {
    let count = 0;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_ALL, null);
    let n;
    while (n = walker.nextNode()) {
      if (n === container) {
        if (n.nodeType === Node.TEXT_NODE) return count + offset;
        let sub = 0;
        for (let i = 0; i < offset && i < n.childNodes.length; i++) {
          sub += n.childNodes[i].textContent?.length || 0;
        }
        return count + sub;
      }
      if (n.nodeType === Node.TEXT_NODE) count += n.textContent?.length || 0;
    }
    return count;
  }
  function positionAt(target) {
    let count = 0;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
    let n;
    let last = { node: editor, offset: 0 };
    while (n = walker.nextNode()) {
      const len = n.textContent?.length || 0;
      if (count + len >= target) return { node: n, offset: target - count };
      count += len;
      last = { node: n, offset: len };
    }
    return last;
  }
  function applySavedSize() {
    const w = current.width && current.width > 0 ? current.width : 420;
    const h = current.height && current.height > 0 ? current.height : 440;
    try {
      getCurrentWindow().setSize(new LogicalSize(w, h)).catch(() => {
      });
    } catch (e) {
      console.error("设置窗口尺寸失败:", e);
    }
  }
  function setupImagePreview() {
    const onDbl = (e) => {
      const target = e.target;
      const img = target.closest("img");
      if (!img) return;
      if (img.closest(".md-preview")) return;
      const imgs = Array.from(
        document.querySelectorAll(".editor img")
      );
      const idx2 = imgs.indexOf(img);
      if (idx2 < 0) return;
      const urls2 = imgs.map((m) => m.src);
      invoke("open_image_viewer", { urls: urls2, index: idx2 }).catch(
        (err) => console.error("打开图片预览失败:", err)
      );
    };
    editor.addEventListener("dblclick", onDbl);
  }
  async function init() {
    try {
      const loaded = await loadNote(noteId);
      if (loaded) {
        current = { width: 420, height: 440, title: "", md: "none", ...loaded };
        editor.innerHTML = loaded.content || "";
        titleInput.value = loaded.title || "";
        updatePin(loaded.pinned, false);
        applyToolbarVisible(loaded.toolbar_visible ?? false);
      } else {
        updatePin(true, false);
        applyToolbarVisible(false);
      }
      if (preset && !loaded) {
        editor.innerText = preset;
        current.content = editor.innerHTML;
        scheduleSave();
      }
    } catch (err) {
      console.error("加载便签失败:", err);
      updatePin(true, false);
    }
    try {
      applyMdMode();
      await applyTheme();
      await applyMdTheme();
      updateMaxIcon();
      await refreshSettingsUI();
      applySavedSize();
      await applyBackground();
      await applyGlassEnabled();
    } catch (err) {
      console.error("便签外观应用失败（已忽略，继续显示）:", err);
    }
    if (noteId !== "main") {
      try {
        const open = await getOpenNotes();
        void invoke("diag_log", {
          msg: `[note] init show: noteId=${noteId} open=${JSON.stringify(open)}`
        }).catch(() => {
        });
        if (open.includes(noteId)) {
          await getCurrentWindow().show();
          await getCurrentWindow().setFocus();
        } else {
          await getCurrentWindow().hide();
        }
      } catch (e) {
        console.error("读取打开状态失败:", e);
      }
    }
    await refreshEdgeSnapSetting();
    probeEdge();
    setInterval(probeEdge, 400);
    editor.focus();
    setupImagePreview();
    void anim.load();
  }
  function updatePin(pinned, animate = true) {
    current.pinned = pinned;
    btnPin.classList.toggle("pinned", pinned);
    btnPin.setAttribute("aria-pressed", pinned ? "true" : "false");
    btnPin.title = pinned ? "取消置顶" : "置顶";
    setAlwaysOnTop(pinned).catch((e) => console.error("置顶失败:", e));
    if (animate && pinned) {
      setNotePriority(noteId).catch((e) => console.error("登记置顶失败:", e));
    }
  }
  async function resolveBgImage(s) {
    let bg = current.bg_image || s.bg_image || "";
    if (bg && !bg.startsWith("data:")) {
      try {
        const { readBgImage } = await __vitePreload(async () => {
          const { readBgImage: readBgImage2 } = await import("./settings-DikDMGDC.js").then((n) => n.w);
          return { readBgImage: readBgImage2 };
        }, true ? __vite__mapDeps([0,1]) : void 0);
        bg = await readBgImage(bg);
      } catch (e) {
        bg = "";
      }
    }
    return bg;
  }
  async function applyBackground() {
    const s = await getSettings();
    const transparent = s.theme === "transparent";
    const mdBody = ensurePreviewDoc()?.body ?? null;
    if (transparent) {
      noteWindow.classList.remove("bg-immersive");
      noteWindow.style.removeProperty("--note-panel-alpha");
      noteWindow.style.removeProperty("--note-bar-alpha");
      noteWindow.classList.add("bg-transparent");
      noteWindow.classList.remove("has-bg", "on-dark-bg");
      noteWindow.style.removeProperty("--note-bg-img");
      noteWindow.style.removeProperty("--note-bg-opacity");
      applyGlassBlur({ target: noteWindow, strength: 0, enabled: false });
      await applyAcrylic();
      if (mdBody) {
        mdBody.classList.add("md-transparent");
        mdBody.classList.remove("has-bg-img");
        mdBody.style.removeProperty("--md-bg-img");
        mdBody.style.removeProperty("--md-bg-opacity");
        mdBody.style.removeProperty("--md-blur");
        const tv = getComputedStyle(document.documentElement).getPropertyValue("--trans-opacity").trim();
        mdBody.style.background = tv === "0" ? "transparent" : `color-mix(in srgb, var(--bg) ${tv}%, transparent)`;
      }
      return;
    }
    await applyAcrylic();
    noteWindow.classList.remove("bg-transparent");
    if (mdBody) {
      mdBody.style.removeProperty("background");
    }
    const bgUrl = await resolveBgImage(s);
    await applyPanelBackground(noteWindow, s, { bgUrl: bgUrl || void 0 });
    noteWindow.classList.toggle("bg-immersive", !!bgUrl);
    noteWindow.style.removeProperty("--note-panel-alpha");
    noteWindow.style.removeProperty("--note-bar-alpha");
  }
  async function applyAcrylic() {
    const s = await getSettings();
    if (s.theme !== "transparent") {
      noteWindow.style.removeProperty("--trans-opacity");
      noteWindow.classList.remove("transparent-clear");
      setAcrylic(false, 0, 0).catch(() => {
      });
      return;
    }
    const o = normalizeOpacity(s.transparent_opacity);
    if (o < 2) {
      noteWindow.classList.add("transparent-clear");
      noteWindow.style.setProperty("--trans-opacity", "0");
      document.documentElement.style.setProperty("--trans-opacity", "0");
      setAcrylic(false, 0, 0).catch(() => {
      });
      return;
    }
    noteWindow.classList.remove("transparent-clear");
    const capped = Math.round(o * 0.6);
    noteWindow.style.setProperty("--trans-opacity", String(capped));
    document.documentElement.style.setProperty("--trans-opacity", String(capped));
    const tint = parseColorToRgbInt(getComputedStyle(noteWindow).getPropertyValue("--bg")) ?? 0;
    setAcrylic(true, 1, tint).catch((e) => console.error("应用实时模糊失败:", e));
  }
  async function applyGlassEnabled() {
    const s = await getSettings();
    const transparent = s.theme === "transparent";
    const pct = normalizeGlassPct(s.glass_blur);
    const enabled = s.glass_enabled !== false;
    const { applyGlassBlur: applyGlassBlur2 } = await __vitePreload(async () => {
      const { applyGlassBlur: applyGlassBlur22 } = await Promise.resolve().then(() => glass$1);
      return { applyGlassBlur: applyGlassBlur22 };
    }, true ? void 0 : void 0);
    if (transparent) {
      await applyAcrylic();
      return;
    }
    applyGlassBlur2({ target: noteWindow, strength: pct, enabled });
  }
  function scheduleSave() {
    if (deleted) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      current.content = editor.innerHTML;
      current.title = titleInput.value;
      current.updated = Date.now();
      setSaveStatus("保存中…");
      saveNote(noteId, current).then(() => setSaveStatus("已保存")).catch((e) => {
        console.error("保存失败:", e);
        setSaveStatus("保存失败", true);
      });
    }, SAVE_DELAY);
  }
  let savedStatusTimer;
  function setSaveStatus(text, isError = false) {
    if (suppressSaveStatus) return;
    if (!saveStatus) return;
    saveStatus.textContent = text;
    saveStatus.classList.toggle("error", isError);
    saveStatus.classList.toggle("ok", !isError && text === "已保存");
    saveStatus.classList.add("show");
    if (savedStatusTimer) window.clearTimeout(savedStatusTimer);
    savedStatusTimer = window.setTimeout(
      () => saveStatus.classList.remove("show"),
      isError ? 2600 : 1400
    );
  }
  async function refreshSettingsUI() {
    await getSettings();
    toolFgApply.title = `按当前颜色上色（${getShortcut("fg_color")}）`;
    toolBgApply.title = `按当前背景色上色（${getShortcut("bg_color")}）`;
    toolSizeWrap.title = `文字大小（增大 ${getShortcut("size_up")} / 减小 ${getShortcut("size_down")}）`;
  }
  onSettingsChanged(() => {
    invoke("diag_log", { msg: "[note] settings-changed fired, re-applying" }).catch(() => {
    });
    refreshSettingsUI();
    applyTheme();
    applyMdTheme();
    applyBackground();
    applyGlassEnabled();
    refreshEdgeSnapSetting();
  });
  let edgeSnapEnabled = true;
  let pinnedEdge = null;
  let restorePos = null;
  let restoreWa = null;
  let collapsed = false;
  let snapping = false;
  let pointerInside = false;
  const EDGE_STRIP = 28;
  const EDGE_MARGIN = 12;
  const easeOutBackSoft = (t) => {
    const c1 = 0.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const easeInCubic = (t) => t * t * t;
  function animateWindowTo(tx, ty, duration, easing) {
    return new Promise((resolve) => {
      appWindow.outerPosition().then((start) => {
        const sx = start.x, sy = start.y;
        const t0 = performance.now();
        const step2 = (now) => {
          const t = Math.min(1, (now - t0) / duration);
          const e = easing(t);
          const x = Math.round(sx + (tx - sx) * e);
          const y = Math.round(sy + (ty - sy) * e);
          appWindow.setPosition(new PhysicalPosition(x, y)).catch(() => {
          });
          if (t < 1) requestAnimationFrame(step2);
          else resolve();
        };
        requestAnimationFrame(step2);
      }).catch(() => resolve());
    });
  }
  async function refreshEdgeSnapSetting() {
    try {
      const s = await getSettings();
      edgeSnapEnabled = s.edge_snap !== false;
      if (!edgeSnapEnabled && collapsed) expandFromEdge();
    } catch (e) {
      console.error("读取贴边设置失败:", e);
    }
  }
  async function probeEdge() {
    if (snapping || collapsed) return;
    try {
      const pos = await appWindow.outerPosition();
      const size = await appWindow.outerSize();
      const m = await currentMonitor();
      if (!m) return;
      const wa = m.workArea;
      const left = pos.x, top = pos.y;
      const right = pos.x + size.width, bottom = pos.y + size.height;
      const waLeft = wa.position.x, waTop = wa.position.y;
      const waRight = wa.position.x + wa.size.width;
      const waBottom = wa.position.y + wa.size.height;
      if (left <= waLeft + EDGE_MARGIN) pinnedEdge = "left";
      else if (right >= waRight - EDGE_MARGIN) pinnedEdge = "right";
      else if (top <= waTop + EDGE_MARGIN) pinnedEdge = "top";
      else if (bottom >= waBottom - EDGE_MARGIN) pinnedEdge = "bottom";
      else pinnedEdge = null;
    } catch (e) {
    }
  }
  async function collapseToEdge() {
    if (!pinnedEdge || snapping) return;
    try {
      snapping = true;
      const pos = await appWindow.outerPosition();
      const size = await appWindow.outerSize();
      const m = await currentMonitor();
      if (!m) {
        snapping = false;
        return;
      }
      const wa = m.workArea;
      restorePos = { x: pos.x, y: pos.y };
      restoreWa = { x: wa.position.x, y: wa.position.y, w: wa.size.width, h: wa.size.height };
      let x = pos.x, y = pos.y;
      if (pinnedEdge === "left") x = wa.position.x - (size.width - EDGE_STRIP);
      else if (pinnedEdge === "right") x = wa.position.x + wa.size.width - EDGE_STRIP;
      else if (pinnedEdge === "top") y = wa.position.y - (size.height - EDGE_STRIP);
      else if (pinnedEdge === "bottom") y = wa.position.y + wa.size.height - EDGE_STRIP;
      await animateWindowTo(x, y, 300, easeInCubic);
      collapsed = true;
    } catch (e) {
      console.error("贴边收起失败:", e);
    } finally {
      setTimeout(() => {
        snapping = false;
      }, 380);
    }
  }
  async function expandFromEdge(byHover = false) {
    if (!collapsed || !restorePos || snapping) return;
    try {
      snapping = true;
      const size = await appWindow.outerSize();
      let tx = restorePos.x, ty = restorePos.y;
      if (restoreWa) {
        const maxX = restoreWa.x + restoreWa.w - size.width;
        const maxY = restoreWa.y + restoreWa.h - size.height;
        tx = Math.min(Math.max(tx, restoreWa.x), Math.max(restoreWa.x, maxX));
        ty = Math.min(Math.max(ty, restoreWa.y), Math.max(restoreWa.y, maxY));
      }
      noteWindow.classList.add("edge-pop-in");
      await animateWindowTo(tx, ty, 360, easeOutBackSoft);
      noteWindow.classList.remove("edge-pop-in");
      collapsed = false;
      restorePos = null;
      restoreWa = null;
    } catch (e) {
      console.error("贴边弹出失败:", e);
    } finally {
      setTimeout(() => {
        snapping = false;
        if (byHover && edgeSnapEnabled && pinnedEdge && !pointerInside && !collapsed) {
          collapseToEdge();
        }
      }, 400);
    }
  }
  document.addEventListener("mouseout", (e) => {
    if (e.relatedTarget === null) pointerInside = false;
    if (collapsed) return;
    if (e.relatedTarget === null && edgeSnapEnabled && pinnedEdge) {
      collapseToEdge();
    }
  });
  document.addEventListener("mouseover", () => {
    pointerInside = true;
    if (collapsed) expandFromEdge(true);
  });
  let wasHidden = false;
  let summonSeq = 0;
  const restoreGlowSummoned = () => {
    anim.glow?.bumpGlowGen();
    try {
      noteWindow.style.clipPath = "";
      noteWindow.style.setProperty("-webkit-mask-image", "");
      noteWindow.style.setProperty("mask-image", "");
      noteWindow.style.opacity = "";
      noteWindow.style.boxShadow = "";
    } catch {
    }
  };
  appWindow.listen("summoned", () => {
    suppressSaveStatus = false;
    if (collapsed) expandFromEdge(false);
    const wasClosing = closing;
    closing = false;
    finished = false;
    clearCloseFailSafe();
    summonSeq++;
    cancelAllAnimations();
    restoreNoteStyles();
    anim.glow?.bumpGlowGen();
    void applyTheme().catch(() => {
    });
    void applyBackground().catch(() => {
    });
    void applyGlassEnabled().catch(() => {
    });
    const fromHidden = wasClosing || wasHidden;
    wasHidden = false;
    if (fromHidden) {
      if (noteWindow.classList.contains("bg-transparent")) {
        if (acrylicOffPending) {
          acrylicOffPending = false;
          applyAcrylic().catch(() => {
          });
        }
      } else {
        const seq = summonSeq;
        void Promise.all([getSettings(), anim.load()]).then(([s]) => {
          if (seq !== summonSeq || closing || deleted) return;
          const intensity = s.particle_count ?? 50;
          const speed = s.animation_speed ?? 100;
          if (s.particle_mode === "none") {
            restoreGlowSummoned();
          } else if (s.particle_mode === "erode") anim.flame.playFlameMaterialize(noteWindow, intensity, speed);
          else if (s.particle_mode === "inhale") anim.inhale.playInhaleMaterialize(noteWindow, intensity, speed);
          else if (s.particle_mode === "glass") anim.glass?.restoreGlassSummoned();
          else restoreGlowSummoned();
        }).catch(() => {
          if (seq !== summonSeq || closing || deleted) return;
          restoreGlowSummoned();
        });
      }
    }
    appWindow.setFocus().catch(() => {
    });
    requestAnimationFrame(() => {
      const n = noteWindow;
      n.style.transform = "scale(0.9999)";
      void n.offsetHeight;
      n.style.transform = "";
      editor.style.visibility = "hidden";
      void editor.offsetHeight;
      editor.style.visibility = "";
      window.dispatchEvent(new Event("resize"));
    });
  });
  function applyFgColor() {
    document.execCommand("foreColor", false, toolFg.value);
    scheduleSave();
  }
  function applyBgColor() {
    if (!document.execCommand("hiliteColor", false, toolBg.value)) {
      document.execCommand("backColor", false, toolBg.value);
    }
    scheduleSave();
  }
  const COLOR_PRESETS = [
    "#000000",
    "#e03131",
    "#f08c00",
    "#f7d000",
    "#2f9e44",
    "#1971c2",
    "#6741d9",
    "#e8590c",
    "#ffffff",
    "#868e96"
  ];
  const RECENT_COLORS_KEY = "xiaoxin-sticky-note-recent-colors";
  function loadRecentColors() {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || "[]");
      return Array.isArray(v) ? v.filter((c) => typeof c === "string") : [];
    } catch {
      return [];
    }
  }
  function recordRecentColor(color) {
    const norm = color.toUpperCase();
    const list = loadRecentColors().filter((c) => c !== norm);
    list.unshift(norm);
    while (list.length > 8) list.pop();
    try {
      localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(list));
    } catch {
    }
  }
  function renderRecentColors(panelEl) {
    const box = panelEl.querySelector("#cc-recent");
    if (!box) return;
    const recents = loadRecentColors();
    box.innerHTML = recents.length ? `<div class="cc-recent-title">最近使用</div>` + recents.map((c) => `<button type="button" class="cc-swatch" data-color="${c}" style="background:${c}"></button>`).join("") : "";
  }
  function updateColorBar(bar, color) {
    bar.style.background = color;
  }
  function setupColorControl(applyBtn, dropBtn, inputEl, barEl, panelEl, applyFn) {
    applyBtn.addEventListener("click", () => {
      restoreSelectionOffsets(toolbarOff);
      applyFn();
      updateColorBar(barEl, inputEl.value);
      recordRecentColor(inputEl.value);
      renderRecentColors(panelEl);
    });
    dropBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = panelEl.hasAttribute("hidden");
      document.querySelectorAll(".cc-panel:not([hidden])").forEach((p) => p.setAttribute("hidden", ""));
      if (willOpen) {
        const wrap = dropBtn.closest(".tool-color");
        if (wrap) {
          const rect = wrap.getBoundingClientRect();
          panelEl.style.top = rect.bottom + "px";
          panelEl.style.left = rect.left + "px";
        }
        renderRecentColors(panelEl);
        panelEl.removeAttribute("hidden");
      } else {
        panelEl.setAttribute("hidden", "");
      }
    });
    panelEl.innerHTML = `<div class="cc-recent" id="cc-recent"></div>` + COLOR_PRESETS.map(
      (c) => `<button type="button" class="cc-swatch" data-color="${c}" style="background:${c}"></button>`
    ).join("") + `<label class="cc-custom">自定义<input type="color" class="cc-custom-input" value="${inputEl.value}"></label>`;
    panelEl.addEventListener("click", (e) => {
      const sw = e.target.closest(".cc-swatch");
      if (!sw || !panelEl.contains(sw)) return;
      e.stopPropagation();
      inputEl.value = sw.getAttribute("data-color") || inputEl.value;
      updateColorBar(barEl, inputEl.value);
      restoreSelectionOffsets(toolbarOff);
      applyFn();
      recordRecentColor(inputEl.value);
      renderRecentColors(panelEl);
      panelEl.setAttribute("hidden", "");
    });
    const customInput = panelEl.querySelector(".cc-custom-input");
    customInput.addEventListener("input", () => {
      inputEl.value = customInput.value;
      updateColorBar(barEl, inputEl.value);
    });
    customInput.addEventListener("change", () => {
      restoreSelectionOffsets(toolbarOff);
      applyFn();
      recordRecentColor(inputEl.value);
      renderRecentColors(panelEl);
      panelEl.setAttribute("hidden", "");
    });
    inputEl.addEventListener("input", () => updateColorBar(barEl, inputEl.value));
    updateColorBar(barEl, inputEl.value);
  }
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t.closest(".tool-color")) {
      document.querySelectorAll(".cc-panel:not([hidden])").forEach((p) => p.setAttribute("hidden", ""));
    }
  });
  function applyFontSizeToSelection(px) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const common = range.commonAncestorContainer;
    const commonEl = common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement;
    const sizeSpan = commonEl?.closest("span[style*='font-size']");
    if (sizeSpan && range.toString() === (sizeSpan.textContent || "")) {
      sizeSpan.style.fontSize = px + "px";
      sizeSpan.querySelectorAll("span[style*='font-size']").forEach((inner) => {
        const sp = inner;
        if (sp.textContent === "") sp.remove();
      });
      const newRange2 = document.createRange();
      newRange2.selectNodeContents(sizeSpan);
      sel.removeAllRanges();
      sel.addRange(newRange2);
      scheduleSave();
      return;
    }
    const span = document.createElement("span");
    span.style.fontSize = px + "px";
    span.appendChild(range.extractContents());
    range.insertNode(span);
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(newRange);
    scheduleSave();
  }
  function changeSelectionFontSize(delta) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    let base = 14;
    const node = range.startContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const parsed = parseFloat(getComputedStyle(el).fontSize);
    if (!isNaN(parsed)) base = parsed;
    const newSize = Math.min(48, Math.max(10, Math.round(base + delta)));
    applyFontSizeToSelection(String(newSize));
  }
  setupColorControl(
    toolFgApply,
    document.getElementById("tool-fg-drop"),
    toolFg,
    document.getElementById("tool-fg-bar"),
    document.getElementById("tool-fg-panel"),
    applyFgColor
  );
  setupColorControl(
    toolBgApply,
    document.getElementById("tool-bg-drop"),
    toolBg,
    document.getElementById("tool-bg-bar"),
    document.getElementById("tool-bg-panel"),
    applyBgColor
  );
  const SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28];
  let currentFontSize = 14;
  let sizeMenu = null;
  function closeSizeMenu() {
    if (sizeMenu) {
      sizeMenu.remove();
      sizeMenu = null;
    }
    document.removeEventListener("mousedown", onSizeMenuOutside, true);
    document.removeEventListener("keydown", onSizeMenuKey, true);
  }
  function onSizeMenuOutside(e) {
    if (sizeMenu && !sizeMenu.contains(e.target) && !toolSizeWrap.contains(e.target)) {
      closeSizeMenu();
    }
  }
  function onSizeMenuKey(e) {
    if (e.key === "Escape") closeSizeMenu();
  }
  function showSizeMenu() {
    if (sizeMenu) {
      closeSizeMenu();
      return;
    }
    const rect = toolSizeWrap.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "fmt-menu size-menu";
    menu.innerHTML = SIZE_OPTIONS.map(
      (px) => `<button type="button" class="fmt-menu-item${px === currentFontSize ? " active" : ""}" data-size="${px}">${px} px</button>`
    ).join("");
    document.body.appendChild(menu);
    sizeMenu = menu;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left;
    if (left + mw > vw - 4) left = Math.max(4, vw - mw - 4);
    let top = rect.bottom + 6;
    if (top + mh > vh - 4) {
      const above = rect.top - mh - 6;
      top = above >= 4 ? above : Math.max(4, vh - mh - 4);
    }
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    menu.querySelectorAll(".fmt-menu-item").forEach((b) => {
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const px = Number(b.dataset.size);
        closeSizeMenu();
        if (!px) return;
        currentFontSize = px;
        toolSizeNum.textContent = String(px);
        restoreSelectionOffsets(toolbarOff);
        applyFontSizeToSelection(String(px));
      });
    });
    setTimeout(() => {
      document.addEventListener("mousedown", onSizeMenuOutside, true);
      document.addEventListener("keydown", onSizeMenuKey, true);
    }, 0);
  }
  toolSizeMain.addEventListener("click", showSizeMenu);
  toolSizeDrop.addEventListener("click", showSizeMenu);
  function ensurePreviewDoc() {
    try {
      const doc = mdPreview.contentDocument;
      if (!doc) return null;
      if (!doc.getElementById("md-base")) {
        doc.open();
        doc.write(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><style id="md-base"></style><style id="md-theme"></style><style id="md-bg"></style></head><body></body></html>'
        );
        doc.close();
        const bg = doc.getElementById("md-bg");
        if (bg) bg.textContent = MD_BG_CSS;
      }
      return doc;
    } catch (e) {
      console.error("预览文档初始化失败:", e);
      return null;
    }
  }
  function renderMdPreview(src) {
    let text = src;
    if (text == null) {
      const editorVisible = editor.offsetParent !== null;
      text = (editorVisible ? editor.innerText : "") || lastMdSource || "";
    }
    lastMdSource = text;
    const doc = ensurePreviewDoc();
    if (!doc) return;
    doc.body.innerHTML = renderMarkdown(text);
  }
  function applyMdMode() {
    const mode = current.md || "none";
    const src = editor.innerText || "";
    editorArea.classList.toggle("preview", mode === "preview");
    editorArea.classList.toggle("split", mode === "split");
    btnMdPreview.classList.toggle("active", mode === "preview");
    btnMdSplit.classList.toggle("active", mode === "split");
    if (mode === "preview" || mode === "split") {
      requestAnimationFrame(() => renderMdPreview(src));
    }
  }
  async function applyTheme() {
    const s = await getSettings();
    const theme = s.theme || "light";
    const root = document.documentElement;
    root.classList.remove("theme-dark");
    if (theme === "dark" || theme === "transparent") {
      root.classList.add("theme-dark");
    }
  }
  async function applyMdTheme() {
    const s = await getSettings();
    const theme = s.md_theme || "default";
    const noteDark = (s.theme || "light") === "dark";
    const doc = ensurePreviewDoc();
    if (!doc) return;
    const base = doc.getElementById("md-base");
    const themeEl = doc.getElementById("md-theme");
    const baseCss = theme === "default" && noteDark ? DEFAULT_MD_CSS_DARK : DEFAULT_MD_CSS;
    if (base) base.textContent = baseCss;
    let custom = "";
    if (theme === "custom") {
      try {
        custom = await readMdCustom();
      } catch (e) {
        console.error("读取自定义样式文件失败:", e);
      }
    }
    if (themeEl) themeEl.textContent = getThemeCss(theme, custom);
    if (current.md === "preview" || current.md === "split") renderMdPreview(lastMdSource);
    applyMdBackground();
  }
  async function applyMdBackground() {
    const s = await getSettings();
    const doc = ensurePreviewDoc();
    if (!doc) return;
    const transparent = s.theme === "transparent";
    const blurPx = Math.round(normalizeGlassPct(s.glass_blur) / 100 * MAX_BLUR_PX) + "px";
    if (transparent) {
      doc.body.classList.add("md-transparent");
      doc.body.classList.remove("has-bg-img");
      doc.body.style.removeProperty("--md-bg-img");
      doc.body.style.removeProperty("--md-bg-opacity");
      doc.body.style.removeProperty("--md-blur");
      const tv = getComputedStyle(document.documentElement).getPropertyValue("--trans-opacity").trim();
      doc.body.style.background = tv === "0" ? "transparent" : `color-mix(in srgb, var(--bg) ${tv}%, transparent)`;
      return;
    }
    const bg = await resolveBgImage(s);
    doc.body.style.removeProperty("background");
    if (bg) {
      doc.body.classList.add("has-bg-img");
      doc.body.classList.remove("md-transparent");
      doc.body.style.setProperty("--md-bg-img", `url("${bg}")`);
      doc.body.style.setProperty("--md-bg-opacity", "1");
      doc.body.style.setProperty("--md-blur", blurPx);
    } else {
      doc.body.classList.remove("has-bg-img", "md-transparent");
      doc.body.style.removeProperty("--md-bg-img");
      doc.body.style.removeProperty("--md-bg-opacity");
      doc.body.style.removeProperty("--md-blur");
    }
  }
  btnMdPreview.addEventListener("click", () => {
    current.md = current.md === "preview" ? "none" : "preview";
    applyMdMode();
    scheduleSave();
  });
  btnMdSplit.addEventListener("click", () => {
    current.md = current.md === "split" ? "none" : "split";
    applyMdMode();
    scheduleSave();
  });
  let fmtMenu = null;
  function closeFormatMenu() {
    if (fmtMenu) {
      fmtMenu.remove();
      fmtMenu = null;
    }
    btnFmt.classList.remove("active");
    document.removeEventListener("mousedown", onFmtMenuOutside, true);
    document.removeEventListener("keydown", onFmtMenuKey, true);
  }
  function onFmtMenuOutside(e) {
    if (fmtMenu && !fmtMenu.contains(e.target) && e.target !== btnFmt) closeFormatMenu();
  }
  function onFmtMenuKey(e) {
    if (e.key === "Escape") closeFormatMenu();
  }
  let fmtLoading = null;
  function showFmtLoading() {
    if (fmtLoading) return;
    const el = document.createElement("div");
    el.className = "fmt-loading-overlay";
    el.innerHTML = `<div class="fmt-loading-box"><div class="spinner"></div><div class="fmt-loading-text">整理中…</div></div>`;
    document.body.appendChild(el);
    fmtLoading = el;
  }
  function hideFmtLoading() {
    if (fmtLoading) {
      fmtLoading.remove();
      fmtLoading = null;
    }
  }
  function showFormatMenu() {
    if (fmtMenu) {
      closeFormatMenu();
      return;
    }
    const rect = btnFmt.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "fmt-menu";
    menu.innerHTML = `
      <button type="button" class="fmt-menu-item" data-mode="md">Markdown 格式</button>
      <button type="button" class="fmt-menu-item" data-mode="text">纯文本格式</button>
      <button type="button" class="fmt-menu-item cancel" data-mode="cancel">取消</button>
    `;
    document.body.appendChild(menu);
    fmtMenu = menu;
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left;
    if (left + mw > vw - 4) left = Math.max(4, vw - mw - 4);
    let top = rect.bottom + 6;
    if (top + mh > vh - 4) {
      const above = rect.top - mh - 6;
      top = above >= 4 ? above : Math.max(4, vh - mh - 4);
    }
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    btnFmt.classList.add("active");
    menu.querySelectorAll(".fmt-menu-item").forEach((b) => {
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const mode = b.dataset.mode;
        closeFormatMenu();
        if (mode === "md") runFormat("md");
        else if (mode === "text") runFormat("text");
      });
    });
    setTimeout(() => {
      document.addEventListener("mousedown", onFmtMenuOutside, true);
      document.addEventListener("keydown", onFmtMenuKey, true);
    }, 0);
  }
  async function runFormat(mode) {
    const srcText = (editor.innerText || "").trim();
    if (!srcText) {
      toast("便签内容为空，无需整理");
      return;
    }
    btnFmt.disabled = true;
    showFmtLoading();
    try {
      const formatted = await formatWithLLM(srcText, mode === "md" ? "md" : "text");
      showFormatDiff(srcText, formatted, mode);
    } catch (e) {
      toast("整理失败：" + String(e));
    } finally {
      btnFmt.disabled = false;
      hideFmtLoading();
    }
  }
  btnFmt.addEventListener("click", showFormatMenu);
  function showFormatDiff(oldText, newText, mode) {
    if (oldText === newText) {
      toast("内容已是最整洁，无需改动");
      return;
    }
    const missing = findMissingLines(oldText, newText);
    let displayNew = newText;
    if (missing.length > 0) {
      displayNew = newText + "\n\n以下为原内容中未被整理覆盖、已自动补回的部分（如不需要可手动删除）：\n" + missing.join("\n");
    }
    const origLen = oldText.replace(/\s+/g, "").length;
    const newLen = newText.replace(/\s+/g, "").length;
    const suspiciousDrop = origLen > 120 && newLen < origLen * 0.6;
    const rows = unifiedDiff(oldText, displayNew);
    const diffHtml = rows.map((r) => {
      const cls = r.type === "del" ? "diff-del" : r.type === "add" ? "diff-add" : "diff-ctx";
      const sign = r.type === "del" ? "-" : r.type === "add" ? "+" : " ";
      const esc = escapeHtml2(r.text) || "&nbsp;";
      return `<div class="diff-line ${cls}"><span class="diff-sign">${sign}</span><span class="diff-text">${esc}</span></div>`;
    }).join("");
    const tipText = missing.length > 0 ? `⚠️ 有 ${missing.length} 行原内容未被整理覆盖，已自动补回并标出，请核对（接受后可手动删除）。` : suspiciousDrop ? "⚠️ 整理后内容明显变少，可能遗漏了信息，请逐行核对后再接受。" : "核对改动，接受后用整理后的内容替换便签。";
    const overlay = document.createElement("div");
    overlay.className = "fmt-diff-overlay";
    overlay.id = "fmt-diff-overlay";
    overlay.innerHTML = `
      <div class="fmt-diff-modal">
        <div class="fmt-diff-header">
          <span class="fmt-diff-title">格式化预览（${mode === "md" ? "Markdown" : "纯文本"}）</span>
          <span class="fmt-diff-stat">-${rows.filter((r) => r.type === "del").length} +${rows.filter((r) => r.type === "add").length}</span>
        </div>
        <div class="fmt-diff-body">${diffHtml}</div>
        <div class="fmt-diff-footer">
          <span class="fmt-diff-tip${missing.length > 0 || suspiciousDrop ? " warn" : ""}">${tipText}</span>
          <button class="btn-primary" id="fmt-accept">接受</button>
          <button class="shortcut-rec" id="fmt-cancel">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector("#fmt-cancel").addEventListener("click", close);
    overlay.querySelector("#fmt-accept").addEventListener("click", () => {
      const html = textToHtml(displayNew);
      editor.innerHTML = html;
      current.content = html;
      if (mode === "md" && (current.md || "none") === "none") {
        current.md = "preview";
        applyMdMode();
      }
      scheduleSave();
      toast(missing.length > 0 ? "已应用（含自动补回的原文内容）" : "已应用整理后的内容");
      close();
    });
  }
  function findMissingLines(oldText, newText) {
    const srcLines = oldText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const out = newText.toLowerCase();
    const missing = [];
    for (const line of srcLines) {
      const tokens = line.match(/[A-Za-z0-9@._\-]{3,}/g) || [];
      if (tokens.length === 0) {
        if (!newText.includes(line)) missing.push(line);
        continue;
      }
      const hit = tokens.some((t) => out.includes(t.toLowerCase()));
      if (!hit) missing.push(line);
    }
    return missing;
  }
  function unifiedDiff(oldText, newText) {
    const a = oldText.split("\n");
    const b = newText.split("\n");
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i2 = n - 1; i2 >= 0; i2--) {
      for (let j2 = m - 1; j2 >= 0; j2--) {
        dp[i2][j2] = a[i2] === b[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        out.push({ type: "ctx", text: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push({ type: "del", text: a[i] });
        i++;
      } else {
        out.push({ type: "add", text: b[j] });
        j++;
      }
    }
    while (i < n) {
      out.push({ type: "del", text: a[i] });
      i++;
    }
    while (j < m) {
      out.push({ type: "add", text: b[j] });
      j++;
    }
    return out;
  }
  function textToHtml(text) {
    const paragraphs = text.split(/\n{2,}/);
    return paragraphs.map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      return "<p>" + escapeHtml2(trimmed).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  function escapeHtml2(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function toast(msg) {
    let el = document.getElementById("sticky-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "sticky-toast";
      el.className = "sticky-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    window.clearTimeout(el._t);
    el._t = window.setTimeout(() => el.classList.remove("show"), 2600);
  }
  async function updateMaxIcon() {
    try {
      const max = isMaximizedState || await appWindow.isMaximized().catch(() => false);
      btnMax.innerHTML = max ? ICON_RESTORE : ICON_MAX;
      btnMax.title = max ? "还原窗口" : "最大化";
      btnMax.title = max ? "还原窗口" : "最大化";
    } catch (e) {
      console.error("读取最大化状态失败:", e);
    }
  }
  async function toggleMaximize() {
    try {
      if (isMaximizedState && savedBounds) {
        programmaticResize = true;
        await appWindow.setPosition(new PhysicalPosition(savedBounds.x, savedBounds.y));
        await appWindow.setSize(new PhysicalSize(savedBounds.w, savedBounds.h));
        isMaximizedState = false;
      } else {
        const pos = await appWindow.outerPosition();
        const size = await appWindow.outerSize();
        savedBounds = { x: pos.x, y: pos.y, w: size.width, h: size.height };
        const monitor = await currentMonitor();
        programmaticResize = true;
        if (monitor) {
          const wa = monitor.workArea;
          await appWindow.setPosition(new PhysicalPosition(wa.position.x, wa.position.y));
          await appWindow.setSize(new PhysicalSize(wa.size.width, wa.size.height));
        } else {
          await appWindow.maximize();
        }
        isMaximizedState = true;
      }
      updateMaxIcon();
    } catch (e) {
      console.error("最大化失败:", e);
    } finally {
      setTimeout(() => {
        programmaticResize = false;
      }, 700);
    }
  }
  btnMax.addEventListener("click", () => {
    toggleMaximize().catch((e) => console.error("最大化失败:", e));
  });
  function matchShortcut(action, e) {
    const combo = getShortcut(action);
    if (!combo) return false;
    const parts = combo.split("+");
    const need = (p) => parts.includes(p);
    if (e.ctrlKey !== need("Ctrl")) return false;
    if (e.altKey !== need("Alt")) return false;
    if (e.shiftKey !== need("Shift")) return false;
    if (e.metaKey !== need("Meta")) return false;
    const main = parts[parts.length - 1];
    let pressed;
    if (e.code === "Equal") pressed = "Plus";
    else if (e.code === "Minus") pressed = "Minus";
    else if (e.code === "Space") pressed = "Space";
    else if (e.key.length === 1) pressed = e.key.toUpperCase();
    else pressed = e.key;
    return pressed === main;
  }
  document.addEventListener("keydown", (e) => {
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const run = (action) => {
      e.preventDefault();
      const before = getSelectionOffsets();
      action();
      const after = getSelectionOffsets();
      if (!after && before) restoreSelectionOffsets(before);
    };
    if (matchShortcut("fg_color", e)) {
      run(applyFgColor);
    } else if (matchShortcut("bg_color", e)) {
      run(applyBgColor);
    } else if (matchShortcut("size_up", e)) {
      run(() => changeSelectionFontSize(2));
    } else if (matchShortcut("size_down", e)) {
      run(() => changeSelectionFontSize(-2));
    }
  });
  btnPin.addEventListener("click", () => updatePin(!current.pinned));
  btnTray.addEventListener("click", () => {
    summonSeq++;
    closing = false;
    finished = false;
    clearCloseFailSafe();
    cancelAllAnimations();
    restoreNoteStyles();
    wasHidden = true;
    minimizeToTray().catch((e) => console.error("最小化到托盘失败:", e));
  });
  btnClose.addEventListener("click", () => {
    requestAnimatedClose();
  });
  let closing = false;
  let finished = false;
  let closeFailSafe;
  let acrylicOffPending = false;
  const cancelAllAnimations = () => {
    anim.glow?.cancelGlowParticles();
    anim.inhale?.cancelInhaleParticles();
    anim.flame?.cancelFlame();
    anim.glass?.cancelGlassShards();
  };
  const restoreNoteStyles = () => {
    try {
      noteWindow.style.clipPath = "";
      noteWindow.style.setProperty("-webkit-mask-image", "");
      noteWindow.style.setProperty("mask-image", "");
      noteWindow.style.opacity = "";
      noteWindow.style.boxShadow = "";
    } catch {
    }
  };
  const clearCloseFailSafe = () => {
    if (closeFailSafe) {
      window.clearTimeout(closeFailSafe);
      closeFailSafe = void 0;
    }
  };
  const setCloseWatchdog = (speed) => {
    clearCloseFailSafe();
    const k = Math.max(0.25, Math.min(4, 100 / Math.max(10, speed || 100)));
    const estDuration = Math.round(2400 * k);
    closeFailSafe = window.setTimeout(() => {
      if (!finished && closing) {
        console.warn("[sticky] close fail-safe triggered");
        finishClose();
      }
    }, estDuration + 1500);
  };
  const finishClose = () => {
    closing = false;
    clearCloseFailSafe();
    if (finished) return;
    finished = true;
    setAcrylic(false, 0, 0).catch(() => {
    });
    acrylicOffPending = true;
    wasHidden = true;
    closeWindow().catch((e) => console.error("关闭失败:", e));
    noteWindow.style.clipPath = "";
    noteWindow.style.setProperty("-webkit-mask-image", "");
    noteWindow.style.setProperty("mask-image", "");
    noteWindow.style.opacity = "";
    noteWindow.style.boxShadow = "";
    window.setTimeout(() => {
      applyAcrylic().catch(() => {
      }).finally(() => {
        acrylicOffPending = false;
      });
    }, 50);
  };
  async function requestAnimatedClose() {
    if (closing) return;
    closing = true;
    finished = false;
    markNoteClosed(noteId).catch(() => {
    });
    suppressSaveStatus = true;
    cancelAllAnimations();
    summonSeq++;
    let settings = null;
    try {
      settings = await getSettings();
    } catch {
    }
    const transparent = settings !== null ? settings.theme === "transparent" : noteWindow.classList.contains("bg-transparent");
    if (transparent) {
      finishClose();
      return;
    }
    void Promise.all([settings !== null ? Promise.resolve(settings) : getSettings(), anim.load()]).then(([s]) => {
      if (!closing) return;
      cancelAllAnimations();
      const intensity = s.particle_count ?? 50;
      const speed = s.animation_speed ?? 100;
      if (s.particle_mode === "none") {
        finishClose();
        return;
      }
      setCloseWatchdog(speed);
      if (s.particle_mode === "erode") anim.flame.requestFlameDissolveClose(finishClose, intensity, speed);
      else if (s.particle_mode === "inhale") anim.inhale.requestInhaleDissolveClose(finishClose, intensity, speed);
      else if (s.particle_mode === "glass") anim.glass.requestGlassShardsClose(finishClose, intensity, speed);
      else anim.glow.requestGlowDissolveClose(finishClose, intensity, speed, true);
    }).catch(() => {
      if (!closing) return;
      cancelAllAnimations();
      setCloseWatchdog(100);
      anim.glow?.requestGlowDissolveClose(finishClose);
    });
  }
  editor.addEventListener("input", () => {
    deleted = false;
    if (current.md === "preview" || current.md === "split") renderMdPreview();
    scheduleSave();
  });
  titleInput.addEventListener("input", () => {
    deleted = false;
    current.title = titleInput.value;
    scheduleSave();
  });
  window.addEventListener("blur", () => {
    if (deleted) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    current.content = editor.innerHTML;
    current.title = titleInput.value;
    current.updated = Date.now();
    setSaveStatus("保存中…");
    saveNote(noteId, current).then(() => setSaveStatus("已保存")).catch(() => setSaveStatus("保存失败", true));
  });
  getCurrentWindow().listen("note-deleted", () => {
    deleted = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    if (sizeSaveTimer) window.clearTimeout(sizeSaveTimer);
    if (noteId === "main") {
      editor.innerHTML = "";
      titleInput.value = "";
      current.content = "";
      current.title = "";
    } else {
      appWindow.destroy().catch(() => {
        closeWindow().catch(() => {
        });
      });
    }
  }).catch((e) => console.error("监听删除事件失败:", e));
  getCurrentWindow().listen("play-close-anim", () => {
    if (closing) {
      if (closeFailSafe) {
        cancelAllAnimations();
        finishClose();
      }
      return;
    }
    requestAnimatedClose();
  }).catch((e) => console.error("监听关闭动画事件失败:", e));
  getCurrentWindow().listen("sticky://force-hidden", () => {
    summonSeq++;
    closing = false;
    finished = false;
    clearCloseFailSafe();
    cancelAllAnimations();
    restoreNoteStyles();
    wasHidden = true;
  }).catch((e) => console.error("监听强制隐藏事件失败:", e));
  (async () => {
    try {
      await appWindow.onResized(() => {
        updateMaxIcon();
        if (programmaticResize || deleted) return;
        if (sizeSaveTimer) window.clearTimeout(sizeSaveTimer);
        sizeSaveTimer = window.setTimeout(() => {
          if (deleted) return;
          void (async () => {
            try {
              const size = await appWindow.outerSize();
              const scale = await appWindow.scaleFactor();
              current.width = Math.round(size.width / scale);
              current.height = Math.round(size.height / scale);
              saveNote(noteId, current).catch(() => {
              });
            } catch {
            }
          })();
        }, 500);
      });
    } catch (e) {
      console.error("监听窗口尺寸失败:", e);
    }
  })();
  (async () => {
    try {
      await appWindow.onMoved(() => {
        if (deleted || snapping || collapsed || programmaticResize || isMaximizedState) return;
        if (posSaveTimer) window.clearTimeout(posSaveTimer);
        posSaveTimer = window.setTimeout(async () => {
          if (deleted || snapping || collapsed || isMaximizedState) return;
          try {
            const pos = await appWindow.outerPosition();
            current.pos_x = pos.x;
            current.pos_y = pos.y;
            saveNote(noteId, current).catch(() => {
            });
          } catch {
          }
        }, 500);
      });
    } catch (e) {
      console.error("监听窗口位置失败:", e);
    }
  })();
  appWindow.onFocusChanged(({ payload: focused }) => {
    if (focused && (current.md === "preview" || current.md === "split")) renderMdPreview(lastMdSource);
  }).catch((e) => console.error("监听聚焦失败:", e));
  init();
}
async function mountStickyByLabel() {
  const label = getCurrentWindow().label;
  const params = new URLSearchParams(window.location.search);
  const noteId = params.get("noteId") || "main";
  const preset = params.get("preset") || "";
  if (label === "sticky-history") {
    mountHistoryApp();
  } else if (label === "sticky-settings") {
    getCurrentWindow().close().catch(() => {
    });
  } else if (label === "sticky-imageviewer") {
    mountImageViewer().catch((e) => console.error("图片预览加载失败:", e));
  } else if (label === "particles") {
    mountParticlesLayer().then(() => emit("sticky://particles-layer-ready", {}).catch(() => {
    })).catch((e) => console.error("粒子层初始化失败:", e));
  } else {
    mountNoteApp(noteId, preset);
  }
}
export {
  mountStickyByLabel
};
