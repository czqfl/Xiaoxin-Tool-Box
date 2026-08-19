//! 便签模块（从 StickyNote 集成）：便签 CRUD、设置、窗口、背景图、壁纸。
//! 数据统一存于工具箱数据目录（AppPaths.data_dir）下：
//!   sticky_notes/           便签文件（xiaoxin_sticky_note_<id>.json）
//!   sticky_settings.json    便签设置
//!   sticky_bg/              背景图
//!   sticky_open_notes.json  "打开中"便签集合
//!   sticky_md_custom.css    自定义 Markdown 样式
//! 首次启动自动把旧应用（%APPDATA%/XiaoxinStickyNote）的数据迁移过来。

use crate::storage::AppPaths;
use base64::Engine;
use chrono::TimeZone;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

/// 运行时「当前可见便签窗口」集合（label 集合，如 "note_abc123"）。
/// 用于快捷键「呼出/收起便签」的切换决策——绕过 WebviewWindow::is_visible() 在
/// 透明 / always-on-top / 无边框窗口上的不可靠性（show 后 is_visible 仍可能返回
/// false，导致 toggle 永远走「显示」分支、表现为「能呼出、关不掉」）。
/// 命中由全局快捷键 handler 触发，与 Tauri 命令同在主线程事件循环，Mutex 仅作保险。
static VISIBLE_NOTES: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

/// 历史窗口当前是否可见（同样绕过 is_visible 不可靠性，供 open_history 快捷键做 toggle）。
static HISTORY_VISIBLE: LazyLock<Mutex<bool>> = LazyLock::new(|| Mutex::new(false));

pub const NOTE_PREFIX: &str = "note_";
pub const HISTORY_WINDOW: &str = "sticky-history";
/// 便签状态统一广播事件：打开/关闭/新建/保存/删除任一变化都 emit 此事件，
/// 历史面板监听后全量刷新列表（标题/摘要/时间/"打开中"状态）。
pub const EVT_NOTE_STATE_CHANGED: &str = "sticky://state-changed";
/// 便签自己的“设置”窗口（原版 StickyNote 同款完整设置面板）
pub const SETTINGS_WINDOW: &str = "sticky-settings";
/// 主便签 id（便签历史为空时默认打开它）
pub const MAIN_NOTE_ID: &str = "main";

// ---------------------------------------------------------------------------
// 数据模型
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct NoteData {
    pub content: String,
    pub title: String,
    #[serde(default)]
    pub translate: bool,
    #[serde(default)]
    pub md: String,
    pub pinned: bool,
    pub created: u64,
    pub updated: u64,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub pos_x: Option<f64>,
    #[serde(default)]
    pub pos_y: Option<f64>,
    #[serde(default)]
    pub bg_image: Option<String>,
}

impl Default for NoteData {
    fn default() -> Self {
        let now = now_secs();
        Self {
            content: String::new(),
            title: String::new(),
            translate: false,
            md: "none".to_string(),
            pinned: true,
            created: now,
            updated: now,
            width: 420,
            height: 440,
            pos_x: None,
            pos_y: None,
            bg_image: None,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub updated_str: String,
    pub updated: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct StickySettings {
    pub shortcuts: HashMap<String, String>,
    pub md_theme: String,
    pub md_custom_path: String,
    pub md_custom_filename: String,
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub bg_image: String,
    #[serde(default)]
    pub bg_immersive: bool,
    #[serde(default)]
    pub bg_transparent: bool,
    #[serde(default = "default_bg_glass_opacity")]
    pub bg_glass_opacity: f64,
    #[serde(default)]
    pub edge_snap: bool,
    #[serde(default)]
    pub notes_dir: String,
    /// 大模型整理格式配置（与原版一致；format_with_llm 调用它做 OpenAI 兼容请求）
    #[serde(default)]
    pub llm_base_url: String,
    #[serde(default)]
    pub llm_api_key: String,
    #[serde(default)]
    pub llm_model: String,
    #[serde(default = "default_true")]
    pub glass_enabled: bool,
    #[serde(default = "default_glass_blur")]
    pub glass_blur: f64,
    #[serde(default = "default_transparent_opacity")]
    pub transparent_opacity: f64,
    #[serde(default = "default_particle_count")]
    pub particle_count: f64,
    #[serde(default = "default_particle_mode")]
    pub particle_mode: String,
    #[serde(default = "default_animation_speed")]
    pub animation_speed: f64,
}

fn default_bg_glass_opacity() -> f64 {
    0.3
}
fn default_true() -> bool {
    true
}
fn default_glass_blur() -> f64 {
    55.0
}
fn default_transparent_opacity() -> f64 {
    65.0
}
fn default_particle_count() -> f64 {
    50.0
}
fn default_particle_mode() -> String {
    "particle".into()
}
fn default_animation_speed() -> f64 {
    100.0
}

impl Default for StickySettings {
    fn default() -> Self {
        let mut shortcuts = HashMap::new();
        shortcuts.insert("show_app".into(), "Ctrl+O".into());
        shortcuts.insert("new_note".into(), "Ctrl+Shift+N".into());
        Self {
            shortcuts,
            md_theme: "default".into(),
            md_custom_path: String::new(),
            md_custom_filename: String::new(),
            theme: "light".into(),
            bg_image: String::new(),
            bg_immersive: false,
            bg_transparent: false,
            bg_glass_opacity: 0.3,
            edge_snap: true,
            notes_dir: String::new(),
            llm_base_url: String::new(),
            llm_api_key: String::new(),
            llm_model: String::new(),
            glass_enabled: true,
            glass_blur: 55.0,
            transparent_opacity: 65.0,
            particle_count: 50.0,
            particle_mode: "flame".into(),
            animation_speed: 100.0,
        }
    }
}

// ---------------------------------------------------------------------------
// 路径
// ---------------------------------------------------------------------------

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn sticky_dir(paths: &AppPaths) -> PathBuf {
    let d = paths.data_dir.join("sticky_notes");
    let _ = std::fs::create_dir_all(&d);
    d
}

fn settings_path(paths: &AppPaths) -> PathBuf {
    paths.data_dir.join("sticky_settings.json")
}

fn bg_dir(paths: &AppPaths) -> PathBuf {
    let d = paths.data_dir.join("sticky_bg");
    let _ = std::fs::create_dir_all(&d);
    d
}

fn open_notes_path(paths: &AppPaths) -> PathBuf {
    paths.data_dir.join("sticky_open_notes.json")
}

fn md_custom_path(paths: &AppPaths) -> PathBuf {
    paths.data_dir.join("sticky_md_custom.css")
}

/// 便签实际存储目录：设置里的 notes_dir 非空且可用时尊重它，否则用工具箱数据目录
fn notes_dir_of(paths: &AppPaths, field: &str) -> PathBuf {
    if !field.trim().is_empty() {
        let p = PathBuf::from(field);
        if p.is_dir() || p.parent().map_or(false, |pp| pp.exists()) {
            return p;
        }
    }
    sticky_dir(paths)
}

fn notes_dir(paths: &AppPaths) -> PathBuf {
    notes_dir_of(paths, &load_settings_inner(paths).notes_dir)
}

fn note_path(paths: &AppPaths, id: &str) -> PathBuf {
    notes_dir(paths).join(format!("xiaoxin_sticky_note_{id}.json"))
}

fn load_settings_inner(paths: &AppPaths) -> StickySettings {
    let path = settings_path(paths);
    if !path.exists() {
        return StickySettings::default();
    }
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let raw = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    let mut s = serde_json::from_str::<StickySettings>(raw).unwrap_or_default();
    // 迁移：旧值 "flame"（集成早期设置页的错误取值）归入原版命名 "erode"（火焰侵蚀），
    // 否则便签前端的动画分发不认识 "flame"，会静默回退成粒子消散。
    if s.particle_mode == "flame" {
        s.particle_mode = "erode".into();
    }
    s
}

// ---------------------------------------------------------------------------
// 迁移：旧 StickyNote 数据 → 工具箱数据目录
// ---------------------------------------------------------------------------

/// 把 %APPDATA%/XiaoxinStickyNote 的便签/设置/背景迁移到工具箱数据目录。
/// 幂等：迁移完成后旧目录改名 .migrated（不删除，用户可手动清理）。
pub fn migrate_legacy_sticky(paths: &AppPaths) {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    if appdata.is_empty() {
        return;
    }
    let old = PathBuf::from(&appdata).join("XiaoxinStickyNote");
    if !old.exists() {
        return;
    }
    // 便签文件
    let dest_notes = sticky_dir(paths);
    if let Ok(entries) = std::fs::read_dir(&old) {
        for entry in entries.flatten() {
            let p = entry.path();
            let fname = match p.file_name() {
                Some(f) => f.to_string_lossy().to_string(),
                None => continue,
            };
            if fname.starts_with("xiaoxin_sticky_note_") && p.extension().map_or(false, |e| e == "json") {
                let dest = dest_notes.join(&fname);
                if !dest.exists() {
                    let _ = std::fs::copy(&p, &dest);
                }
            }
        }
    }
    // 设置（存在则复制，不覆盖新配置）
    let s_path = settings_path(paths);
    if !s_path.exists() {
        let old_settings = old.join("settings.json");
        if old_settings.exists() {
            let _ = std::fs::copy(&old_settings, &s_path);
        }
    }
    // 打开中集合
    let o_path = open_notes_path(paths);
    if !o_path.exists() {
        let old_open = old.join("open_notes.json");
        if old_open.exists() {
            let _ = std::fs::copy(&old_open, &o_path);
        }
    }
    // 自定义 md 样式
    let m_path = md_custom_path(paths);
    if !m_path.exists() {
        let old_md = old.join("md_custom.css");
        if old_md.exists() {
            let _ = std::fs::copy(&old_md, &m_path);
        }
    }
    // 背景图目录
    let old_bg = old.join("bg");
    let dest_bg = bg_dir(paths);
    if let Ok(entries) = std::fs::read_dir(&old_bg) {
        for entry in entries.flatten() {
            let p = entry.path();
            let fname = match p.file_name() {
                Some(f) => f.to_string_lossy().to_string(),
                None => continue,
            };
            let dest = dest_bg.join(&fname);
            if !dest.exists() {
                let _ = std::fs::copy(&p, &dest);
            }
        }
    }
    // 旧目录标记已迁移
    let _ = std::fs::rename(&old, old.with_extension("migrated"));
}

// ---------------------------------------------------------------------------
// 便签 CRUD
// ---------------------------------------------------------------------------

fn strip_html(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    result.replace("&nbsp;", " ")
}

#[tauri::command]
pub fn load_note(paths: State<'_, AppPaths>, id: String) -> Result<Option<NoteData>, String> {
    let path = note_path(&paths, &id);
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: NoteData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

#[tauri::command]
pub fn save_note(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    id: String,
    data: NoteData,
) -> Result<(), String> {
    let _ = std::fs::create_dir_all(notes_dir(&paths));
    let path = note_path(&paths, &id);
    let plain = strip_html(&data.content);
    if plain.trim().is_empty() && data.title.trim().is_empty() {
        // 内容为空：仅当用户从未移动/调整过（无位置/尺寸元数据）才视为"空便签"删除；
        // 若已有 pos/size（用户拖过/调过），保留文件——否则每次打开都在默认位置
        // 出现（用户反馈"位置大小固定"的根因之一）。
        let has_geometry = data.pos_x.is_some()
            && data.pos_y.is_some()
            && (data.width > 0 || data.height > 0);
        if !has_geometry {
            if path.exists() {
                let _ = std::fs::remove_file(&path);
            }
            return Ok(());
        }
    }
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    // 内容/元数据变化 → 广播状态变化：历史面板刷新列表（标题/摘要/时间/状态）
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn list_notes(paths: State<'_, AppPaths>) -> Result<Vec<NoteMeta>, String> {
    let _ = std::fs::create_dir_all(notes_dir(&paths));
    let mut items = Vec::new();
    let entries = std::fs::read_dir(notes_dir(&paths)).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if !name.starts_with("xiaoxin_sticky_note_") {
            continue;
        }
        let id = name
            .strip_prefix("xiaoxin_sticky_note_")
            .unwrap_or(name)
            .to_string();
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let data: NoteData = match serde_json::from_str(&content) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let plain = strip_html(&data.content);
        let first = plain
            .trim()
            .lines()
            .next()
            .unwrap_or("(空便签)")
            .to_string();
        let snippet = if first.is_empty() {
            "(空便签)".to_string()
        } else {
            first.chars().take(36).collect()
        };
        let updated_str = chrono::Local
            .timestamp_opt(data.updated as i64, 0)
            .single()
            .map(|dt| dt.format("%m/%d %H:%M").to_string())
            .unwrap_or_default();
        items.push(NoteMeta {
            id,
            title: data.title.clone(),
            snippet,
            updated_str,
            updated: data.updated,
        });
    }
    items.sort_by(|a, b| b.updated.cmp(&a.updated));
    Ok(items)
}

#[tauri::command]
pub fn delete_note(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    id: String,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(format!("{NOTE_PREFIX}{id}").as_str()) {
        let _ = win.emit("note-deleted", ());
    }
    let path = note_path(&paths, &id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    let mut open = load_open_notes(&paths);
    open.retain(|x| x != &id);
    let _ = save_open_notes(&paths, &open);
    Ok(())
}

#[tauri::command]
pub fn new_note_id() -> String {
    uuid::Uuid::new_v4().to_string().replace('-', "")[..6].to_string()
}

// ---------------------------------------------------------------------------
// "打开中"集合
// ---------------------------------------------------------------------------

fn load_open_notes(paths: &AppPaths) -> Vec<String> {
    let p = open_notes_path(paths);
    if !p.exists() {
        return Vec::new();
    }
    let content = std::fs::read_to_string(&p).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_open_notes(paths: &AppPaths, v: &[String]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    std::fs::write(open_notes_path(paths), json).map_err(|e| e.to_string())
}

fn mark_note_open_inner(paths: &AppPaths, id: &str) {
    let mut v = load_open_notes(paths);
    if !v.contains(&id.to_string()) {
        v.push(id.to_string());
        let _ = save_open_notes(paths, &v);
    }
}

#[tauri::command]
pub fn mark_note_open(app: AppHandle, paths: State<'_, AppPaths>, id: String) {
    mark_note_open_inner(&paths, &id);
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
}

fn mark_note_closed_inner(paths: &AppPaths, id: &str) {
    let mut v = load_open_notes(paths);
    v.retain(|x| x != id);
    let _ = save_open_notes(paths, &v);
}

#[tauri::command]
pub fn mark_note_closed(app: AppHandle, paths: State<'_, AppPaths>, id: String) {
    mark_note_closed_inner(&paths, &id);
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
}

#[tauri::command]
pub fn get_open_notes(app: AppHandle, paths: State<'_, AppPaths>) -> Vec<String> {
    let persisted = load_open_notes(&paths);
    let mut result: Vec<String> = persisted
        .into_iter()
        .filter(|id| app.get_webview_window(format!("{NOTE_PREFIX}{id}").as_str()).is_some())
        .collect();
    if app.get_webview_window(format!("{NOTE_PREFIX}{MAIN_NOTE_ID}").as_str()).is_some() {
        result.push(MAIN_NOTE_ID.to_string());
    }
    result
}

/// 工具栏"便签"入口：呼出便签应用（历史/管理窗口），便签可见时收起。
/// - 有便签窗口可见 → 收起全部便签（历史窗口不动）；
/// - 否则 → 呼出：有便签窗口（含隐藏常驻的）→ show 全部；否则 → 显示/创建历史窗口。
/// 【关键修复】枚举"实际存在的 note_* 窗口"而非 persisted open_notes——
/// 便签"关闭"只是隐藏常驻（窗口对象仍在），但 mark_note_closed 会把 id 从
/// open_notes 移除，旧逻辑因此误判"没有便签窗口"→ 只弹历史窗口，用户关闭
/// 便签后再次点击永远呼不回便签（diag.log 11:36 现场：created 后 open_ids=[]）。
#[tauri::command]
pub fn toggle_sticky_notes(
    app: AppHandle,
    _paths: State<'_, AppPaths>,
) -> Result<bool, String> {
    crate::storage::diag_write("[sticky] toggle_sticky_notes called");
    let note_wins: Vec<(String, tauri::WebviewWindow)> = app
        .webview_windows()
        .iter()
        .filter(|(_, w)| w.label().starts_with(NOTE_PREFIX))
        .map(|(l, w)| (l.clone(), w.clone()))
        .collect();
    let hist = app.get_webview_window(HISTORY_WINDOW);
    // 与 show_all_open 一致：用运行时 VISIBLE_NOTES 判断（绕过 is_visible 不可靠性）
    let notes_visible = {
        let vis = VISIBLE_NOTES.lock().unwrap();
        note_wins.iter().any(|(l, _)| vis.contains(l))
    };
    crate::storage::diag_write(&format!(
        "[sticky] toggle: real_note_wins={} hist_exists={} notes_visible={notes_visible}",
        note_wins.len(),
        hist.is_some()
    ));

    if notes_visible {
        // 收起全部便签（历史窗口保持原样）：广播关闭消散动画，特效交给前端——
        // 聚焦窗口播粒子消散，其余立即收尾；动画结束由前端 finishClose →
        // close_window 销毁窗口并自行清理 VISIBLE_NOTES。直接 hide() 没有特效。
        for (l, w) in &note_wins {
            if VISIBLE_NOTES.lock().unwrap().contains(l) {
                let _ = w.emit("play-close-anim", ());
            }
        }
        crate::storage::diag_write("[sticky] toggle: hid notes (animated)");
        return Ok(false);
    }
    // 呼出：优先便签窗口；没有便签窗口 → 显示/创建历史窗口（便签应用入口）
    if note_wins.is_empty() {
        match &hist {
            Some(h) => {
                let _ = h.show();
                let _ = h.unminimize();
                let _ = h.set_focus();
                crate::storage::diag_write("[sticky] toggle: shown history (existing)");
            }
            None => {
                crate::storage::diag_write("[sticky] toggle: creating history window");
                open_history_window(app.clone()).ok();
            }
        }
    } else {
        for (l, w) in &note_wins {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            VISIBLE_NOTES.lock().unwrap().insert(l.clone());
        }
        crate::storage::diag_write("[sticky] toggle: shown notes");
    }
    Ok(true)
}

// ---------------------------------------------------------------------------
// 设置
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn load_settings(paths: State<'_, AppPaths>) -> StickySettings {
    load_settings_inner(&paths)
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    settings: StickySettings,
) -> Result<(), String> {
    let _ = std::fs::create_dir_all(&paths.data_dir);
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(&paths), json).map_err(|e| e.to_string())?;
    // 广播设置变更：所有便签/历史/设置窗口监听 "settings-changed"（与原版一致）。
    // 注意不能发成 "sticky://settings-changed"——前端 settings.ts 监听的是 "settings-changed"，
    // 事件名不匹配会导致“改了主题/背景，打开的便签不刷新”。
    let _ = app.emit("settings-changed", ());
    Ok(())
}

#[tauri::command]
pub fn effective_notes_dir(paths: State<'_, AppPaths>) -> String {
    notes_dir(&paths).to_string_lossy().to_string()
}

#[tauri::command]
pub fn save_md_custom(paths: State<'_, AppPaths>, content: String) -> Result<String, String> {
    std::fs::write(md_custom_path(&paths), content).map_err(|e| e.to_string())?;
    Ok(md_custom_path(&paths).to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_md_custom(paths: State<'_, AppPaths>) -> String {
    std::fs::read_to_string(md_custom_path(&paths)).unwrap_or_default()
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    if path.is_empty() {
        return Err("路径为空".to_string());
    }
    if !std::path::Path::new(&path).exists() {
        return Err(format!("文件不存在: {path}"));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
    }
    Ok(())
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 背景图 / 壁纸
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn save_bg_image(
    paths: State<'_, AppPaths>,
    data_url: String,
    key: String,
) -> Result<String, String> {
    let marker = "base64,";
    let idx = data_url.find(marker).ok_or("无效的图片数据")?;
    let b64 = &data_url[idx + marker.len()..];
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("解码图片失败：{e}"))?;
    let mime = data_url
        .get(5..)
        .and_then(|s| s.find(';').map(|e| &s[..e]))
        .unwrap_or("image/png")
        .to_string();
    let ext = match mime.as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        _ => "png",
    };
    let safe_key: String = key
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let safe_key = if safe_key.is_empty() { "img".to_string() } else { safe_key };
    let path = bg_dir(&paths).join(format!("{safe_key}.{ext}"));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_bg_image(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("背景图文件不存在".into());
    }
    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "png" => "image/png",
        _ => {
            if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
                "image/jpeg"
            } else if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
                "image/png"
            } else if bytes.starts_with(b"RIFF")
                && bytes.len() > 12
                && &bytes[8..12] == b"WEBP"
            {
                "image/webp"
            } else {
                "image/png"
            }
        }
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

#[tauri::command]
pub fn delete_bg_image(paths: State<'_, AppPaths>, path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let base = bg_dir(&paths);
    if let Ok(canon) = p.canonicalize() {
        if canon.starts_with(&base) && p.exists() {
            let _ = std::fs::remove_file(p);
        }
    }
    Ok(())
}

/// 读取 Windows 桌面壁纸路径（透明模式把"背后内容"当图片做毛玻璃用）。
#[tauri::command]
pub fn get_wallpaper() -> String {
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = std::process::Command::new("reg")
            .args(["query", "HKCU\\Control Panel\\Desktop", "/v", "Wallpaper"])
            .output()
        {
            let s = String::from_utf8_lossy(&out.stdout);
            for line in s.lines() {
                if line.contains("Wallpaper") && line.contains("REG_SZ") {
                    if let Some(idx) = line.find("REG_SZ") {
                        let p = line[idx + "REG_SZ".len()..].trim().to_string();
                        if !p.is_empty() && std::path::Path::new(&p).exists() {
                            return p;
                        }
                    }
                }
            }
        }
        if let Ok(profile) = std::env::var("USERPROFILE") {
            let tm = std::path::Path::new(&profile)
                .join("AppData")
                .join("Roaming")
                .join("Microsoft")
                .join("Windows")
                .join("Themes")
                .join("TranscodedWallpaper");
            if tm.exists() {
                return tm.to_string_lossy().to_string();
            }
        }
        String::new()
    }
    #[cfg(not(target_os = "windows"))]
    {
        String::new()
    }
}

// ---------------------------------------------------------------------------
// 窗口
// ---------------------------------------------------------------------------

fn window_label(id: &str) -> String {
    format!("{NOTE_PREFIX}{id}")
}

/// 把窗口创建投递到主线程事件循环（空闲时执行），避免在 IPC 回调里重入建窗。
/// 背景：Tauri v2 的同步命令运行在主线程的 WebView2 IPC 回调里；此时直接调
/// `app.run_on_main_thread(...)` 会被【内联】执行（send_user_message 检测到
/// 当前线程即主线程时同步执行任务），等于在主线程的 WebView2 回调中重入创建
/// 新的 WebView2 窗口——部分环境直接挂死，阻塞整个应用（工具栏/悬浮窗点击
/// 全部失效，即“点击便签后应用卡死”的根因）。从后台线程调用
/// `run_on_main_thread` 才会走 EventLoopProxy 投递，由主循环空闲时执行，
/// 与启动/托盘创建窗口是同一条安全路径（原版 StickyNote 用 async 命令同样
/// 绕开了主线程 IPC 回调）。
pub(crate) fn defer_to_main_loop<R: tauri::Runtime>(app: AppHandle<R>, f: impl FnOnce() + Send + 'static) {
    std::thread::spawn(move || {
        let _ = app.run_on_main_thread(f);
    });
}

/// 确保便签窗口存在并展示；不存在则新建（沿用记忆的尺寸/位置）。
/// 【事件循环空闲时创建】窗口创建由后台线程发起、经 run_on_main_thread 投递，
/// 在主线程事件循环空闲时执行——避免在同步命令的 IPC 回调内重入 build
/// WebView2 窗口导致整个应用挂死（见 defer_to_main_loop 注释）。
pub fn ensure_note_window(app: &AppHandle, id: &str) {
    let label = window_label(id);
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        // 状态同步：广播可见（工具栏高亮）+ 便签状态变化（历史列表刷新）
        crate::panel::broadcast_panel_visibility(app, &label, true);
        let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
        crate::storage::diag_write(&format!("[sticky] ensure_note_window: shown existing {label}"));
        return;
    }
    crate::storage::diag_write(&format!("[sticky] ensure_note_window: creating {label}"));
    let app2 = app.clone();
    let id2 = id.to_string();
    defer_to_main_loop(app2.clone(), move || {
        let Some(paths) = app2.try_state::<AppPaths>() else {
            crate::storage::diag_write("[sticky] ensure_note_window: no AppPaths state");
            return;
        };
        // 读取便签存档（用于恢复窗口尺寸/位置；失败则用默认）
        let saved: Option<NoteData> = {
            let path = note_path(&paths, &id2);
            if path.exists() {
                std::fs::read_to_string(&path)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
            } else {
                None
            }
        };
        let (w, h) = saved
            .as_ref()
            .map(|n| (n.width.max(220) as f64, n.height.max(150) as f64))
            .unwrap_or((420.0, 440.0));
        let saved_pos = saved.as_ref().and_then(|n| Some((n.pos_x?, n.pos_y?)));
        let url = format!("index.html?noteId={id2}");
        let mut builder = WebviewWindowBuilder::new(
            &app2,
            &window_label(&id2),
            WebviewUrl::App(url.into()),
        )
        .title("便签")
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .always_on_top(true)
        .inner_size(w, h)
        .min_inner_size(220.0, 150.0)
        .visible(false)
        .shadow(false)
        .skip_taskbar(true);
        builder = match saved_pos {
            Some((px, py)) => {
                let scale = app2
                    .primary_monitor()
                    .ok()
                    .flatten()
                    .map(|m| m.scale_factor())
                    .unwrap_or(1.0);
                builder.position(px as f64 / scale, py as f64 / scale)
            }
            None => builder.center(),
        };
        if let Ok(win) = builder.build() {
            let _ = win.show();
            let _ = win.set_focus();
            crate::storage::diag_write(&format!("[sticky] ensure_note_window: {label} built+shown"));
            // 窗口此刻才真正可见，补发显隐事件让工具栏高亮“便签”图标
            crate::panel::broadcast_panel_visibility(&app2, &window_label(&id2), true);
        } else {
            crate::storage::diag_write(&format!("[sticky] ensure_note_window: {label} BUILD FAILED"));
        }
    });
}

#[tauri::command]
pub fn open_note_window(app: AppHandle, paths: State<'_, AppPaths>, id: String) -> Result<(), String> {
    crate::storage::diag_write(&format!("[sticky] open_note_window called: id={id}"));
    mark_note_open_inner(&paths, &id);
    // 立即广播"打开中"：历史列表实时更新该便签状态（此前 open_note_window
    // 只调无广播的 inner，若窗口需新建（ensure 创建分支）则历史收不到事件）
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
    ensure_note_window(&app, &id);
    if let Some(win) = app.get_webview_window(&window_label(&id)) {
        let _ = win.emit("summoned", ());
        crate::storage::diag_write(&format!("[sticky] open_note_window: emitted summoned to {id}"));
    }
    Ok(())
}

/// 挑选工具栏“便签”入口要打开的便签 id：
/// 1) “打开中”集合里的便签（用户最近在用的）；2) 最近更新的便签文件；3) 兜底 main。
fn pick_main_note_id(app: &AppHandle) -> String {
    if let Some(paths) = app.try_state::<AppPaths>() {
        let open = load_open_notes(&paths);
        if let Some(id) = open.first() {
            return id.clone();
        }
        let _ = std::fs::create_dir_all(notes_dir(&paths));
        if let Ok(entries) = std::fs::read_dir(notes_dir(&paths)) {
            let mut best: Option<(u64, String)> = None;
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                if !name.starts_with("xiaoxin_sticky_note_") {
                    continue;
                }
                let id = name
                    .strip_prefix("xiaoxin_sticky_note_")
                    .unwrap_or(name)
                    .to_string();
                let mtime = p
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
                    .unwrap_or(0);
                if best.as_ref().map_or(true, |(t, _)| mtime > *t) {
                    best = Some((mtime, id));
                }
            }
            if let Some((_, id)) = best {
                return id;
            }
        }
    }
    MAIN_NOTE_ID.to_string()
}

/// 工具栏"便签"入口将打开的便签窗口 label（用于先判断可见性做开关切换）。
/// 当前工具栏入口已改用 toggle_sticky_notes（统一呼出/收起全部便签），
/// 保留备用（供未来"打开最近便签"类入口使用）。
#[allow(dead_code)]
pub fn pick_main_note_label(app: &AppHandle) -> String {
    window_label(&pick_main_note_id(app))
}

/// 打开最近使用的便签（打开中集合优先 → 最近更新的便签 → 默认 main），
/// 标记为"打开中"并播放呼出成形动画。返回实际打开的窗口 label。
#[allow(dead_code)]
pub fn open_main_note(app: &AppHandle) -> String {
    let id = pick_main_note_id(app);
    // 真实便签才写入“打开中”集合；main 是特殊默认便签，与原版一致不持久化
    if id != MAIN_NOTE_ID {
        if let Some(paths) = app.try_state::<AppPaths>() {
            mark_note_open_inner(&paths, &id);
        }
    }
    ensure_note_window(app, &id);
    if let Some(win) = app.get_webview_window(&window_label(&id)) {
        let _ = win.emit("summoned", ());
    }
    window_label(&id)
}

#[tauri::command]
pub fn create_note_window(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    window: tauri::WebviewWindow,
    id: String,
) -> Result<(), String> {
    mark_note_open_inner(&paths, &id);
    // 【预建空便签存档】此前仅打开窗口、不写文件——历史列表读文件系统，
    // 新建的便签要等首次保存才出现（用户反馈"新建便签历史里没新增"）。
    // 立即落盘空模板：历史列表马上能看到新条目；便签前端加载时读到此文件
    // 即为空便签，行为一致。
    let path = note_path(&paths, &id);
    if !path.exists() {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let note = NoteData::default();
        let _ = std::fs::write(
            &path,
            serde_json::to_string_pretty(&note).unwrap_or_else(|_| "{}".into()),
        );
    }
    // 立即广播：历史列表刷新（新条目 + 打开中）
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
    let pos = window.outer_position().unwrap_or_default();
    let x = pos.x as f64 + 30.0;
    let y = pos.y as f64 + 30.0;
    // 事件循环空闲时创建（与 ensure_note_window 同理，避免 IPC 回调内重入挂死）
    let app2 = app.clone();
    let id2 = id.clone();
    defer_to_main_loop(app2.clone(), move || {
        // 读取存档：新便签也要记住自己的位置/大小（原版特性——每次在
        // 上次出现的位置打开）；预写的空存档无 pos 时回退"从当前窗口偏移"
        let saved: Option<NoteData> = {
            let p = note_path(&app2.state::<AppPaths>(), &id2);
            if p.exists() {
                std::fs::read_to_string(&p)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
            } else {
                None
            }
        };
        let (w, h) = saved
            .as_ref()
            .map(|n| (n.width.max(220) as f64, n.height.max(150) as f64))
            .unwrap_or((420.0, 440.0));
        let (px, py) = saved
            .as_ref()
            .and_then(|n| Some((n.pos_x?, n.pos_y?)))
            .unwrap_or((x, y));
        let url = format!("index.html?noteId={id2}");
        let win = WebviewWindowBuilder::new(
            &app2,
            &window_label(&id2),
            WebviewUrl::App(url.into()),
        )
        .title("便签")
        .decorations(false)
        .transparent(true)
        .resizable(true)
        .always_on_top(true)
        .inner_size(w, h)
        .min_inner_size(220.0, 150.0)
        .position(px, py)
        .visible(false)
        .shadow(false)
        .skip_taskbar(true)
        .build();
        if let Ok(win) = win {
            let _ = win.show();
            let _ = win.set_focus();
            crate::panel::broadcast_panel_visibility(&app2, &window_label(&id2), true);
            // 新建即打开：通知历史列表刷新状态
            let _ = app2.emit(EVT_NOTE_STATE_CHANGED, ());
        }
    });
    Ok(())
}

/// 打开便签历史/管理窗口（工具栏"便签"入口）。
/// 【事件循环空闲时创建 + 非透明】历史列表窗口无需透明，进一步规避透明
/// WebView2 初始化的挂起风险；创建经 defer_to_main_loop 投递，避免在
/// 同步命令的 IPC 回调内重入建窗导致整个应用卡死（用户反馈的根因）。
#[tauri::command]
pub fn open_history_window(app: AppHandle) -> Result<(), String> {
    const LABEL: &str = HISTORY_WINDOW;
    crate::storage::diag_write("[sticky] open_history_window called");
    // 快捷键 open_history 用此标志做 toggle（绕过 is_visible 不可靠性）
    *HISTORY_VISIBLE.lock().unwrap() = true;
    if let Some(win) = app.get_webview_window(LABEL) {
        crate::storage::diag_write("[sticky] open_history_window: existing, show");
        let _ = win.show();
        let _ = win.set_focus();
        crate::panel::broadcast_panel_visibility(&app, HISTORY_WINDOW, true);
        return Ok(());
    }
    let app2 = app.clone();
    defer_to_main_loop(app2.clone(), move || {
        let win = WebviewWindowBuilder::new(&app2, LABEL, WebviewUrl::App("index.html".into()))
            .title("历史便签")
            .decorations(false)
            .transparent(false)
            // 系统缩放边框：无边框 + resizable 时 Windows 提供隐形四边/四角
            // 拖拽热区——上下左右都能自由调大小（用户反馈自定义手柄失效 + 要全方向）
            .resizable(true)
            .always_on_top(true)
            .inner_size(340.0, 460.0)
            .min_inner_size(300.0, 180.0)
            .center()
            .visible(false)
            .shadow(false)
            .skip_taskbar(true)
            .build();
        match win {
            Ok(w) => {
                // 与面板一致的 DWM 原生圆角（窗口非透明，CSS 圆角会露白角）
                crate::apply_panel_effects_for(&w, false);
                // 不立即 show：等前端挂载完成（主题/背景就绪）后再显示——
                // 立即 show 时 webview 尚未加载，非透明窗口会闪一下白底
                // （用户反馈"变白闪一下"的根因）。前端 mountHistoryApp 会
                // 在 getSettings 完成后自行 show + setFocus。
                // 【兜底】300ms 后若前端仍未显示（webview 加载慢），强制 show——
                // 否则第一次点击可能"没反应"，用户需再点一次（反馈根因）。
                // 本地资源加载通常 <300ms，兜底极少触发，不影响去白闪效果。
                let app3 = app2.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(300));
                    if let Some(win3) = app3.get_webview_window(HISTORY_WINDOW) {
                        if !win3.is_visible().unwrap_or(true) {
                            let _ = win3.show();
                            crate::storage::diag_write(
                                "[sticky] open_history_window: fallback show after 300ms",
                            );
                        }
                    }
                });
                // 先广播可见性：窗口即将显示，让工具栏高亮"便签"图标
                crate::panel::broadcast_panel_visibility(&app2, HISTORY_WINDOW, true);
                crate::storage::diag_write("[sticky] open_history_window: built (front will show)");
            }
            Err(e) => {
                crate::storage::diag_write(&format!("[sticky] open_history_window: BUILD FAILED: {e}"));
            }
        }
    });
    Ok(())
}

/// 便签窗口显示/隐藏/关闭（与 StickyNote 语义一致：便签窗口关闭 = 隐藏常驻，
/// 辅助窗口（历史/设置）真正关闭）。
/// 状态同步（用户反馈修复）：
/// - 便签关闭（hide）：同步移除"打开中"集合、emit open-changed（历史列表
///   实时刷新"打开中/已关闭"）、广播可见性（工具栏便签图标取消高亮）；
/// - 历史/设置关闭：广播可见性 false（工具栏取消高亮）。
#[tauri::command]
pub fn close_window(window: tauri::WebviewWindow) -> Result<(), String> {
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    match label.as_str() {
        HISTORY_WINDOW => {
            // 历史窗口"关闭"= 隐藏常驻（不销毁）：再点击工具栏便签秒开；
            // 广播不可见（工具栏取消高亮）
            let _ = window.hide();
            crate::panel::broadcast_panel_visibility(&app, &label, false);
            // 同步快捷键 open_history 的 toggle 状态（否则下次按下仍判为"可见"）
            *HISTORY_VISIBLE.lock().unwrap() = false;
            Ok(())
        }
        SETTINGS_WINDOW => {
            let r = window.close();
            crate::panel::broadcast_panel_visibility(&app, &label, false);
            r.map_err(|e| e.to_string())
        }
        _ => {
            // 便签窗口关闭 = 销毁（内容实时自动保存，不丢数据）。
            // 位置/大小记忆由 create/ensure 读存档实现。
            if let Some(paths) = app.try_state::<AppPaths>() {
                let id = label.strip_prefix(NOTE_PREFIX).unwrap_or(&label).to_string();
                if id != MAIN_NOTE_ID {
                    mark_note_closed_inner(&paths, &id);
                }
                // 【销毁前几何回写】把窗口当前的位置/大小写回存档——
                // 即使前端防抖保存未触发（拖动/调整大小后立即关闭），
                // 下次打开也一定在最后出现的位置/大小。
                // 【单位约定】pos 存物理像素（ensure 创建时 position(pos/scale)
                // 转逻辑，与前端 onMoved 的 outerPosition 物理值一致）；
                // size 存逻辑像素（inner_size 直接用逻辑）——此前 size 直接存
                // outer_size 物理值，下次创建 inner_size(物理) 被当逻辑 → 每次
                // 打开放大 scale 倍（实测存档从默认 420×440 滚到 1296×1626）。
                let scale = window.scale_factor().unwrap_or(1.0).max(0.01);
                let path = note_path(&paths, &id);
                if let Ok(raw) = std::fs::read_to_string(&path) {
                    if let Ok(mut note) = serde_json::from_str::<NoteData>(&raw) {
                        if let Ok(p) = window.outer_position() {
                            note.pos_x = Some(p.x as f64);
                            note.pos_y = Some(p.y as f64);
                        }
                        if let Ok(s) = window.outer_size() {
                            note.width = (s.width as f64 / scale).round() as u32;
                            note.height = (s.height as f64 / scale).round() as u32;
                        }
                        if let Ok(json) = serde_json::to_string_pretty(&note) {
                            let _ = std::fs::write(&path, json);
                        }
                    }
                }
            }
            let r = window.close();
            let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
            crate::panel::broadcast_panel_visibility(&app, &label, false);
            // 同步运行时可见集合（窗口已销毁，移除 stale 标记）
            VISIBLE_NOTES.lock().unwrap().remove(&label);
            r.map_err(|e| e.to_string())
        }
    }
}

/// 便签窗口开始拖动（标题栏按住拖动）。
#[tauri::command]
pub fn start_dragging(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

/// 便签窗口置顶/取消置顶。
#[tauri::command]
pub fn set_always_on_top(window: tauri::WebviewWindow, pinned: bool) -> Result<(), String> {
    window.set_always_on_top(pinned).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn minimize_to_taskbar(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn minimize_to_tray(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

/// 把便签设置里的组合串（如 "Ctrl+Shift+C"）转为 global-shortcut 可注册的
/// accelerator 字符串（如 "ctrl+shift+c"）。
fn to_accelerator(combo: &str) -> String {
    combo
        .replace("Ctrl", "ctrl")
        .replace("Alt", "alt")
        .replace("Shift", "shift")
        .replace("Meta", "meta")
        .replace("Plus", "+")
        .replace("Minus", "-")
        .replace("Space", "space")
        .to_lowercase()
}

/// 注册便签全局快捷键：呼出（show_app）/ 新建（new_note）/ 呼出历史面板（open_history），
/// 组合键来自便签设置（现统一在工具箱「快捷键设置」的便签分组里配置）。
/// 只注册便签自己的组合（不去 unregister_all，避免注销工具箱快捷键）；
/// 与工具箱组合撞车时 register 失败被忽略。
pub fn register_all_shortcuts(app: &AppHandle) {
    use std::collections::HashSet;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut as GShortcut};
    let Some(paths) = app.try_state::<AppPaths>() else {
        return;
    };
    let settings = load_settings_inner(paths.inner());
    let mut seen = HashSet::new();
    for key in ["show_app", "new_note", "open_history"] {
        if let Some(combo) = settings.shortcuts.get(key) {
            let acc = to_accelerator(combo);
            if !acc.is_empty() && seen.insert(acc.clone()) {
                if let Ok(s) = GShortcut::from_str(&acc) {
                    let _ = app.global_shortcut().register(s);
                }
            }
        }
    }
}

/// 快捷键「呼出 / 收起便签」：仅作用于便签窗口，绝不打开历史面板
/// （历史面板由独立的 open_history 快捷键负责）。
/// 切换决策基于运行时 VISIBLE_NOTES 集合，而非 WebviewWindow::is_visible()
/// （透明 / always-on-top / 无边框窗口上 is_visible 不可靠，show 后仍可能返回
/// false，导致 toggle 永远走「显示」分支、表现成「能呼出、关不掉」）。
/// - VISIBLE_NOTES 非空 → 收起（全部 hide 并清空集合）；
/// - 否则 → 呼出：已有（含隐藏）便签窗口则 show 全部；
///   若没有任何活动窗口，从持久化 open_notes 重建，仍为空则新建一张。
fn show_all_open(app: &AppHandle) {
    let note_wins: Vec<(String, tauri::WebviewWindow)> = app
        .webview_windows()
        .iter()
        .filter(|(_, w)| w.label().starts_with(NOTE_PREFIX))
        .map(|(l, w)| (l.clone(), w.clone()))
        .collect();
    // 决策：VISIBLE_NOTES 中仍有「当前显示中」的便签窗口 → 本次收起
    let any_visible = {
        let vis = VISIBLE_NOTES.lock().unwrap();
        note_wins.iter().any(|(l, _)| vis.contains(l))
    };
    if any_visible {
        // 收起：先让每个可见便签窗口播放关闭消散动画（聚焦的那个播粒子，
        // 其余立即收尾），动画结束由前端 finishClose → close_window 销毁窗口
        // 并自行清理 VISIBLE_NOTES。不要在这里直接 w.hide()/clear，否则没有特效。
        for (l, w) in &note_wins {
            if VISIBLE_NOTES.lock().unwrap().contains(l) {
                let _ = w.emit("play-close-anim", ());
            }
        }
        let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
        return;
    }
    if !note_wins.is_empty() {
        for (l, w) in &note_wins {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
            VISIBLE_NOTES.lock().unwrap().insert(l.clone());
        }
        let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
        return;
    }
    // 没有任何活动便签窗口：从持久化 open_notes 重建（用户关闭后仍能呼回）
    if let Some(paths) = app.try_state::<AppPaths>() {
        let ids = load_open_notes(paths.inner());
        if !ids.is_empty() {
            for id in ids {
                crate::storage::diag_write(&format!("[sticky] show_all_open: rebuild {id}"));
                ensure_note_window(app, &id);
                VISIBLE_NOTES.lock().unwrap().insert(window_label(&id));
            }
            return;
        }
    }
    // 实在没有任何便签：新建一张，给用户一个入口
    crate::storage::diag_write("[sticky] show_all_open: no notes, create new");
    quick_new_note(app);
}

/// 新建便签：生成 id、标记打开、主线程建窗并呼出。
fn quick_new_note(app: &AppHandle) {
    let id = uuid::Uuid::new_v4().to_string().replace('-', "")[..6].to_string();
    if let Some(paths) = app.try_state::<AppPaths>() {
        mark_note_open_inner(paths.inner(), &id);
    }
    ensure_note_window(app, &id);
    VISIBLE_NOTES.lock().unwrap().insert(window_label(&id));
    if let Some(win) = app.get_webview_window(&window_label(&id)) {
        let _ = win.emit("summoned", ());
    }
}

/// 分发便签全局快捷键：shortcut 命中便签设置的 show_app/new_note/open_history 之一
/// 则执行并返回 true（调用方短路，不再走工具箱快捷键逻辑）。
/// - show_app：呼出/收起便签（基于 VISIBLE_NOTES 运行时集合做 toggle）
/// - new_note：新建便签
/// - open_history：呼出/收起历史便签面板（基于 HISTORY_VISIBLE 做 toggle）
pub fn handle_sticky_shortcut(app: &AppHandle, shortcut: &tauri_plugin_global_shortcut::Shortcut) -> bool {
    use tauri_plugin_global_shortcut::Shortcut as GShortcut;
    let Some(paths) = app.try_state::<AppPaths>() else {
        return false;
    };
    let settings = load_settings_inner(paths.inner());
    let mut matched: Vec<&str> = Vec::new();
    for key in ["show_app", "new_note", "open_history"] {
        if let Some(combo) = settings.shortcuts.get(key) {
            let acc = to_accelerator(combo);
            if !acc.is_empty() {
                if let Ok(hk) = GShortcut::from_str(&acc) {
                    if hk.id() == shortcut.id() {
                        matched.push(key);
                    }
                }
            }
        }
    }
    if matched.is_empty() {
        return false;
    }
    for m in matched {
        match m {
            "show_app" => show_all_open(app),
            "new_note" => quick_new_note(app),
            "open_history" => {
                // toggle：历史窗口当前可见 → 收起；否则呼出
                let visible = *HISTORY_VISIBLE.lock().unwrap();
                if visible {
                    if let Some(w) = app.get_webview_window(HISTORY_WINDOW) {
                        let _ = w.hide();
                    }
                    *HISTORY_VISIBLE.lock().unwrap() = false;
                } else {
                    let _ = open_history_window(app.clone());
                }
            }
            _ => {}
        }
    }
    true
}

/// 便签全局快捷键：注册全部（呼出/全部关闭/新建）。
/// 设置保存后由前端调用重注册；启动时也在 setup 中注册一次。
#[tauri::command]
pub fn register_shortcuts(app: AppHandle) -> Result<(), String> {
    register_all_shortcuts(&app);
    Ok(())
}

/// 打开便签设置：创建/显示便签自带的独立“设置”窗口（原版 StickyNote 同款，
/// 完整设置面板：主题/透明/背景/毛玻璃/粒子动画/Markdown 样式/存储目录等）。
/// 窗口创建同样经 defer_to_main_loop 投递（避免 IPC 回调内重入建窗挂死）；
/// build 后不 show——可见性交由前端设置面板 paint 完成后自行 show（消除首帧闪烁）。
#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    const LABEL: &str = SETTINGS_WINDOW;
    crate::storage::diag_write("[sticky] open_settings_window called");
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let app2 = app.clone();
    defer_to_main_loop(app2.clone(), move || {
        let win = WebviewWindowBuilder::new(&app2, LABEL, WebviewUrl::App("index.html".into()))
            .title("便签设置")
            .decorations(false)
            .transparent(true)
            .resizable(true)
            .always_on_top(true)
            .inner_size(800.0, 600.0)
            .min_inner_size(680.0, 500.0)
            .center()
            .visible(false)
            .shadow(true)
            .skip_taskbar(true)
            .build();
        match win {
            Ok(_) => crate::storage::diag_write("[sticky] open_settings_window: built"),
            Err(e) => crate::storage::diag_write(&format!(
                "[sticky] open_settings_window: BUILD FAILED: {e}"
            )),
        }
    });
    Ok(())
}

/// 去掉模型输出外层可能包裹的 ```lang ... ``` 代码围栏。
fn strip_code_fences(text: &str) -> String {
    let t = text.trim();
    let fence_start = t.find("```");
    if let Some(start) = fence_start {
        if t.ends_with("```") {
            let after = &t[start + 3..];
            // 去掉首行的语言标识（如 ```markdown）
            let rest = if let Some(nl) = after.find('\n') { &after[nl + 1..] } else { after };
            let inner = &rest[..rest.len() - 3];
            return inner.trim().to_string();
        }
    }
    text.trim().to_string()
}

/// 用大模型（OpenAI 兼容接口）整理便签文本格式（集成自原版 StickyNote）。
/// output_format = "md" 时整理为干净的 Markdown；else 为纯文本。
/// 读取 sticky_settings 里的 llm_base_url / llm_api_key / llm_model，未配置则报错提示。
#[tauri::command]
pub async fn format_with_llm(app: AppHandle, content: String, output_format: String) -> Result<String, String> {
    let settings = app
        .try_state::<AppPaths>()
        .map(|p| load_settings_inner(&p))
        .unwrap_or_default();
    if settings.llm_api_key.trim().is_empty() {
        return Err("请先在“便签设置”中填写大模型 API Key".into());
    }
    let base = if settings.llm_base_url.trim().is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        settings.llm_base_url.trim_end_matches('/').to_string()
    };
    let url = if base.ends_with("/chat/completions") {
        base
    } else {
        format!("{}/chat/completions", base)
    };
    let model = if settings.llm_model.trim().is_empty() {
        "gpt-4o-mini".to_string()
    } else {
        settings.llm_model.trim().to_string()
    };

    let of = output_format.trim();
    let (sys_instr, user_instr) = if of == "md" {
        (
            "You are a formatting assistant. Reformat the user's note into clean, well-structured MARKDOWN.\n\
             WHAT TO DO (this is the main task -- you MUST add Markdown structure):\n\
             - Turn section titles/labels into Markdown headings, e.g. `## 8981环境账号密码`.\n\
             - Turn repeated items into `-` bullet lists.\n\
             - Wrap commands and code snippets in fenced code blocks (```bash ... ```).\n\
             - Use tables or **bold** where it improves clarity.\n\
             - Put a blank line between blocks so the Markdown renders correctly.\n\
             CRITICAL -- PRESERVE ALL CONTENT (this must NOT override the structure above):\n\
             - Keep EVERY line, number, name, URL, email, password, token, credential and code snippet EXACTLY as given. Do not drop, merge, deduplicate, reorder, translate, or alter any fact.\n\
             - The note may contain passwords / API keys / credentials. This is the user's PRIVATE data: output ALL of it verbatim. Do NOT redact, mask, hide, refuse, or 'clean up' anything for safety reasons.\n\
             - Adding `#`/`##`, `-`, or code fences is STRUCTURAL formatting and is REQUIRED here -- it is NOT 'rewriting' the user's wording; the text of each item stays exactly as written.\n\
             - Output ONLY the Markdown text. No commentary, no explanation, no surrounding code fence."
                .to_string(),
            "Reformat the following note into clean Markdown:",
        )
    } else {
        (
            "You are a meticulous formatting assistant. Your ONLY job is to reformat the user's note into clean plain text. \
             Strict rules: \
             1) Preserve 100% of the original information VERBATIM. Every line, sentence, list item, number, name, URL, email, password, token, credential, and code snippet MUST appear in the output with its exact text. Do not drop, merge, deduplicate, or summarize any content. \
             2) CRITICAL: The note may contain passwords, API keys, tokens, credentials, or other sensitive-looking text. This is the user's PRIVATE data. You MUST output ALL of it exactly as given. Do NOT redact, mask, hide, refuse, or \"clean up\" any part for safety reasons; preserving the user's content exactly is the top priority. \
             3) Do NOT invent, guess, translate, or alter any facts. Keep the note's original language. \
             4) Do NOT rewrite the meaning or wording of the content; only adjust its structure (clear paragraphs, consistent punctuation, simple indentation/lists). \
             5) Do NOT use any Markdown symbols. Output ONLY the plain text, with no commentary or explanation."
                .to_string(),
            "Please reformat the following note into clean plain text:",
        )
    };

    let messages = serde_json::json!([
        { "role": "system", "content": sys_instr },
        { "role": "user", "content": format!("{}\n\n{}", user_instr, content) }
    ]);
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.0,
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .bearer_auth(settings.llm_api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        return Err(format!("大模型请求失败 ({}): {}", status, detail));
    }
    let resp_json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let formatted = resp_json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();
    if formatted.trim().is_empty() {
        return Err("大模型返回为空，请重试".into());
    }
    Ok(strip_code_fences(&formatted))
}

/// 便签原生亚克力（着色跟随主题色；便签透明背景实时毛玻璃用）。
#[tauri::command]
pub fn set_acrylic(
    window: tauri::WebviewWindow,
    enable: bool,
    _opacity: u32,
    tint_rgb: u32,
) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    if let Ok(handle) = window.window_handle() {
        if let RawWindowHandle::Win32(h) = handle.as_raw() {
            let hwnd = windows::Win32::Foundation::HWND(h.hwnd.get() as *mut _);
            if enable {
                let _ = crate::acrylic::apply_acrylic_tinted(hwnd, tint_rgb);
            } else {
                let _ = crate::acrylic::clear_acrylic(hwnd);
            }
        }
    }
    Ok(())
}

/// 实时截屏：集成版暂不实现（透明毛玻璃由原生亚克力代替）。
#[tauri::command]
pub fn capture_screen_region(
    _x: i32,
    _y: i32,
    _w: i32,
    _h: i32,
    _scale: f32,
) -> Result<Vec<u8>, String> {
    Err("集成版暂不支持实时截屏（使用原生亚克力毛玻璃）".into())
}
