// 粒子消散运动模型：向上飘散、像烟（remote 粒子层 / self 便签内回退【共用】，同源）。
// ----------------------------------------------------------------------------
// "烟"的观感 = 大方向统一 + 个体差异拉满，两头缺一不可（各踩过一次坑：
// 差异太小 → 整块像棉絮布动；差异全靠群体相干摆 → 左右飘散）：
// · 统一：主方向永远向上（浮力终端 ≈290 px/s；flow 向下分量一律忽略），
//   小幅群体共波（相位取位置，同股烟一起摆），风是唯一的整体横漂来源。
// · 差异：逐粒独立蜿蜒（频率/相位由 pseed 定，相邻粒子出生即轨迹分岔）、
//   向上初速宽带（38~133 px/s，烟柱纵向自然拉开）、寿命随机（先后淡出）。
//   尺寸/亮度【全粒一致】（用户要求：初始大小亮度一致，不做偏斜分布/脉动/闪烁）。
//   摆动均为【速度】直加不积分，正弦抵消 → 只摆不漂、零净横移（做成加速度会积出横向稳态漂移）。
// flow 场（∇T）横向分量 ×小增益只影响出生头几百毫秒的轻发散。

export const TAU_DRAG = 1.1;    // 速度松驰时间常数（s）
const BUOY_ACC = 260;           // 向上加速度（CSS px/s²；终端 ≈ BUOY_ACC×TAU_DRAG ≈ 290）
const SWAY_COH = 5;             // 群体共波幅值（同排粒子近似同摆 → "一股烟"整体感）
const SWAY_IND = 10;            // 逐粒独立蜿蜒幅值（各自频率/相位 → 粒粒分明的关键）
const WOBBLE_IND = 5;           // 纵向逐粒起伏（上升快慢不齐，弹道自然拉开）
const UP_BASE = 38;             // 向上基础初速（CSS px/s）
const UP_SPAN = 95;             // 向上初速随机幅度（宽带 → 烟柱纵向自动拉开）
const V_JITTER = 30;            // 横向初速逐粒抖动（±V_JITTER/2）
const LAT_GAIN = 0.05;          // flow 水平分量 → 横向发散增益（出生轻发散）
const UP_FLOW_GAIN = 0.05;      // flow 向上分量 → 额外上升增益
const LIFE_BASE = 3000;         // 寿命基（ms）——给弹道分岔留足时间
const LIFE_SPAN = 1800;         // 寿命随机幅度
/** 粒子直径（CSS px）：全粒统一（原为 1.6~4.0 偏斜随机分布，用户要求一致）。
 *  取原分布的期望值 ≈2.5，观感总量不变。 */
const PARTICLE_SIZE = 2.5;

/** 粒子池（SoA）。px/py 物理像素；vx/vy CSS px/s，积分时 ×dpr 转物理位移。 */
export interface ParticlePool {
  px: Float32Array;
  py: Float32Array;
  pvx: Float32Array;
  pvy: Float32Array;
  plife: Float32Array;
  page: Float32Array;
  psize: Float32Array;
  pseed: Float32Array;
  pr: Float32Array;
  pg: Float32Array;
  pb: Float32Array;
  pcount: number;
}

/** 构造粒子池（SoA 各通道一次到位） */
export function newPool(cap: number): ParticlePool {
  return {
    px: new Float32Array(cap), py: new Float32Array(cap),
    pvx: new Float32Array(cap), pvy: new Float32Array(cap),
    plife: new Float32Array(cap), page: new Float32Array(cap),
    psize: new Float32Array(cap), pseed: new Float32Array(cap),
    pr: new Float32Array(cap), pg: new Float32Array(cap), pb: new Float32Array(cap),
    pcount: 0,
  };
}

export interface MotionCfg {
  /** 便签窗 dpr（速度换算 / 湍流空间频率的尺度基准） */
  dpr: number;
  /** 消散前沿方向×速度场（tW×tH 网格，2 float/cell，CSS px/s）；缺省 = 纯向上烟 */
  flow?: ArrayLike<number>;
  tW: number;
  tH: number;
  /** 便签 CSS 宽高（flow 网格坐标换算） */
  rectW: number;
  rectH: number;
  /** 便签左上角（物理 px）：粒子坐标为屏幕绝对时（remote），采样 flow 前需减去 */
  ox: number;
  oy: number;
  /** 全局风偏（CSS px/s，正右/负左/0 无风） */
  wind: number;
  /** 动画速度系数（100% 原速 = 1） */
  k: number;
}

/** 生成一粒：温和向上初速 + 从发起点的轻微横向发散（邻居横向速度一致 → 关联）。
 *  sx/sy 物理像素；r/g/b 0~255（调用方在生成点采样）。 */
export function spawnParticle(
  ps: ParticlePool, cfg: MotionCfg, sx: number, sy: number,
  age: number, duration: number, r: number, g: number, b: number,
): void {
  if (ps.pcount >= ps.px.length) return;
  const fit = duration - age - 40;
  if (fit < 120) return;
  let life = Math.round((LIFE_BASE + Math.random() * LIFE_SPAN) * cfg.k);
  if (life > fit) life = fit;
  const i = ps.pcount++;
  ps.px[i] = sx;
  ps.py[i] = sy;
  // 横向发散（取自发起波前的水平分量）+ 额外上升（只取向上分量）
  let lat = 0;
  let upExtra = 0;
  if (cfg.flow && cfg.flow.length >= cfg.tW * cfg.tH * 2) {
    const gx = Math.max(0, Math.min(cfg.tW - 1, (((sx - cfg.ox) / cfg.dpr / cfg.rectW) * cfg.tW) | 0));
    const gy = Math.max(0, Math.min(cfg.tH - 1, (((sy - cfg.oy) / cfg.dpr / cfg.rectH) * cfg.tH) | 0));
    const o = (gy * cfg.tW + gx) * 2;
    lat = cfg.flow[o] * LAT_GAIN;
    const fy = cfg.flow[o + 1];
    if (fy < 0) upExtra = -fy * UP_FLOW_GAIN; // 屏幕 y 向下为正：fy<0 = 向上，才增益上升
  }
  ps.pvx[i] = lat + (Math.random() - 0.5) * V_JITTER;
  ps.pvy[i] = -(UP_BASE + Math.random() * UP_SPAN) - upExtra; // 负 = 向上
  ps.plife[i] = life;
  ps.page[i] = 0;
  // 尺寸全粒统一（见 PARTICLE_SIZE 注释）
  ps.psize[i] = PARTICLE_SIZE;
  ps.pseed[i] = Math.random() * Math.PI * 2;
  ps.pr[i] = r / 255;
  ps.pg[i] = g / 255;
  ps.pb[i] = b / 255;
}

/** 一步到位：烟雾积分（浮力上升 + 相干横向涌动 + 风 + 阻力趋稳）→ 剔除亡粒 →
 *  写入 glData（7 float/粒），返回写入游标。 */
export function stepAndPaint(
  ps: ParticlePool, cfg: MotionCfg, dt: number,
  globalFade: number, glData: Float32Array, drawCount: number,
): number {
  const drag = Math.exp(-dt / TAU_DRAG);
  // 速度/加速度统一 CSS px/s 域（位移处才 ×dpr）——此前预乘 dpr 与位移换算叠加，
  // 高 DPI 下终端速度被放大 dpr² 倍
  const buoy = -BUOY_ACC; // 屏幕 y 向下为正：浮力向上 = 负
  const windAcc = cfg.wind / TAU_DRAG; // 平衡时横向漂移 = wind
  for (let i = 0; i < ps.pcount; i++) {
    const a = ps.page[i] + dt * 1000;
    ps.page[i] = a;
    const u = a / ps.plife[i];
    if (u >= 1) {
      const last = --ps.pcount;
      if (i !== last) {
        ps.px[i] = ps.px[last]; ps.py[i] = ps.py[last];
        ps.pvx[i] = ps.pvx[last]; ps.pvy[i] = ps.pvy[last];
        ps.plife[i] = ps.plife[last]; ps.page[i] = ps.page[last];
        ps.psize[i] = ps.psize[last]; ps.pseed[i] = ps.pseed[last];
        ps.pr[i] = ps.pr[last]; ps.pg[i] = ps.pg[last]; ps.pb[i] = ps.pb[last];
      }
      i--;
      continue;
    }
    const aSec = a / 1000;
    ps.pvx[i] = ps.pvx[i] * drag + windAcc * dt;
    ps.pvy[i] = ps.pvy[i] * drag + buoy * dt;
    // 摆动以【速度】形式直接叠加：正弦正负半周期抵消，摆而不漂、零净横移
    ps.px[i] += (ps.pvx[i] + swayX(ps, cfg, i, aSec)) * cfg.dpr * dt;
    ps.py[i] += (ps.pvy[i] + swayY(ps, i, aSec)) * cfg.dpr * dt;
    const t = 1 - u;
    // 亮度全粒一致：只随自身寿命进度 t 与全局淡出衰减，无逐粒闪烁
    const alpha = t * Math.pow(t, 0.2) * globalFade;
    if (alpha < 0.02) continue;
    const o = drawCount * 7;
    glData[o] = ps.px[i];
    glData[o + 1] = ps.py[i];
    glData[o + 2] = ps.psize[i] * 1.05 * 2 * cfg.dpr;
    glData[o + 3] = alpha;
    glData[o + 4] = ps.pr[i];
    glData[o + 5] = ps.pg[i];
    glData[o + 6] = ps.pb[i];
    drawCount++;
  }
  return drawCount;
}

// 摆动【速度】场 = 小幅群体共波 + 大幅逐粒独立蜿蜒。
// 共波相位取粒子位置（波长 ~140px）→ 同一股烟整体同摆；
// 独立项频率/相位全由 pseed 决定 → 相邻粒子轨迹出生即分岔（"棉絮感"的解药）。
// 均为速度直加：正弦抵消、不产生净横移。
function swayX(ps: ParticlePool, cfg: MotionCfg, i: number, aSec: number): number {
  const y = ps.py[i] / cfg.dpr;
  const f = 1.7 + (ps.pseed[i] / Math.PI) * 2.2; // 逐粒频率 ~1.7~3.8 rad/s
  return SWAY_COH * Math.sin(y * 0.045 + aSec * 2.2)
    + SWAY_IND * Math.sin(aSec * f * 2.4 + ps.pseed[i] * 7.3);
}
function swayY(ps: ParticlePool, i: number, aSec: number): number {
  const f = 1.7 + (ps.pseed[i] / Math.PI) * 2.2;
  return WOBBLE_IND * Math.sin(aSec * f * 1.9 + ps.pseed[i] * 3.1);
}
