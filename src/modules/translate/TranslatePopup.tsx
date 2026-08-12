/** 划词翻译弹窗：显示原文/译文，一键复制，失焦或 Esc 关闭。
 *  结果由快捷键触发后端翻译后通过事件推送；挂载时先拉取最近一次结果兜底。 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TranslateResult } from "../../types";
import { onEvent } from "../../core/events";
import { copyText, lastTranslateResult } from "../../core/tauri";
import { IconCopy } from "../../components/icons";
import "../../styles/panel.css";
import "./translate.css";

const EVT_RESULT = "translate://result";

/** 服务商语言代码 -> 中文标签（有道/百度编码不同，统一映射） */
function langLabel(code: string): string {
  const map: Record<string, string> = {
    auto: "自动",
    zh: "中文",
    "zh-CHS": "中文",
    en: "英文",
    ja: "日文",
    jp: "日文",
    ko: "韩文",
    kor: "韩文",
    fr: "法文",
    fra: "法文",
    de: "德文",
    ru: "俄文",
    es: "西文",
    spa: "西文",
  };
  return map[code] ?? code;
}

export function TranslatePopup() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 挂载兜底：快捷键触发后窗口先 show、事件可能早于监听，先拉一次最近结果
    void lastTranslateResult().then((r) => {
      if (r) setResult(r);
    });
    const cleanup: Array<() => void> = [];
    onEvent<TranslateResult>(EVT_RESULT, setResult).then((un) =>
      cleanup.push(un)
    );
    // 失焦自动隐藏（与其它面板一致）
    const onBlur = () => {
      getCurrentWindow().hide().catch(() => undefined);
    };
    window.addEventListener("blur", onBlur);
    cleanup.push(() => window.removeEventListener("blur", onBlur));
    // Esc 关闭
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        getCurrentWindow().hide().catch(() => undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    cleanup.push(() => window.removeEventListener("keydown", onKey));
    return () => cleanup.forEach((fn) => fn());
  }, []);

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

  return (
    <div className="panel">
      <div className="panel-shell translate-shell">
        <div className="translate-head" data-tauri-drag-region>
          <span className="translate-title">划词翻译</span>
          {result?.from && (
            <span className="badge badge-accent">
              {langLabel(result.from)} → {langLabel(result.to)}
            </span>
          )}
        </div>
        <div className="translate-body">
          {!result ? (
            <div className="empty-state">未选中文本</div>
          ) : (
            <>
              <div className="translate-src" title={result.text}>
                {result.text}
              </div>
              <div className="translate-dst" title={result.translation}>
                {result.translation}
              </div>
            </>
          )}
        </div>
        <div className="translate-footer">
          <button
            className="icon-btn"
            title="复制译文"
            disabled={!result}
            onClick={() => void doCopy()}
          >
            <IconCopy size={14} />
          </button>
          <span className="translate-status">
            {copied ? "已复制" : result ? "Esc 关闭" : "…"}
          </span>
        </div>
      </div>
    </div>
  );
}
