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
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  Segmented,
  SettingGroup,
  SettingRow,
  Slider,
  Switch,
} from "./components";
import { ShortcutRow } from "./ShortcutRow";
import type { ThemeMode } from "../types";

export function GeneralPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const load = useConfigStore((s) => s.load);
  const [autostart, setAutostart] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  /** 导入会整体覆盖现有配置（含快捷键/翻译凭证/面板位置），且不可撤销，必须二次确认 */
  const [confirmImport, setConfirmImport] = useState(false);

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
        <ShortcutRow
          target="palette"
          title="全局命令面板"
          desc="任意应用中按下快捷键呼出：可直接算式与进制/单位换算、JSON·Base64 编解码、时间戳转换、翻译、搜剪贴板/凭证/语速贴/文件夹/文件/本机应用并启动，常用项自动排前"
        />
      </SettingGroup>

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
              { value: "system", label: "跟随系统", swatch: "linear-gradient(135deg,#eef0f3 0 50%,#2b2f36 50% 100%)" },
              { value: "light", label: "浅色", swatch: "#eef0f3", group: "浅色主题" },
              { value: "mint", label: "浅青", swatch: "#0f9f8c", group: "浅色主题" },
              { value: "skyblue", label: "浅蓝", swatch: "#4c8dff", group: "浅色主题" },
              { value: "red", label: "红色", swatch: "#e5484d", group: "浅色主题" },
              { value: "orange", label: "橙色", swatch: "#e58a2b", group: "浅色主题" },
              { value: "dark", label: "深色", swatch: "#2b2f36", group: "深色主题" },
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
            <button className="btn" onClick={() => setConfirmImport(true)}>
              导入配置
            </button>
          </div>
        </SettingRow>
        {configMsg && <div className="shortcut-hint">{configMsg}</div>}
      </SettingGroup>

      <ConfirmDialog
        open={confirmImport}
        onClose={() => setConfirmImport(false)}
        onConfirm={doImport}
        title="导入配置"
        message="将用备份文件整体覆盖当前的全部设置（快捷键、翻译凭据、面板位置、主题等），导入后无法撤销。建议先「导出配置」保存一份现有配置。"
        confirmLabel="覆盖导入"
        danger
      />
    </div>
  );
}
