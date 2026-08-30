const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index--ziH6xz5.js","assets/index-B-gap5mw.js"])))=>i.map(i=>d[i]);
import { i as invoke, g as getCurrentWindow, _ as __vitePreload, l as listen } from "./index-B-gap5mw.js";
async function getCurrent() {
  return getCurrentWindow();
}
async function loadNote(id) {
  return invoke("load_note", { id });
}
async function saveNote(id, data) {
  return invoke("save_note", { id, data });
}
async function listNotes() {
  return invoke("list_notes");
}
async function deleteNote(id) {
  return invoke("delete_note", { id });
}
async function setNotePriority(id) {
  return invoke("set_note_priority", { id });
}
async function newNoteId() {
  return invoke("new_note_id");
}
async function setAlwaysOnTop(pinned) {
  return invoke("set_always_on_top", { pinned });
}
async function startDragging() {
  return invoke("start_dragging");
}
async function createNoteWindow(id) {
  return invoke("create_note_window", { id });
}
async function openNoteWindow(id) {
  return invoke("open_note_window", { id });
}
async function openHistoryWindow() {
  return invoke("open_history_window");
}
async function closeWindow() {
  return invoke("close_window");
}
async function minimizeToTaskbar() {
  return invoke("minimize_to_taskbar");
}
async function minimizeToTray() {
  return invoke("minimize_to_tray");
}
async function markNoteOpen(id) {
  return invoke("mark_note_open", { id });
}
async function markNoteClosed(id) {
  return invoke("mark_note_closed", { id });
}
async function getOpenNotes() {
  return invoke("get_open_notes");
}
async function showWindow(label) {
  return invoke("show_window", { label });
}
async function quitApp() {
  return invoke("quit_app");
}
async function registerShortcuts() {
  return invoke("register_shortcuts");
}
async function loadSettings() {
  return invoke("load_settings");
}
async function saveSettings(settings2) {
  return invoke("save_settings", { settings: settings2 });
}
async function saveMdCustom(content) {
  return invoke("save_md_custom", { content });
}
async function readMdCustom() {
  return invoke("read_md_custom");
}
async function openFile(path) {
  return invoke("open_file", { path });
}
async function formatWithLLM(content, outputFormat) {
  return invoke("format_with_llm", { content, outputFormat });
}
async function openFolder(path) {
  return invoke("open_folder", { path });
}
async function effectiveNotesDir() {
  return invoke("effective_notes_dir");
}
async function saveBgImage(dataUrl, key) {
  return invoke("save_bg_image", { dataUrl, key });
}
async function readBgImage(path) {
  return invoke("read_bg_image", { path });
}
async function getWallpaper() {
  return invoke("get_wallpaper");
}
async function captureScreenRegion(x, y, w, h, scale) {
  const res = await invoke("capture_screen_region", { x, y, w, h, scale });
  return res instanceof Uint8Array ? res : new Uint8Array(res);
}
async function setAcrylic(enable, opacity, tintRgb) {
  return invoke("set_acrylic", { enable, opacity, tintRgb });
}
async function openSettingsWindow() {
  return invoke("open_settings_window");
}
async function deleteBgImage(path) {
  return invoke("delete_bg_image", { path });
}
async function selectFolder() {
  const { open } = await __vitePreload(async () => {
    const { open: open2 } = await import("./index--ziH6xz5.js");
    return { open: open2 };
  }, true ? __vite__mapDeps([0,1]) : void 0);
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择便签存储目录"
  });
  return typeof selected === "string" ? selected : null;
}
const api = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  captureScreenRegion,
  closeWindow,
  createNoteWindow,
  deleteBgImage,
  deleteNote,
  effectiveNotesDir,
  formatWithLLM,
  getCurrent,
  getOpenNotes,
  getWallpaper,
  listNotes,
  loadNote,
  loadSettings,
  markNoteClosed,
  markNoteOpen,
  minimizeToTaskbar,
  minimizeToTray,
  newNoteId,
  openFile,
  openFolder,
  openHistoryWindow,
  openNoteWindow,
  openSettingsWindow,
  quitApp,
  readBgImage,
  readMdCustom,
  registerShortcuts,
  saveBgImage,
  saveMdCustom,
  saveNote,
  saveSettings,
  selectFolder,
  setAcrylic,
  setAlwaysOnTop,
  setNotePriority,
  showWindow,
  startDragging
}, Symbol.toStringTag, { value: "Module" }));
async function deriveTheme() {
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    const cfg = await invoke("config_load");
    const t = cfg?.general?.theme ?? "system";
    if (t === "dark") return "dark";
    if (t !== "system") return "light";
    return sysDark ? "dark" : "light";
  } catch {
    return sysDark ? "dark" : "light";
  }
}
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise(
      (_, reject) => setTimeout(() => reject(new Error("IPC 调用超时：" + label)), ms)
    )
  ]);
}
function normalizeGlassPct(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return 55;
  if (v > 100) return Math.round(v / 40 * 100);
  return Math.max(0, Math.min(100, Math.round(v)));
}
function normalizeOpacity(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return 65;
  return Math.max(0, Math.min(100, Math.round(v)));
}
let cached = null;
async function getSettings() {
  if (!cached) {
    const raw = await withTimeout(loadSettings(), 8e3, "load_settings");
    if (raw.bg_transparent === true && raw.theme !== "transparent") {
      raw.theme = "transparent";
      delete raw.bg_transparent;
      try {
        await saveSettings(raw);
      } catch (e) {
        console.error("迁移透明设置失败:", e);
      }
    }
    if (raw.theme === "transparent") {
      raw.theme = "light";
      try {
        await saveSettings(raw);
      } catch (e) {
        console.error("迁移透明主题失败:", e);
      }
    }
    raw.theme = await deriveTheme();
    cached = raw;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      void notifyChanged();
    });
  }
  return cached;
}
async function refreshThemeFromToolbox() {
  if (!cached) {
    await getSettings();
    return;
  }
  cached.theme = await deriveTheme();
  for (const cb of listeners) {
    try {
      cb();
    } catch (e) {
      console.error("主题刷新回调出错:", e);
    }
  }
}
function getShortcut(action) {
  return cached?.shortcuts?.[action] ?? "";
}
const listeners = [];
let globalListenerRegistered = false;
async function notifyChanged() {
  try {
    const fresh = await withTimeout(loadSettings(), 8e3, "notifyChanged load_settings");
    fresh.theme = await deriveTheme();
    cached = fresh;
  } catch (e) {
    console.error("重新读取设置失败:", e);
  }
  for (const cb of listeners) {
    try {
      cb();
    } catch (e) {
      console.error("设置变更回调出错:", e);
    }
  }
}
function onSettingsChanged(cb) {
  listeners.push(cb);
  if (!globalListenerRegistered) {
    globalListenerRegistered = true;
    listen("settings-changed", () => {
      notifyChanged();
    }).catch((e) => console.error("监听 settings-changed 失败:", e));
  }
}
function setSettings(next) {
  cached = JSON.parse(JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
}
const SETTINGS_EVENT = "xiaoxin-sticky-note-settings-changed";
if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => {
    notifyChanged();
  });
}
const settings = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getSettings,
  getShortcut,
  normalizeGlassPct,
  normalizeOpacity,
  onSettingsChanged,
  refreshThemeFromToolbox,
  setSettings
}, Symbol.toStringTag, { value: "Module" }));
export {
  startDragging as a,
  newNoteId as b,
  closeWindow as c,
  createNoteWindow as d,
  getOpenNotes as e,
  setNotePriority as f,
  getSettings as g,
  deleteNote as h,
  openNoteWindow as i,
  saveNote as j,
  markNoteClosed as k,
  listNotes as l,
  minimizeToTray as m,
  normalizeOpacity as n,
  onSettingsChanged as o,
  normalizeGlassPct as p,
  getShortcut as q,
  setAlwaysOnTop as r,
  setAcrylic as s,
  loadNote as t,
  formatWithLLM as u,
  readMdCustom as v,
  api as w,
  settings as x
};
