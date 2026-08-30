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

/// 收起时广播关闭动画：每个便签走与手动点击「×」完全相同的
/// 前端路径（play-close-anim → requestAnimatedClose），先播消散动画再自行隐藏。
/// 不做"只有最后激活的便签播"的区分——用户明确要求快捷键关闭与手动点击一致
/// 播放动画；多便签同时消散也符合"全部收起"的直觉（此前 isFocused / payload
/// 区分任一环节判断失误都会吞掉动画，是"快捷键关闭无动画"的反复根因）。
pub fn emit_close_anim(note_wins: &[(String, tauri::WebviewWindow)]) {
    for (l, w) in note_wins {
        let _ = w.emit("play-close-anim", true);
        crate::storage::diag_write(&format!("[sticky] emit close-anim -> {l}"));
    }
}

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
    /// 第二行格式工具栏（字体颜色/背景色等）是否显示（每便签独立配置）
    #[serde(default)]
    pub toolbar_visible: Option<bool>,
    /// 置顶优先级标记：全局唯一（互斥），快捷键呼出时优先操作此便签
    #[serde(default)]
    pub top_priority: Option<bool>,
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
            toolbar_visible: None,
            top_priority: None,
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
    /// 是否为置顶优先级便签（全局唯一）
    #[serde(default)]
    pub top_priority: bool,
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
    /// 背景图模式的内容面板不透明度（0~100，仅非沉浸生效）：数字越小背景图越明显。
    /// 标题栏/工具栏始终实色，背景图只在输入区透出；整窗透出请开 bg_immersive
    #[serde(default = "default_bg_opacity")]
    pub bg_opacity: f64,
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
    #[serde(default = "default_glass_enabled")]
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
fn default_bg_opacity() -> f64 {
    30.0
}

/// 玻璃模糊默认关：壁纸模式下模糊会把背景细节抹成灰白一团
fn default_glass_enabled() -> bool {
    false
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
            bg_opacity: 30.0,
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
    // 【不再自动删空文件】此前"内容为空即删文件"导致：新建便签窗口初始化
    // 触发一次保存（空内容、尚未移动）→ 预写的存档被删 → 历史列表里的
    // 新条目"出现一下又消失"（用户反馈根因）。空便签文件保留，删除统一
    // 走历史面板的删除按钮（delete_note）。
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
            top_priority: data.top_priority == Some(true),
        });
    }
    // 置顶优先级便签排最前，其余按最近更新降序
    items.sort_by(|a, b| {
        b.top_priority
            .cmp(&a.top_priority)
            .then_with(|| b.updated.cmp(&a.updated))
    });
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
        // 收起全部便签（历史窗口保持原样）：
        // ① 先广播 play-close-anim（只有最后激活的便签播粒子、其余立即收尾）；
        // ② 再启动 Rust 端兜底定时器（700ms 后强制隐藏）——关闭不再依赖前端动画
        //    回调是否触发（此前回调异常即"关不掉"）。前端若正常播完会先隐藏，兜底变 no-op。
        let labels: Vec<String> = note_wins.iter().map(|(l, _)| l.clone()).collect();
        emit_close_anim(&note_wins);
        schedule_force_close(&app, labels);
        crate::storage::diag_write("[sticky] toggle: hid notes (animated + force-hide safety)");
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
        // 【关键】窗口是隐藏常驻的（收起不销毁）：呼出必须广播 summoned，前端据此
        // 恢复显示 + 播放呼出成形动画（此前窗口每次都重建、新页面无残留样式，
        // 无需此事件；隐藏常驻后缺失会导致呼出窗口空白/裁切态）。
        for (_, w) in &note_wins {
            let _ = w.emit("summoned", ());
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
        std::process::Command::new("explorer")
            .arg(&path)
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
        // base 也要 canonicalize：Windows 的 canonicalize 返回 \?\ verbatim
        // 前缀路径，与普通路径 starts_with 恒为 false → 背景图永远删不掉
        if let Ok(base_canon) = base.canonicalize() {
            if canon.starts_with(&base_canon) && p.exists() {
                let _ = std::fs::remove_file(p);
            }
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
        // 重新置顶：从「历史便签面板」点击打开时，历史面板也是 always_on_top 且持有
        // 焦点，便签虽被 show 仍可能停在面板后面（Windows 前台锁令 set_focus 偶发不生效）。
        // 再次置顶把便签插到置顶层最上方，确保它压在面板之上、必定可见（面板保持常开）。
        let _ = win.set_always_on_top(true);
        // 登记到运行时可见集合：无论经由历史面板点击、工具栏入口还是快捷键打开，
        // toggle/快捷键「收起」都能在第一次按下即识别到"有可见便签"（此前仅快捷键
        // 路径登记，导致历史面板打开的便签要按两次才关得掉）。
        VISIBLE_NOTES.lock().unwrap().insert(label.clone());
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
        if builder.build().is_ok() {
            // 新建窗口不在此处 show：前端 init 把主题/背景/毛玻璃全部就绪后再自行显示，
            // 否则 WebView 尚未加载完就被 show，窗口会先闪一帧「空白/默认外观」，随后才被
            // 替换成磨砂背景（呼出"闪一下"的根因之一）。
            // 可见性由前端保证：各呼出路径都已先行 mark_note_open_inner，前端 init 里
            // getOpenNotes 命中即 show；"已存在"分支（上方）仍即时 show，因为视觉效果早已应用。
            crate::storage::diag_write(&format!(
                "[sticky] ensure_note_window: {label} built (frontend shows after visuals ready)"
            ));
            // 提前广播可见：工具栏高亮"便签"图标（窗口即将由前端显示，高亮方向正确）
            crate::panel::broadcast_panel_visibility(&app2, &window_label(&id2), true);
            // 登记到运行时可见集合（与"已存在"分支一致，保证收起 toggle 一次即生效）
            VISIBLE_NOTES.lock().unwrap().insert(window_label(&id2));
            // 兜底：前端若因故未显示（init 异常 / 设置加载卡住），500ms 后强制显示，
            // 保证"一次呼出必现"；正常路径前端在 ~300ms 已自行显示，此兜底为 no-op。
            let app3 = app2.clone();
            let label3 = window_label(&id2);
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let app_inner = app3.clone(); // 闭包内再克隆：避免 move 闭包与调用方借用冲突（E0505）
                let _ = app3.run_on_main_thread(move || {
                    if let Some(win) = app_inner.get_webview_window(&label3) {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                });
            });
        } else {
            crate::storage::diag_write(&format!("[sticky] ensure_note_window: {label} BUILD FAILED"));
        }
    });
}

#[tauri::command]
pub fn open_note_window(app: AppHandle, paths: State<'_, AppPaths>, id: String) -> Result<(), String> {
    crate::storage::diag_write(&format!("[sticky] open_note_window called: id={id}"));
    // 单一事实来源：先把 id 写入"打开中"集合（新建窗口的前端 init 据此自行显示）
    mark_note_open_inner(&paths, &id);
    // 立即广播：历史列表实时更新该便签状态
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
    ensure_note_window(&app, &id);
    // 已存在窗口：show + 聚焦 + 置顶（压过历史面板等置顶窗），并通知前端复原/重绘。
    // 已存在窗口的 JS 必然已就绪，一次 summoned 必达（前端无条件清理样式 + 强制重绘）；
    // 新建窗口由前端 init 依"打开集合"自行显示，无需 summoned。
    if let Some(win) = app.get_webview_window(&window_label(&id)) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_always_on_top(true);
        let _ = win.emit("summoned", ());
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
            // 登记到运行时可见集合（新建即打开，需保证收起 toggle 一次生效）
            VISIBLE_NOTES.lock().unwrap().insert(window_label(&id2));
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
            // 透明窗体：与便签窗口一致，使 WebView 默认背景透明，DWM 原生亚克力
            // （实时模糊背后桌面）才能透过 CSS 透明区域显示出来。此前为 transparent(false)，
            // WebView 默认不透明，透明主题只能退化为「静态壁纸图」——这正是用户反馈
            // “历史面板背景是张图片而不是实时模糊”的根因。设置窗口(sticky-settings)
            // 同样 transparent(true) 且实时亚克力工作正常，故此处放开安全。
            .transparent(true)
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

/// 按 label 隐藏一个便签窗口并清理全部状态（几何回写 / 打开集合 / 可见集合 / 广播）。
/// 便签"关闭"= 隐藏常驻（与原版 StickyNote 语义一致，见 close_window 注释）：
/// 窗口对象与 WebView2 进程保留，下次呼出直接 show（<50ms 秒开），彻底消除
/// 「每次开关便签都重建 WebView2 → 呼出反应慢」的冷启动成本。
/// 供「关闭」命令与快捷键「收起」的兜底定时器共用，关闭不依赖前端动画回调是否触发。
/// 窗口不存在时仅清理残留的运行时可见标记（幂等安全）。
fn hide_note_window(app: &AppHandle, label: &str) {
    let win = match app.get_webview_window(label) {
        Some(w) => w,
        None => {
            VISIBLE_NOTES.lock().unwrap().remove(label);
            return;
        }
    };
    if let Some(paths) = app.try_state::<AppPaths>() {
        let id = label.strip_prefix(NOTE_PREFIX).unwrap_or(label).to_string();
        if id != MAIN_NOTE_ID {
            mark_note_closed_inner(&paths, &id);
        }
        // 隐藏前几何回写（与旧 close_note_window_by_label 原逻辑一致）：
        // 即使前端防抖保存未触发（拖动/调整大小后立即关闭），下次打开也在最后位置/大小。
        let scale = win.scale_factor().unwrap_or(1.0).max(0.01);
        let path = note_path(&paths, &id);
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(mut note) = serde_json::from_str::<NoteData>(&raw) {
                if let Ok(p) = win.outer_position() {
                    note.pos_x = Some(p.x as f64);
                    note.pos_y = Some(p.y as f64);
                }
                if let Ok(s) = win.outer_size() {
                    note.width = (s.width as f64 / scale).round() as u32;
                    note.height = (s.height as f64 / scale).round() as u32;
                }
                if let Ok(json) = serde_json::to_string_pretty(&note) {
                    let _ = std::fs::write(&path, json);
                }
            }
        }
    }
    // 【隐藏而非销毁】关闭便签 = 隐藏常驻（窗口对象与 WebView2 进程保留），
    // 下次呼出直接 show（<50ms 秒开），避免「每次开关便签都重建 WebView2 → 呼出反应慢」
    // 的冷启动成本。
    // 历史背景：此前用 destroy()，导致快捷键「收起→呼出」每次都冷启动重建（用户反馈
    // "快捷键呼出便签慢"）；又因早期前端把关闭态窗口裁成"空画面"而未在呼出时复原，
    // 出现过"关闭后再打开打不开"。该残留态现已由前端 note.ts 的 summoned 处理
    // （blanked 检测 + restoreGlowSummoned + 强制重绘 shim）妥善复原，故恢复隐藏常驻是安全的。
    let _ = win.hide();
    crate::storage::diag_write(&format!("[sticky] hide_note_window: hidden (persistent) {label}"));
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
    crate::panel::broadcast_panel_visibility(app, label, false);
    VISIBLE_NOTES.lock().unwrap().remove(label);
}

/// 快捷键「收起便签 / 工具栏便签入口」的关闭兜底：
/// 向前端广播消散动画后，Rust 端延时兜底——但【仅当窗口仍可见时才销毁】，
/// 绝不中途掐断正在播放的消散动画（此前 700ms 强制 destroy 会把粒子动画截断，
/// 表现为「快捷键关闭无动画」）。前端动画播完 / 前端兜底（1500ms）都会先隐藏窗口，
/// 届时本兜底看到窗口已隐藏即为 no-op；只有前端彻底未关（窗口仍可见）才兜底销毁，
/// 保留「快捷键关不掉便签」的清理能力。
pub fn schedule_force_close(app: &AppHandle, labels: Vec<String>) {
    let app2 = app.clone();
    std::thread::spawn(move || {
        // 大于前端 closeFailSafe（1500ms）：确保前端正常收尾后本兜底不误伤正在播放的动画
        std::thread::sleep(std::time::Duration::from_millis(2600));
        let app3 = app2.clone();
        let _ = app3.run_on_main_thread({
            let app4 = app3.clone();
            move || {
                for l in &labels {
                    // 仅当窗口仍可见（前端动画未正常完成）才强制销毁；
                    // 动画已播完 / 已隐藏则跳过，避免打断粒子消散。
                    if let Some(w) = app4.get_webview_window(l) {
                        if w.is_visible().unwrap_or(false) {
                            hide_note_window(&app4, l);
                        }
                    }
                }
            }
        });
    });
}

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
            // 便签窗口"关闭"= 隐藏常驻（内容实时自动保存，不丢数据；窗口与 WebView2
            // 进程保留，下次呼出直接 show 秒开，避免重建冷启动的"呼出慢"）。
            // 统一走 hide_note_window：与快捷键「收起」兜底共用同一套清理逻辑
            // （几何回写 / 打开集合 / 可见集合 / 广播），单一真相来源，避免不一致。
            hide_note_window(&app, &label);
            Ok(())
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
    // 【关键】托盘隐藏后必须从 VISIBLE_NOTES 移除，否则 show_app / toggle 快捷键
    // 会用运行时可见集合判定"便签仍可见"→ 误走"收起"分支，而不是重新呼出已隐藏的便签
    // （配合 toggle_priority_note 改用 VISIBLE_NOTES 的修复）。同时广播不可见，
    // 让工具栏等 UI 高亮同步熄灭。
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    if label.starts_with(NOTE_PREFIX) {
        VISIBLE_NOTES.lock().unwrap().remove(&label);
        // 【修复·状态一致】隐藏即视为"已关闭"：同步从持久化"打开中"集合移除，
        // 否则历史列表永远显示"打开中"而便签实际是隐藏的（用户反馈"状态与实际不符"）。
        // 与 hide_note_window 的 mark_note_closed_inner 行为对齐；main 是特殊便签不持久化。
        if let Some(paths) = app.try_state::<AppPaths>() {
            let id = label.strip_prefix(NOTE_PREFIX).unwrap_or(&label).to_string();
            if id != MAIN_NOTE_ID {
                mark_note_closed_inner(&paths, &id);
            }
        }
    }
    crate::panel::broadcast_panel_visibility(&app, &label, false);
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        // 便签窗口：登记到运行时可见集合，保证收起 toggle 可靠识别
        if label.starts_with(NOTE_PREFIX) {
            VISIBLE_NOTES.lock().unwrap().insert(label.clone());
        }
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
pub fn register_all_shortcuts<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
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

/// 粒子层前端是否已就绪（收到 sticky://particles-layer-ready 置 true）。
/// 供前端 remote 粒子判定实时查询：仅窗口存在不代表前端已挂载监听（见
/// ensure_particles_window 注释——conf 声明的 visible:false 窗口可能从未初始化前端）。
static PARTICLES_READY: LazyLock<Mutex<bool>> = LazyLock::new(|| Mutex::new(false));

/// 标记粒子层前端就绪（监听 sticky://particles-layer-ready 时调用）。
pub fn mark_particles_ready() {
    *PARTICLES_READY.lock().unwrap() = true;
    crate::storage::diag_write("[sticky] particles layer marked ready");
}

/// 查询粒子层前端是否已就绪（配合 ensure_particles_window 的强制初始化）。
#[tauri::command]
pub fn particles_layer_ready() -> bool {
    *PARTICLES_READY.lock().unwrap()
}

/// 确保全屏透明「粒子层」窗口存在且其前端已挂载（粒子消散可飘出便签矩形、满屏渲染）。
/// tauri.conf.json 已声明该窗口（visible:false）；此处运行时兜底并【强制初始化】。
/// 【关键修复】仅"窗口存在"是不够的：conf 声明的窗口 visible:false → WebView2 从不
/// 显示 → 前端从不执行 → particles-start 监听永不注册 → 便签关闭时 remote 粒子层
/// 收到事件但无人处理（emit 被静默丢弃），粒子动画退回"画在便签窗口内"的自渲染模式、
/// 被便签矩形裁切（用户反馈"粒子飘散没突破便签矩形"）。因此无论窗口是否已存在，
/// 都必须走一遍 show→隐藏 的强制初始化（全屏透明、实时隐藏无视觉），保证前端 mount。
/// 幂等：已挂载的窗口再次短暂 show/hide 无害（本就透明、pointer-events 穿透）。
pub fn ensure_particles_window(app: &AppHandle) {
    const PL: &str = "particles";
    let app_owned = app.clone();
    defer_to_main_loop(app_owned.clone(), move || {
        let app2 = app_owned;
        let win = if let Some(w) = app2.get_webview_window(PL) {
            w
        } else {
            // conf 声明未生效（配置/打包差异）时兜底创建：用主显示器尺寸（透明 +
            // shadow(false) 窗口在 mount 时 setSize 会触发 WebView2 重建/IPC 卡死，
            // 故创建即正确尺寸，前端 calibrate 时尺寸相同会跳过 setSize）。
            let (w, h) = app2
                .primary_monitor()
                .ok()
                .flatten()
                .map(|m| {
                    let sf = m.scale_factor().max(0.01);
                    (m.size().width as f64 / sf, m.size().height as f64 / sf)
                })
                .unwrap_or((1920.0, 1080.0));
            crate::storage::diag_write(&format!(
                "[sticky] ensure_particles_window: built {w}x{h}"
            ));
            #[allow(clippy::let_and_return)]
            let w = WebviewWindowBuilder::new(&app2, PL, WebviewUrl::App("index.html".into()))
                .title("粒子层")
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .shadow(false)
                .skip_taskbar(true)
                .focusable(false)
                .resizable(true)
                .inner_size(w, h)
                .position(0.0, 0.0)
                .visible(false)
                .build();
            match w {
                Ok(w) => w,
                Err(e) => {
                    crate::storage::diag_write(&format!(
                        "[sticky] ensure_particles_window: BUILD FAILED: {e}"
                    ));
                    return;
                }
            }
        };
        // 【强制初始化】透明窗口 WebView2 初始化有挂起风险：visible:false 从不显示 →
        // WebView 永不初始化 → 前端从不执行（ready 日志缺失、remote 事件被丢弃的根因）。
        // 对策：短暂 show 强制初始化（全屏透明无视觉），800ms 后再隐藏——前端 mount
        // 完成、particles-start 监听就绪。已挂载的窗口再 show/hide 一次也无害。
        let _ = win.show();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(800));
            let _ = app2.run_on_main_thread(move || {
                let _ = win.hide();
            });
        });
    });
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

/// 设置置顶优先级便签（全局唯一互斥）：清除所有便签的置顶标记，再置位目标。
#[tauri::command]
pub fn set_note_priority(app: AppHandle, paths: State<'_, AppPaths>, id: String) -> Result<(), String> {
    crate::storage::diag_write(&format!("[sticky] set_note_priority called: id={id}"));
    let _ = std::fs::create_dir_all(notes_dir(&paths));
    for entry in std::fs::read_dir(notes_dir(&paths)).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&p) {
            if let Ok(mut data) = serde_json::from_str::<NoteData>(&raw) {
                if data.top_priority.take().is_some() {
                    if let Ok(json) = serde_json::to_string_pretty(&data) {
                        let _ = std::fs::write(&p, json);
                    }
                }
            }
        }
    }
    // 目标便签置位
    let path = note_path(&paths, &id);
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(mut data) = serde_json::from_str::<NoteData>(&raw) {
            data.top_priority = Some(true);
            if let Ok(json) = serde_json::to_string_pretty(&data) {
                std::fs::write(&path, json).map_err(|e| e.to_string())?;
            }
        }
    }
    let _ = app.emit(EVT_NOTE_STATE_CHANGED, ());
    Ok(())
}

/// 呼出/关闭"优先级便签"（show_app 快捷键的新语义，用户要求）：
/// 1) 有置顶便签 → 操作它；2) 无置顶 → 操作第一条（最近更新）；3) 无便签 → 新建。
/// 操作 = toggle：该便签可见 → 关闭（销毁）；否则 → 呼出（打开/聚焦）。
fn toggle_priority_note(app: &AppHandle) {
    let Some(paths) = app.try_state::<AppPaths>() else {
        return;
    };
    // 找置顶便签
    let mut target: Option<String> = None;
    if let Ok(entries) = std::fs::read_dir(notes_dir(paths.inner())) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = std::fs::read_to_string(&p) {
                if let Ok(data) = serde_json::from_str::<NoteData>(&raw) {
                    if data.top_priority == Some(true) {
                        let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                        target = Some(
                            name.strip_prefix("xiaoxin_sticky_note_").unwrap_or(name).to_string(),
                        );
                        break;
                    }
                }
            }
        }
    }
    // 无置顶 → 第一条（最近更新，与 list_notes 排序一致）
    if target.is_none() {
        if let Ok(entries) = std::fs::read_dir(notes_dir(paths.inner())) {
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
                if let Ok(raw) = std::fs::read_to_string(&p) {
                    if let Ok(data) = serde_json::from_str::<NoteData>(&raw) {
                        if best.as_ref().map_or(true, |(t, _)| data.updated > *t) {
                            best = Some((data.updated, id));
                        }
                    }
                }
            }
            target = best.map(|(_, id)| id);
        }
    }
    let Some(id) = target else {
        // 无便签 → 新建
        quick_new_note(app);
        return;
    };
    let label = window_label(&id);
    // 【关键】用运行时 VISIBLE_NOTES 判断"便签当前是否可见"，而非 is_visible()。
    // is_visible() 在透明 / always-on-top / 无边框便签窗口上不可靠（show 后仍可能返回
    // false），会导致 show_app 快捷键"明明便签在屏幕上却判定为不可见"→ 走呼出分支、
    // 永远不会触发关闭动画（用户反馈"快捷键关闭时不播放动画"，对比工具栏入口
    // toggle_sticky_notes 已改用 VISIBLE_NOTES）。统一两处判定，保证收起/呼出 toggle 稳定。
    let visible = VISIBLE_NOTES.lock().unwrap().contains(&label);
    if visible {
        // 关闭：先广播粒子消散动画（前端播放），再 Rust 兜底关闭——
        // 与"收起全部便签"同机制（不依赖前端动画回调，2600ms 后若仍未关闭才兜底隐藏）。
        // 修复：此前直接 hide_note_window 无动画（用户反馈"快捷键关闭无动画"）。
        if let Some(win) = app.get_webview_window(&label) {
            let wins = vec![(label.clone(), win)];
            emit_close_anim(&wins);
            schedule_force_close(app, vec![label.clone()]);
        } else {
            hide_note_window(app, &label);
        }
    } else {
        // 呼出
        mark_note_open_inner(paths.inner(), &id);
        ensure_note_window(app, &id);
        VISIBLE_NOTES.lock().unwrap().insert(label.clone());
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.emit("summoned", ());
        }
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
            // show_app：呼出/关闭"优先级便签"（置顶 → 第一条 → 新建，toggle）
            "show_app" => toggle_priority_note(app),
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
                // 任务栏重构后 clear_acrylic 并入 clear_blur（同一套 ACCENT_DISABLED 复位）
                let _ = crate::acrylic::clear_blur(hwnd);
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
