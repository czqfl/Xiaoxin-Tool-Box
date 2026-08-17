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
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

pub const NOTE_PREFIX: &str = "note_";
pub const HISTORY_WINDOW: &str = "sticky-history";
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
    "flame".into()
}
fn default_animation_speed() -> f64 {
    100.0
}

impl Default for StickySettings {
    fn default() -> Self {
        let mut shortcuts = HashMap::new();
        shortcuts.insert("show_app".into(), "Ctrl+O".into());
        shortcuts.insert("close_all".into(), "Ctrl+Shift+X".into());
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
    serde_json::from_str::<StickySettings>(raw).unwrap_or_default()
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
pub fn save_note(paths: State<'_, AppPaths>, id: String, data: NoteData) -> Result<(), String> {
    let _ = std::fs::create_dir_all(notes_dir(&paths));
    let path = note_path(&paths, &id);
    let plain = strip_html(&data.content);
    if plain.trim().is_empty() && data.title.trim().is_empty() {
        if path.exists() {
            let _ = std::fs::remove_file(&path);
        }
        return Ok(());
    }
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
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
    let _ = app.emit("sticky://open-changed", ());
}

#[tauri::command]
pub fn mark_note_closed(app: AppHandle, paths: State<'_, AppPaths>, id: String) {
    let mut v = load_open_notes(&paths);
    v.retain(|x| x != &id);
    let _ = save_open_notes(&paths, &v);
    let _ = app.emit("sticky://open-changed", ());
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
    let _ = app.emit("sticky://settings-changed", ());
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

/// 确保便签窗口存在并展示；不存在则新建（沿用记忆的尺寸/位置）。
pub fn ensure_note_window(app: &AppHandle, id: &str) {
    let label = window_label(id);
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        return;
    }
    let Some(paths) = app.try_state::<AppPaths>() else {
        return;
    };
    let saved = load_note(paths, id.to_string()).ok().flatten();
    let (w, h) = saved
        .as_ref()
        .map(|n| (n.width.max(220) as f64, n.height.max(150) as f64))
        .unwrap_or((420.0, 440.0));
    let saved_pos = saved.as_ref().and_then(|n| Some((n.pos_x?, n.pos_y?)));
    let url = format!("index.html?noteId={id}");
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("便签")
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .inner_size(w, h)
        .min_inner_size(220.0, 150.0)
        .visible(false)
        .shadow(false)
        .skip_taskbar(true);
    builder = match saved_pos {
        Some((px, py)) => {
            let scale = app
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
    }
}

#[tauri::command]
pub fn open_note_window(app: AppHandle, paths: State<'_, AppPaths>, id: String) -> Result<(), String> {
    mark_note_open_inner(&paths, &id);
    ensure_note_window(&app, &id);
    if let Some(win) = app.get_webview_window(&window_label(&id)) {
        let _ = win.emit("summoned", ());
    }
    Ok(())
}

#[tauri::command]
pub fn create_note_window(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    window: tauri::WebviewWindow,
    id: String,
) -> Result<(), String> {
    mark_note_open_inner(&paths, &id);
    let pos = window.outer_position().unwrap_or_default();
    let x = pos.x as f64 + 30.0;
    let y = pos.y as f64 + 30.0;
    let url = format!("index.html?noteId={id}");
    let win = WebviewWindowBuilder::new(&app, &window_label(&id), WebviewUrl::App(url.into()))
        .title("便签")
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .inner_size(420.0, 440.0)
        .min_inner_size(220.0, 150.0)
        .position(x, y)
        .visible(false)
        .shadow(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

/// 打开便签历史/管理窗口（工具栏"便签"入口）。
#[tauri::command]
pub fn open_history_window(app: AppHandle) -> Result<(), String> {
    const LABEL: &str = HISTORY_WINDOW;
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("index.html".into()))
        .title("历史便签")
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .inner_size(340.0, 460.0)
        .min_inner_size(300.0, 180.0)
        .center()
        .visible(false)
        .shadow(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

/// 便签窗口显示/隐藏/关闭（与 StickyNote 语义一致：便签窗口关闭 = 隐藏常驻，
/// 辅助窗口（历史）真正关闭）。
#[tauri::command]
pub fn close_window(window: tauri::WebviewWindow) -> Result<(), String> {
    match window.label() {
        HISTORY_WINDOW => window.close().map_err(|e| e.to_string()),
        _ => window.hide().map_err(|e| e.to_string()),
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

/// 便签全局快捷键：集成版暂不注册（避免与工具箱快捷键冲突），
/// 入口走工具栏图标与设置页；前端保存设置后调用，stub 静默成功。
#[tauri::command]
pub fn register_shortcuts() -> Result<(), String> {
    Ok(())
}

/// 打开便签设置：路由到工具箱设置窗口并跳转"便签设置"页。
#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    crate::tray::show_settings_window(&app);
    let _ = app.emit("sticky://goto-settings", ());
    Ok(())
}

/// 大模型整理便签：集成版暂未接入，返回明确错误（前端展示为提示）。
#[tauri::command]
pub fn format_with_llm(_content: String, _output_format: String) -> Result<String, String> {
    Err("集成版暂未接入大模型格式化".into())
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
