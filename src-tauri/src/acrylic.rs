//! 面板亚克力效果：Win11 官方 DWM 背景亚克力（DWMSBT_TRANSIENTWINDOW）。
//!
//! 前提：窗口必须是不透明（transparent: false）的普通顶层窗口，
//! 且 webview 背景由 WebView2 DefaultBackgroundColor 置为全透明，
//! DWM 亚克力层才能透过内容显示出来（CSS 透明做不到，CSS 透明只会
//! 露出 webview 自身不透明的默认底色）。
//!
//! 系统行为说明（无法绕过）：亚克力只对"活动窗口"渲染，窗口失焦后 DWM
//! 会自动把材质退化为实色背景（微软文档明确说明，Windows 自己的开始菜单/
//! 通知中心同理）。失焦时的观感由前端配合：面板组件会在失焦时把底色加深
//! 一档，让"实色面板"看起来是刻意设计而非效果丢失。
//!
//! 不用 transparent + SWCA（SetWindowCompositionAttribute）的原因：
//! transparent: true 会把窗口变成 WS_EX_LAYERED 分层窗口，而 Win11
//! build 22523+ 上 DWM 系统背景在分层窗口上整体渲染为黑色矩形，SWCA
//! 亚克力也已失效——"圆角面板后有一层黑色方形"就是这条路径的产物。
//! 这里改在不透明窗口上用官方属性。
use std::ffi::c_void;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMSBT_NONE, DWMSBT_TRANSIENTWINDOW, DWMWA_SYSTEMBACKDROP_TYPE,
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
};

/// 给窗口应用背景亚克力（Win11 build 22621+，仅支持不透明窗口）。
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
