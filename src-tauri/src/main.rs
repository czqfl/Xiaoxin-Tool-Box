#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Windows 入口自提权：检测到非管理员权限时自动弹 UAC（runas 拉起自身 + --elevated 防递归），
// 使工具箱与可能以管理员运行的程序（如 WorkBuddy）同级，解除 UIPI 对跨权限
// 截图/取词/置前等操作的拦截。已提权 / 用户取消 UAC → 本进程正常继续。
//
// 【dev 与 release 的差异只在原进程的收场方式，提权本身任何情况都执行】
// · release：拉起提权实例后本进程立即 exit(0)——不占内存，无生命周期牵连。
//   elevate_if_needed 先于 run() 执行，原进程未及注册单实例锁即退出，
//   提权实例不存在被单实例判误杀的竞态窗口。
// · dev：原进程【不能】退出——tauri dev 把 vite 的生命周期绑在它拉起的
//   子进程上，子进程一退 vite 被杀，提权实例的前端随之"无法访问"。
//   改为存根等待：SEE_MASK_NOCLOSEPROCESS 拿到提权实例进程句柄后，
//   本进程不调用 run()（不持单实例锁、不建托盘/热键），阻塞等待提权实例
//   退出——vite 全程存活，提权实例正常加载前端；提权实例退出后存根随之
//   退出，tauri dev 会话完整收场。Ctrl+C 停 dev 只杀存根，提权实例不受影响。
#[cfg(windows)]
fn elevate_if_needed() {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    // 已带 --elevated 进入：说明已由 runas 重新拉起，绝不再提（防递归/死循环）
    if std::env::args().any(|a| a == "--elevated") {
        // dev 构建是控制台子系统（windows_subsystem 仅 release 生效），runas
        // 拉起时系统会给它新建一个黑色控制台窗——立即隐藏（ShellExecuteExW
        // 侧已用 SW_HIDE 预防，此处兜底；release 无控制台，调用为空操作）
        #[cfg(debug_assertions)]
        unsafe {
            use windows::Win32::System::Console::GetConsoleWindow;
            use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};
            let console = GetConsoleWindow();
            if !console.is_invalid() {
                let _ = ShowWindow(console, SW_HIDE);
            }
        }
        return;
    }
    // 逃生口：XIAOXIN_NO_ELEVATE=1 跳过自动提权（普通权限调试 / 特殊场景）
    if std::env::var_os("XIAOXIN_NO_ELEVATE").is_some() {
        return;
    }
    // 已提权（含管理员终端/dev 拉起）→ 无需动作
    let elevated = unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            false
        } else {
            let mut elev = TOKEN_ELEVATION { TokenIsElevated: 0 };
            let mut len: u32 = 0;
            let ok = GetTokenInformation(
                token,
                TokenElevation,
                Some(&mut elev as *mut TOKEN_ELEVATION as *mut core::ffi::c_void),
                std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                &mut len,
            );
            let _ = windows::Win32::Foundation::CloseHandle(token);
            ok.is_ok() && elev.TokenIsElevated != 0
        }
    };
    if elevated {
        return;
    }
    // dev 构建：同样提权，但原进程作为存根等待提权实例（见模块注释）。
    // 存根不 run()——无托盘/热键/单实例锁，纯粹为了保住 tauri dev 的 vite
    #[cfg(debug_assertions)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::System::Threading::{WaitForSingleObject, INFINITE};
        use windows::Win32::UI::Shell::{
            ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
        };
        use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;
        let Ok(exe) = std::env::current_exe() else { return };
        let dir = exe
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let exe_w: Vec<u16> = exe.as_os_str().encode_wide().chain(Some(0)).collect();
        let op_w: Vec<u16> = "runas".encode_utf16().chain(Some(0)).collect();
        let pa_w: Vec<u16> = "--elevated".encode_utf16().chain(Some(0)).collect();
        let dir_w: Vec<u16> = dir.encode_utf16().chain(Some(0)).collect();
        let mut sei = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            lpVerb: PCWSTR(op_w.as_ptr()),
            lpFile: PCWSTR(exe_w.as_ptr()),
            lpParameters: PCWSTR(pa_w.as_ptr()),
            lpDirectory: PCWSTR(dir_w.as_ptr()),
            // SW_HIDE：dev 构建是控制台子系统，runas 拉起时按此值创建控制台
            // ——窗口从一开始就不出现（应用自身窗口都是显式 show，不受影响）
            nShow: SW_HIDE.0,
            ..Default::default()
        };
        unsafe {
            // ShellExecuteExW 在 UAC 弹窗期间阻塞，用户确认后返回并给出进程句柄
            if ShellExecuteExW(&mut sei).is_ok() && !sei.hProcess.is_invalid() {
                let _ = WaitForSingleObject(sei.hProcess, INFINITE);
                let _ = windows::Win32::Foundation::CloseHandle(sei.hProcess);
                std::process::exit(0);
            }
        }
        // 用户取消 UAC 等：普通权限继续运行，功能受限但可用
        return;
    }
    // release：拉起提权实例后立即退出
    #[cfg(not(debug_assertions))]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        let Ok(exe) = std::env::current_exe() else { return };
        let dir = exe
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let exe_w: Vec<u16> = exe.as_os_str().encode_wide().chain(Some(0)).collect();
        let op_w: Vec<u16> = "runas".encode_utf16().chain(Some(0)).collect();
        let pa_w: Vec<u16> = "--elevated".encode_utf16().chain(Some(0)).collect();
        let dir_w: Vec<u16> = dir.encode_utf16().chain(Some(0)).collect();
        unsafe {
            let ret = ShellExecuteW(
                None,
                PCWSTR(op_w.as_ptr()),
                PCWSTR(exe_w.as_ptr()),
                PCWSTR(pa_w.as_ptr()),
                PCWSTR(dir_w.as_ptr()),
                SW_SHOWNORMAL,
            );
            if ret.0 as isize > 32 {
                // 提权实例已拉起：立即退出当前普通实例。
                // 【无锁竞态】elevate_if_needed 在 run() 之前执行，本进程从未
                // 注册单实例锁，提权实例初始化时不存在"锁被将死进程占用"
                // 的窗口期；若确有更早的旧实例在运行，提权实例被单实例
                // 判重退出、旧实例保留——符合单实例语义
                std::process::exit(0);
            }
            // 失败（用户取消 UAC 等）：以普通权限继续运行，功能受限但可用
        }
    }
}

fn main() {
    #[cfg(windows)]
    elevate_if_needed();
    xiaoxin_toolbox_lib::run();
}
