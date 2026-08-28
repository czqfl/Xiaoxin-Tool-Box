/** 文件夹设置页：固定列表管理（增删改）、显示选项、布局模式。
 *  颜色标签在文件夹面板右键菜单设置，设置页不再提供颜色选择。 */
import { useEffect, useState } from "react";
import { useConfigStore } from "../stores/configStore";
import { sortFolders, useFolderStore } from "../stores/folderStore";
import * as api from "../modules/folder/api";
import { Segmented, SettingGroup, SettingRow, Switch } from "./components";
import { IconTrash } from "../components/icons";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ShortcutRow } from "./ShortcutRow";

export function FolderPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const { folders, loaded, refresh, add, remove } = useFolderStore();
  const [newPath, setNewPath] = useState("");
  const [error, setError] = useState("");
  /** 重命名弹窗目标（替代 window.prompt） */
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  /** 删除二次确认目标 */
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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

  const handleRename = (id: string, current: string) => {
    setRenameTarget({ id, name: current });
    setRenameValue(current);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (name && name !== renameTarget.name) {
      await api.renameFolder(renameTarget.id, name);
      await refresh();
    }
    setRenameTarget(null);
  };

  const { pinned } = sortFolders(folders);

  return (
    <div className="settings-page">
      <h2>文件夹设置</h2>
      <p className="page-desc">管理固定文件夹与面板展示方式</p>

      <div className="setting-group-title">功能</div>
      <SettingGroup>
        <ShortcutRow
          target="folder"
          title="呼出文件夹面板"
          desc="点击快捷键后按下新组合，例如 Ctrl+Alt+F"
        />
      </SettingGroup>

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
              title={f.color ?? "无颜色"}
            />
            <button
              className="folder-name"
              style={{ color: "var(--text-primary)" }}
              title="点击重命名"
              onClick={() => handleRename(f.id, f.name)}
            >
              {f.name}
            </button>
            <span className="folder-path" title={f.path}>
              {f.path}
            </span>
            <button
              className="icon-btn"
              title="删除"
              onClick={() => setDeleteTarget({ id: f.id, name: f.name })}
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
        <SettingRow title="面板置顶显示" desc="文件夹面板始终保持在其他窗口之上">
          <Switch
            checked={config.folder.always_on_top}
            onChange={(v) => patch({ always_on_top: v })}
          />
        </SettingRow>
        <SettingRow
          title="记录资源管理器访问"
          desc="自动统计在 Windows 资源管理器中打开过的文件夹，计入“最常访问”排序"
        >
          <Switch
            checked={config.folder.track_explorer}
            onChange={(v) => patch({ track_explorer: v })}
          />
        </SettingRow>
        <SettingRow title="面板布局模式" desc="分区内卡片的展示方式，目录树按父目录分组缩进展示">
          <Segmented
            value={config.folder.layout}
            options={[
              { value: "grid", label: "网格" },
              { value: "list", label: "列表" },
              { value: "tree", label: "目录树" },
            ]}
            onChange={(v) => patch({ layout: v })}
          />
        </SettingRow>
        <SettingRow title="默认终端" desc="点击卡片/条目上的终端快捷按钮时，使用哪种终端打开当前文件夹">
          <Segmented
            value={config.folder.terminal_shell}
            options={[
              { value: "wt", label: "Windows Terminal" },
              { value: "cmd", label: "命令提示符" },
              { value: "powershell", label: "PowerShell" },
            ]}
            onChange={(v) => patch({ terminal_shell: v })}
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

      {/* 重命名弹窗（替代 window.prompt） */}
      {renameTarget && (
        <Modal
          open
          onClose={() => setRenameTarget(null)}
          title={`重命名「${renameTarget.name}」`}
          actions={
            <>
              <button className="btn" onClick={() => setRenameTarget(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={() => void submitRename()}>
                确定
              </button>
            </>
          }
        >
          <input
            className="text-input"
            value={renameValue}
            autoFocus
            placeholder="新名称"
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRename();
              }
            }}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) {
            await remove(deleteTarget.id);
          }
        }}
        title={`移除「${deleteTarget?.name ?? ""}」？`}
        message="仅从固定列表移除，不会删除磁盘文件。"
        danger
        confirmLabel="移除"
      />
    </div>
  );
}
