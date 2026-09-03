/** Screenshot & Pin settings page with sub-tabs */
import { useEffect, useRef, useState } from "react";
import { useConfigStore } from "../stores/configStore";
import { ocrModelDownload, ocrModelStatus, shotHistoryClear, OCR_DL_EVENT, type OcrModelInfo, type OcrDlProgress } from "../core/tauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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

/** 文字识别模型档位：切档即时生效；未下载的档位先下载、成功后再启用 */
function OcrModelRows() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const [models, setModels] = useState<OcrModelInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [prog, setProg] = useState<OcrDlProgress | null>(null);
  // 瞬时速率测算：相邻两次进度事件（download 阶段）的字节差 / 时间差
  const lastTick = useRef<{ t: number; done: number } | null>(null);
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    ocrModelStatus().then(setModels).catch(() => setModels([]));
    let un: UnlistenFn | null = null;
    void listen<OcrDlProgress>(OCR_DL_EVENT, (e) => {
      const p = e.payload;
      setProg(p);
      const now = Date.now();
      if (p.phase === "download") {
        const prev = lastTick.current;
        if (prev) {
          const dt = (now - prev.t) / 1000;
          const dd = p.done - prev.done;
          if (dt > 0.1 && dd >= 0) setSpeed(dt > 0 ? Math.max(0, dd / dt) : 0);
        }
        lastTick.current = { t: now, done: p.done };
      } else if (p.phase === "done") {
        lastTick.current = null;
        setSpeed(0);
      }
    }).then((f) => { un = f; }).catch(() => {});
    return () => { if (un) un(); };
  }, []);

  const pick = async (m: OcrModelInfo) => {
    if (m.active || busy) return;
    setErr("");
    if (!m.ready) {
      setBusy(m.id);
      setProg(null);
      lastTick.current = null;
      setSpeed(0);
      try {
        setModels(await ocrModelDownload(m.id));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setBusy(null);
        setProg(null);
        return;
      }
      setBusy(null);
      setProg(null);
      lastTick.current = null;
      setSpeed(0);
    }
    // 等配置写入+广播完成，Rust 侧 set_model 才会生效；
    // 之后再刷一次状态列表，让"使用中"标记即时更新
    await update({ ...config, shot: { ...config.shot, ocr_model: m.id } });
    setModels(await ocrModelStatus());
  };

  if (!models) return null;
  const dl = prog && busy === prog.id ? prog : null;
  const busyModel = models.find((m) => m.id === busy);
  const mb = (b: number) => (b > 0 ? `${(b / 1048576).toFixed(1)} MB` : "…");
  const fileLabel = (f: string) =>
    f.includes("det") ? "检测模型" : f.includes("rec") ? "识别模型" : "字典";
  const pct = dl && dl.total > 0 ? Math.min(100, (dl.done / dl.total) * 100) : null;
  const speedTxt = speed > 0 ? ` · ${(speed / 1048576).toFixed(1)} MB/s` : "";
  return (
    <SettingGroup>
      <SettingRow
        title="文字识别模型"
        desc={err ? `模型下载失败：${err}` : "离线识别，切换后立即生效；档位越高越准，但体积更大、识别更慢"}
      />
      {dl && (
        <SettingRow
          layout="block"
          title={`${busyModel ? busyModel.name : "OCR"} 下载中…`}
          desc={
            dl.phase === "verify"
              ? "正在校验文件完整性，马上就好"
              : dl.total > 0
                ? `${mb(dl.done)} / ${mb(dl.total)}${speedTxt}`
                : `${mb(dl.file_done)}${speedTxt}`
          }
        >
          <div className="ocr-dl">
            <div className="ocr-dl-track">
              <div
                className={`ocr-dl-fill${pct === null ? " indet" : ""}`}
                style={pct !== null ? { width: `${pct}%` } : undefined}
              />
            </div>
            <div className="ocr-dl-meta">
              {dl.phase === "verify"
                ? "SHA256 完整性校验"
                : `正在下载${fileLabel(dl.file)}`}
              {dl.phase === "download" && dl.file_total > 0
                ? ` · ${mb(dl.file_done)} / ${mb(dl.file_total)}`
                : ""}
            </div>
          </div>
        </SettingRow>
      )}
      {models.map((m) => (
        <SettingRow
          key={m.id}
          title={m.active ? `${m.name}（使用中）` : m.name}
          desc={`${m.desc} · 约 ${m.size_mb}MB${m.ready ? "" : " · 未下载"}`}
        >
          <button
            className="btn btn-sm"
            disabled={m.active || busy !== null}
            onClick={() => void pick(m)}
          >
            {m.active ? "使用中" : busy === m.id ? "下载中…" : m.ready ? "启用" : "下载并启用"}
          </button>
        </SettingRow>
      ))}
    </SettingGroup>
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
          <OcrModelRows />
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
