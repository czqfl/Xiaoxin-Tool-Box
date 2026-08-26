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
    let url = crate::frontend_url(app);
    let _ = WebviewWindowBuilder::new(app, "settings", url)
        .title("小心工具箱 - 设置")
        .inner_size(920.0, 640.0)
        .min_inner_size(760.0, 520.0)
        .center()
        .resizable(true)
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
    // 设置窗口不置顶：显示后点击其他应用即让位（不再是永久置顶窗口）
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
            // 置前但不置顶：设置窗口不再保持 TOPMOST，点击其他应用即让位
            crate::acrylic::force_foreground_robust(hwnd);
        }
        let _ = w2.set_focus();
        // 兜底：若仍未获得焦点（前台锁再次拒绝），稍后再补一次置前
        std::thread::sleep(std::time::Duration::from_millis(150));
        if !w2.is_focused().unwrap_or(false) {
            if let Some(hwnd) = hwnd_of(&w2) {
                crate::acrylic::force_foreground_robust(hwnd);
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
    // 按功能开关构建菜单：停用功能不显示对应入口（toggle_panel 内还有守卫兜底）
    let enabled = |key: &str| {
        app.try_state::<crate::config::ConfigState>()
            .map(|s| s.0.lock().unwrap().feature_enabled(key))
            .unwrap_or(true)
    };
    let mut items: Vec<MenuItem<R>> = Vec::new();
    let push_panel = |app: &AppHandle<R>, id: &str, text: &str, key: &str, items: &mut Vec<MenuItem<R>>| -> tauri::Result<()> {
        if enabled(key) {
            items.push(MenuItem::with_id(app, id, text, true, None::<&str>)?);
        }
        Ok(())
    };
    // 第一组：面板开关（受功能开关控制，停用即隐藏）
    push_panel(app, "toggle_clipboard", "剪贴板面板", "clipboard", &mut items)?;
    push_panel(app, "toggle_folder", "文件夹面板", "folder", &mut items)?;
    push_panel(app, "toggle_credential", "账号密码面板", "credentials", &mut items)?;
    push_panel(app, "toggle_files", "快速文件", "files", &mut items)?;
    push_panel(app, "toggle_snippets", "常用语速贴", "snippets", &mut items)?;
    push_panel(app, "toggle_port", "端口工具", "port", &mut items)?;
    if enabled("toolbar") {
        items.push(MenuItem::with_id(app, "toggle_toolbar", "悬浮工具栏", true, None::<&str>)?);
    }
    // 第二组：动作类功能（截图/取色/贴图/录屏/翻译）
    let sep1 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let mut action_items: Vec<MenuItem<R>> = Vec::new();
    if enabled("screenshot") {
        action_items.push(MenuItem::with_id(app, "shot_begin", "截  图", true, None::<&str>)?);
        action_items.push(MenuItem::with_id(app, "shot_picker", "屏幕取色", true, None::<&str>)?);
        action_items.push(MenuItem::with_id(app, "pins_toggle", "显示 / 隐藏贴图", true, None::<&str>)?);
        action_items.push(MenuItem::with_id(app, "pins_close", "关闭全部贴图", true, None::<&str>)?);
    }
    if enabled("recorder") {
        action_items.push(MenuItem::with_id(app, "start_recorder", "屏幕录制 (GIF)", true, None::<&str>)?);
    }
    if enabled("translation") {
        action_items.push(MenuItem::with_id(app, "translate_now", "划词翻译", true, None::<&str>)?);
    }
    let open_item = MenuItem::with_id(app, "open_settings", "打开设置", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    // 分隔线：把「面板开关」「动作」「打开设置/退出」分成三组，
    // 右键菜单一眼能看清结构（尤其最底部的「退出」）
    let sep = tauri::menu::PredefinedMenuItem::separator(app)?;
    let mut refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = items
        .iter()
        .map(|i| i as &dyn tauri::menu::IsMenuItem<R>)
        .collect();
    refs.push(&sep1);
    for a in &action_items {
        refs.push(a);
    }
    refs.push(&sep);
    refs.push(&open_item);
    refs.push(&quit_item);
    let menu = Menu::with_items(app, &refs)?;
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
            "toggle_files" => crate::panel::toggle_panel(app, crate::panel::FILES_PANEL),
            "toggle_snippets" => crate::panel::toggle_panel(app, crate::panel::SNIPPETS_PANEL),
            // 截图 / 取色：与全局快捷键同一实现
            "shot_begin" => {
                let _ = crate::screenshot::begin_impl(app.clone(), false);
            }
            "shot_picker" => {
                let _ = crate::screenshot::begin_impl(app.clone(), true);
            }
            "pins_toggle" => crate::pin::toggle_all(app),
            "pins_close" => {
                let _ = crate::pin::hide_all_impl(app);
            }
            // 屏幕录制：弹出全屏选区窗框选录制区域
            "start_recorder" => crate::recorder::begin_select(app),
            // 划词翻译
            "translate_now" => crate::translate::trigger_selection_translate(app),
            // 悬浮工具栏：切换显隐（位置自动记忆）
            "toggle_toolbar" => crate::panel::toggle_toolbar(app),
            "open_settings" => show_settings_window(app),
            // 硬退出：跳过第三方注入 DLL 的卸载回调（微信输入法 CrashRpt 竞态崩溃）
            "quit" => hard_exit(),
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

/// 应用退出：直接终止进程（TerminateProcess），跳过 DLL 卸载回调。
///
/// 常规退出（app.exit → ExitProcess）会给仍加载的 DLL 发 DLL_PROCESS_DETACH；
/// 微信输入法（WeType）注入的 CrashRpt1500.dll 在卸载阶段存在竞态——其内部
/// 线程调用已卸载代码，直接访问越界（事件日志多次记录：0xc0000005、
/// 模块 CrashRpt1500.dll_unloaded，弹窗"Error launching CrashSender.exe"）。
/// TerminateProcess 不通知任何 DLL，从根上绕开该第三方卸载竞态；进程终止后
/// 所有句柄/内存由 OS 统一回收，本应用自身无退出清理需求（配置均为改动即保存）。
#[cfg(windows)]
pub fn hard_exit() -> ! {
    unsafe {
        use windows::Win32::System::Threading::{GetCurrentProcess, TerminateProcess};
        let _ = TerminateProcess(GetCurrentProcess(), 0);
    }
    // TerminateProcess 对自身进程理论上必成功；兜底用快死路径，绝不走常规退出
    std::process::abort();
}

/// 设置窗口标题栏精确配色（DWMWA_CAPTION_COLOR，Windows 11 22000+，属性值 35）：
/// 让原生标题栏底色精确等于侧栏 --bg-sidebar，实现"任何主题下标题栏=侧栏"。
/// 原生 setTheme 只能 light/dark，浅色主题下 Windows 默认标题栏纯白、与浅灰侧栏
/// 有可见差异；此命令按需精确着色。旧系统不支持该 DWM 属性则静默失败（沿用 setTheme）。
#[cfg(windows)]
#[tauri::command]
pub fn set_settings_caption_color(app: AppHandle, rgb: String) -> bool {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows::Win32::Graphics::Dwm::DwmSetWindowAttribute;

    // 解析 "r,g,b"（0-255），长度必须恰好三段
    let mut parts = [0u8; 3];
    let mut it = rgb.split(',');
    for slot in parts.iter_mut() {
        match it.next().and_then(|s| s.trim().parse::<u8>().ok()) {
            Some(v) => *slot = v,
            None => return false,
        }
    }
    if it.next().is_some() {
        return false;
    }
    let colorref: u32 = (parts[0] as u32) | ((parts[1] as u32) << 8) | ((parts[2] as u32) << 16);

    let Some(w) = app.get_webview_window("settings") else {
        return false;
    };
    let handle = match w.window_handle() {
        Ok(h) => h,
        Err(_) => return false,
    };
    let RawWindowHandle::Win32(h) = handle.as_raw() else {
        return false;
    };
    let hwnd = HWND(h.hwnd.get() as *mut _);
    // DWMWA_CAPTION_COLOR 在 windows crate 枚举中未必稳定暴露，直接用原始值 35
    let attr = unsafe {
        std::mem::transmute::<u32, windows::Win32::Graphics::Dwm::DWMWINDOWATTRIBUTE>(35u32)
    };
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attr,
            &colorref as *const u32 as *const _,
            std::mem::size_of::<u32>() as u32,
        )
        .is_ok()
    }
}
