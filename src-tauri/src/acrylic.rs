//! 面板背景材质：Win11 官方 DWM 系统背景（DWMSBT_TRANSIENTWINDOW，mica）。
//!
//! 前提：窗口必须是不透明（transparent: false）的普通顶层窗口，
//! 且 webview 背景由 WebView2 DefaultBackgroundColor 置为全透明，
//! DWM 材质才能透过内容显示出来（CSS 透明做不到，只会露出 webview 默认底色）。
//!
//! 为什么用 TRANSIENTWINDOW（mica）而不是 MAINWINDOW（acrylic）：
//! MAINWINDOW 在无边框（decorations:false）面板上经常完全不绘制材质
//! （实测表现为"模糊消失"）；mica 在无边框窗口上稳定渲染，仅依赖窗口是否处于
//! 活动/置前状态。因此"无边框 + mica"需要程序化可靠置前（见 force_foreground），
//! 否则托盘/热键呼出时 Win32 前景锁会拒绝 set_focus，窗口虽可见却非活动 → 材质
//! 不绘制，表现为"必须先点一下面板才出模糊"。
//!
//! 不用 transparent + SWCA（SetWindowCompositionAttribute）的原因：
//! transparent: true 会把窗口变成 WS_EX_LAYERED 分层窗口，而 Win11
//! build 22523+ 上 DWM 系统背景在分层窗口上整体渲染为黑色矩形，SWCA
//! 亚克力也已失效——"圆角面板后有一层黑色方形"就是这条路径的产物。
//! 这里在不透明窗口上用官方属性。
use std::ffi::c_void;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMSBT_NONE, DWMSBT_TRANSIENTWINDOW, DWMWA_SYSTEMBACKDROP_TYPE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};

/// 给窗口应用背景材质（mica，Win11 build 22621+，仅支持不透明窗口）。
/// 在 Win10 上该属性不存在，调用失败时保持普通窗口（无材质，但不黑）。
pub fn apply_acrylic(hwnd: HWND) -> bool {
    let backdrop = DWMSBT_TRANSIENTWINDOW;
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &backdrop as *const _ as *const c_void,
            std::mem::size_of_val(&backdrop) as u32,
        )
        .is_ok()
    }
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

/// 清除 DWM 系统背景
#[allow(dead_code)]
pub fn clear_acrylic(hwnd: HWND) -> bool {
    let backdrop = DWMSBT_NONE;
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &backdrop as *const _ as *const c_void,
            std::mem::size_of_val(&backdrop) as u32,
        )
        .is_ok()
    }
}

/// 可靠置前：先把窗口顶到最前再降回（绕过 Win32 前景窗口锁），再 SetForegroundWindow。
/// 背景进程（托盘菜单 / 全局热键）直接 set_focus 常被系统拒绝，导致窗口可见却
/// 未真正置前、DWM 材质（mica）不绘制——这正是"必须先点一下面板才出模糊"的根因。
/// 用本函数替代单纯的 show + set_focus，即可让面板/设置窗口呼出即绘制材质、无需点击。
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
