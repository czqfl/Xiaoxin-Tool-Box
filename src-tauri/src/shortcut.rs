//! 全局快捷键：注册/冲突检测/运行时切换。
use crate::config::{AppConfig, ConfigState, PasteMode};
use crate::panel::{
    self, CLIPBOARD_PANEL, CREDENTIAL_PANEL, FILES_PANEL, FOLDER_PANEL, PORT_PANEL,
    SNIPPETS_PANEL,
};
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
    /// 划词翻译（非面板，触发翻译动作）
    pub translation: Option<Shortcut>,
    /// 呼出端口工具面板
    pub port: Option<Shortcut>,
    /// 呼出快速文件面板
    pub files: Option<Shortcut>,
    /// 呼出语速贴面板
    pub snippets: Option<Shortcut>,
}

pub fn parse(shortcut: &str) -> Result<Shortcut, String> {
    shortcut.parse::<Shortcut>().map_err(|_| {
        format!("快捷键格式不正确：{shortcut}（示例：Ctrl+Alt+C、Alt+F5）")
    })
}

/// Win 组合键被系统 shell 保留，RegisterHotKey 无法注册，
/// 改由低级键盘钩子（keyhook）在事件到达系统前接管。
/// 纯 Alt 组合【双保险】：
///   1. 交给钩子主动吞键（防"主键泄漏进编辑器替换选中文字"）并触发；
///   2. 同时注册 RegisterHotKey 作为兜底——钩子匹配一旦因任何原因
///      （ALT_HELD 未置位等）失败，由系统热键保证一定能触发。
///   两者互不冲突：钩子吞键后按键不会到达系统，RegisterHotKey 不触发；
///   钩子放行时按键到达系统，RegisterHotKey 正常触发。
#[cfg(windows)]
fn is_hook_combo(s: &Shortcut) -> bool {
    s.mods == Modifiers::SUPER || s.mods == Modifiers::ALT
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

/// 注册单个面板热键：Win 组合交给低级钩子接管；纯 Alt 组合【钩子 + RegisterHotKey
/// 双保险】；其余（Ctrl、Ctrl+Alt 等）走全局热键插件
fn register_combo<R: Runtime>(
    app: &AppHandle<R>,
    target: &str,
    s: Shortcut,
) -> Result<(), String> {
    if is_hook_combo(&s) {
        #[cfg(windows)]
        {
            crate::keyhook::set_panel_hotkey(target, s.mods == Modifiers::ALT, hook_vk(&s)?);
            // Alt 组合兜底注册 RegisterHotKey：保证钩子异常时也能触发
            if s.mods == Modifiers::ALT {
                app.global_shortcut().register(s).map_err(|_| {
                    "该快捷键已被系统或其他应用占用，请更换其他组合".to_string()
                })?;
            }
            return Ok(());
        }
        #[cfg(not(windows))]
        return Err("当前平台不支持 Win/Alt 组合键".into());
    }
    app.global_shortcut()
        .register(s)
        .map_err(|_| "该快捷键已被系统或其他应用占用，请更换其他组合".to_string())
}

/// 注销单个面板热键（区分钩子接管与插件注册）
fn unregister_combo<R: Runtime>(app: &AppHandle<R>, target: &str, s: Shortcut) {
    if is_hook_combo(&s) {
        #[cfg(windows)]
        {
            crate::keyhook::set_panel_hotkey(target, s.mods == Modifiers::ALT, 0);
            if s.mods == Modifiers::ALT {
                let _ = app.global_shortcut().unregister(s);
            }
        }
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
            || inner.translation == Some(parsed)
            || inner.port == Some(parsed)
            || inner.files == Some(parsed)
            || inner.snippets == Some(parsed)
        {
            return Ok(());
        }
    }
    #[cfg(windows)]
    if is_hook_combo(&parsed) {
        if parsed.mods == Modifiers::ALT {
            // Alt 组合双保险中的 RegisterHotKey 需要真注册：试注册检测占用
            // （钩子虽总能拦截，但若系统里该组合已被占用，兜底注册会失败）
            let gs = app.global_shortcut();
            gs.register(parsed).map_err(|_| {
                "该快捷键已被系统或其他应用占用，请更换其他组合".to_string()
            })?;
            let _ = gs.unregister(parsed);
            return Ok(());
        }
        // Win 组合：钩子总是能拦截（Win+L 等系统直取组合除外），无需试注册
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
    if target != "clipboard"
        && target != "folder"
        && target != "credentials"
        && target != "translation"
        && target != "port"
        && target != "files"
        && target != "snippets"
    {
        return Err("未知的快捷键目标".into());
    }
    let parsed = parse(&shortcut)?;
    let mut inner = bindings.0.lock().unwrap();
    let current = if target == "clipboard" {
        inner.clipboard
    } else if target == "folder" {
        inner.folder
    } else if target == "credentials" {
        inner.credentials
    } else if target == "translation" {
        inner.translation
    } else if target == "port" {
        inner.port
    } else if target == "files" {
        inner.files
    } else {
        inner.snippets
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
    } else if target == "credentials" {
        inner.credentials = Some(parsed);
    } else if target == "translation" {
        inner.translation = Some(parsed);
    } else if target == "port" {
        inner.port = Some(parsed);
    } else if target == "files" {
        inner.files = Some(parsed);
    } else {
        inner.snippets = Some(parsed);
    }
    drop(inner);

    // 持久化到配置文件与运行时配置状态
    let mut config = config_state.0.lock().unwrap().clone();
    if target == "clipboard" {
        config.shortcuts.clipboard = shortcut;
    } else if target == "folder" {
        config.shortcuts.folder = shortcut;
    } else if target == "credentials" {
        config.shortcuts.credentials = shortcut;
    } else if target == "translation" {
        config.shortcuts.translation = shortcut;
    } else if target == "port" {
        config.shortcuts.port = shortcut;
    } else if target == "files" {
        config.shortcuts.files = shortcut;
    } else {
        config.shortcuts.snippets = shortcut;
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
    register_one(app, "translation", &config.shortcuts.translation);
    register_one(app, "port", &config.shortcuts.port);
    register_one(app, "files", &config.shortcuts.files);
    register_one(app, "snippets", &config.shortcuts.snippets);
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
                } else if target == "credentials" {
                    inner.credentials = Some(parsed);
                } else if target == "translation" {
                    inner.translation = Some(parsed);
                } else if target == "port" {
                    inner.port = Some(parsed);
                } else if target == "files" {
                    inner.files = Some(parsed);
                } else {
                    inner.snippets = Some(parsed);
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
    } else if bindings.port == Some(*shortcut) {
        Some(PORT_PANEL)
    } else if bindings.files == Some(*shortcut) {
        Some(FILES_PANEL)
    } else if bindings.snippets == Some(*shortcut) {
        Some(SNIPPETS_PANEL)
    } else {
        None
    }
}

/// 供 lib.rs 中全局热键 handler 调用（仅插件注册的非 Win 组合会到这里）
pub fn handle_shortcut_pressed<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut) {
    let Some(bindings) = app.try_state::<ShortcutBindings>() else {
        return;
    };
    // 翻译快捷键：触发划词翻译动作，不切换面板
    let is_translate = {
        let inner = bindings.0.lock().unwrap();
        inner.translation == Some(*shortcut)
    };
    if is_translate {
        crate::translate::trigger_selection_translate(app);
        return;
    }
    let label = {
        let inner = bindings.0.lock().unwrap();
        panel_label_for(&inner, shortcut)
    };
    if let Some(label) = label {
        panel::toggle_panel(app, label);
    }
}
