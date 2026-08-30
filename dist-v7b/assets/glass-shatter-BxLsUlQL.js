let glassActive = false;
let glassGen = 0;
let cancelGlassFn = null;
function cancelGlassShards() {
  const c = cancelGlassFn;
  cancelGlassFn = null;
  if (c) {
    c();
    return;
  }
  if (!glassActive) return;
  glassActive = false;
  const root = document.querySelector(".note-window");
  if (root) restoreRoot(root);
  document.querySelectorAll(".glass-canvas").forEach((el) => el.remove());
}
function bumpGlassGen() {
  glassGen++;
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
function restoreGlassSummoned() {
  bumpGlassGen();
  const root = document.querySelector(".note-window");
  if (root) restoreRoot(root);
  document.querySelectorAll(".glass-canvas").forEach((el) => el.remove());
}
function requestGlassShardsClose(onDone, particleDensity = 50, speed = 100) {
  const root = document.querySelector(".note-window");
  if (!root || glassActive) {
    onDone();
    return;
  }
  glassActive = true;
  let done = false;
  let aborted = false;
  let stopRun = null;
  const safeDone = () => {
    if (done) return;
    done = true;
    glassActive = false;
    cancelGlassFn = null;
    onDone();
  };
  const watchdog = window.setTimeout(safeDone, Math.round(4e3 * Math.max(0.25, Math.min(4, 100 / Math.max(10, speed)))));
  cancelGlassFn = () => {
    if (aborted) return;
    aborted = true;
    window.clearTimeout(watchdog);
    if (stopRun) stopRun();
    done = true;
    glassActive = false;
  };
  try {
    stopRun = runGlass(root, particleDensity, speed, () => {
      window.clearTimeout(watchdog);
      safeDone();
    });
  } catch (e) {
    console.error("玻璃碎裂动画异常:", e);
    window.clearTimeout(watchdog);
    safeDone();
  }
}
function buildBgTexture(root, w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(8, Math.round(w));
  c.height = Math.max(8, Math.round(h));
  const ctx2 = c.getContext("2d");
  if (!ctx2) return Promise.resolve(null);
  const cs = getComputedStyle(root);
  const bgColor = cs.backgroundColor || "rgb(128,128,128)";
  let panelAlpha = parseFloat(cs.getPropertyValue("--note-panel-alpha"));
  if (!isFinite(panelAlpha) || panelAlpha <= 0 || panelAlpha > 1) panelAlpha = 0.7;
  const m = cs.getPropertyValue("--note-bg-img").match(/url\((['"]?)([\s\S]*?)\1\)/);
  const dataUrl = m ? m[2] : "";
  const fillSolid = () => {
    ctx2.fillStyle = bgColor;
    ctx2.fillRect(0, 0, w, h);
  };
  if (!dataUrl) {
    fillSolid();
    return Promise.resolve(c);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (img2) => {
      if (settled) return;
      settled = true;
      if (img2 && img2.naturalWidth > 0) {
        const iw = img2.naturalWidth, ih = img2.naturalHeight;
        const ir = iw / ih, fr = w / h;
        let dw, dh, dx, dy;
        if (ir > fr) {
          dh = h;
          dw = h * ir;
          dx = (w - dw) / 2;
          dy = 0;
        } else {
          dw = w;
          dh = w / ir;
          dx = 0;
          dy = (h - dh) / 2;
        }
        ctx2.fillStyle = bgColor;
        ctx2.fillRect(0, 0, w, h);
        ctx2.drawImage(img2, dx, dy, dw, dh);
        ctx2.globalAlpha = panelAlpha * 0.15;
        ctx2.fillStyle = bgColor;
        ctx2.fillRect(0, 0, w, h);
        ctx2.globalAlpha = 1;
      } else {
        fillSolid();
      }
      resolve(c);
    };
    const img = new Image();
    const timer = window.setTimeout(() => finish(null), 140);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    img.src = dataUrl;
  });
}
function runGlass(root, particleDensity, speed, onDone) {
  const myGen = ++glassGen;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const k = Math.max(0.25, Math.min(4, 100 / Math.max(10, speed)));
  const density = Math.max(0, Math.min(100, particleDensity)) / 100;
  const halfDiag = Math.hypot(w, h) * 0.5;
  const impactMs = Math.round(150 * k);
  const wipe = Math.round(1250 * k);
  const duration = wipe + Math.round(260 * k);
  const canvas = document.createElement("canvas");
  canvas.className = "glass-canvas";
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
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    finishEarly();
    return () => {
    };
  }
  ctx.scale(dpr, dpr);
  let bgTex = null;
  const px = w * (0.25 + Math.random() * 0.5);
  const py = h * (0.25 + Math.random() * 0.5);
  const mainCount = 7 + Math.round(density * 5);
  const anchorCount = 3 + Math.floor(Math.random() * 2);
  const anchors = [];
  for (let g = 0; g < anchorCount; g++) anchors.push(Math.random() * Math.PI * 2);
  const mainPolys = [];
  const allPolyPoints = [];
  const dirArr = [];
  const tMaxArr = [];
  const lenArr = [];
  for (let i = 0; i < mainCount; i++) {
    const th = anchors[Math.floor(Math.random() * anchorCount)] + (Math.random() - 0.5) * 0.95;
    const dirx = Math.cos(th), diry = Math.sin(th);
    let tMax = Infinity;
    if (dirx > 1e-4) tMax = Math.min(tMax, (w - px) / dirx);
    else if (dirx < -1e-4) tMax = Math.min(tMax, -px / dirx);
    if (diry > 1e-4) tMax = Math.min(tMax, (h - py) / diry);
    else if (diry < -1e-4) tMax = Math.min(tMax, -py / diry);
    const len = tMax * (0.45 + Math.random() * 0.55);
    const segN = 2 + Math.floor(Math.random() * 3);
    const jamp = Math.min(7, len * 0.08);
    const pts = [];
    for (let s = 0; s <= segN; s++) {
      const t = s / segN;
      const jx = s > 0 && s < segN ? (Math.random() - 0.5) * jamp : 0;
      pts.push({
        x: px + dirx * len * t + -diry * jx,
        y: py + diry * len * t + dirx * jx
      });
    }
    mainPolys.push({ pts, wMul: 1, aMul: 1 });
    allPolyPoints.push(...pts);
    dirArr.push({ x: dirx, y: diry });
    tMaxArr.push(tMax);
    lenArr.push(len);
  }
  const branchPolys = [];
  const pointOnPoly = (poly, t) => {
    const n = poly.pts.length - 1;
    const f = t * n;
    const i0 = Math.min(n - 1, Math.floor(f));
    const a = poly.pts[i0], b = poly.pts[i0 + 1];
    const u = f - i0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const totalBranchLen = (poly) => {
    let L = 0;
    for (let s = 0; s < poly.pts.length - 1; s++) L += Math.hypot(poly.pts[s + 1].x - poly.pts[s].x, poly.pts[s + 1].y - poly.pts[s].y);
    return L;
  };
  for (let i = 0; i < mainCount; i++) {
    const poly = mainPolys[i];
    const parentLen = totalBranchLen(poly);
    const th = Math.atan2(poly.pts[poly.pts.length - 1].y - poly.pts[0].y, poly.pts[poly.pts.length - 1].x - poly.pts[0].x);
    const nb = Math.random() < 0.75 ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let b = 0; b < nb; b++) {
      const t0 = 0.15 + Math.random() * 0.55;
      const base = pointOnPoly(poly, t0);
      const sign = Math.random() < 0.5 ? -1 : 1;
      const bAng = th + sign * (0.5 + Math.random() * 0.75);
      const bLen = parentLen * (0.2 + Math.random() * 0.3);
      const bSegN = 2;
      const bPts = [];
      const bjamp = Math.min(5, bLen * 0.1);
      for (let s = 0; s <= bSegN; s++) {
        const t = s / bSegN;
        const jx = s > 0 && s < bSegN ? (Math.random() - 0.5) * bjamp : 0;
        bPts.push({
          x: base.x + Math.cos(bAng) * bLen * t + -Math.sin(bAng) * jx,
          y: base.y + Math.sin(bAng) * bLen * t + Math.cos(bAng) * jx
        });
      }
      branchPolys.push({ pts: bPts, wMul: 0.6, aMul: 0.85 });
      allPolyPoints.push(...bPts);
      if (Math.random() < 0.3 && bLen > 26) {
        const c0 = 0.5;
        const cbase = pointOnPoly({ pts: bPts }, c0);
        const cAng = bAng + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
        const cLen = bLen * (0.4 + Math.random() * 0.25);
        const cPts = [
          { x: cbase.x, y: cbase.y },
          { x: cbase.x + Math.cos(cAng) * cLen * 0.6 + -Math.sin(cAng) * (Math.random() - 0.5) * 3, y: cbase.y + Math.sin(cAng) * cLen * 0.6 + Math.cos(cAng) * (Math.random() - 0.5) * 3 },
          { x: cbase.x + Math.cos(cAng) * cLen, y: cbase.y + Math.sin(cAng) * cLen }
        ];
        branchPolys.push({ pts: cPts, wMul: 0.4, aMul: 0.7 });
        allPolyPoints.push(...cPts);
      }
    }
  }
  const R = 2 + (Math.random() < 0.4 ? 1 : 0);
  const fR = [];
  for (let kk = 0; kk < R; kk++) fR.push(0.22 + Math.random() * 0.5);
  fR.sort((a, b) => a - b);
  const ringPolys = [];
  for (let kk = 0; kk < R; kk++) {
    const pts = [];
    for (let i = 0; i < mainCount; i++) {
      const rr = tMaxArr[i] * fR[kk] + (Math.random() - 0.5) * Math.min(8, tMaxArr[i] * 0.05);
      pts.push({ x: px + dirArr[i].x * rr, y: py + dirArr[i].y * rr });
    }
    pts.push({ ...pts[0] });
    ringPolys.push({ pts, wMul: 1, aMul: 1 });
    allPolyPoints.push(...pts);
  }
  const secondImp = Math.random() < 0.3;
  const p2 = secondImp ? { x: px + (Math.random() - 0.5) * w * 0.6, y: py + (Math.random() - 0.5) * h * 0.6 } : null;
  if (p2) {
    const secN = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < secN; i++) {
      const th = Math.random() * Math.PI * 2;
      const dx2 = Math.cos(th), dy2 = Math.sin(th);
      let tM = Infinity;
      if (dx2 > 1e-4) tM = Math.min(tM, (w - p2.x) / dx2);
      else if (dx2 < -1e-4) tM = Math.min(tM, -p2.x / dx2);
      if (dy2 > 1e-4) tM = Math.min(tM, (h - p2.y) / dy2);
      else if (dy2 < -1e-4) tM = Math.min(tM, -p2.y / dy2);
      const L = tM * (0.25 + Math.random() * 0.3);
      const pts = [
        { x: p2.x, y: p2.y },
        { x: p2.x + dx2 * L * 0.6 + -dy2 * (Math.random() - 0.5) * 4, y: p2.y + dy2 * L * 0.6 + dx2 * (Math.random() - 0.5) * 4 },
        { x: p2.x + dx2 * L, y: p2.y + dy2 * L }
      ];
      branchPolys.push({ pts, wMul: 0.5, aMul: 0.75 });
      allPolyPoints.push(...pts);
    }
  }
  const segs = [];
  const pushPolySegs = (poly, taper, dashProb) => {
    const n = poly.pts.length - 1;
    for (let s = 0; s < n; s++) {
      if (dashProb > 0 && Math.random() < dashProb) continue;
      const t = n > 1 ? s / (n - 1) : 0;
      const w2 = (taper ? 1.9 - 1.15 * t : 1.35) * poly.wMul * (0.8 + Math.random() * 0.45);
      const alpha = Math.min(0.72, (taper ? 0.62 - 0.36 * t : 0.42) * poly.aMul * (0.75 + Math.random() * 0.5));
      segs.push({ x1: poly.pts[s].x, y1: poly.pts[s].y, x2: poly.pts[s + 1].x, y2: poly.pts[s + 1].y, w: w2, alpha });
    }
  };
  for (const poly of mainPolys) pushPolySegs(poly, true, 0);
  for (const poly of branchPolys) pushPolySegs(poly, true, 0.12);
  for (const poly of ringPolys) pushPolySegs(poly, false, 0.28);
  const allPts = [{ x: px, y: py }];
  for (let kk = 0; kk < R; kk++) {
    const row = [];
    for (let i = 0; i < mainCount; i++) {
      const rr = tMaxArr[i] * fR[kk] + (Math.random() - 0.5) * Math.min(8, tMaxArr[i] * 0.05);
      row.push({ x: px + dirArr[i].x * rr, y: py + dirArr[i].y * rr });
    }
    allPts.push(...row);
  }
  const boundStart = allPts.length;
  for (let i = 0; i < mainCount; i++) {
    allPts.push({ x: px + dirArr[i].x * tMaxArr[i], y: py + dirArr[i].y * tMaxArr[i] });
  }
  const ringIdx = (kk, i) => 1 + kk * mainCount + i % mainCount;
  const boundIdx = (i) => boundStart + i % mainCount;
  const cells = [];
  const mkCell = (idx) => {
    let cx = 0, cy = 0;
    for (const ii of idx) {
      cx += allPts[ii].x;
      cy += allPts[ii].y;
    }
    cx /= idx.length;
    cy /= idx.length;
    const ddx = cx - px, ddy = cy - py;
    const dl = Math.hypot(ddx, ddy) || 1;
    const mag = 1 + 2.2 * (1 - Math.min(1, dl / halfDiag));
    const tan = (Math.random() - 0.5) * 0.7;
    const open = 3 + Math.random() * 5;
    cells.push({
      idx,
      sx: 0,
      sy: 0,
      vx: ddx / dl * open + -ddy / dl * tan * open,
      vy: ddy / dl * open + ddx / dl * tan * open,
      rx: ddx / dl * mag + -ddy / dl * tan * mag,
      ry: ddy / dl * mag + ddx / dl * tan * mag
    });
  };
  for (let i = 0; i < mainCount; i++) {
    const ni = (i + 1) % mainCount;
    mkCell([0, ringIdx(0, i), ringIdx(0, ni)]);
    for (let kk = 0; kk < R - 1; kk++) {
      mkCell([ringIdx(kk, i), ringIdx(kk, ni), ringIdx(kk + 1, ni), ringIdx(kk + 1, i)]);
    }
    mkCell([ringIdx(R - 1, i), ringIdx(R - 1, ni), boundIdx(ni), boundIdx(i)]);
  }
  const dust = [];
  const dustCount = 20 + Math.round(density * 40);
  for (let i = 0; i < dustCount; i++) {
    const src = allPolyPoints[Math.floor(Math.random() * allPolyPoints.length)];
    dust.push({
      x: src.x + (Math.random() - 0.5) * 6,
      y: src.y + (Math.random() - 0.5) * 6,
      r: 0.5 + Math.random() * 1.1,
      bright: Math.random() < 0.6
    });
  }
  const burst = [];
  const burstCount = 6 + Math.round(density * 8);
  for (let i = 0; i < burstCount; i++) {
    const a2 = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 80;
    burst.push({ x: px, y: py, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp, life: 220 + Math.random() * 140, age: 0, size: 1 + Math.random() * 1.4 });
  }
  if (p2) {
    for (let i = 0; i < 4; i++) {
      const a2 = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 50;
      burst.push({ x: p2.x, y: p2.y, vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp, life: 160 + Math.random() * 100, age: 0, size: 0.8 + Math.random() });
    }
  }
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, "rgba(255,255,255,0.055)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0.03)");
  let rafId = 0;
  let backupId = 0;
  let start = 0;
  let started = false;
  let lastPaint = 0;
  let endedLocal = false;
  let watchdog2 = 0;
  const stopLoop = () => {
    endedLocal = true;
    cancelAnimationFrame(rafId);
    if (backupId) {
      window.clearInterval(backupId);
      backupId = 0;
    }
    if (watchdog2) {
      window.clearTimeout(watchdog2);
      watchdog2 = 0;
    }
  };
  const cleanupAfterHide = () => {
    stopLoop();
    try {
      canvas.remove();
    } catch {
    }
    if (myGen !== glassGen) return;
    blankRoot(root);
    glassActive = false;
  };
  function finishEarly() {
    stopLoop();
    try {
      canvas.remove();
    } catch {
    }
    if (myGen !== glassGen) return;
    blankRoot(root);
    onDone();
  }
  const frame = (now) => {
    if (endedLocal) return;
    if (!started) {
      started = true;
      start = now;
      lastPaint = now;
    }
    const age = now - start;
    const dt = Math.min(0.05, Math.max(1e-3, (now - lastPaint) / 1e3));
    lastPaint = now;
    const fadeStart = wipe * 0.3;
    let glassAlpha = 1;
    if (age > fadeStart) {
      const t = Math.min(1, (age - fadeStart) / Math.max(1, duration - fadeStart));
      glassAlpha = Math.max(0, 1 - t * t * (3 - 2 * t));
    }
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = glassAlpha;
    for (const cl of cells) {
      cl.sx += cl.vx * dt;
      cl.sy += cl.vy * dt;
      cl.vx *= 1 - 4 * dt;
      cl.vy *= 1 - 4 * dt;
      ctx.save();
      ctx.translate(cl.sx, cl.sy);
      ctx.beginPath();
      ctx.moveTo(allPts[cl.idx[0]].x, allPts[cl.idx[0]].y);
      for (let q = 1; q < cl.idx.length; q++) ctx.lineTo(allPts[cl.idx[q]].x, allPts[cl.idx[q]].y);
      ctx.closePath();
      ctx.clip();
      if (bgTex) {
        ctx.globalAlpha = glassAlpha * 0.4;
        ctx.drawImage(bgTex, cl.rx, cl.ry);
        ctx.globalAlpha = glassAlpha;
      }
      ctx.fillStyle = "rgba(206,224,250,0.05)";
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    for (const sg of segs) {
      ctx.save();
      ctx.translate(1, 1);
      ctx.strokeStyle = `rgba(16,18,34,${(0.16 * sg.alpha * glassAlpha).toFixed(3)})`;
      ctx.lineWidth = sg.w + 0.9;
      ctx.beginPath();
      ctx.moveTo(sg.x1, sg.y1);
      ctx.lineTo(sg.x2, sg.y2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = `rgba(255,255,255,${(sg.alpha * glassAlpha).toFixed(3)})`;
      ctx.lineWidth = sg.w;
      ctx.beginPath();
      ctx.moveTo(sg.x1, sg.y1);
      ctx.lineTo(sg.x2, sg.y2);
      ctx.stroke();
    }
    for (const d of dust) {
      ctx.fillStyle = d.bright ? `rgba(255,255,255,${(0.45 * glassAlpha).toFixed(3)})` : `rgba(40,46,66,${(0.28 * glassAlpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < burst.length; i++) {
      const b = burst[i];
      b.age += dt * 1e3;
      if (b.age >= b.life) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 1 - 3.5 * dt;
      b.vy *= 1 - 3.5 * dt;
      const a = (1 - b.age / b.life) * glassAlpha;
      if (a < 0.02) continue;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
    }
    if (age < impactMs) {
      const t = age / impactMs;
      ctx.strokeStyle = `rgba(255,255,255,${((1 - t) * 0.55).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < mainCount; i++) {
        const f = 0.24 + t * 0.18;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + dirArr[i].x * lenArr[i] * f, py + dirArr[i].y * lenArr[i] * f);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const noteFadeStart = wipe * 0.7;
    if (age > noteFadeStart) {
      const t = Math.min(1, (age - noteFadeStart) / Math.max(1, duration - noteFadeStart));
      root.style.opacity = Math.max(0, 1 - t * t * (3 - 2 * t)).toFixed(3);
    }
    if (age >= duration) {
      stopLoop();
      onDone();
      window.setTimeout(cleanupAfterHide, 400);
    }
  };
  const step = (now) => {
    lastPaint = now;
    frame(now);
    if (!endedLocal) rafId = requestAnimationFrame(step);
  };
  buildBgTexture(root, w, h).then((tex) => {
    if (endedLocal) return;
    bgTex = tex;
    try {
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
    watchdog2 = window.setTimeout(() => {
      if (endedLocal) return;
      stopLoop();
      cleanupAfterHide();
      onDone();
    }, duration + 600);
  });
  return () => {
    stopLoop();
    restoreRoot(root);
    try {
      canvas.remove();
    } catch {
    }
  };
}
export {
  bumpGlassGen,
  cancelGlassShards,
  requestGlassShardsClose,
  restoreGlassSummoned
};
