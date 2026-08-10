//! 系统托盘：左键切换设置窗口，右键菜单（打开设置 / 退出）。
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WebviewWindow,
};
use windows::Win32::Foundation::HWND;

/// 可靠置前窗口（绕过 Win32 前景锁），背景进程直接 set_focus 常被拒绝，
/// 导致设置窗口虽显示却未真正置前/置顶，表现为"偶尔打不开设置"。
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

/// 显示并聚焦设置窗口。
/// 呼出前先收起所有悬浮面板：面板默认 alwaysOnTop，若正显示在前面会盖住
/// 设置窗口，表现为"偶尔打不开设置"；随后用可靠置前法让设置窗口真正置于最前。
pub fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    for label in crate::panel::ALL_PANELS {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.hide();
        }
    }
    if let Some(w) = app.get_webview_window("settings") {
        // 先确保置顶样式在：force_foreground 早前版本的 HWND_NOTOPMOST 破锁套路
        // 会顺带清除置顶样式，窗口变普通窗口后 SetForegroundWindow 又被前景锁
        // 拒绝，表现为“偶尔打不开设置”（窗口显示在其它窗口后面）。
        let _ = w.set_always_on_top(true);
        let _ = w.unminimize();
        let _ = w.show();
        #[cfg(windows)]
        force_foreground_window(&w);
        #[cfg(not(windows))]
        let _ = w.set_focus();
    }
}

/// 切换设置窗口显隐（托盘左键）。
/// 用「可见且聚焦」判断开关状态：设置窗口若被其它置顶面板盖住（可见但失焦），
/// 点击应把它带回前台而不是误判为"已打开"而隐藏——这正是"面板没关时设置
/// 打不开"的根因：面板盖住设置窗口后 is_visible 仍为 true，左键点击反而
/// 把设置窗口藏了。
fn toggle_settings_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("settings") {
        let visible = w.is_visible().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = w.hide();
        } else {
            show_settings_window(app);
        }
    }
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let clipboard_item =
        MenuItem::with_id(app, "toggle_clipboard", "剪贴板面板", true, None::<&str>)?;
    let folder_item =
        MenuItem::with_id(app, "toggle_folder", "文件夹面板", true, None::<&str>)?;
    let cred_item =
        MenuItem::with_id(app, "toggle_credential", "账号密码面板", true, None::<&str>)?;
    let open_item = MenuItem::with_id(app, "open_settings", "打开设置", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &clipboard_item,
            &folder_item,
            &cred_item,
            &open_item,
            &quit_item,
        ],
    )?;
    // 复用应用默认图标，双主题下均为中性彩色，无需切换
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("缺少默认窗口图标");

    TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(false)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("小心工具箱")
        .title("小心工具箱")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle_clipboard" => crate::panel::toggle_panel(app, crate::panel::CLIPBOARD_PANEL),
            "toggle_folder" => crate::panel::toggle_panel(app, crate::panel::FOLDER_PANEL),
            "toggle_credential" => {
                crate::panel::toggle_panel(app, crate::panel::CREDENTIAL_PANEL)
            }
            "open_settings" => show_settings_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_settings_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
