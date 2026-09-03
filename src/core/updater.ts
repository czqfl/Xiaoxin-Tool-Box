/** 自动更新：tauri-plugin-updater 封装。
 *  流程：check() 比对服务器 latest.json → 有新版则 downloadAndInstall()
 *  （下载 + 签名校验 + passive 静默覆盖安装）→ relaunch() 重启进新版。
 *  - 启动静默检查：设置窗口挂载后延迟触发（见 SettingsApp），失败完全静默
 *    （服务器未就绪/离线是常态，不能打扰用户）；发现新版则侧栏「关于」亮红点。
 *  - 手动检查：关于页按钮驱动，失败提示原因。
 *  注意：dev 环境下 endpoint 连不上属预期，一律 catch 吞掉。 */
import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterStatus =
  | "idle" // 未检查
  | "checking" // 检查中
  | "available" // 发现新版本
  | "latest" // 已是最新
  | "downloading" // 下载中
  | "installing" // 下载完成，安装中
  | "error"; // 检查/下载失败

interface UpdaterState {
  status: UpdaterStatus;
  /** 新版本号（status=available/downloading 时有值） */
  newVersion: string | null;
  /** 更新说明（latest.json 的 notes） */
  notes: string | null;
  /** 下载进度：已下载字节 / 总字节（服务器未给 contentLength 时 total 为 0） */
  downloaded: number;
  total: number;
  error: string | null;
}

interface UpdaterActions {
  /** 手动检查（关于页按钮）：任何结果都反映到界面上 */
  manualCheck: () => Promise<void>;
  /** 静默检查（启动后台）：仅发现新版时改变状态，失败/已最新都保持 idle 不打扰 */
  silentCheck: () => Promise<void>;
  /** 下载并安装，完成后自动重启。返回后应用即被安装器接管，无需调用方善后 */
  downloadAndInstall: () => Promise<void>;
}

export const useUpdaterStore = create<UpdaterState & UpdaterActions>((set, get) => ({
  status: "idle",
  newVersion: null,
  notes: null,
  downloaded: 0,
  total: 0,
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

  downloadAndInstall: async () => {
    if (get().status !== "available") return;
    set({ status: "downloading", downloaded: 0, total: 0, error: null });
    try {
      // 重新 check 拿 Update 实例（store 里只存了展示字段）
      const update: Update | null = await check({ timeout: 15000 });
      if (!update?.available) {
        // 二次检查时服务器版本已撤下/网络变化
        set({ status: "latest", newVersion: null });
        return;
      }
      await update.downloadAndInstall(
        (e) => {
          if (e.event === "Started") {
            set({ total: e.data.contentLength ?? 0, downloaded: 0 });
          } else if (e.event === "Progress") {
            set((s) => ({ downloaded: s.downloaded + e.data.chunkLength }));
          }
        },
        { timeout: 300000 } // 安装包几十 MB，给足 5 分钟
      );
      set({ status: "installing" });
      // passive 安装器接管后应用退出；relaunch 保证部分场景下主动回到新版
      await relaunch();
    } catch (e) {
      set({
        status: "error",
        error: String(e instanceof Error ? e.message : e),
      });
    }
  },
}));

/** 启动静默检查入口：延迟启动，避开启动高峰的磁盘/网络争抢 */
export function scheduleStartupUpdateCheck(): void {
  window.setTimeout(() => {
    void useUpdaterStore.getState().silentCheck();
  }, 8000);
}
