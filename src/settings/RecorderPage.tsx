/** 屏幕录制（GIF）设置页：快捷键 / 帧率 / 编码质量 / 时长上限 / 保存目录 */
import { useConfigStore } from "../stores/configStore";
import { pickFolder } from "../core/tauri";
import { Segmented, SettingGroup, SettingRow, Slider, Switch } from "./components";
import { ShortcutRow } from "./ShortcutRow";

export function RecorderPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);

  const updateRec = (patch: Record<string, unknown>) => {
    update({ ...config, recorder: { ...config.recorder, ...patch } });
  };

  return (
    <div className="settings-page">
      <h2>屏幕录制</h2>
      <p className="page-desc">
        框选任意区域录制为视频 (AVI) 或 GIF 动图；托盘、悬浮工具栏或全局快捷键呼出
      </p>

      <SettingGroup>
        <ShortcutRow
          target="recorder"
          title="开始屏幕录制"
          desc="点击快捷键后按下新组合，例如 Ctrl+Alt+R（呼出全屏选区窗，拖拽框选录制区域）"
        />
      </SettingGroup>

      <SettingGroup>
        <SettingRow title="帧率" desc={`当前 ${config.recorder?.fps ?? 12} 帧/秒（越高越流畅，文件越大）`}>
          <Slider
            min={5}
            max={24}
            value={config.recorder?.fps ?? 12}
            onChange={(v) => updateRec({ fps: Math.round(v) })}
          />
        </SettingRow>
        <SettingRow title="编码质量" desc="高质量色彩更准但更耗 CPU，快速模式适合大区域长录像">
          <Segmented
            value={config.recorder?.quality ?? "normal"}
            options={[
              { value: "high", label: "高" },
              { value: "normal", label: "标准" },
              { value: "fast", label: "快速" },
            ]}
            onChange={(v) => updateRec({ quality: v })}
          />
        </SettingRow>
        <SettingRow title="时长上限" desc="单次录制最长秒数，超时自动保存收尾；0 = 不限制">
          <input
            className="number-input"
            type="number"
            min={0}
            max={3600}
            step={10}
            value={config.recorder?.max_duration_secs ?? 120}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") return;
              const v = Math.round(Number(raw));
              if (Number.isFinite(v)) updateRec({ max_duration_secs: v });
            }}
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v)) updateRec({ max_duration_secs: Math.min(3600, Math.max(0, v)) });
            }}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="保存位置"
          desc={config.recorder?.save_dir || "默认与截图同目录（未设置时保存到系统图片文件夹）"}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                void pickFolder().then((dir) => {
                  if (dir) updateRec({ save_dir: dir });
                });
              }}
            >
              选择…
            </button>
            {config.recorder?.save_dir && (
              <button className="btn btn-sm" onClick={() => updateRec({ save_dir: null })}>
                恢复默认
              </button>
            )}
          </div>
        </SettingRow>
        <SettingRow title="启用屏幕录制" desc="停用后快捷键注销，托盘/工具栏入口隐藏">
          <Switch checked={config.recorder?.enabled !== false} onChange={(v) => updateRec({ enabled: v })} />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
