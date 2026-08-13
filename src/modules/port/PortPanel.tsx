/** 端口工具面板：输入端口号查询占用进程，一键结束（开发者高频工具）。
 *  头部 = 输入框 + 查询按钮 + 置顶 + 关闭；头部空白处可拖动窗口（JS 手柄，
 *  自动跳过按钮/输入框）；置顶开启时面板常驻（失焦不自动隐藏）。 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PortProcess } from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { useConfigStore } from "../../stores/configStore";
import { killPort, queryPort, setPanelAlwaysOnTop } from "../../core/tauri";
import { IconClose, IconPin, IconSearch } from "../../components/icons";
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

/** 系统关键服务端口：占用者多为系统服务，结束进程可能影响系统/网络/安全功能。
 *  查询到这些端口时顶部显示黄色警告提示（不阻止查询，只提醒）。 */
const SENSITIVE_PORTS = new Set<number>([
  22, // SSH
  53, // DNS
  135, // RPC
  137, 138, 139, // NetBIOS
  389, // LDAP
  445, // SMB
  636, // LDAPS
  1433, // MSSQL
  1521, // Oracle
  3306, // MySQL
  3389, // 远程桌面 RDP
  5432, // PostgreSQL
  6379, // Redis
  9200, // Elasticsearch
  27017, // MongoDB
]);

export function PortPanel() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  // 置顶开启时面板常驻：失焦不再自动隐藏
  usePanelCommon(config.port.always_on_top);

  const [port, setPort] = useState("");
  const [items, setItems] = useState<PortProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [killing, setKilling] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 面板置顶状态跟随配置生效（经后端命令切换，避免透明窗口黑屏）
  const alwaysOnTop = config.port.always_on_top;
  useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  // 聚焦时自动聚焦输入框（面板 show 后）
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      port: { ...config.port, always_on_top: !alwaysOnTop },
    });
  };

  const runQuery = async (p: number) => {
    setLoading(true);
    setError("");
    setFeedback("");
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
      // 结束后自动重新查询，刷新结果（runQuery 会先清空 feedback，故反馈在其后写入）
      const p = Number(port.trim());
      if (p) await runQuery(p);
      // 关闭端口成功反馈：绿色横幅，与错误提示区分
      setFeedback(`已成功终止进程「${proc.name}」（PID ${proc.pid}）`);
    } catch (err) {
      setError(String(err));
    } finally {
      setKilling(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel-shell">
        {/* 头部：输入框 + 查询按钮 + 置顶 + 关闭。
            查询按钮独立在输入框外边；头部空白处可拖动窗口（JS 手柄，
            自动跳过按钮/输入框等交互元素） */}
        <div
          className="panel-header port-header"
          onMouseDown={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest("button, select, input, textarea")) return;
            getCurrentWindow().startDragging().catch(() => undefined);
          }}
        >
          <div className="port-query">
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
          </div>
          <button
            className="btn btn-primary btn-sm port-query-btn"
            disabled={loading}
            onClick={handleQuery}
          >
            {loading ? "查询中…" : "查询"}
          </button>
          <button
            className={`icon-btn${alwaysOnTop ? " active" : ""}`}
            title={alwaysOnTop ? "取消置顶（失焦自动隐藏）" : "置顶显示（常驻）"}
            onClick={toggleAlwaysOnTop}
          >
            <IconPin size={15} filled={alwaysOnTop} />
          </button>
          <button
            className="icon-btn"
            title="关闭（Esc）"
            onClick={() => hideCurrentWindow()}
          >
            <IconClose size={14} />
          </button>
        </div>

        <div className="panel-body">
          {feedback && <div className="port-feedback">{feedback}</div>}
          {error && !feedback && <div className="port-empty">{error}</div>}
          {items.length === 0 && !error && !feedback && (
            <div className="port-empty">
              <span className="empty-icon">🔌</span>
              <span>输入端口号查询占用该端口的进程</span>
            </div>
          )}
          {items.map((proc) => {
            // 安全信息内嵌到条目里展示（不再单独顶部提示条）
            const sensitive = SENSITIVE_PORTS.has(Number(port));
            return (
              <div className="port-item" key={proc.pid}>
                <span className={`port-proto ${proc.proto.toLowerCase()}`}>{proc.proto}</span>
                <div className="port-main">
                  <div className="port-name">
                    {proc.name}
                    {proc.protected && (
                      <span className="port-protected" title="系统关键进程，已保护不可终止">
                        系统进程
                      </span>
                    )}
                  </div>
                  <div className="port-meta">
                    <span>PID {proc.pid}</span>
                    {proc.state && (
                      <span className={`port-state ${proc.state}`}>
                        {STATE_HINT[proc.state] ?? proc.state}
                      </span>
                    )}
                    {sensitive && (
                      <span className="port-sens-tag" title="该端口为系统关键服务端口，结束其进程可能影响系统/网络功能">
                        ⚠ 敏感端口
                      </span>
                    )}
                  </div>
                </div>
                {proc.protected ? (
                  <span className="port-kill-lock" title="系统关键进程，已保护不可终止">
                    🔒
                  </span>
                ) : (
                  <button
                    className="port-kill-btn"
                    title={`终止进程 ${proc.name}（PID ${proc.pid}）`}
                    disabled={killing === proc.pid}
                    onClick={() => void handleKill(proc)}
                  >
                    {killing === proc.pid ? "终止中…" : "终止"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="panel-footer">
          <span>端口工具 · 查询 netstat 实时结果</span>
          <span>
            <span className="kbd">Enter</span> 查询 · <span className="kbd">Esc</span> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
