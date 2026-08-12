//! 端口工具：查询占用指定端口的进程（netstat -ano 解析），一键结束进程。
//! 开发时"端口被占用"高频问题，不用再开 cmd 敲 netstat + taskkill。
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct PortProcess {
    pub pid: u32,
    /// 进程名（如 node.exe、Code.exe）；取不到时回退 "PID <pid>"
    pub name: String,
    /// 监听状态（LISTENING / ESTABLISHED / TIME_WAIT / UDP 为空）
    pub state: String,
    /// 协议（TCP / TCP6 / UDP / UDP6）
    pub proto: String,
    /// 是否系统关键进程（受保护，拒绝结束）——前端据此不展示终止按钮
    pub protected: bool,
}

/// 查询占用指定端口的进程列表（按 PID 去重）。
/// 执行 `netstat -ano` 解析：本地地址 `host:port` 匹配端口，最后一列是 PID。
#[tauri::command]
pub fn port_query(port: u16) -> Result<Vec<PortProcess>, String> {
    if port == 0 {
        return Err("请输入 1-65535 之间的端口号".into());
    }
    let out = Command::new("netstat")
        .args(["-ano"])
        .output()
        .map_err(|e| format!("netstat 执行失败：{e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut result: Vec<PortProcess> = Vec::new();
    for line in text.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with("Proto") || t.starts_with("活动") || t.starts_with("Active") {
            continue;
        }
        let parts: Vec<&str> = t.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        let proto = parts[0].to_uppercase();
        if !(proto == "TCP" || proto == "TCP6" || proto == "UDP" || proto == "UDP6") {
            continue;
        }
        // 本地地址：形如 0.0.0.0:8080 / [::]:8080 / 127.0.0.1:3000
        let local = parts[1];
        let Some(colon) = local.rfind(':') else {
            continue;
        };
        let Ok(p): Result<u16, _> = local[colon + 1..].trim_end_matches(']').parse() else {
            continue;
        };
        if p != port {
            continue;
        }
        // PID = 最后一列
        let Ok(pid): Result<u32, _> = parts.last().unwrap().parse() else {
            continue;
        };
        if pid == 0 || result.iter().any(|r| r.pid == pid) {
            continue;
        }
        let state = if proto.starts_with("TCP") {
            parts.get(3).map(|s| s.to_string()).unwrap_or_default()
        } else {
            String::new()
        };
        let name = process_name(pid);
        result.push(PortProcess {
            pid,
            protected: SYSTEM_PROTECTED.contains(&name.to_lowercase().as_str()),
            name,
            state,
            proto,
        });
    }
    Ok(result)
}

/// 结束指定 PID 的进程（TerminateProcess）。权限不足（如目标是管理员进程）时返回错误。
/// 安全控制：系统关键进程（services/lsass/svchost 等）一律拒绝结束，防止
/// 误杀影响系统功能/安全。
#[tauri::command]
pub fn port_kill(pid: u32) -> Result<(), String> {
    // 先查进程名做保护判定（普通权限即可查询映像名）
    let name = process_name(pid).to_lowercase();
    if SYSTEM_PROTECTED.contains(&name.as_str()) {
        return Err(format!(
            "「{name}」是系统关键进程，为安全起见已拒绝结束"
        ));
    }
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::Threading::{
            OpenProcess, TerminateProcess, PROCESS_TERMINATE,
        };
        let handle = OpenProcess(PROCESS_TERMINATE, false, pid)
            .map_err(|_| format!("无法打开进程 PID {pid}（可能权限不足，请以管理员运行本工具）"))?;
        TerminateProcess(handle, 1)
            .map_err(|_| format!("结束进程 PID {pid} 失败（可能权限不足）"))?;
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        return Err("当前平台不支持".into());
    }
    Ok(())
}

/// 系统关键进程名（小写）：结束它们会中断系统服务/安全/桌面等功能。
/// 注意 svchost.exe 是大量服务（含远程桌面等）的宿主进程，一并保护。
const SYSTEM_PROTECTED: &[&str] = &[
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "lsm.exe",
    "svchost.exe",
    "dwm.exe",
    "fontdrvhost.exe",
    "sihost.exe",
    "taskhostw.exe",
    "explorer.exe",
    "spoolsv.exe",
    "msmpeng.exe",
    "wininit.exe",
    "conhost.exe",
];

/// 根据 PID 取进程名（进程映像文件名）；失败回退 "PID <pid>"
#[cfg(windows)]
fn process_name(pid: u32) -> String {
    use windows::core::PWSTR;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = [0u16; 512];
            let mut size = buf.len() as u32;
            let name = PWSTR(buf.as_mut_ptr());
            if QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), name, &mut size).is_ok()
            {
                let wide = String::from_utf16_lossy(&buf[..size as usize]);
                return std::path::Path::new(&wide)
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or(wide);
            }
        }
    }
    format!("PID {pid}")
}

#[cfg(not(windows))]
fn process_name(pid: u32) -> String {
    format!("PID {pid}")
}
