/** 翻译面板（双向翻译）：上方原文可编辑（Enter 正向翻译），下方译文可编辑
 *  （Enter 反向翻译回原文），顶部语言选择 + 翻译按钮，划词结果经事件推送。 */
import { useEffect, useRef, useState } from "react";
import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
import type { TranslateResult } from "../../types";
import { onEvent } from "../../core/events";
import { copyText, closeTranslatePopup, diagLog, lastTranslateResult, translateText } from "../../core/tauri";
import { useConfigStore } from "../../stores/configStore";
import { IconCheck, IconClose, IconCopy, IconPin } from "../../components/icons";
import { GlassSelect } from "../../components/GlassSelect";
import { LANG_OPTIONS } from "./langs";
import "../../styles/panel.css";
import "./translate.css";

const EVT_RESULT = "translate://result";

/** 关闭弹窗（按钮/Esc/失焦共用） */
function closePopup() {
  void closeTranslatePopup();
}

export function TranslatePopup() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  /** 原文输入（可编辑，Enter 正向翻译） */
  const [text, setText] = useState("");
  /** 译文内容（可编辑，Enter 反向翻译回原文） */
  const [dst, setDst] = useState("");
  const [fromLang, setFromLang] = useState("auto");
  const [toLang, setToLang] = useState("zh");
  /** fromLang 镜像（供事件回调读取最新值，避免闭包捕获旧值） */
  const fromLangRef = useRef("auto");
  fromLangRef.current = fromLang;
  /** 翻译中状态：src=反向翻译（结果回原文区，上方显示"翻译中"）；
   *  dst=正向翻译/划词等待（结果到译文区，下方显示"翻译中"）；null=空闲 */
  const [busy, setBusy] = useState<"src" | "dst" | null>(null);
  /** 底部状态提示（复制成功 / 反向翻译失败等，2s 后自动消失） */
  const [statusMsg, setStatusMsg] = useState("");
  /** 提示类型：ok=成功（绿色+勾）/ err=失败（红色）；决定状态条样式 */
  const [statusType, setStatusType] = useState<"ok" | "err">("ok");
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
  /** 置顶常驻（失焦不隐藏）：读配置，ref 同步供事件回调使用 */
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const alwaysOnTop = config.translator?.always_on_top ?? false;
  const alwaysOnTopRef = useRef(alwaysOnTop);
  alwaysOnTopRef.current = alwaysOnTop;
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      translator: { ...config.translator, always_on_top: !alwaysOnTop },
    });
  };

  /** 底部临时提示，2s 后自动清除；type 决定样式（ok=成功绿 / err=失败红） */
  const flashStatus = (msg: string, type: "ok" | "err" = "ok") => {
    setStatusType(type);
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(""), 2000);
  };

  // 划词触发的结果：填充原文与译文（保留用户已选的源/目标语言，仅更新内容）
  const applyResult = (r: TranslateResult) => {
    if (r.text) setText(r.text);
    // translation 为空 = 后端只是先把【原文】就位（译文仍在路上），
    // 此时保持"翻译中"，不要当成一次完成的结果渲染。
    if (!r.translation) {
      setResult(null);
      return;
    }
    setDst(r.translation);
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
    let disposed = false;
    onEvent<TranslateResult>(EVT_RESULT, applyResult).then((un) =>
      disposed ? un() : cleanup.push(un)
    );
    // 呼出：后端已读取选中文本（仅 UI Automation，不碰剪贴板），事件带出原文。
    // 有原文 → 进入"翻译中"等译文；无原文（用户没选中）→ 仅呼出空面板，不翻译、
    // 立即可手动输入/粘贴后点击"翻译"。
    onEvent<{ text?: string }>("translate://start", (p) => {
      const t = p?.text ?? "";
      setText(t);
      setDst("");
      setResult(null);
      lastStartAt.current = Date.now();
      if (t.trim()) {
        // 源语言为自动检测：目标语言下拉跟随识别结果（中文→英 / 英文→中）
        if (fromLangRef.current === "auto") {
          setToLang(smartTarget(t));
        }
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
    }).then((un) => (disposed ? un() : cleanup.push(un)));
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
      if (!prev || focused) return;
      const sinceStart = Date.now() - lastStartAt.current;
      if (dragGuardRef.current || sinceStart < 1000) return;
      // 置顶常驻：失焦不自动隐藏（与其他面板的置顶语义一致）
      if (alwaysOnTopRef.current) return;
      // 【互不影响】本应用内窗口之间切换焦点（如点开剪贴板面板）不关闭——
      // 仅当焦点离开整个应用（没有任何本应用窗口持有焦点）才关闭。
      window.setTimeout(() => {
        void getAllWindows()
          .then((wins) => Promise.all(wins.map((w) => w.isFocused())))
          .then((states) => {
      if (!states.some(Boolean)) {
        void diagLog("translate hide: focus left app");
        void closeTranslatePopup();
      }
    })
    .catch(() => {
      void diagLog("translate hide: focus lost to other window");
      void closeTranslatePopup();
    });
      }, 80);
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
    // 鼠标按下：若落在头部（拖动区），先置位拖动守卫（原生拖动会瞬时失焦，期间不许隐藏）。
    // 注意守卫必须在任何 return 之前置位——否则"翻译中"点头部时守卫没生效，
    // 一旦翻译超过 lastStartAt 守卫窗口，点头部就会把面板关掉。
    const onMouseDown = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".translate-head")) {
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
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, []);

  /** 智能目标语言：源语言为"自动检测"时，按输入内容自动定向——
   *  含中文（CJK）→ 翻译成英文；否则（英文等）→ 翻译成中文 */
  const smartTarget = (t: string): string =>
    /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(t) ? "en" : "zh";

  /** 正向翻译：以原文为源，翻译到目标语言（Enter / 顶部按钮触发）。
   *  源语言选「自动检测」时目标语言走智能方向（中文→英 / 英文→中）；
   *  手动指定了目标语言则用用户选择。结果落到译文区 → "翻译中"显示在下方 */
  const doTranslate = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy("dst");
    try {
      const target = fromLang === "auto" ? smartTarget(t) : toLang;
      const r = await translateText(t, fromLang, target);
      setDst(r.translation);
      setResult(r);
      // 源语言为自动检测：目标语言下拉跟随识别结果（用户反馈）
      if (fromLang === "auto") setToLang(target);
    } catch (err) {
      flashStatus("翻译失败，请检查网络或服务商配置", "err");
    } finally {
      setBusy(null);
    }
  };

  /** 反向翻译：以译文为源，翻译回原文语言（译文框内 Enter 触发）。
   *  目标语言 = 用户选的源语言；未指定（auto）时用上次检测出的源语言，再兜底中文。
   *  结果放回原文区 → "翻译中"显示在上方（用户反馈） */
  const doReverse = async () => {
    const t = dst.trim();
    if (!t) return;
    setBusy("src");
    try {
      const target = fromLang !== "auto" ? fromLang : (result?.from || "zh");
      const r = await translateText(t, toLang, target);
      // 反向结果放回原文区，译文区保留用户编辑的内容
      setText(r.translation);
      setResult({ ...r, text: t, from: toLang, to: target });
    } catch (err) {
      flashStatus("反向翻译失败，请检查网络或服务商配置", "err");
    } finally {
      setBusy(null);
    }
  };

  const doCopy = async () => {
    if (!dst.trim()) return;
    try {
      // 复制译文不污染剪贴板历史（后端 SUPPRESS_WATCH）
      await copyText(dst);
      flashStatus("已复制");
    } catch (err) {
      console.error("复制译文失败", err);
    }
  };

  /** 复制原文（同 SUPPRESS_WATCH，不进剪贴板历史） */
  const doCopySrc = async () => {
    if (!text.trim()) return;
    try {
      await copyText(text);
      flashStatus("已复制原文");
    } catch (err) {
      console.error("复制原文失败", err);
    }
  };

  /** 点击中间 ⇄：交换源/目标语言。源为「自动检测」时，交换后的目标语言
   *  用上次检测出的语言（result.from）兜底，避免出现"目标=自动"的无效组合 */
  const swapLangs = () => {
    const f = fromLang;
    const t = toLang;
    setFromLang(t);
    setToLang(f === "auto" ? (result?.from || "zh") : f);
  };

  /** 头部拖动：与其他面板一致用 data-tauri-drag-region（激活窗口下
   *  Tauri 会自动排除按钮等交互元素，× 点击不受影响） */

  return (
    <div className="panel">
      <div className="panel-shell translate-shell">
        {/* 顶部：标题 + 语言选择 + 翻译按钮（紧凑排列，回车即可翻译）。
            头部空白处可拖动窗口（JS 手柄，自动跳过按钮/下拉等交互元素） */}
        <div
          className="translate-head"
          onMouseDown={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest("button, select, input, textarea")) return;
            dragGuardRef.current = true;
            getCurrentWindow().startDragging().catch(() => undefined);
          }}
        >
          <span className="translate-title">翻译</span>
          <div className="translate-langs">
            <GlassSelect
              value={fromLang}
              onChange={setFromLang}
              title="源语言"
              options={LANG_OPTIONS.map((l) => ({
                value: l.value,
                label: l.value === "auto" ? "自动检测" : l.label,
              }))}
            />
            {/* 中间双向按钮：点击交换源/目标语言 */}
            <button
              className="lang-swap"
              title="交换源/目标语言"
              onClick={swapLangs}
            >
              ⇄
            </button>
            <GlassSelect
              value={toLang}
              onChange={setToLang}
              title="目标语言"
              options={LANG_OPTIONS.filter((l) => l.value !== "auto").map((l) => ({
                value: l.value,
                label: l.label,
              }))}
            />
          </div>
          <button
            className={`translate-btn${!text.trim() && !busy ? " empty" : ""}`}
            disabled={busy != null || !text.trim()}
            onClick={() => void doTranslate()}
          >
            {busy === "src" ? "反向中…" : busy ? "翻译中…" : "翻译"}
          </button>
          {/* 置顶常驻：开启后失焦不自动隐藏（与其他面板一致） */}
          <button
            className={`icon-btn translate-pin${alwaysOnTop ? " active" : ""}`}
            title={alwaysOnTop ? "取消置顶（失焦自动隐藏）" : "置顶常驻（失焦不隐藏）"}
            onClick={toggleAlwaysOnTop}
          >
            <IconPin size={13} filled={alwaysOnTop} />
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

        {/* 上方：原始内容（可编辑）；Enter 翻译，Shift+Enter 换行；复制按钮浮在框内。
            反向翻译中（结果回原文区）→ 上方显示"翻译中" */}
        {busy === "src" ? (
          <div className="translate-src-hint">
            <span className="translate-hint-spin" />
            反向翻译中…
          </div>
        ) : (
          <div className="translate-src-wrap">
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
            {text.trim() && (
              <button
                className="icon-btn translate-src-copy"
                title="复制原文"
                onClick={() => void doCopySrc()}
              >
                <IconCopy size={13} />
              </button>
            )}
          </div>
        )}

        {/* 下方：译文（可编辑，Enter 反向翻译回原文）；复制按钮浮在结果框内。
            正向翻译/划词等待（结果到译文区）→ 下方显示"翻译中" */}
        <div className="translate-dst">
          {loading || busy === "dst" ? (
            <div className="translate-dst-hint">
              <span className="translate-hint-spin" />
              翻译中…
            </div>
          ) : (
            <textarea
              className="translate-dst-input"
              value={dst}
              placeholder="译文，可编辑…（Enter 反向翻译）"
              onChange={(e) => setDst(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void doReverse();
                }
              }}
            />
          )}
          {busy !== "dst" && !loading && dst.trim() && (
            <button
              className="icon-btn translate-dst-copy"
              title="复制译文"
              onClick={() => void doCopy()}
            >
              <IconCopy size={14} />
            </button>
          )}
        </div>

        {/* 底部：状态提示（默认快捷键说明；临时状态按 ok/err 变色加图标） */}
        <div className="translate-bar">
          <span className={`translate-status ${statusMsg ? statusType : ""}`}>
            {statusMsg ? (
              statusType === "ok" && <IconCheck size={12} />
            ) : null}
            {statusMsg || "Enter 翻译 · 译文框 Enter 反向 · Esc 关闭"}
          </span>
        </div>
      </div>
    </div>
  );
}
