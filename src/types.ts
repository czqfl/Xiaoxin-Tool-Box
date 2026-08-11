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
export type ThemeMode = "system" | "light" | "dark";

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

export interface AppConfig {
  clipboard: ClipboardConfig;
  folder: FolderConfig;
  credentials: CredentialConfig;
  shortcuts: ShortcutsConfig;
  general: GeneralConfig;
}

/** 粘贴模式：普通 / 先进先出 / 后进先出 */
export type PasteMode = "normal" | "fifo" | "lifo";

/** 已安装编辑器探测结果（右键菜单动态渲染用） */
export interface EditorInfo {
  key: string;
  label: string;
  exe: string;
}
