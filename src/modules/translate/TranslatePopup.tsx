/** 翻译面板（类网页版翻译布局）：上方原文可编辑，下方译文，底部源/目标语言设置。
 *  划词触发后结果经事件推送；面板内可改语言、重新翻译、一键复制。 */
import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TranslateResult } from "../../types";
import { onEvent } from "../../core/events";
import { hideCurrentWindow } from "../../core/usePanel";
import { copyText, diagLog, lastTranslateResult, translateText } from "../../core/tauri";
import { IconClose, IconCopy } from "../../components/icons";
import { LANG_OPTIONS } from "./langs";
import "../../styles/panel.css";
import "./translate.css";

const EVT_RESULT = "translate://result";

/** 关闭弹窗（按钮/Esc/失焦共用） */
function closePopup() {
  hideCurrentWindow();
}

export function TranslatePopup() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  /** 原文输入（可编辑，翻译面板内修改后重新翻译） */
  const [text, setText] = useState("");
  const [fromLang, setFromLang] = useState("auto");
  const [toLang, setToLang] = useState("zh");
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** loading 镜像（供事件回调读取最新值，避免闭包捕获旧值） */
  const loadingRef = useRef(true);
  /** 拖动区按下守卫：点击/拖动 data-tauri-drag-region 头部会触发原生窗口拖动，
   *  期间 WebView2 瞬时失焦；该窗口内不隐藏面板、也不抢焦点，避免"点头部就关掉"。 */
  const dragGuardRef = useRef(false);
  /** 最近一次呼出时间戳：再次呼出时 reveal_popup 会让已聚焦的窗口短暂失焦，
   *  造成"刚弹出就被关"的误判，故呼出后一小段时间内忽略失焦隐藏。 */
  const lastStartAt = useRef(0);

  // 划词触发的结果：填充原文与译文（保留用户已选的源/目标语言，仅更新内容）
  const applyResult = (r: TranslateResult) => {
    if (r.text) setText(r.text);
    // translation 为空 = 后端只是先把【原文】就位（译文仍在路上），
    // 此时保持"翻译中"，不要当成一次完成的结果渲染。
    if (!r.translation) {
      setResult(null);
      return;
    }
    setResult(r);
    loadingRef.current = false;
    setLoading(false);
  };

  useEffect(() => {
    void diagLog("TranslatePopup mounted");
    // 挂载兜底：快捷键触发后窗口先 show、事件可能早于监听，先拉一次最近结果。
    // store 为 None 表示本次是"空面板呼出"（无选中），直接解除 loading，避免卡"翻译中"。
    void lastTranslateResult().then((r) => {
      if (r) applyResult(r);
      else {
        loadingRef.current = false;
        setLoading(false);
      }
    });
    const cleanup: Array<() => void> = [];
    onEvent<TranslateResult>(EVT_RESULT, applyResult).then((un) =>
      cleanup.push(un)
    );
    // 呼出：后端已读取选中文本（仅 UI Automation，不碰剪贴板），事件带出原文。
    // 有原文 → 进入"翻译中"等译文；无原文（用户没选中）→ 仅呼出空面板，不翻译、
    // 立即可手动输入/粘贴后点击"翻译"。
    onEvent<{ text?: string }>("translate://start", (p) => {
      const t = p?.text ?? "";
      setText(t);
      setResult(null);
      lastStartAt.current = Date.now();
      if (t.trim()) {
        // 有原文：进入"翻译中"，等后端异步 emit 的译文到达
        loadingRef.current = true;
        setLoading(true);
        // 兜底：若 14s 内结果仍未到达（如网络异常/超时），强制解除"翻译中"，
        // 避免界面卡死。后端 reqwest 已带 12s 超时，正常情况下此兜底不应触发。
        window.setTimeout(() => {
          if (loadingRef.current) {
            loadingRef.current = false;
            setLoading(false);
          }
        }, 14000);
      } else {
        // 无选中内容：仅呼出空面板，不进行翻译，立即可手动输入
        loadingRef.current = false;
        setLoading(false);
      }
    }).then((un) => cleanup.push(un));
    // 失焦自动隐藏：用窗口级 onFocusChanged 判断"焦点真正离开本窗口（点到别的程序）"
    // 才隐藏，不要用 DOM window blur——点击 data-tauri-drag-region 头部触发原生拖动时，
    // WebView2 会瞬时失焦并触发 blur，误把面板关掉（这正是"一点击就消失"的根因）。
    // 窗口级焦点在内部点击/拖动时不会改变，故不会误触发；仅当焦点离开本窗口才隐藏。
    // 双守卫避免误关：
    //   1) dragGuardRef —— 点/拖头部期间（原生拖动导致瞬时失焦）不关；
    //   2) lastStartAt —— 刚呼出（reveal_popup 让已聚焦窗口短暂失焦）的 1s 内不关；
    //   3) prev —— reveal_popup 以未聚焦方式显示时不关。
    let wasFocused = false;
    const focusUn = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      const prev = wasFocused;
      wasFocused = focused;
      if (prev && !focused) {
        const sinceStart = Date.now() - lastStartAt.current;
        if (dragGuardRef.current || sinceStart < 1000) return;
        void diagLog("translate hide: focus lost to other window");
        hideCurrentWindow();
      }
    });
    cleanup.push(() => focusUn.then((u) => u()));
    // 鼠标移入即补一次聚焦：后端置前偶被前台锁拒绝时，用户一交互就能拿到焦点。
    // 复制在面板显示【之前】就已完成，所以这里不再需要"loading 期间不抢焦点"，
    // 抢焦点绝不会再影响复制。
    const requestFocus = () => {
      if (!document.hasFocus()) {
        getCurrentWindow().setFocus().catch(() => undefined);
      }
    };
    // 鼠标按下：若落在拖动区，先置位拖动守卫（原生拖动会瞬时失焦，期间不许隐藏）。
    // 注意守卫必须在任何 return 之前置位——否则"翻译中"点头部时守卫没生效，
    // 一旦翻译超过 lastStartAt 守卫窗口，点头部就会把面板关掉。
    const onMouseDown = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-tauri-drag-region]")) {
        dragGuardRef.current = true;
        return;
      }
      requestFocus();
    };
    document.addEventListener("mouseover", requestFocus);
    document.addEventListener("mousedown", onMouseDown);
    cleanup.push(() => document.removeEventListener("mouseover", requestFocus));
    cleanup.push(() => document.removeEventListener("mousedown", onMouseDown));
    // 松开后短暂延时解除拖动守卫（覆盖原生拖动期间/之后的瞬时失焦）
    const onDocMouseUp = () => {
      window.setTimeout(() => {
        dragGuardRef.current = false;
      }, 250);
    };
    document.addEventListener("mouseup", onDocMouseUp);
    cleanup.push(() => document.removeEventListener("mouseup", onDocMouseUp));
    // Esc 关闭（窗口有焦点后生效）
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePopup();
      }
    };
    window.addEventListener("keydown", onKey);
    cleanup.push(() => window.removeEventListener("keydown", onKey));
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

  /** 头部拖动：与其他面板一致用 data-tauri-drag-region（激活窗口下
   *  Tauri 会自动排除按钮等交互元素，× 点击不受影响） */

  return (
    <div className="panel">
      <div className="panel-shell translate-shell">
        {/* 顶部：标题 + 语言选择 + 翻译按钮（紧凑排列，回车即可翻译） */}
        <div className="translate-head" data-tauri-drag-region>
          <span className="translate-title">翻译</span>
          <div className="translate-langs">
            <select
              className="lang-select"
              value={fromLang}
              title="源语言"
              onChange={(e) => setFromLang(e.target.value)}
            >
              {LANG_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.value === "auto" ? "自动检测" : l.label}
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
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary btn-sm translate-btn"
            disabled={translating || !text.trim()}
            onClick={() => void doTranslate()}
          >
            {translating ? "翻译中…" : "翻译"}
          </button>
          {/* 关闭按钮（data-tauri-drag-region 会自动排除按钮，点击正常触发） */}
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

        {/* 上方：原始内容（可编辑）；Enter 翻译，Shift+Enter 换行 */}
        <textarea
          ref={inputRef}
          className="translate-src"
          value={text}
          placeholder="输入或粘贴要翻译的内容…（Enter 翻译）"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) void doTranslate();
            }
          }}
        />

        {/* 下方：翻译内容，复制按钮浮在结果框内 */}
        <div className="translate-dst">
          {translating || loading ? (
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

        {/* 底部：状态提示 */}
        <div className="translate-bar">
          <span className="translate-status">
            {copied ? "已复制" : "Enter 翻译 · Shift+Enter 换行 · Esc 关闭"}
          </span>
        </div>
      </div>
    </div>
  );
}
