//! 屏幕录制（GIF / AVI）：独立选区 + 帧采集 + 编码，与截图模块完全解耦。
//!
//! 流程：托盘「屏幕录制」→ 全屏透明选区窗（rec-select，覆盖光标所在显示器）
//! → 拖拽框选 + 配置面板选择格式/帧率/分辨率 → Enter/按钮确认 → recorder_start
//! 关选区窗、弹控制条（rec-bar，自动避让录制区域）→ 后台线程按指定帧率循环
//! 抓帧（DXGI 优先 + GDI 回退），逐帧编码进 GIF/AVI 文件流 → 停止后落盘完成，
//! 事件通知控制条。
//!
//! 解耦设计：不依赖 screenshot.rs；窗口 label 前缀 rec-select / rec-bar，
//! 合并主分支时只需本文件 + lib.rs 注册 + capabilities + App.tsx 路由。

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindowBuilder};

pub const SELECT_LABEL: &str = "rec-select";
pub const BAR_LABEL: &str = "rec-bar";

pub const EVT_TICK: &str = "recorder://tick";
pub const EVT_DONE: &str = "recorder://done";
pub const EVT_STARTED: &str = "recorder://started";

/// 正在录制
static ACTIVE: AtomicBool = AtomicBool::new(false);
/// 选区窗已打开（防重复呼出）
static PENDING: AtomicBool = AtomicBool::new(false);
static STOP: AtomicBool = AtomicBool::new(false);

const NEUQUANT_SPEED_DEFAULT: i32 = 20;

#[derive(Clone, serde::Serialize)]
struct Tick { elapsed_ms: u64, frames: u32 }

#[derive(Clone, serde::Serialize)]
struct Started {
    /// 录制区域（CSS 像素，选区窗内坐标）
    x: f64, y: f64, w: f64, h: f64,
}

#[derive(Clone, serde::Serialize)]
struct Done {
    ok: bool,
    path: Option<String>,
    duration_ms: u64,
    frames: u32,
    bytes: u64,
    error: Option<String>,
}

/// 读录屏配置（缺省兜底）。帧率由选区面板按次传入，这里只取质量/时长
struct RecCfg { speed: i32, max_secs: u32 }

fn load_cfg<R: Runtime>(app: &AppHandle<R>) -> RecCfg {
    let cfg = app.try_state::<crate::config::ConfigState>()
        .map(|s| s.0.lock().unwrap().recorder.clone());
    match cfg {
        Some(c) => RecCfg {
            // quality: high/normal/fast → NeuQuant/JPEG 质量
            speed: match c.quality.as_str() {
                "high" => 10,
                "fast" => 30,
                _ => 20,
            },
            max_secs: c.max_duration_secs,
        },
        None => RecCfg { speed: NEUQUANT_SPEED_DEFAULT, max_secs: 120 },
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
    // 已存在的旧选择窗先复用（重置鼠标穿透：上次录制可能置了 true）
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.set_ignore_cursor_events(false);
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
            .title("选择录制区域")
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

pub fn on_bar_destroyed<R: Runtime>(app: &AppHandle<R>) {
    STOP.store(true, Ordering::SeqCst);
    // 控制条关闭 = 录制结束，同时关掉选区窗边框
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.close();
    }
    PENDING.store(false, Ordering::SeqCst);
}

// ---------- 控制条 ----------

const BAR_W: i32 = 200;
const BAR_H: i32 = 36;

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
            .title("录制控制")
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

fn save_path_for<R: Runtime>(app: &AppHandle<R>, ext: &str) -> std::path::PathBuf {
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
    dir.join(format!("录屏-{ts}.{ext}"))
}

// ---------- 采集 + 编码线程 ----------

/// 录制参数：格式（GIF 动图 / AVI 视频）、帧率、分辨率缩放
#[derive(Clone, Copy)]
pub struct RecOpts {
    /// true=GIF 动图；false=AVI 视频(MJPEG)
    pub gif: bool,
    pub fps: u32,
    /// 输出分辨率缩放（0.25~1.0），1.0 = 原始选区尺寸
    pub scale: f32,
}

/// BGRA → RGB 转缩放（最近邻）；写入预分配的 rgb_buf，返回切片
/// 避免每帧分配新 Vec——调用方预分配并复用
fn prepare_frame_into(bgra: &[u8], rw: i32, rh: i32, ow: u32, oh: u32, rgb_buf: &mut Vec<u8>) {
    rgb_buf.clear();
    let no_scale = ow == rw as u32 && oh == rh as u32;
    if no_scale {
        // 直接原地 BGRA→RGB，零额外分配
        rgb_buf.reserve(bgra.len() / 4 * 3);
        for px in bgra.chunks_exact(4) {
            rgb_buf.push(px[2]);
            rgb_buf.push(px[1]);
            rgb_buf.push(px[0]);
        }
    } else {
        // 缩放：nearest-neighbor 手写（避免 image crate 的 RgbaImage 中间分配）
        let src_stride = rw as usize * 4;
        rgb_buf.reserve(ow as usize * oh as usize * 3);
        for dy in 0..oh as usize {
            let sy = (dy * rh as usize) / oh as usize;
            let src_row = &bgra[sy * src_stride..][..ow as usize * 4];
            for px in src_row.chunks_exact(4) {
                rgb_buf.push(px[2]);
                rgb_buf.push(px[1]);
                rgb_buf.push(px[0]);
            }
        }
    }
}

const AVI_FPS: u32 = 30;

fn run<R: Runtime + 'static>(
    app: AppHandle<R>,
    mon: (i32, i32, i32, i32),
    rx: i32, ry: i32, rw: i32, rh: i32,
    opts: RecOpts,
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
    let fps = if opts.gif { opts.fps.clamp(5, 24) } else { AVI_FPS };
    let scale = opts.scale.clamp(0.25, 1.0);
    // 输出尺寸取偶（视频编码器友好）
    let ow = (((rw as f32 * scale).round() as u32) / 2 * 2).max(2);
    let oh = (((rh as f32 * scale).round() as u32) / 2 * 2).max(2);

    // 等选区窗完全销毁再抓第一帧（DXGI 会拍到分层窗口，避免前几帧残留遮罩）
    std::thread::sleep(std::time::Duration::from_millis(200));
    let interval = std::time::Duration::from_millis(1000 / fps as u64);
    // GIF delay 单位 10ms，至少 2（防 0）
    let delay_units: u16 = ((100.0 / fps as f32).round() as u16).max(2);
    let started = std::time::Instant::now();
    let stride = rw as usize * 4;
    let (mx, my, mw, mh) = mon;
    crate::storage::diag_write(&format!(
        "[recorder] started region=({rx},{ry}) {rw}x{rh} out={ow}x{oh} fmt={} fps={} speed={}",
        if opts.gif { "gif" } else { "avi" }, fps, cfg.speed
    ));

    let ext = if opts.gif { "gif" } else { "avi" };
    let path = save_path_for(&app, ext);
    // Option 包一层：file 会被 GIF 或 AVI 其中一个编码器消费
    let mut file = match std::fs::File::create(&path) {
        Ok(f) => Some(f),
        Err(e) => { finish(&app, false, None, 0, 0, Some(format!("创建文件失败: {e}"))); return; }
    };

    // JPEG 质量：跟随设置页的质量偏好（high=90 / normal=82 / fast=70）
    let jpg_q: u8 = match cfg.speed { 10 => 90, 30 => 70, _ => 82 };

    // GIF 编码器与去重缓存
    let mut gif_enc: Option<gif::Encoder<std::fs::File>> = None;
    let mut prev_palette: Vec<u8> = Vec::new();
    let mut prev_indexed: Vec<u8> = Vec::new();
    if opts.gif {
        match gif::Encoder::new(file.take().unwrap(), ow as u16, oh as u16, &[]) {
            Ok(mut e) => {
                let _ = e.set_repeat(gif::Repeat::Infinite);
                gif_enc = Some(e);
            }
            Err(e) => { finish(&app, false, None, 0, 0, Some(format!("GIF 初始化失败: {e}"))); return; }
        }
    }
    // AVI 封装器（MJPEG：每帧一张 JPEG，兼容性最好的无编码器视频方案）
    let mut avi: Option<crate::avi::AviWriter<std::fs::File>> = if opts.gif {
        None
    } else {
        match crate::avi::AviWriter::new(file.take().unwrap(), ow, oh, fps) {
            Ok(a) => Some(a),
            Err(e) => { finish(&app, false, None, 0, 0, Some(format!("AVI 初始化失败: {e}"))); return; }
        }
    };

    let mut prev_bgra_hash: u64 = 0;
    // 复用缓冲区：避免每帧分配/释放 6~8MB
    let mut rgb_buf: Vec<u8> = Vec::new();
    let mut jpg_buf: Vec<u8> = Vec::new();

    let mut frames: u32 = 0;
    let mut last_tick = started;
    let mut fail_streak = 0usize;
    let mut max_frame_ms: u64 = 0;
    let mut total_frame_ms: u64 = 0;
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

        // 静止画面判定：用快速 hash 代替全量字节比较（1080p 省 ~2ms/帧）
        let bgra_hash = {
            use std::hash::{Hash, Hasher};
            let mut h = std::collections::hash_map::DefaultHasher::new();
            f.bgra.hash(&mut h);
            h.finish()
        };
        let unchanged = prev_bgra_hash != 0 && bgra_hash == prev_bgra_hash;
        prev_bgra_hash = bgra_hash;

        // 全黑帧跟踪：连续 ~4 秒全黑即中止并明确报错
        if is_black(&f.bgra) {
            black_streak += 1;
            if black_streak == 1 {
                crate::storage::diag_write("[recorder] WARNING: frame is all black");
            }
            if black_streak >= fps * 4 {
                let _ = std::fs::remove_file(&path);
                finish(&app, false, None, started.elapsed().as_millis() as u64, frames,
                    Some("捕获到全黑画面：该区域内容被系统/驱动保护，无法采集".into()));
                return;
            }
        } else {
            black_streak = 0;
        }

        prepare_frame_into(&f.bgra, rw, rh, ow, oh, &mut rgb_buf);

        if opts.gif {
            let Some(enc) = gif_enc.as_mut() else { unreachable!() };
            if unchanged && !prev_indexed.is_empty() {
                // 静止画面：复用上帧量化结果维持时间轴（省 NeuQuant）
                let frame = gif::Frame {
                    width: ow as u16,
                    height: oh as u16,
                    delay: delay_units,
                    buffer: std::borrow::Cow::Borrowed(&prev_indexed),
                    palette: Some(prev_palette.clone()),
                    ..Default::default()
                };
                if enc.write_frame(&frame).is_err() { break; }
            } else {
                let mut frame = gif::Frame::from_rgb_speed(ow as u16, oh as u16, &rgb_buf, cfg.speed);
                frame.delay = delay_units;
                prev_palette = frame.palette.as_ref().map(|c| c.to_vec()).unwrap_or_default();
                prev_indexed = frame.buffer.to_vec();
                if enc.write_frame(&frame).is_err() { break; }
            }
        } else {
            let Some(a) = avi.as_mut() else { unreachable!() };
            jpg_buf.clear();
            {
                use image::ImageEncoder;
                let enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpg_buf, jpg_q);
                if enc.write_image(&rgb_buf, ow, oh, image::ExtendedColorType::Rgb8).is_err() {
                    break;
                }
            }
            if a.write_jpeg(&jpg_buf).is_err() { break; }
        }
        frames += 1;

        let spent = tick_start.elapsed();
        let spent_ms = spent.as_millis() as u64;
        total_frame_ms += spent_ms;
        if spent_ms > max_frame_ms { max_frame_ms = spent_ms; }

        if last_tick.elapsed().as_millis() >= 500 {
            last_tick = std::time::Instant::now();
            let avg_ms = if frames > 0 { total_frame_ms / frames as u64 } else { 0 };
            crate::storage::diag_write(&format!(
                "[recorder] perf: frames={} avg={avg_ms}ms max={max_frame_ms}ms fmt={} {ow}x{oh}",
                frames, if opts.gif { "gif" } else { "avi" }
            ));
            let _ = app.emit(EVT_TICK, Tick { elapsed_ms: started.elapsed().as_millis() as u64, frames });
        }

        if spent < interval {
            std::thread::sleep(interval - spent);
        }
    }

    // 收尾：GIF Encoder drop 即写终止块；AVI 回填头部 + 追加索引
    drop(gif_enc.take());
    if let Some(a) = avi.take() {
        if let Err(e) = a.finish() {
            crate::storage::diag_write(&format!("[recorder] avi finish: {e}"));
        }
    }
    let dur = started.elapsed().as_millis() as u64;
    let avg_ms = if frames > 0 { total_frame_ms / frames as u64 } else { 0 };
    crate::storage::diag_write(&format!(
        "[recorder] finished: frames={frames} dur={dur}ms avg_frame={avg_ms}ms max_frame={max_frame_ms}ms stop={} fmt={}",
        STOP.load(Ordering::SeqCst),
        if opts.gif { "gif" } else { "avi" }
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

/// 开始录制。x/y/w/h 为【屏幕绝对 CSS 像素】——前端已乘 devicePixelRatio
/// 转为物理像素，这里叠加选区窗自身物理像素位置得到全局坐标。
/// fmt="gif"(动图，用 fps/scale) | "avi"(视频 MJPEG 30fps)；scale 为分辨率缩放。
#[tauri::command]
pub fn recorder_start(
    app: AppHandle,
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    fmt: Option<String>,
    fps: Option<u32>,
    scale: Option<f64>,
) -> Result<(), String> {
    let opts = RecOpts {
        gif: fmt.as_deref().unwrap_or("gif") != "avi",
        fps: fps.unwrap_or(12),
        scale: scale.unwrap_or(1.0) as f32,
    };
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

    // 不关闭选区窗——保持边框可见；发事件通知前端切换到"录制中"模式
    let sc = window.scale_factor().unwrap_or(1.0);
    let _ = app.emit(EVT_STARTED, Started {
        x: x as f64 / sc, y: y as f64 / sc,
        w: w as f64 / sc, h: h as f64 / sc,
    });
    PENDING.store(false, Ordering::SeqCst);
    // 录制中：选区窗退化为纯指示层——鼠标事件穿透到下层窗口（用户可正常操作屏幕），
    // 并从屏幕采集中排除（遮罩/脉冲边框绝不进视频，视频只有录制区域内容）
    let _ = window.set_ignore_cursor_events(true);
    #[cfg(windows)]
    if let Some(h) = crate::screenshot::hwnd_of_webview(&window) {
        crate::acrylic::exclude_from_capture(h);
    }
    ensure_bar(&app, mon, (rx, ry, rw, rh));

    let app2 = app.clone();
    std::thread::spawn(move || run(app2, mon, rx, ry, rw, rh, opts));
    Ok(())
}

#[tauri::command]
pub fn recorder_stop(_app: AppHandle) -> Result<(), String> {
    STOP.store(true, Ordering::SeqCst);
    Ok(())
}

const POPUP_W: i32 = 300;
const POPUP_H: i32 = 52;

/// 录制完成：控制条缩小 → 右下角小弹窗（前端调用，5秒后自动关）
#[tauri::command]
pub fn recorder_bar_popup(app: AppHandle) -> Result<(), String> {
    let w = app.get_webview_window(BAR_LABEL).ok_or("bar not found")?;
    // 放到主显示器右下角
    let mon = w.current_monitor().ok().flatten();
    let (mx, my, mw, mh) = mon
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width as i32, s.height as i32)
        })
        .unwrap_or((0, 0, 1920, 1080));
    let px = mx + mw - POPUP_W - 16;
    let py = my + mh - POPUP_H - 16;
    let _ = w.set_size(tauri::PhysicalSize::new(POPUP_W as u32, POPUP_H as u32));
    let _ = w.set_position(tauri::PhysicalPosition::new(px, py));
    Ok(())
}

#[tauri::command]
pub fn rec_dismiss(app: AppHandle) -> Result<(), String> {
    STOP.store(true, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window(BAR_LABEL) {
        let _ = w.close();
    }
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.close();
    }
    PENDING.store(false, Ordering::SeqCst);
    Ok(())
}
