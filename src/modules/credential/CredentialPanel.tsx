/** 账号密码面板：手动添加的凭据条目，支持搜索、增删改与一键复制。 */
import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Credential } from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { useConfigStore } from "../../stores/configStore";
import * as api from "./api";
import {
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

export function CredentialPanel() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  usePanelCommon(config.credentials.always_on_top);

  const [items, setItems] = useState<Credential[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Credential | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

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
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          setQuery("");
          refresh();
        }
      })
      .then((un) => cleanup.push(un));
    return () => cleanup.forEach((fn) => fn());
  }, []);

  // 面板置顶状态跟随配置生效（经后端命令切换，避免透明窗口纯色屏）
  const alwaysOnTop = config.credentials.always_on_top;
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
      .catch((err) => window.alert(String(err)));
  };

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = (c: Credential) => {
    if (!window.confirm(`确定删除「${c.label}」？`)) return;
    api.deleteCredential(c.id).then(refresh);
  };

  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      credentials: { ...config.credentials, always_on_top: !alwaysOnTop },
    });
  };

  return (
    <div className="panel">
      <div className="panel-shell">
        <div className="panel-header" data-tauri-drag-region>
          <div className="panel-search">
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
        </div>

        <div className="panel-body">
          {!loaded && <div className="empty-state">加载中…</div>}
          {loaded && items.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">🔑</span>
              <span>点击右上角 + 添加第一个账号，支持一键复制</span>
            </div>
          )}
          {loaded && items.length > 0 && filtered.length === 0 && (
            <div className="empty-state">没有匹配的结果</div>
          )}

          {filtered.length > 0 && (
            <div className="cred-list">
              {filtered.map((c) => {
                const isRevealed = revealed.has(c.id);
                return (
                  <div className="cred-card" key={c.id}>
                    <div className="cred-card-head">
                      <span className="cred-label">
                        <IconKey size={14} />
                        {c.label}
                      </span>
                      <div className="cred-actions">
                        <button
                          className="icon-btn sm"
                          title="编辑"
                          onClick={() => {
                            setEditing(c);
                            setShowForm(true);
                          }}
                        >
                          <IconEdit size={14} />
                        </button>
                        <button
                          className="icon-btn sm danger"
                          title="删除"
                          onClick={() => handleDelete(c)}
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
                        {isRevealed ? c.password : "•".repeat(Math.min(c.password.length, 12))}
                      </span>
                      <button
                        className="icon-btn sm"
                        title={isRevealed ? "隐藏密码" : "显示密码"}
                        onClick={() => toggleReveal(c.id)}
                      >
                        {isRevealed ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                      </button>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel-footer">
          <span>{items.length} 个账号 · 点击复制 · 密码默认隐藏</span>
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
    </div>
  );
}

interface FormProps {
  initial: Credential | null;
  onClose: () => void;
  onSaved: () => void;
}

/** 添加 / 编辑弹窗：名称、账号、密码、备注 */
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
    <div className="cred-modal-mask" onClick={onClose}>
      <div className="cred-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cred-modal-title">
          {initial ? "编辑账号" : "添加账号"}
        </div>

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
              className="icon-btn sm"
              title={showPw ? "隐藏" : "显示"}
              onClick={() => setShowPw((v) => !v)}
            >
              {showPw ? <IconEyeOff size={14} /> : <IconEye size={14} />}
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

        <div className="cred-modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
