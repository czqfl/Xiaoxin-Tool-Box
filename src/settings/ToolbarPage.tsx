/** 悬浮工具栏设置页：启用开关 + 勾选显示哪些工具 + 拖拽排序图标顺序
 *  拖拽用 pointer 事件自实现（WebView2 在 Tauri 下拦截 HTML5 drag），
 *  排序过程带 FLIP 让位动画（与剪贴板面板一致：旧位置→重排→位移过渡）。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useConfigStore } from "../stores/configStore";
import { setToolbarVisible } from "../core/tauri";
import type { ToolKey } from "../types";
import { SettingGroup, SettingRow, Switch } from "./components";
import { TOOL_KEYS, TOOLS } from "../modules/toolbar/Toolbar";

const FLIP_MS = 160;

export function ToolbarPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  /** 拖拽中的源工具 key（ref 同步，pointer 事件链里可靠读取） */
  const dragKeyRef = useRef<ToolKey | null>(null);
  /** 拖拽中的视觉顺序（null = 未拖拽，按配置顺序） */
  const [visualOrder, setVisualOrder] = useState<ToolKey[] | null>(null);
  /** 当前悬停目标下标（视觉高亮） */
  const [dragOver, setDragOver] = useState<number | null>(null);
  /** 排序项 DOM 引用（FLIP 测量用） */
  const itemRefs = useRef<Map<ToolKey, HTMLDivElement>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);

  if (!config.toolbar) return null;

  const ordered = config.toolbar.tools;

  const toggleEnabled = (on: boolean) => {
    void update({ ...config, toolbar: { ...config.toolbar, enabled: on } });
    void setToolbarVisible(on);
  };

  const toggleTool = (key: ToolKey) => {
    const has = config.toolbar.tools.includes(key);
    const tools = has
      ? config.toolbar.tools.filter((t) => t !== key)
      : [...config.toolbar.tools, key];
    void update({ ...config, toolbar: { ...config.toolbar, tools } });
  };

  /** FLIP 让位动画：目标顺序 keys 渲染后，各元素从旧位置平滑过渡到新位置 */
  const reorderTo = (fromKey: ToolKey, over: number) => {
    const base = visualOrder ?? ordered;
    const from = base.indexOf(fromKey);
    if (from < 0 || from === over) return;
    const next = [...base];
    const [moved] = next.splice(from, 1);
    next.splice(over, 0, moved);
    // flushSync 同步提交 DOM 顺序，保证 FLIP 的 last 位置测量正确
    const els = next
      .filter((k) => k !== fromKey)
      .map((k) => itemRefs.current.get(k))
      .filter((el): el is HTMLDivElement => !!el);
    const first = els.map((el) => el.getBoundingClientRect().top);
    flushSync(() => setVisualOrder(next));
    requestAnimationFrame(() => {
      const last = els.map((el) => el.getBoundingClientRect().top);
      els.forEach((el, i) => {
        const dy = first[i] - last[i];
        if (Math.abs(dy) > 0.5) {
          el.style.transition = "none";
          el.style.transform = `translateY(${dy}px)`;
          void el.getBoundingClientRect();
          el.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          el.style.transform = "";
          const done = () => {
            el.style.transition = "";
            el.removeEventListener("transitionend", done);
          };
          el.addEventListener("transitionend", done);
        }
      });
    });
  };

  /** 根据鼠标 Y 计算悬停目标下标（按各项垂直中点判定） */
  const hoverIndexAt = (clientY: number): number | null => {
    const container = listRef.current;
    if (!container) return null;
    const items = Array.from(container.children) as HTMLElement[];
    if (items.length === 0) return null;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length - 1;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const key = dragKeyRef.current;
    if (!key) return;
    const over = hoverIndexAt(e.clientY);
    if (over == null) return;
    setDragOver(over);
    reorderTo(key, over);
  };

  const endDrag = useCallback(() => {
    const key = dragKeyRef.current;
    dragKeyRef.current = null;
    setDragOver(null);
    if (key && visualOrder) {
      // 落定：以拖拽结束时的视觉顺序作为最终顺序保存（广播后工具栏即时生效）
      const final = visualOrder.filter((k) => ordered.includes(k));
      if (final.length === ordered.length) {
        void update({ ...config, toolbar: { ...config.toolbar, tools: final } });
      }
    }
    setVisualOrder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualOrder, ordered, update]);

  // 兜底：pointer 在容器外松开时也结束拖拽
  useEffect(() => {
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [endDrag]);

  const displayKeys = visualOrder ?? ordered;
  const draggingKey = dragKeyRef.current;

  return (
    <div className="settings-page">
      <h2>悬浮工具栏</h2>
      <p className="page-desc">
        常驻小工具条（类似输入法工具栏），点击图标快速呼出对应面板；可按住图标拖动位置
      </p>

      <SettingGroup>
        <SettingRow
          title="显示悬浮工具栏"
          desc="开启后屏幕右侧显示常驻工具条（也可从托盘菜单随时切换显示）"
        >
          <Switch checked={config.toolbar.enabled} onChange={toggleEnabled} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="工具栏上显示的工具"
          desc="勾选需要在工具栏展示的功能；留空时工具栏自动隐藏"
        >
          <div className="toolbar-tools">
            {TOOL_KEYS.map((key) => {
              const tool = TOOLS[key];
              const checked = config.toolbar.tools.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`toolbar-tool ${checked ? "checked" : ""}`}
                  onClick={() => toggleTool(key)}
                >
                  <span className="toolbar-tool-icon" style={{ color: tool.color }}>
                    {tool.icon}
                  </span>
                  <span className="toolbar-tool-name">{tool.label}</span>
                  <span className="toolbar-tool-check">{checked ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="图标顺序"
          desc={ordered.length ? "按住左侧手柄上下拖动调整排列顺序" : "请先在上方勾选工具"}
        >
          <div className="toolbar-sort" ref={listRef} onPointerMove={onPointerMove}>
            {ordered.length === 0 && (
              <div className="empty-state" style={{ padding: "12px 0" }}>
                未勾选任何工具
              </div>
            )}
            {displayKeys.map((key, i) => {
              const tool = TOOLS[key];
              if (!tool) return null;
              const isDragging = draggingKey === key;
              return (
                <div
                  key={key}
                  ref={(el) => {
                    if (el) itemRefs.current.set(key, el);
                    else itemRefs.current.delete(key);
                  }}
                  className={`toolbar-sort-item${isDragging ? " dragging" : ""}${dragOver === i && !isDragging && draggingKey ? " drag-target" : ""}`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    dragKeyRef.current = key;
                    setDragOver(i);
                    setVisualOrder(null);
                  }}
                >
                  <span className="toolbar-sort-handle" aria-hidden>
                    ⠿
                  </span>
                  <span className="toolbar-tool-icon" style={{ color: tool.color }}>
                    {tool.icon}
                  </span>
                  <span className="toolbar-tool-name">{tool.label}</span>
                  <span className="toolbar-sort-index">{i + 1}</span>
                </div>
              );
            })}
          </div>
        </SettingRow>
      </SettingGroup>

      <div className="shortcut-hint">
        工具栏显示/隐藏：托盘右键菜单 → 「悬浮工具栏」，或在本页开关。
        拖动：按住任意图标轻微移动即可拖动工具条，未移动松开则点击呼出。
      </div>
    </div>
  );
}
