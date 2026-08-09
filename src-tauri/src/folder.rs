//! 文件夹快捷访问：固定列表、访问统计、打开/终端打开/复制路径。
use crate::clipboard::SUPPRESS_WATCH;
use crate::storage::{save_json, AppPaths};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

/// 每个文件夹最多保留的访问历史时间戳数量
const MAX_VISIT_HISTORY: usize = 100;

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

/// 添加文件夹：校验目录存在性与重复
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
    if entries
        .iter()
        .any(|e| e.path.eq_ignore_ascii_case(&canonical))
    {
        return Err("该文件夹已在列表中".into());
    }
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.clone());
    let max_order = entries.iter().map(|e| e.order).max().unwrap_or(-1);
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
/// 由后端在打开文件夹时统一计数，避免前端先隐藏窗口导致计数请求漏发。
fn record_visit(entries: &mut [FolderEntry], path: &str, now: i64) {
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
    }
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
        record_visit(&mut entries, &path, chrono::Utc::now().timestamp_millis());
        persist(&entries, &paths)?;
    }
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| format!("打开失败：{e}"))
}

/// 在终端中打开：优先 Windows Terminal，回退 cmd，同时记录一次访问
#[tauri::command]
pub fn folder_open_in_terminal(
    path: String,
    store: State<'_, FolderStore>,
    paths: State<'_, AppPaths>,
) -> CmdResult {
    if !Path::new(&path).is_dir() {
        return Err("文件夹不存在或已被移动".into());
    }
    {
        let mut entries = store.0.lock().unwrap();
        record_visit(&mut entries, &path, chrono::Utc::now().timestamp_millis());
        persist(&entries, &paths)?;
    }
    if Command::new("wt").arg("-d").arg(&path).spawn().is_ok() {
        return Ok(());
    }
    let cmd = format!("cd /d \"{}\"", path);
    Command::new("cmd")
        .args(["/c", "start", "cmd", "/k", &cmd])
        .spawn()
        .map_err(|e| format!("打开终端失败：{e}"))?;
    Ok(())
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
