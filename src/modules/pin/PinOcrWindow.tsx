/** 贴图 OCR 文字弹窗的独立窗口（单例 pin-ocr，按需创建 / 隐藏复用），
 *  与右键菜单 pin-menu 同思路：脱离贴图窗矩形裁剪、绝不改动贴图尺寸——
 *  这样当贴图很小、窗内放不下 OCR 弹窗时，弹窗完整显示在贴图外侧。
 *
 *  设计要点：
 *  - 弹窗优先放在贴图【外侧剩余空间大的一侧】；仅当两侧都放不下弹窗时才退回
 *    【贴图内】(覆盖原图，作为最后兜底)，不强行挤在贴图边缘遮挡内容。
 *  - 选侧规则：取贴图左/右剩余空间之大者；若"大者"都 < 弹窗所需(宽+间隙)则放贴图内；
 *    否则放"大者"那侧。拖拽/缩放全过程都用此规则，但当前所在侧只要还有足够空间就
 *    【不翻侧】(避免位置乱跳)；仅当当前侧也不够时才重选另一侧或退回贴图内。
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
/** OCR 弹窗翻译态宽度：与截图弹窗对齐（截图 320→560），
 *  让「原文 / 译文」两列译文列不再被挤窄（≈275px/列），英文长词不必强制换行 */
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
  // 弹窗所在侧：right / left / inside(贴图内兜底)；当前侧仍有空间则稳住不翻侧
  const modeRef = useRef<"right" | "left" | "inside">("right");
  const placedRef = useRef(false);   // 首次定侧后才启用"稳住不翻侧"
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  // 缓存上次窗口宽——早返回必须包含 mw，否则宽变而 mh 不变时漏掉 setSize，
  // 翻译点击后弹窗看起来"没变大"（独立窗要主动 setSize 才能改窗口尺寸，
  // 不同于截图弹窗在同 WebView 内只切 CSS）
  const lastWRef = useRef(0);
  const lastHRef = useRef(0);

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
    void getCurrentWindow().destroy().catch(() => {});
  };

  // 数据/几何变化 → 量尺寸、按"选侧规则"贴边定位、显示。
  //   滚轮缩放贴图时本窗经 pin-ocr-show 实时收到新几何 → 始终贴着贴图对应边；
  //   若当前侧边没动(如只缩放了另一侧)则本次跳过重定位，省去无谓抖动(绝不重跑翻译)。
  //   只 show() 不抢焦点：拖拽/缩放时本窗随动重定位，若每帧 setFocus 会把焦点从
  //   贴图窗抢走导致拖拽/缩放异常；用户点本窗交互时窗口自然获焦。
  useLayoutEffect(() => {
    const el = panelRef.current?.firstElementChild as HTMLElement | null;
    if (!el || !data || data.pinW <= 0) return;
    const mw = el.offsetWidth || PANEL_W;
    const mh = el.offsetHeight || 200;
    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    const need = mw + GAP;                                  // 弹窗所需(宽+间隙)
    const rightRoom = availW - (data.pinLeft + data.pinW);  // 贴图右侧剩余
    const leftRoom = data.pinLeft;                          // 贴图左侧剩余
    // ---- 选侧(含"贴图内"兜底) ----
    let mode: "right" | "left" | "inside";
    if (!placedRef.current) {
      // 首次定侧：严格取"剩余空间大的一侧"；两侧都不够则放贴图内
      placedRef.current = true;
      mode = Math.max(rightRoom, leftRoom) < need
        ? "inside"
        : (rightRoom >= leftRoom ? "right" : "left");
    } else if (Math.max(rightRoom, leftRoom) < need) {
      mode = "inside";                                       // 两侧都放不下 → 贴图内
    } else if (modeRef.current === "inside") {
      mode = rightRoom >= leftRoom ? "right" : "left";       // 从贴图内出来 → 取大侧
    } else {
      // 当前在外侧：仅当"当前侧"也不够了才重选另一侧；否则稳住不翻侧，避免乱跳
      const curRoom = modeRef.current === "right" ? rightRoom : leftRoom;
      mode = curRoom < need ? (rightRoom >= leftRoom ? "right" : "left") : modeRef.current;
    }
    modeRef.current = mode;
    // ---- 计算贴边坐标 ----
    let x: number, y: number;
    if (mode === "right") {
      x = data.pinLeft + data.pinW + GAP;                     // 贴贴图右边
      y = data.pinTop + GAP;
    } else if (mode === "left") {
      x = data.pinLeft - mw - GAP;                           // 贴贴图左边
      y = data.pinTop + GAP;
    } else {
      x = data.pinLeft + GAP;                               // 贴图内(左上角内缩)
      y = data.pinTop + GAP;
    }
    // 夹到屏幕内(不翻侧)：贴图被拖到边缘时弹窗贴屏边
    x = Math.max(2, Math.min(x, availW - mw - 2));
    y = Math.max(2, Math.min(y, availH - mh - 2));
    // 当前侧边/尺寸都没变 → 跳过本次重定位，省去无谓抖动(且不重跑翻译)
    // 必须把 mw 也纳入比对：宽度变化（未翻译→翻译）单走 setSize 也会让窗口真的变大，
    // 仅靠 mh 判断会让独立窗 CSS 切宽后窗口尺寸不变（修「贴图翻译后弹窗没变大」）
    if (x === lastXRef.current && y === lastYRef.current && mw === lastWRef.current && mh === lastHRef.current) return;
    lastXRef.current = x; lastYRef.current = y; lastWRef.current = mw; lastHRef.current = mh;
    const win = getCurrentWindow();
    void win.setSize(new LogicalSize(mw, mh)).then(() => {
      void win.setPosition(new LogicalPosition(x, y)).then(() => {
        void win.show().catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  }, [data]);

  // Esc 关闭（回传 close，由贴图窗退出文字模式）；不随失焦隐藏——始终置顶可见
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); selfClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data?.pin]);

  // 安全网：若来源贴图窗已被销毁(任意关闭途径)，本弹窗应在极短时间内自我销毁，
  // 避免残留孤儿窗——且孤儿窗的手动关会失效(其关闭事件发往已销毁的来源贴图)
  useEffect(() => {
    if (!data?.pin) return;
    const t = window.setInterval(() => {
      void WebviewWindow.getByLabel(data.pin).then((src) => {
        if (!src) void getCurrentWindow().destroy().catch(() => {});
      }).catch(() => {});
    }, 300);
    return () => window.clearInterval(t);
  }, [data?.pin]);

  if (!data) return null;
  // 翻译态开关：与 ScreenshotOverlay 的 transMode 保持一致——切宽度让两列对照不被挤窄。
  // PinOcrWindow 是独立 WebView 窗口，CSS 宽度变化不会自动同步到 OS 窗口尺寸，
  // 必须由 useLayoutEffect 重新量尺寸 + setSize 才能真正变宽（见 early-return 注释）
  const transMode = !!(data.trans || data.translating);
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
          width: transMode ? PANEL_W_TRANS : PANEL_W,
          // 翻译态上限与截图弹窗对齐（560）；小屏按 vw-16 兜底，避免超屏
          maxWidth: transMode ? "min(560px, calc(100vw - 16px))" : PANEL_W,
          maxHeight: Math.min(560, Math.round(window.screen.availHeight * 0.8)),
          margin: 0,
        }}
      />
    </div>
  );
}
