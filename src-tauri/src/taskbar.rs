//! 任务栏透明：对系统任务栏窗口（Shell_TrayWnd / 副屏 Shell_SecondaryTrayWnd）
//! 应用 SetWindowCompositionAttribute 的 ACCENT 策略，实现自定义背景透明度与
//! 亚克力毛玻璃——与面板亚克力（acrylic.rs）同一未公开 API 通道，由该模块
//! 提供通用的 apply_accent。
//!
//! 模式映射（与用户可感知效果对应）：
//! - 不透明度 0% + 非亚克力 → TRANSPARENTGRADIENT 且 alpha=0：任务栏完全透明，
//!   只剩图标与文字浮在壁纸上（类似 TranslucentTB 的 Clear）。
//! - 不透明度 N% + 非亚克力 → TRANSPARENTGRADIENT，gradient_color alpha=N/100*255，
//!   色调纯黑（ABGR 低三字节为 0）——alpha 越高越接近原版深色任务栏。
//! - 【亚克力暂未实现】cfg.acrylic 当前被忽略：任务栏窗口上 ACCENT 4
//!   （ACRYLICBLURBEHIND）失能时 DWM 回落紫色兜底色（"不透明度 0% 任务栏
//!   变紫"的根因）。TranslucentTB 的任务栏亚克力走 XAML 材质注入等另一套
//!   机制，后续版本再接。
//!
//! 生效时机：config_save 钩子（开关/滑杆即时反馈）+ 守护线程兜底。explorer.exe
//! 重启后任务栏窗口句柄变化、Win11 在打开开始菜单/通知中心等操作后会把系统
//! 自带材质刷回来——所以启用期间守护线程【无条件】每 2s 重施（不靠变化检测，
//! 重设同值开销可忽略）；停用状态仅清一次，不空转。
use std::time::Duration;

use crate::config::{ConfigState, TaskbarConfig};
use tauri::Manager;
use windows::core::w;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, FindWindowW};

// ACCENT_STATE（未公开，TranslucentTB 同源）：
// 0=DISABLED / 1=GRADIENT / 2=TRANSPARENTGRADIENT(纯透明) /
// 3=BLURBEHIND(实时模糊) / 4=ACRYLICBLURBEHIND(亚克力)。
// 【勿混淆】4 是亚克力不是纯透明——曾在任务栏上把透明错用 4，
// 而任务栏上 ACCENT 4 失能时 DWM 回落紫色兜底色（"0% 不透明度
// 任务栏变紫"的根因），TranslucentTB 的任务栏亚克力是另一套机制
const ACCENT_DISABLED: u32 = 0;
const ACCENT_ENABLE_TRANSPARENTGRADIENT: u32 = 2;

/// 枚举全部任务栏窗口：主屏 Shell_TrayWnd + 各副屏 Shell_SecondaryTrayWnd。
fn taskbar_windows() -> Vec<HWND> {
    let mut out = Vec::new();
    unsafe {
        if let Ok(h) = FindWindowW(w!("Shell_TrayWnd"), None) {
            if !h.is_invalid() {
                out.push(h);
            }
        }
        // 副屏任务栏：FindWindowExW 链式枚举同类窗口
        let mut prev = HWND::default();
        loop {
            let Ok(h) = FindWindowExW(None, Some(prev), w!("Shell_SecondaryTrayWnd"), None) else {
                break;
            };
            if h.is_invalid() || h == prev {
                break;
            }
            out.push(h);
            prev = h;
        }
    }
    out
}

/// 主任务栏窗口句柄（守护线程签名的"explorer 是否重启"探针）
fn primary_taskbar_hwnd() -> Option<HWND> {
    unsafe {
        match FindWindowW(w!("Shell_TrayWnd"), None) {
            Ok(h) if !h.is_invalid() => Some(h),
            _ => None,
        }
    }
}

/// 按配置对全部任务栏窗口应用/清除 ACCENT 策略。
/// 幂等：同一配置重复调用只会重复设置同样的值，无副作用。
pub fn apply(cfg: &TaskbarConfig) {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_SYSTEMBACKDROP_TYPE};
    // DWMSBT：0=AUTO(系统默认) / 1=NONE(关闭系统 backdrop)
    const DWMSBT_AUTO: i32 = 0;
    const DWMSBT_NONE: i32 = 1;

    // 【临时：只做完全透明（用户明确要求先保证 Clear 稳定）】
    // 不透明度/亚克力均暂忽略；恢复读配置时替换回 alpha=不透明度
    let _ = (&cfg.opacity, &cfg.acrylic);
    for hwnd in taskbar_windows() {
        if !cfg.enabled {
            crate::acrylic::apply_accent(hwnd, ACCENT_DISABLED, 0, 0);
            // 恢复系统默认 backdrop
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd, DWMWA_SYSTEMBACKDROP_TYPE,
                    &DWMSBT_AUTO as *const i32 as *const std::ffi::c_void, 4,
                );
            }
            continue;
        }
        // 1) 显式关闭任务栏的系统 backdrop：Win11 XAML 任务栏自绘 backdrop
        //    会压在 SWCA 渐变上形成有色层（"完全透明却仍有色块"的来源之一）
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd, DWMWA_SYSTEMBACKDROP_TYPE,
                &DWMSBT_NONE as *const i32 as *const std::ffi::c_void, 4,
            );
        }
        // 2) SWCA 纯透明：TRANSPARENTGRADIENT + alpha=0 + flags=2（TranslucentTB
        //    非亚克力模式固定 flags=2；flags=0 时任务栏渐变色会被忽略）
        crate::acrylic::apply_accent(hwnd, ACCENT_ENABLE_TRANSPARENTGRADIENT, 2, 0);
    }
}

/// 启动守护线程：每 2s 重施任务栏样式。
/// 【启用期间无条件重施】Win11 打开开始菜单/通知中心/切换主题等操作后，
/// explorer 会把系统自带任务栏材质刷回来——此时配置与句柄都没变，变化检测
/// 完全挡不住，表现为"自定义样式开一会儿就被系统盖回去"。周期性重涂同值
/// SWCA 开销可忽略（几次内存写 + DWM 属性设置），视觉无闪烁。
/// 停用状态仅清一次（含 explorer 重启换句柄后的补清），不空转。
pub fn start_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        // 上次签名：(enabled, opacity, acrylic, 主任务栏句柄原始值；无任务栏记 0)
        let mut last_sig: Option<(bool, u32, bool, isize)> = None;
        loop {
            std::thread::sleep(Duration::from_millis(2000));
            let Some(cfg) = app.try_state::<ConfigState>().map(|s| s.0.lock().unwrap().taskbar.clone()) else {
                continue;
            };
            let sig = (
                cfg.enabled,
                cfg.opacity,
                cfg.acrylic,
                primary_taskbar_hwnd().map(|h| h.0 as isize).unwrap_or(0),
            );
            if cfg.enabled || last_sig.as_ref() != Some(&sig) {
                apply(&cfg);
            }
            last_sig = Some(sig);
        }
    });
}
