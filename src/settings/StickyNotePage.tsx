/** 便签设置页（完整功能版）：功能与原版便签设置面板一一对应，
 *  界面使用工具箱设置面板的组件风格（SettingGroup/SettingRow/Switch/
 *  Segmented/Slider），与其它设置菜单样式一致。
 *  覆盖：外观主题 / 贴边 / 关闭动画粒子 / 背景图与沉浸 / 毛玻璃 /
 *  快捷键录制 / Markdown 样式 / 大模型整理 / 存储目录。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SettingGroup, SettingRow, Switch, Slider } from "./components";

interface StickySettings {
  theme: string;
  bg_image: string;
  bg_immersive: boolean;
  bg_opacity: number;
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
  bg_opacity: 45,
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

const PARTICLE_MODES: { value: string; label: string }[] = [
  { value: "particle", label: "粒子消散" },
  { value: "inhale", label: "粒子吸入" },
  { value: "none", label: "无动画（直接显示/隐藏）" },
];

/** 便签快捷键项（存储于便签设置 sticky_settings.json 的 shortcuts 字段）：
 *  前 4 项在便签窗口聚焦时生效（编辑区快捷键），后 3 项为全局快捷键 */
const STICKY_ACTIONS: { key: string; label: string; global?: boolean }[] = [
  { key: "fg_color", label: "字体颜色" },
  { key: "bg_color", label: "字体背景色" },
  { key: "size_up", label: "增大字号" },
  { key: "size_down", label: "减小字号" },
  { key: "show_app", label: "呼出 / 收起便签", global: true },
  { key: "open_history", label: "呼出 / 收起历史便签面板", global: true },
  { key: "new_note", label: "新建便签", global: true },
];

/** 便签快捷键录入解析：与工具箱通用录入的差异是【允许纯功能键】（F2/F4 等）
 *  与方向键（Ctrl+ArrowUp 字号）——原版便签默认就是 F2/F4 这类组合 */
function stickyComboFromEvent(e: KeyboardEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  let main = "";
  if (/^[a-zA-Z]$/.test(e.key)) main = e.key.toUpperCase();
  else if (/^[0-9]$/.test(e.key)) main = e.key;
  else if (/^F(\d{1,2})$/.test(e.key)) main = e.key.toUpperCase();
  else if (e.code === "Equal") main = "Plus";
  else if (e.code === "Minus") main = "Minus";
  else if (e.key === " ") main = "Space";
  else if (e.key === "ArrowUp") main = "ArrowUp";
  else if (e.key === "ArrowDown") main = "ArrowDown";
  else return null;
  parts.push(main);
  return parts.join("+");
}

/** 便签快捷键录入框：前端 keydown 捕获（支持纯 F 键），Esc 取消 */
function StickyShortcutInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (combo: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  listeningRef.current = listening;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!listeningRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setListening(false);
      return;
    }
    const combo = stickyComboFromEvent(e.nativeEvent);
    if (combo) {
      onChangeRef.current(combo);
      setListening(false);
    }
  }, []);

  useEffect(() => {
    if (!listening) return;
    const onBlur = () => setListening(false);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [listening]);

  return (
    <button
      type="button"
      className="shortcut-input"
      onClick={() => setListening(true)}
      onKeyDown={onKeyDown}
    >
      {listening ? "按下组合键…（Esc 取消）" : value || "未设置"}
    </button>
  );
}

export function StickyNotePage() {
  const [settings, setSettings] = useState<StickySettings>(DEFAULT);
  /** 已保存的快捷键快照：用于判断「是否有改动」以禁用保存按钮 */
  const [stickySaved, setStickySaved] = useState<Record<string, string>>({});
  const [stickySaving, setStickySaving] = useState<string | null>(null);
  const [effDir, setEffDir] = useState("");
  const [loaded, setLoaded] = useState(false);
  /** 背景图预览（data URL） */
  const [bgPreview, setBgPreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const mdFileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const guard = new Promise<StickySettings | null>((resolve) =>
      setTimeout(() => resolve(null), 1200)
    );
    try {
      const s = (await Promise.race([invoke<StickySettings>("load_settings"), guard])) ?? DEFAULT;
      if (s) {
        // 透明主题已移除（工具箱自带亚克力）：存量 transparent 归入浅色并回写
        if (s.theme === "transparent") {
          s.theme = "light";
          void invoke("save_settings", { settings: s }).catch(() => {});
        }
        // 便签明暗主题统一由工具箱「通用设置 → 主题」派生（本页不再提供选择）：
        // dark → 深色；light/彩色浅色 → 浅色；system → 跟随系统深浅。
        // 便签窗口侧（sticky/settings.ts deriveTheme）用同一规则，两边始终一致。
        try {
          const tb = await invoke<{ general?: { theme?: string } }>("config_load");
          const t = tb?.general?.theme ?? "system";
          const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          s.theme =
            t === "dark" ? "dark"
            : t === "system" ? (sysDark ? "dark" : "light")
            : "light";
        } catch {
          /* 读不到工具箱配置时保留便签存量主题 */
        }
        const sc = s.shortcuts ?? {};
        setSettings({ ...DEFAULT, ...s, shortcuts: sc });
        setStickySaved(sc);
      }
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

  // 背景图预览：data URL 直接用；路径旧数据转 data URL
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

  /** 自动保存 */
  const patch = (partial: Partial<StickySettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    void invoke("save_settings", { settings: next }).catch(console.error);
  };

  // ---- 便签快捷键：编辑只改本地，点「保存」才落盘并重注册系统级热键 ----
  // 全局项（呼出/收起便签、历史面板、新建）保存后必须调 register_shortcuts，
  // 否则组合改了但系统热键还是旧的。注册走便签自己的增量注册（不清工具箱热键）。
  const saveStickyOne = async (key: string) => {
    const combo = settings.shortcuts[key];
    if (!combo || combo === stickySaved[key]) return;
    setStickySaving(key);
    try {
      const next = { ...settings, shortcuts: { ...settings.shortcuts, [key]: combo } };
      setSettings(next);
      await invoke("save_settings", { settings: next });
      await invoke("register_shortcuts");
      setStickySaved((d) => ({ ...d, [key]: combo }));
    } catch (err) {
      console.error("保存便签快捷键失败:", err);
    } finally {
      setStickySaving(null);
    }
  };

  /** 背景图：压缩到 1920 宽后写入磁盘（与原版一致） */
  const uploadBg = async (file: File) => {
    try {
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

  /** 自定义 Markdown CSS 上传 */
  const uploadMdCss = async (file: File) => {
    try {
      const content = await file.text();
      const path = await invoke<string>("save_md_custom", { content });
      patch({ md_theme: "custom", md_custom_path: path, md_custom_filename: file.name });
    } catch (err) {
      console.error("上传 CSS 失败", err);
    }
  };

  const isTransparent = settings.theme === "transparent";

  if (!loaded) return <div className="empty-state">加载中…</div>;

  return (
    <div className="settings-page">
      <h2>便签设置</h2>
      <p className="page-desc">功能与原版便签设置面板一致：外观 / 背景 / 毛玻璃 / 动画 / 快捷键 / Markdown / 大模型 / 存储</p>

      {/* ===== 主题与窗口 ===== */}
      {/* 便签明暗主题已统一由工具箱「通用设置 → 主题」派生，此处不再提供选择 */}
      <SettingGroup>
        <SettingRow title="贴边自动收起 / 弹出" desc="QQ 风格：窗口贴屏幕边缘时自动收起">
          <Switch checked={settings.edge_snap} onChange={(v) => patch({ edge_snap: v })} />
        </SettingRow>
        <SettingRow title="关闭动画效果" desc="便签关闭时的粒子消散风格">
          <select
            className="settings-select"
            value={settings.particle_mode}
            onChange={(e) => patch({ particle_mode: e.target.value })}
          >
            {PARTICLE_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title="粒子强度" desc="0~100（粒子消散/吸入的规模）">
          <Slider
            value={settings.particle_count}
            min={1}
            max={100}
            onChange={(v) => patch({ particle_count: v })}
          />
        </SettingRow>
        <SettingRow title="动画速度" desc="100=原速，200=2 倍速">
          <Slider
            value={settings.animation_speed}
            min={50}
            max={200}
            onChange={(v) => patch({ animation_speed: v })}
          />
        </SettingRow>
      </SettingGroup>

      {/* ===== 背景与毛玻璃 ===== */}
      <SettingGroup>
        <SettingRow title="背景图片" desc="便签全局默认背景；配置后整张便签沉浸透出壁纸（文字自动加投影保证可读）">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => fileRef.current?.click()}
            >
              选择图片
            </button>
            {settings.bg_image && (
              <button className="btn btn-sm" onClick={() => patch({ bg_image: "" })}>
                清除
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadBg(f);
                e.target.value = "";
              }}
            />
          </div>
        </SettingRow>
        {settings.bg_image && (
          <div className="sticky-bg-preview sticky-bg-preview--full">
            {bgPreview ? <img src={bgPreview} alt="便签背景预览" /> : <span>预览加载中…</span>}
          </div>
        )}
        <SettingRow title="高斯模糊效果" desc="背景图模式下内容面板叠加磨砂">
          <Switch checked={settings.glass_enabled} onChange={(v) => patch({ glass_enabled: v })} />
        </SettingRow>
        <SettingRow title="高斯模糊强度" desc="0=原图，100≈40px 强模糊">
          <Slider
            value={settings.glass_blur}
            min={0}
            max={100}
            onChange={(v) => patch({ glass_blur: v })}
          />
        </SettingRow>
        {isTransparent && (
          <SettingRow title="背景不透明度" desc="透明主题下原生亚克力着色层深浅">
            <Slider
              value={settings.transparent_opacity}
              min={0}
              max={100}
              onChange={(v) => patch({ transparent_opacity: v })}
            />
          </SettingRow>
        )}
      </SettingGroup>

      {/* ===== 快捷键 ===== */}
      <div className="setting-group-title">快捷键</div>
      <SettingGroup>
        {STICKY_ACTIONS.map((a) => (
          <SettingRow
            key={a.key}
            title={a.label}
            desc={a.global ? "全局快捷键：任意应用中生效" : "便签窗口聚焦时生效（编辑区快捷键）"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StickyShortcutInput
                value={settings.shortcuts[a.key] ?? ""}
                onChange={(combo) =>
                  setSettings((d) => ({ ...d, shortcuts: { ...d.shortcuts, [a.key]: combo } }))
                }
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={
                  stickySaving !== null ||
                  !settings.shortcuts[a.key] ||
                  settings.shortcuts[a.key] === stickySaved[a.key]
                }
                onClick={() => void saveStickyOne(a.key)}
              >
                {stickySaving === a.key ? "保存中…" : "保存"}
              </button>
            </div>
          </SettingRow>
        ))}
      </SettingGroup>
      <div className="shortcut-hint">
        便签快捷键支持纯功能键（如 F2 / F4）与 Ctrl/Alt/Shift 组合；
        建议「呼出/收起便签」「呼出/收起历史面板」用功能键，编辑区快捷键用组合键避免误触。
      </div>

      {/* ===== Markdown ===== */}
      <SettingGroup>
        <SettingRow title="Markdown 主题" desc="Markdown 便签的渲染风格；选「自定义」可上传自己的 CSS">
          <select
            className="settings-select"
            value={settings.md_theme}
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
          <SettingRow title="自定义样式" desc={settings.md_custom_filename || "上传 CSS 文件"}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btn-sm" onClick={() => mdFileRef.current?.click()}>
                上传 / 替换
              </button>
              <input
                ref={mdFileRef}
                type="file"
                accept=".css,text/css"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadMdCss(f);
                  e.target.value = "";
                }}
              />
            </div>
          </SettingRow>
        )}
      </SettingGroup>

      {/* ===== 大模型 ===== */}
      <SettingGroup>
        <SettingRow title="大模型（整理格式）" desc="用于便签的「MD / 文本」整理按钮，兼容 OpenAI 及任意 OpenAI 格式接口（DeepSeek、通义、智谱等）">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 320 }}>
            <input
              className="settings-input"
              placeholder="Base URL，如 https://api.openai.com/v1"
              value={settings.llm_base_url}
              onChange={(e) => patch({ llm_base_url: e.target.value })}
            />
            <input
              className="settings-input"
              type="password"
              placeholder="API Key（sk-...）"
              value={settings.llm_api_key}
              onChange={(e) => patch({ llm_api_key: e.target.value })}
            />
            <input
              className="settings-input"
              placeholder="模型名，如 gpt-4o-mini"
              value={settings.llm_model}
              onChange={(e) => patch({ llm_model: e.target.value })}
            />
          </div>
        </SettingRow>
      </SettingGroup>

      {/* ===== 存储 ===== */}
      <SettingGroup>
        <SettingRow title="便签存储目录" desc={effDir || "解析中…"}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={async () => {
                try {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const sel = await open({ directory: true, multiple: false, title: "选择便签存储目录" });
                  if (typeof sel === "string") {
                    patch({ notes_dir: sel });
                    setEffDir(sel);
                  }
                } catch {
                  /* 取消 */
                }
              }}
            >
              浏览
            </button>
            <button className="btn btn-sm" onClick={() => void invoke("open_folder", { path: effDir })}>
              打开
            </button>
            <button className="btn btn-sm" onClick={() => patch({ notes_dir: "" })}>
              恢复默认
            </button>
          </div>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
