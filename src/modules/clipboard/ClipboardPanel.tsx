/** 剪贴板历史悬浮面板：搜索、收藏过滤、面板置顶、三种粘贴模式、数字键快速粘贴 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ClipEntry, PasteMode } from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { EVT_CLIPBOARD_CHANGED, onEvent } from "../../core/events";
import { useClipboardStore } from "../../stores/clipboardStore";
import { useConfigStore } from "../../stores/configStore";
import { pasteEntry, setPanelAlwaysOnTop } from "./api";
import {
  buildQueue,
  isSequentialMode,
  PASTE_MODE_DESCS,
  PASTE_MODE_LABELS,
} from "./pasteQueue";
import { ClipboardItem } from "./ClipboardItem";
import { IconPin, IconSearch, IconStar, IconTrash } from "../../components/icons";
import "../../styles/panel.css";
import "./clipboard.css";

export function ClipboardPanel() {
  const { entries, loaded, refresh, remove, clearAll } = useClipboardStore();
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  // 置顶开启时面板常驻：失焦不再自动隐藏
  usePanelCommon(config.clipboard.always_on_top);

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  /** 只看收藏过滤 */
  const [favOnly, setFavOnly] = useState(false);
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

  // 搜索 + 收藏过滤
  const filtered = useMemo(() => {
    let list = entries;
    if (favOnly) list = list.filter((e) => e.favorite);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.preview.toLowerCase().includes(q) ||
        (e.text ?? "").toLowerCase().includes(q) ||
        (e.files ?? []).join(" ").toLowerCase().includes(q)
    );
  }, [entries, query, favOnly]);

  const pinnedList = useMemo(() => filtered.filter((e) => e.pinned), [filtered]);
  const restList = useMemo(() => filtered.filter((e) => !e.pinned), [filtered]);
  /** 扁平列表：置顶在前，数字键与方向键基于此导航 */
  const flat = useMemo(() => [...pinnedList, ...restList], [pinnedList, restList]);

  // 顺序模式队列；队首即下一条待粘贴（全局 Ctrl+V 带出的内容）
  const queue = useMemo(() => buildQueue(filtered, mode), [filtered, mode]);
  const sequential = isSequentialMode(mode);

  const doPaste = useCallback(
    async (entry: ClipEntry) => {
      try {
        await pasteEntry(entry.id);
      } catch (err) {
        console.error("粘贴失败：", err);
      }
      // 顺序模式：消耗已粘贴条目（收藏项保留），下一条自动成为队首
      if (sequential && !entry.favorite) void remove(entry.id);
      // 顺序模式必须隐藏面板让目标窗口获得焦点；普通模式尊重配置
      if (sequential || config.clipboard.close_after_paste) {
        hideCurrentWindow();
      }
    },
    [sequential, config.clipboard.close_after_paste, remove]
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
        // 顺序模式永远粘贴队首（下一条）
        const target = sequential ? queue[0] : flat[selectedIdx];
        if (target) void doPaste(target);
        return;
      }
      // 数字键快速粘贴：仅在搜索框为空时生效，避免干扰搜索输入；顺序模式按队列顺序
      if (!query && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const list = sequential ? queue : flat;
        const target = list[Number(e.key) - 1];
        if (target) void doPaste(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, queue, sequential, selectedIdx, query, doPaste]);

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

  const renderItem = (entry: ClipEntry, flatIndex: number) => (
    <ClipboardItem
      key={entry.id}
      entry={entry}
      hotkeyIndex={sequential ? 0 : flatIndex + 1}
      queueOrder={
        sequential ? queue.findIndex((e) => e.id === entry.id) + 1 : undefined
      }
      isCurrent={sequential && queue[0]?.id === entry.id}
      selected={!sequential && flatIndex === selectedIdx}
      onPaste={() => void doPaste(entry)}
    />
  );

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

        <div className="panel-body">
          {!loaded && <div className="empty-state">加载中…</div>}
          {loaded && flat.length === 0 && (
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
                下一条：{(queue[0]?.preview ?? "无").slice(0, 24)}
                <span className="kbd" style={{ marginLeft: 8 }}>Ctrl+V</span> 带出
              </>
            ) : (
              <>
                {entries.length} 条记录
                <span className="kbd" style={{ marginLeft: 8 }}>1-9</span> 快速粘贴
              </>
            )}
            <span className="kbd" style={{ marginLeft: 4 }}>Esc</span> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
