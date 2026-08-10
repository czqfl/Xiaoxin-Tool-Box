//! 全局快捷键：注册/冲突检测/运行时切换。
use crate::config::{AppConfig, ConfigState, PasteMode};
use crate::panel::{self, CLIPBOARD_PANEL, CREDENTIAL_PANEL, FOLDER_PANEL};
use crate::storage::{save_json, AppPaths};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut};

/// 启动时热键注册失败事件（payload: "clipboard" | "folder"）
pub const EVT_REGISTER_FAILED: &str = "shortcut://register-failed";
/// 捕获模式下钩子拦到的 Win 组合键（payload: "Super+X" 组合串）
pub const EVT_WIN_CAPTURED: &str = "shortcut://win-captured";

/// 运行时已注册的热键绑定（面板呼出 × 2）
#[derive(Default)]
pub struct ShortcutBindings(pub Mutex<ShortcutBindingsInner>);

#[derive(Default)]
pub struct ShortcutBindingsInner {
    pub clipboard: Option<Shortcut>,
    pub folder: Option<Shortcut>,
    pub credentials: Option<Shortcut>,
}

pub fn parse(shortcut: &str) -> Result<Shortcut, String> {
    shortcut.parse::<Shortcut>().map_err(|_| {
        format!("快捷键格式不正确：{shortcut}（示例：Ctrl+Alt+C、Alt+F5）")
    })
}

/// Win 组合键被系统 shell 保留，RegisterHotKey 无法注册，
/// 改由低级键盘钩子（keyhook）在事件到达系统前接管
#[cfg(windows)]
fn is_hook_combo(s: &Shortcut) -> bool {
    s.mods == Modifiers::SUPER
}

#[cfg(not(windows))]
fn is_hook_combo(_s: &Shortcut) -> bool {
    false
}

/// 钩子接管的热键主键虚拟键码（仅支持字母/数字/F 键）
#[cfg(windows)]
fn hook_vk(s: &Shortcut) -> Result<u16, String> {
    crate::keyhook::code_to_vk(s.key)
        .ok_or_else(|| "Win 组合仅支持字母、数字与 F 键".to_string())
}

/// 注册单个面板热键：Win 组合交给低级钩子接管，其余走全局热键插件
fn register_combo<R: Runtime>(
    app: &AppHandle<R>,
    target: &str,
    s: Shortcut,
) -> Result<(), String> {
    if is_hook_combo(&s) {
        #[cfg(windows)]
        {
            crate::keyhook::set_panel_hotkey(target, hook_vk(&s)?);
            return Ok(());
        }
        #[cfg(not(windows))]
        return Err("当前平台不支持 Win 组合键".into());
    }
    app.global_shortcut()
        .register(s)
        .map_err(|_| "该快捷键已被系统或其他应用占用，请更换其他组合".to_string())
}

/// 注销单个面板热键（区分钩子接管与插件注册）
fn unregister_combo<R: Runtime>(app: &AppHandle<R>, target: &str, s: Shortcut) {
    if is_hook_combo(&s) {
        #[cfg(windows)]
        crate::keyhook::set_panel_hotkey(target, 0);
        return;
    }
    let _ = app.global_shortcut().unregister(s);
}

/// 冲突检测：尝试注册后立即回滚。若与当前应用已绑定一致则直接视为可用
#[tauri::command]
pub fn shortcut_test(
    app: AppHandle,
    shortcut: String,
    bindings: State<'_, ShortcutBindings>,
) -> Result<(), String> {
    let parsed = parse(&shortcut)?;
    {
        let inner = bindings.0.lock().unwrap();
        if inner.clipboard == Some(parsed)
            || inner.folder == Some(parsed)
            || inner.credentials == Some(parsed)
        {
            return Ok(());
        }
    }
    #[cfg(windows)]
    if is_hook_combo(&parsed) {
        // 钩子总是能拦截 Win 组合（Win+L 等系统直取组合除外），无需试注册
        return hook_vk(&parsed).map(|_| ());
    }
    let gs = app.global_shortcut();
    gs.register(parsed)
        .map_err(|_| "该快捷键已被系统或其他应用占用，请更换其他组合".to_string())?;
    let _ = gs.unregister(parsed);
    Ok(())
}

/// 开始录入捕获：钩子接管 Win 组合，避免系统功能（剪贴板历史等）抢先触发
#[tauri::command]
pub fn shortcut_capture_begin() {
    #[cfg(windows)]
    crate::keyhook::set_capture_mode(true);
}

/// 结束录入捕获
#[tauri::command]
pub fn shortcut_capture_end() {
    #[cfg(windows)]
    crate::keyhook::set_capture_mode(false);
}

/// 应用新快捷键：注册成功后注销旧绑定，并持久化到配置
#[tauri::command]
pub fn shortcut_apply(
    app: AppHandle,
    target: String,
    shortcut: String,
    bindings: State<'_, ShortcutBindings>,
    paths: State<'_, AppPaths>,
    config_state: State<'_, ConfigState>,
) -> Result<(), String> {
    if target != "clipboard" && target != "folder" && target != "credentials" {
        return Err("未知的快捷键目标".into());
    }
    let parsed = parse(&shortcut)?;
    let mut inner = bindings.0.lock().unwrap();
    let current = if target == "clipboard" {
        inner.clipboard
    } else if target == "folder" {
        inner.folder
    } else {
        inner.credentials
    };
    if current == Some(parsed) {
        return Ok(());
    }

    register_combo(&app, &target, parsed)?;
    if let Some(old) = current {
        unregister_combo(&app, &target, old);
    }
    if target == "clipboard" {
        inner.clipboard = Some(parsed);
    } else if target == "folder" {
        inner.folder = Some(parsed);
    } else {
        inner.credentials = Some(parsed);
    }
    drop(inner);

    // 持久化到配置文件与运行时配置状态
    let mut config = config_state.0.lock().unwrap().clone();
    if target == "clipboard" {
        config.shortcuts.clipboard = shortcut;
    } else if target == "folder" {
        config.shortcuts.folder = shortcut;
    } else {
        config.shortcuts.credentials = shortcut;
    }
    let _ = save_json(&paths.config_file, &config);
    *config_state.0.lock().unwrap() = config;
    Ok(())
}

/// 启动时按配置注册全局热键；失败则通知前端并打开设置页引导修改
pub fn register_initial<R: Runtime>(app: &AppHandle<R>, config: &AppConfig) {
    register_one(app, "clipboard", &config.shortcuts.clipboard);
    register_one(app, "folder", &config.shortcuts.folder);
    register_one(app, "credentials", &config.shortcuts.credentials);
    sync_seq_shortcut(app, config.clipboard.paste_mode);
}

/// 按粘贴模式同步全局 Ctrl+V 顺序粘贴：顺序模式由低级钩子拦截，普通模式放行
pub fn sync_seq_shortcut<R: Runtime>(app: &AppHandle<R>, mode: PasteMode) {
    let _ = app;
    #[cfg(windows)]
    crate::keyhook::set_seq_paste_enabled(mode != PasteMode::Normal);
}

fn register_one<R: Runtime>(app: &AppHandle<R>, target: &str, shortcut_str: &str) {
    let parsed = match parse(shortcut_str) {
        Ok(p) => p,
        Err(_) => {
            notify_failed(app, target);
            return;
        }
    };
    match register_combo(app, target, parsed) {
        Ok(()) => {
            if let Some(b) = app.try_state::<ShortcutBindings>() {
                let mut inner = b.0.lock().unwrap();
                if target == "clipboard" {
                    inner.clipboard = Some(parsed);
                } else if target == "folder" {
                    inner.folder = Some(parsed);
                } else {
                    inner.credentials = Some(parsed);
                }
            }
        }
        Err(_) => notify_failed(app, target),
    }
}

fn notify_failed<R: Runtime>(app: &AppHandle<R>, target: &str) {
    let _ = app.emit(EVT_REGISTER_FAILED, target);
    crate::tray::show_settings_window(app);
}

/// 根据热键解析对应面板标签
pub fn panel_label_for(
    bindings: &ShortcutBindingsInner,
    shortcut: &Shortcut,
) -> Option<&'static str> {
    if bindings.clipboard == Some(*shortcut) {
        Some(CLIPBOARD_PANEL)
    } else if bindings.folder == Some(*shortcut) {
        Some(FOLDER_PANEL)
    } else if bindings.credentials == Some(*shortcut) {
        Some(CREDENTIAL_PANEL)
    } else {
        None
    }
}

/// 供 lib.rs 中全局热键 handler 调用（仅插件注册的非 Win 组合会到这里）
pub fn handle_shortcut_pressed<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut) {
    let Some(bindings) = app.try_state::<ShortcutBindings>() else {
        return;
    };
    let label = {
        let inner = bindings.0.lock().unwrap();
        panel_label_for(&inner, shortcut)
    };
    if let Some(label) = label {
        panel::toggle_panel(app, label);
    }
}
