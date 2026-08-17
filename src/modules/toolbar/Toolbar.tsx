/** 悬浮工具栏：常驻小工具条（类似输入法工具栏），点击图标快速呼出各面板。
 *  工具列表由配置 toolbar.tools 决定（设置页可勾选）；窗口常驻置顶、
 *  失焦不隐藏（不用 usePanelCommon 的失焦隐藏）。
 *  交互：按下不移动松开 = 点击呼出（100% 可靠，不走 click 事件）；
 *  按下移动超过阈值 = 拖动窗口位置。
 *  动态反馈（磁吸）：鼠标在图标间移动时，图标随鼠标位置实时产生
 *  「磁性牵引」——靠近的图标放大提亮，两侧图标被轻微拉向鼠标。
 *  用 requestAnimationFrame + 直接写 DOM transform，零 React 重渲染，最流畅。 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { AppConfig, ToolKey } from "../../types";
import { panelActive, panelToggle } from "../../core/tauri";
import { EVT_CONFIG_CHANGED, EVT_PANEL_VISIBILITY, onEvent } from "../../core/events";
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

/** 紧凑尺寸：按钮 28px、间距 2px、内边距 4px（比原 36/3/5 缩小约 1/4） */
const BTN = 28;
const GAP = 2;
const PAD = 4;

/** 磁吸参数（可调）：牵引强度 / 距离衰减 / 放大强度 */
const PULL_STRENGTH = 5; // 最大位移 px
const PULL_FALLOFF = 55; // 牵引随距离衰减的尺度（越小越"集中在鼠标附近"）
const SCALE_STRENGTH = 0.3; // 最大放大倍率增量
const SCALE_FALLOFF = 900; // 放大随距离平方衰减（高斯）

/** 工具定义：图标（含专属辨识色，收编为 theme.css 的 --tool-* 令牌，
 *  深色主题自动适配）+ 提示文案（顺序即设置页勾选顺序）。
 *  图标平时显示中性灰，hover/磁吸时亮出辨识色——克制的高级感。 */
export const TOOLS: Record<ToolKey, { label: string; color: string; icon: React.ReactNode }> = {
  clipboard: {
    label: "剪贴板",
    color: "var(--tool-clipboard)",
    icon: <IconClipboard size={14} />,
  },
  folder: {
    label: "文件夹",
    color: "var(--tool-folder)",
    icon: <IconFolder size={14} />,
  },
  credentials: {
    label: "账号密码",
    color: "var(--tool-credentials)",
    icon: <IconKey size={14} />,
  },
  translation: {
    label: "划词翻译",
    color: "var(--tool-translation)",
    icon: <IconTranslate size={14} />,
  },
  port: {
    label: "端口工具",
    color: "var(--tool-port)",
    icon: <IconPort size={14} />,
  },
  settings: {
    label: "打开设置",
    color: "var(--tool-settings)",
    icon: <IconSettings size={14} />,
  },
};

/** 可用工具列表（设置页勾选用） */
export const TOOL_KEYS = Object.keys(TOOLS) as ToolKey[];

/** 窗口标签 → 工具栏键名映射（面板显隐广播/查询的 label 反查工具） */
const PANEL_LABEL_TO_KEY: Record<string, ToolKey> = {
  "clipboard-panel": "clipboard",
  "folder-panel": "folder",
  "credential-panel": "credentials",
  "port-panel": "port",
  settings: "settings",
  "translate-popup": "translation",
};

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
  /** 当前打开的面板集合（高亮对应图标）。各面板独立开合、可同时显示多个，
   *  故用集合而非单个 key（后打开的覆盖前一个的旧实现已移除） */
  const [activeKeys, setActiveKeys] = useState<ReadonlySet<ToolKey>>(new Set());

  /** 刷新高亮：全量查询当前可见面板（比增量维护事件状态更可靠，杜绝漂移） */
  const refreshActive = async () => {
    const labels = await panelActive();
    const keys = new Set<ToolKey>();
    for (const label of labels) {
      const k = PANEL_LABEL_TO_KEY[label];
      if (k) keys.add(k);
    }
    setActiveKeys(keys);
  };

  // 面板显隐事件 → 刷新高亮（覆盖后端 toggle_panel / translate 关闭 / 前端 hide 全路径）；
  // 事件仅是"触发器"，状态始终来自真实查询
  useEffect(() => {
    void refreshActive();
    let cleanup: (() => void) | undefined;
    onEvent<{ label: string; visible: boolean }>(EVT_PANEL_VISIBILITY, () => {
      void refreshActive();
    }).then((un) => {
      cleanup = un;
    });
    return () => cleanup?.();
  }, []);

  // ---- 磁吸交互：DOM 直写（refs + rAF），避免每帧 React 重渲染 ----
  const barRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** 鼠标相对工具栏中心的 x（px）；null = 鼠标不在工具栏上 */
  const mouseXRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  /** 计算每个图标的磁吸位移与放大并写入 transform（每帧调用） */
  const applyMagnet = () => {
    rafRef.current = 0;
    const mx = mouseXRef.current;
    const btns = btnRefs.current;
    const n = btns.length;
    if (mx == null || n === 0) {
      for (const b of btns) if (b) b.style.transform = "";
      return;
    }
    const totalW = n * (BTN + GAP) - GAP;
    for (let i = 0; i < n; i++) {
      const btn = btns[i];
      if (!btn) continue;
      // 图标中心相对工具栏中心的偏移
      const center = i * (BTN + GAP) + BTN / 2 - totalW / 2;
      const dist = mx - center;
      // 磁吸位移：tanh 平滑——近处线性牵引、远处饱和限幅（≤ ±PULL_STRENGTH）
      const shift = Math.tanh(dist / PULL_FALLOFF) * PULL_STRENGTH;
      // 放大：高斯——鼠标越近越大，悬停时约 1.3
      const scale = 1 + SCALE_STRENGTH * Math.exp(-(dist * dist) / SCALE_FALLOFF);
      btn.style.transform = `translateX(${shift.toFixed(2)}px) scale(${scale.toFixed(3)})`;
      // 被放大的图标浮在两侧之上，避免边缘重叠
      btn.style.zIndex = scale > 1.12 ? "2" : "1";
    }
  };

  /** 鼠标移动：记录位置并安排下一帧更新（拖动判定同步进行） */
  const handleMove = (e: React.MouseEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (rect) {
      mouseXRef.current = e.clientX - rect.left - rect.width / 2;
      if (!rafRef.current) rafRef.current = requestAnimationFrame(applyMagnet);
    }
    // 拖动判定（按下状态下）
    const p = pressRef.current;
    if (!p || p.dragged) return;
    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > DRAG_THRESHOLD) {
      if (pressRef.current) pressRef.current.dragged = true;
      getCurrentWindow().startDragging().catch(() => undefined);
    }
  };

  /** 鼠标离开：图标复位 */
  const handleLeave = () => {
    mouseXRef.current = null;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(applyMagnet);
  };

  // 卸载时取消 rAF
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

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

  // 按配置的工具数量调整窗口尺寸（按钮 28 + 间距 2 + 两端 4px padding）
  const tools = config?.toolbar?.tools ?? [];
  useEffect(() => {
    if (!tools.length) return;
    getCurrentWindow()
      .setSize(new LogicalSize(tools.length * (BTN + GAP) + PAD * 2, BTN + PAD * 2))
      .catch(() => undefined);
  }, [tools.length]);

  if (!config?.toolbar?.enabled) return null;
  if (!tools.length) return null;

  return (
    <div
      ref={barRef}
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
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
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
      {tools.map((key, i) => {
        const tool = TOOLS[key];
        if (!tool) return null;
        const active = activeKeys.has(key);
        return (
          <button
            key={key}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            className={`toolbar-btn${active ? " active" : ""}`}
            data-key={key}
            title={active ? `${tool.label}（面板已打开）` : tool.label}
            style={{ transition: "transform 90ms var(--ease-out)" }}
          >
            <span
              className="toolbar-icon"
              style={{ "--tool-color": tool.color } as CSSProperties}
            >
              {tool.icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}
