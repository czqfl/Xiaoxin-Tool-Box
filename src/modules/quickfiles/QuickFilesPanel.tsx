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
import { EVT_PANEL_VISIBILITY, onEvent } from "../../core/events";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConfigStore } from "../../stores/configStore";
import {
  quickfilesCreate,
  quickfilesDelete,
  quickfilesList,
  quickfilesOpen,
  quickfilesReveal,
  setPanelAlwaysOnTop,
} from "../../core/tauri";
import {
  IconClose,
  IconFiles,
  IconGroupDate,
  IconGroupNone,
  IconGroupType,
  IconList,
  IconLocate,
  IconPin,
  IconPlus,
  IconSortName,
  IconSortTime,
  IconTrash,
} from "../../components/icons";
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
      <span className="qf-ext-badge" style={{ background: color }}>
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

export function QuickFilesPanel() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  usePanelCommon(config.files.always_on_top);

  const [files, setFiles] = useState<QuickFile[]>([]);
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
  const [feedback, setFeedback] = useState("");
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

  // Esc 隐藏（与其它面板完全一致：不做任何弹窗拦截，Esc 必达 hideCurrentWindow）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideCurrentWindow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 面板再次显示时重置弹窗状态：若上次关闭时新建/删除弹窗仍开着，状态会残留，
  // 再次打开时弹窗遮罩（inset:0, z-index 50）会挡住头部按钮并吞掉 Esc——
  // 表现为"关闭按钮不生效"。显示时统一清空，保证头部始终可交互。
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
    if (!creatingType) return;
    const raw = newName.trim();
    if (!raw) {
      setError("请输入文件名");
      return;
    }
    // 规范化：去掉已有扩展名后补上类型扩展名
    const base = raw.replace(/\.[^.]+$/, "");
    const filename = `${base}.${creatingType.ext}`;
    setError("");
    try {
      const path = await quickfilesCreate(config.files.location ?? "", filename);
      setFeedback(`已创建 ${filename}`);
      setCreatingType(null);
      setNewName("");
      setNewOpen(false);
      await load();
      // 创建后用该类型的默认打开方式打开
      await quickfilesOpen(path, creatingType.opener);
    } catch (e) {
      setError(String(e));
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
      setFeedback(`已删除 ${deleteTarget.name}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(String(e));
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
                  <IconList
                    size={16}
                    style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 列表 */}
        <div className="panel-body qf-body">
          {feedback && <div className="qf-feedback">{feedback}</div>}
          {error && <div className="qf-error">{error}</div>}
          {loading && <div className="qf-empty">正在读取文件…</div>}
          {!loading && files.length === 0 && !error && (
            <div className="qf-empty">
              <span className="empty-icon">📄</span>
              <span>该位置暂无已配置文件类型的文件，点「新建」创建一个吧</span>
              <button
                className="btn btn-primary btn-sm qf-empty-btn"
                onClick={() => setNewOpen((v) => !v)}
              >
                <IconPlus size={13} /> 新建文件
              </button>
            </div>
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

        <div className="panel-footer">
          <span>快速文件 · 统一位置新建与管理</span>
          <span>
            <span className="kbd">Esc</span> 关闭 · 双击打开
          </span>
        </div>
      </div>

      {/* 新建：文件名输入弹窗 */}
      {creatingType && (
        <div className="qf-modal-mask" onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setCreatingType(null);
            setNewName("");
          }
        }}>
          <div className="qf-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="qf-modal-title">
              <span className="qf-type-dot" style={{ background: creatingType.color }} />
              新建{creatingType.label}文件
            </div>
            <div className="qf-modal-sub">
              将保存到：<span className="qf-modal-loc">
                {location || "默认位置"}
                {creatingType ? `\\${creatingType.ext}` : ""}
              </span>
            </div>
            <input
              ref={newInputRef}
              className="qf-modal-input"
              placeholder={`文件名（不含扩展名），如 note`}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void doCreate();
              }}
            />
            <div className="qf-modal-hint">保存为：{newName.trim().replace(/\.[^.]+$/, "")}.{creatingType.ext}</div>
            {error && <div className="qf-error">{error}</div>}
            <div className="qf-modal-actions">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setCreatingType(null);
                  setNewName("");
                }}
              >
                取消
              </button>
              <button className="btn btn-primary" onClick={() => void doCreate()}>
                创建并打开
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className="qf-modal-mask" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setDeleteTarget(null);
        }}>
          <div className="qf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qf-modal-title">确认删除文件？</div>
            <div className="qf-modal-sub">{deleteTarget.name}</div>
            <div className="qf-modal-warn">文件将被永久删除，无法撤销。</div>
            <div className="qf-modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
                取消
              </button>
              <button className="btn btn-danger" onClick={() => void doDelete()}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
