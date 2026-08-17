//! 系统托盘：左键切换设置窗口，右键菜单（打开设置 / 退出）。
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WebviewWindowBuilder,
};
use windows::Win32::Foundation::HWND;

/// 设置窗口点击关闭（X）→ 隐藏而非销毁。
/// Tauri 默认关闭即销毁窗口；销毁后 get_webview_window("settings") 返回 None，
/// 托盘/快捷键所有"打开设置"入口都会静默失效（show_settings_window 先收起面板
/// 再取窗口，取不到直接 return → 面板被收走、设置也不出现），表现为
/// "设置打不开，以后也都打不开"。窗口创建/重建后都必须调用本函数挂上拦截。
pub fn protect_settings_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = app.get_webview_window("settings") else {
        return;
    };
    let win = w.clone();
    w.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win.hide();
        }
    });
}

/// 获取设置窗口；若已被销毁（旧版本点 X 会销毁）则按 tauri.conf.json 配置自动重建。
fn ensure_settings_window<R: Runtime>(app: &AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window("settings") {
        return Some(w);
    }
    crate::storage::diag_write("settings window missing, rebuilding");
    // URL 跟随运行模式：dev 用 devUrl（vite dev server），生产用打包资源
    let url = match app.config().build.dev_url.clone() {
        Some(u) => tauri::WebviewUrl::External(u),
        None => tauri::WebviewUrl::App("index.html".into()),
    };
    let _ = WebviewWindowBuilder::new(app, "settings", url)
        .title("小心工具箱 - 设置")
        .inner_size(920.0, 640.0)
        .min_inner_size(760.0, 520.0)
        .center()
        .resizable(true)
        .always_on_top(true)
        .visible(false)
        .build();
    // 重建的窗口同样要挂上"关闭=隐藏"拦截，防止再次被销毁
    protect_settings_window(app);
    app.get_webview_window("settings")
}

/// 显示并聚焦设置窗口。
/// 各面板互不影响（用户需求），设置窗口不再收起已开面板。
/// 置前分两阶段：先 show（同步 SetWindowPos 置顶），再延时到后台线程置前聚焦——
/// 后台 SetForegroundWindow 常被前台锁拒绝，延时到"用户输入窗口期"后调用成功率更高；
/// 若仍失败（is_focused=false）再补一次。彻底避免"窗口可见却未置前/无焦点"的打不开。
pub fn show_settings_window<R: Runtime>(app: &AppHandle<R>) {
    // 窗口可能已被销毁（旧版本点 X）→ 自动重建，避免"以后都打不开"
    let Some(w) = ensure_settings_window(app) else {
        crate::storage::diag_write("show_settings_window: settings window unavailable");
        return;
    };
    crate::storage::diag_write(&format!(
        "show_settings_window: visible={:?} focused={:?}",
        w.is_visible().unwrap_or(false),
        w.is_focused().unwrap_or(false)
    ));
    // 标题栏跟随应用主题（浅色=浅色标题栏，而非 Windows 系统深色）
    crate::apply_titlebar_theme(&w);
    // 确保置顶样式在位（同步生效），再显示
    let _ = w.set_always_on_top(true);
    let _ = w.unminimize();
    let _ = w.show();
    // 兜底：极端状态（最小化+隐藏）下 unminimize/show 可能仍未真正显示，
    // 用 Win32 SW_SHOWNORMAL 强制激活显示 + 恢复
    #[cfg(windows)]
    if !w.is_visible().unwrap_or(false) {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Ok(handle) = w.window_handle() {
            if let RawWindowHandle::Win32(h) = handle.as_raw() {
                use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNORMAL};
                unsafe {
                    let hwnd = HWND(h.hwnd.get() as *mut _);
                    let _ = ShowWindow(hwnd, SW_SHOWNORMAL);
                }
            }
        }
    }

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
    let Some(w) = app.get_webview_window("settings") else {
        // 窗口不存在（旧版本点 X 已销毁）→ 直接重建并显示
        show_settings_window(app);
        return;
    };
    let visible = w.is_visible().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);
    if visible && focused {
        let _ = w.hide();
    } else {
        show_settings_window(app);
    }
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let clipboard_item =
        MenuItem::with_id(app, "toggle_clipboard", "剪贴板面板", true, None::<&str>)?;
    let folder_item =
        MenuItem::with_id(app, "toggle_folder", "文件夹面板", true, None::<&str>)?;
    let cred_item =
        MenuItem::with_id(app, "toggle_credential", "账号密码面板", true, None::<&str>)?;
    let port_item = MenuItem::with_id(app, "toggle_port", "端口工具", true, None::<&str>)?;
    let toolbar_item =
        MenuItem::with_id(app, "toggle_toolbar", "悬浮工具栏", true, None::<&str>)?;
    let open_item = MenuItem::with_id(app, "open_settings", "打开设置", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &clipboard_item,
            &folder_item,
            &cred_item,
            &port_item,
            &toolbar_item,
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
            "toggle_port" => crate::panel::toggle_panel(app, crate::panel::PORT_PANEL),
            // 悬浮工具栏：切换显隐（位置自动记忆）
            "toggle_toolbar" => crate::panel::toggle_toolbar(app),
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
