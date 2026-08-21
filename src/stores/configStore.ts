/** 全局配置 store：加载/保存/广播，并联动应用主题 */
import { create } from "zustand";
import type { AppConfig } from "../types";
import { loadConfig, saveConfig } from "../core/tauri";
import { applyPanelStyle, applyTheme } from "../core/theme";
import { broadcastConfigChanged } from "../core/events";

const defaultConfig: AppConfig = {
  clipboard: {
    max_history: 200,
    watch_images: true,
    watch_files: true,
    close_after_paste: true,
    always_on_top: false,
    paste_mode: "normal",
  },
  folder: {
    show_visit_count: true,
    layout: "grid",
    split: "columns",
    page_size: 12,
    always_on_top: false,
    track_explorer: true,
    terminal_shell: "powershell",
    vscode_path: null,
  },
  credentials: {
    always_on_top: false,
    show_passwords: false,
  },
  shortcuts: {
    clipboard: "Alt+C",
    folder: "Alt+F",
    credentials: "Alt+A",
    translation: "Alt+S",
    port: "Alt+P",
    files: "Alt+Q",
    snippets: "Alt+K",
  },
  general: {
    theme: "system",
    silent_start: true,
    language: "zh-CN",
    acrylic_enabled: true,
    acrylic_opacity: 60,
  },
  translator: {
    provider: "youdao",
    youdao_key: "",
    youdao_secret: "",
    baidu_appid: "",
    baidu_secret: "",
    target_lang: "zh",
    /* 默认不置顶常驻：划词翻译后失焦自动隐藏（与其他面板一致） */
    always_on_top: false,
  },
  port: {
    always_on_top: false,
  },
  files: {
    location: null,
    file_types: [
      { ext: "txt", label: "文本", color: "#8a94a6", opener: null },
      { ext: "md", label: "Markdown", color: "#4c8dff", opener: null },
      { ext: "json", label: "JSON", color: "#e0a23a", opener: null },
      { ext: "csv", label: "CSV", color: "#36b37e", opener: null },
      { ext: "log", label: "日志", color: "#b06fd6", opener: null },
      { ext: "yaml", label: "YAML", color: "#d96aa0", opener: null },
    ],
    always_on_top: false,
    default_group: "type",
    default_sort: "created",
    default_layout: "vertical",
  },
  toolbar: {
    enabled: true,
    tools: ["clipboard", "folder", "credentials", "translation", "port", "files", "snippets", "settings"],
    orientation: "vertical",
    auto_hide: true,
  },
  panel_positions: {},
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
      applyPanelStyle(
        config.general.acrylic_opacity,
        config.general.acrylic_enabled
      );
    } catch (err) {
      console.error("加载配置失败，使用默认配置", err);
      set({ config: defaultConfig, loaded: true });
    }
  },

  update: async (next, broadcast = true) => {
    set({ config: next });
    applyTheme(next.general.theme);
    applyPanelStyle(next.general.acrylic_opacity, next.general.acrylic_enabled);
    await saveConfig(next);
    if (broadcast) {
      await broadcastConfigChanged(next);
    }
  },

  sync: (next) => {
    // 防御：无效载荷时保留当前配置，避免把 config 置为 undefined 导致界面崩溃
    if (!next || typeof next !== "object" || !next.general || !next.clipboard) {
      return;
    }
    set({ config: next, loaded: true });
    applyTheme(next.general.theme);
    applyPanelStyle(next.general.acrylic_opacity, next.general.acrylic_enabled);
  },
}));

/** 便捷读取当前配置 */
export const getConfig = () => useConfigStore.getState().config;
export default getConfig;
