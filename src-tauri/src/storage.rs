//! 统一数据持久化层：负责解析数据目录（支持便携版）与 JSON 读写。
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Manager, Runtime};

/// 应用所有数据文件的路径集合，启动时解析一次。
#[derive(Debug, Clone)]
pub struct AppPaths {
    /// 保留字段：供后续导出/备份功能使用
    #[allow(dead_code)]
    pub data_dir: PathBuf,
    pub config_file: PathBuf,
    pub clipboard_file: PathBuf,
    pub folders_file: PathBuf,
    pub creds_file: PathBuf,
    pub images_dir: PathBuf,
}

impl AppPaths {
    /// 便携版检测：若 exe 同级存在 `data/` 目录（或可创建），则数据保存在其中；
    /// 否则使用系统应用数据目录。
    pub fn resolve<R: Runtime>(app: &tauri::AppHandle<R>) -> Self {
        let portable = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.join("data")))
            .filter(|dir| dir.is_dir() || fs::create_dir_all(dir).is_ok());

        let data_dir = portable.unwrap_or_else(|| {
            app.path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
        });
        let _ = fs::create_dir_all(&data_dir);
        let images_dir = data_dir.join("images");
        let _ = fs::create_dir_all(&images_dir);

        Self {
            config_file: data_dir.join("config.json"),
            clipboard_file: data_dir.join("clipboard_history.json"),
            folders_file: data_dir.join("folders.json"),
            creds_file: data_dir.join("credentials.json"),
            images_dir,
            data_dir,
        }
    }
}

/// 读取 JSON 文件，文件不存在或解析失败时返回默认值（错误兜底，不让前端崩溃）。
pub fn load_json<T: DeserializeOwned>(path: &Path, default: T) -> T {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(default),
        Err(_) => default,
    }
}

/// 保存 JSON 文件：先写临时文件再重命名，避免写入中途崩溃导致数据损坏。
pub fn save_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    let content = serde_json::to_string_pretty(value).map_err(std::io::Error::other)?;
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path)?;
    Ok(())
}
