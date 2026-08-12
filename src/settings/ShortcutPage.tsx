/** 快捷键设置页：录入组合键、冲突检测、保存后重新注册运行时热键 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfigStore } from "../stores/configStore";
import {
  applyShortcut,
  beginShortcutCapture,
  endShortcutCapture,
  testShortcut,
} from "../core/tauri";
import { EVT_SHORTCUT_WIN_CAPTURED, onEvent } from "../core/events";
import { SettingGroup, SettingRow } from "./components";

type Target = "clipboard" | "folder" | "credentials" | "translation";

/** 将键盘事件转换为 global-shortcut 可解析的组合键字符串，如 "Ctrl+Alt+C" */
function comboFromEvent(e: KeyboardEvent): string | null {
  // 纯修饰键按下时不生成组合
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;

  let main = "";
  if (/^[a-zA-Z]$/.test(e.key)) {
    main = e.key.toUpperCase();
  } else if (/^[0-9]$/.test(e.key)) {
    main = e.key;
  } else if (/^F(\d{1,2})$/.test(e.key)) {
    main = e.key.toUpperCase();
  } else {
    return null;
  }

  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  if (mods.length === 0) return null; // 必须带至少一个修饰键，避免误占普通按键
  return [...mods, main].join("+");
}

/** 组合键录入框：点击进入监听态，捕获一次有效组合后退出 */
function ShortcutInput({
  value,
  conflict,
  onChange,
}: {
  value: string;
  conflict: boolean;
  onChange: (combo: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  listeningRef.current = listening;
  // 用 ref 稳定 onChange，避免监听态下 effect 随父组件重渲染反复重启捕获
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!listeningRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(false);
        return;
      }
      const combo = comboFromEvent(e.nativeEvent);
      if (combo) {
        onChange(combo);
        setListening(false);
      }
    },
    [onChange],
  );

  // 监听态下失焦自动退出，避免卡在录入状态
  useEffect(() => {
    if (!listening) return;
    const onBlur = () => setListening(false);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [listening]);

  // Win 组合键到不了 webview（系统功能会抢先触发），改由后端钩子
  // 在捕获模式下拦截并以事件回传组合串
  useEffect(() => {
    if (!listening) return;
    let unsub: (() => void) | undefined;
    let disposed = false;
    onEvent<string>(EVT_SHORTCUT_WIN_CAPTURED, (combo) => {
      if (!listeningRef.current) return;
      onChangeRef.current(combo);
      setListening(false);
    }).then((un) => {
      if (disposed) un();
      else unsub = un;
    });
    void beginShortcutCapture();
    return () => {
      disposed = true;
      unsub?.();
      void endShortcutCapture();
    };
  }, [listening]);

  const cls = [
    "shortcut-input",
    listening ? "listening" : "",
    conflict ? "conflict" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={cls}
      onClick={() => setListening(true)}
      onKeyDown={onKeyDown}
    >
      {listening ? "按下组合键…（Esc 取消）" : value}
    </button>
  );
}

interface RowState {
  error: string;
  ok: boolean;
}

const idleRow: RowState = { error: "", ok: false };

export function ShortcutPage({ onResolved }: { onResolved: () => void }) {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const [draft, setDraft] = useState(() => ({ ...config.shortcuts }));
  const [rows, setRows] = useState<Record<Target, RowState>>({
    clipboard: idleRow,
    folder: idleRow,
    credentials: idleRow,
    translation: idleRow,
  });
  const [saving, setSaving] = useState<Target | null>(null);

  const setDraftOne = (target: Target, combo: string) => {
    setDraft((d) => ({ ...d, [target]: combo }));
    setRows((r) => ({ ...r, [target]: idleRow }));
  };

  /** 保存单个快捷键：先冲突检测，通过后注册并同步配置 */
  const saveOne = async (target: Target) => {
    const combo = draft[target];
    const others: Target[] = (
      ["clipboard", "folder", "credentials", "translation"] as Target[]
    ).filter((t) => t !== target);
    if (others.some((t) => combo === draft[t])) {
      setRows((r) => ({
        ...r,
        [target]: { error: "与另一个快捷键相同，请使用不同组合", ok: false },
      }));
      return;
    }
    if (combo === config.shortcuts[target]) {
      setRows((r) => ({ ...r, [target]: idleRow }));
      return;
    }

    setSaving(target);
    try {
      await testShortcut(combo); // 冲突时抛出，转为红色提示并阻止保存
      await applyShortcut(target, combo);
      // 同步前端配置（Rust 侧已持久化，这里不重复写盘，仅广播给其他窗口）
      await update(
        { ...config, shortcuts: { ...config.shortcuts, [target]: combo } },
        false,
      );
      setRows((r) => ({ ...r, [target]: { error: "", ok: true } }));
      onResolved();
    } catch (err) {
      setRows((r) => ({
        ...r,
        [target]: {
          error: err instanceof Error ? err.message : "保存失败，请重试",
          ok: false,
        },
      }));
    } finally {
      setSaving(null);
    }
  };

  const renderRow = (target: Target, title: string, desc: string) => {
    const state = rows[target];
    return (
      <>
        <SettingRow title={title} desc={desc}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShortcutInput
              value={draft[target]}
              conflict={!!state.error}
              onChange={(combo) => setDraftOne(target, combo)}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={
                saving !== null || draft[target] === config.shortcuts[target]
              }
              onClick={() => void saveOne(target)}
            >
              {saving === target ? "保存中…" : "保存"}
            </button>
          </div>
        </SettingRow>
        {state.error && (
          <div className="shortcut-hint error">✕ {state.error}</div>
        )}
        {state.ok && <div className="shortcut-hint ok">✓ 已生效</div>}
      </>
    );
  };

  return (
    <div className="settings-page">
      <h2>快捷键设置</h2>
      <p className="page-desc">
        全局快捷键可在任意应用中呼出面板；保存前自动检测冲突
      </p>

      <SettingGroup>
        {renderRow("clipboard", "呼出剪贴板面板", "点击快捷键后按下新组合，例如 Ctrl+Alt+C")}
        {renderRow("folder", "呼出文件夹面板", "点击快捷键后按下新组合，例如 Ctrl+Alt+F")}
        {renderRow("credentials", "呼出账号密码面板", "点击快捷键后按下新组合，例如 Alt+A")}
        {renderRow(
          "translation",
          "划词翻译",
          "选中文本后按下快捷键，自动复制并翻译，例如 Ctrl+Alt+T"
        )}
      </SettingGroup>

      <div className="shortcut-hint">
        支持 Ctrl / Alt / Shift / Win（Super）与字母、数字、F 键的组合；
        Win 组合由应用内核接管，保存后会替代其原有系统功能（如 Win+V
        剪贴板历史）；若提示被占用，说明该组合已被系统或其他应用注册。
      </div>
    </div>
  );
}
