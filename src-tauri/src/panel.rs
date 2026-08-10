//! 悬浮面板的显示/隐藏与定位逻辑（两个面板共用）。
use tauri::{AppHandle, LogicalPosition, Manager, Runtime, WebviewWindow};

use crate::config::ConfigState;

pub const CLIPBOARD_PANEL: &str = "clipboard-panel";
pub const FOLDER_PANEL: &str = "folder-panel";
pub const CREDENTIAL_PANEL: &str = "credential-panel";

/// 所有悬浮面板标签（同一时间只展示一个）
pub const ALL_PANELS: &[&str] = &[CLIPBOARD_PANEL, FOLDER_PANEL, CREDENTIAL_PANEL];

/// 切换面板置顶状态。
/// 透明窗口 z-order 变化可能使亚克力层失效，切换后补刷一次。
#[tauri::command]
pub fn panel_set_always_on_top(window: WebviewWindow, on: bool) -> Result<(), String> {
    window.set_always_on_top(on).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        let acrylic = window
            .app_handle()
            .state::<ConfigState>()
            .0
            .lock()
            .unwrap()
            .general
            .acrylic_enabled;
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

    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        position_near_cursor(app, &window);
        // 隐藏/显示循环可能使亚克力层失效，每次呼出前重刷一次
        #[cfg(windows)]
        {
            let acrylic = app
                .state::<ConfigState>()
                .0
                .lock()
                .unwrap()
                .general
                .acrylic_enabled;
            crate::apply_panel_effects_for(&window, acrylic);
        }
        let _ = window.show();
        let _ = window.set_focus();
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
