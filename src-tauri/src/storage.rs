//! 统一数据持久化层：负责解析数据目录（支持便携版）与 JSON 读写。
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

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
    /// 常用语速贴数据文件
    pub snippets_file: PathBuf,
    /// 命令面板用量统计（使用次数 / 最近使用时间）
    pub palette_stats_file: PathBuf,
    /// 最近打开文件（quickfiles / 全盘搜索的打开动作累计）
    pub recent_files_file: PathBuf,
    /// 全盘文件名索引的磁盘缓存（紧凑二进制，启动时秒加载）
    pub fs_index_file: PathBuf,
    /// 本机应用列表缓存（含图标 data URL，约 1MB；启动时后台线程预热）
    pub app_cache_file: PathBuf,
}

impl AppPaths {
    /// 便携版检测：若 exe 同级存在 `data/` 目录（或可创建），则数据保存在其中；
    /// 否则使用系统应用数据目录。
    ///
    /// 注意：不依赖 AppHandle——系统目录直接用 %APPDATA%/{identifier}（与 Tauri
    /// app_data_dir 的 RoamingAppData + identifier 一致）。这样解析可以在
    /// Builder 构建（窗口创建）之前完成，配合 Builder::manage 提前注册所有
    /// state，避免"state() called before manage()"的偶发 panic。
    pub fn resolve() -> Self {
        let portable = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|p| p.join("data")))
            .filter(|dir| dir.is_dir() || fs::create_dir_all(dir).is_ok());

        let data_dir = portable.unwrap_or_else(|| {
            std::env::var("APPDATA")
                .map(PathBuf::from)
                .map(|d| d.join("com.xiaoxin.toolbox.app"))
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
            snippets_file: data_dir.join("snippets.json"),
            palette_stats_file: data_dir.join("palette_stats.json"),
            recent_files_file: data_dir.join("recent_files.json"),
            fs_index_file: data_dir.join("file_index.bin"),
            app_cache_file: data_dir.join("app_cache.json"),
            images_dir,
            data_dir,
        }
    }
}

/// 读取 JSON 文件，文件不存在或解析失败时返回默认值（错误兜底，不让前端崩溃）。
pub fn load_json<T: DeserializeOwned>(path: &Path, default: T) -> T {
    match fs::read_to_string(path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(e) => {
                // JSON 损坏：改名留底（可手工修复），绝不用默认值静默覆盖
                let bak = path.with_extension("json.bak");
                let _ = fs::rename(path, &bak);
                crate::storage::diag_write(&format!(
                    "[storage] {} 解析失败（已改名 .bak）：{e}", path.display()));
                default
            }
        },
        Err(_) => default,
    }
}

/// 保存 JSON 文件：先写临时文件再重命名，避免写入中途崩溃导致数据损坏。
pub fn save_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    // tmp 名带进程 ID：不同线程/进程并发写同一文件时不再互踩半截内容
    let tmp = path.with_extension(format!("tmp.{}", std::process::id()));
    let content = serde_json::to_string_pretty(value).map_err(std::io::Error::other)?;
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

/// diag.log 超过 2MB 时轮转为 diag.log.old（覆盖旧档）——避免单文件无限膨胀
/// 掩盖早期证据（曾出现 5.6MB 单文件，导致关键握手日志无从检索）。
fn rotate_diag_if_large(dir: &std::path::Path) {
    const MAX: u64 = 2 * 1024 * 1024;
    let p = dir.join("diag.log");
    if let Ok(meta) = std::fs::metadata(&p) {
        if meta.len() > MAX {
            let _ = std::fs::rename(&p, dir.join("diag.log.old"));
        }
    }
}

/// 诊断日志：追加写 data/diag.log（定位"弹窗交互失效"等疑难问题：
/// 看前端是否挂载、事件是否到达）
#[tauri::command]
pub fn diag_log(msg: String, paths: State<'_, AppPaths>) {
    use std::io::Write;
    let line = format!("{} {}\n", chrono::Utc::now().to_rfc3339(), msg);
    rotate_diag_if_large(&paths.data_dir);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths.data_dir.join("diag.log"))
    {
        let _ = f.write_all(line.as_bytes());
    }
}

/// 后端诊断日志（Rust 侧调用）：追加写 data/diag.log，记录复制/激活时序等。
/// 与前端 diag_log 写到同一文件、同一目录解析方式，便于在一处对照排查。
pub fn diag_write(msg: &str) {
    use std::io::Write;
    let dir = AppPaths::resolve().data_dir;
    rotate_diag_if_large(&dir);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("diag.log"))
    {
        let _ = f.write_all(format!("{} {}\n", chrono::Utc::now().to_rfc3339(), msg).as_bytes());
    }
}
