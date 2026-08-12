/** 翻译面板（类网页版翻译布局）：上方原文可编辑，下方译文，底部源/目标语言设置。
 *  划词触发后结果经事件推送；面板内可改语言、重新翻译、一键复制。 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TranslateResult } from "../../types";
import { onEvent } from "../../core/events";
import { copyText, diagLog, lastTranslateResult, translateText } from "../../core/tauri";
import { IconClose, IconCopy } from "../../components/icons";
import { LANG_OPTIONS, langLabel } from "./langs";
import "../../styles/panel.css";
import "./translate.css";

const EVT_RESULT = "translate://result";

/** 关闭弹窗（按钮/Esc/失焦共用） */
function closePopup() {
  getCurrentWindow().hide().catch(() => undefined);
}

export function TranslatePopup() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  /** 原文输入（可编辑，翻译面板内修改后重新翻译） */
  const [text, setText] = useState("");
  const [fromLang, setFromLang] = useState("auto");
  const [toLang, setToLang] = useState("zh");
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 划词触发的结果：填充原文与译文（保留用户已选的源/目标语言，仅更新内容）
  const applyResult = (r: TranslateResult) => {
    setResult(r);
    if (r.text) setText(r.text);
  };

  useEffect(() => {
    void diagLog("TranslatePopup mounted");
    getCurrentWindow().setFocus().catch(() => undefined);
    // 挂载兜底：快捷键触发后窗口先 show、事件可能早于监听，先拉一次最近结果
    void lastTranslateResult().then((r) => {
      if (r) applyResult(r);
    });
    const cleanup: Array<() => void> = [];
    onEvent<TranslateResult>(EVT_RESULT, applyResult).then((un) =>
      cleanup.push(un)
    );
    // 失焦自动隐藏（与其它面板一致）
    const onBlur = () => {
      getCurrentWindow().hide().catch(() => undefined);
    };
    window.addEventListener("blur", onBlur);
    cleanup.push(() => window.removeEventListener("blur", onBlur));
    // Esc 关闭（窗口有焦点后生效）
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePopup();
      }
    };
    window.addEventListener("keydown", onKey);
    cleanup.push(() => window.removeEventListener("keydown", onKey));
    // 点击弹窗任意处即请求聚焦：后台置前被前台锁拒绝时弹窗无焦点，
    // 导致 Esc 无效、失焦不触发、无法拖动；点击后一切恢复正常
    const onPointerDown = () => {
      if (!document.hasFocus()) {
        getCurrentWindow().setFocus().catch(() => undefined);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    cleanup.push(() => document.removeEventListener("pointerdown", onPointerDown));
    return () => cleanup.forEach((fn) => fn());
  }, []);

  /** 面板内手动翻译：用当前原文与所选语言 */
  const doTranslate = async () => {
    const t = text.trim();
    if (!t) return;
    setTranslating(true);
    try {
      const r = await translateText(t, fromLang, toLang);
      setResult(r);
    } catch (err) {
      setResult({
        text: t,
        translation: `翻译失败：${err instanceof Error ? err.message : String(err)}`,
        from: fromLang,
        to: toLang,
        provider: "",
      });
    } finally {
      setTranslating(false);
    }
  };

  const doCopy = async () => {
    if (!result) return;
    try {
      // 复制译文不污染剪贴板历史（后端 SUPPRESS_WATCH）
      await copyText(result.translation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error("复制译文失败", err);
    }
  };

  /** 头部拖动（JS 手柄）：不用 data-tauri-drag-region——它会抢占头部所有
   *  mousedown，导致关闭按钮点击失效；这里避开按钮后调 startDragging */
  const onHeadMouseDown = (e: React.MouseEvent) => {
    void diagLog("head mousedown");
    if ((e.target as HTMLElement).closest("button")) return;
    getCurrentWindow().startDragging().catch(() => undefined);
  };

  return (
    <div className="panel">
      <div className="panel-shell translate-shell">
        <div className="translate-head" onMouseDown={onHeadMouseDown}>
          <span className="translate-title">翻译</span>
          {result?.from && (
            <span className="badge badge-accent">
              {langLabel(result.from)} → {langLabel(result.to)}
            </span>
          )}
          {/* 关闭按钮（JS 拖动手柄已避开按钮，点击正常触发） */}
          <button
            className="icon-btn translate-close"
            title="关闭（Esc）"
            onClick={() => {
              void diagLog("close click");
              closePopup();
            }}
          >
            <IconClose size={13} />
          </button>
        </div>

        {/* 上方：原始内容（可编辑） */}
        <textarea
          ref={inputRef}
          className="translate-src"
          value={text}
          placeholder="输入或粘贴要翻译的内容…"
          onChange={(e) => setText(e.target.value)}
        />

        {/* 下方：翻译内容，复制按钮浮在结果框内 */}
        <div className="translate-dst">
          {translating ? (
            "翻译中…"
          ) : (
            <>{result?.translation ?? "划词或输入内容后翻译"}</>
          )}
          {result && (
            <button
              className="icon-btn translate-dst-copy"
              title="复制译文"
              disabled={translating}
              onClick={() => void doCopy()}
            >
              <IconCopy size={14} />
            </button>
          )}
        </div>

        {/* 底部：源语言 / 目标语言 / 操作 */}
        <div className="translate-bar">
          <select
            className="lang-select"
            value={fromLang}
            title="源语言"
            onChange={(e) => setFromLang(e.target.value)}
          >
            {LANG_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.value === "auto" ? "源语言：自动检测" : `源语言：${l.label}`}
              </option>
            ))}
          </select>
          <span className="lang-arrow">→</span>
          <select
            className="lang-select"
            value={toLang}
            title="目标语言"
            onChange={(e) => setToLang(e.target.value)}
          >
            {LANG_OPTIONS.filter((l) => l.value !== "auto").map((l) => (
              <option key={l.value} value={l.value}>
                {`目标语言：${l.label}`}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm translate-btn"
            disabled={translating || !text.trim()}
            onClick={() => void doTranslate()}
          >
            {translating ? "翻译中…" : "翻译"}
          </button>
          <span className="translate-status">
            {copied ? "已复制" : "Esc 关闭"}
          </span>
        </div>
      </div>
    </div>
  );
}
