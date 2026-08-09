mod clipboard;
mod config;
mod folder;
mod panel;
mod shortcut;
mod storage;
mod tray;

use crate::clipboard::ClipboardStore;
use crate::config::{AppConfig, ConfigState};
use crate::folder::FolderStore;
use crate::shortcut::ShortcutBindings;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

/// 获取 Windows 内部版本号，用于决定亚克力/模糊效果兼容性
#[cfg(windows)]
fn os_build_number() -> u32 {
    use windows::Wdk::System::SystemServices::RtlGetVersion;
    use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: std::mem::size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    unsafe { let _ = RtlGetVersion(&mut info); };
    info.dwBuildNumber
}

/// 为两个悬浮面板应用毛玻璃效果（Win10 1903+ 亚克力，更早版本模糊，失败静默回退）
#[cfg(windows)]
fn apply_panel_effects(app: &tauri::App) {
    let build = os_build_number();
    for label in [panel::CLIPBOARD_PANEL, panel::FOLDER_PANEL] {
        if let Some(w) = app.get_webview_window(label) {
            if build >= 18362 {
                let _ = window_vibrancy::apply_acrylic(&w, Some((24, 24, 24, 60)));
            } else {
                let _ = window_vibrancy::apply_blur(&w, Some((24, 24, 24, 60)));
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        .setup(|app| {
            let handle = app.handle().clone();

            // 解析数据目录（便携版优先 exe 同级 data/），加载持久化数据
            let paths = storage::AppPaths::resolve(&handle);
            let config: AppConfig =
                storage::load_json(&paths.config_file, AppConfig::default());
            let history: Vec<clipboard::ClipEntry> =
                storage::load_json(&paths.clipboard_file, vec![]);
            let folders: Vec<folder::FolderEntry> =
                storage::load_json(&paths.folders_file, vec![]);

            app.manage(ConfigState(Mutex::new(config.clone())));
            app.manage(ClipboardStore(Mutex::new(history)));
            app.manage(FolderStore(Mutex::new(folders)));
            app.manage(ShortcutBindings::default());
            app.manage(paths);

            #[cfg(windows)]
            apply_panel_effects(app);

            tray::setup_tray(&handle).ok();
            shortcut::register_initial(&handle, &config);
            clipboard::start_watcher(handle.clone());

            // 非静默启动时直接打开设置窗口
            if !config.general.silent_start {
                tray::show_settings_window(&handle);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::config_load,
            config::config_save,
            clipboard::clipboard_list,
            clipboard::clipboard_delete,
            clipboard::clipboard_clear,
            clipboard::clipboard_toggle_favorite,
            clipboard::clipboard_toggle_pin,
            clipboard::clipboard_image_data,
            clipboard::clipboard_write_back,
            clipboard::clipboard_paste,
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
            folder::folder_copy_path,
            shortcut::shortcut_test,
            shortcut::shortcut_apply,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
