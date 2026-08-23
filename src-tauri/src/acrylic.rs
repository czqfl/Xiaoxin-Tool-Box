//! 面板模糊效果：SetWindowCompositionAttribute + ACCENT_ENABLE_BLURBEHIND。
//!
//! 为什么用 BLURBEHIND（state=3）而不用 ACRYLIC（state=4）：
//! - ACRYLIC 是「静态快照」模糊——窗口显示时对背后截一次图并固定住，背后内容
//!   变化（滚动/切换窗口、动壁纸）不会跟着刷新，观感正是"只有透明、没有实时
//!   模糊"；BLURBEHIND 由合成器逐帧实时计算，背后内容变化即时更新。
//! - ACRYLIC 依赖 GPU 合成通道，在 RDP / 虚拟机 / 部分显卡上整窗不渲染
//!   （只剩透明底）；BLURBEHIND 兼容性更广，老环境也能稳定出模糊。
//! 二者同走 SWCA，激活无关性一致（窗口可见即出、失焦也保持）。
//!
//! 为什么不用 DWM 系统背景（DWMSBT_*）：
//! - DWMSBT_TRANSIENTWINDOW（mica）仅在「活动窗口」上绘制，程序化呼出的面板
//!   在 Win32 前景锁限制下未真正激活 → 不绘制 → 必须点一下才出模糊（用户已多次遇到）；
//! - DWMSBT_MAINWINDOW（acrylic）在无边框（decorations:false）面板上经常完全
//!   不绘制（实测"模糊消失"）。
//! 二者都绕不开"依赖窗口是否激活"，无法满足"呼出即模糊、无需点击"。
//!
//! 本路径（SWCA + BLURBEHIND）的模糊只认"窗口可见"，与是否激活/聚焦完全无关，
//! 窗口一显示即出模糊、失焦也保持。前提窗口为不透明（transparent: false）：
//! 此前踩过的黑色矩形是 transparent:true（WS_EX_LAYERED 分层窗口）上 DWM
//! 系统背景的坑，与本路径无关，故保持不透明窗口即可安全使用。
//! 注意：BLURBEHIND 的 gradient_color alpha 不能为 0（否则整窗渲染异常），
//! 这里用 alpha=1 的透明底色，色调完全交给前端半透明外壳（主题自适应）。
//!
//! 注意：SetWindowCompositionAttribute 是未公开 API——既不在 windows crate 元数据里
//! （没法 use），也不在官方 user32.lib 导入库中（直接 #[link] 会 LNK2019 无法解析）。
//! 因此用运行时 GetProcAddress 从已加载的 user32.dll 动态取出函数指针再调用。
use std::ffi::c_void;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMWCP_DONOTROUND, DWMWCP_ROUND,
};
use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};

// WINDOWCOMPOSITIONATTRIB::WCA_ACCENT_POLICY
const WCA_ACCENT_POLICY: u32 = 19;
// ACCENT_STATE
const ACCENT_DISABLED: u32 = 0;
const ACCENT_ENABLE_BLURBEHIND: u32 = 3;

#[repr(C)]
struct AccentPolicy {
    accent_state: u32,
    accent_flags: u32,
    gradient_color: u32,
    animation_id: u32,
}

#[repr(C)]
struct WindowCompositionAttrData {
    attribute: u32,
    p_data: *mut c_void,
    data_size: usize,
}

// 与未公开 API 匹配的签名
type SetWindowCompositionAttributeFn =
    unsafe extern "system" fn(HWND, *mut WindowCompositionAttrData) -> i32;

/// 运行时从 user32.dll 取出 SetWindowCompositionAttribute 并调用。
/// user32 在 GUI 进程里必然已加载，GetModuleHandle 不会失败；该 API 虽未公开
/// 但在 user32 导出表里，GetProcAddress 可取。取不到（极老系统）则按"无模糊"处理。
unsafe fn set_window_composition_attribute(
    hwnd: HWND,
    data: *mut WindowCompositionAttrData,
) -> bool {
    let hmod = match GetModuleHandleW(windows::core::w!("user32.dll")) {
        Ok(h) => h,
        Err(_) => return false,
    };
    let Some(farproc) = GetProcAddress(hmod, windows::core::s!("SetWindowCompositionAttribute"))
    else {
        return false;
    };
    let func: SetWindowCompositionAttributeFn = std::mem::transmute(farproc);
    func(hwnd, data) != 0
}

/// 给窗口应用背景模糊（BLURBEHIND：实时模糊，与激活无关，窗口可见即出）。
/// 失败（如系统不支持）返回 false，调用方保持普通窗口，不黑。
/// light：模糊色调跟随主题——浅色=白色调（面板不透明度调低时透出白调模糊，
/// 深色文字仍清晰可读），深色=黑色调（白字可读）。
pub fn apply_blur(hwnd: HWND, light: bool) -> bool {
    apply_blur_impl(hwnd, if light { 0x01FF_FFFF } else { 0x0100_0000 })
}

fn apply_blur_impl(hwnd: HWND, gradient_color: u32) -> bool {
    let mut policy = AccentPolicy {
        accent_state: ACCENT_ENABLE_BLURBEHIND,
        accent_flags: 0,
        gradient_color,
        animation_id: 0,
    };
    let mut data = WindowCompositionAttrData {
        attribute: WCA_ACCENT_POLICY,
        p_data: &mut policy as *mut _ as *mut c_void,
        data_size: std::mem::size_of::<AccentPolicy>(),
    };
    unsafe { set_window_composition_attribute(hwnd, &mut data) }
}

/// 清除背景模糊。
#[allow(dead_code)]
pub fn clear_blur(hwnd: HWND) -> bool {
    let mut policy = AccentPolicy {
        accent_state: ACCENT_DISABLED,
        accent_flags: 0,
        gradient_color: 0,
        animation_id: 0,
    };
    let mut data = WindowCompositionAttrData {
        attribute: WCA_ACCENT_POLICY,
        p_data: &mut policy as *mut _ as *mut c_void,
        data_size: std::mem::size_of::<AccentPolicy>(),
    };
    unsafe { set_window_composition_attribute(hwnd, &mut data) }
}

/// Win11：窗口自身设为系统原生圆角（rounded=true）或直角（rounded=false）。
/// DWM 物理裁剪窗口四角，配合不透明窗口是消除"圆角后矩形背景"的确定性方案。
/// 工具栏要求直角（用户明确不要圆角），走 DWMWCP_DONOTROUND。
pub fn apply_rounded_corners(hwnd: HWND, rounded: bool) -> bool {
    let pref = if rounded { DWMWCP_ROUND } else { DWMWCP_DONOTROUND };
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &pref as *const _ as *const c_void,
            std::mem::size_of_val(&pref) as u32,
        )
        .is_ok()
    }
}

/// 设置窗口标题栏深浅（DWMWA_USE_IMMERSIVE_DARK_MODE）。
/// 让有原生边框的窗口（设置窗口）标题栏跟随【应用主题】而非 Windows 系统
/// 主题——否则浅色主题下窗口顶部仍顶一条系统深色标题栏（用户反馈）。
pub fn set_titlebar_theme(hwnd: HWND, dark: bool) {
    let value: i32 = if dark { 1 } else { 0 };
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &value as *const i32 as *const c_void,
            std::mem::size_of::<i32>() as u32,
        );
    }
}

/// 可靠置前：先把窗口顶到最前再降回（绕过 Win32 前景窗口锁），再 SetForegroundWindow。
/// 背景进程（托盘菜单 / 全局热键）直接 set_focus 常被系统拒绝，导致窗口可见却
/// 未真正置前、无法接收键盘输入。用本函数替代单纯的 show + set_focus。
/// 注：本路径模糊与激活无关，置前仅用于保证面板可正常交互，不再影响模糊绘制。
/// 现面板呼出统一走 force_foreground_robust（不受前台锁输入窗口限制），
/// 本函数保留备用（同步、落在输入窗口内时更轻量）。
#[cfg_attr(windows, allow(dead_code))]
pub fn force_foreground(hwnd: HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetForegroundWindow, SetWindowPos, GWL_EXSTYLE, HWND_NOTOPMOST,
        HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, WS_EX_TOPMOST,
    };
    unsafe {
        // 若窗口当前已带置顶样式（WS_EX_TOPMOST），直接 SetForegroundWindow 即可，
        // 绝不能先顶到最前再降回——降回会顺带清除置顶样式，导致配置开了置顶但
        // 窗口实际不置顶、前端按钮状态与实际失配（首次点击置顶不生效的根因）。
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if ex_style != 0 && (ex_style as u32) & WS_EX_TOPMOST.0 != 0 {
            let _ = SetForegroundWindow(hwnd);
            return;
        }
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE,
        );
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_NOTOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE,
        );
        let _ = SetForegroundWindow(hwnd);
    }
}

/// 置顶并置前（设置窗口等"必须始终在最上面"的场景）：
/// 直接用 Win32 SetWindowPos 同步把窗口顶到最前（TOPMOST 立刻生效），再
/// SetForegroundWindow。不依赖 Tauri set_always_on_top 的异步 IPC——异步时序下
/// force_foreground 可能读到"尚未置顶"的样式而走降回分支，把本应置顶的窗口
/// 降成普通窗口，被其它窗口盖住（"偶尔打不开设置"的根因）。
pub fn force_topmost_foreground(hwnd: HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetForegroundWindow, SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
        SWP_NOACTIVATE,
    };
    unsafe {
        // SWP_NOACTIVATE：先同步置顶但不抢焦点，随后 SetForegroundWindow 统一置前
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
        let _ = SetForegroundWindow(hwnd);
    }
}

/// 可靠置前（后台线程也生效，不受前台锁输入窗口限制）。
///
/// 划词翻译需先做"存剪贴板→等修饰键释放→模拟 Ctrl+C 复制→翻译 API"，
/// 耗时数百毫秒，远超用户最后一次输入后的约 200ms 前台锁输入窗口；此时普通
/// `SetForegroundWindow` 会被系统拒绝，窗口显示在最前却从未获得焦点 →
/// 不能拖动/点击/Esc。普通面板用 `force_foreground` 即可，是因为它们在热键后
/// 同步、即时激活，落在输入窗口内。
///
/// 本函数在直接 `SetForegroundWindow` 失败后，用 `AttachThreadInput` 把本线程
/// 输入附加到当前前台线程，再抢前台——这是从后台线程可靠抢前台的标准做法，
/// 不受前台锁超时影响。务必在 `AttachThreadInput(.., false)` 解除附加，避免残留。
pub fn force_foreground_robust(hwnd: HWND) {
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
    };
    unsafe {
        if GetForegroundWindow() == hwnd {
            return;
        }
        // 1) 直接尝试（落在输入窗口内常能成功）
        let _ = SetForegroundWindow(hwnd);
        if GetForegroundWindow() == hwnd {
            return;
        }
        // 2) 附加到当前前台线程后再抢前台
        let fg = GetForegroundWindow();
        if fg.is_invalid() {
            return;
        }
        let fg_thread = GetWindowThreadProcessId(fg, None);
        let cur = GetCurrentThreadId();
        if fg_thread != 0 && fg_thread != cur {
            let _ = AttachThreadInput(cur, fg_thread, true);
            let _ = SetForegroundWindow(hwnd);
            let _ = AttachThreadInput(cur, fg_thread, false);
        }
    }
}
