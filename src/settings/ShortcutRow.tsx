/** 快捷键行组件：录入组合键 + 冲突检测 + 保存即注册（原独立快捷键页的
 *  核心逻辑组件化——快捷键设置分拆到各功能模块页复用） */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConfigStore } from "../stores/configStore";
import {
  applyShortcut,
  beginShortcutCapture,
  endShortcutCapture,
  shortcutRuntimeBindings,
  testShortcut,
} from "../core/tauri";
import { EVT_SHORTCUT_WIN_CAPTURED, onEvent } from "../core/events";
import { SettingRow } from "./components";

export type ShortcutTarget =
  | "clipboard"
  | "folder"
  | "credentials"
  | "translation"
  | "port"
  | "files"
  | "snippets"
  | "screenshot"
  | "pins"
  | "pins_close"
  | "picker"
  | "recorder"
  | "palette";

/** 模块级保存锁：同一时刻只允许一行在执行 applyShortcut。
 *  两行并发保存会各自基于旧快照注册，后完成者覆盖先完成者的结果 */
let savingTarget: ShortcutTarget | null = null;
const saveLockListeners = new Set<() => void>();
function notifySaveLock() {
  saveLockListeners.forEach((l) => l());
}
function subscribeSaveLock(cb: () => void) {
  saveLockListeners.add(cb);
  return () => {
    saveLockListeners.delete(cb);
  };
}
function getSavingTarget() {
  return savingTarget;
}

/** 将键盘事件转换为 global-shortcut 可解析的组合键字符串，如 "Ctrl+Alt+C"。
 *  F1~F12 不与文本输入冲突，允许不搭配修饰键单独使用（Snipaste 即默认 F1 截图） */
function comboFromEvent(e: KeyboardEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;

  let main = "";
  let isFunctionKey = false;
  if (/^[a-zA-Z]$/.test(e.key)) {
    main = e.key.toUpperCase();
  } else if (/^[0-9]$/.test(e.key)) {
    main = e.key;
  } else if (/^F([1-9]|1[0-2])$/.test(e.key)) {
    main = e.key.toUpperCase();
    isFunctionKey = true;
  } else {
    return null;
  }

  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  // 字母/数字必须带至少一个修饰键，避免误占普通打字按键；F 键可单独使用
  if (mods.length === 0 && !isFunctionKey) return null;
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
  const [hint, setHint] = useState("");
  const listeningRef = useRef(false);
  listeningRef.current = listening;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!listeningRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setHint("");
      if (e.key === "Escape") {
        setListening(false);
        return;
      }
      const combo = comboFromEvent(e.nativeEvent);
      if (combo) {
        onChange(combo);
        setListening(false);
      } else if (/^[a-zA-Z0-9]$/.test(e.key)) {
        setHint("需搭配 Ctrl / Alt / Shift / Win；F1~F12 可单独使用");
      }
    },
    [onChange],
  );

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
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <button
        type="button"
        className={cls}
        onClick={() => { setHint(""); setListening(true); }}
        onKeyDown={onKeyDown}
      >
        {listening ? "按下组合键…（Esc 取消）" : value}
      </button>
      {listening && hint && <span className="shortcut-input-hint">{hint}</span>}
    </div>
  );
}

/** 单条快捷键设置行：本地草稿 → 冲突检测 → 保存（Rust 原子注册+持久化+广播） */
export function ShortcutRow({
  target,
  title,
  desc,
  onSaved,
}: {
  target: ShortcutTarget;
  title: string;
  desc: string;
  /** 保存成功后回调（如清除全局"注册失败"提示） */
  onSaved?: () => void;
}) {
  const config = useConfigStore((s) => s.config);
  const sync = useConfigStore((s) => s.sync);
  const [draft, setDraft] = useState(config.shortcuts[target]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 草稿是否被用户改过且尚未保存。脏草稿不跟随外部配置同步——
   *  否则保存快捷键 A 触发的全量广播会把 B 行刚录入的草稿重置回旧值，
   *  造成"同时改两个快捷键，保存完一个另一个丢失" */
  const dirtyRef = useRef(false);
  const lockedBy = useSyncExternalStore(subscribeSaveLock, getSavingTarget);
  const lockedByOther = lockedBy !== null && lockedBy !== target;
  // 运行时绑定变化后刷新（其他行保存会改变冲突判定基准）
  const [, bumpRuntime] = useState(0);
  useEffect(() => {
    shortcutRuntimeBindings().then(() => bumpRuntime((n) => n + 1)).catch(() => {});
  }, []);
  // 配置被其他窗口/保存流程更新时跟随（如 resync 回滚）；脏草稿例外
  useEffect(() => {
    if (!dirtyRef.current) setDraft(config.shortcuts[target]);
  }, [config.shortcuts, target]);

  const save = async () => {
    if (lockedBy) return; // 其他行正在保存，等它完成
    const combo = draft;
    const others = (Object.keys(config.shortcuts) as ShortcutTarget[]).filter((t) => t !== target);
    if (others.some((t) => combo === config.shortcuts[t])) {
      setError("与另一个快捷键相同，请使用不同组合");
      setOk(false);
      return;
    }
    if (combo === config.shortcuts[target]) {
      setError("");
      setOk(false);
      return;
    }
    savingTarget = target;
    notifySaveLock();
    setSaving(true);
    try {
      await testShortcut(combo); // 冲突时抛出
      const fresh = await applyShortcut(target, combo);
      dirtyRef.current = false; // 保存成功：允许后续外部同步覆盖草稿
      if (fresh && typeof fresh === "object" && (fresh as { shortcuts?: unknown }).shortcuts) {
        sync(fresh);
        setDraft((fresh as unknown as { shortcuts: Record<string, string> }).shortcuts[target]);
      }
      setOk(true);
      setError("");
      onSaved?.();
    } catch (err) {
      // invoke 拒绝值是纯字符串（后端 Err(String)），不是 Error 实例——
      // instanceof 分支会吞掉真实原因只剩"请重试"，必须按字符串透传
      const msg =
        err instanceof Error ? err.message : typeof err === "string" && err ? err : "保存失败，请重试";
      setError(msg);
      setOk(false);
    } finally {
      savingTarget = null;
      notifySaveLock();
      setSaving(false);
    }
  };

  return (
    <>
      <SettingRow title={title} desc={desc}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShortcutInput
            value={draft}
            conflict={!!error}
            onChange={(combo) => { setDraft(combo); dirtyRef.current = true; setError(""); setOk(false); }}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={saving || lockedByOther || draft === config.shortcuts[target]}
            onClick={() => void save()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </SettingRow>
      {error && (
        <div className="shortcut-hint error">
          <span className="hint-icon">✕</span>
          {error}
        </div>
      )}
      {ok && (
        <div className="shortcut-hint ok">
          <span className="hint-icon">✓</span>
          已保存并生效
        </div>
      )}
    </>
  );
}
