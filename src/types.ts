/** 与 Rust 侧 serde 结构一一对应的前端类型定义 */

export type EntryKind = "text" | "image" | "files";

export interface ClipEntry {
  id: string;
  kind: EntryKind;
  text: string | null;
  preview: string;
  /** 原图相对路径（写回剪贴板用，保持原分辨率） */
  image_path: string | null;
  /** 缩略图相对路径（仅面板预览用，200px） */
  image_thumb_path: string | null;
  files: string[] | null;
  source_app: string | null;
  created_at: number;
  favorite: boolean;
  pinned: boolean;
  /** 顺序队列（FIFO/LIFO）中已消耗：收藏项消耗后保留数据但不再入队 */
  consumed: boolean;
  content_hash: string;
}

export interface FolderEntry {
  id: string;
  name: string;
  path: string;
  color: string | null;
  pinned: boolean;
  order: number;
  visit_count: number;
  last_visit: number;
  visits: number[];
  created_at: number;
}

/** 常用账号密码条目（手动添加） */
export interface Credential {
  id: string;
  /** 名称 / 用途，如「GitHub」「公司邮箱」 */
  label: string;
  /** 账号（用户名 / 邮箱 / 手机号） */
  account: string;
  /** 密码 */
  password: string;
  /** 备注（可选） */
  note: string | null;
  created_at: number;
  updated_at: number;
}

export type FolderLayout = "grid" | "list" | "tree";
/** 终端类型：Windows Terminal / 命令提示符 / PowerShell */
export type TerminalShell = "wt" | "cmd" | "powershell";
/** 面板分区排布：左右分栏 / 上下分栏 */
export type FolderSplit = "columns" | "rows";
export type ThemeMode = "system" | "light" | "dark" | "mint" | "skyblue" | "red";

export interface ClipboardConfig {
  max_history: number;
  watch_images: boolean;
  watch_files: boolean;
  close_after_paste: boolean;
  /** 剪贴板面板是否置顶显示 */
  always_on_top: boolean;
  /** 粘贴模式；顺序模式下全局 Ctrl+V 逐条带出队列内容 */
  paste_mode: PasteMode;
}

export interface FolderConfig {
  show_visit_count: boolean;
  layout: FolderLayout;
  split: FolderSplit;
  page_size: number;
  /** 文件夹面板是否置顶显示 */
  always_on_top: boolean;
  /** 是否追踪资源管理器中打开的文件夹并自动统计访问次数 */
  track_explorer: boolean;
  /** 卡片快捷按钮默认打开的终端类型 */
  terminal_shell: TerminalShell;
  /** 用户手动指定的 VS Code 可执行文件路径（自动探测失败时引导选择后记录） */
  vscode_path?: string | null;
}

export interface ShortcutsConfig {
  clipboard: string;
  folder: string;
  /** 呼出账号密码面板的快捷键 */
  credentials: string;
  /** 划词翻译快捷键 */
  translation: string;
  /** 呼出端口工具面板的快捷键 */
  port: string;
  /** 呼出快速文件面板的快捷键 */
  files: string;
}

/** 端口工具面板配置 */
export interface PortConfig {
  /** 端口工具面板是否置顶显示（置顶时常驻，失焦不自动隐藏） */
  always_on_top: boolean;
}

/** 单一文件类型定义（快速文件面板用） */
export interface FileTypeDef {
  /** 扩展名（不含点，小写），如 "md" */
  ext: string;
  /** 显示名，如 "Markdown" */
  label: string;
  /** 强调色（十六进制，如 #4c8dff），面板内该类型卡片醒目区分 */
  color: string;
  /** 默认打开方式：应用 exe 完整路径或命令；为空表示系统默认程序 */
  opener?: string | null;
}

/** 快速文件面板配置：统一位置新建/打开/管理多种类型文件 */
export interface FilesConfig {
  /** 文件统一保存位置（绝对路径）；为空回退到 data/quickfiles */
  location?: string | null;
  /** 可新建的文件类型列表（每种类型单独配置扩展名/强调色/默认打开方式） */
  file_types: FileTypeDef[];
  /** 面板是否置顶显示 */
  always_on_top: boolean;
  /** 默认分组方式："none" 不分组 / "type" 按文件类型 / "date" 按创建日期 */
  default_group: FilesGroupMode;
  /** 默认排序方式："created" 按创建时间 / "name" 按名称 */
  default_sort: FilesSortMode;
  /** 分组展示布局："vertical" 垂直列表 / "horizontal" 水平多列并排 */
  default_layout: FilesLayoutMode;
}

/** 快速文件分组方式 */
export type FilesGroupMode = "none" | "type" | "date";
/** 快速文件排序方式 */
export type FilesSortMode = "created" | "name";
/** 快速文件分组展示布局：垂直列表 / 水平多列并排 */
export type FilesLayoutMode = "vertical" | "horizontal";

/** 快速文件面板：保存位置下的单个文件条目 */
export interface QuickFile {
  /** 文件名（含扩展名） */
  name: string;
  /** 扩展名（小写，不含点） */
  ext: string;
  /** 完整路径 */
  path: string;
  /** 创建时间（毫秒时间戳，0 表示未知） */
  created_at: number;
  /** 文件大小（字节） */
  size: number;
}

/** 快速文件列表结果（附带实际使用的保存位置） */
export interface QuickFileList {
  /** 实际使用的保存位置（绝对路径） */
  location: string;
  /** 文件条目列表 */
  files: QuickFile[];
}

/** 应用类别：编辑器（置顶）/ 浏览器 / 其他 */
export type AppKind = "editor" | "browser" | "other";

/** 本机已安装应用（供设置页「默认打开方式」下拉选择） */
export interface InstalledApp {
  /** 应用显示名 */
  name: string;
  /** 可执行文件完整路径 */
  exe: string;
  /** 应用类别（前端分组：常用编辑器置顶） */
  kind: AppKind;
  /** 应用图标（32×32 PNG data URL），取不到为 null */
  icon: string | null;
}

/** 悬浮工具栏可展示的工具 */
export type ToolKey =
  | "clipboard"
  | "folder"
  | "credentials"
  | "translation"
  | "port"
  | "files"
  | "settings";

/** 悬浮工具栏配置：常驻小工具条，快速呼出各面板 */
export interface ToolbarConfig {
  /** 是否启用（显示）悬浮工具栏 */
  enabled: boolean;
  /** 工具栏上显示的工具（顺序即排列顺序） */
  tools: ToolKey[];
  /** 排列方向：水平横条 / 竖直竖条 */
  orientation: "horizontal" | "vertical";
  /** 贴边自动收起：工具栏贴到屏幕边缘后，鼠标离开自动滑出（靠近边缘自动弹出） */
  auto_hide: boolean;
}

export interface GeneralConfig {
  theme: ThemeMode;
  silent_start: boolean;
  language: string;
  /** 面板是否启用亚克力毛玻璃效果 */
  acrylic_enabled: boolean;
  /** 面板底色不透明度（0-100，越大越不透明，亚克力模糊越不明显） */
  acrylic_opacity: number;
}

export interface CredentialConfig {
  /** 账号密码面板是否置顶显示 */
  always_on_top: boolean;
  /** 是否默认显示全部密码（持久化，下次打开遵循） */
  show_passwords: boolean;
}

/** 翻译服务商："youdao" | "baidu" */
export type TranslateProvider = "youdao" | "baidu";

/** 划词翻译配置（凭据与目标语言，持久化到 config.json） */
export interface TranslatorConfig {
  provider: TranslateProvider;
  youdao_key: string;
  youdao_secret: string;
  baidu_appid: string;
  baidu_secret: string;
  /** 目标语言通用代码：zh/en/ja/ko/fr/de/ru/es */
  target_lang: string;
  /** 翻译面板置顶常驻（失焦不自动隐藏） */
  always_on_top: boolean;
}

/** 翻译结果（含服务商检测出的源语言） */
export interface TranslateResult {
  text: string;
  translation: string;
  from: string;
  to: string;
  provider: string;
}

export interface AppConfig {
  clipboard: ClipboardConfig;
  folder: FolderConfig;
  credentials: CredentialConfig;
  shortcuts: ShortcutsConfig;
  general: GeneralConfig;
  /** 划词翻译配置 */
  translator: TranslatorConfig;
  /** 端口工具面板配置 */
  port: PortConfig;
  /** 快速文件面板配置 */
  files: FilesConfig;
  /** 悬浮工具栏配置 */
  toolbar: ToolbarConfig;
  /** 各面板上次关闭位置（窗口标签 -> 屏幕坐标），持久化，呼出时恢复 */
  panel_positions: Record<string, [number, number]>;
}

/** 粘贴模式：普通 / 先进先出 / 后进先出 */
export type PasteMode = "normal" | "fifo" | "lifo";

/** 已安装编辑器探测结果（右键菜单动态渲染用） */
export interface EditorInfo {
  key: string;
  label: string;
  exe: string;
}

/** Git 命令单条执行结果（文件夹面板内展示用） */
export interface GitRunResult {
  /** 命令原文（如 "git status"） */
  command: string;
  /** 是否执行成功（退出码 0） */
  ok: boolean;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 退出码；启动失败为 null */
  code: number | null;
}

/** 端口工具：占用指定端口的进程信息 */
export interface PortProcess {
  pid: number;
  /** 进程名（如 node.exe、Code.exe） */
  name: string;
  /** 监听状态（LISTENING / ESTABLISHED / TIME_WAIT 等，UDP 为空） */
  state: string;
  /** 协议（TCP / TCP6 / UDP / UDP6） */
  proto: string;
  /** 是否系统关键进程（受保护，拒绝结束） */
  protected: boolean;
  /** 该进程占用的端口（按名称搜索时多个端口逐行返回；按端口查询时为查询端口） */
  port?: number;
  /** 进程完整映像路径（可执行文件全路径），如 C:\Program Files\nodejs\node.exe */
  path: string;
  /** 进程命令行（best-effort）：含启动参数与项目路径，用于反查“启动项目” */
  cmdline: string;
}
