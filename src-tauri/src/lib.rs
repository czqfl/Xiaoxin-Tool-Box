#[cfg(windows)]
mod acrylic;
mod clipboard;
mod config;
#[cfg(windows)]
mod explorer;
mod folder;
mod credentials;
#[cfg(windows)]
mod keyhook;
mod panel;
mod shortcut;
mod storage;
mod translate;
mod tray;

use crate::clipboard::ClipboardStore;
use crate::config::{AppConfig, ConfigState};
use crate::credentials::CredentialStore;
use crate::folder::FolderStore;
use crate::shortcut::ShortcutBindings;
use crate::translate::TranslateStore;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

/// 面板窗口效果：不透明窗口 + DWM 系统原生圆角 +（可选）背景模糊。
/// 圆角由 DWM 直接裁剪窗口物理边角，从根上消除"圆角面板后露出矩形背景"；
/// 模糊走 SetWindowCompositionAttribute + ACCENT_ENABLE_ACRYLICBLURBEHIND
/// （与窗口是否激活无关，窗口可见即出模糊，无需点击、失焦也保持）。
#[cfg(windows)]
pub(crate) fn apply_panel_effects_for<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    acrylic: bool,
) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    if let Ok(handle) = window.window_handle() {
        if let RawWindowHandle::Win32(h) = handle.as_raw() {
            let hwnd = windows::Win32::Foundation::HWND(h.hwnd.get() as _);
            let _ = acrylic::apply_rounded_corners(hwnd);
            if acrylic {
                let _ = acrylic::apply_acrylic(hwnd);
            } else {
                let _ = acrylic::clear_acrylic(hwnd);
            }
        }
    }
}

/// 启动时给两个悬浮面板窗口应用效果，并把 webview 默认背景设为全透明。
/// 前提：窗口 transparent: false；webview 背景全透明后，DWM 亚克力层才能
/// 透过 CSS 透明区域显示出来（CSS 透明只能透出 webview 自身的默认底色）。
///
/// 注意必须直接调 WebView2 的 SetDefaultBackgroundColor，而【不是】
/// WebviewWindow::set_background_color：后者会同时把 tao 窗口背景色设成
/// 实心色，tao 在 WM_ERASEBKGND 里忽略 alpha 把整个客户区填成不透明色，
/// 把亚克力层全部盖死——正是"panel 外边框一圈黑色"的来源。
#[cfg(windows)]
fn apply_panel_acrylic<R: tauri::Runtime>(app: &tauri::AppHandle<R>, acrylic: bool) {
    for label in [
        panel::CLIPBOARD_PANEL,
        panel::FOLDER_PANEL,
        panel::CREDENTIAL_PANEL,
        translate::TRANSLATE_PANEL,
    ] {
        if let Some(w) = app.get_webview_window(label) {
            apply_panel_effects_for(&w, acrylic);
            let _ = w.with_webview(|wv| {
                use webview2_com::Microsoft::Web::WebView2::Win32::{
                    COREWEBVIEW2_COLOR, ICoreWebView2Controller2,
                };
                use windows::core::Interface;
                if let Ok(controller2) = wv.controller().cast::<ICoreWebView2Controller2>() {
                    unsafe {
                        let _ = controller2.SetDefaultBackgroundColor(COREWEBVIEW2_COLOR {
                            A: 0,
                            R: 0,
                            G: 0,
                            B: 0,
                        });
                    }
                }
            });
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 在 Builder 构建（创建窗口）之前解析数据目录并加载持久化数据。
    // 配合下方 Builder::manage 把 state 注册提前到窗口创建之前——窗口创建时
    // webview 的 IPC 初始化会访问 state，若 manage 仍在 setup 回调里执行，
    // 会和页面加载形成竞态，偶发触发 "state() called before manage()" panic
    // （启动即崩，STATUS_STACK_BUFFER_OVERRUN）。
    let paths = storage::AppPaths::resolve();
    let config: AppConfig = storage::load_json(&paths.config_file, AppConfig::default());
    let history: Vec<clipboard::ClipEntry> =
        storage::load_json(&paths.clipboard_file, vec![]);
    let folders: Vec<folder::FolderEntry> =
        storage::load_json(&paths.folders_file, vec![]);
    let creds: Vec<credentials::Credential> =
        storage::load_json(&paths.creds_file, vec![]);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    shortcut::handle_shortcut_pressed(app, shortcut);
                })
                .build(),
        )
        // 窗口创建前注册所有 state（Builder::manage 在 App 构建阶段生效，
        // 早于配置窗口的创建），彻底消除启动期 state 竞态 panic
        .manage(ConfigState(Mutex::new(config.clone())))
        .manage(ClipboardStore(Mutex::new(history)))
        .manage(FolderStore(Mutex::new(folders)))
        .manage(CredentialStore(Mutex::new(creds)))
        .manage(ShortcutBindings::default())
        .manage(TranslateStore(Mutex::new(None)))
        .manage(paths)
        .setup(move |app| {
            let handle = app.handle().clone();

            tray::setup_tray(&handle).ok();
            #[cfg(windows)]
            apply_panel_acrylic(&handle, config.general.acrylic_enabled);
            #[cfg(windows)]
            keyhook::start(handle.clone());
            shortcut::register_initial(&handle, &config);
            clipboard::start_watcher(handle.clone());
            #[cfg(windows)]
            explorer::start_explorer_watcher(handle.clone());

            // 非静默启动时直接打开设置窗口
            if !config.general.silent_start {
                tray::show_settings_window(&handle);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::config_load,
            config::config_save,
            config::config_export_to,
            config::config_import_from,
            clipboard::clipboard_list,
            clipboard::clipboard_delete,
            clipboard::clipboard_clear,
            clipboard::clipboard_toggle_favorite,
            clipboard::clipboard_toggle_pin,
            clipboard::clipboard_image_data,
            clipboard::clipboard_write_back,
            clipboard::clipboard_paste,
            clipboard::clipboard_copy_text,
            clipboard::clipboard_consume,
            clipboard::clipboard_rollback,
            clipboard::clipboard_enqueue,
            translate::translate,
            translate::translate_last_result,
            clipboard::clipboard_move,
            clipboard::clipboard_reorder,
            clipboard::clipboard_insert_text,
            credentials::cred_list,
            credentials::cred_add,
            credentials::cred_update,
            credentials::cred_delete,
            folder::folder_list,
            folder::folder_add,
            folder::folder_remove,
            folder::folder_rename,
            folder::folder_set_color,
            folder::folder_toggle_pin,
            folder::folder_move_to_top,
            folder::folder_reorder,
            folder::folder_open,
            folder::folder_open_in_terminal,
            folder::folder_open_in_terminal_with,
            folder::folder_open_in_editor,
            folder::folder_detect_editors,
            folder::folder_set_vscode_path,
            folder::folder_git_exec,
            folder::folder_git_branches,
            folder::folder_copy_path,
            shortcut::shortcut_test,
            shortcut::shortcut_apply,
            shortcut::shortcut_capture_begin,
            shortcut::shortcut_capture_end,
            panel::panel_set_always_on_top,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
