/** 通用设置页：开机自启、静默启动、语言、主题 */
import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useConfigStore } from "../stores/configStore";
import { Segmented, SettingGroup, SettingRow, Switch } from "./components";
import type { ThemeMode } from "../types";

export function GeneralPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const [autostart, setAutostart] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .catch((err) => console.error("读取自启动状态失败", err));
  }, []);

  const patchGeneral = (patched: Partial<typeof config.general>) => {
    void update({ ...config, general: { ...config.general, ...patched } });
  };

  const toggleAutostart = async (next: boolean) => {
    setAutostartBusy(true);
    try {
      if (next) {
        await enable();
      } else {
        await disable();
      }
      setAutostart(next);
    } catch (err) {
      console.error("切换开机自启失败", err);
    } finally {
      setAutostartBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <h2>通用设置</h2>
      <p className="page-desc">启动行为、语言与外观</p>

      <SettingGroup>
        <SettingRow
          title="开机自动启动"
          desc="登录 Windows 后在后台静默运行"
        >
          <Switch
            checked={autostart}
            onChange={(v) => {
              if (!autostartBusy) void toggleAutostart(v);
            }}
          />
        </SettingRow>

        <SettingRow
          title="静默启动"
          desc="启动时不弹出设置窗口，仅驻留托盘，通过快捷键呼出面板"
        >
          <Switch
            checked={config.general.silent_start}
            onChange={(v) => patchGeneral({ silent_start: v })}
          />
        </SettingRow>

        <SettingRow title="界面语言" desc="更多语言支持即将推出">
          <Segmented
            value={config.general.language}
            options={[{ value: "zh-CN", label: "简体中文" }]}
            onChange={(v) => patchGeneral({ language: v })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow title="主题模式" desc="跟随系统将根据 Windows 外观自动切换">
          <Segmented<ThemeMode>
            value={config.general.theme}
            options={[
              { value: "system", label: "跟随系统" },
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
            ]}
            onChange={(v) => patchGeneral({ theme: v })}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
