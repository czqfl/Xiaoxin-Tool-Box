/** 悬浮工具栏的提示窗口（独立置顶小窗）。
 *
 *  存在理由：工具栏是 alwaysOnTop 窗口，原生 title 提示是 WebView 的子窗口，
 *  z-order 永远低于它，显示出来就被工具栏自己压住；而工具栏窗口尺寸严格等于
 *  工具条本身（贴边收起依赖这一点），也没有空间画窗口内提示。
 *  因此提示单独开一个透明置顶小窗，由工具栏通过事件驱动显示/定位。
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { onTip, type TipPayload } from "./tip";
import "./tip.css";

/** 提示与锚点（按钮中心）的间距 */
const OFFSET = 14;

export function ToolbarTip() {
  const [tip, setTip] = useState<TipPayload | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const winRef = useRef(getCurrentWindow());

  useEffect(() => {
    let dispose: (() => void) | null = null;
    void onTip((p) => setTip(p)).then((u) => {
      dispose = u;
    });
    return () => {
      dispose?.();
    };
  }, []);

  // 定位必须在绘制前完成（useLayoutEffect），否则会看到提示先出现在旧位置再跳走
  useLayoutEffect(() => {
    const win = winRef.current;
    const el = boxRef.current;
    if (!tip || !el) {
      void win.hide().catch(() => {});
      return;
    }
    const w = Math.ceil(el.offsetWidth);
    const h = Math.ceil(el.offsetHeight);
    void (async () => {
      try {
        await win.setSize(new LogicalSize(w, h));
        // 工作区（已排除任务栏）：多显示器下 availLeft/Top 即全局原点
        const s = window.screen as Screen & { availLeft: number; availTop: number };
        let x: number;
        let y: number;
        if (tip.vertical) {
          // 竖条：提示放在按钮右侧，垂直居中
          x = tip.x + OFFSET;
          y = tip.y - h / 2;
        } else {
          // 横条：提示放在按钮上方，水平居中
          x = tip.x - w / 2;
          y = tip.y - h - OFFSET;
        }
        // 夹回屏幕内，避免贴边按钮的提示被裁掉
        const minX = s.availLeft + 2;
        const minY = s.availTop + 2;
        const maxX = s.availLeft + s.availWidth - w - 2;
        const maxY = s.availTop + s.availHeight - h - 2;
        x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
        y = Math.min(Math.max(y, minY), Math.max(minY, maxY));
        await win.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
        // 再次置顶：两个 alwaysOnTop 窗口之间，后设置的浮在上面
        await win.setAlwaysOnTop(true);
        await win.show();
      } catch {
        /* 提示是增强项，定位失败也不应影响工具栏 */
      }
    })();
  }, [tip]);

  return (
    <div className="tip-wrap">
      <div ref={boxRef} className="tip-box">
        {tip?.label ?? ""}
      </div>
    </div>
  );
}
