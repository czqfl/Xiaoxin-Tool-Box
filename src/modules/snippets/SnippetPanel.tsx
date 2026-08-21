/** 常用语速贴面板：管理常用话术 / 文本片段，点击一键粘贴到当前输入框。
 *  交互：点卡片 = 粘贴并自动关闭（写剪贴板 + 80ms 后注入 Ctrl+V，此时面板已隐藏、
 *  焦点归还用户原窗口，粘贴生效）；头部搜索 + 分组筛选；卡片 hover 出编辑/删除；
 *  新增/编辑走应用内模态（替代 Tauri 默认不生效的 window.prompt/confirm）。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import type { Snippet } from "../../types";
import {
  snippetsCreate,
  snippetsDelete,
  snippetsList,
  snippetsPaste,
  snippetsUpdate,
} from "./api";
import {
  IconClose,
  IconEdit,
  IconPlus,
  IconSearch,
  IconSnippet,
  IconTrash,
} from "../../components/icons";
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
  usePanelCommon(false);

  const [items, setItems] = useState<Snippet[]>([]);
  const [keyword, setKeyword] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null); // null = 全部
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  /** 待删除确认的条目 id（点击删除后二次确认，防误删） */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    void refresh();
    // 聚焦时自动聚焦搜索框（面板 show 后）
    setTimeout(() => searchRef.current?.focus(), 60);
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

  // 全局键盘：Esc 关闭（先关模态）/ Enter 保存模态
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (edit) closeEdit();
        else hideCurrentWindow();
      } else if (e.key === "Enter" && edit && !e.shiftKey) {
        e.preventDefault();
        void saveEdit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, saving]);

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
          {error && <div className="snip-empty snip-error">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="snip-empty">
              <span className="snip-empty-icon">
                <IconSnippet size={28} />
              </span>
              <span>还没有语速贴</span>
              <button className="btn btn-primary btn-sm" onClick={() => openEdit()}>
                新建第一条
              </button>
            </div>
          )}
          {!loading && !error && items.length > 0 && visible.length === 0 && (
            <div className="snip-empty">没有匹配的语速贴</div>
          )}
          {loading && <div className="snip-empty">加载中…</div>}
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

      {/* 新增/编辑模态 */}
      {edit && (
        <div
          className="snip-modal-mask"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeEdit();
          }}
        >
          <div className="snip-modal" onClick={(e) => e.stopPropagation()}>
            <div className="snip-modal-title">
              {edit.id === null ? "新建语速贴" : "编辑语速贴"}
            </div>
            <label className="snip-field">
              <span>标题</span>
              <input
                ref={titleRef}
                value={edit.title}
                placeholder="如：今日日报、常用问候"
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
            <div className="snip-modal-actions">
              <button className="btn btn-ghost" disabled={saving} onClick={closeEdit}>
                取消
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={() => void saveEdit()}>
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
