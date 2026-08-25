/** Screenshot & Pin settings page with sub-tabs */
import { useState } from "react";
import { useConfigStore } from "../stores/configStore";
import { shotHistoryClear } from "../core/tauri";
import { Segmented, SettingGroup, SettingRow, Slider, Switch } from "./components";
import { ShortcutRow } from "./ShortcutRow";

type Tab = "shot" | "pin" | "annotate";

/** 清空全部历史截屏（带二次确认的行内按钮） */
function ClearHistoryRow() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <SettingRow title="清空历史截屏" desc={done ? "已清空" : confirming ? "再点一次确认清空，此操作不可恢复" : "删除磁盘上的全部历史档与选区记录"}>
      <button
        className="btn btn-sm"
        style={confirming ? { background: "#e5484d", color: "#fff", borderColor: "#e5484d" } : undefined}
        onClick={() => {
          if (!confirming) { setConfirming(true); window.setTimeout(() => setConfirming(false), 3000); return; }
          setConfirming(false);
          void shotHistoryClear().then(() => { setDone(true); window.setTimeout(() => setDone(false), 2500); }).catch(() => {});
        }}
      >
        {confirming ? "确认清空" : done ? "已清空" : "清空"}
      </button>
    </SettingRow>
  );
}

export function ScreenshotPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const [tab, setTab] = useState<Tab>("shot");

  const updateShot = (patch: Record<string, unknown>) => {
    update({ ...config, shot: { ...config.shot, ...patch } });
  };
  const updatePin = (patch: Record<string, unknown>) => {
    update({ ...config, pin: { ...config.pin, ...patch } });
  };
  const updateAnno = (patch: Record<string, unknown>) => {
    update({ ...config, annotate: { ...config.annotate, ...patch } });
  };

  return (
    <div className="settings-page">
      <h2>截图贴图</h2>
      <p className="page-desc">
        全屏截图、区域选取与贴图钉屏（类似 Snipaste）；支持窗口智能识别与标注
      </p>

      <div className="shot-settings-tabs">
        <Segmented
          value={tab}
          options={[
            { value: "shot", label: "截图" },
            { value: "pin", label: "贴图" },
            { value: "annotate", label: "标注" },
          ]}
          onChange={(v) => setTab(v)}
        />
      </div>

      {tab === "shot" && (
        <>
          <SettingGroup>
            <ShortcutRow
              target="screenshot"
              title="开始截图"
              desc="点击快捷键后按下新组合，例如 Ctrl+Alt+A（冻结屏幕 + 全屏遮罩选区）"
            />
            <ShortcutRow
              target="picker"
              title="屏幕取色"
              desc="点击快捷键后按下新组合，例如 Alt+D（十字线跟随鼠标显示坐标与颜色，C 复制颜色，Shift 切换 RGB/HEX）"
            />
            <ShortcutRow
              target="pins"
              title="显示 / 隐藏全部贴图"
              desc="点击快捷键后按下新组合，例如 Ctrl+Alt+P（一键显示或隐藏所有贴在桌面上的图片）"
            />
          </SettingGroup>
          <SettingGroup>
            <SettingRow title="包含鼠标指针" desc="截屏时是否绘制当前鼠标指针">
              <Switch checked={config.shot.capture_cursor} onChange={(v) => updateShot({ capture_cursor: v })} />
            </SettingRow>
            <SettingRow title="智能识别窗口边缘" desc="鼠标悬停时自动识别窗口边界并吸附选框">
              <Switch checked={config.shot.smart_detect} onChange={(v) => updateShot({ smart_detect: v })} />
            </SettingRow>
            <SettingRow title="元素级识别（界面组件）" desc="智能识别开启时进一步下钻到按钮组、输入框等界面组件（浏览器页面需开启其无障碍支持）">
              <Switch checked={config.shot.smart_element !== false} onChange={(v) => updateShot({ smart_element: v })} />
            </SettingRow>
            <SettingRow title="放大镜" desc="选区时显示像素级放大镜与取色（C 复制颜色 / Shift 切 RGB/HEX）">
              <Switch checked={config.shot.magnifier} onChange={(v) => updateShot({ magnifier: v })} />
            </SettingRow>
            <SettingRow title="记住上次截取区域" desc="呼出截图时若光标下未识别到窗口，预填上一次的选区">
              <Switch checked={config.shot.remember_region} onChange={(v) => updateShot({ remember_region: v })} />
            </SettingRow>
            <SettingRow title="截图历史" desc="输出（复制/另存/贴图）过的截图才计入历史；截图时可按 < > 翻看并重新框选，H 打开列表">
              <Switch checked={config.shot.history_enabled !== false} onChange={(v) => updateShot({ history_enabled: v })} />
            </SettingRow>
            {config.shot.history_enabled !== false && (
              <>
                <SettingRow title="历史保留条数" desc="最多保留的截屏次数（一次呼出按一条计），超出自动清理最旧">
                  <input
                    className="number-input"
                    type="number"
                    min={5}
                    max={100}
                    step={1}
                    value={config.shot.history_max_count ?? 20}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return;
                      const v = Math.round(Number(raw));
                      if (Number.isFinite(v)) updateShot({ history_max_count: v });
                    }}
                    onBlur={(e) => {
                      const v = Math.round(Number(e.target.value));
                      if (Number.isFinite(v)) updateShot({ history_max_count: Math.min(100, Math.max(5, v)) });
                    }}
                  />
                </SettingRow>
                <SettingRow title="历史保留天数" desc="超过该天数的历史截屏自动清理">
                  <input
                    className="number-input"
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    value={config.shot.history_max_days ?? 7}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return;
                      const v = Math.round(Number(raw));
                      if (Number.isFinite(v)) updateShot({ history_max_days: v });
                    }}
                    onBlur={(e) => {
                      const v = Math.round(Number(e.target.value));
                      if (Number.isFinite(v)) updateShot({ history_max_days: Math.min(365, Math.max(1, v)) });
                    }}
                  />
                </SettingRow>
                <ClearHistoryRow />
              </>
            )}
          </SettingGroup>
          <SettingGroup>
            <SettingRow title="保存格式">
              <Segmented
                value={config.shot.save_format}
                options={[
                  { value: "png", label: "PNG" },
                  { value: "jpg", label: "JPEG" },
                ]}
                onChange={(v) => updateShot({ save_format: v })}
              />
            </SettingRow>
            {config.shot.save_format === "jpg" && (
              <SettingRow title="JPEG 质量" desc={`当前 ${config.shot.jpg_quality}%`}>
                <Slider min={10} max={100} value={config.shot.jpg_quality}
                  onChange={(v) => updateShot({ jpg_quality: v })} />
              </SettingRow>
            )}
          </SettingGroup>
        </>
      )}

      {tab === "pin" && (
        <SettingGroup>
          <SettingRow title="默认不透明度" desc={`当前 ${config.pin.opacity}%`}>
            <Slider min={10} max={100} value={config.pin.opacity}
              onChange={(v) => updatePin({ opacity: v })} />
          </SettingRow>
          <SettingRow title="边框阴影" desc="贴图是否显示投影效果">
            <Switch checked={config.pin.border_shadow} onChange={(v) => updatePin({ border_shadow: v })} />
          </SettingRow>
          <SettingRow title="开机恢复贴图" desc="重启后自动恢复上次的贴图布局">
            <Switch checked={config.pin.restore_on_start} onChange={(v) => updatePin({ restore_on_start: v })} />
          </SettingRow>
        </SettingGroup>
      )}

      {tab === "annotate" && (
        <SettingGroup>
          <SettingRow title="默认画笔粗细" desc={`${config.annotate.stroke_width}px`}>
            <Slider min={1} max={10} value={config.annotate.stroke_width}
              onChange={(v) => updateAnno({ stroke_width: v })} />
          </SettingRow>
          <SettingRow title="文字工具字号" desc={`${config.annotate.font_size}px`}>
            <Slider min={10} max={48} value={config.annotate.font_size}
              onChange={(v) => updateAnno({ font_size: v })} />
          </SettingRow>
          <SettingRow title="马赛克块大小" desc={`${config.annotate.mosaic_block}px`}>
            <Slider min={4} max={30} value={config.annotate.mosaic_block}
              onChange={(v) => updateAnno({ mosaic_block: v })} />
          </SettingRow>
        </SettingGroup>
      )}
    </div>
  );
}
