/** 剪贴板历史 store：本地缓存 + Rust 数据源同步 */
import { create } from "zustand";
import type { ClipEntry } from "../types";
import * as api from "../core/tauri";

interface ClipboardStore {
  entries: ClipEntry[];
  loaded: boolean;
  /** 缩略图 data-url 缓存（面板生命周期内有效） */
  imageCache: Record<string, string>;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  fetchImage: (id: string) => Promise<string>;
}

export const useClipboardStore = create<ClipboardStore>((set, get) => ({
  entries: [],
  loaded: false,
  imageCache: {},

  refresh: async () => {
    const entries = await api.listClipboard();
    set({ entries, loaded: true });
  },

  remove: async (id) => {
    // 乐观更新，失败时 refresh 回滚
    set({ entries: get().entries.filter((e) => e.id !== id) });
    await api.deleteClipboardEntry(id);
  },

  clearAll: async () => {
    await api.clearClipboard();
    await get().refresh();
  },

  toggleFavorite: async (id) => {
    set({
      entries: get().entries.map((e) =>
        e.id === id ? { ...e, favorite: !e.favorite } : e
      ),
    });
    await api.toggleFavorite(id);
  },

  togglePin: async (id) => {
    set({
      entries: get().entries.map((e) =>
        e.id === id ? { ...e, pinned: !e.pinned } : e
      ),
    });
    await api.togglePin(id);
  },

  fetchImage: async (id) => {
    const cached = get().imageCache[id];
    if (cached) return cached;
    const data = await api.fetchImageData(id);
    if (data) {
      set({ imageCache: { ...get().imageCache, [id]: data } });
    }
    return data;
  },
}));
