/** Rust command 统一封装层：所有 invoke 调用经此收口，便于错误兜底 */
import { Channel, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppConfig,
  ClipEntry,
  Credential,
  EditorInfo,
  FolderEntry,
  GitRunResult,
  GitStreamEvent,
  InstalledApp,
  PaletteStatEntry,
  PortProcess,
  QuickFileList,
  TranslateResult,
  TranslatedLine,
} from "../types";

/** 安全调用：Rust 侧异常转为友好文案，不抛出未处理错误 */
async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.error("[invoke error]", err);
    // 把后端错误写入应用诊断日志（data/diag.log），避免失败被静默吞掉、
    // 面板只显示空列表而无从排查。读取类调用仍 fail-soft 返回兜底值。
    try {
      void invoke("diag_log", { msg: `[invoke error] ${String(err)}` });
    } catch {}
    return fallback;
  }
}

// ---- 诊断 ----
/** 写诊断日志到 data/diag.log（排查弹窗交互等疑难问题用） */
export const diagLog = (msg: string) =>
  safe(invoke("diag_log", { msg }), undefined);

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
/** 把图片类条目贴到屏幕：Rust 直读原图落盘（超大图等比缩小、GIF 保持动画），
 *  返回贴图 id。与 fetchImageData 的缩略图无关，贴出来是原图清晰度。 */
export const clipboardPinImage = (id: string) =>
  invoke<string>("clipboard_pin_image", { id });
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
/** 编辑文本条目的内容（仅文本类型；图片/文件不可编辑） */
export const updateClipboardText = (id: string, text: string) =>
  safe(invoke("clipboard_update_text", { id, text }), undefined);

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
/** 用系统默认浏览器打开远程 Git 仓库（GitHub 等）网页 */
export const gitOpenRemote = (path: string) =>
  invoke<void>("folder_git_open_remote", { path });
/** 面板内逐条执行命令并捕获输出（友好展示每条结果） */
export const gitRun = (path: string, commands: string[]) =>
  safe(invoke<GitRunResult[]>("folder_git_run", { path, commands }), []);

/** 面板内【流式】执行命令：stdout/stderr 逐行实时回调（弹窗动态上屏），
 *  全部命令结束后 resolve。Rust 侧 folder_git_run_stream 每读到一行就经
 *  Channel 推送一次，前端 onEvent 收到即更新界面，无需等命令跑完。 */
export const gitRunStream = (
  path: string,
  commands: string[],
  onEvent: (ev: GitStreamEvent) => void,
): Promise<void> => {
  const channel = new Channel<GitStreamEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("folder_git_run_stream", {
    path,
    commands,
    onEvent: channel,
  });
};
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
/** 逐行翻译（OCR 面板对照展示）：每行独立判方向，返回与入参一一对齐的行结果 */
export const translateLines = (lines: string[]) =>
  invoke<TranslatedLine[]>("translate_lines", { lines });
/** 弹窗挂载时拉取最近一次翻译结果 */
export const lastTranslateResult = () =>
  safe(invoke<TranslateResult | null>("translate_last_result"), null);

/** 复制任意文本到剪贴板。默认不写进剪贴板历史（避免凭据/临时结果污染列表）；
 *  record=true 时按一次普通外部复制处理，会出现在剪贴板面板里 */
export const copyText = (text: string, record = false) =>
  invoke<void>("clipboard_copy_text", { text, record });

/** 关闭翻译弹窗：复位键盘钩子的"弹窗打开"标志并隐藏窗口（点 × / Esc / 失焦共用）。
 *  确保 TRANSLATE_POPUP_OPEN 不残留为 true，否则系统级 Esc 会一直被兜底逻辑拦截。 */
export const closeTranslatePopup = () =>
  invoke<void>("translate_popup_close");

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

/** 切换指定面板（工具栏图标点击呼出用；"settings" 打开设置窗口）。
 *  失败写入 diag.log 便于排查（不再静默吞错）。 */
export const panelToggle = async (label: string) => {
  try {
    await invoke<void>("panel_toggle", { label });
  } catch (err) {
    console.error("[panelToggle]", err);
    void diagLog(`[panelToggle] ${label} failed: ${String(err)}`);
  }
};

/** 当前可见的面板窗口标签列表（工具栏高亮状态查询用） */
export const panelActive = () =>
  safe(invoke<string[]>("panel_active"), []);

/** 悬浮工具栏显示/隐藏（设置页开关 / 托盘菜单共用） */
export const setToolbarVisible = (on: boolean) =>
  safe(invoke<void>("toolbar_set_visible", { on }), undefined);

// ---- 端口工具 ----
/** Promise 超时包装：超时即 reject，避免后端命令挂起时前端查询永久 pending（loading 卡死） */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`查询超时（${Math.round(ms / 1000)} 秒），netstat 无响应`)),
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
/** 按端口号或应用名（进程名）搜索占用端口的进程列表（带 20s 超时兜底） */
export const portSearch = (keyword: string) =>
  withTimeout(
    safe(invoke<PortProcess[]>("port_search", { keyword }), []),
    20000
  );
/** 结束指定 PID 的进程 */
export const killPort = (pid: number) =>
  safe(invoke("port_kill", { pid }), undefined);

// ---- 快速文件 ----
/** 列出保存位置下、属于已配置文件类型的所有文件（附带实际保存位置） */
export const quickfilesList = (location: string, extensions: string[]) =>
  safe(
    invoke<QuickFileList>("quickfiles_list", { location, extensions }),
    { location: "", files: [] } as QuickFileList
  );
/** 在保存位置新建空文件，返回完整路径 */
export const quickfilesCreate = (location: string, filename: string) =>
  invoke<string>("quickfiles_create", { location, filename });
/** 打开文件：opener 为空则用系统默认程序 */
export const quickfilesOpen = (path: string, opener?: string | null) =>
  invoke<void>("quickfiles_open", { path, opener: opener ?? null });
/** 在资源管理器中定位文件 */
export const quickfilesReveal = (path: string) =>
  invoke<void>("quickfiles_reveal", { path });
/** 删除文件 */
export const quickfilesDelete = (path: string) =>
  safe(invoke("quickfiles_delete", { path }), undefined);

// ---- 最近打开文件 ----
export interface RecentFile {
  path: string;
  name: string;
  ext: string;
  count: number;
  last_open: number;
}
/** 最近打开列表：sort="count" 按次数，其余（缺省）按最近打开时间 */
export const recentFilesList = (sort: "time" | "count" = "time") =>
  safe(invoke<RecentFile[]>("recent_files_list", { sort }), [] as RecentFile[]);
/** 从最近列表移除一条（不删文件） */
export const recentFilesRemove = (path: string) =>
  invoke<void>("recent_files_remove", { path });
export const recentFilesClear = () => invoke<void>("recent_files_clear");

// ---- 全盘文件名索引（Everything 式秒查） ----
export interface FsIndexStatus {
  entries: number;
  dirs: number;
  built_at: number;
  roots: string[];
  building: boolean;
  stale: boolean;
}
export interface FsHit {
  path: string;
  name: string;
  is_dir: boolean;
}
export const fsIndexStatus = () =>
  safe(invoke<FsIndexStatus>("fs_index_status"), {
    entries: 0, dirs: 0, built_at: 0, roots: [], building: false, stale: false,
  } as FsIndexStatus);
/** 后台建立/重建索引；进度经 fsindex://progress 事件推送 */
export const fsIndexRebuild = () => invoke<void>("fs_index_rebuild");
export const fsIndexCancel = () => invoke<boolean>("fs_index_cancel");
/** 搜索文件名/目录名（错误信息需原样透出给面板，如"尚未建立索引"） */
export const fsIndexSearch = (query: string) =>
  invoke<FsHit[]>("fs_index_search", { query });

/** 调起系统文件选择器定位"默认打开程序"可执行文件，取消时返回 null */
export const pickOpenerExecutable = async (): Promise<string | null> => {
  const selected = await open({
    directory: false,
    multiple: false,
    title: "选择默认打开此类型文件的应用程序",
    filters: [{ name: "可执行文件", extensions: ["exe"] }],
  });
  return typeof selected === "string" ? selected : null;
};

/** 枚举本机已安装应用（开始菜单 + App Paths），供「默认打开方式」下拉选择 */
export const listInstalledApps = () =>
  safe(invoke<InstalledApp[]>("list_installed_apps"), []);

// ---- 命令面板 ----
/** 启动本机应用（app_launch）：入参为 listInstalledApps 返回的 exe 完整路径 */
export const launchApp = (exe: string) => invoke<void>("app_launch", { exe });
/** 把一段现算文本写入剪贴板并模拟粘贴到用户原应用（不进剪贴板历史） */
export const pasteText = (text: string) =>
  invoke<void>("clipboard_paste_text", { text });
/** 命令面板用量统计（使用次数 / 最近使用时间），驱动排序加权与空态 */
export const listPaletteStats = () =>
  safe(invoke<PaletteStatEntry[]>("palette_stats_list"), [] as PaletteStatEntry[]);
/** 记一次使用：执行成功后 fire-and-forget，失败不影响动作本身 */
export const bumpPaletteStat = (key: string) =>
  safe(invoke("palette_stat_bump", { key }), undefined);

// ---- 快捷键 ----
export const testShortcut = (shortcut: string) =>
  invoke<void>("shortcut_test", { shortcut });
/** 应用快捷键：Rust 原子注册（新键失败旧键不动）+ 唯一持久化 + 全量广播。
 *  返回更新后的完整配置，前端只做内存同步、绝不回写覆盖 */
export const applyShortcut = (
  target:
    | "clipboard"
    | "folder"
    | "credentials"
    | "translation"
    | "port"
    | "files"
    | "snippets"
    | "screenshot"
    | "pins"
    | "pins_close"
    | "picker"
    | "recorder"
    | "palette",
  shortcut: string
) => invoke<import("../types").AppConfig>("shortcut_apply", { target, shortcut });
/** 运行时【真实生效】的绑定列表（["pins=Ctrl+N", ...]）——与配置声称值对照，
 *  用于在设置页直接暴露"改了不生效/旧键还在"这类脱节问题 */
export const shortcutRuntimeBindings = () =>
  invoke<string[]>("shortcut_runtime_bindings");
/** 推倒重来：全量注销所有热键后按运行时配置重新注册（排查修复用）。
 *  返回重注册后的完整配置，前端仅内存同步 */
export const resyncShortcuts = () =>
  invoke<import("../types").AppConfig>("shortcut_resync");
/** 录入捕获：钩子接管 Win 组合，避免系统功能抢先（与 capture_end 成对使用） */
export const beginShortcutCapture = () =>
  safe(invoke("shortcut_capture_begin"), undefined);
export const endShortcutCapture = () =>
  safe(invoke("shortcut_capture_end"), undefined);

// ---- 截图 ----
export interface ShotGeom {
  index: number; x: number; y: number; width: number; height: number;
  /** 智能识别初始高亮框（本显示器局部坐标；呼出瞬间即已识别好） */
  snap: { x: number; y: number; width: number; height: number } | null;
  /** 上次截取区域预填（本显示器局部坐标；仅当智能识别未命中时给出） */
  prefill: { x: number; y: number; width: number; height: number } | null;
  /** 本次会话是否为屏幕取色模式（前端据此渲染取色面板而非截图选区 UI） */
  picker: boolean;
  /** 窗口 Z 序快照（全局物理坐标，顶→底）：悬停窗口级命中在前端本地扫描，
   *  零 IPC 往返（Snipaste 级跟手）；UIA 元素级细化仍走服务端 */
  cands?: { x: number; y: number; width: number; height: number }[];
}
/** 开始截图（冻结屏幕 + 创建遮罩窗口） */
export const shotBegin = () => invoke<void>("shot_begin");
/** 开始屏幕取色（复用遮罩窗，纯取色模式：十字线+颜色面板） */
export const shotBeginPicker = () => invoke<void>("shot_begin_picker");
/** 获取当前遮罩窗口所在显示器的几何信息（含智能高亮框/预填选区） */
export const shotGeometry = () => invoke<ShotGeom>("shot_geometry");
/** 获取当前显示器的截屏原始 RGBA 二进制（配合 shot_geometry 的宽高使用）。
 *  Rust 端返回 tauri::ipc::Response，前端直接拿到 ArrayBuffer */
export const shotImageDataRaw = () => invoke<ArrayBuffer>("shot_image_raw");
/** 截图帧自定义协议地址（BMP 流式加载，绕开 IPC 序列化瓶颈）。
 *  带时间戳参数防缓存；Windows 下自定义协议映射为 http://<scheme>.localhost */
export const shotFrameUrl = (index: number) =>
  `http://screenshot.localhost/frame/${index}?v=${Date.now()}`;
/** 前端画好第一帧后调用：Rust 端此刻才显示遮罩窗（避免黑屏闪烁），并抢焦点 */
export const shotReady = () => invoke<void>("shot_ready");
/** 全局物理坐标下的光标位置（截图启动瞬间定位初始智能高亮） */
export const shotCursorGlobal = () =>
  invoke<[number, number]>("shot_cursor_global");
/** 智能窗口识别：返回全局物理坐标下鼠标处的窗口矩形 */
export const shotWindowRectAt = (x: number, y: number) =>
  invoke<{ x: number; y: number; width: number; height: number } | null>("shot_window_rect_at", { x, y });
/** 元素级智能识别（UIA）：返回鼠标处的元素【候选链】——内→外按面积升序，
 *  链[0] 最精确（按钮/输入框等组件），越往后越粗（工具条/面板）。
 *  前端悬停显示链[0]，滚轮在链层级间切换（PixPin 式）。全链被滤空时为 null */
export const shotUiRectAt = (x: number, y: number) =>
  invoke<{ x: number; y: number; width: number; height: number }[] | null>("shot_ui_rect_at", { x, y });
/** 获取上次记住的选区 */
export const shotLastRegion = () =>
  invoke<number[] | null>("shot_last_region");
/** 截图历史条目（新→旧，仅与当前屏同分辨率的）。
 *  region = 该帧被确认过的框选范围（本显示器局部物理像素 [x,y,w,h]），无则缺省 */
export interface ShotHistItem { file: string; ts: number; width: number; height: number; region?: number[] }
/** 列出截图历史 */
export const shotHistoryList = () =>
  invoke<ShotHistItem[]>("shot_history_list");
/** 翻历史截屏：dir=-1 更旧 / +1 更新；或 index 直接跳（-1=实时）。
 *  加载后 Rust 会推 shot-refresh 重载遮罩页。返回当前文件名，"live" = 实时画面 */
export const shotHistoryStep = (dir: number, index?: number) =>
  invoke<string>("shot_history_step", { dir, index: index ?? null });
/** 记录当前查看帧的框选范围（本显示器局部物理像素 [x,y,w,h]）：
 *  写进对应历史档的 sidecar，跳回该帧时还原「当时的选区」 */
export const shotHistorySaveRegion = (region: number[]) =>
  invoke<void>("shot_history_save_region", { region });
/** 删除单条历史截屏（帧 + 缩略图 + 选区记录） */
export const shotHistoryDelete = (file: string) =>
  invoke<void>("shot_history_delete", { file });
/** 清空全部历史截屏 */
export const shotHistoryClear = () =>
  invoke<void>("shot_history_clear");
/** 历史缩略图/原图协议地址（文件名白名单校验由 Rust 端负责） */
export const shotHistoryUrl = (file: string) =>
  `http://screenshot.localhost/history/${file}?v=${Date.now()}`;
/** 保存本次选区记忆 */
export const shotSaveRegion = (region: [number, number, number, number]) =>
  invoke("shot_save_region", { region });
/** 原生拖拽开始：登记锚点/手柄模式/主题色，之后拖动过程零 IPC
 *  （Rust 线程自己轮询光标并直绘冻结层），只在按下后首次移动时调一次 */
export interface ShotDragParams {
  mode: number; ax: number; ay: number; hx: number; hy: number;
  sx: number; sy: number; sw: number; sh: number;
  accent: [number, number, number]; scale: number;
  [k: string]: unknown;
}
export const shotDragBegin = (p: ShotDragParams) =>
  invoke<void>("shot_drag_begin", p);
/** 原生拖拽结束：前端已按最终矩形重画自己的层，Rust 还原冻结层原帧 */
export const shotDragEnd = () => invoke<void>("shot_drag_end");
/** 截图输出（复制/另存为/贴图）：PNG【原始字节】经 Tauri 原生二进制通道直传。
 *  invoke 直接携带 ArrayBuffer（零 base64、零 JSON 序列化），元数据走请求头。
 *  带 15s 超时兜底：万一通道异常也绝不让遮罩窗卡在屏幕上吞掉全部点击 */
export const shotOutputPost = (
  action: "copy" | "save" | "pin",
  png: Blob,
  params?: Record<string, string | number>,
): Promise<void> => {
  const headers: Record<string, string> = { "x-shot-action": action };
  if (params?.x !== undefined) headers["x-shot-x"] = String(params.x);
  if (params?.y !== undefined) headers["x-shot-y"] = String(params.y);
  if (params?.path !== undefined) headers["x-shot-path"] = String(params.path);
  return png.arrayBuffer().then((buf) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error("shot_output 超时")), 15000);
    });
    return Promise.race([
      invoke<void>("shot_output", buf, { headers: new Headers(headers) }),
      timeout,
    ]).finally(() => timer && clearTimeout(timer));
  });
};
/** 【零像素传输】无标注输出：只发选区矩形头，Rust 从本屏冻结帧直接裁剪——
 *  免前端 getImageData 回读 + 整块像素过桥 IPC + PNG 编解码（4K 选区省
 *  100~400ms）。冻结帧即呼出瞬间原始桌面像素，结果与旧路径逐字节一致 */
export const shotCropOutput = (
  action: "pin" | "copy" | "save",
  rect: { x: number; y: number; w: number; h: number },
  path?: string,
): Promise<void> => {
  const headers = new Headers({
    "x-shot-action": action,
    "x-shot-crop": "1",
    "x-shot-x": String(rect.x), "x-shot-y": String(rect.y),
    "x-shot-w": String(rect.w), "x-shot-h": String(rect.h),
    ...(path ? { "x-shot-path": path } : {}),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("shot_output 超时")), 15000);
  });
  return Promise.race([
    invoke<void>("shot_output", new ArrayBuffer(0), { headers }),
    timeout,
  ]).finally(() => timer && clearTimeout(timer));
};
/** 贴图最快路径：选区原始 BGRA 像素直传（免 PNG 编码/解码），
 *  Rust 端包成零压缩 BMP 落盘，WebView2 解码 BMP 近乎 memcpy */
export const shotPinPost = (
  bgra: Uint8Array, w: number, h: number, x: number, y: number,
): Promise<void> => {
  const headers = new Headers({
    // 必须带动作头：shot_output 靠 x-shot-action 分发（缺失会被当成未知动作拒绝，
    // 表现为"贴图无任何反应"，此前漏带导致贴图整条链路失效）
    "x-shot-action": "pin",
    "x-shot-w": String(w), "x-shot-h": String(h),
    "x-shot-x": String(x), "x-shot-y": String(y),
  });
  // 统一传 ArrayBuffer（与 shotOutputPost 同款已验证通道）
  const buf = (bgra.byteOffset === 0 && bgra.byteLength === bgra.buffer.byteLength)
    ? bgra.buffer
    : bgra.slice().buffer;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("shot_output 超时")), 15000);
  });
  return Promise.race([
    invoke<void>("shot_output", buf as ArrayBuffer, { headers }),
    timeout,
  ]).finally(() => timer && clearTimeout(timer));
};

/** 取消截图（关闭遮罩窗口） */
export const shotCancel = () => invoke<void>("shot_cancel");

// ---- 选区文字识别（OCR） ----
export interface ShotOcrWord { t: string; x: number; y: number; w: number; h: number }
export interface ShotOcrLine {
  text: string;
  /** 行矩形（图像内物理像素），由词矩形并集推导 */
  x: number; y: number; w: number; h: number;
  words: ShotOcrWord[];
}
/** OCR 调用统一超时兜底：首次识别可能还在建 ONNX session / 兜底拉取模型，给足 20s */
const ocrWithTimeout = <T>(p: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("OCR 超时")), 20000);
  });
  return Promise.race([p, timeout]).finally(() => timer && clearTimeout(timer));
};
/** 选区 PNG 原始字节 → PP-OCR（ONNX）逐行识别结果 */
export const shotOcrPost = (png: Blob): Promise<ShotOcrLine[]> =>
  png.arrayBuffer().then((buf) => ocrWithTimeout(invoke<ShotOcrLine[]>("shot_ocr", buf)));

// ---- OCR 模型档位（PP-OCR ONNX，设置页用） ----
export interface OcrModelInfo {
  id: string;
  name: string;
  desc: string;
  /** 模型体积（MB，约）：det + rec + 字典 */
  size_mb: number;
  /** 已在某个模型目录就位，可直接启用 */
  ready: boolean;
  active: boolean;
}
/** OCR 模型下载进度事件负载（Rust ocr.rs 每份进度 emit 一次，事件名见 OCR_DL_EVENT） */
export interface OcrDlProgress {
  /** 档位 id（如 ppocrv6-small） */
  id: string;
  /** 当前正在传输的文件（det/rec 模型或字典文件名） */
  file: string;
  /** download（传输中）| verify（SHA256 校验）| done（该文件落位完成） */
  phase: "download" | "verify" | "done";
  /** 本档位累计已完成字节（含此前已就位/完成的文件） */
  done: number;
  /** 本档位需下载总字节（Rust 侧 HEAD 预检汇总）；0 = 未知，走不确定动画 */
  total: number;
  /** 当前文件已下字节 */
  file_done: number;
  /** 当前文件总字节（0 = 未知） */
  file_total: number;
}
/** OCR 模型下载进度事件名（设置页 listen 它） */
export const OCR_DL_EVENT = "ocr://dl-progress";
export const ocrModelStatus = (): Promise<OcrModelInfo[]> =>
  invoke<OcrModelInfo[]>("ocr_model_status");
/** 下载档位模型到数据目录；返回下载后的最新状态列表 */
export const ocrModelDownload = (model: string): Promise<OcrModelInfo[]> =>
  invoke<OcrModelInfo[]>("ocr_model_download", { model });
/** 取消进行中的模型下载（半成品 .part 保留，下次从断点接着下） */
export const ocrModelCancel = (): Promise<void> => invoke<void>("ocr_model_cancel");
/** 删除档位模型文件（使用中拒删；其它已就位档位共用文件保留）；返回最新状态列表 */
export const ocrModelDelete = (model: string): Promise<OcrModelInfo[]> =>
  invoke<OcrModelInfo[]>("ocr_model_delete", { model });

// ---- 贴图 ----
/** 创建贴图（PNG data URL, 屏幕坐标） */
export const pinCreate = (png: string, x: number, y: number) =>
  invoke<{ id: string }>("pin_create", { png, x, y });
/** 从剪贴板创建贴图 */
export const pinFromClipboard = () => invoke<{ id: string }>("pin_from_clipboard");
/** 列出所有贴图 */
export const pinList = () => invoke<Array<{ id: string }>>("pin_list");
/** 更新贴图属性 */
export const pinUpdate = (id: string, patch: Record<string, unknown>) =>
  invoke<void>("pin_update", { id, ...patch });
/** 关闭单个贴图 */
export const pinClose = (id: string) => invoke<void>("pin_close", { id });
/** 贴图画好后调用：Rust 端此刻才显示贴图窗（避免空窗闪烁） */
export const pinReady = () => invoke<void>("pin_ready");
/** 贴图图片协议地址：GET /pin/{id} 文件原字节直出（WebView2 原生读盘+解码，
 *  取代 base64 data URL——数 MB 字符串走 IPC + 巨型 data URL 解码要数秒） */
export const pinImageUrl = (id: string) =>
  `http://screenshot.localhost/pin/${id}?v=${Date.now()}`;
/** 复制贴图原图到剪贴板 */
export const pinCopyImage = (id: string) => invoke<void>("pin_copy_image", { id });
/** 按贴图原始格式复制：图片→位图；文本/富文本→HTML+纯文本。返回 "image" | "html" */
export const pinCopyOriginal = (id: string) =>
  invoke<"image" | "html">("pin_copy_original", { id });
/** 把前端渲染好的 PNG 写入剪贴板（文本/富文本贴图「复制为图片」） */
export const pinCopyImageBytes = (png: Blob) =>
  png.arrayBuffer().then((buf) => invoke<void>("pin_copy_image_bytes", buf));
/** 切换贴图鼠标穿透 */
export const pinSetClickThrough = (on: boolean) =>
  invoke<void>("pin_set_click_through", { on });
/** 拖拽/缩放开始/结束：后端据此把待命窗补建顺延到空闲，避免交互中"卡一下" */
export const pinBusy = (on: boolean) => invoke<void>("pin_busy", { on });
/** Esc 隐藏单个贴图（不销毁，贴图热键可整批唤回） */
export const pinHideOne = () => invoke<void>("pin_hide_one");
/** HTML 贴图尺寸回填（前端渲染测量出的物理像素尺寸） */
export const pinResize = (id: string, width: number, height: number) =>
  invoke<void>("pin_resize", { id, width, height });
/** 贴图内容类型："image" | "html"（协议 URL 不带扩展名，渲染分支据此判断） */
export const pinKind = (id: string) => invoke<"image" | "html">("pin_kind", { id });
/** 贴图原图文件路径（另存为等需要真实文件的功能用） */
export const pinFilePath = (id: string) =>
  invoke<string | null>("pin_file_path", { id });
/** 贴图另存为：把原图文件复制到用户指定位置 */
export const pinSaveAs = (id: string, dest: string) =>
  invoke<void>("pin_save_as", { id, dest });
/** 贴图 OCR：Rust 直读 pins/{id} 图像文件识别（免前端 fetch 整图 + IPC 回传，
 *  大截图省几十到上百 ms；HTML 贴图解码失败 reject，调用方静默降级） */
export const pinOcr = (id: string): Promise<ShotOcrLine[]> =>
  ocrWithTimeout(invoke<ShotOcrLine[]>("pin_ocr", { id }));
/** 隐藏全部贴图 */
export const pinHideAll = () => invoke<void>("pin_hide_all");
/** 显示全部贴图 */
export const pinShowAll = () => invoke<void>("pin_show_all");
/** 清除全部贴图（删除窗口 + 文件） */
export const pinClearAll = () => invoke<void>("pin_clear_all");

// ---- 用户反馈 ----
/** 本机反馈档案（匿名设备码 + 预填联系人；首次调用生成设备码并落盘）。
 *  注意：IPC 返回值字段是 snake_case（serde 原样序列化，与 types.ts 全库约定一致） */
export interface FeedbackProfile {
  device_id: string;
  name: string;
  contact: string;
}
/** 截图预览数据（data URL 直接给 <img src>） */
export interface FeedbackImagePreview {
  data_url: string;
  size: number;
}
/** 开发者回复（本地留档，最新在前） */
export interface FeedbackReply {
  id: number;
  message: string;
  created_at: string;
}
/** 关于页展示用：留档列表 + 未读条数 */
export interface FeedbackRepliesSummary {
  replies: FeedbackReply[];
  unread: number;
}
export const feedbackProfile = () => invoke<FeedbackProfile>("feedback_profile");
export const feedbackSaveContact = (name: string, contact: string) =>
  invoke<void>("feedback_save_contact", { name, contact });
export const feedbackReadImage = (path: string) =>
  invoke<FeedbackImagePreview>("feedback_read_image", { path });
/** 本地留档的开发者回复 + 未读数 */
export const feedbackListReplies = () =>
  invoke<FeedbackRepliesSummary>("feedback_list_replies");
/** 立即向服务器拉取一次新回复（不等 7 分钟轮询），返回最新留档 */
export const feedbackPollRepliesNow = () =>
  invoke<FeedbackRepliesSummary>("feedback_poll_replies_now");
/** 标记全部回复已读（打开「关于」页时调用，侧栏红点熄灭） */
export const feedbackMarkRepliesRead = () =>
  invoke<void>("feedback_mark_replies_read");
/** 提交反馈（POST 到反馈服务器；category: bug|suggestion|other） */
export const submitFeedback = (
  category: string,
  text: string,
  name: string,
  contact: string,
  screenshotPath: string | null
) =>
  invoke<void>("submit_feedback", {
    category,
    text,
    name,
    contact,
    screenshotPath,
  });
