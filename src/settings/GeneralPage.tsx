/** 通用设置页：开机自启、静默启动、语言、主题、面板外观、配置备份 */
import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useConfigStore } from "../stores/configStore";
import {
  exportConfigTo,
  importConfigFrom,
} from "../core/tauri";
import { broadcastConfigChanged } from "../core/events";
import { GlassSelect } from "../components/GlassSelect";
import {
  Segmented,
  SettingGroup,
  SettingRow,
  Slider,
  Switch,
} from "./components";
import type { ThemeMode } from "../types";

export function GeneralPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const load = useConfigStore((s) => s.load);
  const [autostart, setAutostart] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .catch((err) => console.error("读取自启动状态失败", err));
  }, []);

  const patchGeneral = (patched: Partial<typeof config.general>) => {
    void update({ ...config, general: { ...config.general, ...patched } });
  };

  /** 导出全部配置到用户选择的位置 */
  const doExport = async () => {
    try {
      const target = await save({
        title: "导出配置备份",
        defaultPath: "小心工具箱-配置备份.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!target) return;
      await exportConfigTo(target);
      setConfigMsg(`已导出到 ${target}`);
    } catch (err) {
      setConfigMsg(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /** 从备份文件恢复全部配置（含快捷键、翻译凭据、面板位置）。
   *  后端 config_import_from 已推倒重来重注册全部快捷键（即时生效）；
   *  这里 load() 拉回新配置后必须广播【新值】——广播旧闭包快照会把
   *  其他窗口的配置同步回恢复前的状态（"旧配置复活"通道之一） */
  const doImport = async () => {
    try {
      const picked = await open({
        title: "选择配置备份文件",
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!picked) return;
      await importConfigFrom(picked as string);
      await load();
      await broadcastConfigChanged(useConfigStore.getState().config);
      setConfigMsg("已恢复配置，快捷键已按新配置重新生效");
    } catch (err) {
      setConfigMsg(`导入失败：${err instanceof Error ? err.message : String(err)}`);
    }
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
        <SettingRow title="主题" desc="跟随系统按 Windows 外观自动切换；其余为固定浅色 / 深色配色">
          <GlassSelect
            value={config.general.theme}
            onChange={(v) => patchGeneral({ theme: v as ThemeMode })}
            options={[
              { value: "system", label: "跟随系统" },
              { value: "light", label: "浅色", group: "浅色主题" },
              { value: "mint", label: "浅青", group: "浅色主题" },
              { value: "skyblue", label: "浅蓝", group: "浅色主题" },
              { value: "red", label: "红色", group: "浅色主题" },
              { value: "orange", label: "橙色", group: "浅色主题" },
              { value: "dark", label: "深色", group: "深色主题" },
            ]}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="面板亚克力效果"
          desc="剪贴板/文件夹面板使用亚克力毛玻璃背景（与窗口是否聚焦无关，呼出即生效）"
        >
          <Switch
            checked={config.general.acrylic_enabled}
            onChange={(v) => patchGeneral({ acrylic_enabled: v })}
          />
        </SettingRow>

        <SettingRow
          title="面板底色不透明度"
          desc="数值越大面板底色越不透明，亚克力模糊越不明显"
        >
          <div className="slider-wrap">
            <Slider
              value={config.general.acrylic_opacity}
              disabled={!config.general.acrylic_enabled}
              onChange={(v) => patchGeneral({ acrylic_opacity: v })}
            />
            <span className="slider-value">
              {config.general.acrylic_opacity}%
            </span>
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="配置备份"
          desc="全部设置（快捷键、剪贴板、翻译凭据、面板位置等）均自动保存到配置文件；可导出备份用于重装/迁移"
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => void doExport()}>
              导出配置
            </button>
            <button className="btn" onClick={() => void doImport()}>
              导入配置
            </button>
          </div>
        </SettingRow>
        {configMsg && <div className="shortcut-hint">{configMsg}</div>}
      </SettingGroup>
    </div>
  );
}
