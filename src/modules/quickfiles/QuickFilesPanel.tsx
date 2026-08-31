/** 快速文件面板：统一位置快速新建/打开/管理多种类型文件。
 *  较大面板：头部（拖动/新建/置顶/关闭）+ 分组与排序控制条 + 文件列表。
 *  样式与其他面板一致：套用 .panel 外壳，由 usePanelCommon 统一加载配置并应用
 *  亚克力毛玻璃 / 不透明度 / 主题色（configStore 在加载/同步时写入 --panel-opacity）。
 *  文件按类型以强调色区分（左侧色条 + 扩展名徽标），醒目好分辨。
 *  分组：无 / 按类型 / 按创建日期；排序：创建时间 / 名称；分组模式下组内同样按排序。 */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FileTypeDef,
  FilesGroupMode,
  FilesLayoutMode,
  FilesSortMode,
  QuickFile,
} from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import {
  EVT_PANEL_VISIBILITY,
  EVT_FSINDEX_PROGRESS,
  EVT_FSINDEX_DONE,
  onEvent,
} from "../../core/events";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConfigStore } from "../../stores/configStore";
import {
  fsIndexCancel,
  fsIndexRebuild,
  fsIndexSearch,
  fsIndexStatus,
  quickfilesCreate,
  quickfilesDelete,
  quickfilesList,
  quickfilesOpen,
  quickfilesReveal,
  recentFilesClear,
  recentFilesList,
  recentFilesRemove,
  setPanelAlwaysOnTop,
  type FsHit,
  type FsIndexStatus,
  type RecentFile,
} from "../../core/tauri";
import {
  IconClose,
  IconFiles,
  IconGroupDate,
  IconGroupNone,
  IconGroupType,
  IconList,
  IconListColumns,
  IconLocate,
  IconPin,
  IconPlus,
  IconSearch,
  IconSortName,
  IconSortTime,
  IconTrash,
} from "../../components/icons";
import { Modal } from "../../components/Modal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { ToastProvider, useToast } from "../../components/Toast";
import { useEscLayer } from "../../hooks/useEscLayered";
import "../../styles/panel.css";
import "./quickfiles.css";

/** 友好日期标签：今天 / 昨天 / M月D日 / YYYY年M月D日 */
function dateLabel(ts: number): string {
  if (!ts) return "未知日期";
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOf(now);
  const yest = today - 86_400_000;
  if (startOf(d) === today) return "今天";
  if (startOf(d) === yest) return "昨天";
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 日期分组键（YYYY-MM-DD），用于按天聚合与降序 */
function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Group {
  key: string;
  label: string;
  color?: string;
  items: QuickFile[];
}

/** 单个文件条目：左侧类型色条 + 扩展名徽标 + 名称/meta + 悬停操作 */
function FileItem({
  f,
  color,
  dateLabel,
  fmtSize,
  customOpener,
  onOpen,
  onReveal,
  onDelete,
}: {
  f: QuickFile;
  color: string;
  dateLabel: (ts: number) => string;
  fmtSize: (b: number) => string;
  customOpener: boolean;
  onOpen: () => void;
  onReveal: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="qf-item"
      style={{ "--c": color } as React.CSSProperties}
      onDoubleClick={onOpen}
    >
      <span
        className="qf-ext-badge"
        style={{ "--c": color } as React.CSSProperties}
      >
        {f.ext.toUpperCase() || "?"}
      </span>
      <div className="qf-item-main">
        <div className="qf-item-name" title={f.name}>
          {f.name}
        </div>
        <div className="qf-item-meta">
          <span>{dateLabel(f.created_at)}</span>
          <span>{fmtSize(f.size)}</span>
          {customOpener && <span className="qf-item-app">自定义打开</span>}
        </div>
      </div>
      <div className="qf-item-actions">
        <button className="qf-act" title="打开" onClick={onOpen}>
          打开
        </button>
        <button className="qf-act" title="在文件夹中定位" onClick={onReveal}>
          定位
        </button>
        <button className="qf-act danger" title="删除" onClick={onDelete}>
          <IconTrash size={13} />
        </button>
      </div>
    </div>
  );
}

/** 相对时间标签：刚刚 / N 分钟前 / N 小时前 / 昨天 / 复用 dateLabel 的日期格式 */
function agoLabel(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 2 * DAY) return "昨天";
  return dateLabel(ts);
}

/** 去掉路径尾部反斜杠，取所在目录用于次级文案 */
function parentLabel(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}

/** 最近打开：默认按最近打开时间排序，可切「按次数」；双击再次打开 */
function RecentTab({
  fileTypes,
  onToast,
}: {
  fileTypes: FileTypeDef[];
  onToast: (msg: string, kind?: "success" | "error") => void;
}) {
  const [sort, setSort] = useState<"time" | "count">("time");
  const [items, setItems] = useState<RecentFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** 清空会一次性删掉全部打开记录且不可撤，必须二次确认 */
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    let alive = true;
    recentFilesList(sort).then((v) => {
      if (alive) {
        setItems(v);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [sort]);

  const open = (r: RecentFile) => {
    const t = fileTypes.find((x) => x.ext.toLowerCase() === r.ext.toLowerCase());
    quickfilesOpen(r.path, t?.opener).catch((e) => onToast(`打开失败：${String(e)}`, "error"));
  };
  const remove = (r: RecentFile) => {
    recentFilesRemove(r.path).catch(() => undefined);
    setItems((prev) => prev.filter((x) => x.path !== r.path));
  };

  return (
    <>
      <div className="qf-controls">
        <span className="qf-loc-text">
          共 {items.length} 条 · 自动记录你在本面板打开过的文件
        </span>
        <div className="qf-controls-right">
          <div className="segmented">
            <button className={sort === "time" ? "active" : ""} onClick={() => setSort("time")}>
              最近打开
            </button>
            <button className={sort === "count" ? "active" : ""} onClick={() => setSort("count")}>
              按次数
            </button>
          </div>
          {items.length > 0 && (
            <button className="btn btn-sm" onClick={() => setConfirmClear(true)}>
              清空
            </button>
          )}
        </div>
      </div>
      <div className="panel-body qf-body">
        {loaded && items.length === 0 && (
          <EmptyState
            icon={<IconFiles size={22} />}
            title="还没有打开记录"
            description="在「常用文件」或「全盘搜索」里双击打开文件，这里会自动累积"
          />
        )}
        <div className="qf-rows">
          {items.map((r) => (
            <div
              key={r.path}
              className="qf-row"
              title={`${r.path}\n双击再次打开`}
              onDoubleClick={() => open(r)}
            >
              <span className="qf-ext-badge" style={{ ["--c" as string]: typeColor(fileTypes, r.ext) }}>
                {r.ext ? r.ext.toUpperCase().slice(0, 4) : "文件"}
              </span>
              <span className="qf-row-main">
                <span className="qf-row-name">{r.name}</span>
                <span className="qf-row-meta">
                  {parentLabel(r.path)}
                  {sort === "count" && r.count > 1 ? ` · 打开 ${r.count} 次` : ""}
                </span>
              </span>
              <span className="qf-row-time">{agoLabel(r.last_open)}</span>
              <span className="qf-row-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="qf-act"
                  title="打开文件"
                  onClick={() => open(r)}
                >
                  打开
                </button>
                <button
                  className="qf-act"
                  title="在资源管理器中定位"
                  onClick={() => quickfilesReveal(r.path).catch(() => undefined)}
                >
                  定位
                </button>
                <button className="qf-act danger" title="从最近列表移除（不删除文件）" onClick={() => remove(r)}>
                  移除
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 清空记录确认（共享 ConfirmDialog，portal 到 body） */}
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          await recentFilesClear();
          setItems([]);
          onToast("已清空打开记录", "success");
        }}
        title="清空打开记录？"
        message={
          <>
            <div>
              将删除全部 {items.length} 条打开记录，清空后无法恢复。
            </div>
            <div className="qf-modal-warn">
              注意：这里只清记录，不会删除任何实际文件。
            </div>
          </>
        }
        confirmLabel="清空记录"
        danger
      />
    </>
  );
}

/** 全盘文件名搜索（Everything 式）：索引状态 + 输入即搜 */
function SearchTab({
  fileTypes,
  onToast,
}: {
  fileTypes: FileTypeDef[];
  onToast: (msg: string, kind?: "success" | "error") => void;
}) {
  const [status, setStatus] = useState<FsIndexStatus | null>(null);
  const [scanned, setScanned] = useState(0);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FsHit[]>([]);
  const [err, setErr] = useState("");
  const [searching, setSearching] = useState(false);
  // 键盘导航：↑↓ 在结果间移动 active，Enter 打开当前项（此前只能打开第一条）
  const [active, setActive] = useState(0);
  const rowsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const refresh = () => fsIndexStatus().then(setStatus);

  useEffect(() => {
    void refresh();
    inputRef.current?.focus();
    let un1: (() => void) | undefined;
    let un2: (() => void) | undefined;
    let dead = false;
    onEvent<{ entries: number }>(EVT_FSINDEX_PROGRESS, (p) => {
      setScanned(p.entries);
    }).then((u) => { if (dead) u(); else un1 = u; });
    onEvent<{ ok: boolean; cancelled?: boolean }>(EVT_FSINDEX_DONE, (p) => {
      setScanned(0);
      void refresh();
      if (p.cancelled) onToast("已取消建立索引", "success");
    }).then((u) => { if (dead) u(); else un2 = u; });
    return () => {
      dead = true;
      un1?.();
      un2?.();
    };
  }, []);

  // active 变化时保持可见行滚动跟随（与命令面板同一套写法）
  useEffect(() => {
    rowsRef.current
      ?.querySelector<HTMLElement>(".qf-row.active")
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // 输入防抖：中文输入法连续上屏时不要每个字符打一次后端
  useEffect(() => {
    const key = q.trim();
    if ([...key].length < 2) {
      setHits([]);
      setErr("");
      return;
    }
    const t = window.setTimeout(() => {
      setSearching(true);
      fsIndexSearch(key)
        .then((v) => {
          setHits(v);
          setActive(0);
          setErr("");
        })
        .catch((e) => {
          setHits([]);
          setErr(String(e).replace(/^(Error: |invoke error: )/i, ""));
        })
        .finally(() => setSearching(false));
    }, 180);
    return () => window.clearTimeout(t);
  }, [q]);

  const building = !!status?.building;
  const open = (h: FsHit) => {
    const ext = h.is_dir ? "" : h.name.split(".").pop()?.toLowerCase() ?? "";
    const t = fileTypes.find((x) => x.ext.toLowerCase() === ext);
    quickfilesOpen(h.path, t?.opener).catch((e) => onToast(`打开失败：${String(e)}`, "error"));
  };

  return (
    <>
      <div className="qf-controls qf-controls-search">
        <span className="qf-search-wrap">
          <IconSearch size={13} />
          <input
            ref={inputRef}
            className="qf-search"
            placeholder="全盘搜索文件/文件夹名（至少 2 个字符，含 \\ 时按路径匹配）"
            value={q}
            spellCheck={false}
            autoComplete="off"
            name="qf-fulltext-search"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // React 合成事件类型缺 isComposing 声明，用原生事件兜底（IME 选词期间不劫持按键）
              if ((e.nativeEvent as KeyboardEvent).isComposing) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (hits.length ? (i + 1) % hits.length : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (hits.length ? (i - 1 + hits.length) % hits.length : 0));
              } else if (e.key === "Enter" && hits.length) {
                open(hits[Math.min(active, hits.length - 1)]);
              }
            }}
          />
        </span>
        <div className="qf-controls-right">
          <span className="qf-index-meta">
            {building
              ? `正在扫描 ${scanned.toLocaleString()} 条…`
              : status && status.entries > 0
                ? (
                  <>
                    索引{" "}
                    <span className="qf-index-count">{status.entries.toLocaleString()}</span>{" "}
                    条 · {agoLabel(status.built_at)}更新
                  </>
                )
                : "尚未建立索引"}
          </span>
          {building ? (
            <button
              className="btn btn-sm"
              title="停止扫描；已扫描部分不会保留"
              onClick={() => {
                fsIndexCancel()
                  .then((ok) => { if (!ok) onToast("没有进行中的扫描", "error"); })
                  .catch((e) => onToast(String(e), "error"));
              }}
            >
              取消
            </button>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => {
                fsIndexRebuild()
                  .then(() => setStatus((s) => (s ? { ...s, building: true } : s)))
                  .catch((e) => onToast(String(e), "error"));
              }}
            >
              {status && status.entries > 0 ? "更新索引" : "建立索引"}
            </button>
          )}
        </div>
      </div>
      <div className="panel-body qf-body">
        {err && <div className="qf-error">{err}</div>}
        {building && (
          <>
            {/* 不确定进度条：后端只能给出已扫描条数、无法预估总数，
                确定性百分比会误导；扫动条至少给出"确实在动"的证据 */}
            <div className="qf-progress" aria-hidden="true">
              <div className="qf-progress-fill" />
            </div>
            <EmptyState
              icon={<Spinner size="lg" />}
              title="正在建立全盘索引"
              description={`已扫描 ${scanned.toLocaleString()} 条。首次扫描需要十几秒到几分钟，期间可继续使用其他页签。`}
            />
          </>
        )}
        {!building && status && status.entries === 0 && !err && (
          <EmptyState
            icon={<IconSearch size={22} />}
            title="还没有索引，搜不了"
            description="索引只记录文件名与所在目录，不含文件内容；建立后缓存在本地，之后每次打开面板即刻可用。"
            action={
              <button
                className="btn btn-primary btn-sm qf-empty-btn"
                onClick={() => {
                  fsIndexRebuild()
                    .then(() => setStatus((s) => (s ? { ...s, building: true } : s)))
                    .catch((e) => onToast(String(e), "error"));
                }}
              >
                建立索引
              </button>
            }
          />
        )}
        {!building && status && status.entries > 0 && q.trim().length < 2 && (
          <EmptyState icon={<IconSearch size={22} />} title="输入要查找的文件名" description="例如 report、.rs、src-tauri\ocr" />
        )}
        {!building && hits.length > 0 && (
          <div className="qf-rows" ref={rowsRef}>
            {hits.map((h, i) => (
              <div
                key={h.path}
                className={`qf-row${i === active ? " active" : ""}`}
                title={`${h.path}\n双击打开`}
                onDoubleClick={() => open(h)}
              >
                <span
                  className={`qf-ext-badge qf-hit-badge${h.is_dir ? " dir" : ""}`}
                  style={{ ["--c" as string]: h.is_dir ? "#e0a33e" : typeColor(fileTypes, h.name.split(".").pop() ?? "") }}
                >
                  {h.is_dir ? "目录" : (h.name.split(".").pop() ?? "文件").toUpperCase().slice(0, 4)}
                </span>
                <span className="qf-row-main">
                  <span className="qf-row-name">{h.name}</span>
                  <span className="qf-row-meta">{parentLabel(h.path)}</span>
                </span>
                <span className="qf-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="qf-act" title="打开" onClick={() => open(h)}>
                    打开
                  </button>
                  {!h.is_dir && (
                    <button
                      className="qf-act"
                      title="在资源管理器中定位"
                      onClick={() => quickfilesReveal(h.path).catch(() => undefined)}
                    >
                      定位
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
        {!building && !searching && status && status.entries > 0 && q.trim().length >= 2 && !err && hits.length === 0 && (
          <div className="qf-hit-empty">没有匹配「{q.trim()}」的文件名</div>
        )}
      </div>
    </>
  );
}

/** 按扩展名取类型强调色（新页签与主列表用同一套颜色语义） */
function typeColor(fileTypes: FileTypeDef[], ext: string): string {
  const e = (ext || "").toLowerCase();
  return fileTypes.find((t) => t.ext.toLowerCase() === e)?.color ?? "#8a94a6";
}

export function QuickFilesPanel() {
  return (
    <ToastProvider>
      <QuickFilesPanelInner />
    </ToastProvider>
  );
}

function QuickFilesPanelInner() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const toast = useToast();
  usePanelCommon(config.files.always_on_top);
  // Esc 关闭面板；新建/删除弹窗打开时由各自的模态层优先响应
  useEscLayer(true, hideCurrentWindow);

  const [files, setFiles] = useState<QuickFile[]>([]);
  // 页签：常用文件（原有视图）/ 最近打开 / 全盘搜索
  const [tab, setTab] = useState<"files" | "recent" | "search">("files");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<FilesGroupMode>(config.files.default_group);
  const [sort, setSort] = useState<FilesSortMode>(config.files.default_sort);
  const [layout, setLayout] = useState<FilesLayoutMode>(
    config.files.default_layout || "vertical"
  );
  const [newOpen, setNewOpen] = useState(false);
  const [creatingType, setCreatingType] = useState<FileTypeDef | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<QuickFile | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  const fileTypes = config.files.file_types;
  const alwaysOnTop = config.files.always_on_top;

  // 分组/排序/布局变更即持久化（写入 config.files 的 default_* 字段）：
  // 否则选择只存在组件内存里，面板重开就回到初始化状态（用户反馈）
  const changeGroup = (g: FilesGroupMode) => {
    setGroup(g);
    void updateConfig({ ...config, files: { ...config.files, default_group: g } });
  };
  const changeSort = (s: FilesSortMode) => {
    setSort(s);
    void updateConfig({ ...config, files: { ...config.files, default_sort: s } });
  };
  const changeLayout = (l: FilesLayoutMode) => {
    setLayout(l);
    void updateConfig({ ...config, files: { ...config.files, default_layout: l } });
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const exts = fileTypes.map((t) => t.ext);
      const res = await quickfilesList(config.files.location ?? "" , exts);
      setLocation(res.location);
      setFiles(res.files);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 置顶跟随配置
  useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  // 面板再次显示时重置弹窗状态：若上次关闭时新建/删除弹窗仍开着，状态会残留，
  // 再次打开时弹窗会挡住头部按钮——显示时统一清空，保证头部始终可交互。
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    onEvent<{ label: string; visible: boolean }>(EVT_PANEL_VISIBILITY, (ev) => {
      if (ev.visible && ev.label === getCurrentWindow().label) {
        setCreatingType(null);
        setNewName("");
        setDeleteTarget(null);
        setNewOpen(false);
      }
    }).then((un) => {
      if (disposed) un();
      else cleanup = un;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  // 新建类型下拉：点击弹窗以外的区域自动关闭（含再次点击新建按钮）。
  // 用 ref 判包含关系（不依赖类名/DOM 结构），且仅在打开期间注册监听。
  const newWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && newWrapRef.current && !newWrapRef.current.contains(t)) {
        setNewOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [newOpen]);

  // 按扩展名查类型定义（取强调色/默认打开方式）
  const typeOf = (ext: string): FileTypeDef | undefined =>
    fileTypes.find((t) => t.ext.toLowerCase() === ext.toLowerCase());

  // 分组 + 组内排序
  const groups = useMemo<Group[]>(() => {
    const sortItems = (arr: QuickFile[]): QuickFile[] => {
      const copy = [...arr];
      if (sort === "name") {
        copy.sort((a, b) => a.name.localeCompare(b.name, "zh"));
      } else {
        copy.sort((a, b) => b.created_at - a.created_at);
      }
      return copy;
    };

    if (group === "type") {
      const map = new Map<string, Group>();
      // 按配置顺序建组，保证分组顺序稳定
      for (const t of fileTypes) {
        map.set(t.ext.toLowerCase(), { key: t.ext.toLowerCase(), label: t.label, color: t.color, items: [] });
      }
      for (const f of files) {
        const k = f.ext.toLowerCase();
        if (!map.has(k)) map.set(k, { key: k, label: f.ext.toUpperCase(), items: [] });
        map.get(k)!.items.push(f);
      }
      return Array.from(map.values())
        .filter((g) => g.items.length > 0)
        .map((g) => ({ ...g, items: sortItems(g.items) }));
    }

    if (group === "date") {
      const map = new Map<string, Group>();
      for (const f of files) {
        const k = dateKey(f.created_at);
        if (!map.has(k)) map.set(k, { key: k, label: dateLabel(f.created_at), items: [] });
        map.get(k)!.items.push(f);
      }
      return Array.from(map.values())
        .sort((a, b) => (b.key < a.key ? -1 : 1)) // 日期降序（今天在前）
        .map((g) => ({ ...g, items: sortItems(g.items) }));
    }

    // none
    return [{ key: "", label: "", items: sortItems(files) }];
  }, [files, group, sort, fileTypes]);

  const doCreate = async () => {
    if (!creatingType || creating) return;
    const raw = newName.trim();
    if (!raw) {
      setError("请输入文件名");
      return;
    }
    // 规范化：去掉已有扩展名后补上类型扩展名
    const base = raw.replace(/\.[^.]+$/, "");
    const filename = `${base}.${creatingType.ext}`;
    setError("");
    setCreating(true);
    try {
      const path = await quickfilesCreate(config.files.location ?? "", filename);
      setCreatingType(null);
      setNewName("");
      setNewOpen(false);
      toast.show(`已创建 ${filename}`, "success");
      await load();
      // 创建后用该类型的默认打开方式打开（打开失败单独提示，不吞掉创建成功）
      try {
        await quickfilesOpen(path, creatingType.opener);
      } catch (e) {
        toast.show(`打开失败：${String(e)}`, "error");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const doOpen = async (f: QuickFile) => {
    const t = typeOf(f.ext);
    try {
      await quickfilesOpen(f.path, t?.opener);
    } catch (e) {
      setError(String(e));
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await quickfilesDelete(deleteTarget.path);
      toast.show(`已删除 ${deleteTarget.name}`, "success");
      await load();
    } catch (e) {
      toast.show(String(e), "error");
    }
  };

  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      files: { ...config.files, always_on_top: !alwaysOnTop },
    });
  };

  const startCreate = (t: FileTypeDef) => {
    setCreatingType(t);
    setNewName("");
    setNewOpen(false);
    setTimeout(() => newInputRef.current?.focus(), 50);
  };

  return (
    <div className="panel">
      <div className="panel-shell">
        {/* 头部：data-tauri-drag-region 只放在 .qf-header 上（与剪贴板/文件夹/账号密码
            面板一致）。关闭/置顶按钮与其它面板完全相同——普通 onClick。
            Esc 亦与其它面板一致：一律隐藏面板（见上方 Esc effect）。 */}
        <div className="panel-header qf-header" data-tauri-drag-region>
          <span className="qf-title" data-tauri-drag-region>
            <IconFiles size={16} />
            快速文件
          </span>

          {/* 页签：绝对居中挂在头部中间（复用面板通用 .segmented）。
              Tauri 拖拽脚本对 button 默认不接管，所以放在 drag-region 里照样可点 */}
          <div className="qf-tabs">
            <div className="segmented">
              <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
                常用文件
              </button>
              <button className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>
                最近打开
              </button>
              <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>
                全盘搜索
              </button>
            </div>
          </div>

          <div className="qf-new-wrap" ref={newWrapRef}>
            <button
              className={`qf-new-btn${newOpen ? " open" : ""}`}
              onClick={() => setNewOpen((v) => !v)}
              title="新建文件"
            >
              <span className="qf-new-plus">
                <IconPlus size={12} />
              </span>
              新建
            </button>
            {newOpen && (
              <>
                {/* 全窗透明捕获层：点击弹层以外的任意处即关闭下拉。
                    不依赖事件冒泡/类名匹配——弹层在 z-20 位于其上，
                    其余所有内容（头部/控制条/列表）都在其下，点击必中。
                    点中捕获层后弹层卸载，click 派发到两者共同祖先，
                    不会触发按钮的 onClick 造成重新打开。 */}
                <div
                  className="qf-new-mask"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setNewOpen(false);
                  }}
                />
                <div className="qf-new-pop" onMouseDown={(e) => e.stopPropagation()}>
                  <div className="qf-new-pop-title">选择文件类型</div>
                  <div className="qf-new-types">
                    {fileTypes.length === 0 && (
                      <div className="qf-empty-sm">尚未配置文件类型，请到设置中添加</div>
                    )}
                    {fileTypes.map((t) => (
                      <button
                        key={t.ext}
                        className="qf-type-chip"
                        style={{ "--c": t.color } as React.CSSProperties}
                        onClick={() => startCreate(t)}
                      >
                        <span className="qf-type-dot" />
                        {t.label}
                        <span className="qf-type-ext">.{t.ext}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            className={`icon-btn${alwaysOnTop ? " active" : ""}`}
            title={alwaysOnTop ? "取消置顶（失焦自动隐藏）" : "置顶显示（常驻）"}
            onClick={toggleAlwaysOnTop}
          >
            <IconPin size={16} filled={alwaysOnTop} />
          </button>
          <button
            className="icon-btn"
            title="关闭（Esc）"
            onClick={() => hideCurrentWindow()}
          >
            <IconClose size={16} />
          </button>
        </div>

        {tab === "files" && (
          <>
        {/* 控制条：保存位置靠左；分组/排序/布局改为纯图标按钮组（参考文件夹面板
            的布局切换按钮组）——不再写"分组/排序/布局"文字标签与选项汉字名，
            每个控件是一个独立的图标按钮胶囊，靠 icon + tooltip + active 高亮表达。 */}
        <div className="qf-controls">
          <button
            className="qf-loc"
            title="打开保存位置"
            onClick={() => location && quickfilesReveal(location).catch(() => undefined)}
          >
            <IconLocate size={13} />
            <span className="qf-loc-text">{location || "（未配置，使用默认位置）"}</span>
          </button>

          <div className="qf-controls-right">
            <div className="qf-switch-group">
              <span className="qf-switch-label">分组</span>
              <div className="qf-icon-switcher">
                <button
                  className={`icon-btn${group === "none" ? " active" : ""}`}
                  title="不分组（平铺列表）"
                  onClick={() => changeGroup("none")}
                >
                  <IconGroupNone size={16} />
                </button>
                <button
                  className={`icon-btn${group === "type" ? " active" : ""}`}
                  title="按类型分组"
                  onClick={() => changeGroup("type")}
                >
                  <IconGroupType size={16} />
                </button>
                <button
                  className={`icon-btn${group === "date" ? " active" : ""}`}
                  title="按日期分组"
                  onClick={() => changeGroup("date")}
                >
                  <IconGroupDate size={16} />
                </button>
              </div>
            </div>

            <div className="qf-switch-group">
              <span className="qf-switch-label">排序</span>
              <div className="qf-icon-switcher">
                <button
                  className={`icon-btn${sort === "created" ? " active" : ""}`}
                  title="按创建时间排序"
                  onClick={() => changeSort("created")}
                >
                  <IconSortTime size={16} />
                </button>
                <button
                  className={`icon-btn${sort === "name" ? " active" : ""}`}
                  title="按名称排序"
                  onClick={() => changeSort("name")}
                >
                  <IconSortName size={16} />
                </button>
              </div>
            </div>

            <div className="qf-switch-group">
              <span className="qf-switch-label">排列</span>
              <div className="qf-icon-switcher">
                <button
                  className={`icon-btn${layout === "vertical" ? " active" : ""}`}
                  title="垂直列表"
                  onClick={() => changeLayout("vertical")}
                >
                  <IconList size={16} />
                </button>
                <button
                  className={`icon-btn${layout === "horizontal" ? " active" : ""}`}
                  title="水平多列并排"
                  onClick={() => changeLayout("horizontal")}
                >
                  <IconListColumns size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 列表 */}
        <div className="panel-body qf-body">
          {error && <div className="qf-error">{error}</div>}
          {loading && (
            <EmptyState icon={<Spinner size="lg" />} title="正在读取文件…" />
          )}
          {!loading && files.length === 0 && !error && (
            <EmptyState
              icon="📄"
              title="该位置暂无已配置文件类型的文件"
              action={
                <button
                  className="btn btn-primary btn-sm qf-empty-btn"
                  onClick={() => setNewOpen((v) => !v)}
                >
                  <IconPlus size={13} /> 新建文件
                </button>
              }
            />
          )}
          {!loading &&
            (layout === "horizontal" && group !== "none" ? (
              <div className="qf-groups qf-groups-h">
                {groups.map((g) => (
                  <div
                    className="qf-group"
                    key={g.key || "__all__"}
                    style={{ "--c": g.color ?? "var(--accent)" } as React.CSSProperties}
                  >
                    {g.label && (
                      <div className="qf-group-head">
                        {g.color && (
                          <span className="qf-group-dot" style={{ background: g.color }} />
                        )}
                        {g.label}
                        <span className="qf-group-count">{g.items.length}</span>
                      </div>
                    )}
                    <div className="qf-group-body">
                      {g.items.map((f) => (
                        <FileItem
                          key={f.path}
                          f={f}
                          color={typeOf(f.ext)?.color ?? "#8a94a6"}
                          dateLabel={dateLabel}
                          fmtSize={fmtSize}
                          customOpener={!!typeOf(f.ext)?.opener}
                          onOpen={() => void doOpen(f)}
                          onReveal={() => quickfilesReveal(f.path).catch(() => undefined)}
                          onDelete={() => setDeleteTarget(f)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="qf-groups">
                {groups.map((g) => (
                  <div className="qf-group" key={g.key || "__all__"}>
                    {g.label && (
                      <div className="qf-group-head">
                        {g.color && (
                          <span className="qf-group-dot" style={{ background: g.color }} />
                        )}
                        {g.label}
                        <span className="qf-group-count">{g.items.length}</span>
                      </div>
                    )}
                    <div className="qf-group-body">
                      {g.items.map((f) => (
                        <FileItem
                          key={f.path}
                          f={f}
                          color={typeOf(f.ext)?.color ?? "#8a94a6"}
                          dateLabel={dateLabel}
                          fmtSize={fmtSize}
                          customOpener={!!typeOf(f.ext)?.opener}
                          onOpen={() => void doOpen(f)}
                          onReveal={() => quickfilesReveal(f.path).catch(() => undefined)}
                          onDelete={() => setDeleteTarget(f)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </div>
          </>
        )}

        {tab === "recent" && <RecentTab fileTypes={fileTypes} onToast={toast.show} />}
        {tab === "search" && <SearchTab fileTypes={fileTypes} onToast={toast.show} />}

        <div className="panel-footer">
          <span>
            {tab === "files"
              ? "快速文件 · 统一位置新建与管理"
              : tab === "recent"
                ? "最近打开 · 记录在本面板打开过的文件"
                : "全盘搜索 · 只索引文件名，数据不出本机"}
          </span>
          <span>
            <span className="kbd">Esc</span> 关闭 · 双击打开
            {tab === "search" ? " · 回车打开首条" : ""}
          </span>
        </div>
      </div>

      {/* 新建：文件名输入弹窗（共享 Modal，Esc 层叠关闭） */}
      {creatingType && (
        <Modal
          open
          onClose={() => {
            if (!creating) {
              setCreatingType(null);
              setNewName("");
            }
          }}
          title={
            <>
              <span className="qf-type-dot" style={{ background: creatingType.color }} />
              新建{creatingType.label}文件
            </>
          }
          actions={
            <>
              <button
                className="btn"
                disabled={creating}
                onClick={() => {
                  setCreatingType(null);
                  setNewName("");
                }}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={creating}
                onClick={() => void doCreate()}
              >
                {creating && <Spinner size="sm" />}
                创建并打开
              </button>
            </>
          }
        >
          <div className="qf-modal-sub">
            将保存到：<span className="qf-modal-loc">
              {location || "默认位置"}
              {creatingType ? `\\${creatingType.ext}` : ""}
            </span>
          </div>
          <input
            ref={newInputRef}
            className="qf-modal-input"
            placeholder="文件名（不含扩展名），如 note"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void doCreate();
              }
            }}
          />
          <div className="qf-modal-hint">
            保存为：{newName.trim().replace(/\.[^.]+$/, "")}.{creatingType.ext}
          </div>
          {error && <div className="qf-error">{error}</div>}
        </Modal>
      )}

      {/* 删除确认（共享 ConfirmDialog） */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={doDelete}
        title="确认删除文件？"
        message={
          <>
            <div className="qf-modal-sub">{deleteTarget?.name}</div>
            <div className="qf-modal-warn">文件将被永久删除，无法撤销。</div>
          </>
        }
        danger
        confirmLabel="确认删除"
      />
    </div>
  );
}
