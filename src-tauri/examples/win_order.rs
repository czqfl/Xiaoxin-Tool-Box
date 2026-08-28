//! 窗口 Z 序/遮挡诊断探针（诊断用，不进发布路径）：
//! cargo run --example win_order -- [0xhwnd|x,y]
//!
//! 截图智能选区用 EnumWindows 拍 Z 序快照、candidate_at 取"第一个包含光标的窗口"。
//! 该逻辑只有在快照为【真实视觉 Z 序】时才正确处理遮挡。本探针：
//! 1. 按 EnumWindows 顺序列出可见顶层窗口（= 现快照顺序）
//! 2. 按 GetWindow(GW_HWNDFIRST/GW_HWNDNEXT) 链列出（可靠 Z 序）
//! 3. 对光标（或指定点）分别给出两种顺序下"第一个包含该点的窗口"，
//!    与真正的 WindowFromPoint 结果对比，判断遮挡判定是否失真。

use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetAncestor, GetCursorPos, GetTopWindow, GetWindow, GetWindowRect,
    GetWindowTextW, IsIconic, IsWindowVisible, WindowFromPoint, GA_ROOT, GW_HWNDNEXT,
};

struct Ctx { out: Vec<(isize, String, RECT)> }

fn title_of(h: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetWindowTextW(h, &mut buf) };
    let s = String::from_utf16_lossy(&buf[..n as usize]);
    s.chars().take(40).collect()
}
fn frame_of(h: HWND) -> RECT {
    let mut r: RECT = RECT::default();
    unsafe {
        if DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut r as *mut _ as *mut _, std::mem::size_of::<u32>() as u32).is_err() {
            let _ = GetWindowRect(h, &mut r);
        }
    }
    r
}
fn fmt(r: &RECT) -> String {
    format!("{}x{}@{},{}", r.right - r.left, r.bottom - r.top, r.left, r.top)
}
fn cloaked(h: HWND) -> bool {
    let mut c: u32 = 0;
    unsafe { DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut c as *mut _ as *mut _, 4).is_ok() && c != 0 }
}

unsafe extern "system" fn cb(hwnd: HWND, lp: LPARAM) -> windows::core::BOOL {
    let ctx = &mut *(lp.0 as *mut Ctx);
    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return windows::core::BOOL(1);
    }
    let root = GetAncestor(hwnd, GA_ROOT);
    if cloaked(root) { return windows::core::BOOL(1); }
    let r = frame_of(root);
    if r.right - r.left >= 16 && r.bottom - r.top >= 16 {
        if !ctx.out.iter().any(|(h, _, _)| *h == root.0 as isize) {
            ctx.out.push((root.0 as isize, title_of(root), r));
        }
    }
    windows::core::BOOL(1)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    // EnumWindows 顺序（现快照顺序）
    let mut ctx = Ctx { out: Vec::new() };
    unsafe { let _ = EnumWindows(Some(cb), LPARAM(&mut ctx as *mut Ctx as isize)); };
    println!("== EnumWindows 顺序（现快照） top→bottom ==");
    for (i, (h, t, r)) in ctx.out.iter().enumerate() {
        println!("  [{i:>2}] {h:#x} {:>12} {t:?}", fmt(r));
    }

    // GetWindow Z 序链（可靠顺序）
    println!("\n== GetWindow Z 序链 top→bottom ==");
    let mut zw: Vec<(isize, String, RECT)> = Vec::new();
    unsafe {
        let mut cur: Option<HWND> = GetTopWindow(None).ok();
        let mut n = 0;
        while let Some(hh) = cur {
            if hh.0 as isize == 0 || n >= 300 { break; }
            n += 1;
            if IsWindowVisible(hh).as_bool() && !IsIconic(hh).as_bool() {
                let root = GetAncestor(hh, GA_ROOT);
                if !cloaked(root) {
                    let r = frame_of(root);
                    if r.right - r.left >= 16 && r.bottom - r.top >= 16
                        && !zw.iter().any(|(x, _, _)| *x == root.0 as isize) {
                        zw.push((root.0 as isize, title_of(root), r));
                    }
                }
            }
            cur = GetWindow(hh, GW_HWNDNEXT).ok();
        }
    }
    for (i, (h, t, r)) in zw.iter().enumerate() {
        println!("  [{i:>2}] {h:#x} {:>12} {t:?}", fmt(r));
    }

    // 顺序是否一致
    let order_same = ctx.out.iter().map(|(h, _, _)| *h).collect::<Vec<_>>()
        == zw.iter().map(|(h, _, _)| *h).collect::<Vec<_>>();
    println!("\n两种顺序一致: {order_same}");

    // 目标点
    let pt = if let Some(a) = args.get(0) {
        if let Some((x, y)) = a.split_once(',') {
            POINT { x: x.trim().parse().unwrap_or(0), y: y.trim().parse().unwrap_or(0) }
        } else {
            let mut p = POINT::default();
            unsafe { GetCursorPos(&mut p).ok(); }
            p
        }
    } else {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p).ok(); }
        p
    };
    println!("\n目标点 ({},{})", pt.x, pt.y);

    let contains = |r: &RECT| pt.x >= r.left && pt.x < r.right && pt.y >= r.top && pt.y < r.bottom;
    let ew = ctx.out.iter().find(|(_, _, r)| contains(r));
    let gw = zw.iter().find(|(_, _, r)| contains(r));
    let wfp = unsafe { WindowFromPoint(pt) };
    let wfp_root = if wfp.0 as isize != 0 { unsafe { GetAncestor(wfp, GA_ROOT) } } else { HWND::default() };
    println!("EnumWindows 第一个含点窗: {:?}", ew.map(|(h, t, r)| format!("{h:#x} {} {t:?}", fmt(r))));
    println!("GetWindow   第一个含点窗: {:?}", gw.map(|(h, t, r)| format!("{h:#x} {} {t:?}", fmt(r))));
    println!("WindowFromPoint 真实顶层: {:#x} {:?}", wfp_root.0 as isize,
        if wfp_root.0 as isize != 0 { title_of(wfp_root) } else { String::new() });
}
