/** 账号密码设置页：功能开关 + 快捷键 + 面板行为 */
import { useConfigStore } from "../stores/configStore";
import { SettingGroup, SettingRow, Switch } from "./components";
import { ShortcutRow } from "./ShortcutRow";

export function CredentialPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const c = config.credentials;
  if (!c) return null;

  return (
    <div className="settings-page">
      <h2>账号密码</h2>
      <p className="page-desc">本地加密保存的账号密码，呼出面板速查复制</p>

      <div className="setting-group-title">功能</div>
      <SettingGroup>
        <ShortcutRow
          target="credentials"
          title="呼出账号密码面板"
          desc="点击快捷键后按下新组合，例如 Alt+A"
        />
      </SettingGroup>

      <div className="setting-group-title">面板行为</div>
      <SettingGroup>
        <SettingRow title="面板置顶" desc="置顶时常驻显示，失焦不自动隐藏">
          <Switch
            checked={c.always_on_top}
            onChange={(v) => void update({ ...config, credentials: { ...c, always_on_top: v } })}
          />
        </SettingRow>
        <SettingRow title="默认显示密码" desc="打开面板时密码列直接明文显示（仍可手动切换）">
          <Switch
            checked={c.show_passwords}
            onChange={(v) => void update({ ...config, credentials: { ...c, show_passwords: v } })}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
