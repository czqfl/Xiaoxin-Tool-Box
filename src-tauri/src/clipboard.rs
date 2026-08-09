//! 剪贴板管理器：后台监听、历史记录持久化、写回与模拟粘贴。
use crate::config::ConfigState;
use crate::storage::{save_json, AppPaths};
use arboard::{Clipboard, ImageData};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// 剪贴板内容变化事件，前端据此刷新列表
pub const EVT_CHANGED: &str = "clipboard://changed";

/// 主动写回剪贴板时置位，监听线程跳过本次变化，避免重复记录
pub static SUPPRESS_WATCH: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Text,
    Image,
    Files,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipEntry {
    pub id: String,
    pub kind: EntryKind,
    /// 文本全文（text 类型）
    pub text: Option<String>,
    /// 预览：文本前 100 字 / "图片" / 文件名列表
    pub preview: String,
    /// 缩略图相对路径（image 类型）
    pub image_path: Option<String>,
    /// 文件路径列表（files 类型）
    pub files: Option<Vec<String>>,
    /// 来源应用（前台窗口进程名，尽力获取）
    pub source_app: Option<String>,
    pub created_at: i64,
    pub favorite: bool,
    pub pinned: bool,
    /// 内容哈希（十进制字符串），用于重复内容去重合并
    pub content_hash: String,
}

pub struct ClipboardStore(pub Mutex<Vec<ClipEntry>>);

// ---------------------------------------------------------------------------
// 监听线程
// ---------------------------------------------------------------------------

/// 当前剪贴板内容快照（仅内部使用）
enum Snapshot {
    Text(String),
    Image(ImageData<'static>),
    Files(Vec<PathBuf>),
}

impl Snapshot {
    fn hash(&self) -> u64 {
        let mut h = DefaultHasher::new();
        match self {
            Snapshot::Text(t) => {
                "text".hash(&mut h);
                t.hash(&mut h);
            }
            Snapshot::Image(img) => {
                "image".hash(&mut h);
                img.width.hash(&mut h);
                img.height.hash(&mut h);
                img.bytes.hash(&mut h);
            }
            Snapshot::Files(files) => {
                "files".hash(&mut h);
                files.hash(&mut h);
            }
        }
        h.finish()
    }
}

/// 按 文件 > 图片 > 文本 的优先级读取剪贴板（尊重配置开关）
fn read_clipboard(watch_images: bool, watch_files: bool) -> Option<Snapshot> {
    let mut cb = Clipboard::new().ok()?;

    if watch_files {
        if let Ok(files) = cb.get().file_list() {
            if !files.is_empty() {
                return Some(Snapshot::Files(files));
            }
        }
    }
    if watch_images {
        if let Ok(img) = cb.get_image() {
            if img.width > 0 && img.height > 0 {
                return Some(Snapshot::Image(img));
            }
        }
    }
    if let Ok(text) = cb.get_text() {
        if !text.trim().is_empty() {
            return Some(Snapshot::Text(text));
        }
    }
    None
}

/// 启动后台监听线程：每 500ms 轮询，内容变化时记录并广播事件
pub fn start_watcher<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let mut last_hash: u64 = 0;
        loop {
            std::thread::sleep(Duration::from_millis(500));

            let (watch_images, watch_files, max_history) = {
                let Some(cfg) = app.try_state::<ConfigState>() else {
                    continue;
                };
                let guard = cfg.0.lock().unwrap();
                (
                    guard.clipboard.watch_images,
                    guard.clipboard.watch_files,
                    guard.clipboard.max_history,
                )
            };

            let Some(snap) = read_clipboard(watch_images, watch_files) else {
                continue;
            };
            let hash = snap.hash();
            if hash == last_hash {
                continue;
            }
            last_hash = hash;

            // 主动写回引起的变化：跳过记录
            if SUPPRESS_WATCH.swap(false, Ordering::SeqCst) {
                continue;
            }

            let Some(paths) = app.try_state::<AppPaths>() else {
                continue;
            };
            let Some(store) = app.try_state::<ClipboardStore>() else {
                continue;
            };
            let Some(entry) = build_entry(&snap, hash, &paths.images_dir) else {
                continue;
            };

            let mut entries = store.0.lock().unwrap();
            // 去重：相同内容已有记录则移到最前并更新时间
            if let Some(pos) = entries
                .iter()
                .position(|e| e.content_hash == entry.content_hash)
            {
                entries.remove(pos);
            }
            entries.insert(0, entry);
            trim_entries(&mut entries, max_history as usize);
            let _ = save_json(&paths.clipboard_file, &*entries);
            drop(entries);

            let _ = app.emit(EVT_CHANGED, ());
        }
    });
}

/// 超出容量时删除最旧的未收藏记录；若全部已收藏则删除最旧记录
fn trim_entries(entries: &mut Vec<ClipEntry>, max: usize) {
    while entries.len() > max {
        let idx = entries
            .iter()
            .rposition(|e| !e.favorite)
            .unwrap_or(entries.len() - 1);
        entries.remove(idx);
    }
}

fn build_entry(snap: &Snapshot, hash: u64, images_dir: &std::path::Path) -> Option<ClipEntry> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let source_app = source_app();

    let (kind, preview, text, image_path, files) = match snap {
        Snapshot::Text(t) => {
            let preview: String = t.chars().take(100).collect();
            (EntryKind::Text, preview, Some(t.clone()), None, None)
        }
        Snapshot::Image(img) => {
            let rel = format!("{id}.png");
            save_thumbnail(img, images_dir.join(&rel))?;
            (EntryKind::Image, "图片".into(), None, Some(rel), None)
        }
        Snapshot::Files(list) => {
            let names: Vec<String> = list
                .iter()
                .map(|p| {
                    p.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| p.to_string_lossy().to_string())
                })
                .collect();
            let preview = names.join("、");
            let paths: Vec<String> = list
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            (EntryKind::Files, preview, None, None, Some(paths))
        }
    };

    Some(ClipEntry {
        id,
        kind,
        text,
        preview,
        image_path,
        files,
        source_app,
        created_at: now,
        favorite: false,
        pinned: false,
        content_hash: hash.to_string(),
    })
}

/// 保存 200px 缩略图，减小历史存储体积
fn save_thumbnail(img: &ImageData<'_>, path: PathBuf) -> Option<()> {
    let rgba = image::RgbaImage::from_raw(img.width as u32, img.height as u32, img.bytes.to_vec())?;
    let thumb = image::imageops::thumbnail(&rgba, 200, 200);
    thumb.save(&path).ok()
}

/// 获取前台窗口对应的进程名（如 chrome、Code），失败时回退窗口标题
#[cfg(windows)]
fn source_app() -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, GetWindowTextW,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        // 优先取进程名，作为"来源应用"
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid != 0 {
            if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                let mut buf = [0u16; 512];
                let mut size = buf.len() as u32;
                let name = PWSTR(buf.as_mut_ptr());
                if QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), name, &mut size)
                    .is_ok()
                {
                    let wide = String::from_utf16_lossy(&buf[..size as usize]);
                    if let Some(stem) = std::path::Path::new(&wide)
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                    {
                        let _ = CloseHandle(handle);
                        return Some(stem);
                    }
                }
                let _ = CloseHandle(handle);
            }
        }
        // 兜底：窗口标题
        let mut buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len > 0 {
            Some(String::from_utf16_lossy(&buf[..len as usize]))
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
fn source_app() -> Option<String> {
    None
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn clipboard_list(store: State<'_, ClipboardStore>) -> Vec<ClipEntry> {
    store.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn clipboard_delete(
    id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let mut entries = store.0.lock().unwrap();
    if let Some(pos) = entries.iter().position(|e| e.id == id) {
        let entry = entries.remove(pos);
        remove_image_file(&entry, &paths.images_dir);
    }
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))
}

#[tauri::command]
pub fn clipboard_clear(
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let mut entries = store.0.lock().unwrap();
    // 清空全部（保留收藏项），并清理对应缩略图文件
    for e in entries.iter().filter(|e| !e.favorite) {
        remove_image_file(e, &paths.images_dir);
    }
    entries.retain(|e| e.favorite);
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))
}

#[tauri::command]
pub fn clipboard_toggle_favorite(
    id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let mut entries = store.0.lock().unwrap();
    if let Some(e) = entries.iter_mut().find(|e| e.id == id) {
        e.favorite = !e.favorite;
    }
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))
}

#[tauri::command]
pub fn clipboard_toggle_pin(
    id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let mut entries = store.0.lock().unwrap();
    if let Some(e) = entries.iter_mut().find(|e| e.id == id) {
        e.pinned = !e.pinned;
    }
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))
}

/// 返回缩略图的 base64 data-url（缩略图已压缩至 200px，体积可控）
#[tauri::command]
pub fn clipboard_image_data(
    id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<String, String> {
    let rel = {
        let entries = store.0.lock().unwrap();
        entries
            .iter()
            .find(|e| e.id == id)
            .and_then(|e| e.image_path.clone())
            .ok_or_else(|| "未找到图片记录".to_string())?
    };
    let bytes = std::fs::read(paths.images_dir.join(&rel)).map_err(|e| format!("读取失败：{e}"))?;
    Ok(format!("data:image/png;base64,{}", base64_encode(&bytes)))
}

/// 将条目内容写回系统剪贴板（不触发重复记录）
#[tauri::command]
pub fn clipboard_write_back(
    id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let entry = {
        let entries = store.0.lock().unwrap();
        entries
            .iter()
            .find(|e| e.id == id)
            .cloned()
            .ok_or_else(|| "记录不存在".to_string())?
    };
    write_entry_to_clipboard(&entry, &paths.images_dir)
}

/// 写回剪贴板并模拟 Ctrl+V 粘贴到当前焦点应用
#[tauri::command]
pub fn clipboard_paste(
    id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    clipboard_write_back(id, store, paths)?;
    // 稍作延迟确保剪贴板写入完成、面板已让出焦点
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(80));
        let _ = simulate_paste();
    });
    Ok(())
}

fn write_entry_to_clipboard(
    entry: &ClipEntry,
    images_dir: &std::path::Path,
) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|e| format!("访问剪贴板失败：{e}"))?;
    SUPPRESS_WATCH.store(true, Ordering::SeqCst);
    let result = match &entry.kind {
        EntryKind::Text => cb
            .set_text(entry.text.clone().unwrap_or_default())
            .map_err(|e| format!("写入文本失败：{e}")),
        EntryKind::Image => {
            let rel = entry.image_path.as_deref().ok_or("图片路径缺失")?;
            let img =
                image::open(images_dir.join(rel)).map_err(|e| format!("读取图片失败：{e}"))?;
            let rgba = img.to_rgba8();
            let (w, h) = rgba.dimensions();
            let data = ImageData {
                bytes: Cow::Owned(rgba.into_raw()),
                width: w as usize,
                height: h as usize,
            };
            cb.set_image(data)
                .map_err(|e| format!("写入图片失败：{e}"))
        }
        EntryKind::Files => {
            let paths: Vec<PathBuf> = entry
                .files
                .clone()
                .unwrap_or_default()
                .into_iter()
                .map(PathBuf::from)
                .collect();
            cb.set()
                .file_list(&paths)
                .map_err(|e| format!("写入文件列表失败：{e}"))
        }
    };
    if result.is_err() {
        SUPPRESS_WATCH.store(false, Ordering::SeqCst);
    }
    result
}

fn simulate_paste() -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("初始化输入模拟失败：{e}"))?;
    let _ = enigo.key(Key::Control, Direction::Press);
    let _ = enigo.key(Key::V, Direction::Click);
    let _ = enigo.key(Key::Control, Direction::Release);
    Ok(())
}

fn remove_image_file(entry: &ClipEntry, images_dir: &std::path::Path) {
    if let Some(rel) = &entry.image_path {
        let _ = std::fs::remove_file(images_dir.join(rel));
    }
}

/// 极简 base64 编码，避免额外依赖
fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[(n >> 18 & 63) as usize] as char);
        out.push(TABLE[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(n >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
