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
