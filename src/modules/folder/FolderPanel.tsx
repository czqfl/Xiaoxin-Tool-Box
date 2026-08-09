/** 文件夹快捷面板：固定/最常访问双分区、各自分页、搜索、右键菜单、拖拽添加与排序 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { FolderEntry } from "../../types";
import { hideCurrentWindow, usePanelCommon, withNativeDialog } from "../../core/usePanel";
import { EVT_FOLDER_CHANGED, onEvent } from "../../core/events";
import { useFolderStore, sortFolders } from "../../stores/folderStore";
import { useConfigStore } from "../../stores/configStore";
import * as api from "./api";
import { FolderCard } from "./FolderCard";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import {
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconExternal,
  IconFolderPlus,
  IconGrid,
  IconList,
  IconPin,
  IconSearch,
  IconTerminal,
  IconTrash,
} from "../../components/icons";
import "../../styles/panel.css";
import "./folder.css";

interface MenuState {
  x: number;
  y: number;
  folder: FolderEntry;
}

/** 单区分页器：仅多页时展示 */
function ZonePager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="zone-pager">
      <button
        className="pager-btn"
        title="上一页"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <IconChevronLeft size={12} />
      </button>
      <span className="zone-pager-info">
        {page}/{pages}
      </span>
      <button
        className="pager-btn"
        title="下一页"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        <IconChevronRight size={12} />
      </button>
    </div>
  );
}

export function FolderPanel() {
  const { folders, loaded, refresh, add, remove, togglePin, moveToTop, reorder } =
    useFolderStore();
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  // 置顶开启时面板常驻：失焦不再自动隐藏
  usePanelCommon(config.folder.always_on_top);

  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [externalDrag, setExternalDrag] = useState(false);
  const [pinnedPage, setPinnedPage] = useState(1);
  const [frequentPage, setFrequentPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refresh();
    const cleanup: Array<() => void> = [];

    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        setQuery("");
        // 打开计数由后端完成，面板重新聚焦时拉取最新数据
        refresh();
        setTimeout(() => inputRef.current?.focus(), 0);
      })
      .then((un) => cleanup.push(un));

    // 从系统资源管理器拖入文件夹快速添加
    getCurrentWindow()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setExternalDrag(true);
        } else if (p.type === "leave") {
          setExternalDrag(false);
        } else if (p.type === "drop") {
          setExternalDrag(false);
          for (const path of p.paths) {
            void add(path).then((err) => {
              if (err) window.alert(err);
            });
          }
        }
      })
      .then((un) => cleanup.push(un));

    // 资源管理器追踪新增/计数后拉取最新数据
    onEvent(EVT_FOLDER_CHANGED, () => refresh()).then((un) => cleanup.push(un));

    return () => cleanup.forEach((fn) => fn());
  }, [refresh, add]);

  // 面板置顶状态跟随配置生效（经后端命令切换，避免透明窗口纯色屏）
  const alwaysOnTop = config.folder.always_on_top;
  useEffect(() => {
    api.setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  // Esc 隐藏
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideCurrentWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [folders, query]);

  const { pinned, frequent } = useMemo(() => sortFolders(filtered), [filtered]);
  const layout = config.folder.layout;
  const split = config.folder.split;
  const showCount = config.folder.show_visit_count;
  const pageSize = Math.max(1, config.folder.page_size);

  // 分区各自分页，条目变化导致页码越界时自动收敛
  const pinnedPages = Math.max(1, Math.ceil(pinned.length / pageSize));
  const frequentPages = Math.max(1, Math.ceil(frequent.length / pageSize));
  const safePinnedPage = Math.min(pinnedPage, pinnedPages);
  const safeFrequentPage = Math.min(frequentPage, frequentPages);
  const pinnedView = pinned.slice(
    (safePinnedPage - 1) * pageSize,
    safePinnedPage * pageSize
  );
  const frequentView = frequent.slice(
    (safeFrequentPage - 1) * pageSize,
    safeFrequentPage * pageSize
  );

  const openFolderItem = async (folder: FolderEntry) => {
    hideCurrentWindow();
    // 访问计数由后端在打开时统一记录
    try {
      await api.openFolder(folder.path);
    } catch (err) {
      window.alert(String(err));
    }
  };

  const handleAdd = async () => {
    try {
      // 调起系统资源管理器选择文件夹；弹窗期间面板保持可见
      const path = await withNativeDialog(() => api.pickFolder());
      if (!path) return;
      const err = await add(path);
      if (err) window.alert(err);
    } catch (err) {
      window.alert(String(err));
    }
  };

  /** 面板内快捷切换卡片展示模式（网格 / 列表） */
  const toggleLayout = () => {
    void updateConfig({
      ...config,
      folder: { ...config.folder, layout: layout === "grid" ? "list" : "grid" },
    });
  };

  /** 切换面板置顶（持久化到配置） */
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      folder: { ...config.folder, always_on_top: !alwaysOnTop },
    });
  };

  /** 固定区拖拽排序 */
  const handleReorderDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const ids = pinned.map((f) => f.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, draggingId);
    void reorder(ids);
    setDraggingId(null);
    setDragOverId(null);
  };

  const menuItems = (folder: FolderEntry): MenuItem[] => [
    {
      label: "打开",
      icon: <IconExternal size={14} />,
      onClick: () => void openFolderItem(folder),
    },
    {
      label: "在终端中打开",
      icon: <IconTerminal size={14} />,
      onClick: () => {
        hideCurrentWindow();
        api.openFolderInTerminal(folder.path).catch((e) => window.alert(String(e)));
      },
      dividerAfter: true,
    },
    {
      label: "复制路径",
      icon: <IconCopy size={14} />,
      onClick: () => {
        api.copyFolderPath(folder.path).catch((e) => window.alert(String(e)));
      },
    },
    {
      label: folder.pinned ? "取消固定" : "固定",
      icon: <IconPin size={14} />,
      onClick: () => void togglePin(folder.id),
    },
    {
      label: "置顶到最前",
      icon: <IconArrowUp size={14} />,
      onClick: () => void moveToTop(folder.id),
      dividerAfter: true,
    },
    {
      label: "删除",
      icon: <IconTrash size={14} />,
      danger: true,
      onClick: () => void remove(folder.id),
    },
  ];

  const renderCard = (folder: FolderEntry, sortable: boolean) => (
    <FolderCard
      key={folder.id}
      folder={folder}
      layout={layout}
      showCount={showCount}
      draggable={sortable}
      dragging={draggingId === folder.id}
      dragOver={dragOverId === folder.id}
      onOpen={() => void openFolderItem(folder)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, folder });
      }}
      onDragStart={() => setDraggingId(folder.id)}
      onDragOver={(e) => {
        if (draggingId && draggingId !== folder.id) {
          e.preventDefault();
          setDragOverId(folder.id);
        }
      }}
      onDrop={() => handleReorderDrop(folder.id)}
      onDragEnd={() => {
        setDraggingId(null);
        setDragOverId(null);
      }}
    />
  );

  const renderZone = (
    title: string,
    items: FolderEntry[],
    page: number,
    pages: number,
    onPage: (p: number) => void,
    sortable: boolean,
    emptyHint: string
  ) => (
    <section className="folder-zone">
      <div className="zone-header">
        <div className="section-label">{title}</div>
        <ZonePager page={page} pages={pages} onPage={onPage} />
      </div>
      <div className="zone-content">
        {items.length === 0 ? (
          <div className="zone-empty">{emptyHint}</div>
        ) : (
          <div className={layout === "grid" ? "folder-grid" : "folder-list"}>
            {items.map((f) => renderCard(f, sortable))}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="panel">
      <div className="panel-shell" style={{ position: "relative" }}>
        {externalDrag && <div className="folder-drop-hint">松开以添加文件夹</div>}

        <div className="panel-header" data-tauri-drag-region>
          <div className="panel-search">
            <span className="search-icon">
              <IconSearch size={15} />
            </span>
            <input
              ref={inputRef}
              value={query}
              placeholder="搜索文件夹…"
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button className="icon-btn" title="添加文件夹" onClick={() => void handleAdd()}>
            <IconFolderPlus size={16} />
          </button>
          <button
            className="icon-btn"
            title={layout === "grid" ? "当前：网格，点击切换为列表" : "当前：列表，点击切换为网格"}
            onClick={toggleLayout}
          >
            {layout === "grid" ? <IconGrid size={16} /> : <IconList size={16} />}
          </button>
          <button
            className={`icon-btn ${alwaysOnTop ? "active" : ""}`}
            title={alwaysOnTop ? "取消面板置顶" : "面板置顶显示"}
            onClick={toggleAlwaysOnTop}
          >
            <IconPin size={16} filled={alwaysOnTop} />
          </button>
        </div>

        <div className="panel-body">
          {!loaded && <div className="empty-state">加载中…</div>}
          {loaded && folders.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">📁</span>
              <span>从资源管理器拖拽文件夹到此处，或点击右上角 + 添加</span>
            </div>
          )}
          {loaded && folders.length > 0 && filtered.length === 0 && (
            <div className="empty-state">没有匹配的文件夹</div>
          )}

          {loaded && filtered.length > 0 && (
            <div className={`folder-zones ${split === "rows" ? "rows" : "columns"}`}>
              {renderZone(
                "固定",
                pinnedView,
                safePinnedPage,
                pinnedPages,
                setPinnedPage,
                true,
                "暂无固定文件夹"
              )}
              {renderZone(
                "最常访问",
                frequentView,
                safeFrequentPage,
                frequentPages,
                setFrequentPage,
                false,
                "暂无访问记录"
              )}
            </div>
          )}
        </div>

        <div className="panel-footer">
          <span>{folders.length} 个文件夹 · 单击打开 · 右键更多操作</span>
          <span>
            <span className="kbd">Esc</span> 关闭
          </span>
        </div>

        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems(menu.folder)}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    </div>
  );
}
