/** Git 命令执行状态独立窗口（label: `git-run`）
 *
 *  【为什么必须独立窗口】面板内的任何浮层（哪怕 createPortal 挂到 body）都锁在
 *  同一个 WebView 里——既不能拖到屏幕任意位置，也无法在命令执行期间同时操作
 *  文件夹面板。独立 Tauri 窗口天然满足两点：可拖到任意位置、与面板互不干扰。
 *
 *  【外观】与文件夹面板同构：外壳就是 .panel > .panel-shell，窗口效果（DWM 原生
 *  圆角 + 亚克力模糊 + webview 透明底）由 Rust 端 panel_apply_window_effects 施加，
 *  底色不透明度同样吃 --panel-opacity，视觉与文件夹面板完全一致。
 *
 *  【数据来源】由 folder-panel 通过 emitTo("git-run", "git-run-update") 逐条推送。
 *
 *  【高度】内容驱动自适应：ResizeObserver 测量外壳高度后 setSize；注意本窗口与
 *  面板相反——面板铺满固定高度的窗口，本窗口是窗口跟着内容收缩（见 folder.css
 *  里 .git-run-window .panel-shell { height: auto }）。 */
import { useEffect, useRef, useState } from "react";
import {
  LogicalSize,
  PhysicalPosition,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { emitTo } from "@tauri-apps/api/event";
import type { FolderEntry, GitRunResult } from "../../types";
import { IconBranch, IconClose } from "../../components/icons";
import { onEvent } from "../../core/events";
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

/** 窗口逻辑宽度（与 FolderPanel 的 GITRUN_W 保持一致） */
const WIN_W = 460;
/** 窗口逻辑高度上下限（内容自适应，超出后 body 内滚动） */
const MIN_H = 132;
const MAX_H = 620;

export function GitRunWindow() {
  const [snap, setSnap] = useState<GitRunSnapshot | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  // 【订阅与自举必须串行】先 await 注册 update 监听，注册成功后才发 ready
  // 索取快照。拆成两个 effect 会竞态：emitTo 是异步 IPC，ready 一发出
  // folder-panel 立刻回推，而本窗口的 listen 可能还没落地 → 首帧快照丢失，
  // 表现为"窗口弹出来却是空的"，且因内容没渲染连关闭按钮都点不到（疑似卡死）。
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

  // 关闭：通知来源面板清空状态 + 隐藏本窗口（隐藏而非销毁，下次执行瞬时复用）
  const close = () => {
    void emitTo("folder-panel", "git-run-close", true).catch(() => {});
    void getCurrentWindow().hide().catch(() => {});
  };

  // Esc 关闭：窗口持有焦点时按键由本窗口处理
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 高度自适应：内容变化 → 测量 → setSize；底部可能顶出工作区时把窗口上提
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    let raf = 0;
    let last = 0;
    const apply = () => {
      const h = Math.min(
        MAX_H,
        Math.max(MIN_H, Math.ceil(el.getBoundingClientRect().height)),
      );
      if (Math.abs(h - last) < 2) return;
      last = h;
      void (async () => {
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(WIN_W, h)).catch(() => {});
        const [mon, pos] = await Promise.all([
          currentMonitor().catch(() => null),
          win.outerPosition().catch(() => null),
        ]);
        const wa = mon?.workArea;
        if (!pos || !wa) return;
        const sf = mon?.scaleFactor ?? 1;
        const bottom = pos.y + Math.round(h * sf);
        const waBottom = wa.position.y + wa.size.height;
        if (bottom > waBottom) {
          const y = Math.max(wa.position.y, waBottom - Math.round(h * sf));
          await win.setPosition(new PhysicalPosition(pos.x, y)).catch(() => {});
        }
      })();
    };
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    });
    ro.observe(el);
    apply();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [snap]);

  return (
    <div className="panel git-run-window">
      <div className="panel-shell" ref={shellRef}>
        <div className="panel-header" data-tauri-drag-region>
          <span className="git-run-title">
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
          <button className="icon-btn" title="关闭" onClick={close}>
            <IconClose size={14} />
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
