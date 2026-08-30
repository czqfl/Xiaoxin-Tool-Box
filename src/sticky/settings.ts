import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadSettings, saveSettings } from "./api";
import type { Settings } from "./types";

/** 便签明暗主题统一由工具箱「通用设置 → 主题」派生（便签不再单独提供明暗选择）：
 *  dark → 深色；light/mint/skyblue/red/orange 等彩色浅色 → 浅色；system → 跟随系统深浅 */
async function deriveTheme(): Promise<"light" | "dark"> {
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    const cfg = await invoke<{ general?: { theme?: string } }>("config_load");
    const t = cfg?.general?.theme ?? "system";
    if (t === "dark") return "dark";
    if (t !== "system") return "light"; // light 与彩色浅色主题都是浅色系
    return sysDark ? "dark" : "light";
  } catch {
    return sysDark ? "dark" : "light";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("IPC 调用超时：" + label)), ms),
    ),
  ]);
}

/** 把存储的毛玻璃强度统一规范为 0~100 的整数百分比。
 *  旧版本以 px（4~40）存储，这里做兼容迁移：>100 视为旧 px 值换算成百分比。 */
export function normalizeGlassPct(v: number | undefined | null): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 55;
  if (v > 100) return Math.round((v / 40) * 100); // 旧 px -> 百分比（40px ≈ 100%）
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** 把存储的“背景不透明度”统一规范为 0~100 的整数百分比（透明主题原生亚克力着色层）。 */
export function normalizeOpacity(v: number | undefined | null): number {
  if (typeof v !== "number" || Number.isNaN(v)) return 65;
  return Math.max(0, Math.min(100, Math.round(v)));
}

let cached: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (!cached) {
    const raw = (await withTimeout(loadSettings(), 8000, "load_settings")) as Settings & { bg_transparent?: boolean };
    // 迁移：旧版 bg_transparent 透明开关统一收归为 theme:"transparent"（幂等）
    if (raw.bg_transparent === true && raw.theme !== "transparent") {
      raw.theme = "transparent";
      delete raw.bg_transparent;
      try {
        await saveSettings(raw as Settings);
      } catch (e) {
        console.error("迁移透明设置失败:", e);
      }
    }
    // 迁移：透明主题已移除（工具箱自带不透明度 + 亚克力），存量 transparent 归入浅色
    if (raw.theme === "transparent") {
      raw.theme = "light";
      try {
        await saveSettings(raw as Settings);
      } catch (e) {
        console.error("迁移透明主题失败:", e);
      }
    }
    // 明暗主题统一由工具箱「通用设置 → 主题」派生
    raw.theme = await deriveTheme();
    cached = raw as Settings;
    // 工具箱主题为「跟随系统」时，系统深浅切换 → 便签同步跟随
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      void notifyChanged();
    });
  }
  return cached;
}

/** 工具箱主题变化时由 main.tsx 调用：强制按工具箱配置重新派生明暗并触发
 *  全部便签联动（applyTheme/背景等）。config_save 不会广播便签的
 *  settings-changed 事件，此函数是「工具箱切主题 → 已打开便签实时跟随」的桥。 */
export async function refreshThemeFromToolbox(): Promise<void> {
  if (!cached) {
    await getSettings();
    return;
  }
  cached.theme = await deriveTheme();
  for (const cb of listeners) {
    try {
      cb();
    } catch (e) {
      console.error("主题刷新回调出错:", e);
    }
  }
}

/** 同步读取快捷键，设置未加载完时返回空串 */
export function getShortcut(action: string): string {
  return cached?.shortcuts?.[action] ?? "";
}

// 所有便签窗口（独立 webview）共享同一份设置缓存；任一窗口修改设置后都会注册
// 监听器，收到变更时从磁盘重新读取并回调，实现全局同步（解决“改了背景只有当前便签生效”）。
const listeners: Array<() => void> = [];
let globalListenerRegistered = false;

/** 从磁盘重新加载设置并通知所有监听器（主题 / 背景 / 快捷键等联动） */
async function notifyChanged(): Promise<void> {
  try {
    const fresh = (await withTimeout(loadSettings(), 8000, "notifyChanged load_settings")) as Settings;
    // 明暗主题同样以工具箱配置为准
    fresh.theme = await deriveTheme();
    cached = fresh;
  } catch (e) {
    console.error("重新读取设置失败:", e);
  }
  for (const cb of listeners) {
    try {
      cb();
    } catch (e) {
      console.error("设置变更回调出错:", e);
    }
  }
}

/** 注册“设置变更”监听器：会被后端广播的全局事件（settings-changed）与窗口内事件共同触发 */
export function onSettingsChanged(cb: () => void): void {
  listeners.push(cb);
  if (!globalListenerRegistered) {
    globalListenerRegistered = true;
    // 后端保存设置后会向所有窗口广播该事件，保证其它已打开便签窗口也同步刷新
    listen("settings-changed", () => {
      notifyChanged();
    }).catch((e) => console.error("监听 settings-changed 失败:", e));
  }
}

/**
 * 用一份新的完整设置覆盖模块内缓存，并派发变更事件，通知所有监听者（主题联动）。
 */
export function setSettings(next: Settings): void {
  cached = JSON.parse(JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
}

const SETTINGS_EVENT = "xiaoxin-sticky-note-settings-changed";
if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => {
    notifyChanged();
  });
}
