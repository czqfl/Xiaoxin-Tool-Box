/** 文件夹卡片：网格/列表两种形态，支持固定区拖拽排序 */
import type { DragEvent, MouseEvent } from "react";
import type { FolderEntry } from "../../types";
import { IconFolder } from "../../components/icons";

interface Props {
  folder: FolderEntry;
  layout: "grid" | "list";
  showCount: boolean;
  /** 是否允许拖拽排序（仅固定项） */
  draggable: boolean;
  dragging: boolean;
  dragOver: boolean;
  onOpen: () => void;
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
  draggable,
  dragging,
  dragOver,
  onOpen,
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
      <div className="folder-icon">
        <IconFolder size={layout === "grid" ? 20 : 16} />
        {folder.color && (
          <span className="folder-color-dot" style={{ background: folder.color }} />
        )}
      </div>
      <span className="folder-name">{folder.name}</span>
      {layout === "list" && <span className="folder-path">{folder.path}</span>}
      {showCount && folder.visit_count > 0 && (
        <span className="badge folder-count">{folder.visit_count} 次</span>
      )}
    </div>
  );
}
