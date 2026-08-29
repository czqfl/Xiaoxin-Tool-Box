/** 任务栏透明设置页（纯透明效果）。
 *  启用/停用统一在「功能开关」页控制；修改即保存并即时应用。
 *  注：不透明度/亚克力暂未开放（任务栏窗口上 ACCENT 4 失能会触发系统紫色
 *  兜底色；当前版本后端固定输出完全透明，见 taskbar.rs apply）。 */
import { SettingGroup, SettingRow, Slider } from "./components";

export function TaskbarPage() {
  return (
    <div className="settings-page">
      <h2>任务栏透明</h2>
      <p className="page-desc">
        自定义 Windows 桌面底部任务栏的背景样式。启用 / 停用请在「功能开关」页操作；
        资源管理器重启（explorer.exe）后由应用自动恢复效果
      </p>

      <SettingGroup>
        <SettingRow
          title="任务栏不透明度"
          desc="开发中：当前版本固定为完全透明（只剩图标），后续版本开放调节"
        >
          <div className="slider-wrap">
            <Slider value={0} disabled onChange={() => {}} />
            <span className="slider-value">0%</span>
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="说明"
          desc="当前版本仅支持纯透明效果。若透明后任务栏仍带颜色，请到 Windows 设置 → 个性化 → 颜色 关闭「在开始和任务栏上显示主题色」（系统主题色会给透明任务栏染色）；资源管理器重启后效果由应用自动恢复"
        >
          <span />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
