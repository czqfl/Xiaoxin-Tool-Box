/** 便签设置页（集成自 StickyNote，内容与便签原左上角「设置」弹窗保持一致）：
 *  外观与窗口 / 背景 / 关闭动画 / 快捷键 / 大模型（整理格式）/ Markdown 样式 / 存储。 */
import { useEffect, useRef, useState } from "react";
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
  shortcuts: Record<string, string>;
  md_theme: string;
  md_custom_path: string;
  md_custom_filename: string;
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
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
  particle_mode: "particle",
  animation_speed: 100,
  shortcuts: {},
  md_theme: "default",
  md_custom_path: "",
  md_custom_filename: "",
  llm_base_url: "",
  llm_api_key: "",
  llm_model: "",
};

/** 与原版 SHORTCUT_ACTIONS 一致：便签内容快捷键」
 *  （字体色/背景色/字号 + 全局呼出/全部关闭/新建） */
const SHORTCUT_ACTIONS: { key: string; label: string }[] = [
  { key: "fg_color", label: "字体颜色" },
  { key: "bg_color", label: "字体背景色" },
  { key: "size_up", label: "增大字号" },
  { key: "size_down", label: "减小字号" },
  { key: "show_app", label: "呼出便签（全局）" },
  { key: "close_all", label: "全部关闭（全局）" },
  { key: "new_note", label: "新建便签（全局）" },
];

const MD_THEMES: { value: string; label: string }[] = [
  { value: "default", label: "默认（暖色）" },
  { value: "github", label: "GitHub" },
  { value: "rose-pine", label: "玫瑰枯木（暗色）" },
  { value: "solarized", label: "Solarized（浅色）" },
  { value: "monokai", label: "Monokai（暗色）" },
  { value: "ayu-dark", label: "Ayu Dark（暗色）" },
  { value: "solarized-dark", label: "Solarized Dark（暗色）" },
  { value: "github-dark", label: "GitHub Dark（暗色）" },
  { value: "custom", label: "自定义（上传 CSS）" },
];

/** 把一次按键事件解析为快捷键组合字符串（与原版一致） */
function eventToCombo(e: React.KeyboardEvent): string | null {
  const key = e.key;
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  let main = "";
  if (e.code === "Equal") main = "Plus";
  else if (e.code === "Minus") main = "Minus";
  else if (e.code === "Space") main = "Space";
  else if (key.length === 1) main = key.toUpperCase();
  else main = key;
  if (!main) return null;
  parts.push(main);
  return parts.join("+");
}

export function StickyNotePage() {
  const [settings, setSettings] = useState<StickySettings>(DEFAULT);
  const [effDir, setEffDir] = useState("");
  const [loaded, setLoaded] = useState(false);
  /** 背景图预览（data URL）：settings.bg_image 可能是路径（旧数据）或 data URL */
  const [bgPreview, setBgPreview] = useState("");

  // 背景图变化时解析预览（路径 → read_bg_image 转 data URL）
  useEffect(() => {
    const img = settings.bg_image;
    if (!img) {
      setBgPreview("");
      return;
    }
    if (img.startsWith("data:")) {
      setBgPreview(img);
      return;
    }
    let alive = true;
    invoke<string>("read_bg_image", { path: img })
      .then((u) => {
        if (alive) setBgPreview(u);
      })
      .catch(() => {
        if (alive) setBgPreview("");
      });
    return () => {
      alive = false;
    };
  }, [settings.bg_image]);

  const load = async () => {
    const guard = new Promise<StickySettings | null>((resolve) =>
      setTimeout(() => resolve(null), 1200)
    );
    try {
      const s = (await Promise.race([invoke<StickySettings>("load_settings"), guard])) ?? DEFAULT;
      if (s) setSettings({ ...DEFAULT, ...s, shortcuts: s.shortcuts ?? {} });
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

  /** 保存设置（自动保存） */
  const patch = (partial: Partial<StickySettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    void invoke("save_settings", { settings: next }).catch(console.error);
  };

  const uploadBg = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        title: "选择背景图片",
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] }],
      });
      if (typeof selected !== "string") return;
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

  // ---- Markdown 自定义样式上传 ----
  const mdFileRef = useRef<HTMLInputElement>(null);
  const uploadMdCss = async (file: File) => {
    try {
      const text = await file.text();
      const path = await invoke<string>("save_md_custom", { content: text });
      patch({ md_theme: "custom", md_custom_path: path, md_custom_filename: file.name });
    } catch (e) {
      console.error("保存样式文件失败", e);
    }
  };

  // ---- 快捷键录制 ----
  const [recording, setRecording] = useState<string | null>(null);
  const onShortcutKey = (e: React.KeyboardEvent, action: string) => {
    if (recording !== action) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(null);
      return;
    }
    const combo = eventToCombo(e);
    if (!combo) return;
    patch({ shortcuts: { ...(settings.shortcuts ?? {}), [action]: combo } });
    setRecording(null);
  };

  if (!loaded) return <div className="empty-state">加载中…</div>;

  return (
    <div className="settings-page" onKeyDown={(e) => recording && onShortcutKey(e, recording)}>
      <h2>便签设置</h2>
      <p className="page-desc">
        便签（集成自 StickyNote）：多张独立置顶便签，支持背景图、透明毛玻璃、粒子关闭动画、快捷键与 Markdown
      </p>

      {/* ===== 主题与窗口 ===== */}
      <SettingGroup>
        <SettingRow title="便签外观主题" desc="浅色 / 透明 / 深色（与工具箱主题独立）">
          <Segmented<"light" | "transparent" | "dark">
            value={(settings.theme as "light" | "transparent" | "dark") || "light"}
            options={[
              { value: "light", label: "浅色" },
              { value: "transparent", label: "透明" },
              { value: "dark", label: "深色" },
            ]}
            onChange={(v) => patch({ theme: v })}
          />
        </SettingRow>
        <SettingRow title="贴边自动收起" desc="便签靠屏幕边缘时自动收起，鼠标靠近再弹出（QQ 风格）">
          <Switch
            checked={settings.edge_snap !== false}
            onChange={(v) => patch({ edge_snap: v })}
          />
        </SettingRow>
        <SettingRow title="透明不透明度" desc="透明主题下背景不透明度（值越大越不透明，毛玻璃质感）">
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

      {/* ===== 背景与高斯模糊 ===== */}
      <SettingGroup>
        <SettingRow title="背景图片" desc="自定义便签背景（透明主题下不可用）">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn btn-primary btn-sm" onClick={() => void uploadBg()}>
              选择图片
            </button>
            {settings.bg_image && (
              <button className="btn btn-sm" onClick={() => patch({ bg_image: "" })}>
                清除
              </button>
            )}
          </div>
          {/* 当前背景预览 */}
          {settings.bg_image && (
            <div className="sticky-bg-preview">
              {bgPreview ? (
                <img src={bgPreview} alt="便签背景预览" />
              ) : (
                <span>预览加载中…</span>
              )}
            </div>
          )}
        </SettingRow>
        <SettingRow title="背景沉浸" desc="整张便签（含标题栏/工具栏）显示背景，而非仅输入区">
          <Switch
            checked={settings.bg_immersive}
            onChange={(v) => patch({ bg_immersive: v })}
          />
        </SettingRow>
      </SettingGroup>

      {/* ===== 关闭动画 ===== */}
      <SettingGroup>
        <SettingRow title="关闭动画粒子风格" desc="便签关闭/呼出时的动画效果（与原版一致）">
          <Segmented<"particle" | "inhale" | "erode" | "glass">
            value={(settings.particle_mode as "particle" | "inhale" | "erode" | "glass") || "particle"}
            options={[
              { value: "particle", label: "粒子消散" },
              { value: "inhale", label: "粒子吸入" },
              { value: "erode", label: "火焰侵蚀" },
              { value: "glass", label: "玻璃碎裂" },
            ]}
            onChange={(v) => patch({ particle_mode: v })}
          />
        </SettingRow>
        <SettingRow title="粒子数量" desc="0~100（粒子消散/吸入动画的规模；火焰不使用该数值）">
          <Slider
            value={settings.particle_count}
            min={0}
            max={100}
            disabled={settings.particle_mode === "erode"}
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

      {/* ===== 快捷键 ===== */}
      <SettingGroup>
        <SettingRow
          title="快捷键"
          desc="点「录制」后按下组合键实时识别；Esc 取消。字体色/背景色/字号作用于便签内容，全局项需便签支持方生效"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
            {SHORTCUT_ACTIONS.map((a) => (
              <div key={a.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12 }}>{a.label}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <code style={{ fontSize: 12, minWidth: 90, textAlign: "center" }}>
                    {settings.shortcuts?.[a.key] || "未设置"}
                  </code>
                  <button
                    className="btn btn-sm"
                    style={{ minWidth: 56 }}
                    onClick={() => setRecording(recording === a.key ? null : a.key)}
                  >
                    {recording === a.key ? "按组合键…" : "录制"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SettingRow>
      </SettingGroup>

      {/* ===== 大模型（整理格式）===== */}
      <SettingGroup>
        <SettingRow
          title="大模型（整理格式）"
          desc="用于便签里「整理」按钮，把内容整理为干净的 Markdown 或纯文本（兼容 OpenAI 及任意 OpenAI 格式接口：DeepSeek、通义、智谱等）"
        />
        <SettingRow title="Base URL" desc="留空则默认 https://api.openai.com/v1">
          <input
            className="text-input"
            type="text"
            value={settings.llm_base_url}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => patch({ llm_base_url: e.target.value })}
          />
        </SettingRow>
        <SettingRow title="API Key" desc="大模型的密钥（OpenAI 兼容）">
          <input
            className="text-input"
            type="password"
            value={settings.llm_api_key}
            placeholder="sk-..."
            onChange={(e) => patch({ llm_api_key: e.target.value })}
          />
        </SettingRow>
        <SettingRow title="模型名" desc="留空则默认 gpt-4o-mini">
          <input
            className="text-input"
            type="text"
            value={settings.llm_model}
            placeholder="gpt-4o-mini"
            onChange={(e) => patch({ llm_model: e.target.value })}
          />
        </SettingRow>
      </SettingGroup>

      {/* ===== Markdown 样式 ===== */}
      <SettingGroup>
        <SettingRow title="Markdown 主题" desc="设置 Markdown 便签的渲染风格；「自定义」可上传自己的 CSS">
          <select
            className="select-input"
            value={settings.md_theme || "default"}
            onChange={(e) => patch({ md_theme: e.target.value })}
          >
            {MD_THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </SettingRow>
        {settings.md_theme === "custom" && (
          <SettingRow title="自定义" desc={settings.md_custom_filename ? `已加载：${settings.md_custom_filename}` : "上传 .css 文件作为自定义 Markdown 样式"}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={() => mdFileRef.current?.click()}>
                上传/替换
              </button>
              {settings.md_theme === "custom" && (
                <button className="btn btn-sm" onClick={() => patch({ md_custom_path: "", md_custom_filename: "" })}>
                  清除
                </button>
              )}
              <input
                ref={mdFileRef}
                type="file"
                accept=".css,text/css"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadMdCss(f);
                }}
              />
            </div>
          </SettingRow>
        )}
      </SettingGroup>

      {/* ===== 存储路径 ===== */}
      <SettingGroup>
        <SettingRow title="便签存储目录" desc={effDir || "解析中…"}>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={() => void invoke("open_folder", { path: effDir })}>
              打开目录
            </button>
            <button className="btn btn-sm" onClick={() => void invoke("open_history_window")}>
              打开便签管理
            </button>
          </div>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
