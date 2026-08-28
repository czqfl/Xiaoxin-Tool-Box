/** Esc 层叠栈：面板与模态统一通过此处注册，Esc 只响应最上层的活动层。
 *  解决"模态打开按 Esc 却关了面板"、"右键菜单与面板 Esc 竞态"等问题。
 *  监听挂在捕获阶段并对命中层 stopImmediatePropagation，
 *  确保旧式 window 冒泡监听不会抢先触发。 */
import { useEffect, useRef } from "react";

type Layer = { active: boolean; handler: () => void };

const layers: Layer[] = [];
let installed = false;

function dispatch(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.active) continue;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    layer.handler();
    return;
  }
}

/** 注册一层 Esc 处理。注册顺序即层级顺序（后注册在上），
 *  active 变化不会改变层级位置。组件卸载自动移除。 */
export function useEscLayer(active: boolean, handler: () => void) {
  const layerRef = useRef<Layer | null>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!installed) {
      installed = true;
      window.addEventListener("keydown", dispatch, true);
    }
    const layer: Layer = { active: false, handler: () => handlerRef.current() };
    layers.push(layer);
    layerRef.current = layer;
    return () => {
      const idx = layers.indexOf(layer);
      if (idx >= 0) layers.splice(idx, 1);
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (layerRef.current) layerRef.current.active = active;
  }, [active]);
}
