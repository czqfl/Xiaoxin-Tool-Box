//! Pin (sticky image) windows: create, persist, zoom/opacity/rotate, hide/show all.

use crate::config::{ConfigState, PinConfig};
use crate::storage::{AppPaths, diag_write, save_json, load_json};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

pub const PIN_PREFIX: &str = "pin";
pub const EVT_PIN_VISIBILITY: &str = "pin://visibility-changed";
/// 复用贴图窗（预建隐藏窗）的固定标签：新贴图优先装进它，免建窗秒显
pub const STAGING_LABEL: &str = "pin-staging";

/// 贴图全显/全隐切换的在途标记：同一时刻只允许一个切换流程执行（防抖）
static TOGGLE_BUSY: AtomicBool = AtomicBool::new(false);
/// 前端监听：staging 窗被分配了某个贴图任务（payload: { id })
pub const EVT_PIN_ASSIGN: &str = "pin://assign";

/// 贴图窗口标签映射（staging 复用窗的 label 固定不变，此处存 label→贴图id）
pub struct PinWinMap(pub Mutex<std::collections::HashMap<String, String>>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinData {
    pub id: String,
    pub file: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub opacity: f64,
    pub rotation: i32,
    pub flip_h: bool,
    pub flip_v: bool,
    pub shadow: bool,
    pub click_through: bool,
}

pub struct PinStore(pub Mutex<Vec<PinData>>);

fn pins_file<R: Runtime>(app: &AppHandle<R>) -> std::path::PathBuf {
    let paths = app.try_state::<AppPaths>().unwrap();
    paths.data_dir.join("pins.json")
}

fn pins_dir<R: Runtime>(app: &AppHandle<R>) -> std::path::PathBuf {
    let paths = app.try_state::<AppPaths>().unwrap();
    let dir = paths.data_dir.join("pins");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn persist<R: Runtime>(store: &PinStore, app: &AppHandle<R>) {
    let entries = store.0.lock().unwrap().clone();
    let _ = save_json(&pins_file(app), &entries);
}

pub fn load_pins<R: Runtime>(app: &AppHandle<R>) -> Vec<PinData> {
    load_json(&pins_file(app), vec![])
}

pub fn restore_pins<R: Runtime>(app: &AppHandle<R>) {
    let cfg: PinConfig = app.try_state::<ConfigState>()
        .map(|s| s.0.lock().unwrap().pin.clone())
        .unwrap_or_default();
    if !cfg.restore_on_start { return; }
    let entries = load_pins(app);
    if entries.is_empty() { return; }
    let store = app.try_state::<PinStore>();
    if let Some(s) = &store {
        *s.0.lock().unwrap() = entries.clone();
    }
    for pin in &entries {
        create_window(app, pin);
    }
    diag_write(&format!("[pin] restored {} pins", entries.len()));
}

fn create_window<R: Runtime>(app: &AppHandle<R>, pin: &PinData) {
    let url = match app.config().build.dev_url.clone() {
        Some(u) => WebviewUrl::External(u),
        None => WebviewUrl::App("index.html".into()),
    };
    let label = format!("{PIN_PREFIX}-{}", pin.id);
    let app2 = app.clone();
    let pin2 = pin.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        let win = WebviewWindowBuilder::new(&app2, &label, url)
            .title("pin").decorations(false).transparent(true)
            .always_on_top(true).skip_taskbar(true).resizable(false)
            .shadow(false).visible(false).focused(false).build();
        if let Ok(w) = win {
            let _ = w.set_position(PhysicalPosition::new(pin2.x, pin2.y));
            let _ = w.set_size(PhysicalSize::new(pin2.width, pin2.height));
            let _ = w.set_always_on_top(true);
            // 不在这里 show：等前端把贴图渲染好调 pin_ready 再显示，
            // 否则窗口先出现、图片后到，肉眼可见地"闪一下"
            #[cfg(windows)]
            if let Some(hwnd) = crate::screenshot::hwnd_of_webview(&w) {
                crate::screenshot::disable_show_animation(hwnd);
            }
        }
    });
}

// ---------- commands ----------

/// 解析贴图 id 对应的窗口：优先 pin-{id} 直配窗（启动恢复/旧路径），
/// 其次查 staging 复用映射（截图贴图主路径）
fn window_of_pin<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(&format!("{PIN_PREFIX}-{id}")) {
        return Some(w);
    }
    let map = app.try_state::<PinWinMap>()?;
    let label = {
        let m = map.0.lock().unwrap();
        m.iter().find(|(_, v)| v.as_str() == id).map(|(k, _)| k.clone())
    }?;
    app.get_webview_window(&label)
}

/// 确保存在一个隐藏的「复用贴图窗」（屏幕外待命）。新建贴图时直接把图片装进
/// 这个已就绪的窗——免去「临时创建 WebView2 窗口 + 加载整个前端应用」的
/// 数百毫秒到数秒开销。这正是此前贴图卡顿、闪桌面、偶发失败的根源。
pub(crate) fn ensure_staging<R: Runtime>(app: &AppHandle<R>) {
    if app.get_webview_window(STAGING_LABEL).is_some() { return; }
    let url = match app.config().build.dev_url.clone() {
        Some(u) => WebviewUrl::External(u),
        None => WebviewUrl::App("index.html".into()),
    };
    let app2 = app.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        if app2.get_webview_window(STAGING_LABEL).is_some() { return; }
        let _ = WebviewWindowBuilder::new(&app2, STAGING_LABEL, url)
            .title("pin").decorations(false).transparent(true)
            .always_on_top(true).skip_taskbar(true).resizable(false)
            .shadow(false).visible(false).focused(false)
            // 屏幕外待命：空壳窗永不可见、不参与布局
            .position(-32000.0, -32000.0).inner_size(240.0, 160.0)
            .build();
    });
}

/// 把新贴图装进隐藏的 staging 复用窗：
/// 1) 通知该窗前端加载指定贴图（文件已在盘、协议直出，毫秒级）
/// 2) 前端渲染完成调 pin_ready → 先显示贴图【然后才】收起截图遮罩——
///    彻底消除「遮罩先消失露出裸桌面、贴图延迟才弹出」的闪烁
/// 3) 立即补建下一个 staging 待命；1.5s 内没显示（页面异常）则回退旧建窗路径兜底
pub(crate) fn attach_to_staging<R: Runtime>(app: &AppHandle<R>, pin: PinData) {
    // 可复用的前提：staging 窗存在、隐藏、且【尚未分配任务】——
    // 连续快速贴两张时，第一张可能还在加载中（窗仍隐藏但已占用），
    // 只看可见性会覆盖其分配关系导致第一张贴图丢失
    let already_assigned = app.try_state::<PinWinMap>()
        .map(|m| m.0.lock().unwrap().contains_key(STAGING_LABEL))
        .unwrap_or(false);
    let staged = !already_assigned
        && app.get_webview_window(STAGING_LABEL)
            .map(|w| !w.is_visible().unwrap_or(true))
            .unwrap_or(false);
    if !staged {
        // 无可用 staging（已被上一张贴图占用等）：退回旧建窗路径。
        // 注意旧路径同样由 pin_ready 先显窗后收遮罩，依旧无闪烁，只是慢一点
        create_window(app, &pin);
        return;
    }
    // 【先摆放再装图】staging 预建时是屏幕外 (-32000,-32000)、240×160 的空壳，
    // 不先挪到目标位置与尺寸就显示的话，贴图会以小尺寸出现在屏幕左上角
    if let Some(w) = app.get_webview_window(STAGING_LABEL) {
        let _ = w.set_position(PhysicalPosition::new(pin.x, pin.y));
        let _ = w.set_size(PhysicalSize::new(pin.width, pin.height));
        let _ = w.set_always_on_top(true);
        #[cfg(windows)]
        if let Some(hwnd) = crate::screenshot::hwnd_of_webview(&w) {
            crate::screenshot::disable_show_animation(hwnd);
        }
    }
    if let Some(m) = app.try_state::<PinWinMap>() {
        m.0.lock().unwrap().insert(STAGING_LABEL.to_string(), pin.id.clone());
    }
    let _ = app.emit_to(STAGING_LABEL, EVT_PIN_ASSIGN, serde_json::json!({ "id": pin.id }));
    let app2 = app.clone();
    let pid = pin.id.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        let shown = app2.get_webview_window(STAGING_LABEL)
            .map(|w| w.is_visible().ok() == Some(true))
            .unwrap_or(false);
        if !shown {
            // staging 页面无响应：回退旧建窗路径，并强制收遮罩保底
            if let Some(s) = app2.try_state::<PinStore>() {
                let p = { let e = s.0.lock().unwrap(); e.iter().find(|p| p.id == pid).cloned() };
                if let Some(p) = p { create_window(&app2, &p); }
            }
            crate::screenshot::hide_all(&app2);
            if let Some(m) = app2.try_state::<PinWinMap>() {
                m.0.lock().unwrap().remove(STAGING_LABEL);
            }
        }
        ensure_staging(&app2);
    });
}

/// 前端把贴图画好后调用：此刻才显示贴图窗口。
/// 时序关键点：【先】显示贴图，【后】收起截图遮罩——视觉上"遮罩揭开的瞬间
/// 贴图已经在原位"，不再有中间露出桌面的闪烁帧。async 跑在 tokio 线程池，
/// 置前抢焦点等 Win32 调用不占主线程事件循环。
#[tauri::command]
pub async fn pin_ready(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    // 未分配贴图的 staging 空壳窗：忽略，绝不显示
    if label == STAGING_LABEL {
        let assigned = app.try_state::<PinWinMap>()
            .and_then(|m| m.0.lock().unwrap().get(&label).cloned());
        if assigned.is_none() { return Ok(()); }
    }
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.show();
        #[cfg(windows)]
        if let Some(hwnd) = crate::screenshot::hwnd_of_webview(&w) {
            crate::acrylic::force_foreground_robust(hwnd);
        }
        // 收遮罩延后 ~80ms（约 5 帧）：就绪信号来自隐藏窗里的 rAF，证明不了
        // 显示后首帧已 present。这期间即便贴图尚未合成完毕，底下仍是截图冻结
        // 画面而非裸桌面；遮罩揭开时贴图必已画好——彻底消除"闪一下"
        let app2 = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(80));
            crate::screenshot::hide_all(&app2);
        });
        // 本次 staging 已消耗：立刻补一个待命
        if label == STAGING_LABEL {
            ensure_staging(&app);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn pin_create(app: AppHandle, png: String, x: i32, y: i32) -> Result<PinData, String> {
    create_from_b64(&app, &png, x, y)
}

#[tauri::command]
pub fn pin_from_clipboard(app: AppHandle) -> Result<PinData, String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| format!("clipboard: {e}"))?;
    if let Ok(img) = cb.get_image() {
        let w = img.width as u32;
        let h = img.height as u32;
        let rgba = img.bytes.into_owned();
        let img_buf = image::RgbaImage::from_raw(w, h, rgba).ok_or("build image")?;
        let mut buf = std::io::Cursor::new(Vec::new());
        img_buf.write_to(&mut buf, image::ImageFormat::Png).map_err(|e| e.to_string())?;
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());
        let cursor = app.cursor_position().unwrap_or(PhysicalPosition::new(0.0, 0.0));
        let (px, py) = (cursor.x as i32, cursor.y as i32);
        return create_from_b64(&app, &b64, px, py);
    }
    Err("clipboard has no image".into())
}

#[tauri::command]
pub fn pin_list(app: AppHandle) -> Vec<PinData> {
    app.try_state::<PinStore>().map(|s| s.0.lock().unwrap().clone()).unwrap_or_default()
}

#[tauri::command]
pub fn pin_update(app: AppHandle, id: String, x: i32, y: i32, width: u32, height: u32,
    opacity: f64, rotation: i32, flip_h: bool, flip_v: bool, shadow: bool, click_through: bool,
) -> Result<(), String> {
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    // 作用域内改完即放锁：persist 内部会再次加锁，持锁调用会死锁
    {
        let mut entries = store.0.lock().unwrap();
        let pin = entries.iter_mut().find(|p| p.id == id).ok_or("not found")?;
        pin.x = x; pin.y = y;
        pin.width = width; pin.height = height;
        pin.opacity = opacity; pin.rotation = rotation;
        pin.flip_h = flip_h; pin.flip_v = flip_v;
        pin.shadow = shadow;
        pin.click_through = click_through;
    }
    if let Some(w) = window_of_pin(&app, &id) {
        let _ = w.set_ignore_cursor_events(click_through);
        let _ = w.set_position(PhysicalPosition::new(x, y));
        let _ = w.set_size(PhysicalSize::new(width, height));
        let _ = w.set_always_on_top(true);
    }
    persist(&store, &app);
    Ok(())
}

#[tauri::command]
pub fn pin_close(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(w) = window_of_pin(&app, &id) { let _ = w.close(); }
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    store.0.lock().unwrap().retain(|p| p.id != id);
    persist(&store, &app);
    Ok(())
}

pub(crate) fn hide_all_impl<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    let entries = store.0.lock().unwrap().clone();
    for pin in &entries {
        if let Some(w) = window_of_pin(app, &pin.id) { let _ = w.hide(); }
    }
    let _ = app.emit(EVT_PIN_VISIBILITY, false);
    Ok(())
}

#[tauri::command]
pub fn pin_hide_all(app: AppHandle) -> Result<(), String> {
    hide_all_impl(&app)
}

pub(crate) fn show_all_impl<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // 【极简显隐】热键切换路径只做 show()：位置与尺寸在窗口创建及用户每次
    // 调整时已经持久化到 PinData，无需也不应在此逐窗 set_position/set_size
    // ——那些同步窗口操作是"按一下热键整个界面卡死"的最后风险面。
    // 鼠标穿透解除改由贴图窗前端监听可见性事件自行处理（见 PinWindow.tsx）
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    let entries = store.0.lock().unwrap().clone();
    for pin in &entries {
        if let Some(w) = window_of_pin(app, &pin.id) {
            let _ = w.show();
        }
    }
    let _ = app.emit(EVT_PIN_VISIBILITY, true);
    Ok(())
}

#[tauri::command]
pub fn pin_show_all(app: AppHandle) -> Result<(), String> {
    show_all_impl(&app)
}

/// 贴图全部显示/隐藏切换（全局热键统一入口）。
/// 【必须在后台线程执行】全局热键回调运行在主线程事件循环里，若在回调中
/// 直接逐窗 show/hide/set_position/set_size，一旦被慢操作拖住（大尺寸透明
/// 置顶窗的 DWM 合成、WebView2 控制器同步布局），整个应用所有窗口一起冻结
/// ——表现为"按一下贴图热键整个界面卡死、只能 Tab 切焦点但页面不动"。
/// 移出主线程后，即使个别窗口操作耗时也只是这个工作线程在等，UI 照常响应。
pub(crate) fn toggle_all<R: Runtime>(app: &AppHandle<R>) {
    let app2 = app.clone();
    std::thread::spawn(move || {
        // 连按防抖：上一次切换未完成时忽略本次。多个切换线程交错判定可见性
        // 再交错 show/hide，会造成显示/隐藏风暴（表现为连按热键界面卡死）
        if TOGGLE_BUSY.swap(true, Ordering::SeqCst) {
            diag_write("[pin] toggle skipped: previous toggle still in flight");
            return;
        }
        // 无贴图时直接短路：空转 show/hide 毫无可见效果，还会让用户误判
        // "快捷键坏了"（diag 里触发了一片、屏幕上却毫无动静）
        let count = app2
            .try_state::<PinStore>()
            .map(|s| s.0.lock().unwrap().len())
            .unwrap_or(0);
        if count == 0 {
            diag_write("[pin] toggle skipped: no pins");
            TOGGLE_BUSY.store(false, Ordering::SeqCst);
            return;
        }
        let any_visible = {
            match app2.try_state::<PinStore>() {
                Some(s) => {
                    let entries = s.0.lock().unwrap().clone();
                    entries.iter().any(|p| {
                        window_of_pin(&app2, &p.id)
                            .and_then(|w| w.is_visible().ok())
                            .unwrap_or(false)
                    })
                }
                None => false,
            }
        };
        let _ = if any_visible { hide_all_impl(&app2) } else { show_all_impl(&app2) };
        TOGGLE_BUSY.store(false, Ordering::SeqCst);
    });
}

#[tauri::command]
pub fn pin_clear_all(app: AppHandle) -> Result<(), String> {
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    let entries = store.0.lock().unwrap().clone();
    for pin in &entries {
        if let Some(w) = window_of_pin(&app, &pin.id) { let _ = w.close(); }
        // delete file
        let _ = std::fs::remove_file(&pin.file);
    }
    store.0.lock().unwrap().clear();
    persist(&store, &app);
    Ok(())
}

#[tauri::command]
pub fn pin_set_click_through(window: tauri::WebviewWindow, on: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(on).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pin_file_path(app: AppHandle, id: String) -> Option<String> {
    let store = app.try_state::<PinStore>()?;
    let entries = store.0.lock().unwrap();
    entries.iter().find(|p| p.id == id).map(|p| p.file.clone())
}

/// 把贴图原图写入剪贴板（右键菜单"复制到剪贴板"）。
/// async：整图解码 + 剪贴板写入是重活，放 tokio 线程池，不占主线程。
// （贴图图片展示改走自定义协议 GET /pin/{id} 直出文件字节，
//  原 pin_image_data 的 base64 data URL 路径已删除）
#[tauri::command]
pub async fn pin_copy_image(app: AppHandle, id: String) -> Result<(), String> {
    let file = pin_file_path(app, id).ok_or("not found")?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let bytes = std::fs::read(&file).map_err(|e| format!("read: {e}"))?;
        // GIF 直接按文件字节写入剪贴板图像会丢动画，取第一帧静态化
        let img = image::load_from_memory(&bytes).map_err(|e| format!("decode: {e}"))?;
        copy_rgba(img.to_rgba8())
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

fn copy_rgba(rgba: image::RgbaImage) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| format!("clipboard: {e}"))?;
    cb.set_image(arboard::ImageData {
        width: rgba.width() as usize,
        height: rgba.height() as usize,
        bytes: std::borrow::Cow::Borrowed(rgba.as_raw()),
    }).map_err(|e| format!("set image: {e}"))
}

/// 贴图窗口被非 pin_close 途径（Alt+F4 等）销毁时同步清理存储条目。
/// 幂等：pin_close 正常路径先 retain 再触发 Destroyed，二次调用无副作用。
pub fn forget_pin<R: Runtime>(app: &AppHandle<R>, id: &str) {
    // 清理 staging 复用映射中指向该贴图的条目（若有）
    if let Some(m) = app.try_state::<PinWinMap>() {
        m.0.lock().unwrap().retain(|_, v| v != id);
    }
    let Some(store) = app.try_state::<PinStore>() else { return };
    let removed = {
        let mut entries = store.0.lock().unwrap();
        let before = entries.len();
        entries.retain(|p| p.id != id);
        before != entries.len()
    };
    if removed {
        persist(&store, app);
    }
}

// ---------- internal ----------

fn create_from_b64<R: Runtime>(app: &AppHandle<R>, b64: &str, x: i32, y: i32) -> Result<PinData, String> {
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64)
        .map_err(|e| format!("base64: {e}"))?;
    create_from_bytes(app, &bytes, "image/png", x, y)
}

/// 只做「落盘 + 入存储」，不建窗——供 staging 复用路径使用
pub(crate) fn create_store_entry<R: Runtime>(app: &AppHandle<R>, bytes: &[u8], mime: &str, x: i32, y: i32) -> Result<PinData, String> {
    // 只读图片头拿尺寸，不做完整解码——旧实现 image::load_from_memory 会把
    // 整张图解开成 RGBA 位图（大区域要数百毫秒），而这里需要的只有宽高，
    // 文件字节本身原样落盘、显示由 webview 原生解码，完整解码纯属浪费。
    let (w, h) = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| format!("probe: {e}"))?
        .into_dimensions()
        .map_err(|e| format!("dimensions: {e}"))?;
    let w = w.max(1);
    let h = h.max(1);

    let id = uuid::Uuid::new_v4().to_string();
    let ext = if mime.contains("gif") { "gif" } else { "png" };
    let dir = pins_dir(app);
    let file = dir.join(format!("{id}.{ext}"));
    std::fs::write(&file, bytes).map_err(|e| format!("write file: {e}"))?;

    let cfg: PinConfig = app.try_state::<ConfigState>()
        .map(|s| s.0.lock().unwrap().pin.clone())
        .unwrap_or_default();

    let pin = PinData {
        id: id.clone(),
        file: file.to_string_lossy().to_string(),
        x, y,
        width: w, height: h,
        opacity: cfg.opacity as f64 / 100.0,
        rotation: 0,
        flip_h: false, flip_v: false,
        shadow: cfg.border_shadow,
        click_through: false,
    };

    let store = app.try_state::<PinStore>().ok_or("no state")?;
    store.0.lock().unwrap().push(pin.clone());
    persist(&store, app);

    diag_write(&format!("[pin] created {}", pin.id));
    Ok(pin)
}

/// 旧建窗路径（剪贴板贴图 / 启动恢复 / staging 不可用时的兜底）：
/// 落盘入库后经 defer_to_main_loop 建独立窗口，等前端 pin_ready 再显示
pub fn create_from_bytes<R: Runtime>(app: &AppHandle<R>, bytes: &[u8], mime: &str, x: i32, y: i32) -> Result<PinData, String> {
    let pin = create_store_entry(app, bytes, mime, x, y)?;
    create_window(app, &pin);
    Ok(pin)
}
