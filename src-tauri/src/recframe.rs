//! 录制区域边框环：纯 Win32 分层窗口，UpdateLayeredWindow 直绘 ARGB 位图。
//!
//! 此前多轮尝试在选区窗（透明 WebView2）里用 CSS 画边框都不生效——录制开始后
//! 选区窗被收掉/穿透/排除采集后内容干脆不渲染。这里彻底绕开 webview：
//! - CreateWindowExW 建一个无标题弹窗 + WS_EX_LAYERED，ULW 把预渲染的
//!   ARGB 位图直接交给 DWM 合成——窗口一经创建立即显示，不依赖任何
//!   前端渲染、不需要消息循环（没有 WM_PAINT 往返）；
//! - 边框为【密集虚线】（6px 实 / 4px 空）+ 四角实线 L 形角标，
//!   录制中红色、暂停时琥珀色（set_paused 重绘）；
//! - WS_EX_TRANSPARENT：鼠标全穿透，录制区域照常操作；
//! - WS_EX_NOACTIVATE / TOOLWINDOW：不抢焦点、不上任务栏；
//! - WDA_EXCLUDEFROMCAPTURE：边框本身绝不进视频；
//! - 线程约束：创建与销毁必须在同一线程（录制线程 run() 里由 Drop 保证）。

#![cfg(windows)]

use std::sync::Once;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, POINT, SIZE, WPARAM};
use windows::Win32::Graphics::Gdi::{
    AC_SRC_ALPHA, AC_SRC_OVER, BLENDFUNCTION, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, ShowWindow, UpdateLayeredWindow,
    ULW_ALPHA, WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    WS_EX_TRANSPARENT, WS_POPUP, SW_SHOWNOACTIVATE,
};

/// 边框厚度（物理像素）
const BORDER: i32 = 3;
/// 四角实线角标边长
const CORNER: i32 = 14;
/// 虚线节距：6px 实 / 4px 空（密集）
const DASH_ON: i32 = 6;
const DASH_PERIOD: i32 = 10;
/// 录制中（红）/ 暂停（琥珀）
const RED: (u8, u8, u8) = (232, 76, 84);
const AMBER: (u8, u8, u8) = (240, 173, 62);

static REGISTER: Once = Once::new();

unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    DefWindowProcW(hwnd, msg, wp, lp)
}

pub struct RecFrame {
    hwnd: HWND,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

impl RecFrame {
    /// 在录制区域（全局物理像素坐标）四周显示虚线边框环。
    /// 失败静默返回 None——只是视觉指示，不阻断录制。
    pub fn show(x: i32, y: i32, w: i32, h: i32) -> Option<RecFrame> {
        unsafe { show_impl(x, y, w, h) }
    }

    /// 暂停/恢复时切换边框颜色（红 ↔ 琥珀），重绘同一窗口
    pub fn set_paused(&self, paused: bool) {
        unsafe {
            let color = if paused { AMBER } else { RED };
            let _ = render(self.hwnd, self.x, self.y, self.w, self.h, color);
        }
    }
}

impl Drop for RecFrame {
    fn drop(&mut self) {
        unsafe { let _ = DestroyWindow(self.hwnd); }
    }
}

unsafe fn show_impl(x: i32, y: i32, w: i32, h: i32) -> Option<RecFrame> {
    if w < 4 || h < 4 {
        return None;
    }
    let class_name: PCWSTR = w!("XiaoXinRecFrame");
    REGISTER.call_once(|| {
        let inst = GetModuleHandleW(None)
            .ok()
            .map(|m| HINSTANCE(m.0))
            .unwrap_or_default();
        let wc = WNDCLASSW {
            lpfnWndProc: Some(proc),
            hInstance: inst,
            lpszClassName: class_name,
            ..Default::default()
        };
        // 注册失败（已被注册）不影响后续 CreateWindow
        let _ = RegisterClassW(&wc);
    });

    // 环绕选区外扩 BORDER：窗口尺寸
    let bw = w + BORDER * 2;
    let bh = h + BORDER * 2;
    let hwnd = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
        class_name,
        w!(""),
        WS_POPUP,
        x - BORDER,
        y - BORDER,
        bw,
        bh,
        None,
        None,
        None,
        None,
    )
    .ok()?;

    let frame = RecFrame { hwnd, x, y, w, h };
    if !render(hwnd, x, y, w, h, RED) {
        let _ = DestroyWindow(hwnd);
        return None;
    }
    // 不入镜（录制画面只含区域内容，不含此边框）
    let _ = crate::acrylic::exclude_from_capture(hwnd);
    let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    Some(frame)
}

/// 预渲染 ARGB 位图（透明底 + 密集虚线边框 + 四角实线角标）并 ULW 上屏。
/// 返回是否成功；失败时调用方负责善后。
unsafe fn render(hwnd: HWND, x: i32, y: i32, w: i32, h: i32, color: (u8, u8, u8)) -> bool {
    let bw = w + BORDER * 2;
    let bh = h + BORDER * 2;
    let hdc = CreateCompatibleDC(None);
    let bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: bw,
            biHeight: -bh, // 负值 = 自顶向下
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
    let Ok(hbmp) = CreateDIBSection(Some(hdc), &bmi, DIB_RGB_COLORS, &mut bits, None, 0) else {
        let _ = DeleteDC(hdc);
        return false;
    };
    if bits.is_null() {
        let _ = DeleteObject(HGDIOBJ(hbmp.0));
        let _ = DeleteDC(hdc);
        return false;
    }
    let px = std::slice::from_raw_parts_mut(bits as *mut u32, (bw * bh) as usize);
    // alpha=255 时预乘值即原色，直接打包写
    let mut put = |i: i32, j: i32, (r, g, b): (u8, u8, u8)| {
        px[j as usize * bw as usize + i as usize] =
            0xFF00_0000u32 | ((b as u32) << 16) | ((g as u32) << 8) | (r as u32);
    };

    // 虚线相位：沿边方向取模
    let dash_on = |c: i32| -> bool { c.rem_euclid(DASH_PERIOD) < DASH_ON };
    for j in 0..bh {
        for i in 0..bw {
            let dist = i.min(j).min(bw - 1 - i).min(bh - 1 - j);
            if dist >= BORDER {
                continue; // 透明
            }
            let top = j < BORDER;
            let bot = j >= bh - BORDER;
            let left = i < BORDER;
            let right = i >= bw - BORDER;
            // 边方向判定：横边沿 i 走虚线，竖边沿 j 走虚线；角标区恒实线
            let near_corner_x = i < CORNER || i >= bw - CORNER;
            let near_corner_y = j < CORNER || j >= bh - CORNER;
            let mut on = false;
            if top || bot {
                on = near_corner_x || dash_on(i);
            }
            if left || right {
                on = on || near_corner_y || dash_on(j);
            }
            if on {
                put(i, j, color);
            }
        }
    }
    let _ = windows::Win32::Graphics::Gdi::SelectObject(hdc, HGDIOBJ(hbmp.0));
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };
    let pt_dst = POINT { x: x - BORDER, y: y - BORDER };
    let size = SIZE { cx: bw, cy: bh };
    let pt_src = POINT { x: 0, y: 0 };
    let ok = UpdateLayeredWindow(
        hwnd,
        None,
        Some(&pt_dst),
        Some(&size),
        Some(hdc),
        Some(&pt_src),
        COLORREF(0),
        Some(&blend),
        ULW_ALPHA,
    )
    .is_ok();
    let _ = DeleteObject(HGDIOBJ(hbmp.0));
    let _ = DeleteDC(hdc);
    ok
}
