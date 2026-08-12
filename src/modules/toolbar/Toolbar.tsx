/** 悬浮工具栏：常驻小工具条（类似输入法工具栏），点击图标快速呼出各面板。
 *  工具列表由配置 toolbar.tools 决定（设置页可勾选）；窗口常驻置顶、
 *  失焦不隐藏（不用 usePanelCommon 的失焦隐藏）。
 *  交互：按下不移动松开 = 点击呼出（100% 可靠，不走 click 事件）；
 *  按下移动超过阈值 = 拖动窗口位置。 */
import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { AppConfig, ToolKey } from "../../types";
import { panelToggle } from "../../core/tauri";
import { EVT_CONFIG_CHANGED, onEvent } from "../../core/events";
import { diagLog } from "../../core/tauri";
import { useConfigStore } from "../../stores/configStore";
import {
  IconClipboard,
  IconFolder,
  IconKey,
  IconPort,
  IconSettings,
  IconTranslate,
} from "../../components/icons";
import "./toolbar.css";

/** 工具定义：图标（含专属颜色）+ 提示文案（顺序即设置页勾选顺序）。
 *  每个图标一个辨识色，方便一眼定位工具；hover 提亮。 */
export const TOOLS: Record<ToolKey, { label: string; color: string; icon: React.ReactNode }> = {
  clipboard: {
    label: "剪贴板",
    color: "#60a5fa",
    icon: <IconClipboard size={18} />,
  },
  folder: {
    label: "文件夹",
    color: "#fbbf24",
    icon: <IconFolder size={18} />,
  },
  credentials: {
    label: "账号密码",
    color: "#34d399",
    icon: <IconKey size={18} />,
  },
  translation: {
    label: "划词翻译",
    color: "#c084fc",
    icon: <IconTranslate size={18} />,
  },
  port: {
    label: "端口工具",
    color: "#fb923c",
    icon: <IconPort size={18} />,
  },
  settings: {
    label: "打开设置",
    color: "#818cf8",
    icon: <IconSettings size={18} />,
  },
};

/** 可用工具列表（设置页勾选用） */
export const TOOL_KEYS = Object.keys(TOOLS) as ToolKey[];

/** 拖动判定阈值（px）：超过视为拖动窗口，否则视为点击。
 *  阈值适当放宽，避免点击时轻微手抖被误判成拖动（"点了没反应"）。 */
const DRAG_THRESHOLD = 10;

export function Toolbar() {
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);
  /** 按下状态：起点、目标工具、是否已进入拖动 */
  const pressRef = useRef<{
    x: number;
    y: number;
    key: ToolKey | null;
    dragged: boolean;
  } | null>(null);

  // 初始加载 + 配置广播同步（其他窗口改了工具栏配置即时生效）
  useEffect(() => {
    load();
    let cleanup: (() => void) | undefined;
    let disposed = false;
    onEvent<AppConfig | undefined>(EVT_CONFIG_CHANGED, (cfg) => {
      if (cfg) sync(cfg);
      else void load();
    }).then((un) => {
      if (disposed) un();
      else cleanup = un;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [load, sync]);

  // 按配置的工具数量调整窗口宽度（36px 按钮 + 3px 间距 + 两端 5px padding）
  const tools = config?.toolbar?.tools ?? [];
  useEffect(() => {
    if (!tools.length) return;
    getCurrentWindow()
      .setSize(new LogicalSize(tools.length * 39 + 7, 46))
      .catch(() => undefined);
  }, [tools.length]);

  if (!config?.toolbar?.enabled) return null;
  if (!tools.length) return null;

  const startDrag = () => {
    if (pressRef.current) pressRef.current.dragged = true;
    getCurrentWindow().startDragging().catch(() => undefined);
  };

  return (
    <div
      className="toolbar"
      onMouseDown={(e) => {
        // 空白处按下：直接进入窗口拖动
        const btn = (e.target as HTMLElement).closest("button");
        if (!btn) {
          pressRef.current = null;
          getCurrentWindow().startDragging().catch(() => undefined);
          return;
        }
        // 图标按钮按下：记录起点，等待 移动（拖动）/ 松开（点击）判定
        pressRef.current = {
          x: e.clientX,
          y: e.clientY,
          key: (btn.dataset.key as ToolKey | undefined) ?? null,
          dragged: false,
        };
      }}
      onMouseMove={(e) => {
        const p = pressRef.current;
        if (!p || p.dragged) return;
        if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > DRAG_THRESHOLD) {
          startDrag();
        }
      }}
      onMouseUp={(e) => {
        const p = pressRef.current;
        pressRef.current = null;
        // 未拖动 = 点击：手动触发呼出（不走 click 事件，避免拖动误触/事件丢失）
        if (p && !p.dragged && p.key) {
          e.preventDefault();
          void diagLog(`[toolbar] click ${p.key}`);
          void panelToggle(p.key);
        }
      }}
    >
      {tools.map((key) => {
        const tool = TOOLS[key];
        if (!tool) return null;
        return (
          <button
            key={key}
            type="button"
            className="toolbar-btn"
            data-key={key}
            title={tool.label}
          >
            <span className="toolbar-icon" style={{ color: tool.color }}>
              {tool.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
