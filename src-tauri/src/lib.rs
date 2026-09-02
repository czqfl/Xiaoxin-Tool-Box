#[cfg(windows)]
mod acrylic;
#[cfg(windows)]
pub mod h264;
#[cfg(windows)]
mod recframe;
mod dupl;
pub mod ocr;
mod screenshot;
mod pin;
mod scrollshot;
pub mod recorder;
#[cfg(windows)]
mod recaudio;
mod clipboard;
mod config;
#[cfg(windows)]
mod explorer;
mod folder;
pub mod fsindex;
mod recentfiles;
mod credentials;
#[cfg(windows)]
mod apps;
mod keyhook;
mod panel;
mod port;
mod quickfiles;
mod shortcut;
mod sticky;
mod snippets;
mod palette_stats;
mod storage;
mod translate;
mod tray;
mod uia_pick;

use crate::clipboard::ClipboardStore;
use crate::config::{AppConfig, ConfigState};

/// 经主线程事件循环空闲时执行闭包（避免同步 IPC 回调内重入 build WebView2 窗口挂死）。
pub fn defer_to_main_loop<R: tauri::Runtime>(app: tauri::AppHandle<R>, f: impl FnOnce() + Send + 'static) {
    std::thread::spawn(move || {
        let _ = app.run_on_main_thread(f);
    });
}

/// 运行时窗口的前端入口 URL，跟随运行模式：
/// - dev（tauri dev）：用 tauri.conf.json 的 devUrl（vite dev server，热更新）
/// - 生产（tauri build / 打包）：一律用打包资源 index.html（经 Tauri 资产协议加载）
///
/// 【血泪坑】不能只判断 `app.config().build.dev_url.is_some()` —— tauri.conf.json
/// 里的 devUrl 在打包后【依然存在】，直接用它会让生产环境运行时创建的窗口
/// （截图遮罩 / 贴图 / 重建的面板与设置窗）去连 `http://localhost:1423`，
/// 表现为 ERR_CONNECTION_REFUSED + 关不掉的空白错误页（dev 模式正常，打包必现）。
/// 必须叠加 `tauri::is_dev()`（编译期 dev cfg）判定。
pub(crate) fn frontend_url<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::WebviewUrl {
    if tauri::is_dev() {
        if let Some(u) = app.config().build.dev_url.clone() {
            return tauri::WebviewUrl::External(u);
        }
    }
    tauri::WebviewUrl::App("index.html".into())
}
use crate::credentials::CredentialStore;
use crate::folder::FolderStore;
use crate::shortcut::ShortcutBindings;
use crate::translate::TranslateStore;
use std::sync::Mutex;
use tauri::Listener;
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
            ThemeMode::Light | ThemeMode::Mint | ThemeMode::Skyblue | ThemeMode::Red | ThemeMode::Orange => return true,
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
        panel::GITRUN_PANEL,
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
pub(crate) fn make_webview_transparent<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
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
    // 【多屏混合 DPI 的坐标根基】显式声明 Per-Monitor-V2 DPI 感知。
    // 智能识框的整条链路——EnumWindows/DwmGetWindowAttribute 窗口快照、
    // UIA 元素矩形、GetSystemMetrics 类指标——只有进程处于 PMv2 时才返回
    // 「跨全部显示器的真实物理像素坐标」；若被系统降级为 System 感知
    // （清单缺失/时序问题），副屏（缩放比≠主屏）上这些矩形会被 DPI 虚拟化
    // 缩放，与捕获的真实像素错位，表现为"副屏上智能识别框偏移/大小不对"。
    // tao 事件循环通常会自行设置，这里在【任何窗口创建之前】幂等地再保一次：
    // 已是 PMv2 时此调用无害失败，未设置时补上。
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::HiDpi::{SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2};
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    // 【panic 可观测性】全项目 20+ 处 fire-and-forget 的 std::thread::spawn
    // 均未跟踪 JoinHandle，子线程 panic 默认只在 stderr 消失——打包版
    // （windows_subsystem）下 stderr 不可见，表现为"功能静默失效无从排查"。
    // 全局钩子先落一行诊断日志再手动还原 stderr 输出，行为不变、覆盖所有线程。
    // 重入保护：若 panic 恰好发生在日志写入路径上，跳过落盘只走 stderr，
    // 防止钩子递归触发自身 abort
    static IN_PANIC_HOOK: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    std::panic::set_hook(Box::new(|info| {
        let payload = info.payload();
        let msg = payload.downcast_ref::<&str>().map(|s| (*s).to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic".to_string());
        let loc = info.location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".to_string());
        use std::sync::atomic::Ordering;
        if !IN_PANIC_HOOK.swap(true, Ordering::SeqCst) {
            crate::storage::diag_write(&format!("[panic] {loc} {msg}"));
            IN_PANIC_HOOK.store(false, Ordering::SeqCst);
        }
        eprintln!("[panic] {loc} {msg}");
    }));
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
    // OCR 档位先于任何识别调用就位（识别本身在 spawn_blocking 里读这个全局）
    ocr::set_model(&config.shot.ocr_model);

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
                    // 便签全局快捷键（呼出 / 收起 / 新建 / 历史）：命中便签设置里的
                    // 组合则短路，不再走工具箱面板切换逻辑。便签组合存于便签自己的
                    // sticky_settings.json（设置归属独立），注册时也刻意不调用
                    // unregister_all，以免注销工具箱快捷键。
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
            // OCR 引擎后台预热（ONNX session 构建约 100ms + 模型校验），
            // 否则用户第一次点「识别」才付这笔钱
            ocr::warm_up();
            // 全盘文件名索引缓存后台读回（几十万条目解析约几十毫秒，别压在 IPC 线程上）
            {
                let p = handle.state::<storage::AppPaths>().inner().clone();
                std::thread::spawn(move || fsindex::load_from_disk(&p));
            }
            // 本机应用列表预热：单开一条线程（读盘 + 必要时整表扫描 + 图标提取），
            // 主进程启动不等它。命令面板/设置页首次取用时缓存已就绪即零等待返回。
            {
                let p = handle.state::<storage::AppPaths>().inner().clone();
                std::thread::Builder::new()
                    .name("app-scan".into())
                    .spawn(move || apps::warm_from_disk(&p))
                    .map(|_| ())
                    .unwrap_or_else(|e| {
                        crate::storage::diag_write(&format!("[apps] 预热线程启动失败：{e}"))
                    });
            }
            // 顺序粘贴（FIFO/LIFO）是会话内临时模式：启动即复位为普通粘贴，
            // 覆盖"上次退出时面板未关、配置残留 FIFO"的场景——下次打开面板
            // 默认普通模式，Ctrl+V 不会被接管（register_initial 已按残留配置
            // 同步过 SEQ_ENABLED，这里再统一归位为放行）
            clipboard::reset_paste_mode_if_sequential(&handle);
            // ---- 便签初始化 ----
            // 便签全局快捷键（呼出/收起/新建/历史）：启动即注册，组合来自便签自己的
            // 设置文件（与工具箱快捷键体系并存，注册时不 unregister_all）。
            sticky::register_all_shortcuts(&handle);
            // 确保全屏透明「粒子层」窗口存在（粒子消散可飘出便签矩形）：
            // tauri.conf.json 已声明，此处运行时兜底——若 conf 声明未生效也能
            // 正常创建，粒子动画不丢失飘散能力。
            sticky::ensure_particles_window(&handle);
            // 粒子层就绪自检：前端挂载成功后上报，日志可确认渲染链路是否通
            {
                let app2 = handle.clone();
                let _ = app2.listen("sticky://particles-layer-ready", move |_| {
                    crate::storage::diag_write("[sticky] particles layer ready");
                    crate::sticky::mark_particles_ready();
                });
            }
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
            // 长截图进度条窗预热：同遮罩窗策略，首次点「长截图」瞬时显示
            {
                let h = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1800));
                    crate::scrollshot::prewarm(&h);
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
            translate::translate_lines,
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
            folder::folder_git_run_stream,
            folder::folder_git_run_last,
            folder::folder_git_branches,
            folder::folder_copy_path,
            panel::toolbar_set_click_through,
            panel::toolbar_probe_click_through,
            panel::toolbar_geometry,
            panel::toolbar_apply_clip,
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
            panel::panel_refresh_acrylic,
            panel::panel_show_foreground,
            panel::panel_hide,
            // ---- 便签（sticky）----
            // 设置存储独立于工具箱 AppConfig（存在便签自己的 sticky_settings.json），
            // 命令仅做读写通道；界面统一挂在工具箱设置里（StickyNotePage）。
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
            sticky::sticky_cancel_force_close,
            sticky::quit_app,
            sticky::register_shortcuts,
            sticky::open_settings_window,
            sticky::particles_layer_ready,
            sticky::set_acrylic,
            sticky::format_with_llm,
            sticky::capture_screen_region,
            port::port_query,
            port::port_kill,
            port::port_search,
            quickfiles::quickfiles_list,
            quickfiles::quickfiles_create,
            quickfiles::quickfiles_open,
            quickfiles::quickfiles_reveal,
            quickfiles::quickfiles_delete,
            apps::list_installed_apps,
            apps::app_launch,
            // 最近打开文件（quickfiles_open 内打点，面板/命令面板/全盘搜索共用）
            recentfiles::recent_files_list,
            recentfiles::recent_files_remove,
            recentfiles::recent_files_clear,
            // 全盘文件名索引（Everything 式秒查）
            fsindex::fs_index_status,
            fsindex::fs_index_rebuild,
            fsindex::fs_index_cancel,
            fsindex::fs_index_search,
            snippets::snippets_list,
            snippets::snippets_create,
            snippets::snippets_update,
            snippets::snippets_delete,
            snippets::snippets_paste,
            // 命令面板：用量统计（频次/最近使用）与内联工具结果直接粘贴
            palette_stats::palette_stats_list,
            palette_stats::palette_stat_bump,
            clipboard::clipboard_paste_text,
            screenshot::shot_begin,
            // 屏幕取色：复用遮罩窗的纯取色模式（前端 shotBeginPicker 包装待接入）
            screenshot::shot_begin_picker,
            screenshot::shot_geometry,
            screenshot::shot_image_raw,
            screenshot::shot_ready,
            screenshot::shot_cursor_global,
            screenshot::shot_window_rect_at,
            // 元素级智能识别（UIA）：与窗口级并行，前端择优取更精细矩形
            screenshot::shot_ui_rect_at,
            screenshot::shot_last_region,
            // 选区文字识别（PP-OCR ONNX）+ 模型档位状态/下载
            screenshot::shot_ocr,
            ocr::ocr_model_status,
            ocr::ocr_model_download,
            // 截图历史：列表 / 翻页重截 / 记录某帧的框选范围 / 删除与清空
            screenshot::shot_history_list,
            screenshot::shot_history_step,
            screenshot::shot_history_save_region,
            screenshot::shot_history_delete,
            screenshot::shot_history_clear,
            // 截图输出（复制/另存为/贴图）：原生二进制 IPC 直传 PNG 字节
            screenshot::shot_output,
            screenshot::shot_cancel,
            screenshot::shot_save_region,
            // 原生拖拽层：框选/缩放热路径由 Rust 直绘冻结层，前端只报开始/结束
            screenshot::shot_drag_begin,
            screenshot::shot_drag_end,
            // 滚动长截图（自动定速滚动 + 拼接，独立模块）
            scrollshot::scrollshot_begin,
            scrollshot::scrollshot_stop,
            scrollshot::scrollshot_cancel,
            scrollshot::scrollshot_dismiss,
            scrollshot::scrollshot_frame_info,
            scrollshot::scrollshot_save_as,
            scrollshot::scrollshot_set_speed,
            scrollshot::scrollshot_get_speed,
            // 空格/「开始」按钮：进入长截图后由用户择时启动自动滚动
            scrollshot::scrollshot_start_scroll,
            // 屏幕录制（独立选区 + 控制条）
            recorder::rec_begin,
            recorder::rec_select_cancel,
            recorder::recorder_start,
            recorder::recorder_stop,
            recorder::recorder_pause,
            recorder::recorder_resume,
            recorder::recorder_cancel,
            recorder::recorder_bar_popup,
            recorder::rec_dismiss,
            recorder::recorder_open_dir,
            // 录屏音频：录制中随时开关录音 + 静音 + 音量 + 状态查询
            recaudio::recorder_audio_rec,
            recaudio::recorder_audio_mute,
            recaudio::recorder_audio_volume,
            recaudio::recorder_audio_volume_get,
            recaudio::recorder_audio_state,
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
            // 拖拽/缩放开始/结束标记：待命窗补建据此顺延，避免交互中"卡一下"
            pin::pin_busy,
            // Esc 隐藏单个贴图（热键可整批唤回）
            pin::pin_hide_one,
            // HTML 贴图尺寸回填（前端渲染测量后调用）
            pin::pin_resize,
            // 贴图内容类型（image/html，前端渲染分支用）
            pin::pin_kind,
            pin::pin_file_path,
            // 贴图 Alt 文字选择：Rust 直读贴图文件识别（免前端传图）
            pin::pin_ocr,
            // 贴图另存为（右键菜单）
            pin::pin_save_as,
            // 贴图图片展示走协议 GET /pin/{id} 直出文件字节，pin_image_data 已删
            pin::pin_copy_image,
            // 按原始格式复制（图片→位图，文本/富文本→HTML+纯文本）
            pin::pin_copy_original,
            // 文本/富文本贴图「复制为图片」：前端渲染 PNG 字节直传
            pin::pin_copy_image_bytes,
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
                } else if label.starts_with(scrollshot::BAR_LABEL) {
                    // 长截图控制条被 Alt+F4 等途径关闭：置停止标志，
                    // 后台线程收尾落盘（已有内容不丢）
                    scrollshot::on_bar_destroyed(app_handle);
                } else if label.starts_with(scrollshot::FRAME_LABEL) {
                    scrollshot::on_frame_destroyed(app_handle);
                } else if label.starts_with(recorder::SELECT_LABEL) {
                    recorder::on_select_destroyed(app_handle);
                } else if label.starts_with(recorder::BAR_LABEL) {
                    // 录制控制条被销毁（Alt+F4）：等同点停止，GIF 正常收尾
                    recorder::on_bar_destroyed(app_handle);
                } else if label.starts_with(pin::STAGING_LABEL) {
                    // 复用贴图窗（待命池，pin-staging / pin-staging-N）被销毁
                    // （关闭其承载的贴图/Alt+F4 等）：清分配关系并补建待命窗，
                    // 保证下次贴图仍走快路径。
                    // 【幽灵条目防护】若被销毁的窗仍映射着一张贴图（未走
                    // pin_close、也没有兜底窗——如 Alt+F4 直接关窗），该贴图
                    // 失去窗口后既无法关闭也无法复制原文本（pin_close/复制按
                    // id 找不到窗口与存储条目）——从存储一并清除。正常
                    // pin_close 路径已先清存储，这里是幂等兜底；若该贴图另有
                    // 兜底窗（watchdog 回退建窗）则保留。
                    pin::drop_ocr_window(app_handle);
                    let mapped = app_handle
                        .try_state::<pin::PinWinMap>()
                        .and_then(|m| m.0.lock().unwrap().remove(label.as_str()));
                    if let Some(pid) = mapped {
                        let still_served = app_handle
                            .get_webview_window(&format!("{}-{pid}", pin::PIN_PREFIX))
                            .is_some();
                        if !still_served {
                            pin::forget_pin(app_handle, &pid);
                            crate::storage::diag_write(&format!(
                                "[pin] staging {label} destroyed, cleaned orphan {pid}"
                            ));
                        }
                    }
                    pin::ensure_staging(app_handle);
                } else if label.starts_with(pin::PIN_PREFIX)
                    && label != "pin-ocr"
                    && label != "pin-menu"
                {
                    // 常规贴图窗（pin-<uuid>）被销毁：同步销毁共享 OCR 弹窗
                    // （独立窗不随来源贴图自动关；staging 补建新窗会骗过前端
                    // 存在性安全网，必须在 Rust 侧统一兜底）。
                    pin::drop_ocr_window(app_handle);
                    if let Some(id) = label.strip_prefix(pin::PIN_PREFIX) {
                        pin::forget_pin(app_handle, id);
                    }
                }
            }
            // 应用退出前：把所有面板/工具栏的最后位置与尺寸写入配置，
            // 下次启动自动恢复（面板可能处于隐藏态，但窗口对象仍在）
            if let tauri::RunEvent::ExitRequested { .. } = event {
                panel::save_all_window_states(app_handle);
            }
        });
}
