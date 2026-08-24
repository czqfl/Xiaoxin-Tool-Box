/** 端口工具设置页：功能开关 + 快捷键 + 面板行为 */
import { useConfigStore } from "../stores/configStore";
import { SettingGroup, SettingRow, Switch } from "./components";
import { ShortcutRow } from "./ShortcutRow";

export function PortPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const c = config.port;
  if (!c) return null;

  return (
    <div className="settings-page">
      <h2>端口工具</h2>
      <p className="page-desc">查询端口占用进程、一键结束进程</p>

      <div className="setting-group-title">功能</div>
      <SettingGroup>
        <SettingRow title="启用端口工具功能" desc="关闭后快捷键注销，工具栏 / 托盘 / 侧栏入口一并隐藏">
          <Switch
            checked={c.enabled}
            onChange={(on) => void update({ ...config, port: { ...c, enabled: on } })}
          />
        </SettingRow>
        {c.enabled && (
          <ShortcutRow
            target="port"
            title="呼出端口工具面板"
            desc="点击快捷键后按下新组合，例如 Alt+P（查询端口占用 / 一键杀进程）"
          />
        )}
      </SettingGroup>

      <div className="setting-group-title">面板行为</div>
      <SettingGroup>
        <SettingRow title="面板置顶" desc="置顶时常驻显示，失焦不自动隐藏">
          <Switch
            checked={c.always_on_top}
            onChange={(v) => void update({ ...config, port: { ...c, always_on_top: v } })}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
