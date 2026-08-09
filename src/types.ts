/** 与 Rust 侧 serde 结构一一对应的前端类型定义 */

export type EntryKind = "text" | "image" | "files";

export interface ClipEntry {
  id: string;
  kind: EntryKind;
  text: string | null;
  preview: string;
  image_path: string | null;
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

export type FolderLayout = "grid" | "list";
/** 面板分区排布：左右分栏 / 上下分栏 */
export type FolderSplit = "columns" | "rows";
export type ThemeMode = "system" | "light" | "dark";

export interface ClipboardConfig {
  max_history: number;
  watch_images: boolean;
  watch_files: boolean;
  close_after_paste: boolean;
}

export interface FolderConfig {
  show_visit_count: boolean;
  layout: FolderLayout;
  split: FolderSplit;
  page_size: number;
}

export interface ShortcutsConfig {
  clipboard: string;
  folder: string;
}

export interface GeneralConfig {
  theme: ThemeMode;
  silent_start: boolean;
  language: string;
}

export interface AppConfig {
  clipboard: ClipboardConfig;
  folder: FolderConfig;
  shortcuts: ShortcutsConfig;
  general: GeneralConfig;
}

/** 粘贴模式 */
export type PasteMode = "normal" | "fifo" | "lifo" | "pinned";
