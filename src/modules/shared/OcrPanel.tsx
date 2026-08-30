/** 统一的 OCR 结果弹窗：贴图（PinWindow）与截图（ScreenshotOverlay）共用，
 *  保证两种场景下"文字识别"功能与交互完全一致——同样的标题、同样的
 *  「原文 / 译文」两列对照、同样的复制全部 / 复制译文 / 翻译 / 返回原文 / 关闭。
 *
 *  设计要点：
 *  - 纯展示 + 回调，不持有任何 OCR/翻译状态；所有数据与动作由调用方注入，
 *    因此贴图与截图各自用自己的 OCR 引擎（pin_ocr / shot_ocr）与翻译后端，
 *    但弹窗长相一致。
 *  - 定位由调用方通过 style 注入（截图：相对选区 right/left 绝对定位；
 *    贴图：相对贴图窗 top-right 绝对定位），本组件只定 `position:absolute`
 *    与玻璃卡片外观，便于两种窗口复用。
 *  - 主题变量全部带兜底（贴图窗不加载 base/theme.css，必须用 fallback
 *    才能拿到可读配色），与截图窗用同一套 --accent-rgb 等变量。
 */
import type { CSSProperties } from "react";
import type { ShotOcrLine } from "../../core/tauri";
import "./ocr-panel.css";

/** 逐行对照结果：pairs 与送译的原文行一一对齐 */
export interface OcrTransPair { src: string; out: string; ok: boolean; pending: boolean }
export interface OcrTransState { pairs: OcrTransPair[]; err: string }

export interface OcrPanelProps {
  /** 识别出的行（原文列表 + 词矩形） */
  lines: ShotOcrLine[];
  /** 当前阶段：loading（识别中）/ done（已出结果）/ error（失败） */
  phase: "loading" | "done" | "error";
  /** error 阶段文案 */
  error?: string;
  /** 翻译态：null=未翻译（仅原文）；非 null=两列对照 */
  trans: OcrTransState | null;
  /** 翻译进行中（译文逐行回填） */
  translating: boolean;
  onClose: () => void;
  onCopyAll: () => void;
  onCopyTrans: () => void;
  onTranslate: () => void;
  onReturn: () => void;
  /** 定位样式（left/top/right/width/maxHeight 等），由调用方注入 */
  style?: CSSProperties;
}

export function OcrPanel(p: OcrPanelProps) {
  const { lines, phase, error, trans, translating, onClose, onCopyAll, onCopyTrans, onTranslate, onReturn, style } = p;
  const tTotal = trans?.pairs.length ?? 0;
  const tDone = trans?.pairs.filter((x) => !x.pending).length ?? 0;
  const hasLines = lines.length > 0;
  return (
    <div className="ocr-panel" style={style}>
      <div className="ocr-head">
        <b>文字识别</b>
        <span style={{ flex: 1 }} />
        {phase === "done" && hasLines && (
          <>
            {trans && <button onClick={onReturn}>返回原文</button>}
            {trans
              ? (tDone > 0 && <button onClick={onCopyTrans}>复制译文</button>)
              : <button onClick={onCopyAll}>复制全部</button>}
            {!trans && <button onClick={onTranslate}>翻译</button>}
          </>
        )}
        <button onClick={onClose}>关闭</button>
      </div>
      {phase === "loading" && <div className="ocr-body ocr-muted">识别中…</div>}
      {phase === "error" && <div className="ocr-body ocr-err">{error}</div>}
      {phase === "done" && (
        trans ? (
          trans.err ? (
            <div className="ocr-body ocr-err">翻译失败：{trans.err}</div>
          ) : (
            <div className="ocr-trans">
              <div className="ocr-thead">
                <span>原文</span>
                <span>{translating ? `译文 ${tDone}/${tTotal}…` : "译文"}</span>
              </div>
              <div className="ocr-pairs">
                {trans.pairs.map((pr, i) => (
                  <div key={i} className="ocr-pair">
                    <div className="ocr-pcell">{pr.src}</div>
                    {pr.pending ? (
                      <div className="ocr-pcell"><i className="ocr-pwait" /></div>
                    ) : (
                      <div className={`ocr-pcell ocr-pout${pr.ok ? "" : " ocr-pfail"}`}>{pr.out}</div>
                    )}
                  </div>
                ))}
              </div>
              {!translating && trans.pairs.some((x) => !x.ok) && (
                <div className="ocr-note">部分行未翻译（网络/配额或行数超出上限），已回退显示原文</div>
              )}
            </div>
          )
        ) : (
          <div className="ocr-lines">
            {lines.length === 0 && (
              <div className="ocr-body ocr-muted">未识别到文字（可调整选区后重新点击识别）</div>
            )}
            {lines.map((l, i) => (
              <div key={i} className="ocr-line">{l.text}</div>
            ))}
          </div>
        )
      )}
      {phase === "done" && hasLines && (
        <div className="ocr-selbar">
          {trans
            ? "划选任一列文字后 Ctrl+C 复制，或点上方「复制译文」"
            : "划选文字后 Ctrl+C 复制，或点上方「复制全部」"}
        </div>
      )}
    </div>
  );
}
