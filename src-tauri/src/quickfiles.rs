//! 快速文件面板：在统一位置快速新建 / 打开 / 管理多种类型文件。
//! 位置可在设置中配置；为空时回退到 data 目录下的 quickfiles 子目录（自动创建）。
use crate::storage::AppPaths;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::State;

/// 单个文件条目（供前端展示 / 排序 / 分组）
#[derive(Debug, Clone, Serialize)]
pub struct QuickFile {
    /// 文件名（含扩展名）
    pub name: String,
    /// 扩展名（小写，不含点）
    pub ext: String,
    /// 完整路径
    pub path: String,
    /// 创建时间（毫秒时间戳，0 表示未知）
    pub created_at: i64,
    /// 文件大小（字节）
    pub size: u64,
}

/// 列表结果：附带实际使用的保存位置（前端展示「位置」用）
#[derive(Serialize)]
pub struct QuickFileList {
    pub location: String,
    pub files: Vec<QuickFile>,
}

/// 解析保存位置：配置为空时回退到 data 目录下的 quickfiles 子目录（自动创建）
fn resolve_location(location: &str, paths: &AppPaths) -> PathBuf {
    let dir = if location.trim().is_empty() {
        paths.data_dir.join("quickfiles")
    } else {
        PathBuf::from(location.trim())
    };
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 取文件名扩展名（小写，不含点）
fn ext_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// 取文件创建时间（毫秒时间戳）
fn created_ms(path: &Path) -> i64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 列出保存位置下、且属于已配置文件类型的所有文件。
/// extensions 为允许显示的扩展名集合（小写、不含点）；为空表示不过滤。
#[tauri::command]
pub fn quickfiles_list(
    location: String,
    extensions: Vec<String>,
    paths: State<AppPaths>,
) -> Result<QuickFileList, String> {
    let dir = resolve_location(&location, &paths);
    let loc_str = dir.to_string_lossy().to_string();
    let allowed: Vec<String> = extensions
        .iter()
        .map(|e| e.trim_start_matches('.').to_lowercase())
        .collect();
    let mut files = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("读取目录失败：{e}"))?;
    for ent in entries.flatten() {
        let p = ent.path();
        if !p.is_file() {
            continue;
        }
        let name = match p.file_name().and_then(|s| s.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let ext = ext_of(&name);
        if !allowed.is_empty() && !allowed.contains(&ext) {
            continue;
        }
        let meta = match std::fs::metadata(&p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        files.push(QuickFile {
            name,
            ext,
            path: p.to_string_lossy().to_string(),
            created_at: created_ms(&p),
            size: meta.len(),
        });
    }
    // 默认按创建时间倒序（最新在前）；前端再按分组/排序重排
    files.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(QuickFileList {
        location: loc_str,
        files,
    })
}

/// 在保存位置新建一个空文件。filename 仅取纯文件名（防目录穿越）。
/// 重名时返回错误，不覆盖。成功返回完整路径。
#[tauri::command]
pub fn quickfiles_create(
    location: String,
    filename: String,
    paths: State<AppPaths>,
) -> Result<String, String> {
    let dir = resolve_location(&location, &paths);
    let base = Path::new(&filename)
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("文件名无效")?
        .to_string();
    if base.trim().is_empty() {
        return Err("文件名不能为空".into());
    }
    let full = dir.join(&base);
    if full.exists() {
        return Err(format!("文件已存在：{base}"));
    }
    std::fs::write(&full, []).map_err(|e| format!("创建失败：{e}"))?;
    Ok(full.to_string_lossy().to_string())
}

/// 打开文件：opener 为某类型配置的默认打开程序（exe 路径或命令）。
/// 为空时使用系统默认程序打开。
#[tauri::command]
pub fn quickfiles_open(path: String, opener: Option<String>) -> Result<(), String> {
    if let Some(op) = opener.filter(|s| !s.trim().is_empty()) {
        std::process::Command::new(&op)
            .arg(&path)
            .spawn()
            .map_err(|e| format!("无法用「{op}」打开：{e}"))?;
    } else {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("打开失败：{e}"))?;
    }
    Ok(())
}

/// 在资源管理器中定位并选中该文件
#[tauri::command]
pub fn quickfiles_reveal(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path))
        .spawn()
        .map_err(|e| format!("打开所在文件夹失败：{e}"))?;
    Ok(())
}

/// 删除文件（前端二次确认后调用）
#[tauri::command]
pub fn quickfiles_delete(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("删除失败：{e}"))
}

/// 已安装应用（供设置页「默认打开方式」下拉选择）
#[derive(Debug, Clone, Serialize)]
pub struct InstalledApp {
    /// 应用显示名
    pub name: String,
    /// 可执行文件完整路径
    pub exe: String,
}

/// 枚举本机已安装应用，供设置页选择默认打开程序（免去手工从文件夹翻 exe）。
/// 来源：开始菜单快捷方式（.lnk 解析目标，覆盖用户可见的已安装应用）+ App Paths
/// 注册表（HKLM+HKCU，覆盖 code.exe 等命令型应用）。同一 exe 只保留一次，
/// 结果按名称排序，最多返回 300 条。
#[tauri::command]
pub fn list_installed_apps() -> Result<Vec<InstalledApp>, String> {
    let mut apps: Vec<InstalledApp> = Vec::new();
    #[cfg(windows)]
    {
        apps.extend(apps_from_start_menu());
        apps.extend(apps_from_registry());
    }
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<InstalledApp> = Vec::new();
    for app in apps {
        let exe = app.exe.trim();
        if exe.is_empty() || !exe.to_lowercase().ends_with(".exe") {
            continue;
        }
        if seen.insert(exe.to_lowercase()) {
            out.push(app);
        }
    }
    out.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
    });
    if out.len() > 300 {
        out.truncate(300);
    }
    Ok(out)
}

/// 扫描开始菜单 Programs（系统级 + 用户级）下的 .lnk，解析目标 exe。
/// 显示名 = 相对 Programs 根的子路径（保留分组目录），如 "7-Zip/7-Zip File Manager"。
#[cfg(windows)]
fn apps_from_start_menu() -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(p).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(p) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(p).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    let mut seen = std::collections::HashSet::new();
    for root in roots {
        let mut stack = vec![root.clone()];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for ent in entries.flatten() {
                let p = ent.path();
                if p.is_dir() {
                    stack.push(p);
                } else if p
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    == Some("lnk".into())
                {
                    if let Some(exe) = resolve_lnk_target(&p) {
                        if seen.insert(exe.to_lowercase()) {
                            let rel = p.strip_prefix(&root).unwrap_or(&p);
                            let name = rel
                                .with_extension("")
                                .to_string_lossy()
                                .replace('\\', "/");
                            apps.push(InstalledApp { name, exe });
                        }
                    }
                }
            }
        }
    }
    apps
}

/// 解析 .lnk 快捷方式目标（IShellLink COM），仅返回 .exe 路径
#[cfg(windows)]
fn resolve_lnk_target(path: &Path) -> Option<String> {
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
        IPersistFile, STGM,
    };
    use windows::Win32::UI::Shell::IShellLinkW;
    // windows crate 0.61 未导出 CLSID_ShellLink 常量，手动定义标准值
    const CLSID_SHELL_LINK: windows::core::GUID =
        windows::core::GUID::from_u128(0x0002140100000000C000000000000046);
    unsafe {
        // 命令线程首次调用才真正初始化，重复调用仅返回 S_FALSE，无副作用
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let unk: windows::core::IUnknown =
            CoCreateInstance(&CLSID_SHELL_LINK, None, CLSCTX_INPROC_SERVER).ok()?;
        let shell: IShellLinkW = unk.cast().ok()?;
        let persist: IPersistFile = shell.cast().ok()?;
        let wide: Vec<u16> = path
            .as_os_str()
            .to_string_lossy()
            .encode_utf16()
            .chain(Some(0))
            .collect();
        persist.Load(PCWSTR(wide.as_ptr()), STGM::default()).ok()?;
        let mut buf = [0u16; 1024];
        let mut fd = WIN32_FIND_DATAW::default();
        if shell.GetPath(&mut buf, &mut fd, 0).is_err() {
            return None;
        }
        let len = buf.iter().position(|&c| c == 0).unwrap_or(0);
        if len == 0 {
            return None;
        }
        let exe = String::from_utf16_lossy(&buf[..len]);
        if exe.to_lowercase().ends_with(".exe") {
            Some(exe)
        } else {
            None
        }
    }
}

/// 枚举 App Paths 注册表（HKLM + HKCU）下的命令型应用
#[cfg(windows)]
fn apps_from_registry() -> Vec<InstalledApp> {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::WIN32_ERROR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER,
        HKEY_LOCAL_MACHINE, KEY_READ, REG_SZ,
    };
    const SUBKEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths";
    const ERROR_SUCCESS: WIN32_ERROR = WIN32_ERROR(0);
    const ERROR_NO_MORE_ITEMS: WIN32_ERROR = WIN32_ERROR(259);
    let mut apps = Vec::new();
    let sub_wide: Vec<u16> = SUBKEY.encode_utf16().chain(Some(0)).collect();
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let mut key: HKEY = HKEY::default();
        let rc = unsafe {
            RegOpenKeyExW(hive, PCWSTR(sub_wide.as_ptr()), Some(0), KEY_READ, &mut key)
        };
        if rc != ERROR_SUCCESS {
            continue;
        }
        let mut idx = 0u32;
        loop {
            let mut name = [0u16; 260];
            let mut name_len = name.len() as u32;
            let rc = unsafe {
                RegEnumKeyExW(
                    key,
                    idx,
                    Some(PWSTR(name.as_mut_ptr())),
                    &mut name_len,
                    None,
                    None,
                    None,
                    None,
                )
            };
            if rc == ERROR_NO_MORE_ITEMS {
                break;
            }
            idx += 1;
            if rc != ERROR_SUCCESS {
                continue;
            }
            let sub_name = String::from_utf16_lossy(&name[..name_len as usize]);
            let full = format!(r"{SUBKEY}\{sub_name}");
            let full_wide: Vec<u16> = full.encode_utf16().chain(Some(0)).collect();
            let mut sub: HKEY = HKEY::default();
            let rc2 = unsafe {
                RegOpenKeyExW(hive, PCWSTR(full_wide.as_ptr()), Some(0), KEY_READ, &mut sub)
            };
            if rc2 != ERROR_SUCCESS {
                continue;
            }
            let mut ty = windows::Win32::System::Registry::REG_VALUE_TYPE::default();
            let mut data = [0u8; 2048];
            let mut data_len = data.len() as u32;
            let qr = unsafe {
                RegQueryValueExW(
                    sub,
                    PCWSTR::null(),
                    None,
                    Some(&mut ty),
                    Some(data.as_mut_ptr()),
                    Some(&mut data_len),
                )
            };
            if qr == ERROR_SUCCESS && ty == REG_SZ && data_len <= data.len() as u32 {
                let bytes = &data[..data_len as usize];
                let mut u16s = Vec::with_capacity(bytes.len() / 2);
                for chunk in bytes.chunks_exact(2) {
                    u16s.push(u16::from_le_bytes([chunk[0], chunk[1]]));
                }
                let s = String::from_utf16_lossy(&u16s);
                let s = s.trim_end_matches('\0').trim().to_string();
                if !s.is_empty() && s.to_lowercase().ends_with(".exe") {
                    let display = Path::new(&s)
                        .file_stem()
                        .and_then(|x| x.to_str())
                        .map(|x| x.to_string())
                        .unwrap_or_else(|| sub_name.clone());
                    apps.push(InstalledApp { name: display, exe: s });
                }
            }
            unsafe {
                let _ = RegCloseKey(sub);
            }
        }
        unsafe {
            let _ = RegCloseKey(key);
        }
    }
    apps
}
