/** 文件夹设置页：固定列表管理（增删改）、显示选项、布局模式 */
import { useEffect, useState } from "react";
import { useConfigStore } from "../stores/configStore";
import { sortFolders, useFolderStore } from "../stores/folderStore";
import * as api from "../modules/folder/api";
import { Segmented, SettingGroup, SettingRow, Switch } from "./components";
import { IconPalette, IconTrash } from "../components/icons";

const COLOR_PRESETS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];

export function FolderPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const { folders, loaded, refresh, add, remove } = useFolderStore();
  const [newPath, setNewPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const patch = (patched: Partial<typeof config.folder>) => {
    void update({ ...config, folder: { ...config.folder, ...patched } });
  };

  const handleAdd = async () => {
    if (!newPath.trim()) return;
    const err = await add(newPath.trim());
    if (err) {
      setError(err);
    } else {
      setError("");
      setNewPath("");
    }
  };

  /** 调起系统资源管理器选择文件夹 */
  const handlePick = async () => {
    try {
      const path = await api.pickFolder();
      if (!path) return;
      const err = await add(path);
      if (err) setError(err);
      else setError("");
    } catch (err) {
      setError(String(err));
    }
  };

  const handleRename = async (id: string, current: string) => {
    const name = window.prompt("输入新名称：", current);
    if (name && name !== current) {
      await api.renameFolder(id, name);
      await refresh();
    }
  };

  const handleColor = async (id: string) => {
    const current = folders.find((f) => f.id === id)?.color ?? null;
    const idx = current ? COLOR_PRESETS.indexOf(current) : -1;
    const next = COLOR_PRESETS[(idx + 1) % COLOR_PRESETS.length];
    await api.setFolderColor(id, next);
    await refresh();
  };

  const { pinned } = sortFolders(folders);

  return (
    <div className="settings-page">
      <h2>文件夹设置</h2>
      <p className="page-desc">管理固定文件夹与面板展示方式</p>

      <SettingGroup>
        <SettingRow title="添加固定文件夹" desc="输入完整路径、点击浏览选择，或直接在面板中拖拽添加">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="text-input"
              style={{ width: 260 }}
              placeholder="例如 D:\Projects"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
            />
            <button className="btn btn-primary btn-sm" onClick={() => void handleAdd()}>
              添加
            </button>
            <button className="btn btn-sm" onClick={() => void handlePick()}>
              浏览…
            </button>
          </div>
        </SettingRow>
        {error && (
          <div className="setting-row">
            <div className="setting-desc" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          </div>
        )}
      </SettingGroup>

      <SettingGroup>
        {pinned.length === 0 && (
          <div className="setting-row">
            <div className="setting-desc">暂无固定文件夹</div>
          </div>
        )}
        {pinned.map((f) => (
          <div className="folder-manage-item" key={f.id}>
            <span
              className="folder-color-dot"
              style={{ background: f.color ?? "var(--accent)" }}
            />
            <button
              className="folder-name"
              style={{ color: "var(--text-primary)" }}
              title="点击重命名"
              onClick={() => void handleRename(f.id, f.name)}
            >
              {f.name}
            </button>
            <span className="folder-path" title={f.path}>
              {f.path}
            </span>
            <button
              className="icon-btn"
              title="切换颜色标签"
              onClick={() => void handleColor(f.id)}
            >
              <IconPalette size={14} />
            </button>
            <button
              className="icon-btn"
              title="删除"
              onClick={() => void remove(f.id)}
            >
              <IconTrash size={14} />
            </button>
          </div>
        ))}
      </SettingGroup>

      <SettingGroup>
        <SettingRow title="显示访问次数" desc="在面板条目上展示累计打开次数">
          <Switch
            checked={config.folder.show_visit_count}
            onChange={(v) => patch({ show_visit_count: v })}
          />
        </SettingRow>
        <SettingRow title="面板布局模式" desc="分区内卡片的展示方式">
          <Segmented
            value={config.folder.layout}
            options={[
              { value: "grid", label: "网格" },
              { value: "list", label: "列表" },
            ]}
            onChange={(v) => patch({ layout: v })}
          />
        </SettingRow>
        <SettingRow title="分区排布方式" desc="固定 / 最常访问两个分区的面板布局">
          <Segmented
            value={config.folder.split}
            options={[
              { value: "columns", label: "左右分栏" },
              { value: "rows", label: "上下分栏" },
            ]}
            onChange={(v) => patch({ split: v })}
          />
        </SettingRow>
        <SettingRow title="每页数量" desc="每个分区每页展示的文件夹数，超出可翻页">
          <Segmented
            value={String(config.folder.page_size)}
            options={[
              { value: "8", label: "8" },
              { value: "12", label: "12" },
              { value: "16", label: "16" },
              { value: "24", label: "24" },
            ]}
            onChange={(v) => patch({ page_size: Number(v) })}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
