/** 关于页：品牌信息与版本 */
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { SettingGroup, SettingRow } from "./components";

export function AboutPage() {
  const [version, setVersion] = useState("1.0.0");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch((err) => console.error("读取版本号失败", err));
  }, []);

  return (
    <div className="settings-page">
      <h2>关于</h2>
      <p className="page-desc">小心工具箱 · Windows 桌面快捷工具集</p>

      <SettingGroup>
        <div className="about-hero">
          <div className="about-logo">⚡</div>
          <h3>小心工具箱</h3>
          <div className="about-version">版本 v{version}</div>
        </div>
      </SettingGroup>

      <SettingGroup>
        <SettingRow title="剪贴板管理" desc="历史记录、收藏置顶、四种粘贴模式" />
        <SettingRow title="文件夹快捷访问" desc="智能排序、固定拖拽、一键终端打开" />
        <SettingRow title="全局快捷键" desc="冲突检测，随时呼出悬浮面板" />
        <SettingRow title="技术栈" desc="Tauri 2 · React 18 · TypeScript · Zustand" />
      </SettingGroup>

      <div className="shortcut-hint">
        适用于 Windows 10 1809+ / Windows 11
      </div>
    </div>
  );
}
