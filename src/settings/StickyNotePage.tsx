/** 便签设置页（集成自 StickyNote）：外观 / 背景 / 关闭动画 / 存储 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SettingGroup, SettingRow, Switch, Segmented, Slider } from "./components";

interface StickySettings {
  theme: string;
  bg_image: string;
  bg_immersive: boolean;
  bg_transparent: boolean;
  bg_glass_opacity: number;
  edge_snap: boolean;
  notes_dir: string;
  glass_enabled: boolean;
  glass_blur: number;
  transparent_opacity: number;
  particle_count: number;
  particle_mode: string;
  animation_speed: number;
}

const DEFAULT: StickySettings = {
  theme: "light",
  bg_image: "",
  bg_immersive: false,
  bg_transparent: false,
  bg_glass_opacity: 0.3,
  edge_snap: true,
  notes_dir: "",
  glass_enabled: true,
  glass_blur: 55,
  transparent_opacity: 65,
  particle_count: 50,
  particle_mode: "flame",
  animation_speed: 100,
};

export function StickyNotePage() {
  const [settings, setSettings] = useState<StickySettings>(DEFAULT);
  const [effDir, setEffDir] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    // 兜底：后端命令异常/无响应时 1.2s 后强制结束"加载中"，展示默认设置，
    // 避免 IPC 挂起导致页面永远空白
    const guard = new Promise<StickySettings | null>((resolve) =>
      setTimeout(() => resolve(null), 1200)
    );
    try {
      const s = (await Promise.race([invoke<StickySettings>("load_settings"), guard])) ?? DEFAULT;
      if (s) setSettings({ ...DEFAULT, ...s });
      try {
        const dir = await invoke<string>("effective_notes_dir");
        setEffDir(dir);
      } catch {
        /* 目录信息不可用不影响页面 */
      }
    } catch {
      /* 后端未就绪时保持默认 */
    }
    setLoaded(true);
  };

  useEffect(() => {
    void load();
  }, []);

  /** 保存设置（自动保存，与工具箱其它设置页一致的"实现→使用→反馈"节奏） */
  const patch = (partial: Partial<StickySettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    void invoke("save_settings", { settings: next }).catch(console.error);
  };

  /** 上传背景图（压缩后写入磁盘，设置只存路径） */
  const uploadBg = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        title: "选择背景图片",
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
      });
      if (typeof selected !== "string") return;
      // 压缩到 1920 宽以内，避免大图塞进 IPC/磁盘
      const file = await fetch(`file://${selected}`)
        .then((r) => r.blob())
        .catch(() => null);
      if (!file) {
        const url = await invoke<string>("read_bg_image", { path: selected });
        patch({ bg_image: url });
        return;
      }
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1920 / bmp.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const path = await invoke<string>("save_bg_image", { dataUrl, key: "global" });
      const url = await invoke<string>("read_bg_image", { path });
      patch({ bg_image: url });
    } catch (err) {
      console.error("上传背景图失败", err);
    }
  };

  const clearBg = () => {
    patch({ bg_image: "" });
  };

  if (!loaded) return <div className="empty-state">加载中…</div>;

  return (
    <div className="settings-page">
      <h2>便签设置</h2>
      <p className="page-desc">
        便签（集成自 StickyNote）：多张独立置顶便签，支持背景图、透明毛玻璃与粒子关闭动画
      </p>

      <SettingGroup>
        <SettingRow title="便签外观主题" desc="浅色 / 深色（与工具箱主题独立）">
          <Segmented<"light" | "dark">
            value={settings.theme as "light" | "dark"}
            options={[
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
            ]}
            onChange={(v) => patch({ theme: v })}
          />
        </SettingRow>
        <SettingRow title="透明背景" desc="便签沉浸式透明，桌面直接透出（开启后背景图片自动清除）">
          <Switch
            checked={settings.bg_transparent}
            onChange={(v) => patch({ bg_transparent: v, bg_image: v ? "" : settings.bg_image })}
          />
        </SettingRow>
        <SettingRow title="透明不透明度" desc="值越大越不透明（毛玻璃质感）">
          <Slider
            value={settings.transparent_opacity}
            min={10}
            max={100}
            onChange={(v) => patch({ transparent_opacity: v })}
          />
        </SettingRow>
        <SettingRow title="毛玻璃效果" desc="内容面板叠加磨砂（透明背景磨砂桌面，背景图磨砂图片）">
          <Switch
            checked={settings.glass_enabled}
            onChange={(v) => patch({ glass_enabled: v })}
          />
        </SettingRow>
        <SettingRow title="毛玻璃强度" desc="背景图模式下控制模糊半径（0=原图，100≈40px 强模糊）">
          <Slider
            value={settings.glass_blur}
            min={0}
            max={100}
            onChange={(v) => patch({ glass_blur: v })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="背景图片"
          desc="自定义便签背景（透明背景开启时不可用）；可打开便签管理窗口从便签内调整"
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-primary btn-sm" onClick={() => void uploadBg()}>
              选择图片
            </button>
            {settings.bg_image && (
              <button className="btn btn-sm" onClick={clearBg}>
                清除
              </button>
            )}
          </div>
        </SettingRow>
        <SettingRow title="背景沉浸" desc="整张便签（含标题栏/工具栏）显示背景，而非仅输入区">
          <Switch
            checked={settings.bg_immersive}
            onChange={(v) => patch({ bg_immersive: v })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow title="关闭动画粒子风格" desc="便签关闭时的粒子消散效果">
          <Segmented<"flame" | "erode">
            value={settings.particle_mode as "flame" | "erode"}
            options={[
              { value: "flame", label: "火焰" },
              { value: "erode", label: "侵蚀" },
            ]}
            onChange={(v) => patch({ particle_mode: v })}
          />
        </SettingRow>
        <SettingRow title="粒子数量" desc="0~100（粒子消散/吸入动画的规模）">
          <Slider
            value={settings.particle_count}
            min={0}
            max={100}
            onChange={(v) => patch({ particle_count: v })}
          />
        </SettingRow>
        <SettingRow title="动画速度" desc="100=原速，50=半速，200=2 倍速">
          <Slider
            value={settings.animation_speed}
            min={30}
            max={200}
            onChange={(v) => patch({ animation_speed: v })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow title="便签存储目录" desc={effDir || "解析中…"}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={() => void invoke("open_folder", { path: effDir })}
            >
              打开目录
            </button>
            <button
              className="btn btn-sm"
              onClick={() => void invoke("open_history_window")}
            >
              打开便签管理
            </button>
          </div>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
