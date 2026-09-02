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
