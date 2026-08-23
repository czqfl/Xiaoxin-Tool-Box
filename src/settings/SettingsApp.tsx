/** 设置中心：左侧边栏导航 + 右侧内容区 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useConfigStore } from "../stores/configStore";
import { EVT_SHORTCUT_FAILED, onEvent } from "../core/events";
import { ClipboardPage } from "./ClipboardPage";
import { FolderPage } from "./FolderPage";
import { ShortcutPage } from "./ShortcutPage";
import { GeneralPage } from "./GeneralPage";
import { AboutPage } from "./AboutPage";
import { TranslationPage } from "./TranslationPage";
import { ToolbarPage } from "./ToolbarPage";
import { FilesPage } from "./FilesPage";
import { ScreenshotPage } from "./ScreenshotPage";
import { SettingsErrorBoundary } from "./ErrorBoundary";
import {
  IconClipboard,
  IconFiles,
  IconFolder,
  IconGrid,
  IconInfo,
  IconKeyboard,
  IconSettings,
  IconTranslate,
  IconScreenshot,
} from "../components/icons";
import "../styles/settings.css";

type Page =
  | "clipboard"
  | "folder"
  | "shortcut"
  | "general"
  | "translation"
  | "toolbar"
  | "files"
  | "screenshot"
  | "about";

const NAV_ITEMS: Array<{ key: Page; label: string; icon: React.ReactNode }> = [
  { key: "clipboard", label: "剪贴板设置", icon: <IconClipboard size={15} /> },
  { key: "folder", label: "文件夹设置", icon: <IconFolder size={15} /> },
  { key: "translation", label: "翻译设置", icon: <IconTranslate size={15} /> },
  { key: "shortcut", label: "快捷键设置", icon: <IconKeyboard size={15} /> },
  { key: "files", label: "快速文件", icon: <IconFiles size={15} /> },
  { key: "screenshot", label: "截图贴图", icon: <IconScreenshot size={15} /> },
  { key: "general", label: "通用设置", icon: <IconSettings size={15} /> },
  { key: "toolbar", label: "悬浮工具栏", icon: <IconGrid size={15} /> },
  { key: "about", label: "关于", icon: <IconInfo size={15} /> },
];

/** 把 CSS 颜色（#rgb / #rrggbb / rgb()）解析成 "r,g,b" 字符串；失败返回 null */
function cssColorToRgb(input: string): string | null {
  const s = input.trim();
  if (s.startsWith("#")) {
    if (s.length === 7) {
      const r = parseInt(s.slice(1, 3), 16);
      const g = parseInt(s.slice(3, 5), 16);
      const b = parseInt(s.slice(5, 7), 16);
      if ([r, g, b].every((v) => !Number.isNaN(v))) return `${r},${g},${b}`;
    } else if (s.length === 4) {
      const r = parseInt(s[1] + s[1], 16);
      const g = parseInt(s[2] + s[2], 16);
      const b = parseInt(s[3] + s[3], 16);
      if ([r, g, b].every((v) => !Number.isNaN(v))) return `${r},${g},${b}`;
    }
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return `${m[1]},${m[2]},${m[3]}`;
  return null;
}

export function SettingsApp() {
  const load = useConfigStore((s) => s.load);
  const loaded = useConfigStore((s) => s.loaded);
  const theme = useConfigStore((s) => s.config.general.theme);
  const [page, setPage] = useState<Page>("general");
  const [shortcutFailed, setShortcutFailed] = useState<string | null>(null);

  useEffect(() => {
    load();
    // 兜底：窗口 hide/show 切换后偶发"渲染了但状态未就绪"（表现为打不开/空白），
    // 每次获得焦点时若配置尚未加载则补一次加载
    const cleanup: Array<() => void> = [];
    let disposed = false;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused && !useConfigStore.getState().loaded) void load();
      })
      .then((un) => (disposed ? un() : cleanup.push(un)));
    // 启动时热键注册失败：跳转快捷键页并提示
    onEvent<string>(EVT_SHORTCUT_FAILED, (target) => {
      const names: Record<string, string> = {
        clipboard: "呼出剪贴板",
        folder: "呼出文件夹",
        credentials: "呼出账号密码",
        translation: "划词翻译",
        port: "呼出端口工具",
        files: "呼出快速文件",
        screenshot: "开始截图",
        pins: "显示/隐藏全部贴图",
      };
      setShortcutFailed(names[target] ?? target);
      setPage("shortcut");
    }).then((un) => (disposed ? un() : cleanup.push(un)));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [load]);

  // 设置窗口原生标题栏底色精确跟随侧栏 --bg-sidebar（任何主题一致）。
  // 原生 setTheme 只能 light/dark，浅色主题下 Windows 默认标题栏纯白、与浅灰侧栏
  // 有可见差异；改用 Rust 命令 set_settings_caption_color（DWMWA_CAPTION_COLOR）
  // 把标题栏底色设为与侧栏完全相同的色。theme 变化（含 system 跟随系统切换）后重设，
  // 并监听系统深浅变化，保证 system 模式实时一致。
  useEffect(() => {
    if (!loaded) return;
    const apply = () => {
      try {
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue("--bg-sidebar")
          .trim();
        const rgb = cssColorToRgb(raw);
        if (rgb) void invoke("set_settings_caption_color", { rgb }).catch(() => {});
      } catch {
        /* 非 Windows / 不支持则忽略 */
      }
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [loaded, theme]);

  if (!loaded) return null;

  return (
    <SettingsErrorBoundary>
      <div className="settings">
      <aside className="settings-sidebar">
        <div className="settings-brand">
          <span className="brand-dot">⚡</span>
          小心工具箱
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`settings-nav-item ${page === item.key ? "active" : ""}`}
            onClick={() => setPage(item.key)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="settings-sidebar-footer">v1.0.0 · Windows</div>
      </aside>

      <main className="settings-content">
        {shortcutFailed && page === "shortcut" && (
          <div className="setting-group" style={{ borderColor: "var(--danger)" }}>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-title" style={{ color: "var(--danger)" }}>
                  全局快捷键注册失败
                </div>
                <div className="setting-desc">
                  「{shortcutFailed}」的快捷键已被系统或其他应用占用，请在下方更换组合后保存。
                </div>
              </div>
            </div>
          </div>
        )}

        {page === "clipboard" && <ClipboardPage />}
        {page === "folder" && <FolderPage />}
        {page === "shortcut" && (
          <ShortcutPage onResolved={() => setShortcutFailed(null)} />
        )}
        {page === "general" && <GeneralPage />}
        {page === "translation" && <TranslationPage />}
        {page === "toolbar" && <ToolbarPage />}
        {page === "files" && <FilesPage />}
        {page === "screenshot" && <ScreenshotPage />}
        {page === "about" && <AboutPage />}
      </main>
      </div>
    </SettingsErrorBoundary>
  );
}
