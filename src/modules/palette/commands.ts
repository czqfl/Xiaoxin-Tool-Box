/** 全局命令面板：条目注册表与检索装配。
 *  四类来源统一为 PaletteItem：
 *  - 内联工具（算式/换算/编解码/翻译/打开位置）：输入即产出，恒定置顶
 *  - 动作命令（打开面板 / 截图 / 录制 / 换主题…）：静态构建，随功能开关过滤，带真实热键徽标
 *  - 数据条目（剪贴板 / 凭证 / 语速贴 / 文件夹 / 快速文件）：从 sources.ts 内存缓存过滤，零 IPC
 *  - 本机应用：后台扫一次，就绪后并入
 *  排序 = 组优先级 → 匹配分数 → 用量加权；空态由「最近使用 / 常用」驱动。
 *  所有 perform 自行负责收起面板窗口（换主题类动作除外，保持面板可连续试主题）。 */
import { useConfigStore } from "../../stores/configStore";
import {
  copyText,
  launchApp,
  openFolder,
  panelToggle,
  pasteEntry,
  pinHideAll,
  pinShowAll,
  quickfilesOpen,
  setToolbarVisible,
  shotBeginPicker,
} from "../../core/tauri";
import { snippetsPaste } from "../snippets/api";
import { hideCurrentWindow } from "../../core/usePanel";
import { relativeTime } from "../../core/format";
import { compareScored, scoreItem, statKey, usageBonus } from "./match";
import {
  allStats,
  peekApps,
  refreshStats,
  sourcesForSearch,
  statOf,
  statsReady,
  type SourceData,
} from "./sources";
import { buildToolItems, buildWebItems, type TranslationState } from "./tools";
import { KIND_LABEL, type PaletteItem } from "./types";
import type { AppConfig, ClipEntry, EntryKind, InstalledApp, ThemeMode } from "../../types";
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

export type { PaletteItem } from "./types";

type IconCmp = PaletteItem["icon"];

/** 收起面板（粘贴/跳转类动作执行前调用，把焦点还给用户原窗口） */
const hide = () => hideCurrentWindow();

/** 每个区段最多渲染条数 / 整屏最多渲染条数 */
const PER_GROUP = 8;
const TOTAL = 60;

/** 只为"打分"临时拼一个可搜索替身条目（不产生动作、不进结果列表） */
function probe(
  title: string,
  extra: Partial<PaletteItem> & { icon?: IconCmp } = {}
): PaletteItem {
  return {
    id: "",
    kind: "command",
    title,
    group: "",
    icon: IconText,
    perform: () => undefined,
    ...extra,
  };
}

/** 切换主题：走配置更新（持久化 + config://changed 广播，所有窗口即时换肤） */
function setTheme(mode: ThemeMode) {
  const { config, update } = useConfigStore.getState();
  void update({ ...config, general: { ...config.general, theme: mode } });
}

const THEME_LABELS: Record<ThemeMode, { label: string; keywords: string; initials: string }> = {
  system: { label: "跟随系统", keywords: "theme system auto", initials: "xt gxx" },
  light: { label: "浅色", keywords: "theme light white", initials: "qs" },
  dark: { label: "深色", keywords: "theme dark black", initials: "ss" },
  mint: { label: "浅青 mint", keywords: "theme mint", initials: "qq" },
  skyblue: { label: "浅蓝 skyblue", keywords: "theme skyblue blue", initials: "ql" },
  red: { label: "红色 red", keywords: "theme red", initials: "hs" },
  orange: { label: "橙色 orange", keywords: "theme orange", initials: "cz" },
};

/** 静态动作命令（不含数据条目与内联工具） */
export function buildStaticCommands(config: AppConfig): PaletteItem[] {
  const items: PaletteItem[] = [];
  const sc = config.shortcuts;

  const panel = (
    id: string,
    short: string,
    title: string,
    keywords: string,
    initials: string,
    icon: IconCmp,
    enabled: boolean,
    hotkey?: string
  ) => {
    if (!enabled) return;
    items.push({
      id,
      kind: "command",
      title,
      group: KIND_LABEL.command,
      tag: "面板",
      keywords,
      initials,
      hotkey,
      icon,
      perform: () => {
        hide();
        void panelToggle(short);
      },
    });
  };

  panel("panel-clipboard", "clipboard", "打开剪贴板面板", "clipboard 剪贴 历史", "jtb jiantieban", IconClipboard, config.clipboard.enabled, sc.clipboard);
  panel("panel-folder", "folder", "打开文件夹面板", "folder 目录", "wj wjj", IconFolder, config.folder.enabled, sc.folder);
  panel("panel-credentials", "credentials", "打开账号密码面板", "credentials password 密码 凭证", "zhmm mm", IconLock, config.credentials.enabled, sc.credentials);
  panel("panel-translation", "translation", "划词翻译", "translate 翻译", "hcfy fy", IconTranslate, config.translator.enabled, sc.translation);
  panel("panel-port", "port", "打开端口工具面板", "port 端口 杀进程", "dkgj dk", IconPort, config.port.enabled, sc.port);
  panel("panel-files", "files", "打开快速文件面板", "quickfiles 文件", "kfwj", IconFiles, config.files.enabled, sc.files);
  panel("panel-snippets", "snippets", "打开语速贴面板", "snippets 常用语 速贴", "yst", IconSnippet, config.snippets.enabled, sc.snippets);

  const action = (
    id: string,
    title: string,
    keywords: string,
    initials: string,
    icon: IconCmp,
    perform: () => void,
    hotkey?: string
  ) => {
    items.push({
      id,
      kind: "command",
      title,
      group: KIND_LABEL.command,
      tag: "动作",
      keywords,
      initials,
      hotkey,
      icon,
      perform,
    });
  };

  if (config.shot.enabled) {
    // 先收起再动作：避免命令面板自己出现在截屏画面里
    action("action-screenshot", "开始截图", "screenshot capture 截图", "jt ksjt", IconScreenshot, () => {
      hide();
      void panelToggle("screenshot");
    }, sc.screenshot);
    action("action-picker", "屏幕取色", "picker color 取色 颜色", "qs pmqs", IconKey, () => {
      hide();
      void shotBeginPicker();
    }, sc.picker);
    action("pins-show", "显示全部贴图", "pin show 贴图 显示", "xsqbt", IconImage, () => {
      hide();
      void pinShowAll();
    });
    action("pins-hide", "隐藏全部贴图", "pin hide 贴图 隐藏 关闭", "ycqbt", IconPin, () => {
      hide();
      void pinHideAll();
    }, sc.pins_close);
  }

  if (config.recorder.enabled) {
    action("action-recorder", "录制屏幕 GIF", "record gif 录屏 录制", "lzpm lp", IconRecord, () => {
      hide();
      void panelToggle("recorder");
    }, sc.recorder);
  }

  action("open-settings", "打开设置", "settings options 设置", "sz dksz", IconSettings, () => {
    hide();
    void panelToggle("settings");
  });

  const toolbarOn = config.toolbar.enabled !== false;
  action(
    "toggle-toolbar",
    toolbarOn ? "隐藏悬浮工具栏" : "显示悬浮工具栏",
    "toolbar 工具栏",
    "gjl xs",
    IconGrid,
    () => {
      const next = !toolbarOn;
      const { config: cur, update } = useConfigStore.getState();
      void update({ ...cur, toolbar: { ...cur.toolbar, enabled: next } });
      void setToolbarVisible(next);
      hide();
    }
  );

  for (const mode of Object.keys(THEME_LABELS) as ThemeMode[]) {
    const { label, keywords, initials } = THEME_LABELS[mode];
    items.push({
      id: `theme-${mode}`,
      kind: "command",
      title: `切换主题：${label}`,
      group: KIND_LABEL.command,
      tag: "外观",
      keywords,
      initials,
      icon: IconPalette,
      perform: () => setTheme(mode), // 保持面板打开，方便连续试主题
    });
  }

  return items;
}

/* ---------------- 数据条目 ---------------- */

const CLIP_KIND_LABEL: Record<EntryKind, string> = {
  text: "文本",
  richtext: "富文本",
  link: "链接",
  image: "图片",
  files: "文件",
};

function clipIcon(kind: EntryKind): IconCmp {
  switch (kind) {
    case "image": return IconImage;
    case "link": return IconLink;
    case "files": return IconFiles;
    case "richtext": return IconRichText;
    default: return IconText;
  }
}

const CODE_EXTS = ["ts", "tsx", "js", "jsx", "json", "py", "rs", "go", "java", "css", "html", "yaml", "yml"];

function clipTitle(e: ClipEntry): string {
  return (e.preview || e.text || "（图片）").split("\n")[0].slice(0, 90);
}

/** 全量数据条目（q 为空 = 不过滤，供「最近使用」回放查表） */
function dataItems(q: string, config: AppConfig, src: SourceData): PaletteItem[] {
  const keep = (p: PaletteItem) => !q || scoreItem(q, p) > 0;
  const out: PaletteItem[] = [];

  if (config.clipboard.enabled) {
    for (const e of src.clips) {
      if (e.consumed) continue;
      const item: PaletteItem = {
        id: e.id,
        kind: "clip",
        title: clipTitle(e),
        subtitle: `${CLIP_KIND_LABEL[e.kind]} · ${relativeTime(e.created_at)}`,
        group: KIND_LABEL.clip,
        keywords: `clipboard ${CLIP_KIND_LABEL[e.kind]} ${e.source_app ?? ""}`,
        icon: clipIcon(e.kind),
        // 仅文本/链接支持 Ctrl+Enter 单独复制（图片/文件由 Enter 写回剪贴板）
        copy: e.kind === "text" || e.kind === "link" ? (e.text ?? "") : undefined,
        perform: () => {
          hide();
          return pasteEntry(e.id);
        },
      };
      if (keep(probe(item.title, { subtitle: e.text ?? "", keywords: item.keywords }))) out.push(item);
    }
  }

  if (config.credentials.enabled) {
    for (const c of src.creds) {
      if (keep(probe(c.label, { subtitle: `${c.account} ${c.note ?? ""}`, keywords: "credential account 账号" }))) {
        out.push({
          id: `acct-${c.id}`,
          kind: "credential",
          title: `${c.label} · 账号`,
          subtitle: c.account,
          group: KIND_LABEL.credential,
          keywords: "credential account 账号",
          icon: IconCopy,
          copy: c.account,
          perform: () => {
            hide();
            return copyText(c.account);
          },
        });
      }
      if (keep(probe(c.label, { keywords: "credential password 密码" }))) {
        out.push({
          id: `pwd-${c.id}`,
          kind: "credential",
          title: `${c.label} · 密码`,
          subtitle: "复制到剪贴板，不注入粘贴",
          group: KIND_LABEL.credential,
          keywords: "credential password 密码",
          icon: IconKey,
          perform: () => {
            hide();
            return copyText(c.password);
          },
        });
      }
    }
  }

  if (config.snippets.enabled) {
    for (const s of src.snippets) {
      const keywords = `snippet 常用语 ${s.group}`;
      if (!keep(probe(s.title, { subtitle: s.content, keywords }))) continue;
      out.push({
        id: s.id,
        kind: "snippet",
        title: s.title,
        subtitle: (s.content || "（空内容）").split("\n")[0].slice(0, 90),
        group: KIND_LABEL.snippet,
        tag: s.group || undefined,
        keywords,
        icon: IconSnippet,
        copy: s.content,
        perform: () => {
          hide();
          return snippetsPaste(s.id);
        },
      });
    }
  }

  if (config.folder.enabled) {
    for (const f of src.folders) {
      if (!keep(probe(f.name, { subtitle: f.path, keywords: "folder 目录 打开" }))) continue;
      out.push({
        id: f.id,
        kind: "folder",
        title: f.name,
        subtitle: f.path,
        group: KIND_LABEL.folder,
        keywords: "folder 目录 打开",
        icon: IconFolder,
        copy: f.path,
        perform: () => {
          hide();
          return openFolder(f.path);
        },
      });
    }
  }

  if (config.files.enabled) {
    for (const f of src.files) {
      if (!keep(probe(f.name, { subtitle: f.path, keywords: `quickfile ${f.ext}` }))) continue;
      out.push(qfileItem(f.path, f.name, src.filesLocation));
    }
  }

  return out;
}

/** 由路径合成"快速文件"条目（回放最近使用时，文件可能已不在当前列表） */
function qfileItem(path: string, name: string, location: string): PaletteItem {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return {
    id: path,
    kind: "qfile",
    title: name,
    subtitle: location || path,
    group: KIND_LABEL.qfile,
    keywords: `quickfile ${ext}`,
    icon: CODE_EXTS.includes(ext) ? IconCode : IconText,
    copy: path,
    perform: () => {
      hide();
      return quickfilesOpen(path);
    },
  };
}

function appItem(app: InstalledApp): PaletteItem {
  return {
    id: app.exe,
    kind: "app",
    title: app.name,
    subtitle: app.exe,
    group: KIND_LABEL.app,
    tag: app.kind === "editor" ? "编辑器" : app.kind === "browser" ? "浏览器" : undefined,
    keywords: "app 应用 启动 软件",
    icon: IconGrid,
    imageUrl: app.icon ?? undefined,
    copy: app.exe,
    perform: () => {
      hide();
      return launchApp(app.exe);
    },
  };
}

/* ---------------- 检索装配 ---------------- */

export interface QueryContext {
  config: AppConfig;
  translation: TranslationState | null;
}

/** 一次检索的完整结果：内联工具置顶 → 其余按分数/用量排序 → 尾部兜底网页搜索 */
export async function queryItems(rawQuery: string, ctx: QueryContext): Promise<PaletteItem[]> {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const { config, translation } = ctx;
  const tools = buildToolItems(rawQuery, { config, translation });
  const src = await sourcesForSearch();

  const pool = [
    ...buildStaticCommands(config),
    ...dataItems(q, config, src),
    ...(peekApps()?.map(appItem) ?? []),
  ];
  const scored = pool
    .map((item) => ({
      item,
      score: scoreItem(q, item),
      usage: usageBonus(statOf(statKey(item))),
    }))
    .filter((s) => s.score > 0)
    .sort(compareScored);

  const tail = tools.matched ? [] : buildWebItems(rawQuery);
  // 翻译行是兜底：本地已有高置信命中（标题前缀/子串级别）时不再插一行译文
  const strongHit = (scored[0]?.score ?? 0) >= 70;
  const toolItems = strongHit
    ? tools.items.filter((i) => !i.id.startsWith("tool-transl"))
    : tools.items;
  return [...cap(toolItems), ...cap(scored.map((s) => s.item)), ...tail];
}

/** 每个区段限 PER_GROUP 条、整屏限 TOTAL 条（保持已排好的顺序） */
function cap(items: PaletteItem[]): PaletteItem[] {
  const perGroup = new Map<string, number>();
  const out: PaletteItem[] = [];
  for (const i of items) {
    const used = perGroup.get(i.group) ?? 0;
    if (used >= PER_GROUP) continue;
    perGroup.set(i.group, used + 1);
    out.push(i);
    if (out.length >= TOTAL) break;
  }
  return out;
}

/** 空态：最近使用 + 常用（均来自用量统计）；首次运行无统计时退回全部静态命令 */
export async function emptyStateItems(config: AppConfig): Promise<PaletteItem[]> {
  if (!statsReady()) await refreshStats();
  const stats = allStats();
  const statics = buildStaticCommands(config);
  if (!stats.size) return statics;

  const [src, apps] = await Promise.all([sourcesForSearch(), Promise.resolve(peekApps())]);
  const pool = new Map<string, PaletteItem>();
  const put = (i: PaletteItem) => pool.set(statKey(i), i);
  for (const i of statics) put(i);
  for (const i of dataItems("", config, src)) put(i);
  for (const a of apps ?? []) put(appItem(a));

  const resolve = (key: string): PaletteItem | null => {
    const found = pool.get(key);
    if (found) return found;
    // 文件可能被移出列表，但仍可直接按路径打开
    if (key.startsWith("qfile:")) {
      const path = key.slice("qfile:".length);
      return qfileItem(path, path.split(/[\\/]/).pop() ?? path, src.filesLocation);
    }
    return null;
  };

  const out: PaletteItem[] = [];
  const taken = new Set<string>();
  const take = (keys: Iterable<string>, group: string) => {
    for (const key of keys) {
      if (out.filter((i) => i.group === group).length >= PER_GROUP) break;
      if (taken.has(key)) continue;
      const item = resolve(key);
      if (!item) continue;
      taken.add(key);
      out.push({ ...item, group });
    }
  };

  const byRecency = [...stats.values()]
    .sort((a, b) => b.last_used - a.last_used)
    .map((s) => s.key);
  const byFrequency = [...stats.values()]
    .sort((a, b) => b.count - a.count || b.last_used - a.last_used)
    .map((s) => s.key);
  take(byRecency, "最近使用");
  take(byFrequency, "常用");
  // 记录很少时面板不该几乎空掉：继续追加没出现过的静态命令，保留可浏览性
  for (const i of statics) {
    if (out.length >= TOTAL) break;
    if (taken.has(statKey(i))) continue;
    out.push(i);
  }
  return out;
}
