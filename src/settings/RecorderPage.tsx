/** 屏幕录制（MP4 / GIF）设置页：快捷键 / 默认格式 / 分辨率 / 帧率 / 编码质量 / 保存目录。
 *  这里的取值即录制面板的默认值（面板只暴露「格式」供临时切换），两处共用同一套配置。 */
import { useConfigStore } from "../stores/configStore";
import { pickFolder } from "../core/tauri";
import { invoke } from "@tauri-apps/api/core";
import { Segmented, SettingGroup, SettingRow, Slider } from "./components";
import { ShortcutRow } from "./ShortcutRow";

export function RecorderPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);

  const updateRec = (patch: Record<string, unknown>) => {
    update({ ...config, recorder: { ...config.recorder, ...patch } });
  };

  const openDir = () => void invoke<void>("recorder_open_dir").catch(() => {});

  return (
    <div className="settings-page">
      <h2>屏幕录制</h2>
      <p className="page-desc">
        框选任意区域录制为 MP4 视频或 GIF 动图；托盘、悬浮工具栏或全局快捷键呼出。
        本页的取值是录制时的默认值，录制面板可临时换格式（不影响这里的设置）
      </p>

      <SettingGroup>
        <ShortcutRow
          target="recorder"
          title="开始屏幕录制"
          desc="点击快捷键后按下新组合，例如 Ctrl+Alt+R（呼出全屏选区窗，拖拽框选录制区域）"
        />
      </SettingGroup>

      {/* 以下均为【录制面板的默认值】：面板里只保留「格式」可临时切换，
          分辨率 / 画质 / 帧率都沿用这里的设置，两处因此是同一套配置 */}
      <SettingGroup>
        <SettingRow title="默认格式" desc="录制面板可临时改，改这里才是持久默认">
          <Segmented
            value={config.recorder?.fmt ?? "mp4"}
            options={[
              { value: "mp4", label: "视频 MP4" },
              { value: "gif", label: "动图 GIF" },
            ]}
            onChange={(v) => updateRec({ fmt: v })}
          />
        </SettingRow>
        <SettingRow title="默认分辨率" desc="按选区高度换算缩放，不会放大超过原始尺寸">
          <Segmented
            value={config.recorder?.res ?? "raw"}
            options={[
              { value: "raw", label: "原始" },
              { value: "1080", label: "1080p" },
              { value: "720", label: "720p" },
              { value: "360", label: "360p" },
            ]}
            onChange={(v) => updateRec({ res: v })}
          />
        </SettingRow>
        <SettingRow title="帧率" desc={`当前 ${config.recorder?.fps ?? 12} 帧/秒（5–60，越高越流畅，文件越大）`}>
          <Slider
            min={5}
            max={60}
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
            <button className="btn btn-sm" onClick={openDir} title="在资源管理器中打开录屏保存文件夹">
              打开保存文件夹
            </button>
            {config.recorder?.save_dir && (
              <button className="btn btn-sm" onClick={() => updateRec({ save_dir: null })}>
                恢复默认
              </button>
            )}
          </div>
        </SettingRow>
        {/* 「启用/停用」统一由功能开关页管理，此处不再重复提供 */}
      </SettingGroup>
    </div>
  );
}
