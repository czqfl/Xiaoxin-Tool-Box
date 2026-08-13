//! 资源管理器全局访问追踪：轮询所有 Explorer 窗口的当前目录，
//! 新出现的目录视为一次"打开"，累计访问次数；未登记的目录自动加入文件夹列表，
//! 由"最常访问"分区按访问次数从高到低排序展示。
use crate::config::ConfigState;
use crate::folder::{register_visit, FolderStore, EVT_CHANGED};
use crate::storage::{save_json, AppPaths};
use std::collections::HashSet;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use windows::core::Interface;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{IShellWindows, IWebBrowser, ShellWindows};

/// 轮询间隔：1 秒足以捕捉用户切换目录，开销可忽略
const POLL_INTERVAL_MS: u64 = 1000;

/// 启动资源管理器访问追踪线程
pub fn start_explorer_watcher<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
        let mut known: HashSet<String> = HashSet::new();
        // 首次轮询只建立基线，不计数（避免把应用启动前已打开的窗口误计一次）
        let mut first = true;
        loop {
            std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
            let enabled = app
                .try_state::<ConfigState>()
                .map(|c| c.0.lock().unwrap().folder.track_explorer)
                .unwrap_or(true);
            if !enabled {
                // 关闭追踪时清空基线，重新启用时重新建立，不误计
                known.clear();
                first = true;
                continue;
            }
            let Some(paths) = current_explorer_paths() else {
                continue;
            };
            if first {
                // 基线用小写键，使后续差异比较大小写不敏感（与 register_visit 的
                // eq_ignore_ascii_case 一致），避免同目录不同大小写被重复计为"新访问"。
                known = paths.iter().map(|p| p.to_ascii_lowercase()).collect();
                first = false;
                continue;
            }
            let newly: Vec<String> = paths
                .iter()
                .filter(|p| !known.contains(&p.to_ascii_lowercase()))
                .cloned()
                .collect();
            known = paths.iter().map(|p| p.to_ascii_lowercase()).collect();
            if newly.is_empty() {
                continue;
            }
            let (Some(store), Some(paths_state)) =
                (app.try_state::<FolderStore>(), app.try_state::<AppPaths>())
            else {
                continue;
            };
            let now = chrono::Utc::now().timestamp_millis();
            let mut entries = store.0.lock().unwrap();
            let mut changed = false;
            for path in newly {
                if is_ignored_path(&path) {
                    continue;
                }
                changed |= register_visit(&mut entries, &path, now);
            }
            if changed {
                let _ = save_json(&paths_state.folders_file, &*entries);
                drop(entries);
                let _ = app.emit(EVT_CHANGED, ());
            }
        }
    });
}

/// 枚举所有 Explorer 窗口的当前目录（快速访问/主页等 shell: 地址自动跳过）
fn current_explorer_paths() -> Option<HashSet<String>> {
    unsafe {
        let shell_windows: IShellWindows =
            CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER).ok()?;
        let count = shell_windows.Count().ok()?;
        let mut paths = HashSet::new();
        for i in 0..count {
            let Ok(disp) = shell_windows.Item(&VARIANT::from(i)) else {
                continue;
            };
            let Ok(browser) = disp.cast::<IWebBrowser>() else {
                continue;
            };
            let Ok(url) = browser.LocationURL() else {
                continue;
            };
            if let Some(p) = file_url_to_path(&url.to_string()) {
                paths.insert(p);
            }
        }
        Some(paths)
    }
}

/// 将 file:/// URL 解码为本地路径（含百分号 UTF-8 解码），去除末尾分隔符
fn file_url_to_path(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("file:///")
        .or_else(|| url.strip_prefix("file://"))?;
    let mut bytes = Vec::with_capacity(rest.len());
    let mut chars = rest.bytes();
    while let Some(b) = chars.next() {
        match b {
            b'%' => {
                let h = (chars.next()? as char).to_digit(16)?;
                let l = (chars.next()? as char).to_digit(16)?;
                bytes.push((h * 16 + l) as u8);
            }
            b'/' => bytes.push(b'\\'),
            _ => bytes.push(b),
        }
    }
    let path = String::from_utf8(bytes).ok()?;
    Some(path.trim_end_matches(['\\', '/']).to_string())
}

/// 系统目录噪音过大，不纳入统计
fn is_ignored_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.starts_with("c:\\windows") || lower.contains("\\$recycle.bin")
}
