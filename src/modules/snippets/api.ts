/** 常用语速贴：后端命令封装 */
import { invoke } from "@tauri-apps/api/core";
import type { Snippet } from "../../types";

export const snippetsList = () => invoke<Snippet[]>("snippets_list");

export const snippetsCreate = (title: string, content: string, group: string) =>
  invoke<Snippet>("snippets_create", { title, content, group });

export const snippetsUpdate = (id: string, title: string, content: string, group: string) =>
  invoke<Snippet>("snippets_update", { id, title, content, group });

export const snippetsDelete = (id: string) => invoke<void>("snippets_delete", { id });

/** 一键粘贴：写剪贴板 + 模拟 Ctrl+V（调用后应立即隐藏面板，焦点归还目标窗口） */
export const snippetsPaste = (id: string) => invoke<void>("snippets_paste", { id });
