/** 全局配置 store：加载/保存/广播，并联动应用主题 */
import { create } from "zustand";
import type { AppConfig } from "../types";
import { loadConfig, saveConfig } from "../core/tauri";
import { applyPanelStyle, applyTheme } from "../core/theme";
import { broadcastConfigChanged } from "../core/events";

const defaultConfig: AppConfig = {
  clipboard: {
    enabled: true,
    max_history: 200,
    watch_images: true,
    watch_files: true,
    close_after_paste: true,
    always_on_top: false,
    paste_mode: "normal",
  },
  folder: {
    enabled: true,
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
    enabled: true,
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
    screenshot: "Ctrl+Alt+A",
    pins: "Ctrl+Alt+P",
    pins_close: "Ctrl+Alt+K",
    picker: "Alt+D",
    recorder: "Ctrl+Alt+R",
    palette: "Alt+G",
  },
  general: {
    theme: "system",
    silent_start: true,
    language: "zh-CN",
    acrylic_enabled: true,
    acrylic_opacity: 60,
  },
  translator: {
    enabled: true,
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
    enabled: true,
    always_on_top: false,
  },
  files: {
    enabled: true,
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
    tools: ["clipboard", "folder", "credentials", "translation", "port", "files", "snippets", "screenshot", "settings", "sticky"],
    orientation: "vertical",
    auto_hide: true,
    size: "small",
    position: null,
  },
  snippets: {
    enabled: true,
    always_on_top: false,
  },
  shot: {
    enabled: true,
    capture_cursor: false,
    smart_detect: true,
    smart_element: true,
    magnifier: true,
    magnifier_round: false,
    remember_region: true,
    auto_copy: true,
    save_format: "png",
    jpg_quality: 95,
    save_dir: null,
    history_enabled: true,
    history_max_count: 20,
    history_max_days: 7,
    ocr_model: "ppocrv6-tiny",
  },
  recorder: {
    enabled: true,
    fmt: "mp4",
    res: "raw",
    fps: 12,
    quality: "normal",
    max_duration_secs: 0,
    save_dir: null,
    audio: "off",
  },
  pin: {
    opacity: 100,
    border_shadow: true,
    restore_on_start: true,
  },
  annotate: {
    stroke_width: 3,
    font_size: 18,
    mosaic_block: 12,
    colors: ["#e5484d", "#ff8d1a", "#ffd60a", "#36b37e", "#4c8dff", "#b06fd6", "#ffffff", "#000000"],
  },
  panel_positions: {},
  panel_sizes: {},
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

/** 旧版本配置补齐：缺字段（如新增的 enabled 开关）用默认值填充，
 *  避免 undefined 在布尔语境被当 false——那会把全部功能当成"已停用" */
function mergeDefaults(next: AppConfig): AppConfig {
  const merged = { ...defaultConfig, ...next } as AppConfig;
  for (const k of Object.keys(defaultConfig) as Array<keyof AppConfig>) {
    const d = defaultConfig[k];
    const v = merged[k] as unknown;
    if (d && typeof d === "object" && !Array.isArray(d) && v && typeof v === "object" && !Array.isArray(v)) {
      (merged as unknown as Record<string, unknown>)[k] = { ...(d as object), ...(v as object) };
    }
  }
  return merged;
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: defaultConfig,
  loaded: false,

  load: async () => {
    try {
      const config = mergeDefaults(await loadConfig());
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
    // 主题/外观立即生效（applyTheme 内部已去重），持久化与广播都不阻塞渲染：
    // 磁盘写入放后台，广播先发——其他窗口同步越早，整体切换观感越跟手
    void saveConfig(next);
    applyTheme(next.general.theme);
    applyPanelStyle(next.general.acrylic_opacity, next.general.acrylic_enabled);
    if (broadcast) {
      await broadcastConfigChanged(next);
    }
  },

  sync: (next) => {
    // 防御：无效载荷时保留当前配置，避免把 config 置为 undefined 导致界面崩溃
    if (!next || typeof next !== "object" || !next.general || !next.clipboard) {
      return;
    }
    const merged = mergeDefaults(next);
    set({ config: merged, loaded: true });
    applyTheme(merged.general.theme);
    applyPanelStyle(
      merged.general.acrylic_opacity,
      merged.general.acrylic_enabled
    );
  },
}));

/** 便捷读取当前配置 */
export const getConfig = () => useConfigStore.getState().config;
export default getConfig;
