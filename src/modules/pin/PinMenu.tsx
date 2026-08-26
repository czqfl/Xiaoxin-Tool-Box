/** 贴图右键菜单窗：独立透明窗，不受贴图窗矩形裁剪，因此菜单可完整显示在任何
 *  位置、且绝不改动贴图尺寸。由 PinWindow 在光标处动态建窗并传参（菜单项/光标
 *  屏幕坐标/来源贴图标签）；本组件渲染菜单、自测尺寸贴边、选中项经事件回传来源窗 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { emitTo } from "@tauri-apps/api/event";
import { useConfigStore } from "../../stores/configStore";
import "./pin.css";

interface MenuItem { id: string; label: string; }

export default function PinMenu() {
  const load = useConfigStore((s) => s.load);

  // 解析建窗参数（PinWindow 经 URL query 传入）
  const params = new URLSearchParams(location.search.replace(/^\?/, ""));
  const items: MenuItem[] = (() => {
    try { return JSON.parse(params.get("items") || "[]"); } catch { return []; }
  })();
  const cx = Number(params.get("cx") || 0);
  const cy = Number(params.get("cy") || 0);
  const pin = params.get("pin") || "";

  const menuRef = useRef<HTMLDivElement | null>(null);
  // 已显示标记：失焦（点窗外）才关窗，避免建窗瞬间的焦点抖动误关
  const shownRef = useRef(false);

  // 加载主题（与各窗口一致）：玻璃底用主题变量，浅/深主题下都清晰可读
  useEffect(() => { void load(); }, [load]);

  // 菜单项点击：回传指令给来源贴图窗，然后关窗
  const onPick = (id: string) => {
    if (pin) emitTo(pin, "pin-menu-action", { id, pin }).catch(() => {});
    getCurrentWindow().close().catch(() => {});
  };

  // 自测尺寸 → 调整窗尺寸 → 贴边定位 → 显示（全程在显示前完成，无尺寸闪烁）
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const mw = el.offsetWidth, mh = el.offsetHeight;
    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    let px = cx + 2, py = cy + 2;
    // 溢出右/下边界则翻到光标左/上，保证整菜单留在可视区（彻底脱离贴图矩形约束）
    if (px + mw > availW) px = Math.max(2, cx - mw - 2);
    if (py + mh > availH) py = Math.max(2, cy - mh - 2);
    const win = getCurrentWindow();
    void win.setSize(new LogicalSize(mw, mh)).then(() => {
      void win.setPosition(new LogicalPosition(px, py)).then(() => {
        void win.show().then(() => {
          void win.setFocus().catch(() => {});
          shownRef.current = true;
        }).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  }, [cx, cy]);

  // Esc 关闭；失焦（点窗外其它处）关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); getCurrentWindow().close().catch(() => {}); }
    };
    const onBlur = () => {
      if (shownRef.current) getCurrentWindow().close().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <div className="pin-ctx-menu" ref={menuRef}>
      {items.map((it) => (
        <div key={it.id} className="pin-ctx-item" onClick={() => onPick(it.id)}>
          {it.label}
        </div>
      ))}
    </div>
  );
}
