//! 面板模糊效果：SetWindowCompositionAttribute + ACCENT_ENABLE_BLURBEHIND。
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
//!
//! 注意：SetWindowCompositionAttribute 是未公开 API——既不在 windows crate 元数据里
//! （没法 use），也不在官方 user32.lib 导入库中（直接 #[link] 会 LNK2019 无法解析）。
//! 因此用运行时 GetProcAddress 从已加载的 user32.dll 动态取出函数指针再调用。
use std::ffi::c_void;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
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

/// 给窗口应用背景模糊（BLURBEHIND，与激活无关，窗口可见即出）。
/// 失败（如系统不支持）返回 false，调用方保持普通窗口，不黑。
pub fn apply_acrylic(hwnd: HWND) -> bool {
    let mut policy = AccentPolicy {
        accent_state: ACCENT_ENABLE_BLURBEHIND,
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

/// 清除背景模糊。
#[allow(dead_code)]
pub fn clear_acrylic(hwnd: HWND) -> bool {
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

/// Win11：窗口自身设为系统原生圆角。
/// DWM 物理裁剪窗口四角，配合不透明窗口是消除"圆角后矩形背景"的确定性方案。
pub fn apply_rounded_corners(hwnd: HWND) -> bool {
    let pref = DWMWCP_ROUND;
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

/// 可靠置前：先把窗口顶到最前再降回（绕过 Win32 前景窗口锁），再 SetForegroundWindow。
/// 背景进程（托盘菜单 / 全局热键）直接 set_focus 常被系统拒绝，导致窗口可见却
/// 未真正置前、无法接收键盘输入。用本函数替代单纯的 show + set_focus。
/// 注：本路径模糊与激活无关，置前仅用于保证面板可正常交互，不再影响模糊绘制。
pub fn force_foreground(hwnd: HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetForegroundWindow, SetWindowPos, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
    };
    unsafe {
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
