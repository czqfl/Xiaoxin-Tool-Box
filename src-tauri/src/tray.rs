//! 系统托盘：左键切换设置窗口，右键菜单（打开设置 / 退出）。
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};
use windows::Win32::Foundation::HWND;

/// 显示并聚焦设置窗口。
/// 呼出前先收起所有悬浮面板（面板 alwaysOnTop 会盖住设置窗口）。
/// 置前分两阶段：先 show（同步 SetWindowPos 置顶），再延时到后台线程置前聚焦——
/// 后台 SetForegroundWindow 常被前台锁拒绝，延时到"用户输入窗口期"后调用成功率更高；
/// 若仍失败（is_focused=false）再补一次。彻底避免"窗口可见却未置前/无焦点"的打不开。
pub fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    for label in crate::panel::ALL_PANELS {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.hide();
        }
    }
    let Some(w) = app.get_webview_window("settings") else {
        return;
    };
    // 确保置顶样式在位（同步生效），再显示
    let _ = w.set_always_on_top(true);
    let _ = w.unminimize();
    let _ = w.show();

    // 后台线程：延时后置前聚焦 + 失败兜底重试（WebviewWindow 可跨线程调用）
    let w2 = w.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        let hwnd_of = |win: &tauri::WebviewWindow<R>| -> Option<HWND> {
            #[cfg(windows)]
            {
                use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                if let Ok(handle) = win.window_handle() {
                    if let RawWindowHandle::Win32(h) = handle.as_raw() {
                        return Some(HWND(h.hwnd.get() as *mut _));
                    }
                }
            }
            #[cfg(not(windows))]
            {
                let _ = win;
            }
            None
        };
        if let Some(hwnd) = hwnd_of(&w2) {
            crate::acrylic::force_topmost_foreground(hwnd);
        }
        let _ = w2.set_focus();
        // 兜底：若仍未获得焦点（前台锁再次拒绝），稍后再补一次置前
        std::thread::sleep(std::time::Duration::from_millis(150));
        if !w2.is_focused().unwrap_or(false) {
            if let Some(hwnd) = hwnd_of(&w2) {
                crate::acrylic::force_topmost_foreground(hwnd);
            }
            let _ = w2.set_focus();
        }
    });
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
