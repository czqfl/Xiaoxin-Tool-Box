/** 快捷键设置页：录入组合键、冲突检测、保存后重新注册运行时热键 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfigStore } from "../stores/configStore";
import {
  applyShortcut,
  beginShortcutCapture,
  endShortcutCapture,
  resyncShortcuts,
  shortcutRuntimeBindings,
  testShortcut,
} from "../core/tauri";
import { EVT_SHORTCUT_WIN_CAPTURED, onEvent } from "../core/events";
import { SettingGroup, SettingRow } from "./components";

type Target =
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
  | "picker";

/** 将键盘事件转换为 global-shortcut 可解析的组合键字符串，如 "Ctrl+Alt+C"。
 *  F1~F12 不与文本输入冲突，允许不搭配修饰键单独使用（Snipaste 即默认 F1 截图） */
function comboFromEvent(e: KeyboardEvent): string | null {
  // 纯修饰键按下时不生成组合
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
  // 用 ref 稳定 onChange，避免监听态下 effect 随父组件重渲染反复重启捕获
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
        // 无修饰键的字母/数字：给出原因，避免"没反应"的困惑
        setHint("需搭配 Ctrl / Alt / Shift / Win；F1~F12 可单独使用");
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

interface RowState {
  error: string;
  ok: boolean;
}

const idleRow: RowState = { error: "", ok: false };

export function ShortcutPage({ onResolved }: { onResolved: () => void }) {
  const config = useConfigStore((s) => s.config);
  const sync = useConfigStore((s) => s.sync);
  // 运行时真实生效的绑定（Rust 端实际注册表），保存后/挂载时刷新——
  // 与配置声称值并列展示，任何脱节（改了不生效、旧键残留）立刻可见
  const [runtime, setRuntime] = useState<string[]>([]);
  const refreshRuntime = useCallback(() => {
    shortcutRuntimeBindings().then(setRuntime).catch(() => {});
  }, []);
  useEffect(() => { refreshRuntime(); }, [refreshRuntime]);
  const [draft, setDraft] = useState(() => ({ ...config.shortcuts }));
  const [rows, setRows] = useState<Record<Target, RowState>>({
    clipboard: idleRow,
    folder: idleRow,
    credentials: idleRow,
    translation: idleRow,
    port: idleRow,
    files: idleRow,
    snippets: idleRow,
    screenshot: idleRow,
    pins: idleRow,
    pins_close: idleRow,
    picker: idleRow,
  });
  const [saving, setSaving] = useState<Target | null>(null);
  const [resyncing, setResyncing] = useState(false);

  /** 推倒重来：全量注销所有热键后按当前配置重新注册。
   *  用于"旧键还在触发/新键不生效"这类运行时与配置脱节的自愈 */
  const doResync = async () => {
    setResyncing(true);
    try {
      const fresh = await resyncShortcuts();
      if (fresh && typeof fresh === "object" && (fresh as { shortcuts?: unknown }).shortcuts) {
        sync(fresh);
        setDraft((d) => ({ ...d, ...fresh.shortcuts }));
      }
      refreshRuntime();
    } finally {
      setResyncing(false);
    }
  };

  const setDraftOne = (target: Target, combo: string) => {
    setDraft((d) => ({ ...d, [target]: combo }));
    setRows((r) => ({ ...r, [target]: idleRow }));
  };

  /** 保存单个快捷键：先冲突检测，通过后注册并同步配置 */
  const saveOne = async (target: Target) => {
    const combo = draft[target];
    const others: Target[] = (
      [
        "clipboard",
        "folder",
        "credentials",
        "translation",
        "port",
        "files",
        "snippets",
        "screenshot",
        "pins",
        "pins_close",
        "picker",
      ] as Target[]
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
      // Rust 端原子完成：注册新键（失败旧键不动）→ 注销旧键 → 唯一持久化
      // → 广播 config://changed。这里只做内存同步，【绝不】再整份写盘——
      // 旧流程保存后用本地快照再存一遍完整配置，会把其他字段覆盖回旧值
      const fresh = await applyShortcut(target, combo);
      if (fresh && typeof fresh === "object" && (fresh as { shortcuts?: unknown }).shortcuts) {
        sync(fresh);
        setDraft((d) => ({ ...d, ...fresh.shortcuts }));
      }
      refreshRuntime();
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
          <div className="shortcut-hint error">
            <span className="hint-icon">✕</span>
            {state.error}
          </div>
        )}
        {state.ok && (
          <div className="shortcut-hint ok">
            <span className="hint-icon">✓</span>
            已保存并生效
          </div>
        )}
      </>
    );
  };

  return (
    <div className="settings-page">
      <h2>快捷键设置</h2>
      <p className="page-desc">
        全局快捷键可在任意应用中呼出面板；保存前自动检测冲突
      </p>

      <div className="setting-group-title">面板呼出</div>
      <SettingGroup>
        {renderRow("clipboard", "呼出剪贴板面板", "点击快捷键后按下新组合，例如 Ctrl+Alt+C")}
        {renderRow("folder", "呼出文件夹面板", "点击快捷键后按下新组合，例如 Ctrl+Alt+F")}
        {renderRow("credentials", "呼出账号密码面板", "点击快捷键后按下新组合，例如 Alt+A")}
        {renderRow(
          "port",
          "呼出端口工具面板",
          "点击快捷键后按下新组合，例如 Alt+P（查询端口占用 / 一键杀进程）"
        )}
        {renderRow(
          "files",
          "呼出快速文件面板",
          "点击快捷键后按下新组合，例如 Alt+Q（快速新建 / 管理各类文件）"
        )}
        {renderRow(
          "snippets",
          "呼出语速贴面板",
          "点击快捷键后按下新组合，例如 Alt+K（快捷短语，一键粘贴到任意应用）"
        )}
      </SettingGroup>

      <div className="setting-group-title">效率操作</div>
      <SettingGroup>
        {renderRow(
          "translation",
          "划词翻译",
          "选中文本后按下快捷键，自动复制并翻译，例如 Alt+S（单个功能键+字母即可）"
        )}
      </SettingGroup>

      <div className="setting-group-title">截图贴图</div>
      <SettingGroup>
        {renderRow(
          "screenshot",
          "开始截图",
          "点击快捷键后按下新组合，例如 Ctrl+Alt+A（冻结屏幕 + 全屏遮罩选区）"
        )}
        {renderRow(
          "picker",
          "屏幕取色",
          "点击快捷键后按下新组合，例如 Alt+D（十字线跟随鼠标显示坐标与颜色，C 复制颜色，Shift 切换 RGB/HEX）"
        )}
        {renderRow(
          "pins",
          "显示 / 隐藏全部贴图",
          "点击快捷键后按下新组合，例如 Ctrl+Alt+P（一键显示或隐藏所有贴在桌面上的图片）"
        )}
      </SettingGroup>

      <div className="shortcut-hint">
        支持单独使用 F1~F12（如 F1 截图），或 Ctrl / Alt / Shift / Win
        与字母、数字、F 键的组合；Win 与纯 Alt 组合由应用内核接管，保存后会替代其原有系统功能（如
        Win+V 剪贴板历史）；若提示被占用，说明该组合已被系统或其他应用注册。
      </div>

      <div className="shortcut-hint" style={{ marginTop: 8 }}>
        <b>运行时实际生效：</b>
        {runtime.length > 0 ? runtime.join("；") : "（读取中…）"}
      </div>

      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          className="btn btn-sm"
          disabled={resyncing}
          onClick={() => void doResync()}
          title="若出现旧快捷键还在触发、新快捷键不生效等脱节现象，点此全部注销后按当前配置重新注册"
        >
          {resyncing ? "重新注册中…" : "重置并重新注册全部快捷键"}
        </button>
      </div>
    </div>
  );
}
