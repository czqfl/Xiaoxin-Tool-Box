/** 文件夹数据 store：本地缓存 + 分组排序 */
import { create } from "zustand";
import type { FolderEntry } from "../types";
import * as api from "../core/tauri";

interface FolderStore {
  folders: FolderEntry[];
  loaded: boolean;
  refresh: () => Promise<void>;
  add: (path: string) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  moveToTop: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
}

export const useFolderStore = create<FolderStore>((set, get) => ({
  folders: [],
  loaded: false,

  refresh: async () => {
    const folders = await api.listFolders();
    set({ folders, loaded: true });
  },

  add: async (path) => {
    try {
      await api.addFolder(path);
      await get().refresh();
      return null;
    } catch (err) {
      return String(err);
    }
  },

  remove: async (id) => {
    set({ folders: get().folders.filter((f) => f.id !== id) });
    await api.removeFolder(id);
  },

  togglePin: async (id) => {
    await api.toggleFolderPin(id);
    await get().refresh();
  },

  moveToTop: async (id) => {
    await api.moveFolderToTop(id);
    await get().refresh();
  },

  reorder: async (ids) => {
    await api.reorderFolders(ids);
    await get().refresh();
  },
}));

/** 分组排序：固定项按 order 在前，其余按访问次数从高到低（同次数比最近访问） */
export function sortFolders(folders: FolderEntry[]): {
  pinned: FolderEntry[];
  frequent: FolderEntry[];
} {
  const pinned = folders
    .filter((f) => f.pinned)
    .sort((a, b) => a.order - b.order || a.created_at - b.created_at);
  const frequent = folders
    .filter((f) => !f.pinned)
    .sort(
      (a, b) =>
        b.visit_count - a.visit_count ||
        b.last_visit - a.last_visit ||
        a.created_at - b.created_at
    );
  return { pinned, frequent };
}
