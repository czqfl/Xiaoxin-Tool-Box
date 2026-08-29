/** 便签动画模块懒加载门面。
 *  粒子动画（火焰/粒子光效/吸入/玻璃碎裂）体积占便签前端 bundle 大头，
 *  但只在"播放/取消动画"时才真正需要——按需动态 import（vite 自动分包），
 *  初始 bundle 只含核心逻辑，便签打开解析/执行显著变快。
 *  cancel 类操作用可选链同步读取：模块未加载 = 无动画在播，无需清理。 */

type Flame = typeof import("./flame");
type Glow = typeof import("./glow-particles");
type Inhale = typeof import("./glow-particles-inhale");
type Glass = typeof import("./glass-shatter");

let flame: Flame | undefined;
let glow: Glow | undefined;
let inhale: Inhale | undefined;
let glass: Glass | undefined;
let loading: Promise<void> | null = null;

/** 加载全部动画模块（幂等：只加载一次并缓存） */
export function loadAnimModules(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      import("./flame").then((m) => (flame = m)),
      import("./glow-particles").then((m) => (glow = m)),
      import("./glow-particles-inhale").then((m) => (inhale = m)),
      import("./glass-shatter").then((m) => (glass = m)),
    ]).then(() => undefined);
  }
  return loading;
}

/** 动画模块访问器：可能为 undefined（未加载）——cancel 场景直接跳过 */
export const anim = {
  load: loadAnimModules,
  get flame(): Flame | undefined {
    return flame;
  },
  get glow(): Glow | undefined {
    return glow;
  },
  get inhale(): Inhale | undefined {
    return inhale;
  },
  get glass(): Glass | undefined {
    return glass;
  },
};
