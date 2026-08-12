/** 端口工具面板：输入端口号查询占用进程，一键结束（开发者高频工具） */
import { useEffect, useRef, useState } from "react";
import type { PortProcess } from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { killPort, queryPort } from "../../core/tauri";
import { IconClose, IconSearch, IconTrash } from "../../components/icons";
import "../../styles/panel.css";
import "./port.css";

/** 监听状态中文标注：ESTABLISHED=已连接（常见于 dev server 已连），LISTENING=监听中 */
const STATE_HINT: Record<string, string> = {
  LISTENING: "监听",
  ESTABLISHED: "已连接",
  TIME_WAIT: "等待",
  SYN_SENT: "连接中",
  CLOSE_WAIT: "关闭等待",
};

export function PortPanel() {
  usePanelCommon(false);
  const [port, setPort] = useState("");
  const [items, setItems] = useState<PortProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [killing, setKilling] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 聚焦时自动聚焦输入框（面板 show 后）
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const runQuery = async (p: number) => {
    setLoading(true);
    setError("");
    try {
      const list = await queryPort(p);
      setItems(list);
      if (list.length === 0) {
        setError(`端口 ${p} 未被占用`);
      } else if (list.every((x) => x.state === "TIME_WAIT")) {
        setError("仅 TIME_WAIT 连接（几分钟后自动释放，通常无需处理）");
      }
    } catch (err) {
      setError(String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = () => {
    const n = Number(port.trim());
    if (!port.trim() || Number.isNaN(n) || n < 1 || n > 65535) {
      setError("请输入 1-65535 之间的端口号");
      return;
    }
    void runQuery(n);
  };

  const handleKill = async (proc: PortProcess) => {
    const sure = window.confirm(
      `确定结束进程「${proc.name}」（PID ${proc.pid}）吗？\n该进程打开的窗口与数据可能丢失。`
    );
    if (!sure) return;
    setKilling(proc.pid);
    setError("");
    try {
      await killPort(proc.pid);
      // 结束后自动重新查询，刷新结果
      const p = Number(port.trim());
      if (p) await runQuery(p);
    } catch (err) {
      setError(String(err));
    } finally {
      setKilling(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel-shell">
        <div className="panel-header" data-tauri-drag-region>
          <div className="port-query" data-tauri-drag-region>
            <span className="search-icon">
              <IconSearch size={15} />
            </span>
            <input
              ref={inputRef}
              value={port}
              placeholder="输入端口号，如 8080"
              inputMode="numeric"
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleQuery()}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={loading}
              onClick={handleQuery}
            >
              {loading ? "查询中…" : "查询"}
            </button>
          </div>
          <button
            className="icon-btn"
            title="关闭（Esc）"
            onClick={() => hideCurrentWindow()}
          >
            <IconClose size={14} />
          </button>
        </div>

        <div className="panel-body">
          {error && <div className="port-empty">{error}</div>}
          {items.length === 0 && !error && (
            <div className="port-empty">
              <span className="empty-icon">🔌</span>
              <span>输入端口号查询占用该端口的进程</span>
            </div>
          )}
          {items.map((proc) => (
            <div className="port-item" key={proc.pid}>
              <span className={`port-proto ${proc.proto.toLowerCase()}`}>{proc.proto}</span>
              <div className="port-main">
                <div className="port-name">{proc.name}</div>
                <div className="port-meta">
                  <span>PID {proc.pid}</span>
                  {proc.state && (
                    <span className={`port-state ${proc.state}`}>
                      {STATE_HINT[proc.state] ?? proc.state}
                    </span>
                  )}
                </div>
              </div>
              <button
                className="icon-btn icon-btn-danger port-kill"
                title={`结束进程 ${proc.name}（PID ${proc.pid}）`}
                disabled={killing === proc.pid}
                onClick={() => void handleKill(proc)}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="panel-footer">
          <span>端口工具 · 查询 netstat 实时结果</span>
          <span>
            <span className="kbd">Esc</span> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
