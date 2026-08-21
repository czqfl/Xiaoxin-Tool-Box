/** 端口工具面板：输入端口号或应用名查询占用进程，一键结束（开发者高频工具）。
 *  头部 = 输入框 + 查询按钮 + 置顶 + 关闭；面板空白处可拖动窗口（JS 手柄，
 *  自动跳过按钮/输入框/结果条目）；置顶开启时面板常驻（失焦不自动隐藏）。 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PortProcess } from "../../types";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { useConfigStore } from "../../stores/configStore";
import { killPort, portSearch, setPanelAlwaysOnTop } from "../../core/tauri";
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

  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<PortProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [killing, setKilling] = useState<number | null>(null);
  // 终止确认弹窗：命中"终止"按钮后置为待确认进程；null 表示无弹窗
  const [confirmTarget, setConfirmTarget] = useState<PortProcess | null>(null);
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

  const runQuery = async (kw: string) => {
    const q = kw.trim();
    if (!q) {
      setError("请输入端口号或应用名");
      return;
    }
    setLoading(true);
    setError("");
    setFeedback("");
    try {
      const list = await portSearch(q);
      setItems(list);
      if (list.length === 0) {
        // 数字走端口语义，否则按应用名语义给出不同提示
        setError(/^\d+$/.test(q) ? `端口 ${q} 未被占用` : `未找到匹配「${q}」的进程`);
      } else if (/^\d+$/.test(q) && list.every((x) => x.state === "TIME_WAIT")) {
        setError("仅 TIME_WAIT 连接（几分钟后自动释放，通常无需处理）");
      }
    } catch (err) {
      setError(String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = () => void runQuery(keyword);

  // 真正的终止逻辑（确认后调用）
  const doKill = async (proc: PortProcess) => {
    setConfirmTarget(null);
    setKilling(proc.pid);
    setError("");
    try {
      await killPort(proc.pid);
      // 结束后自动重新查询，刷新结果（runQuery 会先清空 feedback，故反馈在其后写入）
      const q = keyword.trim();
      if (q) await runQuery(q);
      // 关闭端口成功反馈：绿色横幅，与错误提示区分
      setFeedback(`已成功终止进程「${proc.name}」（PID ${proc.pid}）`);
    } catch (err) {
      setError(String(err));
    } finally {
      setKilling(null);
    }
  };

  // 点"终止"→ 弹出二次确认（替代 Tauri 中不生效的 window.confirm）
  const handleKillClick = (proc: PortProcess) => {
    if (proc.protected) return; // 系统进程无终止按钮，理论上不会进这里
    setConfirmTarget(proc);
  };

  return (
    <div className="panel">
      <div
        className="panel-shell"
        data-tauri-drag-region
        onMouseDown={(e) => {
          // JS 拖动手柄：覆盖 data-tauri-drag-region 在本面板不生效的情况，
          // 同时保留该属性供 usePanel 拖拽守卫识别（拖拽时避免失焦自动隐藏）。
          // 命中可交互元素（按钮/输入框/结果条目/确认弹窗）时不触发拖动。
          const t = e.target as HTMLElement;
          if (t.closest("button, input, select, textarea, .port-item, .port-confirm")) return;
          getCurrentWindow().startDragging().catch(() => undefined);
        }}
      >
        {/* 头部：输入框 + 查询按钮 + 置顶 + 关闭。
            输入框接受端口号或应用名（如 8080 / node）；查询按钮独立在输入框外。 */}
        <div className="panel-header port-header">
          <div className="port-query">
            <span className="search-icon">
              <IconSearch size={15} />
            </span>
            <input
              ref={inputRef}
              value={keyword}
              placeholder="端口号或应用名，如 8080 / node"
              onChange={(e) => setKeyword(e.target.value)}
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
          {items.length === 0 && !error && !feedback && !loading && (
            <div className="port-empty">
              <span className="empty-icon">🔌</span>
              <span>输入端口号或应用名查询占用进程</span>
            </div>
          )}
          {loading && (
            <div className="port-loading">
              <span className="port-spinner" />
              <span>正在查询端口占用…</span>
            </div>
          )}
          {items.map((proc) => {
            // 安全信息内嵌到条目里展示（不再单独顶部提示条）
            const sensitive = proc.port ? SENSITIVE_PORTS.has(proc.port) : false;
            return (
              <div className="port-item" key={`${proc.pid}-${proc.port ?? proc.pid}`}>
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
                    {proc.port !== undefined && <span>端口 {proc.port}</span>}
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
                  {/* 进程路径 / 命令行：用于反查“启动项目”。
                      node 等开发进程的命令行含项目路径，一眼看出端口由哪个项目占用。 */}
                  <div className="port-detail">
                    {proc.path && !proc.path.startsWith("PID ") && (
                      <div className="port-detail-row">
                        <span className="port-detail-key">路径</span>
                        <span className="port-detail-val" title={proc.path}>{proc.path}</span>
                      </div>
                    )}
                    {proc.cmdline && (
                      <div className="port-detail-row">
                        <span className="port-detail-key">命令行</span>
                        <span className="port-detail-val cmdline" title={proc.cmdline}>{proc.cmdline}</span>
                      </div>
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
                    onClick={() => handleKillClick(proc)}
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

      {/* 终止二次确认弹窗（应用内模态，替代 Tauri 默认不生效的 window.confirm） */}
      {confirmTarget && (
        <div className="port-confirm-mask" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setConfirmTarget(null);
        }}>
          <div className="port-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="port-confirm-title">确认终止进程？</div>
            <div className="port-confirm-body">
              <div className="port-confirm-row">
                <span className="port-confirm-key">进程</span>
                <span className="port-confirm-val">{confirmTarget.name}</span>
              </div>
              <div className="port-confirm-row">
                <span className="port-confirm-key">PID</span>
                <span className="port-confirm-val">{confirmTarget.pid}</span>
              </div>
              {confirmTarget.port !== undefined && (
                <div className="port-confirm-row">
                  <span className="port-confirm-key">端口</span>
                  <span className="port-confirm-val">{confirmTarget.port}</span>
                </div>
              )}
              <div className="port-confirm-warn">
                该进程打开的窗口与未保存数据可能丢失，且无法撤销。
              </div>
            </div>
            <div className="port-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmTarget(null)}>
                取消
              </button>
              <button
                className="btn btn-danger"
                disabled={killing === confirmTarget.pid}
                onClick={() => void doKill(confirmTarget)}
              >
                {killing === confirmTarget.pid ? "终止中…" : "确认终止"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
