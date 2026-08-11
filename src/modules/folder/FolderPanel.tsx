/** 文件夹快捷面板：固定/最常访问双分区、各自分页、搜索、右键菜单、拖拽添加与排序 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { EditorInfo, FolderEntry, FolderLayout } from "../../types";
import { hideCurrentWindow, usePanelCommon, withNativeDialog } from "../../core/usePanel";
import { EVT_FOLDER_CHANGED, onEvent } from "../../core/events";
import { useFolderStore, sortFolders } from "../../stores/folderStore";
import { useConfigStore } from "../../stores/configStore";
import * as api from "./api";
import { FolderCard } from "./FolderCard";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import {
  IconArrowUp,
  IconBranch,
  IconChevronLeft,
  IconChevronRight,
  IconCode,
  IconCopy,
  IconExternal,
  IconFolder,
  IconFolderPlus,
  IconGrid,
  IconList,
  IconPin,
  IconSearch,
  IconTerminal,
  IconTrash,
  IconTree,
} from "../../components/icons";
import "../../styles/panel.css";
import "./folder.css";

/** 常用 Git 命令模板（右键在默认终端中执行，仅 Git 仓库展示）。
 *  多命令用换行分隔，后端按当前 shell 拼成一行执行（cmd 用 &，PowerShell 用 ;）。 */
const GIT_COMMANDS: Array<{ label: string; cmd: string }> = [
  {
    label: "一键提交并推送",
    cmd: "git add .\ngit commit -m \"update\"\ngit push",
  },
  { label: "git status", cmd: "git status" },
  { label: "git add .", cmd: "git add ." },
  { label: "git commit -m \"update\"", cmd: "git commit -m \"update\"" },
  { label: "git push", cmd: "git push" },
  { label: "git pull", cmd: "git pull" },
  { label: "git log --oneline", cmd: "git log --oneline" },
  { label: "git stash", cmd: "git stash" },
];

interface MenuState {
  x: number;
  y: number;
  folder: FolderEntry;
}

/** 路径统一为反斜杠形态并去掉尾部斜杠 */
function normPath(p: string): string {
  return p.replaceAll("/", "\\").replace(/\\+$/, "");
}

/** 父目录路径；根目录（如 D: / D:\）无父级返回 null */
function parentPathOf(p: string): string | null {
  const n = normPath(p);
  const idx = n.lastIndexOf("\\");
  if (idx <= 0) return null;
  return n.slice(0, idx);
}

/** 相对父目录的路径：多级子目录时显示完整相对路径（如 app-a\src） */
function relPathOf(p: string, parent: string): string {
  const n = normPath(p);
  const pn = normPath(parent);
  return n.startsWith(pn + "\\") ? n.slice(pn.length + 1) : n;
}

/** 按父目录分组构建目录树（组按路径排序，组内按名称排序） */
function buildTree(items: FolderEntry[]): Array<{ parent: string; items: FolderEntry[] }> {
  const groups = new Map<string, FolderEntry[]>();
  for (const f of items) {
    const parent = parentPathOf(f.path) ?? f.path;
    const list = groups.get(parent);
    if (list) list.push(f);
    else groups.set(parent, [f]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .map(([parent, list]) => ({
      parent,
      items: list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    }));
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
  /** 文件夹 id → Git 当前分支（非仓库无条目） */
  const [branches, setBranches] = useState<Record<string, string>>({});
  /** 已安装编辑器列表（null = 尚未检测完成） */
  const [editors, setEditors] = useState<EditorInfo[] | null>(null);

  // 列表变化时批量读取 Git 分支（读 .git/HEAD，毫秒级）
  useEffect(() => {
    const paths = folders.map((f) => f.path);
    if (paths.length === 0) {
      setBranches({});
      return;
    }
    api.folderGitBranches(paths).then((list) => {
      const map: Record<string, string> = {};
      folders.forEach((f, i) => {
        const b = list[i];
        if (b) map[f.id] = b;
      });
      setBranches(map);
    });
  }, [folders]);

  useEffect(() => {
    refresh();
    refreshEditors();
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
  const terminalLabel =
    config.folder.terminal_shell === "wt"
      ? "Windows Terminal"
      : config.folder.terminal_shell === "cmd"
        ? "命令提示符"
        : "PowerShell";
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

  /** 面板内直接切换卡片展示模式（网格 / 列表 / 目录树），头部三按钮并列高亮 */
  const setLayout = (next: FolderLayout) => {
    void updateConfig({
      ...config,
      folder: { ...config.folder, layout: next },
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

  /** 在指定终端中打开（wt / cmd / powershell） */
  const openInTerminal = (folder: FolderEntry, shell: "wt" | "cmd" | "powershell") => {
    hideCurrentWindow();
    api.openFolderInTerminalWith(folder.path, shell).catch((e) => window.alert(String(e)));
  };

  /** 自动检测已安装的编辑器（毫秒级磁盘探测，菜单打开前刷新） */
  const refreshEditors = () => {
    api
      .detectEditors()
      .then(setEditors)
      .catch(() => setEditors([]));
  };

  /** 在指定编辑器中打开（code / qoder / qodercn / idea / webstorm）。
   *  VS Code 自动探测失败时引导用户手动选择 Code.exe，记住路径后自动重试一次。 */
  const openInEditor = async (folder: FolderEntry, editor: string) => {
    hideCurrentWindow();
    try {
      await api.openFolderInEditor(folder.path, editor);
    } catch (err) {
      const msg = String(err);
      if (editor === "code" && msg.includes("VSCodeNotFound")) {
        const exe = await withNativeDialog(() => api.pickVscodeExecutable());
        if (!exe) return;
        await api.setVscodePath(exe);
        await api
          .openFolderInEditor(folder.path, "code")
          .catch((e2) => window.alert(String(e2)));
        return;
      }
      window.alert(msg);
    }
  };

  /** 在默认终端中执行 Git 命令：终端窗口保留，命令输出直接可见 */
  const execGitCommand = (folder: FolderEntry, cmd: string) => {
    api
      .gitExec(folder.path, cmd, config.folder.terminal_shell)
      .catch((e) => console.error("执行 Git 命令失败", e));
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
      dividerAfter: true,
      children: [
        {
          label: "Windows Terminal",
          icon: <IconTerminal size={13} />,
          onClick: () => openInTerminal(folder, "wt"),
        },
        {
          label: "命令提示符 (cmd)",
          icon: <IconTerminal size={13} />,
          onClick: () => openInTerminal(folder, "cmd"),
        },
        {
          label: "PowerShell",
          icon: <IconTerminal size={13} />,
          onClick: () => openInTerminal(folder, "powershell"),
        },
      ],
    },
    {
      label: "用编辑器打开",
      icon: <IconCode size={14} />,
      children: (editors ?? []).length
        ? editors!.map((e) => ({
            label: e.label,
            icon: <IconCode size={13} />,
            onClick: () => openInEditor(folder, e.key),
          }))
        : [
            {
              label: editors === null ? "正在检测…" : "未检测到已安装的编辑器",
              icon: <IconCode size={13} />,
              onClick: () => refreshEditors(),
            },
          ],
    },
    ...(branches[folder.id]
      ? [
          {
            label: `Git 命令（${branches[folder.id]}）`,
            icon: <IconBranch size={14} />,
            children: GIT_COMMANDS.map(({ label, cmd }) => ({
              label,
              icon: <IconBranch size={13} />,
              onClick: () => execGitCommand(folder, cmd),
            })),
          },
        ]
      : []),
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
      terminalShell={config.folder.terminal_shell}
      branch={branches[folder.id]}
      draggable={sortable}
      dragging={draggingId === folder.id}
      dragOver={dragOverId === folder.id}
      onOpen={() => void openFolderItem(folder)}
      onOpenTerminal={() =>
        openInTerminal(folder, config.folder.terminal_shell)
      }
      onContextMenu={(e) => {
        e.preventDefault();
        refreshEditors();
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
        ) : layout === "tree" ? (
          <div className="folder-tree">
            {buildTree(items).map((g) => (
              <div className="tree-group" key={g.parent}>
                <div className="tree-group-head" title={g.parent}>
                  <IconFolder size={13} />
                  <span className="tree-group-name">{g.parent}</span>
                </div>
                {g.items.map((f) => (
                  <div
                    className="tree-row"
                    key={f.id}
                    title={f.path}
                    onClick={() => void openFolderItem(f)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      refreshEditors();
                      setMenu({ x: e.clientX, y: e.clientY, folder: f });
                    }}
                  >
                    <span
                      className="tree-dot"
                      style={{ background: f.color ?? "var(--accent)" }}
                    />
                    <span className="tree-name">{relPathOf(f.path, g.parent)}</span>
                    {branches[f.id] && (
                      <span className="badge git-branch">
                        <IconBranch size={10} />
                        {branches[f.id]}
                      </span>
                    )}
                    {showCount && f.visit_count > 0 && (
                      <span className="badge folder-count">{f.visit_count} 次</span>
                    )}
                    <button
                      className="icon-btn tree-term-btn"
                      title={`在${terminalLabel}中打开`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openInTerminal(f, config.folder.terminal_shell);
                      }}
                    >
                      <IconTerminal size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
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
          <div className="panel-search" data-tauri-drag-region>
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
          <div className="layout-switcher">
            <button
              className={`icon-btn ${layout === "grid" ? "active" : ""}`}
              title="网格视图"
              onClick={() => setLayout("grid")}
            >
              <IconGrid size={16} />
            </button>
            <button
              className={`icon-btn ${layout === "list" ? "active" : ""}`}
              title="列表视图"
              onClick={() => setLayout("list")}
            >
              <IconList size={16} />
            </button>
            <button
              className={`icon-btn ${layout === "tree" ? "active" : ""}`}
              title="目录树视图"
              onClick={() => setLayout("tree")}
            >
              <IconTree size={16} />
            </button>
          </div>
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
