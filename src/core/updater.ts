/** 自动更新状态机：检查（JS 插件 API）→ 下载（Rust 命令，含验签+保存安装包）
 *  → 用户选择「立即安装 / 稍后」→ 立即安装走 Rust 命令（passive 安装器接管，
 *  装完自动重启）；稍后则安装包留在系统下载目录，用户可随时双击安装。
 *  - 启动静默检查：设置窗口挂载后延迟触发（见 SettingsApp），失败完全静默
 *    （服务器未就绪/离线是常态，不能打扰用户）；发现新版则侧栏「关于」亮红点。
 *  - 手动检查：关于页按钮驱动，失败提示原因。
 *  注意：dev 环境下 endpoint 连不上属预期，一律 catch 吞掉。 */
import { create } from "zustand";
import { check } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type UpdaterStatus =
  | "idle" // 未检查
  | "checking" // 检查中
  | "available" // 发现新版本
  | "latest" // 已是最新
  | "downloading" // 下载中
  | "downloaded" // 下载完成，等待用户选择立即/稍后
  | "saved" // 用户选择稍后：安装包已在下载目录
  | "installing" // 安装器已启动，应用即将退出重启
  | "error"; // 检查/下载失败

interface UpdaterState {
  status: UpdaterStatus;
  /** 新版本号（available/downloading/downloaded/saved 时有值） */
  newVersion: string | null;
  /** 更新说明（latest.json 的 notes） */
  notes: string | null;
  /** 下载进度：已下载字节 / 总字节（服务器未给 contentLength 时 total 为 0） */
  downloaded: number;
  total: number;
  /** 已下载安装包的磁盘路径（downloaded/saved/installing 时有值） */
  savedPath: string | null;
  error: string | null;
}

interface UpdaterActions {
  /** 手动检查（关于页按钮）：任何结果都反映到界面上 */
  manualCheck: () => Promise<void>;
  /** 静默检查（启动后台）：仅发现新版时改变状态，失败/已最新都保持 idle 不打扰 */
  silentCheck: () => Promise<void>;
  /** 下载新版安装包（Rust 命令：验签 + 保存到下载目录），完成进入 downloaded */
  download: () => Promise<void>;
  /** 立即安装已下载的安装包：passive 安装器接管，应用退出重启，正常不返回 */
  installSaved: () => Promise<void>;
  /** 稍后安装：仅记住保存路径（文件已在下载目录，用户可随时双击安装） */
  postpone: () => void;
}

export const useUpdaterStore = create<UpdaterState & UpdaterActions>((set, get) => ({
  status: "idle",
  newVersion: null,
  notes: null,
  downloaded: 0,
  total: 0,
  savedPath: null,
  error: null,

  manualCheck: async () => {
    if (get().status === "checking" || get().status === "downloading") return;
    set({ status: "checking", error: null });
    try {
      const update = await check({ timeout: 15000 });
      if (update?.available) {
        set({
          status: "available",
          newVersion: update.version,
          notes: update.body ?? null,
        });
      } else {
        set({ status: "latest", newVersion: null, notes: null });
      }
    } catch (e) {
      // 服务器未就绪 / 离线 / DNS 未配置：手动场景把原因透给用户
      set({ status: "error", error: String(e instanceof Error ? e.message : e) });
    }
  },

  silentCheck: async () => {
    // 已知状态（手动检查过/正在下载）不覆盖
    if (get().status !== "idle") return;
    try {
      const update = await check({ timeout: 15000 });
      if (update?.available) {
        set({
          status: "available",
          newVersion: update.version,
          notes: update.body ?? null,
        });
      }
      // 无新版：保持 idle，静默
    } catch {
      /* 静默失败：更新服务器尚未就绪是常态 */
    }
  },

  download: async () => {
    // available 正常入口；error 允许重试（下载中断后无需重新检查即可再下，
    // Rust 侧 updater_download 自带完整检查，不依赖前端状态）
    if (get().status !== "available" && get().status !== "error") return;
    set({ status: "downloading", downloaded: 0, total: 0, error: null });
    // 订阅 Rust 侧进度事件（下载结束后取消订阅）
    let unlisten: UnlistenFn | null = null;
    try {
      unlisten = await listen<{ downloaded: number; total: number }>(
        "updater:download-progress",
        (e) => set({ downloaded: e.payload.downloaded, total: e.payload.total })
      );
      const outcome = await invoke<{ version: string; path: string }>("updater_download");
      set({
        status: "downloaded",
        newVersion: outcome.version,
        savedPath: outcome.path,
      });
    } catch (e) {
      set({
        status: "error",
        error: String(e instanceof Error ? e.message : e),
      });
    } finally {
      unlisten?.();
    }
  },

  installSaved: async () => {
    const { status, savedPath } = get();
    // downloaded（刚下完）与 saved（用户选了稍后、按钮常驻）都可安装
    if ((status !== "downloaded" && status !== "saved") || !savedPath) return;
    set({ status: "installing", error: null });
    try {
      // 正常情况下不返回：安装器接管后应用退出，装完自动重启进新版
      await invoke("updater_install_saved", { path: savedPath });
    } catch (e) {
      set({
        status: "error",
        error: String(e instanceof Error ? e.message : e),
      });
    }
  },

  postpone: () => {
    if (get().status !== "downloaded") return;
    set({ status: "saved" });
  },
}));

/** 应用进程内是否已调度过启动检查（多窗口共用入口，防重复） */
let startupCheckScheduled = false;

/** 启动静默检查入口：延迟 8s（避开启动高峰的磁盘/网络争抢）。
 *  必须在应用启动即挂载的主入口调用（如 App.tsx 顶层），不能放设置窗等
 *  用户需手动打开才会渲染的组件——否则不打开设置窗就永远不检查。
 *  silentCheck 自身还有 status!=idle 守卫：手动检查过就不覆盖。 */
export function runStartupUpdateCheckOnce(): void {
  if (startupCheckScheduled) return;
  startupCheckScheduled = true;
  window.setTimeout(() => {
    void useUpdaterStore.getState().silentCheck();
  }, 8000);
}
