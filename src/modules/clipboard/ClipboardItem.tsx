/** 剪贴板条目：预览 + 元信息 + hover 操作按钮（含智能文本转换） */
import { useEffect, useMemo, useState } from "react";
import type { ClipEntry } from "../../types";
import { relativeTime } from "../../core/format";
import { copyText } from "../../core/tauri";
import { useClipboardStore } from "../../stores/clipboardStore";
import { ContextMenu, type MenuItem } from "../folder/ContextMenu";
import { detectActions, type TransformAction } from "./transform";
import {
  IconCopy,
  IconFiles,
  IconImage,
  IconPin,
  IconPlus,
  IconStar,
  IconText,
  IconTrash,
  IconWand,
} from "../../components/icons";

/** 缩略图：异步加载 data-url 并缓存；图片文件由后端后台保存，
 *  首次请求可能抢跑失败，失败后自动重试若干次 */
function ImageThumb({ entryId }: { entryId: string }) {
  const fetchImage = useClipboardStore((s) => s.fetchImage);
  const cached = useClipboardStore((s) => s.imageCache[entryId]);
  const [src, setSrc] = useState(cached ?? "");

  useEffect(() => {
    if (src) return;
    let cancelled = false;
    let attempts = 0;
    const tryLoad = () => {
      if (cancelled) return;
      fetchImage(entryId).then((s) => {
        if (cancelled) return;
        if (s) {
          setSrc(s);
        } else if (attempts < 6) {
          attempts += 1;
          setTimeout(tryLoad, 400);
        }
      });
    };
    tryLoad();
    return () => {
      cancelled = true;
    };
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
  /** 顺序模式下显示"加入队列"按钮（视为重新复制一次） */
  onEnqueue?: () => void;
}

export function ClipboardItem({
  entry,
  hotkeyIndex,
  queueOrder,
  isCurrent,
  selected,
  onPaste,
  onEnqueue,
}: Props) {
  const { remove, toggleFavorite, togglePin, replaceText } = useClipboardStore();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** 按内容类型检测可用的转换操作 */
  const actions = useMemo(() => detectActions(entry.text), [entry.text]);

  /** 执行转换：写回系统剪贴板（不重复记录）并同步更新条目 */
  const runTransform = async (action: TransformAction) => {
    setMenu(null);
    try {
      const result = action.run(entry.text ?? "");
      await copyText(result);
      replaceText(entry.id, result);
    } catch (err) {
      // 转换失败静默降级（各检测函数自带容错，正常不会走到这里）；
      // 不用 alert：WebView2 透明置顶窗口弹原生对话框有崩溃风险
      console.error("智能转换失败", err);
    }
  };

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
        {actions.length > 0 && (
          <button
            className="icon-btn"
            title="智能转换"
            onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
          >
            <IconWand size={14} />
          </button>
        )}
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
        {onEnqueue && (
          <button
            className="icon-btn"
            title="加入粘贴队列（视为重新复制一次；LIFO 下立即成为下一条，FIFO 下排在队尾）"
            onClick={onEnqueue}
          >
            <IconPlus size={14} />
          </button>
        )}
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

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={actions.map<MenuItem>((a) => ({
            label: a.label,
            icon: <IconWand size={13} />,
            onClick: () => void runTransform(a),
          }))}
        />
      )}
    </div>
  );
}
