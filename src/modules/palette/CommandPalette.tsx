/** 全局命令面板：热键呼出的搜索框。
 *  布局：左侧「分区导航」（按来源分类 + 命中计数，点击或 Tab 切换）+
 *  右侧双行结果列表（分区头吸顶、每类一个专属色）。
 *  输入即产出：算式/换算/编解码/翻译/打开位置这类"工具行"恒定置顶，
 *  其下按分数与用量排序的命令与数据条目，尾部按需兜底网页搜索；
 *  空输入显示「最近使用 / 常用」。
 *  键位：↑↓ 选择、Tab 切分区、Enter 执行（工具行=粘贴结果）、
 *  Ctrl+Enter 仅复制、Esc 先清分区再关闭。 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { EVT_PANEL_VISIBILITY, onEvent } from "../../core/events";
import { useConfigStore } from "../../stores/configStore";
import { copyText, translateText } from "../../core/tauri";
import { emptyStateItems, queryItems, type QueryResult } from "./commands";
import { statKey } from "./match";
import {
  installedApps,
  recordUsage,
  refreshSources,
  refreshStats,
  watchSourceInvalidation,
} from "./sources";
import { shouldTranslate, type TranslationState } from "./tools";
import { KIND_COLOR, KIND_LABEL, KIND_ORDER, type PaletteItem, type PaletteKind } from "./types";
import { IconClose, IconSearch } from "../../components/icons";
import { useEscLayer } from "../../hooks/useEscLayered";
import "../../styles/panel.css";
import "./palette.css";

/** 不进统计的来源（临时产物，回放无意义） */
const NO_STATS = new Set(["tool", "web"]);

/** 翻译请求防抖：比本地搜索慢一档，避免为半截输入就打一次 HTTP */
const TRANSLATE_DEBOUNCE = 550;

/** 翻页步长（PageUp/PageDown） */
const PAGE_STEP = 8;

/** 把分类色塞进行内 CSS 变量，供 CSS 用 color-mix 派生底色/描边 */
function kindStyle(kind: PaletteKind): CSSProperties {
  return { "--k": KIND_COLOR[kind] } as CSSProperties;
}

export function CommandPalette() {
  const config = useConfigStore((s) => s.config);
  // 失焦自动隐藏（与各面板一致；Esc 亦关）
  usePanelCommon(false);

  const [query, setQuery] = useState("");
  /** 检索结果：展示条目 + 各来源命中总数（左栏计数用） */
  const [result, setResult] = useState<QueryResult>({ items: [], counts: {} });
  const items = result.items;
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [translation, setTranslation] = useState<TranslationState | null>(null);
  const [error, setError] = useState("");
  /** 应用列表扫描完成标记：就绪后重跑一次检索把「本机应用」组并进来 */
  const [appsReady, setAppsReady] = useState(false);
  /** 当前分区筛选（null = 全部） */
  const [kind, setKind] = useState<PaletteKind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 键盘导航后短暂屏蔽鼠标悬停抢焦点：光标停在列表上时用 ↑↓ 选条目，
   *  onMouseEnter 不应把 active 抢回鼠标位置（Raycast/VS Code 同款处理） */
  const kbNavUntilRef = useRef(0);
  /** 上一次参与检索的输入（区分"换词需防抖"与"仅换分区无需等"） */
  const lastQueryRef = useRef("");

  // Esc 语义：先撤掉分区筛选，再谈关闭窗口
  useEscLayer(true, () => {
    if (kind) setKind(null);
    else hideCurrentWindow();
  });

  // 数据失效订阅 + 应用列表后台预热
  useEffect(() => {
    const unwatch = watchSourceInvalidation();
    installedApps().then(
      () => setAppsReady(true),
      () => setAppsReady(false)
    );
    return unwatch;
  }, []);

  // 呼出即重置为干净状态（面板窗口 hide/show 不卸载组件，故监听自身 label 的显隐广播）
  useEffect(() => {
    const label = getCurrentWindow().label;
    let un: (() => void) | undefined;
    let disposed = false;
    onEvent<{ label: string; visible: boolean }>(EVT_PANEL_VISIBILITY, (p) => {
      if (p.label !== label || !p.visible) return;
      setQuery("");
      setKind(null);
      setActive(0);
      setError("");
      setTranslation(null);
      // 后台补拉：搜索走内存缓存，不在这次往返上阻塞
      void refreshSources();
      void refreshStats();
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }).then((u) => {
      if (disposed) u();
      else un = u;
    });
    return () => {
      disposed = true;
      un?.();
    };
  }, []);

  // 检索：空词 → 最近/常用；有词 → 静态命令 + 数据条目 + 内联工具（120ms 防抖）。
  // 分区切换不防抖——数据全在内存里，切一下分区没必要等。
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    const settle = (r: QueryResult) => {
      if (cancelled) return;
      setResult(r);
      setActive(0);
    };
    if (!q) {
      setSearching(false);
      emptyStateItems(config, kind).then(settle);
      return () => {
        cancelled = true;
      };
    }
    setSearching(true);
    // 输入文本变化才防抖；仅分区/配置变化的重算走 0ms
    const timer = window.setTimeout(
      () => {
        queryItems(query, { config, translation, focus: kind }).then(
          (r) => {
            setSearching(false);
            settle(r);
          },
          (err: unknown) => {
            if (cancelled) return;
            console.error("检索失败：", err);
            setSearching(false);
            setResult({ items: [], counts: {} });
            setActive(0);
          }
        );
      },
      lastQueryRef.current === q ? 0 : 120
    );
    lastQueryRef.current = q;
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, config, translation, appsReady, kind]);

  // 内联翻译：仅对"看起来像自然语言"的输入发起，失败降级成一行提示而非清空结果
  useEffect(() => {
    const raw = query.trim();
    if (!shouldTranslate(raw, config)) {
      setTranslation(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTranslation({ loading: true });
      translateText(raw)
        .then((r) => {
          if (!cancelled) setTranslation({ loading: false, result: r.translation });
        })
        .catch((e: unknown) => {
          if (!cancelled) setTranslation({ loading: false, error: String(e) });
        });
    }, TRANSLATE_DEBOUNCE);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, config]);

  /** 当前分区下的可见条目（active 索引始终相对它） */
  const visible = useMemo(
    () => (kind ? items.filter((i) => i.kind === kind) : items),
    [items, kind]
  );

  /** 左栏分区：只列本次结果里真正出现的来源，带命中数（全量计数，不受展示限流影响） */
  const buckets = useMemo(() => {
    const counts = result.counts;
    return KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0).map((k) => ({
      kind: k,
      count: counts[k] ?? 0,
    }));
  }, [result.counts]);
  const total = useMemo(() => buckets.reduce((s, b) => s + b.count, 0), [buckets]);

  /** 分区头只在组内首行渲染一次 */
  const rows = useMemo(
    () =>
      visible.map((item, i) => ({
        item,
        head: i === 0 || visible[i - 1].group !== item.group,
      })),
    [visible]
  );

  // 换分区后回到首行
  useEffect(() => {
    setActive(0);
  }, [kind]);

  // active 变化时保持可见行滚动跟随
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(".pal-item.is-active")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  const run = useCallback(async (item: PaletteItem | undefined, copyOnly: boolean) => {
    if (!item) return;
    try {
      if (copyOnly && item.copy !== undefined) {
        hideCurrentWindow();
        await copyText(item.copy);
      } else {
        await item.perform();
      }
      if (!NO_STATS.has(item.kind)) recordUsage(statKey(item));
      setError("");
    } catch (err) {
      // 失败留在面板里说明原因（窗口不收起，用户可立刻改输入重试）
      setError(String(err));
    }
  }, []);

  // 全局键盘：↑↓ 移动 / Tab 切分区 / Enter 执行 / Ctrl+Enter 仅复制（Esc 由 useEscLayer 接管）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 输入法组合期间（选词、按 Enter 确认候选词）不劫持按键，否则会误执行当前条目
      if (e.isComposing || e.keyCode === 229) return;
      const n = visible.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        kbNavUntilRef.current = Date.now() + 200;
        setActive((i) => (n ? (i + 1) % n : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        kbNavUntilRef.current = Date.now() + 200;
        setActive((i) => (n ? (i - 1 + n) % n : 0));
      } else if (e.key === "PageDown") {
        e.preventDefault();
        kbNavUntilRef.current = Date.now() + 200;
        setActive((i) => (n ? Math.min(n - 1, i + PAGE_STEP) : 0));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        kbNavUntilRef.current = Date.now() + 200;
        setActive((i) => (n ? Math.max(0, i - PAGE_STEP) : 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        kbNavUntilRef.current = Date.now() + 200;
        setActive(0);
      } else if (e.key === "End") {
        e.preventDefault();
        kbNavUntilRef.current = Date.now() + 200;
        setActive(n ? n - 1 : 0);
      } else if (e.key === "Tab") {
        // 在「全部 → 各分区」之间循环；不移动焦点，纯粹是分区筛选
        e.preventDefault();
        const opts: Array<PaletteKind | null> = [null, ...buckets.map((b) => b.kind)];
        const at = opts.indexOf(kind);
        const next = opts[(at + (e.shiftKey ? -1 : 1) + opts.length) % opts.length];
        setKind(next);
      } else if (e.key === "Enter") {
        e.preventDefault();
        // active 钳制到结果范围内：结果收缩的间隙 active 可能越界，
        // 不钳制会取到 undefined（按 Enter 无响应一次）
        void run(visible.length ? visible[Math.min(active, visible.length - 1)] : undefined, e.ctrlKey || e.metaKey);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, active, run, buckets, kind]);

  const emptyText =
    !searching && rows.length === 0
      ? kind
        ? `「${KIND_LABEL[kind]}」下没有结果，Tab 或 Esc 返回全部`
        : query.trim()
          ? "没有匹配的命令或内容"
          : "还没有使用记录，输入即搜索"
      : "";

  return (
    <div className="palette">
      <div className="palette-shell">
        <div className="palette-input-row">
          <span className="palette-search-icon">
            <IconSearch size={18} />
          </span>
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            placeholder="算式 · 0x1f · 500mb · JSON/Base64 · 翻译 · 应用 · 文件…"
            onChange={(e) => {
              setQuery(e.target.value);
              // 换查询=新一次检索，旧的分区筛选不再适用
              setKind(null);
            }}
            spellCheck={false}
          />
          {kind && (
            <button
              type="button"
              className="palette-filter-chip"
              style={kindStyle(kind)}
              onClick={() => setKind(null)}
              title="清除分区筛选（Esc）"
            >
              仅看 {KIND_LABEL[kind]}
              <IconClose size={11} />
            </button>
          )}
          {searching && <span className="palette-spinner" />}
        </div>

        <div className="palette-body">
          <nav className="palette-rail" aria-label="结果分区">
            <button
              type="button"
              className={`palette-rail-item${kind === null ? " is-active" : ""}`}
              onClick={() => setKind(null)}
            >
              <span className="palette-rail-dot all" />
              <span className="palette-rail-name">全部</span>
              <span className="palette-rail-count">{total}</span>
            </button>
            {buckets.map((b) => (
              <button
                key={b.kind}
                type="button"
                className={`palette-rail-item${kind === b.kind ? " is-active" : ""}`}
                style={kindStyle(b.kind)}
                onClick={() => setKind(kind === b.kind ? null : b.kind)}
                title={`只看${KIND_LABEL[b.kind]}（${b.count} 条）`}
              >
                <span className="palette-rail-dot" />
                <span className="palette-rail-name">{KIND_LABEL[b.kind]}</span>
                <span className="palette-rail-count">{b.count}</span>
              </button>
            ))}
          </nav>

          <div className="palette-list" ref={listRef}>
            {emptyText && <div className="palette-empty">{emptyText}</div>}
            {rows.map(({ item, head }, i) => {
              const Icon = item.icon;
              const isActive = i === active;
              return (
                <div key={`${item.kind}-${item.id}-${i}`}>
                  {head && (
                    <div className="pal-head" style={kindStyle(item.kind)}>
                      <span className="pal-head-dot" />
                      <span className="pal-head-name">{item.group}</span>
                      <span className="pal-head-line" />
                    </div>
                  )}
                  <div
                    className={`pal-item${isActive ? " is-active" : ""}${
                      item.loading ? " is-loading" : ""
                    }`}
                    style={kindStyle(item.kind)}
                    onMouseEnter={() => {
                      if (Date.now() > kbNavUntilRef.current) setActive(i);
                    }}
                    onClick={() => void run(item, false)}
                  >
                    <span className="pal-icon">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" width={18} height={18} />
                      ) : (
                        <Icon size={16} />
                      )}
                    </span>
                    <span className="pal-main">
                      <span className={`pal-title${item.kind === "tool" ? " is-result" : ""}`}>
                        {item.title}
                      </span>
                      <span className="pal-sub">{item.subtitle || " "}</span>
                    </span>
                    <span className="pal-side">
                      {item.tag && <span className="pal-tag">{item.tag}</span>}
                      {item.hotkey && <span className="kbd">{item.hotkey}</span>}
                      {isActive && item.copy !== undefined && (
                        <span className="pal-hint">Ctrl+Enter 复制</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && <div className="palette-error">{error}</div>}

        <div className="palette-footer">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> 选择
          </span>
          <span>
            <span className="kbd">Tab</span> 切分区
          </span>
          <span>
            <span className="kbd">Enter</span> 执行 / 粘贴
          </span>
          <span>
            <span className="kbd">Ctrl+Enter</span> 仅复制
          </span>
          <span>
            <span className="kbd">Esc</span> {kind ? "清分区" : "关闭"}
          </span>
          <span className="palette-footer-count">
            {total ? `${kind ? `${visible.length} / ${total}` : `${total}`} 条` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
