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
mod port;
mod shortcut;
mod sticky;
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
use tauri::Listener;
use tauri_plugin_global_shortcut::ShortcutState;

/// 面板窗口效果：不透明窗口 + DWM 系统原生圆角 +（可选）背景模糊。
/// 圆角由 DWM 直接裁剪窗口物理边角，从根上消除"圆角面板后露出矩形背景"；
/// 模糊走 SetWindowCompositionAttribute + ACCENT_ENABLE_ACRYLICBLURBEHIND
/// （与窗口是否激活无关，窗口可见即出模糊，无需点击、失焦也保持）。
/// 亚克力色调跟随当前有效主题（浅色白调/深色黑调），避免不透明度调低时
/// 内容叠在错误的深浅底上看不清。
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
                let _ = acrylic::apply_acrylic(hwnd, window_theme_is_light(window));
            } else {
                let _ = acrylic::clear_acrylic(hwnd);
            }
        }
    }
}

/// 当前有效主题是否为浅色：配置手动主题优先；system 模式用窗口主题
/// （Tauri 窗口主题跟随 Windows 系统深浅，无需读注册表）。
pub(crate) fn window_theme_is_light<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> bool {
    use crate::config::{ConfigState, ThemeMode};
    if let Some(cfg) = window.app_handle().try_state::<ConfigState>() {
        match cfg.0.lock().unwrap().general.theme {
            ThemeMode::Light | ThemeMode::Mint | ThemeMode::Skyblue | ThemeMode::Red => return true,
            ThemeMode::Dark => return false,
            ThemeMode::System => {}
        }
    }
    window.theme().map(|t| t == tauri::Theme::Light).unwrap_or(true)
}

/// 按当前有效主题设置窗口标题栏深浅（设置窗口等带原生边框的窗口用，
/// 让标题栏跟随应用主题而非 Windows 系统主题）。
pub(crate) fn apply_titlebar_theme<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Ok(handle) = window.window_handle() {
            if let RawWindowHandle::Win32(h) = handle.as_raw() {
                let hwnd = windows::Win32::Foundation::HWND(h.hwnd.get() as *mut _);
                acrylic::set_titlebar_theme(hwnd, !window_theme_is_light(window));
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
        panel::PORT_PANEL,
        panel::TOOLBAR_WINDOW,
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
    // 便签集成：首次启动把旧 StickyNote 应用的数据迁移到工具箱数据目录
    sticky::migrate_legacy_sticky(&paths);

    tauri::Builder::default()
        // 单实例保护：重复启动时新实例退出并唤起已有实例的设置窗口——
        // 没有它时多实例会产出两个托盘图标/两个工具栏/热键互抢（用户实测）。
        // 回调在【已有实例】上执行（新实例静默退出），唤起设置窗口让
        // "应用已在运行"可见，避免用户误以为启动失败。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            crate::storage::diag_write("[single-instance] 已有实例在运行，唤起设置窗口");
            #[cfg(windows)]
            crate::tray::show_settings_window(app);
        }))
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
                    // 便签全局快捷键（呼出/全部关闭/新建）：命中便签设置组合则短路，
                    // 不再走工具箱面板切换逻辑
                    if sticky::handle_sticky_shortcut(app, shortcut) {
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

            // 设置窗口点击关闭（X）→ 隐藏而非销毁。
            // Tauri 默认关闭即销毁窗口；销毁后 get_webview_window("settings") 返回 None，
            // 托盘/快捷键所有"打开设置"入口都会静默失效（show_settings_window 先收起面板
            // 再取窗口，取不到直接 return → 面板被收走、设置也不出现），
            // 表现为"设置打不开，以后也都打不开"。拦截 CloseRequested 从根上杜绝销毁。
            tray::protect_settings_window(&handle);

            tray::setup_tray(&handle).ok();
            #[cfg(windows)]
            apply_panel_acrylic(&handle, config.general.acrylic_enabled);
            #[cfg(windows)]
            keyhook::start(handle.clone());
            shortcut::register_initial(&handle, &config);
            // 便签全局快捷键（呼出/全部关闭/新建）：启动即注册（组合来自便签设置）
            sticky::register_all_shortcuts(&handle);
            // 确保全屏透明「粒子层」窗口存在（粒子消散可飘出便签矩形）：
            // tauri.conf.json 已声明，此处运行时兜底——若 conf 声明未生效
            // （例如配置/打包差异）也能正常创建，粒子动画不丢失飘散能力。
            sticky::ensure_particles_window(&handle);
            // 粒子层就绪自检日志：前端挂载成功后上报（排查"粒子飘不出矩形"用）
            {
                let app2 = handle.clone();
                let _ = app2.listen("sticky://particles-layer-ready", move |_| {
                    crate::storage::diag_write("[sticky] particles layer ready");
                });
            }
            // 启动后打印窗口清单（排查：确认粒子层窗口是否真实创建）
            {
                let app2 = handle.clone();
                let labels: Vec<String> = app2
                    .webview_windows()
                    .keys()
                    .map(|k| k.clone())
                    .collect();
                crate::storage::diag_write(&format!(
                    "[sticky] windows after setup: {}",
                    labels.join(",")
                ));
            }
            clipboard::start_watcher(handle.clone());
            #[cfg(windows)]
            explorer::start_explorer_watcher(handle.clone());

            // 悬浮工具栏启用时启动即显示（常驻工具条，配置开关可随时收起）。
            // 固定放到主显示器右下角，保证每次启动都在确定、可见的位置，
            // 不再恢复可能落到屏外/边缘的记忆位置（避免「启动后找不到工具栏」）。
            if config.toolbar.enabled {
                panel::show_toolbar_at_bottom_right(&handle);
            }
            // 工具栏保持置顶（盖过任务栏等系统级置顶窗口，300ms 周期顶置）
            panel::start_keep_on_top(handle.clone());

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
            tray::set_settings_caption_color,
            storage::diag_log,
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
            translate::translate_popup_close,
            clipboard::clipboard_move,
            clipboard::clipboard_reorder,
            clipboard::clipboard_insert_text,
            clipboard::clipboard_update_text,
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
            folder::folder_git_run,
            folder::folder_git_branches,
            folder::folder_copy_path,
            panel::toolbar_set_click_through,
            panel::toolbar_probe_click_through,
            panel::toolbar_geometry,
            shortcut::shortcut_test,
            shortcut::shortcut_apply,
            shortcut::shortcut_capture_begin,
            shortcut::shortcut_capture_end,
            panel::panel_set_always_on_top,
            panel::panel_toggle,
            panel::panel_active,
            panel::toolbar_set_visible,
            sticky::load_note,
            sticky::save_note,
            sticky::list_notes,
            sticky::delete_note,
            sticky::new_note_id,
            sticky::set_note_priority,
            sticky::load_settings,
            sticky::save_settings,
            sticky::effective_notes_dir,
            sticky::save_md_custom,
            sticky::read_md_custom,
            sticky::open_file,
            sticky::open_folder,
            sticky::save_bg_image,
            sticky::read_bg_image,
            sticky::delete_bg_image,
            sticky::get_wallpaper,
            sticky::open_note_window,
            sticky::create_note_window,
            sticky::open_history_window,
            sticky::toggle_sticky_notes,
            sticky::mark_note_open,
            sticky::mark_note_closed,
            sticky::get_open_notes,
            sticky::close_window,
            sticky::start_dragging,
            sticky::set_always_on_top,
            sticky::minimize_to_taskbar,
            sticky::minimize_to_tray,
            sticky::show_window,
            sticky::quit_app,
            sticky::register_shortcuts,
            sticky::open_settings_window,
            sticky::set_acrylic,
            sticky::format_with_llm,
            sticky::capture_screen_region,
            port::port_query,
            port::port_kill,
            port::port_search,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
