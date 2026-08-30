//! 快速文件面板：在统一位置快速新建 / 打开 / 管理多种类型文件。
//! 位置可在设置中配置；为空时回退到 data 目录下的 quickfiles 子目录（自动创建）。
//! 存储按文件类型分子目录管理：新文件落在「位置/<扩展名>/」下（如 .../txt/note.txt），
//! 一种类型一个文件夹，互不混放；列表同时扫描根目录，兼容旧版平铺存放的遗留文件。
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
/// 存储按类型分子目录：新文件落在「位置/<扩展名>/」下（见 quickfiles_create），
/// 此处同时扫描【根目录】（旧版平铺存放的遗留文件）与【各类型子目录】。
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
    // 扫描单个目录下、扩展名命中的文件
    let mut collect = |d: &Path| {
        let Ok(entries) = std::fs::read_dir(d) else { return };
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
    };
    // 根目录：兼容旧版平铺存放的文件（不会重复——子目录内文件名含子目录前缀）
    collect(&dir);
    // 各类型子目录：每种扩展名一个文件夹
    for ext in &allowed {
        let sub = dir.join(ext);
        if sub.is_dir() {
            collect(&sub);
        }
    }
    // 默认按创建时间倒序（最新在前）；前端再按分组/排序重排
    files.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(QuickFileList {
        location: loc_str,
        files,
    })
}

/// 在保存位置新建一个空文件。filename 仅取纯文件名（防目录穿越）。
/// 存储按类型分文件夹：文件落入「位置/<扩展名>/」子目录（无扩展名时仍在根目录）。
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
    let ext = ext_of(&base);
    let target = if ext.is_empty() {
        dir.clone()
    } else {
        dir.join(&ext)
    };
    std::fs::create_dir_all(&target).map_err(|e| format!("创建类型目录失败：{e}"))?;
    let full = target.join(&base);
    if full.exists() {
        return Err(format!("文件已存在：{base}"));
    }
    std::fs::write(&full, []).map_err(|e| format!("创建失败：{e}"))?;
    Ok(full.to_string_lossy().to_string())
}

/// 打开文件：opener 为某类型配置的默认打开程序（exe 路径或命令）。
/// 为空时使用系统默认程序打开。
///
/// 这里是所有"打开一个文件"的唯一出口（面板双击、命令面板、全盘搜索结果都走它），
/// 所以「最近打开」的打点放在后端这一处，任何入口都不会漏记（同 folder.rs 的理由）
#[tauri::command]
pub fn quickfiles_open(
    path: String,
    opener: Option<String>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    if let Some(op) = opener.filter(|s| !s.trim().is_empty()) {
        std::process::Command::new(&op)
            .arg(&path)
            .spawn()
            .map_err(|e| format!("无法用「{op}」打开：{e}"))?;
    } else {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开失败：{e}"))?;
    }
    crate::recentfiles::record_open(&path, &paths);
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

/// 应用类别：编辑器（能打开文本类文件的最常用工具，置顶）/ 浏览器 / 其他
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppKind {
    Editor,
    Browser,
    Other,
}

/// 已安装应用（供设置页「默认打开方式」下拉选择）
#[derive(Debug, Clone, Serialize)]
pub struct InstalledApp {
    /// 应用显示名
    pub name: String,
    /// 可执行文件完整路径
    pub exe: String,
    /// 应用类别（前端据此分组：常用编辑器置顶）
    pub kind: AppKind,
    /// 应用图标（32×32 PNG data URL），提取失败为 None
    pub icon: Option<String>,
}

/// 常见文本/代码编辑器关键字（应用名或 exe 名，小写子串匹配）
const EDITOR_KEYS: &[&str] = &[
    "notepad", "记事本", "editor", "编辑器", "code", "vscode", "visual studio",
    "sublime", "typora", "obsidian", "wordpad", "写字板", "word", "wps",
    "office", "jetbrains", "idea", "pycharm", "webstorm", "goland", "datagrip",
    "emeditor", "ultraedit", "vim", "neovim", "gvim", "geany", "kate",
    "leafpad", "zed", "marktext", "logseq", "joplin", "dbeaver", "hbuilder",
    "eclipse", "markdown", "sql", "text", "文本", "写字",
];

/// 常见浏览器关键字
const BROWSER_KEYS: &[&str] = &[
    "chrome", "chromium", "edge", "firefox", "opera", "brave", "vivaldi",
    "arc", "浏览器", "internet explorer", "maxthon", "centbrowser", "safari",
    "360浏览器", "猎豹", "uc浏览器",
];

/// 明显不能用来打开文件的项（安装器 / 更新器 / 系统组件 / 商店等），过滤掉
const JUNK_KEYS: &[&str] = &[
    "unins", "uninstall", "卸载", "setup", "installer", "update", "updater",
    "store", "settings", "设置", "control panel", "repair", "diagnos",
    "feedback", "webview", "runtime", "redist", "cmd", "powershell", "pwsh",
    "explorer", "regedit", "taskmgr", "msconfig", "winver", "control",
    "mstsc", "calc", "计算器", "calculator", "nvidia", "amd", "intel",
    "realtek", "driver", "驱动",
];

/// 判断是否为垃圾项（安装器/更新器/系统组件/驱动等）
fn is_junk(name: &str, exe: &str) -> bool {
    let hay = format!("{} {}", name.to_lowercase(), exe.to_lowercase());
    JUNK_KEYS.iter().any(|k| hay.contains(k))
}

/// 分类：编辑器 / 浏览器 / 其他
fn classify_app(name: &str, exe: &str) -> AppKind {
    let hay = format!("{} {}", name.to_lowercase(), exe.to_lowercase());
    if EDITOR_KEYS.iter().any(|k| hay.contains(k)) {
        AppKind::Editor
    } else if BROWSER_KEYS.iter().any(|k| hay.contains(k)) {
        AppKind::Browser
    } else {
        AppKind::Other
    }
}

/// 扫描本机应用（开始菜单 + App Paths），过滤垃圾项、分类并排序（编辑器置顶）、
/// 提取图标。在后台线程执行（spawn_blocking），避免阻塞 UI。
fn collect_installed_apps() -> Vec<InstalledApp> {
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
        let name = app.name.trim();
        if exe.is_empty() || !exe.to_lowercase().ends_with(".exe") {
            continue;
        }
        if is_junk(name, exe) {
            continue;
        }
        if seen.insert(exe.to_lowercase()) {
            out.push(InstalledApp {
                kind: classify_app(name, exe),
                icon: None,
                ..app
            });
        }
    }
    // 常用编辑器 > 浏览器 > 其他，组内按名称排序
    let rank = |k: AppKind| match k {
        AppKind::Editor => 0,
        AppKind::Browser => 1,
        AppKind::Other => 2,
    };
    out.sort_by(|a, b| {
        rank(a.kind)
            .cmp(&rank(b.kind))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    if out.len() > 300 {
        out.truncate(300);
    }
    #[cfg(windows)]
    for app in &mut out {
        app.icon = app_icon_data_url(&app.exe);
    }
    out
}

/// 枚举本机已安装应用，供设置页选择默认打开程序（免去手工从文件夹翻 exe）。
/// 来源：开始菜单快捷方式（.lnk 解析目标）+ App Paths 注册表（HKLM+HKCU）。
/// 过滤掉安装器/更新器/系统组件等明显不能打开文件的项；常用编辑器排在
/// 最前；每个应用附带 32×32 图标（data URL），供下拉列表展示。
#[tauri::command]
pub async fn list_installed_apps() -> Result<Vec<InstalledApp>, String> {
    tauri::async_runtime::spawn_blocking(collect_installed_apps)
        .await
        .map_err(|e| format!("扫描本机应用失败：{e}"))
}

/// 启动一个本机应用（命令面板「搜应用直接开」用）。
/// 直接 spawn 该 exe 并带 CREATE_NO_WINDOW：走 opener（内部 `cmd /c start`）
/// 会从这个 GUI 进程闪出一个控制台窗口。
#[tauri::command]
pub fn app_launch(exe: String) -> Result<(), String> {
    let path = Path::new(&exe);
    if !path.is_file() {
        return Err(format!("应用不存在：{exe}"));
    }
    let mut cmd = std::process::Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    if let Some(dir) = path.parent() {
        cmd.current_dir(dir);
    }
    cmd.spawn()
        .map_err(|e| format!("启动失败：{e}"))?;
    Ok(())
}

/// 提取 exe 图标为 32×32 PNG data URL：
/// ExtractIconExW 取小图标 → DrawIconEx 画到 32bpp DIB → 预乘 alpha 还原 →
/// image crate 编码 PNG → base64。
#[cfg(windows)]
fn app_icon_data_url(exe: &str) -> Option<String> {
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine;
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ, RGBQUAD,
    };
    use windows::Win32::UI::Shell::ExtractIconExW;
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL, HICON};

    let wide: Vec<u16> = exe.encode_utf16().chain(Some(0)).collect();
    let mut small = HICON::default();
    let n = unsafe {
        ExtractIconExW(
            PCWSTR(wide.as_ptr()),
            0,
            None,
            Some(&mut small as *mut HICON),
            1,
        )
    };
    if n == 0 || small.is_invalid() {
        return None;
    }
    let hdc = unsafe { CreateCompatibleDC(None) };
    let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: 32,
            biHeight: -32, // top-down，bit 直接顺序
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        bmiColors: [RGBQUAD::default(); 1],
    };
    let hbmp = unsafe {
        CreateDIBSection(
            Some(hdc),
            &mut bmi,
            DIB_RGB_COLORS,
            &mut bits,
            None,
            0,
        )
    }
    .ok()?;
    if hbmp.is_invalid() || bits.is_null() {
        unsafe {
            let _ = DestroyIcon(small);
            let _ = DeleteDC(hdc);
        }
        return None;
    }
    let old = unsafe { SelectObject(hdc, HGDIOBJ(hbmp.0)) };
    unsafe {
        let _ = DrawIconEx(hdc, 0, 0, small, 32, 32, 0, None, DI_NORMAL);
    }
    // 关键：必须在 DeleteObject(hbmp) 之前把 DIB 像素拷出来——bits 指向的内存
    // 由该 DIB section 拥有，删掉位图后即被释放，之后再读就是 use-after-free
    // （实测直接 STATUS_ACCESS_VIOLATION 崩溃整个进程）。
    let mut bgra = vec![0u8; 32 * 32 * 4];
    unsafe {
        std::ptr::copy_nonoverlapping(bits as *const u8, bgra.as_mut_ptr(), 32 * 32 * 4);
        let _ = SelectObject(hdc, old);
        let _ = DeleteObject(HGDIOBJ(hbmp.0));
        let _ = DeleteDC(hdc);
        let _ = DestroyIcon(small);
    }
    // 32bpp DIB 是 BGRA（DrawIconEx 预乘 alpha）→ 还原为非预乘 RGBA
    let mut rgba = Vec::with_capacity(32 * 32 * 4);
    for px in bgra.chunks_exact(4) {
        let (b, g, r, a) = (px[0] as u32, px[1] as u32, px[2] as u32, px[3] as u32);
        if a == 0 {
            rgba.extend_from_slice(&[0, 0, 0, 0]);
        } else {
            rgba.extend_from_slice(&[
                ((r * 255) / a).min(255) as u8,
                ((g * 255) / a).min(255) as u8,
                ((b * 255) / a).min(255) as u8,
                a as u8,
            ]);
        }
    }
    let img = image::RgbaImage::from_raw(32, 32, rgba)?;
    let mut out = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
        .ok()?;
    Some(format!("data:image/png;base64,{}", B64.encode(&out)))
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
                            apps.push(InstalledApp {
                                name,
                                exe,
                                kind: AppKind::Other,
                                icon: None,
                            });
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
                    apps.push(InstalledApp {
                        name: display,
                        exe: s,
                        kind: AppKind::Other,
                        icon: None,
                    });
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
