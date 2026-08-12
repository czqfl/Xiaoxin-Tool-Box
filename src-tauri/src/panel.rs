//! 悬浮面板的显示/隐藏与定位逻辑（两个面板共用）。
use crate::config::ConfigState;
use crate::storage::{save_json, AppPaths};
use tauri::{AppHandle, LogicalPosition, Manager, Runtime, WebviewWindow};
use windows::Win32::Foundation::HWND;

/// 可靠置前窗口：绕过 Win32 前景锁，让托盘/热键呼出的面板能正常接收输入。
/// 背景进程直接 set_focus 常被系统拒绝，窗口可见却未真正置前、无法交互。
/// 顶到最前再降回 + SetForegroundWindow 可破此锁。模糊绘制已与激活无关
/// （走 SWCA BLURBEHIND），此处置前仅为保证交互，不再影响模糊是否出现。
#[cfg(windows)]
fn force_foreground_window<R: Runtime>(window: &WebviewWindow<R>) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    if let Ok(handle) = window.window_handle() {
        if let RawWindowHandle::Win32(h) = handle.as_raw() {
            let hwnd = HWND(h.hwnd.get() as *mut _);
            crate::acrylic::force_foreground(hwnd);
        }
    }
}

pub const CLIPBOARD_PANEL: &str = "clipboard-panel";
pub const FOLDER_PANEL: &str = "folder-panel";
pub const CREDENTIAL_PANEL: &str = "credential-panel";
/// 端口工具面板（查询端口占用 / 一键杀进程）
pub const PORT_PANEL: &str = "port-panel";

/// 所有悬浮面板标签（同一时间只展示一个）
pub const ALL_PANELS: &[&str] = &[
    CLIPBOARD_PANEL,
    FOLDER_PANEL,
    CREDENTIAL_PANEL,
    PORT_PANEL,
];

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

/// 切换面板：已显示则隐藏；否则定位到光标所在显示器上方居中，然后显示并聚焦
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

    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        // 关闭前记住窗口位置（持久化到配置），下次呼出恢复上次位置
        remember_position(app, &window, label);
        let _ = window.hide();
    } else {
        // 优先恢复上次关闭位置；记录缺失或位置失效（换屏/分辨率变化）时回退居中
        if !restore_position(app, &window, label) {
            position_near_cursor(app, &window);
        }
        let _ = window.show();
        // 可靠置前（绕过 Win32 前景锁），保证面板可正常交互/接收输入
        #[cfg(windows)]
        force_foreground_window(&window);
        #[cfg(not(windows))]
        let _ = window.set_focus();
        // 显示在可见窗口上再应用模糊（SWCA 在可见窗口上才稳定）；
        // BLURBEHIND 与激活无关，呼出即模糊、无需点击
        #[cfg(windows)]
        {
            let acrylic = app
                .try_state::<ConfigState>()
                .map(|s| s.0.lock().unwrap().general.acrylic_enabled)
                .unwrap_or(true);
            crate::apply_panel_effects_for(&window, acrylic);
        }
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
