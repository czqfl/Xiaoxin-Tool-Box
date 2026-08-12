//! 低级键盘钩子（WH_KEYBOARD_LL）。
//!
//! RegisterHotKey 方式拦截 Ctrl+V 无法吞掉原始按键：用户按住 Ctrl 连按 V 时，
//! 未被吞掉的 V 会以纯文本输入进焦点应用，且与模拟粘贴的按键时序冲突。
//! 这里改用低级钩子在事件到达任何应用前直接吞掉，并转交工作线程延迟执行动作。
//! Win 组合键（如 Win+V / Win+F）被资源管理器保留，RegisterHotKey 抢不到，
//! 同样经此钩子接管（Win+L 等少数组合由系统内核直取，无法拦截）。
#![cfg(windows)]

use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_V, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetForegroundWindow, GetGUIThreadInfo, GetMessageW,
    GetWindowThreadProcessId, GUITHREADINFO, SendMessageW, SetForegroundWindow, SetWindowsHookExW,
    TranslateMessage, WM_COPY, HC_ACTION, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
};

const WM_KEYDOWN: usize = 0x0100;
const WM_KEYUP: usize = 0x0101;
const WM_SYSKEYDOWN: usize = 0x0104;
const WM_SYSKEYUP: usize = 0x0105;

/// 本应用注入的模拟按键事件的 dwExtraInfo 魔数：
/// 注入事件同样会经过低级钩子链，不识别会被当成真实按键误吞
pub const INJECTED_MAGIC: usize = 0x5858_5442;

#[derive(Clone, Copy)]
enum Action {
    /// 顺序粘贴模式：带出队列下一条
    SeqPaste,
    /// 呼出/隐藏剪贴板面板
    ToggleClipboard,
    /// 呼出/隐藏文件夹面板
    ToggleFolder,
    /// 呼出/隐藏账号密码面板
    ToggleCredential,
    /// 触发划词翻译（Alt 组合热键也由钩子接管，主动吞键）
    ToggleTranslate,
    /// 关闭翻译弹窗（系统级兜底：弹窗无焦点时 webview 收不到 Esc）
    CloseTranslate,
    /// 捕获模式：设置页录入 Win 组合键（payload 为虚拟键码）
    WinCaptured(u16),
}

/// 顺序粘贴（Ctrl+V）拦截开关，随粘贴模式切换
static SEQ_ENABLED: AtomicBool = AtomicBool::new(false);
/// 队列中是否有可粘贴条目：为空时放行 Ctrl+V，避免普通粘贴被误吞
static SEQ_AVAILABLE: AtomicBool = AtomicBool::new(false);
/// 捕获模式：设置页录入快捷键期间接管所有 Win 组合，防止系统功能抢先
static CAPTURE_MODE: AtomicBool = AtomicBool::new(false);
/// 钩子接管的 Win 组合面板热键虚拟键码；0 表示未启用
static CLIPBOARD_HOTKEY_VK: AtomicU16 = AtomicU16::new(0);
static FOLDER_HOTKEY_VK: AtomicU16 = AtomicU16::new(0);
static CREDENTIAL_HOTKEY_VK: AtomicU16 = AtomicU16::new(0);
/// 钩子接管的 Alt 组合面板/翻译热键虚拟键码；0 表示未启用。
/// Alt 组合必须也走钩子主动吞键：RegisterHotKey 对纯 Alt 组合在部分应用
/// （如 VS Code 的 Alt 菜单模式）吞键不彻底，主键会泄漏进编辑器把选中文字
/// 替换掉（"Alt+S 呼出翻译却把选中的字替换成 S"）。钩子拦截并吞掉 keydown/keyup，
/// 从根上杜绝按键泄漏。
static CLIPBOARD_HOTKEY_ALT_VK: AtomicU16 = AtomicU16::new(0);
static FOLDER_HOTKEY_ALT_VK: AtomicU16 = AtomicU16::new(0);
static CREDENTIAL_HOTKEY_ALT_VK: AtomicU16 = AtomicU16::new(0);
static TRANSLATE_HOTKEY_VK: AtomicU16 = AtomicU16::new(0);
static TRANSLATE_HOTKEY_ALT_VK: AtomicU16 = AtomicU16::new(0);
/// 翻译弹窗是否打开：打开时按 Esc 系统级关闭（弹窗 webview 可能无焦点收不到键）
static TRANSLATE_POPUP_OPEN: AtomicBool = AtomicBool::new(false);
static SENDER: OnceLock<Sender<Action>> = OnceLock::new();

// ---- 仅钩子线程（回调与消息循环同线程）读写 ----
static WIN_HELD: AtomicBool = AtomicBool::new(false);
/// Alt（左/右）当前是否按住：Alt 组合热键精确匹配用
static ALT_HELD: AtomicBool = AtomicBool::new(false);
/// 本次 Win 按下期间是否消费过组合键（Win 抬起时需阻止开始菜单）
static WIN_CONSUMED: AtomicBool = AtomicBool::new(false);
/// 已吞掉 keydown 的按键，对应 keyup 也要吞掉
static SWALLOWED_VK: AtomicU16 = AtomicU16::new(0);

/// 顺序粘贴（Ctrl+V）拦截开关：顺序模式开启，普通模式关闭
pub fn set_seq_paste_enabled(on: bool) {
    SEQ_ENABLED.store(on, Ordering::SeqCst);
}

/// 同步队列可用性：队列为空时放行 Ctrl+V（交给系统普通粘贴）
pub fn set_seq_queue_available(on: bool) {
    SEQ_AVAILABLE.store(on, Ordering::SeqCst);
}

/// 翻译弹窗打开状态：显示时置 true，Esc 系统级关闭时复位
pub fn set_translate_popup_open(on: bool) {
    TRANSLATE_POPUP_OPEN.store(on, Ordering::SeqCst);
}

/// 捕获模式：设置页录入快捷键期间接管 Win 组合，拦截后回传组合串
pub fn set_capture_mode(on: bool) {
    CAPTURE_MODE.store(on, Ordering::SeqCst);
    if !on {
        // 结束时复位状态，避免残留标记影响下次捕获
        WIN_CONSUMED.store(false, Ordering::SeqCst);
        SWALLOWED_VK.store(0, Ordering::SeqCst);
    }
}

/// 设置钩子接管的组合热键主键；vk 为 0 时取消接管。
/// `is_alt`：true 表示 Alt 组合（钩子主动吞键），false 表示 Win 组合。
pub fn set_panel_hotkey(target: &str, is_alt: bool, vk: u16) {
    let slot = match (target, is_alt) {
        ("clipboard", false) => &CLIPBOARD_HOTKEY_VK,
        ("folder", false) => &FOLDER_HOTKEY_VK,
        ("credentials", false) => &CREDENTIAL_HOTKEY_VK,
        ("translation", false) => &TRANSLATE_HOTKEY_VK,
        ("clipboard", true) => &CLIPBOARD_HOTKEY_ALT_VK,
        ("folder", true) => &FOLDER_HOTKEY_ALT_VK,
        ("credentials", true) => &CREDENTIAL_HOTKEY_ALT_VK,
        ("translation", true) => &TRANSLATE_HOTKEY_ALT_VK,
        _ => return,
    };
    slot.store(vk, Ordering::SeqCst);
}

/// 组合键主键（keyboard Code）转虚拟键码；不支持的键返回 None
pub fn code_to_vk(code: tauri_plugin_global_shortcut::Code) -> Option<u16> {
    use tauri_plugin_global_shortcut::Code;
    let vk = match code {
        Code::KeyA => 0x41,
        Code::KeyB => 0x42,
        Code::KeyC => 0x43,
        Code::KeyD => 0x44,
        Code::KeyE => 0x45,
        Code::KeyF => 0x46,
        Code::KeyG => 0x47,
        Code::KeyH => 0x48,
        Code::KeyI => 0x49,
        Code::KeyJ => 0x4A,
        Code::KeyK => 0x4B,
        Code::KeyL => 0x4C,
        Code::KeyM => 0x4D,
        Code::KeyN => 0x4E,
        Code::KeyO => 0x4F,
        Code::KeyP => 0x50,
        Code::KeyQ => 0x51,
        Code::KeyR => 0x52,
        Code::KeyS => 0x53,
        Code::KeyT => 0x54,
        Code::KeyU => 0x55,
        Code::KeyV => 0x56,
        Code::KeyW => 0x57,
        Code::KeyX => 0x58,
        Code::KeyY => 0x59,
        Code::KeyZ => 0x5A,
        Code::Digit0 => 0x30,
        Code::Digit1 => 0x31,
        Code::Digit2 => 0x32,
        Code::Digit3 => 0x33,
        Code::Digit4 => 0x34,
        Code::Digit5 => 0x35,
        Code::Digit6 => 0x36,
        Code::Digit7 => 0x37,
        Code::Digit8 => 0x38,
        Code::Digit9 => 0x39,
        Code::F1 => 0x70,
        Code::F2 => 0x71,
        Code::F3 => 0x72,
        Code::F4 => 0x73,
        Code::F5 => 0x74,
        Code::F6 => 0x75,
        Code::F7 => 0x76,
        Code::F8 => 0x77,
        Code::F9 => 0x78,
        Code::F10 => 0x79,
        Code::F11 => 0x7A,
        Code::F12 => 0x7B,
        _ => return None,
    };
    Some(vk)
}

/// 启动钩子线程（重复调用自动忽略）。钩子回调必须在带消息循环的线程上安装。
pub fn start<R: Runtime + 'static>(app: AppHandle<R>) {
    let (tx, rx) = mpsc::channel::<Action>();
    if SENDER.set(tx).is_err() {
        return;
    }
    std::thread::Builder::new()
        .name("keyboard-hook".into())
        .spawn(move || {
            // 工作线程：钩子回调只投递动作，粘贴模拟等耗时操作在此执行
            std::thread::spawn(move || {
                while let Ok(action) = rx.recv() {
                    run_action(&app, action);
                }
            });
            unsafe {
                if SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), None, 0).is_ok() {
                    let mut msg = MSG::default();
                    // 消息循环保持线程存活并驱动钩子回调
                    while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }
            }
        })
        .ok();
}

fn post(action: Action) {
    if let Some(tx) = SENDER.get() {
        let _ = tx.send(action);
    }
}

fn run_action<R: Runtime>(app: &AppHandle<R>, action: Action) {
    match action {
        Action::SeqPaste => {
            // 面板自身聚焦时全局 Ctrl+V：先收起面板，让焦点回到之前的应用
            crate::panel::hide_focused_panel(app);
            crate::clipboard::sequential_paste(app);
        }
        Action::ToggleClipboard => crate::panel::toggle_panel(app, crate::panel::CLIPBOARD_PANEL),
        Action::ToggleFolder => crate::panel::toggle_panel(app, crate::panel::FOLDER_PANEL),
        Action::ToggleCredential => {
            crate::panel::toggle_panel(app, crate::panel::CREDENTIAL_PANEL)
        }
        Action::ToggleTranslate => {
            crate::storage::diag_write("[keyhook] translate hotkey pressed");
            crate::translate::trigger_selection_translate(app)
        }
        Action::CloseTranslate => {
            // 系统级关闭翻译弹窗（webview 无焦点时前端收不到 Esc 的兜底）
            set_translate_popup_open(false);
            if let Some(w) = app.get_webview_window(crate::translate::TRANSLATE_PANEL) {
                let _ = w.hide();
            }
        }
        Action::WinCaptured(vk) => {
            // 回传组合串给设置页录入框（与前端 comboFromEvent 的格式一致）
            if let Some(name) = vk_to_combo_name(vk as u32) {
                let _ = app.emit(crate::shortcut::EVT_WIN_CAPTURED, format!("Super+{name}"));
            }
        }
    }
}

/// 虚拟键码转组合键主键名（仅支持可录入的字母/数字/F 键）
fn vk_to_combo_name(vk: u32) -> Option<String> {
    match vk {
        0x41..=0x5A => Some(format!("{}", (b'A' + (vk - 0x41) as u8) as char)),
        0x30..=0x39 => Some(format!("{}", (b'0' + (vk - 0x30) as u8) as char)),
        0x70..=0x7B => Some(format!("F{}", vk - 0x70 + 1)),
        _ => None,
    }
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code != HC_ACTION as i32 {
        return CallNextHookEx(None, code, wparam, lparam);
    }
    let Some(info) = (lparam.0 as *const KBDLLHOOKSTRUCT).as_ref() else {
        return CallNextHookEx(None, code, wparam, lparam);
    };
    // 本应用注入的模拟按键（如模拟粘贴）：直接放行，否则会被当成真实按键吞掉
    if info.dwExtraInfo == INJECTED_MAGIC {
        return CallNextHookEx(None, code, wparam, lparam);
    }
    let vk = info.vkCode;
    let msg = wparam.0;
    let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

    // Win 键自身：只跟踪状态；消费过组合后抬起时吞掉，避免弹出开始菜单
    if vk == VK_LWIN.0 as u32 || vk == VK_RWIN.0 as u32 {
        if is_down {
            WIN_HELD.store(true, Ordering::SeqCst);
        } else {
            WIN_HELD.store(false, Ordering::SeqCst);
            if WIN_CONSUMED.swap(false, Ordering::SeqCst) {
                return LRESULT(1);
            }
        }
        return CallNextHookEx(None, code, wparam, lparam);
    }

    // Alt 键自身：只跟踪状态（Alt 组合热键精确匹配用），不吞键
    if vk == VK_MENU.0 as u32 {
        ALT_HELD.store(is_down, Ordering::SeqCst);
        return CallNextHookEx(None, code, wparam, lparam);
    }

    if is_down {
        // 与已吞按键的自动重复：继续吞掉，不重复触发动作
        if SWALLOWED_VK.load(Ordering::SeqCst) == vk as u16 {
            return LRESULT(1);
        }
        let win_held = WIN_HELD.load(Ordering::SeqCst);
        let alt_held = ALT_HELD.load(Ordering::SeqCst);
        if win_held {
            // 捕获模式优先：设置页录入期间接管所有可录入的 Win 组合，
            // 否则系统功能（剪贴板历史、听写等）会抢先触发导致按键到不了录入框
            if CAPTURE_MODE.load(Ordering::SeqCst) {
                if vk_to_combo_name(vk).is_some() {
                    WIN_CONSUMED.store(true, Ordering::SeqCst);
                    SWALLOWED_VK.store(vk as u16, Ordering::SeqCst);
                    post(Action::WinCaptured(vk as u16));
                    return LRESULT(1);
                }
            }
            // Win 组合面板/翻译热键：先于顺序粘贴判断，允许 Win+V 覆盖 Ctrl+V 语义
            let action = if vk == CLIPBOARD_HOTKEY_VK.load(Ordering::SeqCst) as u32 {
                Some(Action::ToggleClipboard)
            } else if vk == FOLDER_HOTKEY_VK.load(Ordering::SeqCst) as u32 {
                Some(Action::ToggleFolder)
            } else if vk == CREDENTIAL_HOTKEY_VK.load(Ordering::SeqCst) as u32 {
                Some(Action::ToggleCredential)
            } else if vk == TRANSLATE_HOTKEY_VK.load(Ordering::SeqCst) as u32 {
                Some(Action::ToggleTranslate)
            } else {
                None
            };
            if let Some(action) = action {
                WIN_CONSUMED.store(true, Ordering::SeqCst);
                SWALLOWED_VK.store(vk as u16, Ordering::SeqCst);
                post(action);
                return LRESULT(1);
            }
        }
        // Alt 组合面板/翻译热键：精确匹配（Ctrl/Shift 未同时按下，
        // 避免误吞 Alt+Ctrl+X / Alt+Shift+X 等输入法或应用快捷键）。
        // RegisterHotKey 对纯 Alt 组合在部分应用吞键不彻底（主键泄漏进编辑器
        // 替换选中文字），这里由钩子主动吞掉 keydown/keyup 根治。
        if alt_held && !ctrl_held() && !shift_held() {
            let action = if vk == CLIPBOARD_HOTKEY_ALT_VK.load(Ordering::SeqCst) as u32 {
                Some(Action::ToggleClipboard)
            } else if vk == FOLDER_HOTKEY_ALT_VK.load(Ordering::SeqCst) as u32 {
                Some(Action::ToggleFolder)
            } else if vk == CREDENTIAL_HOTKEY_ALT_VK.load(Ordering::SeqCst) as u32 {
                Some(Action::ToggleCredential)
            } else if vk == TRANSLATE_HOTKEY_ALT_VK.load(Ordering::SeqCst) as u32 {
                Some(Action::ToggleTranslate)
            } else {
                None
            };
            if let Some(action) = action {
                SWALLOWED_VK.store(vk as u16, Ordering::SeqCst);
                post(action);
                return LRESULT(1);
            }
        }
        if SEQ_ENABLED.load(Ordering::SeqCst)
            && SEQ_AVAILABLE.load(Ordering::SeqCst)
            && vk == VK_V.0 as u32
            && ctrl_held()
        {
            // 顺序粘贴 Ctrl+V：吞掉物理按键，稍后发送一次干净的模拟粘贴
            SWALLOWED_VK.store(vk as u16, Ordering::SeqCst);
            post(Action::SeqPaste);
            return LRESULT(1);
        } else if vk == 0x1B && TRANSLATE_POPUP_OPEN.load(Ordering::SeqCst) {
            // 翻译弹窗打开时按 Esc：系统级关闭（不吞键，避免弹窗已关后 Esc 失灵）
            post(Action::CloseTranslate);
        }
    } else if is_up && SWALLOWED_VK.load(Ordering::SeqCst) == vk as u16 {
        SWALLOWED_VK.store(0, Ordering::SeqCst);
        return LRESULT(1);
    }

    CallNextHookEx(None, code, wparam, lparam)
}

fn ctrl_held() -> bool {
    unsafe { GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000 != 0 }
}

fn shift_held() -> bool {
    unsafe { GetAsyncKeyState(VK_SHIFT.0 as i32) as u16 & 0x8000 != 0 }
}

/// 注入一次 Ctrl+V 模拟粘贴（带魔数标记，钩子会放行）
pub fn send_ctrl_v() {
    fn mk(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up {
                        KEYEVENTF_KEYUP
                    } else {
                        KEYBD_EVENT_FLAGS(0)
                    },
                    time: 0,
                    dwExtraInfo: INJECTED_MAGIC,
                },
            },
        }
    }
    let inputs = [
        mk(VK_CONTROL, false),
        mk(VK_V, false),
        mk(VK_V, true),
        mk(VK_CONTROL, true),
    ];
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

/// 当前前台窗口句柄。划词翻译在热键触发、尚未显示自身窗口时调用，
/// 拿到的是用户正在操作、持有选中文本的来源应用。
pub fn foreground_hwnd() -> Option<HWND> {
    unsafe {
        let h = GetForegroundWindow();
        if h.is_invalid() {
            None
        } else {
            Some(h)
        }
    }
}

/// 把源应用可靠地置为前台：先直连 `SetForegroundWindow`，若被前台锁拒绝，
/// 则附加到【当前前台线程】再抢——这是突破前台锁的标准做法。
/// 仅当复制兜底路径需要（UIA 拿不到选中文本时）才调用。
pub fn set_source_foreground(src: HWND) {
    unsafe {
        if src.is_invalid() {
            return;
        }
        if GetForegroundWindow() == src {
            return;
        }
        let _ = SetForegroundWindow(src);
        if GetForegroundWindow() == src {
            return;
        }
        let fg = GetForegroundWindow();
        if fg.is_invalid() {
            return;
        }
        let fg_thread = GetWindowThreadProcessId(fg, None);
        let cur = GetCurrentThreadId();
        if fg_thread != 0 && fg_thread != cur {
            let _ = AttachThreadInput(cur, fg_thread, true);
            let _ = SetForegroundWindow(src);
            let _ = AttachThreadInput(cur, fg_thread, false);
        }
    }
}

/// 等待 Ctrl/Alt/Shift/Win 修饰键全部释放（最多 600ms）。
/// 模拟复制（Ctrl+C）前必须调用：用户按翻译热键的瞬间修饰键还按着，
/// 此时注入的 C 会与按住的 Alt 组合成 Alt+C/Ctrl+Alt+C，命中 QQ 等
/// 截图工具的热键。等待其释放后再注入，可根除"长按快捷键误触截图"。
pub fn wait_modifiers_released() {
    for _ in 0..30 {
        unsafe {
            let pressed = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN]
                .iter()
                .any(|&vk| (GetAsyncKeyState(vk.0 as i32) as u16) & 0x8000 != 0);
            if !pressed {
                return;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

/// 模拟 Ctrl+C（带魔数标记，钩子会放行）。注入后调用方需延迟再读剪贴板。
/// 仅在 UIA 读不到选中文本时作为兜底使用，且调用前必调 `wait_modifiers_released`。
pub fn send_ctrl_c() {
    fn mk(vk: VIRTUAL_KEY, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if up {
                        KEYEVENTF_KEYUP
                    } else {
                        KEYBD_EVENT_FLAGS(0)
                    },
                    time: 0,
                    dwExtraInfo: INJECTED_MAGIC,
                },
            },
        }
    }
    let inputs = [
        mk(VK_CONTROL, false),
        mk(VIRTUAL_KEY(0x43), false), // VK_C
        mk(VIRTUAL_KEY(0x43), true),
        mk(VK_CONTROL, true),
    ];
    unsafe {
        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

/// 向源应用【焦点控件】发送 WM_COPY 作为 `SendInput(Ctrl+C)` 的补充：
/// 原生编辑控件对 WM_COPY 响应比模拟按键更稳；浏览器等仍主要靠 Ctrl+C。
/// 必须在源应用前台时调用；用 `GetGUIThreadInfo` 取源线程焦点控件。
pub fn send_wm_copy(src: HWND) {
    unsafe {
        let src_thread = GetWindowThreadProcessId(src, None);
        let cur = GetCurrentThreadId();
        let mut attached = false;
        if src_thread != 0 && src_thread != cur {
            let _ = AttachThreadInput(cur, src_thread, true);
            attached = true;
        }
        let mut gui: GUITHREADINFO = std::mem::zeroed();
        gui.cbSize = std::mem::size_of::<GUITHREADINFO>() as u32;
        let focus = if GetGUIThreadInfo(src_thread, &mut gui).is_ok() {
            gui.hwndFocus
        } else {
            HWND(std::ptr::null_mut())
        };
        let target = if focus.is_invalid() { src } else { focus };
        if !target.is_invalid() {
            let _ = SendMessageW(target, WM_COPY, Some(WPARAM(0)), Some(LPARAM(0)));
        }
        if attached {
            let _ = AttachThreadInput(cur, src_thread, false);
        }
    }
}

/// 剪贴板序列号：每次任意进程写入剪贴板都会自增。
/// 判定"模拟 Ctrl+C 是否真的复制成功"必须用它，不能只比较文本内容——
/// 当选中文字恰好等于剪贴板已有内容时，内容比较会误判为"复制失败"。
pub fn clipboard_seq() -> u32 {
    unsafe { GetClipboardSequenceNumber() }
}


