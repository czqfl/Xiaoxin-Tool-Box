//! 最近打开文件：记录"真正被打开过"的文件（快速文件面板双击、命令面板、全盘搜索
//! 结果都经 quickfiles_open 这一个出口），按次数或最近打开时间排序。
//!
//! 独立存 data/recent_files.json，不进 config.json——理由同 palette_stats.rs：
//! 打开动作频次远高于配置改动，而配置写入会广播 config://changed 让所有窗口重载皮肤。
use crate::storage::AppPaths;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

/// 一条最近记录。name/ext 在记录时就冗余存下：文件被移走/删掉时，
/// 列表仍能显示它是"哪个文件"，而不是只剩一条路径。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    /// 扩展名（小写，不含点）
    pub ext: String,
    pub count: u32,
    /// 最近一次打开（毫秒时间戳）
    pub last_open: i64,
}

/// 最多保留多少条（超出按 次数 → 最近打开 淘汰）
const MAX_RECENT: usize = 200;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn load(paths: &AppPaths) -> Vec<RecentFile> {
    crate::storage::load_json(&paths.recent_files_file, vec![])
}

fn save(paths: &AppPaths, list: &[RecentFile]) -> Result<(), String> {
    crate::storage::save_json(&paths.recent_files_file, list).map_err(|e| format!("保存失败：{e}"))
}

fn name_of(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

fn ext_of(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// 记一次打开。由 quickfiles_open 调用（非命令，避免前端两处都要记得打点）。
/// 目录不记：全盘搜索里双击文件夹也会走到这里，混进来会把真正的文件挤出列表。
pub fn record_open(path: &str, paths: &AppPaths) {
    if path.trim().is_empty() || Path::new(path).is_dir() {
        return;
    }
    let now = now_ms();
    let mut list = load(paths);
    match list.iter_mut().find(|r| r.path == path) {
        Some(r) => {
            r.count += 1;
            r.last_open = now;
        }
        None => list.push(RecentFile {
            path: path.to_string(),
            name: name_of(path),
            ext: ext_of(path),
            count: 1,
            last_open: now,
        }),
    }
    if list.len() > MAX_RECENT {
        list.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| b.last_open.cmp(&a.last_open)));
        list.truncate(MAX_RECENT);
    }
    let _ = save(paths, &list);
}

/// 列出最近打开。`sort` = "count" 按次数（同次数比时间），其余（含缺省）按最近打开时间。
/// 顺带惰性剔除已不存在的文件（被删/被移动/临时文件被清理），有变化才回写磁盘。
#[tauri::command]
pub fn recent_files_list(paths: State<'_, AppPaths>, sort: Option<String>) -> Vec<RecentFile> {
    let mut list = load(&paths);
    let before = list.len();
    list.retain(|r| Path::new(&r.path).exists());
    if list.len() != before {
        let _ = save(&paths, &list);
    }
    if sort.as_deref() == Some("count") {
        list.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| b.last_open.cmp(&a.last_open)));
    } else {
        list.sort_by(|a, b| b.last_open.cmp(&a.last_open));
    }
    list
}

/// 从最近列表移除一条（文件还在，只是不想再看到它）
#[tauri::command]
pub fn recent_files_remove(path: String, paths: State<'_, AppPaths>) -> Result<(), String> {
    let mut list = load(&paths);
    list.retain(|r| r.path != path);
    save(&paths, &list)
}

#[tauri::command]
pub fn recent_files_clear(paths: State<'_, AppPaths>) -> Result<(), String> {
    save(&paths, &[])
}
