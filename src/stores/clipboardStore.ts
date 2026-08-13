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
  /** 智能转换后更新条目文本（同步系统剪贴板由调用方负责） */
  replaceText: (id: string, text: string) => void;
  /** 编辑条目文本（乐观更新 + 后端持久化，失败时刷新回滚） */
  updateText: (id: string, text: string) => Promise<void>;
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
    const prev = get().entries;
    set({
      entries: prev.map((e) =>
        e.id === id ? { ...e, favorite: !e.favorite } : e
      ),
    });
    try {
      await api.toggleFavorite(id);
    } catch (err) {
      console.error("toggleFavorite failed", err);
      set({ entries: prev }); // 后端失败回滚乐观更新
    }
  },

  togglePin: async (id) => {
    const prev = get().entries;
    set({
      entries: prev.map((e) =>
        e.id === id ? { ...e, pinned: !e.pinned } : e
      ),
    });
    try {
      await api.togglePin(id);
    } catch (err) {
      console.error("togglePin failed", err);
      set({ entries: prev }); // 后端失败回滚乐观更新
    }
  },

  replaceText: (id, text) => {
    set({
      entries: get().entries.map((e) =>
        e.id === id && e.text !== null
          ? {
              ...e,
              text,
              preview: text.length > 100 ? `${text.slice(0, 100)}…` : text,
            }
          : e
      ),
    });
  },

  updateText: async (id, text) => {
    // 乐观更新；后端失败则回滚到修改前的文本
    const prev = get().entries;
    set({
      entries: prev.map((e) =>
        e.id === id && e.text !== null
          ? {
              ...e,
              text,
              preview: text.length > 100 ? `${text.slice(0, 100)}…` : text,
            }
          : e
      ),
    });
    try {
      await api.updateClipboardText(id, text);
    } catch (err) {
      console.error("updateText failed", err);
      set({ entries: prev }); // 回滚
    }
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
