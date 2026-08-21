//! 端口工具：查询占用指定端口的进程（Windows IP Helper API，无需启动 netstat 子进程，
//! 避免杀毒软件对安装版应用拉起的子进程做实时扫描导致查询卡顿），一键结束进程。
//! 开发时"端口被占用"高频问题，不用再开 cmd 敲 netstat + taskkill。
use serde::Serialize;
use std::collections::HashSet;

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
    /// 该进程占用的端口（按端口查询时为查询端口；按名称搜索时为该行实际端口）。
    /// 同一进程可能占用多个端口，按名称搜索时逐行返回。
    pub port: Option<u16>,
    /// 进程完整映像路径（可执行文件全路径），如 C:\Program Files\nodejs\node.exe
    pub path: String,
    /// 进程命令行（best-effort）：含启动参数与项目路径，用于反查“启动项目”。
    /// 例如 node 进程命令行含 `C:\proj\hussar-front\node_modules\vite\bin\vite.js`，
    /// 据此即可看出该端口由哪个前端项目占用。
    pub cmdline: String,
}

/// 原始连接行（解析自 IP Helper 表）
struct RawConn {
    pid: u32,
    port: u16,
    proto: &'static str,
    state: String,
}

#[cfg(windows)]
fn list_all_ports() -> Vec<RawConn> {
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, GetExtendedUdpTable, TCP_TABLE_CLASS, UDP_TABLE_CLASS,
    };

    // AF_INET=2 / AF_INET6=23（用字面量避免额外 WinSock feature 依赖）
    const AF_INET: u32 = 2;
    const AF_INET6: u32 = 23;

    fn tcp_state(s: u32) -> String {
        let name = match s {
            1 => "CLOSED",
            2 => "LISTENING",
            3 => "SYN_SENT",
            4 => "SYN_RCVD",
            5 => "ESTABLISHED",
            6 => "FIN_WAIT1",
            7 => "FIN_WAIT2",
            8 => "TIME_WAIT",
            9 => "CLOSE_WAIT",
            10 => "LAST_ACK",
            11 => "CLOSING",
            12 => "DELETE_TCB",
            _ => "",
        };
        name.to_string()
    }

    // 先以 null 缓冲探测所需大小，再分配后真正拉取。第一次调用无论返回 NO_ERROR(0)
    // 还是 ERROR_INSUFFICIENT_BUFFER(111)，都会把所需字节数写入 size。
    fn get_table(af: u32, tcp: bool) -> Option<Vec<u8>> {
        use std::ffi::c_void;
        let mut size: u32 = 0;
        // TCP_TABLE_OWNER_PID_ALL=5 / UDP_TABLE_OWNER_PID=1（windows-rs 将该枚举建模为 newtype，
        // 直接按值构造以避开关联常量命名差异）；两分支类型不同，各自内联传入。
        let _ = if tcp {
            unsafe { GetExtendedTcpTable(None, &mut size, true.into(), af, TCP_TABLE_CLASS(5), 0) }
        } else {
            unsafe { GetExtendedUdpTable(None, &mut size, true.into(), af, UDP_TABLE_CLASS(1), 0) }
        };
        if size == 0 {
            return Some(Vec::new());
        }
        let mut buf = vec![0u8; size as usize];
        let res = if tcp {
            unsafe {
                GetExtendedTcpTable(
                    Some(buf.as_mut_ptr() as *mut c_void),
                    &mut size,
                    true.into(),
                    af,
                    TCP_TABLE_CLASS(5),
                    0,
                )
            }
        } else {
            unsafe {
                GetExtendedUdpTable(
                    Some(buf.as_mut_ptr() as *mut c_void),
                    &mut size,
                    true.into(),
                    af,
                    UDP_TABLE_CLASS(1),
                    0,
                )
            }
        };
        // 返回值为 WIN32 错误码，0 (NO_ERROR) 表示成功
        if res != 0 {
            return None;
        }
        Some(buf)
    }

    fn rd_u32(b: &[u8], o: usize) -> u32 {
        u32::from_ne_bytes(b[o..o + 4].try_into().unwrap())
    }
    // 端口字段为网络字节序（大端），需翻转还原成主机序数字
    fn port_of(v: u32) -> u16 {
        u16::from_be(v as u16)
    }

    // 解析 MIB_*TABLE_OWNER_PID；行布局（DWORD=4字节）：
    //  TCP4: [state,addr,port,raddr,rport,pid] = 24B
    //  UDP4: [addr,port,pid] = 12B
    //  TCP6: [addr16,port,raddr16,rport,state,pid] = 48B
    //  UDP6: [addr16,port,pid] = 24B
    fn parse(buf: &[u8], proto: &'static str, ipv6: bool) -> Vec<RawConn> {
        if buf.len() < 4 {
            return vec![];
        }
        let num = rd_u32(buf, 0) as usize;
        let row = match (ipv6, proto) {
            (false, "TCP") => 24,
            (false, _) => 12,
            (true, "TCP6") => 48,
            (true, _) => 24,
        };
        let mut out = Vec::with_capacity(num.min((buf.len().saturating_sub(4)) / row + 1));
        for i in 0..num {
            let base = 4 + i * row;
            if base + row > buf.len() {
                break;
            }
            let (port_off, pid_off, has_state) = match (ipv6, proto) {
                (false, "TCP") => (8, 20, true),
                (false, _) => (4, 8, false),
                (true, "TCP6") => (16, 44, true),
                (true, _) => (16, 20, false),
            };
            let port = port_of(rd_u32(buf, base + port_off));
            let pid = rd_u32(buf, base + pid_off);
            let state = if has_state {
                tcp_state(if ipv6 {
                    rd_u32(buf, base + 40)
                } else {
                    rd_u32(buf, base + 0)
                })
            } else {
                String::new()
            };
            out.push(RawConn { pid, port, proto, state });
        }
        out
    }

    let mut out = Vec::new();
    if let Some(b) = get_table(AF_INET, true) {
        out.extend(parse(&b, "TCP", false));
    }
    if let Some(b) = get_table(AF_INET, false) {
        out.extend(parse(&b, "UDP", false));
    }
    if let Some(b) = get_table(AF_INET6, true) {
        out.extend(parse(&b, "TCP6", true));
    }
    if let Some(b) = get_table(AF_INET6, false) {
        out.extend(parse(&b, "UDP6", true));
    }
    out
}

#[cfg(not(windows))]
#[allow(dead_code)]
fn list_all_ports() -> Vec<RawConn> {
    Vec::new()
}

/// 查询占用指定端口的进程列表（按 PID 去重）。
#[tauri::command]
pub fn port_query(port: u16) -> Result<Vec<PortProcess>, String> {
    if port == 0 {
        return Err("请输入 1-65535 之间的端口号".into());
    }
    #[cfg(not(windows))]
    {
        let _ = port;
        return Err("当前平台不支持".into());
    }
    #[cfg(windows)]
    {
        let conns = list_all_ports();
        let mut result: Vec<PortProcess> = Vec::new();
        for c in conns {
            if c.port != port {
                continue;
            }
            if result.iter().any(|r| r.pid == c.pid) {
                continue;
            }
            let name = process_name(c.pid);
            let path = process_image_path(c.pid);
            let cmdline = process_command_line(c.pid);
            result.push(PortProcess {
                pid: c.pid,
                protected: SYSTEM_PROTECTED.contains(&name.to_lowercase().as_str()),
                name,
                state: c.state,
                proto: c.proto.to_string(),
                port: Some(port),
                path,
                cmdline,
            });
        }
        Ok(result)
    }
}

/// 增强搜索：输入端口号或应用名（进程名），返回占用端口的进程列表。
/// - 纯数字（1-65535）→ 等价于 `port_query(port)`，所有匹配行 port=Some(port)。
/// - 非数字 → 按进程名做不区分大小写的子串匹配（如 "node" 命中 node.exe），
///   逐行返回该进程占用的每个端口（port=该行实际端口），并按 (pid,port,proto,state) 去重。
#[tauri::command]
pub fn port_search(keyword: String) -> Result<Vec<PortProcess>, String> {
    let kw = keyword.trim();
    if kw.is_empty() {
        return Ok(Vec::new());
    }
    if let Ok(port) = kw.parse::<u16>() {
        if port == 0 {
            return Err("请输入 1-65535 之间的端口号".into());
        }
        return port_query(port);
    }
    #[cfg(not(windows))]
    {
        let _ = kw;
        return Err("当前平台不支持".into());
    }
    #[cfg(windows)]
    {
        let kw_lower = kw.to_lowercase();
        let conns = list_all_ports();
        let mut result: Vec<PortProcess> = Vec::new();
        let mut seen: HashSet<(u32, u16, String, String)> = HashSet::new();
        for c in conns {
            if c.pid == 0 {
                continue;
            }
            let name = process_name(c.pid);
            if !name.to_lowercase().contains(&kw_lower) {
                continue;
            }
            if !seen.insert((c.pid, c.port, c.proto.to_string(), c.state.clone())) {
                continue;
            }
            let path = process_image_path(c.pid);
            let cmdline = process_command_line(c.pid);
            result.push(PortProcess {
                pid: c.pid,
                protected: SYSTEM_PROTECTED.contains(&name.to_lowercase().as_str()),
                name,
                state: c.state,
                proto: c.proto.to_string(),
                port: Some(c.port),
                path,
                cmdline,
            });
        }
        Ok(result)
    }
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

/// 根据 PID 取进程完整映像路径（可执行文件全路径）；失败回退 "PID <pid>"
#[cfg(windows)]
fn process_image_path(pid: u32) -> String {
    use windows::core::PWSTR;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut buf = [0u16; 1024];
            let mut size = buf.len() as u32;
            let name = PWSTR(buf.as_mut_ptr());
            if QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), name, &mut size).is_ok()
            {
                let wide = String::from_utf16_lossy(&buf[..size as usize]);
                if !wide.is_empty() {
                    return wide;
                }
            }
        }
    }
    format!("PID {pid}")
}

/// 进程名（映像文件名，如 node.exe）；取不到时回退 "PID <pid>"
#[cfg(windows)]
fn process_name(pid: u32) -> String {
    let full = process_image_path(pid);
    if full.starts_with("PID ") {
        return full;
    }
    std::path::Path::new(&full)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or(full)
}

/// 根据 PID 取进程命令行（best-effort，取不到返回空串）。
/// 用于端口工具反查“启动项目”：例如 node 进程命令行含
/// `C:\proj\hussar-front\node_modules\vite\bin\vite.js`，可直接看出项目路径。
#[cfg(windows)]
fn process_command_line(pid: u32) -> String {
    use windows::Win32::Foundation::NTSTATUS;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION};
    use windows::Wdk::System::Threading::{NtQueryInformationProcess, PROCESSINFOCLASS};
    // ProcessCommandLineInformation = 60
    const CMD_LINE_CLASS: PROCESSINFOCLASS = PROCESSINFOCLASS(60i32);
    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(_) => return String::new(),
        };
        // 第一次调用（长度为 0）拿所需缓冲区大小，写入 needed
        let mut needed: u32 = 0;
        let _ = NtQueryInformationProcess(
            handle,
            CMD_LINE_CLASS,
            std::ptr::null_mut(),
            0,
            &mut needed,
        );
        if needed == 0 {
            return String::new();
        }
        let mut buf: Vec<u8> = vec![0u8; needed as usize];
        let status: NTSTATUS = NtQueryInformationProcess(
            handle,
            CMD_LINE_CLASS,
            buf.as_mut_ptr() as *mut core::ffi::c_void,
            needed,
            std::ptr::null_mut(),
        );
        if status != NTSTATUS(0) {
            return String::new();
        }
        // 返回结构是 UNICODE_STRING（x64 布局）：Length(u16)@0、MaximumLength(u16)@2、
        // Buffer(*mut u16)@8（本工具为 64 位，内核按原生布局返回，不受目标进程位数影响）。
        if buf.len() < 8 {
            return String::new();
        }
        let length = u16::from_ne_bytes([buf[0], buf[1]]) as usize;
        let buf_ptr = std::ptr::read_unaligned(buf.as_ptr().add(8) as *const *const u16);
        if buf_ptr.is_null() || length == 0 {
            return String::new();
        }
        let slice = std::slice::from_raw_parts(buf_ptr, length / 2);
        String::from_utf16_lossy(slice)
    }
}

#[cfg(not(windows))]
fn process_name(pid: u32) -> String {
    format!("PID {pid}")
}

#[cfg(not(windows))]
fn process_command_line(_pid: u32) -> String {
    String::new()
}

#[cfg(not(windows))]
fn process_image_path(pid: u32) -> String {
    format!("PID {pid}")
}
