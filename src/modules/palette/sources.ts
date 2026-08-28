/** 命令面板数据源缓存：让搜索路径零 IPC。
 *  原实现每按一个字符就并行拉五个源（clipboard_list 每次全量读历史索引），
 *  历史一大就发涩。改为：呼出面板时后台刷新 → 搜索直接从内存过滤 →
 *  数据变化事件到达即标记过期、下一次搜索后台补拉。
 *  本机应用列表扫描耗时 1s 级（开始菜单 + App Paths + 图标提取），单独惰性加载一次。 */
import { getConfig } from "../../stores/configStore";
import {
  bumpPaletteStat,
  listClipboard,
  listCredentials,
  listFolders,
  listInstalledApps,
  listPaletteStats,
  quickfilesList,
} from "../../core/tauri";
import { snippetsList } from "../snippets/api";
import {
  EVT_CLIPBOARD_CHANGED,
  EVT_CONFIG_CHANGED,
  EVT_FOLDER_CHANGED,
  onEvent,
} from "../../core/events";
import type {
  ClipEntry,
  Credential,
  FolderEntry,
  InstalledApp,
  PaletteStatEntry,
  QuickFile,
  Snippet,
} from "../../types";

/** 缓存新鲜期：面板可能常驻几分钟，15s 足够让"刚复制的东西"进得来 */
const TTL = 15_000;

export interface SourceData {
  clips: ClipEntry[];
  creds: Credential[];
  snippets: Snippet[];
  folders: FolderEntry[];
  files: QuickFile[];
  /** 快速文件实际扫描位置（结果副标题展示用） */
  filesLocation: string;
}

let data: SourceData | null = null;
let fetchedAt = 0;
/** 快速文件参数签名：改了保存位置或文件类型列表必须重扫 */
let filesSig = "";
let inflight: Promise<SourceData> | null = null;

let apps: InstalledApp[] | null = null;
let appsInflight: Promise<InstalledApp[]> | null = null;

let stats: Map<string, PaletteStatEntry> | null = null;
let statsInflight: Promise<Map<string, PaletteStatEntry>> | null = null;

function currentFilesSig(): string {
  const c = getConfig();
  return `${c.files.location ?? ""}|${c.files.file_types.map((t) => t.ext).join(",")}`;
}

async function fetchSources(): Promise<SourceData> {
  const c = getConfig();
  const exts = c.files.file_types.map((t) => t.ext);
  const [clips, creds, snippets, folders, fileRes] = await Promise.all([
    c.clipboard.enabled ? listClipboard() : Promise.resolve([] as ClipEntry[]),
    c.credentials.enabled ? listCredentials() : Promise.resolve([] as Credential[]),
    c.snippets.enabled ? snippetsList().catch(() => [] as Snippet[]) : Promise.resolve([] as Snippet[]),
    c.folder.enabled ? listFolders() : Promise.resolve([] as FolderEntry[]),
    c.files.enabled ? quickfilesList(c.files.location ?? "", exts) : Promise.resolve(null),
  ]);
  filesSig = currentFilesSig();
  const next: SourceData = {
    clips,
    creds,
    snippets,
    folders,
    files: fileRes?.files ?? [],
    filesLocation: fileRes?.location ?? "",
  };
  data = next;
  fetchedAt = Date.now();
  return next;
}

/** 强制拉取最新数据（面板每次呼出时后台调用） */
export function refreshSources(): Promise<SourceData> {
  if (!inflight) {
    inflight = fetchSources().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** 搜索用：有缓存立即返回（零等待），过期则顺便后台补拉 */
export async function sourcesForSearch(): Promise<SourceData> {
  if (data) {
    if (Date.now() - fetchedAt > TTL || filesSig !== currentFilesSig()) void refreshSources();
    return data;
  }
  return refreshSources();
}

/** 本机应用：只扫一次，装/卸应用后重启应用即刷新 */
export function installedApps(): Promise<InstalledApp[]> {
  if (apps) return Promise.resolve(apps);
  if (!appsInflight) {
    appsInflight = listInstalledApps()
      .then((list) => {
        apps = list;
        return list;
      })
      .finally(() => {
        appsInflight = null;
      });
  }
  return appsInflight;
}

/** 已就绪的应用列表（未就绪返回 null，同时确保后台扫描已发起） */
export function peekApps(): InstalledApp[] | null {
  void installedApps();
  return apps;
}

/** 用量统计快照（从未加载过时为空 Map，不阻塞搜索） */
export function allStats(): Map<string, PaletteStatEntry> {
  return stats ?? new Map();
}

/** 统计是否已就绪（空态首屏据此决定要不要先等一次读取） */
export function statsReady(): boolean {
  return stats !== null;
}

/** 用量统计：key -> 条目（排序加权与「最近使用 / 常用」空态的数据源） */
export function refreshStats(): Promise<Map<string, PaletteStatEntry>> {
  if (!statsInflight) {
    statsInflight = listPaletteStats()
      .then((list) => {
        stats = new Map(list.map((s) => [s.key, s]));
        return stats;
      })
      .finally(() => {
        statsInflight = null;
      });
  }
  return statsInflight;
}

export function statOf(key: string): PaletteStatEntry | undefined {
  return stats?.get(key);
}

/** 记一次使用：本地计数立即生效（下次呼出即加权），磁盘写入不阻塞 */
export function recordUsage(key: string): void {
  const prev = stats?.get(key);
  stats?.set(key, { key, count: (prev?.count ?? 0) + 1, last_used: Date.now() });
  void bumpPaletteStat(key);
}

/** 订阅数据变化事件做失效；返回清理函数 */
export function watchSourceInvalidation(): () => void {
  const cleanups: Array<() => void> = [];
  let disposed = false;
  const sub = (evt: string, fn: () => void) =>
    onEvent<unknown>(evt, fn).then((un) => (disposed ? un() : cleanups.push(un)));
  const invalidate = () => {
    fetchedAt = 0;
  };
  void sub(EVT_CLIPBOARD_CHANGED, invalidate);
  void sub(EVT_FOLDER_CHANGED, invalidate);
  // 配置改动可能换了快速文件位置或功能开关：直接重拉
  void sub(EVT_CONFIG_CHANGED, () => void refreshSources());
  return () => {
    disposed = true;
    cleanups.forEach((fn) => fn());
  };
}
