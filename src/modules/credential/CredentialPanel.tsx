/** 账号密码面板：手动添加的凭据条目，支持搜索、增删改与一键复制。 */
import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Credential } from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { useConfigStore } from "../../stores/configStore";
import * as api from "./api";
import {
  IconClose,
  IconCopy,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconKey,
  IconPin,
  IconPlus,
  IconSearch,
  IconTrash,
} from "../../components/icons";
import { Modal } from "../../components/Modal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { ToastProvider, useToast } from "../../components/Toast";
import { useEscLayer } from "../../hooks/useEscLayered";
import "../../styles/panel.css";
import "./credential.css";

/** 复制后短暂回显「已复制」提示 */
function useCopyFeedback() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const mark = (key: string) => {
    setCopiedId(key);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === key ? null : cur));
    }, 1200);
  };
  return { copiedId, mark };
}

/** 时间戳格式化为「2026-08-10 14:30」 */
function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CredentialPanel() {
  return (
    <ToastProvider>
      <CredentialPanelInner />
    </ToastProvider>
  );
}

function CredentialPanelInner() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const toast = useToast();
  usePanelCommon(config.credentials.always_on_top);
  // Esc 关闭面板；表单/确认弹窗打开时由各自的模态层优先响应
  useEscLayer(true, hideCurrentWindow);

  const showAll = config.credentials.show_passwords;

  const [items, setItems] = useState<Credential[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Credential | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);

  const { copiedId, mark } = useCopyFeedback();

  const refresh = () => {
    api.listCredentials().then((list) => {
      setItems(list);
      setLoaded(true);
    });
  };

  useEffect(() => {
    refresh();
    const cleanup: Array<() => void> = [];
    let disposed = false;
    // 仅在"真正收起后重新呼出"时清空搜索框：拖动面板会让窗口瞬时失焦再夺回，
    // 若每次夺回都清空，用户刚输入的搜索内容会消失。故用失焦时长（>300ms 视为
    // 真实打开、亚 300ms 视为拖动造成的焦点闪动）区分两种情况。
    let lastBlurAt = 0;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          lastBlurAt = Date.now();
          return;
        }
        if (Date.now() - lastBlurAt < 300) return;
        setQuery("");
        refresh();
      })
      .then((un) => (disposed ? un() : cleanup.push(un)));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, []);

  // 面板置顶状态跟随配置生效（经后端命令切换，避免透明窗口纯色屏）
  const alwaysOnTop = config.credentials.always_on_top;
  useEffect(() => {
    api.setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.account.toLowerCase().includes(q) ||
        (c.note ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const copyField = (c: Credential, field: "account" | "password") => {
    const value = field === "account" ? c.account : c.password;
    api
      .copyText(value)
      .then(() => mark(`${c.id}:${field}`))
      .catch((err) => toast.show(String(err), "error"));
  };

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      credentials: { ...config.credentials, always_on_top: !alwaysOnTop },
    });
  };

  /** 一键显示 / 隐藏全部密码，并持久化到配置（下次打开遵循） */
  const toggleShowAll = () => {
    void updateConfig({
      ...config,
      credentials: { ...config.credentials, show_passwords: !showAll },
    });
  };

  return (
    <div className="panel">
      <div className="panel-shell">
        <div className="panel-header" data-tauri-drag-region>
          <div className="panel-search" data-tauri-drag-region>
            <span className="search-icon">
              <IconSearch size={15} />
            </span>
            <input
              value={query}
              placeholder="搜索名称 / 账号 / 备注…"
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button
            className={`icon-btn ${showAll ? "active" : ""}`}
            title={showAll ? "隐藏全部密码" : "显示全部密码"}
            onClick={toggleShowAll}
          >
            {/* 状态导向：密码显示中=睁眼，隐藏中=闭眼（图标反映当前状态） */}
            {showAll ? <IconEye size={16} /> : <IconEyeOff size={16} />}
          </button>
          <button
            className="icon-btn"
            title="添加账号密码"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <IconPlus size={16} />
          </button>
          <button
            className={`icon-btn ${alwaysOnTop ? "active" : ""}`}
            title={alwaysOnTop ? "取消面板置顶" : "面板置顶显示"}
            onClick={toggleAlwaysOnTop}
          >
            <IconPin size={16} filled={alwaysOnTop} />
          </button>
          <button className="icon-btn" title="关闭（Esc）" onClick={() => hideCurrentWindow()}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="panel-body">
          {!loaded && (
            <EmptyState icon={<Spinner size="lg" />} title="加载中…" />
          )}
          {loaded && items.length === 0 && (
            <EmptyState
              icon="🔑"
              title="点击右上角 + 添加第一个账号"
              description="添加后可一键复制账号/密码"
            />
          )}
          {loaded && items.length > 0 && filtered.length === 0 && (
            <EmptyState title="没有匹配的结果" />
          )}

          {filtered.length > 0 && (
            <div className="cred-list">
              {filtered.map((c) => {
                const isRevealed = showAll || revealed.has(c.id);
                return (
                  <div className="cred-card" key={c.id}>
                    <div className="cred-card-head">
                      <span className="cred-label">
                        <IconKey size={14} className="cred-ic" />
                        {c.label}
                      </span>
                      <div className="cred-actions">
                        <button
                          className="icon-btn"
                          title="编辑"
                          onClick={() => {
                            setEditing(c);
                            setShowForm(true);
                          }}
                        >
                          <IconEdit size={14} />
                        </button>
                        <button
                          className="icon-btn icon-btn-danger"
                          title="删除"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="cred-row">
                      <span className="cred-key">账号</span>
                      <span className="cred-val" title={c.account}>
                        {c.account}
                      </span>
                      <button
                        className={`copy-btn ${copiedId === `${c.id}:account` ? "ok" : ""}`}
                        title="复制账号"
                        onClick={() => copyField(c, "account")}
                      >
                        {copiedId === `${c.id}:account` ? "已复制" : <IconCopy size={13} />}
                      </button>
                    </div>

                    <div className="cred-row">
                      <span className="cred-key">密码</span>
                      <span className="cred-val mono">
                        {isRevealed ? c.password : "•".repeat(Math.min(c.password.length, 16))}
                      </span>
                      {!showAll && (
                        <button
                          className="icon-btn"
                          title={isRevealed ? "隐藏密码" : "显示密码"}
                          onClick={() => toggleReveal(c.id)}
                        >
                          {/* 状态导向：该条显示中=睁眼，隐藏中=闭眼 */}
                          {isRevealed ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                        </button>
                      )}
                      <button
                        className={`copy-btn ${copiedId === `${c.id}:password` ? "ok" : ""}`}
                        title="复制密码"
                        onClick={() => copyField(c, "password")}
                      >
                        {copiedId === `${c.id}:password` ? "已复制" : <IconCopy size={13} />}
                      </button>
                    </div>

                    {c.note && (
                      <div className="cred-note" title={c.note}>
                        {c.note}
                      </div>
                    )}

                    <div className="cred-meta">
                      更新于 {formatDate(c.updated_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel-footer">
          <span>{items.length} 个账号 · 点击复制 · 拖动标题栏移动</span>
          <span>
            <span className="kbd">Esc</span> 关闭
          </span>
        </div>
      </div>

      {showForm && (
        <CredentialForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await api.deleteCredential(deleteTarget.id);
            refresh();
          }
        }}
        title={`删除「${deleteTarget?.label ?? ""}」？`}
        message="删除后账号密码无法找回。"
        danger
        confirmLabel="删除"
      />
    </div>
  );
}

interface FormProps {
  initial: Credential | null;
  onClose: () => void;
  onSaved: () => void;
}

/** 添加 / 编辑弹窗：名称、账号、密码、备注（共享 Modal 外壳，Esc 层叠关闭） */
function CredentialForm({ initial, onClose, onSaved }: FormProps) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [account, setAccount] = useState(initial?.account ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [showPw, setShowPw] = useState(!initial); // 编辑时默认隐藏，新增时默认显示
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    if (!label.trim()) return setError("请填写名称 / 用途");
    if (!account.trim()) return setError("请填写账号");
    if (!password) return setError("请填写密码");
    setSaving(true);
    try {
      const input = {
        label: label.trim(),
        account: account.trim(),
        password,
        note: note.trim() || null,
      };
      if (initial) await api.updateCredential(initial.id, input);
      else await api.addCredential(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请重试");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "编辑账号" : "添加账号"}
      wide
      actions={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
            {saving ? "保存中…" : "保存"}
          </button>
        </>
      }
    >
      <label className="cred-field">
        <span>名称 / 用途</span>
        <input
          value={label}
          placeholder="如 GitHub、公司邮箱"
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      </label>

      <label className="cred-field">
        <span>账号</span>
        <input
          value={account}
          placeholder="用户名 / 邮箱 / 手机号"
          onChange={(e) => setAccount(e.target.value)}
        />
      </label>

      <label className="cred-field">
        <span>密码</span>
        <div className="cred-pw-wrap">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            placeholder="请输入密码"
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="icon-btn"
            title={showPw ? "隐藏" : "显示"}
            onClick={() => setShowPw((v) => !v)}
          >
            {/* 状态导向：显示中=睁眼，隐藏中=闭眼 */}
            {showPw ? <IconEye size={14} /> : <IconEyeOff size={14} />}
          </button>
        </div>
      </label>

      <label className="cred-field">
        <span>备注（可选）</span>
        <textarea
          value={note}
          placeholder="如安全问题、密保邮箱等"
          rows={2}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {error && <div className="cred-form-error">{error}</div>}
    </Modal>
  );
}
