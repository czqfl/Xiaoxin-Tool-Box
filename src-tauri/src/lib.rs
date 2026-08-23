#[cfg(windows)]
mod acrylic;
mod screenshot;
mod pin;
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
mod quickfiles;
mod shortcut;
mod snippets;
mod storage;
mod translate;
mod tray;

use crate::clipboard::ClipboardStore;
use crate::config::{AppConfig, ConfigState};

/// 经主线程事件循环空闲时执行闭包（避免同步 IPC 回调内重入 build WebView2 窗口挂死）。
pub fn defer_to_main_loop<R: tauri::Runtime>(app: tauri::AppHandle<R>, f: impl FnOnce() + Send + 'static) {
    std::thread::spawn(move || {
        let _ = app.run_on_main_thread(f);
    });
}
use crate::credentials::CredentialStore;
use crate::folder::FolderStore;
use crate::shortcut::ShortcutBindings;
use crate::translate::TranslateStore;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

/// 面板窗口效果：不透明窗口 + DWM 系统原生圆角 +（可选）背景模糊。
/// 圆角由 DWM 直接裁剪窗口物理边角，从根上消除"圆角面板后露出矩形背景"；
/// 模糊走 SetWindowCompositionAttribute + ACCENT_ENABLE_BLURBEHIND
/// （实时模糊：背后内容变化即时刷新，且与窗口是否激活无关，窗口可见即出模糊，
/// 无需点击、失焦也保持）。
/// 色调跟随当前有效主题（浅色白调/深色黑调），避免不透明度调低时
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
                let _ = acrylic::apply_blur(hwnd, window_theme_is_light(window));
            } else {
                let _ = acrylic::clear_blur(hwnd);
            }
        }
    }
    // 每次显示都重刷 webview 透明背景：窗口被销毁重建（ensure_panel_window）后
    // 会新建 webview，不重刷则不透明底色盖住模糊，面板变实心
    make_webview_transparent(window);
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

/// 启动时给所有悬浮面板窗口应用效果，并把 webview 默认背景设为全透明。
/// 前提：窗口 transparent: false；webview 背景全透明后，DWM 亚克力层才能
/// 透过 CSS 透明区域显示出来（CSS 透明只能透出 webview 自身的默认底色）。
///
/// 注意必须直接调 WebView2 的 SetDefaultBackgroundColor，而【不是】
/// WebviewWindow::set_background_color：后者会同时把 tao 窗口背景色设成
/// 实心色，tao 在 WM_ERASEBKGND 里忽略 alpha 把整个客户区填成不透明色，
/// 把亚克力层全部盖死——正是"panel 外边框一圈黑色"的来源。
///
/// 透明背景的设置在 make_webview_transparent 里，且每次显示面板时
/// （refresh_panel_acrylic → apply_panel_effects_for）都会重刷，窗口重建后也不会丢失。
#[cfg(windows)]
fn apply_panel_acrylic<R: tauri::Runtime>(app: &tauri::AppHandle<R>, acrylic: bool) {
    for label in [
        panel::CLIPBOARD_PANEL,
        panel::FOLDER_PANEL,
        panel::CREDENTIAL_PANEL,
        panel::PORT_PANEL,
        panel::FILES_PANEL,
        panel::SNIPPETS_PANEL,
        panel::TOOLBAR_WINDOW,
        translate::TRANSLATE_PANEL,
    ] {
        if let Some(w) = app.get_webview_window(label) {
            apply_panel_effects_for(&w, acrylic);
        }
    }
}

/// 把 webview 默认背景设为全透明（亚克力层透出的前提；见 apply_panel_acrylic 注释）。
#[cfg(windows)]
fn make_webview_transparent<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.with_webview(|wv| {
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
        .manage(screenshot::ShotState::default())
        .manage(pin::PinStore(Mutex::new(vec![])))
        .manage(pin::PinWinMap(Mutex::new(std::collections::HashMap::new())))
        .manage(paths)
        // 截图帧自定义协议：前端经 http://screenshot.localhost/frame/{idx} 流式
        // 加载 BMP 冻结帧，绕开 invoke IPC 的序列化瓶颈（大图走 postMessage 极慢）。
        // 必须在窗口创建前注册（预热遮罩窗加载页面时就要能用）。
        .register_uri_scheme_protocol("screenshot", |ctx, request| {
            crate::screenshot::frame_protocol(ctx, request)
                .unwrap_or_else(|_| tauri::http::Response::builder()
                    .status(404).body(std::borrow::Cow::Borrowed(&b""[..])).unwrap())
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            // 启动诊断：数据目录 + 配置声称的快捷键（配合 [shortcut] 行定位
            // "改键不生效/旧键还在"——一眼看出跑的是哪个实例、读的哪份配置）
            crate::storage::diag_write(&format!(
                "[boot] data_dir={}",
                handle.state::<storage::AppPaths>().data_dir.display()
            ));

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
            clipboard::start_watcher(handle.clone());
            #[cfg(windows)]
            explorer::start_explorer_watcher(handle.clone());

            // 悬浮工具栏启用时启动即显示（常驻工具条，配置开关可随时收起）。
            // 启动定位：有记忆位置则恢复，否则固定工作区右下角（确定、可见，
            // 不恢复可能落到屏外/边缘的旧记忆位置——避免「启动后找不到工具栏」）。
            if config.toolbar.enabled {
                panel::show_toolbar_initial(&handle);
            }
            // 恢复上次的贴图
            crate::pin::restore_pins(&handle);
            // 预建隐藏的复用贴图窗：贴图时直接装图秒显，免临时建 WebView2 窗口
            crate::pin::ensure_staging(&handle);
            // 工具栏保持置顶（盖过任务栏等系统级置顶窗口，300ms 周期顶置）
            panel::start_keep_on_top(handle.clone());

            // 非静默启动时直接打开设置窗口
            if !config.general.silent_start {
                tray::show_settings_window(&handle);
            }

            // 截图遮罩窗预热：启动稍作停顿后（避开启动高峰）提前建好隐藏遮罩页，
            // 首次呼出即复用，省掉 WebView2 创建 + 前端应用加载数百毫秒
            {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    crate::screenshot::prewarm_overlays(&h);
                });
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
            shortcut::shortcut_runtime_bindings,
            shortcut::shortcut_capture_begin,
            shortcut::shortcut_capture_end,
            shortcut::shortcut_resync,
            panel::panel_set_always_on_top,
            panel::panel_toggle,
            panel::panel_active,
            panel::toolbar_set_visible,
            port::port_query,
            port::port_kill,
            port::port_search,
            quickfiles::quickfiles_list,
            quickfiles::quickfiles_create,
            quickfiles::quickfiles_open,
            quickfiles::quickfiles_reveal,
            quickfiles::quickfiles_delete,
            quickfiles::list_installed_apps,
            snippets::snippets_list,
            snippets::snippets_create,
            snippets::snippets_update,
            snippets::snippets_delete,
            snippets::snippets_paste,
            screenshot::shot_begin,
            screenshot::shot_geometry,
            screenshot::shot_image_raw,
            screenshot::shot_ready,
            screenshot::shot_cursor_global,
            screenshot::shot_window_rect_at,
            screenshot::shot_last_region,
            // 截图输出（复制/另存为/贴图）：原生二进制 IPC 直传 PNG 字节
            screenshot::shot_output,
            screenshot::shot_cancel,
            screenshot::shot_save_region,
            // 原生拖拽层：框选/缩放热路径由 Rust 直绘冻结层，前端只报开始/结束
            screenshot::shot_drag_begin,
            screenshot::shot_drag_end,
            pin::pin_create,
            pin::pin_from_clipboard,
            pin::pin_list,
            pin::pin_update,
            pin::pin_ready,
            pin::pin_close,
            pin::pin_hide_all,
            pin::pin_show_all,
            pin::pin_clear_all,
            pin::pin_set_click_through,
            pin::pin_file_path,
            // 贴图图片展示走协议 GET /pin/{id} 直出文件字节，pin_image_data 已删
            pin::pin_copy_image,
        ])
        .build(tauri::generate_context!())
        .expect("应用构建失败")
        .run(|app_handle, event| {
            // 截图遮罩/贴图窗口被非命令途径关闭（Alt+F4、系统关机等）时的状态兜底：
            // 不重置 SHOOTING 会让之后每次截图都静默失败；不清理 PinStore
            // 会留下指向已关闭窗口的幽灵条目（重启还会恢复出不存在的贴图）。
            if let tauri::RunEvent::WindowEvent {
                ref label, event: tauri::WindowEvent::Destroyed, ..
            } = event
            {
                if label.starts_with(screenshot::OVERLAY_PREFIX) {
                    screenshot::on_overlay_destroyed(app_handle);
                } else if label == pin::STAGING_LABEL {
                    // 复用贴图窗被销毁（关闭其承载的贴图/Alt+F4 等）：
                    // 清分配关系并补建新的待命窗，保证下次贴图仍走快路径
                    if let Some(m) = app_handle.try_state::<pin::PinWinMap>() {
                        m.0.lock().unwrap().remove(label.as_str());
                    }
                    pin::ensure_staging(app_handle);
                } else if let Some(id) = label.strip_prefix("pin-") {
                    pin::forget_pin(app_handle, id);
                }
            }
            // 应用退出前：把所有面板/工具栏的最后位置与尺寸写入配置，
            // 下次启动自动恢复（面板可能处于隐藏态，但窗口对象仍在）
            if let tauri::RunEvent::ExitRequested { .. } = event {
                panel::save_all_window_states(app_handle);
            }
        });
}
