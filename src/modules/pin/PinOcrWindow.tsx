/** 贴图 OCR 文字弹窗的独立窗口（单例 pin-ocr，按需创建 / 隐藏复用），
 *  与右键菜单 pin-menu 同思路：脱离贴图窗矩形裁剪、绝不改动贴图尺寸——
 *  这样当贴图很小、窗内放不下 OCR 弹窗时，弹窗完整显示在贴图外侧。
 *
 *  设计要点：
 *  - 弹窗优先放贴图【外侧四向】(右/左/下/上)仍有足够余量的一侧——贴图外零重合，
 *    不遮挡原图文字；当前所在侧仍放得下就【不翻侧】(避免位置乱跳)。
 *  - 四向都放不下（贴图巨大）→【不退回贴图内覆盖】，而是展开全部候选
 *    (外侧姿态 + 贴屏幕四角)取与贴图【重合面积最小】者，并列取离当前最近：
 *    结果必是"尽可能靠屏幕边 + 重合最少"，弹窗永远完整可见、挤不掉。
 *  - 与贴图重合期间周期置顶（doRaise watchdog）：贴图窗同为置顶窗，拖拽/滚轮会把
 *    它激活到置顶链顶端盖住本窗；周期 SetWindowPos(HWND_TOPMOST, NOACTIVATE) 保顶。
 *  - 数据由来源贴图窗 emitTo("pin-ocr-show") 推送（识别行 / 译文 / 翻译态 / 贴图几何）；
 *    本窗仅据几何重新定位，【不】重跑翻译——翻译只由用户点「翻译」按钮触发。
 *  - 按钮动作 emitTo 回传来源贴图窗（pin-ocr-action），由贴图窗执行。
 *  - 始终置顶显示（不随失焦隐藏）；来源贴图退出文字模式时由 PinWindow 隐藏本窗，
 *    来源贴图被销毁时本窗自动销毁(手动关也直接销毁自身，避免孤儿窗关不掉)。 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { emitTo } from "@tauri-apps/api/event";
import { OcrPanel, type OcrTransState } from "../shared/OcrPanel";
import type { ShotOcrLine } from "../../core/tauri";
import "./pin.css";

/** OCR 弹窗默认宽度（贴图外侧独立窗，贴图较小时也放得下） */
const PANEL_W = 300;
/** OCR 弹窗翻译态宽度上限：与截图弹窗对齐（截图 320→560），
 *  让「原文 / 译文」两列译文列不再被挤窄（≈275px/列），英文长词不必强制换行。
 *  【不能拿 100vw 当上限】：本窗是独立 WebView，vw = 窗口自身视口宽（初始 300），
 *  若 maxWidth 写成 min(560px, calc(100vw - 16px))，会把 560 clamp 回 284——
 *  翻译扩宽被自己锁死、窗口反而略缩（"面板缩没了"）。上限必须用屏幕可用宽。 */
const PANEL_W_TRANS = 560;
/** 独立窗与贴图外缘的间距 */
const GAP = 8;

interface OcrShow {
  pin: string;
  lines: ShotOcrLine[];
  phase: "loading" | "done" | "error";
  trans: OcrTransState | null;
  translating: boolean;
  pinLeft: number;
  pinTop: number;
  pinW: number;
  pinH: number;
}

function readUrl(): OcrShow | null {
  const p = new URLSearchParams(location.search.replace(/^\?/, ""));
  try {
    const pin = p.get("pin") || "";
    if (!pin) return null;
    return {
      pin,
      lines: [],
      phase: "done",
      trans: null,
      translating: false,
      pinLeft: Number(p.get("pinLeft") || 0),
      pinTop: Number(p.get("pinTop") || 0),
      pinW: Number(p.get("pinW") || 0),
      pinH: Number(p.get("pinH") || 0),
    };
  } catch {
    return null;
  }
}

export default function PinOcrWindow() {
  const [data, setData] = useState<OcrShow | null>(readUrl());
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 弹窗所在侧：right/left/bottom/top(贴图外) / hug(贴合屏边、与贴图小面积重合)
  const modeRef = useRef<"right" | "left" | "bottom" | "top" | "hug">("right");
  const placedRef = useRef(false);   // 首次定侧后才启用"稳住不翻侧"
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  // 缓存上次窗口宽——早返回必须包含 mw，否则宽变而 mh 不变时漏掉 setSize，
  // 翻译点击后弹窗看起来"没变大"（独立窗要主动 setSize 才能改窗口尺寸，
  // 不同于截图弹窗在同 WebView 内只切 CSS）
  const lastWRef = useRef(0);
  const lastHRef = useRef(0);
  // 上次主动置顶（overlap 补顶）的时间戳：贴图拖拽/缩放期间 geometry 事件
  // 高频到达，setAlwaysOnTop 每次都要走一次 SetWindowPos，节流避免拖拽掉帧
  const lastRaiseRef = useRef(0);
  // 当前是否与贴图重合（重叠期间必须保持置顶，见 doRaise 注释）
  const overlapRef = useRef(false);
  // 把本窗硬置顶到置顶链顶端（SetWindowPos HWND_TOPMOST、不抢焦点）：
  // 贴图窗也是置顶窗，拖拽/滚轮会把它激活到置顶链顶端、盖住与本窗重叠的部分，
  // 且交互结束后的"最后一次激活"没有对应 geometry 推送来触发补顶——只靠布局
  // 时机补顶会停在被盖状态（=主人遇到的"弹窗被挤掉"）。故重叠期间用周期
  // watchdog 每 200ms 补顶一次，保证任意交互后 ≤200ms 内本窗必然回到最上。
  const doRaise = () => {
    if (!overlapRef.current) return;
    const now = performance.now();
    if (now - lastRaiseRef.current < 200) return;
    lastRaiseRef.current = now;
    void getCurrentWindow().setAlwaysOnTop(true).catch(() => {});
  };

  // 接收来源贴图窗推送（首次可由 URL 自举，后续由事件驱动）
  useEffect(() => {
    let un: (() => void) | undefined;
    void getCurrentWindow()
      .listen<OcrShow>("pin-ocr-show", (e) => setData(e.payload))
      .then((f) => { un = f; });
    // 本窗已就绪：通知来源贴图窗触发首次完整推送（避免事件早于监听到达而丢失）
    if (data?.pin) void emitTo(data.pin, "pin-ocr-ready", { pin: data.pin }).catch(() => {});
    return () => { un?.(); };
  }, []);

  const emit = (action: string) => {
    if (data?.pin) void emitTo(data.pin, "pin-ocr-action", { action, pin: data.pin }).catch(() => {});
  };
  // 关闭本弹窗：先通知来源贴图退出文字模式(来源在则生效，已关则无监听、忽略)；
  // 再直接销毁本窗自身——绝不能依赖来源贴图来关自己(来源已销毁→孤儿窗，手动关失效)
  const selfClose = () => {
    emit("close");
    // 立即销毁；若与来源贴图 hide 等异步操作竞争导致首次 destroy 被吞，
    // 延迟再强制销毁一次兜底（主人实测过"点 ✕ 不生效"的异常交互态）
    void getCurrentWindow().destroy().catch(() => {});
    window.setTimeout(() => {
      void getCurrentWindow().destroy().catch(() => {});
    }, 300);
  };

  // 数据/几何变化 → 量尺寸、选位、定位显示。
  //   选位策略（主人 2026-09-02 反馈重构）：
  //   1) 优先「贴图外侧四向」——右/左/下/上，取仍有足够余量的一侧（贴图外零重合，
  //      不遮挡原图文字）；当前所在侧仍放得下就【不翻侧】防位置乱跳；
  //   2) 四向都放不下（贴图巨大）→【不再退回贴图内覆盖原图】，而是展开全部候选
  //      （外侧各姿态 + 贴屏幕四角），取与贴图【重合面积最小】者；并列取离当前
  //      最近 —— 结果必然"尽可能贴屏幕边、重合最少"，弹窗完整可见、挤不掉；
  //   3) 重叠形态由 doRaise + 周期 watchdog 保顶（贴图窗同为置顶窗，见 doRaise 注释）。
  //   只 show() 不抢焦点：拖拽/缩放时本窗随动重定位，若每帧 setFocus 会把焦点从
  //   贴图窗抢走导致拖拽/缩放异常；用户点本窗交互时窗口自然获焦。
  useLayoutEffect(() => {
    const el = panelRef.current?.firstElementChild as HTMLElement | null;
    if (!el || !data || data.pinW <= 0) return;
    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    // 量面板实际宽高；先夹到屏幕容量内（防御高缩放/小屏下 DOM 目标宽 > 屏宽，
    // 避免 setSize 把窗口开到比屏幕还大——那会让坐标 clamp 失效、窗口溢出屏外）
    const mw = Math.min(el.offsetWidth || PANEL_W, availW - 4);
    const mh = Math.min(el.offsetHeight || 200, availH - 4);
    const pinL = data.pinLeft, pinT = data.pinTop;
    const pinR = pinL + data.pinW, pinB = pinT + data.pinH;
    const rightRoom = availW - pinR;  // 贴图右侧 → 屏右余量
    const leftRoom = pinL;            // 屏左 → 贴图左侧
    const topRoom = pinT;             // 屏顶 → 贴图顶部
    const bottomRoom = availH - pinB; // 贴图底部 → 屏底
    // 面板矩形与贴图矩形的重合面积（0 = 完全在贴图外）
    const overlapArea = (x: number, y: number) => {
      const iw = Math.min(x + mw, pinR) - Math.max(x, pinL);
      const ih = Math.min(y + mh, pinB) - Math.max(y, pinT);
      return iw > 0 && ih > 0 ? iw * ih : 0;
    };
    const mk = (sx: number, sy: number, key: "right" | "left" | "bottom" | "top" | "hug") => {
      // 统一夹进屏幕内（夹不住的部分自然与贴图产生重合，交给 ov 比较取舍）
      const x = Math.max(2, Math.min(sx, availW - mw - 2));
      const y = Math.max(2, Math.min(sy, availH - mh - 2));
      return { x, y, key, ov: overlapArea(x, y) };
    };
    // ---- 候选集：贴图外侧四向，每向取"贴图顶部对齐 / 底部对齐"两种姿态 ----
    const outer = [
      mk(pinR + GAP, pinT + GAP, "right"),
      mk(pinR + GAP, pinB - mh - GAP, "right"),
      mk(pinL - mw - GAP, pinT + GAP, "left"),
      mk(pinL - mw - GAP, pinB - mh - GAP, "left"),
      mk(pinL + GAP, pinB + GAP, "bottom"),
      mk(pinR - mw - GAP, pinB + GAP, "bottom"),
      mk(pinL + GAP, pinT - mh - GAP, "top"),
      mk(pinR - mw - GAP, pinT - mh - GAP, "top"),
    ];
    const zero = outer.filter((c) => c.ov === 0);  // 完全在贴图外 → 不遮挡原图
    const room = (k: string) =>
      k === "right" ? rightRoom : k === "left" ? leftRoom
        : k === "bottom" ? bottomRoom : topRoom;
    const dist = (c: { x: number; y: number }) =>
      Math.hypot(c.x - lastXRef.current, c.y - lastYRef.current);
    const sideOrder: Record<string, number> = { right: 0, left: 1, bottom: 2, top: 3 };
    let cand: { x: number; y: number; key: "right" | "left" | "bottom" | "top" | "hug"; ov: number };
    if (zero.length > 0) {
      if (placedRef.current) {
        // 已定过侧：当前所在侧仍能零重合 → 稳住不翻侧；否则选余量最大的侧
        const stay = zero.filter((c) => c.key === modeRef.current);
        cand = (stay.length > 0 ? stay : zero)
          .sort((a, b) => room(b.key) - room(a.key) || dist(a) - dist(b))[0];
      } else {
        // 首次定侧：余量大的方向优先；同余量按 右 > 左 > 下 > 上
        cand = zero
          .sort((a, b) => room(b.key) - room(a.key) || sideOrder[a.key] - sideOrder[b.key])[0];
      }
    } else {
      // 四向都放不下 → 全部候选（外侧姿态 + 贴屏幕四角）里取「重合面积最小」；
      // 并列取离当前最近——拖拽/缩放期间不乱跳，且必然贴屏幕边、重合最少
      cand = [...outer,
        mk(2, 2, "hug"),
        mk(availW - mw - 2, 2, "hug"),
        mk(2, availH - mh - 2, "hug"),
        mk(availW - mw - 2, availH - mh - 2, "hug"),
      ].sort((a, b) => a.ov - b.ov || dist(a) - dist(b))[0];
    }
    placedRef.current = true;
    modeRef.current = cand.key;
    overlapRef.current = cand.ov > 0;
    const { x, y } = cand;
    // 当前侧边/尺寸都没变 → 跳过本次重定位，省去无谓抖动(且不重跑翻译)
    // 必须把 mw 也纳入比对：宽度变化（未翻译→翻译）单走 setSize 也会让窗口真的变大，
    // 仅靠 mh 判断会让独立窗 CSS 切宽后窗口尺寸不变（修「贴图翻译后弹窗没变大」）
    if (x === lastXRef.current && y === lastYRef.current && mw === lastWRef.current && mh === lastHRef.current) return;
    lastXRef.current = x; lastYRef.current = y; lastWRef.current = mw; lastHRef.current = mh;
    const win = getCurrentWindow();
    void win.setSize(new LogicalSize(mw, mh)).then(() => {
      void win.setPosition(new LogicalPosition(x, y)).then(() => {
        void win.show().catch(() => {});
        // 与贴图重合：立即补顶一次让首帧不滞后；随后由周期 watchdog 持续保顶
        if (cand.ov > 0) doRaise();
      }).catch(() => {});
    }).catch(() => {});
  }, [data]);

  // 重叠保顶 watchdog：见 doRaise 注释——贴图拖拽/缩放结束的"最后一次激活"没有
  // 对应几何推送来触发补顶，周期补顶保证本窗在任意交互后 ≤200ms 内回到置顶链
  // 顶端：即便与贴图小面积重合也绝不会被盖住（"挤不掉"，主人 2026-09-02 反馈）。
  useEffect(() => {
    const t = window.setInterval(() => doRaise(), 200);
    return () => window.clearInterval(t);
    // doRaise 只读 refs + 调当前窗，无需随渲染重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc 关闭（回传 close，由贴图窗退出文字模式）；不随失焦隐藏——始终置顶可见
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); selfClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data?.pin]);

  // 安全网：若来源贴图窗已被销毁(任意关闭途径)，本弹窗应在极短时间内自我销毁，
  // 避免残留孤儿窗——且孤儿窗的手动关会失效(其关闭事件发往已销毁的来源贴图)。
  // 【注意】staging 待命贴图窗销毁后会立即补建同 label 的新窗，getByLabel 非空会
  // 骗过本安全网——那类场景由 Rust 侧 drop_ocr_window 在贴图窗 Destroyed 时兜底
  useEffect(() => {
    if (!data?.pin) return;
    const t = window.setInterval(() => {
      void WebviewWindow.getByLabel(data.pin).then((src) => {
        if (!src) void getCurrentWindow().destroy().catch(() => {});
      }).catch(() => {});
    }, 200);
    return () => window.clearInterval(t);
  }, [data?.pin]);

  if (!data) return null;
  // 翻译态开关：与 ScreenshotOverlay 的 transMode 保持一致——切宽度让两列对照不被挤窄。
  // PinOcrWindow 是独立 WebView 窗口，CSS 宽度变化不会自动同步到 OS 窗口尺寸，
  // 必须由 useLayoutEffect 重新量尺寸 + setSize 才能真正变宽（见 early-return 注释）。
  const transMode = !!(data.trans || data.translating);
  // 面板目标宽：翻译态 300→560。**上限用屏幕可用宽而不是 100vw**——独立窗的
  // vw = 窗口自身视口宽（初始 300），写 calc(100vw - 16px) 会把 560 clamp 回 284，
  // 扩宽被自锁、窗口反而缩没（上一版 bug）。极端小屏按 availW-16 收窄，保底 PANEL_W。
  const panelW = transMode
    ? Math.max(PANEL_W, Math.min(PANEL_W_TRANS, Math.round(window.screen.availWidth) - 16))
    : PANEL_W;
  return (
    <div ref={panelRef} style={{ padding: 0, margin: 0 }}>
      <OcrPanel
        lines={data.lines}
        phase={data.phase}
        trans={data.trans}
        translating={data.translating}
        onClose={selfClose}
        onCopyAll={() => emit("copyAll")}
        onCopyTrans={() => emit("copyTrans")}
        onTranslate={() => emit("translate")}
        onReturn={() => emit("return")}
        style={{
          position: "static",
          width: panelW,
          maxWidth: panelW,
          maxHeight: Math.min(560, Math.round(window.screen.availHeight * 0.8)),
          margin: 0,
        }}
      />
    </div>
  );
}
