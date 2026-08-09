/** 剪贴板条目：预览 + 元信息 + hover 操作按钮 */
import { useEffect, useState } from "react";
import type { ClipEntry } from "../../types";
import { relativeTime } from "../../core/format";
import { useClipboardStore } from "../../stores/clipboardStore";
import {
  IconCopy,
  IconFiles,
  IconImage,
  IconPin,
  IconStar,
  IconText,
  IconTrash,
} from "../../components/icons";

/** 缩略图：异步加载 data-url 并缓存 */
function ImageThumb({ entryId }: { entryId: string }) {
  const fetchImage = useClipboardStore((s) => s.fetchImage);
  const cached = useClipboardStore((s) => s.imageCache[entryId]);
  const [src, setSrc] = useState(cached ?? "");

  useEffect(() => {
    if (!src) {
      fetchImage(entryId).then(setSrc);
    }
  }, [entryId, src, fetchImage]);

  if (!src) {
    return (
      <div className="clip-thumb clip-thumb-placeholder">
        <IconImage size={18} />
      </div>
    );
  }
  return <img className="clip-thumb" src={src} alt="图片预览" draggable={false} />;
}

interface Props {
  entry: ClipEntry;
  /** 普通模式下的序号（1-9 快速粘贴），顺序模式传 0 隐藏 */
  hotkeyIndex: number;
  /** 顺序模式下的队列序号（1 = 下一条待粘贴） */
  queueOrder?: number;
  /** 顺序模式下是否为当前待粘贴项 */
  isCurrent: boolean;
  selected: boolean;
  onPaste: () => void;
}

export function ClipboardItem({
  entry,
  hotkeyIndex,
  queueOrder,
  isCurrent,
  selected,
  onPaste,
}: Props) {
  const { remove, toggleFavorite, togglePin } = useClipboardStore();

  const kindIcon =
    entry.kind === "image" ? (
      <IconImage size={15} />
    ) : entry.kind === "files" ? (
      <IconFiles size={15} />
    ) : (
      <IconText size={15} />
    );

  return (
    <div
      className={[
        "clip-item",
        selected ? "selected" : "",
        isCurrent ? "current" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onPaste}
      title={entry.text ?? entry.preview}
    >
      {queueOrder ? (
        <span
          className={`clip-order${queueOrder === 1 ? " next" : ""}`}
          title={queueOrder === 1 ? "下一条粘贴（Ctrl+V 带出）" : `队列第 ${queueOrder} 条`}
        >
          {queueOrder}
        </span>
      ) : (
        hotkeyIndex > 0 &&
        hotkeyIndex <= 9 && <span className="kbd clip-hotkey">{hotkeyIndex}</span>
      )}

      {entry.kind === "image" ? (
        <ImageThumb entryId={entry.id} />
      ) : (
        <div className="clip-icon">{kindIcon}</div>
      )}

      <div className="clip-main">
        <div className="clip-preview">{entry.preview}</div>
        <div className="clip-meta">
          <span>{relativeTime(entry.created_at)}</span>
          {entry.source_app && <span className="clip-source">{entry.source_app}</span>}
          {entry.favorite && (
            <span className="badge badge-accent">
              <IconStar size={10} filled />
            </span>
          )}
        </div>
      </div>

      <div className="clip-actions" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="粘贴" onClick={onPaste}>
          <IconCopy size={14} />
        </button>
        <button
          className={`icon-btn ${entry.favorite ? "active" : ""}`}
          title={entry.favorite ? "取消收藏" : "收藏"}
          onClick={() => toggleFavorite(entry.id)}
        >
          <IconStar size={14} filled={entry.favorite} />
        </button>
        <button
          className={`icon-btn ${entry.pinned ? "active" : ""}`}
          title={entry.pinned ? "取消置顶" : "置顶"}
          onClick={() => togglePin(entry.id)}
        >
          <IconPin size={14} filled={entry.pinned} />
        </button>
        <button
          className="icon-btn icon-btn-danger"
          title="删除"
          onClick={() => remove(entry.id)}
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}
