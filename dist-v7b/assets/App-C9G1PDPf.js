const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index--ziH6xz5.js","assets/index-B-gap5mw.js"])))=>i.map(i=>d[i]);
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { r as requireReact } from "./index-BpvutWXK.js";
import { R as React, r as reactExports } from "./index-DoxHwSNj.js";
import { l as listen, e as emit, i as invoke, g as getCurrentWindow, b as getAllWindows, L as LogicalSize, P as PhysicalPosition, d as LogicalPosition, a as PhysicalSize, f as emitTo, _ as __vitePreload } from "./index-B-gap5mw.js";
import { W as WebviewWindow } from "./webviewWindow-Cr3D_jCO.js";
import { open, save } from "./index--ziH6xz5.js";
import { r as requireReactDom } from "./index-CnVeNpEK.js";
import { P as PIN_ICON_PATH } from "./pin-path.const-Bic-ch4A.js";
var jsxRuntime = { exports: {} };
var reactJsxRuntime_production_min = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var hasRequiredReactJsxRuntime_production_min;
function requireReactJsxRuntime_production_min() {
  if (hasRequiredReactJsxRuntime_production_min) return reactJsxRuntime_production_min;
  hasRequiredReactJsxRuntime_production_min = 1;
  var f = requireReact(), k = Symbol.for("react.element"), l = Symbol.for("react.fragment"), m = Object.prototype.hasOwnProperty, n = f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, p = { key: true, ref: true, __self: true, __source: true };
  function q(c, a, g) {
    var b, d = {}, e = null, h = null;
    void 0 !== g && (e = "" + g);
    void 0 !== a.key && (e = "" + a.key);
    void 0 !== a.ref && (h = a.ref);
    for (b in a) m.call(a, b) && !p.hasOwnProperty(b) && (d[b] = a[b]);
    if (c && c.defaultProps) for (b in a = c.defaultProps, a) void 0 === d[b] && (d[b] = a[b]);
    return { $$typeof: k, type: c, key: e, ref: h, props: d, _owner: n.current };
  }
  reactJsxRuntime_production_min.Fragment = l;
  reactJsxRuntime_production_min.jsx = q;
  reactJsxRuntime_production_min.jsxs = q;
  return reactJsxRuntime_production_min;
}
var hasRequiredJsxRuntime;
function requireJsxRuntime() {
  if (hasRequiredJsxRuntime) return jsxRuntime.exports;
  hasRequiredJsxRuntime = 1;
  {
    jsxRuntime.exports = requireReactJsxRuntime_production_min();
  }
  return jsxRuntime.exports;
}
var jsxRuntimeExports = requireJsxRuntime();
const EVT_CLIPBOARD_CHANGED = "clipboard://changed";
const EVT_SHORTCUT_FAILED = "shortcut://register-failed";
const EVT_SHORTCUT_WIN_CAPTURED = "shortcut://win-captured";
const EVT_CONFIG_CHANGED = "config://changed";
const EVT_FOLDER_CHANGED = "folder://changed";
const EVT_PANEL_VISIBILITY = "panel://visibility-changed";
const EVT_FSINDEX_PROGRESS = "fsindex://progress";
const EVT_FSINDEX_DONE = "fsindex://done";
const EVT_TRANSLATE_LINE = "translate://line";
function broadcastConfigChanged(config) {
  return emit(EVT_CONFIG_CHANGED, config);
}
function onEvent(event, handler) {
  return listen(event, (e) => handler(e.payload));
}
const createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};
const createStore = ((createState) => createState ? createStoreImpl(createState) : createStoreImpl);
const identity = (arg) => arg;
function useStore(api, selector = identity) {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    React.useCallback(() => selector(api.getState()), [api, selector]),
    React.useCallback(() => selector(api.getInitialState()), [api, selector])
  );
  React.useDebugValue(slice);
  return slice;
}
const createImpl = (createState) => {
  const api = createStore(createState);
  const useBoundStore = (selector) => useStore(api, selector);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
const create = ((createState) => createState ? createImpl(createState) : createImpl);
async function safe(promise, fallback) {
  try {
    return await promise;
  } catch (err) {
    console.error("[invoke error]", err);
    try {
      void invoke("diag_log", { msg: `[invoke error] ${String(err)}` });
    } catch {
    }
    return fallback;
  }
}
const diagLog = (msg) => safe(invoke("diag_log", { msg }), void 0);
const loadConfig = () => invoke("config_load");
const saveConfig = (config) => safe(invoke("config_save", { config }), void 0);
const exportConfigTo = (path) => invoke("config_export_to", { path });
const importConfigFrom = (path) => invoke("config_import_from", { path });
const listClipboard = () => safe(invoke("clipboard_list"), []);
const deleteClipboardEntry = (id) => safe(invoke("clipboard_delete", { id }), void 0);
const clearClipboard = () => safe(invoke("clipboard_clear"), void 0);
const toggleFavorite = (id) => safe(invoke("clipboard_toggle_favorite", { id }), void 0);
const togglePin = (id) => safe(invoke("clipboard_toggle_pin", { id }), void 0);
const fetchImageData = (id) => safe(invoke("clipboard_image_data", { id }), "");
const pasteEntry = (id) => invoke("clipboard_paste", { id });
const consumeEntry = (id) => safe(invoke("clipboard_consume", { id }), void 0);
const rollbackPaste = () => safe(invoke("clipboard_rollback"), void 0);
const moveQueueEntry = (id, direction) => safe(invoke("clipboard_move", { id, direction }), void 0);
const reorderQueueEntry = (id, targetId) => safe(invoke("clipboard_reorder", { id, targetId }), void 0);
const insertQueueText = (text, beforeId) => safe(invoke("clipboard_insert_text", { text, beforeId }), void 0);
const updateClipboardText = (id, text) => safe(invoke("clipboard_update_text", { id, text }), void 0);
const listFolders = () => safe(invoke("folder_list"), []);
const addFolder = (path) => invoke("folder_add", { path });
const removeFolder = (id) => safe(invoke("folder_remove", { id }), void 0);
const renameFolder = (id, name) => safe(invoke("folder_rename", { id, name }), void 0);
const setFolderColor = (id, color) => safe(invoke("folder_set_color", { id, color }), void 0);
const toggleFolderPin = (id) => safe(invoke("folder_toggle_pin", { id }), void 0);
const moveFolderToTop = (id) => safe(invoke("folder_move_to_top", { id }), void 0);
const reorderFolders = (ids) => safe(invoke("folder_reorder", { ids }), void 0);
const openFolder = (path) => invoke("folder_open", { path });
const openFolderInTerminalWith = (path, shell) => invoke("folder_open_in_terminal_with", { path, shell });
const copyFolderPath = (path) => invoke("folder_copy_path", { path });
const openFolderInEditor = (path, editor) => invoke("folder_open_in_editor", { path, editor });
const setVscodePath = (path) => safe(invoke("folder_set_vscode_path", { path }), void 0);
const detectEditors = () => safe(invoke("folder_detect_editors"), []);
const gitRun = (path, commands) => safe(invoke("folder_git_run", { path, commands }), []);
const folderGitBranches = (paths) => safe(invoke("folder_git_branches", { paths }), []);
const listCredentials = () => safe(invoke("cred_list"), []);
const addCredential = (input) => invoke("cred_add", { input });
const updateCredential = (id, input) => invoke("cred_update", { id, input });
const deleteCredential = (id) => safe(invoke("cred_delete", { id }), void 0);
const translateText = (text, from, to) => invoke("translate", { text, from, to });
const translateLines = (lines) => invoke("translate_lines", { lines });
const lastTranslateResult = () => safe(invoke("translate_last_result"), null);
const copyText = (text, record = false) => invoke("clipboard_copy_text", { text, record });
const closeTranslatePopup = () => invoke("translate_popup_close");
const pickFolder = async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择要添加的文件夹"
  });
  return typeof selected === "string" ? selected : null;
};
const pickVscodeExecutable = async () => {
  const selected = await open({
    directory: false,
    multiple: false,
    title: "请选择 VS Code 的 Code.exe",
    filters: [{ name: "可执行文件", extensions: ["exe"] }]
  });
  return typeof selected === "string" ? selected : null;
};
const setPanelAlwaysOnTop = (on) => invoke("panel_set_always_on_top", { on });
const panelToggle = async (label) => {
  try {
    await invoke("panel_toggle", { label });
  } catch (err) {
    console.error("[panelToggle]", err);
    void diagLog(`[panelToggle] ${label} failed: ${String(err)}`);
  }
};
const panelActive = () => safe(invoke("panel_active"), []);
const setToolbarVisible = (on) => safe(invoke("toolbar_set_visible", { on }), void 0);
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`查询超时（${Math.round(ms / 1e3)} 秒），netstat 无响应`)),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
const portSearch = (keyword) => withTimeout(
  safe(invoke("port_search", { keyword }), []),
  2e4
);
const killPort = (pid) => safe(invoke("port_kill", { pid }), void 0);
const quickfilesList = (location2, extensions) => safe(
  invoke("quickfiles_list", { location: location2, extensions }),
  { location: "", files: [] }
);
const quickfilesCreate = (location2, filename) => invoke("quickfiles_create", { location: location2, filename });
const quickfilesOpen = (path, opener) => invoke("quickfiles_open", { path, opener: opener ?? null });
const quickfilesReveal = (path) => invoke("quickfiles_reveal", { path });
const quickfilesDelete = (path) => safe(invoke("quickfiles_delete", { path }), void 0);
const recentFilesList = (sort = "time") => safe(invoke("recent_files_list", { sort }), []);
const recentFilesRemove = (path) => invoke("recent_files_remove", { path });
const recentFilesClear = () => invoke("recent_files_clear");
const fsIndexStatus = () => safe(invoke("fs_index_status"), {
  entries: 0,
  dirs: 0,
  built_at: 0,
  roots: [],
  building: false,
  stale: false
});
const fsIndexRebuild = () => invoke("fs_index_rebuild");
const fsIndexSearch = (query) => invoke("fs_index_search", { query });
const pickOpenerExecutable = async () => {
  const selected = await open({
    directory: false,
    multiple: false,
    title: "选择默认打开此类型文件的应用程序",
    filters: [{ name: "可执行文件", extensions: ["exe"] }]
  });
  return typeof selected === "string" ? selected : null;
};
const listInstalledApps = () => safe(invoke("list_installed_apps"), []);
const launchApp = (exe) => invoke("app_launch", { exe });
const pasteText = (text) => invoke("clipboard_paste_text", { text });
const listPaletteStats = () => safe(invoke("palette_stats_list"), []);
const bumpPaletteStat = (key) => safe(invoke("palette_stat_bump", { key }), void 0);
const testShortcut = (shortcut) => invoke("shortcut_test", { shortcut });
const applyShortcut = (target, shortcut) => invoke("shortcut_apply", { target, shortcut });
const shortcutRuntimeBindings = () => invoke("shortcut_runtime_bindings");
const beginShortcutCapture = () => safe(invoke("shortcut_capture_begin"), void 0);
const endShortcutCapture = () => safe(invoke("shortcut_capture_end"), void 0);
const shotBeginPicker = () => invoke("shot_begin_picker");
const shotGeometry = () => invoke("shot_geometry");
const shotImageDataRaw = () => invoke("shot_image_raw");
const shotFrameUrl = (index) => `http://screenshot.localhost/frame/${index}?v=${Date.now()}`;
const shotReady = () => invoke("shot_ready");
const shotWindowRectAt = (x, y) => invoke("shot_window_rect_at", { x, y });
const shotUiRectAt = (x, y) => invoke("shot_ui_rect_at", { x, y });
const shotHistoryList = () => invoke("shot_history_list");
const shotHistoryStep = (dir, index) => invoke("shot_history_step", { dir, index: index ?? null });
const shotHistorySaveRegion = (region) => invoke("shot_history_save_region", { region });
const shotHistoryDelete = (file) => invoke("shot_history_delete", { file });
const shotHistoryClear = () => invoke("shot_history_clear");
const shotHistoryUrl = (file) => `http://screenshot.localhost/history/${file}?v=${Date.now()}`;
const shotSaveRegion = (region) => invoke("shot_save_region", { region });
const shotDragBegin = (p) => invoke("shot_drag_begin", p);
const shotDragEnd = () => invoke("shot_drag_end");
const shotOutputPost = (action, png, params) => {
  const headers = { "x-shot-action": action };
  if (params?.x !== void 0) headers["x-shot-x"] = String(params.x);
  if (params?.y !== void 0) headers["x-shot-y"] = String(params.y);
  if (params?.path !== void 0) headers["x-shot-path"] = String(params.path);
  return png.arrayBuffer().then((buf) => {
    let timer;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error("shot_output 超时")), 15e3);
    });
    return Promise.race([
      invoke("shot_output", buf, { headers: new Headers(headers) }),
      timeout
    ]).finally(() => timer && clearTimeout(timer));
  });
};
const shotCropOutput = (action, rect, path) => {
  const headers = new Headers({
    "x-shot-action": action,
    "x-shot-crop": "1",
    "x-shot-x": String(rect.x),
    "x-shot-y": String(rect.y),
    "x-shot-w": String(rect.w),
    "x-shot-h": String(rect.h),
    ...path ? { "x-shot-path": path } : {}
  });
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error("shot_output 超时")), 15e3);
  });
  return Promise.race([
    invoke("shot_output", new ArrayBuffer(0), { headers }),
    timeout
  ]).finally(() => timer && clearTimeout(timer));
};
const shotPinPost = (bgra, w, h, x, y) => {
  const headers = new Headers({
    // 必须带动作头：shot_output 靠 x-shot-action 分发（缺失会被当成未知动作拒绝，
    // 表现为"贴图无任何反应"，此前漏带导致贴图整条链路失效）
    "x-shot-action": "pin",
    "x-shot-w": String(w),
    "x-shot-h": String(h),
    "x-shot-x": String(x),
    "x-shot-y": String(y)
  });
  const buf = bgra.byteOffset === 0 && bgra.byteLength === bgra.buffer.byteLength ? bgra.buffer : bgra.slice().buffer;
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error("shot_output 超时")), 15e3);
  });
  return Promise.race([
    invoke("shot_output", buf, { headers }),
    timeout
  ]).finally(() => timer && clearTimeout(timer));
};
const shotCancel = () => invoke("shot_cancel");
const ocrWithTimeout = (p) => {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error("OCR 超时")), 2e4);
  });
  return Promise.race([p, timeout]).finally(() => timer && clearTimeout(timer));
};
const shotOcrPost = (png) => png.arrayBuffer().then((buf) => ocrWithTimeout(invoke("shot_ocr", buf)));
const ocrModelStatus = () => invoke("ocr_model_status");
const ocrModelDownload = (model) => invoke("ocr_model_download", { model });
const pinUpdate = (id, patch) => invoke("pin_update", { id, ...patch });
const pinClose = (id) => invoke("pin_close", { id });
const pinReady = () => invoke("pin_ready");
const pinImageUrl = (id) => `http://screenshot.localhost/pin/${id}?v=${Date.now()}`;
const pinCopyOriginal = (id) => invoke("pin_copy_original", { id });
const pinCopyImageBytes = (png) => png.arrayBuffer().then((buf) => invoke("pin_copy_image_bytes", buf));
const pinSetClickThrough = (on) => invoke("pin_set_click_through", { on });
const pinBusy = (on) => invoke("pin_busy", { on });
const pinHideOne = () => invoke("pin_hide_one");
const pinResize = (id, width, height) => invoke("pin_resize", { id, width, height });
const pinKind = (id) => invoke("pin_kind", { id });
const pinFilePath = (id) => invoke("pin_file_path", { id });
const pinSaveAs = (id, dest) => invoke("pin_save_as", { id, dest });
const pinOcr = (id) => ocrWithTimeout(invoke("pin_ocr", { id }));
const pinHideAll = () => invoke("pin_hide_all");
const pinShowAll = () => invoke("pin_show_all");
let lastAppliedTheme = null;
function applyTheme(mode, force = false) {
  if (!force && lastAppliedTheme === mode) return;
  lastAppliedTheme = mode;
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
  try {
    const windowTheme = mode === "mint" || mode === "skyblue" || mode === "red" || mode === "orange" ? "light" : mode === "system" ? null : mode;
    getCurrentWindow().setTheme(windowTheme).catch((e) => console.warn("[theme] setTheme 失败:", e));
  } catch (e) {
    console.warn("[theme] setTheme 异常:", e);
  }
}
let lastPanelOpacity = null;
function applyPanelStyle(opacity, acrylicEnabled) {
  const a = Math.min(100, Math.max(0, opacity)) / 100;
  const v = String(acrylicEnabled ? a : 1);
  if (lastPanelOpacity === v) return;
  lastPanelOpacity = v;
  document.documentElement.style.setProperty("--panel-opacity", v);
}
const defaultConfig = {
  clipboard: {
    enabled: true,
    max_history: 200,
    watch_images: true,
    watch_files: true,
    close_after_paste: true,
    always_on_top: false,
    paste_mode: "normal"
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
    vscode_path: null
  },
  credentials: {
    enabled: true,
    always_on_top: false,
    show_passwords: false
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
    palette: "Alt+G"
  },
  general: {
    theme: "system",
    silent_start: true,
    language: "zh-CN",
    acrylic_enabled: true,
    acrylic_opacity: 60
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
    always_on_top: false
  },
  port: {
    enabled: true,
    always_on_top: false
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
      { ext: "yaml", label: "YAML", color: "#d96aa0", opener: null }
    ],
    always_on_top: false,
    default_group: "type",
    default_sort: "created",
    default_layout: "vertical"
  },
  toolbar: {
    enabled: true,
    tools: ["clipboard", "folder", "credentials", "translation", "port", "files", "snippets", "screenshot", "settings", "sticky"],
    orientation: "vertical",
    auto_hide: true,
    size: "small",
    position: null
  },
  snippets: {
    enabled: true,
    always_on_top: false
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
    ocr_model: "ppocrv6-tiny"
  },
  recorder: {
    enabled: true,
    fmt: "mp4",
    res: "raw",
    fps: 12,
    quality: "normal",
    max_duration_secs: 0,
    save_dir: null,
    audio: "off"
  },
  pin: {
    opacity: 100,
    border_shadow: true,
    restore_on_start: true
  },
  annotate: {
    stroke_width: 3,
    font_size: 18,
    mosaic_block: 12,
    colors: ["#e5484d", "#ff8d1a", "#ffd60a", "#36b37e", "#4c8dff", "#b06fd6", "#ffffff", "#000000"]
  },
  panel_positions: {},
  panel_sizes: {}
};
function mergeDefaults(next) {
  const merged = { ...defaultConfig, ...next };
  for (const k of Object.keys(defaultConfig)) {
    const d = defaultConfig[k];
    const v = merged[k];
    if (d && typeof d === "object" && !Array.isArray(d) && v && typeof v === "object" && !Array.isArray(v)) {
      merged[k] = { ...d, ...v };
    }
  }
  return merged;
}
const useConfigStore = create((set) => ({
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
    void saveConfig(next);
    applyTheme(next.general.theme);
    applyPanelStyle(next.general.acrylic_opacity, next.general.acrylic_enabled);
    if (broadcast) {
      await broadcastConfigChanged(next);
    }
  },
  sync: (next) => {
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
  }
}));
const getConfig = () => useConfigStore.getState().config;
var reactDomExports = requireReactDom();
function hideCurrentWindow() {
  const label = getCurrentWindow().label;
  void emit(EVT_PANEL_VISIBILITY, { label, visible: false });
  getCurrentWindow().hide().catch(console.error);
}
let nativeDialogOpen = false;
async function withNativeDialog(fn) {
  nativeDialogOpen = true;
  try {
    return await fn();
  } finally {
    nativeDialogOpen = false;
    getCurrentWindow().setFocus().catch(() => void 0);
  }
}
function usePanelCommon(stayVisible = false) {
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);
  const dragGuardRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    load();
    const cleanup = [];
    let disposed = false;
    onEvent(EVT_CONFIG_CHANGED, (cfg) => {
      if (cfg) sync(cfg);
      else void load();
    }).then((un) => disposed ? un() : cleanup.push(un));
    const onMouseDown = (e) => {
      const t = e.target;
      if (t?.closest?.("[data-tauri-drag-region]")) {
        dragGuardRef.current = true;
      }
    };
    const onMouseUp = () => {
      window.setTimeout(() => {
        dragGuardRef.current = false;
      }, 250);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    cleanup.push(() => document.removeEventListener("mousedown", onMouseDown));
    cleanup.push(() => document.removeEventListener("mouseup", onMouseUp));
    let wasFocused = false;
    const focusUn = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      const prev = wasFocused;
      wasFocused = focused;
      if (!prev || focused) return;
      if (nativeDialogOpen || stayVisible) return;
      if (dragGuardRef.current) return;
      window.setTimeout(() => {
        void getAllWindows().then((wins) => Promise.all(wins.map((w) => w.isFocused()))).then((states) => {
          if (!states.some(Boolean)) hideCurrentWindow();
        }).catch(() => hideCurrentWindow());
      }, 80);
    });
    cleanup.push(() => focusUn.then((un) => un()));
    const onMouseActivate = () => {
      if (!document.hasFocus()) {
        getCurrentWindow().setFocus().catch(() => void 0);
      }
    };
    document.addEventListener("mouseover", onMouseActivate);
    document.addEventListener("mousedown", onMouseActivate);
    cleanup.push(() => document.removeEventListener("mouseover", onMouseActivate));
    cleanup.push(() => document.removeEventListener("mousedown", onMouseActivate));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [load, sync, stayVisible]);
}
function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const minute = 6e4;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return "昨天";
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
const useClipboardStore = create((set, get) => ({
  entries: [],
  loaded: false,
  imageCache: {},
  refresh: async () => {
    const entries = await listClipboard();
    set({ entries, loaded: true });
  },
  remove: async (id) => {
    set({ entries: get().entries.filter((e) => e.id !== id) });
    await deleteClipboardEntry(id);
  },
  clearAll: async () => {
    await clearClipboard();
    await get().refresh();
  },
  toggleFavorite: async (id) => {
    const prev = get().entries;
    set({
      entries: prev.map(
        (e) => e.id === id ? { ...e, favorite: !e.favorite } : e
      )
    });
    try {
      await toggleFavorite(id);
    } catch (err) {
      console.error("toggleFavorite failed", err);
      set({ entries: prev });
    }
  },
  togglePin: async (id) => {
    const prev = get().entries;
    set({
      entries: prev.map(
        (e) => e.id === id ? { ...e, pinned: !e.pinned } : e
      )
    });
    try {
      await togglePin(id);
    } catch (err) {
      console.error("togglePin failed", err);
      set({ entries: prev });
    }
  },
  replaceText: (id, text) => {
    set({
      entries: get().entries.map(
        (e) => e.id === id && e.text !== null ? {
          ...e,
          text,
          preview: text.length > 100 ? `${text.slice(0, 100)}…` : text
        } : e
      )
    });
  },
  updateText: async (id, text) => {
    const prev = get().entries;
    set({
      entries: prev.map(
        (e) => e.id === id && e.text !== null ? {
          ...e,
          text,
          preview: text.length > 100 ? `${text.slice(0, 100)}…` : text
        } : e
      )
    });
    try {
      await updateClipboardText(id, text);
    } catch (err) {
      console.error("updateText failed", err);
      set({ entries: prev });
    }
  },
  fetchImage: async (id) => {
    const cached = get().imageCache[id];
    if (cached) return cached;
    const data2 = await fetchImageData(id);
    if (data2) {
      set({ imageCache: { ...get().imageCache, [id]: data2 } });
    }
    return data2;
  }
}));
function buildQueue(entries, mode) {
  switch (mode) {
    case "fifo":
      return [...entries].sort((a, b) => a.created_at - b.created_at);
    case "lifo":
      return [...entries].sort((a, b) => b.created_at - a.created_at);
    default:
      return entries;
  }
}
function isSequentialMode(mode) {
  return mode === "fifo" || mode === "lifo";
}
const PASTE_MODE_LABELS = {
  normal: "普通",
  fifo: "FIFO",
  lifo: "LIFO"
};
const PASTE_MODE_DESCS = {
  normal: "点击或回车粘贴所选条目",
  fifo: "按复制先后顺序逐条粘贴，任意位置按 Ctrl+V 直接带出下一条",
  lifo: "按复制先后倒序逐条粘贴，任意位置按 Ctrl+V 直接带出下一条"
};
const ToastContext = reactExports.createContext({ show: () => {
} });
function useToast() {
  return reactExports.useContext(ToastContext);
}
function ToastProvider({ children }) {
  const [items, setItems] = reactExports.useState([]);
  const idRef = reactExports.useRef(0);
  const show = reactExports.useCallback((msg, type = "info", durationMs = 2600) => {
    const id = ++idRef.current;
    setItems((xs) => [...xs.slice(-2), { id, msg, type, leaving: false }]);
    window.setTimeout(() => {
      setItems((xs) => xs.map((x) => x.id === id ? { ...x, leaving: true } : x));
    }, durationMs);
    window.setTimeout(() => {
      setItems((xs) => xs.filter((x) => x.id !== id));
    }, durationMs + 260);
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(ToastContext.Provider, { value: { show }, children: [
    children,
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "toast-stack", role: "status", "aria-live": "polite", children: items.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `toast toast-${t.type}${t.leaving ? " leaving" : ""}`, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `toast-dot toast-dot-${t.type}`, "aria-hidden": true, children: t.type === "success" ? "✓" : t.type === "error" ? "✕" : "i" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toast-msg", children: t.msg })
    ] }, t.id)) })
  ] });
}
const layers = [];
let installed = false;
function dispatch(e) {
  if (e.key !== "Escape") return;
  if (e.target?.closest?.("[data-esc-local]")) return;
  const top = layers[layers.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  top.handler();
}
function useEscLayer(active, handler) {
  const handlerRef = reactExports.useRef(handler);
  handlerRef.current = handler;
  reactExports.useEffect(() => {
    if (installed) return;
    installed = true;
    window.addEventListener("keydown", dispatch, true);
  }, []);
  reactExports.useEffect(() => {
    if (!active) return;
    const layer = { handler: () => handlerRef.current() };
    layers.push(layer);
    return () => {
      const idx = layers.indexOf(layer);
      if (idx >= 0) layers.splice(idx, 1);
    };
  }, [active]);
}
function ContextMenu({ x, y, items, onClose }) {
  const menuRef = reactExports.useRef(null);
  const [pos, setPos] = reactExports.useState({ left: x, top: y });
  const [flip, setFlip] = reactExports.useState({ x: false, y: false });
  useEscLayer(true, onClose);
  reactExports.useLayoutEffect(() => {
    const menuW = menuRef.current?.offsetWidth ?? 180;
    const menuH = menuRef.current?.offsetHeight ?? items.length * 36 + 20;
    const left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));
    setPos({ left, top });
    setFlip({
      x: left + menuW + 210 > window.innerWidth,
      y: top + menuH + 300 > window.innerHeight
    });
  }, [x, y, items]);
  const cls = [
    "context-menu",
    flip.x ? "submenu-left" : "",
    flip.y ? "submenu-top" : ""
  ].filter(Boolean).join(" ");
  const renderItem = (item) => {
    if (item.children?.length) {
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "context-menu-item has-submenu", children: [
        item.icon,
        item.label,
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "submenu-arrow", children: "▶" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "context-submenu", children: item.children.map((child) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            className: `context-menu-item ${child.danger ? "danger" : ""}`,
            onClick: () => {
              child.onClick?.();
              onClose();
            },
            children: [
              child.icon,
              child.label
            ]
          },
          child.label
        )) })
      ] });
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        className: `context-menu-item ${item.danger ? "danger" : ""}`,
        onClick: () => {
          item.onClick?.();
          onClose();
        },
        children: [
          item.icon,
          item.label
        ]
      }
    );
  };
  return reactDomExports.createPortal(
    /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "context-menu-mask",
          onClick: (e) => {
            e.stopPropagation();
            onClose();
          },
          onContextMenu: (e) => {
            e.preventDefault();
            onClose();
          }
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          ref: menuRef,
          className: cls,
          style: pos,
          onClick: (e) => e.stopPropagation(),
          children: items.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            renderItem(item),
            item.dividerAfter && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "context-menu-divider" })
          ] }, item.label))
        }
      )
    ] }),
    document.body
  );
}
function base64Decode(text) {
  try {
    const bin = atob(text.trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
function base64Encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(bin);
}
function formatTimestamp(text) {
  const t = text.trim();
  const v = Number(t);
  if (!Number.isFinite(v) || v <= 0) return null;
  const ms = t.length === 10 ? v * 1e3 : v;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function safeEncodeURIComponent(text) {
  if (!/\uD800-\uDFFF/.test(text)) return encodeURIComponent(text);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 55296 && code <= 56319) {
      const next = text.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) {
        out += text[i] + text[i + 1];
        i++;
        continue;
      }
      out += "�";
    } else if (code >= 56320 && code <= 57343) {
      out += "�";
    } else {
      out += text[i];
    }
  }
  return encodeURIComponent(out);
}
function detectActions(text) {
  if (!text || text.length === 0 || text.length > 2e5) return [];
  const t = text.trim();
  const actions = [];
  if (t.startsWith("{") && t.endsWith("}") || t.startsWith("[") && t.endsWith("]")) {
    try {
      const parsed = JSON.parse(t);
      actions.push({
        key: "json-format",
        label: "JSON 格式化",
        run: () => JSON.stringify(parsed, null, 2)
      });
      actions.push({
        key: "json-minify",
        label: "JSON 压缩",
        run: () => JSON.stringify(parsed)
      });
    } catch {
    }
  }
  if (/^\d{10}(\d{3})?$/.test(t) && formatTimestamp(t)) {
    actions.push({
      key: "ts-date",
      label: "时间戳转日期",
      run: () => formatTimestamp(t)
    });
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(t) && t.length >= 8 && t.length % 4 === 0) {
    const decoded = base64Decode(t);
    if (decoded && decoded.length > 0 && /^[\x20-\x7E\u4e00-\u9fff\r\n\t]*$/.test(decoded)) {
      actions.push({
        key: "b64-decode",
        label: "Base64 解码",
        run: () => decoded
      });
    }
  }
  actions.push({ key: "b64-encode", label: "Base64 编码", run: () => base64Encode(t) });
  if (/%[0-9A-Fa-f]{2}/.test(t)) {
    try {
      const decoded = decodeURIComponent(t);
      if (decoded !== t) {
        actions.push({ key: "url-decode", label: "URL 解码", run: () => decoded });
      }
    } catch {
    }
  }
  if (/[^\x20-\x7E]/.test(t)) {
    actions.push({
      key: "url-encode",
      label: "URL 编码",
      run: () => safeEncodeURIComponent(t)
    });
  }
  if (/[\\/]/.test(t)) {
    if (t.includes("\\")) {
      actions.push({
        key: "path-fwd",
        label: "路径转正斜杠 /",
        run: () => t.replaceAll("\\", "/")
      });
    }
    if (t.includes("/")) {
      actions.push({
        key: "path-back",
        label: "路径转反斜杠 \\",
        run: () => t.replaceAll("/", "\\")
      });
    }
  }
  return actions;
}
function base({ size = 16, ...props }) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...props
  };
}
const IconSearch = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "11", cy: "11", r: "7" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m20 20-3.5-3.5" })
] });
const IconTrash = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7" }) });
const IconStar = (p) => {
  const { filled, ...rest } = p;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(rest), fill: filled ? "currentColor" : "none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8Z" }) });
};
const IconPin = (p) => {
  const { filled, ...rest } = p;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(rest), fill: filled ? "currentColor" : "none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M9 4h6l-1 7 3 2v2H7v-2l3-2-1-7ZM12 15v6" }) });
};
const IconClipboard = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "6", y: "4", width: "12", height: "17", rx: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M9 4a2 2 0 0 1 6 0M9 10h6M9 14h6" })
] });
const IconFolder = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" }),
  "  "
] });
const IconFolderPlus = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 11v6M9 14h6" })
] });
const IconLocate = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "10", r: "2.5" })
] });
const IconSettings = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" })
] });
const IconGrid = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "3", width: "7", height: "7", rx: "1.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "14", y: "3", width: "7", height: "7", rx: "1.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "14", width: "7", height: "7", rx: "1.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "14", y: "14", width: "7", height: "7", rx: "1.5" })
] });
const IconList = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "4.5", cy: "6.5", r: "1.2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 6.5h12" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "4.5", cy: "12", r: "1.2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 12h12" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "4.5", cy: "17.5", r: "1.2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 17.5h12" })
] });
const IconListColumns = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3.5", y: "4", width: "17", height: "16", rx: "2.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 4v16" })
] });
const IconTree = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 3v18" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 7h5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 13h9" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 19h4" })
] });
const IconTerminal = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m4 17 6-5-6-5M12 19h8" }) });
const IconCode = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 9l-4 3 4 3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M16 9l4 3-4 3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M13 6l-2 12" })
] });
const IconBranch = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "6", cy: "5", r: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "6", cy: "19", r: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "18", cy: "7", r: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 7v10" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18 9c0 3-4 4-6 5" })
] });
const IconWand = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M15 4V2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M15 10V8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 7h2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18 7h2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 19l9-9" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 20h2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18 15l2 2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M15 18l2 2" })
] });
const IconCopy = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "9", y: "9", width: "12", height: "12", rx: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
] });
const IconExternal = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" }) });
const IconText = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 7V5h16v2M12 5v14M9 19h6" }) });
const IconImage = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "9", cy: "9", r: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m21 15-4-4-9 10" })
] });
const IconFiles = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 2v6h6" })
] });
const IconLink = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" })
] });
const IconRichText = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 7V5h16v2M12 5v14M9 19h6" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 16h5M4 12h3", strokeWidth: "2.6" })
] });
const IconArrowUp = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 19V5M5 12l7-7 7 7" }) });
const IconArrowDown = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 5v14M5 12l7 7 7-7" }) });
const IconChevronLeft = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m15 18-6-6 6-6" }) });
const IconChevronRight = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m9 18 6-6-6-6" }) });
const IconInfo = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "9" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 16v-5M12 8h0" })
] });
const IconPalette = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.5.6.2 2.7-2.5 2.7Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "7.5", cy: "11.5", r: "1" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "10.5", cy: "7.5", r: "1" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "15", cy: "8", r: "1" })
] });
const IconKey = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "7.5", cy: "15.5", r: "4" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m10.5 12.5 8-8M16 3l3 3-2 2-3-3M18 5l2 2" })
] });
const IconLock = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "4.5", y: "10.5", width: "15", height: "10", rx: "2.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 10.5V7.5a4 4 0 0 1 8 0v3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "15.5", r: "1.6" })
] });
const IconPort = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "8.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "2.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 12l5-5" })
] });
const IconSnippet = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M13 2 4.8 13.2h5.7L9.2 22l8.2-11.2h-5.8L13 2Z" }) });
const IconScreenshot = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "13", r: "4" })
] });
const IconRecord = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "9" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "4", fill: "currentColor", stroke: "none" })
] });
const IconEye = (p) => {
  const { filled, ...rest } = p;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(rest), fill: filled ? "currentColor" : "none", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "3" })
  ] });
};
const IconEyeOff = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.1-.9" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m3 3 18 18M9.5 9.5a3 3 0 0 0 4.2 4.2" })
] });
const IconEdit = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" }) });
const IconPlus = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 5v14M5 12h14" }) });
const IconClose = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M18 6 6 18M6 6l12 12" }) });
const IconCheck = (p) => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { ...base(p), children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 12.5 9.5 18 20 6.5" }) });
const IconTranslate = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m5 8 6 6" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m4 14 6-6 2-3" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M2 5h12" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7 2h1" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m22 22-5-10-5 10" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 18h6" })
] });
const IconGroupNone = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 3.5h8.5L18.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 3.5v4h4.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8.5 13h7M8.5 16.5h5" })
] });
const IconGroupType = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.1 7.1a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0L3.6 13.4A2 2 0 0 1 3 12Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 8h0" })
] });
const IconGroupDate = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "4.5", width: "18", height: "16.5", rx: "2" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 9h18M8 2.5v4M16 2.5v4" })
] });
const IconSortTime = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "8.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 7.5V12l3 2" })
] });
const IconSortName = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "text",
    {
      x: "10",
      y: "12",
      fontSize: "16",
      fontWeight: "700",
      textAnchor: "middle",
      dominantBaseline: "central",
      fill: "currentColor",
      stroke: "none",
      children: "A"
    }
  ),
  /* @__PURE__ */ jsxRuntimeExports.jsx(
    "text",
    {
      x: "17.5",
      y: "20.5",
      fontSize: "11.5",
      fontWeight: "600",
      textAnchor: "middle",
      dominantBaseline: "central",
      fill: "currentColor",
      stroke: "none",
      children: "a"
    }
  )
] });
const IconSticky = (p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { ...base(p), children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12l-6 6H6a2 2 0 0 1-2-2V4Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 14v6l6-6" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 8h8M8 12h5" })
] });
function ImageThumb({ entryId }) {
  const fetchImage = useClipboardStore((s) => s.fetchImage);
  const cached = useClipboardStore((s) => s.imageCache[entryId]);
  const [src, setSrc] = reactExports.useState(cached ?? "");
  reactExports.useEffect(() => {
    setSrc(useClipboardStore.getState().imageCache[entryId] ?? "");
  }, [entryId]);
  reactExports.useEffect(() => {
    if (src) return;
    let cancelled = false;
    let attempts = 0;
    const tryLoad = () => {
      if (cancelled) return;
      fetchImage(entryId).then((s) => {
        if (cancelled) return;
        if (s) {
          setSrc(s);
        } else if (attempts < 6) {
          attempts += 1;
          setTimeout(tryLoad, 400);
        }
      });
    };
    tryLoad();
    return () => {
      cancelled = true;
    };
  }, [entryId, src, fetchImage]);
  if (!src) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "clip-thumb clip-thumb-placeholder", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconImage, { size: 18 }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("img", { className: "clip-thumb", src, alt: "图片预览", draggable: false });
}
function ClipboardItem({
  entry,
  queueOrder,
  isCurrent,
  selected,
  onPaste,
  onMove,
  canMoveUp,
  canMoveDown,
  onInsert,
  dragging,
  dragOver,
  onPointerDown,
  registerRef
}) {
  const { remove, toggleFavorite: toggleFavorite2, togglePin: togglePin2, replaceText, updateText } = useClipboardStore();
  const toast = useToast();
  const [menu, setMenu] = reactExports.useState(null);
  const sequential = !!onMove;
  const actions = reactExports.useMemo(() => detectActions(entry.text), [entry.text]);
  const [editing, setEditing] = reactExports.useState(false);
  const [draft, setDraft] = reactExports.useState("");
  const [confirmDel, setConfirmDel] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (!confirmDel) return;
    const id = window.setTimeout(() => setConfirmDel(false), 2500);
    return () => window.clearTimeout(id);
  }, [confirmDel]);
  const editable = entry.kind === "text" || entry.kind === "richtext" || entry.kind === "link";
  const saveEdit = async () => {
    const t2 = draft.trim();
    if (!t2) {
      toast.show("内容不能为空", "error");
      return;
    }
    setEditing(false);
    await updateText(entry.id, t2);
  };
  const runTransform = async (action) => {
    setMenu(null);
    try {
      const result = action.run(entry.text ?? "");
      await copyText(result);
      replaceText(entry.id, result);
    } catch (err) {
      console.error("智能转换失败", err);
      toast.show(`转换失败：${String(err)}`, "error");
    }
  };
  const kindIcon = entry.kind === "image" ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconImage, { size: 15, className: "clip-ic-image" }) : entry.kind === "files" ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconFiles, { size: 15, className: "clip-ic-files" }) : entry.kind === "link" ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconLink, { size: 15, className: "clip-ic-link" }) : entry.kind === "richtext" ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconRichText, { size: 15, className: "clip-ic-richtext" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconText, { size: 15, className: "clip-ic-text" });
  const typeLabel = {
    image: { text: "图片", cls: "image" },
    richtext: { text: "富文本", cls: "richtext" },
    link: { text: "链接", cls: "link" },
    files: { text: "文件", cls: "files" },
    text: { text: "文本", cls: "text" }
  };
  const t = typeLabel[entry.kind] ?? typeLabel.text;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: [
        "clip-item",
        selected ? "selected" : "",
        isCurrent ? "current" : "",
        dragging ? "dragging" : "",
        dragOver ? "drag-over" : ""
      ].filter(Boolean).join(" "),
      onClick: () => {
        if (!editing) onPaste();
      },
      title: editing ? void 0 : entry.text ?? entry.preview,
      ref: registerRef,
      onPointerDown: (e) => {
        if (!editing) onPointerDown(e);
      },
      children: [
        queueOrder ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: `clip-order${queueOrder === 1 ? " next" : ""}`,
            title: queueOrder === 1 ? "下一条粘贴（Ctrl+V 带出）" : `队列第 ${queueOrder} 条`,
            children: queueOrder
          }
        ) : null,
        entry.kind === "image" ? /* @__PURE__ */ jsxRuntimeExports.jsx(ImageThumb, { entryId: entry.id }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "clip-icon", children: kindIcon }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "clip-main", children: editing ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "clip-edit-box", "data-esc-local": true, onClick: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              className: "clip-edit-input",
              value: draft,
              autoFocus: true,
              placeholder: "编辑文本内容…",
              onChange: (e) => setDraft(e.target.value),
              onKeyDown: (e) => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === "Escape") {
                  setEditing(false);
                }
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "clip-edit-actions", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "btn btn-primary btn-sm",
                disabled: !draft.trim(),
                onClick: () => void saveEdit(),
                children: "保存"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: () => setEditing(false), children: "取消" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "edit-hint", children: "Enter 保存 · Esc 取消" })
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "clip-preview", children: entry.preview }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "clip-meta", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `clip-type clip-type-${t.cls}`, title: "内容类型", children: t.text }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: relativeTime(entry.created_at) }),
            entry.source_app && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "clip-source", children: entry.source_app }),
            entry.favorite && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "badge clip-fav-badge", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconStar, { size: 10, filled: true }) })
          ] })
        ] }) }),
        !editing && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "clip-actions", onClick: (e) => e.stopPropagation(), children: [
          sequential ? (
            /* 顺序模式：只保留 插入 / 上移 / 下移 / 编辑 / 复制 / 删除，
               普通模式才展示的智能转换、收藏、置顶放到普通模式按钮区 */
            /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              onInsert && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "icon-btn",
                  title: "新增一条粘贴数据（手动输入文本插入队列，成为下一条）",
                  onClick: onInsert,
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPlus, { size: 14 })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "icon-btn",
                  title: canMoveUp ? "队列中上移一位" : "已是队列第一条",
                  disabled: !canMoveUp,
                  onClick: () => onMove?.("up"),
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconArrowUp, { size: 14 })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "icon-btn",
                  title: canMoveDown ? "队列中下移一位" : "已是队列最后一条",
                  disabled: !canMoveDown,
                  onClick: () => onMove?.("down"),
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconArrowDown, { size: 14 })
                }
              )
            ] })
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            actions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "icon-btn",
                title: "智能转换",
                onClick: (e) => setMenu({ x: e.clientX, y: e.clientY }),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconWand, { size: 14 })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "icon-btn", title: "收藏", onClick: () => toggleFavorite2(entry.id), children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconStar, { size: 14, filled: entry.favorite }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: `icon-btn ${entry.pinned ? "active" : ""}`,
                title: entry.pinned ? "取消置顶" : "置顶",
                onClick: () => togglePin2(entry.id),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 14, filled: entry.pinned })
              }
            )
          ] }),
          editable && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "icon-btn",
              title: "编辑内容",
              onClick: () => {
                setDraft(entry.text ?? "");
                setEditing(true);
              },
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconEdit, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "icon-btn", title: "粘贴", onClick: onPaste, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCopy, { size: 14 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: `icon-btn icon-btn-danger${confirmDel ? " confirming" : ""}`,
              title: confirmDel ? "再次点击确认删除" : "删除",
              onClick: () => {
                if (confirmDel) remove(entry.id);
                else setConfirmDel(true);
              },
              children: confirmDel ? "确认?" : /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { size: 14 })
            }
          )
        ] }),
        menu && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ContextMenu,
          {
            x: menu.x,
            y: menu.y,
            onClose: () => setMenu(null),
            items: actions.map((a) => ({
              label: a.label,
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconWand, { size: 13 }),
              onClick: () => void runTransform(a)
            }))
          }
        )
      ]
    }
  );
}
function Modal({
  open: open2,
  onClose,
  title,
  children,
  actions,
  closeOnBackdrop = true,
  danger = false,
  wide = false
}) {
  useEscLayer(open2, onClose);
  const dialogRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const d = dialogRef.current;
    if (!d || !open2) return;
    if (!d.contains(document.activeElement)) d.focus();
  }, [open2]);
  const onKeyDown = (e) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const activeEl = document.activeElement;
    if (e.shiftKey && (activeEl === first || activeEl === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && activeEl === last) {
      e.preventDefault();
      first.focus();
    }
  };
  if (!open2) return null;
  return reactDomExports.createPortal(
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "modal-backdrop",
        onMouseDown: closeOnBackdrop ? onClose : void 0,
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            ref: dialogRef,
            className: `modal${wide ? " modal-wide" : ""}`,
            role: "dialog",
            "aria-modal": "true",
            tabIndex: -1,
            onKeyDown,
            onMouseDown: (e) => e.stopPropagation(),
            children: [
              title != null && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `modal-title${danger ? " danger" : ""}`, children: title }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "modal-body", children }),
              actions && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "modal-actions", children: actions })
            ]
          }
        )
      }
    ),
    document.body
  );
}
function Spinner({ size = "md" }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `spinner spinner-${size}`, role: "status", "aria-label": "加载中" });
}
function ConfirmDialog({
  open: open2,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false
}) {
  const [busy, setBusy] = reactExports.useState(false);
  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Modal,
    {
      open: open2,
      onClose: () => {
        if (!busy) onClose();
      },
      title,
      danger,
      actions: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "btn", onClick: onClose, disabled: busy, children: cancelLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            className: `btn ${danger ? "btn-danger" : "btn-primary"}`,
            onClick: () => void handleConfirm(),
            disabled: busy,
            children: [
              busy && /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "sm" }),
              confirmLabel
            ]
          }
        )
      ] }),
      children: message
    }
  );
}
function EmptyState({ icon, title, description, action }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "empty-state", children: [
    icon != null && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "empty-icon", children: icon }),
    title && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "empty-title", children: title }),
    description && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "empty-desc", children: description }),
    action
  ] });
}
function ClipboardPanel() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ToastProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ClipboardPanelInner, {}) });
}
function ClipboardPanelInner() {
  const { entries, loaded, refresh, clearAll } = useClipboardStore();
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const toast = useToast();
  useEscLayer(true, hideCurrentWindow);
  const [query, setQuery] = reactExports.useState("");
  const [selectedIdx, setSelectedIdx] = reactExports.useState(0);
  const [favOnly, setFavOnly] = reactExports.useState(false);
  const [confirmClear, setConfirmClear] = reactExports.useState(false);
  const [insertTargetId, setInsertTargetId] = reactExports.useState(null);
  const [insertText, setInsertText] = reactExports.useState("");
  const [dragState, setDragState] = reactExports.useState(null);
  const itemRefs = reactExports.useRef(/* @__PURE__ */ new Map());
  const pressRef = reactExports.useRef(null);
  const dragActiveRef = reactExports.useRef(false);
  const [visualOrder, setVisualOrder] = reactExports.useState(null);
  const visualOrderRef = reactExports.useRef(null);
  const queueRef = reactExports.useRef([]);
  const overIdRef = reactExports.useRef(null);
  const [dragGhost, setDragGhost] = reactExports.useState(null);
  const ghostRef = reactExports.useRef(null);
  const suppressClickRef = reactExports.useRef(false);
  const inputRef = reactExports.useRef(null);
  const mode = config.clipboard.paste_mode;
  const sequential = isSequentialMode(mode);
  usePanelCommon(config.clipboard.always_on_top || sequential);
  const alwaysOnTop = config.clipboard.always_on_top;
  reactExports.useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop || sequential).catch(console.error);
  }, [alwaysOnTop, sequential]);
  reactExports.useEffect(() => {
    refresh();
    const cleanup = [];
    let disposed = false;
    onEvent(EVT_CLIPBOARD_CHANGED, () => refresh()).then(
      (un) => disposed ? un() : cleanup.push(un)
    );
    let lastBlurAt = 0;
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        lastBlurAt = Date.now();
        return;
      }
      if (Date.now() - lastBlurAt < 300) return;
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }).then((un) => disposed ? un() : cleanup.push(un));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [refresh]);
  const filtered = reactExports.useMemo(() => {
    let list = entries;
    if (favOnly) list = list.filter((e) => e.favorite);
    if (isSequentialMode(mode)) list = list.filter((e) => !e.consumed);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) => e.preview.toLowerCase().includes(q) || (e.text ?? "").toLowerCase().includes(q) || (e.files ?? []).join(" ").toLowerCase().includes(q)
    );
  }, [entries, query, favOnly, mode]);
  const pinnedList = reactExports.useMemo(() => filtered.filter((e) => e.pinned), [filtered]);
  const restList = reactExports.useMemo(() => filtered.filter((e) => !e.pinned), [filtered]);
  const flat = reactExports.useMemo(() => [...pinnedList, ...restList], [pinnedList, restList]);
  const queue = reactExports.useMemo(() => buildQueue(filtered, mode), [filtered, mode]);
  queueRef.current = queue;
  const displayList = reactExports.useMemo(() => {
    if (!sequential) return flat;
    if (visualOrder) {
      const byId = new Map(queue.map((e) => [e.id, e]));
      const ordered = visualOrder.map((id) => byId.get(id)).filter(Boolean);
      const rest = queue.filter((e) => !visualOrder.includes(e.id));
      return [...ordered, ...rest];
    }
    return queue;
  }, [sequential, flat, queue, visualOrder]);
  const doPaste = reactExports.useCallback(
    async (entry) => {
      try {
        await pasteEntry(entry.id);
      } catch (err) {
        console.error("粘贴失败：", err);
        toast.show(`粘贴失败：${String(err)}`, "error");
      }
      if (sequential) void consumeEntry(entry.id);
      if (sequential || config.clipboard.close_after_paste) {
        hideCurrentWindow();
      }
    },
    [sequential, config.clipboard.close_after_paste]
  );
  const rollback = async () => {
    await rollbackPaste();
  };
  reactExports.useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const inSearch = t === inputRef.current;
      const inEditable = !!t?.closest?.("input, textarea");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (inEditable && !inSearch) return;
        e.preventDefault();
        if (flat.length === 0) return;
        setSelectedIdx((i) => {
          const next = e.key === "ArrowDown" ? Math.min(i + 1, flat.length - 1) : Math.max(i - 1, 0);
          return next;
        });
        return;
      }
      if (e.key === "Enter") {
        if (inEditable && !inSearch) return;
        e.preventDefault();
        const target = sequential ? queue[0] : flat[selectedIdx];
        if (target) void doPaste(target);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, queue, sequential, selectedIdx, doPaste]);
  const handleClear = () => setConfirmClear(true);
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      clipboard: { ...config.clipboard, always_on_top: !alwaysOnTop }
    });
  };
  const setPasteMode = (m) => {
    if (m === mode) return;
    void updateConfig({
      ...config,
      clipboard: { ...config.clipboard, paste_mode: m }
    });
  };
  const beginPress = (e, id) => {
    if (!sequential) return;
    if (e.target.closest(".clip-actions")) return;
    pressRef.current = { id, x: e.clientX, y: e.clientY };
  };
  const applyVisualOrder = (dragId, overId) => {
    const prevOrder = visualOrderRef.current ?? queueRef.current.map((e) => e.id);
    const cur = prevOrder.indexOf(dragId);
    if (cur < 0) return;
    const next = [...prevOrder];
    next.splice(cur, 1);
    const t = overId === "__end__" ? next.length : next.indexOf(overId);
    if (t < 0) return;
    next.splice(t, 0, dragId);
    if (next.join(",") === prevOrder.join(",")) return;
    const prevPos = /* @__PURE__ */ new Map();
    for (const [id, el] of itemRefs.current) {
      prevPos.set(id, { x: el.offsetLeft, y: el.offsetTop });
    }
    visualOrderRef.current = next;
    reactDomExports.flushSync(() => setVisualOrder(next));
    const moved = [];
    for (const [id, el] of itemRefs.current) {
      const prev = prevPos.get(id);
      if (!prev) continue;
      const dx = prev.x - el.offsetLeft;
      const dy = prev.y - el.offsetTop;
      if (dx !== 0 || dy !== 0) {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        moved.push(el);
      }
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const el of moved) {
          el.style.transition = "";
          el.style.transform = "";
        }
      });
    });
  };
  const finishDrag = () => {
    if (!dragState) return;
    pressRef.current = null;
    dragActiveRef.current = false;
    overIdRef.current = null;
    setDragGhost(null);
    const { id, overId } = dragState;
    const el = itemRefs.current.get(id);
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
      el.style.zIndex = "";
    }
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 100);
    const needReorder = !!overId && overId !== id;
    if (needReorder) {
      void reorderQueueEntry(id, overId).then(() => refresh()).then(() => {
        visualOrderRef.current = null;
        setVisualOrder(null);
        setDragState(null);
      });
    } else {
      visualOrderRef.current = null;
      setVisualOrder(null);
      setDragState(null);
    }
  };
  reactExports.useEffect(() => {
    if (!dragState) return;
    const finish = () => finishDrag();
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragState]);
  reactExports.useEffect(() => {
    if (dragGhost && ghostRef.current) {
      ghostRef.current.style.left = `${dragGhost.x}px`;
      ghostRef.current.style.top = `${dragGhost.y}px`;
    }
  }, [dragGhost]);
  const insertBar = sequential && insertTargetId ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "clip-insert-bar", "data-esc-local": true, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        value: insertText,
        placeholder: `插入到「${displayList.find((e) => e.id === insertTargetId)?.preview.slice(0, 12) ?? ""}」上方…`,
        onChange: (e) => setInsertText(e.target.value),
        onKeyDown: (e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            const t = insertText.trim();
            if (!t) return;
            void insertQueueText(t, insertTargetId);
            setInsertText("");
            setInsertTargetId(null);
          } else if (e.key === "Escape") {
            setInsertText("");
            setInsertTargetId(null);
          }
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "insert-hint", children: "回车插入 · Esc 取消" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: "icon-btn",
        title: "取消",
        onClick: () => {
          setInsertText("");
          setInsertTargetId(null);
        },
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 13 })
      }
    )
  ] }) : null;
  const renderItem = (entry, flatIndex) => {
    const qOrder = sequential ? displayList.findIndex((e) => e.id === entry.id) + 1 : 0;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      ClipboardItem,
      {
        entry,
        queueOrder: qOrder || void 0,
        isCurrent: sequential && displayList[0]?.id === entry.id,
        selected: !sequential && flatIndex === selectedIdx,
        onPaste: () => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          void doPaste(entry);
        },
        onMove: sequential ? (dir) => void moveQueueEntry(entry.id, dir) : void 0,
        canMoveUp: qOrder > 1,
        canMoveDown: qOrder > 0 && qOrder < queue.length,
        onInsert: sequential ? () => setInsertTargetId(entry.id) : void 0,
        dragging: dragState?.id === entry.id,
        dragOver: dragState?.overId === entry.id,
        onPointerDown: (e) => beginPress(e, entry.id),
        registerRef: (el) => {
          if (el) itemRefs.current.set(entry.id, el);
          else itemRefs.current.delete(entry.id);
        }
      },
      entry.id
    );
  };
  const ghostOrder = sequential && dragGhost ? displayList.findIndex((e) => e.id === dragGhost.entry.id) + 1 : 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-shell", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-header", "data-tauri-drag-region": true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-search", "data-tauri-drag-region": true, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 15 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: inputRef,
              value: query,
              placeholder: "搜索剪贴板历史…",
              onChange: (e) => {
                setQuery(e.target.value);
                setSelectedIdx(0);
              },
              autoFocus: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: `icon-btn ${favOnly ? "active" : ""}`,
            title: favOnly ? "显示全部记录" : "只看收藏",
            onClick: () => {
              setFavOnly((v) => !v);
              setSelectedIdx(0);
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconStar, { size: 15, filled: favOnly })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: `icon-btn ${alwaysOnTop || sequential ? "active" : ""}${sequential ? " seq-locked" : ""}`,
            title: sequential ? "顺序粘贴模式下强制置顶（关闭面板后自动恢复普通粘贴）" : alwaysOnTop ? "取消面板置顶" : "面板置顶显示",
            onClick: sequential ? void 0 : toggleAlwaysOnTop,
            disabled: sequential,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 15, filled: alwaysOnTop || sequential })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "icon-btn icon-btn-danger",
            title: "清空全部",
            onClick: handleClear,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { size: 15 })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "icon-btn",
            title: "关闭（Esc）",
            onClick: () => hideCurrentWindow(),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 15 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: `panel-body${dragState?.overId === "__end__" ? " drop-end" : ""}`,
          onPointerMove: (e) => {
            const press = pressRef.current;
            if (!press) return;
            if (!dragActiveRef.current && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) {
              return;
            }
            if (!dragActiveRef.current) {
              dragActiveRef.current = true;
              const order = queueRef.current.map((entry2) => entry2.id);
              visualOrderRef.current = order;
              setVisualOrder(order);
              setDragState({ id: press.id, overId: null });
              const entry = queueRef.current.find((e2) => e2.id === press.id);
              if (entry) {
                setDragGhost({ entry, x: e.clientX + 10, y: e.clientY + 10 });
              }
            }
            const g = ghostRef.current;
            if (g) {
              g.style.left = `${e.clientX + 10}px`;
              g.style.top = `${e.clientY + 10}px`;
            }
            let overId = null;
            let lastBottom = Number.NEGATIVE_INFINITY;
            for (const [id, el] of itemRefs.current) {
              if (id === press.id) continue;
              const r = el.getBoundingClientRect();
              if (r.bottom > lastBottom) lastBottom = r.bottom;
              if (e.clientY >= r.top && e.clientY <= r.bottom) overId = id;
            }
            if (!overId && e.clientY > lastBottom) overId = "__end__";
            if (overId !== overIdRef.current) {
              overIdRef.current = overId;
              setDragState((s) => s ? { ...s, overId } : s);
              if (overId) applyVisualOrder(press.id, overId);
            }
          },
          children: [
            !loaded && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "lg" }), title: "加载中…" }),
            loaded && displayList.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
              EmptyState,
              {
                icon: "📋",
                title: query ? "没有匹配的记录" : favOnly ? "暂无收藏记录" : "暂无剪贴板历史",
                description: query ? void 0 : favOnly ? "点击条目的星标可收藏" : "复制内容后自动记录"
              }
            ),
            sequential ? (
              /* 顺序模式：整体按队列顺序展示，下一条在最前，切换模式即调整顺序。
                 输入条渲染在目标条目的正上方，插入后成为它的前一条 */
              displayList.map((e) => /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Fragment, { children: [
                e.id === insertTargetId && insertBar,
                renderItem(e, 0)
              ] }, e.id))
            ) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              pinnedList.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "section-label", children: "置顶" }),
                pinnedList.map((e) => renderItem(e, flat.indexOf(e)))
              ] }),
              pinnedList.length > 0 && restList.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "section-label", children: "历史记录" }),
              restList.map((e) => renderItem(e, flat.indexOf(e)))
            ] }),
            dragGhost && /* 拖拽虚影：fixed 跟随鼠标的条目卡片快照，完整复刻条目结构
            （序号/类型图标/预览/时间来源/收藏置顶徽标），原条目保留占位隐藏 */
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: ghostRef, className: "clip-drag-ghost", children: [
              sequential && ghostOrder > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `clip-order${ghostOrder === 1 ? " next" : ""}`,
                  children: ghostOrder
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "clip-icon", children: dragGhost.entry.kind === "image" ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconImage, { size: 18 }) : dragGhost.entry.kind === "files" ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconFiles, { size: 18 }) : dragGhost.entry.kind === "link" ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconLink, { size: 18 }) : dragGhost.entry.kind === "richtext" ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconRichText, { size: 18 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconText, { size: 18 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "clip-main", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "clip-preview", children: dragGhost.entry.preview || dragGhost.entry.text }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "clip-meta", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: relativeTime(dragGhost.entry.created_at) }),
                  dragGhost.entry.source_app && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "clip-source", children: dragGhost.entry.source_app })
                ] })
              ] }),
              dragGhost.entry.favorite && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ghost-flag", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconStar, { size: 12, filled: true }) }),
              dragGhost.entry.pinned && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ghost-flag", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 12, filled: true }) })
            ] })
          ]
        }
      ),
      sequential && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "seq-notice", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "seq-notice-title", children: "顺序粘贴" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "Ctrl+V" }),
          " 按队列顺序粘贴，面板已强制置顶； 关闭面板后自动恢复普通粘贴"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-footer", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "segmented", children: Object.keys(PASTE_MODE_LABELS).map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: mode === m ? "active" : "",
            title: `粘贴模式：${PASTE_MODE_LABELS[m]} — ${PASTE_MODE_DESCS[m]}`,
            onClick: () => setPasteMode(m),
            children: PASTE_MODE_LABELS[m]
          },
          m
        )) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          sequential ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "span",
              {
                className: "next-hint",
                title: queue[0]?.text ?? queue[0]?.preview ?? "",
                children: [
                  "下一条：",
                  (queue[0]?.preview ?? "无").slice(0, 32)
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", style: { marginLeft: 8 }, children: "Ctrl+V" }),
            " 带出",
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "rollback-btn",
                onClick: () => void rollback(),
                title: "撤销最近一次粘贴消耗的条目，可连续点击多次逐条恢复",
                children: "↩ 撤销"
              }
            )
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            entries.length,
            " 条记录"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", style: { marginLeft: 4 }, children: "Esc" }),
          " 关闭"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmDialog,
      {
        open: confirmClear,
        onClose: () => setConfirmClear(false),
        onConfirm: async () => {
          await clearAll();
        },
        title: "清空全部剪贴板历史？",
        message: "收藏项将保留，其余记录将被删除。",
        danger: true,
        confirmLabel: "清空"
      }
    )
  ] });
}
const useFolderStore = create((set, get) => ({
  folders: [],
  loaded: false,
  refresh: async () => {
    const folders = await listFolders();
    set({ folders, loaded: true });
  },
  add: async (path) => {
    try {
      await addFolder(path);
      await get().refresh();
      return null;
    } catch (err) {
      return String(err);
    }
  },
  remove: async (id) => {
    set({ folders: get().folders.filter((f) => f.id !== id) });
    await removeFolder(id);
  },
  togglePin: async (id) => {
    await toggleFolderPin(id);
    await get().refresh();
  },
  moveToTop: async (id) => {
    await moveFolderToTop(id);
    await get().refresh();
  },
  reorder: async (ids) => {
    await reorderFolders(ids);
    await get().refresh();
  },
  setColor: async (id, color) => {
    set({
      folders: get().folders.map((f) => f.id === id ? { ...f, color } : f)
    });
    await setFolderColor(id, color);
  }
}));
function sortFolders(folders) {
  const pinned = folders.filter((f) => f.pinned).sort((a, b) => a.order - b.order || a.created_at - b.created_at);
  const frequent = folders.filter((f) => !f.pinned).sort(
    (a, b) => b.visit_count - a.visit_count || b.last_visit - a.last_visit || a.created_at - b.created_at
  );
  return { pinned, frequent };
}
function FolderCard({
  folder,
  layout,
  showCount,
  terminalShell,
  branch,
  draggable,
  dragging,
  dragOver,
  onOpen,
  onOpenTerminal,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: [
        "folder-card",
        dragging ? "dragging" : "",
        dragOver ? "drag-over" : ""
      ].filter(Boolean).join(" "),
      title: folder.path,
      onClick: onOpen,
      onContextMenu,
      draggable,
      onDragStart: (e) => {
        e.dataTransfer.setData("text/folder-id", folder.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      },
      onDragOver,
      onDrop: (e) => {
        e.preventDefault();
        onDrop();
      },
      onDragEnd,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "folder-icon",
            style: { "--folder-color": folder.color ?? "var(--accent)" },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(IconFolder, { size: layout === "grid" ? 18 : 15 }),
              folder.color && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "folder-color-dot", style: { background: folder.color } })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "folder-name", children: folder.name }),
        layout === "grid" ? (
          /* 网格：分支徽章与次数徽章并排一行，避免绝对定位压住名称 */
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "folder-meta", children: [
            branch && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "badge git-branch", title: `Git 分支：${branch}`, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(IconBranch, { size: 10 }),
              branch
            ] }),
            showCount && folder.visit_count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "badge folder-count", children: [
              folder.visit_count,
              " 次"
            ] })
          ] })
        ) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          branch && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "badge git-branch", title: `Git 分支：${branch}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(IconBranch, { size: 10 }),
            branch
          ] }),
          layout === "list" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "folder-path", children: folder.path }),
          showCount && folder.visit_count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "badge folder-count", children: [
            folder.visit_count,
            " 次"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: `icon-btn term-btn ${layout === "grid" ? "term-btn-float" : ""}`,
            title: `在${terminalShell === "wt" ? "Windows Terminal" : terminalShell === "cmd" ? "命令提示符" : "PowerShell"}中打开`,
            onClick: (e) => {
              e.stopPropagation();
              onOpenTerminal();
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTerminal, { size: layout === "grid" ? 13 : 14 })
          }
        )
      ]
    }
  );
}
const FOLDER_COLORS = [
  { value: "#6366f1", name: "靛蓝" },
  { value: "#f59e0b", name: "琥珀" },
  { value: "#10b981", name: "翡翠" },
  { value: "#ef4444", name: "红色" },
  { value: "#06b6d4", name: "青色" },
  { value: "#ec4899", name: "粉红" }
];
FOLDER_COLORS.map((c) => c.value);
const GIT_COMMANDS = [
  {
    label: "一键提交并推送",
    cmd: 'git add .\ngit commit -m "update"\ngit push'
  },
  { label: "git status", cmd: "git status" },
  { label: "git add .", cmd: "git add ." },
  { label: 'git commit -m "update"', cmd: 'git commit -m "update"' },
  { label: "git push", cmd: "git push" },
  { label: "git pull", cmd: "git pull" },
  { label: "git log --oneline", cmd: "git log --oneline" },
  { label: "git stash", cmd: "git stash" }
];
function normPath(p) {
  return p.replaceAll("/", "\\").replace(/\\+$/, "");
}
function parentPathOf(p) {
  const n = normPath(p);
  const idx = n.lastIndexOf("\\");
  if (idx <= 0) return null;
  return n.slice(0, idx);
}
function relPathOf(p, parent) {
  const n = normPath(p);
  const pn = normPath(parent);
  return n.startsWith(pn + "\\") ? n.slice(pn.length + 1) : n;
}
function buildTree(items) {
  const groups = /* @__PURE__ */ new Map();
  for (const f of items) {
    const parent = parentPathOf(f.path) ?? f.path;
    const list = groups.get(parent);
    if (list) list.push(f);
    else groups.set(parent, [f]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN")).map(([parent, list]) => ({
    parent,
    items: list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
  }));
}
function ZonePager({
  page,
  pages,
  onPage
}) {
  if (pages <= 1) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "zone-pager", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: "pager-btn",
        title: "上一页",
        disabled: page <= 1,
        onClick: () => onPage(page - 1),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconChevronLeft, { size: 12 })
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "zone-pager-info", children: [
      page,
      "/",
      pages
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        className: "pager-btn",
        title: "下一页",
        disabled: page >= pages,
        onClick: () => onPage(page + 1),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconChevronRight, { size: 12 })
      }
    )
  ] });
}
function FolderPanel() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ToastProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(FolderPanelInner, {}) });
}
function FolderPanelInner() {
  const { folders, loaded, refresh, add, remove, togglePin: togglePin2, moveToTop, reorder, setColor } = useFolderStore();
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const toast = useToast();
  usePanelCommon(config.folder.always_on_top);
  useEscLayer(true, hideCurrentWindow);
  const [query, setQuery] = reactExports.useState("");
  const [menu, setMenu] = reactExports.useState(null);
  const [draggingId, setDraggingId] = reactExports.useState(null);
  const [dragOverId, setDragOverId] = reactExports.useState(null);
  const [externalDrag, setExternalDrag] = reactExports.useState(false);
  const [pinnedPage, setPinnedPage] = reactExports.useState(1);
  const [frequentPage, setFrequentPage] = reactExports.useState(1);
  const inputRef = reactExports.useRef(null);
  const [branches, setBranches] = reactExports.useState({});
  const [editors, setEditors] = reactExports.useState(null);
  const [gitRun$1, setGitRun] = reactExports.useState(null);
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  useEscLayer(gitRun$1 !== null, () => setGitRun(null));
  reactExports.useEffect(() => {
    const paths = folders.map((f) => f.path);
    if (paths.length === 0) {
      setBranches({});
      return;
    }
    folderGitBranches(paths).then((list) => {
      const map = {};
      folders.forEach((f, i) => {
        const b = list[i];
        if (b) map[f.id] = b;
      });
      setBranches(map);
    });
  }, [folders]);
  reactExports.useEffect(() => {
    refresh();
    refreshEditors();
    const cleanup = [];
    let disposed = false;
    let lastBlurAt = 0;
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        lastBlurAt = Date.now();
        return;
      }
      if (Date.now() - lastBlurAt < 300) return;
      setQuery("");
      refresh();
      setTimeout(() => inputRef.current?.focus(), 0);
    }).then((un) => disposed ? un() : cleanup.push(un));
    getCurrentWindow().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter" || p.type === "over") {
        setExternalDrag(true);
      } else if (p.type === "leave") {
        setExternalDrag(false);
      } else if (p.type === "drop") {
        setExternalDrag(false);
        for (const path of p.paths) {
          void add(path).then((err) => {
            if (err) toast.show(err, "error");
          });
        }
      }
    }).then((un) => disposed ? un() : cleanup.push(un));
    onEvent(EVT_FOLDER_CHANGED, () => refresh()).then((un) => disposed ? un() : cleanup.push(un));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [refresh, add]);
  const alwaysOnTop = config.folder.always_on_top;
  reactExports.useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);
  const filtered = reactExports.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [folders, query]);
  const { pinned, frequent } = reactExports.useMemo(() => sortFolders(filtered), [filtered]);
  const layout = config.folder.layout;
  const split = config.folder.split;
  const showCount = config.folder.show_visit_count;
  const terminalLabel = config.folder.terminal_shell === "wt" ? "Windows Terminal" : config.folder.terminal_shell === "cmd" ? "命令提示符" : "PowerShell";
  const pageSize = Math.max(1, config.folder.page_size);
  const pinnedPages = Math.max(1, Math.ceil(pinned.length / pageSize));
  const frequentPages = Math.max(1, Math.ceil(frequent.length / pageSize));
  const safePinnedPage = Math.min(pinnedPage, pinnedPages);
  const safeFrequentPage = Math.min(frequentPage, frequentPages);
  const pinnedView = pinned.slice(
    (safePinnedPage - 1) * pageSize,
    safePinnedPage * pageSize
  );
  const frequentView = frequent.slice(
    (safeFrequentPage - 1) * pageSize,
    safeFrequentPage * pageSize
  );
  const openFolderItem = async (folder) => {
    try {
      await openFolder(folder.path);
      hideCurrentWindow();
    } catch (err) {
      toast.show(String(err), "error");
    }
  };
  const handleAdd = async () => {
    try {
      const path = await withNativeDialog(() => pickFolder());
      if (!path) return;
      const err = await add(path);
      if (err) toast.show(err, "error");
    } catch (err) {
      toast.show(String(err), "error");
    }
  };
  const setLayout = (next) => {
    void updateConfig({
      ...config,
      folder: { ...config.folder, layout: next }
    });
  };
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      folder: { ...config.folder, always_on_top: !alwaysOnTop }
    });
  };
  const handleReorderDrop = (targetId) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const ids = pinned.map((f) => f.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, draggingId);
    void reorder(ids);
    setDraggingId(null);
    setDragOverId(null);
  };
  const openInTerminal = (folder, shell) => {
    openFolderInTerminalWith(folder.path, shell).then(() => hideCurrentWindow()).catch((e) => toast.show(String(e), "error"));
  };
  const refreshEditors = () => {
    detectEditors().then(setEditors).catch(() => setEditors([]));
  };
  const openInEditor = async (folder, editor) => {
    try {
      await openFolderInEditor(folder.path, editor);
      hideCurrentWindow();
    } catch (err) {
      const msg = String(err);
      if (editor === "code" && msg.includes("VSCodeNotFound")) {
        const exe = await withNativeDialog(() => pickVscodeExecutable());
        if (!exe) return;
        await setVscodePath(exe);
        try {
          await openFolderInEditor(folder.path, "code");
          hideCurrentWindow();
        } catch (e2) {
          toast.show(String(e2), "error");
        }
        return;
      }
      toast.show(msg, "error");
    }
  };
  const execGitCommand = async (folder, cmd) => {
    const commands = cmd.split("\n").map((s) => s.trim()).filter(Boolean);
    setGitRun({ folder, results: [], running: true });
    const results = await gitRun(folder.path, commands);
    setGitRun({ folder, results, running: false });
  };
  const menuItems = (folder) => [
    {
      label: "打开",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconExternal, { size: 14 }),
      onClick: () => void openFolderItem(folder)
    },
    {
      label: "在终端中打开",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTerminal, { size: 14 }),
      dividerAfter: true,
      children: [
        {
          label: "Windows Terminal",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTerminal, { size: 13 }),
          onClick: () => openInTerminal(folder, "wt")
        },
        {
          label: "命令提示符 (cmd)",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTerminal, { size: 13 }),
          onClick: () => openInTerminal(folder, "cmd")
        },
        {
          label: "PowerShell",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTerminal, { size: 13 }),
          onClick: () => openInTerminal(folder, "powershell")
        }
      ]
    },
    {
      label: "用编辑器打开",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCode, { size: 14 }),
      children: (editors ?? []).length ? editors.map((e) => ({
        label: e.label,
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCode, { size: 13 }),
        onClick: () => openInEditor(folder, e.key)
      })) : [
        {
          label: editors === null ? "正在检测…" : "未检测到已安装的编辑器",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCode, { size: 13 }),
          onClick: () => refreshEditors()
        }
      ]
    },
    ...branches[folder.id] ? [
      {
        label: `Git 命令（${branches[folder.id]}）`,
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconBranch, { size: 14 }),
        children: GIT_COMMANDS.map(({ label, cmd }) => ({
          label,
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconBranch, { size: 13 }),
          onClick: () => execGitCommand(folder, cmd)
        }))
      }
    ] : [],
    {
      label: "复制路径",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCopy, { size: 14 }),
      onClick: () => {
        copyFolderPath(folder.path).catch((e) => toast.show(String(e), "error"));
      }
    },
    {
      label: "设置颜色",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPalette, { size: 14 }),
      children: [
        {
          label: "无颜色",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "menu-color-dot menu-color-none" }),
          onClick: () => void setColor(folder.id, null)
        },
        ...FOLDER_COLORS.map((c) => ({
          label: c.name,
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "menu-color-dot", style: { background: c.value } }),
          onClick: () => void setColor(folder.id, c.value)
        }))
      ]
    },
    {
      label: folder.pinned ? "取消固定" : "固定",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 14 }),
      onClick: () => void togglePin2(folder.id)
    },
    {
      label: "置顶到最前",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconArrowUp, { size: 14 }),
      onClick: () => void moveToTop(folder.id),
      dividerAfter: true
    },
    {
      label: "删除",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { size: 14 }),
      danger: true,
      onClick: () => setDeleteTarget(folder)
    }
  ];
  const renderCard = (folder, sortable) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    FolderCard,
    {
      folder,
      layout,
      showCount,
      terminalShell: config.folder.terminal_shell,
      branch: branches[folder.id],
      draggable: sortable,
      dragging: draggingId === folder.id,
      dragOver: dragOverId === folder.id,
      onOpen: () => void openFolderItem(folder),
      onOpenTerminal: () => openInTerminal(folder, config.folder.terminal_shell),
      onContextMenu: (e) => {
        e.preventDefault();
        refreshEditors();
        setMenu({ x: e.clientX, y: e.clientY, folder });
      },
      onDragStart: () => setDraggingId(folder.id),
      onDragOver: (e) => {
        if (draggingId && draggingId !== folder.id) {
          e.preventDefault();
          setDragOverId(folder.id);
        }
      },
      onDrop: () => handleReorderDrop(folder.id),
      onDragEnd: () => {
        setDraggingId(null);
        setDragOverId(null);
      }
    },
    folder.id
  );
  const renderZone = (title, items, page, pages, onPage, sortable, emptyHint) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "folder-zone", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "zone-header", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "section-label", children: title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ZonePager, { page, pages, onPage })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "zone-content", children: items.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "zone-empty", children: emptyHint }) : layout === "tree" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "folder-tree", children: buildTree(items).map((g) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "tree-group", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "tree-group-head", title: g.parent, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconFolder, { size: 13 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tree-group-name", children: g.parent })
      ] }),
      g.items.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "tree-row",
          title: f.path,
          onClick: () => void openFolderItem(f),
          onContextMenu: (e) => {
            e.preventDefault();
            refreshEditors();
            setMenu({ x: e.clientX, y: e.clientY, folder: f });
          },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: "tree-dot",
                style: { background: f.color ?? "var(--accent)" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tree-name", children: relPathOf(f.path, g.parent) }),
            branches[f.id] && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "badge git-branch", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(IconBranch, { size: 10 }),
              branches[f.id]
            ] }),
            showCount && f.visit_count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "badge folder-count", children: [
              f.visit_count,
              " 次"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "icon-btn tree-term-btn",
                title: `在${terminalLabel}中打开`,
                onClick: (e) => {
                  e.stopPropagation();
                  openInTerminal(f, config.folder.terminal_shell);
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTerminal, { size: 13 })
              }
            )
          ]
        },
        f.id
      ))
    ] }, g.parent)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: layout === "grid" ? "folder-grid" : "folder-list", children: items.map((f) => renderCard(f, sortable)) }) })
  ] });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-shell", style: { position: "relative" }, children: [
      externalDrag && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "folder-drop-hint", children: "松开以添加文件夹" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-header", "data-tauri-drag-region": true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-search", "data-tauri-drag-region": true, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 15 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: inputRef,
              value: query,
              placeholder: "搜索文件夹…",
              onChange: (e) => setQuery(e.target.value),
              autoFocus: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "icon-btn", title: "添加文件夹", onClick: () => void handleAdd(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconFolderPlus, { size: 16 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "layout-switcher", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: `icon-btn ${layout === "grid" ? "active" : ""}`,
              title: "网格视图",
              onClick: () => setLayout("grid"),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconGrid, { size: 16 })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: `icon-btn ${layout === "list" ? "active" : ""}`,
              title: "列表视图",
              onClick: () => setLayout("list"),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconList, { size: 16 })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: `icon-btn ${layout === "tree" ? "active" : ""}`,
              title: "目录树视图",
              onClick: () => setLayout("tree"),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTree, { size: 16 })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: `icon-btn ${alwaysOnTop ? "active" : ""}`,
            title: alwaysOnTop ? "取消面板置顶" : "面板置顶显示",
            onClick: toggleAlwaysOnTop,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 16, filled: alwaysOnTop })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "icon-btn", title: "关闭（Esc）", onClick: () => hideCurrentWindow(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 16 }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-body", children: [
        !loaded && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "lg" }), title: "加载中…" }),
        loaded && folders.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          EmptyState,
          {
            icon: "📁",
            title: "从资源管理器拖拽文件夹到此处",
            description: "或点击右上角 + 添加"
          }
        ),
        loaded && folders.length > 0 && filtered.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { title: "没有匹配的文件夹" }),
        loaded && filtered.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `folder-zones ${split === "rows" ? "rows" : "columns"}`, children: [
          renderZone(
            "固定",
            pinnedView,
            safePinnedPage,
            pinnedPages,
            setPinnedPage,
            true,
            "暂无固定文件夹"
          ),
          renderZone(
            "最常访问",
            frequentView,
            safeFrequentPage,
            frequentPages,
            setFrequentPage,
            false,
            "暂无访问记录"
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-footer", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          folders.length,
          " 个文件夹 · 单击打开 · 右键更多操作"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Esc" }),
          " 关闭"
        ] })
      ] }),
      gitRun$1 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "git-run-overlay", onClick: () => setGitRun(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "git-run-panel", onClick: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "git-run-head", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "git-run-title", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(IconBranch, { size: 13 }),
            " Git 执行结果 · ",
            gitRun$1.folder.name
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "icon-btn",
              title: "关闭",
              onClick: () => setGitRun(null),
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 14 })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "git-run-body", children: gitRun$1.running ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "git-run-loading", children: "正在执行命令…" }) : gitRun$1.results.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "git-run-loading", children: "没有可执行的命令" }) : gitRun$1.results.map((r, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `git-run-item ${r.ok ? "ok" : "fail"}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "git-run-cmd", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "git-run-status", children: r.ok ? "✔" : "✘" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: r.command }),
            !r.ok && r.code != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "git-run-code", children: [
              "退出码 ",
              r.code
            ] })
          ] }),
          r.stdout && /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "git-run-out", children: r.stdout }),
          r.stderr && /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "git-run-err", children: r.stderr })
        ] }, i)) })
      ] }) }),
      menu && /* @__PURE__ */ jsxRuntimeExports.jsx(
        ContextMenu,
        {
          x: menu.x,
          y: menu.y,
          items: menuItems(menu.folder),
          onClose: () => setMenu(null)
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmDialog,
      {
        open: deleteTarget !== null,
        onClose: () => setDeleteTarget(null),
        onConfirm: async () => {
          if (deleteTarget) await remove(deleteTarget.id);
        },
        title: `删除「${deleteTarget?.name ?? ""}」？`,
        message: "仅从面板移除，不会删除磁盘上的文件夹。",
        danger: true,
        confirmLabel: "删除"
      }
    )
  ] });
}
function useCopyFeedback() {
  const [copiedId, setCopiedId] = reactExports.useState(null);
  const mark = (key) => {
    setCopiedId(key);
    window.setTimeout(() => {
      setCopiedId((cur) => cur === key ? null : cur);
    }, 1200);
  };
  return { copiedId, mark };
}
function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function CredentialPanel() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ToastProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(CredentialPanelInner, {}) });
}
function CredentialPanelInner() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const toast = useToast();
  usePanelCommon(config.credentials.always_on_top);
  useEscLayer(true, hideCurrentWindow);
  const showAll = config.credentials.show_passwords;
  const [items, setItems] = reactExports.useState([]);
  const [loaded, setLoaded] = reactExports.useState(false);
  const [query, setQuery] = reactExports.useState("");
  const [editing, setEditing] = reactExports.useState(null);
  const [showForm, setShowForm] = reactExports.useState(false);
  const [revealed, setRevealed] = reactExports.useState(/* @__PURE__ */ new Set());
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  const { copiedId, mark } = useCopyFeedback();
  const refresh = () => {
    listCredentials().then((list) => {
      setItems(list);
      setLoaded(true);
    });
  };
  reactExports.useEffect(() => {
    refresh();
    const cleanup = [];
    let disposed = false;
    let lastBlurAt = 0;
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        lastBlurAt = Date.now();
        return;
      }
      if (Date.now() - lastBlurAt < 300) return;
      setQuery("");
      refresh();
    }).then((un) => disposed ? un() : cleanup.push(un));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, []);
  const alwaysOnTop = config.credentials.always_on_top;
  reactExports.useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);
  const filtered = reactExports.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) => c.label.toLowerCase().includes(q) || c.account.toLowerCase().includes(q) || (c.note ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);
  const copyField = (c, field) => {
    const value = field === "account" ? c.account : c.password;
    copyText(value).then(() => mark(`${c.id}:${field}`)).catch((err) => toast.show(String(err), "error"));
  };
  const toggleReveal = (id) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      credentials: { ...config.credentials, always_on_top: !alwaysOnTop }
    });
  };
  const toggleShowAll = () => {
    void updateConfig({
      ...config,
      credentials: { ...config.credentials, show_passwords: !showAll }
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-shell", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-header", "data-tauri-drag-region": true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-search", "data-tauri-drag-region": true, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 15 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: query,
              placeholder: "搜索名称 / 账号 / 备注…",
              onChange: (e) => setQuery(e.target.value),
              autoFocus: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: `icon-btn ${showAll ? "active" : ""}`,
            title: showAll ? "隐藏全部密码" : "显示全部密码",
            onClick: toggleShowAll,
            children: showAll ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconEye, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconEyeOff, { size: 16 })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "icon-btn",
            title: "添加账号密码",
            onClick: () => {
              setEditing(null);
              setShowForm(true);
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPlus, { size: 16 })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: `icon-btn ${alwaysOnTop ? "active" : ""}`,
            title: alwaysOnTop ? "取消面板置顶" : "面板置顶显示",
            onClick: toggleAlwaysOnTop,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 16, filled: alwaysOnTop })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "icon-btn", title: "关闭（Esc）", onClick: () => hideCurrentWindow(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 16 }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-body", children: [
        !loaded && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "lg" }), title: "加载中…" }),
        loaded && items.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          EmptyState,
          {
            icon: "🔑",
            title: "点击右上角 + 添加第一个账号",
            description: "添加后可一键复制账号/密码"
          }
        ),
        loaded && items.length > 0 && filtered.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { title: "没有匹配的结果" }),
        filtered.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "cred-list", children: filtered.map((c) => {
          const isRevealed = showAll || revealed.has(c.id);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cred-card", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cred-card-head", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "cred-label", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(IconKey, { size: 14, className: "cred-ic" }),
                c.label
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cred-actions", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: "icon-btn",
                    title: "编辑",
                    onClick: () => {
                      setEditing(c);
                      setShowForm(true);
                    },
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconEdit, { size: 14 })
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: "icon-btn icon-btn-danger",
                    title: "删除",
                    onClick: () => setDeleteTarget(c),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { size: 14 })
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cred-row", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "cred-key", children: "账号" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "cred-val", title: c.account, children: c.account }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: `copy-btn ${copiedId === `${c.id}:account` ? "ok" : ""}`,
                  title: "复制账号",
                  onClick: () => copyField(c, "account"),
                  children: copiedId === `${c.id}:account` ? "已复制" : /* @__PURE__ */ jsxRuntimeExports.jsx(IconCopy, { size: 13 })
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cred-row", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "cred-key", children: "密码" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "cred-val mono", children: isRevealed ? c.password : "•".repeat(Math.min(c.password.length, 16)) }),
              !showAll && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "icon-btn",
                  title: isRevealed ? "隐藏密码" : "显示密码",
                  onClick: () => toggleReveal(c.id),
                  children: isRevealed ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconEye, { size: 14 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconEyeOff, { size: 14 })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: `copy-btn ${copiedId === `${c.id}:password` ? "ok" : ""}`,
                  title: "复制密码",
                  onClick: () => copyField(c, "password"),
                  children: copiedId === `${c.id}:password` ? "已复制" : /* @__PURE__ */ jsxRuntimeExports.jsx(IconCopy, { size: 13 })
                }
              )
            ] }),
            c.note && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "cred-note", title: c.note, children: c.note }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cred-meta", children: [
              "更新于 ",
              formatDate(c.updated_at)
            ] })
          ] }, c.id);
        }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-footer", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          items.length,
          " 个账号 · 点击复制 · 拖动标题栏移动"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Esc" }),
          " 关闭"
        ] })
      ] })
    ] }),
    showForm && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CredentialForm,
      {
        initial: editing,
        onClose: () => setShowForm(false),
        onSaved: () => {
          setShowForm(false);
          refresh();
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmDialog,
      {
        open: deleteTarget !== null,
        onClose: () => setDeleteTarget(null),
        onConfirm: async () => {
          if (deleteTarget) {
            await deleteCredential(deleteTarget.id);
            refresh();
          }
        },
        title: `删除「${deleteTarget?.label ?? ""}」？`,
        message: "删除后账号密码无法找回。",
        danger: true,
        confirmLabel: "删除"
      }
    )
  ] });
}
function CredentialForm({ initial, onClose, onSaved }) {
  const [label, setLabel] = reactExports.useState(initial?.label ?? "");
  const [account, setAccount] = reactExports.useState(initial?.account ?? "");
  const [password, setPassword] = reactExports.useState(initial?.password ?? "");
  const [note, setNote] = reactExports.useState(initial?.note ?? "");
  const [showPw, setShowPw] = reactExports.useState(!initial);
  const [error, setError] = reactExports.useState("");
  const [saving, setSaving] = reactExports.useState(false);
  const submit = async () => {
    setError("");
    if (!label.trim()) return setError("请填写名称 / 用途");
    if (!account.trim()) return setError("请填写账号");
    if (!password) return setError("请填写密码");
    setSaving(true);
    try {
      const input = {
        label: label.trim(),
        account: account.trim(),
        password,
        note: note.trim() || null
      };
      if (initial) await updateCredential(initial.id, input);
      else await addCredential(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请重试");
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    Modal,
    {
      open: true,
      onClose,
      title: initial ? "编辑账号" : "添加账号",
      wide: true,
      actions: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: onClose, disabled: saving, children: "取消" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-primary", disabled: saving, onClick: () => void submit(), children: saving ? "保存中…" : "保存" })
      ] }),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "cred-field", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "名称 / 用途" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: label,
              placeholder: "如 GitHub、公司邮箱",
              onChange: (e) => setLabel(e.target.value),
              autoFocus: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "cred-field", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "账号" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: account,
              placeholder: "用户名 / 邮箱 / 手机号",
              onChange: (e) => setAccount(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "cred-field", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "密码" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "cred-pw-wrap", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: showPw ? "text" : "password",
                value: password,
                placeholder: "请输入密码",
                onChange: (e) => setPassword(e.target.value)
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: "icon-btn",
                title: showPw ? "隐藏" : "显示",
                onClick: () => setShowPw((v) => !v),
                children: showPw ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconEye, { size: 14 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconEyeOff, { size: 14 })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "cred-field", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "备注（可选）" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              value: note,
              placeholder: "如安全问题、密保邮箱等",
              rows: 2,
              onChange: (e) => setNote(e.target.value)
            }
          )
        ] }),
        error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "cred-form-error", children: error })
      ]
    }
  );
}
const STATE_HINT = {
  LISTENING: "监听",
  ESTABLISHED: "已连接",
  TIME_WAIT: "等待",
  SYN_SENT: "连接中",
  CLOSE_WAIT: "关闭等待"
};
const SENSITIVE_PORTS = /* @__PURE__ */ new Set([
  22,
  // SSH
  53,
  // DNS
  135,
  // RPC
  137,
  138,
  139,
  // NetBIOS
  389,
  // LDAP
  445,
  // SMB
  636,
  // LDAPS
  1433,
  // MSSQL
  1521,
  // Oracle
  3306,
  // MySQL
  3389,
  // 远程桌面 RDP
  5432,
  // PostgreSQL
  6379,
  // Redis
  9200,
  // Elasticsearch
  27017
  // MongoDB
]);
function PortPanel() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ToastProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(PortPanelInner, {}) });
}
function PortPanelInner() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const toast = useToast();
  usePanelCommon(config.port.always_on_top);
  useEscLayer(true, hideCurrentWindow);
  const [keyword, setKeyword] = reactExports.useState("");
  const [items, setItems] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(false);
  const [error, setError] = reactExports.useState("");
  const [killing, setKilling] = reactExports.useState(null);
  const [confirmTarget, setConfirmTarget] = reactExports.useState(null);
  const inputRef = reactExports.useRef(null);
  const alwaysOnTop = config.port.always_on_top;
  reactExports.useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);
  reactExports.useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      port: { ...config.port, always_on_top: !alwaysOnTop }
    });
  };
  const runQuery = async (kw) => {
    const q = kw.trim();
    if (!q) {
      setError("请输入端口号或应用名");
      return;
    }
    if (/^\d+$/.test(q)) {
      const port = Number(q);
      if (port < 1 || port > 65535) {
        setError("端口号需在 1-65535 之间");
        return;
      }
    }
    setLoading(true);
    setError("");
    try {
      const list = await portSearch(q);
      setItems(list);
      if (list.length === 0) {
        setError(/^\d+$/.test(q) ? `端口 ${q} 未被占用` : `未找到匹配「${q}」的进程`);
      } else if (/^\d+$/.test(q) && list.every((x) => x.state === "TIME_WAIT")) {
        setError("仅 TIME_WAIT 连接（几分钟后自动释放，通常无需处理）");
      }
    } catch (err) {
      setError(String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  };
  const handleQuery = () => void runQuery(keyword);
  const doKill = async (proc) => {
    setKilling(proc.pid);
    setError("");
    try {
      await killPort(proc.pid);
      const q = keyword.trim();
      if (q) await runQuery(q);
      toast.show(`已成功终止进程「${proc.name}」（PID ${proc.pid}）`, "success");
    } catch (err) {
      setError(String(err));
    } finally {
      setKilling(null);
    }
  };
  const handleKillClick = (proc) => {
    if (proc.protected) return;
    setConfirmTarget(proc);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "panel-shell",
        "data-tauri-drag-region": true,
        onMouseDown: (e) => {
          const t = e.target;
          if (t.closest("button, input, select, textarea, .port-item")) return;
          getCurrentWindow().startDragging().catch(() => void 0);
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-header port-header", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-query", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 15 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  ref: inputRef,
                  value: keyword,
                  placeholder: "端口号或应用名，如 8080 / node",
                  onChange: (e) => setKeyword(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQuery();
                    }
                  }
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "btn btn-primary btn-sm port-query-btn",
                disabled: loading,
                onClick: handleQuery,
                children: loading ? "查询中…" : "查询"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: `icon-btn${alwaysOnTop ? " active" : ""}`,
                title: alwaysOnTop ? "取消置顶（失焦自动隐藏）" : "置顶显示（常驻）",
                onClick: toggleAlwaysOnTop,
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 15, filled: alwaysOnTop })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "icon-btn",
                title: "关闭（Esc）",
                onClick: () => hideCurrentWindow(),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 14 })
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-body", children: [
            error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "port-empty", children: error }),
            items.length === 0 && !error && !loading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "port-fill", children: /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { icon: "🔌", title: "输入端口号或应用名查询占用进程" }) }),
            loading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-loading", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "lg" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "正在查询端口占用…" })
            ] }),
            items.map((proc) => {
              const sensitive = proc.port ? SENSITIVE_PORTS.has(proc.port) : false;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-item", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `port-proto ${proc.proto.toLowerCase()}`, children: proc.proto }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-main", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-name", children: [
                    proc.name,
                    proc.protected && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-protected", title: "系统关键进程，已保护不可终止", children: "系统进程" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-meta", children: [
                    proc.port !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                      "端口 ",
                      proc.port
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                      "PID ",
                      proc.pid
                    ] }),
                    proc.state && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `port-state ${proc.state}`, children: STATE_HINT[proc.state] ?? proc.state }),
                    sensitive && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-sens-tag", title: "该端口为系统关键服务端口，结束其进程可能影响系统/网络功能", children: "⚠ 敏感端口" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-detail", children: [
                    proc.path && !proc.path.startsWith("PID ") && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-detail-row", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-detail-key", children: "路径" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-detail-val", title: proc.path, children: proc.path })
                    ] }),
                    proc.cmdline && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-detail-row", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-detail-key", children: "命令行" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-detail-val cmdline", title: proc.cmdline, children: proc.cmdline })
                    ] })
                  ] })
                ] }),
                proc.protected ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-kill-lock", title: "系统关键进程，已保护不可终止", children: "🔒" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: "port-kill-btn",
                    title: `终止进程 ${proc.name}（PID ${proc.pid}）`,
                    disabled: killing === proc.pid,
                    onClick: () => handleKillClick(proc),
                    children: killing === proc.pid ? "终止中…" : "终止"
                  }
                )
              ] }, `${proc.pid}-${proc.port ?? proc.pid}`);
            })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-footer", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "端口工具 · 查询 netstat 实时结果" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Enter" }),
              " 查询 · ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Esc" }),
              " 关闭"
            ] })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmDialog,
      {
        open: confirmTarget !== null,
        onClose: () => setConfirmTarget(null),
        onConfirm: async () => {
          if (confirmTarget) await doKill(confirmTarget);
        },
        title: "确认终止进程？",
        danger: true,
        confirmLabel: "确认终止",
        message: confirmTarget && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-confirm-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-confirm-key", children: "进程" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-confirm-val", children: confirmTarget.name })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-confirm-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-confirm-key", children: "PID" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-confirm-val", children: confirmTarget.pid })
          ] }),
          confirmTarget.port !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "port-confirm-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-confirm-key", children: "端口" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "port-confirm-val", children: confirmTarget.port })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "port-confirm-warn", children: "该进程打开的窗口与未保存数据可能丢失，且无法撤销。" })
        ] })
      }
    )
  ] });
}
function dateLabel(ts) {
  if (!ts) return "未知日期";
  const d = new Date(ts);
  const now = /* @__PURE__ */ new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOf(now);
  const yest = today - 864e5;
  if (startOf(d) === today) return "今天";
  if (startOf(d) === yest) return "昨天";
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function fmtSize$1(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function FileItem({
  f,
  color,
  dateLabel: dateLabel2,
  fmtSize: fmtSize2,
  customOpener,
  onOpen,
  onReveal,
  onDelete
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "qf-item",
      style: { "--c": color },
      onDoubleClick: onOpen,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "qf-ext-badge",
            style: { "--c": color },
            children: f.ext.toUpperCase() || "?"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-item-main", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-item-name", title: f.name, children: f.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-item-meta", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: dateLabel2(f.created_at) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: fmtSize2(f.size) }),
            customOpener && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-item-app", children: "自定义打开" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-item-actions", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "qf-act", title: "打开", onClick: onOpen, children: "打开" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "qf-act", title: "在文件夹中定位", onClick: onReveal, children: "定位" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "qf-act danger", title: "删除", onClick: onDelete, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { size: 13 }) })
        ] })
      ]
    }
  );
}
function agoLabel(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 2 * DAY) return "昨天";
  return dateLabel(ts);
}
function parentLabel(path) {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}
function RecentTab({
  fileTypes,
  onToast
}) {
  const [sort, setSort] = reactExports.useState("time");
  const [items, setItems] = reactExports.useState([]);
  const [loaded, setLoaded] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let alive = true;
    recentFilesList(sort).then((v) => {
      if (alive) {
        setItems(v);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [sort]);
  const open2 = (r) => {
    const t = fileTypes.find((x) => x.ext.toLowerCase() === r.ext.toLowerCase());
    quickfilesOpen(r.path, t?.opener).catch((e) => onToast(`打开失败：${String(e)}`, "error"));
  };
  const remove = (r) => {
    recentFilesRemove(r.path).catch(() => void 0);
    setItems((prev) => prev.filter((x) => x.path !== r.path));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-controls", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-loc-text", children: [
        "共 ",
        items.length,
        " 条 · 自动记录你在本面板打开过的文件"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-controls-right", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "segmented", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: sort === "time" ? "active" : "", onClick: () => setSort("time"), children: "最近打开" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: sort === "count" ? "active" : "", onClick: () => setSort("count"), children: "按次数" })
        ] }),
        items.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "btn btn-sm",
            onClick: () => {
              recentFilesClear().then(() => setItems([])).catch(() => void 0);
            },
            children: "清空"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-body qf-body", children: [
      loaded && items.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
        EmptyState,
        {
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconFiles, { size: 22 }),
          title: "还没有打开记录",
          description: "在「常用文件」或「全盘搜索」里双击打开文件，这里会自动累积"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-rows", children: items.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "qf-row",
          title: `${r.path}
双击再次打开`,
          onDoubleClick: () => open2(r),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-ext-badge", style: { ["--c"]: typeColor(fileTypes, r.ext) }, children: r.ext ? r.ext.toUpperCase().slice(0, 4) : "文件" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-row-main", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-row-name", children: r.name }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-row-meta", children: [
                parentLabel(r.path),
                sort === "count" && r.count > 1 ? ` · 打开 ${r.count} 次` : ""
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-row-time", children: agoLabel(r.last_open) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-row-actions", onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "qf-act",
                  title: "打开文件",
                  onClick: () => open2(r),
                  children: "打开"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "qf-act",
                  title: "在资源管理器中定位",
                  onClick: () => quickfilesReveal(r.path).catch(() => void 0),
                  children: "定位"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "qf-act danger", title: "从最近列表移除（不删除文件）", onClick: () => remove(r), children: "移除" })
            ] })
          ]
        },
        r.path
      )) })
    ] })
  ] });
}
function SearchTab({
  fileTypes,
  onToast
}) {
  const [status, setStatus] = reactExports.useState(null);
  const [scanned, setScanned] = reactExports.useState(0);
  const [q, setQ] = reactExports.useState("");
  const [hits, setHits] = reactExports.useState([]);
  const [err, setErr] = reactExports.useState("");
  const [searching, setSearching] = reactExports.useState(false);
  const inputRef = reactExports.useRef(null);
  const refresh = () => fsIndexStatus().then(setStatus);
  reactExports.useEffect(() => {
    void refresh();
    inputRef.current?.focus();
    let un1;
    let un2;
    let dead = false;
    onEvent(EVT_FSINDEX_PROGRESS, (p) => {
      setScanned(p.entries);
    }).then((u) => {
      if (dead) u();
      else un1 = u;
    });
    onEvent(EVT_FSINDEX_DONE, () => {
      setScanned(0);
      void refresh();
    }).then((u) => {
      if (dead) u();
      else un2 = u;
    });
    return () => {
      dead = true;
      un1?.();
      un2?.();
    };
  }, []);
  reactExports.useEffect(() => {
    const key = q.trim();
    if ([...key].length < 2) {
      setHits([]);
      setErr("");
      return;
    }
    const t = window.setTimeout(() => {
      setSearching(true);
      fsIndexSearch(key).then((v) => {
        setHits(v);
        setErr("");
      }).catch((e) => {
        setHits([]);
        setErr(String(e).replace(/^(Error: |invoke error: )/i, ""));
      }).finally(() => setSearching(false));
    }, 180);
    return () => window.clearTimeout(t);
  }, [q]);
  const building = !!status?.building;
  const open2 = (h) => {
    const ext = h.is_dir ? "" : h.name.split(".").pop()?.toLowerCase() ?? "";
    const t = fileTypes.find((x) => x.ext.toLowerCase() === ext);
    quickfilesOpen(h.path, t?.opener).catch((e) => onToast(`打开失败：${String(e)}`, "error"));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-controls qf-controls-search", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-search-wrap", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 13 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            ref: inputRef,
            className: "qf-search",
            placeholder: "全盘搜索文件/文件夹名（至少 2 个字符，含 \\\\ 时按路径匹配）",
            value: q,
            spellCheck: false,
            autoComplete: "off",
            name: "qf-fulltext-search",
            onChange: (e) => setQ(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && hits.length) open2(hits[0]);
            }
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-controls-right", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-index-meta", children: building ? `正在扫描 ${scanned.toLocaleString()} 条…` : status && status.entries > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          "索引",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-index-count", children: status.entries.toLocaleString() }),
          " ",
          "条 · ",
          agoLabel(status.built_at),
          "更新"
        ] }) : "尚未建立索引" }),
        !building && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "btn btn-sm",
            onClick: () => {
              fsIndexRebuild().then(() => setStatus((s) => s ? { ...s, building: true } : s)).catch((e) => onToast(String(e), "error"));
            },
            children: status && status.entries > 0 ? "更新索引" : "建立索引"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-body qf-body", children: [
      err && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-error", children: err }),
      building && /* @__PURE__ */ jsxRuntimeExports.jsx(
        EmptyState,
        {
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "lg" }),
          title: "正在建立全盘索引",
          description: `已扫描 ${scanned.toLocaleString()} 条。首次扫描需要十几秒到几分钟，期间可继续使用其他页签。`
        }
      ),
      !building && status && status.entries === 0 && !err && /* @__PURE__ */ jsxRuntimeExports.jsx(
        EmptyState,
        {
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 22 }),
          title: "还没有索引，搜不了",
          description: "索引只记录文件名与所在目录，不含文件内容；建立后缓存在本地，之后每次打开面板即刻可用。",
          action: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "btn btn-primary btn-sm qf-empty-btn",
              onClick: () => {
                fsIndexRebuild().then(() => setStatus((s) => s ? { ...s, building: true } : s)).catch((e) => onToast(String(e), "error"));
              },
              children: "建立索引"
            }
          )
        }
      ),
      !building && status && status.entries > 0 && q.trim().length < 2 && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 22 }), title: "输入要查找的文件名", description: "例如 report、.rs、src-tauri\\ocr" }),
      !building && hits.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-rows", children: hits.map((h) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "qf-row",
          title: `${h.path}
双击打开`,
          onDoubleClick: () => open2(h),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `qf-ext-badge qf-hit-badge${h.is_dir ? " dir" : ""}`,
                style: { ["--c"]: h.is_dir ? "#e0a33e" : typeColor(fileTypes, h.name.split(".").pop() ?? "") },
                children: h.is_dir ? "目录" : (h.name.split(".").pop() ?? "文件").toUpperCase().slice(0, 4)
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-row-main", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-row-name", children: h.name }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-row-meta", children: parentLabel(h.path) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-row-actions", onClick: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "qf-act", title: "打开", onClick: () => open2(h), children: "打开" }),
              !h.is_dir && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "qf-act",
                  title: "在资源管理器中定位",
                  onClick: () => quickfilesReveal(h.path).catch(() => void 0),
                  children: "定位"
                }
              )
            ] })
          ]
        },
        h.path
      )) }),
      !building && !searching && status && status.entries > 0 && q.trim().length >= 2 && !err && hits.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-hit-empty", children: [
        "没有匹配「",
        q.trim(),
        "」的文件名"
      ] })
    ] })
  ] });
}
function typeColor(fileTypes, ext) {
  const e = (ext || "").toLowerCase();
  return fileTypes.find((t) => t.ext.toLowerCase() === e)?.color ?? "#8a94a6";
}
function QuickFilesPanel() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(ToastProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(QuickFilesPanelInner, {}) });
}
function QuickFilesPanelInner() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const toast = useToast();
  usePanelCommon(config.files.always_on_top);
  useEscLayer(true, hideCurrentWindow);
  const [files, setFiles] = reactExports.useState([]);
  const [tab, setTab] = reactExports.useState("files");
  const [location2, setLocation] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(true);
  const [group, setGroup] = reactExports.useState(config.files.default_group);
  const [sort, setSort] = reactExports.useState(config.files.default_sort);
  const [layout, setLayout] = reactExports.useState(
    config.files.default_layout || "vertical"
  );
  const [newOpen, setNewOpen] = reactExports.useState(false);
  const [creatingType, setCreatingType] = reactExports.useState(null);
  const [newName, setNewName] = reactExports.useState("");
  const [creating, setCreating] = reactExports.useState(false);
  const [error, setError] = reactExports.useState("");
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  const newInputRef = reactExports.useRef(null);
  const fileTypes = config.files.file_types;
  const alwaysOnTop = config.files.always_on_top;
  const changeGroup = (g) => {
    setGroup(g);
    void updateConfig({ ...config, files: { ...config.files, default_group: g } });
  };
  const changeSort = (s) => {
    setSort(s);
    void updateConfig({ ...config, files: { ...config.files, default_sort: s } });
  };
  const changeLayout = (l) => {
    setLayout(l);
    void updateConfig({ ...config, files: { ...config.files, default_layout: l } });
  };
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const exts = fileTypes.map((t) => t.ext);
      const res = await quickfilesList(config.files.location ?? "", exts);
      setLocation(res.location);
      setFiles(res.files);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    void load();
  }, []);
  reactExports.useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);
  reactExports.useEffect(() => {
    let cleanup;
    let disposed = false;
    onEvent(EVT_PANEL_VISIBILITY, (ev) => {
      if (ev.visible && ev.label === getCurrentWindow().label) {
        setCreatingType(null);
        setNewName("");
        setDeleteTarget(null);
        setNewOpen(false);
      }
    }).then((un) => {
      if (disposed) un();
      else cleanup = un;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  const newWrapRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!newOpen) return;
    const onDown = (e) => {
      const t = e.target;
      if (t && newWrapRef.current && !newWrapRef.current.contains(t)) {
        setNewOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [newOpen]);
  const typeOf = (ext) => fileTypes.find((t) => t.ext.toLowerCase() === ext.toLowerCase());
  const groups = reactExports.useMemo(() => {
    const sortItems = (arr) => {
      const copy = [...arr];
      if (sort === "name") {
        copy.sort((a, b) => a.name.localeCompare(b.name, "zh"));
      } else {
        copy.sort((a, b) => b.created_at - a.created_at);
      }
      return copy;
    };
    if (group === "type") {
      const map = /* @__PURE__ */ new Map();
      for (const t of fileTypes) {
        map.set(t.ext.toLowerCase(), { key: t.ext.toLowerCase(), label: t.label, color: t.color, items: [] });
      }
      for (const f of files) {
        const k = f.ext.toLowerCase();
        if (!map.has(k)) map.set(k, { key: k, label: f.ext.toUpperCase(), items: [] });
        map.get(k).items.push(f);
      }
      return Array.from(map.values()).filter((g) => g.items.length > 0).map((g) => ({ ...g, items: sortItems(g.items) }));
    }
    if (group === "date") {
      const map = /* @__PURE__ */ new Map();
      for (const f of files) {
        const k = dateKey(f.created_at);
        if (!map.has(k)) map.set(k, { key: k, label: dateLabel(f.created_at), items: [] });
        map.get(k).items.push(f);
      }
      return Array.from(map.values()).sort((a, b) => b.key < a.key ? -1 : 1).map((g) => ({ ...g, items: sortItems(g.items) }));
    }
    return [{ key: "", label: "", items: sortItems(files) }];
  }, [files, group, sort, fileTypes]);
  const doCreate = async () => {
    if (!creatingType || creating) return;
    const raw = newName.trim();
    if (!raw) {
      setError("请输入文件名");
      return;
    }
    const base2 = raw.replace(/\.[^.]+$/, "");
    const filename = `${base2}.${creatingType.ext}`;
    setError("");
    setCreating(true);
    try {
      const path = await quickfilesCreate(config.files.location ?? "", filename);
      setCreatingType(null);
      setNewName("");
      setNewOpen(false);
      toast.show(`已创建 ${filename}`, "success");
      await load();
      try {
        await quickfilesOpen(path, creatingType.opener);
      } catch (e) {
        toast.show(`打开失败：${String(e)}`, "error");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };
  const doOpen = async (f) => {
    const t = typeOf(f.ext);
    try {
      await quickfilesOpen(f.path, t?.opener);
    } catch (e) {
      setError(String(e));
    }
  };
  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await quickfilesDelete(deleteTarget.path);
      toast.show(`已删除 ${deleteTarget.name}`, "success");
      await load();
    } catch (e) {
      toast.show(String(e), "error");
    }
  };
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      files: { ...config.files, always_on_top: !alwaysOnTop }
    });
  };
  const startCreate = (t) => {
    setCreatingType(t);
    setNewName("");
    setNewOpen(false);
    setTimeout(() => newInputRef.current?.focus(), 50);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-shell", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-header qf-header", "data-tauri-drag-region": true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-title", "data-tauri-drag-region": true, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(IconFiles, { size: 16 }),
          "快速文件"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-tabs", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "segmented", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: tab === "files" ? "active" : "", onClick: () => setTab("files"), children: "常用文件" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: tab === "recent" ? "active" : "", onClick: () => setTab("recent"), children: "最近打开" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: tab === "search" ? "active" : "", onClick: () => setTab("search"), children: "全盘搜索" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-new-wrap", ref: newWrapRef, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              className: `qf-new-btn${newOpen ? " open" : ""}`,
              onClick: () => setNewOpen((v) => !v),
              title: "新建文件",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-new-plus", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPlus, { size: 12 }) }),
                "新建"
              ]
            }
          ),
          newOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "qf-new-mask",
                onMouseDown: (e) => {
                  e.preventDefault();
                  setNewOpen(false);
                }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-new-pop", onMouseDown: (e) => e.stopPropagation(), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-new-pop-title", children: "选择文件类型" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-new-types", children: [
                fileTypes.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-empty-sm", children: "尚未配置文件类型，请到设置中添加" }),
                fileTypes.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    className: "qf-type-chip",
                    style: { "--c": t.color },
                    onClick: () => startCreate(t),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-type-dot" }),
                      t.label,
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-type-ext", children: [
                        ".",
                        t.ext
                      ] })
                    ]
                  },
                  t.ext
                ))
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: `icon-btn${alwaysOnTop ? " active" : ""}`,
            title: alwaysOnTop ? "取消置顶（失焦自动隐藏）" : "置顶显示（常驻）",
            onClick: toggleAlwaysOnTop,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 16, filled: alwaysOnTop })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "icon-btn",
            title: "关闭（Esc）",
            onClick: () => hideCurrentWindow(),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 16 })
          }
        )
      ] }),
      tab === "files" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-controls", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              className: "qf-loc",
              title: "打开保存位置",
              onClick: () => location2 && quickfilesReveal(location2).catch(() => void 0),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(IconLocate, { size: 13 }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-loc-text", children: location2 || "（未配置，使用默认位置）" })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-controls-right", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-switch-group", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-switch-label", children: "分组" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-icon-switcher", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: `icon-btn${group === "none" ? " active" : ""}`,
                    title: "不分组（平铺列表）",
                    onClick: () => changeGroup("none"),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconGroupNone, { size: 16 })
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: `icon-btn${group === "type" ? " active" : ""}`,
                    title: "按类型分组",
                    onClick: () => changeGroup("type"),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconGroupType, { size: 16 })
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: `icon-btn${group === "date" ? " active" : ""}`,
                    title: "按日期分组",
                    onClick: () => changeGroup("date"),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconGroupDate, { size: 16 })
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-switch-group", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-switch-label", children: "排序" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-icon-switcher", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: `icon-btn${sort === "created" ? " active" : ""}`,
                    title: "按创建时间排序",
                    onClick: () => changeSort("created"),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSortTime, { size: 16 })
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: `icon-btn${sort === "name" ? " active" : ""}`,
                    title: "按名称排序",
                    onClick: () => changeSort("name"),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSortName, { size: 16 })
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-switch-group", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-switch-label", children: "排列" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-icon-switcher", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: `icon-btn${layout === "vertical" ? " active" : ""}`,
                    title: "垂直列表",
                    onClick: () => changeLayout("vertical"),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconList, { size: 16 })
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: `icon-btn${layout === "horizontal" ? " active" : ""}`,
                    title: "水平多列并排",
                    onClick: () => changeLayout("horizontal"),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconListColumns, { size: 16 })
                  }
                )
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-body qf-body", children: [
          error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-error", children: error }),
          loading && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "lg" }), title: "正在读取文件…" }),
          !loading && files.length === 0 && !error && /* @__PURE__ */ jsxRuntimeExports.jsx(
            EmptyState,
            {
              icon: "📄",
              title: "该位置暂无已配置文件类型的文件",
              action: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  className: "btn btn-primary btn-sm qf-empty-btn",
                  onClick: () => setNewOpen((v) => !v),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(IconPlus, { size: 13 }),
                    " 新建文件"
                  ]
                }
              )
            }
          ),
          !loading && (layout === "horizontal" && group !== "none" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-groups qf-groups-h", children: groups.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "qf-group",
              style: { "--c": g.color ?? "var(--accent)" },
              children: [
                g.label && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-group-head", children: [
                  g.color && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-group-dot", style: { background: g.color } }),
                  g.label,
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-group-count", children: g.items.length })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-group-body", children: g.items.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                  FileItem,
                  {
                    f,
                    color: typeOf(f.ext)?.color ?? "#8a94a6",
                    dateLabel,
                    fmtSize: fmtSize$1,
                    customOpener: !!typeOf(f.ext)?.opener,
                    onOpen: () => void doOpen(f),
                    onReveal: () => quickfilesReveal(f.path).catch(() => void 0),
                    onDelete: () => setDeleteTarget(f)
                  },
                  f.path
                )) })
              ]
            },
            g.key || "__all__"
          )) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-groups", children: groups.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-group", children: [
            g.label && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-group-head", children: [
              g.color && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-group-dot", style: { background: g.color } }),
              g.label,
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-group-count", children: g.items.length })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-group-body", children: g.items.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              FileItem,
              {
                f,
                color: typeOf(f.ext)?.color ?? "#8a94a6",
                dateLabel,
                fmtSize: fmtSize$1,
                customOpener: !!typeOf(f.ext)?.opener,
                onOpen: () => void doOpen(f),
                onReveal: () => quickfilesReveal(f.path).catch(() => void 0),
                onDelete: () => setDeleteTarget(f)
              },
              f.path
            )) })
          ] }, g.key || "__all__")) }))
        ] })
      ] }),
      tab === "recent" && /* @__PURE__ */ jsxRuntimeExports.jsx(RecentTab, { fileTypes, onToast: toast.show }),
      tab === "search" && /* @__PURE__ */ jsxRuntimeExports.jsx(SearchTab, { fileTypes, onToast: toast.show }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-footer", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: tab === "files" ? "快速文件 · 统一位置新建与管理" : tab === "recent" ? "最近打开 · 记录在本面板打开过的文件" : "全盘搜索 · 只索引文件名，数据不出本机" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Esc" }),
          " 关闭 · 双击打开",
          tab === "search" ? " · 回车打开首条" : ""
        ] })
      ] })
    ] }),
    creatingType && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Modal,
      {
        open: true,
        onClose: () => {
          if (!creating) {
            setCreatingType(null);
            setNewName("");
          }
        },
        title: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "qf-type-dot", style: { background: creatingType.color } }),
          "新建",
          creatingType.label,
          "文件"
        ] }),
        actions: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "btn",
              disabled: creating,
              onClick: () => {
                setCreatingType(null);
                setNewName("");
              },
              children: "取消"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              className: "btn btn-primary",
              disabled: creating,
              onClick: () => void doCreate(),
              children: [
                creating && /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "sm" }),
                "创建并打开"
              ]
            }
          )
        ] }),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-modal-sub", children: [
            "将保存到：",
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "qf-modal-loc", children: [
              location2 || "默认位置",
              creatingType ? `\\${creatingType.ext}` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: newInputRef,
              className: "qf-modal-input",
              placeholder: "文件名（不含扩展名），如 note",
              value: newName,
              autoFocus: true,
              onChange: (e) => setNewName(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void doCreate();
                }
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "qf-modal-hint", children: [
            "保存为：",
            newName.trim().replace(/\.[^.]+$/, ""),
            ".",
            creatingType.ext
          ] }),
          error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-error", children: error })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmDialog,
      {
        open: deleteTarget !== null,
        onClose: () => setDeleteTarget(null),
        onConfirm: doDelete,
        title: "确认删除文件？",
        message: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-modal-sub", children: deleteTarget?.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "qf-modal-warn", children: "文件将被永久删除，无法撤销。" })
        ] }),
        danger: true,
        confirmLabel: "确认删除"
      }
    )
  ] });
}
const snippetsList = () => invoke("snippets_list");
const snippetsCreate = (title, content, group) => invoke("snippets_create", { title, content, group });
const snippetsUpdate = (id, title, content, group) => invoke("snippets_update", { id, title, content, group });
const snippetsDelete = (id) => invoke("snippets_delete", { id });
const snippetsPaste = (id) => invoke("snippets_paste", { id });
const clipboardCopyText = (text) => invoke("clipboard_copy_text", { text });
const DEFAULT_GROUP = "默认";
function SnippetPanel() {
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  usePanelCommon(config.snippets.always_on_top);
  useEscLayer(true, hideCurrentWindow);
  const [items, setItems] = reactExports.useState([]);
  const [keyword, setKeyword] = reactExports.useState("");
  const [activeGroup, setActiveGroup] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState("");
  const [edit, setEdit] = reactExports.useState(null);
  const [saving, setSaving] = reactExports.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = reactExports.useState(null);
  const [copiedKey, setCopiedKey] = reactExports.useState(null);
  const searchRef = reactExports.useRef(null);
  const titleRef = reactExports.useRef(null);
  const alwaysOnTop = config.snippets.always_on_top;
  reactExports.useEffect(() => {
    setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      snippets: { ...config.snippets, always_on_top: !alwaysOnTop }
    });
  };
  const refresh = async () => {
    try {
      setItems(await snippetsList());
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    void refresh();
    setTimeout(() => searchRef.current?.focus(), 60);
  }, []);
  const groups = reactExports.useMemo(() => {
    const set = /* @__PURE__ */ new Set();
    for (const s of items) if (s.group.trim()) set.add(s.group.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "zh"));
  }, [items]);
  const visible = reactExports.useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((s) => {
      if (activeGroup && s.group.trim() !== activeGroup) return false;
      if (!kw) return true;
      return s.title.toLowerCase().includes(kw) || s.content.toLowerCase().includes(kw);
    });
  }, [items, keyword, activeGroup]);
  const handlePaste = async (sn) => {
    try {
      await snippetsPaste(sn.id);
    } catch (err) {
      console.error("粘贴失败：", err);
      setError(String(err));
      return;
    }
    hideCurrentWindow();
  };
  const copyField = async (sn, kind) => {
    const text = kind === "title" ? sn.title : sn.content;
    if (!text) return;
    const key = `${sn.id}:${kind}`;
    try {
      await clipboardCopyText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((cur) => cur === key ? null : cur);
      }, 1200);
    } catch (err) {
      setError(String(err));
    }
  };
  const openEdit = (sn) => {
    setConfirmDeleteId(null);
    setEdit(
      sn ? { id: sn.id, title: sn.title, content: sn.content, group: sn.group } : { id: null, title: "", content: "", group: activeGroup ?? "" }
    );
    setTimeout(() => titleRef.current?.focus(), 40);
  };
  const closeEdit = () => {
    if (saving) return;
    setEdit(null);
  };
  const saveEdit = async () => {
    if (!edit) return;
    const title = edit.title.trim();
    const content = edit.content.trim();
    if (!title) {
      setError("标题不能为空");
      titleRef.current?.focus();
      return;
    }
    if (!content) {
      setError("内容不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const group = edit.group.trim() || DEFAULT_GROUP;
      if (edit.id === null) {
        await snippetsCreate(title, content, group);
      } else {
        await snippetsUpdate(edit.id, title, content, group);
      }
      setEdit(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (sn) => {
    if (confirmDeleteId !== sn.id) {
      setConfirmDeleteId(sn.id);
      window.setTimeout(() => {
        setConfirmDeleteId((cur) => cur === sn.id ? null : cur);
      }, 3e3);
      return;
    }
    setConfirmDeleteId(null);
    try {
      await snippetsDelete(sn.id);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "panel-shell",
        "data-tauri-drag-region": true,
        onMouseDown: (e) => {
          const t = e.target;
          if (t.closest("button, input, textarea, .snip-item, .snip-chips")) return;
          getCurrentWindow().startDragging().catch(() => void 0);
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-header snip-header", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-search", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "search-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 14 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  ref: searchRef,
                  value: keyword,
                  placeholder: "搜索语速贴…",
                  onChange: (e) => setKeyword(e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "icon-btn", title: "新增语速贴（Enter 保存）", onClick: () => openEdit(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPlus, { size: 15 }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: `icon-btn ${alwaysOnTop ? "active" : ""}`,
                title: alwaysOnTop ? "取消面板置顶" : "面板置顶显示",
                onClick: toggleAlwaysOnTop,
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 15, filled: alwaysOnTop })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "icon-btn", title: "关闭（Esc）", onClick: () => hideCurrentWindow(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 14 }) })
          ] }),
          groups.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "snip-chips", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: `snip-chip${activeGroup === null ? " active" : ""}`,
                onClick: () => setActiveGroup(null),
                children: "全部"
              }
            ),
            groups.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                className: `snip-chip${activeGroup === g ? " active" : ""}`,
                onClick: () => setActiveGroup(g),
                children: g
              },
              g
            ))
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-body", children: [
            error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "snip-error", children: error }),
            !loading && !error && items.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
              EmptyState,
              {
                icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSnippet, { size: 28 }),
                title: "还没有语速贴",
                action: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-primary btn-sm", onClick: () => openEdit(), children: "新建第一条" })
              }
            ),
            !loading && !error && items.length > 0 && visible.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { title: "没有匹配的语速贴" }),
            loading && /* @__PURE__ */ jsxRuntimeExports.jsx(EmptyState, { icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Spinner, { size: "lg" }), title: "加载中…" }),
            visible.map((sn) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                className: "snip-item",
                onClick: () => void handlePaste(sn),
                title: "点击粘贴并关闭",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "snip-main", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "snip-title", children: [
                      sn.title,
                      sn.group.trim() && sn.group.trim() !== DEFAULT_GROUP && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "snip-tag", children: sn.group.trim() })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "snip-preview", children: sn.content || "（空内容）" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "snip-actions", onClick: (e) => e.stopPropagation(), children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        className: `icon-btn${copiedKey === `${sn.id}:title` ? " copied" : ""}`,
                        title: "复制标题",
                        onClick: () => void copyField(sn, "title"),
                        children: copiedKey === `${sn.id}:title` ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconCheck, { size: 13 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconText, { size: 13 })
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        className: `icon-btn${copiedKey === `${sn.id}:content` ? " copied" : ""}`,
                        title: "复制内容",
                        onClick: () => void copyField(sn, "content"),
                        children: copiedKey === `${sn.id}:content` ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconCheck, { size: 13 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(IconCopy, { size: 13 })
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "snip-actions-sep" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        className: "icon-btn",
                        title: "编辑",
                        onClick: () => openEdit(sn),
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconEdit, { size: 13 })
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        className: `icon-btn${confirmDeleteId === sn.id ? " icon-btn-danger snip-confirm-del" : ""}`,
                        title: confirmDeleteId === sn.id ? "再次点击确认删除" : "删除",
                        onClick: () => void handleDelete(sn),
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { size: 13 })
                      }
                    )
                  ] })
                ]
              },
              sn.id
            ))
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-footer", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(IconSnippet, { size: 12 }),
              " 常用语速贴 · 共 ",
              items.length,
              " 条"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "点击卡片即粘贴并关闭 · ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Esc" }),
              " 关闭"
            ] })
          ] })
        ]
      }
    ),
    edit && /* @__PURE__ */ jsxRuntimeExports.jsx(
      Modal,
      {
        open: true,
        onClose: closeEdit,
        title: edit.id === null ? "新建语速贴" : "编辑语速贴",
        wide: true,
        actions: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", disabled: saving, onClick: closeEdit, children: "取消" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-primary", disabled: saving, onClick: () => void saveEdit(), children: saving ? "保存中…" : "保存" })
        ] }),
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            onKeyDown: (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void saveEdit();
              }
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "snip-field", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "标题" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    ref: titleRef,
                    value: edit.title,
                    placeholder: "如：今日日报、常用问候",
                    autoFocus: true,
                    onChange: (e) => setEdit({ ...edit, title: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "snip-field", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "分组（可选）" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    value: edit.group,
                    placeholder: DEFAULT_GROUP,
                    onChange: (e) => setEdit({ ...edit, group: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "snip-field", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "内容" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "textarea",
                  {
                    value: edit.content,
                    placeholder: "点击卡片后将原样粘贴到当前输入框",
                    rows: 5,
                    onChange: (e) => setEdit({ ...edit, content: e.target.value })
                  }
                )
              ] })
            ]
          }
        )
      }
    )
  ] });
}
const KIND_RANK = {
  tool: 0,
  command: 1,
  snippet: 2,
  clip: 3,
  folder: 4,
  qfile: 5,
  app: 6,
  credential: 7,
  web: 8
};
const KIND_LABEL = {
  tool: "工具",
  command: "命令",
  snippet: "语速贴",
  clip: "剪贴板",
  folder: "文件夹",
  qfile: "快速文件",
  app: "本机应用",
  credential: "账号密码",
  web: "网页搜索"
};
function tokenScore(tok, item) {
  const title = item.title.toLowerCase();
  if (title === tok) return 100;
  if (title.startsWith(tok)) return 90;
  if (title.includes(tok)) return 80;
  if (item.initials) {
    const inits = item.initials.split(/\s+/);
    if (inits.includes(tok)) return 75;
    if (inits.some((t) => t.startsWith(tok))) return 68;
  }
  if (item.keywords) {
    const kws = item.keywords.split(/\s+/);
    if (kws.includes(tok)) return 70;
    if (kws.some((t) => t.startsWith(tok))) return 62;
  }
  if (item.subtitle && item.subtitle.toLowerCase().includes(tok)) return 55;
  const ft = fuzzyScore(tok, title);
  if (ft > 0) return ft;
  const hay = [item.keywords ?? "", item.initials ?? ""].join(" ");
  if (hay) return Math.min(25, fuzzyScore(tok, hay));
  return 0;
}
function fuzzyScore(tok, target) {
  if (!tok || !target) return 0;
  let from = 0;
  let prev = -2;
  let consec = 0;
  let bestConsec = 0;
  let runs = 0;
  let gaps = 0;
  for (const c of tok) {
    const at = target.indexOf(c, from);
    if (at < 0) return 0;
    if (at === prev + 1) {
      consec++;
    } else {
      runs++;
      gaps += prev < 0 ? 0 : at - prev - 1;
      consec = 1;
    }
    bestConsec = Math.max(bestConsec, consec);
    prev = at;
    from = at + 1;
  }
  const spread = prev + 1 - tok.length;
  const raw = 20 + bestConsec * 5 + (runs === 1 ? 6 : 0) - Math.floor(gaps / 2) - Math.floor(spread / 4);
  return Math.max(8, Math.min(40, raw));
}
function scoreItem(q, item) {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  let worst = Infinity;
  for (const t of tokens) {
    const s = tokenScore(t, item);
    if (s === 0) return 0;
    worst = Math.min(worst, s);
  }
  return worst;
}
function usageBonus(stat, now = Date.now()) {
  if (!stat) return 0;
  let bonus = Math.min(14, Math.log2(1 + stat.count) * 3);
  const age = now - stat.last_used;
  if (age < 864e5) bonus += 10;
  else if (age < 7 * 864e5) bonus += 5;
  return bonus;
}
function statKey(item) {
  return `${item.kind}:${item.id}`;
}
function compareScored(a, b) {
  const rank = KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind];
  if (rank !== 0) return rank;
  if (b.score !== a.score) return b.score - a.score;
  if (b.usage !== a.usage) return b.usage - a.usage;
  return 0;
}
const TTL = 15e3;
let data = null;
let fetchedAt = 0;
let filesSig = "";
let inflight = null;
let apps = null;
let appsInflight = null;
let stats = null;
let statsInflight = null;
function currentFilesSig() {
  const c = getConfig();
  return `${c.files.location ?? ""}|${c.files.file_types.map((t) => t.ext).join(",")}`;
}
async function fetchSources() {
  const c = getConfig();
  const exts = c.files.file_types.map((t) => t.ext);
  const [clips, creds, snippets, folders, fileRes] = await Promise.all([
    c.clipboard.enabled ? listClipboard() : Promise.resolve([]),
    c.credentials.enabled ? listCredentials() : Promise.resolve([]),
    c.snippets.enabled ? snippetsList().catch(() => []) : Promise.resolve([]),
    c.folder.enabled ? listFolders() : Promise.resolve([]),
    c.files.enabled ? quickfilesList(c.files.location ?? "", exts) : Promise.resolve(null)
  ]);
  filesSig = currentFilesSig();
  const next = {
    clips,
    creds,
    snippets,
    folders,
    files: fileRes?.files ?? [],
    filesLocation: fileRes?.location ?? ""
  };
  data = next;
  fetchedAt = Date.now();
  return next;
}
function refreshSources() {
  if (!inflight) {
    inflight = fetchSources().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
async function sourcesForSearch() {
  if (data) {
    if (Date.now() - fetchedAt > TTL || filesSig !== currentFilesSig()) void refreshSources();
    return data;
  }
  return refreshSources();
}
function installedApps() {
  if (apps) return Promise.resolve(apps);
  if (!appsInflight) {
    appsInflight = listInstalledApps().then((list) => {
      apps = list;
      return list;
    }).finally(() => {
      appsInflight = null;
    });
  }
  return appsInflight;
}
function peekApps() {
  void installedApps();
  return apps;
}
function allStats() {
  return stats ?? /* @__PURE__ */ new Map();
}
function statsReady() {
  return stats !== null;
}
function refreshStats() {
  if (!statsInflight) {
    statsInflight = listPaletteStats().then((list) => {
      stats = new Map(list.map((s) => [s.key, s]));
      return stats;
    }).finally(() => {
      statsInflight = null;
    });
  }
  return statsInflight;
}
function statOf(key) {
  return stats?.get(key);
}
function recordUsage(key) {
  const prev = stats?.get(key);
  stats?.set(key, { key, count: (prev?.count ?? 0) + 1, last_used: Date.now() });
  void bumpPaletteStat(key);
}
function watchSourceInvalidation() {
  const cleanups = [];
  let disposed = false;
  const sub = (evt, fn) => onEvent(evt, fn).then((un) => disposed ? un() : cleanups.push(un));
  const invalidate = () => {
    fetchedAt = 0;
  };
  void sub(EVT_CLIPBOARD_CHANGED, invalidate);
  void sub(EVT_FOLDER_CHANGED, invalidate);
  void sub(EVT_CONFIG_CHANGED, () => void refreshSources());
  return () => {
    disposed = true;
    cleanups.forEach((fn) => fn());
  };
}
async function openUrl(url, openWith) {
  await invoke("plugin:opener|open_url", {
    url,
    with: openWith
  });
}
function normalize(input) {
  return input.replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/[＋]/g, "+").replace(/[－]/g, "-").replace(/[×]/g, "*").replace(/[÷]/g, "/").replace(/[＝]/g, "=").replace(/[，]/g, ",").replace(/[．]/g, ".").replace(/[％]/g, "%").replace(/[＿]/g, "_").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248));
}
const FUNCTIONS = /* @__PURE__ */ new Set([
  "abs",
  "sqrt",
  "cbrt",
  "round",
  "floor",
  "ceil",
  "sign",
  "pow",
  "min",
  "max",
  "log",
  "log2",
  "log10",
  "exp",
  "sin",
  "cos",
  "tan"
]);
const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2
};
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "	") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      if (j < src.length && /[eE]/.test(src[j])) {
        let k = j + 1;
        if (k < src.length && /[+-]/.test(src[k])) k++;
        if (k < src.length && /[0-9]/.test(src[k])) {
          while (k < src.length && /[0-9._]/.test(src[k])) k++;
          j = k;
        }
      }
      const raw = src.slice(i, j).replace(/_/g, "");
      const v = Number(raw);
      if (!Number.isFinite(v)) return null;
      i = j;
      if (i < src.length && src[i] === "%" && !/[0-9.]/.test(src[i + 1] ?? "")) {
        i++;
        out.push({ t: "num", v: v / 100 });
      } else {
        out.push({ t: "num", v });
      }
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ t: "ident", v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/%^(),!".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    return null;
  }
  return out;
}
function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let acc = 1;
  for (let k = 2; k <= n; k++) acc *= k;
  return acc;
}
function parseExpr(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const eatOp = (...ops) => {
    const t = tokens[pos];
    if (t && t.t === "op" && ops.includes(t.v)) {
      pos++;
      return t.v;
    }
    return null;
  };
  const expect = (op) => {
    const t = peek();
    if (t && t.t === "op" && t.v === op) {
      pos++;
      return true;
    }
    return false;
  };
  function callArgs() {
    if (!expect("(")) return null;
    const args = [];
    if (eatOp(")")) return args;
    for (; ; ) {
      const v2 = additive();
      if (!Number.isFinite(v2)) return null;
      args.push(v2);
      if (eatOp(",")) continue;
      if (expect(")")) return args;
      return null;
    }
  }
  function primary() {
    const t = peek();
    if (!t) return NaN;
    if (t.t === "num") {
      pos++;
      return t.v;
    }
    if (t.t === "ident") {
      pos++;
      if (t.v in CONSTANTS) return CONSTANTS[t.v];
      if (FUNCTIONS.has(t.v)) {
        const args = callArgs();
        if (!args) return NaN;
        switch (t.v) {
          case "abs":
            return Math.abs(args[0]);
          case "sqrt":
            return Math.sqrt(args[0]);
          case "cbrt":
            return Math.cbrt(args[0]);
          case "round":
            return args.length > 1 ? Number(args[0].toFixed(Math.trunc(args[1]))) : Math.round(args[0]);
          case "floor":
            return Math.floor(args[0]);
          case "ceil":
            return Math.ceil(args[0]);
          case "sign":
            return Math.sign(args[0]);
          case "pow":
            return Math.pow(args[0], args[1]);
          case "min":
            return Math.min(...args);
          case "max":
            return Math.max(...args);
          case "log":
            return Math.log(args[0]);
          case "log2":
            return Math.log2(args[0]);
          case "log10":
            return Math.log10(args[0]);
          case "exp":
            return Math.exp(args[0]);
          case "sin":
            return Math.sin(args[0]);
          case "cos":
            return Math.cos(args[0]);
          case "tan":
            return Math.tan(args[0]);
          default:
            return NaN;
        }
      }
      return NaN;
    }
    if (t.t === "op" && t.v === "(") {
      pos++;
      const v2 = additive();
      if (!expect(")")) return NaN;
      return v2;
    }
    return NaN;
  }
  function postfix() {
    let v2 = primary();
    while (eatOp("!")) v2 = factorial(v2);
    return v2;
  }
  function unary() {
    const op = eatOp("+", "-");
    if (op === "-") return -unary();
    if (op === "+") return unary();
    return postfix();
  }
  function power() {
    const base2 = unary();
    return eatOp("^") ? Math.pow(base2, power()) : base2;
  }
  function multiplicative() {
    let v2 = power();
    for (; ; ) {
      const op = eatOp("*", "/", "%");
      if (!op) {
        const t = peek();
        if (t && (t.t === "num" || t.t === "op" && t.v === "(" || t.t === "ident")) {
          const rhs2 = power();
          if (!Number.isFinite(rhs2)) return NaN;
          v2 *= rhs2;
          continue;
        }
        return v2;
      }
      const rhs = power();
      if (!Number.isFinite(rhs)) return NaN;
      if (op === "*") v2 *= rhs;
      else if (op === "/") v2 /= rhs;
      else v2 %= rhs;
    }
  }
  function additive() {
    let v2 = multiplicative();
    for (; ; ) {
      const op = eatOp("+", "-");
      if (!op) return v2;
      const rhs = multiplicative();
      if (!Number.isFinite(rhs)) return NaN;
      v2 = op === "+" ? v2 + rhs : v2 - rhs;
    }
  }
  const v = additive();
  if (pos !== tokens.length) return NaN;
  return v;
}
function formatNumber(n, grouped = false) {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.abs(n) < 1e15 ? Number(n.toPrecision(12)) : n;
  const plain = Object.is(rounded, -0) ? "0" : String(rounded);
  if (!grouped || !/^-?\d+$/.test(plain)) return plain;
  const [int, sign] = plain.startsWith("-") ? [plain.slice(1), "-"] : [plain, ""];
  return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function tryMath(input) {
  const src = normalize(input).trim();
  if (!/\d/.test(src) || /[><=]/.test(src)) return null;
  const tokens = tokenize(src);
  if (!tokens || !tokens.some((t) => t.t !== "num")) return null;
  if (tokens.length < 2 && !/%$/.test(src)) return null;
  const value = parseExpr(tokens);
  if (!Number.isFinite(value)) return null;
  const plain = formatNumber(value);
  return {
    label: formatNumber(value, true),
    value: plain,
    hint: `${src} =`
  };
}
function tryRadix(input) {
  const src = normalize(input).trim().toLowerCase().replace(/\s+/g, " ");
  let value = null;
  let first = "hex";
  const pref = /^0(x[0-9a-f]+|b[01]+|o[0-7]+)$/.exec(src);
  if (pref) {
    const kind = pref[1][0];
    value = parseInt(pref[1].slice(1), kind === "x" ? 16 : kind === "b" ? 2 : 8);
  } else {
    const arrow = /^(\d+)\s*(?:->|=>|→|to)\s*(bin|hex|oct|dec|b|h|o|d|x)$/.exec(src);
    const named = /^(bin|oct|dec|hex)\s+([0-9a-f]+)$/.exec(src);
    if (arrow) {
      value = parseInt(arrow[1], 10);
      first = shortBase(arrow[2]);
    } else if (named) {
      const base2 = named[1] === "hex" ? 16 : named[1] === "bin" ? 2 : named[1] === "oct" ? 8 : 10;
      value = parseInt(named[2], base2);
      first = shortBase(named[1]);
    }
  }
  if (value === null || !Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  const dec = String(value);
  const rows = {
    hex: { label: `0x${value.toString(16)}`, value: value.toString(16), hint: `${src} · 十六进制 · 十进制 ${dec}` },
    dec: { label: dec, value: dec, hint: `${src} · 十进制` },
    bin: { label: `0b${value.toString(2)}`, value: value.toString(2), hint: `${src} · 二进制` },
    oct: { label: `0o${value.toString(8)}`, value: value.toString(8), hint: `${src} · 八进制` }
  };
  const order = ["hex", "dec", "bin", "oct"].filter((k) => k !== first);
  return [rows[first], ...order.map((k) => rows[k])];
}
function shortBase(name) {
  if (name === "hex" || name === "h" || name === "x") return "hex";
  if (name === "bin" || name === "b") return "bin";
  if (name === "oct" || name === "o") return "oct";
  return "dec";
}
const DEC_UNITS = [
  { unit: "B", bytes: 1 },
  { unit: "KB", bytes: 1e3 },
  { unit: "MB", bytes: 1e6 },
  { unit: "GB", bytes: 1e9 },
  { unit: "TB", bytes: 1e12 },
  { unit: "PB", bytes: 1e15 }
];
const BIN_UNITS = [
  { unit: "KiB", bytes: 1024 ** 1 },
  { unit: "MiB", bytes: 1024 ** 2 },
  { unit: "GiB", bytes: 1024 ** 3 },
  { unit: "TiB", bytes: 1024 ** 4 },
  { unit: "PiB", bytes: 1024 ** 5 }
];
function pickUnit(bytes, units, avoid) {
  let idx = 0;
  units.forEach((u, i) => {
    if (bytes / u.bytes >= 1) idx = i;
  });
  if (units[idx].unit !== avoid) return units[idx];
  const up = idx + 1 < units.length ? idx + 1 : -1;
  if (up >= 0 && bytes / units[up].bytes >= 0.01) return units[up];
  return idx > 0 ? units[idx - 1] : null;
}
function tryStorage(input) {
  const src = normalize(input).trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*(kib|mib|gib|tib|pib|kb|mb|gb|tb|pb|b)\b$/.exec(src);
  if (!m) return null;
  const n = Number(m[1]);
  const suffix = m[2];
  const table = suffix.endsWith("ib") ? BIN_UNITS : DEC_UNITS;
  const unit = table.find((u) => u.unit.toLowerCase() === suffix);
  if (!unit) return null;
  const bytes = n * unit.bytes;
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const src0 = input.trim();
  const out = [];
  for (const chain of [
    { units: DEC_UNITS, label: "十进制" },
    { units: BIN_UNITS, label: "二进制" }
  ]) {
    const u = pickUnit(bytes, chain.units, unit.unit);
    if (!u) continue;
    out.push({
      label: `${formatNumber(bytes / u.bytes, true)} ${u.unit}`,
      value: `${formatNumber(bytes / u.bytes)}${u.unit}`,
      hint: `${src0} · ${chain.label}`
    });
  }
  if (unit.unit !== "B") {
    out.push({
      label: `${formatNumber(bytes, true)} B`,
      value: String(Math.round(bytes)),
      hint: `${src0} · 字节`
    });
  }
  return out.length ? out : null;
}
function tryTemperature(input) {
  const src = normalize(input).trim().toLowerCase().replace(/[°º]/g, "").replace(
    /(摄氏度|华氏度|绝对温度|开尔文)/g,
    (s) => s === "华氏度" ? "f" : s === "摄氏度" ? "c" : "k"
  ).replace(/(\s*(->|=>|→|to)\s*[cfk]\s*)$/g, "").replace(/\s+/g, "");
  const m = /^(-?\d+(?:\.\d+)?)(c|f|k)$/.exec(src);
  if (!m) return null;
  const n = Number(m[1]);
  const from = m[2];
  const celsius = from === "c" ? n : from === "f" ? (n - 32) * 5 / 9 : n - 273.15;
  const rows = [
    ["c", celsius],
    ["f", celsius * 9 / 5 + 32],
    ["k", celsius + 273.15]
  ];
  const src0 = input.trim();
  const out = rows.filter(([u]) => u !== from).filter(([, v]) => Number.isFinite(v)).map(([u, v]) => ({
    label: `${formatNumber(v)} °${u.toUpperCase()}`,
    value: formatNumber(v),
    hint: `${src0} → ${u === "c" ? "摄氏" : u === "f" ? "华氏" : "开尔文"}`
  }));
  return out.length ? out : null;
}
const GROUP = KIND_LABEL.tool;
function resultRow(id, res, icon, extra) {
  return {
    id: `tool-${id}`,
    kind: "tool",
    group: GROUP,
    title: res.label,
    subtitle: res.hint,
    icon,
    copy: res.value,
    perform: () => {
      hideCurrentWindow();
      return pasteText(res.value);
    },
    ...extra
  };
}
const TLDS = /* @__PURE__ */ new Set([
  "com",
  "cn",
  "net",
  "org",
  "io",
  "dev",
  "app",
  "co",
  "me",
  "cc",
  "top",
  "vip",
  "gov",
  "edu",
  "xyz",
  "shop",
  "tech",
  "cloud",
  "ai",
  "sh",
  "so",
  "gg",
  "info",
  "wiki",
  "live",
  "link",
  "run",
  "studio",
  "tv",
  "uk",
  "jp",
  "kr",
  "de",
  "fr"
]);
function asUrl(raw) {
  const s = raw.trim();
  if (/\s/.test(s)) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const m = /^([\w-]+(\.[\w-]+)+)(\/[^\s]*)?$/.exec(s);
  if (!m) return null;
  const host = m[1];
  const tld = host.split(".").pop()?.toLowerCase() ?? "";
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  if (!isIp && !TLDS.has(tld)) return null;
  return `https://${s}`;
}
function asPath(raw) {
  const s = raw.trim();
  if (/^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s) || /^[~.]?[\\/]/.test(s)) return s;
  return null;
}
function openLocation(path) {
  return openFolder(path).catch(() => quickfilesOpen(path));
}
const GENERIC_KEYS = /* @__PURE__ */ new Set(["b64-encode", "url-encode"]);
function textConversions(raw) {
  const spec = detectActions(raw);
  if (!spec.length) return [];
  const specific = spec.filter((a) => !GENERIC_KEYS.has(a.key));
  const generic = spec.filter((a) => GENERIC_KEYS.has(a.key));
  const showGeneric = specific.length === 0 && !/\s/.test(raw) && raw.length >= 8;
  const list = [...specific, ...showGeneric ? generic : []];
  return list.map((a) => {
    let out = "";
    try {
      out = a.run(raw);
    } catch {
      return null;
    }
    if (!out) return null;
    const first = out.split("\n")[0];
    return { label: first.slice(0, 120), value: out, hint: `${a.label} · ${out.length} 字符` };
  }).filter((r) => !!r && r.value !== raw.trim());
}
function buildToolItems(raw, ctx) {
  const items = [];
  const input = raw.trim();
  if (!input) return { items, matched: false };
  const url = asUrl(input);
  if (url) {
    items.push({
      id: "tool-open-url",
      kind: "tool",
      group: GROUP,
      title: `打开 ${new URL(url).host}${new URL(url).pathname === "/" ? "" : new URL(url).pathname}`,
      subtitle: url,
      icon: IconExternal,
      copy: url,
      perform: () => {
        hideCurrentWindow();
        return openUrl(url);
      }
    });
    return { items, matched: true };
  }
  const path = asPath(input);
  if (path) {
    items.push({
      id: "tool-open-path",
      kind: "tool",
      group: GROUP,
      title: "打开此位置",
      subtitle: path,
      icon: IconFolder,
      copy: path,
      perform: async () => {
        await openLocation(path);
        hideCurrentWindow();
      }
    });
    items.push({
      id: "tool-reveal-path",
      kind: "tool",
      group: GROUP,
      title: "在资源管理器中定位",
      subtitle: path,
      icon: IconLocate,
      copy: path,
      perform: async () => {
        await quickfilesReveal(path);
        hideCurrentWindow();
      }
    });
    return { items, matched: true };
  }
  const math = tryMath(input);
  if (math) items.push(resultRow("math", math, IconWand));
  const radix = tryRadix(input);
  if (radix) items.push(...radix.map((r) => resultRow(`radix-${r.label}`, r, IconCode)));
  const storage = tryStorage(input);
  if (storage) items.push(...storage.map((r) => resultRow(`stor-${r.label}`, r, IconWand)));
  const temp = tryTemperature(input);
  if (temp) items.push(...temp.map((r) => resultRow(`temp-${r.label}`, r, IconWand)));
  if (/^\d{10}$|^\d{13}$/.test(input)) {
    const ts = formatTimestamp(input);
    if (ts) {
      items.push(
        resultRow("ts", { label: ts, value: ts, hint: `时间戳 ${input} → 本地时间` }, IconText)
      );
    }
  }
  if (!items.length) {
    textConversions(input).forEach((r, i) => items.push(resultRow(`txt-${i}`, r, IconWand)));
  }
  if (items.length) return { items, matched: true };
  if (ctx.translation && ctx.config.translator.enabled) {
    const st = ctx.translation;
    if (st.loading) {
      items.push({
        id: "tool-translating",
        kind: "tool",
        group: GROUP,
        title: "翻译中…",
        icon: IconTranslate,
        loading: true,
        perform: () => void 0
      });
    } else if (st.result) {
      items.push(
        resultRow(
          "translate",
          { label: st.result, value: st.result, hint: `翻译 ${input.slice(0, 24)}` },
          IconTranslate
        )
      );
    } else if (st.error) {
      const needConfig = /未配置/.test(st.error);
      items.push({
        id: "tool-translate-error",
        kind: "tool",
        group: GROUP,
        title: needConfig ? "配置翻译服务后重试" : st.error.slice(0, 80),
        subtitle: st.error,
        icon: IconTranslate,
        perform: needConfig ? () => {
          hideCurrentWindow();
          return panelToggle("settings");
        } : () => void 0
      });
    }
    return { items, matched: items.length > 0 };
  }
  return { items, matched: false };
}
function shouldTranslate(raw, config) {
  const input = raw.trim();
  if (!config.translator.enabled || input.length < 2 || input.length > 200) return false;
  if (/^[a-z0-9]{1,3}$/i.test(input)) return false;
  if (/\d/.test(input) && /[+\-*/%^]/.test(input)) return false;
  if (/^[0-9a-fA-FxXoObB._\s-]+$/.test(input)) return false;
  return !asUrl(input) && !asPath(input);
}
const ENGINES = [
  { name: "百度", build: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  { name: "必应", build: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { name: "Google", build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { name: "GitHub", build: (q) => `https://github.com/search?q=${encodeURIComponent(q)}` }
];
function buildWebItems(raw) {
  const input = raw.trim();
  if (!input) return [];
  return ENGINES.map((e) => ({
    id: `web-${e.name}`,
    kind: "web",
    group: KIND_LABEL.web,
    title: `${e.name}搜索「${input.slice(0, 40)}」`,
    icon: IconSearch,
    copy: e.build(input),
    perform: () => {
      hideCurrentWindow();
      return openUrl(e.build(input));
    }
  }));
}
const hide = () => hideCurrentWindow();
const PER_GROUP = 8;
const TOTAL = 60;
function probe(title, extra = {}) {
  return {
    id: "",
    kind: "command",
    title,
    group: "",
    icon: IconText,
    perform: () => void 0,
    ...extra
  };
}
function setTheme(mode) {
  const { config, update } = useConfigStore.getState();
  void update({ ...config, general: { ...config.general, theme: mode } });
}
const THEME_LABELS = {
  system: { label: "跟随系统", keywords: "theme system auto", initials: "xt gxx" },
  light: { label: "浅色", keywords: "theme light white", initials: "qs" },
  dark: { label: "深色", keywords: "theme dark black", initials: "ss" },
  mint: { label: "浅青 mint", keywords: "theme mint", initials: "qq" },
  skyblue: { label: "浅蓝 skyblue", keywords: "theme skyblue blue", initials: "ql" },
  red: { label: "红色 red", keywords: "theme red", initials: "hs" },
  orange: { label: "橙色 orange", keywords: "theme orange", initials: "cz" }
};
function buildStaticCommands(config) {
  const items = [];
  const sc = config.shortcuts;
  const panel = (id, short, title, keywords, initials, icon, enabled, hotkey) => {
    if (!enabled) return;
    items.push({
      id,
      kind: "command",
      title,
      group: KIND_LABEL.command,
      tag: "面板",
      keywords,
      initials,
      hotkey,
      icon,
      perform: () => {
        hide();
        void panelToggle(short);
      }
    });
  };
  panel("panel-clipboard", "clipboard", "打开剪贴板面板", "clipboard 剪贴 历史", "jtb jiantieban", IconClipboard, config.clipboard.enabled, sc.clipboard);
  panel("panel-folder", "folder", "打开文件夹面板", "folder 目录", "wj wjj", IconFolder, config.folder.enabled, sc.folder);
  panel("panel-credentials", "credentials", "打开账号密码面板", "credentials password 密码 凭证", "zhmm mm", IconLock, config.credentials.enabled, sc.credentials);
  panel("panel-translation", "translation", "划词翻译", "translate 翻译", "hcfy fy", IconTranslate, config.translator.enabled, sc.translation);
  panel("panel-port", "port", "打开端口工具面板", "port 端口 杀进程", "dkgj dk", IconPort, config.port.enabled, sc.port);
  panel("panel-files", "files", "打开快速文件面板", "quickfiles 文件", "kfwj", IconFiles, config.files.enabled, sc.files);
  panel("panel-snippets", "snippets", "打开语速贴面板", "snippets 常用语 速贴", "yst", IconSnippet, config.snippets.enabled, sc.snippets);
  const action = (id, title, keywords, initials, icon, perform, hotkey) => {
    items.push({
      id,
      kind: "command",
      title,
      group: KIND_LABEL.command,
      tag: "动作",
      keywords,
      initials,
      hotkey,
      icon,
      perform
    });
  };
  if (config.shot.enabled) {
    action("action-screenshot", "开始截图", "screenshot capture 截图", "jt ksjt", IconScreenshot, () => {
      hide();
      void panelToggle("screenshot");
    }, sc.screenshot);
    action("action-picker", "屏幕取色", "picker color 取色 颜色", "qs pmqs", IconKey, () => {
      hide();
      void shotBeginPicker();
    }, sc.picker);
    action("pins-show", "显示全部贴图", "pin show 贴图 显示", "xsqbt", IconImage, () => {
      hide();
      void pinShowAll();
    });
    action("pins-hide", "隐藏全部贴图", "pin hide 贴图 隐藏 关闭", "ycqbt", IconPin, () => {
      hide();
      void pinHideAll();
    }, sc.pins_close);
  }
  if (config.recorder.enabled) {
    action("action-recorder", "录制屏幕 GIF", "record gif 录屏 录制", "lzpm lp", IconRecord, () => {
      hide();
      void panelToggle("recorder");
    }, sc.recorder);
  }
  action("open-settings", "打开设置", "settings options 设置", "sz dksz", IconSettings, () => {
    hide();
    void panelToggle("settings");
  });
  const toolbarOn = config.toolbar.enabled !== false;
  action(
    "toggle-toolbar",
    toolbarOn ? "隐藏悬浮工具栏" : "显示悬浮工具栏",
    "toolbar 工具栏",
    "gjl xs",
    IconGrid,
    () => {
      const next = !toolbarOn;
      const { config: cur, update } = useConfigStore.getState();
      void update({ ...cur, toolbar: { ...cur.toolbar, enabled: next } });
      void setToolbarVisible(next);
      hide();
    }
  );
  for (const mode of Object.keys(THEME_LABELS)) {
    const { label, keywords, initials } = THEME_LABELS[mode];
    items.push({
      id: `theme-${mode}`,
      kind: "command",
      title: `切换主题：${label}`,
      group: KIND_LABEL.command,
      tag: "外观",
      keywords,
      initials,
      icon: IconPalette,
      perform: () => setTheme(mode)
      // 保持面板打开，方便连续试主题
    });
  }
  return items;
}
const CLIP_KIND_LABEL = {
  text: "文本",
  richtext: "富文本",
  link: "链接",
  image: "图片",
  files: "文件"
};
function clipIcon(kind) {
  switch (kind) {
    case "image":
      return IconImage;
    case "link":
      return IconLink;
    case "files":
      return IconFiles;
    case "richtext":
      return IconRichText;
    default:
      return IconText;
  }
}
const CODE_EXTS = ["ts", "tsx", "js", "jsx", "json", "py", "rs", "go", "java", "css", "html", "yaml", "yml"];
function clipTitle(e) {
  return (e.preview || e.text || "（图片）").split("\n")[0].slice(0, 90);
}
function dataItems(q, config, src) {
  const keep = (p) => !q || scoreItem(q, p) > 0;
  const out = [];
  if (config.clipboard.enabled) {
    for (const e of src.clips) {
      if (e.consumed) continue;
      const item = {
        id: e.id,
        kind: "clip",
        title: clipTitle(e),
        subtitle: `${CLIP_KIND_LABEL[e.kind]} · ${relativeTime(e.created_at)}`,
        group: KIND_LABEL.clip,
        keywords: `clipboard ${CLIP_KIND_LABEL[e.kind]} ${e.source_app ?? ""}`,
        icon: clipIcon(e.kind),
        // 仅文本/链接支持 Ctrl+Enter 单独复制（图片/文件由 Enter 写回剪贴板）
        copy: e.kind === "text" || e.kind === "link" ? e.text ?? "" : void 0,
        perform: () => {
          hide();
          return pasteEntry(e.id);
        }
      };
      if (keep(probe(item.title, { subtitle: e.text ?? "", keywords: item.keywords }))) out.push(item);
    }
  }
  if (config.credentials.enabled) {
    for (const c of src.creds) {
      if (keep(probe(c.label, { subtitle: `${c.account} ${c.note ?? ""}`, keywords: "credential account 账号" }))) {
        out.push({
          id: `acct-${c.id}`,
          kind: "credential",
          title: `${c.label} · 账号`,
          subtitle: c.account,
          group: KIND_LABEL.credential,
          keywords: "credential account 账号",
          icon: IconCopy,
          copy: c.account,
          perform: () => {
            hide();
            return copyText(c.account);
          }
        });
      }
      if (keep(probe(c.label, { keywords: "credential password 密码" }))) {
        out.push({
          id: `pwd-${c.id}`,
          kind: "credential",
          title: `${c.label} · 密码`,
          subtitle: "复制到剪贴板，不注入粘贴",
          group: KIND_LABEL.credential,
          keywords: "credential password 密码",
          icon: IconKey,
          perform: () => {
            hide();
            return copyText(c.password);
          }
        });
      }
    }
  }
  if (config.snippets.enabled) {
    for (const s of src.snippets) {
      const keywords = `snippet 常用语 ${s.group}`;
      if (!keep(probe(s.title, { subtitle: s.content, keywords }))) continue;
      out.push({
        id: s.id,
        kind: "snippet",
        title: s.title,
        subtitle: (s.content || "（空内容）").split("\n")[0].slice(0, 90),
        group: KIND_LABEL.snippet,
        tag: s.group || void 0,
        keywords,
        icon: IconSnippet,
        copy: s.content,
        perform: () => {
          hide();
          return snippetsPaste(s.id);
        }
      });
    }
  }
  if (config.folder.enabled) {
    for (const f of src.folders) {
      if (!keep(probe(f.name, { subtitle: f.path, keywords: "folder 目录 打开" }))) continue;
      out.push({
        id: f.id,
        kind: "folder",
        title: f.name,
        subtitle: f.path,
        group: KIND_LABEL.folder,
        keywords: "folder 目录 打开",
        icon: IconFolder,
        copy: f.path,
        perform: () => {
          hide();
          return openFolder(f.path);
        }
      });
    }
  }
  if (config.files.enabled) {
    for (const f of src.files) {
      if (!keep(probe(f.name, { subtitle: f.path, keywords: `quickfile ${f.ext}` }))) continue;
      out.push(qfileItem(f.path, f.name, src.filesLocation));
    }
  }
  return out;
}
function qfileItem(path, name, location2) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return {
    id: path,
    kind: "qfile",
    title: name,
    subtitle: location2 || path,
    group: KIND_LABEL.qfile,
    keywords: `quickfile ${ext}`,
    icon: CODE_EXTS.includes(ext) ? IconCode : IconText,
    copy: path,
    perform: () => {
      hide();
      return quickfilesOpen(path);
    }
  };
}
function appItem(app) {
  return {
    id: app.exe,
    kind: "app",
    title: app.name,
    subtitle: app.exe,
    group: KIND_LABEL.app,
    tag: app.kind === "editor" ? "编辑器" : app.kind === "browser" ? "浏览器" : void 0,
    keywords: "app 应用 启动 软件",
    icon: IconGrid,
    imageUrl: app.icon ?? void 0,
    copy: app.exe,
    perform: () => {
      hide();
      return launchApp(app.exe);
    }
  };
}
async function queryItems(rawQuery, ctx) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const { config, translation } = ctx;
  const tools = buildToolItems(rawQuery, { config, translation });
  const src = await sourcesForSearch();
  const pool = [
    ...buildStaticCommands(config),
    ...dataItems(q, config, src),
    ...peekApps()?.map(appItem) ?? []
  ];
  const scored = pool.map((item) => ({
    item,
    score: scoreItem(q, item),
    usage: usageBonus(statOf(statKey(item)))
  })).filter((s) => s.score > 0).sort(compareScored);
  const tail = tools.matched ? [] : buildWebItems(rawQuery);
  const strongHit = (scored[0]?.score ?? 0) >= 70;
  const toolItems = strongHit ? tools.items.filter((i) => !i.id.startsWith("tool-transl")) : tools.items;
  return [...cap(toolItems), ...cap(scored.map((s) => s.item)), ...tail];
}
function cap(items) {
  const perGroup = /* @__PURE__ */ new Map();
  const out = [];
  for (const i of items) {
    const used = perGroup.get(i.group) ?? 0;
    if (used >= PER_GROUP) continue;
    perGroup.set(i.group, used + 1);
    out.push(i);
    if (out.length >= TOTAL) break;
  }
  return out;
}
async function emptyStateItems(config) {
  if (!statsReady()) await refreshStats();
  const stats2 = allStats();
  const statics = buildStaticCommands(config);
  if (!stats2.size) return statics;
  const [src, apps2] = await Promise.all([sourcesForSearch(), Promise.resolve(peekApps())]);
  const pool = /* @__PURE__ */ new Map();
  const put = (i) => pool.set(statKey(i), i);
  for (const i of statics) put(i);
  for (const i of dataItems("", config, src)) put(i);
  for (const a of apps2 ?? []) put(appItem(a));
  const resolve = (key) => {
    const found = pool.get(key);
    if (found) return found;
    if (key.startsWith("qfile:")) {
      const path = key.slice("qfile:".length);
      return qfileItem(path, path.split(/[\\/]/).pop() ?? path, src.filesLocation);
    }
    return null;
  };
  const out = [];
  const taken = /* @__PURE__ */ new Set();
  const take = (keys, group) => {
    for (const key of keys) {
      if (out.filter((i) => i.group === group).length >= PER_GROUP) break;
      if (taken.has(key)) continue;
      const item = resolve(key);
      if (!item) continue;
      taken.add(key);
      out.push({ ...item, group });
    }
  };
  const byRecency = [...stats2.values()].sort((a, b) => b.last_used - a.last_used).map((s) => s.key);
  const byFrequency = [...stats2.values()].sort((a, b) => b.count - a.count || b.last_used - a.last_used).map((s) => s.key);
  take(byRecency, "最近使用");
  take(byFrequency, "常用");
  for (const i of statics) {
    if (out.length >= TOTAL) break;
    if (taken.has(statKey(i))) continue;
    out.push(i);
  }
  return out;
}
const NO_STATS = /* @__PURE__ */ new Set(["tool", "web"]);
const TRANSLATE_DEBOUNCE = 550;
function CommandPalette() {
  const config = useConfigStore((s) => s.config);
  usePanelCommon(false);
  useEscLayer(true, hideCurrentWindow);
  const [query, setQuery] = reactExports.useState("");
  const [items, setItems] = reactExports.useState([]);
  const [active, setActive] = reactExports.useState(0);
  const [searching, setSearching] = reactExports.useState(false);
  const [translation, setTranslation] = reactExports.useState(null);
  const [error, setError] = reactExports.useState("");
  const [appsReady, setAppsReady] = reactExports.useState(false);
  const inputRef = reactExports.useRef(null);
  const listRef = reactExports.useRef(null);
  const kbNavUntilRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    const unwatch = watchSourceInvalidation();
    installedApps().then(
      () => setAppsReady(true),
      () => setAppsReady(false)
    );
    return unwatch;
  }, []);
  reactExports.useEffect(() => {
    const label = getCurrentWindow().label;
    let un;
    let disposed = false;
    onEvent(EVT_PANEL_VISIBILITY, (p) => {
      if (p.label !== label || !p.visible) return;
      setQuery("");
      setActive(0);
      setError("");
      setTranslation(null);
      void refreshSources();
      void refreshStats();
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }).then((u) => {
      if (disposed) u();
      else un = u;
    });
    return () => {
      disposed = true;
      un?.();
    };
  }, []);
  reactExports.useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q) {
      setSearching(false);
      emptyStateItems(config).then((list) => {
        if (cancelled) return;
        setItems(list);
        setActive(0);
      });
      return () => {
        cancelled = true;
      };
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      queryItems(query, { config, translation }).then(
        (list) => {
          if (cancelled) return;
          setItems(list);
          setActive(0);
          setSearching(false);
        },
        (err) => {
          if (cancelled) return;
          console.error("检索失败：", err);
          setItems([]);
          setSearching(false);
        }
      );
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, config, translation, appsReady]);
  reactExports.useEffect(() => {
    const raw = query.trim();
    if (!shouldTranslate(raw, config)) {
      setTranslation(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTranslation({ loading: true });
      translateText(raw).then((r) => {
        if (!cancelled) setTranslation({ loading: false, result: r.translation });
      }).catch((e) => {
        if (!cancelled) setTranslation({ loading: false, error: String(e) });
      });
    }, TRANSLATE_DEBOUNCE);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, config]);
  reactExports.useEffect(() => {
    listRef.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active, items]);
  const run = reactExports.useCallback(async (item, copyOnly) => {
    if (!item) return;
    try {
      if (copyOnly && item.copy !== void 0) {
        hideCurrentWindow();
        await copyText(item.copy);
      } else {
        await item.perform();
      }
      if (!NO_STATS.has(item.kind)) recordUsage(statKey(item));
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }, []);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        kbNavUntilRef.current = Date.now() + 200;
        setActive((i) => items.length ? (i + 1) % items.length : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        kbNavUntilRef.current = Date.now() + 200;
        setActive((i) => items.length ? (i - 1 + items.length) % items.length : 0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void run(items[active], e.ctrlKey || e.metaKey);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items, active, run]);
  const sections = reactExports.useMemo(
    () => items.map((item, i) => ({
      item,
      /** 与上一条同段则不重复渲染组头 */
      newSection: i === 0 || items[i - 1].group !== item.group
    })),
    [items]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "palette", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "palette-shell", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "palette-input-row", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "palette-search-icon", children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSearch, { size: 16 }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          ref: inputRef,
          className: "palette-input",
          value: query,
          placeholder: "算式 · 0x1f · 500mb · JSON/Base64 · 翻译 · 应用 · 文件…",
          onChange: (e) => setQuery(e.target.value),
          spellCheck: false
        }
      ),
      searching && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "palette-spinner" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "palette-list", ref: listRef, children: [
      items.length === 0 && !searching && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "palette-empty", children: query.trim() ? "没有匹配的命令或内容" : "还没有使用记录，输入即搜索" }),
      sections.map(({ item, newSection }, i) => {
        const Icon2 = item.icon;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "palette-row-wrap", children: [
          newSection && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `palette-section${item.kind === "tool" ? " tool" : ""}`, children: item.group }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: `palette-item${i === active ? " active" : ""}${item.loading ? " loading" : ""}`,
              onMouseEnter: () => {
                if (Date.now() > kbNavUntilRef.current) setActive(i);
              },
              onClick: () => void run(item, false),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "palette-item-icon", children: item.imageUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: item.imageUrl, alt: "", width: 16, height: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Icon2, { size: 15 }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "palette-item-main", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `palette-item-title${item.kind === "tool" ? " result" : ""}`, children: item.title }),
                  item.subtitle && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "palette-item-subtitle", children: item.subtitle })
                ] }),
                i === active && item.copy !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "palette-item-hint", children: "Ctrl+Enter 复制" }),
                item.hotkey && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: item.hotkey }),
                item.tag && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "palette-item-group", children: item.tag })
              ]
            }
          )
        ] }, `${item.kind}-${item.id}-${i}`);
      })
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "palette-error", children: error }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "palette-footer", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "↑" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "↓" }),
        " 选择"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Enter" }),
        " 执行 / 粘贴"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Ctrl+Enter" }),
        " 仅复制"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "kbd", children: "Esc" }),
        " 关闭"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "palette-footer-count", children: items.length ? `${items.length} 条` : "" })
    ] })
  ] }) });
}
function GlassSelect({
  value,
  onChange,
  options,
  title
}) {
  const [open2, setOpen] = reactExports.useState(false);
  const rootRef = reactExports.useRef(null);
  const btnRef = reactExports.useRef(null);
  const popRef = reactExports.useRef(null);
  const [coords, setCoords] = reactExports.useState({
    top: 0,
    left: 0,
    minWidth: 0
  });
  const place = reactExports.useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pop = popRef.current;
    const popH = pop?.offsetHeight ?? 220;
    const popW = pop?.offsetWidth ?? r.width;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.bottom + 4;
    if (top + popH > vh - 8) {
      const up = r.top - 4 - popH;
      top = up >= 8 ? up : Math.max(8, vh - 8 - popH);
    }
    let left = r.left;
    if (left + popW > vw - 8) left = Math.max(8, vw - 8 - popW);
    setCoords({ top, left, minWidth: r.width });
  }, []);
  reactExports.useLayoutEffect(() => {
    if (open2) place();
  }, [open2, place]);
  reactExports.useEffect(() => {
    if (!open2) return;
    const onDocDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = (e) => {
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => place();
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open2, place]);
  const current = options.find((o) => o.value === value);
  let lastGroup;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "glass-select", ref: rootRef, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        ref: btnRef,
        type: "button",
        className: `glass-select-btn${open2 ? " open" : ""}`,
        title,
        onClick: () => setOpen((v) => !v),
        children: [
          current?.icon && /* @__PURE__ */ jsxRuntimeExports.jsx("img", { className: "glass-select-btn-icon", src: current.icon, alt: "", draggable: false }),
          current?.swatch && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "glass-select-swatch", style: { background: current.swatch }, "aria-hidden": true }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "glass-select-label", children: current?.label ?? value }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "glass-select-caret", children: "▾" })
        ]
      }
    ),
    open2 && reactDomExports.createPortal(
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          ref: popRef,
          className: "glass-select-pop",
          style: {
            position: "fixed",
            top: coords.top,
            left: coords.left,
            minWidth: coords.minWidth
          },
          children: options.map((o) => {
            const header = o.group && o.group !== lastGroup ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "glass-select-group", children: o.group }, `g-${o.group}`) : null;
            lastGroup = o.group ?? void 0;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              header,
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  className: `glass-select-opt${o.value === value ? " selected" : ""}${o.disabled ? " disabled" : ""}`,
                  disabled: o.disabled,
                  onClick: () => {
                    onChange(o.value);
                    setOpen(false);
                  },
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "glass-select-opt-label", children: [
                      o.icon && /* @__PURE__ */ jsxRuntimeExports.jsx("img", { className: "glass-select-opt-icon", src: o.icon, alt: "", draggable: false }),
                      o.swatch && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "glass-select-swatch", style: { background: o.swatch }, "aria-hidden": true }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "glass-select-opt-text", children: o.label })
                    ] }),
                    o.value === value && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "glass-select-opt-check", children: "✓" })
                  ]
                }
              )
            ] }, o.value);
          })
        }
      ),
      document.body
    )
  ] });
}
const LANG_OPTIONS = [
  { value: "auto", label: "自动检测" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
  { value: "ja", label: "日文" },
  { value: "ko", label: "韩文" },
  { value: "fr", label: "法文" },
  { value: "de", label: "德文" },
  { value: "ru", label: "俄文" },
  { value: "es", label: "西文" }
];
const EVT_RESULT = "translate://result";
function closePopup() {
  void closeTranslatePopup();
}
function TranslatePopup() {
  const [result, setResult] = reactExports.useState(null);
  const [text, setText] = reactExports.useState("");
  const [dst, setDst] = reactExports.useState("");
  const [fromLang, setFromLang] = reactExports.useState("auto");
  const [toLang, setToLang] = reactExports.useState("zh");
  const fromLangRef = reactExports.useRef("auto");
  fromLangRef.current = fromLang;
  const [busy, setBusy] = reactExports.useState(null);
  const [statusMsg, setStatusMsg] = reactExports.useState("");
  const [statusType, setStatusType] = reactExports.useState("ok");
  const [loading, setLoading] = reactExports.useState(true);
  const inputRef = reactExports.useRef(null);
  const dstRef = reactExports.useRef(null);
  useEscLayer(true, () => {
    const ae = document.activeElement;
    if (ae === inputRef.current || ae === dstRef.current) {
      ae.blur();
      return;
    }
    closePopup();
  });
  const loadingRef = reactExports.useRef(true);
  const dragGuardRef = reactExports.useRef(false);
  const lastStartAt = reactExports.useRef(0);
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const alwaysOnTop = config.translator?.always_on_top ?? false;
  const alwaysOnTopRef = reactExports.useRef(alwaysOnTop);
  alwaysOnTopRef.current = alwaysOnTop;
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      translator: { ...config.translator, always_on_top: !alwaysOnTop }
    });
  };
  const statusTimerRef = reactExports.useRef(null);
  const flashStatus = (msg, type = "ok") => {
    setStatusType(type);
    setStatusMsg(msg);
    if (statusTimerRef.current != null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => setStatusMsg(""), 2e3);
  };
  reactExports.useEffect(
    () => () => {
      if (statusTimerRef.current != null) window.clearTimeout(statusTimerRef.current);
    },
    []
  );
  const applyResult = (r) => {
    if (r.text) setText(r.text);
    if (!r.translation) {
      setResult(null);
      return;
    }
    setDst(r.translation);
    setResult(r);
    loadingRef.current = false;
    setLoading(false);
  };
  reactExports.useEffect(() => {
    void diagLog("TranslatePopup mounted");
    void lastTranslateResult().then((r) => {
      if (r) applyResult(r);
      else {
        loadingRef.current = false;
        setLoading(false);
      }
    });
    const cleanup = [];
    let disposed = false;
    onEvent(EVT_RESULT, applyResult).then(
      (un) => disposed ? un() : cleanup.push(un)
    );
    onEvent("translate://start", (p) => {
      const t = p?.text ?? "";
      setText(t);
      setDst("");
      setResult(null);
      lastStartAt.current = Date.now();
      if (t.trim()) {
        if (fromLangRef.current === "auto") {
          setToLang(smartTarget(t));
        }
        loadingRef.current = true;
        setLoading(true);
        window.setTimeout(() => {
          if (loadingRef.current) {
            loadingRef.current = false;
            setLoading(false);
          }
        }, 14e3);
      } else {
        loadingRef.current = false;
        setLoading(false);
      }
    }).then((un) => disposed ? un() : cleanup.push(un));
    let wasFocused = false;
    const focusUn = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      const prev = wasFocused;
      wasFocused = focused;
      if (!prev || focused) return;
      const sinceStart = Date.now() - lastStartAt.current;
      if (dragGuardRef.current || sinceStart < 1e3) return;
      if (alwaysOnTopRef.current) return;
      window.setTimeout(() => {
        void getAllWindows().then((wins) => Promise.all(wins.map((w) => w.isFocused()))).then((states) => {
          if (!states.some(Boolean)) {
            void diagLog("translate hide: focus left app");
            void closeTranslatePopup();
          }
        }).catch(() => {
          void diagLog("translate hide: focus lost to other window");
          void closeTranslatePopup();
        });
      }, 80);
    });
    cleanup.push(() => focusUn.then((u) => u()));
    const requestFocus = () => {
      if (!document.hasFocus()) {
        getCurrentWindow().setFocus().catch(() => void 0);
      }
    };
    const onMouseDown = (e) => {
      const t = e.target;
      if (t?.closest?.(".translate-head")) {
        dragGuardRef.current = true;
        return;
      }
      requestFocus();
    };
    document.addEventListener("mouseover", requestFocus);
    document.addEventListener("mousedown", onMouseDown);
    cleanup.push(() => document.removeEventListener("mouseover", requestFocus));
    cleanup.push(() => document.removeEventListener("mousedown", onMouseDown));
    const onDocMouseUp = () => {
      window.setTimeout(() => {
        dragGuardRef.current = false;
      }, 250);
    };
    document.addEventListener("mouseup", onDocMouseUp);
    cleanup.push(() => document.removeEventListener("mouseup", onDocMouseUp));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, []);
  const smartTarget = (t) => /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(t) ? "en" : "zh";
  const doTranslate = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy("dst");
    try {
      const target = fromLang === "auto" ? smartTarget(t) : toLang;
      const r = await translateText(t, fromLang, target);
      setDst(r.translation);
      setResult(r);
      if (fromLang === "auto") setToLang(target);
    } catch (err) {
      flashStatus("翻译失败，请检查网络或服务商配置", "err");
    } finally {
      setBusy(null);
    }
  };
  const doReverse = async () => {
    const t = dst.trim();
    if (!t) return;
    setBusy("src");
    try {
      const target = fromLang !== "auto" ? fromLang : result?.from || "zh";
      const r = await translateText(t, toLang, target);
      setText(r.translation);
      setResult({ ...r, text: t, from: toLang, to: target });
    } catch (err) {
      flashStatus("反向翻译失败，请检查网络或服务商配置", "err");
    } finally {
      setBusy(null);
    }
  };
  const doCopy = async () => {
    if (!dst.trim()) return;
    try {
      await copyText(dst);
      flashStatus("已复制");
    } catch (err) {
      console.error("复制译文失败", err);
    }
  };
  const doCopySrc = async () => {
    if (!text.trim()) return;
    try {
      await copyText(text);
      flashStatus("已复制原文");
    } catch (err) {
      console.error("复制原文失败", err);
    }
  };
  const swapLangs = () => {
    const f = fromLang;
    const t = toLang;
    setFromLang(t);
    setToLang(f === "auto" ? result?.from || "zh" : f);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "panel", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "panel-shell translate-shell", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "translate-head",
        onMouseDown: (e) => {
          const t = e.target;
          if (t.closest("button, select, input, textarea")) return;
          dragGuardRef.current = true;
          getCurrentWindow().startDragging().catch(() => void 0);
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "translate-title", children: "翻译" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "translate-langs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              GlassSelect,
              {
                value: fromLang,
                onChange: setFromLang,
                title: "源语言",
                options: LANG_OPTIONS.map((l) => ({
                  value: l.value,
                  label: l.value === "auto" ? "自动检测" : l.label
                }))
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "lang-swap",
                title: "交换源/目标语言",
                onClick: swapLangs,
                children: "⇄"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              GlassSelect,
              {
                value: toLang,
                onChange: setToLang,
                title: "目标语言",
                options: LANG_OPTIONS.filter((l) => l.value !== "auto").map((l) => ({
                  value: l.value,
                  label: l.label
                }))
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: `translate-btn${!text.trim() && !busy ? " empty" : ""}`,
              disabled: busy != null || !text.trim(),
              onClick: () => void doTranslate(),
              children: busy === "src" ? "反向中…" : busy ? "翻译中…" : "翻译"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: `icon-btn translate-pin${alwaysOnTop ? " active" : ""}`,
              title: alwaysOnTop ? "取消置顶（失焦自动隐藏）" : "置顶常驻（失焦不隐藏）",
              onClick: toggleAlwaysOnTop,
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPin, { size: 13, filled: alwaysOnTop })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "icon-btn translate-close",
              title: "关闭（Esc）",
              onClick: () => {
                void diagLog("close click");
                closePopup();
              },
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClose, { size: 13 })
            }
          )
        ]
      }
    ),
    busy === "src" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "translate-src-hint", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "translate-hint-spin" }),
      "反向翻译中…"
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "translate-src-wrap", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          ref: inputRef,
          className: "translate-src",
          value: text,
          placeholder: "输入或粘贴要翻译的内容…（Enter 翻译）",
          onChange: (e) => setText(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) void doTranslate();
            }
          }
        }
      ),
      text.trim() && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "icon-btn translate-src-copy",
          title: "复制原文",
          onClick: () => void doCopySrc(),
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCopy, { size: 13 })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "translate-dst", children: [
      loading || busy === "dst" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "translate-dst-hint", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "translate-hint-spin" }),
        "翻译中…"
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          ref: dstRef,
          className: "translate-dst-input",
          value: dst,
          placeholder: "译文，可编辑…（Enter 反向翻译）",
          onChange: (e) => setDst(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void doReverse();
            }
          }
        }
      ),
      busy !== "dst" && !loading && dst.trim() && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "icon-btn translate-dst-copy",
          title: "复制译文",
          onClick: () => void doCopy(),
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconCopy, { size: 14 })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "translate-bar", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `translate-status ${statusMsg ? statusType : ""}`, children: [
      statusMsg ? statusType === "ok" && /* @__PURE__ */ jsxRuntimeExports.jsx(IconCheck, { size: 12 }) : null,
      statusMsg || "Enter 翻译 · 译文框 Enter 反向 · Esc 关闭"
    ] }) })
  ] }) });
}
function SettingGroup({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group", children });
}
function SettingRow({ title, desc, children, layout = "row" }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `setting-row${layout === "block" ? " block" : ""}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setting-info", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-title", children: title }),
      desc && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-desc", children: desc })
    ] }),
    children && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-control", children })
  ] });
}
function Switch({
  checked,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: `switch ${checked ? "on" : ""}`,
      role: "switch",
      "aria-checked": checked,
      tabIndex: 0,
      onClick: () => onChange(!checked),
      onKeyDown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChange(!checked);
        }
      }
    }
  );
}
function Segmented({
  value,
  options,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "segmented", children: options.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      className: value === o.value ? "active" : "",
      onClick: () => onChange(o.value),
      children: o.label
    },
    o.value
  )) });
}
function Slider({
  value,
  min = 0,
  max = 100,
  onChange,
  disabled = false
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "range",
      className: "slider",
      min,
      max,
      value,
      disabled,
      onChange: (e) => onChange(Number(e.target.value))
    }
  );
}
const FEATURES = [
  { key: "clipboard", label: "剪贴板", desc: "复制历史记录，一键回贴", page: "clipboard" },
  { key: "folder", label: "文件夹", desc: "常用文件夹快速访问与直达终端", page: "folder" },
  { key: "credentials", label: "账号密码", desc: "本地加密保存的账号密码速查", page: "credentials" },
  { key: "translation", label: "划词翻译", desc: "选中文字一键翻译", page: "translation" },
  { key: "port", label: "端口工具", desc: "端口占用查询 / 一键结束进程", page: "port" },
  { key: "files", label: "快速文件", desc: "统一位置快速新建/管理常用文件", page: "files" },
  { key: "snippets", label: "常用语速贴", desc: "快捷短语一键粘贴", page: "snippets" },
  { key: "screenshot", label: "截图贴图", desc: "截图 / 标注 / 贴图钉屏 / 屏幕取色", page: "screenshot" },
  { key: "recorder", label: "屏幕录制", desc: "框选区域录制视频 (AVI) 或 GIF 动图", page: "recorder" },
  { key: "toolbar", label: "悬浮工具栏", desc: "桌面常驻小工具条", page: "toolbar" }
];
function featureEnabled(config, key) {
  const map = {
    clipboard: config.clipboard?.enabled,
    folder: config.folder?.enabled,
    credentials: config.credentials?.enabled,
    translation: config.translator?.enabled,
    port: config.port?.enabled,
    files: config.files?.enabled,
    snippets: config.snippets?.enabled,
    screenshot: config.shot?.enabled,
    recorder: config.recorder?.enabled,
    toolbar: config.toolbar?.enabled
  };
  return map[key] ?? true;
}
function FeaturePage({ onNavigate }) {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const toggle = (key, on) => {
    const next = { ...config };
    switch (key) {
      case "clipboard":
        next.clipboard = { ...config.clipboard, enabled: on };
        break;
      case "folder":
        next.folder = { ...config.folder, enabled: on };
        break;
      case "credentials":
        next.credentials = { ...config.credentials, enabled: on };
        break;
      case "translation":
        next.translator = { ...config.translator, enabled: on };
        break;
      case "port":
        next.port = { ...config.port, enabled: on };
        break;
      case "files":
        next.files = { ...config.files, enabled: on };
        break;
      case "snippets":
        next.snippets = { ...config.snippets, enabled: on };
        break;
      case "screenshot":
        next.shot = { ...config.shot, enabled: on };
        break;
      case "recorder":
        next.recorder = { ...config.recorder, enabled: on };
        break;
      case "toolbar":
        next.toolbar = { ...config.toolbar, enabled: on };
        break;
    }
    void update(next);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "功能开关" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "停用的功能立即失效：全局快捷键注销、悬浮工具栏 / 托盘 / 侧栏入口一并隐藏" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "feature-grid", children: FEATURES.map((f) => {
      const on = featureEnabled(config, f.key);
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `feature-card${on ? "" : " disabled"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feature-card-head", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "feature-card-title", children: f.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: on, onChange: (v) => toggle(f.key, v) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "feature-card-desc", children: on ? f.desc : "已停用——快捷键与所有入口均已隐藏" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "feature-card-foot", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `feature-badge${on ? " on" : ""}`, children: on ? "● 运行中" : "○ 已停用" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "btn btn-sm",
              onClick: () => onNavigate(f.page),
              title: "打开该功能的详细设置",
              children: "设置"
            }
          )
        ] })
      ] }, f.key);
    }) })
  ] });
}
const TIP_WINDOW = "toolbar-tip";
const EVT_TIP = "toolbar://tip";
const showTip = (p) => emit(EVT_TIP, p);
const onTip = (cb) => listen(EVT_TIP, (e) => cb(e.payload));
const SIZE_PRESETS = {
  small: { btn: 28, icon: 14 },
  medium: { btn: 34, icon: 18 },
  large: { btn: 40, icon: 22 }
};
const GAP = 2;
const PAD = 4;
const PULL_STRENGTH = 5;
const PULL_FALLOFF = 55;
const SCALE_STRENGTH = 0.3;
const SCALE_FALLOFF = 900;
const TOOLS = {
  clipboard: {
    label: "剪贴板",
    color: "var(--tool-clipboard)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClipboard, { size: 14 })
  },
  folder: {
    label: "文件夹",
    color: "var(--tool-folder)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconFolder, { size: 14 })
  },
  credentials: {
    label: "账号密码",
    color: "var(--tool-credentials)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconKey, { size: 14 })
  },
  translation: {
    label: "划词翻译",
    color: "var(--tool-translation)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTranslate, { size: 14 })
  },
  port: {
    label: "端口工具",
    color: "var(--tool-port)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPort, { size: 14 })
  },
  files: {
    label: "快速文件",
    color: "var(--tool-files)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconFiles, { size: 14 })
  },
  snippets: {
    label: "常用语速贴",
    color: "var(--tool-snippets)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSnippet, { size: 14 })
  },
  screenshot: {
    label: "截图",
    color: "var(--tool-screenshot)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconScreenshot, { size: 14 })
  },
  recorder: {
    label: "屏幕录制",
    color: "#ff5c5c",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconRecord, { size: 14 })
  },
  settings: {
    label: "打开设置",
    color: "var(--tool-settings)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSettings, { size: 14 })
  },
  sticky: {
    label: "便签",
    color: "var(--tool-sticky)",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSticky, { size: 14 })
  }
};
const TOOL_KEYS = Object.keys(TOOLS);
const PANEL_LABEL_TO_KEY = {
  "clipboard-panel": "clipboard",
  "folder-panel": "folder",
  "credential-panel": "credentials",
  "port-panel": "port",
  "files-panel": "files",
  "snippets-panel": "snippets",
  settings: "settings",
  "translate-popup": "translation",
  // 便签：工具栏入口 toggle 历史窗口；便签窗口各自独立显隐
  "sticky-history": "sticky"
};
const DRAG_THRESHOLD = 10;
const SLIVER = 12;
const EDGE_MARGIN = 12;
const HIDE_DELAY = 250;
const SLIDE_MS = 160;
const EDGE_REVEAL = 70;
function Toolbar() {
  const config = useConfigStore((s) => s.config);
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);
  const sizeKey = config?.toolbar?.size ?? "small";
  const preset = SIZE_PRESETS[sizeKey] ?? SIZE_PRESETS.small;
  const BTN = preset.btn;
  const iconSize = preset.icon;
  const orientation = config?.toolbar?.orientation ?? "horizontal";
  const isVertical = orientation === "vertical";
  const verticalRef = reactExports.useRef(isVertical);
  verticalRef.current = isVertical;
  const autoHideRef = reactExports.useRef(config?.toolbar?.auto_hide ?? true);
  autoHideRef.current = config?.toolbar?.auto_hide ?? true;
  const collapsedRef = reactExports.useRef(false);
  const pinnedEdgeRef = reactExports.useRef(null);
  const restorePosRef = reactExports.useRef(null);
  const restoreWaRef = reactExports.useRef(null);
  const pointerInsideRef = reactExports.useRef(false);
  const snappingRef = reactExports.useRef(false);
  const hideTimerRef = reactExports.useRef(void 0);
  function detectEdge(g) {
    if (Math.abs(g.win_x - g.mon_x) <= EDGE_MARGIN) return "left";
    if (Math.abs(g.win_x + g.win_w - (g.mon_x + g.mon_w)) <= EDGE_MARGIN) return "right";
    if (Math.abs(g.win_y - g.mon_y) <= EDGE_MARGIN) return "top";
    if (Math.abs(g.win_y + g.win_h - (g.mon_y + g.mon_h)) <= EDGE_MARGIN) return "bottom";
    return null;
  }
  function cursorNearEdge(g, edge, threshold) {
    switch (edge) {
      case "left":
        return g.cursor_x <= g.mon_x + threshold;
      case "right":
        return g.cursor_x >= g.mon_x + g.mon_w - threshold;
      case "top":
        return g.cursor_y <= g.mon_y + threshold;
      case "bottom":
        return g.cursor_y >= g.mon_y + g.mon_h - threshold;
    }
  }
  const easeOutBackSoft = (t) => {
    const c1 = 0.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const easeInCubic = (t) => t * t * t;
  function animateWindowTo(tx, ty, duration, easing, clip = false) {
    return new Promise((resolve) => {
      const win = getCurrentWindow();
      void win.outerPosition().then((start) => {
        const sx = start.x;
        const sy = start.y;
        const t0 = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - t0) / duration);
          const e = easing(t);
          const x = Math.round(sx + (tx - sx) * e);
          const y = Math.round(sy + (ty - sy) * e);
          void win.setPosition(new PhysicalPosition(x, y)).catch(() => {
          });
          if (clip) void invoke("toolbar_apply_clip", { x, y }).catch(() => {
          });
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }).catch(() => resolve());
    });
  }
  async function collapseToEdge() {
    const edge = pinnedEdgeRef.current;
    if (!edge || collapsedRef.current || snappingRef.current) return;
    try {
      snappingRef.current = true;
      const geo = await invoke("toolbar_geometry");
      restorePosRef.current = { x: geo.win_x, y: geo.win_y };
      restoreWaRef.current = { x: geo.mon_x, y: geo.mon_y, w: geo.mon_w, h: geo.mon_h };
      let x = geo.win_x;
      let y = geo.win_y;
      if (edge === "left") x = geo.mon_x - geo.win_w + SLIVER;
      else if (edge === "right") x = geo.mon_x + geo.mon_w - SLIVER;
      else if (edge === "top") y = geo.mon_y - geo.win_h + SLIVER;
      else y = geo.mon_y + geo.mon_h - SLIVER;
      await animateWindowTo(x, y, SLIDE_MS, easeInCubic, true);
      await invoke("toolbar_apply_clip", { x, y }).catch(() => {
      });
      collapsedRef.current = true;
      barRef.current?.classList.add("edge-collapsed", `edge-${edge}`);
    } catch (e) {
      console.error("贴边收起失败:", e);
    } finally {
      window.setTimeout(() => {
        snappingRef.current = false;
      }, SLIDE_MS + 80);
    }
  }
  async function expandFromEdge() {
    if (!collapsedRef.current || !restorePosRef.current || snappingRef.current) return;
    try {
      snappingRef.current = true;
      barRef.current?.classList.remove(
        "edge-collapsed",
        "edge-left",
        "edge-right",
        "edge-top",
        "edge-bottom"
      );
      const saved = restorePosRef.current;
      const wa = restoreWaRef.current;
      const win = getCurrentWindow();
      const size = await win.outerSize().catch(() => null);
      let tx = saved.x;
      let ty = saved.y;
      if (wa && size) {
        const maxX = wa.x + wa.w - size.width;
        const maxY = wa.y + wa.h - size.height;
        tx = Math.min(Math.max(tx, wa.x), Math.max(wa.x, maxX));
        ty = Math.min(Math.max(ty, wa.y), Math.max(wa.y, maxY));
      }
      await animateWindowTo(tx, ty, SLIDE_MS, easeOutBackSoft, true);
      await invoke("toolbar_apply_clip", { x: tx, y: ty }).catch(() => {
      });
      collapsedRef.current = false;
      restorePosRef.current = null;
      restoreWaRef.current = null;
    } catch (e) {
      console.error("贴边弹出失败:", e);
    } finally {
      window.setTimeout(() => {
        snappingRef.current = false;
      }, SLIDE_MS + 60);
    }
  }
  const pressRef = reactExports.useRef(null);
  const [activeKeys, setActiveKeys] = reactExports.useState(/* @__PURE__ */ new Set());
  const showTipAt = async (label, index) => {
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const scale = await win.scaleFactor().catch(() => 1) || 1;
      const along = PAD + index * (BTN + GAP) + BTN / 2;
      const across = (BTN + PAD * 2) / 2;
      await showTip({
        label,
        x: pos.x / scale + (isVertical ? across : along),
        y: pos.y / scale + (isVertical ? along : across),
        vertical: isVertical
      });
    } catch {
    }
  };
  const hideTip = () => {
    void showTip(null).catch(() => {
    });
  };
  const refreshActive = async () => {
    const labels = await panelActive();
    const keys = /* @__PURE__ */ new Set();
    for (const label of labels) {
      const k = PANEL_LABEL_TO_KEY[label] ?? (label.startsWith("note_") ? "sticky" : void 0);
      if (k) keys.add(k);
    }
    setActiveKeys(keys);
  };
  reactExports.useEffect(() => {
    void refreshActive();
    let cleanup;
    onEvent(EVT_PANEL_VISIBILITY, () => {
      void refreshActive();
    }).then((un) => {
      cleanup = un;
    });
    return () => cleanup?.();
  }, []);
  const barRef = reactExports.useRef(null);
  const btnRefs = reactExports.useRef([]);
  const mouseRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(0);
  const applyMagnet = () => {
    rafRef.current = 0;
    const m = mouseRef.current;
    const btns = btnRefs.current;
    const n = btns.length;
    if (!m || n === 0) {
      for (const b of btns) if (b) b.style.transform = "";
      return;
    }
    const total = n * (BTN + GAP) - GAP;
    for (let i = 0; i < n; i++) {
      const btn = btns[i];
      if (!btn) continue;
      const center = i * (BTN + GAP) + BTN / 2 - total / 2;
      const dist = verticalRef.current ? m.y - center : m.x - center;
      const shift = Math.tanh(dist / PULL_FALLOFF) * PULL_STRENGTH;
      const scale = 1 + SCALE_STRENGTH * Math.exp(-(dist * dist) / SCALE_FALLOFF);
      btn.style.transform = verticalRef.current ? `translateY(${shift.toFixed(2)}px) scale(${scale.toFixed(3)})` : `translateX(${shift.toFixed(2)}px) scale(${scale.toFixed(3)})`;
      btn.style.zIndex = scale > 1.12 ? "2" : "1";
    }
  };
  const persistDragEndPosition = () => {
    let last = null;
    let stable = 0;
    const timer = window.setInterval(() => {
      void getCurrentWindow().outerPosition().then((p) => {
        const cur = { x: p.x, y: p.y };
        if (last && last.x === cur.x && last.y === cur.y) {
          if (++stable >= 2) {
            window.clearInterval(timer);
            if (!collapsedRef.current && !snappingRef.current) {
              const st = useConfigStore.getState();
              void st.update({
                ...st.config,
                toolbar: { ...st.config.toolbar, position: [cur.x, cur.y] }
              });
            }
          }
        } else {
          stable = 0;
          last = cur;
        }
      }).catch(() => {
      });
    }, 300);
    window.setTimeout(() => window.clearInterval(timer), 6e4);
  };
  const handleMove = (e) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (rect) {
      mouseRef.current = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2
      };
      if (!rafRef.current) rafRef.current = requestAnimationFrame(applyMagnet);
    }
    const p = pressRef.current;
    if (!p || p.dragged) return;
    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > DRAG_THRESHOLD) {
      if (pressRef.current) pressRef.current.dragged = true;
      getCurrentWindow().startDragging().catch(() => void 0);
      persistDragEndPosition();
    }
  };
  const handleEnter = () => {
    pointerInsideRef.current = true;
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = void 0;
    }
    if (collapsedRef.current && autoHideRef.current && !snappingRef.current) {
      void expandFromEdge();
    }
  };
  const handleLeave = () => {
    mouseRef.current = null;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(applyMagnet);
    pointerInsideRef.current = false;
    if (!collapsedRef.current && pinnedEdgeRef.current && autoHideRef.current && !snappingRef.current) {
      if (!hideTimerRef.current) {
        hideTimerRef.current = window.setTimeout(() => {
          hideTimerRef.current = void 0;
          void collapseToEdge();
        }, HIDE_DELAY);
      }
    }
  };
  reactExports.useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );
  reactExports.useEffect(() => {
    load();
    let cleanup;
    let disposed = false;
    onEvent(EVT_CONFIG_CHANGED, (cfg) => {
      if (cfg) sync(cfg);
      else void load();
    }).then((un) => {
      if (disposed) un();
      else cleanup = un;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [load, sync]);
  const tools = config?.toolbar?.tools ?? [];
  const validTools = tools.filter((k) => {
    if (!TOOLS[k]) return false;
    if (k === "settings") return true;
    return config ? featureEnabled(config, k) : true;
  });
  reactExports.useEffect(() => {
    if (!validTools.length) return;
    const main = validTools.length * (BTN + GAP) + PAD * 2;
    const cross = BTN + PAD * 2;
    getCurrentWindow().setSize(new LogicalSize(isVertical ? cross : main, isVertical ? main : cross)).catch(() => void 0);
  }, [validTools.length, isVertical, BTN]);
  reactExports.useEffect(() => {
    void (async () => {
      try {
        const geo = await invoke("toolbar_geometry");
        const fullyOut = geo.win_x + geo.win_w <= geo.mon_x || geo.win_x >= geo.mon_x + geo.mon_w || geo.win_y + geo.win_h <= geo.mon_y || geo.win_y >= geo.mon_y + geo.mon_h;
        if (!fullyOut) return;
        const win = getCurrentWindow();
        const size = await win.outerSize().catch(() => null);
        if (!size) return;
        const x = Math.min(Math.max(geo.win_x, geo.mon_x), geo.mon_x + geo.mon_w - size.width);
        const y = Math.min(Math.max(geo.win_y, geo.mon_y), geo.mon_y + geo.mon_h - size.height);
        await win.setPosition(new PhysicalPosition(Math.round(x), Math.round(y))).catch(() => {
        });
      } catch {
      }
    })();
  }, []);
  reactExports.useEffect(() => {
    let lastThrough = false;
    const probe2 = async () => {
      try {
        const geo = await invoke("toolbar_geometry");
        const inside = geo.cursor_x >= geo.win_x && geo.cursor_x <= geo.win_x + geo.win_w && geo.cursor_y >= geo.win_y && geo.cursor_y <= geo.win_y + geo.win_h;
        const shouldThrough = !inside;
        if (shouldThrough !== lastThrough) {
          lastThrough = shouldThrough;
          await invoke("toolbar_set_click_through", { on: shouldThrough }).catch(() => {
          });
        }
        if (!collapsedRef.current) {
          pinnedEdgeRef.current = detectEdge(geo);
        }
        if (autoHideRef.current && collapsedRef.current && pinnedEdgeRef.current) {
          if (cursorNearEdge(geo, pinnedEdgeRef.current, EDGE_REVEAL)) {
            void expandFromEdge();
          }
          return;
        }
        if (!collapsedRef.current && autoHideRef.current && pinnedEdgeRef.current) {
          if (inside || cursorNearEdge(geo, pinnedEdgeRef.current, EDGE_REVEAL)) {
            if (hideTimerRef.current) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = void 0;
            }
          } else if (!snappingRef.current && !hideTimerRef.current) {
            hideTimerRef.current = window.setTimeout(() => {
              hideTimerRef.current = void 0;
              void collapseToEdge();
            }, HIDE_DELAY);
          }
        }
      } catch {
        if (lastThrough) {
          lastThrough = false;
          await invoke("toolbar_set_click_through", { on: false }).catch(() => {
          });
        }
      }
    };
    void probe2();
    const timer = window.setInterval(() => void probe2(), 200);
    return () => window.clearInterval(timer);
  }, []);
  if (!config?.toolbar?.enabled) return null;
  if (!validTools.length) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: barRef,
      className: `toolbar${isVertical ? " vertical" : ""}`,
      onMouseDown: (e) => {
        const btn = e.target.closest("button");
        if (!btn) {
          pressRef.current = null;
          getCurrentWindow().startDragging().catch(() => void 0);
          return;
        }
        pressRef.current = {
          x: e.clientX,
          y: e.clientY,
          key: btn.dataset.key ?? null,
          dragged: false
        };
      },
      onMouseMove: handleMove,
      onMouseEnter: handleEnter,
      onMouseLeave: handleLeave,
      onMouseUp: (e) => {
        const p = pressRef.current;
        pressRef.current = null;
        if (e.button !== 0) return;
        if (p && !p.dragged && p.key) {
          e.preventDefault();
          void diagLog(`[toolbar] click ${p.key}`);
          void panelToggle(p.key);
        }
      },
      children: validTools.map((key, i) => {
        const tool = TOOLS[key];
        if (!tool) return null;
        const active = activeKeys.has(key);
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            ref: (el) => {
              btnRefs.current[i] = el;
            },
            type: "button",
            className: `toolbar-btn${active ? " active" : ""}`,
            "data-key": key,
            onMouseEnter: () => void showTipAt(active ? `${tool.label}（面板已打开）` : tool.label, i),
            onMouseLeave: hideTip,
            style: {
              width: BTN,
              height: BTN,
              transition: "transform 90ms var(--ease-out)"
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: "toolbar-icon",
                style: { "--tool-color": tool.color },
                children: reactExports.cloneElement(tool.icon, { size: iconSize })
              }
            )
          },
          key
        );
      })
    }
  );
}
const OFFSET = 14;
function ToolbarTip() {
  const [tip, setTip] = reactExports.useState(null);
  const boxRef = reactExports.useRef(null);
  const winRef = reactExports.useRef(getCurrentWindow());
  reactExports.useEffect(() => {
    let dispose = null;
    void onTip((p) => setTip(p)).then((u) => {
      dispose = u;
    });
    return () => {
      dispose?.();
    };
  }, []);
  reactExports.useLayoutEffect(() => {
    const win = winRef.current;
    const el = boxRef.current;
    if (!tip || !el) {
      void win.hide().catch(() => {
      });
      return;
    }
    const w = Math.ceil(el.offsetWidth);
    const h = Math.ceil(el.offsetHeight);
    void (async () => {
      try {
        await win.setSize(new LogicalSize(w, h));
        const s = window.screen;
        let x;
        let y;
        if (tip.vertical) {
          x = tip.x + OFFSET;
          y = tip.y - h / 2;
        } else {
          x = tip.x - w / 2;
          y = tip.y - h - OFFSET;
        }
        const minX = s.availLeft + 2;
        const minY = s.availTop + 2;
        const maxX = s.availLeft + s.availWidth - w - 2;
        const maxY = s.availTop + s.availHeight - h - 2;
        x = Math.min(Math.max(x, minX), Math.max(minX, maxX));
        y = Math.min(Math.max(y, minY), Math.max(minY, maxY));
        await win.setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
        await win.setAlwaysOnTop(true);
        await win.show();
      } catch {
      }
    })();
  }, [tip]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "tip-wrap", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: boxRef, className: "tip-box", children: tip?.label ?? "" }) });
}
const scrollBegin = (rect) => invoke("scrollshot_begin", { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
const scrollStop = () => invoke("scrollshot_stop");
const scrollCancel = () => invoke("scrollshot_cancel");
const scrollDismiss = () => invoke("scrollshot_dismiss");
const scrollStartScroll = () => invoke("scrollshot_start_scroll");
const scrollSetSpeed = (speed) => invoke("scrollshot_set_speed", { speed });
const scrollGetSpeed = () => invoke("scrollshot_get_speed");
const scrollFrameRect = () => invoke("scrollshot_frame_info");
const EVT_SCROLLSHOT_PROGRESS = "scrollshot://progress";
const EVT_SCROLLSHOT_DONE = "scrollshot://done";
const EVT_BAR_RESET = "scrollshot://reset";
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const toCamelCase = (string) => string.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};
const LucideContext = reactExports.createContext({});
const useLucideContext = () => reactExports.useContext(LucideContext);
const Icon = reactExports.forwardRef(
  ({ color, size, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
    const {
      size: contextSize = 24,
      strokeWidth: contextStrokeWidth = 2,
      absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
      color: contextColor = "currentColor",
      className: contextClass = ""
    } = useLucideContext() ?? {};
    const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size ?? contextSize) : strokeWidth ?? contextStrokeWidth;
    return reactExports.createElement(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size ?? contextSize ?? defaultAttributes.width,
        height: size ?? contextSize ?? defaultAttributes.height,
        stroke: color ?? contextColor,
        strokeWidth: calculatedStrokeWidth,
        className: mergeClasses("lucide", contextClass, className),
        ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => reactExports.createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const createLucideIcon = (iconName, iconNode) => {
  const Component = reactExports.forwardRef(
    ({ className, ...props }, ref) => reactExports.createElement(Icon, {
      ref,
      iconNode,
      className: mergeClasses(
        `lucide-${toKebabCase(toPascalCase(iconName))}`,
        `lucide-${iconName}`,
        className
      ),
      ...props
    })
  );
  Component.displayName = toPascalCase(iconName);
  return Component;
};
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$i = [
  ["path", { d: "M2 10v3", key: "1fnikh" }],
  ["path", { d: "M6 6v11", key: "11sgs0" }],
  ["path", { d: "M10 3v18", key: "yhl04a" }],
  ["path", { d: "M14 8v7", key: "3a1oy3" }],
  ["path", { d: "M18 5v13", key: "123xd1" }],
  ["path", { d: "M22 10v3", key: "154ddg" }]
];
const AudioLines = createLucideIcon("audio-lines", __iconNode$i);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$h = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["path", { d: "M4.929 4.929 19.07 19.071", key: "196cmz" }]
];
const Ban = createLucideIcon("ban", __iconNode$h);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$g = [
  ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
  ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
];
const Copy = createLucideIcon("copy", __iconNode$g);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$f = [
  ["path", { d: "M12 15V3", key: "m9g1x1" }],
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
  ["path", { d: "m7 10 5 5 5-5", key: "brsn70" }]
];
const Download = createLucideIcon("download", __iconNode$f);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$e = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M7 3v18", key: "bbkbws" }],
  ["path", { d: "M3 7.5h4", key: "zfgn84" }],
  ["path", { d: "M3 12h18", key: "1i2n21" }],
  ["path", { d: "M3 16.5h4", key: "1230mu" }],
  ["path", { d: "M17 3v18", key: "in4fa5" }],
  ["path", { d: "M17 7.5h4", key: "myr1c1" }],
  ["path", { d: "M17 16.5h4", key: "go4c1d" }]
];
const Film = createLucideIcon("film", __iconNode$e);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$d = [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
];
const FolderOpen = createLucideIcon("folder-open", __iconNode$d);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$c = [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56", key: "13zald" }]];
const LoaderCircle = createLucideIcon("loader-circle", __iconNode$c);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$b = [
  ["path", { d: "M12 19v3", key: "npa21l" }],
  ["path", { d: "M15 9.34V5a3 3 0 0 0-5.68-1.33", key: "1gzdoj" }],
  ["path", { d: "M16.95 16.95A7 7 0 0 1 5 12v-2", key: "cqa7eg" }],
  ["path", { d: "M18.89 13.23A7 7 0 0 0 19 12v-2", key: "16hl24" }],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }],
  ["path", { d: "M9 9v3a3 3 0 0 0 5.12 2.12", key: "r2i35w" }]
];
const MicOff = createLucideIcon("mic-off", __iconNode$b);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$a = [
  ["path", { d: "M12 19v3", key: "npa21l" }],
  ["path", { d: "M19 10v2a7 7 0 0 1-14 0v-2", key: "1vc78b" }],
  ["rect", { x: "9", y: "2", width: "6", height: "13", rx: "3", key: "s6n7sd" }]
];
const Mic = createLucideIcon("mic", __iconNode$a);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$9 = [
  ["path", { d: "M5.5 20H8", key: "1k40s5" }],
  ["path", { d: "M17 9h.01", key: "1j24nn" }],
  ["rect", { width: "10", height: "16", x: "12", y: "4", rx: "2", key: "ixliua" }],
  ["path", { d: "M8 6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4", key: "1mp6e1" }],
  ["circle", { cx: "17", cy: "15", r: "1", key: "tqvash" }]
];
const MonitorSpeaker = createLucideIcon("monitor-speaker", __iconNode$9);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$8 = [
  ["rect", { x: "14", y: "3", width: "5", height: "18", rx: "1", key: "kaeet6" }],
  ["rect", { x: "5", y: "3", width: "5", height: "18", rx: "1", key: "1wsw3u" }]
];
const Pause = createLucideIcon("pause", __iconNode$8);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$7 = [
  [
    "path",
    {
      d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      key: "1a8usu"
    }
  ],
  ["path", { d: "m15 5 4 4", key: "1mk7zo" }]
];
const Pencil = createLucideIcon("pencil", __iconNode$7);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$6 = [
  [
    "path",
    {
      d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
      key: "10ikf1"
    }
  ]
];
const Play = createLucideIcon("play", __iconNode$6);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$5 = [
  ["path", { d: "m15 14 5-5-5-5", key: "12vg1m" }],
  ["path", { d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13", key: "6uklza" }]
];
const Redo2 = createLucideIcon("redo-2", __iconNode$5);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$4 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }]
];
const Square = createLucideIcon("square", __iconNode$4);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$3 = [
  ["path", { d: "M9 14 4 9l5-5", key: "102s5s" }],
  ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11", key: "f3b9sd" }]
];
const Undo2 = createLucideIcon("undo-2", __iconNode$3);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$2 = [
  [
    "path",
    {
      d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
      key: "uqj9uw"
    }
  ],
  ["path", { d: "M16 9a5 5 0 0 1 0 6", key: "1q6k2b" }],
  ["path", { d: "M19.364 18.364a9 9 0 0 0 0-12.728", key: "ijwkga" }]
];
const Volume2 = createLucideIcon("volume-2", __iconNode$2);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode$1 = [
  [
    "path",
    {
      d: "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",
      key: "uqj9uw"
    }
  ],
  ["line", { x1: "22", x2: "16", y1: "9", y2: "15", key: "1ewh16" }],
  ["line", { x1: "16", x2: "22", y1: "9", y2: "15", key: "5ykzw1" }]
];
const VolumeX = createLucideIcon("volume-x", __iconNode$1);
/**
 * @license lucide-react v1.34.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const __iconNode = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
const X = createLucideIcon("x", __iconNode);
const ARROW_ICON_PATH = "M 15.67 12.86 C 20.02 12.79 20.80 12.73 21.27 12.46 C 22.00 12.03 21.94 11.81 20.96 11.33 C 20.10 10.91 19.58 10.82 19.58 11.08 C 19.58 11.16 15.63 11.55 10.79 11.95 C 3.63 12.54 2.00 12.72 2.00 12.94 C 2.00 13.16 2.64 13.18 6.30 13.07 C 8.67 13.00 12.88 12.91 15.67 12.86 Z";
function OcrPanel(p) {
  const { lines, phase, error, trans, translating, onClose, onCopyAll, onCopyTrans, onTranslate, onReturn, style } = p;
  const tTotal = trans?.pairs.length ?? 0;
  const tDone = trans?.pairs.filter((x) => !x.pending).length ?? 0;
  const hasLines = lines.length > 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ocr-panel", style, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ocr-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "文字识别" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { flex: 1 } }),
      phase === "done" && hasLines && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        trans && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onReturn, children: "返回原文" }),
        trans ? tDone > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCopyTrans, children: "复制译文" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onCopyAll, children: "复制全部" }),
        !trans && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onTranslate, children: "翻译" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, children: "关闭" })
    ] }),
    phase === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-body ocr-muted", children: "识别中…" }),
    phase === "error" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-body ocr-err", children: error }),
    phase === "done" && (trans ? trans.err ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ocr-body ocr-err", children: [
      "翻译失败：",
      trans.err
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ocr-trans", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ocr-thead", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "原文" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: translating ? `译文 ${tDone}/${tTotal}…` : "译文" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-pairs", children: trans.pairs.map((pr, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ocr-pair", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-pcell", children: pr.src }),
        pr.pending ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-pcell", children: /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "ocr-pwait" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `ocr-pcell ocr-pout${pr.ok ? "" : " ocr-pfail"}`, children: pr.out })
      ] }, i)) }),
      !translating && trans.pairs.some((x) => !x.ok) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-note", children: "部分行未翻译（网络/配额或行数超出上限），已回退显示原文" })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ocr-lines", children: [
      lines.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-body ocr-muted", children: "未识别到文字（可调整选区后重新点击识别）" }),
      lines.map((l, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-line", children: l.text }, i))
    ] })),
    phase === "done" && hasLines && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ocr-selbar", children: trans ? "划选任一列文字后 Ctrl+C 复制，或点上方「复制译文」" : "划选文字后 Ctrl+C 复制，或点上方「复制全部」" })
  ] });
}
const MAG = 168, MAG_Z = 2;
const MAG_BOX_W = 168;
const fmtHex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const fmtDisplay = (c, fmt2) => fmt2 === "hex" ? fmtHex(c) : `${c[0]} , ${c[1]} , ${c[2]}`;
const fmtCopy = (c, fmt2) => fmt2 === "hex" ? fmtHex(c) : `rgb(${c[0]},${c[1]},${c[2]})`;
const IC = { size: 22, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
const IcoRect = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3", y: "4.5", width: "18", height: "15", rx: "3.5" }) });
const IcoEllipse = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("ellipse", { cx: "12", cy: "12", rx: "11", ry: "7.5" }) });
const IcoShape = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "2.5", y: "4.5", width: "14", height: "11", rx: "3.5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "17", cy: "16.5", r: "5" })
] });
const IcoArrow = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: ARROW_ICON_PATH, transform: "rotate(-45 12 12)" }) });
const IcoLine = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "4.5", y1: "19.5", x2: "19.5", y2: "4.5" }) });
const IcoLineGroup = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "3 17 9 11 13 14 20 6" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("polyline", { points: "15 6 20 6 20 11" })
] });
const IcoBrush = () => /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { ...IC });
const IcoMosaic = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "3.5", y: "3.5", width: "17", height: "17", rx: "4" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "5.5", y: "5.5", width: "6", height: "6", rx: "1", fill: "currentColor", stroke: "none" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { x: "12.5", y: "12.5", width: "6", height: "6", rx: "1", fill: "currentColor", stroke: "none" })
] });
const IcoTextT = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "5", y1: "6", x2: "19", y2: "6" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: "12", y1: "6", x2: "12", y2: "19" })
] });
const IcoNumber = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "9" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12.5 8.2V16" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12.5 8.2L10.3 9.8" })
] });
const IcoOcr = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M21 16v2.5A2.5 2.5 0 0 1 18.5 21H16" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7 9h4M13 9h4M7 12.5h2.5M14.5 12.5H17M7 16h4M13 16h4" })
] });
const IcoUndo = () => /* @__PURE__ */ jsxRuntimeExports.jsx(Undo2, { ...IC });
const IcoRedo = () => /* @__PURE__ */ jsxRuntimeExports.jsx(Redo2, { ...IC });
const IcoClose = () => /* @__PURE__ */ jsxRuntimeExports.jsx(X, { ...IC });
const IcoPin = () => /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: PIN_ICON_PATH }) });
const IcoSaveAs = () => /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { ...IC });
const IcoCopy = () => /* @__PURE__ */ jsxRuntimeExports.jsx(Copy, { ...IC });
const IcoLongShot = () => /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M7 3.5h10a2.5 2.5 0 0 1 2.5 2.5V19a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5V6a2.5 2.5 0 0 1 2.5-2.5Z" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 8v5" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m9.5 11.5 2.5 2.5 2.5-2.5" })
] });
const TOOL_BUTTONS = [
  // 形状组：未激活显示组合图标（IcoShape），激活后显示当前子工具图标
  { items: [["rect", IcoRect, "矩形", "#64d2ff"], ["ellipse", IcoEllipse, "椭圆", "#64d2ff"]], groupIcon: IcoShape, hotkey: "Ctrl+1" },
  // 线组：箭头排前面（默认选中箭头，更常用）
  { items: [["arrow", IcoArrow, "箭头", "#32d74b"], ["line", IcoLine, "直线", "#32d74b"]], groupIcon: IcoLineGroup, hotkey: "Ctrl+2" },
  { items: [["brush", IcoBrush, "画笔", "#ff9f0a"]], hotkey: "Ctrl+3" },
  { items: [["mosaic", IcoMosaic, "马赛克", "#bf5af2"]], hotkey: "Ctrl+4" },
  { items: [["text", IcoTextT, "文字", "#ffd60a"]], hotkey: "Ctrl+5" },
  { items: [["number", IcoNumber, "序号", "#ff453a"]], hotkey: "Ctrl+6" }
];
const btnTip = (b) => `${b.items.map(([, , n]) => n).join("、")} (${b.hotkey})`;
const ANNO_DEFAULT_COLORS = ["#e5484d", "#ff8d1a", "#ffd60a", "#36b37e", "#4c8dff", "#b06fd6", "#ffffff", "#000000"];
const ANNO_MAX_CUSTOM = 6;
const mosaicLayerCache = /* @__PURE__ */ new WeakMap();
const mosaicScratch = {};
let mosaicFrameStamp = 0;
function invalidateMosaicLayer() {
  mosaicFrameStamp++;
}
const mosaicSnapshots = /* @__PURE__ */ new Map();
let mosaicSid = 0;
function clearMosaicSnapshots() {
  mosaicSnapshots.clear();
}
function drawShape(ctx, s, src, _mosaicCache, scale = 1) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = Math.max(0.5, s.width * scale);
  ctx.fillStyle = s.color;
  const X1 = s.x1 * scale, Y1 = s.y1 * scale, X2 = s.x2 * scale, Y2 = s.y2 * scale;
  if (s.kind === "rect") {
    ctx.strokeRect(X1, Y1, X2 - X1, Y2 - Y1);
  } else if (s.kind === "ellipse") {
    const cx = (X1 + X2) / 2, cy = (Y1 + Y2) / 2;
    const rx = Math.abs(X2 - X1) / 2, ry = Math.abs(Y2 - Y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.kind === "arrow") {
    const dx = X2 - X1, dy = Y2 - Y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2 * scale) {
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(X1, Y1);
    ctx.lineTo(X2, Y2);
    ctx.stroke();
    const angle = Math.atan2(dy, dx);
    const hl = Math.min(16 * scale, len * 0.3);
    ctx.beginPath();
    ctx.moveTo(X2, Y2);
    ctx.lineTo(X2 - hl * Math.cos(angle - 0.4), Y2 - hl * Math.sin(angle - 0.4));
    ctx.moveTo(X2, Y2);
    ctx.lineTo(X2 - hl * Math.cos(angle + 0.4), Y2 - hl * Math.sin(angle + 0.4));
    ctx.stroke();
  } else if (s.kind === "line") {
    ctx.beginPath();
    ctx.moveTo(X1, Y1);
    ctx.lineTo(X2, Y2);
    ctx.stroke();
  } else if (s.kind === "brush" && s.points && s.points.length > 1) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.points[0].x * scale, s.points[0].y * scale);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * scale, s.points[i].y * scale);
    ctx.stroke();
  } else if (s.kind === "mosaic" && s.points && s.points.length > 0 && src && src.width > 0) {
    const sampleSrc = (s.sid !== void 0 ? mosaicSnapshots.get(s.sid) : void 0) ?? src;
    const bs = Math.max(4, 12 * scale);
    const W = sampleSrc.width, H = sampleSrc.height;
    let layer = mosaicLayerCache.get(sampleSrc);
    if (!layer || layer.bs !== bs || layer.w !== W || layer.h !== H || sampleSrc === src && layer.stamp !== mosaicFrameStamp) {
      const pw = Math.max(1, Math.ceil(W / bs)), ph = Math.max(1, Math.ceil(H / bs));
      const pix = document.createElement("canvas");
      pix.width = pw;
      pix.height = ph;
      const pctx = pix.getContext("2d");
      pctx.imageSmoothingEnabled = true;
      pctx.drawImage(sampleSrc, 0, 0, pw, ph);
      layer = { bs, w: W, h: H, stamp: mosaicFrameStamp, pix };
      mosaicLayerCache.set(src, layer);
    }
    const pts = s.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    const pad = bs * 2.2;
    let bw2 = 0, bh2 = 0;
    let bx = Infinity, by = Infinity, bx2 = -Infinity, by2 = -Infinity;
    for (const p of pts) {
      bx = Math.min(bx, p.x);
      by = Math.min(by, p.y);
      bx2 = Math.max(bx2, p.x);
      by2 = Math.max(by2, p.y);
    }
    bx = Math.max(0, Math.floor(bx - pad));
    by = Math.max(0, Math.floor(by - pad));
    bw2 = Math.min(W, Math.ceil(bx2 + pad)) - bx;
    bh2 = Math.min(H, Math.ceil(by2 + pad)) - by;
    if (bw2 <= 0 || bh2 <= 0) return;
    let mask = mosaicScratch.mask;
    if (!mask) {
      mask = document.createElement("canvas");
      mosaicScratch.mask = mask;
    }
    if (mask.width !== bw2) mask.width = bw2;
    if (mask.height !== bh2) mask.height = bh2;
    const mctx = mask.getContext("2d");
    mctx.clearRect(0, 0, bw2, bh2);
    mctx.fillStyle = "#000";
    mctx.strokeStyle = "#000";
    mctx.lineCap = "round";
    mctx.lineJoin = "round";
    mctx.lineWidth = bs * 2.2;
    if (pts.length === 1) {
      mctx.beginPath();
      mctx.arc(pts[0].x - bx, pts[0].y - by, bs * 1.1, 0, Math.PI * 2);
      mctx.fill();
    } else {
      mctx.beginPath();
      mctx.moveTo(pts[0].x - bx, pts[0].y - by);
      for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i].x - bx, pts[i].y - by);
      mctx.stroke();
    }
    let comp = mosaicScratch.comp;
    if (!comp) {
      comp = document.createElement("canvas");
      mosaicScratch.comp = comp;
    }
    if (comp.width !== bw2) comp.width = bw2;
    if (comp.height !== bh2) comp.height = bh2;
    const cc = comp.getContext("2d");
    cc.globalCompositeOperation = "source-over";
    cc.clearRect(0, 0, bw2, bh2);
    cc.imageSmoothingEnabled = false;
    cc.drawImage(layer.pix, bx / bs, by / bs, bw2 / bs, bh2 / bs, 0, 0, bw2, bh2);
    cc.globalCompositeOperation = "destination-in";
    cc.drawImage(mask, 0, 0);
    cc.globalCompositeOperation = "source-over";
    ctx.drawImage(comp, bx, by);
  } else if (s.kind === "text" && s.text) {
    ctx.font = `bold ${Math.round(16 * scale)}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(s.text, Math.round(X1), Math.round(Y1));
    ctx.textBaseline = "alphabetic";
  } else if (s.kind === "number" && s.num !== void 0) {
    const r = 14 * scale;
    ctx.beginPath();
    ctx.arc(X1, Y1, r, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(s.num), X1, Y1);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}
function ScreenshotOverlay() {
  const [geom, setGeom] = reactExports.useState(null);
  const [bgReady, setBgReady] = reactExports.useState(false);
  const [phase, setPhase] = reactExports.useState("idle");
  const [region, setRegion] = reactExports.useState({ x: 0, y: 0, w: 0, h: 0 });
  const [snap, setSnap] = reactExports.useState(null);
  const [tool, setTool] = reactExports.useState("select");
  const [submenuOpen, setSubmenuOpen] = reactExports.useState(null);
  const [color, setColor] = reactExports.useState("#e5484d");
  const [sw, setSw] = reactExports.useState(3);
  const [swBadge, setSwBadge] = reactExports.useState(null);
  const swBadgeTimer = reactExports.useRef(0);
  const [annos, setAnnos] = reactExports.useState([]);
  const [undos, setUndos] = reactExports.useState([]);
  const mouseRef = reactExports.useRef({ x: 0, y: 0 });
  const [showMag, setShowMag] = reactExports.useState(false);
  const [numCnt, setNumCnt] = reactExports.useState(1);
  const [textEdit, setTextEdit] = reactExports.useState(null);
  const [dragging, setDragging] = reactExports.useState(false);
  const dragRef = reactExports.useRef(null);
  const regRef = reactExports.useRef({ x: 0, y: 0, w: 0, h: 0 });
  const resizeRef = reactExports.useRef(null);
  const downPtRef = reactExports.useRef(null);
  const bgRef = reactExports.useRef(null);
  const annoRef = reactExports.useRef(null);
  const cfg = useConfigStore((s) => s.config);
  const updateCfg = useConfigStore((s) => s.update);
  const customColorRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const el = customColorRef.current;
    if (!el) return;
    const onCommit = (ev) => {
      const hex = ev.target.value;
      setColor(hex);
      const cur = cfg.annotate?.colors?.length ? cfg.annotate.colors : ANNO_DEFAULT_COLORS;
      if (cur.some((x) => x.toLowerCase() === hex)) return;
      const next = [...cur, hex];
      const trimmed = next.length > ANNO_DEFAULT_COLORS.length + ANNO_MAX_CUSTOM ? [...next.slice(0, ANNO_DEFAULT_COLORS.length), ...next.slice(-ANNO_MAX_CUSTOM)] : next;
      void updateCfg({ ...cfg, annotate: { ...cfg.annotate, colors: trimmed } });
    };
    el.addEventListener("change", onCommit);
    return () => el.removeEventListener("change", onCommit);
  }, [cfg.annotate?.colors]);
  const loadingRef = reactExports.useRef(false);
  const rerunRef = reactExports.useRef(false);
  const sessionRef = reactExports.useRef(0);
  const frameReadyRef = reactExports.useRef(Promise.resolve());
  const mosaicCacheRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const prevAnnoLenRef = reactExports.useRef(0);
  const outputtingRef = reactExports.useRef(false);
  const textEditRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    textEditRef.current = textEdit;
  }, [textEdit]);
  const textInputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (textEdit) {
      const t = window.setTimeout(() => {
        textInputRef.current?.focus({ preventScroll: true });
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [textEdit?.x, textEdit?.y]);
  const toolRef = reactExports.useRef("select");
  reactExports.useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  const [colorFmt, setColorFmt] = reactExports.useState("rgb");
  const colorFmtRef = reactExports.useRef("rgb");
  reactExports.useEffect(() => {
    colorFmtRef.current = colorFmt;
  }, [colorFmt]);
  const toggleColorFmt = () => setColorFmt((f) => {
    const nf = f === "rgb" ? "hex" : "rgb";
    const col = pickedRef.current;
    if (col) {
      if (magValRef.current) magValRef.current.textContent = fmtDisplay(col, nf);
      if (pickerValRef.current) pickerValRef.current.textContent = fmtDisplay(col, nf);
    }
    syncFmtBadges(nf);
    return nf;
  });
  const pickedRef = reactExports.useRef(null);
  const bgReadyRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    bgReadyRef.current = bgReady;
  }, [bgReady]);
  const pickerModeRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    pickerModeRef.current = !!geom?.picker;
  }, [geom?.picker]);
  const sampleColor = (x, y) => {
    const c = bgRef.current;
    if (!c || !bgReadyRef.current || x < 0 || y < 0 || x >= c.width || y >= c.height) return null;
    try {
      const d = c.getContext("2d").getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    } catch {
      return null;
    }
  };
  const copyTimerRef = reactExports.useRef(0);
  const copyPicked = (close) => {
    const col = pickedRef.current;
    if (!col) return;
    const text = fmtCopy(col, colorFmtRef.current);
    void copyText(text).catch(() => {
    });
    const el = pickerModeRef.current ? pickerCopiedRef.current : magCopiedRef.current;
    if (el) {
      el.textContent = `✓ 已复制 ${text}`;
      el.style.display = "block";
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        el.style.display = "none";
      }, 1400);
    }
    if (close) void shotCancel().catch(() => {
    });
  };
  const applyToolButton = (b) => {
    const idx = b.items.findIndex(([t]) => t === toolRef.current);
    setTool(b.items[(idx + 1) % b.items.length][0]);
  };
  reactExports.useEffect(() => {
    if (submenuOpen === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSubmenuOpen(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [submenuOpen]);
  const [dimFx, setDimFx] = reactExports.useState(false);
  const hintRef = reactExports.useRef(null);
  const [hintCovered, setHintCovered] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const el = hintRef.current;
    if (!el || !geom) {
      return;
    }
    if (dragging || phase !== "selected") {
      setHintCovered(false);
      return;
    }
    const hr = el.getBoundingClientRect();
    const x1 = region.x, y1 = region.y;
    const x2 = region.x + region.w, y2 = region.y + region.h;
    setHintCovered(!(x2 < hr.left || x1 > hr.right || y2 < hr.top || y1 > hr.bottom));
  }, [phase, dragging, region, geom]);
  const loadSession = async () => {
    if (loadingRef.current) {
      rerunRef.current = true;
      return;
    }
    loadingRef.current = true;
    const mySession = ++sessionRef.current;
    {
      const c0 = bgRef.current;
      if (c0) c0.getContext("2d")?.clearRect(0, 0, c0.width, c0.height);
      const a0 = annoRef.current;
      if (a0) a0.getContext("2d")?.clearRect(0, 0, a0.width, a0.height);
      setBgReady(false);
      setTool("select");
    }
    mosaicCacheRef.current.clear();
    clearMosaicSnapshots();
    for (const b of histBmpRef.current.values()) b.close();
    histBmpRef.current.clear();
    prevAnnoLenRef.current = 0;
    candsRef.current = null;
    accentRef.current = null;
    dragRef.current = null;
    resizeRef.current = null;
    downPtRef.current = null;
    if (nativeDragRef.current) {
      nativeDragRef.current = false;
      void shotDragEnd().catch(() => {
      });
    }
    rootRef.current?.setAttribute("data-resetting", "1");
    setAnnos([]);
    setUndos([]);
    setTextEdit(null);
    setNumCnt(1);
    setShowMag(false);
    resetOcr();
    histOpenRef.current = false;
    setHistOpen(false);
    setHistViewing(false);
    histItemsRef.current = null;
    setHistItems(null);
    setHistPos(-1);
    setRegion({ x: 0, y: 0, w: 0, h: 0 });
    regRef.current = { x: 0, y: 0, w: 0, h: 0 };
    setPhase("idle");
    setSnap(null);
    setDragging(false);
    phaseRef.current = "idle";
    lastRectRef.current = null;
    snapRef.current = null;
    pngCacheRef.current = null;
    snapChainRef.current = null;
    snapIdxRef.current = 0;
    setChainLen(0);
    chainWinRef.current = null;
    elemFailAtRef.current = 0;
    lastDiagRef.current = null;
    setDimFx(false);
    pickedRef.current = null;
    if (pickerPanelRef.current) pickerPanelRef.current.style.left = "-9999px";
    if (pickerLineHRef.current) pickerLineHRef.current.style.top = "-9999px";
    if (pickerLineVRef.current) pickerLineVRef.current.style.left = "-9999px";
    if (pickerDotRef.current) {
      pickerDotRef.current.style.left = "-9999px";
      pickerDotRef.current.style.top = "-9999px";
    }
    if (magCopiedRef.current) magCopiedRef.current.style.display = "none";
    if (pickerCopiedRef.current) pickerCopiedRef.current.style.display = "none";
    while (true) {
      rerunRef.current = false;
      try {
        const g = await shotGeometry();
        if (mySession !== sessionRef.current) break;
        setGeom(g);
        candsRef.current = g.cands ?? null;
        if (!g) break;
        if (g.snap) {
          const sc = cssScale();
          const s = { x: g.snap.x / sc, y: g.snap.y / sc, w: g.snap.width / sc, h: g.snap.height / sc };
          setSnap(s);
          snapRef.current = s;
          lastRectRef.current = { x: g.snap.x + g.x, y: g.snap.y + g.y, w: g.snap.width, h: g.snap.height };
        } else if (g.prefill) {
          const sc = cssScale();
          const r = { x: g.prefill.x / sc, y: g.prefill.y / sc, w: g.prefill.width / sc, h: g.prefill.height / sc };
          setRegion(r);
          regRef.current = r;
          setPhase("selected");
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        setDimFx(true);
        await new Promise((r) => requestAnimationFrame(() => r()));
        await shotReady().catch(() => {
        });
        rootRef.current?.removeAttribute("data-resetting");
        frameReadyRef.current = (async () => {
          try {
            const ac = new AbortController();
            const ft = setTimeout(() => ac.abort(), 8e3);
            const resp = await fetch(shotFrameUrl(g.index), { signal: ac.signal }).catch(() => {
              throw new Error("frame protocol unavailable");
            });
            clearTimeout(ft);
            if (!resp.ok) throw new Error(`frame ${resp.status}`);
            const bmp = await createImageBitmap(await resp.blob());
            if (mySession !== sessionRef.current) {
              bmp.close();
              return;
            }
            const c = bgRef.current;
            if (c && bmp.width === g.width && bmp.height === g.height) {
              c.width = g.width;
              c.height = g.height;
              c.getContext("2d", { willReadFrequently: true }).drawImage(bmp, 0, 0);
              invalidateMosaicLayer();
              setBgReady(true);
              void loadHistBmp("__live__", shotFrameUrl(g.index));
            }
            bmp.close();
          } catch {
            try {
              const buf = await shotImageDataRaw();
              if (mySession !== sessionRef.current) return;
              const bytes = new Uint8ClampedArray(buf);
              if (bytes.length === g.width * g.height * 4) {
                for (let i = 0; i < bytes.length; i += 4) {
                  const b = bytes[i];
                  bytes[i] = bytes[i + 2];
                  bytes[i + 2] = b;
                }
                const c = bgRef.current;
                if (c) {
                  c.width = g.width;
                  c.height = g.height;
                  c.getContext("2d", { willReadFrequently: true }).putImageData(new ImageData(bytes, g.width, g.height), 0, 0);
                  invalidateMosaicLayer();
                  setBgReady(true);
                }
              }
            } catch {
            }
          }
        })();
      } catch {
      }
      if (!rerunRef.current) break;
    }
    rootRef.current?.removeAttribute("data-resetting");
    loadingRef.current = false;
  };
  reactExports.useEffect(() => {
    loadSession();
  }, []);
  const histBmpRef = reactExports.useRef(/* @__PURE__ */ new Map());
  const HIST_BMP_MAX = 4;
  const loadHistBmp = async (key, url) => {
    const hit = histBmpRef.current.get(key);
    if (hit) return hit;
    try {
      const ac = new AbortController();
      const ft = window.setTimeout(() => ac.abort(), 8e3);
      const resp = await fetch(url, { signal: ac.signal }).catch(() => null);
      window.clearTimeout(ft);
      if (!resp || !resp.ok) return null;
      const bmp = await createImageBitmap(await resp.blob());
      histBmpRef.current.set(key, bmp);
      while (histBmpRef.current.size > HIST_BMP_MAX) {
        const oldest = histBmpRef.current.keys().next().value;
        if (!oldest || oldest === key) break;
        histBmpRef.current.get(oldest)?.close();
        histBmpRef.current.delete(oldest);
      }
      return bmp;
    } catch {
      return null;
    }
  };
  const drawHistFrame = (bmp) => {
    const g = geomRef.current;
    const c = bgRef.current;
    if (!g || !c || bmp.width !== g.width || bmp.height !== g.height) return false;
    c.width = g.width;
    c.height = g.height;
    c.getContext("2d", { willReadFrequently: true }).drawImage(bmp, 0, 0);
    invalidateMosaicLayer();
    setBgReady(true);
    return true;
  };
  const showHistFrame = async (file) => {
    setAnnos([]);
    setUndos([]);
    mosaicCacheRef.current.clear();
    clearMosaicSnapshots();
    prevAnnoLenRef.current = 0;
    pngCacheRef.current = null;
    const a = annoRef.current;
    if (a) a.getContext("2d")?.clearRect(0, 0, a.width, a.height);
    const g = geomRef.current;
    if (!g) return;
    const key = file || "__live__";
    let bmp = await loadHistBmp(key, `${shotFrameUrl(g.index)}?v=${encodeURIComponent(key)}`);
    if (!bmp && file) bmp = await loadHistBmp(key, shotHistoryUrl(file));
    if (bmp) drawHistFrame(bmp);
    void (async () => {
      const items = histItemsRef.current ?? [];
      const idx = items.findIndex((i) => i.file === file);
      if (file && idx >= 0) {
        if (idx + 1 < items.length) await loadHistBmp(items[idx + 1].file, shotHistoryUrl(items[idx + 1].file));
        if (idx - 1 >= 0) await loadHistBmp(items[idx - 1].file, shotHistoryUrl(items[idx - 1].file));
      }
    })();
  };
  reactExports.useEffect(() => {
    const un = listen("shot://drag-first-paint", () => {
    });
    return () => {
      un.then((f) => f());
    };
  }, []);
  reactExports.useEffect(() => {
    const un = listen("shot-refresh", () => {
      loadSession();
    });
    return () => {
      un.then((f) => f());
    };
  }, []);
  reactExports.useEffect(() => {
    const un = listen("shot://cands", (e) => {
      candsRef.current = e.payload;
      lastRectRef.current = null;
    });
    return () => {
      un.then((f) => f());
    };
  }, []);
  reactExports.useEffect(() => {
    if (!geom || !bgReady) return;
    const c = annoRef.current;
    if (!c) return;
    if (c.width !== geom.width) c.width = geom.width;
    if (c.height !== geom.height) c.height = geom.height;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, geom.width, geom.height);
    if (annos.length !== prevAnnoLenRef.current) mosaicCacheRef.current.clear();
    prevAnnoLenRef.current = annos.length;
    const scale = cssScale();
    annos.forEach((s) => {
      drawShape(ctx, s, bgRef.current, mosaicCacheRef.current, scale);
    });
  }, [annos, geom, bgReady]);
  reactExports.useEffect(() => {
    const h = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (histOpenRef.current) {
          histOpenRef.current = false;
          setHistOpen(false);
          return;
        }
        if (ocrActiveRef.current) {
          resetOcr();
          return;
        }
        void shotCancel().catch(() => {
        });
      } else if (pickerModeRef.current) {
        if (e.code === "KeyC" && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          if (!e.repeat) copyPicked(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (!e.repeat) copyPicked(true);
        } else if (e.key === "Shift" && !e.repeat) {
          toggleColorFmt();
        }
      } else if (e.key === "Enter" && phase === "selected") {
        const sel = ocrActiveRef.current ? window.getSelection?.()?.toString() ?? "" : "";
        if (sel.trim()) return;
        e.preventDefault();
        if (!e.repeat) void doOutput("copy");
      } else if (e.code === "KeyC" && e.ctrlKey && phase === "idle") {
        const s = snapRef.current;
        if (!s) return;
        e.preventDefault();
        if (e.repeat) return;
        regRef.current = s;
        setRegion(s);
        snapRef.current = null;
        setSnap(null);
        setPhase("selected");
        phaseRef.current = "selected";
        const g = geomRef.current;
        const sc = cssScale();
        void shotSaveRegion([s.x * sc + (g?.x ?? 0), s.y * sc + (g?.y ?? 0), s.w * sc, s.h * sc]).catch(() => {
        });
        void doOutput("copy");
      } else if (e.code === "KeyC" && e.ctrlKey && phase === "selected") {
        const sel = ocrActiveRef.current ? window.getSelection?.()?.toString() ?? "" : "";
        if (sel.trim()) return;
        e.preventDefault();
        if (!e.repeat) void doOutput("copy");
      } else if (e.code === "KeyP" && phase === "selected" && !e.ctrlKey && !e.altKey) {
        const sel = ocrActiveRef.current ? window.getSelection?.()?.toString() ?? "" : "";
        if (sel.trim()) return;
        e.preventDefault();
        if (!e.repeat) void doOutput("pin");
      } else if (e.ctrlKey && e.code.startsWith("Digit") && phase === "selected") {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= TOOL_BUTTONS.length) {
          e.preventDefault();
          if (!e.repeat) {
            applyToolButton(TOOL_BUTTONS[n - 1]);
            setSubmenuOpen(null);
          }
        }
      } else if ((phase === "idle" || phase === "selected") && !textEditRef.current && e.code === "KeyC" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (!e.repeat) copyPicked(false);
      } else if ((phase === "idle" || phase === "selected") && !textEditRef.current && e.key === "Shift" && !e.repeat) {
        toggleColorFmt();
      } else if (e.key === "Tab" && showMagRef.current && !pickerModeRef.current && !textEditRef.current) {
        e.preventDefault();
        if (e.repeat) return;
        const next = !magCircleRef.current;
        magCircleRef.current = next;
        setMagCircle(next);
        const st = useConfigStore.getState();
        void updateCfg({ ...st.config, shot: { ...st.config.shot, magnifier_round: next } });
        if (magCopiedRef.current) {
          magCopiedRef.current.textContent = next ? "已切换为圆形" : "已切换为方形";
          magCopiedRef.current.style.display = "";
          window.clearTimeout(copyTimerRef.current);
          copyTimerRef.current = window.setTimeout(() => {
            if (magCopiedRef.current) magCopiedRef.current.style.display = "none";
          }, 900);
        }
      } else if ((phase === "idle" || phase === "selected") && cfg.shot.history_enabled !== false && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "<" || e.key === ",")) {
        e.preventDefault();
        if (!e.repeat) void stepHistory(1);
      } else if ((phase === "idle" || phase === "selected") && cfg.shot.history_enabled !== false && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === ">" || e.key === ".")) {
        e.preventDefault();
        if (!e.repeat) void stepHistory(-1);
      } else if (phase === "idle" && cfg.shot.history_enabled !== false && !e.ctrlKey && !e.altKey && !e.metaKey && e.code === "KeyH") {
        e.preventDefault();
        if (!e.repeat) void toggleHistPanel();
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const r = { ...regRef.current };
        if (e.key === "ArrowLeft") r.x -= d;
        else if (e.key === "ArrowRight") r.x += d;
        else if (e.key === "ArrowUp") r.y -= d;
        else r.y += d;
        setRegion(r);
        regRef.current = r;
      } else if (e.code === "KeyZ" && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        if (annos.length > 0) {
          setUndos((u) => [...u, [...annos]]);
          setAnnos((a) => a.slice(0, -1));
        }
      } else if (e.code === "KeyZ" && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (undos.length > 0) {
          setAnnos(undos[undos.length - 1]);
          setUndos((u) => u.slice(0, -1));
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [phase, annos, undos]);
  reactExports.useEffect(() => {
    const h = (e) => {
      if (e.key === "Alt" && !e.repeat) {
        e.preventDefault();
        const ph = ocrPhaseRef.current;
        if (ph === "idle" || ph === "error") {
          void runOcrRef.current();
        } else if (ph === "done") {
          setAltActive((v) => {
            const nv = !v;
            if (!nv) applyScrSel([]);
            return nv;
          });
        }
        return;
      }
      if (e.key === "Escape" && altActiveRef.current) {
        setAltActive(false);
        applyScrSel([]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "c" || e.key === "C") && altActiveRef.current && hasScrSelRef.current) {
        e.preventDefault();
        const t = buildScrText(scrSelRef.current);
        if (t) void copyText(t, true).catch(() => {
        });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const toCanvas = (e) => {
    const r = bgRef.current?.getBoundingClientRect();
    if (!r || !geom) return { x: 0, y: 0 };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const paintSelCanvas = (phaseNow) => {
    const cv = selCanvasRef.current;
    if (!cv || !geom || geom.picker) return;
    if (cv.width !== geom.width) cv.width = geom.width;
    if (cv.height !== geom.height) cv.height = geom.height;
    const ctx = selCtxRef.current ??= cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, geom.width, geom.height);
    const rc = bgRef.current?.getBoundingClientRect();
    const scale = rc && rc.width > 0 ? geom.width / rc.width : 1;
    const accent = accentRef.current ??= `rgb(${(getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb") || "76,141,255").trim()})`;
    const selected = (phaseNow ?? phaseRef.current) === "selected";
    const draggingNow = !!dragRef.current || !!resizeRef.current;
    const reg = regRef.current;
    const snap2 = snapRef.current;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, geom.width, geom.height);
    if (selected || draggingNow) {
      const rx = reg.x * scale, ry = reg.y * scale, rw = reg.w * scale, rh = reg.h * scale;
      ctx.clearRect(rx, ry, rw, rh);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(rx, ry, rw, rh);
    } else if (snap2) {
      const sx = snap2.x * scale, sy = snap2.y * scale, sw2 = snap2.w * scale, sh2 = snap2.h * scale;
      ctx.clearRect(sx, sy, sw2, sh2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5 * scale;
      ctx.strokeRect(sx, sy, sw2, sh2);
    }
    if (selected) {
      const hs = 8 * scale;
      ctx.lineWidth = Math.max(1, scale);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = accent;
      for (const [hx, hy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
        const x = (reg.x + (hx === -1 ? 0 : hx === 1 ? reg.w : reg.w / 2)) * scale;
        const y = (reg.y + (hy === -1 ? 0 : hy === 1 ? reg.h : reg.h / 2)) * scale;
        ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
        ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
      }
    }
  };
  reactExports.useEffect(() => {
    paintSelCanvas(phase);
  }, [region, snap, phase, dragging, geom, bgReady]);
  const queueSelPaint = () => {
    if (selPaintRafRef.current) return;
    selPaintRafRef.current = requestAnimationFrame(() => {
      selPaintRafRef.current = 0;
      paintSelCanvas();
    });
  };
  const cancelSelPaint = () => {
    if (selPaintRafRef.current) {
      cancelAnimationFrame(selPaintRafRef.current);
      selPaintRafRef.current = 0;
    }
  };
  const detectBusyRef = reactExports.useRef(false);
  const detectPendingRef = reactExports.useRef(false);
  const mouseGlobalRef = reactExports.useRef({ x: 0, y: 0 });
  const lastRectRef = reactExports.useRef(null);
  const elemFailAtRef = reactExports.useRef(0);
  const staleRefireCountRef = reactExports.useRef(0);
  const lastDiagRef = reactExports.useRef(null);
  const snapRef = reactExports.useRef(null);
  const snapChainRef = reactExports.useRef(null);
  const snapIdxRef = reactExports.useRef(0);
  const chainWinRef = reactExports.useRef(null);
  const [chainLen, setChainLen] = reactExports.useState(0);
  const [histOpen, setHistOpen] = reactExports.useState(false);
  const histOpenRef = reactExports.useRef(false);
  const [histItems, setHistItems] = reactExports.useState(null);
  const histItemsRef = reactExports.useRef(null);
  const [histPos, setHistPos] = reactExports.useState(-1);
  const histPanelRef = reactExports.useRef(null);
  const [histViewing, setHistViewing] = reactExports.useState(false);
  const histBusyRef = reactExports.useRef(false);
  const ensureHistItems = async () => {
    if (histItemsRef.current) return histItemsRef.current;
    try {
      const l = await shotHistoryList();
      histItemsRef.current = l;
      setHistItems(l);
    } catch {
    }
    return histItemsRef.current ?? [];
  };
  const stepHistoryCore = async (dir, index) => {
    if (histBusyRef.current || dragRef.current || resizeRef.current || pickerModeRef.current) return;
    histBusyRef.current = true;
    try {
      const r = await shotHistoryStep(dir, index);
      if (r === void 0) return void 0;
      await showHistFrame(r === "live" ? "" : r);
      setHistViewing(r !== "live");
      const items = await ensureHistItems();
      setHistPos(r === "live" ? -1 : items.findIndex((i) => i.file === r));
      return r;
    } catch {
      return void 0;
    } finally {
      histBusyRef.current = false;
    }
  };
  const stepHistory = (dir) => void (async () => {
    const r = await stepHistoryCore(dir);
    if (r === void 0) return;
    await applyHistRegion(r === "live" ? "" : r);
    if (!histOpenRef.current) {
      histOpenRef.current = true;
      setHistOpen(true);
    }
  })();
  const histRestoreRef = reactExports.useRef(false);
  const histSaveTimer = reactExports.useRef(0);
  reactExports.useEffect(() => {
    if (phase !== "selected" || dragging || textEdit || !geom) return;
    if (histRestoreRef.current) {
      histRestoreRef.current = false;
      return;
    }
    window.clearTimeout(histSaveTimer.current);
    histSaveTimer.current = window.setTimeout(() => {
      const r = regRef.current;
      if (r.w <= 0 || r.h <= 0) return;
      const sc = cssScale();
      void shotHistorySaveRegion([
        Math.round(r.x * sc),
        Math.round(r.y * sc),
        Math.round(r.w * sc),
        Math.round(r.h * sc)
      ]).catch(() => {
      });
    }, 250);
    return () => {
      window.clearTimeout(histSaveTimer.current);
    };
  }, [phase, dragging, region, textEdit, geom]);
  const applyHistRegion = async (file) => {
    const g = geomRef.current;
    if (!g) return;
    const it = histItemsRef.current?.find((i) => i.file === file);
    if (!it?.region || it.region.length !== 4) return;
    const sc = cssScale();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const w = Math.max(8, Math.min(it.region[2] / sc, vw));
    const h = Math.max(8, Math.min(it.region[3] / sc, vh));
    const x = Math.max(0, Math.min(it.region[0] / sc, vw - w));
    const y = Math.max(0, Math.min(it.region[1] / sc, vh - h));
    const reg = { x, y, w, h };
    histRestoreRef.current = true;
    setRegion(reg);
    regRef.current = reg;
    setPhase("selected");
    phaseRef.current = "selected";
  };
  const jumpHistory = (index) => void (async () => {
    const r = await stepHistoryCore(0, index);
    if (r === void 0) return;
    await applyHistRegion(r === "live" ? "" : r);
  })();
  const deleteHist = (file) => void (async () => {
    const old = histItemsRef.current ?? [];
    const delIdx = old.findIndex((i) => i.file === file);
    const wasCurrent = delIdx >= 0 && histPos === delIdx;
    try {
      await shotHistoryDelete(file);
    } catch {
      return;
    }
    if (wasCurrent) await stepHistoryCore(0, -1);
    try {
      const l = await shotHistoryList();
      histItemsRef.current = l;
      setHistItems(l);
      setHistPos((p) => wasCurrent ? -1 : p > delIdx ? p - 1 : p);
    } catch {
    }
  })();
  const clearHist = () => void (async () => {
    await shotHistoryClear().catch(() => {
    });
    await stepHistoryCore(0, -1).catch(() => {
    });
    histItemsRef.current = [];
    setHistItems([]);
    setHistPos(-1);
    setHistViewing(false);
  })();
  const toggleHistPanel = async () => {
    const next = !histOpenRef.current;
    histOpenRef.current = next;
    setHistOpen(next);
    if (next) {
      try {
        const l = await shotHistoryList();
        histItemsRef.current = l;
        setHistItems(l);
      } catch {
        histItemsRef.current = [];
        setHistItems([]);
      }
    }
  };
  reactExports.useEffect(() => {
    const panel = histPanelRef.current;
    if (!histOpen || !panel) return;
    const el = panel.querySelector(".shot-hist-item.active");
    if (!el) return;
    const pr = panel.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (er.left < pr.left || er.right > pr.right) {
      panel.scrollTo({ left: el.offsetLeft - (panel.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
    }
  }, [histPos, histOpen, histItems]);
  const [ocrPhase, setOcrPhase] = reactExports.useState("idle");
  const ocrPhaseRef = reactExports.useRef(ocrPhase);
  reactExports.useEffect(() => {
    ocrPhaseRef.current = ocrPhase;
  }, [ocrPhase]);
  const [ocrLines, setOcrLines] = reactExports.useState([]);
  const [ocrError, setOcrError] = reactExports.useState("");
  const ocrBusyRef = reactExports.useRef(false);
  const [ocrTranslating, setOcrTranslating] = reactExports.useState(false);
  const [ocrTrans, setOcrTrans] = reactExports.useState(null);
  const ocrActiveRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    ocrActiveRef.current = ocrPhase !== "idle";
  }, [ocrPhase]);
  const [altActive, setAltActive] = reactExports.useState(false);
  const altActiveRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    altActiveRef.current = altActive;
  }, [altActive]);
  const [scrSel, setScrSel] = reactExports.useState([]);
  const scrSelRef = reactExports.useRef([]);
  const hasScrSelRef = reactExports.useRef(false);
  const textSelectingRef = reactExports.useRef(false);
  const applyScrSel = (sel) => {
    scrSelRef.current = sel;
    hasScrSelRef.current = sel.length > 0;
    setScrSel(sel);
  };
  const ocrLinesRef = reactExports.useRef(ocrLines);
  ocrLinesRef.current = ocrLines;
  const runOcrRef = reactExports.useRef(() => {
  });
  runOcrRef.current = () => {
    void runOcr();
  };
  const resetOcr = () => {
    setOcrPhase("idle");
    setOcrLines([]);
    setOcrError("");
    setOcrTrans(null);
    setOcrTranslating(false);
    setAltActive(false);
    applyScrSel([]);
  };
  reactExports.useEffect(() => {
    let un;
    listen(EVT_TRANSLATE_LINE, (e) => {
      const { i, out, ok } = e.payload;
      setOcrTrans(
        (prev) => !prev || i >= prev.pairs.length ? prev : { ...prev, pairs: prev.pairs.map((p, k) => k === i ? { ...p, out, ok, pending: false } : p) }
      );
    }).then((f) => {
      un = f;
    });
    return () => {
      un?.();
    };
  }, []);
  const runOcr = async () => {
    if (ocrBusyRef.current) return;
    const bg = bgRef.current;
    const r = regRef.current;
    if (!bg || !geom || bg.width <= 0) return;
    const sc = cssScale();
    const rp = { x: Math.round(r.x * sc), y: Math.round(r.y * sc), w: Math.round(r.w * sc), h: Math.round(r.h * sc) };
    if (rp.w < 2 || rp.h < 2) return;
    const c = document.createElement("canvas");
    c.width = rp.w;
    c.height = rp.h;
    c.getContext("2d").drawImage(bg, rp.x, rp.y, rp.w, rp.h, 0, 0, rp.w, rp.h);
    ocrBusyRef.current = true;
    setOcrPhase("loading");
    try {
      const blob = await new Promise((res) => c.toBlob((b) => res(b), "image/png"));
      if (!blob) throw new Error("图像编码失败");
      const lines = await shotOcrPost(blob);
      setOcrLines(lines);
      setOcrPhase("done");
      if (lines.length) setAltActive(true);
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : "识别失败");
      setOcrPhase("error");
    } finally {
      ocrBusyRef.current = false;
    }
  };
  const doTranslate = async () => {
    const sel = window.getSelection?.()?.toString().trim() || "";
    const srcs = (sel || ocrLines.map((l) => l.text).join("\n")).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!srcs.length) return;
    setOcrTranslating(true);
    setOcrTrans({
      err: "",
      pairs: srcs.map((s) => ({ src: s, out: "", ok: true, pending: true }))
    });
    try {
      const res = await translateLines(srcs);
      setOcrTrans({
        err: "",
        pairs: srcs.map((s, i) => ({
          src: s,
          out: res[i]?.out ?? s,
          ok: res[i]?.ok !== false,
          pending: false
        }))
      });
    } catch (err) {
      setOcrTrans({ pairs: [], err: err instanceof Error ? err.message : String(err) });
    } finally {
      setOcrTranslating(false);
    }
  };
  const copyAllOcr = () => {
    const all = ocrLines.map((l) => l.text).join("\n");
    if (all) void copyText(all, true);
  };
  const copyTransOut = () => {
    if (!ocrTrans?.pairs.length) return;
    const all = ocrTrans.pairs.filter((p) => !p.pending).map((p) => p.out).join("\n");
    if (all) void copyText(all, true);
  };
  const scrCollect = (x0, y0, x1, y1) => {
    const L = ocrLinesRef.current;
    const picked = [];
    for (let li = 0; li < L.length; li++) {
      const line = L[li];
      const ly0 = line.y, ly1 = line.y + line.h, lcy = line.y + line.h / 2;
      const iy = Math.min(y1, ly1) - Math.max(y0, ly0);
      const contained = y0 >= ly0 && y1 <= ly1;
      if (!(iy >= line.h * 0.4 || lcy >= y0 && lcy <= y1 || contained)) continue;
      const words = line.words;
      for (let wi = 0; wi < words.length; wi++) {
        const wd = words[wi];
        const ix = Math.min(x1, wd.x + wd.w) - Math.max(x0, wd.x);
        const cx = wd.x + wd.w / 2;
        if (ix > 0 || cx >= x0 && cx <= x1) picked.push({ li, wi });
      }
    }
    return picked;
  };
  const buildScrText = (sel) => {
    const L = ocrLinesRef.current;
    if (!L.length || !sel.length) return "";
    const byLine = /* @__PURE__ */ new Map();
    for (const p of sel) {
      const wd = L[p.li]?.words[p.wi];
      if (!wd || !wd.t) continue;
      let arr = byLine.get(p.li);
      if (!arr) {
        arr = [];
        byLine.set(p.li, arr);
      }
      arr.push(wd);
    }
    return [...byLine.entries()].sort((a, b) => L[a[0]].y - L[b[0]].y).map(([, ws]) => {
      ws.sort((a, b) => a.x - b.x);
      let out = "";
      let prevRight = NaN, prevH = NaN;
      for (const w of ws) {
        if (!Number.isNaN(prevRight) && w.x - prevRight > prevH * 0.35) out += " ";
        out += w.t;
        prevRight = w.x + w.w;
        prevH = Math.max(prevH || 0, w.h);
      }
      return out.trim();
    }).filter(Boolean).join("\n");
  };
  const beginScreenshotTextSelect = (e) => {
    if (e.button !== 0) return;
    const lines = ocrLinesRef.current;
    if (!lines.length) return;
    const reg = regRef.current;
    const sc = cssScale();
    const toOrig = (cx, cy) => ({ x: (cx - reg.x) * sc, y: (cy - reg.y) * sc });
    e.preventDefault();
    textSelectingRef.current = true;
    const a = toOrig(e.clientX, e.clientY);
    let raf = 0;
    let lastSel = [];
    const move = (ev) => {
      const b = toOrig(ev.clientX, ev.clientY);
      lastSel = scrCollect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        applyScrSel(lastSel);
      });
    };
    const finish = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      document.removeEventListener("mouseleave", onLeave);
      textSelectingRef.current = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      applyScrSel(lastSel.length ? lastSel : []);
    };
    const onLeave = () => finish();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    document.addEventListener("mouseleave", onLeave);
  };
  const querySmartRect = async () => {
    const mySession = sessionRef.current;
    const g = geom;
    const mg = mouseGlobalRef.current;
    if (!g) return;
    const wantElem = cfg.shot.smart_element !== false;
    const sc = cssScale();
    const toLocal = (r) => ({ x: (r.x - g.x) / sc, y: (r.y - g.y) / sc, w: r.width / sc, h: r.height / sc });
    let locked = false;
    const commit = (best) => {
      if (dragRef.current || resizeRef.current || pickerModeRef.current) return;
      if (mySession !== sessionRef.current) return;
      lastRectRef.current = best ? { x: best.x, y: best.y, w: best.width, h: best.height } : null;
      const local = best ? toLocal(best) : null;
      const cur = snapRef.current;
      const same = cur === null && local === null || cur !== null && local !== null && cur.x === local.x && cur.y === local.y && cur.w === local.w && cur.h === local.h;
      snapRef.current = local;
      if (!same) setSnap(local);
    };
    let wr = null;
    let wrDone = null;
    const cands = candsRef.current;
    const clearChain = () => {
      snapChainRef.current = null;
      snapIdxRef.current = 0;
      setChainLen(0);
      chainWinRef.current = null;
    };
    const sameWinAsShown = (win) => {
      const cw = chainWinRef.current;
      return !!(cw && win && cw.x === win.x && cw.y === win.y && cw.width === win.width && cw.height === win.height && snapRef.current);
    };
    if (cands) {
      for (const c of cands) {
        if (mg.x >= c.x && mg.x < c.x + c.width && mg.y >= c.y && mg.y < c.y + c.height) {
          wr = c;
          break;
        }
      }
      if (!sameWinAsShown(wr)) {
        clearChain();
        commit(wr);
        chainWinRef.current = wr;
      }
    } else {
      const wrPromise = shotWindowRectAt(mg.x, mg.y).catch(() => null);
      void wrPromise.then((r) => {
        if (locked || sameWinAsShown(r)) return;
        clearChain();
        commit(r);
        chainWinRef.current = r;
      });
      wrDone = wrPromise;
    }
    if (detectBusyRef.current) {
      detectPendingRef.current = true;
      return;
    }
    detectBusyRef.current = true;
    let staleRefire = false;
    try {
      const landChain = (g0, erArr, winRect) => {
        const s0 = cssScale();
        const lv2 = erArr.slice();
        const ch2 = erArr.map((r) => ({
          x: (r.x - g0.x) / s0,
          y: (r.y - g0.y) / s0,
          w: r.width / s0,
          h: r.height / s0
        }));
        if (winRect) {
          const wl = {
            x: (winRect.x - g0.x) / s0,
            y: (winRect.y - g0.y) / s0,
            w: winRect.width / s0,
            h: winRect.height / s0
          };
          const last = ch2[ch2.length - 1];
          if (Math.abs(last.x - wl.x) > 1 || Math.abs(last.y - wl.y) > 1 || Math.abs(last.w - wl.w) > 1 || Math.abs(last.h - wl.h) > 1) {
            ch2.push(wl);
            lv2.push(winRect);
          }
        }
        return { ch: ch2, lv: lv2 };
      };
      const pickIdx = (ch2, fallback) => {
        const cur = snapRef.current;
        if (snapChainRef.current && cur) {
          const i = ch2.findIndex((r) => Math.abs(r.x - cur.x) <= 1 && Math.abs(r.y - cur.y) <= 1 && Math.abs(r.w - cur.w) <= 1 && Math.abs(r.h - cur.h) <= 1);
          if (i >= 0) return i;
        }
        return Math.min(Math.max(fallback, 0), ch2.length - 1);
      };
      const erTimeout = new Promise((res) => setTimeout(() => res(null), 320));
      const erPromise = wantElem ? shotUiRectAt(mg.x, mg.y).catch(() => null) : Promise.resolve(null);
      const er = wantElem ? await Promise.race([erPromise, erTimeout]) : await erPromise;
      if (!er || er.length === 0 || !(er[0].width > 0 && er[0].height > 0)) {
        elemFailAtRef.current = Date.now();
        lastRectRef.current = null;
        void erPromise.then((late) => {
          if (!late || late.length === 0 || !(late[0].width > 0 && late[0].height > 0)) return;
          if (dragRef.current || resizeRef.current || pickerModeRef.current) return;
          if (mySession !== sessionRef.current) return;
          const g2 = geomRef.current;
          if (!g2) return;
          const mgi = mouseGlobalRef.current;
          const inner = late[0];
          const inside = mgi.x >= inner.x - 8 && mgi.x <= inner.x + inner.width + 8 && mgi.y >= inner.y - 8 && mgi.y <= inner.y + inner.height + 8;
          if (!inside) return;
          const { ch: ch2, lv: lv2 } = landChain(g2, late, wr);
          const idx2 = pickIdx(ch2, 0);
          snapChainRef.current = ch2;
          snapIdxRef.current = idx2;
          setChainLen(ch2.length);
          chainWinRef.current = wr;
          lastRectRef.current = { x: lv2[idx2].x, y: lv2[idx2].y, w: lv2[idx2].width, h: lv2[idx2].height };
          const r = ch2[idx2];
          snapRef.current = r;
          setSnap(r);
          elemFailAtRef.current = 0;
        });
        return;
      }
      elemFailAtRef.current = 0;
      const wrFinal = wrDone ? await wrDone : wr;
      if (wrFinal) {
        const mgn = mouseGlobalRef.current;
        if (mgn.x < wrFinal.x || mgn.x > wrFinal.x + wrFinal.width || mgn.y < wrFinal.y || mgn.y > wrFinal.y + wrFinal.height) {
          staleRefire = true;
          return;
        }
      }
      const er0 = er[0];
      const { ch, lv } = landChain(g, er, wrFinal);
      const ea = er0.width * er0.height;
      const wa = wrFinal ? wrFinal.width * wrFinal.height : Infinity;
      const screenArea = g.width * g.height;
      const preferInner = ea < wa * 0.98 && ea < screenArea * 0.9;
      const idx = pickIdx(ch, preferInner ? 0 : ch.length - 1);
      snapChainRef.current = ch;
      snapIdxRef.current = idx;
      setChainLen(ch.length);
      locked = true;
      commit(lv[idx]);
      chainWinRef.current = wrFinal;
      const cb = lastRectRef.current;
      const mgNow = mouseGlobalRef.current;
      staleRefire = !!cb && (mgNow.x < cb.x - 8 || mgNow.x > cb.x + cb.w + 8 || mgNow.y < cb.y - 8 || mgNow.y > cb.y + cb.h + 8);
    } catch {
    } finally {
      detectBusyRef.current = false;
      if (staleRefire) {
        staleRefireCountRef.current += 1;
        if (staleRefireCountRef.current <= 3) detectPendingRef.current = true;
      }
      if (detectPendingRef.current && mySession === sessionRef.current && !dragRef.current && !resizeRef.current && !pickerModeRef.current) {
        detectPendingRef.current = false;
        void querySmartRect();
      }
    }
  };
  const moveRafRef = reactExports.useRef(0);
  const movePtRef = reactExports.useRef({ x: 0, y: 0 });
  const selCanvasRef = reactExports.useRef(null);
  const selCtxRef = reactExports.useRef(null);
  const handlersRef = reactExports.useRef(null);
  const selPaintRafRef = reactExports.useRef(0);
  const accentRef = reactExports.useRef(null);
  const magBoxRef = reactExports.useRef(null);
  const magCanvasRef = reactExports.useRef(null);
  const [magCircle, setMagCircle] = reactExports.useState(false);
  const magCircleRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    magCircleRef.current = magCircle;
  }, [magCircle]);
  reactExports.useEffect(() => {
    setMagCircle(cfg.shot.magnifier_round ?? false);
  }, [cfg.shot.magnifier_round]);
  const showMagRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    showMagRef.current = showMag;
  }, [showMag]);
  const magCoordRef = reactExports.useRef(null);
  const magSwatchRef = reactExports.useRef(null);
  const magValRef = reactExports.useRef(null);
  const magFmtRef = reactExports.useRef(null);
  const magCopiedRef = reactExports.useRef(null);
  const pickerLineHRef = reactExports.useRef(null);
  const pickerLineVRef = reactExports.useRef(null);
  const pickerDotRef = reactExports.useRef(null);
  const pickerPanelRef = reactExports.useRef(null);
  const pickerCoordRef = reactExports.useRef(null);
  const pickerSwatchRef = reactExports.useRef(null);
  const pickerValRef = reactExports.useRef(null);
  const pickerFmtRef = reactExports.useRef(null);
  const pickerCopiedRef = reactExports.useRef(null);
  const syncFmtBadges = (f) => {
    const t = f.toUpperCase();
    if (magFmtRef.current) magFmtRef.current.textContent = t;
    if (pickerFmtRef.current) pickerFmtRef.current.textContent = t;
  };
  const geomRef = reactExports.useRef(geom);
  reactExports.useEffect(() => {
    geomRef.current = geom;
  }, [geom]);
  const candsRef = reactExports.useRef(null);
  const cssScale = () => {
    const g = geomRef.current;
    if (!g || window.innerWidth <= 0) return 1;
    const byViewport = g.width / window.innerWidth;
    const dpr = window.devicePixelRatio || 1;
    return Math.abs(byViewport - dpr) > 0.02 ? dpr : byViewport;
  };
  const phaseRef = reactExports.useRef(phase);
  reactExports.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const nativeDragRef = reactExports.useRef(false);
  const rootRef = reactExports.useRef(null);
  const cssToGlobal = (pt) => {
    const g = geomRef.current;
    const k = cssScale();
    return g ? { x: Math.round(pt.x * k) + g.x, y: Math.round(pt.y * k) + g.y } : { x: pt.x, y: pt.y };
  };
  const accentRGB = () => {
    const m = (accentRef.current ?? "").match(/\d+/g);
    return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [76, 141, 255];
  };
  const beginNativeDrag = (mode, hx = 0, hy = 0, start) => {
    if (nativeDragRef.current || pickerModeRef.current) return;
    nativeDragRef.current = true;
    cancelSelPaint();
    const g = geomRef.current;
    const anchor = mode === 0 && dragRef.current ? cssToGlobal(dragRef.current) : { x: 0, y: 0 };
    let s = { sx: 0, sy: 0, sw: 0, sh: 0 };
    if (start && g) {
      const sp = cssToGlobal({ x: start.x, y: start.y });
      const k = cssScale();
      s = { sx: sp.x, sy: sp.y, sw: Math.round(start.w * k), sh: Math.round(start.h * k) };
    }
    void shotDragBegin({
      mode,
      ax: anchor.x,
      ay: anchor.y,
      hx,
      hy,
      ...s,
      accent: accentRGB(),
      scale: cssScale()
    }).catch(() => {
    });
  };
  const handoverNativeDrag = (paint) => {
    const wasNative = nativeDragRef.current;
    nativeDragRef.current = false;
    paint();
    if (wasNative) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        void shotDragEnd().catch(() => {
        });
      }));
    }
  };
  const drawMagnifier = () => {
    const box = magBoxRef.current, c = magCanvasRef.current;
    const g = geomRef.current;
    if (!box || !c || !g || !bgRef.current) return;
    const m = mouseRef.current;
    const scale = cssScale();
    const mx = m.x, my = m.y;
    const vw = window.innerWidth, vh = window.innerHeight;
    const halfW = MAG_BOX_W / 2;
    let left = mx - halfW;
    if (left < 4) left = 4;
    else if (left + MAG_BOX_W > vw - 4) left = vw - MAG_BOX_W - 4;
    box.style.left = `${left}px`;
    box.style.top = `${my < vh - MAG - 130 ? my + 20 : my - MAG - 150}px`;
    c.width = MAG;
    c.height = MAG;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const src = MAG / MAG_Z;
    ctx.clearRect(0, 0, MAG, MAG);
    const sx = (m.x - src / 2) * scale, sy = (m.y - src / 2) * scale, sSize = src * scale;
    ctx.drawImage(bgRef.current, sx, sy, sSize, sSize, 0, 0, MAG, MAG);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MAG / 2, 0);
    ctx.lineTo(MAG / 2, MAG);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, MAG / 2);
    ctx.lineTo(MAG, MAG / 2);
    ctx.stroke();
    if (magCoordRef.current) magCoordRef.current.textContent = `(${m.x},${m.y})`;
    const col = sampleColor(m.x * scale, m.y * scale);
    if (col) {
      pickedRef.current = col;
      if (magSwatchRef.current) magSwatchRef.current.style.background = `rgb(${col[0]},${col[1]},${col[2]})`;
      if (magValRef.current) magValRef.current.textContent = fmtDisplay(col, colorFmtRef.current);
      syncFmtBadges(colorFmtRef.current);
    }
  };
  const updatePickerVisual = (pt) => {
    const g = geomRef.current;
    const panel = pickerPanelRef.current;
    if (!g || !panel || !bgRef.current) return;
    const scale = cssScale();
    const px = pt.x, py = pt.y;
    if (pickerLineHRef.current) pickerLineHRef.current.style.top = `${py}px`;
    if (pickerLineVRef.current) pickerLineVRef.current.style.left = `${px}px`;
    if (pickerDotRef.current) {
      pickerDotRef.current.style.left = `${px - 5}px`;
      pickerDotRef.current.style.top = `${py - 5}px`;
    }
    const pw = 220, ph = 130;
    const vw = window.innerWidth, vh = window.innerHeight;
    panel.style.left = `${px + 18 + pw > vw ? px - 18 - pw : px + 18}px`;
    panel.style.top = `${py + 18 + ph > vh ? py - 18 - ph : py + 18}px`;
    if (pickerCoordRef.current) {
      pickerCoordRef.current.textContent = `(${Math.round(pt.x * scale) + g.x} , ${Math.round(pt.y * scale) + g.y})`;
    }
    const col = sampleColor(pt.x * scale, pt.y * scale);
    if (col) {
      pickedRef.current = col;
      if (pickerSwatchRef.current) pickerSwatchRef.current.style.background = `rgb(${col[0]},${col[1]},${col[2]})`;
      if (pickerValRef.current) pickerValRef.current.textContent = fmtDisplay(col, colorFmtRef.current);
      syncFmtBadges(colorFmtRef.current);
    }
  };
  const applyMoveVisual = (pt) => {
    mouseRef.current = pt;
    if (pickerModeRef.current) {
      updatePickerVisual(pt);
      return;
    }
    setShowMag(true);
    drawMagnifier();
    if (resizeRef.current) {
      const { hx, hy, start, startPt } = resizeRef.current;
      const dx = pt.x - startPt.x, dy = pt.y - startPt.y;
      let x = start.x, y = start.y, w = start.w, h = start.h;
      if (hx === -1) {
        x = start.x + dx;
        w = start.w - dx;
      } else if (hx === 1) {
        w = start.w + dx;
      }
      if (hy === -1) {
        y = start.y + dy;
        h = start.h - dy;
      } else if (hy === 1) {
        h = start.h + dy;
      }
      if (w < 0) {
        x += w;
        w = -w;
      }
      if (h < 0) {
        y += h;
        h = -h;
      }
      if (w >= 2 && h >= 2) {
        const r = { x, y, w, h };
        regRef.current = r;
        beginNativeDrag(1, hx, hy, start);
        queueSelPaint();
      }
      return;
    }
    if (phaseRef.current === "idle" && dragRef.current) {
      const s = dragRef.current;
      const r = { x: Math.min(s.x, pt.x), y: Math.min(s.y, pt.y), w: Math.abs(pt.x - s.x), h: Math.abs(pt.y - s.y) };
      regRef.current = r;
      if (r.w > 2 || r.h > 2) {
        beginNativeDrag(0);
        queueSelPaint();
        if (snapRef.current) {
          snapRef.current = null;
          setSnap(null);
        }
      }
    }
  };
  const onMove = (e) => {
    if (textSelectingRef.current) return;
    const pt = toCanvas(e);
    if (geom) {
      const sc = cssScale();
      mouseGlobalRef.current = {
        x: Math.round(pt.x * sc + geom.x),
        y: Math.round(pt.y * sc + geom.y)
      };
    }
    movePtRef.current = pt;
    if (dragRef.current && phaseRef.current === "idle") {
      const s = dragRef.current;
      const r = { x: Math.min(s.x, pt.x), y: Math.min(s.y, pt.y), w: Math.abs(pt.x - s.x), h: Math.abs(pt.y - s.y) };
      regRef.current = r;
      beginNativeDrag(0);
      queueSelPaint();
      if ((r.w > 2 || r.h > 2) && snapRef.current) {
        snapRef.current = null;
        setSnap(null);
      }
    } else if (resizeRef.current) {
      const { hx, hy, start, startPt } = resizeRef.current;
      const dx = pt.x - startPt.x, dy = pt.y - startPt.y;
      let x = start.x, y = start.y, w = start.w, h = start.h;
      if (hx === -1) {
        x = start.x + dx;
        w = start.w - dx;
      } else if (hx === 1) {
        w = start.w + dx;
      }
      if (hy === -1) {
        y = start.y + dy;
        h = start.h - dy;
      } else if (hy === 1) {
        h = start.h + dy;
      }
      if (w < 0) {
        x += w;
        w = -w;
      }
      if (h < 0) {
        y += h;
        h = -h;
      }
      if (w >= 2 && h >= 2) {
        const r = { x, y, w, h };
        regRef.current = r;
        beginNativeDrag(1, hx, hy, start);
        queueSelPaint();
      }
    }
    if (phaseRef.current === "selected" && !dragRef.current && !resizeRef.current) {
      const el = handlersRef.current;
      if (el) el.style.cursor = hitHandle(pt) ? "pointer" : "crosshair";
    }
    if (!moveRafRef.current) {
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = 0;
        applyMoveVisual(movePtRef.current);
      });
    }
    if (phase === "idle" && !dragRef.current && cfg.shot.smart_detect && geom && !pickerModeRef.current) {
      staleRefireCountRef.current = 0;
      const mg = mouseGlobalRef.current;
      const lr = lastRectRef.current;
      const coversScreen = lr ? lr.w * lr.h >= geom.width * geom.height * 0.9 : false;
      const haveChain = snapChainRef.current !== null;
      const retryDue = elemFailAtRef.current > 0 && Date.now() - elemFailAtRef.current > 350;
      if (retryDue) elemFailAtRef.current = Date.now();
      if (lr && !coversScreen && !haveChain && !retryDue && mg.x >= lr.x && mg.x < lr.x + lr.w && mg.y >= lr.y && mg.y < lr.y + lr.h) return;
      void querySmartRect();
    }
  };
  const HANDLE_HIT = 8;
  const hitHandle = (pt) => {
    if (phase !== "selected") return null;
    const r = regRef.current;
    const xs = [[r.x, -1], [r.x + r.w / 2, 0], [r.x + r.w, 1]];
    const ys = [[r.y, -1], [r.y + r.h / 2, 0], [r.y + r.h, 1]];
    for (const [py, hy] of ys) for (const [px, hx] of xs) {
      if (hx === 0 && hy === 0) continue;
      if (Math.abs(pt.x - px) <= HANDLE_HIT && Math.abs(pt.y - py) <= HANDLE_HIT) return [hx, hy];
    }
    return null;
  };
  const commitText = () => {
    const te = textEditRef.current;
    if (te && te.value.trim()) {
      let ox = te.x, oy = te.y;
      const r = textInputRef.current?.getBoundingClientRect();
      if (r) {
        ox = r.left;
        oy = r.top;
      }
      setAnnos((arr) => [...arr, {
        kind: "text",
        x1: ox,
        y1: oy,
        x2: ox,
        y2: oy,
        color,
        width: sw,
        text: te.value
      }]);
    }
    setTextEdit(null);
  };
  const captureMosaicUnderlay = () => {
    const bg = bgRef.current;
    if (!bg || bg.width <= 0 || !geom) return null;
    const snap2 = document.createElement("canvas");
    snap2.width = geom.width;
    snap2.height = geom.height;
    const sctx = snap2.getContext("2d");
    sctx.drawImage(bg, 0, 0);
    const sc = cssScale();
    for (const s of annos) drawShape(sctx, s, bg, void 0, sc);
    return snap2;
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    if (pickerModeRef.current) {
      e.preventDefault();
      copyPicked(true);
      return;
    }
    if (textEditRef.current) commitText();
    const pt = toCanvas(e);
    if (ocrPhaseRef.current !== "idle") {
      if ((altActiveRef.current || e.altKey) && ocrLinesRef.current.length) {
        beginScreenshotTextSelect(e);
      }
      e.preventDefault();
      return;
    }
    if (phase === "selected" && tool === "text") {
      setTextEdit({ x: pt.x, y: pt.y, value: "" });
      return;
    }
    if (phase === "selected" && tool !== "select") {
      const a = {
        kind: tool,
        x1: pt.x,
        y1: pt.y,
        x2: pt.x,
        y2: pt.y,
        color,
        width: sw,
        points: tool === "brush" || tool === "mosaic" ? [pt] : void 0,
        num: tool === "number" ? numCnt : void 0
      };
      if (tool === "number") setNumCnt((n) => n + 1);
      if (tool === "mosaic") {
        a.sid = ++mosaicSid;
        const snap2 = captureMosaicUnderlay();
        if (snap2) mosaicSnapshots.set(a.sid, snap2);
      }
      setAnnos((arr) => [...arr, a]);
      const onM = (ev) => {
        const rc = bgRef.current?.getBoundingClientRect();
        if (!rc || !geom) return;
        const mx = Math.round(ev.clientX - rc.left);
        const my = Math.round(ev.clientY - rc.top);
        setAnnos((arr) => {
          const last = [...arr];
          const s = { ...last[last.length - 1] };
          s.x2 = mx;
          s.y2 = my;
          if (s.points) s.points = [...s.points, { x: mx, y: my }];
          last[last.length - 1] = s;
          return last;
        });
      };
      const onU = () => {
        window.removeEventListener("mousemove", onM);
        window.removeEventListener("mouseup", onU);
      };
      window.addEventListener("mousemove", onM);
      window.addEventListener("mouseup", onU);
      return;
    }
    if (phase === "selected") {
      const hnd = hitHandle(pt);
      if (hnd) {
        resizeRef.current = { hx: hnd[0], hy: hnd[1], start: { ...regRef.current }, startPt: pt };
        return;
      }
    }
    downPtRef.current = pt;
    if (snapRef.current && phase === "idle") {
      const sr = snapRef.current;
      setRegion(sr);
      regRef.current = sr;
      setSnap(null);
    }
    dragRef.current = pt;
    setTextEdit(null);
    setPhase("idle");
    setDragging(true);
    lastRectRef.current = null;
  };
  const onUp = (e) => {
    if (textSelectingRef.current) return;
    if (moveRafRef.current) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = 0;
    }
    applyMoveVisual(toCanvas(e));
    cancelSelPaint();
    if (resizeRef.current) {
      resizeRef.current = null;
      setRegion(regRef.current);
      handoverNativeDrag(() => paintSelCanvas());
      const sc = cssScale();
      shotSaveRegion([regRef.current.x * sc + (geom?.x ?? 0), regRef.current.y * sc + (geom?.y ?? 0), regRef.current.w * sc, regRef.current.h * sc]);
      return;
    }
    if (!dragRef.current) return;
    setDragging(false);
    const pt = toCanvas(e);
    const s = dragRef.current;
    dragRef.current = null;
    const moved = downPtRef.current ? Math.abs(pt.x - downPtRef.current.x) + Math.abs(pt.y - downPtRef.current.y) : 999;
    downPtRef.current = null;
    if (moved < 4 && snapRef.current && phase === "idle") {
      const r2 = snapRef.current;
      snapRef.current = null;
      setRegion(r2);
      regRef.current = r2;
      setPhase("selected");
      phaseRef.current = "selected";
      handoverNativeDrag(() => paintSelCanvas("selected"));
      const sc = cssScale();
      shotSaveRegion([r2.x * sc + (geom?.x ?? 0), r2.y * sc + (geom?.y ?? 0), r2.w * sc, r2.h * sc]);
      return;
    }
    const r = { x: Math.min(s.x, pt.x), y: Math.min(s.y, pt.y), w: Math.abs(pt.x - s.x), h: Math.abs(pt.y - s.y) };
    if (r.w > 2 && r.h > 2) {
      setRegion(r);
      regRef.current = r;
      setPhase("selected");
      phaseRef.current = "selected";
      handoverNativeDrag(() => paintSelCanvas("selected"));
      const sc = cssScale();
      shotSaveRegion([r.x * sc + (geom?.x ?? 0), r.y * sc + (geom?.y ?? 0), r.w * sc, r.h * sc]);
    } else {
      setPhase("idle");
      phaseRef.current = "idle";
      handoverNativeDrag(() => paintSelCanvas("idle"));
    }
  };
  const pngCacheRef = reactExports.useRef(null);
  const selectionKey = () => {
    const r = regRef.current;
    return [
      r.x,
      r.y,
      r.w,
      r.h,
      annos.length,
      // 含 color/width：否则"改颜色/粗细后重画同轨迹笔迹"会命中过期缓存，
      // 复制到的是旧标注的图（"画笔没复制上"的一种成因）
      annos.map((a) => `${a.kind}:${a.x1},${a.y1},${a.x2},${a.y2},${a.points?.length ?? 0}:${a.num ?? ""}:${a.color}:${a.width}:${a.text ?? ""}`).join("|")
    ].join("#");
  };
  const compScratchRef = reactExports.useRef(null);
  const buildComposite = () => {
    const bg = bgRef.current;
    if (!bg || !geom || bg.width <= 0) return null;
    let comp = compScratchRef.current;
    if (!comp) {
      comp = document.createElement("canvas");
      compScratchRef.current = comp;
    }
    if (comp.width !== bg.width) comp.width = bg.width;
    if (comp.height !== bg.height) comp.height = bg.height;
    const cctx = comp.getContext("2d");
    cctx.clearRect(0, 0, comp.width, comp.height);
    cctx.drawImage(bg, 0, 0);
    annos.forEach((s) => drawShape(cctx, s, bg, mosaicCacheRef.current, cssScale()));
    return comp;
  };
  const cropSelectionRaw = () => {
    const r = regRef.current;
    const bg = bgRef.current;
    if (!bg || !geom || bg.width <= 0) return null;
    const sc = cssScale();
    const rp = { x: Math.round(r.x * sc), y: Math.round(r.y * sc), w: Math.round(r.w * sc), h: Math.round(r.h * sc) };
    if (rp.w <= 0 || rp.h <= 0) return null;
    const src = annos.length > 0 ? buildComposite() : bg;
    if (!src) return null;
    const c = document.createElement("canvas");
    c.width = rp.w;
    c.height = rp.h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, rp.x, rp.y, rp.w, rp.h, 0, 0, rp.w, rp.h);
    const img = ctx.getImageData(0, 0, rp.w, rp.h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const rr = d[i];
      d[i] = d[i + 2];
      d[i + 2] = rr;
      d[i + 3] = 255;
    }
    return { data: new Uint8Array(d.buffer), w: rp.w, h: rp.h };
  };
  const encodeSelection = async () => {
    const r = regRef.current;
    const bg = bgRef.current;
    const sc = cssScale();
    const rp = { x: Math.round(r.x * sc), y: Math.round(r.y * sc), w: Math.round(r.w * sc), h: Math.round(r.h * sc) };
    const c = document.createElement("canvas");
    c.width = rp.w;
    c.height = rp.h;
    const ctx = c.getContext("2d");
    const src = annos.length > 0 ? buildComposite() : bg;
    if (!src) throw new Error("composite unavailable");
    ctx.drawImage(src, rp.x, rp.y, rp.w, rp.h, 0, 0, rp.w, rp.h);
    return new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error("toBlob null")), "image/png"));
  };
  reactExports.useEffect(() => {
    if (phase !== "selected" || dragging || textEdit) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (regRef.current.w <= 0 || regRef.current.h <= 0 || !bgRef.current) return;
      const key = selectionKey();
      if (pngCacheRef.current?.key !== key) {
        try {
          const blob = await encodeSelection();
          if (!cancelled && pngCacheRef.current?.key !== key) pngCacheRef.current = { key, blob };
        } catch {
        }
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phase, dragging, textEdit, annos, region, sw, color]);
  const doOutput = async (action) => {
    if (outputtingRef.current) return;
    outputtingRef.current = true;
    try {
      const canCrop = annos.length === 0 && !textEdit;
      if (!canCrop) {
        try {
          await Promise.race([
            frameReadyRef.current,
            new Promise((r2) => setTimeout(r2, 5e3))
          ]);
        } catch {
        }
      }
      if (!canCrop && (!bgRef.current || bgRef.current.width <= 0) || !geom) {
        void diagLog(`[shot] output ${action} skipped: canCrop=${canCrop} bgW=${bgRef.current?.width ?? -1} geom=${!!geom}`);
        await shotCancel().catch(() => {
        });
        return;
      }
      const r = regRef.current;
      if (r.w <= 0 || r.h <= 0) {
        void diagLog(`[shot] output ${action} skipped: region ${r.w}x${r.h}`);
        await shotCancel().catch(() => {
        });
        return;
      }
      const key = selectionKey();
      let blob = pngCacheRef.current?.key === key ? pngCacheRef.current.blob : null;
      if (action === "copy" || annos.length > 0) {
        void diagLog(`[shot] output ${action}: annos=[${annos.map((a) => `${a.kind}(${a.points?.length ?? 0}pts)`).join(",")}] cacheHit=${blob !== null} key=${key.slice(-160)}`);
      }
      const ensureBlob = async () => {
        if (blob) return blob;
        try {
          blob = await encodeSelection();
          if (pngCacheRef.current?.key !== key) pngCacheRef.current = { key, blob };
          return blob;
        } catch (encErr) {
          void diagLog(`[shot] output ${action} encode failed: ${String(encErr)}`);
          throw encErr;
        }
      };
      const sc = cssScale();
      const gx = Math.round(r.x * sc) + geom.x, gy = Math.round(r.y * sc) + geom.y;
      const pw = Math.round(r.w * sc), ph = Math.round(r.h * sc);
      let sent = false;
      try {
        if (action === "pin") {
          if (canCrop) {
            await shotCropOutput("pin", { x: gx, y: gy, w: pw, h: ph });
            sent = true;
          } else {
            const raw = cropSelectionRaw();
            if (raw) {
              await shotPinPost(raw.data, raw.w, raw.h, gx, gy);
              sent = true;
            } else {
              await shotOutputPost("pin", await ensureBlob(), { x: gx, y: gy });
              sent = true;
            }
          }
        } else if (action === "copy") {
          if (canCrop) {
            await shotCropOutput("copy", { x: gx, y: gy, w: pw, h: ph });
            sent = true;
          } else {
            await shotOutputPost("copy", await ensureBlob());
            sent = true;
          }
        } else {
          const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const base2 = cfg.shot.save_dir ? cfg.shot.save_dir.replace(/[\\/]+$/, "/") : "";
          const picked = await save({
            defaultPath: `${base2}screenshot-${ts}.png`,
            filters: [{ name: "PNG 图片", extensions: ["png"] }]
          });
          if (!picked) return;
          if (canCrop) {
            await shotCropOutput("save", { x: gx, y: gy, w: pw, h: ph }, picked);
            sent = true;
          } else {
            await shotOutputPost("save", await ensureBlob(), { path: picked });
            sent = true;
          }
        }
      } finally {
        if (sent && action !== "pin") await shotCancel().catch(() => {
        });
      }
    } catch (e) {
      void diagLog(`[shot] output ${action} failed: ${String(e)}`);
      await shotCancel().catch(() => {
      });
    } finally {
      outputtingRef.current = false;
    }
  };
  const startLongShot = () => {
    const r = regRef.current;
    if (!geom || r.w <= 0 || r.h <= 0) return;
    const sc = cssScale();
    void scrollBegin({
      x: Math.round(r.x * sc) + geom.x,
      y: Math.round(r.y * sc) + geom.y,
      w: Math.round(r.w * sc),
      h: Math.round(r.h * sc)
    }).catch(async (e) => {
      void diagLog(`[shot] longshot begin failed: ${String(e)}`);
      await shotCancel().catch(() => {
      });
    });
  };
  const doOutputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    doOutputRef.current = doOutput;
  });
  reactExports.useEffect(() => {
    const un = listen("shot://pin-hotkey", () => {
      if (pickerModeRef.current || dragRef.current || resizeRef.current) return;
      if (phaseRef.current === "idle") {
        const s = snapRef.current;
        if (!s) return;
        regRef.current = s;
        setRegion(s);
        snapRef.current = null;
        setSnap(null);
        setPhase("selected");
        phaseRef.current = "selected";
        const g = geomRef.current;
        const sc = cssScale();
        void shotSaveRegion([s.x * sc + (g?.x ?? 0), s.y * sc + (g?.y ?? 0), s.w * sc, s.h * sc]).catch(() => {
        });
      } else if (phaseRef.current !== "selected") {
        return;
      }
      void doOutputRef.current?.("pin");
    });
    return () => {
      un.then((f) => f());
    };
  }, []);
  if (!geom) return null;
  const displayW = "100vw", displayH = "100vh";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: rootRef,
      className: "shot-overlay",
      style: { width: displayW, height: displayH, position: "fixed", top: 0, left: 0, overflow: "hidden", cursor: "crosshair" },
      onWheel: (ev) => {
        if (phase === "idle" && !dragRef.current && !pickerModeRef.current && cfg.shot.smart_detect) {
          const chain = snapChainRef.current;
          if (chain && chain.length > 1 && snapRef.current) {
            const ni = Math.min(chain.length - 1, Math.max(0, snapIdxRef.current + (ev.deltaY > 0 ? 1 : -1)));
            if (ni !== snapIdxRef.current) {
              snapIdxRef.current = ni;
              const r = chain[ni];
              snapRef.current = r;
              setSnap(r);
            }
            return;
          }
        }
        if (phase !== "selected" || textEdit) return;
        const dir = ev.deltaY > 0 ? -1 : 1;
        const nv = Math.min(24, Math.max(1, sw + dir));
        setSw(nv);
        setSwBadge(nv);
        window.clearTimeout(swBadgeTimer.current);
        swBadgeTimer.current = window.setTimeout(() => setSwBadge(null), 800);
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("canvas", { ref: bgRef, style: { position: "absolute", top: 0, left: 0, width: displayW, height: displayH, imageRendering: "pixelated" } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("canvas", { ref: annoRef, style: { position: "absolute", top: 0, left: 0, width: displayW, height: displayH, pointerEvents: "none" } }),
        !geom.picker && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "canvas",
          {
            ref: selCanvasRef,
            className: dimFx ? "shot-dim-fade" : void 0,
            style: { position: "absolute", top: 0, left: 0, width: displayW, height: displayH, pointerEvents: "none" }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            ref: handlersRef,
            style: { position: "absolute", top: 0, left: 0, width: displayW, height: displayH, zIndex: 10 },
            onMouseMove: onMove,
            onMouseDown: onDown,
            onMouseUp: onUp,
            onMouseLeave: () => setShowMag(false)
          }
        ),
        textEdit && (() => {
          const vw = window.innerWidth, vh = window.innerHeight;
          const estW = 190, estH = 30;
          const ex = Math.min(Math.max(textEdit.x, 4), Math.max(4, vw - estW - 4));
          const ey = Math.min(Math.max(textEdit.y, estH / 2 + 4), Math.max(4, vh - estH - 4));
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "shot-text-editor",
              style: { left: ex, top: ey },
              onMouseDown: (ev) => ev.stopPropagation(),
              onMouseUp: (ev) => ev.stopPropagation(),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    ref: textInputRef,
                    value: textEdit.value,
                    style: { color, caretColor: color },
                    placeholder: "输入文字，Enter 确定",
                    onChange: (ev) => setTextEdit({ ...textEditRef.current, value: ev.target.value }),
                    onKeyDown: (ev) => {
                      if (ev.nativeEvent.isComposing) {
                        ev.stopPropagation();
                        return;
                      }
                      if (ev.key === "Enter") {
                        ev.preventDefault();
                        commitText();
                      } else if (ev.key === "Escape") setTextEdit(null);
                      ev.stopPropagation();
                    }
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: "shot-text-x",
                    title: "丢弃此文字",
                    onMouseDown: (ev) => ev.stopPropagation(),
                    onMouseUp: (ev) => ev.stopPropagation(),
                    onClick: (ev) => {
                      ev.stopPropagation();
                      setTextEdit(null);
                    },
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.6", strokeLinecap: "round", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 5l14 14M19 5L5 19" }) })
                  }
                )
              ]
            }
          );
        })(),
        showMag && bgReady && cfg.shot.magnifier && !geom.picker && !textEdit && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: magBoxRef, className: "shot-mag", style: {
          position: "fixed",
          left: -9999,
          top: -9999,
          width: MAG_BOX_W,
          pointerEvents: "none"
        }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `shot-mag-lens${magCircle ? " shot-mag-lens--circle" : ""}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx("canvas", { ref: magCanvasRef }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-mag-info", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-mag-row", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { ref: magCoordRef, children: "(0 , 0)" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-mag-row shot-mag-colorline", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { ref: magSwatchRef, className: "shot-mag-liveswatch" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { ref: magValRef, className: "shot-color-val", children: "--" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { ref: magFmtRef, className: "shot-mag-fmt", children: "RGB" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-mag-row shot-mag-hints", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "C" }),
                " 复制"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "Shift" }),
                " 换格式"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "Tab" }),
                " 圆形/方形"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: magCopiedRef, className: "shot-copied shot-copied-center", style: { display: "none" } })
          ] })
        ] }),
        geom.picker && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: pickerLineHRef, className: "shot-picker-line shot-picker-line-h", style: { top: -9999 } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: pickerLineVRef, className: "shot-picker-line shot-picker-line-v", style: { left: -9999 } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: pickerDotRef, className: "shot-picker-dot", style: { left: -9999, top: -9999 } }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: pickerPanelRef, className: "shot-picker-panel", style: { left: -9999, top: -9999 }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-picker-coord", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { ref: pickerCoordRef, children: "(0 , 0)" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-picker-color", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { ref: pickerSwatchRef, className: "shot-color-swatch shot-color-swatch-md" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { ref: pickerValRef, className: "shot-color-val shot-color-val-md", children: "--" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { ref: pickerFmtRef, className: "shot-mag-fmt", children: "RGB" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-picker-hints", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                "按 ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "C" }),
                " 复制颜色 · 单击复制并退出"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                "按 ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "Shift" }),
                " 切换颜色格式"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: pickerCopiedRef, className: "shot-copied shot-copied-center", style: { display: "none" } })
          ] })
        ] }),
        phase === "selected" && (() => {
          const vw = window.innerWidth, vh = window.innerHeight;
          const rightEdge = region.x + region.w;
          const rightPx = Math.min(Math.max(vw - rightEdge, 8), Math.max(8, vw - 60));
          const menuOpen = submenuOpen !== null;
          const barH = 40, panelH = 52;
          const bottomEdge = region.y + region.h;
          let ty = bottomEdge + 8;
          let tipsAbove = false;
          if (ty + barH > vh - 6) {
            tipsAbove = true;
            ty = Math.max(bottomEdge - barH - 6, 8);
          }
          let panelAbove = false;
          if (menuOpen) {
            const belowRoom = vh - 6 - (ty + barH);
            if (belowRoom < panelH + 8) {
              panelAbove = true;
              if (ty - panelH - 4 < 8) ty = panelH + 12;
            }
          }
          const renderConfigPanel = /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-toolbar-panel", children: [
            tool !== "mosaic" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              (cfg.annotate?.colors?.length ? cfg.annotate.colors : ANNO_DEFAULT_COLORS).map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: `shot-color-btn${color === c ? " active" : ""}`,
                  style: { background: c },
                  onClick: () => setColor(c)
                },
                c
              )),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  ref: customColorRef,
                  type: "color",
                  value: color,
                  tabIndex: -1,
                  onInput: (ev) => setColor(ev.target.value),
                  style: { position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none", border: 0, padding: 0 }
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "shot-color-custom",
                  title: "自定义颜色",
                  "aria-label": "自定义颜色",
                  onClick: () => customColorRef.current?.click()
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "shot-sw-wheel",
                title: "悬停滚动滚轮调节粗细（1~24px 无级）",
                onWheel: (ev) => {
                  ev.stopPropagation();
                  const dir = ev.deltaY > 0 ? -1 : 1;
                  const nv = Math.min(24, Math.max(1, sw + dir));
                  setSw(nv);
                  setSwBadge(nv);
                  window.clearTimeout(swBadgeTimer.current);
                  swBadgeTimer.current = window.setTimeout(() => setSwBadge(null), 800);
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { width: Math.min(4 + sw * 1.2, 26), height: Math.min(4 + sw * 1.2, 26) } })
              }
            )
          ] });
          return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `shot-toolbar-float${tipsAbove ? " tips-above" : ""}${panelAbove ? " panel-above" : ""}`, style: { right: rightPx, top: ty }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-toolbar", children: [
            TOOL_BUTTONS.map((b, i) => {
              const active = b.items.some(([t]) => t === tool);
              const MainIcon = b.groupIcon ?? b.items[0][1];
              const isGroup = b.items.length > 1;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `shot-toolbtn${active ? " active" : ""}${isGroup ? " has-submenu" : ""}`, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    className: "shot-toolbtn-main" + (active ? " active" : ""),
                    "data-tip": btnTip(b),
                    onClick: () => {
                      if (submenuOpen === i) {
                        setSubmenuOpen(null);
                      } else {
                        setSubmenuOpen(i);
                        if (!b.items.some(([t]) => t === toolRef.current)) {
                          setTool(b.items[0][0]);
                        }
                      }
                    },
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(MainIcon, {}) })
                  }
                ),
                submenuOpen === i && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `shot-toolbtn-submenu${panelAbove ? " above" : ""}`, onClick: (ev) => ev.stopPropagation(), children: [
                  isGroup && b.items.map(([t, Ic, name]) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      className: tool === t ? "active" : "",
                      "data-tip": name,
                      onClick: () => setTool(t),
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Ic, {}) })
                    },
                    t
                  )),
                  isGroup && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-submenu-divider" }),
                  renderConfigPanel
                ] })
              ] }, i);
            }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-toolbar-sep" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                "data-tip": "撤销 (Ctrl+Z)",
                disabled: annos.length === 0,
                onClick: () => {
                  if (annos.length > 0) {
                    setUndos((u) => [...u, [...annos]]);
                    setAnnos((a) => a.slice(0, -1));
                  }
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IcoUndo, {})
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                "data-tip": "重做 (Ctrl+Shift+Z)",
                disabled: undos.length === 0,
                onClick: () => {
                  if (undos.length > 0) {
                    setAnnos(undos[undos.length - 1]);
                    setUndos((u) => u.slice(0, -1));
                  }
                },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IcoRedo, {})
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-toolbar-sep" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-toolbar-group shot-toolbar-actions", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { "data-tip": "长截图（自动滚动拼接长图）", onClick: startLongShot, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IcoLongShot, {}) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  "data-tip": "文字识别 (OCR)",
                  className: ocrPhase !== "idle" ? "active" : "",
                  onClick: () => {
                    if (ocrPhase === "idle" || ocrPhase === "error") void runOcr();
                    else resetOcr();
                  },
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IcoOcr, {}) })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { "data-tip": "另存为...", onClick: () => doOutput("save"), children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IcoSaveAs, {}) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { "data-tip": "复制 (Enter)", onClick: () => doOutput("copy"), children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IcoCopy, {}) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { "data-tip": `贴图 (${cfg.shortcuts.pins})`, onClick: () => doOutput("pin"), children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IcoPin, {}) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { "data-tip": "取消 (Esc)", onClick: () => void shotCancel().catch(() => {
              }), children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { display: "inline-flex" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx(IcoClose, {}) }) })
            ] })
          ] }) });
        })(),
        swBadge != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-sw-badge", children: [
          "画笔粗细 ",
          swBadge,
          "px"
        ] }),
        !geom.picker && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            ref: hintRef,
            className: "shot-hint-panel",
            style: { visibility: dragging || hintCovered ? "hidden" : "visible" },
            children: phase === "selected" || dragging ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "Enter" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "复制到剪贴板" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: cfg.shortcuts.pins }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "贴到屏幕" })
              ] }),
              annos.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "Ctrl+Z" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "撤销标注" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "Esc" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "退出截图" })
              ] })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              histViewing && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row shot-hint-viewing", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "<" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "正在查看历史截屏，按 < 返回实时画面" })
              ] }),
              cfg.shot.smart_detect && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "左键点击" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "采纳识别的窗口" })
              ] }),
              cfg.shot.smart_detect && chainLen > 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "滚轮" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "切换识别层级（元素⇄窗口）" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "左键拖拽" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "自定义框选区域" })
              ] }),
              cfg.shot.history_enabled !== false && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "shot-hint-keys", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "<" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: ">" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "翻看历史截屏，可重新框选" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "H" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "历史截屏列表" })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "C" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "取色" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: cfg.shortcuts.pins }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "快速贴图" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hint-row", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-keys", children: /* @__PURE__ */ jsxRuntimeExports.jsx("kbd", { children: "Esc" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hint-desc", children: "退出截图" })
              ] })
            ] })
          }
        ),
        histOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hist-panel", ref: histPanelRef, onMouseDown: (e) => e.stopPropagation(), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hist-head", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-hist-title", children: "历史截屏" }),
            (histItems ?? []).length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-hist-clear", onClick: () => void clearHist(), children: "清空历史" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hist-row", onWheel: (e) => {
            const row = e.currentTarget;
            const max = row.scrollWidth - row.clientWidth;
            if (max > 0) {
              row.scrollLeft = Math.min(max, Math.max(0, row.scrollLeft + e.deltaY));
            }
            e.stopPropagation();
          }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                className: `shot-hist-item${histPos === -1 ? " active" : ""}`,
                onClick: () => void jumpHistory(-1),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-hist-thumb shot-hist-live", children: "实时" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "当前画面" })
                ]
              }
            ),
            (histItems ?? []).map((it, i) => {
              const hasRegion = Array.isArray(it.region) && it.region.length === 4 && (it.width ?? 0) > 0 && (it.height ?? 0) > 0;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  className: `shot-hist-item${histPos === i ? " active" : ""}`,
                  onClick: () => void jumpHistory(i),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-hist-thumbwrap", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: shotHistoryUrl(it.file.replace(".png", ".thumb.png")), draggable: false }),
                      hasRegion && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-hist-region", style: {
                        left: `${it.region[0] / it.width * 100}%`,
                        top: `${it.region[1] / it.height * 100}%`,
                        width: `${it.region[2] / it.width * 100}%`,
                        height: `${it.region[3] / it.height * 100}%`
                      } }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          className: "shot-hist-del",
                          title: "删除此记录",
                          onClick: (e) => {
                            e.stopPropagation();
                            void deleteHist(it.file);
                          },
                          children: "×"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: new Date(it.ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) })
                  ]
                },
                it.file
              );
            }),
            histItems !== null && histItems.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-hist-empty", children: "暂无历史截屏" })
          ] })
        ] }),
        ocrPhase === "done" && ocrLines.length > 0 && (() => {
          const sc = cssScale();
          const bx = region.x, by = region.y;
          const selRects = scrSel.map((p) => {
            const wd = ocrLines[p.li]?.words[p.wi];
            return wd ? { left: bx + wd.x / sc, top: by + wd.y / sc, w: wd.w / sc, h: wd.h / sc } : null;
          }).filter((r) => !!r);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-ocr-hl-layer", style: { width: displayW, height: displayH }, children: [
            ocrLines.map((l, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "shot-ocr-hl",
                style: { left: bx + l.x / sc, top: by + l.y / sc, width: l.w / sc, height: l.h / sc }
              },
              i
            )),
            selRects.map((r, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "shot-ocr-sel",
                style: { left: r.left, top: r.top, width: r.w, height: r.h }
              },
              `s${i}`
            ))
          ] });
        })(),
        ocrPhase !== "idle" && (() => {
          const vw = window.innerWidth, vh = window.innerHeight;
          const transMode = !!ocrTrans || ocrTranslating;
          const pw = transMode ? Math.min(560, vw - 16) : 320;
          const phMax = Math.min(transMode ? 520 : 380, vh - 16);
          let px2 = region.x + region.w + 10;
          if (px2 + pw > vw - 8) px2 = Math.max(8, region.x - pw - 10);
          const py2 = Math.max(8, Math.min(region.y, vh - phMax - 8));
          return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { onMouseDown: (e) => e.stopPropagation(), onMouseUp: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            OcrPanel,
            {
              style: { left: px2, top: py2, width: pw, maxHeight: phMax },
              lines: ocrLines,
              phase: ocrPhase === "loading" ? "loading" : ocrPhase === "error" ? "error" : "done",
              error: ocrError,
              trans: ocrTrans,
              translating: ocrTranslating,
              onClose: resetOcr,
              onCopyAll: copyAllOcr,
              onCopyTrans: copyTransOut,
              onTranslate: () => void doTranslate(),
              onReturn: () => setOcrTrans(null)
            }
          ) });
        })(),
        ocrPhase === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-ocr-busy", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-ocr-spinner" }),
          "识别中…"
        ] }),
        altActive && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-textmode-badge", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shot-textmode-badge-txt", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-textmode-badge-k", children: "文字选择模式" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shot-textmode-badge-s", children: "拖动已锁定 · 再按 Alt 退出" })
        ] }) })
      ]
    }
  );
}
function usePinOcrSelect({ autoRun, interactive, id, src, imgRef, onFeedback }) {
  const [lines, setLines] = reactExports.useState(null);
  const linesRef = reactExports.useRef(null);
  const ocrBusyRef = reactExports.useRef(false);
  const [busy, setBusy] = reactExports.useState(false);
  const autoEnterRef = reactExports.useRef(false);
  const [altActive, setAltActive] = reactExports.useState(false);
  const modeRef = reactExports.useRef(false);
  const interactiveRef = reactExports.useRef(interactive);
  interactiveRef.current = interactive;
  const [picked, setPicked] = reactExports.useState([]);
  const pickedRef = reactExports.useRef([]);
  const hasSelectionRef = reactExports.useRef(false);
  const [, setResizeTick] = reactExports.useState(0);
  const feedbackRef = reactExports.useRef(onFeedback);
  feedbackRef.current = onFeedback;
  const applyPicked = (p) => {
    pickedRef.current = p;
    hasSelectionRef.current = p.length > 0;
    setPicked(p);
  };
  const clearSelection = () => applyPicked([]);
  const exitMode = () => {
    modeRef.current = false;
    setAltActive(false);
    clearSelection();
  };
  reactExports.useEffect(() => {
    const h = () => setResizeTick((t) => t + 1);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const idSrcRef = reactExports.useRef({ id, src, autoRun });
  idSrcRef.current = { id, src, autoRun };
  const staleRef = reactExports.useRef(0);
  const runOcrRef = reactExports.useRef(() => {
  });
  runOcrRef.current = () => {
    const { id: id2, src: src2, autoRun: autoRun2 } = idSrcRef.current;
    if (!autoRun2 || !id2 || !src2 || ocrBusyRef.current || linesRef.current) return;
    const gen = ++staleRef.current;
    ocrBusyRef.current = true;
    setBusy(true);
    pinOcr(id2).then((res) => {
      if (staleRef.current !== gen) return;
      linesRef.current = res;
      setLines(res);
    }).catch(() => {
    }).finally(() => {
      if (staleRef.current !== gen) return;
      ocrBusyRef.current = false;
      setBusy(false);
    });
  };
  reactExports.useEffect(() => {
    staleRef.current++;
    linesRef.current = null;
    setLines(null);
    clearSelection();
    ocrBusyRef.current = false;
    setBusy(false);
    autoEnterRef.current = false;
  }, [id, src]);
  reactExports.useEffect(() => {
    const kd = (e) => {
      if (e.key !== "Alt" || e.repeat || !interactiveRef.current) return;
      e.preventDefault();
      if (!linesRef.current) {
        autoEnterRef.current = true;
        runOcrRef.current();
        feedbackRef.current("文字识别中，请稍候…", 1400, "ocr-busy");
        return;
      }
      if (!linesRef.current.length) {
        feedbackRef.current("未识别到文字", 1400);
        return;
      }
      modeRef.current = !modeRef.current;
      setAltActive(modeRef.current);
      if (!modeRef.current) clearSelection();
    };
    const blur = () => exitMode();
    window.addEventListener("keydown", kd);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("blur", blur);
    };
  }, []);
  reactExports.useEffect(() => {
    if (lines?.length && autoEnterRef.current) {
      autoEnterRef.current = false;
      modeRef.current = true;
    }
    setAltActive(modeRef.current && !!lines?.length && interactiveRef.current);
    if (!lines?.length) clearSelection();
  }, [lines]);
  const onKeyDown = (e) => {
    if (e.key === "Escape" && hasSelectionRef.current) {
      e.preventDefault();
      exitMode();
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "c" || e.key === "C") && hasSelectionRef.current) {
      e.preventDefault();
      const text = buildText(pickedRef.current);
      if (text) {
        copyText(text, true).then(() => feedbackRef.current(`已复制 ${text.length} 字`, 1200, "copied")).catch(() => feedbackRef.current("复制失败", 1500, "failed"));
      }
      return true;
    }
    return false;
  };
  reactExports.useEffect(() => {
    if (!interactive) exitMode();
  }, [interactive]);
  const computeGeom = () => {
    const el = imgRef.current;
    if (!el || !el.naturalWidth || !el.naturalHeight) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const natW = el.naturalWidth, natH = el.naturalHeight;
    const s = Math.min(r.width / natW, r.height / natH);
    const dw = natW * s, dh = natH * s;
    return {
      left: r.left + (r.width - dw) / 2,
      top: r.top + (r.height - dh) / 2,
      kx: natW / dw,
      ky: natH / dh
    };
  };
  const toOrig = (cx, cy, g) => ({ x: (cx - g.left) * g.kx, y: (cy - g.top) * g.ky });
  const toDisp = (x, y, w, h, g) => ({ x: g.left + x / g.kx, y: g.top + y / g.ky, w: w / g.kx, h: h / g.ky });
  const collect = (x0, y0, x1, y1) => {
    const L = linesRef.current ?? [];
    const picked2 = [];
    for (let li = 0; li < L.length; li++) {
      const line = L[li];
      const ly0 = line.y, ly1 = line.y + line.h, lcy = line.y + line.h / 2;
      const iy = Math.min(y1, ly1) - Math.max(y0, ly0);
      const contained = y0 >= ly0 && y1 <= ly1;
      if (!(iy >= line.h * 0.4 || lcy >= y0 && lcy <= y1 || contained)) continue;
      const words = line.words;
      for (let wi = 0; wi < words.length; wi++) {
        const wd = words[wi];
        const ix = Math.min(x1, wd.x + wd.w) - Math.max(x0, wd.x);
        const cx = wd.x + wd.w / 2;
        if (ix > 0 || cx >= x0 && cx <= x1) picked2.push({ li, wi });
      }
    }
    return picked2;
  };
  const buildText = (picked2) => {
    const L = linesRef.current;
    if (!L || !picked2.length) return "";
    const byLine = /* @__PURE__ */ new Map();
    for (const p of picked2) {
      const wd = L[p.li]?.words[p.wi];
      if (!wd || !wd.t) continue;
      let arr = byLine.get(p.li);
      if (!arr) {
        arr = [];
        byLine.set(p.li, arr);
      }
      arr.push(wd);
    }
    return [...byLine.entries()].sort((a, b) => L[a[0]].y - L[b[0]].y).map(([, ws]) => {
      ws.sort((a, b) => a.x - b.x);
      let out = "";
      let prevRight = NaN, prevH = NaN;
      for (const w of ws) {
        if (!Number.isNaN(prevRight) && w.x - prevRight > prevH * 0.35) out += " ";
        out += w.t;
        prevRight = w.x + w.w;
        prevH = Math.max(prevH || 0, w.h);
      }
      return out.trim();
    }).filter(Boolean).join("\n");
  };
  const teardownRef = reactExports.useRef(null);
  const onMouseDown = (e) => {
    if (e.button !== 0 || !interactiveRef.current) return false;
    if (!modeRef.current && !e.altKey) return false;
    if (!modeRef.current && e.altKey) {
      modeRef.current = true;
      setAltActive(true);
    }
    const L = linesRef.current;
    if (!L || !L.length) return false;
    const g = computeGeom();
    if (!g) return false;
    e.preventDefault();
    void getCurrentWindow().setFocus().catch(() => {
    });
    teardownRef.current?.();
    hasSelectionRef.current = true;
    const a = toOrig(e.clientX, e.clientY, g);
    let raf = 0;
    let done = false;
    let lastPicked = [];
    const move = (ev) => {
      if (done) return;
      const b = toOrig(ev.clientX, ev.clientY, g);
      lastPicked = collect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          applyPicked(lastPicked);
        });
      }
    };
    const teardown = () => {
      done = true;
      teardownRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      document.removeEventListener("mouseleave", onDocLeave);
      window.removeEventListener("blur", cancel);
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const finish = () => {
      if (done) return;
      teardown();
      if (lastPicked.length) {
        applyPicked(lastPicked);
      } else {
        clearSelection();
      }
    };
    const cancel = () => {
      if (!done) {
        teardown();
        clearSelection();
      }
    };
    const onDocLeave = () => finish();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    document.addEventListener("mouseleave", onDocLeave);
    window.addEventListener("blur", cancel);
    teardownRef.current = teardown;
    return true;
  };
  const geom = computeGeom();
  const hintRects = [];
  if (altActive && geom && lines) {
    for (const line of lines) {
      if (line.w > 0 && line.h > 0) hintRects.push(toDisp(line.x, line.y, line.w, line.h, geom));
    }
  }
  const selRects = geom && picked.length ? picked.map((p) => {
    const wd = linesRef.current?.[p.li]?.words[p.wi];
    return wd ? toDisp(wd.x, wd.y, wd.w, wd.h, geom) : null;
  }).filter((r) => !!r) : [];
  return { altActive, lines: lines ?? [], selRects, hintRects, busy, onMouseDown, onKeyDown, clearSelection, exitMode, hasSelectionRef };
}
const PIN_ACCENTS = ["#0a84ff", "#ff453a", "#32d74b", "#bf5af2", "#ff9f0a", "#64d2ff"];
const PIN_MARGIN = 12;
const pinMarginCss = () => PIN_MARGIN / (window.devicePixelRatio || 1);
function PinWindow() {
  const [accent, setAccent] = reactExports.useState(() => PIN_ACCENTS[Math.floor(Math.random() * PIN_ACCENTS.length)]);
  const [introDone, setIntroDone] = reactExports.useState(false);
  const replayIntro = () => {
    setAccent(PIN_ACCENTS[Math.floor(Math.random() * PIN_ACCENTS.length)]);
    setIntroDone(false);
  };
  const [src, setSrc] = reactExports.useState("");
  const [opacity, setOpacity] = reactExports.useState(1);
  const [rotation, setRotation] = reactExports.useState(0);
  const [shadow, setShadow] = reactExports.useState(true);
  const [clickThrough, setClickThrough] = reactExports.useState(false);
  const [dragging, setDragging] = reactExports.useState(false);
  const [zoomLabel, setZoomLabel] = reactExports.useState(null);
  const zoomHideTimer = reactExports.useRef(0);
  const baseWRef = reactExports.useRef(0);
  const winLabel = getCurrentWindow().label;
  const isStaging = winLabel.startsWith("pin-staging");
  const idRef = reactExports.useRef(isStaging ? "" : winLabel.replace(/^pin-/, ""));
  const retriedRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    if (!isStaging && winLabel.startsWith("pin-") && idRef.current) {
      setSrc(pinImageUrl(idRef.current));
    }
  }, []);
  reactExports.useEffect(() => {
    if (!isStaging) return;
    let un;
    void getCurrentWindow().listen("pin://assign", (e) => {
      idRef.current = e.payload.id;
      replayIntro();
      tAssignRef.current = Date.now();
      setKindKnown(true);
      sizeRef.current = null;
      htmlSizedRef.current = false;
      retriedRef.current = false;
      setHtml(null);
      setKind("image");
      setSrc(pinImageUrl(e.payload.id));
    }).then((f) => {
      un = f;
    });
    return () => {
      un?.();
    };
  }, [isStaging]);
  const [kind, setKind] = reactExports.useState("image");
  const [kindKnown, setKindKnown] = reactExports.useState(!isStaging);
  const kindRef = reactExports.useRef("image");
  kindRef.current = kind;
  const [html, setHtml] = reactExports.useState(null);
  const htmlWrapRef = reactExports.useRef(null);
  const htmlRef = reactExports.useRef(null);
  const htmlNatRef = reactExports.useRef(null);
  const htmlSizedRef = reactExports.useRef(false);
  const tAssignRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    if (!idRef.current || !src) return;
    let alive = true;
    pinKind(idRef.current).then((k) => {
      if (!alive) return;
      setKind(k);
      setKindKnown(true);
    }).catch(() => {
      if (alive) setKindKnown(true);
    });
    return () => {
      alive = false;
    };
  }, [src]);
  reactExports.useEffect(() => {
    if (kind !== "html" || !src) {
      setHtml(null);
      return;
    }
    let alive = true;
    fetch(src).then((r) => r.text()).then((t) => {
      if (alive) setHtml(t);
    }).catch(() => {
    });
    return () => {
      alive = false;
    };
  }, [kind, src]);
  const pickHtmlBackdrop = (el) => {
    const lum = (c) => {
      const m = c.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      return m ? (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 : null;
    };
    let sum = 0, n = 0;
    if (el.textContent?.trim()) {
      const l = lum(getComputedStyle(el).color);
      if (l !== null) {
        sum += l;
        n += 1;
      }
    }
    const walk = (node, depth) => {
      if (n >= 60 || depth > 12) return;
      for (const child of Array.from(node.children)) {
        if (n < 60 && Array.from(child.childNodes).some((x) => x.nodeType === 3 && x.textContent?.trim())) {
          const l = lum(getComputedStyle(child).color);
          if (l !== null) {
            sum += l;
            n += 1;
          }
        }
        walk(child, depth + 1);
      }
    };
    walk(el, 1);
    if (n === 0) return "#ffffff";
    return sum / n > 0.55 ? "#1e1f22" : "#ffffff";
  };
  reactExports.useEffect(() => {
    if (html === null || !idRef.current || htmlSizedRef.current) return;
    const el = htmlRef.current;
    if (!el) return;
    htmlSizedRef.current = true;
    el.style.background = pickHtmlBackdrop(el);
    const natW = el.offsetWidth, natH = el.offsetHeight;
    htmlNatRef.current = { w: natW, h: natH };
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(40, Math.min(4e3, Math.round(natW * dpr)));
    const h = Math.max(40, Math.min(6e3, Math.round(natH * dpr)));
    void pinResize(idRef.current, w, h).then(() => {
      diagLog(`[pin] html sized ${w}x${h} +${Date.now() - tAssignRef.current}ms, ready`);
      void pinReady().catch(() => {
      });
      applyHtmlScale();
    }).catch(() => {
    });
  }, [html]);
  const applyHtmlScale = () => {
    const wrap = htmlWrapRef.current, inner = htmlRef.current;
    const nat = htmlNatRef.current;
    if (!wrap || !inner || !nat || nat.w < 1) return;
    const availW = Math.max(1, wrap.clientWidth);
    const k = availW / nat.w;
    inner.style.transformOrigin = "0 0";
    inner.style.transform = `scale(${k})`;
    wrap.style.height = `${Math.round(nat.h * k)}px`;
  };
  reactExports.useEffect(() => {
    if (kind !== "html") return;
    window.addEventListener("resize", applyHtmlScale);
    return () => window.removeEventListener("resize", applyHtmlScale);
  }, [kind]);
  const persistNowRef = reactExports.useRef(async () => {
  });
  persistNowRef.current = async () => {
    const id = idRef.current;
    if (!id) return;
    const win = getCurrentWindow();
    try {
      const pos = await win.outerPosition();
      const size = await win.outerSize();
      const m = PIN_MARGIN;
      await pinUpdate(id, {
        x: pos.x + m,
        y: pos.y + m,
        width: Math.max(1, size.width - m * 2),
        height: Math.max(1, size.height - m * 2),
        opacity,
        rotation,
        flip_h: false,
        flip_v: false,
        shadow,
        click_through: clickThrough
      });
    } catch {
    }
  };
  const zoomTimer = reactExports.useRef(0);
  const debouncePersist = () => {
    window.clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => {
      void persistNowRef.current();
    }, 400);
  };
  const opacityRef = reactExports.useRef(opacity);
  opacityRef.current = opacity;
  const showBadge = (text, ms = 1e3, cls) => {
    setZoomLabel({ text, cls });
    window.clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = window.setTimeout(() => setZoomLabel(null), ms);
  };
  const imgRef = reactExports.useRef(null);
  const ocr = usePinOcrSelect({
    autoRun: kindKnown && kind === "image",
    interactive: kindKnown && kind === "image" && rotation === 0,
    id: idRef.current,
    src,
    imgRef,
    onFeedback: showBadge
  });
  const [pinOcrTrans, setPinOcrTrans] = reactExports.useState(null);
  const [pinOcrTranslating, setPinOcrTranslating] = reactExports.useState(false);
  const pinOcrTranslatingRef = reactExports.useRef(false);
  const pinCopyAllOcr = () => {
    const all = ocr.lines.map((l) => l.text).join("\n");
    if (all) void copyText(all, true);
  };
  const pinCopyTransOut = () => {
    if (!pinOcrTrans?.pairs.length) return;
    const all = pinOcrTrans.pairs.filter((p) => !p.pending).map((p) => p.out).join("\n");
    if (all) void copyText(all, true);
  };
  const pinDoTranslate = async () => {
    const srcs = ocr.lines.map((l) => l.text).join("\n").split("\n").map((s) => s.trim()).filter(Boolean);
    if (!srcs.length) return;
    pinOcrTranslatingRef.current = true;
    setPinOcrTranslating(true);
    setPinOcrTrans({ err: "", pairs: srcs.map((s) => ({ src: s, out: "", ok: true, pending: true })) });
    try {
      const res = await translateLines(srcs);
      setPinOcrTrans({
        err: "",
        pairs: srcs.map((s, i) => ({ src: s, out: res[i]?.out ?? s, ok: res[i]?.ok !== false, pending: false }))
      });
    } catch (err) {
      setPinOcrTrans({ pairs: [], err: err instanceof Error ? err.message : String(err) });
    } finally {
      pinOcrTranslatingRef.current = false;
      setPinOcrTranslating(false);
    }
  };
  const pinCloseOcr = () => {
    ocr.exitMode();
    setPinOcrTrans(null);
    setPinOcrTranslating(false);
  };
  reactExports.useEffect(() => {
    let un;
    void listen(EVT_TRANSLATE_LINE, (e) => {
      const { i, out, ok } = e.payload;
      if (!pinOcrTranslatingRef.current) return;
      setPinOcrTrans((prev) => !prev || i >= prev.pairs.length ? prev : { ...prev, pairs: prev.pairs.map((p, k) => k === i ? { ...p, out, ok, pending: false } : p) });
    }).then((f) => {
      un = f;
    });
    return () => {
      un?.();
    };
  }, []);
  const sizeRef = reactExports.useRef(null);
  const pendingSizeRef = reactExports.useRef(null);
  const zoomRafRef = reactExports.useRef(0);
  const zoomIdleRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    const h = (e) => {
      e.preventDefault();
      const win = getCurrentWindow();
      void pinBusy(true);
      window.clearTimeout(zoomIdleRef.current);
      zoomIdleRef.current = window.setTimeout(() => void pinBusy(false), 600);
      if (e.ctrlKey && idRef.current) {
        const nv = Math.min(1, Math.max(0.05, +(opacityRef.current - Math.sign(e.deltaY) * 0.05).toFixed(2)));
        setOpacity(nv);
        showBadge(`透明度 ${Math.round(nv * 100)}%`);
        debouncePersist();
        return;
      }
      let base2 = sizeRef.current;
      if (!base2) {
        void win.outerSize().then((s) => {
          sizeRef.current = { w: Math.max(40, s.width - PIN_MARGIN * 2), h: Math.max(40, s.height - PIN_MARGIN * 2) };
        }).catch(() => {
        });
        return;
      }
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const nw = Math.max(40, Math.round(base2.w * factor));
      const nh = Math.max(40, Math.round(base2.h * factor));
      sizeRef.current = { w: nw, h: nh };
      pendingSizeRef.current = { w: nw + PIN_MARGIN * 2, h: nh + PIN_MARGIN * 2 };
      if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = 0;
          const p = pendingSizeRef.current;
          if (p) getCurrentWindow().setSize(new PhysicalSize(p.w, p.h)).catch(() => {
          });
        });
      }
      if (baseWRef.current > 0) showBadge(`${Math.round(nw / baseWRef.current * 100)}%`);
      debouncePersist();
    };
    window.addEventListener("wheel", h, { passive: false });
    return () => {
      window.removeEventListener("wheel", h);
    };
  }, []);
  const clickThroughRef = reactExports.useRef(clickThrough);
  clickThroughRef.current = clickThrough;
  reactExports.useEffect(() => {
    let un;
    void listen("pin://visibility-changed", (e) => {
      if (e.payload === true && clickThroughRef.current && idRef.current) {
        setClickThrough(false);
        pinSetClickThrough(false).catch(() => {
        });
        void persistNowRef.current();
      }
    }).then((f) => {
      un = f;
    });
    return () => {
      un?.();
    };
  }, []);
  reactExports.useEffect(() => {
    const h = (e) => {
      if (ocr.onKeyDown(e)) return;
      if (!idRef.current) return;
      if (e.key === "Delete" || e.key === "Escape") {
        pinClose(idRef.current).catch(() => {
          void pinHideOne().catch(() => {
          });
        });
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "c" || e.key === "C")) {
        showBadge("已复制图片", 1200, "copied");
        const job = kindRef.current === "html" ? copyPinAsImage() : pinCopyOriginal(idRef.current).then(() => void 0);
        job.catch(() => showBadge("复制失败", 1500, "failed"));
      } else if (e.key === "r" && e.ctrlKey) {
        setRotation((r) => (r + 90) % 360);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const dragClearRef = reactExports.useRef(0);
  const draggingRef = reactExports.useRef(false);
  const rootRef = reactExports.useRef(null);
  const clearDragState = () => {
    window.clearTimeout(dragClearRef.current);
    draggingRef.current = false;
    void pinBusy(false);
    rootRef.current?.classList.remove("pin-dragging");
    setDragging(false);
  };
  const onMouseDown = (e) => {
    if (e.button !== 0 || !idRef.current) return;
    if (ocr.onMouseDown(e.nativeEvent)) return;
    ocr.clearSelection();
    draggingRef.current = true;
    void pinBusy(true);
    setDragging(true);
    rootRef.current?.classList.add("pin-dragging");
    window.clearTimeout(dragClearRef.current);
    dragClearRef.current = window.setTimeout(clearDragState, 800);
    const el = e.currentTarget;
    const win = getCurrentWindow();
    const dpr = window.devicePixelRatio || 1;
    const pointerId = e.nativeEvent.pointerId;
    try {
      el.setPointerCapture(pointerId);
    } catch {
    }
    let tx = 0, ty = 0;
    let lx = e.screenX, ly = e.screenY;
    let ready = false;
    let raf = 0;
    const cleanup = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      try {
        el.releasePointerCapture(pointerId);
      } catch {
      }
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (ready) void win.setPosition(new PhysicalPosition(Math.round(tx), Math.round(ty))).catch(() => {
      });
      clearDragState();
    };
    const apply = () => {
      raf = 0;
      if (ready) void win.setPosition(new PhysicalPosition(Math.round(tx), Math.round(ty))).catch(() => {
      });
    };
    const onMove = (ev) => {
      if (ev.buttons === 0) {
        cleanup();
        return;
      }
      if (!ready) {
        lx = ev.screenX;
        ly = ev.screenY;
        return;
      }
      tx += (ev.screenX - lx) * dpr;
      ty += (ev.screenY - ly) * dpr;
      lx = ev.screenX;
      ly = ev.screenY;
      window.clearTimeout(dragClearRef.current);
      dragClearRef.current = window.setTimeout(clearDragState, 800);
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => cleanup();
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    void win.outerPosition().then((p0) => {
      tx = p0.x;
      ty = p0.y;
      ready = true;
    }).catch(() => cleanup());
  };
  reactExports.useEffect(() => {
    let un;
    void getCurrentWindow().onMoved(() => {
      if (draggingRef.current) return;
      debouncePersist();
      window.clearTimeout(dragClearRef.current);
      dragClearRef.current = window.setTimeout(clearDragState, 180);
    }).then((f) => {
      un = f;
    });
    return () => {
      un?.();
      window.clearTimeout(dragClearRef.current);
    };
  }, []);
  reactExports.useEffect(() => {
    const h = () => {
      void persistNowRef.current();
    };
    window.addEventListener("mouseup", h);
    return () => window.removeEventListener("mouseup", h);
  }, []);
  const runMenuActionRef = reactExports.useRef(() => {
  });
  reactExports.useEffect(() => {
    let un;
    void getCurrentWindow().listen("pin-menu-action", (e) => {
      if (e.payload.pin === winLabel) runMenuActionRef.current(e.payload.id);
    }).then((f) => {
      un = f;
    });
    return () => {
      un?.();
    };
  }, [winLabel]);
  const runMenuAction = (id) => {
    const pid = idRef.current;
    switch (id) {
      case "copy-text":
        showBadge("已复制文本", 1200, "copied");
        pinCopyOriginal(pid).catch(() => showBadge("复制失败", 1500, "failed"));
        break;
      case "copy-image":
        showBadge("已复制图片", 1200, "copied");
        copyPinAsImage().catch(() => showBadge("复制失败", 1500, "failed"));
        break;
      case "copy":
        showBadge("已复制图片", 1200, "copied");
        pinCopyOriginal(pid).catch(() => showBadge("复制失败", 1500, "failed"));
        break;
      case "save-as": {
        void (async () => {
          try {
            const src2 = await pinFilePath(pid);
            const ext = src2 ? (src2.split(".").pop() || "png").toLowerCase() : "png";
            const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const picked = await save({
              defaultPath: `pin-${ts}.${ext}`,
              filters: [{ name: "图片", extensions: [ext] }]
            });
            if (!picked) return;
            await pinSaveAs(pid, picked);
            showBadge("已保存", 1500, "copied");
          } catch (err) {
            void diagLog(`[pin] save-as failed: ${String(err)}`);
            showBadge("保存失败", 1500, "failed");
          }
        })();
        break;
      }
      case "toggle-shadow":
        setShadow((s) => !s);
        break;
      case "toggle-clickthrough": {
        const turningOn = !clickThrough;
        pinSetClickThrough(turningOn).then(() => {
          setClickThrough(turningOn);
          if (turningOn) showBadge("已鼠标穿透 · 按贴图热键唤回", 4e3);
        }).catch(() => {
        });
        break;
      }
      case "close":
        pinClose(pid).catch(() => {
        });
        break;
    }
  };
  runMenuActionRef.current = runMenuAction;
  const copyPinAsImage = async () => {
    const el = htmlRef.current, wrap = htmlWrapRef.current;
    if (!el || !wrap) throw new Error("no html");
    const natW = Math.max(1, el.offsetWidth), natH = Math.max(1, el.offsetHeight);
    const dpr = window.devicePixelRatio || 1;
    const clone = el.cloneNode(true);
    clone.style.width = `${natW}px`;
    clone.style.maxWidth = "none";
    clone.style.minHeight = "0";
    clone.style.margin = "0";
    const holder = document.createElement("div");
    holder.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    holder.appendChild(clone);
    const xml = new XMLSerializer().serializeToString(holder);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${natW}" height="${natH}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("svg render failed"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    const dispW = Math.max(1, wrap.clientWidth);
    const dispH = Math.max(1, Math.round(natH * (dispW / natW)));
    const k = dispW / natW;
    const c = document.createElement("canvas");
    c.width = Math.round(dispW * dpr);
    c.height = Math.round(dispH * dpr);
    const ctx = c.getContext("2d");
    ctx.scale(dpr * k, dpr * k);
    const bg = getComputedStyle(el).backgroundColor;
    ctx.fillStyle = bg && bg !== "transparent" ? bg : "#ffffff";
    ctx.fillRect(0, 0, natW, natH);
    ctx.drawImage(img, 0, 0, natW, natH);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    if (!blob) throw new Error("toBlob null");
    await pinCopyImageBytes(blob);
  };
  const onContext = async (e) => {
    e.preventDefault();
    const id = idRef.current;
    if (!id) return;
    const copyActions = kind === "html" ? [
      { id: "copy-text", label: "复制原文本" },
      { id: "copy-image", label: "复制为图片" }
    ] : [{ id: "copy", label: "复制" }];
    const items = [
      ...copyActions,
      ...kind === "image" ? [{ id: "save-as", label: "另存为..." }] : [],
      { id: "toggle-shadow", label: shadow ? "关闭阴影" : "开启阴影" },
      // 鼠标穿透：点击/滚轮全部穿过贴图直达下面的窗口（Snipaste 同款）。
      // 穿透后贴图收不到任何鼠标事件——出口是贴图热键（隐藏后唤回自动解除）
      { id: "toggle-clickthrough", label: clickThrough ? "取消鼠标穿透" : "开启鼠标穿透" },
      { id: "close", label: "关闭贴图" }
    ];
    const dpr = window.devicePixelRatio || 1;
    let lx = e.clientX, ly = e.clientY;
    try {
      const pos = await getCurrentWindow().outerPosition();
      lx += pos.x / dpr;
      ly += pos.y / dpr;
    } catch {
    }
    const existing = await WebviewWindow.getByLabel("pin-menu");
    if (existing) {
      void emitTo("pin-menu", "pin-menu-show", {
        items,
        cx: Math.round(lx),
        cy: Math.round(ly),
        pin: winLabel
      }).catch(() => {
      });
      return;
    }
    const params = new URLSearchParams({
      wm: "pin-menu",
      items: JSON.stringify(items),
      cx: String(Math.round(lx)),
      cy: String(Math.round(ly)),
      pin: winLabel
    });
    try {
      new WebviewWindow("pin-menu", {
        url: `index.html?${params.toString()}`,
        width: 180,
        height: 40,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        focus: true,
        resizable: false,
        shadow: false,
        visible: false,
        skipTaskbar: true
      });
    } catch {
    }
  };
  const readyWhenPainted = (img) => {
    const fire = () => {
      void pinReady().catch(() => {
      });
    };
    if (img?.decode) {
      img.decode().then(fire, fire);
    } else {
      requestAnimationFrame(() => requestAnimationFrame(fire));
    }
  };
  const hasContent = !!src && kind === "image" || kind === "html" && html !== null;
  const [focused, setFocused] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: rootRef,
      className: `pin-window${shadow && hasContent ? " pin-shadow" : ""}${dragging ? " pin-dragging" : ""}${focused ? " pin-focused" : ""}${ocr.altActive ? " pin-textmode" : ""}`,
      style: { opacity: hasContent ? opacity : 0, "--pin-accent": accent, "--pin-m": `${pinMarginCss()}px` },
      onMouseDown,
      onContextMenu: onContext,
      onDoubleClick: () => {
        if (ocr.altActive || ocr.hasSelectionRef.current || !idRef.current) return;
        pinClose(idRef.current).catch(() => {
        });
      },
      children: [
        src && kind === "image" && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "img",
          {
            ref: imgRef,
            src,
            draggable: false,
            onLoad: (e) => {
              const el = e.target;
              baseWRef.current = el.naturalWidth || 0;
              if (tAssignRef.current) diagLog(`[pin] img decoded +${Date.now() - tAssignRef.current}ms`);
              readyWhenPainted(el);
            },
            onError: () => {
              const id = idRef.current;
              if (!id || retriedRef.current) return;
              retriedRef.current = true;
              const base2 = pinImageUrl(id);
              setSrc(base2 + (base2.includes("?") ? "&" : "?") + "r=" + Date.now());
            },
            style: {
              transform: `rotate(${rotation}deg)`,
              width: "100%",
              height: "100%",
              objectFit: "contain"
            }
          }
        ),
        kind === "html" && html !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: htmlWrapRef, className: "pin-html-wrap", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            ref: htmlRef,
            className: "pin-html",
            dangerouslySetInnerHTML: { __html: html }
          }
        ) }),
        hasContent && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: `pin-border${introDone ? "" : " pin-border-flash"}`,
            onAnimationEnd: () => setIntroDone(true)
          }
        ),
        ocr.hintRects.map((r, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "pin-ocr-hint",
            style: { left: r.x, top: r.y, width: r.w, height: r.h }
          },
          `h${i}`
        )),
        ocr.selRects.map((r, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "pin-ocr-sel",
            style: { left: r.x, top: r.y, width: r.w, height: r.h }
          },
          `s${i}`
        )),
        ocr.busy && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pin-ocr-loading", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pin-ocr-spinner" }),
          "识别中…"
        ] }),
        ocr.altActive && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pin-textmode-badge", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pin-textmode-badge-k", children: "文字选择模式" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pin-textmode-badge-s", children: "拖动已锁定 · 再按 Alt 退出" })
        ] }),
        ocr.altActive && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { onMouseDown: (e) => e.stopPropagation(), onMouseUp: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          OcrPanel,
          {
            style: { right: "calc(var(--pin-m, 0px) + 6px)", top: "calc(var(--pin-m, 0px) + 6px)", width: 300, maxWidth: "calc(100% - 12px)", maxHeight: "64%" },
            lines: ocr.lines,
            phase: "done",
            trans: pinOcrTrans,
            translating: pinOcrTranslating,
            onClose: pinCloseOcr,
            onCopyAll: pinCopyAllOcr,
            onCopyTrans: pinCopyTransOut,
            onTranslate: () => void pinDoTranslate(),
            onReturn: () => setPinOcrTrans(null)
          }
        ) }),
        zoomLabel && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `pin-zoom-badge${zoomLabel.cls ? " " + zoomLabel.cls : ""}`, children: zoomLabel.text })
      ]
    }
  );
}
function readUrl() {
  const p = new URLSearchParams(location.search.replace(/^\?/, ""));
  try {
    const items = JSON.parse(p.get("items") || "[]");
    const cx = Number(p.get("cx") || 0);
    const cy = Number(p.get("cy") || 0);
    const pin = p.get("pin") || "";
    if (!Array.isArray(items) || !pin) return null;
    return { items, cx, cy, pin };
  } catch {
    return null;
  }
}
function PinMenu() {
  const load = useConfigStore((s) => s.load);
  const [data2, setData] = reactExports.useState(readUrl());
  const menuRef = reactExports.useRef(null);
  const shownRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    void load();
  }, [load]);
  reactExports.useEffect(() => {
    let un;
    void getCurrentWindow().listen("pin-menu-show", (e) => {
      setData(e.payload);
    }).then((f) => {
      un = f;
    });
    return () => {
      un?.();
    };
  }, []);
  const hide2 = () => {
    shownRef.current = false;
    getCurrentWindow().hide().catch(() => {
    });
  };
  const onPick = (id) => {
    if (data2?.pin) emitTo(data2.pin, "pin-menu-action", { id, pin: data2.pin }).catch(() => {
    });
    hide2();
  };
  reactExports.useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !data2) return;
    const mw = el.offsetWidth, mh = el.offsetHeight;
    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    let px = data2.cx + 2, py = data2.cy + 2;
    if (px + mw > availW) px = Math.max(2, data2.cx - mw - 2);
    if (py + mh > availH) py = Math.max(2, data2.cy - mh - 2);
    const win = getCurrentWindow();
    void win.setSize(new LogicalSize(mw, mh)).then(() => {
      void win.setPosition(new LogicalPosition(px, py)).then(() => {
        void win.show().then(() => {
          void win.setFocus().catch(() => {
          });
          shownRef.current = true;
        }).catch(() => {
        });
      }).catch(() => {
      });
    }).catch(() => {
    });
  }, [data2]);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hide2();
      }
    };
    const onBlur = () => {
      if (shownRef.current) hide2();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  if (!data2) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pin-ctx-menu", ref: menuRef, children: data2.items.map((it) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pin-ctx-item", onClick: () => onPick(it.id), children: it.label }, it.id)) });
}
function ScrollShotBar() {
  const [phase, setPhase] = reactExports.useState("running");
  const [scrolling, setScrolling] = reactExports.useState(false);
  const [height, setHeight] = reactExports.useState(0);
  const [result, setResult] = reactExports.useState(null);
  const [speed, setSpeed] = reactExports.useState(5);
  const stoppingRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    void scrollGetSpeed().then((v) => setSpeed(v)).catch(() => {
    });
    const un1 = listen(EVT_SCROLLSHOT_PROGRESS, (e) => {
      setHeight(e.payload.height);
    });
    const un2 = listen(EVT_SCROLLSHOT_DONE, (e) => {
      setResult(e.payload);
      if (e.payload.ok) setPhase("done");
      else if (e.payload.error === "已取消") dismiss();
      else setPhase("error");
    });
    const un3 = listen(EVT_BAR_RESET, () => {
      stoppingRef.current = false;
      setHeight(0);
      setResult(null);
      setScrolling(false);
      setPhase("running");
    });
    return () => {
      void un1.then((u) => u());
      void un2.then((u) => u());
      void un3.then((u) => u());
    };
  }, []);
  const autoCloseRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    if (phase !== "done" && phase !== "error") return;
    window.clearTimeout(autoCloseRef.current);
    autoCloseRef.current = window.setTimeout(dismiss, 2500);
    return () => window.clearTimeout(autoCloseRef.current);
  }, [phase]);
  const stop = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setPhase("encoding");
    void scrollStop().catch(() => {
    });
  };
  const cancelToShot = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    void scrollCancel().catch(() => {
    });
  };
  const beginScroll = () => {
    if (stoppingRef.current) return;
    setScrolling(true);
    void scrollStartScroll().catch(() => setScrolling(false));
  };
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "running") cancelToShot();
        else dismiss();
      } else if (e.key === " " && phase === "running" && !stoppingRef.current) {
        e.preventDefault();
        if (!scrolling) beginScroll();
        else stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, scrolling]);
  function dismiss() {
    void scrollDismiss().catch(() => {
    });
  }
  const changeSpeed = (v) => {
    setSpeed(v);
    void scrollSetSpeed(v).catch(() => {
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ssb-root", children: [
    (phase === "running" || phase === "encoding") && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ssb-head", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-dot" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-title", children: "滚动长截图" }),
        phase === "running" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ssb-status", children: [
          "已捕获 ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: Math.round(height) }),
          " px"
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ssb-status", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 12, className: "ssb-spin" }),
          " 正在生成…"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-flex" }),
        phase === "running" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          !scrolling ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "ssb-btn ssb-go", onClick: beginScroll, title: "开始自动滚动 (空格)", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 10, fill: "currentColor" }),
            " 开始"
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "ssb-btn ssb-stop", onClick: stop, title: "结束并保存贴到桌面 (空格)", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Square, { size: 10, fill: "currentColor" }),
            " 结束"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "ssb-btn ssb-cancel", onClick: cancelToShot, title: "取消并回到截图 (Esc)", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Ban, { size: 11 }),
            " 取消"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ssb-tip", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: !scrolling ? "把鼠标放在要滚动的页面内，按 空格 或点「开始」；Esc 取消退出" : "滚轮跟随鼠标（保持在页面内即滚动），按 空格 或「结束」完成拼接" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-flex" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ssb-speed", title: "每档 = 每步滚动 40px", children: [
          "步高",
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "range",
              min: 1,
              max: 10,
              step: 1,
              value: speed,
              onChange: (e) => changeSpeed(+e.target.value)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("b", { children: [
            speed * 40,
            "px"
          ] })
        ] })
      ] })
    ] }),
    phase === "done" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ssb-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-dot ok" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ssb-title", children: [
        "完成（",
        Math.round(result?.height ?? height),
        " px）已贴到桌面"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-flex" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "ssb-btn", onClick: dismiss, title: "关闭", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 12 }) })
    ] }),
    phase === "error" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ssb-head", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-dot err" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-status ssb-err", children: result?.error ?? "失败" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ssb-flex" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "ssb-btn", onClick: dismiss, title: "关闭", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 12 }) })
    ] })
  ] });
}
function ScrollShotFrame() {
  const [info, setInfo] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const query = () => {
      void scrollFrameRect().then((v) => {
        if (v) setInfo(v);
      }).catch(() => {
      });
    };
    let tries = 0;
    const poll = () => {
      void scrollFrameRect().then((v) => {
        if (v) setInfo(v);
        else if (++tries < 40) window.setTimeout(poll, 100);
      }).catch(() => {
      });
    };
    poll();
    const un = listen("scrollshot://frame-move", query);
    return () => {
      void un.then((f) => f());
    };
  }, []);
  const dpr = window.devicePixelRatio || 1;
  const B = 3;
  let strips = [];
  if (info) {
    const [wx, wy] = info.win;
    const [rx, ry, rw, rh] = info.region;
    const x = (rx - wx) / dpr;
    const y = (ry - wy) / dpr;
    const w = rw / dpr;
    const h = rh / dpr;
    strips = [
      { left: x - B - 1, top: y - B - 1, width: w + 2 * B + 2, height: B },
      // 上
      { left: x - B - 1, top: y + h + 1, width: w + 2 * B + 2, height: B },
      // 下
      { left: x - B - 1, top: y - B - 1, width: B, height: h + 2 * B + 2 },
      // 左
      { left: x + w + 1, top: y - B - 1, width: B, height: h + 2 * B + 2 }
      // 右
    ];
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { position: "fixed", inset: 0, pointerEvents: "none" }, children: strips.map((s, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
    position: "absolute",
    ...s,
    background: "rgba(var(--accent-rgb), 0.9)",
    boxShadow: "0 0 6px rgba(var(--accent-rgb), 0.8)",
    borderRadius: 1
  } }, i)) });
}
const recSelectCancel = () => invoke("rec_select_cancel");
const recorderStart = (rect, o) => invoke("recorder_start", {
  x: rect.x,
  y: rect.y,
  w: rect.w,
  h: rect.h,
  fmt: o.fmt,
  fps: o.fps,
  scale: o.scale,
  quality: o.quality,
  audio: o.audio
});
const recorderAudioVolume = (volume) => invoke("recorder_audio_volume", { volume: Math.round(volume) });
const recorderAudioVolumeGet = () => invoke("recorder_audio_volume_get");
const recorderAudioState = () => invoke("recorder_audio_state");
const recorderAudioRec = (on) => invoke("recorder_audio_rec", { on });
const recorderStop = () => invoke("recorder_stop");
const recorderPause = () => invoke("recorder_pause");
const recorderResume = () => invoke("recorder_resume");
const recorderCancel = () => invoke("recorder_cancel");
const recDismiss = () => invoke("rec_dismiss");
const EVT_REC_TICK = "recorder://tick";
const EVT_REC_DONE = "recorder://done";
const EVT_REC_START = "recorder://start";
const revealFile = (path) => invoke("quickfiles_reveal", { path });
const RES_HEIGHT = { raw: 0, "1080": 1080, "720": 720, "360": 360 };
const RES_LIST = ["raw", "1080", "720", "360"];
const MIN_FPS = 5;
const MAX_FPS = 60;
const AUDIO_LIST = ["off", "mic", "system", "mix"];
const AUDIO_ICON = {
  off: /* @__PURE__ */ jsxRuntimeExports.jsx(VolumeX, { size: 13 }),
  mic: /* @__PURE__ */ jsxRuntimeExports.jsx(Mic, { size: 13 }),
  system: /* @__PURE__ */ jsxRuntimeExports.jsx(MonitorSpeaker, { size: 13 }),
  mix: /* @__PURE__ */ jsxRuntimeExports.jsx(AudioLines, { size: 13 })
};
const AUDIO_LABEL = {
  off: "不录音",
  mic: "麦克风",
  system: "系统声音",
  mix: "麦克风 + 系统声音"
};
function RecorderSelect() {
  const [rect, setRect] = reactExports.useState(null);
  const [dragging, setDragging] = reactExports.useState(false);
  const dragRef = reactExports.useRef(null);
  const rectRef = reactExports.useRef(null);
  const startingRef = reactExports.useRef(false);
  const [starting, setStarting] = reactExports.useState(false);
  const [error, setError] = reactExports.useState("");
  const [opts, setOpts] = reactExports.useState({ fmt: "mp4", fps: 12, scale: 1, quality: "normal", audio: "off" });
  const [res, setRes] = reactExports.useState("raw");
  const [masking, setMasking] = reactExports.useState(false);
  reactExports.useEffect(() => {
    invoke("config_load").then((cfg) => {
      const r = cfg.recorder;
      if (!r) return;
      const fmt2 = r.fmt === "gif" ? "gif" : "mp4";
      const res2 = RES_LIST.includes(r.res) ? r.res : "raw";
      const quality = ["high", "normal", "fast"].includes(r.quality) ? r.quality : "normal";
      const fps = Math.min(MAX_FPS, Math.max(MIN_FPS, Math.round(r.fps ?? 12)));
      const audio = AUDIO_LIST.includes(r.audio) ? r.audio : "off";
      setOpts((o) => ({ ...o, fmt: fmt2, quality, fps, audio }));
      setRes(res2);
    }).catch(() => {
    });
  }, []);
  reactExports.useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);
  const maskingRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    maskingRef.current = masking;
  }, [masking]);
  reactExports.useEffect(() => {
    const un1 = listen("recorder://select-reset", () => {
      startingRef.current = false;
      setStarting(false);
      setError("");
      setMasking(false);
      setBoth(null);
    });
    const un2 = listen("recorder://mask", () => {
      setStarting(false);
      setMasking(true);
    });
    const un3 = listen(EVT_REC_DONE, () => {
      setMasking(false);
      setBoth(null);
      setDragging(false);
      startingRef.current = false;
      setStarting(false);
    });
    return () => {
      void un1.then((u) => u());
      void un2.then((u) => u());
      void un3.then((u) => u());
    };
  }, []);
  const setBoth = (r) => {
    rectRef.current = r;
    setRect(r);
  };
  const onDown = (e) => {
    if (e.button !== 0 || startingRef.current) return;
    if (e.target.closest(".rec-panel")) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY };
    setDragging(true);
    setBoth({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    e.target.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const x = Math.min(d.sx, e.clientX);
    const y = Math.min(d.sy, e.clientY);
    const w = Math.abs(e.clientX - d.sx);
    const h = Math.abs(e.clientY - d.sy);
    setBoth({ x, y, w, h });
  };
  const onUp = (e) => {
    dragRef.current = null;
    setDragging(false);
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch {
    }
  };
  const start = async () => {
    const r = rectRef.current;
    if (!r || startingRef.current) return;
    if (r.w < 24 || r.h < 24) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    const target = RES_HEIGHT[res];
    const scale = target > 0 ? Math.min(1, Math.max(0.25, target / r.h)) : 1;
    const sc = window.devicePixelRatio || 1;
    try {
      await recorderStart({
        x: Math.round(r.x * sc),
        y: Math.round(r.y * sc),
        w: Math.round(r.w * sc),
        h: Math.round(r.h * sc)
      }, {
        fmt: opts.fmt,
        fps: opts.fps,
        scale,
        quality: opts.quality,
        // GIF 容器不支持音频，强制关掉（Rust 侧也会忽略，这里先兜住避免误解）
        audio: opts.fmt === "mp4" ? opts.audio : "off"
      });
    } catch (err) {
      console.error("recorder_start failed", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };
  reactExports.useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 3e3);
    return () => clearTimeout(t);
  }, [error]);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (startingRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (masking) {
          void recorderStop().catch(() => {
          });
          return;
        }
        void recSelectCancel().catch(() => {
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (masking) return;
        void start();
      }
    };
    const onContext = (e) => {
      e.preventDefault();
      if (startingRef.current) return;
      if (rectRef.current) setBoth(null);
      else void recSelectCancel().catch(() => {
      });
    };
    let blurTimer = null;
    const onBlur = () => {
      if (startingRef.current) return;
      if (maskingRef.current) return;
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) {
          dragRef.current = null;
          setDragging(false);
          void recSelectCancel().catch(() => {
          });
        }
      }, 300);
    };
    const onFocus = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      if (blurTimer) clearTimeout(blurTimer);
    };
  });
  const valid = rect != null && rect.w >= 24 && rect.h >= 24;
  const PANEL_W_EST = opts.fmt === "mp4" ? 268 : 172;
  const PANEL_H_EST = 34;
  let panelLeft = 0, panelTop = 0;
  if (valid && rect) {
    let left = rect.x + rect.w - PANEL_W_EST - 4;
    let top = rect.y + rect.h + 8;
    const outsideFits = top + PANEL_H_EST <= window.innerHeight - 4 && left >= 4 && left + PANEL_W_EST <= window.innerWidth - 4;
    if (!outsideFits) {
      left = rect.x + rect.w - PANEL_W_EST - 6;
      top = rect.y + rect.h - PANEL_H_EST - 6;
      left = Math.max(rect.x + 4, Math.min(left, rect.x + rect.w - PANEL_W_EST - 4));
      top = Math.max(rect.y + 4, Math.min(top, rect.y + rect.h - PANEL_H_EST - 4));
    }
    panelLeft = Math.max(4, Math.min(left, window.innerWidth - PANEL_W_EST - 4));
    panelTop = Math.max(4, Math.min(top, window.innerHeight - PANEL_H_EST - 4));
  }
  const panelRef = reactExports.useRef(null);
  reactExports.useLayoutEffect(() => {
    const el = panelRef.current;
    if (!valid || !el || !rect) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = rect.x + rect.w - w - 4;
    let top = rect.y + rect.h + 8;
    const outsideFits = top + h <= window.innerHeight - 4 && left >= 4 && left + w <= window.innerWidth - 4;
    if (!outsideFits) {
      left = rect.x + rect.w - w - 6;
      top = rect.y + rect.h - h - 6;
      left = Math.max(rect.x + 4, Math.min(left, rect.x + rect.w - w - 4));
      top = Math.max(rect.y + 4, Math.min(top, rect.y + rect.h - h - 4));
    }
    el.style.left = `${Math.max(4, Math.min(left, window.innerWidth - w - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(top, window.innerHeight - h - 4))}px`;
  }, [rect, valid, dragging]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rec-select", onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, children: [
    !valid && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rec-shade rec-shade-full" }),
    valid && rect && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rec-shade", style: { left: 0, top: 0, width: "100%", height: rect.y } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rec-shade", style: { left: 0, top: rect.y, width: rect.x, height: rect.h } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rec-shade", style: { left: rect.x + rect.w, top: rect.y, right: 0, height: rect.h } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rec-shade", style: { left: 0, top: rect.y + rect.h, width: "100%", bottom: 0 } }),
      !masking && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "rec-frame",
          style: { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "rec-corner tl" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "rec-corner tr" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "rec-corner bl" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "rec-corner br" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rec-size", children: [
              Math.round(rect.w),
              " × ",
              Math.round(rect.h)
            ] })
          ]
        }
      ),
      !dragging && !masking && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          ref: panelRef,
          className: "rec-panel",
          style: { left: panelLeft, top: panelTop },
          onPointerDown: (e) => e.stopPropagation(),
          onDoubleClick: (e) => e.stopPropagation(),
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rec-quick-row", children: [
            ["mp4", "gif"].map((v) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: `rec-fmt-btn${opts.fmt === v ? " active" : ""}`,
                onClick: () => setOpts((o) => ({ ...o, fmt: v })),
                title: v === "mp4" ? "视频 MP4" : "动图 GIF",
                children: v === "mp4" ? "MP4" : "GIF"
              },
              v
            )),
            opts.fmt === "mp4" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "rec-quick-sep" }),
              AUDIO_LIST.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: `rec-fmt-btn rec-audio-btn${opts.audio === v ? " active" : ""}`,
                  onClick: () => setOpts((o) => ({ ...o, audio: v })),
                  title: `音源：${AUDIO_LABEL[v]}（录制中可在顶部控制条随时开关）`,
                  children: AUDIO_ICON[v]
                },
                v
              ))
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("i", { className: "rec-quick-sep" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "rec-start", onClick: () => void start(), title: "开始录制（Enter）", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 13, fill: "currentColor", stroke: "none" }) })
          ] })
        }
      )
    ] }),
    !valid && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rec-hint", children: "拖拽框选录制区域" }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rec-hint rec-hint-error", children: [
      "启动失败：",
      error
    ] }),
    starting && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rec-hint", children: "正在启动录制…" })
  ] });
}
const fmt = (ms) => {
  const s = Math.floor(ms / 1e3);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};
const fmtSize = (bytes) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
const VOLP_W = 26;
const VOLP_H = 120;
function RecorderBar() {
  const [phase, setPhase] = reactExports.useState("recording");
  const [elapsed, setElapsed] = reactExports.useState(0);
  const [paused, setPaused] = reactExports.useState(false);
  const [result, setResult] = reactExports.useState(null);
  const [recSupported, setRecSupported] = reactExports.useState(false);
  const [recOn, setRecOn] = reactExports.useState(false);
  const [recErr, setRecErr] = reactExports.useState("");
  const [volume, setVolume] = reactExports.useState(100);
  const [volOpen, setVolOpen] = reactExports.useState(false);
  const volBtnRef = reactExports.useRef(null);
  const stoppingRef = reactExports.useRef(false);
  const autoCloseRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    refreshAudio();
  }, []);
  const refreshAudio = () => {
    setTimeout(() => {
      void recorderAudioState().then(([available, on]) => {
        setRecSupported(available);
        setRecOn(on);
      }).catch(() => setRecSupported(false));
      void recorderAudioVolumeGet().then((v) => setVolume(v)).catch(() => {
      });
    }, 500);
  };
  reactExports.useEffect(() => {
    document.documentElement.dataset.window = "panel";
  }, []);
  reactExports.useEffect(() => {
    const un1 = listen(EVT_REC_TICK, (e) => {
      setElapsed(e.payload.elapsed_ms);
    });
    const un2 = listen(EVT_REC_DONE, (e) => {
      if (e.payload.canceled) {
        void recDismiss().catch(() => {
        });
        return;
      }
      setResult(e.payload);
      setPhase(e.payload.ok ? "done" : "error");
    });
    const un3 = listen(EVT_REC_START, () => {
      stoppingRef.current = false;
      setPhase("recording");
      setElapsed(0);
      setPaused(false);
      setResult(null);
      setVolOpen(false);
      setRecErr("");
      refreshAudio();
    });
    return () => {
      void un1.then((u) => u());
      void un2.then((u) => u());
      void un3.then((u) => u());
    };
  }, []);
  reactExports.useEffect(() => {
    if (phase === "recording") return;
    setVolOpen(false);
    const place = async () => {
      try {
        const win = getCurrentWindow();
        const dpr = window.devicePixelRatio || 1;
        const s = window.screen;
        const al = s.availLeft;
        const at = s.availTop;
        const aw = s.availWidth;
        const ah = s.availHeight;
        const PW = 336, PH = 60;
        await win.setSize(new LogicalSize(PW, PH));
        await win.setPosition(new PhysicalPosition(
          Math.round((al + aw - PW - 16) * dpr),
          Math.round((at + ah - PH - 16) * dpr)
        ));
      } catch {
      }
    };
    void place();
    if (phase === "done" || phase === "error") {
      autoCloseRef.current = setTimeout(() => {
        void recDismiss().catch(() => {
        });
      }, 6e3);
    }
    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, [phase]);
  const closeVolPop = () => {
    if (!volOpen) return;
    setVolOpen(false);
    void emitTo("rec-vol", "rec-vol-hide", {}).catch(() => {
    });
  };
  const openVolPop = async () => {
    const btn = volBtnRef.current;
    if (!btn) return;
    const dpr = window.devicePixelRatio || 1;
    let physX = 0;
    let physY = 0;
    try {
      const win = getCurrentWindow();
      const pos = await win.outerPosition();
      const r = btn.getBoundingClientRect();
      physX = pos.x + (r.left + r.width / 2) * dpr - VOLP_W / 2 * dpr;
      physY = pos.y + (r.bottom + 6) * dpr;
    } catch {
    }
    setVolOpen(true);
    const pp = new PhysicalPosition(Math.round(physX), Math.round(physY));
    const ps = new PhysicalSize(Math.round(VOLP_W * dpr), Math.round(VOLP_H * dpr));
    const existing = await WebviewWindow.getByLabel("rec-vol").catch(() => null);
    if (existing) {
      void existing.setPosition(pp).then(() => existing.show()).then(() => existing.setFocus()).catch(() => {
      });
      return;
    }
    try {
      new WebviewWindow("rec-vol", {
        url: "index.html",
        width: VOLP_W,
        height: VOLP_H,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        focus: true,
        resizable: false,
        shadow: false,
        visible: false,
        skipTaskbar: true
      });
      for (let i = 0; i < 40; i++) {
        const w = await WebviewWindow.getByLabel("rec-vol").catch(() => null);
        if (w) {
          void w.setSize(ps).then(() => w.setPosition(pp)).then(() => w.show()).then(() => w.setFocus()).catch(() => {
          });
          return;
        }
        await new Promise((r2) => setTimeout(r2, 50));
      }
    } catch {
    }
  };
  const volClosedAtRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    let un;
    void listen("rec-vol-closed", () => {
      volClosedAtRef.current = Date.now();
      setVolOpen(false);
      void recorderAudioVolumeGet().then(setVolume).catch(() => {
      });
    }).then((f) => {
      un = f;
    });
    return () => {
      un?.();
    };
  }, []);
  const onVolClick = () => {
    if (volOpen) {
      closeVolPop();
      return;
    }
    if (Date.now() - volClosedAtRef.current < 400) return;
    void openVolPop();
  };
  reactExports.useEffect(() => {
    if (!volOpen) return;
    if (!recOn || phase !== "recording") closeVolPop();
  }, [recOn, phase, volOpen]);
  const stop = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setPhase("stopping");
    void recorderStop().catch(() => {
    });
  };
  const togglePause = () => {
    if (phase !== "recording") return;
    const next = !paused;
    setPaused(next);
    void (next ? recorderPause() : recorderResume()).catch(() => {
    });
  };
  const toggleRec = () => {
    const next = !recOn;
    setRecOn(next);
    setRecErr("");
    void recorderAudioRec(next).then((v) => {
      if (v === next) return;
      setRecOn(v);
      if (next) setRecErr("无音频设备");
    }).catch(() => {
      setRecOn(!next);
      setRecErr("切换失败");
    });
  };
  reactExports.useEffect(() => {
    if (!recErr) return;
    const t = setTimeout(() => setRecErr(""), 2400);
    return () => clearTimeout(t);
  }, [recErr]);
  const cancel = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    void recorderCancel().catch(() => {
    });
  };
  const openVideo = (path) => {
    void invoke("quickfiles_open", { path, opener: null }).catch(() => {
      void revealFile(path).catch(() => {
      });
    });
  };
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (volOpen) {
          closeVolPop();
          return;
        }
        if (phase === "recording") stop();
        else void recDismiss().catch(() => {
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, volOpen]);
  const dismiss = () => void recDismiss().catch(() => {
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `recb-root${phase !== "recording" ? " recb-toast" : ""}${paused && phase === "recording" ? " paused" : ""}${phase === "done" || phase === "error" ? " recb-final" : ""}`, children: [
    phase === "recording" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `recb-dot${paused ? " off" : ""}` }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "recb-time", children: fmt(elapsed) }),
      recSupported && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: `recb-btn recb-icon${recOn ? " recb-rec-on" : " recb-rec-off"}`,
            onClick: toggleRec,
            title: recOn ? "关闭录音（音轨保留，可随时重开）" : "开启录音（录制中随时可开）",
            children: recOn ? /* @__PURE__ */ jsxRuntimeExports.jsx(Mic, { size: 12 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(MicOff, { size: 12 })
          }
        ),
        recErr && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "recb-rec-tip", children: recErr }),
        recOn && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            ref: volBtnRef,
            className: `recb-btn recb-icon${volOpen ? " recb-vol-on" : ""}`,
            onClick: onVolClick,
            title: `录制音量 ${volume}%（点击调节）`,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Volume2, { size: 12 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: `recb-btn recb-icon${paused ? " recb-resume" : ""}`,
          onClick: togglePause,
          title: paused ? "继续录制" : "暂停录制",
          children: paused ? /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 12, fill: "currentColor", stroke: "none" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Pause, { size: 12, fill: "currentColor", stroke: "none" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "recb-btn recb-icon recb-stop",
          onClick: stop,
          title: "停止并保存（Esc）",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Square, { size: 10, fill: "currentColor", stroke: "none" })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "recb-btn recb-icon recb-cancel",
          onClick: cancel,
          title: "取消录制（不保存）",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 12 })
        }
      )
    ] }),
    phase === "stopping" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 13, className: "recb-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "recb-saving", children: "正在保存…" })
    ] }),
    (phase === "done" || phase === "error") && result && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      result.ok && result.path ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "recb-ic", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Film, { size: 15 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "recb-info", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "recb-title", children: [
            "已保存 ",
            (() => {
              const e = result.path.split(".").pop()?.toLowerCase();
              return e === "gif" ? "GIF 动图" : "MP4 视频";
            })()
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "recb-sub", children: [
            fmt(result.duration_ms),
            " · ",
            fmtSize(result.bytes)
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "recb-btn recb-icon recb-open", onClick: () => openVideo(result.path), title: "打开 / 播放", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 12, fill: "currentColor", stroke: "none" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "recb-btn recb-icon recb-folder", onClick: () => void revealFile(result.path).catch(() => {
        }), title: "打开所在文件夹", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FolderOpen, { size: 12 }) })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "recb-err", children: result.error ?? "录制失败" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "recb-btn recb-icon recb-close", onClick: dismiss, title: "关闭", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 13 }) })
    ] })
  ] });
}
const MAX = 200;
function VolumePopover() {
  const [volume, setVolume] = reactExports.useState(100);
  const draggingRef = reactExports.useRef(false);
  const trackRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    document.documentElement.dataset.window = "panel";
    void recorderAudioVolumeGet().then((v) => setVolume(v)).catch(() => {
    });
  }, []);
  reactExports.useEffect(() => {
    const hide2 = () => {
      void emitTo("rec-bar", "rec-vol-closed", {}).catch(() => {
      });
      void getCurrentWindow().hide().catch(() => {
      });
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        hide2();
      }
    };
    let un;
    void listen("rec-vol-hide", () => hide2()).then((f) => {
      un = f;
    });
    window.addEventListener("blur", hide2);
    window.addEventListener("keydown", onKey);
    return () => {
      un?.();
      window.removeEventListener("blur", hide2);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const commit = (v) => {
    const clamped = Math.min(MAX, Math.max(0, Math.round(v)));
    setVolume(clamped);
    void recorderAudioVolume(clamped).catch(() => {
    });
  };
  const calcFromClientY = (clientY) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (rect.bottom - clientY) / rect.height));
    commit(ratio * MAX);
  };
  const onPointerDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    trackRef.current?.setPointerCapture(e.pointerId);
    calcFromClientY(e.clientY);
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    calcFromClientY(e.clientY);
  };
  const onPointerUp = (e) => {
    draggingRef.current = false;
    trackRef.current?.releasePointerCapture(e.pointerId);
  };
  const pct = Math.round(volume / MAX * 100);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "volp-root", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "volp-track-area",
        ref: trackRef,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerLeave: onPointerUp,
        title: "向上拖动增大，向下拖动减小（0=无声，100=原声，200=两倍）",
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "volp-line", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "volp-fill", style: { height: `${pct}%` } }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "volp-thumb", style: { bottom: `${pct}%` } })
        ] })
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "volp-val", children: [
      volume,
      "%"
    ] })
  ] });
}
let savingTarget = null;
const saveLockListeners = /* @__PURE__ */ new Set();
function notifySaveLock() {
  saveLockListeners.forEach((l) => l());
}
function subscribeSaveLock(cb) {
  saveLockListeners.add(cb);
  return () => {
    saveLockListeners.delete(cb);
  };
}
function getSavingTarget() {
  return savingTarget;
}
function comboFromEvent(e) {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  let main = "";
  let isFunctionKey = false;
  if (/^[a-zA-Z]$/.test(e.key)) {
    main = e.key.toUpperCase();
  } else if (/^[0-9]$/.test(e.key)) {
    main = e.key;
  } else if (/^F([1-9]|1[0-2])$/.test(e.key)) {
    main = e.key.toUpperCase();
    isFunctionKey = true;
  } else {
    return null;
  }
  const mods = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  if (mods.length === 0 && !isFunctionKey) return null;
  return [...mods, main].join("+");
}
function ShortcutInput({
  value,
  conflict,
  onChange
}) {
  const [listening, setListening] = reactExports.useState(false);
  const [hint, setHint] = reactExports.useState("");
  const listeningRef = reactExports.useRef(false);
  listeningRef.current = listening;
  const onChangeRef = reactExports.useRef(onChange);
  onChangeRef.current = onChange;
  const onKeyDown = reactExports.useCallback(
    (e) => {
      if (!listeningRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setHint("");
      if (e.key === "Escape") {
        setListening(false);
        return;
      }
      const combo = comboFromEvent(e.nativeEvent);
      if (combo) {
        onChange(combo);
        setListening(false);
      } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
        setHint("需搭配 Ctrl / Alt / Shift / Win；F1~F12 可单独使用");
      }
    },
    [onChange]
  );
  reactExports.useEffect(() => {
    if (!listening) return;
    const onBlur = () => setListening(false);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [listening]);
  reactExports.useEffect(() => {
    if (!listening) return;
    let unsub;
    let disposed = false;
    onEvent(EVT_SHORTCUT_WIN_CAPTURED, (combo) => {
      if (!listeningRef.current) return;
      onChangeRef.current(combo);
      setListening(false);
    }).then((un) => {
      if (disposed) un();
      else unsub = un;
    });
    void beginShortcutCapture();
    return () => {
      disposed = true;
      unsub?.();
      void endShortcutCapture();
    };
  }, [listening]);
  const cls = [
    "shortcut-input",
    listening ? "listening" : "",
    conflict ? "conflict" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        className: cls,
        onClick: () => {
          setHint("");
          setListening(true);
        },
        onKeyDown,
        children: listening ? "按下组合键…（Esc 取消）" : value
      }
    ),
    listening && hint && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shortcut-input-hint", children: hint })
  ] });
}
function ShortcutRow({
  target,
  title,
  desc,
  onSaved
}) {
  const config = useConfigStore((s) => s.config);
  const sync = useConfigStore((s) => s.sync);
  const [draft, setDraft] = reactExports.useState(config.shortcuts[target]);
  const [error, setError] = reactExports.useState("");
  const [ok, setOk] = reactExports.useState(false);
  const [saving, setSaving] = reactExports.useState(false);
  const dirtyRef = reactExports.useRef(false);
  const lockedBy = reactExports.useSyncExternalStore(subscribeSaveLock, getSavingTarget);
  const lockedByOther = lockedBy !== null && lockedBy !== target;
  const [, bumpRuntime] = reactExports.useState(0);
  reactExports.useEffect(() => {
    shortcutRuntimeBindings().then(() => bumpRuntime((n) => n + 1)).catch(() => {
    });
  }, []);
  reactExports.useEffect(() => {
    if (!dirtyRef.current) setDraft(config.shortcuts[target]);
  }, [config.shortcuts, target]);
  const save2 = async () => {
    if (lockedBy) return;
    const combo = draft;
    const others = Object.keys(config.shortcuts).filter((t) => t !== target);
    if (others.some((t) => combo === config.shortcuts[t])) {
      setError("与另一个快捷键相同，请使用不同组合");
      setOk(false);
      return;
    }
    if (combo === config.shortcuts[target]) {
      setError("");
      setOk(false);
      return;
    }
    savingTarget = target;
    notifySaveLock();
    setSaving(true);
    try {
      await testShortcut(combo);
      const fresh = await applyShortcut(target, combo);
      dirtyRef.current = false;
      if (fresh && typeof fresh === "object" && fresh.shortcuts) {
        sync(fresh);
        setDraft(fresh.shortcuts[target]);
      }
      setOk(true);
      setError("");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请重试");
      setOk(false);
    } finally {
      savingTarget = null;
      notifySaveLock();
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title, desc, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ShortcutInput,
        {
          value: draft,
          conflict: !!error,
          onChange: (combo) => {
            setDraft(combo);
            dirtyRef.current = true;
            setError("");
            setOk(false);
          }
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "btn btn-primary btn-sm",
          disabled: saving || lockedByOther || draft === config.shortcuts[target],
          onClick: () => void save2(),
          children: saving ? "保存中…" : "保存"
        }
      )
    ] }) }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shortcut-hint error", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hint-icon", children: "✕" }),
      error
    ] }),
    ok && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shortcut-hint ok", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hint-icon", children: "✓" }),
      "已保存并生效"
    ] })
  ] });
}
function ClipboardPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const patch = (patched) => {
    void update({
      ...config,
      clipboard: { ...config.clipboard, ...patched }
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "剪贴板设置" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "管理剪贴板历史监听与粘贴行为" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "功能" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "clipboard",
        title: "呼出剪贴板面板",
        desc: "点击快捷键后按下新组合，例如 Ctrl+Alt+C"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "历史容量上限",
          desc: "超出后自动清理最旧的未收藏记录",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Segmented,
            {
              value: String(config.clipboard.max_history),
              options: [
                { value: "100", label: "100" },
                { value: "200", label: "200" },
                { value: "500", label: "500" },
                { value: "1000", label: "1000" }
              ],
              onChange: (v) => patch({ max_history: Number(v) })
            }
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "监听图片", desc: "复制图片时记录缩略图", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Switch,
        {
          checked: config.clipboard.watch_images,
          onChange: (v) => patch({ watch_images: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "监听文件路径", desc: "复制文件/文件夹时记录路径元数据", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Switch,
        {
          checked: config.clipboard.watch_files,
          onChange: (v) => patch({ watch_files: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "粘贴后自动关闭面板",
          desc: "普通粘贴模式下，粘贴完成后自动隐藏面板（顺序粘贴模式始终关闭）",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: config.clipboard.close_after_paste,
              onChange: (v) => patch({ close_after_paste: v })
            }
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "面板置顶显示",
          desc: "剪贴板面板始终悬浮在其他窗口之上（面板头部的图钉按钮可快捷切换）",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: config.clipboard.always_on_top,
              onChange: (v) => patch({ always_on_top: v })
            }
          )
        }
      )
    ] })
  ] });
}
function FolderPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const { folders, loaded, refresh, add, remove } = useFolderStore();
  const [newPath, setNewPath] = reactExports.useState("");
  const [error, setError] = reactExports.useState("");
  const [renameTarget, setRenameTarget] = reactExports.useState(null);
  const [renameValue, setRenameValue] = reactExports.useState("");
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);
  const patch = (patched) => {
    void update({ ...config, folder: { ...config.folder, ...patched } });
  };
  const handleAdd = async () => {
    if (!newPath.trim()) return;
    const err = await add(newPath.trim());
    if (err) {
      setError(err);
    } else {
      setError("");
      setNewPath("");
    }
  };
  const handlePick = async () => {
    try {
      const path = await pickFolder();
      if (!path) return;
      const err = await add(path);
      if (err) setError(err);
      else setError("");
    } catch (err) {
      setError(String(err));
    }
  };
  const handleRename = (id, current) => {
    setRenameTarget({ id, name: current });
    setRenameValue(current);
  };
  const submitRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (name && name !== renameTarget.name) {
      await renameFolder(renameTarget.id, name);
      await refresh();
    }
    setRenameTarget(null);
  };
  const { pinned } = sortFolders(folders);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "文件夹设置" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "管理固定文件夹与面板展示方式" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "功能" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "folder",
        title: "呼出文件夹面板",
        desc: "点击快捷键后按下新组合，例如 Ctrl+Alt+F"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "添加固定文件夹", desc: "输入完整路径、点击浏览选择，或直接在面板中拖拽添加", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            className: "text-input",
            style: { width: 260 },
            placeholder: "例如 D:\\Projects",
            value: newPath,
            onChange: (e) => setNewPath(e.target.value),
            onKeyDown: (e) => e.key === "Enter" && void handleAdd()
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-primary btn-sm", onClick: () => void handleAdd(), children: "添加" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: () => void handlePick(), children: "浏览…" })
      ] }) }),
      error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-row", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-desc", style: { color: "var(--danger)" }, children: error }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      pinned.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-row", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-desc", children: "暂无固定文件夹" }) }),
      pinned.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "folder-manage-item", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "folder-color-dot",
            style: { background: f.color ?? "var(--accent)" },
            title: f.color ?? "无颜色"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "folder-name",
            style: { color: "var(--text-primary)" },
            title: "点击重命名",
            onClick: () => handleRename(f.id, f.name),
            children: f.name
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "folder-path", title: f.path, children: f.path }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "icon-btn",
            title: "删除",
            onClick: () => setDeleteTarget({ id: f.id, name: f.name }),
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { size: 14 })
          }
        )
      ] }, f.id))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "显示访问次数", desc: "在面板条目上展示累计打开次数", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Switch,
        {
          checked: config.folder.show_visit_count,
          onChange: (v) => patch({ show_visit_count: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "面板置顶显示", desc: "文件夹面板始终保持在其他窗口之上", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Switch,
        {
          checked: config.folder.always_on_top,
          onChange: (v) => patch({ always_on_top: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "记录资源管理器访问",
          desc: "自动统计在 Windows 资源管理器中打开过的文件夹，计入“最常访问”排序",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: config.folder.track_explorer,
              onChange: (v) => patch({ track_explorer: v })
            }
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "面板布局模式", desc: "分区内卡片的展示方式，目录树按父目录分组缩进展示", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.folder.layout,
          options: [
            { value: "grid", label: "网格" },
            { value: "list", label: "列表" },
            { value: "tree", label: "目录树" }
          ],
          onChange: (v) => patch({ layout: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "默认终端", desc: "点击卡片/条目上的终端快捷按钮时，使用哪种终端打开当前文件夹", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.folder.terminal_shell,
          options: [
            { value: "wt", label: "Windows Terminal" },
            { value: "cmd", label: "命令提示符" },
            { value: "powershell", label: "PowerShell" }
          ],
          onChange: (v) => patch({ terminal_shell: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "分区排布方式", desc: "固定 / 最常访问两个分区的面板布局", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.folder.split,
          options: [
            { value: "columns", label: "左右分栏" },
            { value: "rows", label: "上下分栏" }
          ],
          onChange: (v) => patch({ split: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "每页数量", desc: "每个分区每页展示的文件夹数，超出可翻页", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: String(config.folder.page_size),
          options: [
            { value: "8", label: "8" },
            { value: "12", label: "12" },
            { value: "16", label: "16" },
            { value: "24", label: "24" }
          ],
          onChange: (v) => patch({ page_size: Number(v) })
        }
      ) })
    ] }),
    renameTarget && /* @__PURE__ */ jsxRuntimeExports.jsx(
      Modal,
      {
        open: true,
        onClose: () => setRenameTarget(null),
        title: `重命名「${renameTarget.name}」`,
        actions: /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: () => setRenameTarget(null), children: "取消" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-primary", onClick: () => void submitRename(), children: "确定" })
        ] }),
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            className: "text-input",
            value: renameValue,
            autoFocus: true,
            placeholder: "新名称",
            onChange: (e) => setRenameValue(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRename();
              }
            }
          }
        )
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmDialog,
      {
        open: deleteTarget !== null,
        onClose: () => setDeleteTarget(null),
        onConfirm: async () => {
          if (deleteTarget) {
            await remove(deleteTarget.id);
          }
        },
        title: `移除「${deleteTarget?.name ?? ""}」？`,
        message: "仅从固定列表移除，不会删除磁盘文件。",
        danger: true,
        confirmLabel: "移除"
      }
    )
  ] });
}
function CredentialPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const c = config.credentials;
  if (!c) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "账号密码" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "本地加密保存的账号密码，呼出面板速查复制" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "功能" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "credentials",
        title: "呼出账号密码面板",
        desc: "点击快捷键后按下新组合，例如 Alt+A"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "面板行为" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "面板置顶", desc: "置顶时常驻显示，失焦不自动隐藏", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Switch,
        {
          checked: c.always_on_top,
          onChange: (v) => void update({ ...config, credentials: { ...c, always_on_top: v } })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "默认显示密码", desc: "打开面板时密码列直接明文显示（仍可手动切换）", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Switch,
        {
          checked: c.show_passwords,
          onChange: (v) => void update({ ...config, credentials: { ...c, show_passwords: v } })
        }
      ) })
    ] })
  ] });
}
function PortPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const c = config.port;
  if (!c) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "端口工具" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "查询端口占用进程、一键结束进程" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "功能" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "port",
        title: "呼出端口工具面板",
        desc: "点击快捷键后按下新组合，例如 Alt+P（查询端口占用 / 一键杀进程）"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "面板行为" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "面板置顶", desc: "置顶时常驻显示，失焦不自动隐藏", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      Switch,
      {
        checked: c.always_on_top,
        onChange: (v) => void update({ ...config, port: { ...c, always_on_top: v } })
      }
    ) }) })
  ] });
}
function SnippetsPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const c = config.snippets;
  if (!c) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "常用语速贴" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "快捷短语一键粘贴到任意应用" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "功能" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "snippets",
        title: "呼出语速贴面板",
        desc: "点击快捷键后按下新组合，例如 Alt+K（快捷短语，一键粘贴到任意应用）"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "面板行为" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "面板置顶", desc: "置顶时常驻显示，失焦不自动隐藏", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      Switch,
      {
        checked: c.always_on_top,
        onChange: (v) => void update({ ...config, snippets: { ...c, always_on_top: v } })
      }
    ) }) })
  ] });
}
async function isEnabled() {
  return await invoke("plugin:autostart|is_enabled");
}
async function enable() {
  await invoke("plugin:autostart|enable");
}
async function disable() {
  await invoke("plugin:autostart|disable");
}
function GeneralPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const load = useConfigStore((s) => s.load);
  const [autostart, setAutostart] = reactExports.useState(false);
  const [autostartBusy, setAutostartBusy] = reactExports.useState(false);
  const [configMsg, setConfigMsg] = reactExports.useState(null);
  reactExports.useEffect(() => {
    isEnabled().then(setAutostart).catch((err) => console.error("读取自启动状态失败", err));
  }, []);
  const patchGeneral = (patched) => {
    void update({ ...config, general: { ...config.general, ...patched } });
  };
  const doExport = async () => {
    try {
      const target = await save({
        title: "导出配置备份",
        defaultPath: "小心工具箱-配置备份.json",
        filters: [{ name: "JSON", extensions: ["json"] }]
      });
      if (!target) return;
      await exportConfigTo(target);
      setConfigMsg(`已导出到 ${target}`);
    } catch (err) {
      setConfigMsg(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const doImport = async () => {
    try {
      const picked = await open({
        title: "选择配置备份文件",
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }]
      });
      if (!picked) return;
      await importConfigFrom(picked);
      await load();
      await broadcastConfigChanged(useConfigStore.getState().config);
      setConfigMsg("已恢复配置，快捷键已按新配置重新生效");
    } catch (err) {
      setConfigMsg(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const toggleAutostart = async (next) => {
    setAutostartBusy(true);
    try {
      if (next) {
        await enable();
      } else {
        await disable();
      }
      setAutostart(next);
    } catch (err) {
      console.error("切换开机自启失败", err);
    } finally {
      setAutostartBusy(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "通用设置" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "启动行为、语言与外观" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "palette",
        title: "全局命令面板",
        desc: "任意应用中按下快捷键呼出：可直接算式与进制/单位换算、JSON·Base64 编解码、时间戳转换、翻译、搜剪贴板/凭证/语速贴/文件夹/文件/本机应用并启动，常用项自动排前"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "开机自动启动",
          desc: "登录 Windows 后在后台静默运行",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: autostart,
              onChange: (v) => {
                if (!autostartBusy) void toggleAutostart(v);
              }
            }
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "静默启动",
          desc: "启动时不弹出设置窗口，仅驻留托盘，通过快捷键呼出面板",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: config.general.silent_start,
              onChange: (v) => patchGeneral({ silent_start: v })
            }
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "界面语言", desc: "更多语言支持即将推出", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.general.language,
          options: [{ value: "zh-CN", label: "简体中文" }],
          onChange: (v) => patchGeneral({ language: v })
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "主题", desc: "跟随系统按 Windows 外观自动切换；其余为固定浅色 / 深色配色", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      GlassSelect,
      {
        value: config.general.theme,
        onChange: (v) => patchGeneral({ theme: v }),
        options: [
          { value: "system", label: "跟随系统", swatch: "linear-gradient(135deg,#eef0f3 0 50%,#2b2f36 50% 100%)" },
          { value: "light", label: "浅色", swatch: "#eef0f3", group: "浅色主题" },
          { value: "mint", label: "浅青", swatch: "#0f9f8c", group: "浅色主题" },
          { value: "skyblue", label: "浅蓝", swatch: "#4c8dff", group: "浅色主题" },
          { value: "red", label: "红色", swatch: "#e5484d", group: "浅色主题" },
          { value: "orange", label: "橙色", swatch: "#e58a2b", group: "浅色主题" },
          { value: "dark", label: "深色", swatch: "#2b2f36", group: "深色主题" }
        ]
      }
    ) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "面板亚克力效果",
          desc: "剪贴板/文件夹面板使用亚克力毛玻璃背景（与窗口是否聚焦无关，呼出即生效）",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: config.general.acrylic_enabled,
              onChange: (v) => patchGeneral({ acrylic_enabled: v })
            }
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "面板底色不透明度",
          desc: "数值越大面板底色越不透明，亚克力模糊越不明显",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "slider-wrap", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Slider,
              {
                value: config.general.acrylic_opacity,
                disabled: !config.general.acrylic_enabled,
                onChange: (v) => patchGeneral({ acrylic_opacity: v })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "slider-value", children: [
              config.general.acrylic_opacity,
              "%"
            ] })
          ] })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "配置备份",
          desc: "全部设置（快捷键、剪贴板、翻译凭据、面板位置等）均自动保存到配置文件；可导出备份用于重装/迁移",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8 }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: () => void doExport(), children: "导出配置" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: () => void doImport(), children: "导入配置" })
          ] })
        }
      ),
      configMsg && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shortcut-hint", children: configMsg })
    ] })
  ] });
}
var BundleType;
(function(BundleType2) {
  BundleType2["Nsis"] = "nsis";
  BundleType2["Msi"] = "msi";
  BundleType2["Deb"] = "deb";
  BundleType2["Rpm"] = "rpm";
  BundleType2["AppImage"] = "appimage";
  BundleType2["App"] = "app";
})(BundleType || (BundleType = {}));
async function getVersion() {
  return invoke("plugin:app|version");
}
function AboutPage() {
  const [version, setVersion] = reactExports.useState("1.0.0");
  reactExports.useEffect(() => {
    getVersion().then(setVersion).catch((err) => console.error("读取版本号失败", err));
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "关于" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "小心工具箱 · Windows 桌面快捷工具集" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "about-hero", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "about-logo", children: "⚡" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { children: "小心工具箱" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "about-version", children: [
        "版本 v",
        version
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "剪贴板管理", desc: "历史记录、收藏置顶、四种粘贴模式" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "文件夹快捷访问", desc: "智能排序、固定拖拽、一键终端打开" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "全局快捷键", desc: "冲突检测，随时呼出悬浮面板" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "技术栈", desc: "Tauri 2 · React 18 · TypeScript · Zustand" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shortcut-hint", children: "适用于 Windows 10 1809+ / Windows 11" })
  ] });
}
function TranslationPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const t = config.translator;
  const [testText, setTestText] = reactExports.useState("");
  const [testOut, setTestOut] = reactExports.useState(null);
  const [testErr, setTestErr] = reactExports.useState(null);
  const patch = (p) => {
    void update({ ...config, translator: { ...t, ...p } });
  };
  const doTest = async () => {
    if (!testText.trim()) return;
    setTestErr(null);
    setTestOut(null);
    try {
      const r = await translateText(testText.trim());
      setTestOut(r.translation);
    } catch (err) {
      setTestErr(err instanceof Error ? err.message : String(err));
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "翻译设置" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "选中文本按快捷键（默认 Ctrl+Alt+T）即译；源/目标语言在翻译面板中直接选择" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "功能" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "translation",
        title: "划词翻译",
        desc: "选中文本后按下快捷键，自动复制并翻译，例如 Alt+S（单个功能键+字母即可）"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "翻译服务商", desc: "需要先在对应开放平台申请免费 Key", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: t.provider,
          options: [
            { value: "youdao", label: "有道智云" },
            { value: "baidu", label: "百度翻译" }
          ],
          onChange: (v) => patch({ provider: v })
        }
      ) }),
      t.provider === "youdao" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          SettingRow,
          {
            title: "有道 APP Key",
            desc: "有道智云 AI 开放平台 → 自然语言翻译服务 → 应用管理",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                className: "text-input",
                type: "text",
                value: t.youdao_key,
                placeholder: "申请的 Key",
                onChange: (e) => patch({ youdao_key: e.target.value })
              }
            )
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "有道 APP Secret", desc: "与 Key 配对，用于接口签名", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            className: "text-input",
            type: "password",
            value: t.youdao_secret,
            placeholder: "申请的 Secret",
            onChange: (e) => patch({ youdao_secret: e.target.value })
          }
        ) })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          SettingRow,
          {
            title: "百度 APPID",
            desc: "百度翻译开放平台 → 管理控制台 → 开发者信息",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                className: "text-input",
                type: "text",
                value: t.baidu_appid,
                placeholder: "APPID",
                onChange: (e) => patch({ baidu_appid: e.target.value })
              }
            )
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "百度密钥", desc: "与 APPID 配对，用于接口签名", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            className: "text-input",
            type: "password",
            value: t.baidu_secret,
            placeholder: "密钥",
            onChange: (e) => patch({ baidu_secret: e.target.value })
          }
        ) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "测试翻译",
          desc: "填好凭据后输入文本验证是否可用（配置改动自动保存，无需手动保存）",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8, width: "100%" }, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                className: "text-input",
                type: "text",
                style: { flex: 1 },
                value: testText,
                placeholder: "hello world",
                onChange: (e) => setTestText(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") void doTest();
                }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn", onClick: () => void doTest(), children: "翻译" })
          ] })
        }
      ),
      testOut && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shortcut-hint ok", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hint-icon", children: "✓" }),
        testOut
      ] }),
      testErr && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shortcut-hint error", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hint-icon", children: "✕" }),
        testErr
      ] })
    ] })
  ] });
}
const FLIP_MS = 160;
function ToolbarPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const dragKeyRef = reactExports.useRef(null);
  const [visualOrder, setVisualOrder] = reactExports.useState(null);
  const [dragOver, setDragOver] = reactExports.useState(null);
  const itemRefs = reactExports.useRef(/* @__PURE__ */ new Map());
  const listRef = reactExports.useRef(null);
  if (!config.toolbar) return null;
  const ordered = config.toolbar.tools;
  const patchToolbar = (patch) => {
    void update({ ...config, toolbar: { ...config.toolbar, ...patch } });
  };
  const toggleTool = (key) => {
    const has = config.toolbar.tools.includes(key);
    const tools = has ? config.toolbar.tools.filter((t) => t !== key) : [...config.toolbar.tools, key];
    void update({ ...config, toolbar: { ...config.toolbar, tools } });
  };
  const reorderTo = (fromKey, over) => {
    const base2 = visualOrder ?? ordered;
    const from = base2.indexOf(fromKey);
    if (from < 0 || from === over) return;
    const next = [...base2];
    const [moved] = next.splice(from, 1);
    next.splice(over, 0, moved);
    const els = next.filter((k) => k !== fromKey).map((k) => itemRefs.current.get(k)).filter((el) => !!el);
    const first = els.map((el) => el.getBoundingClientRect().top);
    reactDomExports.flushSync(() => setVisualOrder(next));
    requestAnimationFrame(() => {
      const last = els.map((el) => el.getBoundingClientRect().top);
      els.forEach((el, i) => {
        const dy = first[i] - last[i];
        if (Math.abs(dy) > 0.5) {
          el.style.transition = "none";
          el.style.transform = `translateY(${dy}px)`;
          void el.getBoundingClientRect();
          el.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          el.style.transform = "";
          const done = () => {
            el.style.transition = "";
            el.removeEventListener("transitionend", done);
          };
          el.addEventListener("transitionend", done);
        }
      });
    });
  };
  const hoverIndexAt = (clientY) => {
    const container = listRef.current;
    if (!container) return null;
    const items = Array.from(container.children);
    if (items.length === 0) return null;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length - 1;
  };
  const onPointerMove = (e) => {
    const key = dragKeyRef.current;
    if (!key) return;
    const over = hoverIndexAt(e.clientY);
    if (over == null) return;
    setDragOver(over);
    reorderTo(key, over);
  };
  const endDrag = reactExports.useCallback(() => {
    const key = dragKeyRef.current;
    dragKeyRef.current = null;
    setDragOver(null);
    if (key && visualOrder) {
      const final = visualOrder.filter((k) => ordered.includes(k));
      if (final.length === ordered.length) {
        void update({ ...config, toolbar: { ...config.toolbar, tools: final } });
      }
    }
    setVisualOrder(null);
  }, [visualOrder, ordered, update]);
  reactExports.useEffect(() => {
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [endDrag]);
  const displayKeys = visualOrder ?? ordered;
  const draggingKey = dragKeyRef.current;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "悬浮工具栏" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "常驻小工具条（类似输入法工具栏），点击图标快速呼出对应面板；可按住图标拖动位置" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "排列方向", desc: "水平横条或竖直竖条，切换后窗口自动调整尺寸", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.toolbar.orientation,
          options: [
            { value: "horizontal", label: "水平" },
            { value: "vertical", label: "竖直" }
          ],
          onChange: (v) => patchToolbar({ orientation: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "图标大小", desc: "调整工具栏按钮尺寸，切换后即时生效", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.toolbar.size ?? "small",
          options: [
            { value: "small", label: "小" },
            { value: "medium", label: "中" },
            { value: "large", label: "大" }
          ],
          onChange: (v) => patchToolbar({ size: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "贴边自动收起",
          desc: "工具栏拖到屏幕边缘后，鼠标离开自动滑出屏幕（仅露一小条），鼠标靠近边缘自动弹出",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Switch,
            {
              checked: config.toolbar.auto_hide,
              onChange: (on) => patchToolbar({ auto_hide: on })
            }
          )
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingRow,
      {
        title: "工具栏上显示的工具",
        desc: "勾选需要在工具栏展示的功能；留空时工具栏自动隐藏",
        layout: "block",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "toolbar-tools", children: TOOL_KEYS.map((key) => {
          const tool = TOOLS[key];
          const checked = config.toolbar.tools.includes(key);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              className: `toolbar-tool ${checked ? "checked" : ""}`,
              onClick: () => toggleTool(key),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toolbar-tool-icon", style: { color: tool.color }, children: tool.icon }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toolbar-tool-name", children: tool.label }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toolbar-tool-check", children: checked ? "✓" : "" })
              ]
            },
            key
          );
        }) })
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingRow,
      {
        title: "图标顺序",
        desc: ordered.length ? "按住左侧手柄上下拖动调整排列顺序" : "请先在上方勾选工具",
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "toolbar-sort", ref: listRef, onPointerMove, children: [
          ordered.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "empty-state", style: { padding: "12px 0" }, children: "未勾选任何工具" }),
          displayKeys.map((key, i) => {
            const tool = TOOLS[key];
            if (!tool) return null;
            const isDragging = draggingKey === key;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                ref: (el) => {
                  if (el) itemRefs.current.set(key, el);
                  else itemRefs.current.delete(key);
                },
                className: `toolbar-sort-item${isDragging ? " dragging" : ""}${dragOver === i && !isDragging && draggingKey ? " drag-target" : ""}`,
                onPointerDown: (e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  dragKeyRef.current = key;
                  setDragOver(i);
                  setVisualOrder(null);
                },
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toolbar-sort-handle", "aria-hidden": true, children: "⠿" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toolbar-tool-icon", style: { color: tool.color }, children: tool.icon }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toolbar-tool-name", children: tool.label }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "toolbar-sort-index", children: i + 1 })
                ]
              },
              key
            );
          })
        ] })
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shortcut-hint", children: "工具栏启用/停用：功能开关页 → 「悬浮工具栏」（切换即时生效）。 拖动：按住任意图标轻微移动即可拖动工具条，未移动松开则点击呼出。" })
  ] });
}
function FilesPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  if (!config.files) return null;
  const files = config.files;
  const [apps2, setApps] = reactExports.useState([]);
  const [appsLoading, setAppsLoading] = reactExports.useState(true);
  reactExports.useEffect(() => {
    let alive = true;
    listInstalledApps().then((list) => {
      if (alive) {
        setApps(list);
        setAppsLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  const patch = (p) => void update({ ...config, files: { ...files, ...p } });
  const chooseLocation = async () => {
    const dir = await pickFolder();
    if (dir) patch({ location: dir });
  };
  const openLocation2 = () => {
    if (files.location) quickfilesReveal(files.location).catch(() => void 0);
  };
  const updateType = (i, p) => {
    const next = files.file_types.map((t, idx) => idx === i ? { ...t, ...p } : t);
    patch({ file_types: next });
  };
  const removeType = (i) => {
    patch({ file_types: files.file_types.filter((_, idx) => idx !== i) });
  };
  const addType = () => {
    const used = new Set(files.file_types.map((t2) => t2.ext.toLowerCase()));
    let ext = "txt";
    let n = 1;
    while (used.has(ext)) {
      ext = `ext${n++}`;
    }
    const t = {
      ext,
      label: "新类型",
      color: "#8a94a6",
      opener: null
    };
    patch({ file_types: [...files.file_types, t] });
  };
  const openerSelectValue = (opener) => {
    if (!opener) return "";
    const hit = apps2.some((a) => a.exe.toLowerCase() === opener.toLowerCase());
    return hit ? opener : "__custom__";
  };
  const handleOpenerChange = async (i, v) => {
    if (v === "") {
      updateType(i, { opener: null });
    } else if (v === "__browse__") {
      const exe = await pickOpenerExecutable();
      if (exe) updateType(i, { opener: exe });
    } else {
      updateType(i, { opener: v });
    }
  };
  const openerOptions = (opener) => {
    const opts = [{ value: "", label: "系统默认" }];
    if (appsLoading) {
      opts.push({ value: "__loading__", label: "正在扫描本机应用…", disabled: true });
    }
    const groups = {
      editor: "常用编辑器",
      browser: "浏览器",
      other: "其他应用"
    };
    for (const k of ["editor", "browser", "other"]) {
      const list = apps2.filter((a) => a.kind === k);
      if (list.length === 0) continue;
      for (const a of list) {
        opts.push({
          value: a.exe,
          label: a.name,
          icon: a.icon ?? void 0,
          group: groups[k]
        });
      }
    }
    if (opener && !apps2.some((a) => a.exe.toLowerCase() === opener.toLowerCase())) {
      opts.push({
        value: "__custom__",
        label: `自定义：${opener.split(/[\\/]/).pop()}`,
        disabled: true,
        group: "更多"
      });
    }
    opts.push({ value: "__browse__", label: "浏览其他程序…", group: "更多" });
    return opts;
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "快速文件" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "在统一位置快速新建 / 打开 / 管理多种类型文件；可配置文件类型，并为每种类型单独指定默认打开程序" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "功能" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "files",
        title: "呼出快速文件面板",
        desc: "点击快捷键后按下新组合，例如 Alt+Q（快速新建 / 管理各类文件）"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "文件保存位置",
          desc: "所有新建文件统一保存到此处，并按文件类型分子文件夹存放（每种类型一个文件夹）；留空则使用程序数据目录下的 quickfiles 文件夹",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "files-loc-box", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "files-loc-path", children: files.location || "（默认：数据目录 / quickfiles）" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "files-loc-btns", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: () => void chooseLocation(), children: "选择文件夹" }),
              files.location && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: openLocation2, children: "打开" })
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "默认分组", desc: "打开面板时按此方式分组展示", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: files.default_group,
          options: [
            { value: "none", label: "不分组" },
            { value: "type", label: "按类型" },
            { value: "date", label: "按日期" }
          ],
          onChange: (v) => patch({ default_group: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "默认排序", desc: "列表排序方式（分组模式下组内同样按此排序）", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: files.default_sort,
          options: [
            { value: "created", label: "创建时间" },
            { value: "name", label: "名称" }
          ],
          onChange: (v) => patch({ default_sort: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "分组布局", desc: "分组展示方式：垂直列表或水平多列并排（面板控制条也可切换）", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: files.default_layout,
          options: [
            { value: "vertical", label: "垂直列表" },
            { value: "horizontal", label: "水平多列" }
          ],
          onChange: (v) => patch({ default_layout: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "面板置顶", desc: "置顶时常驻显示，失焦不自动隐藏", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: files.always_on_top ? "on" : "off",
          options: [
            { value: "on", label: "置顶" },
            { value: "off", label: "自动隐藏" }
          ],
          onChange: (v) => patch({ always_on_top: v === "on" })
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingRow,
      {
        title: "文件类型",
        desc: "面板「新建」时列出的类型；可增删、改名、改扩展名与强调色，并为每种类型单独配置默认打开程序",
        layout: "block",
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "files-types", children: [
          files.file_types.map((t, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "files-type-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "color",
                className: "files-color",
                value: t.color,
                title: "强调色",
                onChange: (e) => updateType(i, { color: e.target.value })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                className: "files-label",
                value: t.label,
                placeholder: "显示名",
                onChange: (e) => updateType(i, { label: e.target.value })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "files-ext-wrap", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "files-ext-dot", children: "." }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  className: "files-ext",
                  value: t.ext,
                  placeholder: "ext",
                  onChange: (e) => updateType(i, { ext: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() })
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "files-opener", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                GlassSelect,
                {
                  title: "默认打开方式（留空使用系统默认程序）",
                  value: openerSelectValue(t.opener),
                  options: openerOptions(t.opener),
                  onChange: (v) => void handleOpenerChange(i, v)
                }
              ),
              t.opener && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  className: "btn btn-xs",
                  title: "清除默认打开方式（改用系统默认程序）",
                  onClick: () => updateType(i, { opener: null }),
                  children: "清除"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                className: "files-del",
                title: "删除该类型",
                onClick: () => removeType(i),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTrash, { size: 13 })
              }
            )
          ] }, i)),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { className: "files-add", onClick: addType, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(IconPlus, { size: 13 }),
            " 添加文件类型"
          ] })
        ] })
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shortcut-hint", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(IconFiles, { size: 13 }),
      " 文件类型仅用于快速新建与面板内过滤展示；该位置下其他类型的文件不会出现在面板中。"
    ] })
  ] });
}
function ClearHistoryRow() {
  const [confirming, setConfirming] = reactExports.useState(false);
  const [done, setDone] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "清空历史截屏", desc: done ? "已清空" : confirming ? "再点一次确认清空，此操作不可恢复" : "删除磁盘上的全部历史档与选区记录", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      className: "btn btn-sm",
      style: confirming ? { background: "#e5484d", color: "#fff", borderColor: "#e5484d" } : void 0,
      onClick: () => {
        if (!confirming) {
          setConfirming(true);
          window.setTimeout(() => setConfirming(false), 3e3);
          return;
        }
        setConfirming(false);
        void shotHistoryClear().then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 2500);
        }).catch(() => {
        });
      },
      children: confirming ? "确认清空" : done ? "已清空" : "清空"
    }
  ) });
}
function OcrModelRows() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const [models, setModels] = reactExports.useState(null);
  const [busy, setBusy] = reactExports.useState(null);
  const [err, setErr] = reactExports.useState("");
  reactExports.useEffect(() => {
    ocrModelStatus().then(setModels).catch(() => setModels([]));
  }, []);
  const pick = async (m) => {
    if (m.active || busy) return;
    setErr("");
    if (!m.ready) {
      setBusy(m.id);
      try {
        setModels(await ocrModelDownload(m.id));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    void update({ ...config, shot: { ...config.shot, ocr_model: m.id } });
  };
  if (!models) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingRow,
      {
        title: "文字识别模型",
        desc: err ? `模型下载失败：${err}` : "离线识别，切换后立即生效；档位越高越准，但体积更大、识别更慢"
      }
    ),
    models.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingRow,
      {
        title: m.active ? `${m.name}（使用中）` : m.name,
        desc: `${m.desc} · 约 ${m.size_mb}MB${m.ready ? "" : " · 未下载"}`,
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "btn btn-sm",
            disabled: m.active || busy !== null,
            onClick: () => void pick(m),
            children: m.active ? "使用中" : busy === m.id ? "下载中…" : m.ready ? "启用" : "下载并启用"
          }
        )
      },
      m.id
    ))
  ] });
}
function ScreenshotPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const [tab, setTab] = reactExports.useState("shot");
  const updateShot = (patch) => {
    update({ ...config, shot: { ...config.shot, ...patch } });
  };
  const updatePin = (patch) => {
    update({ ...config, pin: { ...config.pin, ...patch } });
  };
  const updateAnno = (patch) => {
    update({ ...config, annotate: { ...config.annotate, ...patch } });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "截图贴图" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "全屏截图、区域选取与贴图钉屏（类似 Snipaste）；支持窗口智能识别与标注" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shot-settings-tabs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      Segmented,
      {
        value: tab,
        options: [
          { value: "shot", label: "截图" },
          { value: "pin", label: "贴图" },
          { value: "annotate", label: "标注" }
        ],
        onChange: (v) => setTab(v)
      }
    ) }),
    tab === "shot" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ShortcutRow,
          {
            target: "screenshot",
            title: "开始截图",
            desc: "点击快捷键后按下新组合，例如 Ctrl+Alt+A（冻结屏幕 + 全屏遮罩选区）"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ShortcutRow,
          {
            target: "picker",
            title: "屏幕取色",
            desc: "点击快捷键后按下新组合，例如 Alt+D（十字线跟随鼠标显示坐标与颜色，C 复制颜色，Shift 切换 RGB/HEX）"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ShortcutRow,
          {
            target: "pins",
            title: "显示 / 隐藏全部贴图",
            desc: "点击快捷键后按下新组合，例如 Ctrl+Alt+P（一键显示或隐藏所有贴在桌面上的图片）"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "包含鼠标指针", desc: "截屏时是否绘制当前鼠标指针", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: config.shot.capture_cursor, onChange: (v) => updateShot({ capture_cursor: v }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "智能识别窗口边缘", desc: "鼠标悬停时自动识别窗口边界并吸附选框", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: config.shot.smart_detect, onChange: (v) => updateShot({ smart_detect: v }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "元素级识别（界面组件）", desc: "智能识别开启时进一步下钻到按钮组、输入框等界面组件（浏览器页面需开启其无障碍支持）", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: config.shot.smart_element !== false, onChange: (v) => updateShot({ smart_element: v }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "放大镜", desc: "选区时显示像素级放大镜与取色（C 复制颜色 / Shift 切 RGB/HEX）", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: config.shot.magnifier, onChange: (v) => updateShot({ magnifier: v }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "记住上次截取区域", desc: "呼出截图时若光标下未识别到窗口，预填上一次的选区", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: config.shot.remember_region, onChange: (v) => updateShot({ remember_region: v }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "截图历史", desc: "输出（复制/另存/贴图）过的截图才计入历史；截图时可按 < > 翻看并重新框选，H 打开列表", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: config.shot.history_enabled !== false, onChange: (v) => updateShot({ history_enabled: v }) }) }),
        config.shot.history_enabled !== false && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "历史保留条数", desc: "最多保留的截屏次数（一次呼出按一条计），超出自动清理最旧", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              className: "number-input",
              type: "number",
              min: 5,
              max: 100,
              step: 1,
              value: config.shot.history_max_count ?? 20,
              onChange: (e) => {
                const raw = e.target.value;
                if (raw === "") return;
                const v = Math.round(Number(raw));
                if (Number.isFinite(v)) updateShot({ history_max_count: v });
              },
              onBlur: (e) => {
                const v = Math.round(Number(e.target.value));
                if (Number.isFinite(v)) updateShot({ history_max_count: Math.min(100, Math.max(5, v)) });
              }
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "历史保留天数", desc: "超过该天数的历史截屏自动清理", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              className: "number-input",
              type: "number",
              min: 1,
              max: 365,
              step: 1,
              value: config.shot.history_max_days ?? 7,
              onChange: (e) => {
                const raw = e.target.value;
                if (raw === "") return;
                const v = Math.round(Number(raw));
                if (Number.isFinite(v)) updateShot({ history_max_days: v });
              },
              onBlur: (e) => {
                const v = Math.round(Number(e.target.value));
                if (Number.isFinite(v)) updateShot({ history_max_days: Math.min(365, Math.max(1, v)) });
              }
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ClearHistoryRow, {})
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "保存格式", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          Segmented,
          {
            value: config.shot.save_format,
            options: [
              { value: "png", label: "PNG" },
              { value: "jpg", label: "JPEG" }
            ],
            onChange: (v) => updateShot({ save_format: v })
          }
        ) }),
        config.shot.save_format === "jpg" && /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "JPEG 质量", desc: `当前 ${config.shot.jpg_quality}%`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          Slider,
          {
            min: 10,
            max: 100,
            value: config.shot.jpg_quality,
            onChange: (v) => updateShot({ jpg_quality: v })
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(OcrModelRows, {})
    ] }),
    tab === "pin" && /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "默认不透明度", desc: `当前 ${config.pin.opacity}%`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          min: 10,
          max: 100,
          value: config.pin.opacity,
          onChange: (v) => updatePin({ opacity: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "边框阴影", desc: "贴图是否显示投影效果", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: config.pin.border_shadow, onChange: (v) => updatePin({ border_shadow: v }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "开机恢复贴图", desc: "重启后自动恢复上次的贴图布局", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: config.pin.restore_on_start, onChange: (v) => updatePin({ restore_on_start: v }) }) })
    ] }),
    tab === "annotate" && /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "默认画笔粗细", desc: `${config.annotate.stroke_width}px`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          min: 1,
          max: 10,
          value: config.annotate.stroke_width,
          onChange: (v) => updateAnno({ stroke_width: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "文字工具字号", desc: `${config.annotate.font_size}px`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          min: 10,
          max: 48,
          value: config.annotate.font_size,
          onChange: (v) => updateAnno({ font_size: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "马赛克块大小", desc: `${config.annotate.mosaic_block}px`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          min: 4,
          max: 30,
          value: config.annotate.mosaic_block,
          onChange: (v) => updateAnno({ mosaic_block: v })
        }
      ) })
    ] })
  ] });
}
function RecorderPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const updateRec = (patch) => {
    update({ ...config, recorder: { ...config.recorder, ...patch } });
  };
  const openDir = () => void invoke("recorder_open_dir").catch(() => {
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "屏幕录制" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "框选任意区域录制为 MP4 视频或 GIF 动图；托盘、悬浮工具栏或全局快捷键呼出。 本页的取值是录制时的默认值，录制面板可临时换格式（不影响这里的设置）" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShortcutRow,
      {
        target: "recorder",
        title: "开始屏幕录制",
        desc: "点击快捷键后按下新组合，例如 Ctrl+Alt+R（呼出全屏选区窗，拖拽框选录制区域）"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "默认格式", desc: "录制面板可临时改，改这里才是持久默认", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.recorder?.fmt ?? "mp4",
          options: [
            { value: "mp4", label: "视频 MP4" },
            { value: "gif", label: "动图 GIF" }
          ],
          onChange: (v) => updateRec({ fmt: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "默认分辨率", desc: "按选区高度换算缩放，不会放大超过原始尺寸", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.recorder?.res ?? "raw",
          options: [
            { value: "raw", label: "原始" },
            { value: "1080", label: "1080p" },
            { value: "720", label: "720p" },
            { value: "360", label: "360p" }
          ],
          onChange: (v) => updateRec({ res: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "帧率", desc: `当前 ${config.recorder?.fps ?? 12} 帧/秒（5–60，越高越流畅，文件越大）`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          min: 5,
          max: 60,
          value: config.recorder?.fps ?? 12,
          onChange: (v) => updateRec({ fps: Math.round(v) })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "编码质量", desc: "高质量色彩更准但更耗 CPU，快速模式适合大区域长录像", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Segmented,
        {
          value: config.recorder?.quality ?? "normal",
          options: [
            { value: "high", label: "高" },
            { value: "normal", label: "标准" },
            { value: "fast", label: "快速" }
          ],
          onChange: (v) => updateRec({ quality: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        SettingRow,
        {
          title: "音源",
          desc: "录制同时收录声音；录制中可在控制条随时静音/取消静音。仅 MP4 生效（GIF 不支持音频）",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            Segmented,
            {
              value: config.recorder?.audio ?? "off",
              options: [
                { value: "off", label: "不录音" },
                { value: "mic", label: "麦克风" },
                { value: "system", label: "系统声音" },
                { value: "mix", label: "两者" }
              ],
              onChange: (v) => updateRec({ audio: v })
            }
          )
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingRow,
      {
        title: "保存位置",
        desc: config.recorder?.save_dir || "默认与截图同目录（未设置时保存到系统图片文件夹）",
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "btn btn-sm",
              onClick: () => {
                void pickFolder().then((dir) => {
                  if (dir) updateRec({ save_dir: dir });
                });
              },
              children: "选择…"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: openDir, title: "在资源管理器中打开录屏保存文件夹", children: "打开保存文件夹" }),
          config.recorder?.save_dir && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: () => updateRec({ save_dir: null }), children: "恢复默认" })
        ] })
      }
    ) })
  ] });
}
const DEFAULT = {
  theme: "light",
  bg_image: "",
  bg_immersive: false,
  bg_opacity: 45,
  bg_transparent: false,
  bg_glass_opacity: 0.3,
  edge_snap: true,
  notes_dir: "",
  glass_enabled: true,
  glass_blur: 55,
  transparent_opacity: 65,
  particle_count: 50,
  particle_mode: "particle",
  animation_speed: 100,
  shortcuts: {},
  md_theme: "default",
  md_custom_path: "",
  md_custom_filename: "",
  llm_base_url: "",
  llm_api_key: "",
  llm_model: ""
};
const MD_THEMES = [
  { value: "default", label: "默认（暖色）" },
  { value: "github", label: "GitHub" },
  { value: "rose-pine", label: "玫瑰枯木（暗色）" },
  { value: "solarized", label: "Solarized（浅色）" },
  { value: "monokai", label: "Monokai（暗色）" },
  { value: "ayu-dark", label: "Ayu Dark（暗色）" },
  { value: "solarized-dark", label: "Solarized Dark（暗色）" },
  { value: "github-dark", label: "GitHub Dark（暗色）" },
  { value: "custom", label: "自定义（上传 CSS）" }
];
const PARTICLE_MODES = [
  { value: "particle", label: "粒子消散" },
  { value: "inhale", label: "粒子吸入" },
  { value: "erode", label: "火焰侵蚀" },
  { value: "glass", label: "玻璃碎裂" },
  { value: "none", label: "无动画（直接显示/隐藏）" }
];
const STICKY_ACTIONS = [
  { key: "fg_color", label: "字体颜色" },
  { key: "bg_color", label: "字体背景色" },
  { key: "size_up", label: "增大字号" },
  { key: "size_down", label: "减小字号" },
  { key: "show_app", label: "呼出 / 收起便签", global: true },
  { key: "open_history", label: "呼出 / 收起历史便签面板", global: true },
  { key: "new_note", label: "新建便签", global: true }
];
function stickyComboFromEvent(e) {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  let main = "";
  if (/^[a-zA-Z]$/.test(e.key)) main = e.key.toUpperCase();
  else if (/^[0-9]$/.test(e.key)) main = e.key;
  else if (/^F(\d{1,2})$/.test(e.key)) main = e.key.toUpperCase();
  else if (e.code === "Equal") main = "Plus";
  else if (e.code === "Minus") main = "Minus";
  else if (e.key === " ") main = "Space";
  else if (e.key === "ArrowUp") main = "ArrowUp";
  else if (e.key === "ArrowDown") main = "ArrowDown";
  else return null;
  parts.push(main);
  return parts.join("+");
}
function StickyShortcutInput({
  value,
  onChange
}) {
  const [listening, setListening] = reactExports.useState(false);
  const listeningRef = reactExports.useRef(false);
  listeningRef.current = listening;
  const onChangeRef = reactExports.useRef(onChange);
  onChangeRef.current = onChange;
  const onKeyDown = reactExports.useCallback((e) => {
    if (!listeningRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setListening(false);
      return;
    }
    const combo = stickyComboFromEvent(e.nativeEvent);
    if (combo) {
      onChangeRef.current(combo);
      setListening(false);
    }
  }, []);
  reactExports.useEffect(() => {
    if (!listening) return;
    const onBlur = () => setListening(false);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [listening]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      type: "button",
      className: "shortcut-input",
      onClick: () => setListening(true),
      onKeyDown,
      children: listening ? "按下组合键…（Esc 取消）" : value || "未设置"
    }
  );
}
function StickyNotePage() {
  const [settings, setSettings] = reactExports.useState(DEFAULT);
  const [stickySaved, setStickySaved] = reactExports.useState({});
  const [stickySaving, setStickySaving] = reactExports.useState(null);
  const [effDir, setEffDir] = reactExports.useState("");
  const [loaded, setLoaded] = reactExports.useState(false);
  const [bgPreview, setBgPreview] = reactExports.useState("");
  const fileRef = reactExports.useRef(null);
  const mdFileRef = reactExports.useRef(null);
  const load = async () => {
    const guard = new Promise(
      (resolve) => setTimeout(() => resolve(null), 1200)
    );
    try {
      const s = await Promise.race([invoke("load_settings"), guard]) ?? DEFAULT;
      if (s) {
        if (s.theme === "transparent") {
          s.theme = "light";
          void invoke("save_settings", { settings: s }).catch(() => {
          });
        }
        try {
          const tb = await invoke("config_load");
          const t = tb?.general?.theme ?? "system";
          const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          s.theme = t === "dark" ? "dark" : t === "system" ? sysDark ? "dark" : "light" : "light";
        } catch {
        }
        const sc = s.shortcuts ?? {};
        setSettings({ ...DEFAULT, ...s, shortcuts: sc });
        setStickySaved(sc);
      }
      try {
        const dir = await invoke("effective_notes_dir");
        setEffDir(dir);
      } catch {
      }
    } catch {
    }
    setLoaded(true);
  };
  reactExports.useEffect(() => {
    void load();
  }, []);
  reactExports.useEffect(() => {
    const img = settings.bg_image;
    if (!img) {
      setBgPreview("");
      return;
    }
    if (img.startsWith("data:")) {
      setBgPreview(img);
      return;
    }
    let alive = true;
    invoke("read_bg_image", { path: img }).then((u) => {
      if (alive) setBgPreview(u);
    }).catch(() => {
      if (alive) setBgPreview("");
    });
    return () => {
      alive = false;
    };
  }, [settings.bg_image]);
  const patch = (partial) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    void invoke("save_settings", { settings: next }).catch(console.error);
  };
  const saveStickyOne = async (key) => {
    const combo = settings.shortcuts[key];
    if (!combo || combo === stickySaved[key]) return;
    setStickySaving(key);
    try {
      const next = { ...settings, shortcuts: { ...settings.shortcuts, [key]: combo } };
      setSettings(next);
      await invoke("save_settings", { settings: next });
      await invoke("register_shortcuts");
      setStickySaved((d) => ({ ...d, [key]: combo }));
    } catch (err) {
      console.error("保存便签快捷键失败:", err);
    } finally {
      setStickySaving(null);
    }
  };
  const uploadBg = async (file) => {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1920 / bmp.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const path = await invoke("save_bg_image", { dataUrl, key: "global" });
      const url = await invoke("read_bg_image", { path });
      patch({ bg_image: url });
    } catch (err) {
      console.error("上传背景图失败", err);
    }
  };
  const uploadMdCss = async (file) => {
    try {
      const content = await file.text();
      const path = await invoke("save_md_custom", { content });
      patch({ md_theme: "custom", md_custom_path: path, md_custom_filename: file.name });
    } catch (err) {
      console.error("上传 CSS 失败", err);
    }
  };
  const isTransparent = settings.theme === "transparent";
  if (!loaded) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "empty-state", children: "加载中…" });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { children: "便签设置" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "page-desc", children: "功能与原版便签设置面板一致：外观 / 背景 / 毛玻璃 / 动画 / 快捷键 / Markdown / 大模型 / 存储" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "贴边自动收起 / 弹出", desc: "QQ 风格：窗口贴屏幕边缘时自动收起", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: settings.edge_snap, onChange: (v) => patch({ edge_snap: v }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "关闭动画效果", desc: "便签关闭时的粒子消散风格", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "select",
        {
          className: "settings-select",
          value: settings.particle_mode,
          onChange: (e) => patch({ particle_mode: e.target.value }),
          children: PARTICLE_MODES.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: m.value, children: m.label }, m.value))
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "粒子强度", desc: "0~100（粒子消散/吸入/侵蚀的规模）", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          value: settings.particle_count,
          min: 1,
          max: 100,
          onChange: (v) => patch({ particle_count: v })
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "动画速度", desc: "100=原速，200=2 倍速", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          value: settings.animation_speed,
          min: 50,
          max: 200,
          onChange: (v) => patch({ animation_speed: v })
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "背景图片", desc: "便签全局默认背景；配置后整张便签沉浸透出壁纸（文字自动加投影保证可读）", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "btn btn-primary btn-sm",
            onClick: () => fileRef.current?.click(),
            children: "选择图片"
          }
        ),
        settings.bg_image && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: () => patch({ bg_image: "" }), children: "清除" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            ref: fileRef,
            type: "file",
            accept: "image/*",
            style: { display: "none" },
            onChange: (e) => {
              const f = e.target.files?.[0];
              if (f) void uploadBg(f);
              e.target.value = "";
            }
          }
        )
      ] }) }),
      settings.bg_image && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sticky-bg-preview sticky-bg-preview--full", children: bgPreview ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: bgPreview, alt: "便签背景预览" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "预览加载中…" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "高斯模糊效果", desc: "背景图模式下内容面板叠加磨砂", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Switch, { checked: settings.glass_enabled, onChange: (v) => patch({ glass_enabled: v }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "高斯模糊强度", desc: "0=原图，100≈40px 强模糊", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          value: settings.glass_blur,
          min: 0,
          max: 100,
          onChange: (v) => patch({ glass_blur: v })
        }
      ) }),
      isTransparent && /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "背景不透明度", desc: "透明主题下原生亚克力着色层深浅", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        Slider,
        {
          value: settings.transparent_opacity,
          min: 0,
          max: 100,
          onChange: (v) => patch({ transparent_opacity: v })
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group-title", children: "快捷键" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: STICKY_ACTIONS.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingRow,
      {
        title: a.label,
        desc: a.global ? "全局快捷键：任意应用中生效" : "便签窗口聚焦时生效（编辑区快捷键）",
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            StickyShortcutInput,
            {
              value: settings.shortcuts[a.key] ?? "",
              onChange: (combo) => setSettings((d) => ({ ...d, shortcuts: { ...d.shortcuts, [a.key]: combo } }))
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              className: "btn btn-primary btn-sm",
              disabled: stickySaving !== null || !settings.shortcuts[a.key] || settings.shortcuts[a.key] === stickySaved[a.key],
              onClick: () => void saveStickyOne(a.key),
              children: stickySaving === a.key ? "保存中…" : "保存"
            }
          )
        ] })
      },
      a.key
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shortcut-hint", children: "便签快捷键支持纯功能键（如 F2 / F4）与 Ctrl/Alt/Shift 组合； 建议「呼出/收起便签」「呼出/收起历史面板」用功能键，编辑区快捷键用组合键避免误触。" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(SettingGroup, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "Markdown 主题", desc: "Markdown 便签的渲染风格；选「自定义」可上传自己的 CSS", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "select",
        {
          className: "settings-select",
          value: settings.md_theme,
          onChange: (e) => patch({ md_theme: e.target.value }),
          children: MD_THEMES.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: t.value, children: t.label }, t.value))
        }
      ) }),
      settings.md_theme === "custom" && /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "自定义样式", desc: settings.md_custom_filename || "上传 CSS 文件", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: () => mdFileRef.current?.click(), children: "上传 / 替换" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            ref: mdFileRef,
            type: "file",
            accept: ".css,text/css",
            style: { display: "none" },
            onChange: (e) => {
              const f = e.target.files?.[0];
              if (f) void uploadMdCss(f);
              e.target.value = "";
            }
          }
        )
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "大模型（整理格式）", desc: "用于便签的「MD / 文本」整理按钮，兼容 OpenAI 及任意 OpenAI 格式接口（DeepSeek、通义、智谱等）", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8, width: 320 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          className: "settings-input",
          placeholder: "Base URL，如 https://api.openai.com/v1",
          value: settings.llm_base_url,
          onChange: (e) => patch({ llm_base_url: e.target.value })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          className: "settings-input",
          type: "password",
          placeholder: "API Key（sk-...）",
          value: settings.llm_api_key,
          onChange: (e) => patch({ llm_api_key: e.target.value })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          className: "settings-input",
          placeholder: "模型名，如 gpt-4o-mini",
          value: settings.llm_model,
          onChange: (e) => patch({ llm_model: e.target.value })
        }
      )
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(SettingGroup, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SettingRow, { title: "便签存储目录", desc: effDir || "解析中…", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { display: "flex", gap: 8 }, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          className: "btn btn-sm",
          onClick: async () => {
            try {
              const { open: open2 } = await __vitePreload(async () => {
                const { open: open3 } = await import("./index--ziH6xz5.js");
                return { open: open3 };
              }, true ? __vite__mapDeps([0,1]) : void 0);
              const sel = await open2({ directory: true, multiple: false, title: "选择便签存储目录" });
              if (typeof sel === "string") {
                patch({ notes_dir: sel });
                setEffDir(sel);
              }
            } catch {
            }
          },
          children: "浏览"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: () => void invoke("open_folder", { path: effDir }), children: "打开" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "btn btn-sm", onClick: () => patch({ notes_dir: "" }), children: "恢复默认" })
    ] }) }) })
  ] });
}
const RELOAD_DELAY_MS = 2500;
class SettingsErrorBoundary extends reactExports.Component {
  constructor() {
    super(...arguments);
    __publicField(this, "state", { hasError: false });
    __publicField(this, "timer", null);
    __publicField(this, "scheduleReload", () => {
      this.timer = window.setTimeout(() => {
        window.location.reload();
      }, RELOAD_DELAY_MS);
    });
    __publicField(this, "reloadNow", () => {
      if (this.timer !== null) window.clearTimeout(this.timer);
      window.location.reload();
    });
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.error("设置页面渲染出错:", error);
  }
  componentDidMount() {
    if (this.state.hasError) {
      this.scheduleReload();
    }
  }
  componentDidUpdate() {
    if (this.state.hasError && this.timer === null) {
      this.scheduleReload();
    }
  }
  componentWillUnmount() {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        style: {
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "var(--bg, #1e1e1e)",
          color: "var(--text, #eee)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { fontSize: 40 }, children: "⚠️" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: "设置页面渲染出错，正在自动重新加载…" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: this.reloadNow,
              style: {
                padding: "6px 18px",
                borderRadius: 6,
                border: "none",
                background: "var(--accent, #4285f4)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13
              },
              children: "立即重新加载"
            }
          )
        ]
      }
    );
  }
}
const MODULE_ITEMS = [
  { key: "clipboard", label: "剪贴板", feature: "clipboard", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconClipboard, { size: 15 }) },
  { key: "folder", label: "文件夹", feature: "folder", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconFolder, { size: 15 }) },
  { key: "credentials", label: "账号密码", feature: "credentials", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconLock, { size: 15 }) },
  { key: "translation", label: "划词翻译", feature: "translation", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconTranslate, { size: 15 }) },
  { key: "port", label: "端口工具", feature: "port", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconPort, { size: 15 }) },
  { key: "files", label: "快速文件", feature: "files", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconFiles, { size: 15 }) },
  { key: "snippets", label: "常用语速贴", feature: "snippets", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSnippet, { size: 15 }) },
  { key: "screenshot", label: "截图贴图", feature: "screenshot", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconScreenshot, { size: 15 }) },
  { key: "recorder", label: "屏幕录制", feature: "recorder", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconRecord, { size: 15 }) },
  { key: "toolbar", label: "悬浮工具栏", feature: "toolbar", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconGrid, { size: 15 }) }
];
const FIXED_ITEMS = [
  { key: "sticky", label: "便签设置", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSticky, { size: 15 }) },
  { key: "features", label: "功能开关", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconKey, { size: 15 }) },
  { key: "general", label: "通用设置", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconSettings, { size: 15 }) },
  { key: "about", label: "关于", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(IconInfo, { size: 15 }) }
];
const FAILED_TARGET_PAGE = {
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
  palette: "general"
};
const FAILED_TARGET_NAME = {
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
  palette: "全局命令面板"
};
function cssColorToRgb(input) {
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
function SettingsApp() {
  const load = useConfigStore((s) => s.load);
  const loaded = useConfigStore((s) => s.loaded);
  const config = useConfigStore((s) => s.config);
  const theme = useConfigStore((s) => s.config.general.theme);
  const [page, setPage] = reactExports.useState("general");
  const [shortcutFailed, setShortcutFailed] = reactExports.useState(null);
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  reactExports.useEffect(() => {
    setShortcutFailed(null);
  }, [shortcuts]);
  reactExports.useEffect(() => {
    load();
    const cleanup = [];
    let disposed = false;
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused && !useConfigStore.getState().loaded) void load();
    }).then((un) => disposed ? un() : cleanup.push(un));
    onEvent(EVT_SHORTCUT_FAILED, (target) => {
      setShortcutFailed(FAILED_TARGET_NAME[target] ?? target);
      setPage(FAILED_TARGET_PAGE[target] ?? "features");
    }).then((un) => disposed ? un() : cleanup.push(un));
    onEvent("sticky://goto-settings", () => {
      setPage("sticky");
    }).then((un) => disposed ? un() : cleanup.push(un));
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [load]);
  reactExports.useEffect(() => {
    if (!loaded) return;
    const apply = () => {
      try {
        const probe2 = document.createElement("span");
        probe2.style.position = "absolute";
        probe2.style.visibility = "hidden";
        probe2.style.backgroundColor = "var(--bg-sidebar)";
        document.body.appendChild(probe2);
        const raw = getComputedStyle(probe2).backgroundColor;
        probe2.remove();
        const rgb = cssColorToRgb(raw);
        if (rgb) void invoke("set_settings_caption_color", { rgb }).catch(() => {
        });
      } catch {
      }
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [loaded, theme]);
  if (!loaded) return null;
  const moduleItems = MODULE_ITEMS.filter((it) => featureEnabled(config, it.feature));
  const fixedPageKeys = new Set(FIXED_ITEMS.map((it) => it.key));
  const currentPageDisabled = !fixedPageKeys.has(page) && !moduleItems.some((it) => it.key === page);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsErrorBoundary, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "settings-sidebar", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "settings-brand", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "brand-dot", children: "⚡" }),
        "小心工具箱"
      ] }),
      FIXED_ITEMS.filter((it) => it.key === "features").map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: `settings-nav-item ${page === item.key ? "active" : ""}`,
          onClick: () => setPage(item.key),
          children: [
            item.icon,
            item.label
          ]
        },
        item.key
      )),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "settings-nav-divider" }),
      moduleItems.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: `settings-nav-item ${page === item.key ? "active" : ""}`,
          onClick: () => setPage(item.key),
          children: [
            item.icon,
            item.label
          ]
        },
        item.key
      )),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "settings-nav-divider" }),
      FIXED_ITEMS.filter((it) => it.key !== "features").map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          className: `settings-nav-item ${page === item.key ? "active" : ""}`,
          onClick: () => setPage(item.key),
          children: [
            item.icon,
            item.label
          ]
        },
        item.key
      )),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "settings-sidebar-footer", children: "v1.0.0 · Windows" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "settings-content", children: [
      shortcutFailed && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-group", style: { borderColor: "var(--danger)" }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-row", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setting-info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "setting-title", style: { color: "var(--danger)" }, children: "全局快捷键注册失败" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "setting-desc", children: [
          "「",
          shortcutFailed,
          "」的快捷键已被系统或其他应用占用，请在下方更换组合后保存。"
        ] })
      ] }) }) }),
      currentPageDisabled ? /* @__PURE__ */ jsxRuntimeExports.jsx(FeaturePage, { onNavigate: setPage }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        page === "clipboard" && /* @__PURE__ */ jsxRuntimeExports.jsx(ClipboardPage, {}),
        page === "folder" && /* @__PURE__ */ jsxRuntimeExports.jsx(FolderPage, {}),
        page === "credentials" && /* @__PURE__ */ jsxRuntimeExports.jsx(CredentialPage, {}),
        page === "translation" && /* @__PURE__ */ jsxRuntimeExports.jsx(TranslationPage, {}),
        page === "port" && /* @__PURE__ */ jsxRuntimeExports.jsx(PortPage, {}),
        page === "files" && /* @__PURE__ */ jsxRuntimeExports.jsx(FilesPage, {}),
        page === "snippets" && /* @__PURE__ */ jsxRuntimeExports.jsx(SnippetsPage, {}),
        page === "screenshot" && /* @__PURE__ */ jsxRuntimeExports.jsx(ScreenshotPage, {}),
        page === "recorder" && /* @__PURE__ */ jsxRuntimeExports.jsx(RecorderPage, {}),
        page === "features" && /* @__PURE__ */ jsxRuntimeExports.jsx(FeaturePage, { onNavigate: setPage }),
        page === "general" && /* @__PURE__ */ jsxRuntimeExports.jsx(GeneralPage, {}),
        page === "toolbar" && /* @__PURE__ */ jsxRuntimeExports.jsx(ToolbarPage, {}),
        page === "sticky" && /* @__PURE__ */ jsxRuntimeExports.jsx(StickyNotePage, {}),
        page === "about" && /* @__PURE__ */ jsxRuntimeExports.jsx(AboutPage, {})
      ] })
    ] })
  ] }) });
}
let pinMenuEnsured = false;
function ensurePinMenu() {
  if (pinMenuEnsured) return;
  pinMenuEnsured = true;
  void WebviewWindow.getByLabel("pin-menu").then((w) => {
    if (w) return;
    try {
      new WebviewWindow("pin-menu", {
        url: "index.html",
        width: 180,
        height: 40,
        decorations: false,
        transparent: true,
        alwaysOnTop: true,
        focus: true,
        resizable: false,
        shadow: false,
        visible: false,
        skipTaskbar: true
      });
    } catch {
    }
  });
}
function App() {
  const label = getCurrentWindow().label;
  void diagLog(`App mounted: ${label}`);
  const load = useConfigStore((s) => s.load);
  const sync = useConfigStore((s) => s.sync);
  reactExports.useEffect(() => {
    load();
    let cleanup;
    let disposed = false;
    onEvent(EVT_CONFIG_CHANGED, (cfg) => {
      if (cfg) sync(cfg);
      else void load();
    }).then((un) => {
      if (disposed) un();
      else cleanup = un;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [load, sync]);
  reactExports.useEffect(() => {
    ensurePinMenu();
  }, []);
  if (label === "clipboard-panel") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(ClipboardPanel, {});
  }
  if (label === "folder-panel") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(FolderPanel, {});
  }
  if (label === "credential-panel") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(CredentialPanel, {});
  }
  if (label === "port-panel") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(PortPanel, {});
  }
  if (label === "files-panel") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(QuickFilesPanel, {});
  }
  if (label === "snippets-panel") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(SnippetPanel, {});
  }
  if (label === "palette") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(CommandPalette, {});
  }
  if (label === "translate-popup") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(TranslatePopup, {});
  }
  if (label === "toolbar") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Toolbar, {});
  }
  if (label === TIP_WINDOW) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(ToolbarTip, {});
  }
  if (label.startsWith("shot-overlay")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(ScreenshotOverlay, {});
  }
  if (label.startsWith("scrollshot-frame")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollShotFrame, {});
  }
  if (label.startsWith("scrollshot-bar")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollShotBar, {});
  }
  if (label.startsWith("rec-select")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(RecorderSelect, {});
  }
  if (label.startsWith("rec-bar")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(RecorderBar, {});
  }
  if (label.startsWith("rec-vol")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(VolumePopover, {});
  }
  if (label.startsWith("pin-menu")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(PinMenu, {});
  }
  if (label.startsWith("pin-")) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(PinWindow, {});
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SettingsApp, {});
}
export {
  App as default
};
