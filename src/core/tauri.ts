/** Rust command 统一封装层：所有 invoke 调用经此收口，便于错误兜底 */
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppConfig,
  ClipEntry,
  Credential,
  EditorInfo,
  FolderEntry,
  TranslateResult,
} from "../types";

/** 安全调用：Rust 侧异常转为友好文案，不抛出未处理错误 */
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.error("[invoke error]", err);
    return fallback;
  }
}

// ---- 配置 ----
export const loadConfig = () => invoke<AppConfig>("config_load");
export const saveConfig = (config: AppConfig) =>
  safe(invoke("config_save", { config }), undefined);
/** 导出配置到指定路径（备份/迁移） */
export const exportConfigTo = (path: string) =>
  invoke<void>("config_export_to", { path });
/** 从备份文件导入配置（恢复后需重新加载） */
export const importConfigFrom = (path: string) =>
  invoke<void>("config_import_from", { path });

// ---- 剪贴板 ----
export const listClipboard = () =>
  safe(invoke<ClipEntry[]>("clipboard_list"), [] as ClipEntry[]);
export const deleteClipboardEntry = (id: string) =>
  safe(invoke("clipboard_delete", { id }), undefined);
export const clearClipboard = () => safe(invoke("clipboard_clear"), undefined);
export const toggleFavorite = (id: string) =>
  safe(invoke("clipboard_toggle_favorite", { id }), undefined);
export const togglePin = (id: string) =>
  safe(invoke("clipboard_toggle_pin", { id }), undefined);
export const fetchImageData = (id: string) =>
  safe(invoke<string>("clipboard_image_data", { id }), "");
export const writeBackEntry = (id: string) =>
  invoke<void>("clipboard_write_back", { id });
export const pasteEntry = (id: string) =>
  invoke<void>("clipboard_paste", { id });
/** 顺序模式手动粘贴后消耗条目（记录到后端回滚缓冲） */
export const consumeEntry = (id: string) =>
  safe(invoke("clipboard_consume", { id }), undefined);
/** 撤销上一次顺序粘贴的消耗，恢复被消耗的条目 */
export const rollbackPaste = () =>
  safe(invoke("clipboard_rollback"), undefined);
/** 顺序模式下把队列中的条目上移/下移一位 */
export const moveQueueEntry = (id: string, direction: "up" | "down") =>
  safe(invoke("clipboard_move", { id, direction }), undefined);
/** 把指定条目插入粘贴队列（设为下一条待粘贴） */
export const enqueueEntry = (id: string) =>
  safe(invoke("clipboard_enqueue", { id }), undefined);
/** 顺序模式下拖动排序：把条目移到 targetId 之前（"__end__" = 队尾） */
export const reorderQueueEntry = (id: string, targetId: string) =>
  safe(invoke("clipboard_reorder", { id, targetId }), undefined);
/** 手动新增一条文本条目，插入到 beforeId 条目的上方（队列中它的前一条） */
export const insertQueueText = (text: string, beforeId: string) =>
  safe(invoke("clipboard_insert_text", { text, beforeId }), undefined);

// ---- 文件夹 ----
export const listFolders = () =>
  safe(invoke<FolderEntry[]>("folder_list"), [] as FolderEntry[]);
export const addFolder = (path: string) =>
  invoke<FolderEntry>("folder_add", { path });
export const removeFolder = (id: string) =>
  safe(invoke("folder_remove", { id }), undefined);
export const renameFolder = (id: string, name: string) =>
  safe(invoke("folder_rename", { id, name }), undefined);
export const setFolderColor = (id: string, color: string | null) =>
  safe(invoke("folder_set_color", { id, color }), undefined);
export const toggleFolderPin = (id: string) =>
  safe(invoke("folder_toggle_pin", { id }), undefined);
export const moveFolderToTop = (id: string) =>
  safe(invoke("folder_move_to_top", { id }), undefined);
export const reorderFolders = (ids: string[]) =>
  safe(invoke("folder_reorder", { ids }), undefined);
export const openFolder = (path: string) => invoke<void>("folder_open", { path });
export const openFolderInTerminal = (path: string) =>
  invoke<void>("folder_open_in_terminal", { path });
/** 在指定终端打开文件夹：shell 取 "wt" | "cmd" | "powershell" */
export const openFolderInTerminalWith = (path: string, shell: string) =>
  invoke<void>("folder_open_in_terminal_with", { path, shell });
export const copyFolderPath = (path: string) =>
  invoke<void>("folder_copy_path", { path });
/** 在指定编辑器中打开文件夹：editor 取 "code" | "idea" | "webstorm" */
export const openFolderInEditor = (path: string, editor: string) =>
  invoke<void>("folder_open_in_editor", { path, editor });
/** 记录用户手动指定的 VS Code 可执行文件路径（探测失败时引导选择后调用） */
export const setVscodePath = (path: string) =>
  safe(invoke("folder_set_vscode_path", { path }), undefined);
/** 自动检测已安装的编辑器（VS Code / Qoder / QoderCN / IDEA / WebStorm） */
export const detectEditors = () =>
  safe(invoke<EditorInfo[]>("folder_detect_editors"), []);
/** 在默认终端中执行命令（git 等）：shell 取 "wt" | "cmd" | "powershell" */
export const gitExec = (path: string, command: string, shell: string) =>
  invoke<void>("folder_git_exec", { path, command, shell });
/** 批量读取文件夹的 Git 当前分支（非仓库为 null） */
export const folderGitBranches = (paths: string[]) =>
  safe(invoke<(string | null)[]>("folder_git_branches", { paths }), []);

// ---- 账号密码 ----
export const listCredentials = () =>
  safe(invoke<Credential[]>("cred_list"), [] as Credential[]);
export const addCredential = (input: Omit<Credential, "id" | "created_at" | "updated_at">) =>
  invoke<Credential>("cred_add", { input });
export const updateCredential = (
  id: string,
  input: Omit<Credential, "id" | "created_at" | "updated_at">
) => invoke<void>("cred_update", { id, input });
export const deleteCredential = (id: string) =>
  safe(invoke("cred_delete", { id }), undefined);

// ---- 翻译 ----
/** 翻译文本（走配置的服务商与凭据）；from/to 缺省用配置（源默认 auto 自动检测） */
export const translateText = (text: string, from?: string, to?: string) =>
  invoke<TranslateResult>("translate", { text, from, to });
/** 弹窗挂载时拉取最近一次翻译结果 */
export const lastTranslateResult = () =>
  safe(invoke<TranslateResult | null>("translate_last_result"), null);

/** 复制任意文本到剪贴板（不触发监听重复记录，避免密码泄露到剪贴板历史） */
export const copyText = (text: string) =>
  invoke<void>("clipboard_copy_text", { text });

/** 调起系统资源管理器选择文件夹，取消时返回 null */
export const pickFolder = async (): Promise<string | null> => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择要添加的文件夹",
  });
  return typeof selected === "string" ? selected : null;
};

/** 调起系统文件选择器定位 VS Code 可执行文件，取消时返回 null */
export const pickVscodeExecutable = async (): Promise<string | null> => {
  const selected = await open({
    directory: false,
    multiple: false,
    title: "请选择 VS Code 的 Code.exe",
    filters: [{ name: "可执行文件", extensions: ["exe"] }],
  });
  return typeof selected === "string" ? selected : null;
};

// ---- 面板 ----
/** 切换面板置顶（后端实现：切换后重新应用毛玻璃，避免 Windows 黑屏） */
export const setPanelAlwaysOnTop = (on: boolean) =>
  invoke<void>("panel_set_always_on_top", { on });

// ---- 快捷键 ----
export const testShortcut = (shortcut: string) =>
  invoke<void>("shortcut_test", { shortcut });
export const applyShortcut = (
  target: "clipboard" | "folder" | "credentials" | "translation",
  shortcut: string
) => invoke<void>("shortcut_apply", { target, shortcut });
/** 录入捕获：钩子接管 Win 组合，避免系统功能抢先（与 capture_end 成对使用） */
export const beginShortcutCapture = () =>
  safe(invoke("shortcut_capture_begin"), undefined);
export const endShortcutCapture = () =>
  safe(invoke("shortcut_capture_end"), undefined);
