//! 滚动长截图：用户手动滚动 + 后台持续抓帧拼接。
//!
//! 流程：截图遮罩内选定区域 → 工具栏「长截图」→ 本模块隐藏遮罩、弹出
//! 边框指示窗（scrollshot-frame，采集排除，不会拼进画面）与悬浮进度条
//! （scrollshot-bar）→ 用户自己滚动页面（滚轮/拖滚动条/PageDown 均可，
//! 工具绝不碰鼠标键盘）→ 后台线程以 ~8fps 抓帧：内容稳定后才做全画布
//! 垂直对齐，只追加真正的新内容 → 完成/停止后 PNG 落盘 + 写剪贴板 +
//! 自动贴图到原选区位置。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindowBuilder};

pub const BAR_LABEL: &str = "scrollshot-bar";
pub const FRAME_LABEL: &str = "scrollshot-frame";

pub const EVT_PROGRESS: &str = "scrollshot://progress";
pub const EVT_DONE: &str = "scrollshot://done";
/// 进度条窗每次呼出时重置 UI 状态（窗口是复用的，React 状态会残留上一次会话）
pub const EVT_BAR_RESET: &str = "scrollshot://reset";

static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP: AtomicBool = AtomicBool::new(false);
/// 用户主动取消：立即退出且不保存/贴图
static CANCEL: AtomicBool = AtomicBool::new(false);

/// 对齐接受阈值（弹性逐行匹配后的平均灰度差 /255）
const THRESH_ALIGN: u32 = 22;

/// 边框指示窗的几何（全局物理像素）：前端挂载后经命令查询绘制边框条。
/// 用命令而非事件：事件在页面 JS 就绪前发出会丢，命令查询天然无竞态。
static FRAME_INFO: Mutex<Option<FrameInfo>> = Mutex::new(None);

#[derive(Clone, serde::Serialize)]
pub struct FrameInfo {
    /// 指示窗矩形（全局物理像素）
    win: [i32; 4],
    /// 被捕获区域矩形（全局物理像素）
    region: [i32; 4],
}

/// 拼接结果上限：高度像素与内存双保险
const MAX_HEIGHT_PX: usize = 20_000;
const MAX_BYTES: usize = 400 * 1024 * 1024;
/// 抓帧节奏
const CAPTURE_INTERVAL_MS: u64 = 120;
/// 连续多久没有新内容自动收尾（到底/用户忘记点停止的兜底）
const IDLE_FINISH_MS: u128 = 6000;
/// 对齐条带最大行数：新帧顶部与画布匹配用的参考条带（兼顾精度与速度）
const ALIGN_STRIP_MAX: usize = 240;
/// 灰度横向抽样步长
const GS: usize = 4;

#[derive(Clone, serde::Serialize)]
struct Progress { height: u32 }

#[derive(Clone, serde::Serialize)]
struct Done {
    ok: bool,
    path: Option<String>,
    height: u32,
    error: Option<String>,
}

// ---------- 拼接核心 ----------

struct Canvas {
    w: usize,
    h: usize,
    /// BGRA，行距 = w*4
    bgra: Vec<u8>,
    /// 每行的抽样灰度（w/GS 字节），与 bgra 行对齐
    gray: Vec<Vec<u8>>,
}

fn row_gray(bgra: &[u8], w: usize) -> Vec<u8> {
    (0..w / GS)
        .map(|i| {
            let o = i * GS * 4;
            let b = bgra[o] as u32;
            let g = bgra[o + 1] as u32;
            let r = bgra[o + 2] as u32;
            ((r * 299 + g * 587 + b * 114) / 1000) as u8
        })
        .collect()
}

impl Canvas {
    fn new(frame: &[u8], fw: usize, fh: usize) -> Canvas {
        let stride = fw * 4;
        let mut gray = Vec::with_capacity(fh);
        for r in 0..fh {
            gray.push(row_gray(&frame[r * stride..], fw));
        }
        Canvas { w: fw, h: fh, bgra: frame[..fh * stride].to_vec(), gray }
    }

    /// 追加新帧的第 j_start..fh 行（前面的行与画布已有内容重复）。
    /// j_start > 0 时多跳过一行：滚动常带亚像素位移，衔接行是前后内容的
    /// 混合像素（发虚），直接拼接会在接缝处留重影——跳过它换干净起点。
    fn push_from(&mut self, frame: &[u8], fgray: &[Vec<u8>], fh: usize, j_start: usize) {
        let stride = self.w * 4;
        for r in j_start..fh {
            self.bgra.extend_from_slice(&frame[r * stride..r * stride + stride]);
            self.gray.push(fgray[r].clone());
        }
        self.h += fh - j_start;
    }

    /// 全范围垂直对齐（弹性逐行匹配）：在画布中找新帧顶部内容的最佳落点 p
    /// （新帧第 j 行 ≈ 画布第 p+j 行）。返回 (p, 平均灰度差)，失败 None。
    ///
    /// 核心思想即"上一屏底部与下一屏顶部重叠"，但更稳：
    /// - 每一行允许 ±2px 垂直容差取最小差——浏览器按物理像素分数滚动时
    ///   衔接行是混合像素，固定整行硬比会把真匹配判死（此前拼不上的主因）；
    /// - 总是全画布粗搜 + 邻域精修取全局最优，重复纹理不会被"紧贴底部"
    ///   的次优位置骗走。
    fn find_align(&self, fgray: &[Vec<u8>], fh: usize) -> Option<(usize, u32)> {
        let h = self.h;
        let k = fh.min(ALIGN_STRIP_MAX).min(h);
        if k < 8 || fgray.len() < fh { return None; }
        let cw = self.w / GS;

        let row_diff = |a: &[u8], b: &[u8]| -> u64 {
            let mut s = 0u64;
            for c in (0..cw).step_by(2) {
                s += (a[c] as i32 - b[c] as i32).unsigned_abs() as u64;
            }
            s / ((cw / 2) as u64).max(1)
        };

        // score(p)：条带内逐行（步距2）与画布对应行的 ±2px 邻域取最小差再平均
        let score_at = |p: usize| -> u64 {
            if p + k > h { return u64::MAX; }
            let mut total = 0u64;
            let mut n = 0u64;
            for r in (0..k).step_by(2) {
                let fr = &fgray[r];
                let mut best = u64::MAX;
                for dp in -2i32..=2 {
                    let q = p as i32 + r as i32 + dp;
                    if q < 0 || q >= h as i32 { continue; }
                    let v = row_diff(&self.gray[q as usize], fr);
                    if v < best { best = v; }
                }
                if best != u64::MAX { total += best; n += 1; }
            }
            if n == 0 { return u64::MAX; }
            total / n
        };

        let step = ((h / 60).max(2)).max(4);
        let mut best_p = h - k;
        let mut best_v = score_at(best_p);
        let mut p = 0;
        while p + k <= h {
            let v = score_at(p);
            if v < best_v { best_v = v; best_p = p; }
            p += step;
        }
        // 邻域精修 ±step
        let lo = best_p.saturating_sub(step);
        let hi = (best_p + step).min(h - k);
        for q in lo..=hi {
            let v = score_at(q);
            if v < best_v { best_v = v; best_p = q; }
        }

        if best_v <= THRESH_ALIGN as u64 { Some((best_p, best_v as u32)) } else { None }
    }
}

// ---------- 输出 ----------

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

fn save_dir_for<R: Runtime>(app: &AppHandle<R>) -> std::path::PathBuf {
    let base = app
        .try_state::<crate::config::ConfigState>()
        .and_then(|s| {
            s.0.lock().unwrap().shot.save_dir.clone().filter(|p| !p.is_empty())
        })
        .map(std::path::PathBuf::from)
        .or_else(|| default_save_dir())
        .unwrap_or_else(|| app.state::<crate::storage::AppPaths>().data_dir.clone());
    let dir = base.join("小心工具箱");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn save_path_for<R: Runtime>(app: &AppHandle<R>) -> std::path::PathBuf {
    let dir = save_dir_for(app);
    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
    dir.join(format!("长截图-{ts}.png"))
}

fn copy_rgba_to_clipboard(rgba: &[u8], w: u32, h: u32) -> Result<(), String> {
    use arboard::{Clipboard, ImageData};
    let data = ImageData {
        width: w as usize,
        height: h as usize,
        bytes: std::borrow::Cow::Owned(rgba.to_vec()),
    };
    Clipboard::new()
        .and_then(|mut c| c.set_image(data))
        .map_err(|e| e.to_string())
}

// ---------- 边框指示窗 / 控制条 ----------

const BAR_W: i32 = 560;
const BAR_H: i32 = 100;
/// 边框条与捕获区域的间隙（物理像素）：边框画在区域外侧的这条缝里
const FRAME_MARGIN: i32 = 6;

fn hwnd_of<R: Runtime>(w: &tauri::WebviewWindow<R>) -> Option<windows::Win32::Foundation::HWND> {
    crate::screenshot::hwnd_of_webview(w)
}

/// 创建/复用边框指示窗：全屏覆盖所在显示器、鼠标穿透、采集排除。
/// 只在区域外侧画细边框（区域内侧零遮挡），DXGI/GDI 都拍不到它。
fn ensure_frame<R: Runtime>(app: &AppHandle<R>, mon: (i32, i32, i32, i32), region: (i32, i32, i32, i32)) {
    let (mx, my, mw, mh) = mon;
    let (rx, ry, rw, rh) = region;
    // 窗口 = 区域外扩 FRAME_MARGIN，再钳进显示器（区域贴屏边的那侧缝隙自然消失）
    let wx = (rx - FRAME_MARGIN).max(mx);
    let wy = (ry - FRAME_MARGIN).max(my);
    let wx2 = (rx + rw + FRAME_MARGIN).min(mx + mw);
    let wy2 = (ry + rh + FRAME_MARGIN).min(my + mh);
    let ww = (wx2 - wx).max(1);
    let wh = (wy2 - wy).max(1);
    *FRAME_INFO.lock().unwrap() = Some(FrameInfo {
        win: [wx, wy, ww, wh],
        region: [rx, ry, rw, rh],
    });

    if let Some(w) = app.get_webview_window(FRAME_LABEL) {
        let _ = w.set_position(tauri::PhysicalPosition::new(wx, wy));
        let _ = w.set_size(tauri::PhysicalSize::new(ww as u32, wh as u32));
        // 页面已挂载：推事件让它重查几何（复用窗场景）
        let _ = app.emit("scrollshot://frame-move", ());
        let _ = w.show();
        return;
    }
    // 无预建窗（预热未跑完等）：现场建一次，之后一直复用
    let url = crate::frontend_url(app);
    let app2 = app.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        if app2.get_webview_window(FRAME_LABEL).is_some() { return; }
        if let Ok(win) = build_frame_window(&app2, url) {
            let _ = win.set_position(tauri::PhysicalPosition::new(wx, wy));
            let _ = win.set_size(tauri::PhysicalSize::new(ww as u32, wh as u32));
            let _ = win.show();
        }
    });
}

/// 构建边框指示窗（预建与现场建共用配置）：全屏覆盖所在显示器、
/// 鼠标穿透、采集排除——DXGI/GDI 都拍不到它。
fn build_frame_window<R: Runtime>(app: &AppHandle<R>, url: tauri::WebviewUrl) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    let win = WebviewWindowBuilder::new(app, FRAME_LABEL, url)
        .title("长截图区域")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()?;
    crate::make_webview_transparent(&win);
    // 鼠标穿透：不干扰用户滚动页面
    let _ = win.set_ignore_cursor_events(true);
    // 采集排除：边框绝不能被拍进长图
    #[cfg(windows)]
    if let Some(h) = hwnd_of(&win) {
        crate::acrylic::exclude_from_capture(h);
    }
    Ok(win)
}

fn close_frame<R: Runtime>(app: &AppHandle<R>) {
    *FRAME_INFO.lock().unwrap() = None;
    // 隐藏而非销毁：窗口复用，下次呼出零创建开销（与截图遮罩同策略）
    if let Some(w) = app.get_webview_window(FRAME_LABEL) {
        let _ = w.hide();
    }
}

/// 前端（ScrollShotFrame 页面挂载时）查询边框几何
#[tauri::command]
pub fn scrollshot_frame_info() -> Option<FrameInfo> {
    FRAME_INFO.lock().unwrap().clone()
}

pub fn on_frame_destroyed<R: Runtime>(_app: &AppHandle<R>) {
    *FRAME_INFO.lock().unwrap() = None;
}

pub fn on_bar_destroyed<R: Runtime>(_app: &AppHandle<R>) {
    STOP.store(true, Ordering::SeqCst);
}

fn apply_bar_effects<R: Runtime>(win: &tauri::WebviewWindow<R>, app: &AppHandle<R>) {
    #[cfg(windows)]
    {
        let acrylic = app.try_state::<crate::config::ConfigState>()
            .map(|s| s.0.lock().unwrap().general.acrylic_enabled)
            .unwrap_or(true);
        crate::apply_panel_effects_for(win, acrylic);
    }
    #[cfg(not(windows))]
    let _ = (win, app);
}

fn ensure_bar<R: Runtime>(app: &AppHandle<R>, mon: (i32, i32, i32, i32)) {
    let (mx, my, mw, _mh) = mon;
    if let Some(w) = app.get_webview_window(BAR_LABEL) {
        let _ = w.set_position(tauri::PhysicalPosition::new(mx + (mw - BAR_W) / 2, my + 48));
        // 尺寸每次都钉一遍：防止旧版本/异常路径留下的错误几何
        let _ = w.set_size(tauri::PhysicalSize::new(BAR_W as u32, BAR_H as u32));
        let _ = w.show();
        let _ = w.set_focus();
        // 复用窗：清掉上一次会话残留的 React 状态（回到"运行中"空态）
        let _ = app.emit(EVT_BAR_RESET, ());
        return;
    }
    // 无预建窗：现场建一次，之后一直复用
    let url = crate::frontend_url(app);
    let app2 = app.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        if app2.get_webview_window(BAR_LABEL).is_some() { return; }
        if let Ok(win) = build_bar_window(&app2, url) {
            let _ = win.set_position(tauri::PhysicalPosition::new(mx + (mw - BAR_W) / 2, my + 48));
            let _ = win.set_size(tauri::PhysicalSize::new(BAR_W as u32, BAR_H as u32));
            apply_bar_effects(&win, &app2);
            let _ = win.show();
            let _ = win.set_focus();
        }
    });
}

/// 构建进度条窗（预建与现场建共用配置）
fn build_bar_window<R: Runtime>(app: &AppHandle<R>, url: tauri::WebviewUrl) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    let win = WebviewWindowBuilder::new(app, BAR_LABEL, url)
        .title("滚动长截图")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()?;
    crate::make_webview_transparent(&win);
    apply_bar_effects(&win, app);
    // 控制条也不许出现在任何捕获里
    #[cfg(windows)]
    if let Some(h) = hwnd_of(&win) {
        crate::acrylic::exclude_from_capture(h);
    }
    Ok(win)
}

/// 启动预热：提前建好隐藏的进度条窗与边框指示窗（页面加载完毕待命），
/// 首次点「长截图」即可瞬时显示，免去 WebView2 创建的数百毫秒。
pub fn prewarm<R: Runtime>(app: &AppHandle<R>) {
    if app.get_webview_window(BAR_LABEL).is_none() {
        let url = crate::frontend_url(app);
        let app2 = app.clone();
        crate::defer_to_main_loop(app.clone(), move || {
            if app2.get_webview_window(BAR_LABEL).is_some() { return; }
            if let Ok(win) = build_bar_window(&app2, url) {
                // 屏幕外待命（与贴图 staging 同款），首次显示前再挪到位。
                // 【必须显式设尺寸】否则停留在 WebView 默认 800×600——
                // 正是"进度条一大块空白"的原因
                let _ = win.set_size(tauri::PhysicalSize::new(BAR_W as u32, BAR_H as u32));
                let _ = win.set_position(tauri::PhysicalPosition::new(-32000, -32000));
            }
        });
    }
    // 边框窗同样预建（鼠标穿透 + 采集排除在构建时已设置）
    if app.get_webview_window(FRAME_LABEL).is_none() {
        let url = crate::frontend_url(app);
        let app2 = app.clone();
        crate::defer_to_main_loop(app.clone(), move || {
            if app2.get_webview_window(FRAME_LABEL).is_some() { return; }
            if let Ok(win) = build_frame_window(&app2, url) {
                let _ = win.set_position(tauri::PhysicalPosition::new(-32000, -32000));
                let _ = win.set_size(tauri::PhysicalSize::new(1, 1));
            }
        });
    }
}

// ---------- 主流程 ----------

fn monitor_containing<R: Runtime>(app: &AppHandle<R>, x: i32, y: i32) -> Option<(i32, i32, i32, i32)> {
    app.available_monitors().ok()?.into_iter()
        .map(|m| (m.position().x, m.position().y, m.size().width as i32, m.size().height as i32))
        .find(|(mx, my, mw, mh)| x >= *mx && x < mx + mw && y >= *my && y < my + mh)
}

fn run<R: Runtime + 'static>(
    app: AppHandle<R>,
    rx: i32, ry: i32, rw: i32, rh: i32,
    mon: (i32, i32, i32, i32),
) {
    let finish = |app: &AppHandle<R>, ok: bool, path: Option<String>, height: u32, err: Option<String>| {
        RUNNING.store(false, Ordering::SeqCst);
        close_frame(app);
        let _ = app.emit(EVT_DONE, Done { ok, path, height, error: err });
    };

    // 等遮罩完全消失再抓第一帧（hide 是同步的，这里只补偿合成器延迟）
    std::thread::sleep(std::time::Duration::from_millis(150));

    let (mx, my, mw, mh) = mon;
    let stride = rw as usize * 4;
    let fw = rw as usize;
    let fh = rh as usize;

    let mut canvas: Option<Canvas> = None;
    // 内容稳定检测：本帧与上一抓帧逐字节相同才算"滚动了且已停稳"。
    // 平滑滚动动画进行中的帧是运动的中间态，拿去对齐必然错位
    let mut last_raw: Vec<u8> = Vec::new();
    let mut last_new = std::time::Instant::now();
    let mut fail_streak = 0usize;

    let mut cancelled = false;
    loop {
        if STOP.load(Ordering::SeqCst) { break; }
        if CANCEL.load(Ordering::SeqCst) { cancelled = true; break; }

        let Some(f) = crate::dupl::win::capture_region((mx, my), mw, mh, rx, ry, rw, rh)
        else {
            fail_streak += 1;
            if fail_streak > 50 {
                finish(&app, false, None, canvas.as_ref().map(|c| c.h as u32).unwrap_or(0),
                    Some("屏幕采集失败".into()));
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(CAPTURE_INTERVAL_MS));
            continue;
        };
        fail_streak = 0;
        if f.bgra.len() < fh * stride {
            finish(&app, false, None, canvas.as_ref().map(|c| c.h as u32).unwrap_or(0),
                Some("帧数据不完整".into()));
            return;
        }

        // 与上一抓帧不同 → 还在滚动/动画中：记录并等下一帧
        if f.bgra != last_raw {
            last_raw = f.bgra;
            if canvas.is_some() && last_new.elapsed().as_millis() > IDLE_FINISH_MS {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(CAPTURE_INTERVAL_MS));
            continue;
        }

        let fgray: Vec<Vec<u8>> =
            (0..fh).map(|r| row_gray(&f.bgra[r * stride..], fw)).collect();

        match &mut canvas {
            None => {
                canvas = Some(Canvas::new(&f.bgra, fw, fh));
                last_new = std::time::Instant::now();
                let h = canvas.as_ref().unwrap().h as u32;
                let _ = app.emit(EVT_PROGRESS, Progress { height: h });
            }
            Some(c) => {
                if c.h < MAX_HEIGHT_PX && c.bgra.len() < MAX_BYTES {
                    if let Some((p, diff)) = c.find_align(&fgray, fh) {
                        // 新帧第 j 行对应画布第 p+j 行；超出画布底部的内容为新增
                        let j_start = c.h.saturating_sub(p);
                        // 衔接行跳过（见 push_from 注释）
                        let trim = if j_start > 0 { 1 } else { 0 };
                        if j_start + trim < fh {
                            let before = c.h;
                            c.push_from(&f.bgra, &fgray, fh, j_start + trim);
                            last_new = std::time::Instant::now();
                            crate::storage::diag_write(&format!(
                                "[scrollshot] +{}px (align p={p} diff={diff}) total={}px",
                                c.h - before, c.h
                            ));
                            let _ = app.emit(EVT_PROGRESS, Progress { height: c.h as u32 });
                        }
                    }
                    // 对齐失败：画面变化过大（动画/弹窗），跳过该帧继续观察
                }
                if last_new.elapsed().as_millis() > IDLE_FINISH_MS { break; }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(CAPTURE_INTERVAL_MS));
    }

    // 用户取消：立即收场，不保存不贴图
    if cancelled {
        if let Some(w) = app.get_webview_window(BAR_LABEL) {
            let _ = w.hide();
        }
        finish(&app, false, None, canvas.as_ref().map(|c| c.h as u32).unwrap_or(0),
            Some("已取消".into()));
        return;
    }

    let Some(c) = canvas else {
        finish(&app, false, None, 0, Some("未能捕获任何画面".into()));
        return;
    };
    if c.h < 8 {
        finish(&app, false, None, c.h as u32, Some("未滚动出更多内容".into()));
        return;
    }

    // BGRA → RGBA 并编码 PNG 落盘
    let mut rgba = c.bgra.clone();
    for px in rgba.chunks_exact_mut(4) { px.swap(0, 2); px[3] = 0xFF; }
    let (cw32, ch32) = (fw as u32, c.h as u32);
    if let Err(e) = copy_rgba_to_clipboard(&rgba, cw32, ch32) {
        crate::storage::diag_write(&format!("[scrollshot] clipboard: {e}"));
    }
    let img = match image::RgbaImage::from_raw(cw32, ch32, rgba) {
        Some(i) => i,
        None => { finish(&app, false, None, c.h as u32, Some("图像缓冲异常".into())); return; }
    };
    let path = save_path_for(&app);
    let enc_path = path.clone();
    let encode_err = tauri::async_runtime::spawn_blocking(move || {
        image::DynamicImage::ImageRgba8(img)
            .save_with_format(&enc_path, image::ImageFormat::Png)
            .err()
    });
    let save_err = match tauri::async_runtime::block_on(encode_err) {
        Ok(e) => e.map(|e| e.to_string()),
        Err(e) => Some(format!("join: {e}")),
    };
    if let Some(e) = save_err {
        finish(&app, false, None, c.h as u32, Some(format!("保存失败: {e}")));
        return;
    }

    // 自动贴图：包 BMP 直接走 pin 快路径，贴回原选区位置
    let pin_result = (|| -> Result<(), String> {
        let bmp = crate::screenshot::wrap_bmp(&c.bgra, cw32, ch32);
        let pin = crate::pin::create_store_entry(&app, &bmp, "image/bmp", rx, ry)?;
        crate::pin::attach_to_staging(&app, pin);
        Ok(())
    })();
    if let Err(e) = &pin_result {
        crate::storage::diag_write(&format!("[scrollshot] pin failed: {e}"));
    }

    crate::storage::diag_write(&format!("[scrollshot] saved {} ({}x{})", path.display(), cw32, ch32));
    finish(&app, true, Some(path.display().to_string()), c.h as u32, None);
}

/// 开始一次滚动长截图。x/y/w/h 为全局物理像素选区（来自截图遮罩工具栏）。
#[tauri::command]
pub fn scrollshot_begin<R: Runtime>(
    app: AppHandle<R>,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> Result<(), String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("已有长截图任务进行中".into());
    }
    STOP.store(false, Ordering::SeqCst);
    CANCEL.store(false, Ordering::SeqCst);

    if w <= 0 || h <= 0 {
        RUNNING.store(false, Ordering::SeqCst);
        return Err("选区无效".into());
    }
    let Some(mon) = monitor_containing(&app, x + w / 2, y + h / 2) else {
        RUNNING.store(false, Ordering::SeqCst);
        return Err("选区不在任何显示器内".into());
    };
    // 把选区钳制进所在显示器
    let (mx, my, mw, mh) = mon;
    let rx = x.clamp(mx, mx + mw - w.min(mw));
    let ry = y.clamp(my, my + mh - h.min(mh));
    let rw = w.min(mw);
    let rh = h.min(mh);

    // 先亮出边框与进度条（预建窗复用，瞬时），再收截图遮罩——
    // 观感上"点了立刻有反馈"，而不是先黑一下再等窗口创建
    ensure_frame(&app, mon, (rx, ry, rw, rh));
    ensure_bar(&app, mon);
    crate::screenshot::hide_all(&app);

    let app2 = app.clone();
    std::thread::spawn(move || run(app2, rx, ry, rw, rh, mon));
    Ok(())
}

/// 手动完成（控制条「完成」/ Esc）：当前已拼接的内容照常落盘 + 贴图
#[tauri::command]
pub fn scrollshot_stop(_app: AppHandle) -> Result<(), String> {
    STOP.store(true, Ordering::SeqCst);
    Ok(())
}

/// 取消（控制条「取消」）：中止且不保存不贴图
#[tauri::command]
pub fn scrollshot_cancel(_app: AppHandle) -> Result<(), String> {
    CANCEL.store(true, Ordering::SeqCst);
    Ok(())
}

/// 关闭控制条（结果页的 ✕）：隐藏复用，不销毁
#[tauri::command]
pub fn scrollshot_dismiss(app: AppHandle) -> Result<(), String> {
    STOP.store(true, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window(BAR_LABEL) {
        let _ = w.hide();
    }
    Ok(())
}

/// 另存为：把已保存的 PNG 复制到用户指定位置（控制条「另存为…」）
#[tauri::command]
pub fn scrollshot_save_as(src: String, dest: String) -> Result<(), String> {
    if src.is_empty() || dest.is_empty() { return Err("路径为空".into()); }
    std::fs::copy(&src, &dest).map(|_| ()).map_err(|e| format!("copy: {e}"))
}
