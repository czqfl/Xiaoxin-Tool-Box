let flaming = false;
let materializing = false;
let flameGen = 0;
let cancelFlameFn = null;
function cancelFlame() {
  const c = cancelFlameFn;
  cancelFlameFn = null;
  if (c) {
    c();
    return;
  }
  if (!flaming && !materializing) return;
  flaming = false;
  materializing = false;
  const root = document.querySelector(".note-window");
  if (root) restoreRoot(root);
  document.querySelectorAll(".flame-canvas").forEach((el) => el.remove());
}
function restoreRoot(root) {
  try {
    root.style.setProperty("-webkit-mask-image", "");
    root.style.setProperty("mask-image", "");
    root.style.clipPath = "";
    root.style.opacity = "";
    root.style.boxShadow = "";
  } catch {
  }
}
function blankRoot(root) {
  try {
    root.style.setProperty("-webkit-mask-image", "");
    root.style.setProperty("mask-image", "");
    root.style.clipPath = "inset(0 0 100% 0)";
    root.style.opacity = "";
    root.style.boxShadow = "none";
  } catch {
  }
}
function requestFlameDissolveClose(onDone, particleDensity = 50, speed = 100) {
  const root = document.querySelector(".note-window");
  if (!root || flaming) {
    onDone();
    return;
  }
  flaming = true;
  let done = false;
  let aborted = false;
  let stopRun = null;
  const safeDone = () => {
    if (done) return;
    done = true;
    flaming = false;
    cancelFlameFn = null;
    onDone();
  };
  const watchdog = window.setTimeout(safeDone, Math.round(4e3 * Math.max(0.25, Math.min(4, 100 / Math.max(10, speed)))));
  cancelFlameFn = () => {
    if (aborted) return;
    aborted = true;
    window.clearTimeout(watchdog);
    if (stopRun) stopRun();
    done = true;
    flaming = false;
  };
  try {
    stopRun = runFlame(root, "dissolve", particleDensity, speed, () => {
      window.clearTimeout(watchdog);
      safeDone();
    });
  } catch (e) {
    console.error("火焰消散动画异常:", e);
    window.clearTimeout(watchdog);
    safeDone();
  }
}
function playFlameMaterialize(root, particleDensity = 50, speed = 100) {
  if (materializing || flaming) cancelFlame();
  materializing = true;
  let aborted = false;
  let stopRun = null;
  cancelFlameFn = () => {
    if (aborted) return;
    aborted = true;
    if (stopRun) stopRun();
    materializing = false;
  };
  try {
    stopRun = runFlame(root, "materialize", particleDensity, speed, () => {
    });
  } catch (e) {
    console.error("火焰成形动画异常:", e);
    cancelFlameFn = null;
    materializing = false;
    restoreRoot(root);
  }
}
function hash2(ix, iy) {
  let n = ix * 374761393 + iy * 668265263 | 0;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  n = n ^ n >>> 16;
  return (n >>> 0) / 4294967295;
}
function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += (valueNoise(x * freq, y * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
function runFlame(root, direction, particleDensity, speed, onDone) {
  const myGen = ++flameGen;
  const isDissolve = direction === "dissolve";
  const k = Math.max(0.25, Math.min(4, 100 / Math.max(10, speed)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const wipe = Math.round(1e3 * k);
  const featherMs = Math.round(90 * k);
  const tailMs = Math.round((isDissolve ? 520 : 160) * k);
  const duration = wipe + tailMs;
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
  const img = mctx.createImageData(mw, mh);
  const px32 = new Uint32Array(img.data.buffer);
  const noiseAmp = 200;
  const jitterAmp = 42;
  const leadIn = noiseAmp + jitterAmp + 8;
  const baseMax = wipe - featherMs - leadIn;
  const noiseScale = 1 / 42;
  const seedCount = 2 + Math.floor(Math.random() * 2);
  const seeds = [];
  for (let i = 0; i < seedCount; i++) {
    const rx = (0.22 + Math.random() * 0.3) * w;
    const ry = (0.22 + Math.random() * 0.35) * h;
    seeds.push({
      x: (0.15 + Math.random() * 0.7) * w,
      y: (0.12 + Math.random() * 0.76) * h,
      // 全屏随机（避开极边缘）
      invRx: 1 / rx,
      invRy: 1 / ry
    });
  }
  const seedSpan = wipe * 0.5;
  const dissolveTimeAt = (nx, ny) => {
    let base = leadIn + (h - ny) / h * (baseMax - leadIn);
    for (let i = 0; i < seedCount; i++) {
      const s = seeds[i];
      const dx = (nx - s.x) * s.invRx;
      const dy = (ny - s.y) * s.invRy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const t = d * seedSpan;
      if (t < base) base = t;
    }
    const n = fbm(nx * noiseScale, ny * noiseScale) * noiseAmp;
    const j = (hash2(Math.round(nx), Math.round(ny)) * 2 - 1) * jitterAmp;
    let T = base + n + j;
    if (T < 0) T = 0;
    else if (T > baseMax + noiseAmp + jitterAmp) T = baseMax + noiseAmp + jitterAmp;
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
  const density = Math.max(0, Math.min(100, particleDensity)) / 100;
  const canvas = document.createElement("canvas");
  canvas.className = "flame-canvas";
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.zIndex = "2147483646";
  canvas.style.pointerEvents = "none";
  canvas.style.transform = "translateZ(0)";
  document.body.appendChild(canvas);
  const fctx2 = canvas.getContext("2d");
  const fireW = 192;
  const fireH = Math.max(24, Math.round(h / w * fireW));
  const fireCanvas = document.createElement("canvas");
  fireCanvas.width = fireW;
  fireCanvas.height = fireH;
  const fireCtx = fireCanvas.getContext("2d");
  const fireImg = fireCtx ? fireCtx.createImageData(fireW, fireH) : null;
  const firePx = fireImg ? new Uint32Array(fireImg.data.buffer) : null;
  const fireBufA = new Uint8Array(fireW * fireH);
  const fireBufB = new Uint8Array(fireW * fireH);
  const paletteR = new Uint8Array(256);
  const paletteG = new Uint8Array(256);
  const paletteB = new Uint8Array(256);
  {
    const stops = [
      [0, 25, 7, 3],
      // 0：暗红（余烬）
      [55, 230, 55, 10],
      // 55：红
      [115, 235, 120, 28],
      // 115：橙
      [185, 240, 178, 80],
      // 185：亮黄橙
      [235, 248, 230, 180],
      // 235：白黄
      [255, 250, 240, 215]
      // 255：白热（非纯白，避免过曝）
    ];
    for (let s = 0; s < stops.length - 1; s++) {
      const [v0, r0, g0, b0] = stops[s];
      const [v1, r1, g1, b1] = stops[s + 1];
      for (let v = v0; v <= v1 && v < 256; v++) {
        const k2 = (v - v0) / Math.max(1, v1 - v0);
        paletteR[v] = Math.round(r0 + (r1 - r0) * k2);
        paletteG[v] = Math.round(g0 + (g1 - g0) * k2);
        paletteB[v] = Math.round(b0 + (b1 - b0) * k2);
      }
    }
  }
  const colMap = new Int16Array(fireW);
  for (let fx = 0; fx < fireW; fx++) {
    colMap[fx] = Math.min(mw - 1, Math.max(0, Math.round(fx / fireW * (mw - 1))));
  }
  const updateFlameField = (age) => {
    if (!fireImg || !firePx || !fireCtx || !fctx2) return;
    const progress = Math.min(1, age / wipe);
    const flameH = (25 + 75 * progress) * (0.6 + 0.4 * density);
    const flameRows = Math.max(3, Math.round(flameH / h * fireH));
    const injectHeat = 190 + 15 * density;
    const src = fireBufA;
    const dst = fireBufB;
    dst.fill(0);
    const rows = mh;
    const decay = 0.88;
    for (let y = 0; y < fireH; y++) {
      const row = y * fireW;
      for (let x = 0; x < fireW; x++) {
        const v = src[row + x];
        if (v < 2) continue;
        const l = x > 0 ? src[row + x - 1] : v;
        const r = x < fireW - 1 ? src[row + x + 1] : v;
        let d = (l + v * 2 + r) * 0.25 * decay;
        if (d < 2) continue;
        d -= Math.random() < 0.5 ? 0 : 1;
        if (d < 2) continue;
        const wind = (Math.random() * 3 | 0) - 1;
        if (y > 0) {
          const nx = x + wind;
          if (nx >= 0 && nx < fireW) {
            const idx = (y - 1) * fireW + nx;
            if (d > dst[idx]) dst[idx] = d > 255 ? 255 : d;
          }
        }
        if (y < fireH - 1) {
          const nx = x + wind;
          if (nx >= 0 && nx < fireW) {
            const idx = (y + 1) * fireW + nx;
            if (d > dst[idx]) dst[idx] = d > 255 ? 255 : d;
          }
        }
      }
    }
    for (let fx = 0; fx < fireW; fx++) {
      const mx = colMap[fx];
      const n = frontCount[mx];
      if (n === 0) continue;
      const cluster = 0.82 + 0.13 * Math.sin(fx * 0.35 + age * 4e-4) + 0.1 * Math.sin(fx * 0.9 - age * 7e-4 + 2);
      const heat = Math.max(50, Math.min(220, Math.round(injectHeat * cluster * (0.65 + Math.random() * 0.35))));
      for (let k2 = 0; k2 < n; k2++) {
        const fRow = frontList[mx * 4 + k2] / 2;
        const fy = Math.round(fRow / rows * fireH);
        if (fy < 0 || fy >= fireH) continue;
        const idx = fy * fireW + fx;
        dst[idx] = Math.max(dst[idx], heat);
        if (fx > 0) dst[idx - 1] = Math.max(dst[idx - 1], Math.round(heat * 0.7));
        if (fx < fireW - 1) dst[idx + 1] = Math.max(dst[idx + 1], Math.round(heat * 0.7));
      }
    }
    const keepMin = new Int16Array(fireW);
    const keepMax = new Int16Array(fireW);
    keepMin.fill(-1);
    keepMax.fill(-1);
    for (let fx = 0; fx < fireW; fx++) {
      const mx = colMap[fx];
      const n = frontCount[mx];
      if (n === 0) continue;
      let lo = fireH, hi = 0;
      for (let k2 = 0; k2 < n; k2++) {
        const fRow = frontList[mx * 4 + k2] / 2;
        const fy = Math.round(fRow / rows * fireH);
        lo = Math.min(lo, Math.max(0, fy - flameRows));
        hi = Math.max(hi, Math.min(fireH - 1, fy + flameRows));
      }
      keepMin[fx] = lo;
      keepMax[fx] = hi;
    }
    for (let x = 0; x < fireW; x++) {
      const lo = keepMin[x];
      if (lo < 0) {
        for (let y = 0; y < fireH; y++) dst[y * fireW + x] = 0;
        continue;
      }
      const hi = keepMax[x];
      for (let y = 0; y < lo; y++) dst[y * fireW + x] = 0;
      for (let y = hi + 1; y < fireH; y++) dst[y * fireW + x] = 0;
    }
    let p = 0;
    for (let i = 0; i < fireW * fireH; i++) {
      const v = dst[i];
      if (v < 12) {
        firePx[p++] = 0;
      } else {
        const alpha = Math.min(255, 55 + v * 0.5);
        firePx[p++] = alpha << 24 | paletteB[v] << 16 | paletteG[v] << 8 | paletteR[v];
      }
    }
    fireCtx.putImageData(fireImg, 0, 0);
    fctx2.imageSmoothingEnabled = true;
    fctx2.clearRect(0, 0, w, h);
    fctx2.drawImage(fireCanvas, 0, 0, w, h);
    fireBufA.set(dst);
  };
  const sparkCanvas = document.createElement("canvas");
  sparkCanvas.className = "flame-canvas";
  sparkCanvas.width = canvas.width;
  sparkCanvas.height = canvas.height;
  sparkCanvas.style.position = "fixed";
  sparkCanvas.style.left = "0";
  sparkCanvas.style.top = "0";
  sparkCanvas.style.width = "100%";
  sparkCanvas.style.height = "100%";
  sparkCanvas.style.zIndex = "2147483647";
  sparkCanvas.style.pointerEvents = "none";
  sparkCanvas.style.transform = "translateZ(0)";
  document.body.appendChild(sparkCanvas);
  const sctx = sparkCanvas.getContext("2d");
  const MAX_SPARKS = 260;
  const spx = new Float32Array(MAX_SPARKS);
  const spy = new Float32Array(MAX_SPARKS);
  const spvx = new Float32Array(MAX_SPARKS);
  const spvy = new Float32Array(MAX_SPARKS);
  const spLife = new Float32Array(MAX_SPARKS);
  const spAge = new Float32Array(MAX_SPARKS);
  const spSize = new Float32Array(MAX_SPARKS);
  const spHue = new Float32Array(MAX_SPARKS);
  let sparkCount = 0;
  const makeSparkSprite = (r1, g1, b1) => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const cx = c.getContext("2d");
    if (cx) {
      const g = cx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, `rgba(${Math.min(255, r1 + 60)},${Math.min(255, g1 + 50)},${Math.min(255, b1 + 30)},1)`);
      g.addColorStop(0.4, `rgba(${r1},${g1},${b1},0.9)`);
      g.addColorStop(1, `rgba(${Math.max(0, r1 - 60)},${Math.max(0, g1 - 50)},${Math.max(0, b1 - 40)},0)`);
      cx.fillStyle = g;
      cx.fillRect(0, 0, 16, 16);
    }
    return c;
  };
  const sparkSpriteHot = makeSparkSprite(255, 235, 180);
  const sparkSpriteWarm = makeSparkSprite(255, 175, 70);
  const sparkSpriteDim = makeSparkSprite(230, 110, 40);
  const sparkSprites = [sparkSpriteHot, sparkSpriteWarm, sparkSpriteDim];
  const spawnSparks = (age) => {
    if (!sctx || !isDissolve) return;
    const remain = 1 - Math.min(1, age / wipe);
    if (remain <= 0) return;
    const cols = mw;
    const rows = mh;
    const chance = 0.07 * density * (0.4 + 0.6 * remain);
    for (let x = 0; x < cols; x++) {
      if (Math.random() > chance) continue;
      const f = frontArr[x];
      if (f < 0) continue;
      if (sparkCount >= MAX_SPARKS) break;
      const i = sparkCount++;
      const px = (x + Math.random()) / cols * w;
      const py = (f + (Math.random() - 0.5) * 1.5) / rows * h;
      spx[i] = px;
      spy[i] = py;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const spd = 60 + Math.random() * 140;
      spvx[i] = Math.cos(ang) * spd;
      spvy[i] = Math.sin(ang) * spd;
      spLife[i] = 500 + Math.random() * 1200;
      spAge[i] = 0;
      spSize[i] = 0.9 + Math.random() * 1.3;
      spHue[i] = Math.random();
    }
  };
  const updateSparks = (dtMs) => {
    if (!sctx) return;
    sctx.clearRect(0, 0, w, h);
    sctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < sparkCount; i++) {
      spAge[i] += dtMs;
      const u = spAge[i] / spLife[i];
      if (u >= 1) {
        const last = --sparkCount;
        if (i !== last) {
          spx[i] = spx[last];
          spy[i] = spy[last];
          spvx[i] = spvx[last];
          spvy[i] = spvy[last];
          spLife[i] = spLife[last];
          spAge[i] = spAge[last];
          spSize[i] = spSize[last];
          spHue[i] = spHue[last];
        }
        i--;
        continue;
      }
      spx[i] += spvx[i] * (dtMs / 1e3);
      spy[i] += spvy[i] * (dtMs / 1e3);
      spvy[i] += 60 * (dtMs / 1e3);
      const fade = 1 - u;
      const alpha = fade * fade * 0.95;
      if (alpha < 0.02) continue;
      const h2 = spHue[i];
      const heat = 1 - u;
      let si;
      const cold = h2 * (1 - heat * 0.85);
      if (cold < 0.33) si = 0;
      else if (cold < 0.66) si = 1;
      else si = 2;
      sctx.globalAlpha = alpha;
      sctx.globalCompositeOperation = "lighter";
      const r = spSize[i] * (1 + 0.6 * u) * 1.8;
      sctx.drawImage(sparkSprites[si], spx[i] - r / 2, spy[i] - r / 2, r, r);
    }
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = "source-over";
  };
  const frontArr = new Float32Array(mw);
  const frontList = new Int16Array(mw * 4);
  const frontCount = new Uint8Array(mw);
  const burnArr = new Float32Array(mw);
  const computeFlameField = () => {
    const cols = mw, rows = mh;
    for (let x = 0; x < cols; x++) {
      let f = -1;
      let n = 0;
      let prev = (px32[x] >>> 24 & 255) / 255;
      let burned = 0;
      for (let y = 0; y < rows; y++) {
        const cur = (px32[x + y * cols] >>> 24 & 255) / 255;
        if (cur < 0.5) burned++;
        if ((prev - 0.5) * (cur - 0.5) < 0 && prev !== cur) {
          const cross = y - 1 + (0.5 - prev) / (cur - prev);
          if (n < 4) frontList[x * 4 + n] = Math.round(cross * 2);
          n++;
          if (f < 0) f = cross;
        }
        prev = cur;
      }
      frontArr[x] = f;
      frontCount[x] = n;
      burnArr[x] = burned / rows;
    }
  };
  if (isDissolve) {
    try {
      root.style.clipPath = "";
    } catch {
    }
  }
  root.style.boxShadow = "none";
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
      let T = Tfield[i];
      if (!isDissolve) T = wipe - T;
      const local = age - T;
      let a = local / featherMs;
      if (a < 0) a = 0;
      else if (a > 1) a = 1;
      if (isDissolve) a = 1 - a;
      const alphaByte = a * 255 & 255;
      px32[p++] = alphaByte << 24 | 16777215;
    }
    mctx.putImageData(img, 0, 0);
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
    const apply = () => {
      if (endedLocal || seq < lastAppliedSeq) return;
      lastAppliedSeq = seq;
      setMask(url);
    };
    im.onload = apply;
    im.onerror = () => {
      if (endedLocal || isDissolve || seq < lastAppliedSeq) return;
      lastAppliedSeq = seq;
      try {
        root.style.opacity = "1";
        root.style.setProperty("-webkit-mask-image", "");
        root.style.setProperty("mask-image", "");
      } catch {
      }
    };
    im.src = url;
  };
  const applyOpacity = (age) => {
    const fadeSpan = isDissolve ? duration : wipe;
    let p = age / fadeSpan;
    if (p < 0) p = 0;
    else if (p > 1) p = 1;
    const o = isDissolve ? 1 - p * 0.7 : p;
    root.style.opacity = o.toFixed(3);
  };
  let rafId = 0;
  let backupId = 0;
  let start = 0;
  let started = false;
  let prevFrameNow = 0;
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
  };
  function finishEarly() {
    stopLoop();
    try {
      sparkCanvas.remove();
    } catch {
    }
    if (isDissolve) {
      blankRoot(root);
      onDone();
    } else {
      restoreRoot(root);
      materializing = false;
      onDone();
    }
  }
  const cleanupAfterHide = () => {
    if (myGen !== flameGen) return;
    stopLoop();
    blankRoot(root);
    try {
      canvas.remove();
      sparkCanvas.remove();
    } catch {
    }
    flaming = false;
  };
  const finishMaterialize = () => {
    stopLoop();
    if (myGen !== flameGen) return;
    materializing = false;
    requestAnimationFrame(() => {
      if (myGen !== flameGen) return;
      try {
        canvas.remove();
        sparkCanvas.remove();
      } catch {
      }
      restoreRoot(root);
    });
  };
  const frame = (now) => {
    if (endedLocal) return;
    if (!started) {
      started = true;
      start = now;
      prevFrameNow = now;
    }
    const age = now - start;
    const dtMs = Math.min(50, Math.max(0, now - prevFrameNow));
    prevFrameNow = now;
    pushMask(age);
    applyOpacity(age);
    spawnSparks(age);
    updateSparks(dtMs);
    computeFlameField();
    updateFlameField(age);
    if (age >= duration) {
      if (isDissolve) {
        stopLoop();
        try {
          onDone();
        } finally {
          window.setTimeout(cleanupAfterHide, 400);
        }
      } else {
        window.clearInterval(backupId);
        finishMaterialize();
        onDone();
      }
      return;
    }
  };
  const step = (now) => {
    lastPaint = now;
    frame(now);
    if (!endedLocal) rafId = requestAnimationFrame(step);
  };
  renderMask(0);
  setMask(maskCanvas.toDataURL());
  if (isDissolve) {
    try {
      root.style.clipPath = "";
    } catch {
    }
  } else {
    try {
      root.style.clipPath = "";
    } catch {
    }
    root.style.opacity = "0";
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
    if (isDissolve) {
      cleanupAfterHide();
      onDone();
    } else {
      finishMaterialize();
      onDone();
    }
  }, duration + Math.round(600 * k));
  return () => {
    stopLoop();
    restoreRoot(root);
    try {
      canvas.remove();
      sparkCanvas.remove();
    } catch {
    }
  };
}
export {
  cancelFlame,
  playFlameMaterialize,
  requestFlameDissolveClose
};
