/** 命令面板内联工具：把输入当场算成可执行结果（工具栏和热键做不到的那部分）。
 *  探测优先级：URL → 本地路径 → 算式 → 进制 → 存储 → 温度 → 时间戳 → 文本转换 → 翻译。
 *  命中任一本地工具即不再追加网页搜索行（buildWebItems 由调用方按需拼在尾部）。
 *  结果行统一语义：Enter = 收起面板并把结果粘进用户原应用；Ctrl+Enter = 仅复制。 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { hideCurrentWindow } from "../../core/usePanel";
import {
  openFolder,
  panelToggle,
  pasteText,
  quickfilesOpen,
  quickfilesReveal,
} from "../../core/tauri";
import { detectActions, formatTimestamp } from "../clipboard/transform";
import { tryMath, tryRadix, tryStorage, tryTemperature, type ToolResult } from "./calc";
import { KIND_LABEL, type PaletteItem } from "./types";
import {
  IconCode,
  IconExternal,
  IconFolder,
  IconLocate,
  IconSearch,
  IconText,
  IconTranslate,
  IconWand,
} from "../../components/icons";
import type { AppConfig } from "../../types";

const GROUP = KIND_LABEL.tool;

/** 翻译行的异步状态（组件持有，工具引擎只负责渲染它） */
export interface TranslationState {
  loading: boolean;
  result?: string;
  error?: string;
}

export interface ToolContext {
  config: AppConfig;
  translation: TranslationState | null;
}

/** 结果行：主标题即结果本体，副标题回显输入，copy 供 Ctrl+Enter 仅复制 */
function resultRow(
  id: string,
  res: ToolResult,
  icon: PaletteItem["icon"],
  extra?: Partial<PaletteItem>
): PaletteItem {
  return {
    id: `tool-${id}`,
    kind: "tool",
    group: GROUP,
    title: res.label,
    subtitle: res.hint,
    icon,
    copy: res.value,
    perform: () => {
      hideCurrentWindow();
      return pasteText(res.value);
    },
    ...extra,
  };
}

/* ---------------- URL / 路径 ---------------- */

/** 常见后缀白名单：避免把 "a.md"、"1.5" 之类误判成网址 */
const TLDS = new Set([
  "com", "cn", "net", "org", "io", "dev", "app", "co", "me", "cc", "top", "vip",
  "gov", "edu", "xyz", "shop", "tech", "cloud", "ai", "sh", "so", "gg", "info",
  "wiki", "live", "link", "run", "studio", "tv", "uk", "jp", "kr", "de", "fr",
]);

function asUrl(raw: string): string | null {
  const s = raw.trim();
  if (/\s/.test(s)) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const m = /^([\w-]+(\.[\w-]+)+)(\/[^\s]*)?$/.exec(s);
  if (!m) return null;
  const host = m[1];
  const tld = host.split(".").pop()?.toLowerCase() ?? "";
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  if (!isIp && !TLDS.has(tld)) return null;
  return `https://${s}`;
}

/** 绝对路径形态：盘符 / UNC / 以 ~ . 或分隔符开头 */
function asPath(raw: string): string | null {
  const s = raw.trim();
  if (/^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s) || /^[~.]?[\\/]/.test(s)) return s;
  return null;
}

function openLocation(path: string): Promise<void> {
  // 先当文件夹打开（Rust 侧已校验并记一次访问），不是目录再按文件用默认程序打开
  return openFolder(path).catch(() => quickfilesOpen(path));
}

/* ---------------- 文本转换 ---------------- */

/** detectActions 里两条"万能兜底"编码：不加选择地对任意文本产出噪声行 */
const GENERIC_KEYS = new Set(["b64-encode", "url-encode"]);

function textConversions(raw: string): ToolResult[] {
  const spec = detectActions(raw);
  if (!spec.length) return [];
  const specific = spec.filter((a) => !GENERIC_KEYS.has(a.key));
  const generic = spec.filter((a) => GENERIC_KEYS.has(a.key));
  // 只有"看起来就是一个令牌"（无空格、够长）且没有任何专项转换时，才给通用编码行
  const showGeneric = specific.length === 0 && !/\s/.test(raw) && raw.length >= 8;
  const list = [...specific, ...(showGeneric ? generic : [])];
  return list
    .map<ToolResult | null>((a) => {
      let out = "";
      try {
        out = a.run(raw);
      } catch {
        return null;
      }
      if (!out) return null;
      const first = out.split("\n")[0];
      return { label: first.slice(0, 120), value: out, hint: `${a.label} · ${out.length} 字符` };
    })
    .filter((r): r is ToolResult => !!r && r.value !== raw.trim());
}

/* ---------------- 主入口 ---------------- */

export interface ToolBuildResult {
  items: PaletteItem[];
  /** 命中了本地工具（含翻译）→ 调用方据此决定是否追加网页搜索行 */
  matched: boolean;
}

export function buildToolItems(raw: string, ctx: ToolContext): ToolBuildResult {
  const items: PaletteItem[] = [];
  const input = raw.trim();
  if (!input) return { items, matched: false };

  const url = asUrl(input);
  if (url) {
    items.push({
      id: "tool-open-url",
      kind: "tool",
      group: GROUP,
      title: `打开 ${new URL(url).host}${new URL(url).pathname === "/" ? "" : new URL(url).pathname}`,
      subtitle: url,
      icon: IconExternal,
      copy: url,
      perform: () => {
        hideCurrentWindow();
        return openUrl(url);
      },
    });
    return { items, matched: true };
  }

  const path = asPath(input);
  if (path) {
    items.push({
      id: "tool-open-path",
      kind: "tool",
      group: GROUP,
      title: "打开此位置",
      subtitle: path,
      icon: IconFolder,
      copy: path,
      perform: async () => {
        await openLocation(path);
        hideCurrentWindow();
      },
    });
    items.push({
      id: "tool-reveal-path",
      kind: "tool",
      group: GROUP,
      title: "在资源管理器中定位",
      subtitle: path,
      icon: IconLocate,
      copy: path,
      perform: async () => {
        await quickfilesReveal(path);
        hideCurrentWindow();
      },
    });
    return { items, matched: true };
  }

  const math = tryMath(input);
  if (math) items.push(resultRow("math", math, IconWand));

  const radix = tryRadix(input);
  if (radix) items.push(...radix.map((r) => resultRow(`radix-${r.label}`, r, IconCode)));

  const storage = tryStorage(input);
  if (storage) items.push(...storage.map((r) => resultRow(`stor-${r.label}`, r, IconWand)));

  const temp = tryTemperature(input);
  if (temp) items.push(...temp.map((r) => resultRow(`temp-${r.label}`, r, IconWand)));

  if (/^\d{10}$|^\d{13}$/.test(input)) {
    const ts = formatTimestamp(input);
    if (ts) {
      items.push(
        resultRow("ts", { label: ts, value: ts, hint: `时间戳 ${input} → 本地时间` }, IconText)
      );
    }
  }

  if (!items.length) {
    textConversions(input).forEach((r, i) => items.push(resultRow(`txt-${i}`, r, IconWand)));
  }

  if (items.length) return { items, matched: true };

  // 翻译：只有本地什么都没命中才试（算式/代码/路径的译文没有意义）
  if (ctx.translation && ctx.config.translator.enabled) {
    const st = ctx.translation;
    if (st.loading) {
      items.push({
        id: "tool-translating",
        kind: "tool",
        group: GROUP,
        title: "翻译中…",
        icon: IconTranslate,
        loading: true,
        perform: () => undefined,
      });
    } else if (st.result) {
      items.push(
        resultRow(
          "translate",
          { label: st.result, value: st.result, hint: `翻译 ${input.slice(0, 24)}` },
          IconTranslate
        )
      );
    } else if (st.error) {
      const needConfig = /未配置/.test(st.error);
      items.push({
        id: "tool-translate-error",
        kind: "tool",
        group: GROUP,
        title: needConfig ? "配置翻译服务后重试" : st.error.slice(0, 80),
        subtitle: st.error,
        icon: IconTranslate,
        perform: needConfig
          ? () => {
              hideCurrentWindow();
              return panelToggle("settings");
            }
          : () => undefined,
      });
    }
    return { items, matched: items.length > 0 };
  }
  return { items, matched: false };
}

/** 是否值得为这段输入发一次翻译请求（组件防抖前先把关，省掉无谓的 HTTP） */
export function shouldTranslate(raw: string, config: AppConfig): boolean {
  const input = raw.trim();
  if (!config.translator.enabled || input.length < 2 || input.length > 200) return false;
  // 1~3 位字母数字基本都是拼音首字母 / 缩写查询（sz、jt、cl），不该为它跑一次 HTTP
  if (/^[a-z0-9]{1,3}$/i.test(input)) return false;
  if (/\d/.test(input) && /[+\-*/%^]/.test(input)) return false;
  if (/^[0-9a-fA-FxXoObB._\s-]+$/.test(input)) return false;
  return !asUrl(input) && !asPath(input);
}

/* ---------------- 网页搜索 ---------------- */

const ENGINES: Array<{ name: string; build: (q: string) => string }> = [
  { name: "百度", build: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}` },
  { name: "必应", build: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}` },
  { name: "Google", build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  { name: "GitHub", build: (q) => `https://github.com/search?q=${encodeURIComponent(q)}` },
];

export function buildWebItems(raw: string): PaletteItem[] {
  const input = raw.trim();
  if (!input) return [];
  return ENGINES.map<PaletteItem>((e) => ({
    id: `web-${e.name}`,
    kind: "web",
    group: KIND_LABEL.web,
    title: `${e.name}搜索「${input.slice(0, 40)}」`,
    icon: IconSearch,
    copy: e.build(input),
    perform: () => {
      hideCurrentWindow();
      return openUrl(e.build(input));
    },
  }));
}
