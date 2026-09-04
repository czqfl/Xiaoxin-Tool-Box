/** 设置中心：左侧边栏导航 + 右侧内容区。
 *  菜单以功能模块划分（每个模块一页，含各自的功能开关与快捷键设置）；
 *  停用的功能其模块页从侧栏隐藏（重新启用走「功能开关」页）。
 *  窗口为无边框 + 顶部自定义标题栏（拖拽/最小化/最大化/关闭 + 更新按钮）。 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { useConfigStore } from "../stores/configStore";
import { Spinner } from "../components/Spinner";
import { IconClose } from "../components/icons";
import { EVT_SHORTCUT_FAILED, EVT_FEEDBACK_REPLIES, onEvent } from "../core/events";
import { feedbackListReplies } from "../core/tauri";
import { useUpdaterStore } from "../core/updater";
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

/** 标题栏更新按钮：有新版本才出现。
 *  状态流转：available「更新 v1.0.5」→ downloading 迷你进度条 → downloaded
 *  「立即安装 / 稍后」→ 选稍后（saved）按钮常驻为「安装 v1.0.5」，随时可装；
 *  下载失败（error 且已知新版本）变「重试下载」。与关于页共用同一 updater store。 */
function TitlebarUpdateButton() {
  const { status, newVersion, downloaded, total, download, installSaved, postpone } =
    useUpdaterStore();
  const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
  const retryable = status === "error" && newVersion != null;
  const active =
    retryable ||
    status === "available" ||
    status === "downloading" ||
    status === "downloaded" ||
    status === "saved" ||
    status === "installing";
  if (!active) return null;

  return (
    <div className="titlebar-update">
      {status === "downloading" ? (
        <div className="titlebar-update-progress" title="正在下载新版本">
          <div className="titlebar-update-bar">
            <div
              className="titlebar-update-fill"
              style={{ width: total > 0 ? `${pct}%` : "100%" }}
            />
          </div>
          <span className="titlebar-update-pct">{total > 0 ? `${pct}%` : "下载中…"}</span>
        </div>
      ) : status === "downloaded" ? (
        <>
          <button className="titlebar-update-btn" onClick={() => void installSaved()}>
            立即安装
          </button>
          <button className="titlebar-update-later" onClick={postpone}>
            稍后
          </button>
        </>
      ) : status === "saved" ? (
        <button
          className="titlebar-update-btn"
          title={`安装包已保存，可随时安装 v${newVersion}`}
          onClick={() => void installSaved()}
        >
          安装 v{newVersion}
        </button>
      ) : status === "installing" ? (
        <span className="titlebar-update-installing">
          <Spinner size="sm" />
          安装中…
        </span>
      ) : status === "error" ? (
        <button className="titlebar-update-btn" onClick={() => void download()}>
          重试下载
        </button>
      ) : (
        <button
          className="titlebar-update-btn"
          title={`发现新版本 v${newVersion}，点击下载`}
          onClick={() => void download()}
        >
          更新 v{newVersion}
        </button>
      )}
    </div>
  );
}

/** 自定义标题栏：标题拖拽区（Tauri 内置拖拽移动 + 双击最大化）
 *  + 右侧更新按钮与最小化/最大化/关闭。关闭走 close() → 后端拦截为隐藏。 */
function SettingsTitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const w = getCurrentWindow();
    let disposed = false;
    const cleanup: Array<() => void> = [];
    const sync = () => {
      w.isMaximized()
        .then((m) => {
          if (!disposed) setMaximized(m);
        })
        .catch(() => {});
    };
    sync();
    w.onResized(sync).then((un) => (disposed ? un() : cleanup.push(un)));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, []);

  const w = getCurrentWindow();
  return (
    <div className="settings-titlebar">
      <div className="settings-titlebar-title" data-tauri-drag-region>
        小心工具箱 - 设置
      </div>
      <div className="settings-titlebar-right">
        <TitlebarUpdateButton />
        <button className="titlebar-ctl" title="最小化" onClick={() => void w.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          className="titlebar-ctl"
          title={maximized ? "还原" : "最大化"}
          onClick={() => void w.toggleMaximize()}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
              <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" />
            </svg>
          )}
        </button>
        <button
          className="titlebar-ctl titlebar-ctl-close"
          title="关闭"
          onClick={() => void w.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function SettingsApp() {
  const load = useConfigStore((s) => s.load);
  const loaded = useConfigStore((s) => s.loaded);
  const config = useConfigStore((s) => s.config);
  const [page, setPage] = useState<Page>("general");
  const [shortcutFailed, setShortcutFailed] = useState<string | null>(null);
  // 左下角版本号（真实运行版本，随发版自动变化；不再硬编码）
  const [version, setVersion] = useState("");
  // 发现新版本：「关于」侧栏项亮红点提示（下载中/待选择/安装中保持亮，引导用户看进度）
  const updateAvailable = useUpdaterStore(
    (s) =>
      s.status === "available" ||
      s.status === "downloading" ||
      s.status === "downloaded" ||
      s.status === "installing"
  );
  // 开发者回复未读：「关于」侧栏项同样亮红点（打开关于页后熄灭）
  const [repliesDot, setRepliesDot] = useState(false);
  // 事件回调里读当前页避免闭包过期：正停在关于页时不亮（页面自身实时刷新列表）
  const pageRef = useRef<Page>("general");
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  // 任一快捷键保存成功（配置变化）即清除"注册失败"横幅
  // 仅当快捷键【内容】真正变化时才清掉失败横幅：任意配置刷新都会产生新的
  // shortcuts 对象引用，按引用清会让"注册仍失败"的横幅被误抹掉
  const shortcutsJsonRef = useRef("");
  useEffect(() => {
    const j = JSON.stringify(shortcuts);
    if (shortcutsJsonRef.current && j !== shortcutsJsonRef.current) {
      setShortcutFailed(null);
    }
    shortcutsJsonRef.current = j;
  }, [shortcuts]);

  useEffect(() => {
    load();
    // 左下角版本号（真实运行版本，打包配置读取）
    getVersion().then(setVersion).catch(() => {});
    // 启动更新检查已前移到 App.tsx 顶层（应用启动即调度，不再依赖打开设置窗）
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
    // 开发者回复：启动时查一次未读数；轮询线程拉到新回复时亮红点
    feedbackListReplies()
      .then((s) => {
        if (!disposed && pageRef.current !== "about") setRepliesDot(s.unread > 0);
      })
      .catch(() => {});
    onEvent<number>(EVT_FEEDBACK_REPLIES, () => {
      if (pageRef.current !== "about") setRepliesDot(true);
    }).then((un) => (disposed ? un() : cleanup.push(un)));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [load]);

  if (!loaded) {
    // 配置加载期间：标题栏照常渲染（窗口可拖拽/关闭），主体给居中 Spinner
    return (
      <SettingsErrorBoundary>
        <div className="settings">
          <SettingsTitleBar />
          <div className="settings-body">
            <div className="settings-loading">
              <Spinner size="lg" />
            </div>
          </div>
        </div>
      </SettingsErrorBoundary>
    );
  }

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
      <SettingsTitleBar />
      <div className="settings-body">
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
            {/* 红点：新版本或开发者回复未读时「关于」项亮起，进入页面即见 */}
            {item.key === "about" && (updateAvailable || repliesDot) && (
              <span className="nav-update-dot" />
            )}
          </button>
        ))}
        <div className="settings-sidebar-footer">v{version || "…"} · Windows</div>
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
              <button
                className="icon-btn"
                title="关闭"
                onClick={() => setShortcutFailed(null)}
              >
                <IconClose size={14} />
              </button>
            </div>
          </div>
        )}

        {currentPageDisabled ? (
          <>
            {/* 回落必须留痕：静默换页时用户不知道自己点的页去哪了 */}
            <div className="setting-group" style={{ borderColor: "var(--warning, #f5a524)" }}>
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-desc">
                    当前页对应的功能已被停用，以下为「功能开关」页；可在下方重新开启后返回。
                  </div>
                </div>
              </div>
            </div>
            <FeaturePage onNavigate={setPage} />
          </>
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
      </div>
    </SettingsErrorBoundary>
  );
}
