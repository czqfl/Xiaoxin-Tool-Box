/** 悬浮工具栏：常驻小工具条（类似输入法工具栏），点击图标快速呼出各面板。
 *  工具列表由配置 toolbar.tools 决定（设置页可勾选）；窗口常驻置顶、
 *  失焦不隐藏（不用 usePanelCommon 的失焦隐藏）。
 *  交互：按下不移动松开 = 点击呼出（100% 可靠，不走 click 事件）；
 *  按下移动超过阈值 = 拖动窗口位置。
 *  动态反馈（磁吸）：鼠标在图标间移动时，图标随鼠标位置实时产生
 *  「磁性牵引」——靠近的图标放大提亮，两侧图标被轻微拉向鼠标。
 *  用 requestAnimationFrame + 直接写 DOM transform，零 React 重渲染，最流畅。 */
import { useEffect, useRef, useState, cloneElement, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import type { AppConfig, ToolKey } from "../../types";
import { panelActive, panelToggle } from "../../core/tauri";
import { EVT_CONFIG_CHANGED, EVT_PANEL_VISIBILITY, onEvent } from "../../core/events";
import { diagLog } from "../../core/tauri";
import { useConfigStore } from "../../stores/configStore";
import { featureEnabled } from "../../settings/FeaturePage";
import {
  IconClipboard,
  IconFiles,
  IconFolder,
  IconKey,
  IconPort,
  IconRecord,
  IconSettings,
  IconSnippet,
  IconTranslate,
  IconScreenshot,
} from "../../components/icons";
import "./toolbar.css";

/** 尺寸档位：按钮边长 + 图标边长（设置页「悬浮工具栏」可选，默认 small） */
const SIZE_PRESETS: Record<string, { btn: number; icon: number }> = {
  small: { btn: 28, icon: 14 },
  medium: { btn: 34, icon: 18 },
  large: { btn: 40, icon: 22 },
};
const GAP = 2;
const PAD = 4;

/** 纾佸惛鍙傛暟锛堝彲璋冿級锛氱壍寮曞己搴?/ 璺濈琛板噺 / 鏀惧ぇ寮哄害 */
const PULL_STRENGTH = 5; // 鏈€澶т綅绉?px
const PULL_FALLOFF = 55; // 牵引随距离衰减的尺度（越小越"集中在鼠标附近"）
const SCALE_STRENGTH = 0.3; // 最大放大倍率增量
const SCALE_FALLOFF = 900; // 鏀惧ぇ闅忚窛绂诲钩鏂硅“鍑忥紙楂樻柉锛?

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
  files: {
    label: "快速文件",
    color: "var(--tool-files)",
    icon: <IconFiles size={14} />,
  },
  snippets: {
    label: "常用语速贴",
    color: "var(--tool-snippets)",
    icon: <IconSnippet size={14} />,
  },
  screenshot: {
    label: "截图",
    color: "var(--tool-screenshot)",
    icon: <IconScreenshot size={14} />,
  },
  recorder: {
    label: "屏幕录制",
    color: "#ff5c5c",
    icon: <IconRecord size={14} />,
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
  "files-panel": "files",
  "snippets-panel": "snippets",
  settings: "settings",
  "translate-popup": "translation",
};

/** 拖动判定阈值（px）：超过视为拖动窗口，否则视为点击。
 *  阈值适当放宽，避免点击时轻微手抖被误判成拖动（"点了没反应"）。 */
const DRAG_THRESHOLD = 10;

/** 贴边自动收起参数（参考桌面悬浮工具条靠边收起语义：
 *  事件驱动——鼠标离开窗口收起、悬停收起条弹出、弹出后鼠标不在窗口内自动再收起） */
const SLIVER = 12; // 鏀惰捣鍚庨湶鍑虹殑绐楀彛鐪熷疄杈圭紭瀹藉害锛?2px锛氬瀹藉鏄剧溂锛岄厤鍝佺墝鑹蹭寒杞級
const EDGE_MARGIN = 12; // 璺濆睆骞曡竟缂樺灏戝儚绱犲唴绠?璐磋竟"
const HIDE_DELAY = 250; // 鼠标离开贴边工具栏后，延时收起（ms）
const SLIDE_MS = 160; // 收起/弹出的滑动动画时长（ms，轻快不拖沓）
/** 收起后：光标靠近屏幕边缘多少像素内自动弹出（物理像素）。
 *  关键修复：此前恢复只靠 onMouseEnter 命中 4px 细边，几乎不可达 → 工具栏"消失找不到"。
 *  改为轮询检测光标靠近停靠边缘即弹出，无需精确戳中细边。 */
const EDGE_REVEAL = 70;

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
  /** 尺寸档位（设置页可调）：按钮/图标边长随档位变化，磁吸与窗口尺寸同步计算 */
  const sizeKey = config?.toolbar?.size ?? "small";
  const preset = SIZE_PRESETS[sizeKey] ?? SIZE_PRESETS.small;
  const BTN = preset.btn;
  const iconSize = preset.icon;
  /** 排列方向（供 rAF 磁吸闭包读取；配置变化时经 .current 同步） */
  const orientation = config?.toolbar?.orientation ?? "horizontal";
  const isVertical = orientation === "vertical";
  const verticalRef = useRef(isVertical);
  verticalRef.current = isVertical;

  /** 贴边自动收起状态（配置开关经 ref 同步给轮询闭包） */
  const autoHideRef = useRef(config?.toolbar?.auto_hide ?? true);
  autoHideRef.current = config?.toolbar?.auto_hide ?? true;
  const collapsedRef = useRef(false); // 是否已收起（滑出屏幕外）
  const pinnedEdgeRef = useRef<Edge | null>(null); // 当前贴边方向（轮询记录）
  const restorePosRef = useRef<{ x: number; y: number } | null>(null); // 收起前位置
  const restoreWaRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null); // 收起时所在显示器工作区
  const pointerInsideRef = useRef(false); // 鼠标是否在窗口内（DOM 事件跟踪）
  const snappingRef = useRef(false); // 收起/弹出动画进行中
  const hideTimerRef = useRef<number | undefined>(undefined); // 收起延时

  /** 鍒ゆ柇宸ュ叿鏍忔槸鍚﹁创鏄剧ず鍣ㄨ竟缂橈紙瀹瑰樊 EDGE_MARGIN锛?*/
  function detectEdge(g: ToolbarGeometry): Edge | null {
    if (Math.abs(g.win_x - g.mon_x) <= EDGE_MARGIN) return "left";
    if (Math.abs(g.win_x + g.win_w - (g.mon_x + g.mon_w)) <= EDGE_MARGIN) return "right";
    if (Math.abs(g.win_y - g.mon_y) <= EDGE_MARGIN) return "top";
    if (Math.abs(g.win_y + g.win_h - (g.mon_y + g.mon_h)) <= EDGE_MARGIN) return "bottom";
    return null;
  }

  /** 判断光标是否靠近某条边（阈值内，物理像素）——用于"靠近自动弹出"恢复 */
  function cursorNearEdge(g: ToolbarGeometry, edge: Edge, threshold: number): boolean {
    switch (edge) {
      case "left":
        return g.cursor_x <= g.mon_x + threshold;
      case "right":
        return g.cursor_x >= g.mon_x + g.mon_w - threshold;
      case "top":
        return g.cursor_y <= g.mon_y + threshold;
      case "bottom":
        return g.cursor_y >= g.mon_y + g.mon_h - threshold;
    }
  }

  // ---- 闈犺竟鏀惰捣/寮瑰嚭锛堟偓娴伐鍏锋潯璐磋竟鍚搁檮锛?---
  // 缓动：弹出用轻微回弹（easeOutBack），收起用缓入（被"吸入"边缘）
  const easeOutBackSoft = (t: number): number => {
    const c1 = 0.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const easeInCubic = (t: number): number => t * t * t;

  /** rAF 逐帧移动窗口物理位置（替代瞬移，平滑滑入滑出）。
   *  clip=true 时逐帧调用 toolbar_apply_clip 把可见区域裁到本屏内——
   *  多屏下滑出本屏的"藏起"部分会显示在相邻屏幕上，必须显式裁掉 */
  function animateWindowTo(tx: number, ty: number, duration: number, easing: (t: number) => number, clip = false): Promise<void> {
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
            void win.setPosition(new PhysicalPosition(x, y)).catch(() => {});
            if (clip) void invoke("toolbar_apply_clip", { x, y }).catch(() => {});
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        })
        .catch(() => resolve());
    });
  }

  /** 鏀惰捣锛氬钩婊戞粦鍑哄睆骞曪紝浠呴湶 SLIVER 鏉★紙璁板綍鍘熶綅 + 鎵€鍦ㄥ伐浣滃尯锛屼緵寮瑰嚭澶瑰彇锛?*/
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
      await animateWindowTo(x, y, SLIDE_MS, easeInCubic, true);
      // 动画末帧后再夹一次：确保静止时区域精确为贴边亮轨条（跨界部分全裁掉）
      await invoke("toolbar_apply_clip", { x, y }).catch(() => {});
      collapsedRef.current = true;
      // 收起态：加品牌色亮轨 + 呼吸柔光（露出的细条在任何壁纸上都醒目）
      barRef.current?.classList.add("edge-collapsed", `edge-${edge}`);
    } catch (e) {
      console.error("贴边收起失败:", e);
    } finally {
      window.setTimeout(() => {
        snappingRef.current = false;
      }, SLIDE_MS + 80);
    }
  }

  /** 弹出：滑回收起前的位置（夹取到工作区内，保证完全可见）。
   *  收起态由 collapsedRef 内存控制；收起/弹出的「再收起」统一交给鼠标离开
   *  （handleLeave）+ 轮询兜底，不再在此处按 pointerInside 秒收，避免静止光标下
   *  弹出来又瞬间消失、工具栏彻底找不到。 */
  async function expandFromEdge() {
    if (!collapsedRef.current || !restorePosRef.current || snappingRef.current) return;
    try {
      snappingRef.current = true;
      // 收起态视觉（亮轨/呼吸柔光）只在完全收起时存在：弹出一开始就摘掉，
      // 否则滑入动画的 160ms 里亮轨还挂在窗口上（贴右收起=右侧一道蓝边），
      // 看着就像「弹出时右侧突然变蓝、之后恢复正常」。
      barRef.current?.classList.remove(
        "edge-collapsed",
        "edge-left",
        "edge-right",
        "edge-top",
        "edge-bottom"
      );
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
      await animateWindowTo(tx, ty, SLIDE_MS, easeOutBackSoft, true);
      // 完全回到本屏内后最后一次调用会自动清除裁剪区域（恢复整屏显示与阴影）。
      await invoke("toolbar_apply_clip", { x: tx, y: ty }).catch(() => {});
      collapsedRef.current = false;
      restorePosRef.current = null;
      restoreWaRef.current = null;
    } catch (e) {
      console.error("贴边弹出失败:", e);
    } finally {
      window.setTimeout(() => {
        snappingRef.current = false;
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
   *  故用集合而非单个 key（后打开的覆盖前一个的旧实现已移除）。 */
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

  /** 拖动落定后持久化工具栏位置（物理像素）。原生拖动无结束回调，
   *  轮询 outerPosition 连续两次相同视为拖动结束，保存一次即停。 */
  const persistDragEndPosition = () => {
    let last: { x: number; y: number } | null = null;
    let stable = 0;
    const timer = window.setInterval(() => {
      void getCurrentWindow()
        .outerPosition()
        .then((p) => {
          const cur = { x: p.x, y: p.y };
          if (last && last.x === cur.x && last.y === cur.y) {
            if (++stable >= 2) {
              window.clearInterval(timer);
              // 收起/滑入滑出动画中的位置变化不保存，仅拖动落定的停靠位
              if (!collapsedRef.current && !snappingRef.current) {
                const st = useConfigStore.getState();
                void st.update({
                  ...st.config,
                  toolbar: { ...st.config.toolbar, position: [cur.x, cur.y] },
                });
              }
            }
          } else {
            stable = 0;
            last = cur;
          }
        })
        .catch(() => {});
    }, 300);
    // 60s 兜底：确保轮询必定结束（防泄漏）
    window.setTimeout(() => window.clearInterval(timer), 60000);
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
      persistDragEndPosition();
    }
  };

  /** 榧犳爣杩涘叆绐楀彛锛堝惈鏀惰捣鏉★級锛氬浘鏍囩鍚告仮澶?+ 鏀惰捣鎬?鈫?鎮仠寮瑰嚭 */
  const handleEnter = () => {
    pointerInsideRef.current = true;
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }
    if (collapsedRef.current && autoHideRef.current && !snappingRef.current) {
      void expandFromEdge();
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

  // 鍗歌浇鏃跺彇娑?rAF
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

  // 按配置的工具数量与排列方向调整窗口尺寸（按钮 34 + 间距 2 + 两端 4px padding）
  const tools = config?.toolbar?.tools ?? [];
  /** 仅保留 TOOLS 中真实存在【且功能未停用】的工具键：历史配置若残留已移除的
   *  功能（如便签）不渲染；功能开关页停用的模块同样从工具栏隐藏——与托盘/
   *  设置侧栏行为一致，避免"功能关了工具栏还有"。设置入口不受开关控制。 */
  const validTools = tools.filter((k) => {
    if (!TOOLS[k]) return false;
    if (k === "settings") return true;
    return config ? featureEnabled(config, k) : true;
  });
  useEffect(() => {
    if (!validTools.length) return;
    const main = validTools.length * (BTN + GAP) + PAD * 2;
    const cross = BTN + PAD * 2;
    getCurrentWindow()
      .setSize(new LogicalSize(isVertical ? cross : main, isVertical ? main : cross))
      .catch(() => undefined);
  }, [validTools.length, isVertical, BTN]);

  // 启动兜底：若工具栏因历史 off-screen 残留等完全落在显示器外，夹回屏内，
  // 避免「开启收起后 / 重启后完全找不到」。收起态由 collapsedRef 内存控制，重启本应
  // 展开，这里只是保险——仅当窗口完全不可见时才移动，正常位置不受影响。
  useEffect(() => {
    void (async () => {
      try {
        const geo = await invoke<ToolbarGeometry>("toolbar_geometry");
        const fullyOut =
          geo.win_x + geo.win_w <= geo.mon_x ||
          geo.win_x >= geo.mon_x + geo.mon_w ||
          geo.win_y + geo.win_h <= geo.mon_y ||
          geo.win_y >= geo.mon_y + geo.mon_h;
        if (!fullyOut) return;
        const win = getCurrentWindow();
        const size = await win.outerSize().catch(() => null);
        if (!size) return;
        const x = Math.min(Math.max(geo.win_x, geo.mon_x), geo.mon_x + geo.mon_w - size.width);
        const y = Math.min(Math.max(geo.win_y, geo.mon_y), geo.mon_y + geo.mon_h - size.height);
        await win.setPosition(new PhysicalPosition(Math.round(x), Math.round(y))).catch(() => {});
      } catch {
        /* 探测异常时不强制移动，避免干扰正常启动 */
      }
    })();
  }, []);

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
        // 贴边收起恢复：已收起时，光标靠近停靠的那条边 → 自动弹出。
        // 这是修复「工具栏消失找不到」的核心：不再要求精确命中 4px 细边，
        // 只要把鼠标移到屏幕边缘附近就会滑出。
        if (autoHideRef.current && collapsedRef.current && pinnedEdgeRef.current) {
          if (cursorNearEdge(geo, pinnedEdgeRef.current, EDGE_REVEAL)) {
            void expandFromEdge();
          }
          return; // 宸叉敹璧凤細鏈疆涓嶅鐞?鍐嶆敹璧?
        }
        // 【修复"快速离开无法收起"】展开态下，除了事件驱动（handleLeave），
        // 再由轮询兜底检测：光标确实离开贴边方向（超出 EDGE_REVEAL）、且已不在
        // 工具栏窗口内时 → 重新收起。
        // 根因：靠近贴边触发弹出走的是「光标靠近边沿」分轮（cursorNearEdge），
        // 此时光标从未真正进入工具栏窗口，handleLeave 永远不会触发 —— 只有事件驱动的
        // 收起路径被跳过，导致快速移开光标后工具栏一直展开找不到收起。轮询补一条
        // 对称的"离开即收起"，两条路径互相兜底（并避开 snapping 防止与动画打架）。
        if (
          !collapsedRef.current &&
          autoHideRef.current &&
          pinnedEdgeRef.current
        ) {
          // 光标仍在窗口内 / 仍贴着停靠边沿 → 保持展开，并取消遗留的收起延时
          // （轮询路径没有 DOM mouseenter 兜底，需在此主动清掉，否则"在窗口内却误收起"）。
          if (inside || cursorNearEdge(geo, pinnedEdgeRef.current, EDGE_REVEAL)) {
            if (hideTimerRef.current) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = undefined;
            }
          } else if (!snappingRef.current && !hideTimerRef.current) {
            // 光标已离开窗口且已离开贴边方向 → 延时收起（与 handleLeave 同款延迟）
            hideTimerRef.current = window.setTimeout(() => {
              hideTimerRef.current = undefined;
              void collapseToEdge();
            }, HIDE_DELAY);
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
  if (!validTools.length) return null;

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
      {validTools.map((key, i) => {
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
            style={{
              width: BTN,
              height: BTN,
              transition: "transform 90ms var(--ease-out)",
            }}
          >
            <span
              className="toolbar-icon"
              style={{ "--tool-color": tool.color } as CSSProperties}
            >
              {cloneElement(tool.icon as React.ReactElement<{ size?: number }>, { size: iconSize })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
