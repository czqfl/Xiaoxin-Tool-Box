/// 应用类别：编辑器（能打开文本类文件的最常用工具，置顶）/ 浏览器 / 其他
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppKind {
    Editor,
    Browser,
    Other,
}

/// 已安装应用（设置页「默认打开方式」下拉 + 命令面板「搜应用直接开」共用）
#[derive(Debug, Clone, Serialize)]
pub struct InstalledApp {
    /// 应用显示名：开始菜单/桌面快捷方式名优先，其次卸载表 DisplayName（中文名最全）
    pub name: String,
    /// 可执行文件完整路径
    pub exe: String,
    /// 应用类别（前端据此分组：常用编辑器置顶）
    pub kind: AppKind,
    /// 应用图标（32×32 PNG data URL）；按需提取 + 磁盘缓存，未取到为 null
    pub icon: Option<String>,
    /// 额外搜索词（快捷方式分组目录 + 别名表），空格分词
    pub keywords: Option<String>,
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
    "feedback", "webview", "runtime", "redist", "cmd", "SHELLPROG_PH", "pwsh",
    "explorer", "regedit", "taskmgr", "msconfig", "winver", "control",
    "mstsc", "calc", "计算器", "calculator", "nvidia", "amd", "intel",
    "realtek", "driver", "驱动",
];

/// 常见国产 / 常用应用别名表：exe 文件主名（小写）→ 额外搜索词。
/// 用途：把「wx」「qywx」「dd」这类拼音缩写、英文安装名与中文显示名互通——
/// 中文输入法下用户常直接敲缩写，而不少机器只有英文安装名（如 Weixin.exe）。
const APP_ALIASES: &[(&str, &str)] = &[
    ("weixin", "微信 wechat wx 腾讯 tencent"),
    ("wechat", "微信 weixin wx 腾讯 tencent"),
    ("wetype", "微信输入法 wetype 输入法 腾讯 tencent"),
    ("wxwork", "企业微信 wecom qywx wework 腾讯 tencent"),
    ("wecom", "企业微信 wxwork qywx 腾讯 tencent"),
    ("wework", "企业微信 wxwork qywx 腾讯 tencent"),
    ("qq", "qq 腾讯 tencent 聊天"),
    ("qqnt", "qq qqnt 腾讯 tencent"),
    ("tim", "tim qq 腾讯 tencent"),
    ("dingtalk", "钉钉 dingtalk ding 阿里"),
    ("lark", "飞书 lark feishu 字节"),
    ("feishu", "飞书 feishu lark 字节"),
    ("youdaonote", "有道云笔记 youdao 笔记"),
    ("baidunetdisk", "百度网盘 baidu 网盘"),
    ("aliyundrive", "阿里云盘 aliyun 网盘"),
    ("thunder", "迅雷 xunlei thunder 下载"),
    ("xunlei", "迅雷 thunder 下载"),
    ("wps", "wps 金山 office 文档"),
    ("et", "wps 表格 et 金山"),
    ("wpp", "wps 演示 wpp 金山"),
    ("kugou", "酷狗音乐 kugou 音乐"),
    ("qqmusic", "qq音乐 qqmusic 音乐"),
    ("cloudmusic", "网易云音乐 netease 音乐"),
    ("potplayer", "potplayer 播放器 视频"),
    ("vlc", "vlc 播放器 视频"),
    ("bandizip", "bandizip 压缩 解压"),
    ("everything", "everything 搜索 文件"),
    ("utools", "utools 工具箱 效率"),
    ("snipaste", "snipaste 截图 贴图"),
    ("typora", "typora markdown 编辑器"),
    ("obsidian", "obsidian 笔记 markdown"),
    ("notion", "notion 笔记"),
    ("obs64", "obs 录屏 直播 录制"),
    ("code", "vscode code 编辑器 开发"),
    ("devenv", "visual studio vs 开发 ide"),
    ("idea64", "intellij idea java 开发 ide"),
    ("pycharm64", "pycharm python 开发 ide"),
    ("webstorm64", "webstorm 前端 开发 ide"),
    ("goland64", "goland go 开发 ide"),
    ("notepad++", "notepad++ 记事本 编辑器"),
    ("windowsterminal", "终端 terminal wt 命令行"),
    ("terminal", "终端 terminal 命令行"),
    ("chrome", "谷歌浏览器 chrome 浏览器"),
    ("msedge", "edge 浏览器 edge 微软"),
    ("firefox", "火狐 firefox 浏览器"),
];

/// exe 文件主名（小写）命中的别名 → 额外搜索词
fn alias_for(exe: &str) -> Option<&'static str> {
    let stem = Path::new(exe)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if stem.is_empty() {
        return None;
    }
    APP_ALIASES
        .iter()
        .find(|(k, _)| *k == stem)
        .map(|(_, v)| *v)
}

/// 判断是否为垃圾项（安装器/更新器/系统组件/驱动等）。
/// 只在【显示名】与【exe 文件主名】里匹配，不用完整路径——否则路径片段会
/// 误杀正常应用（实测用完整路径时 "intel" 会把 IntelliJ 一起干掉）。
fn is_junk(name: &str, exe: &str) -> bool {
    let stem = Path::new(exe)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let hay = format!("{} {}", name.to_lowercase(), stem);
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

/// 名字是否含汉字（中文名优先：用户按中文搜）
fn has_cjk(s: &str) -> bool {
    s.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
}

/// 两条记录指向同一个 exe 时，挑信息量更大的显示名
fn better_name(new: &str, old: &str) -> bool {
    if new.is_empty() || new == old {
        return false;
    }
    if old.is_empty() {
        return true;
    }
    let (nc, oc) = (has_cjk(new), has_cjk(old));
    if nc != oc {
        return nc; // 有中文的优先
    }
    new.len() < old.len() // 否则取更短的（去掉 "(x64)" "Insiders" 之类尾巴）
}

/// 是否一个真实存在的 .exe 文件（卸载表里大量残留指向已删除的路径）
fn is_exe_file(p: &str) -> bool {
    p.to_lowercase().ends_with(".exe") && Path::new(p).is_file()
}

/* ---------------- 来源一：快捷方式（开始菜单 / 桌面） ---------------- */

/// 递归收集 root 下（最多 max_depth 层）的 .lnk 目标 exe。
/// 显示名只取快捷方式的【叶子名】；所在分组目录进 keywords，
/// 避免「微信/微信」这类长标题挤占列表显示空间。
#[cfg(windows)]
fn apps_from_lnk(root: &std::path::Path, max_depth: usize) -> Vec<InstalledApp> {
    use std::collections::HashSet;
    let mut apps = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    let mut seen = HashSet::new();
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for ent in entries.flatten() {
            let p = ent.path();
            if p.is_dir() {
                if depth + 1 < max_depth {
                    stack.push((p, depth + 1));
                }
                continue;
            }
            if p
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                != Some("lnk".into())
            {
                continue;
            }
            let Some(exe) = resolve_lnk_target(&p) else { continue };
            if !seen.insert(exe.to_lowercase()) {
                continue;
            }
            let stem = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let rel = p.strip_prefix(root).unwrap_or(p.as_path());
            let folder = rel
                .parent()
                .map(|d| d.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            apps.push(InstalledApp {
                name: stem,
                exe,
                kind: AppKind::Other,
                icon: None,
                keywords: if folder.is_empty() { None } else { Some(folder) },
            });
        }
    }
    apps
}

/// 扫描开始菜单 Programs（系统级 + 用户级）下的 .lnk，解析目标 exe
#[cfg(windows)]
fn apps_from_start_menu() -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("ProgramData") {
        roots.push(std::path::PathBuf::from(p).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(p) = std::env::var("APPDATA") {
        roots.push(std::path::PathBuf::from(p).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    for root in roots {
        apps.extend(apps_from_lnk(&root, 6));
    }
    apps
}

/// 扫描桌面快捷方式（用户桌面 / 公共桌面 / OneDrive 桌面）。
/// 国产软件（微信、企业微信、QQ…）经常只往桌面丢一个图标，既不注册
/// App Paths 也不进开始菜单——漏掉这一路就搜不到。文件量只有个位数到
/// 几十个，扫描成本可忽略。
#[cfg(windows)]
fn apps_from_desktop() -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("USERPROFILE") {
        roots.push(std::path::PathBuf::from(p).join("Desktop"));
    }
    if let Ok(p) = std::env::var("PUBLIC") {
        roots.push(std::path::PathBuf::from(p).join("Desktop"));
    }
    // OneDrive 接管桌面时真实目录会被重定向到 OneDrive 下
    for var in ["OneDrive", "OneDriveConsumer"] {
        if let Ok(p) = std::env::var(var) {
            let d = std::path::PathBuf::from(p).join("Desktop");
            if !roots.contains(&d) {
                roots.push(d);
            }
        }
    }
    for root in roots {
        apps.extend(apps_from_lnk(&root, 2));
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

/* ---------------- 来源二/三：注册表（卸载表 + App Paths） ---------------- */

const ERROR_SUCCESS: windows::Win32::Foundation::WIN32_ERROR =
    windows::Win32::Foundation::WIN32_ERROR(0);

/// 极简注册表封装：打开 / 枚举子键 / 读字符串与 DWORD，Drop 自动关句柄
#[cfg(windows)]
struct RegKey(windows::Win32::System::Registry::HKEY);

#[cfg(windows)]
impl RegKey {
    /// wow32 = true 时显式读 32 位视图（WOW6432Node）：微信这类 32 位国产
    /// 软件只写在 32 位视图里，不读就搜不到
    fn open(hive: windows::Win32::System::Registry::HKEY, sub: &str, wow32: bool) -> Option<Self> {
        use windows::core::PCWSTR;
        use windows::Win32::System::Registry::{RegOpenKeyExW, KEY_READ, KEY_WOW64_32KEY};
        let wide: Vec<u16> = sub.encode_utf16().chain(Some(0)).collect();
        let access = if wow32 {
            KEY_READ | KEY_WOW64_32KEY
        } else {
            KEY_READ
        };
        let mut key = windows::Win32::System::Registry::HKEY::default();
        let rc = unsafe { RegOpenKeyExW(hive, PCWSTR(wide.as_ptr()), Some(0), access, &mut key) };
        (rc == ERROR_SUCCESS).then_some(Self(key))
    }

    fn open_sub(&self, name: &str) -> Option<Self> {
        use windows::core::PCWSTR;
        use windows::Win32::System::Registry::{RegOpenKeyExW, KEY_READ};
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let mut key = windows::Win32::System::Registry::HKEY::default();
        let rc = unsafe { RegOpenKeyExW(self.0, PCWSTR(wide.as_ptr()), Some(0), KEY_READ, &mut key) };
        (rc == ERROR_SUCCESS).then_some(Self(key))
    }

    fn subkeys(&self) -> Vec<String> {
        use windows::core::PWSTR;
        use windows::Win32::System::Registry::RegEnumKeyExW;
        let mut out = Vec::new();
        let mut idx = 0u32;
        loop {
            let mut name = [0u16; 260];
            let mut len = name.len() as u32;
            let rc = unsafe {
                RegEnumKeyExW(
                    self.0,
                    idx,
                    PWSTR(name.as_mut_ptr()),
                    &mut len,
                    None,
                    None,
                    None,
                    None,
                )
            };
            if rc != ERROR_SUCCESS {
                break;
            }
            idx += 1;
            out.push(String::from_utf16_lossy(&name[..len as usize]));
        }
        out
    }

    /// 读 REG_SZ；失败或类型不符返回 None
    fn get_sz(&self, name: &str) -> Option<String> {
        use windows::core::PCWSTR;
        use windows::Win32::System::Registry::{RegQueryValueExW, REG_SZ};
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let mut ty = windows::Win32::System::Registry::REG_VALUE_TYPE::default();
        let mut data = [0u8; 2048];
        let mut len = data.len() as u32;
        let rc = unsafe {
            RegQueryValueExW(
                self.0,
                PCWSTR(wide.as_ptr()),
                None,
                Some(&mut ty),
                Some(data.as_mut_ptr()),
                Some(&mut len),
            )
        };
        if rc != ERROR_SUCCESS || ty != REG_SZ || len as usize > data.len() {
            return None;
        }
        let bytes = &data[..len as usize];
        let mut u16s = Vec::with_capacity(bytes.len() / 2);
        for chunk in bytes.chunks_exact(2) {
            u16s.push(u16::from_le_bytes([chunk[0], chunk[1]]));
        }
        let s = String::from_utf16_lossy(&u16s);
        let s = s.trim_end_matches('\0').trim().to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }

    fn get_dword(&self, name: &str) -> Option<u32> {
        use windows::core::PCWSTR;
        use windows::Win32::System::Registry::{RegQueryValueExW, REG_DWORD};
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let mut ty = windows::Win32::System::Registry::REG_VALUE_TYPE::default();
        let mut data = [0u8; 4];
        let mut len = data.len() as u32;
        let rc = unsafe {
            RegQueryValueExW(
                self.0,
                PCWSTR(wide.as_ptr()),
                None,
                Some(&mut ty),
                Some(data.as_mut_ptr()),
                Some(&mut len),
            )
        };
        if rc != ERROR_SUCCESS || ty != REG_DWORD {
            return None;
        }
        Some(u32::from_le_bytes(data))
    }
}

#[cfg(windows)]
impl Drop for RegKey {
    fn drop(&mut self) {
        use windows::Win32::System::Registry::RegCloseKey;
        unsafe {
            let _ = RegCloseKey(self.0);
        }
    }
}

/// 卸载表路径（HKLM 64 / HKLM 32 / HKCU）
const UNINSTALL_SUB: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
/// App Paths 路径
const APP_PATHS_SUB: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths";

/// DisplayIcon 常写成 `"C:\x\app.exe",0` —— 去引号、去图标索引
fn clean_icon_path(icon: &str) -> Option<String> {
    let s = icon.trim().trim_matches('"').trim();
    if s.is_empty() {
        return None;
    }
    let s = match s.rfind(',') {
        Some(i) if s[i + 1..].trim().chars().all(|c| c.is_ascii_digit() || c == '-') => &s[..i],
        _ => s,
    };
    let s = s.trim().trim_matches('"').trim();
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

/// Windows 更新补丁 / 系统补丁不是应用
fn is_patch(display: &str) -> bool {
    let d = display.to_lowercase();
    let kb =
        d.starts_with("kb") && d.chars().nth(2).map(|c| c.is_ascii_digit()).unwrap_or(false);
    kb || d.contains("security update")
        || d.contains("update for")
        || d.contains("修补程序")
        || d.contains("hotfix")
}

/// 从卸载表记录里解出可执行文件路径：DisplayIcon 优先，退到 InstallLocation
#[cfg(windows)]
fn uninstall_exe(key: &RegKey) -> Option<String> {
    let icon = key.get_sz("DisplayIcon").unwrap_or_default();
    let p = clean_icon_path(&icon)?;
    if is_exe_file(&p) {
        return Some(p);
    }
    // InstallLocation + DisplayIcon 的文件名（部分软件 DisplayIcon 是相对/旧路径）
    let loc = key.get_sz("InstallLocation").unwrap_or_default();
    let loc = loc.trim().trim_matches('"');
    if !loc.is_empty() {
        if let Some(file) = Path::new(&p).file_name().and_then(|f| f.to_str()) {
            let cand = Path::new(loc).join(file);
            if is_exe_file(&cand.to_string_lossy()) {
                return Some(cand.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// 卸载表：DisplayName 是【本地化】的应用名（微信 / 企业微信 / Visual Studio Code），
/// 覆盖开始菜单没有快捷方式、也没注册 App Paths 的软件——「搜不到微信」的根因就在这。
#[cfg(windows)]
fn apps_from_uninstall() -> Vec<InstalledApp> {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    let mut apps = Vec::new();
    for (hive, wow32) in [
        (HKEY_LOCAL_MACHINE, false),
        (HKEY_LOCAL_MACHINE, true),
        (HKEY_CURRENT_USER, false),
    ] {
        let Some(root) = RegKey::open(hive, UNINSTALL_SUB, wow32) else {
            continue;
        };
        for name in root.subkeys() {
            let Some(key) = root.open_sub(&name) else { continue };
            // 系统组件（如 .NET 运行时的隐藏项）不算应用
            if key.get_dword("SystemComponent") == Some(1) {
                continue;
            }
            let Some(display) = key.get_sz("DisplayName") else { continue };
            let display = display.trim().to_string();
            if display.is_empty() || is_patch(&display) {
                continue;
            }
            let Some(exe) = uninstall_exe(&key) else { continue };
            apps.push(InstalledApp {
                name: display,
                exe,
                kind: AppKind::Other,
                icon: None,
                keywords: None,
            });
        }
    }
    apps
}

/// App Paths 注册表（HKLM 64 / HKLM 32 / HKCU），名称退化为文件主名
#[cfg(windows)]
fn apps_from_registry() -> Vec<InstalledApp> {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    let mut apps = Vec::new();
    for (hive, wow32) in [
        (HKEY_LOCAL_MACHINE, false),
        (HKEY_LOCAL_MACHINE, true),
        (HKEY_CURRENT_USER, false),
    ] {
        let Some(root) = RegKey::open(hive, APP_PATHS_SUB, wow32) else {
            continue;
        };
        for name in root.subkeys() {
            let Some(key) = root.open_sub(&name) else { continue };
            let Some(raw) = key.get_sz("") else { continue };
            let s = raw.trim().trim_matches('"').trim().to_string();
            if s.is_empty() || !s.to_lowercase().ends_with(".exe") {
                continue;
            }
            let display = Path::new(&s)
                .file_stem()
                .and_then(|x| x.to_str())
                .map(|x| x.to_string())
                .unwrap_or_else(|| name.clone());
            apps.push(InstalledApp {
                name: display,
                exe: s,
                kind: AppKind::Other,
                icon: None,
                keywords: None,
            });
        }
    }
    apps
}

/* ---------------- 汇总 ---------------- */

/// 汇总结果上限（图标按需提取，数量不再是性能瓶颈；留上限只为内存与列表噪声）
const MAX_APPS: usize = 500;

/// 汇总四个来源（开始菜单 > 桌面 > 卸载表 > App Paths），按 exe 去重；
/// 去重时保留信息量更大的显示名并合并关键词；随后补别名、分类、排序。
///
/// 刻意【不在扫描里提取图标】：ExtractIconExW 是唯一的重活（300 个约 2s），
/// 会把面板首屏拖到秒级。图标改为磁盘缓存 + 按需提取（见 app_icons），
/// 于是每次启动都可以放心地完整重扫一遍——新装的软件立刻能搜到。
fn collect_installed_apps() -> Vec<InstalledApp> {
    let started = std::time::Instant::now();
    let mut apps: Vec<InstalledApp> = Vec::new();
    #[cfg(windows)]
    {
        apps.extend(apps_from_start_menu());
        apps.extend(apps_from_desktop());
        apps.extend(apps_from_uninstall());
        apps.extend(apps_from_registry());
    }

    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut out: Vec<InstalledApp> = Vec::new();
    for mut app in apps {
        app.exe = app.exe.trim().to_string();
        app.name = app.name.trim().to_string();
        if !is_exe_file(&app.exe) || is_junk(&app.name, &app.exe) {
            continue;
        }
        let key = app.exe.to_lowercase();
        match seen.get(&key) {
            None => {
                seen.insert(key, out.len());
                out.push(app);
            }
            Some(&idx) => {
                let prev = &mut out[idx];
                if better_name(&app.name, &prev.name) {
                    prev.name = app.name;
                }
                let merged = [
                    prev.keywords.clone().unwrap_or_default(),
                    app.keywords.unwrap_or_default(),
                ]
                .join(" ")
                .trim()
                .to_string();
                prev.keywords = if merged.is_empty() { None } else { Some(merged) };
            }
        }
    }

    for app in &mut out {
        if let Some(alias) = alias_for(&app.exe) {
            app.keywords = Some(match app.keywords.take() {
                Some(k) => format!("{k} {alias}"),
                None => alias.to_string(),
            });
        }
        app.kind = classify_app(&app.name, &app.exe);
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
    if out.len() > MAX_APPS {
        out.truncate(MAX_APPS);
    }
    crate::storage::diag_write(&format!(
        "[apps] scan {} in {}ms",
        out.len(),
        started.elapsed().as_millis()
    ));
    out
}

/* ---------------- 图标：磁盘缓存 + 按需提取 ---------------- */

/// 图标缓存结构版本：结构变更时整体丢弃重建
const ICON_CACHE_V: u32 = 1;
/// 后台一次最多补多少个图标，避免首次安装后长时间占用后台线程
const ICON_FILL_LIMIT: usize = 160;

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
    let mut png: Vec<u8> = Vec::new();
    image::png::PngEncoder::new(&mut png)
        .write_image(&rgba, 32, 32, image::ExtendedColorType::Rgba8)
        .ok()?;
    Some(format!("data:image/png;base64,{}", B64.encode(&png)))
}

/// 图标磁盘缓存：exe 路径 → data URL
#[derive(Default, serde::Serialize, serde::Deserialize)]
struct AppIconCache {
    v: u32,
    icons: std::collections::HashMap<String, String>,
}

/// 进程内图标缓存（先查内存、再落磁盘），懒加载一次
fn icon_map() -> std::sync::MutexGuard<'static, Option<std::collections::HashMap<String, String>>> {
    static ICONS: std::sync::Mutex<Option<std::collections::HashMap<String, String>>> =
        std::sync::Mutex::new(None);
    let mut guard = ICONS.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        let loaded: AppIconCache =
            crate::storage::load_json(&icon_cache_file(), AppIconCache::default());
        *guard = Some(if loaded.v == ICON_CACHE_V {
            loaded.icons
        } else {
            std::collections::HashMap::new()
        });
    }
    guard
}

fn icon_cache_file() -> std::path::PathBuf {
    crate::storage::AppPaths::resolve()
        .data_dir
        .join("apps_cache.json")
}

fn cached_icon(exe: &str) -> Option<String> {
    icon_map().as_ref().and_then(|m| m.get(exe).cloned())
}

fn save_icon_cache() {
    let snapshot = icon_map().clone().unwrap_or_default();
    let payload = AppIconCache {
        v: ICON_CACHE_V,
        icons: snapshot,
    };
    let _ = crate::storage::save_json(&icon_cache_file(), &payload);
}

/// 为给定的 exe 列表取图标：命中缓存直接返回，未命中的现场提取并写回缓存
fn extract_icons(exes: &[String]) -> std::collections::HashMap<String, String> {
    let mut out = std::collections::HashMap::new();
    for exe in exes {
        if let Some(icon) = cached_icon(exe) {
            out.insert(exe.clone(), icon);
            continue;
        }
        #[cfg(windows)]
        if let Some(icon) = app_icon_data_url(exe) {
            if let Some(m) = icon_map().as_mut() {
                m.insert(exe.clone(), icon.clone());
            }
            out.insert(exe.clone(), icon);
        }
    }
    out
}

/// 后台补齐缺失图标（限 ICON_FILL_LIMIT 个，做一次即写回磁盘）
fn schedule_icon_fill(exes: Vec<String>) {
    static FILLING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if FILLING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let pending: Vec<String> = {
            let map = icon_map();
            exes
                .into_iter()
                .filter(|e| !map.as_ref().map(|m| m.contains_key(e)).unwrap_or(false))
                .take(ICON_FILL_LIMIT)
                .collect()
        };
        if !pending.is_empty() {
            let started = std::time::Instant::now();
            let got = tauri::async_runtime::spawn_blocking(move || extract_icons(&pending)).await;
            if let Ok(map) = got {
                crate::storage::diag_write(&format!(
                    "[apps] icon fill {} in {}ms",
                    map.len(),
                    started.elapsed().as_millis()
                ));
            }
            save_icon_cache();
        }
        FILLING.store(false, std::sync::atomic::Ordering::SeqCst);
    });
}

/// 枚举本机已安装应用，供命令面板搜索启动与设置页选择默认打开程序。
/// 来源：开始菜单 .lnk + 桌面 .lnk + 卸载表（DisplayName 本地化名）+ App Paths；
/// 过滤安装器/更新器/系统组件，常用编辑器排在最先。
///
/// 每次启动都完整重扫一遍（快捷方式与注册表都是纯文件系统 / 注册表枚举，
/// 实测百毫秒级），新装的软件立刻可搜；图标不在这条路径上提取，走磁盘缓存
/// + 按需补，避免 300 次 ExtractIconExW 把首屏拖到秒级。
#[tauri::command]
pub async fn list_installed_apps() -> Result<Vec<InstalledApp>, String> {
    let mut apps = tauri::async_runtime::spawn_blocking(collect_installed_apps)
        .await
        .map_err(|e| format!("扫描本机应用失败：{e}"))?;
    for a in &mut apps {
        a.icon = cached_icon(&a.exe);
    }
    schedule_icon_fill(apps.iter().map(|a| a.exe.clone()).collect());
    Ok(apps)
}

/// 按需取应用图标（命令面板只渲染可见的几行，设置页下拉全量拉一次）。
/// 返回 exe 路径 → 32×32 PNG data URL；取不到的不出现在结果里。
#[tauri::command]
pub async fn app_icons(
    exes: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let cached: std::collections::HashMap<String, String> = exes
        .iter()
        .filter_map(|e| cached_icon(e).map(|i| (e.clone(), i)))
        .collect();
    let missing: Vec<String> = exes
        .iter()
        .filter(|e| !cached.contains_key(*e))
        .cloned()
        .collect();
    if missing.is_empty() {
        return Ok(cached);
    }
    let started = std::time::Instant::now();
    let fresh = tauri::async_runtime::spawn_blocking(move || extract_icons(&missing))
        .await
        .map_err(|e| format!("提取应用图标失败：{e}"))?;
    crate::storage::diag_write(&format!(
        "[apps] icons {} in {}ms",
        fresh.len(),
        started.elapsed().as_millis()
    ));
    if !fresh.is_empty() {
        save_icon_cache();
    }
    let mut out = cached;
    out.extend(fresh);
    Ok(out)
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
    cmd.spawn().map_err(|e| format!("启动失败：{e}"))?;
    Ok(())
}
