/** 设置中心：左侧边栏导航 + 右侧内容区。
 *  菜单以功能模块划分（每个模块一页，含各自的功能开关与快捷键设置）；
 *  停用的功能其模块页从侧栏隐藏（重新启用走「功能开关」页）。 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useConfigStore } from "../stores/configStore";
import { EVT_SHORTCUT_FAILED, onEvent } from "../core/events";
import { ClipboardPage } from "./ClipboardPage";
import { FolderPage } from "./FolderPage";
import { CredentialPage } from "./CredentialPage";
import { PortPage } from "./PortPage";
import { SnippetsPage } from "./SnippetsPage";
import { GeneralPage } from "./GeneralPage";
import { AboutPage } from "./AboutPage";
import { TranslationPage } from "./TranslationPage";
import { ToolbarPage } from "./ToolbarPage";
import { FilesPage } from "./FilesPage";
import { ScreenshotPage } from "./ScreenshotPage";
import { RecorderPage } from "./RecorderPage";
import { StickyNotePage } from "./StickyNotePage";
import { FeaturePage, featureEnabled } from "./FeaturePage";
import { SettingsErrorBoundary } from "./ErrorBoundary";
import {
  IconClipboard,
  IconFiles,
  IconFolder,
  IconGrid,
  IconInfo,
  IconKey,
  IconSettings,
  IconTranslate,
  IconScreenshot,
  IconLock,
  IconPort,
  IconSnippet,
  IconRecord,
  IconSticky,
} from "../components/icons";
import "../styles/settings.css";

export type Page =
  | "clipboard"
  | "folder"
  | "credentials"
  | "translation"
  | "port"
  | "files"
  | "snippets"
  | "screenshot"
  | "recorder"
  | "features"
  | "general"
  | "toolbar"
  | "sticky"
  | "about";

/** 功能模块页（受功能开关控制：停用即从侧栏隐藏） */
const MODULE_ITEMS: Array<{ key: Page; label: string; feature: string; icon: React.ReactNode }> = [
  { key: "clipboard", label: "剪贴板", feature: "clipboard", icon: <IconClipboard size={15} /> },
  { key: "folder", label: "文件夹", feature: "folder", icon: <IconFolder size={15} /> },
  { key: "credentials", label: "账号密码", feature: "credentials", icon: <IconLock size={15} /> },
  { key: "translation", label: "划词翻译", feature: "translation", icon: <IconTranslate size={15} /> },
  { key: "port", label: "端口工具", feature: "port", icon: <IconPort size={15} /> },
  { key: "files", label: "快速文件", feature: "files", icon: <IconFiles size={15} /> },
  { key: "snippets", label: "常用语速贴", feature: "snippets", icon: <IconSnippet size={15} /> },
  { key: "screenshot", label: "截图贴图", feature: "screenshot", icon: <IconScreenshot size={15} /> },
  { key: "recorder", label: "屏幕录制", feature: "recorder", icon: <IconRecord size={15} /> },
  { key: "toolbar", label: "悬浮工具栏", feature: "toolbar", icon: <IconGrid size={15} /> },
];

/** 固定页（不受功能开关控制） */
const FIXED_ITEMS: Array<{ key: Page; label: string; icon: React.ReactNode }> = [
  { key: "sticky", label: "便签设置", icon: <IconSticky size={15} /> },
  { key: "features", label: "功能开关", icon: <IconKey size={15} /> },
  { key: "general", label: "通用设置", icon: <IconSettings size={15} /> },
  { key: "about", label: "关于", icon: <IconInfo size={15} /> },
];

/** 快捷键注册失败提示 → 跳转对应模块页（快捷键已分拆进各模块） */
const FAILED_TARGET_PAGE: Record<string, Page> = {
  clipboard: "clipboard",
  folder: "folder",
  credentials: "credentials",
  translation: "translation",
  port: "port",
  files: "files",
  snippets: "snippets",
  screenshot: "screenshot",
   pins: "screenshot",
   picker: "screenshot",
   recorder: "recorder",
   palette: "general",
 };
const FAILED_TARGET_NAME: Record<string, string> = {
  clipboard: "呼出剪贴板",
  folder: "呼出文件夹",
  credentials: "呼出账号密码",
  translation: "划词翻译",
  port: "呼出端口工具",
  files: "呼出快速文件",
  snippets: "呼出语速贴",
  screenshot: "开始截图",
   pins: "显示/隐藏全部贴图",
   picker: "屏幕取色",
   recorder: "屏幕录制",
   palette: "全局命令面板",
 };

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
  const config = useConfigStore((s) => s.config);
  const theme = useConfigStore((s) => s.config.general.theme);
  const [page, setPage] = useState<Page>("general");
  const [shortcutFailed, setShortcutFailed] = useState<string | null>(null);
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  // 任一快捷键保存成功（配置变化）即清除"注册失败"横幅
  useEffect(() => { setShortcutFailed(null); }, [shortcuts]);

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
    // 启动时热键注册失败：跳转对应功能模块页并提示
    onEvent<string>(EVT_SHORTCUT_FAILED, (target) => {
      setShortcutFailed(FAILED_TARGET_NAME[target] ?? target);
      setPage(FAILED_TARGET_PAGE[target] ?? "features");
    }).then((un) => (disposed ? un() : cleanup.push(un)));
    // 便签窗口"设置"入口：跳到便签设置页
    onEvent<void>("sticky://goto-settings", () => {
      setPage("sticky");
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
        // 令牌值可能是 light-dark(...) 未解析流（主题单源化后），
        // 直接 getPropertyValue 拿不到最终色；用隐藏探针元素借真实属性解析
        const probe = document.createElement("span");
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        probe.style.backgroundColor = "var(--bg-sidebar)";
        document.body.appendChild(probe);
        const raw = getComputedStyle(probe).backgroundColor;
        probe.remove();
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

  // 停用功能的模块页从侧栏隐藏；当前页若被停用则回落到「功能开关」
  const moduleItems = MODULE_ITEMS.filter((it) => featureEnabled(config, it.feature));
  // 固定页（便签设置/功能开关/通用/关于）不受功能开关控制，永不判为"停用"——
  // 此前漏了 sticky，导致点「便签设置」被误判为停用模块页，页面回落到功能开关
  const fixedPageKeys = new Set(FIXED_ITEMS.map((it) => it.key));
  const currentPageDisabled =
    !fixedPageKeys.has(page) &&
    !moduleItems.some((it) => it.key === page);

  return (
    <SettingsErrorBoundary>
      <div className="settings">
      <aside className="settings-sidebar">
        <div className="settings-brand">
          <span className="brand-dot">⚡</span>
          小心工具箱
        </div>
        {/* 功能开关置顶：作为总控入口放侧栏第一位 */}
        {FIXED_ITEMS.filter((it) => it.key === "features").map((item) => (
          <button
            key={item.key}
            className={`settings-nav-item ${page === item.key ? "active" : ""}`}
            onClick={() => setPage(item.key)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="settings-nav-divider" />
        {moduleItems.map((item) => (
          <button
            key={item.key}
            className={`settings-nav-item ${page === item.key ? "active" : ""}`}
            onClick={() => setPage(item.key)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="settings-nav-divider" />
        {FIXED_ITEMS.filter((it) => it.key !== "features").map((item) => (
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
        {shortcutFailed && (
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

        {currentPageDisabled ? (
          <FeaturePage onNavigate={setPage} />
        ) : (
          <>
            {page === "clipboard" && <ClipboardPage />}
            {page === "folder" && <FolderPage />}
            {page === "credentials" && <CredentialPage />}
            {page === "translation" && <TranslationPage />}
            {page === "port" && <PortPage />}
            {page === "files" && <FilesPage />}
            {page === "snippets" && <SnippetsPage />}
            {page === "screenshot" && <ScreenshotPage />}
            {page === "recorder" && <RecorderPage />}
            {page === "features" && <FeaturePage onNavigate={setPage} />}
            {page === "general" && <GeneralPage />}
            {page === "toolbar" && <ToolbarPage />}
            {page === "sticky" && <StickyNotePage />}
            {page === "about" && <AboutPage />}
          </>
        )}
      </main>
      </div>
    </SettingsErrorBoundary>
  );
}
