//! 本机应用扫描：开始菜单 + 卸载表 + App Paths + 常见安装目录。
//! 纯扫描逻辑，不依赖 crate 其余模块（便于独立 bin 验证与复用）。
//!
//! 为什么要有四个来源：只扫开始菜单和 App Paths 会漏掉一整类应用——
//! 微信 / 企业微信 / QQ 这类用户级安装既不留开始菜单快捷方式、
//! 也不注册 App Paths，只在卸载表（Uninstall）里登记了 DisplayName 与主程序路径。
//! 目录扫描是最后一道兜底：连卸载表都没写全时，按"主 exe 与所在目录同名"
//! 从 Program Files / %LOCALAPPDATA% 里捞。
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// 应用类别：编辑器（能打开文本类文件的最常用工具，置顶）/ 浏览器 / 其他
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppKind {
    Editor,
    Browser,
    Other,
}

/// 已安装应用（供命令面板启动、设置页「默认打开方式」下拉选择）
#[derive(Debug, Clone, Serialize, Deserialize)]
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

/* ---------------- 分类与过滤 ---------------- */

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

/// 明显不能用来打开文件的项（安装器 / 更新器 / 系统组件 / 运行库等），过滤掉
const JUNK_KEYS: &[&str] = &[
    "unins", "uninstall", "卸载", "setup", "installer", "update", "updater",
    "upgrader", "store", "settings", "设置", "control panel", "repair", "diagnos",
    "feedback", "webview", "runtime", "redist", "redistributable", "cmd",
    "powershell", "pwsh", "explorer", "regedit", "taskmgr", "msconfig",
    "winver", "control", "mstsc", "calc", "计算器", "calculator", "nvidia",
    "amd", "intel", "realtek", "driver", "驱动", "hotfix", "service pack",
    "security update", "update for", "补丁", "visual c++", "microsoft .net",
    ".net framework", "sdk", "打印机", "字体",
    // 卸载表/目录扫描里混进来的系统与套件辅助进程（DisplayIcon 常指向它们）
    "clicktorun", "sdxhelper", "skypeserver", "msoxmled", "msoadfsb", "msoasb",
    "vcpkg", "officeclicktorun",
];

/// 辅助进程文件名关键字（只在"安装目录扫描"这一路生效：
/// 那里靠目录名猜主程序，必须挡住升级器/崩溃上报/服务这类同名子进程）
const HELPER_STEMS: &[&str] = &[
    "helper", "handler", "crashpad", "crashhandler", "crashreporter", "crashreport",
    "elevator", "elevation", "bugreport", "minidump", "downloader", "telemetry",
    "metrics", "diagnostics", "cleanup", "broker", "sandbox",
];

/// 判断是否为垃圾项（安装器/更新器/系统组件/驱动/运行库等）。
/// 【短关键字只在"显示名 / 文件名"上匹配】——"cmd"、"calc"、"store" 这类
/// 短片段在长路径里到处都是（…\Microsoft\…、…\WindowsApps\…），
/// 拿整条路径去 contains 会误伤正常应用。
fn is_junk(name: &str, exe: &str) -> bool {
    let name_l = name.to_lowercase();
    let exe_l = exe.to_lowercase();
    let stem = Path::new(&exe)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let ident = format!("{name_l} {stem}");
    let full = format!("{ident} {exe_l}");
    JUNK_KEYS
        .iter()
        .any(|k| if k.len() <= 6 { ident.contains(k) } else { full.contains(k) })
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

/* ---------------- 汇总 ---------------- */

/// 扫描本机应用（开始菜单 + 卸载表 + App Paths + 安装目录），
/// 过滤垃圾项、分类并排序（编辑器置顶）、提取图标。
/// 由调用方放到 spawn_blocking / 独立线程上，避免阻塞 UI。
pub fn collect_installed_apps() -> Vec<InstalledApp> {
    let mut apps: Vec<InstalledApp> = Vec::new();
    #[cfg(windows)]
    {
        apps.extend(apps_from_start_menu());
        apps.extend(apps_from_uninstall());
        apps.extend(apps_from_registry());
        apps.extend(apps_from_install_dirs());
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
    if out.len() > 500 {
        out.truncate(500);
    }
    #[cfg(windows)]
    for app in &mut out {
        app.icon = app_icon_data_url(&app.exe);
    }
    out
}

/* ---------------- 来源一：开始菜单 ---------------- */

/// 扫描开始菜单 Programs（系统级 + 用户级）下的 .lnk，解析目标 exe。
/// 显示名 = 相对 Programs 根的子路径（保留分组目录）；若目录名与快捷方式名
/// 相同（如「微信/微信」）则只取一个，避免出现重复的"名字/名字"。
#[cfg(windows)]
pub fn apps_from_start_menu() -> Vec<InstalledApp> {
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
            let Ok(entries) = std::fs::read_dir(&dir) else {
                continue;
            };
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
                            let rel = rel.with_extension("").to_string_lossy().replace('\\', "/");
                            // 「微信/微信」→「微信」：目录与快捷方式同名（或父目录同名）时只留一个，
                            // 避免出现"名字/名字"这种重复显示名
                            let name = match rel.rsplit_once('/') {
                                Some((folder, last))
                                    if folder.eq_ignore_ascii_case(last)
                                        || folder.rsplit_once('/').map(|x| x.1) == Some(last) =>
                                {
                                    last.to_string()
                                }
                                _ => rel.clone(),
                            };
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
pub fn resolve_lnk_target(path: &Path) -> Option<String> {
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

/* ---------------- 注册表读取小工具 ---------------- */

#[cfg(windows)]
mod reg {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Foundation::WIN32_ERROR;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, REG_SAM_FLAGS,
        REG_VALUE_TYPE,
    };

    pub const ERROR_SUCCESS: WIN32_ERROR = WIN32_ERROR(0);
    pub const ERROR_NO_MORE_ITEMS: WIN32_ERROR = WIN32_ERROR(259);

    /// 注册表键句柄（Drop 自动关闭）
    pub struct Key(pub HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }

    /// 打开子键；sam 可拼 KEY_WOW64_32KEY / KEY_WOW64_64KEY
    pub fn open(hive: HKEY, path: &str, sam: REG_SAM_FLAGS) -> Option<Key> {
        let w = wide(path);
        let mut key = HKEY::default();
        let rc = unsafe { RegOpenKeyExW(hive, PCWSTR(w.as_ptr()), Some(0), sam, &mut key) };
        (rc == ERROR_SUCCESS).then_some(Key(key))
    }

    /// 列出全部子键名（枚举上限 4096 个，防病态注册表）
    pub fn subkeys(k: &Key) -> Vec<String> {
        let mut out = Vec::new();
        let mut idx = 0u32;
        while out.len() < 4096 {
            let mut name = [0u16; 260];
            let mut len = name.len() as u32;
            let rc = unsafe {
                RegEnumKeyExW(
                    k.0,
                    idx,
                    Some(PWSTR(name.as_mut_ptr())),
                    &mut len,
                    None,
                    None,
                    None,
                    None,
                )
            };
            if rc == ERROR_NO_MORE_ITEMS || rc != ERROR_SUCCESS {
                break;
            }
            idx += 1;
            out.push(String::from_utf16_lossy(&name[..len as usize]));
        }
        out
    }

    /// 读一个 REG_SZ（自动去尾零与首尾空白，顺带剥掉引号）
    pub fn sz(k: &Key, name: &str) -> Option<String> {
        let (ty, data) = raw(k, name)?;
        // REG_SZ / REG_EXPAND_SZ 都是宽字符串
        if ty.0 != 1 && ty.0 != 2 {
            return None;
        }
        let u16s: Vec<u16> = data
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        let s = String::from_utf16_lossy(&u16s)
            .trim_end_matches('\0')
            .trim()
            .trim_matches('"')
            .to_string();
        (!s.is_empty()).then_some(s)
    }

    /// 读一个 REG_DWORD
    pub fn dword(k: &Key, name: &str) -> Option<u32> {
        let (ty, data) = raw(k, name)?;
        if ty.0 != 4 || data.len() != 4 {
            return None;
        }
        Some(u32::from_le_bytes([data[0], data[1], data[2], data[3]]))
    }

    /// 读原始字节：先问长度再取内容
    pub fn raw(k: &Key, name: &str) -> Option<(REG_VALUE_TYPE, Vec<u8>)> {
        let w = wide(name);
        let mut ty = REG_VALUE_TYPE::default();
        let mut len: u32 = 0;
        let rc = unsafe {
            RegQueryValueExW(k.0, PCWSTR(w.as_ptr()), None, Some(&mut ty), None, Some(&mut len))
        };
        if rc != ERROR_SUCCESS || len == 0 {
            return None;
        }
        let mut buf = vec![0u8; len as usize];
        let rc = unsafe {
            RegQueryValueExW(
                k.0,
                PCWSTR(w.as_ptr()),
                None,
                Some(&mut ty),
                Some(buf.as_mut_ptr()),
                Some(&mut len),
            )
        };
        if rc != ERROR_SUCCESS {
            return None;
        }
        buf.truncate(len as usize);
        Some((ty, buf))
    }
}

/* ---------------- 来源二：卸载表（覆盖面最广） ---------------- */

#[cfg(windows)]
const UNINSTALL_KEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";

/// 枚举卸载表（HKLM/HKCU × 32/64 位视图）：DisplayName 作显示名，
/// DisplayIcon 或 InstallLocation 推出主程序路径。
/// 这是微信 / 企业微信这类"只装到自己目录、不留开始菜单"的应用唯一可靠来源。
#[cfg(windows)]
pub fn apps_from_uninstall() -> Vec<InstalledApp> {
    use windows::Win32::System::Registry::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
    };

    let mut apps = Vec::new();
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for wow in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let Some(root) = reg::open(hive, UNINSTALL_KEY, KEY_READ | wow) else {
                continue;
            };
            for sub in reg::subkeys(&root) {
                let full = format!(r"{UNINSTALL_KEY}\{sub}");
                let Some(k) = reg::open(hive, &full, KEY_READ | wow) else {
                    continue;
                };
                // 系统组件 / 补丁 / 子补丁：不是能启动的应用
                if reg::dword(&k, "SystemComponent") == Some(1) {
                    continue;
                }
                if reg::sz(&k, "ParentKeyName").is_some() || reg::sz(&k, "ParentDisplayName").is_some()
                {
                    continue;
                }
                if let Some(rt) = reg::sz(&k, "ReleaseType") {
                    let rt = rt.to_lowercase();
                    if ["hotfix", "update rollup", "security update", "service pack"]
                        .iter()
                        .any(|x| rt.contains(x))
                    {
                        continue;
                    }
                }
                let Some(name) = reg::sz(&k, "DisplayName") else {
                    continue;
                };
                // "KB2538243" 这类补丁号没意义
                if name.len() > 2 && name.starts_with("KB") && name[2..].chars().all(|c| c.is_ascii_digit())
                {
                    continue;
                }
                // 主程序：优先 DisplayIcon（"路径,图标序号"），退回 InstallLocation
                let exe = reg::sz(&k, "DisplayIcon")
                    .and_then(|s| exe_from_display_icon(&s))
                    .or_else(|| {
                        reg::sz(&k, "InstallLocation")
                            .filter(|s| !s.is_empty())
                            .and_then(|s| main_exe_in(Path::new(&s), 2))
                    });
                let Some(exe) = exe else { continue };
                apps.push(InstalledApp {
                    name,
                    exe,
                    kind: AppKind::Other,
                    icon: None,
                });
            }
        }
    }
    apps
}

/// DisplayIcon → exe：剥掉 ",序号" 与引号，只认真实存在的 .exe
#[cfg(windows)]
fn exe_from_display_icon(raw: &str) -> Option<String> {
    let s = raw.rsplit(',').next()?.trim().trim_matches('"').to_string();
    if !s.to_lowercase().ends_with(".exe") {
        return None;
    }
    Path::new(&s).is_file().then_some(s)
}

/* ---------------- 来源三：安装目录扫描 ---------------- */

/// 递归时跳过的目录（系统目录 / 缓存目录，进去只会拖慢扫描、捞不出应用）
const SKIP_DIRS: &[&str] = &[
    "windows", "microsoft", "temp", "tmp", "cache", "caches", "crashdumps",
    "crashpad", "packages", "d3dscache", "nvidia", "nvidia corporation", "amd",
    "intel", "node_modules", "appdata", "system32", "syswow64", "winsxs",
    "common files", "installer", "package cache", "windowsapps", "historys",
    "logs", "log", "resources", "locales", "cachestorage", "webcache",
];
/// 目录遍历上限：单个根最多进 4000 个目录
const MAX_SCAN_DIRS: usize = 4000;
/// 全部安装目录扫描的总时间预算（毫秒）——这是启动路径上的活，不能任性
const SCAN_BUDGET_MS: u128 = 2500;

fn is_exe(p: &Path) -> bool {
    p.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .map(|e| e == "exe")
        .unwrap_or(false)
}

/// 是否是"主程序"：文件名与所在目录同名（…\WeChat\WeChat.exe），
/// 或父目录是版本号、文件名与祖父目录同名（…\WeChat\3.9.12.51\WeChat.exe，
/// 微信 / QQ 这类带版本子目录的安装就长这样）。
/// 靠这条规则挡掉同目录里的卸载器、更新器、渲染子进程。
fn is_main_exe(p: &Path) -> bool {
    let stem = match p.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s.to_lowercase(),
        None => return false,
    };
    if stem.is_empty() {
        return false;
    }
    // 辅助进程：只在"目录猜测"这一路生效，避免把服务/崩溃上报当主程序
    if HELPER_STEMS.iter().any(|k| stem.contains(k)) {
        return false;
    }
    let parent = p
        .parent()
        .and_then(|d| d.file_name())
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase());
    if parent.as_deref() == Some(stem.as_str()) {
        return true;
    }
    let grand = p
        .parent()
        .and_then(|d| d.parent())
        .and_then(|d| d.file_name())
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase());
    if grand.as_deref() == Some(stem.as_str())
        && parent
            .as_deref()
            .map(|n| n.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false))
            .unwrap_or(false)
    {
        return true;
    }
    false
}

/// 常见安装根：Program Files（含 x86）+ LOCALAPPDATA\Programs + LOCALAPPDATA 本身
/// （微信 / 企业微信 / QQ 默认装在 %LOCALAPPDATA%\Tencent\… 这类用户级目录）
#[cfg(windows)]
fn install_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        if let Ok(p) = std::env::var(var) {
            let p = PathBuf::from(p);
            if p.is_dir() && !roots.contains(&p) {
                roots.push(p);
            }
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let programs = Path::new(&local).join("Programs");
        if programs.is_dir() {
            roots.push(programs);
        }
        let local = PathBuf::from(local);
        if local.is_dir() {
            roots.push(local);
        }
    }
    roots
}

/// 扫描常见安装目录（最多下钻两层目录），只收"主 exe 与目录同名"的条目
#[cfg(windows)]
pub fn apps_from_install_dirs() -> Vec<InstalledApp> {
    let started = Instant::now();
    let mut out = Vec::new();
    for root in install_roots() {
        if started.elapsed().as_millis() > SCAN_BUDGET_MS {
            break;
        }
        out.extend(collect_dir_apps(&root, 2, started));
    }
    out
}

/// 在 root 下逐层找主 exe（max_dir_depth 为相对 root 的目录深度上限）
#[cfg(windows)]
fn collect_dir_apps(root: &Path, max_dir_depth: u8, started: Instant) -> Vec<InstalledApp> {
    let mut out = Vec::new();
    let mut visited = 0usize;
    let mut queue: VecDeque<(PathBuf, u8)> = VecDeque::new();
    queue.push_back((root.to_path_buf(), 0));
    while let Some((dir, depth)) = queue.pop_front() {
        if visited >= MAX_SCAN_DIRS || started.elapsed().as_millis() > SCAN_BUDGET_MS {
            break;
        }
        visited += 1;
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for ent in entries.flatten() {
            let p = ent.path();
            if p.is_dir() {
                if depth >= max_dir_depth {
                    continue;
                }
                let Some(nm) = p.file_name().and_then(|s| s.to_str()).map(|s| s.to_lowercase())
                else {
                    continue;
                };
                if nm.starts_with('.') || nm.starts_with('$') || SKIP_DIRS.contains(&nm.as_str()) {
                    continue;
                }
                queue.push_back((p, depth + 1));
            } else if is_exe(&p) && is_main_exe(&p) {
                let name = p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                if name.is_empty() {
                    continue;
                }
                out.push(InstalledApp {
                    name,
                    exe: p.to_string_lossy().to_string(),
                    kind: AppKind::Other,
                    icon: None,
                });
            }
        }
    }
    out
}

/// 在给定目录里找主 exe（卸载表只给了 InstallLocation 时用）：
/// 先看 <目录名>.exe，再退回"主 exe 与目录同名"规则扫两层
#[cfg(windows)]
fn main_exe_in(dir: &Path, max_depth: u8) -> Option<String> {
    if !dir.is_dir() {
        return None;
    }
    let stem = dir.file_name().and_then(|s| s.to_str()).unwrap_or("");
    if !stem.is_empty() {
        let direct = dir.join(format!("{stem}.exe"));
        if direct.is_file() {
            return Some(direct.to_string_lossy().to_string());
        }
    }
    let found = collect_dir_apps(dir, max_depth, Instant::now());
    // 优先与目录同名的那条，其次任意一条
    found
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case(stem))
        .or_else(|| found.first())
        .map(|a| a.exe.clone())
}

/* ---------------- 来源四：App Paths 注册表 ---------------- */

/// 枚举 App Paths 注册表（HKLM + HKCU）下的命令型应用
#[cfg(windows)]
pub fn apps_from_registry() -> Vec<InstalledApp> {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};

    const SUBKEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths";
    let mut apps = Vec::new();
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Some(key) = reg::open(hive, SUBKEY, KEY_READ) else {
            continue;
        };
        for sub_name in reg::subkeys(&key) {
            let full = format!(r"{SUBKEY}\{sub_name}");
            let Some(sub) = reg::open(hive, &full, KEY_READ) else {
                continue;
            };
            // 默认值（(Default)）= 完整 exe 路径
            if let Some(s) = reg_default_sz(&sub) {
                let s = s.trim().trim_matches('"').to_string();
                if s.to_lowercase().ends_with(".exe") {
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
        }
    }
    apps
}

/// 读键的默认值（(Default)）：RegQueryValueExW 传空串即可
#[cfg(windows)]
fn reg_default_sz(k: &reg::Key) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegQueryValueExW, REG_VALUE_TYPE};

    let empty: Vec<u16> = vec![0];
    let mut ty = REG_VALUE_TYPE::default();
    let mut len: u32 = 0;
    let rc = unsafe {
        RegQueryValueExW(k.0, PCWSTR(empty.as_ptr()), None, Some(&mut ty), None, Some(&mut len))
    };
    if rc != reg::ERROR_SUCCESS || len == 0 {
        return None;
    }
    let mut buf = vec![0u8; len as usize];
    let rc = unsafe {
        RegQueryValueExW(
            k.0,
            PCWSTR(empty.as_ptr()),
            None,
            Some(&mut ty),
            Some(buf.as_mut_ptr()),
            Some(&mut len),
        )
    };
    if rc != reg::ERROR_SUCCESS {
        return None;
    }
    buf.truncate(len as usize);
    let u16s: Vec<u16> = buf
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let s = String::from_utf16_lossy(&u16s).trim_end_matches('\0').trim().to_string();
    (!s.is_empty()).then_some(s)
}

/* ---------------- 图标提取 ---------------- */

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
