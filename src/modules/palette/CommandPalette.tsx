/** 全局命令面板：热键呼出的搜索框（Raycast 风格）。
 *  输入即搜：静态动作命令本地过滤，剪贴板/凭证/语速贴/文件夹/快速文件
 *  异步查询合并展示；↑↓ 选择、Enter 执行、Esc 关闭；失焦自动隐藏。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { hideCurrentWindow, usePanelCommon } from "../../core/usePanel";
import { EVT_PANEL_VISIBILITY, onEvent } from "../../core/events";
import { useConfigStore } from "../../stores/configStore";
import { buildStaticCommands, itemMatches, searchItems } from "./commands";
import type { PaletteItem } from "./commands";
import { IconSearch } from "../../components/icons";
import "./palette.css";

export function CommandPalette() {
  const config = useConfigStore((s) => s.config);
  // 失焦自动隐藏（与各面板一致；Esc 亦关）
  usePanelCommon(false);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [active, setActive] = useState(0);
  /** 搜索进行中标记（输入框右侧转圈提示可选） */
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** 静态命令随功能开关变化重建 */
  const statics = useMemo(() => buildStaticCommands(config), [config]);

  // 呼出时重置搜索并聚焦：面板窗口 hide/show 不卸载组件，
  // 监听自身 label 的显隐广播补一次"每次呼出都是干净状态"
  useEffect(() => {
    const label = getCurrentWindow().label;
    let un: (() => void) | undefined;
    let disposed = false;
    onEvent<{ label: string; visible: boolean }>(EVT_PANEL_VISIBILITY, (p) => {
      if (p.label !== label || !p.visible) return;
      setQuery("");
      setActive(0);
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

  // 搜索：空词直接展示全部静态命令；有词则静态过滤 + 各数据源异步查询（120ms 防抖）
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setItems(statics);
      setSearching(false);
      setActive(0);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const matchedStatics = statics.filter((i) => itemMatches(q, i));
      try {
        const dynamic = await searchItems(q, config);
        if (cancelled) return;
        setItems([...matchedStatics, ...dynamic]);
        setActive(0);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, statics, config]);

  // active 变化时保持可见行滚动跟随
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(".palette-item.active")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  const run = async (item: PaletteItem | undefined) => {
    if (!item) return;
    try {
      await item.perform();
    } catch (err) {
      console.error("命令执行失败：", err);
    }
  };

  // 全局键盘：↑↓ 移动 / Enter 执行 / Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        void run(items[active]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, active]);

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
            placeholder="搜索命令、剪贴板、凭证、文件…"
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          {searching && <span className="palette-spinner" />}
        </div>

        <div className="palette-list" ref={listRef}>
          {items.length === 0 && !searching && (
            <div className="palette-empty">
              {query.trim() ? "没有匹配的命令或内容" : "没有可用命令"}
            </div>
          )}
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`palette-item${i === active ? " active" : ""}`}
                onMouseMove={() => setActive(i)}
                onClick={() => void run(item)}
              >
                <span className="palette-item-icon">
                  <Icon size={15} />
                </span>
                <span className="palette-item-main">
                  <span className="palette-item-title">{item.title}</span>
                  {item.subtitle && (
                    <span className="palette-item-subtitle">{item.subtitle}</span>
                  )}
                </span>
                <span className="palette-item-group">{item.group}</span>
              </div>
            );
          })}
        </div>

        <div className="palette-footer">
          <span><span className="kbd">↑</span><span className="kbd">↓</span> 选择</span>
          <span><span className="kbd">Enter</span> 执行</span>
          <span><span className="kbd">Esc</span> 关闭</span>
        </div>
      </div>
    </div>
  );
}
