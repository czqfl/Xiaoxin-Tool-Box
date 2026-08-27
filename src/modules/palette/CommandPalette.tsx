/** 全局命令面板：热键呼出的搜索框（Raycast 风格）。
 *  输入即产出：算式/换算/编解码/翻译/打开位置这类"工具行"恒定置顶，
 *  其下是按分数与用量排序的命令与数据条目，尾部按需兜底网页搜索；
 *  空输入显示「最近使用 / 常用」。
 *  键位：↑↓ 选择、Enter 执行（工具行=粘贴结果）、Ctrl+Enter 仅复制、Esc 关闭。 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { EVT_PANEL_VISIBILITY, onEvent } from "../../core/events";
import { useConfigStore } from "../../stores/configStore";
import { copyText, translateText } from "../../core/tauri";
import { emptyStateItems, queryItems } from "./commands";
import { statKey } from "./match";
import {
  installedApps,
  recordUsage,
  refreshSources,
  refreshStats,
  watchSourceInvalidation,
} from "./sources";
import { shouldTranslate, type TranslationState } from "./tools";
import type { PaletteItem } from "./types";
import { IconSearch } from "../../components/icons";
import "../../styles/panel.css";
import "./palette.css";

/** 不进统计的来源（临时产物，回放无意义） */
const NO_STATS = new Set(["tool", "web"]);

/** 翻译请求防抖：比本地搜索慢一档，避免为半截输入就打一次 HTTP */
const TRANSLATE_DEBOUNCE = 550;

export function CommandPalette() {
  const config = useConfigStore((s) => s.config);
  // 失焦自动隐藏（与各面板一致；Esc 亦关）
  usePanelCommon(false);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [translation, setTranslation] = useState<TranslationState | null>(null);
  const [error, setError] = useState("");
  /** 应用列表扫描完成标记：就绪后重跑一次检索把「本机应用」组并进来 */
  const [appsReady, setAppsReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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

  // 检索：空词 → 最近/常用；有词 → 静态命令 + 数据条目 + 内联工具（120ms 防抖）
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q) {
      setSearching(false);
      emptyStateItems(config).then((list) => {
        if (cancelled) return;
        setItems(list);
        setActive(0);
      });
      return () => {
        cancelled = true;
      };
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      queryItems(query, { config, translation }).then(
        (list) => {
          if (cancelled) return;
          setItems(list);
          setActive(0);
          setSearching(false);
        },
        (err: unknown) => {
          if (cancelled) return;
          console.error("检索失败：", err);
          setItems([]);
          setSearching(false);
        }
      );
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, config, translation, appsReady]);

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

  // active 变化时保持可见行滚动跟随
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(".palette-item.active")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

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

  // 全局键盘：↑↓ 移动 / Enter 执行 / Ctrl+Enter 仅复制 / Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 输入法组合期间（选词、按 Enter 确认候选词）不劫持按键，否则会误执行当前条目
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") {
        e.preventDefault();
        hideCurrentWindow();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (items.length ? (i + 1) % items.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        void run(items[active], e.ctrlKey || e.metaKey);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items, active, run]);

  const sections = useMemo(
    () =>
      items.map((item, i) => ({
        item,
        /** 与上一条同段则不重复渲染组头 */
        newSection: i === 0 || items[i - 1].group !== item.group,
      })),
    [items]
  );

  return (
    <div className="palette">
      <div className="palette-shell">
        <div className="palette-input-row">
          <span className="palette-search-icon">
            <IconSearch size={16} />
          </span>
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            placeholder="算式 · 0x1f · 500mb · JSON/Base64 · 翻译 · 应用 · 文件…"
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          {searching && <span className="palette-spinner" />}
        </div>

        <div className="palette-list" ref={listRef}>
          {items.length === 0 && !searching && (
            <div className="palette-empty">
              {query.trim() ? "没有匹配的命令或内容" : "还没有使用记录，输入即搜索"}
            </div>
          )}
          {sections.map(({ item, newSection }, i) => {
            const Icon = item.icon;
            return (
              <div key={`${item.kind}-${item.id}-${i}`} className="palette-row-wrap">
                {newSection && (
                  <div className={`palette-section${item.kind === "tool" ? " tool" : ""}`}>
                    {item.group}
                  </div>
                )}
                <div
                  className={`palette-item${i === active ? " active" : ""}${
                    item.loading ? " loading" : ""
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => void run(item, false)}
                >
                  <span className="palette-item-icon">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" width={16} height={16} />
                    ) : (
                      <Icon size={15} />
                    )}
                  </span>
                  <span className="palette-item-main">
                    <span className={`palette-item-title${item.kind === "tool" ? " result" : ""}`}>
                      {item.title}
                    </span>
                    {item.subtitle && (
                      <span className="palette-item-subtitle">{item.subtitle}</span>
                    )}
                  </span>
                  {i === active && item.copy !== undefined && (
                    <span className="palette-item-hint">Ctrl+Enter 复制</span>
                  )}
                  {item.hotkey && <span className="kbd">{item.hotkey}</span>}
                  {item.tag && <span className="palette-item-group">{item.tag}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className="palette-error">{error}</div>}

        <div className="palette-footer">
          <span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> 选择
          </span>
          <span>
            <span className="kbd">Enter</span> 执行 / 粘贴
          </span>
          <span>
            <span className="kbd">Ctrl+Enter</span> 仅复制
          </span>
          <span>
            <span className="kbd">Esc</span> 关闭
          </span>
          <span className="palette-footer-count">{items.length ? `${items.length} 条` : ""}</span>
        </div>
      </div>
    </div>
  );
}
