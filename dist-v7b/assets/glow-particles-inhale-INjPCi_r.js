let inhaleActive = false;
let inhaleGen = 0;
let cancelInhaleFn = null;
function cancelInhaleParticles() {
  const c = cancelInhaleFn;
  cancelInhaleFn = null;
  if (c) {
    c();
    return;
  }
  if (!inhaleActive) return;
  inhaleActive = false;
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
function requestInhaleDissolveClose(onDone, particleDensity = 50, speed = 100) {
  const root = document.querySelector(".note-window");
  if (!root || inhaleActive) {
    onDone();
    return;
  }
  inhaleActive = true;
  let done = false;
  let aborted = false;
  let stopRun = null;
  const safeDone = () => {
    if (done) return;
    done = true;
    inhaleActive = false;
    cancelInhaleFn = null;
    onDone();
  };
  const watchdog = window.setTimeout(safeDone, Math.round(4e3 * Math.max(0.25, Math.min(4, 100 / Math.max(10, speed)))));
  cancelInhaleFn = () => {
    if (aborted) return;
    aborted = true;
    window.clearTimeout(watchdog);
    if (stopRun) stopRun();
    done = true;
    inhaleActive = false;
  };
  try {
    stopRun = runGlow(root, "dissolve", particleDensity, speed, () => {
      window.clearTimeout(watchdog);
      safeDone();
    });
  } catch (e) {
    console.error("粒子光效消散动画异常:", e);
    window.clearTimeout(watchdog);
    safeDone();
  }
}
function playInhaleMaterialize(root, particleDensity = 50, speed = 100) {
  if (inhaleActive) cancelInhaleParticles();
  inhaleActive = true;
  let aborted = false;
  let stopRun = null;
  cancelInhaleFn = () => {
    if (aborted) return;
    aborted = true;
    if (stopRun) stopRun();
    inhaleActive = false;
  };
  try {
    stopRun = runGlow(root, "materialize", particleDensity, speed, () => {
    });
  } catch (e) {
    console.error("粒子光效成形动画异常:", e);
    cancelInhaleFn = null;
    inhaleActive = false;
    restoreRoot(root);
  }
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
function runGlow(root, direction, particleDensity, speed, onDone) {
  const myGen = ++inhaleGen;
  const isDissolve = direction === "dissolve";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const density = Math.max(0, Math.min(100, particleDensity)) / 100;
  const k = Math.max(0.25, Math.min(4, 100 / Math.max(10, speed)));
  const wipe = Math.round(1100 * k);
  const endFade = Math.round(220 * k);
  const duration = wipe + Math.round(280 * k);
  const emitWindow = Math.round(560 * k);
  const canvas = document.createElement("canvas");
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
  const gl = canvas.getContext("webgl", glOpts) || canvas.getContext("experimental-webgl", glOpts);
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
    attribute vec3 a_shape;   // x=自转角 y=各向异性 z=噪声种子
    uniform vec2 u_res;       // canvas 设备尺寸
    varying float v_alpha;
    varying vec3 v_color;
    varying float v_rot;
    varying float v_aniso;
    varying float v_seed;
    void main() {
      vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
      clip.y = -clip.y;       // 设备 y 向下，翻转
      gl_Position = vec4(clip, 0.0, 1.0);
      gl_PointSize = a_param.x;
      v_alpha = a_param.y;
      v_color = a_color;
      v_rot = a_shape.x;
      v_aniso = a_shape.y;
      v_seed = a_shape.z;
    }`;
  const FS_SRC = `
    precision mediump float;
    varying float v_alpha;
    varying vec3 v_color;
    varying float v_rot;
    varying float v_aniso;
    varying float v_seed;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    void main() {
      vec2 q = gl_PointCoord - vec2(0.5);
      q *= 2.0;                                  // [-1,1]
      float s = sin(v_rot), c = cos(v_rot);
      vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c); // 旋转到颗粒自身朝向
      float stretch = mix(1.0, 2.1, v_aniso);    // 沿长轴(x)拉伸
      float squash  = mix(1.0, 0.5, v_aniso);    // 短轴(y)收窄 → 被风拉成短条
      r.x /= stretch;
      r.y /= squash;
      float rr = length(r);
      float ang = atan(r.y, r.x);
      float wob = 0.10 * sin(ang * 3.0 + v_seed) + 0.06 * sin(ang * 7.0 - v_seed * 1.7); // 不规则轮廓
      float edge = 1.0 + wob;
      float a0 = 1.0 - smoothstep(edge - 0.5, edge, rr); // 柔和但非圆的颗粒主体
      float grain = 0.70 + 0.30 * hash(floor(q * 5.0) + v_seed); // 表面颗粒感（粗噪）
      float core  = 1.0 - smoothstep(0.0, 0.6, rr);              // 中心略亮
      float bright = grain * (0.85 + 0.15 * core);
      float glow = (1.0 - smoothstep(edge, edge + 0.7, rr)) * 0.32; // 柔和辉光晕：提升可见度，避免"看不清"
      float a = max(a0 * bright, glow * (1.0 - a0));              // 颗粒主体 + 仅在主体之外的外晕
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
  const aPosLoc = gl.getAttribLocation(glProg, "a_pos");
  const aParamLoc = gl.getAttribLocation(glProg, "a_param");
  const aColorLoc = gl.getAttribLocation(glProg, "a_color");
  const aShapeLoc = gl.getAttribLocation(glProg, "a_shape");
  gl.uniform2f(gl.getUniformLocation(glProg, "u_res"), canvas.width, canvas.height);
  const glBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  let glLost = false;
  const loseGL = () => {
    if (glLost) return;
    glLost = true;
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  };
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
  const featherMs = 90;
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
  const sources = [];
  const nBottom = 1 + (Math.random() < 0.35 ? 1 : 0);
  for (let s = 0; s < nBottom; s++) {
    sources.push({
      x: (0.12 + Math.random() * 0.76) * w,
      // 底部随机 x（偏中间，避免贴死角落）
      y: h - Math.random() * 0.18 * h,
      // 底部 0~18% 高度内随机（波峰随之高低错落）
      t0: Math.random() * 0.1 * wipe,
      // 各源发起时刻略错开，避免齐发
      scale: 1.02
      // 底部：较快（scale 越小前沿越快）
    });
  }
  sources.push({
    x: (0.12 + Math.random() * 0.76) * w,
    // 顶部随机 x
    y: Math.random() * 0.18 * h,
    // 顶部 0~18% 高度内随机
    t0: Math.random() * 0.06 * wipe,
    scale: 1.55
    // 顶部：较慢（scale 越大前沿越慢，与底部 1.02 形成速度差）
  });
  const dissolveTimeAt = (nx, ny) => {
    let best = Infinity;
    for (let si = 0; si < sources.length; si++) {
      const sp = sources[si];
      const d = Math.hypot(nx - sp.x, ny - sp.y) / diag;
      const Tsrc = sp.t0 + Math.pow(d, 0.82) * (wipe * sp.scale);
      if (Tsrc < best) best = Tsrc;
    }
    let Tf = best;
    if (Tf < 0) Tf = 0;
    else if (Tf > wipe - featherMs) Tf = wipe - featherMs;
    return Tf;
  };
  const Tfield = new Float32Array(mw * mh);
  for (let my = 0; my < mh; my++) {
    const ny = (my + 0.5) / maskScale;
    for (let mx = 0; mx < mw; mx++) {
      const nx = (mx + 0.5) / maskScale;
      Tfield[my * mw + mx] = dissolveTimeAt(nx, ny);
    }
  }
  const normalEps = 2;
  const normAt = (x, y) => {
    const dTx = dissolveTimeAt(x + normalEps, y) - dissolveTimeAt(x - normalEps, y);
    const dTy = dissolveTimeAt(x, y + normalEps) - dissolveTimeAt(x, y - normalEps);
    let gx = -dTx;
    let gy = -dTy;
    const len = Math.hypot(gx, gy);
    if (len < 1e-6) {
      gx = 0;
      gy = -1;
    } else {
      gx /= len;
      gy /= len;
    }
    return Math.atan2(gx, -gy);
  };
  const peakAlive = Math.round(4300 + density * 26500);
  const avgLife = Math.round(1150 * k);
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
  const prot = new Float32Array(maxP);
  const paniso = new Float32Array(maxP);
  const pr = new Float32Array(maxP);
  const pg = new Float32Array(maxP);
  const pb = new Float32Array(maxP);
  const glData = new Float32Array(maxP * 10);
  const psway = new Float32Array(maxP);
  let pcount = 0;
  const emitSpacing = 7;
  const ecx = Math.max(2, Math.ceil(w / emitSpacing));
  const ecy = Math.max(2, Math.ceil(h / emitSpacing));
  const emitX = new Float32Array(ecx * ecy);
  const emitY = new Float32Array(ecx * ecy);
  const emitT = new Float32Array(ecx * ecy);
  const emitW = new Float32Array(ecx * ecy);
  let ecount = 0;
  for (let iy = 0; iy < ecy; iy++) {
    for (let ix = 0; ix < ecx; ix++) {
      const nx = (ix + 0.5) * emitSpacing;
      const ny = (iy + 0.5) * emitSpacing;
      emitX[ecount] = nx;
      emitY[ecount] = ny;
      const T = dissolveTimeAt(nx, ny);
      emitT[ecount] = isDissolve ? T : wipe - T;
      const t01 = Math.max(0, Math.min(1, emitT[ecount] / wipe));
      let ww = 1 - 0.45 * t01;
      emitW[ecount] = ww;
      ecount++;
    }
  }
  const binSize = 20;
  const binCount = Math.ceil((wipe + emitWindow) / binSize) + 1;
  const binPts = [];
  const binW = new Float32Array(binCount);
  const binMaxW = new Float32Array(binCount);
  for (let b = 0; b < binCount; b++) binPts.push([]);
  for (let i = 0; i < ecount; i++) {
    let b = Math.floor(emitT[i] / binSize);
    if (b < 0) b = 0;
    else if (b >= binCount) b = binCount - 1;
    binPts[b].push(i);
    binW[b] += emitW[i];
    if (emitW[i] > binMaxW[b]) binMaxW[b] = emitW[i];
  }
  const abBins = new Int32Array(binCount);
  const abW = new Float32Array(binCount);
  const emitRate = peakAlive / avgLife;
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
      mpx32[p++] = (a * 255 & 255) << 24 | 16777215;
    }
    mctx.putImageData(mimg, 0, 0);
  };
  let lastMaskPush = -1;
  let maskSeq = 0;
  let lastAppliedSeq = 0;
  let clipCleared = false;
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
      if (!isDissolve && !clipCleared) {
        clipCleared = true;
        try {
          root.style.clipPath = "";
        } catch {
        }
      }
    };
    im.onerror = () => {
      if (endedLocal) return;
      if (!isDissolve && !clipCleared) {
        clipCleared = true;
        try {
          root.style.clipPath = "";
        } catch {
        }
      }
    };
    im.src = url;
  };
  const spawn = (x, y, age) => {
    if (pcount >= maxP) return;
    let life = 900 + Math.random() * 600;
    const fit = duration - age - 60;
    if (fit < 140) return;
    if (life > fit) life = fit;
    const i = pcount++;
    const sx = x + (Math.random() - 0.5) * (w / ecx);
    px[i] = sx;
    py[i] = y + (Math.random() - 0.5) * 4;
    pang[i] = normAt(x, y) + (Math.random() - 0.5) * (10 * Math.PI / 180);
    const rv = () => 0.8 + Math.random() * 0.4;
    pv0[i] = (200 + Math.random() * 130) * rv();
    pv1[i] = (520 + Math.random() * 260) * rv();
    plife[i] = life;
    page[i] = 0;
    const r1 = Math.random(), r2 = Math.random();
    psize[i] = 1.1 + r1 * r2 * 2.6;
    pseed[i] = Math.random() * 100;
    prot[i] = Math.random() * Math.PI * 2;
    paniso[i] = Math.random();
    psway[i] = (Math.random() - 0.5) * 28;
    const [r, g, b] = sampleThemeColor(sx, y);
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
  let spawnAcc = 0;
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
    if (isDissolve) {
      blankRoot(root);
      onDone();
    } else {
      restoreRoot(root);
      inhaleActive = false;
      onDone();
    }
  }
  const cleanupAfterHide = () => {
    stopLoop();
    try {
      canvas.remove();
    } catch {
    }
    if (myGen !== inhaleGen) return;
    blankRoot(root);
    inhaleActive = false;
  };
  const finishMaterialize = () => {
    stopLoop();
    if (myGen !== inhaleGen) return;
    inhaleActive = false;
    requestAnimationFrame(() => {
      if (myGen !== inhaleGen) return;
      try {
        canvas.remove();
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
      prevNow = now;
    }
    const dt = Math.min(0.05, Math.max(1e-3, (now - prevNow) / 1e3));
    prevNow = now;
    const age = now - start;
    pushMask(age);
    if (!isDissolve) {
      let op = age / wipe;
      if (op < 0) op = 0;
      else if (op > 1) op = 1;
      root.style.opacity = op.toFixed(3);
    }
    let abCount = 0;
    let abTotalW = 0;
    const b0 = Math.max(0, Math.floor((age - emitWindow) / binSize));
    const b1 = Math.min(binCount - 1, Math.floor(age / binSize));
    for (let b = b0; b <= b1; b++) {
      if (binW[b] > 0) {
        abBins[abCount] = b;
        abW[abCount] = binW[b];
        abTotalW += binW[b];
        abCount++;
      }
    }
    if (abCount > 0) {
      spawnAcc += emitRate * dt * 1e3;
      let n = Math.floor(spawnAcc);
      spawnAcc -= n;
      if (n > 600) n = 600;
      for (let k2 = 0; k2 < n; k2++) {
        let r = Math.random() * abTotalW;
        let bb = abBins[abCount - 1];
        for (let z = 0; z < abCount; z++) {
          r -= abW[z];
          if (r <= 0) {
            bb = abBins[z];
            break;
          }
        }
        const pts = binPts[bb];
        let idx = pts[Math.random() * pts.length | 0];
        const mw2 = binMaxW[bb];
        for (let tr = 0; tr < 4; tr++) {
          const cand = pts[Math.random() * pts.length | 0];
          if (Math.random() * mw2 <= emitW[cand]) {
            idx = cand;
            break;
          }
        }
        spawn(emitX[idx], emitY[idx], age);
      }
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const globalFade = age > duration - endFade ? Math.max(0, (duration - age) / endFade) : 1;
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
          prot[i] = prot[last];
          paniso[i] = paniso[last];
          pr[i] = pr[last];
          pg[i] = pg[last];
          pb[i] = pb[last];
          psway[i] = psway[last];
        }
        i--;
        continue;
      }
      const speed2 = pv0[i] + (pv1[i] - pv0[i]) * u * u;
      const dx = Math.sin(pang[i]);
      const dy = -Math.cos(pang[i]);
      px[i] += (dx * speed2 + psway[i]) * dt;
      py[i] += dy * speed2 * dt;
      const t = 1 - u;
      const alpha = t * t * globalFade;
      if (alpha < 0.02) continue;
      const sz = psize[i] * (1 - u * 0.2) * dpr * 1.7;
      const o = drawCount * 10;
      glData[o] = px[i] * dpr;
      glData[o + 1] = py[i] * dpr;
      glData[o + 2] = sz;
      glData[o + 3] = alpha;
      glData[o + 4] = pr[i];
      glData[o + 5] = pg[i];
      glData[o + 6] = pb[i];
      glData[o + 7] = prot[i];
      glData[o + 8] = paniso[i];
      glData[o + 9] = pseed[i];
      drawCount++;
    }
    if (drawCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
      gl.bufferData(gl.ARRAY_BUFFER, glData.subarray(0, drawCount * 10), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(aParamLoc);
      gl.vertexAttribPointer(aParamLoc, 2, gl.FLOAT, false, 40, 8);
      gl.enableVertexAttribArray(aColorLoc);
      gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 40, 16);
      gl.enableVertexAttribArray(aShapeLoc);
      gl.vertexAttribPointer(aShapeLoc, 3, gl.FLOAT, false, 40, 28);
      gl.drawArrays(gl.POINTS, 0, drawCount);
    }
    if (age >= duration) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (isDissolve) {
        stopLoop();
        try {
          onDone();
        } finally {
          window.setTimeout(cleanupAfterHide, 400);
        }
      } else {
        finishMaterialize();
        onDone();
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
      root.style.clipPath = isDissolve ? "" : "inset(0 0 100% 0)";
      if (!isDissolve) root.style.opacity = "0";
      root.style.boxShadow = "none";
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
      if (isDissolve) {
        cleanupAfterHide();
        onDone();
      } else {
        finishMaterialize();
        onDone();
      }
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
      canvas.remove();
    } catch {
    }
  };
}
export {
  cancelInhaleParticles,
  playInhaleMaterialize,
  requestInhaleDissolveClose
};
