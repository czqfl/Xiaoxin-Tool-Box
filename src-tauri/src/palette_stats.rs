//! 全局命令面板用量统计：记录每条命令/每个条目的使用次数与最近使用时间。
//! 存储为 data/palette_stats.json（Vec<Stat>，每次操作全量读写，与 snippets 同模式，
//! 不维护内存 state）。
//! 刻意不进 config.json：配置写入会广播 config://changed 让所有窗口重载皮肤，
//! 而"执行一条命令"的频次远高于配置改动。
use crate::storage::AppPaths;
use serde::Serialize;
use tauri::State;

/// 单条用量：key 为稳定定位符（"clip:<条目id>" / "panel-clipboard" / "qfile:<路径>" …）
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct PaletteStat {
    pub key: String,
    pub count: i64,
    pub last_used: i64,
}

/// 最多保留多少条用量（超出按 频次 → 最近使用 淘汰）
const MAX_STATS: usize = 200;

fn load_stats(paths: &AppPaths) -> Vec<PaletteStat> {
    crate::storage::load_json(&paths.palette_stats_file, vec![])
}

fn save_stats(paths: &AppPaths, list: &[PaletteStat]) -> Result<(), String> {
    crate::storage::save_json(&paths.palette_stats_file, list).map_err(|e| format!("保存失败：{e}"))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 列出全部用量（前端据此做加权排序与「最近使用 / 常用」空态）
#[tauri::command]
pub fn palette_stats_list(paths: State<AppPaths>) -> Vec<PaletteStat> {
    load_stats(&paths)
}

/// 记一次使用：命中则累加刷新，未命中则新增，随后按上限淘汰尾部
#[tauri::command]
pub fn palette_stat_bump(key: String, paths: State<AppPaths>) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Ok(());
    }
    let now = now_ms();
    let mut list = load_stats(&paths);
    if let Some(s) = list.iter_mut().find(|s| s.key == key) {
        s.count += 1;
        s.last_used = now;
    } else {
        list.push(PaletteStat {
            key,
            count: 1,
            last_used: now,
        });
    }
    if list.len() > MAX_STATS {
        list.sort_by(|a, b| {
            b.count
                .cmp(&a.count)
                .then_with(|| b.last_used.cmp(&a.last_used))
        });
        list.truncate(MAX_STATS);
    }
    save_stats(&paths, &list)
}
