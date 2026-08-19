/** 快捷键设置页：录入组合键、冲突检测、保存后重新注册运行时热键 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useConfigStore } from "../stores/configStore";
import {
  applyShortcut,
  beginShortcutCapture,
  endShortcutCapture,
  testShortcut,
} from "../core/tauri";
import { EVT_SHORTCUT_WIN_CAPTURED, onEvent } from "../core/events";
import { SettingGroup, SettingRow } from "./components";

type Target = "clipboard" | "folder" | "credentials" | "translation" | "port";

/** 便签快捷键项（存储于便签设置 sticky_settings.json 的 shortcuts 字段）：
 *  前 4 项在便签窗口聚焦时生效（编辑区快捷键），后 3 项为全局快捷键 */
const STICKY_ACTIONS: { key: string; label: string; global?: boolean }[] = [
  { key: "fg_color", label: "字体颜色" },
  { key: "bg_color", label: "字体背景色" },
  { key: "size_up", label: "增大字号" },
  { key: "size_down", label: "减小字号" },
  { key: "show_app", label: "呼出 / 收起便签", global: true },
  { key: "open_history", label: "呼出 / 收起历史便签面板", global: true },
  { key: "new_note", label: "新建便签", global: true },
];

/** 便签快捷键录制解析：与工具箱版差异是【允许纯功能键】（F2/F4 等）与
 *  方向键（Ctrl+ArrowUp 字号），原版便签默认就是 F2/F4 这类组合 */
function stickyComboFromEvent(e: KeyboardEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  let main = "";
  if (/^[a-zA-Z]$/.test(e.key)) main = e.key.toUpperCase();
  else if (/^[0-9]$/.test(e.key)) main = e.key;
  else if (/^F(\d{1,2})$/.test(e.key)) main = e.key.toUpperCase();
  else if (e.code === "Equal") main = "Plus";
  else if (e.code === "Minus") main = "Minus";
  else if (e.key === " ") main = "Space";
  else if (e.key === "ArrowUp") main = "ArrowUp";
  else if (e.key === "ArrowDown") main = "ArrowDown";
  else return null;
  parts.push(main);
  return parts.join("+");
}

/** 便签快捷键录入框：前端 keydown 捕获（支持纯 F 键），Esc 取消 */
function StickyShortcutInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (combo: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  listeningRef.current = listening;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!listeningRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setListening(false);
      return;
    }
    const combo = stickyComboFromEvent(e.nativeEvent);
    if (combo) {
      onChangeRef.current(combo);
      setListening(false);
    }
  }, []);

  useEffect(() => {
    if (!listening) return;
    const onBlur = () => setListening(false);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [listening]);

  return (
    <button
      type="button"
      className="shortcut-input"
      onClick={() => setListening(true)}
      onKeyDown={onKeyDown}
    >
      {listening ? "按下组合键…（Esc 取消）" : value || "未设置"}
    </button>
  );
}

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
    port: idleRow,
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
      ["clipboard", "folder", "credentials", "translation", "port"] as Target[]
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

  // ---- 便签快捷键分组（用户要求：统一移到本页，单独分组）----
  // 存储于便签设置（sticky_settings.json）的 shortcuts 字段，与便签前端
  // getShortcut 一致；全局项（呼出/收起便签、呼出/收起历史面板、新建）保存后
  // 调 register_shortcuts 重注册系统级热键。
  const [stickyShortcuts, setStickyShortcuts] = useState<Record<string, string>>({});
  const [stickySaved, setStickySaved] = useState<Record<string, string>>({});
  const [stickySaving, setStickySaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<{ shortcuts?: Record<string, string> }>("load_settings")
      .then((s) => {
        if (alive) {
          const sc = s?.shortcuts ?? {};
          setStickyShortcuts(sc);
          setStickySaved(sc); // 记录已保存值，用于判断「是否有改动」以禁用保存按钮
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const saveStickyOne = async (key: string) => {
    const combo = stickyShortcuts[key];
    if (!combo || combo === stickySaved[key]) return;
    setStickySaving(key);
    try {
      const s = await invoke<{ shortcuts?: Record<string, string> }>("load_settings");
      const next = { ...s, shortcuts: { ...(s?.shortcuts ?? {}), [key]: combo } };
      await invoke("save_settings", { settings: next });
      await invoke("register_shortcuts"); // 全局快捷键重注册（呼出/全部关闭/新建）
      setStickySaved((d) => ({ ...d, [key]: combo })); // 更新已保存值 → 按钮恢复禁用
    } catch (err) {
      console.error("保存便签快捷键失败:", err);
    } finally {
      setStickySaving(null);
    }
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
          "选中文本后按下快捷键，自动复制并翻译，例如 Alt+S（单个功能键+字母即可）"
        )}
        {renderRow(
          "port",
          "呼出端口工具面板",
          "点击快捷键后按下新组合，例如 Alt+P（查询端口占用 / 一键杀进程）"
        )}
      </SettingGroup>

      {/* ===== 便签分组：统一在此配置便签快捷键 ===== */}
      <div className="setting-group-title">便签</div>
      <SettingGroup>
        {STICKY_ACTIONS.map((a) => (
          <SettingRow
            key={a.key}
            title={a.label}
            desc={a.global ? "全局快捷键：任意应用中生效" : "便签窗口聚焦时生效（编辑区快捷键）"}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StickyShortcutInput
                value={stickyShortcuts[a.key] ?? ""}
                onChange={(combo) =>
                  setStickyShortcuts((d) => ({ ...d, [a.key]: combo }))
                }
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={
                  stickySaving !== null ||
                  !stickyShortcuts[a.key] ||
                  stickyShortcuts[a.key] === stickySaved[a.key]
                }
                onClick={() => void saveStickyOne(a.key)}
              >
                {stickySaving === a.key ? "保存中…" : "保存"}
              </button>
            </div>
          </SettingRow>
        ))}
      </SettingGroup>
      <div className="shortcut-hint">
        便签快捷键支持纯功能键（如 F2 / F4）与 Ctrl/Alt/Shift 组合；
        建议「呼出/收起便签」「呼出/收起历史面板」用功能键，编辑区快捷键用组合键避免误触。
      </div>

      <div className="shortcut-hint">
        支持 Ctrl / Alt / Shift / Win（Super）与字母、数字、F 键的组合；
        Win 与纯 Alt 组合由应用内核接管，保存后会替代其原有系统功能（如
        Win+V 剪贴板历史）；若提示被占用，说明该组合已被系统或其他应用注册。
      </div>
    </div>
  );
}
