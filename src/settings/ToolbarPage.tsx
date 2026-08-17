/** 悬浮工具栏设置页：启用开关 + 勾选显示哪些工具 + 拖拽排序图标顺序 */
import { useState } from "react";
import { useConfigStore } from "../stores/configStore";
import { setToolbarVisible } from "../core/tauri";
import type { ToolKey } from "../types";
import { SettingGroup, SettingRow, Switch } from "./components";
import { TOOL_KEYS, TOOLS } from "../modules/toolbar/Toolbar";

export function ToolbarPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  /** 拖拽中的源下标（null = 未在拖拽） */
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  if (!config.toolbar) return null;

  const toggleEnabled = (on: boolean) => {
    void update({ ...config, toolbar: { ...config.toolbar, enabled: on } });
    // 同步窗口显隐（配置保存后广播给工具栏窗口，但窗口可见性由后端控制）
    void setToolbarVisible(on);
  };

  const toggleTool = (key: ToolKey) => {
    const has = config.toolbar.tools.includes(key);
    const tools = has
      ? config.toolbar.tools.filter((t) => t !== key)
      : [...config.toolbar.tools, key];
    void update({ ...config, toolbar: { ...config.toolbar, tools } });
  };

  /** 把 from 下标的工具移动到 to 下标（拖拽排序），保存后广播给工具栏窗口即时生效 */
  const moveTool = (from: number, to: number) => {
    if (from === to) return;
    const tools = [...config.toolbar.tools];
    const [item] = tools.splice(from, 1);
    tools.splice(to, 0, item);
    void update({ ...config, toolbar: { ...config.toolbar, tools } });
  };

  const ordered = config.toolbar.tools;

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
          desc={ordered.length ? "按住左侧手柄拖拽调整图标在工具栏上的排列顺序" : "请先在上方勾选工具"}
        >
          <div className="toolbar-sort">
            {ordered.length === 0 && (
              <div className="empty-state" style={{ padding: "12px 0" }}>
                未勾选任何工具
              </div>
            )}
            {ordered.map((key, i) => {
              const tool = TOOLS[key];
              if (!tool) return null;
              return (
                <div
                  key={key}
                  className={`toolbar-sort-item${dragIdx === i ? " dragging" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(i);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragIdx ?? Number(e.dataTransfer.getData("text/plain") || i);
                    setDragIdx(null);
                    if (from >= 0 && from < ordered.length) moveTool(from, i);
                  }}
                  onDragEnd={() => setDragIdx(null)}
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
