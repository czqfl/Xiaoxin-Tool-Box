/** 功能开关页：集中控制各功能的启用/停用。
 *  停用即：全局快捷键注销、工具栏/托盘/设置侧栏入口隐藏、面板呼出守卫拦截。
 *  开关保存走整份配置（config_save 内部会推倒重来重注册快捷键，即时生效）。 */
import { useConfigStore } from "../stores/configStore";
import { Switch } from "./components";
import type { Page } from "./SettingsApp";

/** 全部可开关功能：key 与快捷键 target / 工具栏工具键同名词 */
export const FEATURES: Array<{
  key: string;
  label: string;
  desc: string;
  page: Page;
}> = [
  { key: "clipboard", label: "剪贴板", desc: "复制历史记录，一键回贴", page: "clipboard" },
  { key: "folder", label: "文件夹", desc: "常用文件夹快速访问与直达终端", page: "folder" },
  { key: "credentials", label: "账号密码", desc: "本地加密保存的账号密码速查", page: "credentials" },
  { key: "translation", label: "划词翻译", desc: "选中文字一键翻译", page: "translation" },
  { key: "port", label: "端口工具", desc: "端口占用查询 / 一键结束进程", page: "port" },
  { key: "files", label: "快速文件", desc: "统一位置快速新建/管理常用文件", page: "files" },
  { key: "snippets", label: "常用语速贴", desc: "快捷短语一键粘贴", page: "snippets" },
  { key: "screenshot", label: "截图贴图", desc: "截图 / 标注 / 贴图钉屏 / 屏幕取色", page: "screenshot" },
  { key: "recorder", label: "屏幕录制", desc: "框选区域录制 GIF 动图", page: "recorder" },
  { key: "toolbar", label: "悬浮工具栏", desc: "桌面常驻小工具条", page: "toolbar" },
];

/** 读取某功能的启用状态（未知 key 视为启用） */
export function featureEnabled(config: ReturnType<typeof useConfigStore.getState>["config"], key: string): boolean {
  const map: Record<string, boolean | undefined> = {
    clipboard: config.clipboard?.enabled,
    folder: config.folder?.enabled,
    credentials: config.credentials?.enabled,
    translation: config.translator?.enabled,
    port: config.port?.enabled,
    files: config.files?.enabled,
    snippets: config.snippets?.enabled,
    screenshot: config.shot?.enabled,
    recorder: config.recorder?.enabled,
    toolbar: config.toolbar?.enabled,
  };
  return map[key] ?? true;
}

export function FeaturePage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);

  const toggle = (key: string, on: boolean) => {
    const next = { ...config };
    switch (key) {
      case "clipboard": next.clipboard = { ...config.clipboard, enabled: on }; break;
      case "folder": next.folder = { ...config.folder, enabled: on }; break;
      case "credentials": next.credentials = { ...config.credentials, enabled: on }; break;
      case "translation": next.translator = { ...config.translator, enabled: on }; break;
      case "port": next.port = { ...config.port, enabled: on }; break;
      case "files": next.files = { ...config.files, enabled: on }; break;
      case "snippets": next.snippets = { ...config.snippets, enabled: on }; break;
      case "screenshot": next.shot = { ...config.shot, enabled: on }; break;
      case "recorder": next.recorder = { ...config.recorder, enabled: on }; break;
      case "toolbar": next.toolbar = { ...config.toolbar, enabled: on }; break;
    }
    void update(next);
  };

  return (
    <div className="settings-page">
      <h2>功能开关</h2>
      <p className="page-desc">
        停用的功能立即失效：全局快捷键注销、悬浮工具栏 / 托盘 / 侧栏入口一并隐藏
      </p>

      {/* 卡片式布局：每张卡片 = 功能名 + 开关 + 描述 + 状态徽标 + 直达设置 */}
      <div className="feature-grid">
        {FEATURES.map((f) => {
          const on = featureEnabled(config, f.key);
          return (
            <div key={f.key} className={`feature-card${on ? "" : " disabled"}`}>
              <div className="feature-card-head">
                <span className="feature-card-title">{f.label}</span>
                <Switch checked={on} onChange={(v) => toggle(f.key, v)} />
              </div>
              <div className="feature-card-desc">
                {on ? f.desc : "已停用——快捷键与所有入口均已隐藏"}
              </div>
              <div className="feature-card-foot">
                <span className={`feature-badge${on ? " on" : ""}`}>
                  {on ? "● 运行中" : "○ 已停用"}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => onNavigate(f.page)}
                  title="打开该功能的详细设置"
                >
                  设置
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
