//! 文件夹快捷访问：固定列表、访问统计、打开/终端打开/复制路径。
use crate::clipboard::SUPPRESS_WATCH;
use crate::config::ConfigState;
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

/// 单条命令执行结果（面板内友好展示用）
#[derive(Serialize)]
pub struct GitRunResult {
    /// 命令原文（如 "git status"）
    pub command: String,
    /// 是否执行成功（退出码 0）
    pub ok: bool,
    /// 标准输出（已 trim）
    pub stdout: String,
    /// 标准错误（已 trim）
    pub stderr: String,
    /// 退出码；命令启动失败时为 None
    pub code: Option<i32>,
}

/// 【面板内】逐条执行命令（git 等）并捕获输出，返回每条结果——
/// 替代"开新终端看输出"：终端方式多条命令拼一行滚动太快只能看到末尾，
/// 面板内逐条执行、每条独立展示结果，看得更清楚（用户反馈）。
///
/// 执行 shell 用 **PowerShell（加载用户 $PROFILE）** 而非 cmd：用户自己的
/// 代理/SSH 等网络配置常在 PowerShell 环境（$PROFILE 或会话变量）生效，
/// cmd 子进程继承不到 → git push 直连 GitHub 失败（"连接不上"）；用
/// PowerShell 与用户手动执行的环境一致，能连则这里也能连。
#[tauri::command]
pub fn folder_git_run(path: String, commands: Vec<String>) -> Result<Vec<GitRunResult>, String> {
    if !Path::new(&path).is_dir() {
        return Err("文件夹不存在或已被移动".into());
    }
    let mut results = Vec::new();
    for line in commands {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // PowerShell -NoLogo -Command <line>：当前目录执行并捕获输出。
        // 不传 -NoProfile：加载用户 $PROFILE（代理等网络配置随环境生效）
        let out = Command::new("powershell")
            .args(["-NoLogo", "-Command", line])
            .current_dir(&path)
            .output();
        match out {
            Ok(o) => results.push(GitRunResult {
                command: line.to_string(),
                ok: o.status.success(),
                stdout: String::from_utf8_lossy(&o.stdout).trim().to_string(),
                stderr: String::from_utf8_lossy(&o.stderr).trim().to_string(),
                code: o.status.code(),
            }),
            Err(e) => results.push(GitRunResult {
                command: line.to_string(),
                ok: false,
                stdout: String::new(),
                stderr: format!("命令启动失败：{e}"),
                code: None,
            }),
        }
    }
    Ok(results)
}

/// 拉起终端并执行命令：复用 open_in_shell 的壳，进入目录后追加命令。
/// 命令执行失败时错误信息同样显示在终端窗口内，反馈天然可见。
///
/// 两条体验设计（用户反馈）：
/// - 先弹窗后执行：打开终端、停在目录、清屏，延迟约 1 秒后再执行命令，
///   输出从第一行开始呈现，而不是窗口弹出时已经刷到末尾；
/// - 单行整洁显示：cmd 用 @echo off + cls 抑制启动回显，只显示一行
///   `$ git xxx` 再执行，命令与输出一目了然，不换行不杂乱。
///
/// 命令支持用换行符 `\n` 分隔多条（如 add+commit+push 一条龙），
/// 按当前 shell 的正确分隔符拼接：cmd 用 `&`，PowerShell 用 `;`（兼容 5.1，
/// 5.1 不支持 `&&`）。
#[cfg(windows)]
fn exec_in_shell(path: &str, shell: &str, command: &str) -> CmdResult {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

    // 多命令：按 \n 拆开去空行；显示与执行都用当前 shell 的分隔符拼成一行
    let parts: Vec<&str> = command
        .split('\n')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    if parts.is_empty() {
        return Err("命令为空".into());
    }
    let (sep, join) = if shell == "cmd" { (" & ", " & ") } else { ("; ", "; ") };
    let exec_line = parts.join(join);
    let shown_line = format!("$ {}", parts.join(sep));

    match shell {
        "cmd" => {
            // @echo off：整行因 @ 前缀不回显；cls 清掉启动痕迹；timeout 1 秒让窗口
            // 先停在目录，再执行命令，输出从头滚动（缓冲已扩到 9999 行可回看全量）
            let cmd_line = format!(
                "@echo off & mode con: cols=150 lines=9999 & cls & cd /d \"{}\" & echo. & echo {shown_line} & timeout /t 1 /nobreak >nul & {exec_line}",
                path.replace('"', "\"\"")
            );
            Command::new("cmd")
                .args(["/d", "/s", "/k", &cmd_line])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .map_err(|e| format!("打开命令提示符失败：{e}"))?;
        }
        "powershell" => {
            // Clear-Host 清屏；Write-Host 先显示一行命令；Start-Sleep 给窗口建立时间
            let cmd_line = format!(
                "$Host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(150,9999); Clear-Host; Set-Location -LiteralPath '{}'; Write-Host ''; Write-Host '{shown_line}'; Start-Sleep -Milliseconds 800; {exec_line}",
                path.replace('\'', "''")
            );
            Command::new("powershell")
                .args(["-NoExit", "-Command", &cmd_line])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .map_err(|e| format!("打开 PowerShell 失败：{e}"))?;
        }
        _ => {
            // Windows Terminal；未安装时回退 cmd。wt 窗口较宽，命令执行沿用 PowerShell 分支逻辑
            let cmd_line = format!(
                "$Host.UI.RawUI.BufferSize = New-Object System.Management.Automation.Host.Size(150,9999); Clear-Host; Set-Location -LiteralPath '{}'; Write-Host ''; Write-Host '{shown_line}'; Start-Sleep -Milliseconds 800; {exec_line}",
                path.replace('\'', "''")
            );
            if Command::new("wt")
                .args(["-d", path, "powershell", "-NoExit", "-Command", &cmd_line])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .is_err()
            {
                let cmd_line = format!(
                    "@echo off & cls & cd /d \"{}\" & echo. & echo {shown_line} & timeout /t 1 /nobreak >nul & {exec_line}",
                    path.replace('"', "\"\"")
                );
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
    config: State<'_, ConfigState>,
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
        "code" => {
            let configured = config.0.lock().unwrap().folder.vscode_path.clone();
            open_vscode(&path, &configured)
        }
        "qoder" | "qodercn" => open_qoder(&path, editor.as_str()),
        "idea" => open_jetbrains(&path, "IntelliJ IDEA", "idea64.exe"),
        "webstorm" => open_jetbrains(&path, "WebStorm", "webstorm64.exe"),
        _ => Err(format!("不支持的编辑器：{editor}")),
    }
}

/// 记录用户手动指定的 VS Code 可执行文件路径（自动探测失败时前端引导选择后调用），
/// 持久化到配置，下次打开直接使用，不再需要重新定位。
#[tauri::command]
pub fn folder_set_vscode_path(
    path: String,
    paths: State<'_, AppPaths>,
    state: State<'_, ConfigState>,
) -> CmdResult {
    if !Path::new(&path).is_file() {
        return Err("指定的文件不存在".into());
    }
    let mut guard = state.0.lock().unwrap();
    guard.folder.vscode_path = Some(path);
    save_json(&paths.config_file, &*guard).map_err(|e| format!("保存配置失败：{e}"))?;
    Ok(())
}

/// 已安装编辑器探测结果（前端右键菜单据此动态渲染，只展示真实可用的项）
#[derive(Debug, Clone, Serialize)]
pub struct EditorInfo {
    pub key: String,
    pub label: String,
    pub exe: String,
}

/// 自动检测已安装的编辑器（只探测不启动）：VS Code → Qoder / QoderCN → JetBrains 系。
/// 探测顺序与 folder_open_in_editor 完全一致，菜单里显示的必然打得开。
#[tauri::command]
pub fn folder_detect_editors(config: State<'_, ConfigState>) -> Vec<EditorInfo> {
    let configured = config.0.lock().unwrap().folder.vscode_path.clone();
    let mut out = Vec::new();
    if let Some(exe) = probe_vscode(&configured) {
        out.push(EditorInfo {
            key: "code".into(),
            label: "VS Code".into(),
            exe: exe.display().to_string(),
        });
    }
    for (key, label, exe) in probe_qoder() {
        out.push(EditorInfo {
            key,
            label,
            exe: exe.display().to_string(),
        });
    }
    if let Some(exe) = probe_jetbrains("idea64.exe") {
        out.push(EditorInfo {
            key: "idea".into(),
            label: "IntelliJ IDEA".into(),
            exe: exe.display().to_string(),
        });
    }
    if let Some(exe) = probe_jetbrains("webstorm64.exe") {
        out.push(EditorInfo {
            key: "webstorm".into(),
            label: "WebStorm".into(),
            exe: exe.display().to_string(),
        });
    }
    out
}

/// 用 Qoder / QoderCN 打开：与 folder_detect_editors 共用 probe_qoder 探测，
/// 保证菜单里显示的就一定能打开。
fn open_qoder(path: &str, key: &str) -> CmdResult {
    match probe_qoder().into_iter().find(|(k, _, _)| k == key) {
        Some((_, label, exe)) => spawn_editor(&exe, path, &label),
        None => Err(format!("未检测到 {key}：请确认已安装")),
    }
}

/// 用 VS Code 打开：probe_vscode 探测到可执行文件后启动。
/// 全部失败返回特殊错误 "VSCodeNotFound"，前端据此引导用户手动选择 Code.exe 并记住路径。
fn open_vscode(path: &str, configured: &Option<String>) -> CmdResult {
    match probe_vscode(configured) {
        Some(exe) => spawn_editor(&exe, path, "VS Code"),
        None => Err("VSCodeNotFound".into()),
    }
}

/// 启动编辑器进程：.cmd/.bat（如 PATH 中的 code.cmd）用 cmd /c 包装，
/// CreateProcess 无法直接执行脚本文件。
fn spawn_editor(exe: &Path, path: &str, display: &str) -> CmdResult {
    let is_script = exe
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"));
    let result = if is_script {
        // .cmd/.bat 必须经 cmd 执行：raw_arg 原样拼接命令行，避免 Rust 对引号做
        // CommandLineToArgvW 转义，破坏 cmd /c 的嵌套引号解析（"/d /s /c \"\"exe\" \"path\"\""）
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            Command::new("cmd")
                .raw_arg("/d /s /c ")
                .raw_arg(&format!("\"\"{}\" \"{}\"\"", exe.display(), path))
                .spawn()
        }
        #[cfg(not(windows))]
        {
            Command::new(exe).arg(path).spawn()
        }
    } else {
        Command::new(exe).arg(path).spawn()
    };
    result
        .map(|_| ())
        .map_err(|e| format!("启动 {display} 失败：{e}"))
}

/// 探测 VS Code 可执行文件（不启动）：用户手动指定路径 → PATH 中的 code 命令 →
/// 标准安装位置 → 受限全盘扫描（便携版/自定义目录）。
fn probe_vscode(configured: &Option<String>) -> Option<PathBuf> {
    // 1. 用户手动指定过的路径（最优先）
    if let Some(exe) = configured.as_deref() {
        if Path::new(exe).is_file() {
            return Some(PathBuf::from(exe));
        }
    }
    // 2. 标准安装位置 + 盘根/scoop 常见位置（真实 VS Code 的 Code.exe）
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(format!("{local}\\Programs\\Microsoft VS Code")));
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(pf) = std::env::var(var) {
            roots.push(PathBuf::from(format!("{pf}\\Microsoft VS Code")));
        }
    }
    for drive in b'C'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\", drive as char));
        if root.is_dir() {
            roots.push(root.join("Microsoft VS Code"));
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        roots.push(PathBuf::from(format!(
            "{home}\\scoop\\apps\\vscode\\current"
        )));
    }
    for root in roots {
        let exe = root.join("Code.exe");
        if exe.is_file() {
            return Some(exe);
        }
    }
    // 3. PATH 中的 code 命令（VS Code 安装时创建的 code.cmd / code.exe）兜底。
    //    注意：Qoder 等 VS Code 系 IDE 也会注册同名 code.cmd 且常排在 VS Code 前面，
    //    必须排除，否则"选 VS Code 打开"会实际启动 Qoder（用户已遇到）。
    if let Ok(out) = Command::new("where.exe").arg("code").output() {
        if out.status.success() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let p = PathBuf::from(line.trim());
                // 跳过被其它编辑器抢占的 code 命令
                let lower = p.display().to_string().to_ascii_lowercase();
                if lower.contains("qoder")
                    || lower.contains("windsurf")
                    || lower.contains("cursor")
                {
                    continue;
                }
                // 只接受带 .exe/.cmd/.bat 扩展名的文件：where 可能先返回无扩展名的
                // shell 脚本（bin\code），直接启动会报 os error 193（不是有效的 Win32 程序）
                let valid = p
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| {
                        e.eq_ignore_ascii_case("exe")
                            || e.eq_ignore_ascii_case("cmd")
                            || e.eq_ignore_ascii_case("bat")
                    });
                if valid && p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    // 4. 受限全盘扫描（便携版/自定义目录）
    let mut found: Option<PathBuf> = None;
    for drive in b'C'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\", drive as char));
        if root.is_dir() && find_vscode_exe(&root, 0, &mut found) {
            break;
        }
    }
    found
}

/// 探测 Qoder / QoderCN（coder.cn 出品的 VS Code 系 IDE）：盘根、Program Files、
/// LOCALAPPDATA\Programs 顶层目录名以 qoder 开头，exe 位于目录根（Qoder.exe / QoderCN.exe）。
fn probe_qoder() -> Vec<(String, String, PathBuf)> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for drive in b'A'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\", drive as char));
        if root.is_dir() {
            roots.push(root);
        }
    }
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(pf) = std::env::var(var) {
            roots.push(PathBuf::from(pf));
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(format!("{local}\\Programs")));
    }
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !name.to_ascii_lowercase().starts_with("qoder") {
                continue;
            }
            for exe_name in ["Qoder.exe", "QoderCN.exe"] {
                let exe = p.join(exe_name);
                if exe.is_file() && seen.insert(exe.display().to_string()) {
                    let key = exe_name
                        .to_ascii_lowercase()
                        .trim_end_matches(".exe")
                        .to_string();
                    let label = if key == "qodercn" {
                        "Qoder（国内版）".to_string()
                    } else {
                        "Qoder".to_string()
                    };
                    out.push((key, label, exe));
                    break;
                }
            }
        }
    }
    out
}

/// 受限查找 Code.exe：只深入名字像 VS Code 的目录（code/vscode/microsoft/tools 等），
/// 避免全盘无谓扫描；找到即停止。
fn find_vscode_exe(dir: &Path, depth: usize, out: &mut Option<PathBuf>) -> bool {
    if depth > 4 || out.is_some() {
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
        if p.join("Code.exe").is_file() {
            *out = Some(p.join("Code.exe"));
            return true;
        }
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let lower = name.to_ascii_lowercase();
        let promising = lower.contains("vscode")
            || lower.contains("vs code")
            || lower.contains("visual studio")
            || lower.contains("microsoft")
            || lower.contains("code")
            || lower.contains("tools")
            || lower.contains("software")
            || lower.contains("apps");
        if promising && find_vscode_exe(&p, depth + 1, out) {
            return true;
        }
    }
    false
}

/// 在 JetBrains 系 IDE 中打开：常见安装根 + 固定盘 JetBrains 目录，深度受限探测。
/// 兼容三种安装形态：
/// - 传统安装：Program Files\JetBrains\IntelliJ IDEA 2024.1\bin\idea64.exe
/// - Toolbox 安装：%LOCALAPPDATA%\JetBrains\Toolbox\apps\IDEA-U\ch-0\242.x\bin\idea64.exe
/// - 自定义盘符：D:\JetBrains\...（任意非系统盘根下的 JetBrains 目录）
fn open_jetbrains(path: &str, display: &str, exe_name: &str) -> CmdResult {
    match probe_jetbrains(exe_name) {
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

/// 探测 JetBrains 系 IDE 的可执行文件（不启动）：常见安装根 + 固定盘 JetBrains 目录，
/// 深度受限探测。兼容三种安装形态：
/// - 传统安装：Program Files\JetBrains\IntelliJ IDEA 2024.1\bin\idea64.exe
/// - Toolbox 安装：%LOCALAPPDATA%\JetBrains\Toolbox\apps\IDEA-U\ch-0\242.x\bin\idea64.exe
/// - 自定义盘符：D:\IntelliJ IDEA 2023.2.8 或 D:\JetBrains\...（任意非系统盘根）
fn probe_jetbrains(exe_name: &str) -> Option<PathBuf> {
    let mut roots: Vec<PathBuf> = vec![
        std::env::var("ProgramFiles").unwrap_or_default().into(),
        std::env::var("ProgramFiles(x86)").unwrap_or_default().into(),
    ];
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(format!("{local}\\Programs")));
        roots.push(PathBuf::from(format!("{local}\\JetBrains\\Toolbox\\apps")));
    }
    // 固定盘根：直接装在盘根（D:\IntelliJ IDEA 2023.2.8）、D:\JetBrains 或 D:\Program Files 下
    for drive in b'A'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\", drive as char));
        if root.is_dir() {
            roots.push(root.clone());
            roots.push(root.join("JetBrains"));
        }
    }
    let mut found: Option<PathBuf> = None;
    for root in &roots {
        if find_editor_exe(root, exe_name, 0, &mut found) {
            break;
        }
    }
    found
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
            || lower.starts_with("program files")
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

#[cfg(test)]
mod detect_tests {
    use super::*;

    #[test]
    fn qoder_detected() {
        let found = probe_qoder();
        eprintln!("probe_qoder => {found:?}");
        assert!(!found.is_empty(), "probe_qoder 应至少找到 Qoder/QoderCN");
    }

    #[test]
    fn idea_detected() {
        let found = probe_jetbrains("idea64.exe");
        eprintln!("probe_jetbrains(idea64.exe) => {found:?}");
        assert!(found.is_some(), "probe_jetbrains 应找到 idea64.exe");
    }
}
