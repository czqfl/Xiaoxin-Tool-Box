//! 屏幕录制（GIF）：独立选区 + 帧采集 + 增量编码，与截图模块完全解耦。
//!
//! 流程：托盘「屏幕录制」→ 全屏透明选区窗（rec-select，覆盖光标所在显示器）
//! → 拖拽框选 + Enter/按钮确认 → recorder_start 关选区窗、弹控制条
//! （rec-bar，自动避让录制区域）→ 后台线程按 ~12fps 循环抓帧（DXGI 优先 +
//! GDI 回退），逐帧量化编码进 GIF 文件流 → 停止后落盘完成，事件通知控制条。
//!
//! 解耦设计：不依赖 screenshot.rs；窗口 label 前缀 rec-select / rec-bar，
//! 合并主分支时只需本文件 + lib.rs 注册 + capabilities + App.tsx 路由。

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindowBuilder};

pub const SELECT_LABEL: &str = "rec-select";
pub const BAR_LABEL: &str = "rec-bar";

pub const EVT_TICK: &str = "recorder://tick";
pub const EVT_DONE: &str = "recorder://done";

/// 正在录制
static ACTIVE: AtomicBool = AtomicBool::new(false);
/// 选区窗已打开（防重复呼出）
static PENDING: AtomicBool = AtomicBool::new(false);
static STOP: AtomicBool = AtomicBool::new(false);

const NEUQUANT_SPEED_DEFAULT: i32 = 20;

#[derive(Clone, serde::Serialize)]
struct Tick { elapsed_ms: u64, frames: u32 }

#[derive(Clone, serde::Serialize)]
struct Done {
    ok: bool,
    path: Option<String>,
    duration_ms: u64,
    frames: u32,
    bytes: u64,
    error: Option<String>,
}

/// 读录屏配置（缺省兜底）
struct RecCfg { fps: u32, speed: i32, max_secs: u32 }

fn load_cfg<R: Runtime>(app: &AppHandle<R>) -> RecCfg {
    let cfg = app.try_state::<crate::config::ConfigState>()
        .map(|s| s.0.lock().unwrap().recorder.clone());
    match cfg {
        Some(c) => RecCfg {
            fps: c.fps.clamp(5, 24),
            // quality: high/normal/fast → NeuQuant speed 越小质量越高越慢
            speed: match c.quality.as_str() {
                "high" => 10,
                "fast" => 30,
                _ => 20,
            },
            max_secs: c.max_duration_secs,
        },
        None => RecCfg { fps: 12, speed: NEUQUANT_SPEED_DEFAULT, max_secs: 120 },
    }
}

// ---------- 入口 ----------

fn monitor_at<R: Runtime>(app: &AppHandle<R>, x: i32, y: i32) -> Option<(i32, i32, i32, i32)> {
    app.available_monitors().ok()?.into_iter()
        .map(|m| (m.position().x, m.position().y, m.size().width as i32, m.size().height as i32))
        .find(|(mx, my, mw, mh)| x >= *mx && x < mx + mw && y >= *my && y < my + mh)
}

fn cursor_pos() -> Option<(i32, i32)> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut pt = POINT::default();
        unsafe { GetCursorPos(&mut pt).ok()? };
        Some((pt.x, pt.y))
    }
    #[cfg(not(windows))]
    { None }
}

/// 呼出录屏区域选择窗（托盘/工具栏/快捷键入口共用）。功能停用则静默忽略。
pub fn begin_select<R: Runtime>(app: &AppHandle<R>) {
    if !app.try_state::<crate::config::ConfigState>()
        .map(|s| s.0.lock().unwrap().recorder.enabled)
        .unwrap_or(true)
    {
        crate::storage::diag_write("[recorder] begin_select ignored: feature disabled");
        return;
    }
    if ACTIVE.load(Ordering::SeqCst) || PENDING.swap(true, Ordering::SeqCst) {
        crate::storage::diag_write(&format!(
            "[recorder] begin_select ignored: active={} pending=true", ACTIVE.load(Ordering::SeqCst)));
        return;
    }
    // 截图会话进行中：先收掉遮罩，避免两个全屏置顶窗互相叠盖抢输入
    if crate::screenshot::shooting() {
        let _ = crate::screenshot::cancel_impl(app);
    }
    // 已存在的旧选择窗先复用
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let Some((mx, my, mw, mh)) = cursor_pos().and_then(|(x, y)| monitor_at(app, x, y)) else {
        PENDING.store(false, Ordering::SeqCst);
        crate::storage::diag_write("[recorder] begin_select FAILED: no monitor under cursor");
        return;
    };
    let url = crate::frontend_url(app);
    let app2 = app.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        if app2.get_webview_window(SELECT_LABEL).is_some() { return; }
        // 先隐藏建窗 → 定位/尺寸/透明 → 再显示：避免默认几何闪烁
        if let Ok(win) = WebviewWindowBuilder::new(&app2, SELECT_LABEL, url)
            .title("屏幕录制")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .focused(false)
            .build()
        {
            let _ = win.set_position(tauri::PhysicalPosition::new(mx, my));
            let _ = win.set_size(tauri::PhysicalSize::new(mw as u32, mh as u32));
            crate::make_webview_transparent(&win);
            let _ = win.show();
            let _ = win.set_focus();
            crate::storage::diag_write(&format!(
                "[recorder] select window shown at ({mx},{my}) {mw}x{mh}"));
        } else {
            PENDING.store(false, Ordering::SeqCst);
            crate::storage::diag_write("[recorder] select window build FAILED");
        }
    });
}

pub fn on_select_destroyed<R: Runtime>(_app: &AppHandle<R>) {
    PENDING.store(false, Ordering::SeqCst);
}

/// 强制收掉选区窗（若开着）：截图等其他全屏交互开始前调用，
/// 杜绝"隐形选区窗滞留吃掉整屏输入"的互相卡死。
pub fn dismiss_select_if_open<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.close();
        PENDING.store(false, Ordering::SeqCst);
    }
}

pub fn on_bar_destroyed<R: Runtime>(_app: &AppHandle<R>) {
    STOP.store(true, Ordering::SeqCst);
}

// ---------- 控制条 ----------

const BAR_W: i32 = 260;
const BAR_H: i32 = 72;

fn ensure_bar<R: Runtime>(app: &AppHandle<R>, mon: (i32, i32, i32, i32), region: (i32, i32, i32, i32)) {
    let (mx, my, mw, mh) = mon;
    let (rx, ry, rw, rh) = region;
    let mut bx = rx + rw / 2 - BAR_W / 2;
    bx = bx.clamp(mx + 8, mx + mw - BAR_W - 8);
    // 优先放区域正上方，放不下放正下方
    let mut by = ry - BAR_H - 12;
    if by < my + 8 {
        by = ry + rh + 12;
    }
    let by = by.min(my + mh - BAR_H - 8);
    if let Some(w) = app.get_webview_window(BAR_LABEL) {
        let _ = w.set_position(tauri::PhysicalPosition::new(bx, by));
        let _ = w.show();
        return;
    }
    let url = crate::frontend_url(app);
    let app2 = app.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        if app2.get_webview_window(BAR_LABEL).is_some() { return; }
        if let Ok(win) = WebviewWindowBuilder::new(&app2, BAR_LABEL, url)
            .title("屏幕录制")
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .focused(false)
            .build()
        {
            let _ = win.set_position(tauri::PhysicalPosition::new(bx, by));
            let _ = win.set_size(tauri::PhysicalSize::new(BAR_W as u32, BAR_H as u32));
            crate::make_webview_transparent(&win);
            // 控制条从屏幕采集中排除：即使区域调整后盖到它也不会被录进 GIF
            #[cfg(windows)]
            if let Some(h) = crate::screenshot::hwnd_of_webview(&win) {
                crate::acrylic::exclude_from_capture(h);
            }
            let _ = win.show();
        }
    });
}

// ---------- 保存路径 ----------

fn default_save_dir() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        use windows::Win32::System::Com::CoTaskMemFree;
        use windows::Win32::UI::Shell::{SHGetKnownFolderPath, FOLDERID_Pictures};
        unsafe {
            let Ok(pw) = SHGetKnownFolderPath(&FOLDERID_Pictures, windows::Win32::UI::Shell::KNOWN_FOLDER_FLAG(0), None)
            else { return None };
            let s = pw.to_string().ok();
            CoTaskMemFree(Some(pw.as_ptr() as *const std::ffi::c_void));
            s.map(std::path::PathBuf::from)
        }
    }
    #[cfg(not(windows))]
    { None }
}

fn save_path_for<R: Runtime>(app: &AppHandle<R>) -> std::path::PathBuf {
    let base = app
        .try_state::<crate::config::ConfigState>()
        .and_then(|s| {
            let c = s.0.lock().unwrap();
            c.recorder.save_dir.clone().filter(|p| !p.is_empty())
                .or_else(|| c.shot.save_dir.clone().filter(|p| !p.is_empty()))
        })
        .map(std::path::PathBuf::from)
        .or_else(default_save_dir)
        .unwrap_or_else(|| app.state::<crate::storage::AppPaths>().data_dir.clone());
    let dir = base.join("小心工具箱");
    let _ = std::fs::create_dir_all(&dir);
    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
    dir.join(format!("录屏-{ts}.gif"))
}

// ---------- 采集 + 编码线程 ----------

fn run<R: Runtime + 'static>(
    app: AppHandle<R>,
    mon: (i32, i32, i32, i32),
    rx: i32, ry: i32, rw: i32, rh: i32,
) {
    let finish = |app: &AppHandle<R>, ok: bool, path: Option<String>, dur: u64, frames: u32, err: Option<String>| {
        let bytes = path.as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0);
        ACTIVE.store(false, Ordering::SeqCst);
        let _ = app.emit(EVT_DONE, Done { ok, path, duration_ms: dur, frames, bytes, error: err });
    };

    let cfg = load_cfg(&app);
    // 等选区窗完全销毁再抓第一帧（DXGI 会拍到分层窗口，避免前几帧残留遮罩）
    std::thread::sleep(std::time::Duration::from_millis(200));
    let interval = std::time::Duration::from_millis(1000 / cfg.fps as u64);
    // GIF delay 单位 10ms，至少 2（50fps 上限无意义但防 0）
    let delay_units: u16 = ((100.0 / cfg.fps as f32).round() as u16).max(2);
    let started = std::time::Instant::now();
    let stride = rw as usize * 4;
    let (mx, my, mw, mh) = mon;
    crate::storage::diag_write(&format!(
        "[recorder] started region=({rx},{ry}) {rw}x{rh} mon=({mx},{my}) {mw}x{mh} fps={} speed={}",
        cfg.fps, cfg.speed
    ));

    let path = save_path_for(&app);
    let file = match std::fs::File::create(&path) {
        Ok(f) => f,
        Err(e) => { finish(&app, false, None, 0, 0, Some(format!("创建文件失败: {e}"))); return; }
    };

    let mut encoder = match gif::Encoder::new(file, rw as u16, rh as u16, &[]) {
        Ok(e) => e,
        Err(e) => { finish(&app, false, None, 0, 0, Some(format!("GIF 初始化失败: {e}"))); return; }
    };
    let _ = encoder.set_repeat(gif::Repeat::Infinite);

    let mut prev_rgba: Vec<u8> = Vec::new();
    // 上一帧的量化结果（重复帧直接复用，省 NeuQuant）
    let mut prev_palette: Vec<u8> = Vec::new();
    let mut prev_indexed: Vec<u8> = Vec::new();

    let mut frames: u32 = 0;
    let mut last_tick = started;
    let mut fail_streak = 0usize;
    // 全黑帧检测：连续采到全黑画面（受保护内容/驱动拦截等）时明确报错，
    // 而不是默默产出一段黑 GIF 让用户猜
    let mut black_streak = 0u32;
    let is_black = |bgra: &[u8]| -> bool {
        // 抽样 ~每 4096 像素取 1 点，全部接近 0 才判黑
        bgra.chunks_exact(4).step_by(4096).all(|px| px[0] < 8 && px[1] < 8 && px[2] < 8)
    };

    loop {
        let tick_start = std::time::Instant::now();
        if STOP.load(Ordering::SeqCst) { break; }
        // 时长上限（0 = 不限）
        if cfg.max_secs > 0 && started.elapsed().as_secs() >= cfg.max_secs as u64 { break; }

        let Some(f) = crate::dupl::win::capture_region((mx, my), mw, mh, rx, ry, rw, rh)
        else {
            fail_streak += 1;
            if fail_streak > 60 { break; }
            std::thread::sleep(interval);
            continue;
        };
        fail_streak = 0;
        if f.bgra.len() < rh as usize * stride { continue; }

        if frames == 0 {
            crate::storage::diag_write(&format!(
                "[recorder] first frame captured: {} bytes (dxgi/gdi)", f.bgra.len()
            ));
        }

        // BGRA → RGB24（gif::Frame::from_rgb_* 要求 3 字节/像素；
        // 此前误传 RGBA 导致数据错位、录出全黑帧——已修复）
        let bgra = f.bgra;
        let mut rgb: Vec<u8> = Vec::with_capacity((rw as usize) * (rh as usize) * 3);
        for px in bgra.chunks_exact(4) {
            rgb.push(px[2]);
            rgb.push(px[1]);
            rgb.push(px[0]);
        }
        // 变化检测基于原始 BGRA（比 RGB 少一次拷贝比较）
        let unchanged = !prev_rgba.is_empty() && bgra == prev_rgba;

        // 全黑帧跟踪：连续 ~4 秒全黑即中止并明确报错
        if is_black(&bgra) {
            black_streak += 1;
            if black_streak == 1 {
                crate::storage::diag_write("[recorder] WARNING: frame is all black");
            }
            if black_streak >= cfg.fps * 4 {
                let _ = std::fs::remove_file(&path);
                finish(&app, false, None, started.elapsed().as_millis() as u64, frames,
                    Some("捕获到全黑画面：该区域内容被系统/驱动保护，无法采集".into()));
                return;
            }
        } else {
            black_streak = 0;
        }

        if unchanged && !prev_indexed.is_empty() {
            // 静止画面：复用上帧量化结果维持时间轴
            let frame = gif::Frame {
                width: rw as u16,
                height: rh as u16,
                delay: delay_units,
                buffer: std::borrow::Cow::Owned(prev_indexed.clone()),
                palette: Some(prev_palette.clone()),
                ..Default::default()
            };
            if encoder.write_frame(&frame).is_err() { break; }
            frames += 1;
            prev_rgba = bgra;
        } else {
            let mut frame = gif::Frame::from_rgb_speed(rw as u16, rh as u16, &rgb, cfg.speed);
            frame.delay = delay_units;
            prev_palette = frame.palette.as_ref().map(|c| c.to_vec()).unwrap_or_default();
            prev_indexed = frame.buffer.to_vec();
            if encoder.write_frame(&frame).is_err() { break; }
            frames += 1;
            prev_rgba = bgra;
        }

        if last_tick.elapsed().as_millis() >= 500 {
            last_tick = std::time::Instant::now();
            let _ = app.emit(EVT_TICK, Tick { elapsed_ms: started.elapsed().as_millis() as u64, frames });
        }

        let spent = tick_start.elapsed();
        if spent < interval {
            std::thread::sleep(interval - spent);
        }
    }

    drop(encoder);
    let dur = started.elapsed().as_millis() as u64;
    crate::storage::diag_write(&format!(
        "[recorder] finished: frames={frames} dur={dur}ms stop={} fail_streak={fail_streak}",
        STOP.load(Ordering::SeqCst)
    ));
    if frames == 0 {
        let _ = std::fs::remove_file(&path);
        finish(&app, false, None, dur, 0, Some("未捕获到任何画面".into()));
        return;
    }
    finish(&app, true, Some(path.display().to_string()), dur, frames, None);
}

// ---------- 命令 ----------

#[tauri::command]
pub fn rec_begin(app: AppHandle) -> Result<(), String> {
    begin_select(&app);
    Ok(())
}

#[tauri::command]
pub fn rec_select_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.close();
    }
    PENDING.store(false, Ordering::SeqCst);
    Ok(())
}

/// 开始录制。x/y/w/h 为【选区窗内局部物理像素】——这里叠加选区窗自身位置
/// 得到全局坐标，避免前端再做显示器原点换算。
#[tauri::command]
pub fn recorder_start(
    app: AppHandle,
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> Result<(), String> {
    if ACTIVE.swap(true, Ordering::SeqCst) {
        crate::storage::diag_write("[recorder] start REJECTED: already active");
        return Err("已有录制任务进行中".into());
    }
    STOP.store(false, Ordering::SeqCst);

    if w < 24 || h < 24 {
        ACTIVE.store(false, Ordering::SeqCst);
        return Err("录制区域太小".into());
    }
    // 选区窗所在即目标显示器：以其位置换算全局坐标并确定监视器
    let pos = window.outer_position().map_err(|e| format!("{e}"))?;
    let gx = pos.x + x;
    let gy = pos.y + y;
    let Some(mon) = monitor_at(&app, gx + w / 2, gy + h / 2) else {
        ACTIVE.store(false, Ordering::SeqCst);
        crate::storage::diag_write("[recorder] start FAILED: region outside monitors");
        return Err("录制区域不在任何显示器内".into());
    };
    let (mx, my, mw, mh) = mon;
    let rx = gx.clamp(mx, mx + mw - w.min(mw));
    let ry = gy.clamp(my, my + mh - h.min(mh));
    let rw = w.min(mw);
    let rh = h.min(mh);

    // 收掉选区窗、弹出控制条
    if let Some(sel) = app.get_webview_window(SELECT_LABEL) {
        let _ = sel.close();
    }
    PENDING.store(false, Ordering::SeqCst);
    ensure_bar(&app, mon, (rx, ry, rw, rh));

    let app2 = app.clone();
    std::thread::spawn(move || run(app2, mon, rx, ry, rw, rh));
    Ok(())
}

#[tauri::command]
pub fn recorder_stop(_app: AppHandle) -> Result<(), String> {
    STOP.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn rec_dismiss(app: AppHandle) -> Result<(), String> {
    STOP.store(true, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window(BAR_LABEL) {
        let _ = w.close();
    }
    Ok(())
}
