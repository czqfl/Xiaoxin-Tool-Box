import { g as getCurrentWindow, e as emit, i as invoke } from "./index-B-gap5mw.js";
import { W as WebviewWindow } from "./webviewWindow-Cr3D_jCO.js";
async function isParticlesLayerReady() {
  try {
    return !!await invoke("particles_layer_ready");
  } catch {
    return false;
  }
}
let glowActive = false;
let glowGen = 0;
let lastTField = null;
let cancelGlowFn = null;
let lastGlowSeq = 0;
let lastOrigin = { x: 0, y: 0 };
function cancelGlowParticles() {
  if (lastGlowSeq > 0) {
    emit("particles-cancel", { seq: lastGlowSeq, originX: lastOrigin.x, originY: lastOrigin.y }).catch(() => {
    });
  }
  const c = cancelGlowFn;
  cancelGlowFn = null;
  if (c) {
    c();
    return;
  }
  if (!glowActive) return;
  glowActive = false;
  const root = document.querySelector(".note-window");
  if (root) restoreRoot(root);
  document.querySelector(".glow-particles-canvas")?.remove();
}
function restoreRoot(root) {
  try {
    root.style.clipPath = "";
    root.style.setProperty("-webkit-mask-image", "");
    root.style.setProperty("mask-image", "");
    root.style.opacity = "";
    root.style.boxShadow = "";
  } catch {
  }
}
function blankRoot(root) {
  try {
    root.style.clipPath = "inset(0 0 100% 0)";
    root.style.setProperty("-webkit-mask-image", "");
    root.style.setProperty("mask-image", "");
    root.style.opacity = "";
    root.style.boxShadow = "none";
  } catch {
  }
}
function bumpGlowGen() {
  glowGen++;
}
async function getNoteWindowPos() {
  for (let i = 0; i < 3; i++) {
    try {
      const p = await getCurrentWindow().outerPosition();
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
    } catch {
    }
    if (i < 2) await new Promise((r) => window.setTimeout(r, 16));
  }
  return null;
}
function requestGlowDissolveClose(onDone, particleDensity = 50, speed = 100, remote = false) {
  const root = document.querySelector(".note-window");
  if (!root || glowActive) {
    onDone();
    return;
  }
  glowActive = true;
  let done = false;
  let aborted = false;
  let stopRun = null;
  const safeDone = () => {
    if (done) return;
    done = true;
    glowActive = false;
    cancelGlowFn = null;
    onDone();
  };
  const watchdog = window.setTimeout(safeDone, Math.round(5e3 * Math.max(0.25, Math.min(4, 100 / Math.max(10, speed)))));
  cancelGlowFn = () => {
    if (aborted) return;
    aborted = true;
    window.clearTimeout(watchdog);
    if (stopRun) stopRun();
    done = true;
    glowActive = false;
  };
  void (async () => {
    let useRemote = false;
    if (remote && !aborted) {
      const ready = await isParticlesLayerReady();
      if (!ready) {
        console.warn("[glow] 粒子层未就绪（particles-start 监听未注册），粒子退回便签窗口内渲染（受矩形约束）");
      } else {
        try {
          const layer = await WebviewWindow.getByLabel("particles");
          if (layer) {
            await layer.show();
            useRemote = true;
          } else {
            console.warn("[glow] 找不到全屏粒子层窗口，粒子退回便签窗口内渲染");
          }
        } catch {
          useRemote = false;
          console.warn("[glow] 粒子层窗口 show 失败，粒子退回便签窗口内渲染");
        }
      }
    }
    if (aborted) return;
    try {
      const mySeq = ++lastGlowSeq;
      let noteDpr = Math.min(window.devicePixelRatio || 1, 2);
      try {
        const inner = await getCurrentWindow().innerSize();
        const cssW = window.innerWidth || 1;
        if (inner.width > 0 && cssW > 0) {
          const ratio = inner.width / cssW;
          if (ratio > 0.5 && ratio < 4) noteDpr = ratio;
        }
      } catch {
      }
      let layerField = null;
      let layerOrigin = { x: 0, y: 0 };
      if (useRemote && !aborted) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const [field, pos] = await Promise.all([
          buildColorField(root, w, h),
          getNoteWindowPos()
          // outerPosition 失败重试；仍拿不到回退 self（见下）
        ]);
        if (!pos) {
          useRemote = false;
        } else {
          layerField = field;
          layerOrigin.x = pos.x;
          layerOrigin.y = pos.y;
          lastOrigin = { x: pos.x, y: pos.y };
        }
      }
      if (aborted) return;
      const windRoll = Math.random();
      const windDir = windRoll < 0.35 ? -1 : windRoll < 0.7 ? 1 : 0;
      const windPx = windDir * (30 + (0.35 + Math.random() * 0.65) * 90);
      const animStartAt = Date.now();
      stopRun = runGlow(root, particleDensity, speed, () => {
        window.clearTimeout(watchdog);
        safeDone();
      }, useRemote ? "remote" : "self", animStartAt, windPx);
      if (useRemote && !aborted) {
        const field = layerField;
        const tfield = lastTField;
        emit("particles-start", {
          type: "particle",
          seq: mySeq,
          // 动画序号：粒子层忽略过期事件（快速呼出/关闭竞态）
          originX: layerOrigin.x,
          originY: layerOrigin.y,
          width: window.innerWidth,
          height: window.innerHeight,
          fieldW: field?.fw ?? 8,
          fieldH: field?.fh ?? 8,
          fieldData: field ? Array.from(field.data) : [],
          tW: tfield?.tW ?? 8,
          tH: tfield?.tH ?? 8,
          tField: tfield?.data ?? [],
          density: particleDensity,
          speed,
          // 风偏（CSS px/s，正右/负左/0 无风）：粒子层 ×noteDpr 转物理，粒子整体朝（左/右）上方飘
          wind: windPx,
          startAt: animStartAt,
          // 便签窗口 dpr：粒子层物理 px ↔ CSS px 换算（网格 ×resp / 取色 / 速度）
          dprNote: noteDpr
        }).catch(() => {
        });
      }
    } catch (e) {
      console.error("粒子光效消散动画异常:", e);
      window.clearTimeout(watchdog);
      safeDone();
    }
  })();
}
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue(h + 1 / 3) * 255),
    Math.round(hue(h) * 255),
    Math.round(hue(h - 1 / 3) * 255)
  ];
}
function toGlowColor(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const nl = Math.max(l, 0.62);
  const ns = Math.max(s, 0.3);
  return hslToRgb(h, ns, nl);
}
function extractUrl(prop) {
  if (!prop) return "";
  const m = prop.match(/url\((['"]?)([\s\S]*?)\1\)/);
  return m ? m[2] : "";
}
function buildColorField(root, w, h) {
  const fw = Math.max(8, Math.min(128, Math.round(w)));
  const fh = Math.max(8, Math.round(h * fw / Math.max(1, w)));
  const c = document.createElement("canvas");
  c.width = fw;
  c.height = fh;
  const fctx = c.getContext("2d", { willReadFrequently: true });
  if (!fctx) return Promise.resolve(null);
  const cs = getComputedStyle(root);
  const bgColor = cs.backgroundColor || "rgb(128,128,128)";
  let panelAlpha = parseFloat(cs.getPropertyValue("--note-panel-alpha"));
  if (!isFinite(panelAlpha) || panelAlpha <= 0 || panelAlpha > 1) panelAlpha = 0.7;
  const dataUrl = extractUrl(cs.getPropertyValue("--note-bg-img"));
  const readBack = () => ({
    data: fctx.getImageData(0, 0, fw, fh).data,
    fw,
    fh
  });
  const fillSolid = () => {
    fctx.fillStyle = bgColor;
    fctx.fillRect(0, 0, fw, fh);
  };
  if (!dataUrl) {
    fillSolid();
    return Promise.resolve(readBack());
  }
  return new Promise((resolve) => {
    let settled = false;
    const finishWith = (withImage) => {
      if (settled) return;
      settled = true;
      if (withImage && withImage.naturalWidth > 0) {
        const iw = withImage.naturalWidth;
        const ih = withImage.naturalHeight;
        const ir = iw / ih;
        const fr = fw / fh;
        let dw, dh, dx, dy;
        if (ir > fr) {
          dh = fh;
          dw = fh * ir;
          dx = (fw - dw) / 2;
          dy = 0;
        } else {
          dw = fw;
          dh = fw / ir;
          dx = 0;
          dy = (fh - dh) / 2;
        }
        fctx.drawImage(withImage, dx, dy, dw, dh);
        fctx.save();
        fctx.globalAlpha = panelAlpha * 0.15;
        fctx.fillStyle = bgColor;
        fctx.fillRect(0, 0, fw, fh);
        fctx.restore();
      } else {
        fillSolid();
      }
      resolve(readBack());
    };
    const img = new Image();
    const timer = window.setTimeout(() => finishWith(null), 140);
    img.onload = () => {
      window.clearTimeout(timer);
      finishWith(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finishWith(null);
    };
    img.src = dataUrl;
  });
}
function runGlow(root, particleDensity, speed, onDone, mode = "self", baseStartAt = 0, windPx = 0) {
  const myGen = ++glowGen;
  const remote = mode === "remote";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const density = Math.max(0, Math.min(100, particleDensity)) / 100;
  const k = Math.max(0.25, Math.min(4, 100 / Math.max(10, speed)));
  const wipe = Math.round(1400 * k);
  const duration = Math.round(2400 * k);
  let canvas = null;
  let gl = null;
  let loseGL = () => {
  };
  let aPosLoc = 0;
  let aParamLoc = 0;
  let aColorLoc = 0;
  let glBuf = null;
  if (!remote) {
    canvas = document.createElement("canvas");
    canvas.className = "glow-particles-canvas";
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.position = "fixed";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.zIndex = "2147483647";
    canvas.style.pointerEvents = "none";
    canvas.style.transform = "translateZ(0)";
    document.body.appendChild(canvas);
    const glOpts = { alpha: true, premultipliedAlpha: false, antialias: false, depth: false };
    gl = canvas.getContext("webgl", glOpts) || canvas.getContext("experimental-webgl", glOpts);
    if (!gl) {
      canvas.remove();
      finishEarly();
      return () => {
      };
    }
    const VS_SRC = `
      attribute vec2 a_pos;     // 设备像素坐标
      attribute vec2 a_param;   // x=直径(设备px) y=alpha
      attribute vec3 a_color;   // rgb 0~1
      uniform vec2 u_res;       // canvas 设备尺寸
      varying float v_alpha;
      varying vec3 v_color;
      void main() {
        vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
        clip.y = -clip.y;       // 设备 y 向下，翻转
        gl_Position = vec4(clip, 0.0, 1.0);
        gl_PointSize = a_param.x;
        v_alpha = a_param.y;
        v_color = a_color;
      }`;
    const FS_SRC = `
      precision mediump float;
      varying float v_alpha;
      varying vec3 v_color;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r2 = dot(d, d);
        if (r2 > 0.25) discard;
        float r = sqrt(r2);
        float a = clamp((0.3 - r) / 0.06, 0.0, 1.0);
        gl_FragColor = vec4(v_color * 1.5, v_alpha * a);
      }`;
    const compileGL = (type, src) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("[glow] shader compile failed:", gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const glVS = compileGL(gl.VERTEX_SHADER, VS_SRC);
    const glFS = compileGL(gl.FRAGMENT_SHADER, FS_SRC);
    if (!glVS || !glFS) {
      canvas.remove();
      finishEarly();
      return () => {
      };
    }
    const glProg = gl.createProgram();
    if (!glProg) {
      canvas.remove();
      finishEarly();
      return () => {
      };
    }
    gl.attachShader(glProg, glVS);
    gl.attachShader(glProg, glFS);
    gl.linkProgram(glProg);
    if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) {
      console.warn("[glow] program link failed:", gl.getProgramInfoLog(glProg));
      canvas.remove();
      finishEarly();
      return () => {
      };
    }
    gl.useProgram(glProg);
    aPosLoc = gl.getAttribLocation(glProg, "a_pos");
    aParamLoc = gl.getAttribLocation(glProg, "a_param");
    aColorLoc = gl.getAttribLocation(glProg, "a_color");
    gl.uniform2f(gl.getUniformLocation(glProg, "u_res"), canvas.width, canvas.height);
    glBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    let glLost = false;
    loseGL = () => {
      if (glLost) return;
      glLost = true;
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    };
  }
  let field = null;
  const sampleThemeColor = (x, y) => {
    if (!field) return [235, 240, 255];
    let fx = Math.round(x / w * field.fw);
    if (fx < 0) fx = 0;
    else if (fx >= field.fw) fx = field.fw - 1;
    let fy = Math.round(y / h * field.fh);
    if (fy < 0) fy = 0;
    else if (fy >= field.fh) fy = field.fh - 1;
    const idx = (fy * field.fw + fx) * 4;
    return toGlowColor(field.data[idx], field.data[idx + 1], field.data[idx + 2]);
  };
  const featherMs = Math.round(70 * k);
  const maskScale = Math.max(0.18, Math.min(0.32, 120 / Math.max(w, 1)));
  const mw = Math.max(8, Math.round(w * maskScale));
  const mh = Math.max(8, Math.round(h * maskScale));
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = mw;
  maskCanvas.height = mh;
  const mctx = maskCanvas.getContext("2d");
  if (!mctx) {
    finishEarly();
    return () => {
    };
  }
  const mimg = mctx.createImageData(mw, mh);
  const mpx32 = new Uint32Array(mimg.data.buffer);
  const diag = Math.hypot(w, h);
  const regions = [];
  const kSpread = 1.6;
  const windDir = windPx > 0 ? 1 : windPx < 0 ? -1 : 0;
  const windLean = windDir === 0 ? 0 : 0.55 + 0.25 * Math.min(1, Math.abs(windPx) / 120);
  const noisePhase = Math.random() * 100;
  const makeRegion = (x, y, t0) => ({
    x,
    y,
    t0,
    scale: 0.95 + Math.random() * 0.2
  });
  const hash01 = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const valueNoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hash01(ix + iy * 57.31);
    const b = hash01(ix + 1 + iy * 57.31);
    const c = hash01(ix + (iy + 1) * 57.31);
    const d = hash01(ix + 1 + (iy + 1) * 57.31);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const gentleNoise = (nx, ny) => {
    const q = (h - ny) / h;
    const amp = 0.4 + 0.6 * q;
    return amp * (80 * (valueNoise(nx * 4e-3 + noisePhase, ny * 3e-3) * 2 - 1) + 50 * (valueNoise(nx * 9e-3 + 7.3 + noisePhase, ny * 7e-3 + 1.7) * 2 - 1) + 26 * (valueNoise(nx * 0.035 + 3.1, ny * 0.022 + 4.2) * 2 - 1) + 14 * (valueNoise(nx * 0.08 + 9.7, ny * 0.05 + 8.4) * 2 - 1));
  };
  const spreadEffAt = (nx, ny, r) => {
    const dx = nx - r.x;
    const dy = ny - r.y;
    let eff = Math.hypot(dx, dy * (dy < 0 ? 1.8 : 0.85));
    if (windLean > 0) {
      const len = Math.hypot(dx, dy) || 1;
      const wnorm = Math.hypot(windDir, 1);
      const wx = windDir / wnorm;
      const wy = -1 / wnorm;
      const dot = dx / len * wx + dy / len * wy;
      eff *= 1 - windLean * dot;
    }
    const theta = Math.atan2(dy, dx);
    const petal = 1 + 0.16 * Math.sin(theta * 3 + noisePhase) + 0.11 * Math.sin(theta * 5 - noisePhase * 0.7 + 1.9) + 0.07 * Math.sin(theta * 7 + noisePhase * 1.3 + 4.1);
    eff *= Math.max(0.4, petal);
    return eff;
  };
  const regionTimeAt = (nx, ny, r) => r.t0 + spreadEffAt(nx, ny, r) / diag * wipe * kSpread * r.scale;
  regions.push(makeRegion(Math.random() * w, (0.55 + Math.random() * 0.35) * h, Math.random() * 50));
  if (Math.random() < 0.5) {
    regions.push(makeRegion(Math.random() * w, Math.random() * 0.4 * h, Math.random() * 50));
  }
  const tIgnite2 = wipe * (0.2 + Math.random() * 0.1);
  const tIgnite3 = wipe * (0.5 + Math.random() * 0.1);
  const placeFarthestRegion = (tAct) => {
    let bestX = w * 0.5;
    let bestY = h * 0.5;
    let bestScore = -1;
    for (let my = 0; my < mh; my++) {
      const ny = (my + 0.5) / maskScale;
      for (let mx = 0; mx < mw; mx++) {
        const nx = (mx + 0.5) / maskScale;
        let T = Infinity;
        for (const r of regions) {
          const ts = regionTimeAt(nx, ny, r);
          if (ts < T) T = ts;
        }
        const score = Math.max(0, T - tAct);
        if (score > bestScore) {
          bestScore = score;
          bestX = nx;
          bestY = ny;
        }
      }
    }
    regions.push(makeRegion(bestX, bestY, tAct));
  };
  placeFarthestRegion(tIgnite2);
  placeFarthestRegion(tIgnite3);
  const dissolveTimeAt = (nx, ny) => {
    let best = Infinity;
    for (const r of regions) {
      const ts = regionTimeAt(nx, ny, r);
      if (ts < best) best = ts;
    }
    let T = best + gentleNoise(nx, ny);
    if (T < 0) T = 0;
    else if (T > duration - featherMs) T = duration - featherMs;
    return T;
  };
  const Tfield = new Float32Array(mw * mh);
  for (let my = 0; my < mh; my++) {
    const ny = (my + 0.5) / maskScale;
    for (let mx = 0; mx < mw; mx++) {
      const nx = (mx + 0.5) / maskScale;
      Tfield[my * mw + mx] = dissolveTimeAt(nx, ny);
    }
  }
  if (remote) {
    lastTField = { tW: mw, tH: mh, data: Array.from(Tfield) };
  }
  const setMask = (url) => {
    root.style.setProperty("-webkit-mask-image", `url("${url}")`);
    root.style.setProperty("mask-image", `url("${url}")`);
    root.style.setProperty("-webkit-mask-size", "100% 100%");
    root.style.setProperty("mask-size", "100% 100%");
    root.style.setProperty("-webkit-mask-repeat", "no-repeat");
    root.style.setProperty("mask-repeat", "no-repeat");
  };
  const renderMask = (age) => {
    let p = 0;
    for (let i = 0; i < Tfield.length; i++) {
      const local = age - Tfield[i];
      let a = local / featherMs;
      if (a < 0) a = 0;
      else if (a > 1) a = 1;
      a = 1 - a;
      mpx32[p++] = (a * 255 & 255) << 24 | 16777215;
    }
    mctx.putImageData(mimg, 0, 0);
  };
  let lastMaskPush = -1;
  let maskSeq = 0;
  let lastAppliedSeq = 0;
  const pushMask = (age, force) => {
    if (age - lastMaskPush < 30) return;
    lastMaskPush = age;
    renderMask(age);
    const url = maskCanvas.toDataURL();
    const seq = ++maskSeq;
    const im = new Image();
    im.onload = () => {
      if (endedLocal || seq < lastAppliedSeq) return;
      lastAppliedSeq = seq;
      setMask(url);
    };
    im.onerror = () => {
    };
    im.src = url;
  };
  const emitSpacing = 3;
  const ecx = Math.max(2, Math.ceil(w / emitSpacing));
  const ecy = Math.max(2, Math.ceil(h / emitSpacing));
  const ecount = ecx * ecy;
  const emitX = new Float32Array(ecount);
  const emitY = new Float32Array(ecount);
  const emitT = new Float32Array(ecount);
  const emitDone = new Uint8Array(ecount);
  let ei = 0;
  let maxEmitT = 0;
  for (let iy = 0; iy < ecy; iy++) {
    for (let ix = 0; ix < ecx; ix++) {
      const nx = (ix + 0.5) * emitSpacing;
      const ny = (iy + 0.5) * emitSpacing;
      emitX[ei] = nx;
      emitY[ei] = ny;
      const T = dissolveTimeAt(nx, ny);
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
  const peakAlive = Math.round(ecount * (0.03 + 0.97 * density));
  const maxP = peakAlive + 1500;
  const px = new Float32Array(maxP);
  const py = new Float32Array(maxP);
  const pang = new Float32Array(maxP);
  const pv0 = new Float32Array(maxP);
  const pv1 = new Float32Array(maxP);
  const plife = new Float32Array(maxP);
  const page = new Float32Array(maxP);
  const psize = new Float32Array(maxP);
  const pseed = new Float32Array(maxP);
  const psway = new Float32Array(maxP);
  const pr = new Float32Array(maxP);
  const pg = new Float32Array(maxP);
  const pb = new Float32Array(maxP);
  const glData = new Float32Array(maxP * 7);
  let pcount = 0;
  const spawn = (x, y, age) => {
    if (pcount >= maxP) return;
    let life = Math.round((1800 + Math.random() * 1600) * k);
    const fit = duration - age - 40;
    if (fit < 120) return;
    if (life > fit) life = fit;
    const i = pcount++;
    px[i] = x;
    py[i] = y;
    pang[i] = (Math.random() - 0.5) * (110 * Math.PI / 180);
    pv0[i] = 20 + Math.random() * 15;
    pv1[i] = 150;
    plife[i] = life;
    page[i] = 0;
    psize[i] = 1.8;
    pseed[i] = Math.random() * Math.PI * 2;
    psway[i] = (Math.random() - 0.5) * 60;
    const [r, g, b] = sampleThemeColor(x, y);
    pr[i] = r / 255;
    pg[i] = g / 255;
    pb[i] = b / 255;
  };
  let rafId = 0;
  let backupId = 0;
  let start = 0;
  let started = false;
  let prevNow = 0;
  let lastPaint = 0;
  let endedLocal = false;
  let watchdog = 0;
  const stopLoop = () => {
    endedLocal = true;
    cancelAnimationFrame(rafId);
    if (backupId) {
      window.clearInterval(backupId);
      backupId = 0;
    }
    if (watchdog) {
      window.clearTimeout(watchdog);
      watchdog = 0;
    }
    loseGL();
  };
  function finishEarly() {
    stopLoop();
    blankRoot(root);
    onDone();
  }
  const cleanupAfterHide = () => {
    stopLoop();
    try {
      canvas?.remove();
    } catch {
    }
    if (myGen !== glowGen) return;
    blankRoot(root);
    glowActive = false;
  };
  const frame = (now) => {
    if (endedLocal) return;
    if (!started) {
      started = true;
      start = baseStartAt || Date.now();
      prevNow = now;
    }
    const dt = Math.min(0.05, Math.max(1e-3, (now - prevNow) / 1e3));
    prevNow = now;
    const age = Date.now() - start;
    pushMask(age);
    const fadeHalf = duration * 0.5;
    if (age > fadeHalf) {
      const p = Math.min(1, (age - fadeHalf) / fadeHalf);
      root.style.opacity = (1 - 0.5 * p).toFixed(3);
    }
    if (!remote) {
      const keepProb = Math.max(0.015, density);
      const b1 = Math.min(binCount - 1, Math.floor(age / binSize));
      for (let b = 0; b <= b1; b++) {
        const pts = binPts[b];
        for (let z = 0; z < pts.length; z++) {
          const idx = pts[z];
          if (emitDone[idx] === 0) {
            emitDone[idx] = 1;
            if (Math.random() < keepProb) spawn(emitX[idx], emitY[idx], age);
          }
        }
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const globalFade = age > duration - 200 ? Math.max(0, (duration - age) / 200) : 1;
      let drawCount = 0;
      for (let i = 0; i < pcount; i++) {
        const a = page[i] + dt * 1e3;
        page[i] = a;
        const life = plife[i];
        const u = a / life;
        if (u >= 1) {
          const last = --pcount;
          if (i !== last) {
            px[i] = px[last];
            py[i] = py[last];
            pang[i] = pang[last];
            pv0[i] = pv0[last];
            pv1[i] = pv1[last];
            plife[i] = plife[last];
            page[i] = page[last];
            psize[i] = psize[last];
            pseed[i] = pseed[last];
            psway[i] = psway[last];
            pr[i] = pr[last];
            pg[i] = pg[last];
            pb[i] = pb[last];
          }
          i--;
          continue;
        }
        const aSec = a / 1e3;
        const tLife = life / 1e3;
        const rise = 1 - Math.exp(-aSec / 0.3);
        const ease = 1 - 0.3 * Math.min(1, aSec / Math.max(0.6, tLife));
        const speed2 = (pv0[i] + pv1[i] * rise * ease) * (1 + 0.3 * Math.sin(a * 21e-4 + pseed[i] * 3));
        const dx = Math.sin(pang[i]);
        const dy = -Math.cos(pang[i]);
        const s1 = Math.sin(a * 25e-4 + pseed[i]) * 85;
        const s2 = Math.sin(a * 9e-3 + pseed[i] * 2.3) * 55;
        const s3 = Math.sin(a * 0.024 + pseed[i] * 4.1) * 20;
        const swayX = psway[i] + s1 + s2 + s3 + windPx;
        const bobY = Math.sin(a * 62e-4 + pseed[i] * 1.7) * 55 * (0.35 + 0.65 * rise);
        px[i] += (dx * speed2 + swayX) * dt;
        py[i] += (dy * speed2 + bobY) * dt;
        const t = 1 - u;
        const twinkle = 0.8 + 0.2 * Math.sin(a * 0.02 + pseed[i] * 5);
        const alpha = t * Math.pow(t, 0.2) * globalFade * twinkle;
        if (alpha < 0.02) continue;
        const pulse = 1 + 0.22 * Math.sin(a * 7e-3 + pseed[i] * 2);
        const haloR = psize[i] * pulse * 1.3;
        const o = drawCount * 7;
        glData[o] = px[i] * dpr;
        glData[o + 1] = py[i] * dpr;
        glData[o + 2] = haloR * 2 * dpr;
        glData[o + 3] = alpha;
        glData[o + 4] = pr[i];
        glData[o + 5] = pg[i];
        glData[o + 6] = pb[i];
        drawCount++;
      }
      if (drawCount > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
        gl.bufferData(gl.ARRAY_BUFFER, glData.subarray(0, drawCount * 7), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 28, 0);
        gl.enableVertexAttribArray(aParamLoc);
        gl.vertexAttribPointer(aParamLoc, 2, gl.FLOAT, false, 28, 8);
        gl.enableVertexAttribArray(aColorLoc);
        gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 28, 16);
        gl.drawArrays(gl.POINTS, 0, drawCount);
      }
    }
    if (age >= duration) {
      gl?.clearColor(0, 0, 0, 0);
      gl?.clear(gl.COLOR_BUFFER_BIT);
      stopLoop();
      try {
        onDone();
      } finally {
        window.setTimeout(cleanupAfterHide, 400);
      }
    }
  };
  const step = (now) => {
    lastPaint = now;
    frame(now);
    if (!endedLocal) rafId = requestAnimationFrame(step);
  };
  const beginLoop = () => {
    if (endedLocal) return;
    renderMask(0);
    setMask(maskCanvas.toDataURL());
    try {
      root.style.clipPath = "";
      root.style.boxShadow = "none";
      root.style.opacity = "";
    } catch {
    }
    rafId = requestAnimationFrame(step);
    backupId = window.setInterval(() => {
      if (endedLocal) return;
      const now = performance.now();
      if (now - lastPaint > 60) {
        lastPaint = now;
        frame(now);
      }
    }, 40);
    watchdog = window.setTimeout(() => {
      if (endedLocal) return;
      stopLoop();
      cleanupAfterHide();
      onDone();
    }, duration + 600);
  };
  buildColorField(root, w, h).then((f) => {
    if (endedLocal) return;
    field = f;
    beginLoop();
  });
  return () => {
    stopLoop();
    restoreRoot(root);
    try {
      canvas?.remove();
    } catch {
    }
  };
}
export {
  buildColorField,
  bumpGlowGen,
  cancelGlowParticles,
  requestGlowDissolveClose
};
