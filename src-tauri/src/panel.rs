//! 悬浮面板的显示/隐藏与定位逻辑（两个面板共用）。
use crate::config::ConfigState;
use crate::storage::{save_json, AppPaths};
use tauri::{AppHandle, LogicalPosition, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};
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
/// 端口工具面板（查询端口占用 / 一键杀进程）
pub const PORT_PANEL: &str = "port-panel";
/// 悬浮工具栏窗口（常驻小工具条，不参与面板互斥，独立显隐）
pub const TOOLBAR_WINDOW: &str = "toolbar";

/// 所有悬浮面板标签（同一时间只展示一个）
pub const ALL_PANELS: &[&str] = &[
    CLIPBOARD_PANEL,
    FOLDER_PANEL,
    CREDENTIAL_PANEL,
    PORT_PANEL,
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
    if label == "settings" {
        crate::tray::show_settings_window(&app);
        return Ok(());
    }
    if label == "translation" {
        crate::translate::trigger_selection_translate(&app);
        return Ok(());
    }
    let full = match label.as_str() {
        "clipboard" => CLIPBOARD_PANEL,
        "folder" => FOLDER_PANEL,
        "credentials" => CREDENTIAL_PANEL,
        "port" => PORT_PANEL,
        _ => return Err("未知面板".into()),
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
            }
        }
    }
}

/// 获取面板窗口；若已被销毁（旧版本/异常状态）则按 tauri.conf.json 配置自动重建。
/// URL 跟随运行模式：dev 用 devUrl（vite dev server），生产用打包资源。
/// 重建后重新应用亚克力效果，避免"面板窗口消失后所有入口静默失效"。
fn ensure_panel_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
) -> Option<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(label) {
        return Some(w);
    }
    crate::storage::diag_write(&format!("panel window {label} missing, rebuilding"));
    let url = match app.config().build.dev_url.clone() {
        Some(u) => tauri::WebviewUrl::External(u),
        None => tauri::WebviewUrl::App("index.html".into()),
    };
    let _ = WebviewWindowBuilder::new(app, label, url)
        .title(label)
        .inner_size(640.0, 480.0)
        .decorations(false)
        .transparent(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build();
    let w = app.get_webview_window(label)?;
    #[cfg(windows)]
    {
        let acrylic = app
            .try_state::<ConfigState>()
            .map(|s| s.0.lock().unwrap().general.acrylic_enabled)
            .unwrap_or(true);
        crate::apply_panel_effects_for(&w, acrylic);
    }
    Some(w)
}

/// 切换面板：已显示【且持有焦点】则隐藏；否则呼出（恢复上次位置/居中）+ 可靠置前。
/// 关闭判定用「可见且聚焦」——置顶常驻面板（always_on_top）失焦不隐藏，可能一直
/// 可见但被其它窗口盖住；此时再触发应把面板【带回前台】而不是误判"已打开"而隐藏，
/// 这正是"点工具栏图标面板出不来"的根因（面板开着却被 toggle 成关闭）。
pub fn toggle_panel<R: Runtime>(app: &AppHandle<R>, label: &str) {
    // 同一时间只展示一个面板：先隐藏其它所有面板
    for other in ALL_PANELS {
        if *other != label {
            if let Some(w) = app.get_webview_window(other) {
                let _ = w.hide();
            }
        }
    }
    // 设置窗口一并收起：它与面板同为置顶窗口，若仍显示会被面板盖住，
    // 且会让托盘左键的可见性判断失真（见 tray.rs toggle_settings_window）
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.hide();
    }

    // 窗口可能已被销毁（旧版本点 X）→ 自动重建，避免"以后都打不开"
    let Some(window) = ensure_panel_window(app, label) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    crate::storage::diag_write(&format!(
        "[toggle_panel] {label} visible={visible} focused={focused}"
    ));
    if visible && focused {
        // 关闭前记住窗口位置（持久化到配置），下次呼出恢复上次位置
        remember_position(app, &window, label);
        let _ = window.hide();
    } else {
        // 优先恢复上次关闭位置；记录缺失或位置失效（换屏/分辨率变化）时回退居中
        if !restore_position(app, &window, label) {
            position_near_cursor(app, &window);
        }
        // 显示 + 可靠置前（force_foreground_robust 不受前台锁限制，
        // 快捷键/托盘/工具栏路径统一可靠）
        show_and_activate(&window);
        refresh_panel_acrylic(app, &window);
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

/// 记住面板关闭时的窗口位置（物理坐标），持久化到 config.json 的 panel_positions。
/// 这样重装应用、重启进程后再次呼出仍回到上次位置。
fn remember_position<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>, label: &str) {
    let Ok(pos) = window.outer_position() else {
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
    let snapshot = guard.clone();
    drop(guard);
    let _ = save_json(&paths.config_file, &snapshot);
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
