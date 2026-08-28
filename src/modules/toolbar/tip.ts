import { emit, listen } from "@tauri-apps/api/event";

/** 独立悬浮提示窗口：解决提示被工具栏遮挡的问题。
 *
 *  为什么必须是独立窗口：
 *  - 原生 title 是 WebView 的子窗口，z-order 永远低于 alwaysOnTop 的工具栏，
 *    显示出来就被工具栏自己压住；
 *  - 又不能画在工具栏窗口内：该窗口尺寸严格等于工具条本身（贴边收起是
 *    "把窗口滑出屏幕只露一条边"，窗口一旦变大，露出的就是多余区域而非工具条），
 *    没有任何剩余空间容纳提示。
 */
export const TIP_WINDOW = "toolbar-tip";
export const EVT_TIP = "toolbar://tip";

export interface TipPayload {
  /** 提示文案 */
  label: string;
  /** 锚点屏幕坐标（CSS 像素）：按钮中心 */
  x: number;
  y: number;
  /** 工具栏是否竖直排列（决定提示放在锚点上方还是侧面） */
  vertical: boolean;
}

/** 工具栏 → 提示窗口。传 null 表示隐藏。 */
export const showTip = (p: TipPayload | null) => emit(EVT_TIP, p);

/** 提示窗口侧订阅 */
export const onTip = (cb: (p: TipPayload | null) => void) =>
  listen<TipPayload | null>(EVT_TIP, (e) => cb(e.payload));
