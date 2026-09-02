#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Windows 入口自提权：检测到非管理员权限时自动弹 UAC（runas 拉起自身 + --elevated 防递归），
// 使工具箱与可能以管理员运行的程序（如 WorkBuddy）同级，解除 UIPI 对跨权限
// 截图/取词/置前等操作的拦截。已提权 / 用户取消 UAC → 本进程正常继续。
//
// dev 豁免：由 tauri dev / cargo run 拉起的开发进程（父进程链含 cargo.exe 或
// tauri.exe）跳过自动提权——否则 runas 提权重启后原进程 exit(0)，tauri dev
// 会误判应用退出而中断热更新工作流。开发时如需提权能力（如 WorkBuddy 内
// 快捷键验证），请用管理员终端跑 dev；直接双击 / 自启的 exe 照常自动提权。
#[cfg(windows)]
fn is_dev_spawn() -> bool {
    use std::collections::HashMap;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Threading::GetCurrentProcessId;

    unsafe {
        let snap = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(h) => h,
            Err(_) => return false,
        };
        // 第一遍收集：pid -> (parent_pid, exe 名小写)
        let mut map: HashMap<u32, (u32, String)> = HashMap::new();
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut has = Process32FirstW(snap, &mut entry).is_ok();
        while has {
            let n = entry
                .szExeFile
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..n]).to_lowercase();
            map.insert(entry.th32ProcessID, (entry.th32ParentProcessID, name));
            has = Process32NextW(snap, &mut entry).is_ok();
        }
        let _ = CloseHandle(snap);

        // 沿父链上溯（最多 6 层），命中 cargo/tauri 即视为 dev 拉起
        let mut cur = GetCurrentProcessId();
        for _ in 0..6 {
            match map.get(&cur) {
                Some((ppid, name)) => {
                    if name == "cargo.exe" || name == "tauri.exe" {
                        return true;
                    }
                    cur = *ppid;
                }
                None => break,
            }
        }
        false
    }
}

#[cfg(windows)]
fn elevate_if_needed() {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    // 已带 --elevated 进入：说明已由 runas 重新拉起，绝不再提（防递归/死循环）
    if std::env::args().any(|a| a == "--elevated") {
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
    // dev 豁免：tauri dev / cargo run 拉起的开发进程不提权，保 dev 热更新不断链
    if is_dev_spawn() {
        return;
    }
    // 普通权限（非 dev 拉起）：runas 提权重启自身，本进程退出（释放单实例，避免与提权实例并存）
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
            // 提权实例已拉起：立即退出当前普通实例
            std::process::exit(0);
        }
        // 失败（用户取消 UAC 等）：以普通权限继续运行，功能受限但可用
    }
}

fn main() {
    #[cfg(windows)]
    elevate_if_needed();
    xiaoxin_toolbox_lib::run();
}
