/** 贴图 OCR 文字弹窗的独立窗口（单例 pin-ocr，按需创建 / 隐藏复用），
 *  与右键菜单 pin-menu 同思路：脱离贴图窗矩形裁剪、绝不改动贴图尺寸——
 *  这样当贴图很小、窗内放不下 OCR 弹窗时，弹窗完整显示在贴图外侧。
 *
 *  设计要点：
 *  - 弹窗【始终】在贴图外侧（右侧优先，放不下再翻左侧；打开时按可用空间定一边，
 *    之后拖拽贴图只跟随、不左右翻转，避免位置乱跳）。绝不停靠贴图窗内，避免遮挡原图。
 *  - 数据由来源贴图窗 emitTo("pin-ocr-show") 推送（识别行 / 译文 / 翻译态 / 贴图几何）；
 *    本窗仅据几何重新定位，【不】重跑翻译——翻译只由用户点「翻译」按钮触发。
 *  - 按钮动作 emitTo 回传来源贴图窗（pin-ocr-action），由贴图窗执行。
 *  - 始终置顶显示（不随失焦隐藏），仅在退出文字模式（PinWindow 隐藏本窗）时收起。 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { emitTo } from "@tauri-apps/api/event";
import { OcrPanel, type OcrTransState } from "../shared/OcrPanel";
import type { ShotOcrLine } from "../../core/tauri";
import "./pin.css";

const PANEL_W = 300;
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
  // 打开时锁定弹窗在贴图哪一侧（右/左），之后拖拽只跟随、不翻转，避免位置乱跳
  const sideRef = useRef<"right" | "left">("right");
  const placedRef = useRef(false);

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

  // 数据变化 → 量尺寸、按锁定侧贴边定位（右侧优先；放不下翻左侧仅在首次定边时决定）、
  // 显示。只 show() 不抢焦点：拖拽贴图时本窗随动重定位，若每帧 setFocus 会把焦点从
  // 贴图窗抢走导致拖拽异常；用户点本窗交互时窗口自然获焦。
  useLayoutEffect(() => {
    const el = panelRef.current?.firstElementChild as HTMLElement | null;
    if (!el || !data || data.pinW <= 0) return;
    const mw = el.offsetWidth || PANEL_W;
    const mh = el.offsetHeight || 200;
    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    // 首次确定弹窗在贴图哪一侧：右侧有空间优先右侧，否则左侧，再否则仍右侧（夹到屏边）
    if (!placedRef.current) {
      placedRef.current = true;
      const rightRoom = availW - (data.pinLeft + data.pinW);
      const leftRoom = data.pinLeft;
      sideRef.current =
        rightRoom >= mw + GAP ? "right" : leftRoom >= mw + GAP ? "left" : "right";
    }
    let x = sideRef.current === "right"
      ? data.pinLeft + data.pinW + GAP
      : data.pinLeft - mw - GAP;
    let y = data.pinTop + GAP;
    // 夹到屏幕内（不翻转侧别）：贴图被拖到边缘时弹窗贴屏边，可能轻微压住贴图边缘，
    // 但位置稳定、绝不在左右之间乱跳
    x = Math.max(2, Math.min(x, availW - mw - 2));
    y = Math.max(2, Math.min(y, availH - mh - 2));
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
      if (e.key === "Escape") { e.preventDefault(); emit("close"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data?.pin]);

  if (!data) return null;
  return (
    <div ref={panelRef} style={{ padding: 0, margin: 0 }}>
      <OcrPanel
        lines={data.lines}
        phase={data.phase}
        trans={data.trans}
        translating={data.translating}
        onClose={() => emit("close")}
        onCopyAll={() => emit("copyAll")}
        onCopyTrans={() => emit("copyTrans")}
        onTranslate={() => emit("translate")}
        onReturn={() => emit("return")}
        style={{
          position: "static",
          width: PANEL_W,
          maxWidth: PANEL_W,
          maxHeight: Math.min(560, Math.round(window.screen.availHeight * 0.8)),
          margin: 0,
        }}
      />
    </div>
  );
}
