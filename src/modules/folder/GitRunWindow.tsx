/** Git 命令执行结果独立窗口（label: `git-run`）
 *
 *  【为什么独立窗口】面板内的任何浮层（哪怕 createPortal 挂到 body）都锁在
 *  同一个 WebView 里——既不能拖到屏幕任意位置，也无法在命令执行期间同时
 *  操作文件夹面板。独立 Tauri 窗口天然满足两点：可拖到任意位置、与面板互不干扰。
 *
 *  【外观】与文件夹面板同构：外壳就是 .panel > .panel-shell。窗口效果（DWM
 *  原生圆角 + 亚克力模糊 + webview 透明底）不走动态创建——本窗口在
 *  tauri.conf.json 静态声明（visible:false），启动时随其它面板一起走
 *  apply_panel_acrylic 管线，效果在首次显示前就已就位；显示瞬间前端再
 *  invoke panel_refresh_acrylic 补刷一次（z-order 变化后 SWCA 可能失效）。
 *
 *  【高度】固定逻辑高度，窗口不随内容伸缩：.panel 100vh 铺满窗口，结果区在
 *  .panel-body 内滚动。这是吸取历史教训的关键——旧版用 ResizeObserver 让
 *  窗口高度跟内容走，一旦测量/缩放偏差就出现"窗口高度 ≠ webview 高度"，
 *  下半区域露白（webview 透明未覆盖处）且内容溢出，样式与关闭都异常。
 *  固定高度后窗口尺寸永远等于声明尺寸，问题从根上不存在。
 *
 *  【数据来源】Rust 权威快照轮询：folder_git_run_stream 在 Rust 侧把每条
 *  命令的 Start/Line/Done/Fail 累积进全局快照（GIT_RUN_STATE，内容变更即
 *  递增 seq），本窗口每 200ms invoke folder_git_run_last 拉取、seq 变化才
 *  刷新。此前 listen/emitTo 事件通道对本窗口已证实不可靠（握手日志在整个
 *  diag 全量里从未出现过），invoke 通道稳定可靠。 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GitRunResult } from "../../types";
import { IconBranch, IconClose } from "../../components/icons";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { useEscLayer } from "../../hooks/useEscLayered";
import "../../styles/panel.css";
import "./folder.css";

/** Rust 侧 folder_git_run_last 返回的权威快照（与 folder.rs 的
 *  GitRunSnapshotState 字段一一对应，勿改字段名） */
export interface GitRunSnapshotState {
  /** 单调递增序号（全局，跨多次执行递增）：变化即代表有新内容 */
  seq: number;
  /** 仓库路径 */
  folder_path: string;
  /** 仓库名（路径末级，窗口标题用） */
  folder_name: string;
  /** 是否仍有命令在执行 */
  running: boolean;
  /** 命令总数 */
  total: number;
  /** 已结束命令数 */
  done: number;
  /** 各命令累积结果（stdout/stderr 随行增长） */
  results: GitRunResult[];
}

/** 窗口逻辑尺寸（与 FolderPanel 的 GITRUN_W/GITRUN_H 保持一致，勿改） */
export const GITRUN_W = 460;
export const GITRUN_H = 440;

export function GitRunWindow() {
  const [snap, setSnap] = useState<GitRunSnapshotState | null>(null);
  // 与其它面板一致：加载配置/主题、失焦自动隐藏、拖动守卫
  usePanelCommon();

  // 【轮询拉取】Rust 权威快照：200ms invoke folder_git_run_last，seq 变化才
  // setState（避免无谓渲染）。不再使用 listen/emitTo——事件通道对本窗口已
  // 证实不可靠（diag 全量日志中 git-run-ready / git-run-update 从未出现过）。
  useEffect(() => {
    let disposed = false;
    let lastSeq = -1;
    const tick = async () => {
      if (disposed) return;
      try {
        const s = await invoke<GitRunSnapshotState | null>("folder_git_run_last");
        if (disposed) return;
        if (s && s.seq !== lastSeq) {
          lastSeq = s.seq;
          setSnap(s);
        }
      } catch {
        // invoke 偶发失败（窗口关闭竞态等）：下一轮自动重试
      }
    };
    void tick();
    // 窗口隐藏期间跳过轮询：该窗口常驻挂载，200ms 一次的 IPC 在后台纯空转
    const timer = window.setInterval(() => {
      if (!document.hidden) void tick();
    }, 200);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  // 新输出到达时跟随滚动到底（流式输出逐行上屏）；用户上翻查看时不打断
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [snap]);

  // 关闭三重保险：前端 hide（emit 广播 + window.hide）+ Rust panel_hide 兜底
  // + diag 日志（点击是否到达、hide 是否生效，全部落盘可查）
  const closePanel = () => {
    hideCurrentWindow();
    void invoke("diag_log", { msg: "[git-run] × close clicked" }).catch(() => {});
    void invoke("panel_hide", { label: "git-run" }).catch(() => {});
  };
  useEscLayer(true, closePanel);

  return (
    <div className="panel git-run-window">
      <div className="panel-shell">
        <div className="panel-header">
          <span className="git-run-title" data-tauri-drag-region>
            <IconBranch size={13} />
            {snap
              ? `${snap.running ? "Git 执行中" : "Git 执行结果"} · ${snap.folder_name}`
              : "Git 执行状态"}
            {snap && snap.total > 1 && (
              <span className="git-run-progress">
                {snap.done}/{snap.total}
              </span>
            )}
          </span>
          <button className="icon-btn" title="关闭（Esc）" onClick={closePanel}>
            <IconClose size={15} />
          </button>
        </div>

        <div className="panel-body" ref={bodyRef}>
          {!snap && <div className="git-run-loading">暂无执行记录</div>}
          {snap && snap.results.length === 0 && (
            <div className="git-run-loading">
              {snap.running ? "正在执行命令…" : "没有可执行的命令"}
            </div>
          )}
          {snap &&
            snap.results.map((r, i) => (
              <div
                className={`git-run-item ${r.running ? "run" : r.ok ? "ok" : "fail"}`}
                key={i}
              >
                <div className="git-run-cmd">
                  <span className={`git-run-status ${r.running ? "run" : ""}`}>
                    {r.running ? <span className="git-run-spinner" /> : r.ok ? "✔" : "✘"}
                  </span>
                  <code>{r.command}</code>
                  {r.running ? (
                    <span className="git-run-code run">执行中…</span>
                  ) : (
                    !r.ok &&
                    r.code != null && <span className="git-run-code">退出码 {r.code}</span>
                  )}
                </div>
                {r.stdout && <pre className="git-run-out">{r.stdout}</pre>}
                {r.stderr && <pre className="git-run-err">{r.stderr}</pre>}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
