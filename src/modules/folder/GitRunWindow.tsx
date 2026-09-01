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
 *  【数据来源】由 folder-panel 通过 emitTo("git-run", "git-run-update")
 *  逐条推送。订阅落地后发 git-run-ready 索取全量快照（emit 首帧必丢，
 *  握手是唯一能保证"任何时刻挂载都看到全量结果"的通道）。 */
import { useEffect, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import type { FolderEntry, GitRunResult } from "../../types";
import { IconBranch, IconClose } from "../../components/icons";
import { onEvent } from "../../core/events";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { useEscLayer } from "../../hooks/useEscLayered";
import "../../styles/panel.css";
import "./folder.css";

/** 一次 Git 执行的完整快照（跨窗口传输的载荷） */
export interface GitRunSnapshot {
  folder: FolderEntry;
  results: GitRunResult[];
  running: boolean;
  total: number;
  done: number;
}

/** 窗口逻辑尺寸（与 FolderPanel 的 GITRUN_W/GITRUN_H 保持一致，勿改） */
export const GITRUN_W = 460;
export const GITRUN_H = 440;

export function GitRunWindow() {
  const [snap, setSnap] = useState<GitRunSnapshot | null>(null);
  // 与其它面板一致：加载配置/主题、失焦自动隐藏、拖动守卫
  usePanelCommon();

  // 【订阅与自举必须串行】先 await 注册 update 监听，注册成功后才发 ready
  // 索取快照。拆成两个 effect 会竞态：emitTo 是异步 IPC，ready 一发出
  // folder-panel 立刻回推，而本窗口的 listen 可能还没落地 → 首帧快照丢失。
  useEffect(() => {
    let un: (() => void) | undefined;
    let disposed = false;
    void onEvent<GitRunSnapshot | null>("git-run-update", (s) => setSnap(s))
      .then((f) => {
        if (disposed) {
          f();
          return;
        }
        un = f;
        void emitTo("folder-panel", "git-run-ready", true).catch(() => {});
      })
      .catch(() => {});
    return () => {
      disposed = true;
      un?.();
    };
  }, []);

  // 关闭与其它面板完全一致：Esc 与 × 都走 hideCurrentWindow
  // （emit 显隐广播 + window.hide，失败打日志可见）
  useEscLayer(true, hideCurrentWindow);

  return (
    <div className="panel git-run-window">
      <div className="panel-shell">
        <div className="panel-header">
          <span className="git-run-title" data-tauri-drag-region>
            <IconBranch size={13} />
            {snap
              ? `${snap.running ? "Git 执行中" : "Git 执行结果"} · ${snap.folder.name}`
              : "Git 执行状态"}
            {snap && snap.total > 1 && (
              <span className="git-run-progress">
                {snap.done}/{snap.total}
              </span>
            )}
          </span>
          <button className="icon-btn" title="关闭（Esc）" onClick={hideCurrentWindow}>
            <IconClose size={15} />
          </button>
        </div>

        <div className="panel-body">
          {!snap && <div className="git-run-loading">暂无执行记录</div>}
          {snap && snap.results.length === 0 && (
            <div className="git-run-loading">
              {snap.running ? "正在执行命令…" : "没有可执行的命令"}
            </div>
          )}
          {snap &&
            snap.results.map((r, i) => (
              <div className={`git-run-item ${r.ok ? "ok" : "fail"}`} key={i}>
                <div className="git-run-cmd">
                  <span className="git-run-status">{r.ok ? "✔" : "✘"}</span>
                  <code>{r.command}</code>
                  {!r.ok && r.code != null && (
                    <span className="git-run-code">退出码 {r.code}</span>
                  )}
                </div>
                {r.stdout && <pre className="git-run-out">{r.stdout}</pre>}
                {r.stderr && <pre className="git-run-err">{r.stderr}</pre>}
              </div>
            ))}
          {snap && snap.running && snap.results.length > 0 && (
            <div className="git-run-loading">正在执行下一条命令…</div>
          )}
        </div>
      </div>
    </div>
  );
}
