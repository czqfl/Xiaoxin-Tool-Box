//! 屏幕录制（GIF / MP4）：独立选区 + 帧采集 + 编码，与截图模块完全解耦。
//!
//! 流程：托盘「屏幕录制」→ 全屏透明选区窗（rec-select，覆盖光标所在显示器，
//! 黑色半透明遮罩镂空选区——选区内画面保持清晰可见）→ 拖拽框选 + 配置面板选择格式/帧率/分辨率 →
//! Enter/按钮确认 → recorder_start 关选区窗、显示原生边框环（recframe.rs，
//! 纯 Win32 分层窗口直绘，不依赖前端渲染）、弹控制条（rec-bar，同样带亚克力）
//! → 后台线程按指定帧率循环抓帧（DXGI 优先 + GDI 回退），
//! GIF 走 gif crate / MP4 走 Media Foundation H.264（h264.rs）→ 停止后落盘。
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
/// 暂停中（不采集不写入，恢复后视频时间线连续——跳过暂停期间画面）
static PAUSE: AtomicBool = AtomicBool::new(false);
/// 取消（停止且不落盘，删除临时文件）
static CANCEL: AtomicBool = AtomicBool::new(false);

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
    /// 用户主动取消（不保存）：控制条收到后直接关闭，不弹通知
    canceled: bool,
}

// 注：旧版的「单次时长上限」已移除——录制不再自动掐断，何时结束由用户自己决定。
// （配置里的 max_duration_secs 字段保留仅为向后兼容，不再参与任何判断）

// ---------- 入口 ----------

/// 控制条（rec-bar）小窗启用真亚克力：SWCA 实时模糊 + 前端半透明底。
/// 模糊必须走系统层——透明 Tauri 窗口上 CSS backdrop-filter 采不到桌面（且被禁用）。
#[cfg(windows)]
fn apply_select_blur<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    if let Some(h) = crate::screenshot::hwnd_of_webview(window) {
        let light = crate::window_theme_is_light(window);
        let _ = crate::acrylic::apply_blur(h, light);
    }
}

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
/// 【正在录制时再按 = 停止录制并保存】——这是控制条之外的兜底停止入口。
pub fn begin_select<R: Runtime>(app: &AppHandle<R>) {
    if !app.try_state::<crate::config::ConfigState>()
        .map(|s| s.0.lock().unwrap().recorder.enabled)
        .unwrap_or(true)
    {
        crate::storage::diag_write("[recorder] begin_select ignored: feature disabled");
        return;
    }
    if ACTIVE.load(Ordering::SeqCst) {
        crate::storage::diag_write("[recorder] begin_select while active -> STOP");
        STOP.store(true, Ordering::SeqCst);
        return;
    }
    if PENDING.swap(true, Ordering::SeqCst) {
        crate::storage::diag_write("[recorder] begin_select ignored: pending=true");
        return;
    }
    // 截图会话进行中：先收掉遮罩，避免两个全屏置顶窗互相叠盖抢输入
    if crate::screenshot::shooting() {
        let _ = crate::screenshot::cancel_impl(app);
    }
    // 已存在的旧选择窗直接复用（窗口只 hide 不销毁——重建 WebView 要一两秒，
    // 复用后二次呼出即时）。重置鼠标穿透（上次录制可能置了 true）并通知前端清空状态
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.set_ignore_cursor_events(false);
        // 【先广播 reset 再 show】窗口隐藏期间前端就把状态清零，show 的
        // 第一帧一定是干净的全屏遮罩，不会闪出上一次的录制区域
        let _ = app.emit("recorder://select-reset", ());
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
            // 不加 SWCA 模糊：选区窗只要黑色遮罩镂空，选区内画面保持清晰
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
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.hide();
        PENDING.store(false, Ordering::SeqCst);
    }
}

pub fn on_bar_destroyed<R: Runtime>(app: &AppHandle<R>) {
    STOP.store(true, Ordering::SeqCst);
    // 控制条关闭 = 录制结束，选区窗遮罩一并收掉（hide 复用）
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.hide();
    }
    PENDING.store(false, Ordering::SeqCst);
}

// ---------- 控制条 ----------

// 312 → 356：为录制中的「静音」按钮预留位置（仅在带音轨时出现，
// 但窗口宽度固定，未录音时留白比按钮挤出去更好）
const BAR_W: i32 = 356;
const BAR_H: i32 = 36;

/// 控制条物理尺寸 = CSS 设计尺寸 × 目标显示器缩放系数。
/// 高 DPI 缩放屏（150% 等）下若按物理常量定窗口，webview 视口会被裁剪。
fn bar_phys_size(scale: f64) -> (i32, i32) {
    (
        (BAR_W as f64 * scale).round() as i32,
        (BAR_H as f64 * scale).round() as i32,
    )
}

fn ensure_bar<R: Runtime>(app: &AppHandle<R>, mon: (i32, i32, i32, i32), _region: (i32, i32, i32, i32)) {
    let (mx, my, mw, _mh) = mon;
    // 以录制所在显示器的缩放系数换算物理尺寸（多显示器混合 DPI 场景各自正确）
    let sc = app
        .available_monitors()
        .ok()
        .and_then(|ms| {
            ms.into_iter()
                .find(|m| m.position().x == mx && m.position().y == my)
                .map(|m| m.scale_factor())
        })
        .unwrap_or(1.0);
    let (bw, bh) = bar_phys_size(sc);
    // 控制条固定在显示器顶部居中（不随录制区域浮动，避免出现在屏幕中间）
    let bx = mx + (mw - bw) / 2;
    let by = my + 12;
    if let Some(w) = app.get_webview_window(BAR_LABEL) {
        let _ = w.set_size(tauri::PhysicalSize::new(bw.max(1) as u32, bh.max(1) as u32));
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
            let _ = win.set_size(tauri::PhysicalSize::new(bw.max(1) as u32, bh.max(1) as u32));
            crate::make_webview_transparent(&win);
            // 控制条从屏幕采集中排除：即使区域调整后盖到它也不会被录进视频
            #[cfg(windows)]
            if let Some(h) = crate::screenshot::hwnd_of_webview(&win) {
                crate::acrylic::exclude_from_capture(h);
            }
            // 真亚克力：SWCA 实时模糊 + 前端半透明底（观感与通用设置/截图工具栏一致）
            #[cfg(windows)]
            apply_select_blur(&win);
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

/// 录制格式
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum RecFmt { Gif, Mp4 }

/// 画质（逐次覆盖通用设置里的编码质量）
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum RecQuality { High, Normal, Fast }

/// 录制参数：格式（GIF / MP4）、帧率、分辨率缩放、画质
#[derive(Clone, Copy)]
pub struct RecOpts {
    pub fmt: RecFmt,
    pub fps: u32,
    /// 输出分辨率缩放（0.25~1.0），1.0 = 原始选区尺寸
    pub scale: f32,
    pub quality: RecQuality,
    /// 音源：Off=无音轨 / Mic=麦克风 / System=系统声音环回 / Mix=两者混合。
    /// 仅 MP4 生效（GIF 容器不支持音频）。
    pub audio: crate::recaudio::AudioSource,
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
        // 缩放：nearest-neighbor 手写（避免 image crate 的 RgbaImage 中间分配）。
        // 注意 XY 双轴都要采样——旧实现水平方向只取每行前 ow 像素（裁掉右半边，
        // 缩放录制时画面像被"切扁"），这里修正为真正的最近邻缩放。
        let src_stride = rw as usize * 4;
        rgb_buf.reserve(ow as usize * oh as usize * 3);
        for dy in 0..oh as usize {
            let sy = (dy * rh as usize) / oh as usize;
            let src_row = &bgra[sy * src_stride..];
            for dx in 0..ow as usize {
                let sx = (dx * rw as usize) / ow as usize;
                let px = &src_row[sx * 4..sx * 4 + 4];
                rgb_buf.push(px[2]);
                rgb_buf.push(px[1]);
                rgb_buf.push(px[0]);
            }
        }
    }
}

/// BGRA → BGRA 缩放（最近邻），H.264 路径直接喂 DXGI 采集原始布局。
/// 不缩放时零拷贝语义（调用方直接用原切片，此函数不会被调用）。
fn prepare_frame_bgra_into(bgra: &[u8], rw: i32, rh: i32, ow: u32, oh: u32, out: &mut Vec<u8>) {
    out.clear();
    let src_stride = rw as usize * 4;
    out.reserve(ow as usize * oh as usize * 4);
    for dy in 0..oh as usize {
        let sy = (dy * rh as usize) / oh as usize;
        let src_row = &bgra[sy * src_stride..];
        for dx in 0..ow as usize {
            let sx = (dx * rw as usize) / ow as usize;
            let px = &src_row[sx * 4..sx * 4 + 4];
            out.extend_from_slice(px);
        }
    }
}

/// 允许的请求帧率区间（设置页滑块与录制面板共用）。
/// 实际落帧速度仍受采集/编码能力限制，达不到时按真实间隔写时间戳（视频不会快进）。
pub const MIN_FPS: u32 = 5;
pub const MAX_FPS: u32 = 60;

fn run<R: Runtime + 'static>(
    app: AppHandle<R>,
    mon: (i32, i32, i32, i32),
    rx: i32, ry: i32, rw: i32, rh: i32,
    opts: RecOpts,
) {
    let finish = |app: &AppHandle<R>, ok: bool, path: Option<String>, dur: u64, frames: u32, err: Option<String>, canceled: bool| {
        let bytes = path.as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0);
        ACTIVE.store(false, Ordering::SeqCst);
        // 收掉选区窗的遮罩模式：hide（不销毁，下次呼出复用）并恢复鼠标事件
        if let Some(w) = app.get_webview_window(SELECT_LABEL) {
            let _ = w.set_ignore_cursor_events(false);
            let _ = w.hide();
        }
        let _ = app.emit(EVT_DONE, Done { ok, path, duration_ms: dur, frames, bytes, error: err, canceled });
    };

    // RAII：本线程退出即释放自己那份 DXGI 采集上下文。D3D11 immediate context
    // 不可跨线程复用，且 ThreadId 会被后续线程复用——不清理既泄漏设备，也可能
    // 让下一轮录制拿到上一轮的陈旧 ctx（→ 访问违规崩溃）。
    struct RecThreadGuard;
    impl Drop for RecThreadGuard {
        fn drop(&mut self) {
            crate::dupl::win::release_thread();
        }
    }
    let _rec_guard = RecThreadGuard;

    // 帧率：MP4 与 GIF 一律采用用户在设置里选的帧率（5~60），不再硬编码 30
    let fps = opts.fps.clamp(MIN_FPS, MAX_FPS);
    let scale = opts.scale.clamp(0.25, 1.0);
    // 输出尺寸取偶（视频编码器友好）
    let ow = (((rw as f32 * scale).round() as u32) / 2 * 2).max(2);
    let oh = (((rh as f32 * scale).round() as u32) / 2 * 2).max(2);

    // 画质 → GIF NeuQuant 速度 / H.264 码率（面板逐次传入，覆盖设置页默认）
    let speed: i32 = match opts.quality {
        RecQuality::High => 10,
        RecQuality::Normal => 20,
        RecQuality::Fast => 30,
    };

    // 等选区窗完全销毁再抓第一帧（DXGI 会拍到分层窗口，避免前几帧残留遮罩）
    std::thread::sleep(std::time::Duration::from_millis(200));
    let interval = std::time::Duration::from_millis(1000 / fps as u64);
    // 每帧真实时间：编码跟不上请求帧率时按实测间隔回写容器/时间戳，
    // 时长与动作速度才与实际一致（否则视频会被压缩成名义时长快进播放）
    let mut prev_cap_at: Option<std::time::Instant> = None;
    let started = std::time::Instant::now();
    let stride = rw as usize * 4;
    let (mx, my, mw, mh) = mon;
    let fmt_name = match opts.fmt { RecFmt::Gif => "gif", RecFmt::Mp4 => "mp4" };
    crate::storage::diag_write(&format!(
        "[recorder] started region=({rx},{ry}) {rw}x{rh} out={ow}x{oh} fmt={fmt_name} fps={fps} speed={speed}"
    ));

    // 原生边框环：录制区域四周描边（Win32 直绘，不依赖前端）
    #[cfg(windows)]
    let frame_ring: Option<crate::recframe::RecFrame> = crate::recframe::RecFrame::show(rx, ry, rw, rh);

    let ext = match opts.fmt { RecFmt::Gif => "gif", RecFmt::Mp4 => "mp4" };
    let path = save_path_for(&app, ext);

    // GIF 编码器与去重缓存
    let mut gif_enc: Option<gif::Encoder<std::fs::File>> = None;
    let mut prev_palette: Vec<u8> = Vec::new();
    let mut prev_indexed: Vec<u8> = Vec::new();
    if opts.fmt == RecFmt::Gif {
        match std::fs::File::create(&path)
            .map_err(|e| e.to_string())
            .and_then(|f| gif::Encoder::new(f, ow as u16, oh as u16, &[]).map_err(|e| e.to_string()))
        {
            Ok(mut e) => {
                let _ = e.set_repeat(gif::Repeat::Infinite);
                gif_enc = Some(e);
            }
            Err(e) => { finish(&app, false, None, 0, 0, Some(format!("GIF 初始化失败: {e}")), false); return; }
        }
    }
    // MP4：Media Foundation H.264 Sink Writer（软件编码器，真 MP4 容器）
    let bitrate = crate::h264::bitrate_for(ow, oh, fps, opts.quality);
    // ---- 音频引擎（仅 MP4；GIF 容器不支持音频）----
    // 采集跑在独立线程、只产 PCM 包；录制线程每帧写完后 drain 混音写入。
    // 任何一步失败都降级为「无音轨」，绝不阻断录制。
    let mut audio_eng: Option<crate::recaudio::AudioEngine> = None;
    let mut audio_cfg: Option<crate::h264::AudioCfg> = None;
    if opts.audio != crate::recaudio::AudioSource::Off {
        if opts.fmt != RecFmt::Mp4 {
            crate::storage::diag_write("[recorder] GIF 不支持音频，本次录制无音轨");
        } else {
            match crate::recaudio::AudioEngine::start(opts.audio) {
                Ok(Some(eng)) => {
                    audio_cfg = Some(crate::h264::AudioCfg {
                        sample_rate: 48000,
                        channels: 2,
                        bitrate: 128_000,
                    });
                    audio_eng = Some(eng);
                }
                Ok(None) => {
                    crate::storage::diag_write("[recorder] 音频端点不可用，本次录制无音轨")
                }
                Err(e) => crate::storage::diag_write(&format!(
                    "[recorder] 音频启动失败，降级为无音轨：{e}"
                )),
            }
        }
    }
    let mut h264: Option<crate::h264::H264Writer> = if opts.fmt == RecFmt::Mp4 {
        // 先试带音轨；音频侧（如系统缺 AAC 编码器）失败 → 回退重建无音轨 writer
        match crate::h264::H264Writer::new_ex(
            &path,
            ow,
            oh,
            fps,
            bitrate,
            opts.quality,
            crate::h264::EncTuning::Tuned,
            audio_cfg,
        ) {
            Ok(h) => Some(h),
            Err(e) => {
                crate::storage::diag_write(&format!(
                    "[recorder] 带音轨 writer 创建失败，回退无音轨：{e}"
                ));
                if let Some(mut eng) = audio_eng.take() {
                    eng.finish();
                }
                match crate::h264::H264Writer::new(
                    &path,
                    ow,
                    oh,
                    fps,
                    bitrate,
                    opts.quality,
                    crate::h264::EncTuning::Tuned,
                ) {
                    Ok(h) => Some(h),
                    Err(e2) => {
                        let _ = std::fs::remove_file(&path);
                        finish(&app, false, None, 0, 0, Some(e2), false);
                        return;
                    }
                }
            }
        }
    } else {
        None
    };

    let mut prev_bgra_hash: u64 = 0;
    // 复用缓冲区：避免每帧分配/释放 6~8MB
    let mut rgb_buf: Vec<u8> = Vec::new();
    let mut bgra_buf: Vec<u8> = Vec::new();

    let mut write_err: Option<String> = None;
    let mut frames: u32 = 0;
    let mut last_tick = started;
    let mut fail_streak = 0usize;
    let mut max_frame_ms: u64 = 0;
    let mut total_frame_ms: u64 = 0;
    // 已录制时长（毫秒，不含暂停段）：控制条计时与视频时长都以它为准
    let mut dur_ms: u64 = 0;
    let mut was_paused = false;
    // 全黑帧检测：连续采到全黑画面（受保护内容/驱动拦截等）时明确报错，
    // 而不是默默产出一段黑 GIF 让用户猜
    let mut black_streak = 0u32;
    let is_black = |bgra: &[u8]| -> bool {
        // 抽样 ~每 4096 像素取 1 点，全部接近 0 才判黑
        bgra.chunks_exact(4).step_by(4096).all(|px| px[0] < 8 && px[1] < 8 && px[2] < 8)
    };

    loop {
        let tick_start = std::time::Instant::now();
        if CANCEL.load(Ordering::SeqCst) { break; }
        if STOP.load(Ordering::SeqCst) { break; }

        // 暂停：不采集不写入（视频时间线跳过暂停段），边框环变琥珀色提示
        if PAUSE.load(Ordering::SeqCst) {
            if !was_paused {
                was_paused = true;
                // 暂停：丢弃在途音频包且不推进音频时间线，与视频侧
                // prev_cap_at = None 的语义对齐（暂停段不计入音画时间线）
                if let Some(eng) = audio_eng.as_mut() { eng.discard(); }
                #[cfg(windows)]
                if let Some(ring) = frame_ring.as_ref() { ring.set_paused(true); }
                let _ = app.emit(EVT_TICK, Tick { elapsed_ms: dur_ms, frames });
            }
            std::thread::sleep(std::time::Duration::from_millis(60));
            continue;
        }
        if was_paused {
            was_paused = false;
            // 恢复：重置帧间隔基准，暂停段的墙钟时间不计入视频时间线
            prev_cap_at = None;
            #[cfg(windows)]
            if let Some(ring) = frame_ring.as_ref() { ring.set_paused(false); }
        }
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
                finish(&app, false, None, dur_ms, frames,
                    Some("捕获到全黑画面：该区域内容被系统/驱动保护，无法采集".into()), false);
                return;
            }
        } else {
            black_streak = 0;
        }

        // RGB 转换/缩放仅 GIF 需要；MP4 路径直接用 BGRA
        if opts.fmt == RecFmt::Gif {
            prepare_frame_into(&f.bgra, rw, rh, ow, oh, &mut rgb_buf);
        }

        // 本帧距上一已写帧的真实间隔（首帧用名义间隔）
        let gap = prev_cap_at.map(|t| tick_start.duration_since(t));
        let gap_ms = gap
            .as_ref()
            .map(|g| g.as_millis().max(1))
            .unwrap_or((1000 / fps.max(1)) as u128);
        prev_cap_at = Some(tick_start);
        let gif_delay: u16 = ((gap_ms as f64 / 10.0).round() as u16).clamp(2, 600);
        // MP4 帧时间戳/时长（100ns 单位）：同样用真实间隔，VFR 保真
        let gap_100ns: i64 = gap
            .as_ref()
            .map(|g| (g.as_nanos() / 100).clamp(10_000, 600_000_000) as i64)
            .unwrap_or(10_000_000 / fps.max(1) as i64);

        let frame_written;
        // （write_err 声明已提升到本函数外层）
        match opts.fmt {
            RecFmt::Gif => {
                let Some(enc) = gif_enc.as_mut() else { unreachable!() };
                if unchanged && !prev_indexed.is_empty() {
                    let frame = gif::Frame {
                        width: ow as u16,
                        height: oh as u16,
                        delay: gif_delay,
                        buffer: std::borrow::Cow::Borrowed(&prev_indexed),
                        palette: Some(prev_palette.clone()),
                        ..Default::default()
                    };
                    frame_written = enc.write_frame(&frame).is_ok();
                } else {
                    let mut frame = gif::Frame::from_rgb_speed(ow as u16, oh as u16, &rgb_buf, speed);
                    frame.delay = gif_delay;
                    prev_palette = frame.palette.as_ref().map(|c| c.to_vec()).unwrap_or_default();
                    prev_indexed = frame.buffer.to_vec();
                    frame_written = enc.write_frame(&frame).is_ok();
                }
            }
            RecFmt::Mp4 => {
                let Some(wr) = h264.as_mut() else { unreachable!() };
                // 不缩放直接喂采集原始 BGRA；缩放走最近邻
                let r = if ow == rw as u32 && oh == rh as u32 {
                    wr.write_bgra(&f.bgra, gap_100ns)
                } else {
                    prepare_frame_bgra_into(&f.bgra, rw, rh, ow, oh, &mut bgra_buf);
                    wr.write_bgra(&bgra_buf, gap_100ns)
                };
                match r {
                    Ok(()) => frame_written = true,
                    Err(e) => { write_err = Some(e); frame_written = false; }
                }
            }
        }
        if !frame_written {
            crate::storage::diag_write(&format!(
                "[recorder] write frame FAILED after {frames} frames: {}",
                write_err.as_deref().unwrap_or("未知错误")));
            break;
        }
        frames += 1;
        dur_ms += gap_ms as u64;
        // 音频：视频帧写成功后把在途 PCM 混音并写入 AAC。
        // 必须在同一线程（录制线程）调——IMFSinkWriter 要求串行化，
        // 采集线程绝不碰它。静音时 drain 写零帧，时间线不断。
        if let (Some(eng), Some(wr)) = (audio_eng.as_mut(), h264.as_mut()) {
            let video_ts = wr.video_ts();
            let muted = crate::recaudio::AUDIO_MUTE.load(Ordering::SeqCst);
            eng.drain(wr, video_ts, muted);
        }
        // 前几帧各记一条：一旦再崩溃，日志能明确停在「采集后」还是「编码后」
        if frames <= 3 {
            crate::storage::diag_write(&format!("[recorder] frame {frames} encoded"));
        }

        let spent = tick_start.elapsed();
        let spent_ms = spent.as_millis() as u64;
        total_frame_ms += spent_ms;
        if spent_ms > max_frame_ms { max_frame_ms = spent_ms; }

        if last_tick.elapsed().as_millis() >= 500 {
            last_tick = std::time::Instant::now();
            let avg_ms = if frames > 0 { total_frame_ms / frames as u64 } else { 0 };
            crate::storage::diag_write(&format!(
                "[recorder] perf: frames={frames} avg={avg_ms}ms max={max_frame_ms}ms fmt={fmt_name} {ow}x{oh}"
            ));
            let _ = app.emit(EVT_TICK, Tick { elapsed_ms: dur_ms, frames });
        }

        if spent < interval {
            std::thread::sleep(interval - spent);
        }
    }

    // 用户取消：不落盘，直接删临时文件并通知前端关掉控制条（不弹完成通知）
    if CANCEL.load(Ordering::SeqCst) {
        drop(gif_enc.take());
        if let Some(mut eng) = audio_eng.take() { eng.finish(); }
        drop(h264.take());
        let _ = std::fs::remove_file(&path);
        crate::storage::diag_write("[recorder] canceled by user, temp file removed");
        finish(&app, false, None, dur_ms, frames, None, true);
        return;
    }

    // 收尾：GIF Encoder drop 即写终止块；H.264 Finalize 写出 moov 元数据。
    // 音频必须先停采集并 join，再 finalize——保证最后一段 PCM 已提交。
    drop(gif_enc.take());
    if let Some(mut eng) = audio_eng.take() { eng.finish(); }
    let mut finalize_err: Option<String> = None;
    if let Some(mut h) = h264.take() {
        if let Err(e) = h.finalize() {
            finalize_err = Some(format!("{e}"));
            crate::storage::diag_write(&format!("[recorder] mp4 finalize: {e}"));
        }
    }
    let dur = dur_ms;
    let avg_ms = if frames > 0 { total_frame_ms / frames as u64 } else { 0 };
    let fps_eff = if avg_ms > 0 { (1000.0 / avg_ms as f64 * 10.0).round() / 10.0 } else { 0.0 };
    crate::storage::diag_write(&format!(
        "[recorder] finished: frames={frames} dur={dur}ms avg_frame={avg_ms}ms (~{fps_eff}fps delivered) max_frame={max_frame_ms}ms stop={} fmt={fmt_name}",
        STOP.load(Ordering::SeqCst)
    ));
    if frames == 0 {
        let _ = std::fs::remove_file(&path);
        finish(&app, false, None, dur, 0, Some("未捕获到任何画面".into()), false);
        return;
    }
    // 写帧中途失败（磁盘满/编码器异常）或 moov 写出失败 → 产出的是坏文件，
    // 必须报错丢弃，绝不能弹"已保存"让用户拿去用
    if write_err.is_some() {
        let _ = std::fs::remove_file(&path);
        let we = write_err.unwrap_or_else(|| "未知错误".into());
        finish(&app, false, None, dur, frames, Some(format!("录制中途写入失败：{we}")), false);
        return;
    }
    if let Some(fe) = finalize_err {
        let _ = std::fs::remove_file(&path);
        finish(&app, false, None, dur, frames, Some(format!("视频封装失败：{fe}")), false);
        return;
    }
    finish(&app, true, Some(path.display().to_string()), dur, frames, None, false);
}

// ---------- 命令 ----------

#[tauri::command]
pub fn rec_begin(app: AppHandle) -> Result<(), String> {
    begin_select(&app);
    Ok(())
}

#[tauri::command]
pub fn rec_select_cancel(app: AppHandle) -> Result<(), String> {
    // hide 而非 close：选区窗复用（重建 WebView 需一两秒），前端状态由
    // begin_select 复用分支广播的 select-reset 事件清空
    if let Some(w) = app.get_webview_window(SELECT_LABEL) {
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.hide();
    }
    PENDING.store(false, Ordering::SeqCst);
    Ok(())
}

/// 开始录制。x/y/w/h 为【屏幕绝对 CSS 像素】——前端已乘 devicePixelRatio
/// 转为物理像素，这里叠加选区窗自身物理像素位置得到全局坐标。
/// fmt="gif"(动图) | "mp4"(H.264 视频)；两者都使用传入的 fps（内部夹到 5~60），
/// scale 为分辨率缩放。达不到请求帧率时按真实间隔写时间戳，成品不会快进。
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
    quality: Option<String>,
    // 音源："off" / "mic" / "system" / "mix"；None 视为 off
    audio: Option<String>,
) -> Result<(), String> {
    let fmt = match fmt.as_deref() {
        // "avi" 为历史值：统一落 MP4（MJPEG-AVI 已废弃）
        Some("mp4") | Some("avi") => RecFmt::Mp4,
        _ => RecFmt::Gif,
    };
    let quality = match quality.as_deref() {
        Some("high") => RecQuality::High,
        Some("fast") => RecQuality::Fast,
        _ => RecQuality::Normal,
    };
    let audio = crate::recaudio::AudioSource::from_str(audio.as_deref().unwrap_or("off"));
    let opts = RecOpts {
        fmt,
        fps: fps.unwrap_or(12),
        scale: scale.unwrap_or(1.0) as f32,
        quality,
        audio,
    };
    if ACTIVE.swap(true, Ordering::SeqCst) {
        crate::storage::diag_write("[recorder] start REJECTED: already active");
        return Err("已有录制任务进行中".into());
    }
    STOP.store(false, Ordering::SeqCst);
    PAUSE.store(false, Ordering::SeqCst);
    CANCEL.store(false, Ordering::SeqCst);
    // 静音状态随会话复位：上次录制点了静音，下次录制不该开场即静音
    crate::recaudio::AUDIO_MUTE.store(false, Ordering::SeqCst);
    // 静音状态随会话复位：上次录制点了静音，下次录制不该开场即静音
    crate::recaudio::AUDIO_MUTE.store(false, Ordering::SeqCst);

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

    // 选区窗不销毁，转入【遮罩模式】：黑色遮罩镂空录制区（视觉与选区阶段一致），
    // 鼠标穿透（set_ignore_cursor_events）不挡用户操作桌面；录制区域描边由
    // 原生边框环负责（前端遮罩模式不再画框，避免两套虚线重叠）。
    // 录制结束由 run() 的 finish 统一 hide（窗口复用，二次呼出零等待）
    PENDING.store(false, Ordering::SeqCst);
    let _ = window.set_ignore_cursor_events(true);
    ensure_bar(&app, mon, (rx, ry, rw, rh));
    let _ = app.emit("recorder://mask", ());

    let app2 = app.clone();
    std::thread::spawn(move || run(app2, mon, rx, ry, rw, rh, opts));
    Ok(())
}

#[tauri::command]
pub fn recorder_stop(_app: AppHandle) -> Result<(), String> {
    STOP.store(true, Ordering::SeqCst);
    Ok(())
}

/// 暂停录制：不采集不写入，恢复后视频时间线连续（跳过暂停期间画面）
#[tauri::command]
pub fn recorder_pause(_app: AppHandle) -> Result<(), String> {
    PAUSE.store(true, Ordering::SeqCst);
    Ok(())
}

/// 恢复录制：从当前画面继续
#[tauri::command]
pub fn recorder_resume(_app: AppHandle) -> Result<(), String> {
    PAUSE.store(false, Ordering::SeqCst);
    Ok(())
}

/// 取消录制：停止且不保存，删除临时文件（区别于 recorder_stop 的"停止并保存"）
#[tauri::command]
pub fn recorder_cancel(_app: AppHandle) -> Result<(), String> {
    CANCEL.store(true, Ordering::SeqCst);
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
    let sc = mon.as_ref()
        .map(|m| m.scale_factor())
        .unwrap_or_else(|| w.scale_factor().unwrap_or(1.0));
    let pw = (POPUP_W as f64 * sc).round() as i32;
    let ph = (POPUP_H as f64 * sc).round() as i32;
    let (mx, my, mw, mh) = mon
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width as i32, s.height as i32)
        })
        .unwrap_or((0, 0, 1920, 1080));
    let px = mx + mw - pw - 16;
    let py = my + mh - ph - 16;
    let _ = w.set_size(tauri::PhysicalSize::new(pw.max(1) as u32, ph.max(1) as u32));
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
        let _ = w.set_ignore_cursor_events(false);
        let _ = w.hide();
    }
    PENDING.store(false, Ordering::SeqCst);
    Ok(())
}

/// 打开录屏保存目录（与 save_path_for 同一套解析逻辑）
#[tauri::command]
pub fn recorder_open_dir(app: AppHandle) -> Result<(), String> {
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
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("打开文件夹失败：{e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 纯逻辑回归：BGRA 缩放最近邻采样必须 XY 双轴取点（修复"切扁"画面）。
    #[test]
    fn bgra_scale_samples_both_axes() {
        // 4x2 → 2x2：期望采样源点 (0,0)(2,0)(0,1)(2,1) 的 B 分量
        let rw = 4;
        let rh = 2;
        let mut bgra = vec![0u8; 32];
        for y in 0..rh as usize {
            for x in 0..rw as usize {
                bgra[(y * rw as usize + x) * 4] = (x * 10 + y) as u8; // B 通道可辨识
            }
        }
        let mut out = Vec::new();
        prepare_frame_bgra_into(&bgra, rw, rh, 2, 2, &mut out);
        assert_eq!(out.len(), 2 * 2 * 4);
        assert_eq!(out[0], 0); // (0,0)
        assert_eq!(out[4], 20); // (2,0)
        assert_eq!(out[8], 1); // (0,1)
        assert_eq!(out[12], 21); // (2,1)
    }
}
