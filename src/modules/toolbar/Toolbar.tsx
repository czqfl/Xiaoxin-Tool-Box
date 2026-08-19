/** 悬浮工具栏：常驻小工具条（类似输入法工具栏），点击图标快速呼出各面板。
 *  工具列表由配置 toolbar.tools 决定（设置页可勾选）；窗口常驻置顶、
 *  失焦不隐藏（不用 usePanelCommon 的失焦隐藏）。
 *  交互：按下不移动松开 = 点击呼出（100% 可靠，不走 click 事件）；
 *  按下移动超过阈值 = 拖动窗口位置。
 *  动态反馈（磁吸）：鼠标在图标间移动时，图标随鼠标位置实时产生
 *  「磁性牵引」——靠近的图标放大提亮，两侧图标被轻微拉向鼠标。
 *  用 requestAnimationFrame + 直接写 DOM transform，零 React 重渲染，最流畅。 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
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
  IconSticky,
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
  sticky: {
    label: "便签",
    color: "var(--tool-sticky)",
    icon: <IconSticky size={14} />,
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
  "sticky-history": "sticky",
};

/** 拖动判定阈值（px）：超过视为拖动窗口，否则视为点击。
 *  阈值适当放宽，避免点击时轻微手抖被误判成拖动（"点了没反应"）。 */
const DRAG_THRESHOLD = 10;

/** 贴边自动收起参数 */
const SLIVER = 4; // 收起后露出的像素（屏幕内可见的一小条）
const EDGE_PAD = 4; // 贴边判定容差（窗口距显示器边缘 ≤ 此值视为贴边）
const NEAR_MARGIN = 14; // 靠近边缘自动弹出的判定容差（光标距边缘 ≤ 此值）
const HIDE_DELAY = 350; // 光标离开贴边工具栏后，延时收起（ms）

/** Rust 返回的工具栏几何快照（物理像素） */
interface ToolbarGeometry {
  cursor_x: number;
  cursor_y: number;
  win_x: number;
  win_y: number;
  win_w: number;
  win_h: number;
  mon_x: number;
  mon_y: number;
  mon_w: number;
  mon_h: number;
}

type Edge = "left" | "right" | "top" | "bottom";

export function Toolbar() {
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);
  /** 排列方向（供 rAF 磁吸闭包读取；配置变化时经 .current 同步） */
  const orientation = config?.toolbar?.orientation ?? "horizontal";
  const isVertical = orientation === "vertical";
  const verticalRef = useRef(isVertical);
  verticalRef.current = isVertical;

  /** 贴边自动收起状态（配置开关经 ref 同步给轮询闭包） */
  const autoHideRef = useRef(config?.toolbar?.auto_hide ?? true);
  autoHideRef.current = config?.toolbar?.auto_hide ?? true;
  const collapsedRef = useRef(false); // 是否已收起（滑出屏幕）
  const savedPosRef = useRef<{ x: number; y: number } | null>(null); // 收起前位置
  const edgeRef = useRef<Edge | null>(null); // 当前贴边方向
  const hideTimerRef = useRef<number | undefined>(undefined); // 收起延时
  /** 已离开"边缘附近区域"：弹出后光标必须先真正离开边缘，收起计时才生效——
   *  修复"收起前连闪"（收起→光标仍在边缘→弹出→再收起 的循环闪烁） */
  const edgeLeftRef = useRef(true);

  /** 判断工具栏是否贴显示器边缘 */
  function detectEdge(g: ToolbarGeometry): Edge | null {
    if (Math.abs(g.win_x - g.mon_x) <= EDGE_PAD) return "left";
    if (Math.abs(g.win_x + g.win_w - (g.mon_x + g.mon_w)) <= EDGE_PAD) return "right";
    if (Math.abs(g.win_y - g.mon_y) <= EDGE_PAD) return "top";
    if (Math.abs(g.win_y + g.win_h - (g.mon_y + g.mon_h)) <= EDGE_PAD) return "bottom";
    return null;
  }

  /** 光标是否位于「收起条」附近（屏幕边缘 + 与工具栏另一轴范围重叠） */
  function cursorNearEdge(g: ToolbarGeometry, edge: Edge): boolean {
    const cx = g.cursor_x;
    const cy = g.cursor_y;
    if (edge === "left" || edge === "right") {
      const nearX =
        edge === "left"
          ? cx <= g.mon_x + NEAR_MARGIN
          : cx >= g.mon_x + g.mon_w - NEAR_MARGIN;
      const inY = cy >= g.win_y - NEAR_MARGIN && cy <= g.win_y + g.win_h + NEAR_MARGIN;
      return nearX && inY;
    }
    const nearY =
      edge === "top" ? cy <= g.mon_y + NEAR_MARGIN : cy >= g.mon_y + g.mon_h - NEAR_MARGIN;
    const inX = cx >= g.win_x - NEAR_MARGIN && cx <= g.win_x + g.win_w + NEAR_MARGIN;
    return nearY && inX;
  }

  /** 收起：把窗口滑出屏幕，仅露 SLIVER 像素（记住原位，弹出时恢复） */
  async function collapse(g: ToolbarGeometry, edge: Edge) {
    if (collapsedRef.current) return;
    savedPosRef.current = { x: g.win_x, y: g.win_y };
    edgeRef.current = edge;
    collapsedRef.current = true;
    let nx = g.win_x;
    let ny = g.win_y;
    if (edge === "left") nx = g.mon_x - g.win_w + SLIVER;
    else if (edge === "right") nx = g.mon_x + g.mon_w - SLIVER;
    else if (edge === "top") ny = g.mon_y - g.win_h + SLIVER;
    else ny = g.mon_y + g.mon_h - SLIVER;
    await getCurrentWindow()
      .setPosition(new LogicalPosition(nx, ny))
      .catch(() => {});
  }

  /** 弹出：恢复到收起前的位置 */
  async function expand() {
    if (!collapsedRef.current) return;
    const saved = savedPosRef.current;
    collapsedRef.current = false;
    edgeRef.current = null;
    savedPosRef.current = null;
    if (saved) {
      await getCurrentWindow()
        .setPosition(new LogicalPosition(saved.x, saved.y))
        .catch(() => {});
    }
  }
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
      // 便签窗口 label 是 note_<id>（id 不定），前缀匹配归入"便签"
      const k =
        PANEL_LABEL_TO_KEY[label] ??
        (label.startsWith("note_") ? ("sticky" satisfies ToolKey) : undefined);
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
  /** 鼠标相对工具栏中心的坐标（px）；null = 鼠标不在工具栏上。
   *  水平排列用 x、竖直排列用 y（见 applyMagnet）。 */
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef(0);

  /** 计算每个图标的磁吸位移与放大并写入 transform（每帧调用） */
  const applyMagnet = () => {
    rafRef.current = 0;
    const m = mouseRef.current;
    const btns = btnRefs.current;
    const n = btns.length;
    if (!m || n === 0) {
      for (const b of btns) if (b) b.style.transform = "";
      return;
    }
    const total = n * (BTN + GAP) - GAP;
    for (let i = 0; i < n; i++) {
      const btn = btns[i];
      if (!btn) continue;
      // 图标中心相对工具栏中心的偏移（水平看 x、竖直看 y）
      const center = i * (BTN + GAP) + BTN / 2 - total / 2;
      const dist = verticalRef.current ? m.y - center : m.x - center;
      // 磁吸位移：tanh 平滑——近处线性牵引、远处饱和限幅（≤ ±PULL_STRENGTH）
      const shift = Math.tanh(dist / PULL_FALLOFF) * PULL_STRENGTH;
      // 放大：高斯——鼠标越近越大，悬停时约 1.3
      const scale = 1 + SCALE_STRENGTH * Math.exp(-(dist * dist) / SCALE_FALLOFF);
      btn.style.transform = verticalRef.current
        ? `translateY(${shift.toFixed(2)}px) scale(${scale.toFixed(3)})`
        : `translateX(${shift.toFixed(2)}px) scale(${scale.toFixed(3)})`;
      // 被放大的图标浮在两侧之上，避免边缘重叠
      btn.style.zIndex = scale > 1.12 ? "2" : "1";
    }
  };

  /** 鼠标移动：记录位置并安排下一帧更新（拖动判定同步进行） */
  const handleMove = (e: React.MouseEvent) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (rect) {
      mouseRef.current = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
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
    mouseRef.current = null;
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

  // 按配置的工具数量与排列方向调整窗口尺寸（按钮 28 + 间距 2 + 两端 4px padding）
  const tools = config?.toolbar?.tools ?? [];
  useEffect(() => {
    if (!tools.length) return;
    const main = tools.length * (BTN + GAP) + PAD * 2;
    const cross = BTN + PAD * 2;
    getCurrentWindow()
      .setSize(new LogicalSize(isVertical ? cross : main, isVertical ? main : cross))
      .catch(() => undefined);
  }, [tools.length, isVertical]);

  // 点击穿透 + 贴边自动收起：统一轮询（~200ms）。
  // 穿透：光标在窗口内 → 关穿透（按钮可交互）；否则 → 开穿透（不挡桌面点击）。
  // 自动收起：工具栏贴边且光标离开 → 延时滑出屏幕（露一小条）；
  //           光标靠近屏幕边缘/悬停收起条 → 滑回原位。
  useEffect(() => {
    let lastThrough = false;
    const probe = async () => {
      try {
        const geo = await invoke<ToolbarGeometry>("toolbar_geometry");
        const inside =
          geo.cursor_x >= geo.win_x &&
          geo.cursor_x <= geo.win_x + geo.win_w &&
          geo.cursor_y >= geo.win_y &&
          geo.cursor_y <= geo.win_y + geo.win_h;
        // 1) 点击穿透（保持原有行为）
        const shouldThrough = !inside;
        if (shouldThrough !== lastThrough) {
          lastThrough = shouldThrough;
          await invoke("toolbar_set_click_through", { on: shouldThrough }).catch(() => {});
        }
        // 2) 贴边自动收起 / 靠近弹出
        if (!autoHideRef.current) return;
        const edge = detectEdge(geo);
        if (collapsedRef.current) {
          // 已收起：光标靠近屏幕边缘（或悬停露出的条）→ 弹出
          if (edge && (cursorNearEdge(geo, edge) || inside)) {
            await expand();
            // 弹出后需光标"离开边缘附近"才允许再次收起（防收起-弹出循环闪烁）
            edgeLeftRef.current = false;
          }
          return;
        }
        if (edge) {
          // 贴边：光标离开 → 延时收起；回来 → 取消计时
          if (!inside) {
            // 只有"已离开边缘附近"才允许计时收起——光标停在贴边边缘不会
            // 反复收起/弹出（修复"收起前连闪好几次"）
            if (!cursorNearEdge(geo, edge)) edgeLeftRef.current = true;
            if (edgeLeftRef.current && !hideTimerRef.current) {
              hideTimerRef.current = window.setTimeout(() => {
                hideTimerRef.current = undefined;
                void collapse(geo, edge);
              }, HIDE_DELAY);
            }
          } else {
            // 光标回到窗口：允许下次离开时收起
            edgeLeftRef.current = false;
            if (hideTimerRef.current) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = undefined;
            }
          }
        } else {
          // 已离开边缘：允许收起，取消待执行的收起
          edgeLeftRef.current = true;
          if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = undefined;
          }
        }
      } catch {
        // 后端异常时强制恢复交互（工具栏可用优先，绝不"穿透死"）
        if (lastThrough) {
          lastThrough = false;
          await invoke("toolbar_set_click_through", { on: false }).catch(() => {});
        }
      }
    };
    void probe();
    const timer = window.setInterval(() => void probe(), 200);
    return () => window.clearInterval(timer);
  }, []);

  if (!config?.toolbar?.enabled) return null;
  if (!tools.length) return null;

  return (
    <div
      ref={barRef}
      className={`toolbar${isVertical ? " vertical" : ""}`}
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
