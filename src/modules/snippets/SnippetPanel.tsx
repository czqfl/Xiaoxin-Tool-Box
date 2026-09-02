/** 常用语速贴面板：管理常用话术 / 文本片段，点击一键粘贴到当前输入框。
 *  交互：点卡片 = 粘贴并自动关闭（写剪贴板 + 80ms 后注入 Ctrl+V，此时面板已隐藏、
 *  焦点归还用户原窗口，粘贴生效）；头部搜索 + 分组筛选；卡片 hover 出编辑/删除；
 *  新增/编辑走应用内模态（替代 Tauri 默认不生效的 window.prompt/confirm）。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { EVT_PANEL_VISIBILITY, onEvent } from "../../core/events";
import { useConfigStore } from "../../stores/configStore";
import { setPanelAlwaysOnTop } from "../../core/tauri";
import type { Snippet } from "../../types";
import {
  clipboardCopyText,
  snippetsCreate,
  snippetsDelete,
  snippetsList,
  snippetsPaste,
  snippetsUpdate,
} from "./api";
import {
  IconCheck,
  IconClose,
  IconCopy,
  IconEdit,
  IconPin,
  IconPlus,
  IconSearch,
  IconSnippet,
  IconText,
  IconTrash,
} from "../../components/icons";
import { Modal } from "../../components/Modal";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { useEscLayer } from "../../hooks/useEscLayered";
import "../../styles/panel.css";
import "./snippets.css";

/** 默认分组名（无分组时的落点） */
const DEFAULT_GROUP = "默认";

interface EditState {
  /** null = 未在编辑；"new" = 新增；否则为编辑中的条目 id */
  id: string | null;
  title: string;
  content: string;
  group: string;
}

export function SnippetPanel() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  // 置顶开启时面板常驻：失焦不再自动隐藏
  usePanelCommon(config.snippets.always_on_top);
  // Esc 关闭面板；编辑模态打开时由模态层优先响应
  useEscLayer(true, hideCurrentWindow);

  const [items, setItems] = useState<Snippet[]>([]);
  const [keyword, setKeyword] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null); // null = 全部
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  /** 待删除确认的条目 id（点击删除后二次确认，防误删） */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** 刚复制成功的字段键（"id:title" / "id:content"），用于按钮上显示✓反馈 */
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // 面板置顶状态跟随配置生效（经后端命令切换，避免透明窗口黑屏）
  const alwaysOnTop = config.snippets.always_on_top;
  useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  /** 切换面板置顶（持久化到配置，重启后保持） */
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      snippets: { ...config.snippets, always_on_top: !alwaysOnTop },
    });
  };

  const refresh = async () => {
    try {
      setItems(await snippetsList());
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // refresh 的 ref 镜像：显隐事件监听只注册一次，经此调到最新闭包
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
    // 聚焦时自动聚焦搜索框（面板 show 后）
    setTimeout(() => searchRef.current?.focus(), 60);
    // 面板不卸载、重显不重挂：片段可能在隐藏期间被增删，显示时刷新一次，
    // 否则列表永远停在上一场的内容
    let cleanup: (() => void) | undefined;
    let disposed = false;
    onEvent<{ label: string; visible: boolean }>(EVT_PANEL_VISIBILITY, (ev) => {
      if (ev.visible && ev.label === getCurrentWindow().label) void refreshRef.current();
    }).then((un) => {
      if (disposed) un();
      else cleanup = un;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  /** 分组列表（按名称排序；始终含"默认"以外的全部实际分组） */
  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const s of items) if (s.group.trim()) set.add(s.group.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "zh"));
  }, [items]);

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((s) => {
      if (activeGroup && s.group.trim() !== activeGroup) return false;
      if (!kw) return true;
      return (
        s.title.toLowerCase().includes(kw) || s.content.toLowerCase().includes(kw)
      );
    });
  }, [items, keyword, activeGroup]);

  /** 点击卡片：一键粘贴并关闭面板（后端延迟 80ms 注入 Ctrl+V，此刻焦点已归还） */
  const handlePaste = async (sn: Snippet) => {
    try {
      await snippetsPaste(sn.id);
    } catch (err) {
      console.error("粘贴失败：", err);
      setError(String(err));
      return;
    }
    hideCurrentWindow();
  };

  /** 复制标题或内容到剪贴板（不粘贴、不关闭面板；按钮 hover 渐显）。
   *  成功后该按钮短暂显示✓，1.2s 后复原。 */
  const copyField = async (sn: Snippet, kind: "title" | "content") => {
    const text = kind === "title" ? sn.title : sn.content;
    if (!text) return;
    const key = `${sn.id}:${kind}`;
    try {
      await clipboardCopyText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((cur) => (cur === key ? null : cur));
      }, 1200);
    } catch (err) {
      setError(String(err));
    }
  };

  /** 打开新增/编辑模态 */
  const openEdit = (sn?: Snippet) => {
    setConfirmDeleteId(null);
    setEdit(
      sn
        ? { id: sn.id, title: sn.title, content: sn.content, group: sn.group }
        : { id: null, title: "", content: "", group: activeGroup ?? "" }
    );
    setTimeout(() => titleRef.current?.focus(), 40);
  };

  const closeEdit = () => {
    if (saving) return;
    setEdit(null);
  };

  /** 保存（新增或更新） */
  const saveEdit = async () => {
    if (!edit) return;
    const title = edit.title.trim();
    const content = edit.content.trim();
    if (!title) {
      setError("标题不能为空");
      titleRef.current?.focus();
      return;
    }
    if (!content) {
      setError("内容不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const group = edit.group.trim() || DEFAULT_GROUP;
      if (edit.id === null) {
        await snippetsCreate(title, content, group);
      } else {
        await snippetsUpdate(edit.id, title, content, group);
      }
      setEdit(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  /** 删除（二次确认：首次点击变确认态，3s 内再点执行） */
  const handleDelete = async (sn: Snippet) => {
    if (confirmDeleteId !== sn.id) {
      setConfirmDeleteId(sn.id);
      window.setTimeout(() => {
        setConfirmDeleteId((cur) => (cur === sn.id ? null : cur));
      }, 3000);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await snippetsDelete(sn.id);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div className="panel">
      <div
        className="panel-shell"
        data-tauri-drag-region
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button, input, textarea, .snip-item, .snip-chips")) return;
          getCurrentWindow().startDragging().catch(() => undefined);
        }}
      >
        {/* 头部：搜索 + 新增 + 关闭 */}
        <div className="panel-header snip-header">
          <div className="panel-search">
            <span className="search-icon">
              <IconSearch size={14} />
            </span>
            <input
              ref={searchRef}
              value={keyword}
              placeholder="搜索语速贴…"
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <button className="icon-btn" title="新增语速贴（Enter 保存）" onClick={() => openEdit()}>
            <IconPlus size={15} />
          </button>
          <button
            className={`icon-btn ${alwaysOnTop ? "active" : ""}`}
            title={alwaysOnTop ? "取消面板置顶" : "面板置顶显示"}
            onClick={toggleAlwaysOnTop}
          >
            <IconPin size={15} filled={alwaysOnTop} />
          </button>
          <button className="icon-btn" title="关闭（Esc）" onClick={() => hideCurrentWindow()}>
            <IconClose size={14} />
          </button>
        </div>

        {/* 分组筛选 chips */}
        {groups.length > 0 && (
          <div className="snip-chips">
            <button
              type="button"
              className={`snip-chip${activeGroup === null ? " active" : ""}`}
              onClick={() => setActiveGroup(null)}
            >
              全部
            </button>
            {groups.map((g) => (
              <button
                type="button"
                key={g}
                className={`snip-chip${activeGroup === g ? " active" : ""}`}
                onClick={() => setActiveGroup(g)}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        <div className="panel-body">
          {error && <div className="snip-error">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <EmptyState
              icon={<IconSnippet size={28} />}
              title="还没有语速贴"
              action={
                <button className="btn btn-primary btn-sm" onClick={() => openEdit()}>
                  新建第一条
                </button>
              }
            />
          )}
          {!loading && !error && items.length > 0 && visible.length === 0 && (
            <EmptyState title="没有匹配的语速贴" />
          )}
          {loading && <EmptyState icon={<Spinner size="lg" />} title="加载中…" />}
          {visible.map((sn) => (
            <div
              className="snip-item"
              key={sn.id}
              onClick={() => void handlePaste(sn)}
              title="点击粘贴并关闭"
            >
              <div className="snip-main">
                <div className="snip-title">
                  {sn.title}
                  {sn.group.trim() && sn.group.trim() !== DEFAULT_GROUP && (
                    <span className="snip-tag">{sn.group.trim()}</span>
                  )}
                </div>
                <div className="snip-preview">{sn.content || "（空内容）"}</div>
              </div>
              <div className="snip-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`icon-btn${copiedKey === `${sn.id}:title` ? " copied" : ""}`}
                  title="复制标题"
                  onClick={() => void copyField(sn, "title")}
                >
                  {copiedKey === `${sn.id}:title` ? <IconCheck size={13} /> : <IconText size={13} />}
                </button>
                <button
                  className={`icon-btn${copiedKey === `${sn.id}:content` ? " copied" : ""}`}
                  title="复制内容"
                  onClick={() => void copyField(sn, "content")}
                >
                  {copiedKey === `${sn.id}:content` ? <IconCheck size={13} /> : <IconCopy size={13} />}
                </button>
                <span className="snip-actions-sep" />
                <button
                  className="icon-btn"
                  title="编辑"
                  onClick={() => openEdit(sn)}
                >
                  <IconEdit size={13} />
                </button>
                <button
                  className={`icon-btn${confirmDeleteId === sn.id ? " icon-btn-danger snip-confirm-del" : ""}`}
                  title={confirmDeleteId === sn.id ? "再次点击确认删除" : "删除"}
                  onClick={() => void handleDelete(sn)}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="panel-footer">
          <span>
            <IconSnippet size={12} /> 常用语速贴 · 共 {items.length} 条
          </span>
          <span>
            点击卡片即粘贴并关闭 · <span className="kbd">Esc</span> 关闭
          </span>
        </div>
      </div>

      {/* 新增/编辑模态（共享 Modal：Esc 层叠关闭，Enter 保存仅模态内生效） */}
      {edit && (
        <Modal
          open
          onClose={closeEdit}
          title={edit.id === null ? "新建语速贴" : "编辑语速贴"}
          wide
          actions={
            <>
              <button className="btn" disabled={saving} onClick={closeEdit}>
                取消
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={() => void saveEdit()}>
                {saving ? "保存中…" : "保存"}
              </button>
            </>
          }
        >
          {/* Enter 保存仅响应模态内部按键（焦点在搜索框等外部时不触发）；
              Shift+Enter 保留换行语义（内容区为多行文本） */}
          <div
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void saveEdit();
              }
            }}
          >
            <label className="snip-field">
              <span>标题</span>
              <input
                ref={titleRef}
                value={edit.title}
                placeholder="如：今日日报、常用问候"
                autoFocus
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <label className="snip-field">
              <span>分组（可选）</span>
              <input
                value={edit.group}
                placeholder={DEFAULT_GROUP}
                onChange={(e) => setEdit({ ...edit, group: e.target.value })}
              />
            </label>
            <label className="snip-field">
              <span>内容</span>
              <textarea
                value={edit.content}
                placeholder="点击卡片后将原样粘贴到当前输入框"
                rows={5}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
