/** Esc 层叠栈：面板与模态统一通过此处注册，Esc 只响应最上层的活动层。
 *  解决"模态打开按 Esc 却关了面板"、"右键菜单与面板 Esc 竞态"等问题。
 *
 *  层级 = 激活顺序：层只在 active 时入栈、失活即出栈——后打开的弹窗
 *  天然在先注册的面板之上（若挂载即入栈，React 子组件 effect 先于父组件
 *  执行，常挂载的 ConfirmDialog 会错误地垫在面板层之下）。
 *  监听挂在捕获阶段并对命中层 stopImmediatePropagation，
 *  确保旧式 window 冒泡监听不会抢先触发。 */
import { useEffect, useRef } from "react";

type Layer = { handler: () => void };

const layers: Layer[] = [];
let installed = false;

function dispatch(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  // 「本地 Esc 域」：元素自带 Esc 语义（如编辑框退出编辑）时标记
  // data-esc-local，层叠栈不接管，避免连带关闭面板
  if ((e.target as HTMLElement | null)?.closest?.("[data-esc-local]")) return;
  const top = layers[layers.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  top.handler();
}

/** 注册一层 Esc 处理。层级顺序 = 激活（active 变 true）的先后，
 *  组件卸载或失活自动移除。 */
export function useEscLayer(active: boolean, handler: () => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (installed) return;
    installed = true;
    window.addEventListener("keydown", dispatch, true);
  }, []);

  useEffect(() => {
    if (!active) return;
    const layer: Layer = { handler: () => handlerRef.current() };
    layers.push(layer);
    return () => {
      const idx = layers.indexOf(layer);
      if (idx >= 0) layers.splice(idx, 1);
    };
  }, [active]);
}
