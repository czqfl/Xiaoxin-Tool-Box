/** 悬浮工具栏：常驻小工具条（类似输入法工具栏），点击图标快速呼出各面板。
 *  工具列表由配置 toolbar.tools 决定（设置页可勾选）；窗口常驻置顶、
 *  失焦不隐藏（不用 usePanelCommon 的失焦隐藏）。
 *  拖动：按住任意图标轻微移动即进入窗口拖动（未移动松开 = 点击呼出面板）。 */
import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { AppConfig, ToolKey } from "../../types";
import { panelToggle } from "../../core/tauri";
import { EVT_CONFIG_CHANGED, onEvent } from "../../core/events";
import { useConfigStore } from "../../stores/configStore";
import {
  IconClipboard,
  IconFolder,
  IconKey,
  IconSettings,
  IconTerminal,
  IconTranslate,
} from "../../components/icons";
import "./toolbar.css";

/** 工具定义：图标 + 提示文案（顺序即设置页勾选顺序） */
export const TOOLS: Record<ToolKey, { label: string; icon: React.ReactNode }> = {
  clipboard: { label: "剪贴板", icon: <IconClipboard size={16} /> },
  folder: { label: "文件夹", icon: <IconFolder size={16} /> },
  credentials: { label: "账号密码", icon: <IconKey size={16} /> },
  translation: { label: "划词翻译", icon: <IconTranslate size={16} /> },
  port: { label: "端口工具", icon: <IconTerminal size={16} /> },
  settings: { label: "打开设置", icon: <IconSettings size={16} /> },
};

/** 可用工具列表（设置页勾选用） */
export const TOOL_KEYS = Object.keys(TOOLS) as ToolKey[];

const DRAG_THRESHOLD = 5;

export function Toolbar() {
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);
  /** 按下起点与是否已进入拖动（供按钮"按住拖动/点击"区分） */
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

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

  // 按配置的工具数量调整窗口宽度（图标 42px/个 + 两端 padding）
  const tools = config?.toolbar?.tools ?? [];
  useEffect(() => {
    if (!tools.length) return;
    getCurrentWindow()
      .setSize(new LogicalSize(tools.length * 42 + 10, 46))
      .catch(() => undefined);
  }, [tools.length]);

  if (!config?.toolbar?.enabled) return null;
  if (!tools.length) return null;

  const startDrag = () => {
    draggingRef.current = true;
    getCurrentWindow().startDragging().catch(() => undefined);
  };

  return (
    <div
      className="toolbar"
      onMouseDown={(e) => {
        // 空白处按下：直接进入窗口拖动
        if (!(e.target as HTMLElement).closest("button")) {
          pressRef.current = null;
          startDrag();
          return;
        }
        // 按钮上按下：记录起点，移动超阈值进入拖动（未移动松开 = 点击）
        pressRef.current = { x: e.clientX, y: e.clientY };
        draggingRef.current = false;
      }}
      onMouseMove={(e) => {
        const p = pressRef.current;
        if (!p || draggingRef.current) return;
        if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > DRAG_THRESHOLD) {
          startDrag();
        }
      }}
      onMouseUp={() => {
        pressRef.current = null;
        // 拖动结束后短暂抑制紧随的 click，避免误触呼出面板
        setTimeout(() => {
          draggingRef.current = false;
        }, 80);
      }}
    >
      {tools.map((key) => {
        const tool = TOOLS[key];
        if (!tool) return null;
        return (
          <button
            key={key}
            className="toolbar-btn"
            title={tool.label}
            onClick={(e) => {
              if (draggingRef.current) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              void panelToggle(key);
            }}
          >
            {tool.icon}
          </button>
        );
      })}
    </div>
  );
}
