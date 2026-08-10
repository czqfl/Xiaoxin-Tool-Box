//! 文件夹快捷访问：固定列表、访问统计、打开/终端打开/复制路径。
use crate::clipboard::SUPPRESS_WATCH;
use crate::storage::{save_json, AppPaths};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

/// 每个文件夹最多保留的访问历史时间戳数量
const MAX_VISIT_HISTORY: usize = 100;

/// 文件夹数据变化事件（资源管理器追踪新增/计数时广播，前端据此刷新）
pub const EVT_CHANGED: &str = "folder://changed";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    /// 颜色标签（CSS 颜色值），可选
    pub color: Option<String>,
    /// 是否固定（固定项始终在前，按 order 排序）
    pub pinned: bool,
    /// 固定区排序权重，越小越靠前
    pub order: i32,
    /// 累计访问次数
    pub visit_count: u32,
    /// 最近访问时间（unix 毫秒）
    pub last_visit: i64,
    /// 最近的访问时间戳，用于"最常访问"智能排序
    pub visits: Vec<i64>,
    /// 用户添加时间，保证稳定排序
    pub created_at: i64,
}

pub struct FolderStore(pub Mutex<Vec<FolderEntry>>);

type CmdResult = Result<(), String>;

fn persist(entries: &[FolderEntry], paths: &AppPaths) -> CmdResult {
    save_json(&paths.folders_file, entries).map_err(|e| format!("保存失败：{e}"))
}

#[tauri::command]
pub fn folder_list(store: State<'_, FolderStore>) -> Vec<FolderEntry> {
    store.0.lock().unwrap().clone()
}

/// 添加文件夹：校验目录存在性与重复。
/// 已存在于列表中（如右侧“常用访问区”由资源管理器追踪自动登记的条目）
/// 但尚未固定时，直接将其提升为固定，而非报错——用户意图是加进固定区。
#[tauri::command]
pub fn folder_add(
    path: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> Result<FolderEntry, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err("该路径不是有效的文件夹".into());
    }
    let canonical = path.trim_end_matches(['\\', '/']).to_string();
    let mut entries = store.0.lock().unwrap();
    // 固定区排序权重：新固定项排在末尾
    let max_order = entries.iter().map(|e| e.order).max().unwrap_or(-1);
    if let Some(existing) = entries
        .iter_mut()
        .find(|e| e.path.eq_ignore_ascii_case(&canonical))
    {
        if existing.pinned {
            return Err("该文件夹已在固定区中".into());
        }
        // 在常用访问区里 → 提升为固定（排在固定区末尾）
        existing.pinned = true;
        existing.order = max_order + 1;
        let result = existing.clone();
        persist(&entries, &paths)?;
        return Ok(result);
    }
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.clone());
    let entry = FolderEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path: canonical,
        color: None,
        pinned: true,
        order: max_order + 1,
        visit_count: 0,
        last_visit: 0,
        visits: vec![],
        created_at: chrono::Utc::now().timestamp_millis(),
    };
    entries.push(entry.clone());
    persist(&entries, &paths)?;
    Ok(entry)
}

#[tauri::command]
pub fn folder_remove(
    id: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    let mut entries = store.0.lock().unwrap();
    entries.retain(|e| e.id != id);
    persist(&entries, &paths)
}

#[tauri::command]
pub fn folder_rename(
    id: String,
    name: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    let mut entries = store.0.lock().unwrap();
    if let Some(e) = entries.iter_mut().find(|e| e.id == id) {
        if !name.trim().is_empty() {
            e.name = name.trim().to_string();
        }
    }
    persist(&entries, &paths)
}

#[tauri::command]
pub fn folder_set_color(
    id: String,
    color: Option<String>,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    let mut entries = store.0.lock().unwrap();
    if let Some(e) = entries.iter_mut().find(|e| e.id == id) {
        e.color = color;
    }
    persist(&entries, &paths)
}

#[tauri::command]
pub fn folder_toggle_pin(
    id: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    let mut entries = store.0.lock().unwrap();
    let max_order = entries.iter().map(|x| x.order).max().unwrap_or(-1);
    if let Some(e) = entries.iter_mut().find(|e| e.id == id) {
        e.pinned = !e.pinned;
        if e.pinned {
            e.order = max_order + 1;
        }
    }
    persist(&entries, &paths)
}

/// 置顶到固定区最前
#[tauri::command]
pub fn folder_move_to_top(
    id: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    let mut entries = store.0.lock().unwrap();
    let min_order = entries.iter().map(|e| e.order).min().unwrap_or(0);
    if let Some(e) = entries.iter_mut().find(|e| e.id == id) {
        e.pinned = true;
        e.order = min_order - 1;
    }
    persist(&entries, &paths)
}

/// 拖拽排序：按传入的 id 顺序重排固定区
#[tauri::command]
pub fn folder_reorder(
    ids: Vec<String>,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    let mut entries = store.0.lock().unwrap();
    for (idx, id) in ids.iter().enumerate() {
        if let Some(e) = entries.iter_mut().find(|e| &e.id == id) {
            e.order = idx as i32;
        }
    }
    persist(&entries, &paths)
}

/// 记录一次访问（时间戳用于智能排序）。
/// 由后端在打开文件夹时统一计数，避免前端先隐藏窗口导致计数请求漏发；
/// 条目不存在时自动登记（资源管理器全局追踪用），返回是否有变化。
pub(crate) fn register_visit(entries: &mut Vec<FolderEntry>, path: &str, now: i64) -> bool {
    let canonical = path.trim_end_matches(['\\', '/']);
    if let Some(e) = entries
        .iter_mut()
        .find(|e| e.path.eq_ignore_ascii_case(canonical))
    {
        e.visit_count += 1;
        e.last_visit = now;
        e.visits.push(now);
        if e.visits.len() > MAX_VISIT_HISTORY {
            let drain = e.visits.len() - MAX_VISIT_HISTORY;
            e.visits.drain(..drain);
        }
        return true;
    }
    // 未登记的目录自动加入列表（不固定），由"最常访问"分区按次数排序展示
    let dir = Path::new(canonical);
    if !dir.is_dir() {
        return false;
    }
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.to_string());
    entries.push(FolderEntry {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path: canonical.to_string(),
        color: None,
        pinned: false,
        order: 0,
        visit_count: 1,
        last_visit: now,
        visits: vec![now],
        created_at: now,
    });
    true
}

/// 通过系统默认文件管理器打开文件夹（错误兜底，不抛崩溃），同时记录一次访问
#[tauri::command]
pub fn folder_open(
    app: tauri::AppHandle,
    path: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    if !Path::new(&path).is_dir() {
        return Err("文件夹不存在或已被移动".into());
    }
    {
        let mut entries = store.0.lock().unwrap();
        if register_visit(&mut entries, &path, chrono::Utc::now().timestamp_millis()) {
            persist(&entries, &paths)?;
        }
    }
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| format!("打开失败：{e}"))
}

/// 在终端中打开（默认：优先 Windows Terminal，回退 cmd），同时记录一次访问
#[tauri::command]
pub fn folder_open_in_terminal(
    path: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    folder_open_in_terminal_with(path, "wt".into(), store, paths)
}

/// 在指定终端中打开文件夹：shell 取 "wt" | "cmd" | "powershell"，同时记录一次访问
#[tauri::command]
pub fn folder_open_in_terminal_with(
    path: String,
    shell: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    if !Path::new(&path).is_dir() {
        return Err("文件夹不存在或已被移动".into());
    }
    {
        let mut entries = store.0.lock().unwrap();
        if register_visit(&mut entries, &path, chrono::Utc::now().timestamp_millis()) {
            persist(&entries, &paths)?;
        }
    }
    open_in_shell(&path, &shell)
}

/// 拉起指定终端进程。Windows 下用 CREATE_NEW_CONSOLE 新开独立控制台窗口，
/// 避免子进程继承宿主（无控制台窗口）环境导致看不到终端。
#[cfg(windows)]
fn open_in_shell(path: &str, shell: &str) -> CmdResult {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

    match shell {
        "cmd" => {
            let cmd = format!("cd /d \"{}\"", path.replace('"', "\"\""));
            Command::new("cmd")
                .args(["/k", &cmd])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .map_err(|e| format!("打开命令提示符失败：{e}"))?;
        }
        "powershell" => {
            // 单引号内按 PowerShell 转义规则将 ' 翻倍
            let cmd = format!("Set-Location -LiteralPath '{}'", path.replace('\'', "''"));
            Command::new("powershell")
                .args(["-NoExit", "-Command", &cmd])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .map_err(|e| format!("打开 PowerShell 失败：{e}"))?;
        }
        _ => {
            // Windows Terminal；未安装时回退 cmd
            if Command::new("wt")
                .arg("-d")
                .arg(path)
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .is_err()
            {
                let cmd = format!("cd /d \"{}\"", path.replace('"', "\"\""));
                Command::new("cmd")
                    .args(["/k", &cmd])
                    .creation_flags(CREATE_NEW_CONSOLE)
                    .spawn()
                    .map_err(|e| format!("打开终端失败：{e}"))?;
            }
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn open_in_shell(_path: &str, _shell: &str) -> CmdResult {
    Err("当前平台暂不支持在终端中打开".into())
}

/// 在默认终端中执行命令（如 git 命令）：进入目录后执行，窗口保留直接展示输出。
/// 不记录访问次数——执行命令是主动操作，与打开/浏览无关。
#[tauri::command]
pub fn folder_git_exec(path: String, command: String, shell: String) -> CmdResult {
    if !Path::new(&path).is_dir() {
        return Err("文件夹不存在或已被移动".into());
    }
    exec_in_shell(&path, &shell, &command)
}

/// 拉起终端并执行命令：复用 open_in_shell 的壳，进入目录后追加命令。
/// 命令执行失败时错误信息同样显示在终端窗口内，反馈天然可见。
#[cfg(windows)]
fn exec_in_shell(path: &str, shell: &str, command: &str) -> CmdResult {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

    match shell {
        "cmd" => {
            // /d 忽略自动运行命令，/s 保持引号原样，/k 执行后保留窗口
            let cmd_line = format!("cd /d \"{}\" && {command}", path.replace('"', "\"\""));
            Command::new("cmd")
                .args(["/d", "/s", "/k", &cmd_line])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .map_err(|e| format!("打开命令提示符失败：{e}"))?;
        }
        "powershell" => {
            // 单引号内按 PowerShell 转义规则将 ' 翻倍
            let cmd_line = format!(
                "Set-Location -LiteralPath '{}'; {command}",
                path.replace('\'', "''")
            );
            Command::new("powershell")
                .args(["-NoExit", "-Command", &cmd_line])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .map_err(|e| format!("打开 PowerShell 失败：{e}"))?;
        }
        _ => {
            // Windows Terminal；未安装时回退 cmd
            let cmd_line = format!(
                "Set-Location -LiteralPath '{}'; {command}",
                path.replace('\'', "''")
            );
            if Command::new("wt")
                .args(["-d", path, "powershell", "-NoExit", "-Command", &cmd_line])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .is_err()
            {
                let cmd_line =
                    format!("cd /d \"{}\" && {command}", path.replace('"', "\"\""));
                Command::new("cmd")
                    .args(["/d", "/s", "/k", &cmd_line])
                    .creation_flags(CREATE_NEW_CONSOLE)
                    .spawn()
                    .map_err(|e| format!("打开终端失败：{e}"))?;
            }
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn exec_in_shell(_path: &str, _shell: &str, _command: &str) -> CmdResult {
    Err("当前平台暂不支持在终端中执行命令".into())
}

/// 复制文件夹路径到剪贴板（不触发剪贴板重复记录）
#[tauri::command]
pub fn folder_copy_path(path: String) -> CmdResult {
    let mut cb = arboard::Clipboard::new().map_err(|e| format!("访问剪贴板失败：{e}"))?;
    SUPPRESS_WATCH.store(true, Ordering::SeqCst);
    if let Err(e) = cb.set_text(path) {
        SUPPRESS_WATCH.store(false, Ordering::SeqCst);
        return Err(format!("复制失败：{e}"));
    }
    Ok(())
}

/// 在指定编辑器中打开文件夹：editor 取 "code" | "idea" | "webstorm"，同时记录一次访问。
/// VS Code 优先用 PATH 中的 code 命令（无窗口闪动），失败回退标准安装路径的 Code.exe；
/// JetBrains 系列在常见安装根目录下按目录名前缀探测可执行文件。
#[tauri::command]
pub fn folder_open_in_editor(
    path: String,
    editor: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    if !Path::new(&path).is_dir() {
        return Err("文件夹不存在或已被移动".into());
    }
    {
        let mut entries = store.0.lock().unwrap();
        if register_visit(&mut entries, &path, chrono::Utc::now().timestamp_millis()) {
            persist(&entries, &paths)?;
        }
    }
    match editor.as_str() {
        "code" => open_vscode(&path),
        "idea" => open_jetbrains(&path, "IntelliJ IDEA", "idea64.exe"),
        "webstorm" => open_jetbrains(&path, "WebStorm", "webstorm64.exe"),
        _ => Err(format!("不支持的编辑器：{editor}")),
    }
}

/// 用 VS Code 打开：PATH 中的 code 命令优先，回退安装目录里的 Code.exe
fn open_vscode(path: &str) -> CmdResult {
    if Command::new("code").arg(path).spawn().is_ok() {
        return Ok(());
    }
    // 回退：标准安装位置（LOCALAPPDATA 优先，Program Files 次之）
    let roots = [
        std::env::var("LOCALAPPDATA")
            .map(|d| format!("{d}\\Programs\\Microsoft VS Code"))
            .ok(),
        std::env::var("ProgramFiles")
            .map(|d| format!("{d}\\Microsoft VS Code"))
            .ok(),
    ];
    for root in roots.into_iter().flatten() {
        let exe = Path::new(&root).join("Code.exe");
        if exe.is_file() {
            return Command::new(exe)
                .arg(path)
                .spawn()
                .map(|_| ())
                .map_err(|e| format!("启动 VS Code 失败：{e}"));
        }
    }
    Err("未检测到 VS Code：请确认已安装，并在 VS Code 中执行「Command Palette → Shell 命令: 在 PATH 中安装 code 命令」".into())
}

/// 在 JetBrains 系 IDE 中打开：常见安装根 + 固定盘 JetBrains 目录，深度受限探测。
/// 兼容三种安装形态：
/// - 传统安装：Program Files\JetBrains\IntelliJ IDEA 2024.1\bin\idea64.exe
/// - Toolbox 安装：%LOCALAPPDATA%\JetBrains\Toolbox\apps\IDEA-U\ch-0\242.x\bin\idea64.exe
/// - 自定义盘符：D:\JetBrains\...（任意非系统盘根下的 JetBrains 目录）
fn open_jetbrains(path: &str, display: &str, exe_name: &str) -> CmdResult {
    let mut roots: Vec<PathBuf> = vec![
        std::env::var("ProgramFiles").unwrap_or_default().into(),
        std::env::var("ProgramFiles(x86)").unwrap_or_default().into(),
    ];
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(format!("{local}\\Programs")));
        roots.push(PathBuf::from(format!("{local}\\JetBrains\\Toolbox\\apps")));
    }
    // 固定盘根下的 JetBrains 目录：自定义安装（如 D:\JetBrains）
    for drive in b'A'..=b'Z' {
        let root = PathBuf::from(format!("{}\\JetBrains", drive as char));
        if root.is_dir() {
            roots.push(root);
        }
    }
    let mut found: Option<PathBuf> = None;
    for root in &roots {
        if find_editor_exe(root, exe_name, 0, &mut found) {
            break;
        }
    }
    match found {
        Some(exe) => Command::new(exe)
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("启动 {display} 失败：{e}")),
        None => Err(format!(
            "未检测到 {display}：请确认已安装（支持 Toolbox 与自定义安装目录）"
        )),
    }
}

/// 深度受限查找 bin/{exe_name}：只深入 JetBrains 家族 / Toolbox 渠道 / 版本号目录，
/// 避免在 Program Files 等大目录里无谓全量扫描；找到即停止。
fn find_editor_exe(
    dir: &Path,
    exe_name: &str,
    depth: usize,
    out: &mut Option<PathBuf>,
) -> bool {
    if depth > 5 || out.is_some() {
        return false;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        // 当前目录就带 bin/{exe_name}：直接命中
        if p.join("bin").join(exe_name).is_file() {
            *out = Some(p.join("bin").join(exe_name));
            return true;
        }
        // 只深入有希望的目录：JetBrains 家族 / Toolbox 渠道 / 版本号目录
        let lower = name.to_ascii_lowercase();
        let promising = lower.starts_with("idea")
            || lower.starts_with("webstorm")
            || lower.starts_with("intellij")
            || lower.starts_with("jetbrains")
            || lower.starts_with("toolbox")
            || lower == "apps"
            || lower.starts_with("ch-")
            || name.chars().next().is_some_and(|c| c.is_ascii_digit());
        if promising && find_editor_exe(&p, exe_name, depth + 1, out) {
            return true;
        }
    }
    false
}

/// 批量读取文件夹的 Git 当前分支（非仓库返回 None）。
/// 读取 .git/HEAD 而非执行 git 命令：无外部依赖、毫秒级返回；
/// 支持普通仓库（.git 目录）与子模块/工作树（.git 为指向真实 gitdir 的文本文件）。
#[tauri::command]
pub fn folder_git_branches(paths: Vec<String>) -> Vec<Option<String>> {
    paths.iter().map(|p| git_branch_of(p)).collect()
}

fn git_branch_of(path: &str) -> Option<String> {
    let git_dir = Path::new(path).join(".git");
    let head_path = if git_dir.is_dir() {
        git_dir.join("HEAD")
    } else if git_dir.is_file() {
        // gitdir: <相对路径> 形式，指向真实仓库目录
        let content = std::fs::read_to_string(&git_dir).ok()?;
        let real = content.strip_prefix("gitdir:")?.trim();
        Path::new(path).join(real).join("HEAD")
    } else {
        return None;
    };
    let content = std::fs::read_to_string(head_path).ok()?;
    let line = content.lines().next()?.trim();
    if let Some(branch) = line.strip_prefix("ref: refs/heads/") {
        Some(branch.to_string())
    } else if !line.is_empty() {
        // detached HEAD：显示短哈希
        Some(line.chars().take(8).collect())
    } else {
        None
    }
}
