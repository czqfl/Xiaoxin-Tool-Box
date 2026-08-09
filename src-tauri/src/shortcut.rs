//! 全局快捷键：注册/冲突检测/运行时切换。
use crate::config::{AppConfig, ConfigState};
use crate::panel::{self, CLIPBOARD_PANEL, FOLDER_PANEL};
use crate::storage::{save_json, AppPaths};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// 启动时热键注册失败事件（payload: "clipboard" | "folder"）
pub const EVT_REGISTER_FAILED: &str = "shortcut://register-failed";

/// 运行时已注册的两个热键绑定
#[derive(Default)]
pub struct ShortcutBindings(pub Mutex<ShortcutBindingsInner>);

#[derive(Default)]
pub struct ShortcutBindingsInner {
    pub clipboard: Option<Shortcut>,
    pub folder: Option<Shortcut>,
}

pub fn parse(shortcut: &str) -> Result<Shortcut, String> {
    shortcut.parse::<Shortcut>().map_err(|_| {
        format!("快捷键格式不正确：{shortcut}（示例：Ctrl+Alt+C、Alt+F5）")
    })
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
        if inner.clipboard == Some(parsed) || inner.folder == Some(parsed) {
            return Ok(());
        }
    }
    let gs = app.global_shortcut();
    gs.register(parsed)
        .map_err(|_| "该快捷键已被系统或其他应用占用，请更换其他组合".to_string())?;
    let _ = gs.unregister(parsed);
    Ok(())
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
    if target != "clipboard" && target != "folder" {
        return Err("未知的快捷键目标".into());
    }
    let parsed = parse(&shortcut)?;
    let mut inner = bindings.0.lock().unwrap();
    let current = if target == "clipboard" {
        inner.clipboard
    } else {
        inner.folder
    };
    if current == Some(parsed) {
        return Ok(());
    }

    let gs = app.global_shortcut();
    gs.register(parsed)
        .map_err(|_| "该快捷键已被系统或其他应用占用，请更换其他组合".to_string())?;
    if let Some(old) = current {
        let _ = gs.unregister(old);
    }
    if target == "clipboard" {
        inner.clipboard = Some(parsed);
    } else {
        inner.folder = Some(parsed);
    }
    drop(inner);

    // 持久化到配置文件与运行时配置状态
    let mut config = config_state.0.lock().unwrap().clone();
    if target == "clipboard" {
        config.shortcuts.clipboard = shortcut;
    } else {
        config.shortcuts.folder = shortcut;
    }
    let _ = save_json(&paths.config_file, &config);
    *config_state.0.lock().unwrap() = config;
    Ok(())
}

/// 启动时按配置注册两个全局热键；失败则通知前端并打开设置页引导修改
pub fn register_initial<R: Runtime>(app: &AppHandle<R>, config: &AppConfig) {
    register_one(app, "clipboard", &config.shortcuts.clipboard);
    register_one(app, "folder", &config.shortcuts.folder);
}

fn register_one<R: Runtime>(app: &AppHandle<R>, target: &str, shortcut_str: &str) {
    let parsed = match parse(shortcut_str) {
        Ok(p) => p,
        Err(_) => {
            notify_failed(app, target);
            return;
        }
    };
    match app.global_shortcut().register(parsed) {
        Ok(()) => {
            if let Some(b) = app.try_state::<ShortcutBindings>() {
                let mut inner = b.0.lock().unwrap();
                if target == "clipboard" {
                    inner.clipboard = Some(parsed);
                } else {
                    inner.folder = Some(parsed);
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
    } else {
        None
    }
}

/// 供 lib.rs 中全局热键 handler 调用
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
