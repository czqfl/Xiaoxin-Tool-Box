/** 剪贴板条目：预览 + 元信息 + hover 操作按钮（含智能文本转换与编辑） */
import { useEffect, useMemo, useState } from "react";
import type { PointerEvent } from "react";
import type { ClipEntry } from "../../types";
import { relativeTime } from "../../core/format";
import { copyText } from "../../core/tauri";
import { useClipboardStore } from "../../stores/clipboardStore";
import { ContextMenu, type MenuItem } from "../folder/ContextMenu";
import { detectActions, type TransformAction } from "./transform";
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconEdit,
  IconFiles,
  IconImage,
  IconLink,
  IconPin,
  IconPlus,
  IconRichText,
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

  // entryId 变化时必须重置 src：组件实例可能被 React 复用到另一条目上
  // （列表渲染漏 key 等场景），残留旧 data-url 会显示不相干的图片
  useEffect(() => {
    setSrc(useClipboardStore.getState().imageCache[entryId] ?? "");
  }, [entryId]);

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
  /** 顺序模式下的队列序号（1 = 下一条待粘贴） */
  queueOrder?: number;
  /** 顺序模式下是否为当前待粘贴项 */
  isCurrent: boolean;
  selected: boolean;
  onPaste: () => void;
  /** 顺序模式下上移/下移队列位置（undefined 时隐藏按钮） */
  onMove?: (dir: "up" | "down") => void;
  /** 是否允许上移/下移（队首不可上移、队尾不可下移） */
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** 顺序模式：点击后弹出输入框，手动新增一条数据插入队列 */
  onInsert?: () => void;
  /** 自实现拖拽排序（HTML5 draggable 在 Tauri 透明窗口不可靠，改用 pointer 事件） */
  dragging: boolean;
  dragOver: boolean;
  /** 按下时上报起点（仅顺序模式生效，按钮区不触发） */
  onPointerDown: (e: PointerEvent) => void;
  /** 注册条目 DOM 供面板计算悬停目标 */
  registerRef: (el: HTMLDivElement | null) => void;
}

export function ClipboardItem({
  entry,
  queueOrder,
  isCurrent,
  selected,
  onPaste,
  onMove,
  canMoveUp,
  canMoveDown,
  onInsert,
  dragging,
  dragOver,
  onPointerDown,
  registerRef,
}: Props) {
  const { remove, toggleFavorite, togglePin, replaceText, updateText } =
    useClipboardStore();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  /** 顺序模式下按钮组精简：只保留队列操作 + 复制/删除 */
  const sequential = !!onMove;
  /** 按内容类型检测可用的转换操作 */
  const actions = useMemo(() => detectActions(entry.text), [entry.text]);
  /** 内联编辑状态：编辑框替换预览区，保存/取消退出 */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  /** 仅文本类（普通文本/富文本/链接）可编辑 */
  const editable =
    entry.kind === "text" || entry.kind === "richtext" || entry.kind === "link";

  /** 保存编辑内容（后端持久化，乐观更新） */
  const saveEdit = async () => {
    const t = draft.trim();
    if (!t) return;
    setEditing(false);
    await updateText(entry.id, t);
  };

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
      <IconImage size={15} className="clip-ic-image" />
    ) : entry.kind === "files" ? (
      <IconFiles size={15} className="clip-ic-files" />
    ) : entry.kind === "link" ? (
      <IconLink size={15} className="clip-ic-link" />
    ) : entry.kind === "richtext" ? (
      <IconRichText size={15} className="clip-ic-richtext" />
    ) : (
      <IconText size={15} className="clip-ic-text" />
    );

  /** 类型徽标：图片 / 富文本 / 链接 / 文件 / 文本（meta 行首个 chip） */
  const typeLabel: Record<string, { text: string; cls: string }> = {
    image: { text: "图片", cls: "image" },
    richtext: { text: "富文本", cls: "richtext" },
    link: { text: "链接", cls: "link" },
    files: { text: "文件", cls: "files" },
    text: { text: "文本", cls: "text" },
  };
  const t = typeLabel[entry.kind] ?? typeLabel.text;

  return (
    <div
      className={[
        "clip-item",
        selected ? "selected" : "",
        isCurrent ? "current" : "",
        dragging ? "dragging" : "",
        dragOver ? "drag-over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        // 编辑中点击条目不视为粘贴
        if (!editing) onPaste();
      }}
      title={editing ? undefined : entry.text ?? entry.preview}
      ref={registerRef}
      onPointerDown={(e) => {
        if (!editing) onPointerDown(e);
      }}
    >
      {queueOrder ? (
        <span
          className={`clip-order${queueOrder === 1 ? " next" : ""}`}
          title={queueOrder === 1 ? "下一条粘贴（Ctrl+V 带出）" : `队列第 ${queueOrder} 条`}
        >
          {queueOrder}
        </span>
      ) : null}

      {entry.kind === "image" ? (
        <ImageThumb entryId={entry.id} />
      ) : (
        <div className="clip-icon">{kindIcon}</div>
      )}

      <div className="clip-main">
        {editing ? (
          <div className="clip-edit-box" onClick={(e) => e.stopPropagation()}>
            <textarea
              className="clip-edit-input"
              value={draft}
              autoFocus
              placeholder="编辑文本内容…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // 阻止冒泡：编辑框的 Enter/Esc 不触发全局粘贴/关闭面板
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === "Escape") {
                  setEditing(false);
                }
              }}
            />
            <div className="clip-edit-actions">
              <button
                className="btn btn-primary btn-sm"
                disabled={!draft.trim()}
                onClick={() => void saveEdit()}
              >
                保存
              </button>
              <button className="btn btn-sm" onClick={() => setEditing(false)}>
                取消
              </button>
              <span className="edit-hint">Enter 保存 · Esc 取消</span>
            </div>
          </div>
        ) : (
          <>
            <div className="clip-preview">{entry.preview}</div>
            <div className="clip-meta">
              <span className={`clip-type clip-type-${t.cls}`} title="内容类型">
                {t.text}
              </span>
              <span>{relativeTime(entry.created_at)}</span>
              {entry.source_app && <span className="clip-source">{entry.source_app}</span>}
              {entry.favorite && (
                <span className="badge clip-fav-badge">
                  <IconStar size={10} filled />
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {!editing && (
        <div className="clip-actions" onClick={(e) => e.stopPropagation()}>
          {sequential ? (
            /* 顺序模式：只保留 插入 / 上移 / 下移 / 编辑 / 复制 / 删除，
               普通模式才展示的智能转换、收藏、置顶放到普通模式按钮区 */
            <>
              {onInsert && (
                <button
                  className="icon-btn"
                  title="新增一条粘贴数据（手动输入文本插入队列，成为下一条）"
                  onClick={onInsert}
                >
                  <IconPlus size={14} />
                </button>
              )}
              <button
                className="icon-btn"
                title={canMoveUp ? "队列中上移一位" : "已是队列第一条"}
                disabled={!canMoveUp}
                onClick={() => onMove?.("up")}
              >
                <IconArrowUp size={14} />
              </button>
              <button
                className="icon-btn"
                title={canMoveDown ? "队列中下移一位" : "已是队列最后一条"}
                disabled={!canMoveDown}
                onClick={() => onMove?.("down")}
              >
                <IconArrowDown size={14} />
              </button>
            </>
          ) : (
            <>
              {actions.length > 0 && (
                <button
                  className="icon-btn"
                  title="智能转换"
                  onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
                >
                  <IconWand size={14} />
                </button>
              )}
              <button className="icon-btn" title="收藏" onClick={() => toggleFavorite(entry.id)}>
                <IconStar size={14} filled={entry.favorite} />
              </button>
              <button
                className={`icon-btn ${entry.pinned ? "active" : ""}`}
                title={entry.pinned ? "取消置顶" : "置顶"}
                onClick={() => togglePin(entry.id)}
              >
                <IconPin size={14} filled={entry.pinned} />
              </button>
            </>
          )}
          {editable && (
            <button
              className="icon-btn"
              title="编辑内容"
              onClick={() => {
                setDraft(entry.text ?? "");
                setEditing(true);
              }}
            >
              <IconEdit size={14} />
            </button>
          )}
          <button className="icon-btn" title="粘贴" onClick={onPaste}>
            <IconCopy size={14} />
          </button>
          <button
            className="icon-btn icon-btn-danger"
            title="删除"
            onClick={() => remove(entry.id)}
          >
            <IconTrash size={14} />
          </button>
        </div>
      )}

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
