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

/** 贴边自动收起参数（参考便签 XiaoxinStickyNote 的靠边收起语义：
 *  事件驱动——鼠标离开窗口收起、悬停收起条弹出、弹出后鼠标不在窗口内自动再收起） */
const SLIVER = 12; // 收起后留在屏幕内的可见条宽度（够悬停，避免太窄误触弹出）
const EDGE_MARGIN = 12; // 距屏幕边缘多少像素内算"贴边"
const HIDE_DELAY = 250; // 鼠标离开贴边工具栏后，延时收起（ms）
const SLIDE_MS = 160; // 收起/弹出的滑动动画时长（ms，轻快不拖沓）

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
  const pinnedEdgeRef = useRef<Edge | null>(null); // 当前贴边方向（轮询记录）
  const restorePosRef = useRef<{ x: number; y: number } | null>(null); // 收起前位置
  const restoreWaRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null); // 收起时所在显示器工作区
  const pointerInsideRef = useRef(false); // 鼠标是否在窗口内（DOM 事件跟踪）
  const snappingRef = useRef(false); // 收起/弹出动画进行中
  const hideTimerRef = useRef<number | undefined>(undefined); // 收起延时

  /** 判断工具栏是否贴显示器边缘（容差 EDGE_MARGIN） */
  function detectEdge(g: ToolbarGeometry): Edge | null {
    if (Math.abs(g.win_x - g.mon_x) <= EDGE_MARGIN) return "left";
    if (Math.abs(g.win_x + g.win_w - (g.mon_x + g.mon_w)) <= EDGE_MARGIN) return "right";
    if (Math.abs(g.win_y - g.mon_y) <= EDGE_MARGIN) return "top";
    if (Math.abs(g.win_y + g.win_h - (g.mon_y + g.mon_h)) <= EDGE_MARGIN) return "bottom";
    return null;
  }

  // ---- 靠边收起/弹出（XiaoxinStickyNote 同款）----
  // 缓动：弹出用轻微回弹（easeOutBack），收起用缓入（被"吸入"边缘）
  const easeOutBackSoft = (t: number): number => {
    const c1 = 0.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const easeInCubic = (t: number): number => t * t * t;

  /** rAF 逐帧移动窗口物理位置（替代瞬移，平滑滑入滑出） */
  function animateWindowTo(tx: number, ty: number, duration: number, easing: (t: number) => number): Promise<void> {
    return new Promise((resolve) => {
      const win = getCurrentWindow();
      void win
        .outerPosition()
        .then((start) => {
          const sx = start.x;
          const sy = start.y;
          const t0 = performance.now();
          const step = (now: number) => {
            const t = Math.min(1, (now - t0) / duration);
            const e = easing(t);
            const x = Math.round(sx + (tx - sx) * e);
            const y = Math.round(sy + (ty - sy) * e);
            void win.setPosition(new LogicalPosition(x, y)).catch(() => {});
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        })
        .catch(() => resolve());
    });
  }

  /** 收起：平滑滑出屏幕，仅露 SLIVER 条（记录原位 + 所在工作区，供弹出夹取） */
  async function collapseToEdge() {
    const edge = pinnedEdgeRef.current;
    if (!edge || collapsedRef.current || snappingRef.current) return;
    try {
      snappingRef.current = true;
      const geo = await invoke<ToolbarGeometry>("toolbar_geometry");
      restorePosRef.current = { x: geo.win_x, y: geo.win_y };
      restoreWaRef.current = { x: geo.mon_x, y: geo.mon_y, w: geo.mon_w, h: geo.mon_h };
      let x = geo.win_x;
      let y = geo.win_y;
      if (edge === "left") x = geo.mon_x - geo.win_w + SLIVER;
      else if (edge === "right") x = geo.mon_x + geo.mon_w - SLIVER;
      else if (edge === "top") y = geo.mon_y - geo.win_h + SLIVER;
      else y = geo.mon_y + geo.mon_h - SLIVER;
      await animateWindowTo(x, y, SLIDE_MS, easeInCubic);
      collapsedRef.current = true;
      // 显示收起指示条（留在屏幕内的那侧，圆角小条）
      const snub = snubRef.current;
      if (snub) snub.className = `toolbar-snub snub-${edge} show`;
    } catch (e) {
      console.error("贴边收起失败:", e);
    } finally {
      window.setTimeout(() => {
        snappingRef.current = false;
      }, SLIDE_MS + 80);
    }
  }

  /** 弹出：滑回收起前的位置（夹取到工作区内，保证完全可见）；
   *  byHover=true（悬停条触发）：完全弹出后若鼠标已不在窗口内 → 自动再收起，
   *  避免便签/工具栏"弹出后空挂"；也因此不会反复弹出——收起后光标不在窗口
   *  上（无 mouseenter），不再触发弹出。 */
  async function expandFromEdge(byHover = false) {
    if (!collapsedRef.current || !restorePosRef.current || snappingRef.current) return;
    try {
      snappingRef.current = true;
      const saved = restorePosRef.current;
      const wa = restoreWaRef.current;
      const win = getCurrentWindow();
      const size = await win.outerSize().catch(() => null);
      let tx = saved.x;
      let ty = saved.y;
      if (wa && size) {
        const maxX = wa.x + wa.w - size.width;
        const maxY = wa.y + wa.h - size.height;
        tx = Math.min(Math.max(tx, wa.x), Math.max(wa.x, maxX));
        ty = Math.min(Math.max(ty, wa.y), Math.max(wa.y, maxY));
      }
      await animateWindowTo(tx, ty, SLIDE_MS, easeOutBackSoft);
      collapsedRef.current = false;
      restorePosRef.current = null;
      restoreWaRef.current = null;
      // 隐藏收起指示条
      const snub = snubRef.current;
      if (snub) snub.className = "toolbar-snub";
    } catch (e) {
      console.error("贴边弹出失败:", e);
    } finally {
      window.setTimeout(() => {
        snappingRef.current = false;
        // 悬停触发的弹出：弹出完成时鼠标若已不在窗口内 → 自动收起
        if (byHover && autoHideRef.current && pinnedEdgeRef.current && !pointerInsideRef.current && !collapsedRef.current) {
          void collapseToEdge();
        }
      }, SLIDE_MS + 60);
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
  /** 收起指示条（贴边收起后留在屏幕内的品牌色圆角小条） */
  const snubRef = useRef<HTMLDivElement>(null);
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

  /** 鼠标进入窗口（含收起条）：图标磁吸恢复 + 收起态 → 悬停弹出 */
  const handleEnter = () => {
    pointerInsideRef.current = true;
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }
    if (collapsedRef.current && autoHideRef.current && !snappingRef.current) {
      void expandFromEdge(true);
    }
  };

  /** 鼠标离开：图标复位 + 贴边收起（事件驱动——离开窗口即延时收起） */
  const handleLeave = () => {
    mouseRef.current = null;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(applyMagnet);
    pointerInsideRef.current = false;
    if (
      !collapsedRef.current &&
      pinnedEdgeRef.current &&
      autoHideRef.current &&
      !snappingRef.current
    ) {
      if (!hideTimerRef.current) {
        hideTimerRef.current = window.setTimeout(() => {
          hideTimerRef.current = undefined;
          void collapseToEdge();
        }, HIDE_DELAY);
      }
    }
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
        // 点击穿透（保持原有行为）
        const shouldThrough = !inside;
        if (shouldThrough !== lastThrough) {
          lastThrough = shouldThrough;
          await invoke("toolbar_set_click_through", { on: shouldThrough }).catch(() => {});
        }
        // 贴边方向记录（供鼠标离开时收起用）；收起态保持原方向，不覆盖
        if (!collapsedRef.current) {
          pinnedEdgeRef.current = detectEdge(geo);
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
      onMouseEnter={handleEnter}
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
      {/* 收起指示条：贴边收起后留在屏幕内的精致圆角小条（视觉上不再是
          露出的"半截窗口"，而是品牌色圆角胶囊，QQ 贴边同款质感） */}
      <div ref={snubRef} className="toolbar-snub" aria-hidden="true" />
    </div>
  );
}
