/** 全局配置 store：加载/保存/广播，并联动应用主题 */
import { create } from "zustand";
import type { AppConfig } from "../types";
import { loadConfig, saveConfig } from "../core/tauri";
import { applyTheme } from "../core/theme";
import { broadcastConfigChanged } from "../core/events";

const defaultConfig: AppConfig = {
  clipboard: {
    max_history: 200,
    watch_images: true,
    watch_files: true,
    close_after_paste: true,
  },
  folder: {
    show_visit_count: true,
    layout: "grid",
    split: "columns",
    page_size: 12,
  },
  shortcuts: {
    clipboard: "Alt+C",
    folder: "Alt+F",
  },
  general: {
    theme: "system",
    silent_start: true,
    language: "zh-CN",
  },
};

interface ConfigStore {
  config: AppConfig;
  loaded: boolean;
  load: () => Promise<void>;
  /** 基于当前配置生成新配置并持久化；默认广播给其他窗口 */
  update: (next: AppConfig, broadcast?: boolean) => Promise<void>;
  /** 仅本地同步（收到其他窗口广播时使用） */
  sync: (next: AppConfig) => void;
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: defaultConfig,
  loaded: false,

  load: async () => {
    try {
      const config = await loadConfig();
      set({ config, loaded: true });
      applyTheme(config.general.theme);
    } catch (err) {
      console.error("加载配置失败，使用默认配置", err);
      set({ config: defaultConfig, loaded: true });
    }
  },

  update: async (next, broadcast = true) => {
    set({ config: next });
    applyTheme(next.general.theme);
    await saveConfig(next);
    if (broadcast) {
      await broadcastConfigChanged();
    }
  },

  sync: (next) => {
    set({ config: next, loaded: true });
    applyTheme(next.general.theme);
  },
}));

/** 便捷读取当前配置 */
export const getConfig = () => useConfigStore.getState().config;
export default getConfig;
