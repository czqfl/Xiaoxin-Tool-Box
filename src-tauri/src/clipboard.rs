//! 剪贴板管理器：后台监听、历史记录持久化、写回与模拟粘贴。
use crate::config::{ConfigState, PasteMode};
use crate::storage::{save_json, AppPaths};
use arboard::{Clipboard, ImageData};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// 剪贴板内容变化事件，前端据此刷新列表
pub const EVT_CHANGED: &str = "clipboard://changed";

/// 主动写回剪贴板时置位，监听线程跳过本次变化，避免重复记录
pub static SUPPRESS_WATCH: AtomicBool = AtomicBool::new(false);

/// 顺序粘贴（全局 Ctrl+V / 面板手动粘贴）消耗的条目栈，供"撤销粘贴"逐条恢复。
/// 后进先出，可连续多次撤销；收藏项不会被消耗，不进入此缓冲。
static LAST_CONSUMED: Mutex<Vec<ClipEntry>> = Mutex::new(Vec::new());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    /// 普通文本
    Text,
    /// 富文本（剪贴板带格式 HTML，如从浏览器/Word 复制的加粗/彩色文字）
    RichText,
    /// 链接（文本本身是 URL，如 http(s):// / www. 开头）
    Link,
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
    /// 原图相对路径（image 类型，完整分辨率，写回剪贴板用）
    pub image_path: Option<String>,
    /// 缩略图相对路径（image 类型，200px，仅面板预览用）
    pub image_thumb_path: Option<String>,
    /// 文件路径列表（files 类型）
    pub files: Option<Vec<String>>,
    /// 来源应用（前台窗口进程名，尽力获取）
    pub source_app: Option<String>,
    pub created_at: i64,
    pub favorite: bool,
    pub pinned: bool,
    /// 顺序队列（FIFO/LIFO）中已消耗：收藏项被顺序粘贴消耗后【保留数据】
    /// （普通模式仍可见），但不再进入顺序队列；普通条目消耗后直接删除。
    #[serde(default)]
    pub consumed: bool,
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

/// 按 图片 > 文件 > 文本 的优先级读取剪贴板（尊重配置开关）。
/// 图片必须优先于文件：部分截图工具（如 Snipaste）复制图片时会附带文件列表，
/// 若文件优先会把图片误判为"文件复制"而永远进不了图片历史。
fn read_clipboard(watch_images: bool, watch_files: bool) -> Option<Snapshot> {
    let mut cb = Clipboard::new().ok()?;

    if watch_images {
        if let Ok(img) = cb.get_image() {
            if img.width > 0 && img.height > 0 {
                return Some(Snapshot::Image(img));
            }
        }
        // arboard 在 Windows 只读 CF_DIB 位图；Snipaste/系统截图等工具写入的
        // 主格式可能是 PNG/EMF（DIB 缺失或解析失败），此时枚举自定义 "PNG" 兜底
        #[cfg(windows)]
        if let Some(rgba) = read_png_from_clipboard() {
            let (w, h) = rgba.dimensions();
            return Some(Snapshot::Image(ImageData {
                bytes: Cow::Owned(rgba.into_raw()),
                width: w as usize,
                height: h as usize,
            }));
        }
    }
    if watch_files {
        if let Ok(files) = cb.get().file_list() {
            if !files.is_empty() {
                return Some(Snapshot::Files(files));
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

/// Windows：枚举剪贴板自定义格式，读取名为 "PNG" 的格式字节并解码为 RGBA。
/// Snipaste 等工具复制图片时常以 PNG 为主格式，arboard（仅 CF_DIB）读不到。
/// 【pub(crate)】贴图热键路径（pin.rs）复用同一兜底，否则"Snipaste 里复制
/// 图片 → 按贴图键无反应"（该场景 DIB 缺失，只有 PNG 格式可读）
#[cfg(windows)]
pub(crate) fn read_png_from_clipboard() -> Option<image::RgbaImage> {
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EnumClipboardFormats, GetClipboardData, GetClipboardFormatNameW,
        OpenClipboard,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    unsafe {
        if OpenClipboard(None).is_err() {
            return None;
        }
        let mut png_bytes: Option<Vec<u8>> = None;
        let mut fmt = 0u32;
        loop {
            fmt = EnumClipboardFormats(fmt);
            if fmt == 0 {
                break;
            }
            let mut buf = [0u16; 64];
            let len = GetClipboardFormatNameW(fmt, &mut buf);
            if len <= 0 {
                continue;
            }
            let name = String::from_utf16_lossy(&buf[..len as usize]);
            if !name.eq_ignore_ascii_case("png") {
                continue;
            }
            let Ok(h) = GetClipboardData(fmt) else {
                continue;
            };
            // GetClipboardData 返回 HANDLE，Global* 系列需要 HGLOBAL（同样是指针包装）
            let hg = windows::Win32::Foundation::HGLOBAL(h.0);
            let ptr = GlobalLock(hg);
            if ptr.is_null() {
                continue;
            }
            let size = GlobalSize(hg);
            if size > 0 {
                png_bytes = Some(std::slice::from_raw_parts(ptr as *const u8, size).to_vec());
            }
            let _ = GlobalUnlock(hg);
            break;
        }
        let _ = CloseClipboard();
        let bytes = png_bytes?;
        image::load_from_memory(&bytes).ok()?.into_rgba8().into()
    }
}

// ---------------------------------------------------------------------------
// 剪贴板事件监听（Windows）：隐藏窗口 + WM_CLIPBOARDUPDATE 实时通知
// ---------------------------------------------------------------------------

/// 创建隐藏窗口注册剪贴板监听，剪贴板内容一变立即通过 channel 通知监听线程，
/// 消除轮询延迟（复制后几乎瞬时入历史）。
#[cfg(windows)]
mod clipboard_listener {
    use std::sync::mpsc::Sender;
    use std::sync::OnceLock;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::DataExchange::AddClipboardFormatListener;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
        TranslateMessage, CW_USEDEFAULT, WM_CLIPBOARDUPDATE, WINDOW_EX_STYLE, WINDOW_STYLE,
        WNDCLASSW, MSG,
    };

    const CLASS_NAME: &str = "XiaoxinClipboardListener";
    static LISTENER_TX: OnceLock<Sender<()>> = OnceLock::new();

    unsafe extern "system" fn wnd_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_CLIPBOARDUPDATE {
            if let Some(tx) = LISTENER_TX.get() {
                let _ = tx.send(());
            }
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    pub fn start<R: tauri::Runtime>(app: tauri::AppHandle<R>, tx: Sender<()>) {
        let _ = app; // 借入 AppHandle 保持模块活跃（实际由 watcher 线程持有）
        std::thread::spawn(move || unsafe {
            let Ok(hinstance) = GetModuleHandleW(None) else {
                return;
            };
            let class_wide: Vec<u16> = CLASS_NAME
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            let wc = WNDCLASSW {
                lpfnWndProc: Some(wnd_proc),
                hInstance: hinstance.into(),
                lpszClassName: PCWSTR(class_wide.as_ptr()),
                style: Default::default(),
                ..Default::default()
            };
            if RegisterClassW(&wc) == 0 {
                return;
            }
            let Ok(hwnd) = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                PCWSTR(class_wide.as_ptr()),
                PCWSTR(class_wide.as_ptr()),
                WINDOW_STYLE(0),
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                None,
                None,
                Some(hinstance.into()),
                None,
            ) else {
                return;
            };
            if AddClipboardFormatListener(hwnd).is_err() {
                return;
            }
            let _ = LISTENER_TX.set(tx);
            // 消息循环：阻塞于本线程，收到 WM_CLIPBOARDUPDATE 即通知监听线程
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                let _ = DispatchMessageW(&msg);
            }
        });
    }
}

/// 启动后台监听线程。
/// - Windows 下由隐藏窗口监听 WM_CLIPBOARDUPDATE 事件，剪贴板一变立即唤醒（事件驱动，零轮询延迟）；
/// - 500ms 轮询保留作兜底（事件可能被其他进程持锁期间的变更漏掉）；
/// - 线程内任何 panic 都会被捕获并自动重启，避免监听静默失效。
pub fn start_watcher<R: Runtime>(app: AppHandle<R>) {
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    #[cfg(windows)]
    clipboard_listener::start(app.clone(), tx);
    std::thread::spawn(move || {
        let mut last_hash: u64 = 0;
        // 连续读取失败的次数：剪贴板被占用 / 源应用延迟渲染时快速重试，避免漏记。
        // 连续失败超过上限后回落到正常轮询间隔，避免空转。
        let mut fail_streak: u32 = 0;
        loop {
            // 读取失败期间用短超时快速重试（源应用延迟渲染或剪贴板被占用时，
            // 一次读不到不代表没复制；快速重试能覆盖这个窗口）
            let timeout = if fail_streak > 0 && fail_streak < 8 {
                Duration::from_millis(120)
            } else {
                Duration::from_millis(500)
            };
            // 事件到达立即返回；否则超时触发一次兜底轮询
            let _ = rx.recv_timeout(timeout);
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                watcher_tick(&app, &mut last_hash)
            }));
            match result {
                Ok(true) => fail_streak = 0,
                Ok(false) => fail_streak = fail_streak.saturating_add(1),
                Err(_) => {
                    eprintln!("[clipboard] watcher panic, restarting...");
                    fail_streak = 0;
                    std::thread::sleep(Duration::from_millis(1000));
                }
            }
        }
    });
}

/// 单次轮询：读剪贴板，内容变化时记录并广播（panic 时由 start_watcher 重启线程）。
/// 返回是否成功读到剪贴板快照：读不到（占用/延迟渲染）时调用方进入快速重试。
fn watcher_tick<R: Runtime>(app: &AppHandle<R>, last_hash: &mut u64) -> bool {
    // 首轮先同步一次队列可用性（历史数据可能非空）
    if *last_hash == 0 {
        if let Some(store) = app.try_state::<ClipboardStore>() {
            let entries = store.0.lock().unwrap();
            sync_seq_availability(&entries);
        }
    }

    let (watch_images, watch_files, max_history) = {
        let Some(cfg) = app.try_state::<ConfigState>() else {
            return false;
        };
        let guard = cfg.0.lock().unwrap();
        (
            guard.clipboard.watch_images,
            guard.clipboard.watch_files,
            guard.clipboard.max_history,
        )
    };

    let Some(snap) = read_clipboard(watch_images, watch_files) else {
        return false;
    };
    let hash = snap.hash();

    // 先消费主动写回标记（SUPPRESS_WATCH）：即使本次快照与上次相同（hash 相等提前
    // return），标记也必须被消费，否则会残留到下一次外部复制被误吞——这正是
    // "偶尔在其他应用复制的内容进不了剪贴板历史"的根因（例如从面板复制过账号密码、
    // 文件夹路径等写回操作后，紧接着的第一次外部复制会被当成写回跳过）。
    let suppress = SUPPRESS_WATCH.swap(false, Ordering::SeqCst);
    if hash == *last_hash {
        return true;
    }
    *last_hash = hash;

    // 主动写回引起的变化：跳过记录
    if suppress {
        return true;
    }

    let Some(paths) = app.try_state::<AppPaths>() else {
        return true;
    };
    let Some(store) = app.try_state::<ClipboardStore>() else {
        return true;
    };
    let Some(entry) = build_entry(&snap, hash, &paths.images_dir) else {
        return true;
    };

    let mut entries = store.0.lock().unwrap();
    // 不去重：重复复制的内容各自保留一条记录（用户需求）。
    // 顺序粘贴模式下"复制几次就能贴几次"，与队列语义一致；
    // 主动写回/复制密码等路径已由 SUPPRESS_WATCH 跳过，不会重复记录。
    entries.insert(0, entry);
    trim_entries(&mut entries, max_history as usize);
    let _ = save_json(&paths.clipboard_file, &*entries);
    sync_seq_availability(&entries);
    drop(entries);

    let _ = app.emit(EVT_CHANGED, ());
    true
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

/// 同步顺序粘贴队列可用性给键盘钩子：队列中【存在未消耗条目】时才允许
/// 拦截全局 Ctrl+V。全部已消耗（consumed=true，数据保留但退出顺序队列）时
/// 必须放行——此前用 !entries.is_empty() 判断，全消耗状态下 Ctrl+V 仍被吞，
/// 钩子里 sequential_paste 又因队列为空直接 return，按键凭空消失（"粘贴失效"）。
fn sync_seq_availability(entries: &[ClipEntry]) {
    #[cfg(windows)]
    crate::keyhook::set_seq_queue_available(entries.iter().any(|e| !e.consumed));
    #[cfg(not(windows))]
    {
        let _ = entries;
    }
}

/// 文本类型细分：链接（URL）> 富文本（剪贴板带格式 HTML）> 普通文本。
/// 优先级说明：从浏览器复制的链接通常同时带 CF_HTML，URL 语义优先于格式。
fn classify_text_kind(t: &str) -> EntryKind {
    if is_link(t.trim()) {
        return EntryKind::Link;
    }
    #[cfg(windows)]
    if clipboard_has_rich_html() {
        return EntryKind::RichText;
    }
    EntryKind::Text
}

/// 文本是否为链接：http(s):// / ftp:// / www. 开头（URL 复制的主流形态）
fn is_link(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("ftp://")
        || lower.starts_with("www.")
        || lower.starts_with("magnet:?")
}

/// Windows：剪贴板是否含【真正带格式】的 HTML（富文本）。
/// 复制纯文本时浏览器/Office 也会附带 CF_HTML，但 body 通常只是裸文本；
/// 仅当 body 含格式化标签（b/i/u/font/span/color 等）才判定为富文本，
/// 避免把普通复制全标成"富文本"。
#[cfg(windows)]
fn clipboard_has_rich_html() -> bool {
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EnumClipboardFormats, GetClipboardData, GetClipboardFormatNameW,
        OpenClipboard,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    unsafe {
        if OpenClipboard(None).is_err() {
            return false;
        }
        let mut found = false;
        let mut fmt = 0u32;
        loop {
            fmt = EnumClipboardFormats(fmt);
            if fmt == 0 {
                break;
            }
            let mut buf = [0u16; 64];
            let len = GetClipboardFormatNameW(fmt, &mut buf);
            if len <= 0 {
                continue;
            }
            let name = String::from_utf16_lossy(&buf[..len as usize]);
            if !name.eq_ignore_ascii_case("html format") {
                continue;
            }
            let Ok(h) = GetClipboardData(fmt) else {
                continue;
            };
            let hg = windows::Win32::Foundation::HGLOBAL(h.0);
            let ptr = GlobalLock(hg);
            if ptr.is_null() {
                continue;
            }
            let size = GlobalSize(hg);
            if size > 0 {
                let bytes = std::slice::from_raw_parts(ptr as *const u8, size);
                let text = String::from_utf8_lossy(bytes);
                found = html_has_formatting(&text);
            }
            let _ = GlobalUnlock(hg);
            break;
        }
        let _ = CloseClipboard();
        found
    }
}

/// 粗略判断 HTML 是否含格式化信息（不含则视为普通文本的 HTML 包装）
fn html_has_formatting(html: &str) -> bool {
    // 只扫 StartHTML 之后的实质内容（CF_HTML 头部是偏移声明，无关格式）
    let body = html
        .split("StartHTML:")
        .nth(1)
        .and_then(|s| s.split_once('\n'))
        .map(|(_, rest)| rest)
        .unwrap_or(html);
    let lower = body.to_ascii_lowercase();
    [
        "<b>", "<i>", "<u>", "<s>", "<strike", "<font", "<span", "<h1", "<h2", "<h3",
        "<li>", "<ul>", "<ol>", "<table", "<img", "color:", "background-color",
        "font-weight", "font-family", "text-decoration", "text-align",
    ]
    .iter()
    .any(|tag| lower.contains(tag))
}

fn build_entry(snap: &Snapshot, hash: u64, images_dir: &std::path::Path) -> Option<ClipEntry> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let source_app = source_app();

    let (kind, preview, text, image_path, image_thumb_path, files) = match snap {
        Snapshot::Text(t) => {
            let preview: String = t.chars().take(100).collect();
            // 文本类型细分：链接 > 富文本（剪贴板带格式 HTML）> 普通文本
            (classify_text_kind(t), preview, Some(t.clone()), None, None, None)
        }
        Snapshot::Image(img) => {
            let rel = format!("{id}.png");
            let thumb_rel = format!("{id}.thumb.png");
            // 原图无损保存（保持分辨率），缩略图仅用于面板预览。
            // 大图 PNG 编码可能耗时数秒，放到后台线程，监听线程不被阻塞，
            // 条目立即入库并广播，前端先显示条目、缩略图稍后加载。
            let bytes = img.bytes.to_vec();
            let (w, h) = (img.width as u32, img.height as u32);
            let dir = images_dir.to_path_buf();
            let save_rel = rel.clone();
            let save_thumb_rel = thumb_rel.clone();
            std::thread::spawn(move || {
                // 先缩略图（预览尽快可用）再原图
                let _ = save_thumbnail(&bytes, w, h, dir.join(&save_thumb_rel));
                let _ = save_original(&bytes, w, h, dir.join(&save_rel));
            });
            (
                EntryKind::Image,
                "图片".into(),
                None,
                Some(rel),
                Some(thumb_rel),
                None,
            )
        }
        Snapshot::Files(list) => {
            // 单个图片文件（资源管理器 / 微信等按文件方式复制图片）：识别为
            // "图片"类型——显示缩略图与图片徽标，与用户对"这是一张图"的认知
            // 一致。files 字段保留原文件路径：粘贴时写回文件列表（资源管理器
            // 粘贴=文件，与复制操作语义一致）。读取/解码失败则退回普通文件分类。
            if list.len() == 1 {
                if let Some(e) = image_file_entry(&list[0], &id, images_dir, hash) {
                    return Some(e);
                }
            }
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
            (EntryKind::Files, preview, None, None, None, Some(paths))
        }
    };

    Some(ClipEntry {
        id,
        kind,
        text,
        preview,
        image_path,
        image_thumb_path,
        files,
        source_app,
        created_at: now,
        favorite: false,
        pinned: false,
        consumed: false,
        content_hash: hash.to_string(),
    })
}

/// 单个图片文件 → "图片"类型条目：保存原图+缩略图（面板显示缩略图与图片
/// 徽标），files 保留原路径供粘贴写回文件列表。非图片扩展名或读取/解码
/// 失败返回 None，调用方退回普通文件分类。
fn image_file_entry(
    path: &std::path::Path,
    id: &str,
    images_dir: &std::path::Path,
    hash: u64,
) -> Option<ClipEntry> {
    if !is_image_ext(path) {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let img = image::load_from_memory(&bytes).ok()?;
    let (w, h) = (img.width(), img.height());
    let rel = format!("{id}.png");
    let thumb_rel = format!("{id}.thumb.png");
    let dir = images_dir.to_path_buf();
    // 与位图图片路径一致：缩略图与原图后台线程落盘，条目立即入库
    {
        let rel2 = rel.clone();
        let thumb2 = thumb_rel.clone();
        std::thread::spawn(move || {
            let _ = save_thumbnail(&bytes, w, h, dir.join(&thumb2));
            let _ = save_original(&bytes, w, h, dir.join(&rel2));
        });
    }
    Some(ClipEntry {
        id: id.to_string(),
        kind: EntryKind::Image,
        text: None,
        preview: "图片".into(),
        image_path: Some(rel),
        image_thumb_path: Some(thumb_rel),
        files: Some(vec![path.to_string_lossy().to_string()]),
        source_app: source_app(),
        created_at: chrono::Utc::now().timestamp_millis(),
        favorite: false,
        pinned: false,
        consumed: false,
        content_hash: hash.to_string(),
    })
}

/// 扩展名是否图片（实际能否解码由调用方的 load 判定兜底）。
/// 【pub(crate)】贴图热键路径识别"单个图片文件"时复用
pub(crate) fn is_image_ext(path: &std::path::Path) -> bool {
    path.extension()
        .map(|e| {
            let e = e.to_string_lossy().to_ascii_lowercase();
            matches!(
                e.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tif" | "tiff" | "ico" | "avif"
            )
        })
        .unwrap_or(false)
}

/// 保存完整分辨率原图（PNG 无损，快速压缩），写回剪贴板时保持清晰度
fn save_original(bytes: &[u8], width: u32, height: u32, path: PathBuf) -> std::io::Result<()> {
    let rgba = image::RgbaImage::from_raw(width, height, bytes.to_vec())
        .ok_or_else(|| std::io::Error::other("图片数据无效"))?;
    save_png_fast(&rgba, path)
}

/// 保存 200px 缩略图，仅用于面板预览，减小内存与传输体积
fn save_thumbnail(bytes: &[u8], width: u32, height: u32, path: PathBuf) -> std::io::Result<()> {
    let rgba = image::RgbaImage::from_raw(width, height, bytes.to_vec())
        .ok_or_else(|| std::io::Error::other("图片数据无效"))?;
    let thumb = image::imageops::thumbnail(&rgba, 200, 200);
    save_png_fast(&thumb, path)
}

/// 用 Fast 压缩写 PNG：比默认压缩快数倍（大图从秒级降到亚秒级），体积略增
fn save_png_fast(rgba: &image::RgbaImage, path: PathBuf) -> std::io::Result<()> {
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};
    use image::ImageEncoder;
    let file = std::fs::File::create(path)?;
    let enc = PngEncoder::new_with_quality(file, CompressionType::Fast, FilterType::Adaptive);
    enc.write_image(
        rgba.as_raw(),
        rgba.width(),
        rgba.height(),
        image::ExtendedColorType::Rgba8,
    )
    .map_err(std::io::Error::other)
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
    sync_seq_availability(&entries);
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))
}

#[tauri::command]
pub fn clipboard_clear(
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let mut entries = store.0.lock().unwrap();
    // 清空后不应再能撤销回已被清掉的条目，回滚栈一并清空
    LAST_CONSUMED.lock().unwrap().clear();
    // 清空全部（保留收藏项），并清理对应缩略图文件
    for e in entries.iter().filter(|e| !e.favorite) {
        remove_image_file(e, &paths.images_dir);
    }
    entries.retain(|e| e.favorite);
    // 顺带回收孤儿图片（顺序粘贴消耗但未撤销的条目残留的文件）
    cleanup_orphan_images(&paths.images_dir, &entries);
    sync_seq_availability(&entries);
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
        // 取消收藏：若该条是"已消耗的收藏项"（数据保留但退出顺序队列），
        // 重置 consumed，恢复普通条目语义、重新参与顺序队列
        if !e.favorite {
            e.consumed = false;
        }
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

/// 返回预览图的 base64 data-url（优先缩略图；旧记录无缩略图时回退原图）
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
            .and_then(|e| {
                e.image_thumb_path
                    .clone()
                    .or_else(|| e.image_path.clone())
            })
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

/// 直接写入一段文本到系统剪贴板（不触发监听重复记录）。
/// 供账号密码面板使用：复制账号/密码时不污染剪贴板历史，避免凭据泄露。
#[tauri::command]
pub fn clipboard_copy_text(text: String) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|e| format!("访问剪贴板失败：{e}"))?;
    SUPPRESS_WATCH.store(true, Ordering::SeqCst);
    if let Err(e) = cb.set_text(text) {
        SUPPRESS_WATCH.store(false, Ordering::SeqCst);
        return Err(format!("复制失败：{e}"));
    }
    Ok(())
}

/// 顺序粘贴去抖：按住 Ctrl 连点 V 时热键可能连发，150ms 内只处理一次
static LAST_SEQ_PASTE: AtomicI64 = AtomicI64::new(0);

/// 顺序模式下的全局 Ctrl+V：取队首条目（FIFO 按复制先后、LIFO 倒序），
/// 写回剪贴板并模拟粘贴，随后消耗该条（收藏项保留）
pub fn sequential_paste<R: Runtime>(app: &AppHandle<R>) {
    let now = chrono::Utc::now().timestamp_millis();
    let last = LAST_SEQ_PASTE.swap(now, Ordering::SeqCst);
    if now - last < 150 {
        return;
    }
    let mode = {
        let Some(cfg) = app.try_state::<ConfigState>() else {
            return;
        };
        let guard = cfg.0.lock().unwrap();
        guard.clipboard.paste_mode
    };
    if mode == PasteMode::Normal {
        return;
    }
    let Some(store) = app.try_state::<ClipboardStore>() else {
        return;
    };
    let Some(paths) = app.try_state::<AppPaths>() else {
        return;
    };
    // 队首 = 按模式排序后的第一条（与面板队列顺序一致）。
    // 收藏项也参与顺序队列（收藏的"防消耗"仅普通模式有效），但已消耗的
    // （consumed）条目不再入队——它们保留数据但已从队列走掉。
    let entry = {
        let entries = store.0.lock().unwrap();
        let mut queue: Vec<ClipEntry> = entries
            .iter()
            .filter(|e| !e.consumed)
            .cloned()
            .collect();
        match mode {
            PasteMode::Fifo => queue.sort_by_key(|e| e.created_at),
            PasteMode::Lifo => queue.sort_by_key(|e| std::cmp::Reverse(e.created_at)),
            PasteMode::Normal => {}
        }
        queue.into_iter().next()
    };
    let Some(entry) = entry else { return };
    if write_entry_to_clipboard(&entry, &paths.images_dir).is_err() {
        return;
    }
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(80));
        let _ = simulate_paste();
    });
    // 消耗已粘贴条目：无论收藏与否都【保留数据】（普通模式仍可见——
    // 此前非收藏项被 remove 移除，用户反馈"非收藏数据在面板消失"），
    // 仅标记 consumed 退出顺序队列；回滚栈记录克隆，撤销时清除标记重新入队。
    // 历史数据量由 max_history 裁剪（trim_entries）控制。
    let mut entries = store.0.lock().unwrap();
    if let Some(pos) = entries.iter().position(|e| e.id == entry.id) {
        entries[pos].consumed = true;
        LAST_CONSUMED.lock().unwrap().push(entries[pos].clone());
    }
    let _ = save_json(&paths.clipboard_file, &*entries);
    sync_seq_availability(&entries);
    drop(entries);
    let _ = app.emit(EVT_CHANGED, ());
}

/// 顺序模式下手动粘贴（点击 / Enter / 数字键）后的消耗：
/// 无论收藏与否都保留数据（普通模式仍可见），仅标记 consumed 退出顺序队列，
/// 回滚栈记录克隆供撤销恢复（"防消耗"对所有条目生效，不再丢数据）。
/// 与全局 Ctrl+V 的 sequential_paste 消耗路径语义一致，撤销统一生效。
#[tauri::command]
pub fn clipboard_consume(
    app: AppHandle,
    id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let mut entries = store.0.lock().unwrap();
    if let Some(pos) = entries.iter().position(|e| e.id == id) {
        // 保留数据，标记已消耗（不再进入顺序队列，普通模式仍展示）
        entries[pos].consumed = true;
        LAST_CONSUMED.lock().unwrap().push(entries[pos].clone());
        save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))?;
        sync_seq_availability(&entries);
    }
    drop(entries);
    let _ = app.emit(EVT_CHANGED, ());
    Ok(())
}

/// 撤销最近一次顺序粘贴的消耗：条目消耗后保留数据（仅标记 consumed），
/// 撤销 = 清除 consumed 标记，按原 created_at 位置重新参与顺序队列。
/// 回滚栈支持连续多次撤销：每次撤销最近一条；条目已被手动删除（兜底）
/// 则按 created_at 插回队列。用于"按了 Ctrl+V 却没粘贴上 / 粘贴错地方"时恢复。
#[tauri::command]
pub fn clipboard_rollback(
    app: AppHandle,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let mut entries = store.0.lock().unwrap();
    loop {
        // 弹出最近一次消耗的条目（锁在表达式内即刻释放，避免与消费路径锁序交叉）
        let Some(entry) = LAST_CONSUMED.lock().unwrap().pop() else {
            return Ok(());
        };
        // 条目仍保留在列表中（消耗后仅标记 consumed）：清除标记重新入队
        if let Some(e) = entries.iter_mut().find(|e| e.id == entry.id) {
            e.consumed = false;
            save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))?;
            sync_seq_availability(&entries);
            drop(entries);
            let _ = app.emit(EVT_CHANGED, ());
            return Ok(());
        }
        // 兜底：条目确实不在（旧版本数据 / 手动删除）→ 按 created_at 插回
        let pos = entries
            .iter()
            .position(|e| e.created_at > entry.created_at)
            .unwrap_or(entries.len());
        entries.insert(pos, entry);
        save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))?;
        sync_seq_availability(&entries);
        drop(entries);
        let _ = app.emit(EVT_CHANGED, ());
        return Ok(());
    }
}

/// 把指定条目设为"下一条待粘贴"：无论当前是 FIFO 还是 LIFO，点击后它立即成为
/// 队列队首（Ctrl+V 带出的内容），面板列表同步把它排到第一项。
/// 实现：把 created_at 放到"当前模式下队首的前一位"——
/// - LIFO（最新优先）：置为 now，必然最新 → 队首；
/// - FIFO（最旧优先）：置为比当前最旧还旧 1ms → 队首。
#[tauri::command]
pub fn clipboard_enqueue(
    app: AppHandle,
    id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
    config: State<'_, ConfigState>,
) -> Result<(), String> {
    let mode = config.0.lock().unwrap().clipboard.paste_mode;
    let mut entries = store.0.lock().unwrap();
    let Some(pos) = entries.iter().position(|e| e.id == id) else {
        return Err("记录不存在".into());
    };
    let mut entry = entries.remove(pos);
    // 手动重新入队：清除"已消耗"标记（收藏项消耗后可在此重新进入顺序队列）
    entry.consumed = false;
    let now = chrono::Utc::now().timestamp_millis();
    entry.created_at = if mode == PasteMode::Fifo {
        let oldest = entries.iter().map(|e| e.created_at).min().unwrap_or(now);
        oldest.saturating_sub(1)
    } else {
        now
    };
    entries.insert(0, entry);
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))?;
    drop(entries);
    let _ = app.emit(EVT_CHANGED, ());
    Ok(())
}

/// 在粘贴队列中把条目上移/下移一位（仅顺序模式 FIFO / LIFO）。
/// 实现与 clipboard_enqueue 一致：改写 created_at 到邻居条目的前/后——
/// FIFO（旧→新）上移=比前一条更旧、下移=比后一条更新；LIFO（新→旧）反向。
/// 队首不可上移、队尾不可下移，由前端禁用按钮，后端同样防御。
#[tauri::command]
pub fn clipboard_move(
    app: AppHandle,
    id: String,
    direction: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
    config: State<'_, ConfigState>,
) -> Result<(), String> {
    let mode = config.0.lock().unwrap().clipboard.paste_mode;
    if mode == PasteMode::Normal {
        return Err("顺序模式下才可调整队列顺序".into());
    }
    let mut entries = store.0.lock().unwrap();
    let Some(pos) = entries.iter().position(|e| e.id == id) else {
        return Err("记录不存在".into());
    };
    // 当前队列顺序（与面板 buildQueue 一致），定位目标条目及相邻条目
    let mut order: Vec<usize> = (0..entries.len()).collect();
    match mode {
        PasteMode::Fifo => order.sort_by_key(|&i| entries[i].created_at),
        PasteMode::Lifo => order.sort_by_key(|&i| std::cmp::Reverse(entries[i].created_at)),
        PasteMode::Normal => unreachable!(),
    }
    let cur = order.iter().position(|&i| i == pos).unwrap();
    let neighbor = match direction.as_str() {
        "up" if cur > 0 => order[cur - 1],
        "down" if cur + 1 < order.len() => order[cur + 1],
        _ => return Err("已在队首或队尾，无法移动".into()),
    };
    let neighbor_ts = entries[neighbor].created_at;
    // FIFO 升序、LIFO 降序；与邻居交换相对位置（±1ms 保证严格前/后）
    let is_fifo = mode == PasteMode::Fifo;
    let move_up = direction == "up";
    entries[pos].created_at = if is_fifo == move_up {
        neighbor_ts.saturating_sub(1)
    } else {
        neighbor_ts.saturating_add(1)
    };
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))?;
    drop(entries);
    let _ = app.emit(EVT_CHANGED, ());
    Ok(())
}

/// 计算把新条目插到队列位置 t（即 order[t] 之前）所需的 created_at。
/// FIFO 升序 / LIFO 降序；与相邻条目无空隙时，把 order[t..]（目标及其后）整体
/// 偏移 1ms 腾出位置（±1ms 不影响相对时间显示）。order 不包含新条目自身。
fn created_at_at(
    entries: &mut [ClipEntry],
    order: &[usize],
    t: usize,
    is_fifo: bool,
) -> i64 {
    if t == 0 {
        // 队首：FIFO 比原队首更旧，LIFO 比原队首更新
        let n = entries[order[0]].created_at;
        return if is_fifo {
            n.saturating_sub(1)
        } else {
            n.saturating_add(1)
        };
    }
    let p = entries[order[t - 1]].created_at;
    let n = entries[order[t]].created_at;
    if is_fifo {
        // 需要 p < new < n；无空隙时目标及其后整体后移 1ms 腾位
        if n > p && n - p > 1 {
            p + 1
        } else {
            for &i in &order[t..] {
                entries[i].created_at = entries[i].created_at.saturating_add(1);
            }
            p.saturating_add(1)
        }
    } else {
        // LIFO 降序：需要 p > new > n；无空隙时目标及其后整体前移 1ms
        if p > n && p - n > 1 {
            p - 1
        } else {
            for &i in &order[t..] {
                entries[i].created_at = entries[i].created_at.saturating_sub(1);
            }
            p.saturating_sub(1)
        }
    }
}

/// 顺序模式下拖动排序：把条目移动到 target_id 之前（target_id 为 "__end__" 时移到队尾）。
/// 队列顺序由 created_at 派生，因此通过改写 created_at 实现：
/// 取插入位置前后邻居的时间插到两者中间；前后相邻无空隙时，把插入点之后的条目
/// 整体偏移 1ms 腾出位置（±1ms 不影响相对时间显示）。
#[tauri::command]
pub fn clipboard_reorder(
    app: AppHandle,
    id: String,
    target_id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
    config: State<'_, ConfigState>,
) -> Result<(), String> {
    let mode = config.0.lock().unwrap().clipboard.paste_mode;
    if mode == PasteMode::Normal {
        return Err("顺序模式下才可调整队列顺序".into());
    }
    let mut entries = store.0.lock().unwrap();
    let Some(pos) = entries.iter().position(|e| e.id == id) else {
        return Err("记录不存在".into());
    };
    if entries.len() < 2 || id == target_id {
        return Ok(());
    }
    // 当前队列顺序；移除被拖条目后定位插入点（目标之前 / 队尾）
    let mut order: Vec<usize> = (0..entries.len()).collect();
    match mode {
        PasteMode::Fifo => order.sort_by_key(|&i| entries[i].created_at),
        PasteMode::Lifo => order.sort_by_key(|&i| std::cmp::Reverse(entries[i].created_at)),
        PasteMode::Normal => unreachable!(),
    }
    let original = order.clone();
    let cur = order.iter().position(|&i| i == pos).unwrap();
    order.remove(cur);
    let t = if target_id == "__end__" {
        order.len()
    } else {
        order
            .iter()
            .position(|&i| entries[i].id == target_id)
            .ok_or_else(|| "目标记录不存在".to_string())?
    };
    // 拖回原位则无需改动
    let mut check = order.clone();
    check.insert(t, pos);
    if check == original {
        return Ok(());
    }
    let is_fifo = mode == PasteMode::Fifo;
    let new_ts = if t == order.len() {
        // 队尾：FIFO 比原队尾更新，LIFO 比原队尾更旧
        let p = entries[order[t - 1]].created_at;
        if is_fifo {
            p.saturating_add(1)
        } else {
            p.saturating_sub(1)
        }
    } else {
        // 插到 order[t]（原目标）之前；order 此时不含被拖条目
        created_at_at(&mut entries, &order, t, is_fifo)
    };
    entries[pos].created_at = new_ts;
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))?;
    drop(entries);
    let _ = app.emit(EVT_CHANGED, ());
    Ok(())
}

/// 编辑文本条目的内容：更新 text 与 preview（前 100 字），并重新计算内容哈希。
/// 仅文本类型可编辑（图片/文件条目不提供入口，后端同样防御）。
#[tauri::command]
pub fn clipboard_update_text(
    app: AppHandle,
    id: String,
    text: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("内容不能为空".into());
    }
    let mut entries = store.0.lock().unwrap();
    let Some(entry) = entries.iter_mut().find(|e| e.id == id) else {
        return Err("记录不存在".into());
    };
    if !matches!(
        entry.kind,
        EntryKind::Text | EntryKind::RichText | EntryKind::Link
    ) {
        return Err("仅文本记录可编辑".into());
    }
    let preview: String = text.chars().take(100).collect();
    // 编辑后按新内容重分类（链接判定；富文本判定依赖剪贴板现场，编辑时不做）
    entry.kind = if is_link(text.trim()) {
        EntryKind::Link
    } else {
        EntryKind::Text
    };
    entry.text = Some(text.clone());
    entry.preview = preview;
    // 重新计算内容哈希（与监听/手动插入路径的算法保持一致）
    let mut h = DefaultHasher::new();
    "text".hash(&mut h);
    text.hash(&mut h);
    entry.content_hash = h.finish().to_string();
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))?;
    drop(entries);
    let _ = app.emit(EVT_CHANGED, ());
    Ok(())
}

/// 手动新增一条文本条目，插入到 before_id 条目上方（队列中它的前一条）。
/// 实现：把新条目的 created_at 放到目标条目的紧前位置（FIFO 升序 / LIFO 降序），
/// 立即成为目标条目的前一条。与监听记录不同：手动新增不去重，每条输入都会
/// 作为独立条目追加（"在原有基础上再加一条"）。
#[tauri::command]
pub fn clipboard_insert_text(
    app: AppHandle,
    text: String,
    before_id: String,
    store: State<'_, ClipboardStore>,
    paths: State<'_, AppPaths>,
    config: State<'_, ConfigState>,
) -> Result<(), String> {
    let (mode, max_history) = {
        let guard = config.0.lock().unwrap();
        (guard.clipboard.paste_mode, guard.clipboard.max_history)
    };
    let mut entries = store.0.lock().unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    // 目标条目的队列位置：新条目插到它之前（目标本身仍是下一条之后那条）
    let created_at = if mode == PasteMode::Normal || entries.is_empty() {
        now
    } else {
        let mut order: Vec<usize> = (0..entries.len()).collect();
        match mode {
            PasteMode::Fifo => order.sort_by_key(|&i| entries[i].created_at),
            PasteMode::Lifo => order.sort_by_key(|&i| std::cmp::Reverse(entries[i].created_at)),
            PasteMode::Normal => {}
        }
        let t = order
            .iter()
            .position(|&i| entries[i].id == before_id)
            .ok_or_else(|| "目标记录不存在".to_string())?;
        created_at_at(&mut entries, &order, t, mode == PasteMode::Fifo)
    };
    let preview: String = text.chars().take(100).collect();
    let mut h = DefaultHasher::new();
    "text".hash(&mut h);
    text.hash(&mut h);
    entries.insert(
        0,
        ClipEntry {
            id: uuid::Uuid::new_v4().to_string(),
            kind: EntryKind::Text,
            text: Some(text),
            preview,
            image_path: None,
            image_thumb_path: None,
            files: None,
            source_app: None,
            created_at,
            favorite: false,
            pinned: false,
            consumed: false,
            content_hash: h.finish().to_string(),
        },
    );
    trim_entries(&mut entries, max_history as usize);
    save_json(&paths.clipboard_file, &*entries).map_err(|e| format!("保存失败：{e}"))?;
    sync_seq_availability(&entries);
    drop(entries);
    let _ = app.emit(EVT_CHANGED, ());
    Ok(())
}

/// 清理孤儿图片文件：images 目录中未被任何条目引用的文件。
/// 顺序粘贴消耗的条目不再即时删文件（保证可撤销），其残留文件在此统一回收。
fn cleanup_orphan_images(images_dir: &Path, entries: &[ClipEntry]) {
    let referenced: HashSet<PathBuf> = entries
        .iter()
        .flat_map(|e| {
            [e.image_path.as_deref(), e.image_thumb_path.as_deref()]
                .into_iter()
                .flatten()
                .map(|rel| images_dir.join(rel))
        })
        .collect();
    let Ok(rd) = std::fs::read_dir(images_dir) else {
        return;
    };
    for f in rd.flatten() {
        let p = f.path();
        if p.is_file() && !referenced.contains(&p) {
            let _ = std::fs::remove_file(p);
        }
    }
}

fn write_entry_to_clipboard(
    entry: &ClipEntry,
    images_dir: &std::path::Path,
) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|e| format!("访问剪贴板失败：{e}"))?;
    SUPPRESS_WATCH.store(true, Ordering::SeqCst);
    let result = match &entry.kind {
        EntryKind::Text | EntryKind::RichText | EntryKind::Link => cb
            .set_text(entry.text.clone().unwrap_or_default())
            .map_err(|e| format!("写入文本失败：{e}")),
        EntryKind::Image => {
            // 文件来源的图片（复制图片文件）：写回文件列表——粘贴进资源管理器
            // 仍是文件操作，与"复制文件"的语义一致（arboard 的位图写入会先
            // 清空剪贴板，两者不能共存，只能二选一）
            if let Some(paths) = &entry.files {
                if !paths.is_empty() {
                    let pbs: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
                    return cb
                        .set()
                        .file_list(&pbs)
                        .map_err(|e| format!("写入文件失败：{e}"));
                }
            }
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
    #[cfg(windows)]
    {
        // 自注入带魔数标记，键盘钩子会放行；用 enigo 会被自己的钩子误吞
        crate::keyhook::send_ctrl_v();
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        use enigo::{Direction, Enigo, Key, Keyboard, Settings};
        let mut enigo =
            Enigo::new(&Settings::default()).map_err(|e| format!("初始化输入模拟失败：{e}"))?;
        let _ = enigo.key(Key::Control, Direction::Press);
        let _ = enigo.key(Key::V, Direction::Click);
        let _ = enigo.key(Key::Control, Direction::Release);
        Ok(())
    }
}

fn remove_image_file(entry: &ClipEntry, images_dir: &std::path::Path) {
    if let Some(rel) = &entry.image_path {
        let _ = std::fs::remove_file(images_dir.join(rel));
    }
    if let Some(rel) = &entry.image_thumb_path {
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
