/** 贴图 OCR 文字弹窗的独立窗口（单例 pin-ocr，按需创建 / 隐藏复用），
 *  与右键菜单 pin-menu 同思路：脱离贴图窗矩形裁剪、绝不改动贴图尺寸——
 *  这样当贴图很小、窗内放不下 OCR 弹窗时，弹窗完整显示在贴图外侧。
 *
 *  数据由来源贴图窗 emitTo("pin-ocr-show") 推送（识别行 / 译文 / 翻译态 / 贴图几何）；
 *  弹窗上的按钮动作 emitTo 回传来源贴图窗（pin-ocr-action），由贴图窗执行。
 *  始终置顶显示（不随失焦隐藏），仅在退出文字模式（PinWindow 隐藏本窗）时收起。 */
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

  // 数据变化 → 量尺寸、贴边定位（默认贴图右侧；放不下翻到左侧 / 上方）、显示。
  // 注意：只 show() 不抢焦点——拖拽贴图时本窗会随动重定位，若每帧 setFocus 会
  // 把焦点从贴图窗抢走导致拖拽异常；用户点本窗交互时窗口自然获焦。
  useLayoutEffect(() => {
    const el = panelRef.current?.firstElementChild as HTMLElement | null;
    if (!el || !data) return;
    const mw = el.offsetWidth || PANEL_W;
    const mh = el.offsetHeight || 200;
    const availW = window.screen.availWidth;
    const availH = window.screen.availHeight;
    let x = data.pinLeft + data.pinW + GAP; // 默认贴图右侧
    if (x + mw > availW) x = data.pinLeft - mw - GAP; // 右侧放不下 → 翻到左侧
    let y = data.pinTop + GAP;
    if (y + mh > availH) y = Math.max(2, availH - mh - 2);
    if (x < 2) x = 2;
    if (y < 2) y = 2;
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
