/** 剪贴板模块 API：对 core/tauri 的模块内收口 */
export {
  listClipboard,
  deleteClipboardEntry,
  clearClipboard,
  toggleFavorite,
  togglePin,
  fetchImageData,
  writeBackEntry,
  pasteEntry,
  setPanelAlwaysOnTop,
} from "../../core/tauri";
