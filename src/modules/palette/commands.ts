/** 全局命令面板：命令注册表。
 *  三类条目统一为 PaletteItem：
 *  - 动作命令（打开面板 / 截图 / 录制 / 换主题…）：静态构建，随功能开关过滤
 *  - 数据搜索（剪贴板历史 / 凭证 / 语速贴 / 文件夹 / 快速文件）：按关键词异步查询
 *  所有 perform 自行负责收起面板窗口（换主题类动作除外，保持面板可连续试主题）。 */
import type { ComponentType } from "react";
import { useConfigStore } from "../../stores/configStore";
import {
  listClipboard,
  listCredentials,
  listFolders,
  openFolder,
  panelToggle,
  pasteEntry,
  pinHideAll,
  pinShowAll,
  quickfilesList,
  quickfilesOpen,
  copyText,
  shotBeginPicker,
  setToolbarVisible,
} from "../../core/tauri";
import { snippetsList, snippetsPaste } from "../snippets/api";
import { hideCurrentWindow } from "../../core/usePanel";
import { relativeTime } from "../../core/format";
import {
  IconClipboard,
  IconCode,
  IconCopy,
  IconFiles,
  IconFolder,
  IconGrid,
  IconImage,
  IconKey,
  IconLink,
  IconLock,
  IconPalette,
  IconPin,
  IconPort,
  IconRecord,
  IconRichText,
  IconScreenshot,
  IconSettings,
  IconSnippet,
  IconText,
  IconTranslate,
} from "../../components/icons";
import type { AppConfig, ClipEntry, ThemeMode } from "../../types";

type IconCmp = ComponentType<{ size?: number }>;

export interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  /** 分组名（行尾小标签） */
  group: string;
  /** 额外搜索关键词（别名/英文），匹配时拼进 haystack */
  keywords?: string;
  icon: IconCmp;
  perform: () => void | Promise<void>;
}

/** 大小写不敏感的包含匹配 */
function hit(q: string, ...fields: Array<string | null | undefined>): boolean {
  return fields.some((f) => !!f && f.toLowerCase().includes(q));
}

/** 收起面板（粘贴/跳转类动作执行前调用，把焦点还给用户原窗口） */
const hide = () => hideCurrentWindow();

/** 切换主题：走配置更新（持久化 + config://changed 广播，所有窗口即时换肤） */
function setTheme(mode: ThemeMode) {
  const { config, update } = useConfigStore.getState();
  void update({ ...config, general: { ...config.general, theme: mode } });
}

const THEME_LABELS: Record<ThemeMode, { label: string; keywords: string }> = {
  system: { label: "跟随系统", keywords: "theme system auto zt" },
  light: { label: "浅色", keywords: "theme light white" },
  dark: { label: "深色", keywords: "theme dark black heian" },
  mint: { label: "浅青 mint", keywords: "theme mint qing" },
  skyblue: { label: "浅蓝 skyblue", keywords: "theme skyblue blue lan" },
  red: { label: "红色 red", keywords: "theme red hong" },
  orange: { label: "橙色 orange", keywords: "theme orange cheng" },
};

/** 静态动作命令（不含数据搜索结果） */
export function buildStaticCommands(config: AppConfig): PaletteItem[] {
  const items: PaletteItem[] = [];

  const panel = (
    id: string,
    short: string,
    title: string,
    keywords: string,
    icon: IconCmp,
    enabled: boolean
  ) => {
    if (!enabled) return;
    items.push({
      id,
      title,
      group: "面板",
      keywords,
      icon,
      perform: () => {
        hide();
        void panelToggle(short);
      },
    });
  };

  panel("panel-clipboard", "clipboard", "打开剪贴板面板", "clipboard jiantieban 剪贴 历史", IconClipboard, config.clipboard.enabled);
  panel("panel-folder", "folder", "打开文件夹面板", "folder wenjianjia 目录", IconFolder, config.folder.enabled);
  panel("panel-credentials", "credentials", "打开账号密码面板", "credentials mima password 密码 凭证", IconLock, config.credentials.enabled);
  panel("panel-translation", "translation", "划词翻译", "translate fanyi 翻译", IconTranslate, config.translator.enabled);
  panel("panel-port", "port", "打开端口工具面板", "port duankou 端口 杀进程", IconPort, config.port.enabled);
  panel("panel-files", "files", "打开快速文件面板", "quickfiles kuaijie 文件", IconFiles, config.files.enabled);
  panel("panel-snippets", "snippets", "打开语速贴面板", "snippets changyonghua 常用语 速贴", IconSnippet, config.snippets.enabled);

  if (config.shot.enabled) {
    items.push({
      id: "action-screenshot",
      title: "开始截图",
      group: "动作",
      keywords: "screenshot jietu 截图 capture",
      icon: IconScreenshot,
      perform: () => {
        // 先收起再截图：避免命令面板出现在截屏画面里
        hide();
        void panelToggle("screenshot");
      },
    });
    items.push({
      id: "action-picker",
      title: "屏幕取色",
      group: "动作",
      keywords: "picker color quse 取色 颜色",
      icon: IconKey,
      perform: () => {
        hide();
        void shotBeginPicker();
      },
    });
    items.push({
      id: "pins-show",
      title: "显示全部贴图",
      group: "动作",
      keywords: "pin tetu 贴图 show 显示",
      icon: IconImage,
      perform: () => {
        hide();
        void pinShowAll();
      },
    });
    items.push({
      id: "pins-hide",
      title: "隐藏全部贴图",
      group: "动作",
      keywords: "pin tetu 贴图 hide yincang 隐藏 关闭",
      icon: IconPin,
      perform: () => {
        hide();
        void pinHideAll();
      },
    });
  }

  if (config.recorder.enabled) {
    items.push({
      id: "action-recorder",
      title: "录制屏幕 GIF",
      group: "动作",
      keywords: "record lu屏 录屏 录制 gif recorder",
      icon: IconRecord,
      perform: () => {
        hide();
        void panelToggle("recorder");
      },
    });
  }

  items.push({
    id: "open-settings",
    title: "打开设置",
    group: "动作",
    keywords: "settings shezhi 设置 options",
    icon: IconSettings,
    perform: () => {
      hide();
      void panelToggle("settings");
    },
  });

  const toolbarOn = config.toolbar.enabled !== false;
  items.push({
    id: "toggle-toolbar",
    title: toolbarOn ? "隐藏悬浮工具栏" : "显示悬浮工具栏",
    group: "动作",
    keywords: "toolbar gongjulan 工具栏",
    icon: IconGrid,
    perform: () => {
      const next = !toolbarOn;
      const { config: cur, update } = useConfigStore.getState();
      void update({ ...cur, toolbar: { ...cur.toolbar, enabled: next } });
      void setToolbarVisible(next);
      hide();
    },
  });

  for (const mode of Object.keys(THEME_LABELS) as ThemeMode[]) {
    const { label, keywords } = THEME_LABELS[mode];
    items.push({
      id: `theme-${mode}`,
      title: `切换主题：${label}`,
      group: "外观",
      keywords,
      icon: IconPalette,
      perform: () => setTheme(mode), // 保持面板打开，方便连续试主题
    });
  }

  return items;
}

/** 条目是否命中搜索词（静态过滤用） */
export function itemMatches(q: string, item: PaletteItem): boolean {
  return hit(q, item.title, item.subtitle, item.keywords, item.group);
}

/** 剪贴板条目类型显示名 */
const KIND_LABEL: Record<ClipEntry["kind"], string> = {
  text: "文本",
  richtext: "富文本",
  link: "链接",
  image: "图片",
  files: "文件",
};

function clipIcon(kind: ClipEntry["kind"]): IconCmp {
  switch (kind) {
    case "image": return IconImage;
    case "link": return IconLink;
    case "files": return IconFiles;
    case "richtext": return IconRichText;
    default: return IconText;
  }
}

/** 按关键词搜索各模块数据，合并为可执行条目列表 */
export async function searchItems(query: string, config: AppConfig): Promise<PaletteItem[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tasks: Array<Promise<PaletteItem[]>> = [];

  if (config.clipboard.enabled) {
    tasks.push(
      listClipboard()
        .then((entries) =>
          entries
            .filter((e) => !e.consumed && hit(q, e.preview, e.text, KIND_LABEL[e.kind]))
            .slice(0, 8)
            .map<PaletteItem>((e) => ({
              id: `clip-${e.id}`,
              title: (e.preview || e.text || "（图片）").split("\n")[0].slice(0, 90),
              subtitle: `剪贴板 · ${KIND_LABEL[e.kind]} · ${relativeTime(e.created_at)}`,
              group: "剪贴板",
              keywords: "clipboard",
              icon: clipIcon(e.kind),
              perform: () => {
                hide();
                return pasteEntry(e.id);
              },
            }))
        )
        .catch(() => [])
    );
  }

  if (config.credentials.enabled) {
    tasks.push(
      listCredentials()
        .then((creds) =>
          creds
            .filter((c) => hit(q, c.label, c.account, c.note))
            .slice(0, 6)
            .flatMap<PaletteItem>((c) => [
              {
                id: `cred-acct-${c.id}`,
                title: `${c.label} · 复制账号`,
                subtitle: c.account,
                group: "账号密码",
                keywords: "credential account zhanghao",
                icon: IconCopy,
                perform: () => {
                  hide();
                  return copyText(c.account);
                },
              },
              {
                id: `cred-pwd-${c.id}`,
                title: `${c.label} · 复制密码`,
                subtitle: "密码已复制到剪贴板",
                group: "账号密码",
                keywords: "credential password mima",
                icon: IconKey,
                perform: () => {
                  hide();
                  return copyText(c.password);
                },
              },
            ])
        )
        .catch(() => [])
    );
  }

  if (config.snippets.enabled) {
    tasks.push(
      snippetsList()
        .then((list) =>
          list
            .filter((s) => hit(q, s.title, s.content, s.group))
            .slice(0, 8)
            .map<PaletteItem>((s) => ({
              id: `snippet-${s.id}`,
              title: s.title,
              subtitle: (s.content || "（空内容）").split("\n")[0].slice(0, 90),
              group: "语速贴",
              keywords: "snippet paste zhantie",
              icon: IconSnippet,
              perform: () => {
                hide();
                return snippetsPaste(s.id);
              },
            }))
        )
        .catch(() => [])
    );
  }

  if (config.folder.enabled) {
    tasks.push(
      listFolders()
        .then((folders) =>
          folders
            .filter((f) => hit(q, f.name, f.path))
            .slice(0, 8)
            .map<PaletteItem>((f) => ({
              id: `folder-${f.id}`,
              title: f.name,
              subtitle: f.path,
              group: "文件夹",
              keywords: "folder open dakai",
              icon: IconFolder,
              perform: () => {
                hide();
                return openFolder(f.path);
              },
            }))
        )
        .catch(() => [])
    );
  }

  if (config.files.enabled) {
    tasks.push(
      quickfilesList(config.files.location ?? "", config.files.file_types.map((t) => t.ext))
        .then((res) =>
          res.files
            .filter((f) => hit(q, f.name))
            .slice(0, 8)
            .map<PaletteItem>((f) => ({
              id: `qfile-${f.path}`,
              title: f.name,
              subtitle: res.location,
              group: "快速文件",
              keywords: "quickfile open",
              icon: ["ts", "tsx", "js", "jsx", "json", "py", "rs", "go", "java", "css", "html", "yaml", "yml"].includes(f.ext) ? IconCode : IconText,
              perform: () => {
                hide();
                return quickfilesOpen(f.path);
              },
            }))
        )
        .catch(() => [])
    );
  }

  const results = await Promise.all(tasks);
  return results.flat();
}
