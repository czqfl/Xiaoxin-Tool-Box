//! 悬浮面板的显示/隐藏与定位逻辑（两个面板共用）。
use crate::config::ConfigState;
use crate::storage::{save_json, AppPaths};
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};
use windows::Win32::Foundation::HWND;

/// 取 webview 所属顶层窗口 HWND（用于 Win32 置前/激活/强制显示）
#[cfg(windows)]
fn hwnd_of<R: Runtime>(window: &WebviewWindow<R>) -> Option<HWND> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    if let Ok(handle) = window.window_handle() {
        if let RawWindowHandle::Win32(h) = handle.as_raw() {
            return Some(HWND(h.hwnd.get() as *mut _));
        }
    }
    None
}

/// 显示面板并可靠激活（快捷键/托盘/工具栏共用，后台线程也生效）。
/// 与翻译弹窗 show_popup_activated 同一套验证过的可靠模式：
///   show → Win32 SW_SHOWNORMAL 兜底强制显示 → force_foreground_robust
///   （AttachThreadInput 抢前台，不受前台锁输入窗口超时限制）→ set_focus
///   → 120ms 后后台补一次置前（前台锁偶发拒绝时兜底）。
/// 注：工具栏点击经 IPC 往返已超出前台锁输入窗口，普通 force_foreground
/// 的 SetForegroundWindow 会被系统拒绝（窗口显示但无焦点）——这正是
/// "快捷键能开、工具栏点不开"的根因；robust 版不受此限制。
#[cfg(windows)]
fn show_and_activate<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.unminimize();
    let _ = window.show();
    // 极端状态（最小化+隐藏）下 show 可能仍未真正显示 → Win32 强制激活显示
    if !window.is_visible().unwrap_or(false) {
        if let Some(hwnd) = hwnd_of(window) {
            use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNORMAL};
            unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWNORMAL);
            }
        }
    }
    if let Some(hwnd) = hwnd_of(window) {
        crate::acrylic::force_foreground_robust(hwnd);
    }
    let _ = window.set_focus();
    // 仍未聚焦（极端前台锁/被置顶窗口压住）→ 同步强制置顶 + 置前
    // （force_topmost_foreground 为设置窗口验证过的方案，同步生效）
    if !window.is_focused().unwrap_or(false) {
        if let Some(hwnd) = hwnd_of(window) {
            crate::acrylic::force_topmost_foreground(hwnd);
        }
        let _ = window.set_focus();
    }
    // 前台锁偶发拒绝时补一次（与翻译弹窗一致）
    let w2 = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        if let Some(hwnd) = hwnd_of(&w2) {
            crate::acrylic::force_foreground_robust(hwnd);
        }
        let _ = w2.set_focus();
    });
}

#[cfg(not(windows))]
fn show_and_activate<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// 面板窗口显示后补刷亚克力（SWCA 在可见窗口上才稳定）
#[cfg(windows)]
fn refresh_panel_acrylic<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let acrylic = app
        .try_state::<ConfigState>()
        .map(|s| s.0.lock().unwrap().general.acrylic_enabled)
        .unwrap_or(true);
    crate::apply_panel_effects_for(window, acrylic);
}

pub const CLIPBOARD_PANEL: &str = "clipboard-panel";
pub const FOLDER_PANEL: &str = "folder-panel";
pub const CREDENTIAL_PANEL: &str = "credential-panel";
/// 快速文件面板（统一位置新建/打开/管理多种类型文件）
pub const FILES_PANEL: &str = "files-panel";
/// 端口工具面板（查询端口占用 / 一键杀进程）
pub const PORT_PANEL: &str = "port-panel";
/// 常用语速贴面板（常用话术一键粘贴）
pub const SNIPPETS_PANEL: &str = "snippets-panel";
/// 全局命令面板（搜索 + 执行动作，Raycast 风格呼出框）
pub const PALETTE_PANEL: &str = "palette";
/// 悬浮工具栏窗口（常驻小工具条，不参与面板互斥，独立显隐）
pub const TOOLBAR_WINDOW: &str = "toolbar";

/// 面板标签 → 所属功能开关 key（无对应功能的面板返回 None，不受开关约束）。
/// toggle_panel / 托盘菜单构建共用，保证停用功能的一切入口同步失效。
pub fn panel_feature(label: &str) -> Option<&'static str> {
    match label {
        CLIPBOARD_PANEL => Some("clipboard"),
        FOLDER_PANEL => Some("folder"),
        CREDENTIAL_PANEL => Some("credentials"),
        PORT_PANEL => Some("port"),
        FILES_PANEL => Some("files"),
        SNIPPETS_PANEL => Some("snippets"),
        _ => None,
    }
}

/// 面板显隐变化广播（payload: { label, visible }）。
/// 工具栏前端据此给"当前打开的面板"图标加高亮标志；settings / translate-popup 也广播。
pub const EVT_PANEL_VISIBILITY: &str = "panel://visibility-changed";

/// 广播面板显隐变化（label 为窗口标签：clipboard-panel / settings / translate-popup 等）。
/// 调用点覆盖：toggle_panel（工具栏/快捷键/托盘/热键全路径）、panel_toggle 的
/// settings/translation 分支、translate_popup_close（前端 ×/Esc/失焦）。
pub(crate) fn broadcast_panel_visibility<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    visible: bool,
) {
    let _ = app.emit(
        EVT_PANEL_VISIBILITY,
        serde_json::json!({ "label": label, "visible": visible }),
    );
}

/// 当前可见的面板窗口标签列表（工具栏初始化 / 收到事件后全量查询用，
/// 避免增量维护状态漂移；settings / translate-popup 一并纳入）。
#[tauri::command]
pub fn panel_active(app: tauri::AppHandle) -> Vec<String> {
    let mut labels = Vec::new();
    for label in ALL_PANELS {
        if app
            .get_webview_window(label)
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false)
        {
            labels.push((*label).to_string());
        }
    }
    for label in [
        "settings",
        crate::translate::TRANSLATE_PANEL,
        crate::sticky::HISTORY_WINDOW,
    ] {
        if app
            .get_webview_window(label)
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false)
        {
            labels.push(label.to_string());
        }
    }
    // 便签窗口（note_*）可见时也算“面板打开”，工具栏据此点亮“便签”图标
    for (label, w) in app.webview_windows() {
        if label.starts_with(crate::sticky::NOTE_PREFIX) && w.is_visible().unwrap_or(false) {
            labels.push(label);
        }
    }
    labels
}

/// 所有悬浮面板标签（同一时间只展示一个）
pub const ALL_PANELS: &[&str] = &[
    CLIPBOARD_PANEL,
    FOLDER_PANEL,
    CREDENTIAL_PANEL,
    PORT_PANEL,
    FILES_PANEL,
    SNIPPETS_PANEL,
    PALETTE_PANEL,
];

/// 工具栏呼出面板：工具栏前端点击图标呼出对应面板。
/// "settings" 打开设置窗口；"translation" 触发划词翻译（有选中带出原文，
/// 无选中打开空翻译面板）。
/// 【关键】前端传的是短名（clipboard/folder/credentials/port），必须映射到
/// 窗口标签（clipboard-panel/...）再调 toggle_panel——此前直接用短名查
/// ALL_PANELS 永远匹配不上，返回"未知面板"，正是"工具栏点不开"的全部原因
/// （翻译/设置恰好有硬编码分支所以能开；快捷键传完整标签所以能开）。
#[tauri::command]
pub fn panel_toggle(app: tauri::AppHandle, label: String) -> Result<(), String> {
    // 设置窗口：可见 → 关闭；不可见 → 打开（单击即关）
    if label == "settings" {
        if let Some(w) = app.get_webview_window("settings") {
            if w.is_visible().unwrap_or(false) {
                let _ = w.hide();
                broadcast_panel_visibility(&app, "settings", false);
                return Ok(());
            }
        }
        crate::tray::show_settings_window(&app);
        broadcast_panel_visibility(&app, "settings", true);
        return Ok(());
    }
    // 划词翻译：弹窗可见 → 关闭（不再"关了又弹出来"）；不可见 → 触发翻译
    if label == "translation" {
        if let Some(w) = app.get_webview_window(crate::translate::TRANSLATE_PANEL) {
            if w.is_visible().unwrap_or(false) {
                let _ = w.hide();
                broadcast_panel_visibility(&app, crate::translate::TRANSLATE_PANEL, false);
                return Ok(());
            }
        }
        crate::translate::trigger_selection_translate(&app);
        broadcast_panel_visibility(&app, crate::translate::TRANSLATE_PANEL, true);
        return Ok(());
    }
    // 便签：工具栏入口 toggle 历史窗口（可见 → 收起；不可见/无 → 打开）。
    // 历史窗口关闭 = 隐藏常驻（close_window 语义），再次点击秒开，不重建。
    // 便签窗口各自独立显隐，不受此开关影响。
    if label == "sticky" {
        let hist = app.get_webview_window(crate::sticky::HISTORY_WINDOW);
        let visible = hist
            .as_ref()
            .map(|w| w.is_visible().unwrap_or(false))
            .unwrap_or(false);
        if visible {
            crate::storage::diag_write("[panel_toggle] sticky -> hide history");
            if let Some(w) = hist {
                let _ = w.hide();
            }
            broadcast_panel_visibility(&app, crate::sticky::HISTORY_WINDOW, false);
        } else {
            crate::storage::diag_write("[panel_toggle] sticky -> open history");
            let _ = crate::sticky::open_history_window(app.clone());
            broadcast_panel_visibility(&app, crate::sticky::HISTORY_WINDOW, true);
        }
        return Ok(());
    }
    let full = match label.as_str() {
        "clipboard" => CLIPBOARD_PANEL,
        "folder" => FOLDER_PANEL,
        "credentials" => CREDENTIAL_PANEL,
        "port" => PORT_PANEL,
        "files" => FILES_PANEL,
        "snippets" => SNIPPETS_PANEL,
        "palette" => PALETTE_PANEL,
        "screenshot" => {
            // screenshot is not a panel; trigger via shot_begin
            let _ = crate::screenshot::shot_begin(app.clone());
            broadcast_panel_visibility(&app, "screenshot", true);
            return Ok(());
        }
        "recorder" => {
            // recorder is not a panel; trigger region select
            crate::recorder::begin_select(&app);
            return Ok(());
        }
        _ => return Err("unknown panel".into()),
    };
    crate::panel::toggle_panel(&app, full);
    Ok(())
}

/// 工具栏显示/隐藏（设置页开关 / 托盘菜单共用，泛型实现）。
/// 显示时恢复上次位置（记录缺失回退到光标所在屏幕右边缘中部），
/// 隐藏时记住位置；不抢焦点（常驻工具条，避免打断用户当前输入）。
pub fn set_toolbar_visible_impl<R: Runtime>(app: &AppHandle<R>, on: bool) {
    let Some(window) = app.get_webview_window(TOOLBAR_WINDOW) else {
        return;
    };
    if on {
        if !restore_position(app, &window, TOOLBAR_WINDOW) {
            position_toolbar_default(app, &window);
        }
        let _ = window.show();
    } else {
        remember_position(app, &window, TOOLBAR_WINDOW);
        let _ = window.hide();
    }
}

/// 工具栏保持置顶：可见期间周期性 SetWindowPos 到 HWND_TOPMOST（不激活、不移动），
/// 防止被 Windows 任务栏或其他置顶窗口压住——任务栏是系统级置顶，普通
/// alwaysOnTop 窗口放任务栏上方时点别处会被它盖住、拖不出来（用户反馈）。
/// 300ms 一次的轻量操作，仅窗口可见时执行；窗口销毁后自动退出。幂等启动。
pub fn start_keep_on_top<R: Runtime>(app: AppHandle<R>) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(300));
        let Some(window) = app.get_webview_window(TOOLBAR_WINDOW) else {
            return; // 窗口已销毁，退出循环
        };
        if !window.is_visible().unwrap_or(false) {
            continue;
        }
        #[cfg(windows)]
        if let Some(hwnd) = hwnd_of(&window) {
            use windows::Win32::UI::WindowsAndMessaging::{
                SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE,
            };
            unsafe {
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    });
}

/// 工具栏显示/隐藏命令（前端调用）
#[tauri::command]
pub fn toolbar_set_visible(app: tauri::AppHandle, on: bool) -> Result<(), String> {
    set_toolbar_visible_impl(&app, on);
    Ok(())
}

/// 托盘菜单切换工具栏显隐
pub fn toggle_toolbar<R: Runtime>(app: &AppHandle<R>) {
    let visible = app
        .get_webview_window(TOOLBAR_WINDOW)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    set_toolbar_visible_impl(app, !visible);
}

/// 工具栏默认位置：光标所在屏幕右边缘中部（贴边悬浮，类似输入法工具栏）
fn position_toolbar_default<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let Ok(cursor) = app.cursor_position() else {
        return;
    };
    let Ok(Some(monitor)) = window.monitor_from_point(cursor.x, cursor.y) else {
        return;
    };
    let Ok(wsize) = window.outer_size() else {
        return;
    };
    let scale = monitor.scale_factor();
    let mpos = monitor.position();
    let msize = monitor.size();
    if scale <= 0.0 {
        return;
    }
    let mw = msize.width as f64 / scale;
    let mh = msize.height as f64 / scale;
    let mx = mpos.x as f64 / scale;
    let my = mpos.y as f64 / scale;
    let ww = wsize.width as f64 / scale;
    let wh = wsize.height as f64 / scale;

    let x = mx + mw - ww - 16.0;
    let y = my + (mh - wh) / 2.0;
    let _ = window.set_position(LogicalPosition::new(x, y));
}

/// 工具栏启动位置：主显示器工作区（排除任务栏）右下角（距边 16px）。
/// 保证每次启动都在一个确定、可见的位置——既不依赖光标位置，也不恢复可能
/// 落到屏外/边缘的「记忆位置」（那正是「启动后工具栏找不到」的根因之一）。
/// 用 work_area 而非 monitor 全区域：任务栏在底部时工具栏贴在工作区下缘，
/// 即任务栏上方，不会被系统任务栏遮挡。
fn position_toolbar_bottom_right<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let Ok(monitor) = app.primary_monitor() else {
        return;
    };
    let Some(monitor) = monitor else {
        return;
    };
    let scale = monitor.scale_factor();
    let Ok(wsize) = window.outer_size() else {
        return;
    };
    // 工作区 = 排除系统任务栏后的可用区域（Tauri 直接返回引用，恒可用）
    let wa = monitor.work_area();
    let (wa_x, wa_y, wa_w, wa_h) = (
        wa.position.x as f64,
        wa.position.y as f64,
        wa.size.width as f64,
        wa.size.height as f64,
    );
    if scale <= 0.0 {
        return;
    }
    let mx = wa_x / scale;
    let my = wa_y / scale;
    let mw = wa_w / scale;
    let mh = wa_h / scale;
    let ww = wsize.width as f64 / scale;
    let wh = wsize.height as f64 / scale;
    let margin = 16.0;
    let x = mx + mw - ww - margin;
    let y = my + mh - wh - margin;
    let _ = window.set_position(LogicalPosition::new(x, y));
}

/// 恢复工具栏记忆位置（物理像素）。位置记录缺失，或该点已不在任何显示器内
/// （换屏/分辨率变化/拔屏）时返回 false，由调用方回退到右下角默认位。
fn restore_toolbar_position<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) -> bool {
    let Some(cfg) = app.try_state::<ConfigState>() else {
        return false;
    };
    let Some((x, y)) = cfg.0.lock().unwrap().toolbar.position else {
        return false;
    };
    let scale = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    if scale <= 0.0 {
        return false;
    }
    let (lx, ly) = (x as f64 / scale, y as f64 / scale);
    if app.monitor_from_point(lx, ly).ok().flatten().is_none() {
        return false;
    }
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .is_ok()
}

/// 启动显示工具栏：有记忆位置（用户上次拖动落定）且仍屏内 → 恢复该位置；
/// 否则强制主显示器工作区（排除任务栏）右下角——保证每次启动都在一个确定、
/// 可见的位置，不会出现"启动后工具栏找不到"。
pub fn show_toolbar_initial<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(TOOLBAR_WINDOW) else {
        return;
    };
    if !restore_toolbar_position(app, &window) {
        position_toolbar_bottom_right(app, &window);
    }
    // 【彻底禁用 DWM 阴影/非客户区渲染】conf 里的 shadow:false 在无边框窗口上
    // 并不总是干净（贴边收起用 SetWindowRgn 裁剪窗口，收起/弹出的往返会让系统
    // 阴影行为飘忽）。用户要求工具栏干脆利落无阴影，在 DWM 层直接关掉作双保险。
    #[cfg(windows)]
    if let Some(hwnd) = hwnd_of(&window) {
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_NCRENDERING_POLICY, DWMNCRENDERINGPOLICY,
        };
        unsafe {
            // DWMNCRP_DISABLED = 1：禁用非客户区渲染，阴影随之消失
            let policy = DWMNCRENDERINGPOLICY(1);
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_NCRENDERING_POLICY,
                &policy as *const DWMNCRENDERINGPOLICY as *const core::ffi::c_void,
                std::mem::size_of::<DWMNCRENDERINGPOLICY>() as u32,
            );
        }
    }
    // 【双保险：运行时强制无边框】conf 里 toolbar 已声明 decorations:false，
    // 但常驻应用若由一份较早的构建（早于该配置/工具栏 v3 重画）长期运行，
    // 窗口仍可能带系统标题栏。这里在显示前显式关一次边框，确保无论当前
    // 进程是哪个版本，工具栏都不会露出原生标题栏（"启动后工具栏带标题栏"的根因）。
    let _ = window.set_decorations(false);
    let _ = window.show();
}

/// 切换面板置顶状态。
/// 透明窗口 z-order 变化可能使亚克力层失效，切换后补刷一次。
#[tauri::command]
pub fn panel_set_always_on_top(window: WebviewWindow, on: bool) -> Result<(), String> {
    window.set_always_on_top(on).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        // try_state + 兜底：即使 state 尚未注册（启动竞态）也不会 panic
        let acrylic = window
            .app_handle()
            .try_state::<ConfigState>()
            .map(|s| s.0.lock().unwrap().general.acrylic_enabled)
            .unwrap_or(true);
        crate::apply_panel_effects_for(&window, acrylic);
    }
    Ok(())
}


/// 若某个面板正持有焦点则隐藏它（全局顺序粘贴时让焦点回到之前的应用）
pub fn hide_focused_panel<R: Runtime>(app: &AppHandle<R>) {
    for label in ALL_PANELS {
        if let Some(w) = app.get_webview_window(label) {
            if w.is_focused().unwrap_or(false) {
                let _ = w.hide();
                // 剪贴板面板被自动隐藏（顺序粘贴让出焦点）→ 同步复位顺序粘贴
                // 拦截开关：面板不可见时 Ctrl+V 必须放行给系统，不能继续劫持
                if *label == CLIPBOARD_PANEL {
                    crate::keyhook::set_seq_panel_visible(false);
                }
            }
        }
    }
}

/// 获取面板窗口；若已被销毁（旧版本/异常状态）则按 tauri.conf.json 配置自动重建。
/// URL 跟随运行模式：dev 用 devUrl（vite dev server），生产用打包资源。
/// 重建后重新应用亚克力效果，避免"面板窗口消失后所有入口静默失效"。
/// 【重建走事件循环空闲时创建】同步命令运行在主线程 WebView2 IPC 回调里，
/// 直接 build 会重入挂死（同 WebView2 窗口创建卡死问题）；经 defer_to_main_loop 投递，
/// 主循环空闲时创建。本次调用返回 None，下一次 toggle 时窗口已就绪。
fn ensure_panel_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
) -> Option<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(label) {
        return Some(w);
    }
    crate::storage::diag_write(&format!("panel window {label} missing, rebuilding"));
    let url = crate::frontend_url(app);
    // 重建尺寸取 tauri.conf.json 中该窗口的声明值（写死 640x480 会让面板重建后错位）
    let (w, h) = app
        .config()
        .app
        .windows
        .iter()
        .find(|wc| wc.label == label)
        .map(|wc| (wc.width, wc.height))
        .unwrap_or((640.0, 480.0));
    let app2 = app.clone();
    let label2 = label.to_string();
    crate::defer_to_main_loop(app2.clone(), move || {
        let _ = WebviewWindowBuilder::new(&app2, label2.as_str(), url)
            .title(label2.clone())
            .inner_size(w, h)
            .decorations(false)
            .transparent(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .build();
    });
    app.get_webview_window(label)
}

/// 切换面板：可见 → 关闭；不可见 → 呼出（恢复上次位置/居中）+ 可靠置前。
/// 【单击即关】用 is_visible 判定而非"可见且聚焦"——点击工具栏图标时焦点会
/// 先落到工具栏窗口（目标面板瞬时失焦），若用聚焦判定则第二次点击永远不成立、
/// 面板关不掉（"要双击才能关"的根因）。各面板独立开合、互不影响。
pub fn toggle_panel<R: Runtime>(app: &AppHandle<R>, label: &str) {
    // 功能停用守卫：停用功能的面板一律不响应（快捷键已不注册，这里兜
    // 托盘残留菜单/工具栏残留图标/事件竞态等一切残余入口）
    if panel_feature(label)
        .map(|key| {
            app.try_state::<ConfigState>()
                .map(|s| !s.0.lock().unwrap().feature_enabled(key))
                .unwrap_or(false)
        })
        .unwrap_or(false)
    {
        crate::storage::diag_write(&format!("[toggle_panel] {label} blocked: feature disabled"));
        return;
    }
    // 面板窗口已被销毁（旧版本的 X / 系统自动重建）时先重建，避免"以后都打不开"
    let Some(window) = ensure_panel_window(app, label) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    crate::storage::diag_write(&format!("[toggle_panel] {label} visible={visible}"));
    if visible {
        // 关闭前记住窗口位置与尺寸（持久化到配置），下次呼出恢复
        remember_position(app, &window, label);
        let _ = window.hide();
        broadcast_panel_visibility(app, label, false);
    } else {
        // 先恢复上次尺寸，再恢复上次位置；位置记录缺失或失效（换屏/分辨率
        // 变化）时回退居中
        restore_size(app, &window, label);
        if !restore_position(app, &window, label) {
            position_near_cursor(app, &window);
        }
        // 显示 + 可靠置前（force_foreground_robust 不受前台锁限制）
        show_and_activate(&window);
        refresh_panel_acrylic(app, &window);
        broadcast_panel_visibility(app, label, true);
    }
}

/// 将面板定位到光标所在显示器的上方居中位置（Raycast 风格），任何失败静默回退
fn position_near_cursor<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    let Ok(cursor) = app.cursor_position() else {
        return;
    };
    let Ok(Some(monitor)) = window.monitor_from_point(cursor.x, cursor.y) else {
        return;
    };
    let Ok(wsize) = window.outer_size() else {
        return;
    };
    let scale = monitor.scale_factor();
    let mpos = monitor.position();
    let msize = monitor.size();
    if scale <= 0.0 {
        return;
    }
    let mw = msize.width as f64 / scale;
    let mh = msize.height as f64 / scale;
    let mx = mpos.x as f64 / scale;
    let my = mpos.y as f64 / scale;
    let ww = wsize.width as f64 / scale;

    let x = mx + (mw - ww) / 2.0;
    let y = my + mh * 0.16;
    let _ = window.set_position(LogicalPosition::new(x, y));
}

/// 记住面板关闭时的窗口位置与尺寸（物理坐标/物理像素），持久化到
/// config.json 的 panel_positions / panel_sizes。这样重启进程后再次呼出
/// 仍回到上次位置、保持上次调好的窗口大小。
fn remember_position<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>, label: &str) {
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    let (Some(cfg), Some(paths)) = (
        app.try_state::<ConfigState>(),
        app.try_state::<AppPaths>(),
    ) else {
        return;
    };
    let mut guard = cfg.0.lock().unwrap();
    guard
        .panel_positions
        .insert(label.to_string(), (pos.x, pos.y));
    guard
        .panel_sizes
        .insert(label.to_string(), (size.width, size.height));
    let snapshot = guard.clone();
    drop(guard);
    let _ = save_json(&paths.config_file, &snapshot);
}

/// 恢复面板上次关闭时的窗口尺寸（物理像素）。记录缺失或宽度/高度
/// 异常（≤0）时跳过，窗口保持 tauri.conf.json 的默认尺寸。
fn restore_size<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>, label: &str) {
    let Some(cfg) = app.try_state::<ConfigState>() else {
        return;
    };
    let Some(&(w, h)) = cfg.0.lock().unwrap().panel_sizes.get(label) else {
        return;
    };
    if w == 0 || h == 0 {
        return;
    }
    let _ = window.set_size(tauri::PhysicalSize::new(w, h));
}

/// 恢复面板上次关闭位置。位置记录缺失，或该点已不在任何显示器内
/// （换屏/分辨率变化/拔屏）时返回 false，由调用方回退居中定位。
fn restore_position<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>, label: &str) -> bool {
    let Some(cfg) = app.try_state::<ConfigState>() else {
        return false;
    };
    let Some(&(x, y)) = cfg.0.lock().unwrap().panel_positions.get(label) else {
        return false;
    };
    // 物理坐标 -> 逻辑坐标（用主屏缩放近似），校验该点仍在某个显示器内
    let scale = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    if scale <= 0.0 {
        return false;
    }
    let (lx, ly) = (x as f64 / scale, y as f64 / scale);
    if app.monitor_from_point(lx, ly).ok().flatten().is_none() {
        return false;
    }
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .is_ok()
}

/// 应用退出前：把所有面板（位置+尺寸）与悬浮工具栏（位置）的**最后状态**
/// 写入配置，下次启动自动恢复。面板可能处于隐藏态，但窗口对象仍在，
/// outer_position/outer_size 依然可靠——这样"拖好位置/大小后直接退出应用"
/// 也不会丢。
/// 工具栏收起态会滑出屏幕，保存前校验窗口中心仍在某显示器内，屏外则跳过
/// （避免用收起坐标覆盖用户拖好的停靠位，下次启动回退右下角）。
pub fn save_all_window_states<R: Runtime>(app: &AppHandle<R>) {
    let (Some(cfg), Some(paths)) = (
        app.try_state::<ConfigState>(),
        app.try_state::<AppPaths>(),
    ) else {
        return;
    };
    let mut guard = cfg.0.lock().unwrap();
    let mut changed = false;

    // 工具栏：位置（校验中心仍在屏内才保存）
    if let Some(w) = app.get_webview_window(TOOLBAR_WINDOW) {
        if let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
            let cx = pos.x + size.width as i32 / 2;
            let cy = pos.y + size.height as i32 / 2;
            let scale = app
                .primary_monitor()
                .ok()
                .flatten()
                .map(|m| m.scale_factor())
                .unwrap_or(1.0);
            let (lx, ly) = (cx as f64 / scale, cy as f64 / scale);
            if app.monitor_from_point(lx, ly).ok().flatten().is_some() {
                guard.toolbar.position = Some((pos.x, pos.y));
                changed = true;
            }
        }
    }

    // 各面板：位置 + 尺寸
    for label in ALL_PANELS {
        let Some(w) = app.get_webview_window(label) else {
            continue;
        };
        if let Ok(pos) = w.outer_position() {
            guard
                .panel_positions
                .insert(label.to_string(), (pos.x, pos.y));
        }
        if let Ok(size) = w.outer_size() {
            guard
                .panel_sizes
                .insert(label.to_string(), (size.width, size.height));
        }
        changed = true;
    }

    if changed {
        let snapshot = guard.clone();
        drop(guard);
        let _ = save_json(&paths.config_file, &snapshot);
    }
}

// ---------------------------------------------------------------------------
// 工具栏点击穿透：常驻工具条不遮挡屏幕点击
// ---------------------------------------------------------------------------

/// 工具栏设置点击穿透（true = 窗口忽略鼠标事件，点击落到下层窗口）。
/// 配合前端轮询：光标在窗口内 → 关穿透（按钮可交互）；否则 → 开穿透
/// （工具栏区域不挡桌面点击）。
#[tauri::command]
pub fn toolbar_set_click_through(
    window: tauri::WebviewWindow,
    on: bool,
) -> Result<(), String> {
    window
        .set_ignore_cursor_events(on)
        .map_err(|e| e.to_string())
}

/// 探测光标是否位于工具栏窗口矩形内，返回"是否应该穿透"（true = 光标在窗外）。
/// 前端每 ~200ms 轮询。
/// 【坐标单位】cursor_position()、outer_position()、outer_size() 均为物理像素
/// （Tauri 2 WebviewWindow 方法族），直接比较；此前误除以 scaleFactor 导致
/// 矩形缩小、光标在窗口上也被判"在窗外"，穿透永不解除（工具栏失效）。
#[tauri::command]
pub fn toolbar_probe_click_through(window: tauri::WebviewWindow) -> Result<bool, String> {
    let cur = window
        .app_handle()
        .cursor_position()
        .map_err(|e| e.to_string())?;
    let Ok(pos) = window.outer_position() else {
        return Ok(false);
    };
    let Ok(size) = window.outer_size() else {
        return Ok(false);
    };
    let px = cur.x as f64;
    let py = cur.y as f64;
    let inside = px >= pos.x as f64
        && px <= pos.x as f64 + size.width as f64
        && py >= pos.y as f64
        && py <= pos.y as f64 + size.height as f64;
    Ok(!inside)
}

/// 工具栏几何快照：光标 / 窗口位置尺寸 / 所在显示器——供前端实现
/// 「贴边自动收起、靠近自动弹出」（与穿透探测同一轮询内完成，不另加 IPC）。
/// 【坐标单位】全部物理像素（与 cursor_position / outer_position 一致）。
#[derive(serde::Serialize)]
pub struct ToolbarGeometry {
    pub cursor_x: i32,
    pub cursor_y: i32,
    pub win_x: i32,
    pub win_y: i32,
    pub win_w: u32,
    pub win_h: u32,
    /// 工具栏所在显示器（判断"贴边"的基准矩形）
    pub mon_x: i32,
    pub mon_y: i32,
    pub mon_w: u32,
    pub mon_h: u32,
}

#[tauri::command]
pub fn toolbar_geometry(window: tauri::WebviewWindow) -> Result<ToolbarGeometry, String> {
    let app = window.app_handle();
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    // 工具栏所在显示器：窗口中心落在哪个显示器就用哪个（多屏贴边以本屏为基准）
    let win_cx = pos.x as i64 + size.width as i64 / 2;
    let win_cy = pos.y as i64 + size.height as i64 / 2;
    let mon = app
        .available_monitors()
        .ok()
        .and_then(|ms| {
            ms.into_iter().find(|m| {
                let p = m.position();
                let s = m.size();
                win_cx >= p.x as i64
                    && win_cx < p.x as i64 + s.width as i64
                    && win_cy >= p.y as i64
                    && win_cy < p.y as i64 + s.height as i64
            })
        })
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width, s.height)
        })
        // 兜底：找不到显示器时用窗口自身几何当基准（单屏正常，多屏极端情况退化为不收起）
        .unwrap_or((pos.x, pos.y, size.width, size.height));
    Ok(ToolbarGeometry {
        cursor_x: cursor.x as i32,
        cursor_y: cursor.y as i32,
        win_x: pos.x,
        win_y: pos.y,
        win_w: size.width,
        win_h: size.height,
        mon_x: mon.0,
        mon_y: mon.1,
        mon_w: mon.2,
        mon_h: mon.3,
    })
}

/// 工具栏跨屏裁剪：把窗口可见区域限制在其所在显示器内（SetWindowRgn）。
///
/// 【为什么需要】多屏时窗口系统没有"屏幕外"概念——贴边收起把工具栏滑出
/// 本屏边界，藏起来的部分会原样显示在相邻屏幕上（"收起后屁股露在另一个
/// 屏幕"）。收起/弹出动画期间前端逐帧调用本命令并传入当帧位置：跨界时
/// 仅显示落在本屏内的部分（收起静止时即只剩贴边的 SLIVER 亮轨条）；完全
/// 回到本屏内时清除区域（恢复完整窗口与 DWM 阴影）。
///
/// x/y 由前端传入当帧动画位置（与 setPosition 同帧，避免读回滞后一帧的
/// 闪烁）；尺寸取窗口当前实际值（动画期间不变）。
#[tauri::command]
pub fn toolbar_apply_clip(
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
) -> Result<bool, String> {
    #[cfg(windows)]
    {
        use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};
        let app = window.app_handle();
        let size = window.outer_size().map_err(|e| e.to_string())?;
        // 所在显示器：用窗口与各显示器的重叠面积判定（而非窗口中心）。
        // 收起态窗口大部分在屏外，中心可能落在相邻屏幕——用中心判定会裁到
        // 错误的显示器，导致"屁股露在另一个屏幕"。重叠面积最大者即正确归属。
        let mon = app
            .available_monitors()
            .ok()
            .and_then(|ms| {
                let mut best: Option<(i32, _)> = None;
                for m in ms {
                    let p = m.position();
                    let s = m.size();
                    let ix0 = x.max(p.x);
                    let iy0 = y.max(p.y);
                    let ix1 = (x + size.width as i32).min(p.x + s.width as i32);
                    let iy1 = (y + size.height as i32).min(p.y + s.height as i32);
                    let area = (ix1 - ix0).max(0) * (iy1 - iy0).max(0);
                    if area > 0 {
                        match best {
                            Some((best_area, _)) if best_area >= area => {}
                            _ => best = Some((area, m)),
                        }
                    }
                }
                best.map(|(_, m)| m)
            });
        let Some(hwnd) = hwnd_of(&window) else { return Ok(false) };
        let Some(m) = mon else {
            // 找不到所在显示器（极端）：清区域保持可见，退化为旧行为
            unsafe { SetWindowRgn(hwnd, None, true) };
            return Ok(false);
        };
        let (mx, my) = (m.position().x, m.position().y);
        let (mw, mh) = (m.size().width as i32, m.size().height as i32);
        let ix0 = x.max(mx);
        let iy0 = y.max(my);
        let ix1 = (x + size.width as i32).min(mx + mw);
        let iy1 = (y + size.height as i32).min(my + mh);
        if ix0 >= ix1 || iy0 >= iy1 {
            return Ok(false);
        }
        // 完全在本屏内：清区域（null = 整窗可见，恢复阴影）
        if ix0 == x && iy0 == y && ix1 == x + size.width as i32 && iy1 == y + size.height as i32 {
            unsafe { SetWindowRgn(hwnd, None, true) };
            return Ok(false);
        }
        // 跨界：区域 = 窗口 ∩ 本屏（窗口局部坐标）
        let rgn = unsafe { CreateRectRgn(ix0 - x, iy0 - y, ix1 - x, iy1 - y) };
        unsafe { SetWindowRgn(hwnd, Some(rgn), true) };
        Ok(true)
    }
    #[cfg(not(windows))]
    {
        let _ = (&window, x, y);
        Ok(false)
    }
}
