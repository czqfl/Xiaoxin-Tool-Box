/** 贴图右键菜单窗：独立透明窗（单例 pin-menu，复用不销毁），不受贴图窗矩形裁剪，
 *  菜单可完整显示在任何位置、绝不改动贴图尺寸。
 *  性能：仅首次右键时新建 WebView2 窗；之后每次右键复用同一窗——隐藏时只 hide、
 *  再显示时 emitTo 推送新数据并 show，避免反复创建浏览器进程导致弹出卡顿。
 *  数据来源：首次由 URL query 自举；后续由来源贴图窗 emitTo("pin-menu-show") 驱动 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { emitTo } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useConfigStore } from "../../stores/configStore";
import "./pin.css";

interface MenuItem { id: string; label: string; }
interface MenuData { items: MenuItem[]; cx: number; cy: number; pin: string; }

function readUrl(): MenuData | null {
  const p = new URLSearchParams(location.search.replace(/^\?/, ""));
  try {
    const items = JSON.parse(p.get("items") || "[]");
    const cx = Number(p.get("cx") || 0);
    const cy = Number(p.get("cy") || 0);
    const pin = p.get("pin") || "";
    if (!Array.isArray(items) || !pin) return null;
    return { items, cx, cy, pin };
  } catch {
    return null;
  }
}

export default function PinMenu() {
  const load = useConfigStore((s) => s.load);
  // 首次从 URL 参数自举；后续由 pin-menu-show 事件更新
  const [data, setData] = useState<MenuData | null>(readUrl());
  const menuRef = useRef<HTMLDivElement | null>(null);
  // 已显示标记：失焦（点窗外）才隐藏，避免窗隐藏瞬间的焦点抖动误关
  const shownRef = useRef(false);

  // 加载主题（与各窗口一致）：玻璃底用主题变量，浅/深主题下都清晰可读
  useEffect(() => { void load(); }, [load]);

  // 复用：接收来源贴图窗的"再次显示"指令（首次由 URL 参数自举，后续由事件驱动）
  useEffect(() => {
    let un: (() => void) | undefined;
    void getCurrentWindow().listen<MenuData>("pin-menu-show", (e) => {
      setData(e.payload);
    }).then((f) => { un = f; });
    return () => { un?.(); };
  }, []);

  // 仅隐藏（保留复用单例），不销毁窗口
  const hide = () => {
    shownRef.current = false;
    getCurrentWindow().hide().catch(() => {});
  };

  // 菜单项点击：回传指令给来源贴图窗，然后隐藏
  const onPick = (id: string) => {
    if (data?.pin) emitTo(data.pin, "pin-menu-action", { id, pin: data.pin }).catch(() => {});
    hide();
  };

  // 数据变化（首次挂载 / 收到再次显示）→ 重新量尺寸、贴边定位、显示。
  // 依赖 data：隐藏态 data 不变则不重复 show；新一次右键 setData 触发重新定位+显示
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !data) return;
    const mw = el.offsetWidth, mh = el.offsetHeight;
    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    let px = data.cx + 2, py = data.cy + 2;
    // 溢出右/下边界则翻到光标左/上，保证整菜单留在可视区（彻底脱离贴图矩形约束）
    if (px + mw > availW) px = Math.max(2, data.cx - mw - 2);
    if (py + mh > availH) py = Math.max(2, data.cy - mh - 2);
    const win = getCurrentWindow();
    void win.setSize(new LogicalSize(mw, mh)).then(() => {
      void win.setPosition(new LogicalPosition(px, py)).then(() => {
        void win.show().then(() => {
          void win.setFocus().catch(() => {});
          shownRef.current = true;
          // 显示后补刷亚克力：本窗由前端动态创建、不在启动效果管线内，SWCA 模糊层
          // 在 z-order 变化（show）后还可能失效——与各面板 show→panel_refresh_acrylic
          // 同序，每次显示都补刷一次（命令内部读 acrylic_enabled 开关，关闭则只留圆角）
          invoke("panel_refresh_acrylic", { label: "pin-menu" }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  }, [data]);

  // Esc 隐藏（保留复用）；失焦（点窗外其它处）隐藏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); hide(); }
    };
    const onBlur = () => { if (shownRef.current) hide(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!data) return null;
  return (
    <div className="pin-ctx-menu" ref={menuRef}>
      {data.items.map((it) => (
        <div key={it.id} className="pin-ctx-item" onClick={() => onPick(it.id)}>
          {it.label}
        </div>
      ))}
    </div>
  );
}
