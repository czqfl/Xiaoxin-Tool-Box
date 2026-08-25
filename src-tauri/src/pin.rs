//! Pin (sticky image) windows: create, persist, zoom/opacity/rotate, hide/show all.

use crate::config::{ConfigState, PinConfig};
use crate::storage::{AppPaths, diag_write, save_json, load_json};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime,
    WebviewWindow, WebviewWindowBuilder,
};

pub const PIN_PREFIX: &str = "pin";
pub const EVT_PIN_VISIBILITY: &str = "pin://visibility-changed";
/// 复用贴图窗标签前缀：待命窗池依次为 pin-staging、pin-staging-2、…
/// 新贴图优先装进空闲待命窗，免建窗秒显
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
    /// 退出时是否处于可见状态：启动恢复只重建【可见】的贴图——
    /// 用户已 Esc/热键隐藏的不倾巢而出（true 为旧档缺省，兼容历史数据）
    #[serde(default = "default_pin_visible")]
    pub visible: bool,
}

fn default_pin_visible() -> bool { true }

pub struct PinStore(pub Mutex<Vec<PinData>>);

/// 贴图窗四周的透明外边距（【物理像素】）。
/// 窗口比图片四周各大 PIN_MARGIN：CSS 边框贴着图片边缘画，向外泛光
/// （box-shadow）落在透明边距里——旧版窗口=图片尺寸，光晕整个落在
/// 客户区外被裁掉；且高 DPI 下逻辑视口舍入会把最右/最下一行像素裁掉，
/// 表现为"缩放后部分边框消失"。前端用 12/devicePixelRatio 换算 CSS 边距。
const PIN_MARGIN: i32 = 12;

/// 图片几何 → 窗口位置（图片位左移一个边距）
fn win_pos(pin_x: i32, pin_y: i32) -> PhysicalPosition<i32> {
    PhysicalPosition::new(pin_x - PIN_MARGIN, pin_y - PIN_MARGIN)
}

/// 图片几何 → 窗口尺寸（图片尺寸加两侧边距）
fn win_size(pin_w: u32, pin_h: u32) -> PhysicalSize<u32> {
    PhysicalSize::new(pin_w + (PIN_MARGIN * 2) as u32, pin_h + (PIN_MARGIN * 2) as u32)
}

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
    if let Some(s) = app.try_state::<PinStore>() {
        *s.0.lock().unwrap() = entries.clone();
    }
    // 【只恢复退出时可见的贴图】托盘退出/关机时屏幕上还贴着的（可能不止一张）
    // 全部原位恢复；已 Esc/热键隐藏的不出现。
    // 每张都是一个完整 WebView2 窗口，逐张经 defer 排队创建，不阻塞启动
    let mut restored = 0;
    for pin in entries.iter().filter(|p| p.visible) {
        create_window(app, pin);
        restored += 1;
    }
    diag_write(&format!("[pin] restored {restored} visible pin(s)"));
}

fn create_window<R: Runtime>(app: &AppHandle<R>, pin: &PinData) {
    let url = crate::frontend_url(app);
    let label = format!("{PIN_PREFIX}-{}", pin.id);
    let app2 = app.clone();
    let pin2 = pin.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        let win = WebviewWindowBuilder::new(&app2, &label, url)
            .title("pin").decorations(false).transparent(true)
            .always_on_top(true).skip_taskbar(true).resizable(false)
            .shadow(false).visible(false).focused(false).build();
        if let Ok(w) = win {
            let _ = w.set_position(win_pos(pin2.x, pin2.y));
            let _ = w.set_size(win_size(pin2.width, pin2.height));
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

/// 确保存在一个「复用贴图窗」（屏幕外可见待命）。新建贴图时直接把图片装进
/// 这个已就绪的窗——免去「临时创建 WebView2 窗口 + 加载整个前端应用」的
/// 数百毫秒到数秒开销。这正是此前贴图卡顿、闪桌面、偶发失败的根源。

/// 待命窗数量：消耗一张补一张，保证连续贴图/热键连按时始终有热窗可用，
/// 不再掉进「临时建 WebView2 窗口」的慢速路径（旧版单张待命窗被第一张贴图
/// 占用后，后续每张贴图都要完整加载前端应用，正是 ~0.5s 延迟的元凶之一）
const STANDBY_COUNT: usize = 2;

fn is_standby_label(label: &str) -> bool { label.starts_with(STAGING_LABEL) }

/// 挑一个空闲待命窗（存在且尚未被分配贴图任务）
fn free_standby<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let assigned = |l: &str| app.try_state::<PinWinMap>()
        .map(|m| m.0.lock().unwrap().contains_key(l))
        .unwrap_or(false);
    app.webview_windows()
        .into_iter()
        .filter(|(l, _)| is_standby_label(l) && !assigned(l))
        .map(|(_, w)| w)
        .next()
}

/// 下一个可用的待命窗标签：pin-staging、pin-staging-2、…
fn next_standby_label<R: Runtime>(app: &AppHandle<R>) -> String {
    for i in 1..64 {
        let cand = if i == 1 { STAGING_LABEL.to_string() } else { format!("{STAGING_LABEL}-{i}") };
        if app.get_webview_window(&cand).is_none() { return cand; }
    }
    format!("{STAGING_LABEL}-{}", chrono::Utc::now().timestamp_millis())
}

/// 在主循环建一张「屏幕外可见」的待命窗（合成器预热）
fn build_standby<R: Runtime>(app: &AppHandle<R>) {
    let url = crate::frontend_url(app);
    let app2 = app.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        // 主循环内重算标签与需求量：多个补充请求排队时不会超建
        let assigned = |l: &String| app2.try_state::<PinWinMap>()
            .map(|m| m.0.lock().unwrap().contains_key(l.as_str()))
            .unwrap_or(false);
        let free = app2.webview_windows().iter()
            .filter(|(l, _)| is_standby_label(l) && !assigned(l))
            .count();
        if free >= STANDBY_COUNT { return; }
        let label = next_standby_label(&app2);
        let Ok(w) = WebviewWindowBuilder::new(&app2, &label, url)
            .title("pin").decorations(false).transparent(true)
            .always_on_top(true).skip_taskbar(true).resizable(false)
            .shadow(false).visible(false).focused(false)
            // 屏幕外待命：空壳窗不参与布局、鼠标不可达
            .position(-32000.0, -32000.0).inner_size(240.0, 160.0)
            .build()
        else { return };
        // 【先钉死待命位再显示】builder 的 position 走逻辑像素换算，个别 DPI
        // 组合下可能落在可视区——用物理坐标显式重钉一次，杜绝空壳窗出现在屏幕上
        let _ = w.set_position(tauri::PhysicalPosition::new(-32000, -32000));
        // 【合成器预热·贴图热键提速的关键】WebView2 对【隐藏】窗口会停摆
        // 整条渲染管线，show() 后首帧合成是冷启动——数百毫秒起步，这正是
        // "按贴图热键 ~0.5s 才弹出"的主因。改为【屏幕外可见】待命：合成器
        // 常驻运行、页面持续渲染，贴图时把窗平移到位即显示，近乎零延迟。
        // SW_SHOWNOACTIVATE 保证绝不抢用户当前焦点。
        #[cfg(windows)]
        if let Some(hwnd) = crate::screenshot::hwnd_of_webview(&w) {
            use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
            unsafe { let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE); }
            crate::screenshot::disable_show_animation(hwnd);
        }
        #[cfg(not(windows))]
        { let _ = w.show(); }
    });
}

/// 确保待命复用窗数量充足；被消耗成正式贴图的窗由这里异步补建
pub(crate) fn ensure_staging<R: Runtime>(app: &AppHandle<R>) {
    build_standby(app);
}

/// attach 串行锁：多屏遮罩并发输出/热键连按可能同时进入，两个线程都判定
/// "staging 空闲"就会把两张贴图装进同一个窗（第一张丢失）
static ATTACH_SEQ: Mutex<()> = Mutex::new(());

/// 把新贴图装进一张空闲待命复用窗：
/// 1) 通知该窗前端加载指定贴图（文件已在盘、协议直出，毫秒级）
/// 2) 前端渲染完成调 pin_ready → 先显示贴图【然后才】收起截图遮罩——
///    彻底消除「遮罩先消失露出裸桌面、贴图延迟才弹出」的闪烁
/// 3) 异步补建待命池；1.5s 内没就绪（页面异常）则回退旧建窗路径兜底
pub(crate) fn attach_to_staging<R: Runtime>(app: &AppHandle<R>, pin: PinData) {
    let _seq = ATTACH_SEQ.lock().unwrap();
    let Some(w) = free_standby(app) else {
        // 无空闲待命窗（连贴多张全部在途）：退回旧建窗路径。
        // 注意旧路径同样由 pin_ready 先显窗后收遮罩，依旧无闪烁，只是慢一点
        create_window(app, &pin);
        return;
    };
    let label = w.label().to_string();
    // 【只调尺寸不挪位置】窗口仍停在屏幕外待命位——图片加载期间绝不出现
    // 在屏幕上；就绪后由 pin_ready 一次性平移到位（窗口已可见 → 移动即显示，
    // 没有 show() 之后首帧合成的冷启动）
    let _ = w.set_size(win_size(pin.width, pin.height));
    let _ = w.set_always_on_top(true);
    #[cfg(windows)]
    if let Some(hwnd) = crate::screenshot::hwnd_of_webview(&w) {
        crate::screenshot::disable_show_animation(hwnd);
    }
    if let Some(m) = app.try_state::<PinWinMap>() {
        m.0.lock().unwrap().insert(label.clone(), pin.id.clone());
    }
    let _ = app.emit_to(&label, EVT_PIN_ASSIGN, serde_json::json!({ "id": pin.id }));
    // 看门狗 + 补充待命池
    let app2 = app.clone();
    let pid = pin.id.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1500));
        // 待命窗是"屏幕外可见"态，不能拿 is_visible 当就绪判据——
        // 以是否已离开待命位（-32000）为准：被 pin_ready 平移走 = 已消费
        let moved = app2.get_webview_window(&label)
            .and_then(|w| w.outer_position().ok())
            .map(|p| p.x > -16000)
            .unwrap_or(false);
        if !moved {
            // 待命页面无响应：回退旧建窗路径，并强制收遮罩保底
            if let Some(s) = app2.try_state::<PinStore>() {
                let p = { let e = s.0.lock().unwrap(); e.iter().find(|p| p.id == pid).cloned() };
                if let Some(p) = p { create_window(&app2, &p); }
            }
            crate::screenshot::hide_all(&app2);
            if let Some(m) = app2.try_state::<PinWinMap>() {
                m.0.lock().unwrap().remove(&label);
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
    let is_staging = is_standby_label(&label);
    // 贴图 id：常规窗取自 label；复用窗查分配表。
    // 未分配贴图的 staging 空壳窗：忽略，绝不显示
    let pin_id = if is_staging {
        app.try_state::<PinWinMap>()
            .and_then(|m| m.0.lock().unwrap().get(&label).cloned())
    } else {
        Some(label.trim_start_matches(&format!("{PIN_PREFIX}-")).to_string())
    };
    let Some(pin_id) = pin_id else { return Ok(()); };
    if let Some(w) = app.get_webview_window(&label) {
        if is_staging {
            // 【移动即显示】staging 待命窗本就"屏幕外可见"（合成器常驻预热），
            // 平移到目标位置 = 瞬间上屏——没有 show() 后首帧合成的冷启动
            // （隐藏窗口的首帧合成要数百毫秒，正是贴图热键延迟的主因）
            let xy = app.try_state::<PinStore>().and_then(|s| {
                let e = s.0.lock().unwrap();
                e.iter().find(|p| p.id == pin_id).map(|p| (p.x, p.y))
            });
            if let Some((x, y)) = xy { let _ = w.set_position(win_pos(x, y)); }
        } else {
            // 常规窗（启动恢复/兜底建窗路径）仍是隐藏态，照常 show
            let _ = w.show();
        }
        #[cfg(windows)]
        if let Some(hwnd) = crate::screenshot::hwnd_of_webview(&w) {
            crate::acrylic::force_foreground_robust(hwnd);
        }
        // 【确保键盘焦点】贴图窗必须真正持有焦点，前端才收得到 Esc/Delete/Ctrl+C。
        // 待命复用窗以 SW_SHOWNOACTIVATE 创建、此后只做平移，从未走常规激活流程，
        // force_foreground_robust 只保证"置前"，这里补一次 tauri 级 set_focus 兜底
        let _ = w.set_focus();
        // 收遮罩延后 ~80ms（约 5 帧）：就绪信号来自隐藏窗里的 rAF，证明不了
        // 显示后首帧已 present。这期间即便贴图尚未合成完毕，底下仍是截图冻结
        // 画面而非裸桌面；遮罩揭开时贴图必已画好——彻底消除"闪一下"
        // 【仅截图会话需要】热键贴图路径没有遮罩可收，等它纯属白加 80ms 延迟
        let app2 = app.clone();
        std::thread::spawn(move || {
            if crate::screenshot::shooting() {
                std::thread::sleep(std::time::Duration::from_millis(80));
            }
            crate::screenshot::hide_all(&app2);
        });
        // 本次 staging 已消耗：立刻补一个待命
        if is_staging {
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
        // 【贴图提速】与热键路径同款：免 PNG 编码/解码，RGBA→BGRA 线性交换
        // 后直接包零压缩 BMP（大图省数百毫秒到数秒）
        let mut bgra = img.bytes.into_owned();
        if bgra.len() != (w as usize) * (h as usize) * 4 {
            return Err("build image".into());
        }
        for px in bgra.chunks_exact_mut(4) { px.swap(0, 2); }
        let bmp = crate::screenshot::wrap_bmp(&bgra, w, h);
        let cursor = app.cursor_position().unwrap_or(PhysicalPosition::new(0.0, 0.0));
        let (px, py) = (cursor.x as i32, cursor.y as i32);
        return create_from_bytes(&app, &bmp, "image/bmp", px, py);
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
        // x/y/width/height 是【图片区域】几何（前端已减掉透明边距），
        // 落窗时统一加回边距——与 create_window/attach_to_staging 保持同一约定
        let _ = w.set_position(win_pos(x, y));
        let _ = w.set_size(win_size(width, height));
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
    // 【清剪贴板签名】贴图被关闭 = 用户已处理完这段内容；若不清，
    // 下次按贴图热键时同一段剪贴板内容会被判为"不是新内容"而走
    // 「唤回最近一张」——最近一张刚被关掉，窗口不存在，什么都不会出现
    // （"同一段文本只有第一次能贴出来"的根因）
    *LAST_CLIP_SIG.lock().unwrap() = None;
    Ok(())
}

pub(crate) fn hide_all_impl<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    let entries = store.0.lock().unwrap().clone();
    for pin in &entries {
        if let Some(w) = window_of_pin(app, &pin.id) { let _ = w.hide(); }
    }
    // 记住可见性：启动恢复时只重建退出时可见的贴图
    {
        let mut e = store.0.lock().unwrap();
        for p in e.iter_mut() { p.visible = false; }
    }
    persist(&store, app);
    let _ = app.emit(EVT_PIN_VISIBILITY, false);
    Ok(())
}

#[tauri::command]
pub fn pin_hide_all(app: AppHandle) -> Result<(), String> {
    hide_all_impl(&app)
}

pub(crate) fn show_all_impl<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // 【只显示最近一张】用户要求：一键唤回不再把所有贴图倾巢而出，
    // 只弹出最近创建的那张（存储 Vec 顺序 = 创建顺序，取末位）。
    // 其余保持隐藏；热键再按一次 = 全部隐藏。
    // 鼠标穿透解除改由贴图窗前端监听可见性事件自行处理（见 PinWindow.tsx）
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    let latest = { store.0.lock().unwrap().last().cloned() };
    if let Some(pin) = latest {
        if let Some(w) = window_of_pin(app, &pin.id) {
            let _ = w.show();
            // 可见性落盘：退出时这张要被恢复
            {
                let mut e = store.0.lock().unwrap();
                if let Some(p) = e.iter_mut().find(|p| p.id == pin.id) { p.visible = true; }
            }
            persist(&store, app);
        }
    }
    let _ = app.emit(EVT_PIN_VISIBILITY, true);
    Ok(())
}

#[tauri::command]
pub fn pin_show_all(app: AppHandle) -> Result<(), String> {
    show_all_impl(&app)
}

/// 贴图热键统一入口：【专职贴出内容】——剪贴板有新内容（与上次热键操作
/// 不同）→ 直接贴到鼠标处；内容没变或无内容 → 唤回最近一张贴图。
/// 【不再兼任"全部隐藏"】隐藏由独立的「关闭全部贴图」热键承担
/// （用户明确要求拆分：一个键贴内容、一个键全关）。
pub(crate) fn toggle_all<R: Runtime>(app: &AppHandle<R>) {
    let app2 = app.clone();
    std::thread::spawn(move || {
        // 连按防抖：上一次切换未完成时忽略本次。多个切换线程交错判定可见性
        // 再交错 show/hide，会造成显示/隐藏风暴（表现为连按热键界面卡死）
        if TOGGLE_BUSY.swap(true, Ordering::SeqCst) {
            diag_write("[pin] toggle skipped: previous toggle still in flight");
            return;
        }
        // 剪贴板有【新】内容（与上次热键操作时不同）→ 直接贴出来；
        // 内容没变 → 只唤回最近一张（避免反复把同一段文字贴成新贴图）
        let clip = read_clipboard();
        let sig = clip.as_ref().map(|c| c.sig());
        let seen = *LAST_CLIP_SIG.lock().unwrap();
        let is_new = sig.is_some() && sig != seen;
        diag_write(&format!(
            "[pin] toggle: clip={} sig_new={is_new}",
            match &clip { Some(ClipContent::Image(_)) => "image", Some(ClipContent::Html(h)) =>
                if h.starts_with("<div style=") { "text" } else { "html" }, None => "none" },
        ));
        if is_new {
            if pin_clip(&app2, clip.unwrap()) {
                *LAST_CLIP_SIG.lock().unwrap() = sig;
                TOGGLE_BUSY.store(false, Ordering::SeqCst);
                return;
            }
        }
        let count = app2
            .try_state::<PinStore>()
            .map(|s| s.0.lock().unwrap().len())
            .unwrap_or(0);
        if count == 0 {
            diag_write("[pin] toggle skipped: no pins, clipboard empty");
            TOGGLE_BUSY.store(false, Ordering::SeqCst);
            return;
        }
        let _ = show_all_impl(&app2);
        *LAST_CLIP_SIG.lock().unwrap() = sig;
        TOGGLE_BUSY.store(false, Ordering::SeqCst);
    });
}

// ---------- 剪贴板贴图（图片 / 富文本 / 纯文本，Snipaste 式） ----------

/// 提取 Windows CF_HTML 的正文片段（arboard 拿到的可能带完整文档壳与注释）
fn extract_html_fragment(s: &str) -> String {
    if let Some(a) = s.find("<!--StartFragment-->") {
        let start = a + "<!--StartFragment-->".len();
        if let Some(b) = s[start..].find("<!--EndFragment-->") {
            return s[start..start + b].to_string();
        }
    }
    s.trim().to_string()
}

/// 纯文本 → 简单样式 HTML（无富文本信息时的兜底观感）
fn text_to_html(t: &str) -> String {
    let esc = t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    format!(
        "<div style=\"font:14px/1.6 'Microsoft YaHei',sans-serif;background:#ffffff;color:#111111;\
         padding:10px 14px;white-space:pre-wrap;word-break:break-word;\">{esc}</div>"
    )
}

enum ClipContent {
    Image(Vec<u8>),
    Html(String),
}

impl ClipContent {
    /// 内容签名：判断「自上次热键操作以来剪贴板是否换过内容」，
    /// 避免同一段文字反复被贴成新贴图、盖掉「唤回隐藏贴图」语义。
    /// 【采样哈希】大截图有几 MB 字节，全量 FNV 要扫几百万次循环；
    /// 这里只取长度 + 首中尾三个 4KB 窗口——碰撞率对"内容是否变化"判定足够，
    /// 复杂度从 O(n) 降到 O(1)
    fn sig(&self) -> u64 {
        // FNV-1a
        fn h(bytes: &[u8]) -> u64 {
            let mut hash: u64 = 0xcbf29ce484222325;
            for b in bytes {
                hash ^= *b as u64;
                hash = hash.wrapping_mul(0x100000001b3);
            }
            hash
        }
        fn sample(b: &[u8]) -> u64 {
            const WIN: usize = 4096;
            let n = b.len();
            if n <= WIN * 3 { return h(b); }
            let mut buf = [0u8; WIN * 3];
            buf[..WIN].copy_from_slice(&b[..WIN]);
            let mid = n / 2 - WIN / 2;
            buf[WIN..WIN * 2].copy_from_slice(&b[mid..mid + WIN]);
            buf[WIN * 2..].copy_from_slice(&b[n - WIN..]);
            h(&buf)
        }
        match self {
            ClipContent::Image(b) => (b.len() as u64).rotate_left(32) ^ sample(b),
            ClipContent::Html(s) => h(s.as_bytes()),
        }
    }
}

fn read_clipboard() -> Option<ClipContent> {
    // 重试两次：VSCode/WPS 等应用复制瞬间可能短暂占用剪贴板，
    // 首次 OpenClipboard 失败并不代表没有内容
    for attempt in 0..3 {
        match try_read_clipboard_once() {
            Some(c) => return Some(c),
            None if attempt < 2 => { std::thread::sleep(std::time::Duration::from_millis(40)); }
            None => {}
        }
    }
    None
}

fn try_read_clipboard_once() -> Option<ClipContent> {
    let mut cb = arboard::Clipboard::new().ok()?;
    if let Ok(img) = cb.get_image() {
        let w = img.width as u32;
        let hh = img.height as u32;
        if w > 0 && hh > 0 {
            // 【贴图提速·主路径】剪贴板图片不再编码 PNG——大图 PNG 编码要
            // 数百毫秒到数秒，是"复制后按贴图热键迟迟不弹出"的最大头。
            // RGBA→BGRA 一次线性交换（毫秒级）后直接包零压缩 BMP 落盘，
            // WebView2 解码 BMP 近乎 memcpy，与截图选区贴图同款最快路径
            let mut bgra = img.bytes.into_owned();
            if bgra.len() == (w as usize) * (hh as usize) * 4 {
                for px in bgra.chunks_exact_mut(4) { px.swap(0, 2); }
                return Some(ClipContent::Image(crate::screenshot::wrap_bmp(&bgra, w, hh)));
            }
        }
    }
    if let Ok(html) = cb.get().html() {
        let frag = extract_html_fragment(&html);
        if !frag.is_empty() { return Some(ClipContent::Html(frag)); }
    }
    if let Ok(text) = cb.get().text() {
        let t = text.trim();
        if !t.is_empty() { return Some(ClipContent::Html(text_to_html(t))); }
    }
    None
}

fn pin_clip<R: Runtime>(app: &AppHandle<R>, clip: ClipContent) -> bool {
    let cursor = app.cursor_position().unwrap_or(PhysicalPosition::new(0.0, 0.0));
    let (px, py) = (cursor.x as i32 + 12, cursor.y as i32 + 12);
    let r = match clip {
        ClipContent::Image(bytes) => create_store_entry(app, &bytes, "image/png", px, py),
        ClipContent::Html(html) => create_html_pin(app, html, px, py),
    };
    match r {
        Ok(pin) => { attach_to_staging(app, pin); true }
        Err(e) => { diag_write(&format!("[pin] clipboard paste: {e}")); false }
    }
}

/// 上一次热键操作时看到的剪贴板内容签名（None=还没见过）
static LAST_CLIP_SIG: Mutex<Option<u64>> = Mutex::new(None);

/// 建一张 HTML 贴图（落盘 .html 入库）。尺寸未知先给占位值，
/// 前端渲染量完实际尺寸后经 pin_resize 回填再亮窗
pub(crate) fn create_html_pin<R: Runtime>(app: &AppHandle<R>, html: String, x: i32, y: i32) -> Result<PinData, String> {
    let cfg: PinConfig = app.try_state::<ConfigState>()
        .map(|s| s.0.lock().unwrap().pin.clone())
        .unwrap_or_default();
    let id = uuid::Uuid::new_v4().to_string();
    let dir = pins_dir(app);
    let file = dir.join(format!("{id}.html"));
    std::fs::write(&file, html).map_err(|e| format!("write file: {e}"))?;
    let pin = PinData {
        id: id.clone(),
        file: file.to_string_lossy().to_string(),
        x, y,
        width: 360, height: 160, // 占位：前端测量后 pin_resize 校正
        opacity: cfg.opacity as f64 / 100.0,
        rotation: 0,
        flip_h: false, flip_v: false,
        shadow: cfg.border_shadow,
        click_through: false,
        visible: true,
    };
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    store.0.lock().unwrap().push(pin.clone());
    // 【热路径不落盘】同 create_store_entry：持久化丢后台线程
    {
        let app2 = app.clone();
        std::thread::spawn(move || {
            if let Some(s) = app2.try_state::<PinStore>() { persist(&s, &app2); }
        });
    }
    Ok(pin)
}

/// HTML 贴图尺寸回填：前端渲染完量出物理像素尺寸后调用。
#[tauri::command]
pub fn pin_resize(_window: tauri::WebviewWindow, app: AppHandle, id: String, width: u32, height: u32) -> Result<(), String> {
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    {
        let mut entries = store.0.lock().unwrap();
        let pin = entries.iter_mut().find(|p| p.id == id).ok_or("not found")?;
        pin.width = width.max(40);
        pin.height = height.max(40);
    }
    if let Some(w) = window_of_pin(&app, &id) {
        let _ = w.set_size(win_size(width.max(40), height.max(40)));
    }
    persist(&store, &app);
    Ok(())
}

/// 贴图内容类型："image" | "html"。
/// 前端据此决定用 <img> 还是富文本容器渲染——协议 URL 不带扩展名，
/// 旧版靠 src 后缀判断永远判不中，HTML 贴图因此整条链路失效
#[tauri::command]
pub fn pin_kind(app: AppHandle, id: String) -> Result<String, String> {
    let store = app.try_state::<PinStore>().ok_or("no state")?;
    let entries = store.0.lock().unwrap();
    let pin = entries.iter().find(|p| p.id == id).ok_or("not found")?;
    Ok(if pin.file.ends_with(".html") { "html" } else { "image" }.into())
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

/// Esc 隐藏单个贴图（【不销毁】）：全局「显示/隐藏贴图」热键可整批唤回。
/// 旧版 Esc=关闭删除，用户想再看只能重新截图——改为隐藏（Snipaste 行为）。
/// 可见性落盘：启动恢复时已隐藏的贴图不再重建
#[tauri::command]
pub fn pin_hide_one(window: tauri::WebviewWindow, app: AppHandle) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    let label = window.label();
    let id = label.strip_prefix(&format!("{PIN_PREFIX}-"))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            // 待命复用窗：查分配表
            app.try_state::<PinWinMap>()
                .and_then(|m| m.0.lock().unwrap().get(label).cloned())
                .unwrap_or_default()
        });
    if let Some(store) = app.try_state::<PinStore>() {
        {
            let mut e = store.0.lock().unwrap();
            if let Some(p) = e.iter_mut().find(|p| p.id == id) { p.visible = false; }
        }
        persist(&store, &app);
    }
    Ok(())
}

/// Esc 全局兜底：隐藏【前台贴图窗】（keyhook 系统级调用）。
/// - 前台是贴图窗 → 隐藏它（前端未就绪/加载失败收不到 Esc 时兜底；
///   前端就绪时与 webview 自身的 Esc 处理幂等）；
/// - 前台是本应用【非贴图】窗口（设置/面板/工具栏/遮罩）→ 不代劳，
///   Esc 归它们自己（收面板/退出截图）；
/// - 前台是其它应用 → 【不代劳】——Esc 是那个应用的按键（关闭对话框、
///   退出全屏等），系统级抢走会"莫名其妙藏掉贴图"。
/// 返回是否有贴图被隐藏。
///
/// 【实现注记】前台判定用 GetForegroundWindow 的 HWND 与各窗口句柄直比——
/// 不用 WebviewWindow::is_focused()（tao 内部焦点状态对「raw ShowWindow
/// 显示的待命窗」等场景可能失真，逐窗 IPC 派发也慢）。
pub(crate) fn hide_visible_pin<R: Runtime>(app: &AppHandle<R>) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let fg = GetForegroundWindow();
        if fg.is_invalid() { return false; }
        for (label, w) in app.webview_windows() {
            if crate::screenshot::hwnd_of_webview(&w).map(|h| h == fg).unwrap_or(false) {
                if !label.starts_with(PIN_PREFIX) {
                    // 前台是本应用其它窗口：Esc 归它自己
                    return false;
                }
                let _ = w.hide();
                let _ = mark_pin_visible(app, &label, false);
                crate::storage::diag_write("[pin] esc hid foreground pin");
                return true;
            }
        }
        // 前台是其它应用：不代劳
    }
    false
}

/// 按【窗口 label】更新某张贴图的可见性标志并落盘
fn mark_pin_visible<R: Runtime>(app: &AppHandle<R>, label: &str, visible: bool) -> Result<(), String> {
    let id = label.strip_prefix(&format!("{PIN_PREFIX}-"))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            app.try_state::<PinWinMap>()
                .and_then(|m| m.0.lock().unwrap().get(label).cloned())
                .unwrap_or_default()
        });
    let Some(store) = app.try_state::<PinStore>() else { return Err("no state".into()) };
    {
        let mut e = store.0.lock().unwrap();
        if let Some(p) = e.iter_mut().find(|p| p.id == id) { p.visible = visible; }
    }
    persist(&store, app);
    Ok(())
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
    let app2 = app.clone();
    let file = pin_file_path(app, id).ok_or("not found")?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let bytes = std::fs::read(&file).map_err(|e| format!("read: {e}"))?;
        // GIF 直接按文件字节写入剪贴板图像会丢动画，取第一帧静态化
        let img = image::load_from_memory(&bytes).map_err(|e| format!("decode: {e}"))?;
        // app 带入：写剪贴板要用本应用窗口做属主（见 screenshot::copy_rgba_to_clipboard）
        crate::screenshot::copy_rgba_to_clipboard(&app2, &img.to_rgba8())
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// 把前端渲染好的 PNG 字节写入剪贴板（文本/富文本贴图「复制为图片」用）：
/// 前端把贴图 DOM 经 SVG foreignObject 画进 canvas 导出 PNG，原生二进制直传。
#[tauri::command]
pub async fn pin_copy_image_bytes(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let body = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b,
        tauri::ipc::InvokeBody::Json(_) => return Err("期望二进制请求体".into()),
    };
    if body.is_empty() { return Err("empty png".into()); }
    let png = body.to_vec();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let img = image::load_from_memory(&png).map_err(|e| format!("decode: {e}"))?;
        crate::screenshot::copy_rgba_to_clipboard(&app2, &img.to_rgba8())
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// 按【贴图原始格式】复制：图片贴图→位图；文本/富文本贴图→HTML+纯文本备选
/// （粘贴进 Word/企业微信等保留格式，粘贴进记事本得到纯文本）。
/// 返回实际复制的格式（"image" | "html"），前端据此提示。
#[tauri::command]
pub async fn pin_copy_original(app: AppHandle, id: String) -> Result<String, String> {
    let t = std::time::Instant::now();
    let file = pin_file_path(app.clone(), id.clone()).ok_or("not found")?;
    if !file.ends_with(".html") {
        pin_copy_image(app, id).await?;
        diag_write(&format!("[pin] copy image in {}ms", t.elapsed().as_millis()));
        return Ok("image".into());
    }
    let kind = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let html = std::fs::read_to_string(&file).map_err(|e| format!("read: {e}"))?;
        let plain = html_to_plain(&html);
        let mut cb = arboard::Clipboard::new().map_err(|e| format!("clipboard: {e}"))?;
        cb.set()
            .html(html, Some(plain))
            .map_err(|e| format!("set html: {e}"))?;
        Ok("html".into())
    })
    .await
    .map_err(|e| format!("join: {e}"))??;
    diag_write(&format!("[pin] copy html in {}ms", t.elapsed().as_millis()));
    Ok(kind)
}

/// HTML → 纯文本（剥标签 + 实体解码），作 CF_HTML 的纯文本备选。
/// 【必须解码数字实体】不少编辑器产出的 CF_HTML 会把空格写成 &#32;——
/// 纯文本优先的目标（代码编辑器/记事本）拿到未解码文本就会满屏 &#32;
fn html_to_plain(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    decode_entities(&out)
}

/// 解码 HTML 实体：命名实体（常用集）+ 十进制/十六进制数字实体
fn decode_entities(s: &str) -> String {
    if !s.contains('&') { return s.to_string(); }
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < s.len() {
        if bytes[i] == b'&' {
            if let Some(semi) = s[i..].find(';') {
                let ent = &s[i + 1..i + semi];
                let decoded = match ent {
                    "amp" => Some('&'.to_string()),
                    "lt" => Some('<'.to_string()),
                    "gt" => Some('>'.to_string()),
                    "quot" => Some('"'.to_string()),
                    "apos" => Some('\''.to_string()),
                    "nbsp" => Some(' '.to_string()),
                    _ if ent.starts_with("#x") || ent.starts_with("#X") => {
                        u32::from_str_radix(&ent[2..], 16).ok()
                            .and_then(char::from_u32).map(|c| c.to_string())
                    }
                    _ if ent.starts_with('#') => {
                        ent[1..].parse::<u32>().ok()
                            .and_then(char::from_u32).map(|c| c.to_string())
                    }
                    _ => None,
                };
                if let Some(d) = decoded {
                    out.push_str(&d);
                    i += semi + 1;
                    continue;
                }
            }
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
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
        // 同 pin_close：贴图没了就清剪贴板签名，下次热键允许重新贴同一段内容
        *LAST_CLIP_SIG.lock().unwrap() = None;
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
    // HTML 贴图：尺寸未知（前端量完经 pin_resize 回填），这里只落盘
    if mime.contains("html") {
        return create_html_pin(app, String::from_utf8_lossy(bytes).to_string(), x, y);
    }
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
    let ext = if mime.contains("gif") { "gif" } else if mime.contains("html") { "html" } else if mime.contains("bmp") { "bmp" } else { "png" };
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
        visible: true,
    };

    let store = app.try_state::<PinStore>().ok_or("no state")?;
    store.0.lock().unwrap().push(pin.clone());
    // 【热路径不落盘】建贴图的路径上省掉同步 JSON 序列化+写盘（贴图越多越慢），
    // 持久化丢后台线程；进程若在此瞬间退出最多丢一条记录，可接受
    {
        let app2 = app.clone();
        std::thread::spawn(move || {
            if let Some(s) = app2.try_state::<PinStore>() { persist(&s, &app2); }
        });
    }

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
