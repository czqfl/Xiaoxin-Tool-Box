//! 本机应用扫描与缓存（命令面板「搜应用直接开」+ 设置页「默认打开方式」）。
//!
//! 四个来源，按可信度从高到低去重（同一 exe 只留第一条）：
//!   1. 开始菜单 .lnk（名字最贴近用户认知）
//!   2. 卸载表注册表（覆盖最广——微信 / 企业微信这类用户级安装既不写开始菜单、
//!      也不注册 App Paths，只有卸载表里有它们的 DisplayName + 主程序路径）
//!   3. App Paths 注册表
//!   4. 常见安装目录扫描（Program Files / LOCALAPPDATA\Programs 等；
//!      只认"主 exe 与所在目录同名"的，避免把卸载器/更新器/子进程当应用）
//!
//! 启动时由 lib.rs 单开一条线程预热（读盘 → 必要时重扫 → 落盘），
//! 主进程启动不等它；命令面板首次取用若缓存已就绪则即时返回，否则才等这一次扫描。

use crate::storage::AppPaths;

#[path = "apps_scan.rs"]
mod scan;

pub use scan::InstalledApp;
use scan::collect_installed_apps;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::State;

/* ---------------- 内存 / 磁盘缓存 ---------------- */

/// 缓存结构版本：扫描来源或字段一变就 +1，旧缓存自动作废
const CACHE_VERSION: u32 = 2;
/// 缓存有效期：过期后台重扫一次（装/卸应用后最多一天自动刷新）
const CACHE_TTL_SECS: i64 = 24 * 3600;

#[derive(Serialize, Deserialize)]
struct AppCacheFile {
    version: u32,
    built_at: i64,
    apps: Vec<InstalledApp>,
}

static CACHE: Mutex<Option<Vec<InstalledApp>>> = Mutex::new(None);
static CACHED_AT: AtomicI64 = AtomicI64::new(0);
/// 重扫进行中标记：避免多个调用方同时触发整表扫描
static SCANNING: AtomicBool = AtomicBool::new(false);

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn cache_age_secs() -> i64 {
    let at = CACHED_AT.load(Ordering::Relaxed);
    if at <= 0 {
        return i64::MAX;
    }
    now_secs() - at
}

fn set_cache(apps: Vec<InstalledApp>) {
    *CACHE.lock().unwrap_or_else(|e| e.into_inner()) = Some(apps);
    CACHED_AT.store(now_secs(), Ordering::Relaxed);
}

fn cached_apps() -> Option<Vec<InstalledApp>> {
    CACHE.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// 落盘：图标 data URL 让这份 JSON 有 1MB 上下，写盘也算毫秒级，
/// 但仍在预热线程里做，不碰 IPC 线程
fn save_cache(file: &Path, apps: Vec<InstalledApp>) {
    set_cache(apps.clone());
    let payload = AppCacheFile {
        version: CACHE_VERSION,
        built_at: now_secs(),
        apps,
    };
    if let Err(e) = crate::storage::save_json(file, &payload) {
        crate::storage::diag_write(&format!("[apps] 应用缓存写盘失败：{e}"));
    }
}

fn load_cache(file: &Path) -> Option<Vec<InstalledApp>> {
    // 文件不存在 / 内容损坏时 load_json 返回 None（默认值），按"无缓存"处理
    let saved: Option<AppCacheFile> = crate::storage::load_json(file, None);
    let saved = saved?;
    (saved.version == CACHE_VERSION).then_some(saved.apps)
}

/// 启动预热：先读盘（毫秒级，让首屏就有应用可搜），缺失或过期再整表重扫。
/// 必须在独立线程里调用——扫描含图标提取，耗时 1s 级。
pub fn warm_from_disk(paths: &AppPaths) {
    if let Some(apps) = load_cache(&paths.app_cache_file) {
        crate::storage::diag_write(&format!("[apps] 读回磁盘缓存 {} 个应用", apps.len()));
        set_cache(apps);
    }
    if cache_age_secs() > CACHE_TTL_SECS {
        let t0 = Instant::now();
        let apps = collect_installed_apps();
        crate::storage::diag_write(&format!(
            "[apps] 后台扫描完成：{} 个应用，耗时 {}ms",
            apps.len(),
            t0.elapsed().as_millis()
        ));
        save_cache(&paths.app_cache_file, apps);
    }
}

/// 枚举本机已安装应用。命中内存缓存时零等待返回；
/// 缓存过期则先交货、后台重扫；冷启动（预热未跑完）才阻塞等这一次扫描。
#[tauri::command]
pub async fn list_installed_apps(paths: State<'_, AppPaths>) -> Result<Vec<InstalledApp>, String> {
    if let Some(apps) = cached_apps() {
        if cache_age_secs() > CACHE_TTL_SECS && !SCANNING.swap(true, Ordering::SeqCst) {
            let file = paths.app_cache_file.clone();
            std::thread::spawn(move || {
                let apps = collect_installed_apps();
                save_cache(&file, apps);
                SCANNING.store(false, Ordering::SeqCst);
            });
        }
        return Ok(apps);
    }
    let apps = tauri::async_runtime::spawn_blocking(collect_installed_apps)
        .await
        .map_err(|e| format!("扫描本机应用失败：{e}"))?;
    let cloned = apps.clone();
    let file = paths.app_cache_file.clone();
    std::thread::spawn(move || save_cache(&file, cloned));
    Ok(apps)
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
