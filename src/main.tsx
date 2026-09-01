import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 便签窗口同步工具箱主题：便签样式体系完全隔离（自带明暗/主题预设），
 *  之前不消费工具箱主题——切换红色等主题时便签毫无反应。此处：
 *  1) 引入 theme.css 并挂 data-theme（工具箱主题令牌生效，仅 CSS 变量，无副作用）
 *  2) 把便签强调色 --accent 对齐工具箱主题色（color-mix 派生色自动跟随）
 *  3) 监听配置变化实时跟随（含 system 跟随系统切换）
 *  仅覆盖 --accent 一个变量，便签其余视觉（明暗/圆角/图钉色等）保持独立 */
function syncToolboxTheme(): void {
  invoke<{ general?: { theme?: string } }>("config_load")
    .then((cfg) => {
      const t = cfg?.general?.theme ?? "system";
      if (t === "system") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", t);
      // 读解析后的 rgb 三元组设置【具体色值】——不嵌套 var 引用：任何一环
      // var 解析失败都会让下游 color-mix 整体无效 → 便签窗口（transparent
      // 窗体）全透明。theme.css 已在此前 await import，变量必然可读
      const rgb = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-rgb").trim();
      if (rgb) {
        document.documentElement.style.setProperty("--accent", `rgb(${rgb})`);
        document.documentElement.style.setProperty(
          "--select-bg",
          `color-mix(in srgb, rgb(${rgb}) 16%, var(--bg))`,
        );
      }
    })
    .catch(() => {});
}

/** 键盘模态标记：仅当用户真的按过 Tab / 方向键时，才给 <html> 挂 data-kbd="1"，
 *  鼠标按下立即摘掉。
 *  用途：焦点环只在键盘导航时出现。不直接依赖 :focus-visible 是因为
 *  WebView2 中鼠标点击按钮后它依然会命中，导致"点完一直留一圈边框"
 *  （已收到过该反馈，见 b7b343a）。 */
function trackKeyboardModality(): void {
  const root = document.documentElement;
  const on = () => root.setAttribute("data-kbd", "1");
  const off = () => root.removeAttribute("data-kbd");
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow")) on();
    },
    true
  );
  window.addEventListener("mousedown", off, true);
  window.addEventListener("pointerdown", off, true);
  window.addEventListener("blur", off, true);
}

/** 全局入口：按窗口 label 分流——
 *  便签相关窗口（note_* / sticky-*）挂载 vanilla 便签应用（样式完全隔离），
 *  其余窗口挂载工具箱 React 应用。
 *  便签设置入口：工具箱设置页「便签设置」页签（settings/StickyNotePage.tsx，
 *  React 实现，直接读写便签配置）；便签自带的旧版设置面板已删除。
 *  【设置归属】便签设置存于便签自己的 sticky_settings.json，不进工具箱
 *  AppConfig——界面统一挂在工具箱设置里，底层配置保持独立。 */
async function bootstrap() {
  // 焦点环与键盘导航的前提：必须先于任何组件挂载
  trackKeyboardModality();
  const label = getCurrentWindow().label;

  // 【仅开发模式】便签/历史/截图遮罩等窗口都是"预热创建、隐藏复用"的常驻窗口，
  // 隐藏期间 vite 热更新推送会丢失——改动前端后呼出窗口看到的仍是旧页面
  // （"改了没生效"的顽疾）。显示（从隐藏转为可见）时自动整页重载，
  // 保证开发期呼出即最新代码；生产构建（DEV=false）完全不注册，无任何影响
  if (import.meta.env.DEV) {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) location.reload();
    });
  }

  const isSticky =
    label.startsWith("note_") ||
    label === "sticky-history" ||
    // 全屏透明粒子层窗口（label 与 tauri.conf.json / glow-particles 查找一致）
    label === "particles" ||
    label === "sticky-imageviewer" ||
    label === "sticky-settings";

  // 便签窗口：动态加载便签样式与应用（不注入工具箱 base.css，避免样式污染；
  // theme.css 仅含 CSS 变量，单独引入以提供工具箱主题色令牌）
  if (isSticky) {
    document.documentElement.dataset.window = "sticky";
    await import("./sticky/styles.css");
    await import("./styles/theme.css");
    syncToolboxTheme();
    void listen("config://changed", () => {
      syncToolboxTheme();
      // 已打开的便签实时跟随工具箱主题（明暗派生 + 重新应用）
      void import("./sticky/settings").then((m) => m.refreshThemeFromToolbox());
    });
    const { mountStickyByLabel } = await import("./sticky/sticky-main");
    mountStickyByLabel();
    return;
  }

  // 面板窗口：标记 html，由 CSS 将 webview 背景置为透明，
  // 露出后端应用的亚克力层；否则不透明背景会在圆角外画出黑色矩形
  const panelLabels = [
    "clipboard-panel",
    "folder-panel",
    // Git 命令执行结果独立窗口：与面板同一套透明底 + 主题变量（效果由启动管线 + 补刷提供）
    "git-run",
    "credential-panel",
    "port-panel",
    "files-panel",
    "snippets-panel",
    "translate-popup",
    "palette",
    "toolbar",
    // 悬浮控制条/指示窗：同一套透明底 + 主题变量（亚克力由 Rust 端应用）
    "scrollshot-bar",
    "scrollshot-frame",
    "rec-select",
    "rec-bar",
  ];
  if (panelLabels.includes(label)) {
    document.documentElement.dataset.window = "panel";
  }
  // 截图遮罩窗：webview 背景透明，露出底下的原生冻结层（Rust 子 HWND 直贴位图）
  if (label.startsWith("shot-overlay")) {
    document.documentElement.dataset.window = "shot";
  }
  // 贴图窗：页面背景必须透明——show 后 WebView2 首帧 present 前的未绘制瞬间，
  // 不透明主题底色会闪出一块实色矩形；透明则该瞬间不可见，绝无闪烁
  if (label.startsWith("pin-")) {
    document.documentElement.dataset.window = "pin";
  }
  // 贴图右键菜单窗（pin-menu-*）：同一套透明上下文，玻璃底随主题；实际渲染由
  // App 按 label 分流到 PinMenu 组件（startsWith 覆盖 pin-menu-<timestamp> 唯一标签）
  if (label.startsWith("pin-menu")) {
    document.documentElement.dataset.window = "pin";
  }

  const [{ default: React }, { default: ReactDOM }, { default: App }] = await Promise.all([
    import("react"),
    import("react-dom/client"),
    import("./App"),
  ]);
  await import("./styles/base.css");
  ReactDOM.createRoot(document.getElementById("root")!).render(
    React.createElement(React.StrictMode, null, React.createElement(App))
  );
}

void bootstrap();
