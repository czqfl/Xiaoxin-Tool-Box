/** 剪贴板历史悬浮面板：搜索、置顶区、四种粘贴模式、数字键快速粘贴 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ClipEntry, PasteMode } from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { EVT_CLIPBOARD_CHANGED, onEvent } from "../../core/events";
import { useClipboardStore } from "../../stores/clipboardStore";
import { useConfigStore } from "../../stores/configStore";
import { pasteEntry } from "./api";
import { buildQueue, isSequentialMode, PASTE_MODE_LABELS } from "./pasteQueue";
import { ClipboardItem } from "./ClipboardItem";
import { IconSearch, IconTrash } from "../../components/icons";
import "../../styles/panel.css";
import "./clipboard.css";

export function ClipboardPanel() {
  usePanelCommon();

  const { entries, loaded, refresh, clearAll } = useClipboardStore();
  const config = useConfigStore((s) => s.config);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<PasteMode>("normal");
  const [selectedIdx, setSelectedIdx] = useState(0);
  /** 顺序模式下的队列游标（按条目 id 记忆，跨呼出保留） */
  const [currentId, setCurrentId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 初始加载 + 监听 Rust 侧剪贴板变化
  useEffect(() => {
    refresh();
    const cleanup: Array<() => void> = [];
    onEvent(EVT_CLIPBOARD_CHANGED, () => refresh()).then((un) =>
      cleanup.push(un)
    );
    // 每次面板获得焦点（热键呼出）：聚焦搜索框并重置临时状态
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        setQuery("");
        setSelectedIdx(0);
        setTimeout(() => inputRef.current?.focus(), 0);
      })
      .then((un) => cleanup.push(un));
    return () => cleanup.forEach((fn) => fn());
  }, [refresh]);

  // 搜索过滤
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.preview.toLowerCase().includes(q) ||
        (e.text ?? "").toLowerCase().includes(q) ||
        (e.files ?? []).join(" ").toLowerCase().includes(q)
    );
  }, [entries, query]);

  const pinnedList = useMemo(() => filtered.filter((e) => e.pinned), [filtered]);
  const restList = useMemo(() => filtered.filter((e) => !e.pinned), [filtered]);
  /** 扁平列表：置顶在前，数字键与方向键基于此导航 */
  const flat = useMemo(() => [...pinnedList, ...restList], [pinnedList, restList]);

  // 顺序模式队列
  const queue = useMemo(() => buildQueue(filtered, mode), [filtered, mode]);
  const sequential = isSequentialMode(mode);

  // 队列游标失效时回到队首
  useEffect(() => {
    if (!sequential) return;
    if (!currentId || !queue.some((e) => e.id === currentId)) {
      setCurrentId(queue[0]?.id ?? null);
    }
  }, [sequential, queue, currentId]);

  const doPaste = useCallback(
    async (entry: ClipEntry) => {
      try {
        await pasteEntry(entry.id);
      } catch (err) {
        console.error("粘贴失败：", err);
      }
      // 顺序模式：游标推进到下一条（循环）
      if (sequential) {
        const idx = queue.findIndex((e) => e.id === entry.id);
        const next = queue[idx + 1] ?? queue[0];
        setCurrentId(next?.id ?? null);
      }
      // 顺序模式必须隐藏面板让目标窗口获得焦点；普通模式尊重配置
      if (sequential || config.clipboard.close_after_paste) {
        hideCurrentWindow();
      }
    },
    [sequential, queue, config.clipboard.close_after_paste]
  );

  // 全局键盘：Esc / 数字快速粘贴 / 方向键导航 / Enter 粘贴
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
        const target = sequential
          ? queue.find((x) => x.id === currentId) ?? queue[0]
          : flat[selectedIdx];
        if (target) void doPaste(target);
        return;
      }
      // 数字键快速粘贴：仅在搜索框为空时生效，避免干扰搜索输入
      if (!query && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const target = flat[Number(e.key) - 1];
        if (target) void doPaste(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, queue, sequential, currentId, selectedIdx, query, doPaste]);

  const handleClear = () => {
    if (window.confirm("确定清空全部剪贴板历史吗？（收藏项将保留）")) {
      void clearAll();
    }
  };

  const renderItem = (entry: ClipEntry, flatIndex: number) => (
    <ClipboardItem
      key={entry.id}
      entry={entry}
      hotkeyIndex={flatIndex + 1}
      isCurrent={sequential && entry.id === currentId}
      selected={flatIndex === selectedIdx}
      onPaste={() => void doPaste(entry)}
    />
  );

  return (
    <div className="panel">
      <div className="panel-shell">
        <div className="panel-header">
          <div className="panel-search">
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
          <button className="icon-btn" title="清空全部" onClick={handleClear}>
            <IconTrash size={15} />
          </button>
        </div>

        <div className="panel-body">
          {!loaded && <div className="empty-state">加载中…</div>}
          {loaded && flat.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">📋</span>
              <span>{query ? "没有匹配的记录" : "暂无剪贴板历史，复制内容后自动记录"}</span>
            </div>
          )}

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
        </div>

        <div className="panel-footer">
          <div className="segmented">
            {(Object.keys(PASTE_MODE_LABELS) as PasteMode[]).map((m) => (
              <button
                key={m}
                className={mode === m ? "active" : ""}
                title={`粘贴模式：${PASTE_MODE_LABELS[m]}`}
                onClick={() => {
                  setMode(m);
                  setCurrentId(null);
                }}
              >
                {PASTE_MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <span>
            {entries.length} 条记录
            <span className="kbd" style={{ marginLeft: 8 }}>1-9</span> 快速粘贴
            <span className="kbd" style={{ marginLeft: 4 }}>Esc</span> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
