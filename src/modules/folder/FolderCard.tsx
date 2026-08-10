/** 文件夹卡片：网格/列表两种形态，支持固定区拖拽排序与终端快捷打开 */
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import type { FolderEntry, FolderLayout, TerminalShell } from "../../types";
import { IconBranch, IconFolder, IconTerminal } from "../../components/icons";

interface Props {
  folder: FolderEntry;
  layout: FolderLayout;
  showCount: boolean;
  /** 终端快捷按钮使用的终端类型 */
  terminalShell: TerminalShell;
  /** Git 当前分支（非仓库为 undefined） */
  branch?: string;
  /** 是否允许拖拽排序（仅固定项） */
  draggable: boolean;
  dragging: boolean;
  dragOver: boolean;
  onOpen: () => void;
  /** 点击终端快捷按钮：在默认终端中打开该文件夹 */
  onOpenTerminal: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function FolderCard({
  folder,
  layout,
  showCount,
  terminalShell,
  branch,
  draggable,
  dragging,
  dragOver,
  onOpen,
  onOpenTerminal,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  return (
    <div
      className={[
        "folder-card",
        dragging ? "dragging" : "",
        dragOver ? "drag-over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={folder.path}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/folder-id", folder.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <div
        className="folder-icon"
        // 颜色标签注入 CSS 变量：有颜色的图标整体染色，便于按色快速定位
        style={{ "--folder-color": folder.color ?? "var(--accent)" } as CSSProperties}
      >
        <IconFolder size={layout === "grid" ? 18 : 15} />
        {folder.color && (
          <span className="folder-color-dot" style={{ background: folder.color }} />
        )}
      </div>
      <span className="folder-name">{folder.name}</span>
      {layout === "grid" ? (
        /* 网格：分支徽章与次数徽章并排一行，避免绝对定位压住名称 */
        <span className="folder-meta">
          {branch && (
            <span className="badge git-branch" title={`Git 分支：${branch}`}>
              <IconBranch size={10} />
              {branch}
            </span>
          )}
          {showCount && folder.visit_count > 0 && (
            <span className="badge folder-count">{folder.visit_count} 次</span>
          )}
        </span>
      ) : (
        <>
          {branch && (
            <span className="badge git-branch" title={`Git 分支：${branch}`}>
              <IconBranch size={10} />
              {branch}
            </span>
          )}
          {layout === "list" && <span className="folder-path">{folder.path}</span>}
          {showCount && folder.visit_count > 0 && (
            <span className="badge folder-count">{folder.visit_count} 次</span>
          )}
        </>
      )}
      <button
        className={`icon-btn term-btn ${layout === "grid" ? "term-btn-float" : ""}`}
        title={`在${terminalShell === "wt" ? "Windows Terminal" : terminalShell === "cmd" ? "命令提示符" : "PowerShell"}中打开`}
        onClick={(e) => {
          // 阻止冒泡：终端按钮不触发卡片打开
          e.stopPropagation();
          onOpenTerminal();
        }}
      >
        <IconTerminal size={layout === "grid" ? 13 : 14} />
      </button>
    </div>
  );
}
