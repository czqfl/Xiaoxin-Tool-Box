/** 常用语速贴设置页：功能开关 + 快捷键 + 面板行为 */
import { useConfigStore } from "../stores/configStore";
import { SettingGroup, SettingRow, Switch } from "./components";
import { ShortcutRow } from "./ShortcutRow";

export function SnippetsPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const c = config.snippets;
  if (!c) return null;

  return (
    <div className="settings-page">
      <h2>常用语速贴</h2>
      <p className="page-desc">快捷短语一键粘贴到任意应用</p>

      <div className="setting-group-title">功能</div>
      <SettingGroup>
        <SettingRow title="启用语速贴功能" desc="关闭后快捷键注销，工具栏 / 托盘 / 侧栏入口一并隐藏">
          <Switch
            checked={c.enabled}
            onChange={(on) => void update({ ...config, snippets: { ...c, enabled: on } })}
          />
        </SettingRow>
        {c.enabled && (
          <ShortcutRow
            target="snippets"
            title="呼出语速贴面板"
            desc="点击快捷键后按下新组合，例如 Alt+K（快捷短语，一键粘贴到任意应用）"
          />
        )}
      </SettingGroup>

      <div className="setting-group-title">面板行为</div>
      <SettingGroup>
        <SettingRow title="面板置顶" desc="置顶时常驻显示，失焦不自动隐藏">
          <Switch
            checked={c.always_on_top}
            onChange={(v) => void update({ ...config, snippets: { ...c, always_on_top: v } })}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
