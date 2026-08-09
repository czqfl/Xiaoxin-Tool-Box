/** 剪贴板设置页 */
import { useConfigStore } from "../stores/configStore";
import { Segmented, SettingGroup, SettingRow, Switch } from "./components";

export function ClipboardPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);

  const patch = (patched: Partial<typeof config.clipboard>) => {
    void update({
      ...config,
      clipboard: { ...config.clipboard, ...patched },
    });
  };

  return (
    <div className="settings-page">
      <h2>剪贴板设置</h2>
      <p className="page-desc">管理剪贴板历史监听与粘贴行为</p>

      <SettingGroup>
        <SettingRow
          title="历史容量上限"
          desc="超出后自动清理最旧的未收藏记录"
        >
          <Segmented
            value={String(config.clipboard.max_history)}
            options={[
              { value: "100", label: "100" },
              { value: "200", label: "200" },
              { value: "500", label: "500" },
              { value: "1000", label: "1000" },
            ]}
            onChange={(v) => patch({ max_history: Number(v) })}
          />
        </SettingRow>

        <SettingRow title="监听图片" desc="复制图片时记录缩略图">
          <Switch
            checked={config.clipboard.watch_images}
            onChange={(v) => patch({ watch_images: v })}
          />
        </SettingRow>

        <SettingRow title="监听文件路径" desc="复制文件/文件夹时记录路径元数据">
          <Switch
            checked={config.clipboard.watch_files}
            onChange={(v) => patch({ watch_files: v })}
          />
        </SettingRow>

        <SettingRow
          title="粘贴后自动关闭面板"
          desc="普通粘贴模式下，粘贴完成后自动隐藏面板（顺序粘贴模式始终关闭）"
        >
          <Switch
            checked={config.clipboard.close_after_paste}
            onChange={(v) => patch({ close_after_paste: v })}
          />
        </SettingRow>

        <SettingRow
          title="面板置顶显示"
          desc="剪贴板面板始终悬浮在其他窗口之上（面板头部的图钉按钮可快捷切换）"
        >
          <Switch
            checked={config.clipboard.always_on_top}
            onChange={(v) => patch({ always_on_top: v })}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
