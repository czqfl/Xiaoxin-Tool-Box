/** 设置中心：左侧边栏导航 + 右侧内容区 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConfigStore } from "../stores/configStore";
import { EVT_SHORTCUT_FAILED, onEvent } from "../core/events";
import { ClipboardPage } from "./ClipboardPage";
import { FolderPage } from "./FolderPage";
import { ShortcutPage } from "./ShortcutPage";
import { GeneralPage } from "./GeneralPage";
import { AboutPage } from "./AboutPage";
import { TranslationPage } from "./TranslationPage";
import { ToolbarPage } from "./ToolbarPage";
import { StickyNotePage } from "./StickyNotePage";
import { SettingsErrorBoundary } from "./ErrorBoundary";
import {
  IconClipboard,
  IconFolder,
  IconGrid,
  IconInfo,
  IconKeyboard,
  IconSettings,
  IconSticky,
  IconTranslate,
} from "../components/icons";
import "../styles/settings.css";

type Page =
  | "clipboard"
  | "folder"
  | "shortcut"
  | "general"
  | "translation"
  | "toolbar"
  | "sticky"
  | "about";

const NAV_ITEMS: Array<{ key: Page; label: string; icon: React.ReactNode }> = [
  { key: "clipboard", label: "剪贴板设置", icon: <IconClipboard size={15} /> },
  { key: "folder", label: "文件夹设置", icon: <IconFolder size={15} /> },
  { key: "shortcut", label: "快捷键设置", icon: <IconKeyboard size={15} /> },
  { key: "translation", label: "翻译设置", icon: <IconTranslate size={15} /> },
  { key: "toolbar", label: "悬浮工具栏", icon: <IconGrid size={15} /> },
  { key: "sticky", label: "便签设置", icon: <IconSticky size={15} /> },
  { key: "general", label: "通用设置", icon: <IconSettings size={15} /> },
  { key: "about", label: "关于", icon: <IconInfo size={15} /> },
];

export function SettingsApp() {
  const load = useConfigStore((s) => s.load);
  const loaded = useConfigStore((s) => s.loaded);
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
      setShortcutFailed(target === "clipboard" ? "呼出剪贴板" : "呼出文件夹");
      setPage("shortcut");
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
        {page === "sticky" && <StickyNotePage />}
        {page === "about" && <AboutPage />}
      </main>
      </div>
    </SettingsErrorBoundary>
  );
}
