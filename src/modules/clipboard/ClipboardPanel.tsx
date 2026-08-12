/** 剪贴板历史悬浮面板：搜索、收藏过滤、面板置顶、三种粘贴模式、队列排序 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { flushSync } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ClipEntry, PasteMode } from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { relativeTime } from "../../core/format";
import { EVT_CLIPBOARD_CHANGED, onEvent } from "../../core/events";
import { useClipboardStore } from "../../stores/clipboardStore";
import { useConfigStore } from "../../stores/configStore";
import {
  consumeEntry,
  insertQueueText,
  moveQueueEntry,
  pasteEntry,
  reorderQueueEntry,
  rollbackPaste,
  setPanelAlwaysOnTop,
} from "./api";
import {
  buildQueue,
  isSequentialMode,
  PASTE_MODE_DESCS,
  PASTE_MODE_LABELS,
} from "./pasteQueue";
import { ClipboardItem } from "./ClipboardItem";
import {
  IconClose,
  IconFiles,
  IconImage,
  IconPin,
  IconSearch,
  IconStar,
  IconText,
  IconTrash,
} from "../../components/icons";
import "../../styles/panel.css";
import "./clipboard.css";

export function ClipboardPanel() {
  const { entries, loaded, refresh, clearAll } = useClipboardStore();
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  // 置顶开启时面板常驻：失焦不再自动隐藏
  usePanelCommon(config.clipboard.always_on_top);

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  /** 只看收藏过滤 */
  const [favOnly, setFavOnly] = useState(false);
  /** 顺序模式手动新增粘贴数据：输入条展开时存目标条目 id（插入到它上方） */
  const [insertTargetId, setInsertTargetId] = useState<string | null>(null);
  const [insertText, setInsertText] = useState("");
  /** 自实现拖拽排序（HTML5 draggable 在 Tauri 透明窗口不可靠）：
   *  dragState = 被拖条目与当前悬停目标（"__end__" = 队尾） */
  const [dragState, setDragState] = useState<{
    id: string;
    overId: string | null;
  } | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  /** 按下起点（未超过位移阈值前不进入拖拽） */
  const pressRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragActiveRef = useRef(false);
  /** 拖拽中的视觉顺序（实时让位预览）：条目 id 数组；null = 按队列显示 */
  const [visualOrder, setVisualOrder] = useState<string[] | null>(null);
  const visualOrderRef = useRef<string[] | null>(null);
  /** 当前队列顺序快照（拖拽期间计算视觉顺序用） */
  const queueRef = useRef<ClipEntry[]>([]);
  /** 当前悬停目标（ref 同步，避免事件闭包滞后导致重复计算） */
  const overIdRef = useRef<string | null>(null);
  /** 拖拽虚影：跟随鼠标的浮层（fixed 定位脱离文档流，原条目隐藏保留占位） */
  const [dragGhost, setDragGhost] = useState<{
    entry: ClipEntry;
    x: number;
    y: number;
  } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  /** 拖拽结束后的那次 click 应被忽略，避免拖动误触发粘贴 */
  const suppressClickRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 粘贴模式持久化在配置，顺序模式下后端注册全局 Ctrl+V */
  const mode = config.clipboard.paste_mode;

  // 面板置顶状态跟随配置生效（经后端命令切换，避免透明窗口黑屏）
  const alwaysOnTop = config.clipboard.always_on_top;
  useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  // 初始加载 + 监听 Rust 侧剪贴板变化
  useEffect(() => {
    refresh();
    const cleanup: Array<() => void> = [];
    onEvent(EVT_CLIPBOARD_CHANGED, () => refresh()).then((un) =>
      cleanup.push(un)
    );
    // 每次面板获得焦点（热键呼出）：聚焦搜索框并重置临时状态。
    // 但拖动面板时 Windows 会让窗口瞬时失焦再夺回，若每次夺回都清空搜索框，
    // 用户刚输入的搜索内容就会消失——故仅当失焦超过阈值（真正收起后重新呼出）
    // 才重置，拖动造成的亚 300ms 焦点闪动不触发清空。
    let lastBlurAt = 0;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          lastBlurAt = Date.now();
          return;
        }
        if (Date.now() - lastBlurAt < 300) return;
        setQuery("");
        setSelectedIdx(0);
        setTimeout(() => inputRef.current?.focus(), 0);
      })
      .then((un) => cleanup.push(un));
    return () => cleanup.forEach((fn) => fn());
  }, [refresh]);

  // 搜索 + 收藏过滤；顺序模式（FIFO/LIFO）下收藏项不参与粘贴队列，
  // 仅在普通模式展示（避免粘贴到收藏项不消耗、卡住后续内容）
  const filtered = useMemo(() => {
    let list = entries;
    if (favOnly) list = list.filter((e) => e.favorite);
    if (isSequentialMode(mode)) list = list.filter((e) => !e.favorite);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.preview.toLowerCase().includes(q) ||
        (e.text ?? "").toLowerCase().includes(q) ||
        (e.files ?? []).join(" ").toLowerCase().includes(q)
    );
  }, [entries, query, favOnly, mode]);

  const pinnedList = useMemo(() => filtered.filter((e) => e.pinned), [filtered]);
  const restList = useMemo(() => filtered.filter((e) => !e.pinned), [filtered]);
  /** 扁平列表：置顶在前，数字键与方向键基于此导航 */
  const flat = useMemo(() => [...pinnedList, ...restList], [pinnedList, restList]);

  // 顺序模式队列；队首即下一条待粘贴（全局 Ctrl+V 带出的内容）
  const queue = useMemo(() => buildQueue(filtered, mode), [filtered, mode]);
  queueRef.current = queue;
  const sequential = isSequentialMode(mode);
  /** 展示列表：顺序模式下整体按队列顺序（下一条在最前），普通模式保持 置顶/历史 分区。
   *  拖拽中按视觉顺序渲染（实时让位预览），队列里新增的条目兜底排尾 */
  const displayList = useMemo(() => {
    if (!sequential) return flat;
    if (visualOrder) {
      const byId = new Map(queue.map((e) => [e.id, e]));
      const ordered = visualOrder
        .map((id) => byId.get(id))
        .filter(Boolean) as ClipEntry[];
      const rest = queue.filter((e) => !visualOrder.includes(e.id));
      return [...ordered, ...rest];
    }
    return queue;
  }, [sequential, flat, queue, visualOrder]);

  const doPaste = useCallback(
    async (entry: ClipEntry) => {
      try {
        await pasteEntry(entry.id);
      } catch (err) {
        console.error("粘贴失败：", err);
      }
      // 顺序模式：消耗已粘贴条目（收藏项保留），下一条自动成为队首；
      // 消耗走后端 consume（记录回滚缓冲，粘贴失败可撤销恢复）
      if (sequential && !entry.favorite) void consumeEntry(entry.id);
      // 顺序模式必须隐藏面板让目标窗口获得焦点；普通模式尊重配置
      if (sequential || config.clipboard.close_after_paste) {
        hideCurrentWindow();
      }
    },
    [sequential, config.clipboard.close_after_paste]
  );

  /** 撤销上一次顺序粘贴消耗（Ctrl+V 没粘上 / 粘错时恢复条目） */
  const rollback = async () => {
    await rollbackPaste();
    // 事件广播会触发 refresh，这里不再手动刷新
  };

  // 全局键盘：Esc / 方向键导航 / Enter 粘贴
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hideCurrentWindow();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (flat.length === 0) return;
        setSelectedIdx((i) => {
          const next =
            e.key === "ArrowDown"
              ? Math.min(i + 1, flat.length - 1)
              : Math.max(i - 1, 0);
          return next;
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        // 顺序模式永远粘贴队首（下一条）
        const target = sequential ? queue[0] : flat[selectedIdx];
        if (target) void doPaste(target);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, queue, sequential, selectedIdx, doPaste]);

  const handleClear = () => {
    if (window.confirm("确定清空全部剪贴板历史吗？（收藏项将保留）")) {
      void clearAll();
    }
  };

  /** 切换面板置顶（持久化到配置） */
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      clipboard: { ...config.clipboard, always_on_top: !alwaysOnTop },
    });
  };

  /** 切换粘贴模式（持久化到配置；顺序模式由后端注册全局 Ctrl+V） */
  const setPasteMode = (m: PasteMode) => {
    if (m === mode) return;
    void updateConfig({
      ...config,
      clipboard: { ...config.clipboard, paste_mode: m },
    });
  };

  /** 按下条目：记录起点（仅顺序模式；按钮区按下不触发拖动） */
  const beginPress = (e: PointerEvent, id: string) => {
    if (!sequential) return;
    if ((e.target as HTMLElement).closest(".clip-actions")) return;
    pressRef.current = { id, x: e.clientX, y: e.clientY };
  };

  /** 拖拽中悬停目标变化：实时更新视觉顺序并用 FLIP 让其他条目平滑让位。
   *  被拖条目的 DOM 位置随顺序变化，用位移补偿保持屏幕位置连续（始终跟随鼠标）。
   *  FLIP：记录旧布局位置（offsetLeft/Top 不受 transform 影响）→ 同步渲染新顺序
   *  → 元素瞬移到旧位置（无过渡）→ 下一帧恢复过渡滑回新位置。 */
  const applyVisualOrder = (dragId: string, overId: string) => {
    const prevOrder =
      visualOrderRef.current ?? queueRef.current.map((e) => e.id);
    const cur = prevOrder.indexOf(dragId);
    if (cur < 0) return;
    const next = [...prevOrder];
    next.splice(cur, 1);
    const t = overId === "__end__" ? next.length : next.indexOf(overId);
    if (t < 0) return;
    next.splice(t, 0, dragId);
    if (next.join(",") === prevOrder.join(",")) return;
    const prevPos = new Map<string, { x: number; y: number }>();
    for (const [id, el] of itemRefs.current) {
      prevPos.set(id, { x: el.offsetLeft, y: el.offsetTop });
    }
    visualOrderRef.current = next;
    flushSync(() => setVisualOrder(next));
    const moved: HTMLDivElement[] = [];
    for (const [id, el] of itemRefs.current) {
      const prev = prevPos.get(id);
      if (!prev) continue;
      // 含被拖条目的放置槽：让它随让位平滑滑到新位置（而非瞬移），虚影独立跟随鼠标
      const dx = prev.x - el.offsetLeft;
      const dy = prev.y - el.offsetTop;
      if (dx !== 0 || dy !== 0) {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        moved.push(el);
      }
    }
    // 双 rAF：位移帧先渲染，再恢复过渡，元素从旧位置平滑滑到新位置
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const el of moved) {
          el.style.transition = "";
          el.style.transform = "";
        }
      });
    });
  };

  /** 拖动结束：执行排序（悬停目标为空则不排）。
   *  释放瞬间不立刻清掉视觉顺序——先等后端重排完成并刷新列表（此时队列顺序已与
   *  视觉顺序一致）再清除，避免"先跳回原位、再跳到新位"的闪烁。 */
  const finishDrag = () => {
    if (!dragState) return;
    pressRef.current = null;
    dragActiveRef.current = false;
    overIdRef.current = null;
    setDragGhost(null);
    const { id, overId } = dragState;
    // 复位被拖条目的内联样式（.dragging 类移除后恢复显示）
    const el = itemRefs.current.get(id);
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
      el.style.zIndex = "";
    }
    // 拖动松手后的同一次 click 需忽略，防止误触发粘贴
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 100);
    const needReorder = !!overId && overId !== id;
    if (needReorder) {
      void reorderQueueEntry(id, overId)
        .then(() => refresh())
        .then(() => {
          // 后端确认后队列顺序 == 视觉顺序，此时清除不会产生位置跳变
          visualOrderRef.current = null;
          setVisualOrder(null);
          setDragState(null);
        });
    } else {
      visualOrderRef.current = null;
      setVisualOrder(null);
      setDragState(null);
    }
  };

  // 拖动期间监听全局 pointerup 收尾（可能拖出条目区域才松手）
  useEffect(() => {
    if (!dragState) return;
    const finish = () => finishDrag();
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState]);

  // 虚影初始定位：后续由 pointermove 直接改 DOM，不用 style prop 绑定，
  // 避免拖拽中 React 重渲染把虚影位置重置回起点
  useEffect(() => {
    if (dragGhost && ghostRef.current) {
      ghostRef.current.style.left = `${dragGhost.x}px`;
      ghostRef.current.style.top = `${dragGhost.y}px`;
    }
  }, [dragGhost]);

  /** 手动新增粘贴数据的输入条：渲染在目标条目的正上方（见列表 map） */
  const insertBar =
    sequential && insertTargetId ? (
      <div className="clip-insert-bar">
        <input
          autoFocus
          value={insertText}
          placeholder={`插入到「${displayList.find((e) => e.id === insertTargetId)?.preview.slice(0, 12) ?? ""}」上方…`}
          onChange={(e) => setInsertText(e.target.value)}
          onKeyDown={(e) => {
            // 阻止冒泡：输入条的 Enter/Esc 不触发全局粘贴与关闭面板
            e.stopPropagation();
            if (e.key === "Enter") {
              const t = insertText.trim();
              if (!t) return;
              void insertQueueText(t, insertTargetId);
              setInsertText("");
              setInsertTargetId(null);
            } else if (e.key === "Escape") {
              setInsertText("");
              setInsertTargetId(null);
            }
          }}
        />
        <span className="insert-hint">回车插入 · Esc 取消</span>
        <button
          className="icon-btn"
          title="取消"
          onClick={() => {
            setInsertText("");
            setInsertTargetId(null);
          }}
        >
          <IconClose size={13} />
        </button>
      </div>
    ) : null;

  const renderItem = (entry: ClipEntry, flatIndex: number) => {
    // 队列序号（1 = 下一条待粘贴）：队首不可上移、队尾不可下移；
    // 拖拽中序号跟随实时视觉顺序显示
    const qOrder = sequential
      ? displayList.findIndex((e) => e.id === entry.id) + 1
      : 0;
    return (
      <ClipboardItem
        entry={entry}
        queueOrder={qOrder || undefined}
        isCurrent={sequential && displayList[0]?.id === entry.id}
        selected={!sequential && flatIndex === selectedIdx}
        onPaste={() => {
          // 拖动松手后的那次 click 不视为粘贴
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          void doPaste(entry);
        }}
        onMove={
          sequential
            ? (dir) => void moveQueueEntry(entry.id, dir)
            : undefined
        }
        canMoveUp={qOrder > 1}
        canMoveDown={qOrder > 0 && qOrder < queue.length}
        onInsert={sequential ? () => setInsertTargetId(entry.id) : undefined}
        dragging={dragState?.id === entry.id}
        dragOver={dragState?.overId === entry.id}
        onPointerDown={(e) => beginPress(e, entry.id)}
        registerRef={(el) => {
          if (el) itemRefs.current.set(entry.id, el);
          else itemRefs.current.delete(entry.id);
        }}
      />
    );
  };

  /** 拖拽虚影的实时队列序号（跟随让位预览中的位置，拖到哪序号变到哪） */
  const ghostOrder =
    sequential && dragGhost
      ? displayList.findIndex((e) => e.id === dragGhost.entry.id) + 1
      : 0;

  return (
    <div className="panel">
      <div className="panel-shell">
        <div className="panel-header" data-tauri-drag-region>
          <div className="panel-search" data-tauri-drag-region>
            <span className="search-icon">
              <IconSearch size={15} />
            </span>
            <input
              ref={inputRef}
              value={query}
              placeholder="搜索剪贴板历史…"
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIdx(0);
              }}
              autoFocus
            />
          </div>
          <button
            className={`icon-btn ${favOnly ? "active" : ""}`}
            title={favOnly ? "显示全部记录" : "只看收藏"}
            onClick={() => {
              setFavOnly((v) => !v);
              setSelectedIdx(0);
            }}
          >
            <IconStar size={15} filled={favOnly} />
          </button>
          <button
            className={`icon-btn ${alwaysOnTop ? "active" : ""}`}
            title={alwaysOnTop ? "取消面板置顶" : "面板置顶显示"}
            onClick={toggleAlwaysOnTop}
          >
            <IconPin size={15} filled={alwaysOnTop} />
          </button>
          <button
            className="icon-btn icon-btn-danger"
            title="清空全部"
            onClick={handleClear}
          >
            <IconTrash size={15} />
          </button>
        </div>

        <div
          className={`panel-body${dragState?.overId === "__end__" ? " drop-end" : ""}`}
          onPointerMove={(e) => {
            // 自实现拖拽：超过位移阈值进入拖动，并计算当前悬停目标
            const press = pressRef.current;
            if (!press) return;
            if (
              !dragActiveRef.current &&
              Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6
            ) {
              return;
            }
            if (!dragActiveRef.current) {
              dragActiveRef.current = true;
              // 以当前队列顺序作为拖拽初始视觉顺序，开始实时让位预览
              const order = queueRef.current.map((entry) => entry.id);
              visualOrderRef.current = order;
              setVisualOrder(order);
              setDragState({ id: press.id, overId: null });
              // 生成跟随鼠标的虚影：原条目隐藏保留占位，虚影不随列表重排漂移
              const entry = queueRef.current.find((e) => e.id === press.id);
              if (entry) {
                setDragGhost({ entry, x: e.clientX + 10, y: e.clientY + 10 });
              }
            }
            // 虚影跟随鼠标（直接改 DOM，避免高频重渲染）
            const g = ghostRef.current;
            if (g) {
              g.style.left = `${e.clientX + 10}px`;
              g.style.top = `${e.clientY + 10}px`;
            }
            // 悬停在某条目标记上 = 放到它前面；落在最后一条下方 = 队尾
            let overId: string | null = null;
            let lastBottom = Number.NEGATIVE_INFINITY;
            for (const [id, el] of itemRefs.current) {
              if (id === press.id) continue;
              const r = el.getBoundingClientRect();
              if (r.bottom > lastBottom) lastBottom = r.bottom;
              if (e.clientY >= r.top && e.clientY <= r.bottom) overId = id;
            }
            if (!overId && e.clientY > lastBottom) overId = "__end__";
            if (overId !== overIdRef.current) {
              overIdRef.current = overId;
              setDragState((s) => (s ? { ...s, overId } : s));
              // 悬停目标变化：实时让位（其他条目平滑移动腾出位置）
              if (overId) applyVisualOrder(press.id, overId);
            }
          }}
        >
          {!loaded && <div className="empty-state">加载中…</div>}
          {loaded && displayList.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">📋</span>
              <span>
                {query
                  ? "没有匹配的记录"
                  : favOnly
                    ? "暂无收藏记录，点击条目的星标可收藏"
                    : "暂无剪贴板历史，复制内容后自动记录"}
              </span>
            </div>
          )}

          {sequential ? (
            /* 顺序模式：整体按队列顺序展示，下一条在最前，切换模式即调整顺序。
               输入条渲染在目标条目的正上方，插入后成为它的前一条 */
            displayList.map((e) => (
              <Fragment key={e.id}>
                {e.id === insertTargetId && insertBar}
                {renderItem(e, 0)}
              </Fragment>
            ))
          ) : (
            <>
              {pinnedList.length > 0 && (
                <>
                  <div className="section-label">置顶</div>
                  {pinnedList.map((e) => renderItem(e, flat.indexOf(e)))}
                </>
              )}
              {pinnedList.length > 0 && restList.length > 0 && (
                <div className="section-label">历史记录</div>
              )}
              {restList.map((e) => renderItem(e, flat.indexOf(e)))}
            </>
          )}

          {dragGhost && (
            /* 拖拽虚影：fixed 跟随鼠标的条目卡片快照，完整复刻条目结构
               （序号/类型图标/预览/时间来源/收藏置顶徽标），原条目保留占位隐藏 */
            <div ref={ghostRef} className="clip-drag-ghost">
              {sequential && ghostOrder > 0 && (
                <span
                  className={`clip-order${ghostOrder === 1 ? " next" : ""}`}
                >
                  {ghostOrder}
                </span>
              )}
              <span className="clip-icon">
                {dragGhost.entry.kind === "image" ? (
                  <IconImage size={18} />
                ) : dragGhost.entry.kind === "files" ? (
                  <IconFiles size={18} />
                ) : (
                  <IconText size={18} />
                )}
              </span>
              <div className="clip-main">
                <div className="clip-preview">
                  {dragGhost.entry.preview || dragGhost.entry.text}
                </div>
                <div className="clip-meta">
                  <span>{relativeTime(dragGhost.entry.created_at)}</span>
                  {dragGhost.entry.source_app && (
                    <span className="clip-source">
                      {dragGhost.entry.source_app}
                    </span>
                  )}
                </div>
              </div>
              {dragGhost.entry.favorite && (
                <span className="ghost-flag">
                  <IconStar size={12} filled />
                </span>
              )}
              {dragGhost.entry.pinned && (
                <span className="ghost-flag">
                  <IconPin size={12} filled />
                </span>
              )}
            </div>
          )}
        </div>

        <div className="panel-footer">
          <div className="segmented">
            {(Object.keys(PASTE_MODE_LABELS) as PasteMode[]).map((m) => (
              <button
                key={m}
                className={mode === m ? "active" : ""}
                title={`粘贴模式：${PASTE_MODE_LABELS[m]} — ${PASTE_MODE_DESCS[m]}`}
                onClick={() => setPasteMode(m)}
              >
                {PASTE_MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <span>
            {sequential ? (
              <>
                <span
                  className="next-hint"
                  title={queue[0]?.text ?? queue[0]?.preview ?? ""}
                >
                  下一条：{(queue[0]?.preview ?? "无").slice(0, 16)}
                </span>
                <span className="kbd" style={{ marginLeft: 8 }}>Ctrl+V</span> 带出
                <button
                  className="rollback-btn"
                  onClick={() => void rollback()}
                  title="撤销最近一次粘贴消耗的条目，可连续点击多次逐条恢复"
                >
                  ↩ 撤销
                </button>
              </>
            ) : (
              <>{entries.length} 条记录</>
            )}
            <span className="kbd" style={{ marginLeft: 4 }}>Esc</span> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
