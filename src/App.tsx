/** 按窗口 label 路由：三个窗口共用一个入口 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ClipboardPanel } from "./modules/clipboard/ClipboardPanel";
import { FolderPanel } from "./modules/folder/FolderPanel";
import { SettingsApp } from "./settings/SettingsApp";

export default function App() {
  const label = getCurrentWindow().label;

  if (label === "clipboard-panel") {
    return <ClipboardPanel />;
  }
  if (label === "folder-panel") {
    return <FolderPanel />;
  }
  return <SettingsApp />;
}
