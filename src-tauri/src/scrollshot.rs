//! 滚动长截图：程序自动定速滚动 + 后台持续抓帧拼接。
//!
//! 流程：截图遮罩内选定区域 → 工具栏「长截图」→ 本模块隐藏遮罩、弹出
//! 边框指示窗（scrollshot-frame，采集排除，不会拼进画面）与悬浮进度条
//! （scrollshot-bar）→ 光标挪到选区中心后由程序按固定节奏发送滚轮事件
//! （滚一步 → 等画面停稳 → 全画布垂直对齐、只追加真正的新内容 → 再滚一步），
//! 固定步长的机械式滚动最容易拼接 → 到底/完成后 PNG 落盘 + 写剪贴板 +
//! 自动贴图到原选区位置。

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
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

/// 自动滚动速度档位（1..=10，默认 5）：【一档 = 每步滚动 40px】，
/// 即速度直接代表一次固定滚动的高度（40~400px）。进度条上的滑杆实时
/// 改这里，滚动线程每步重新读取
static SPEED: AtomicU32 = AtomicU32::new(5);
const SPEED_MIN: u32 = 1;
const SPEED_MAX: u32 = 10;
const PX_PER_LEVEL: f64 = 40.0;
/// 自动滚动开关：进入长截图先不滚，等用户按 空格/「开始」才开始；
/// 再按一次 空格/「结束」收尾保存。【没有任何自动收尾】——只有用户
/// 主动结束/取消才会停（此前"到底自动收尾"在滚轮没生效时秒退，
/// 用户观感就是"没点停止它自己停了"）
static SCROLLING: AtomicBool = AtomicBool::new(false);

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
/// 抓帧节奏：停稳判定靠「相邻两抓帧逐字节相同」，粒度直接决定每步
/// 节奏上限——120ms 时动画结束后还要再等 1~2 个周期才判停稳（实测步
/// 间隔 0.55~1.4s 抖动，观感"顿一下再继续滚"）；60ms 让动画一停立刻
/// 衔接下一步，节奏抖动显著收窄。60ms 全帧 memcmp 开销可忽略
const CAPTURE_INTERVAL_MS: u64 = 60;
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

/// 两行抽样灰度的平均绝对差（供对齐评分与边界行检查共用）
fn row_diff(a: &[u8], b: &[u8], cw: usize) -> u64 {
    let mut s = 0u64;
    let mut n = 0u64;
    let mut c = 0;
    while c < cw {
        s += (a[c] as i32 - b[c] as i32).unsigned_abs() as u64;
        n += 1;
        c += 2;
    }
    s / n.max(1)
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
    /// j_start 由调用方按「边界行是否混合 + 亚像素累计误差」决定
    fn push_from(&mut self, frame: &[u8], fgray: &[Vec<u8>], fh: usize, j_start: usize) {
        let stride = self.w * 4;
        for r in j_start..fh {
            self.bgra.extend_from_slice(&frame[r * stride..r * stride + stride]);
            self.gray.push(fgray[r].clone());
        }
        self.h += fh - j_start;
    }

    /// 垂直对齐：在画布中找新帧顶部内容的最佳落点 p（新帧第 j 行 ≈ 画布
    /// 第 p+j 行）。返回 (p, 平均灰度差, 亚像素偏移)，失败 None。
    ///
    /// - 每一行允许 ±2px 垂直容差取最小差——浏览器按物理像素分数滚动时
    ///   衔接行是混合像素，固定整行硬比会把真匹配判死；
    /// - 【带落点提示时】只在提示窗口内逐像素密搜：滚动由本程序控制、
    ///   步长已知，全画布盲搜会被重复纹理（文本行/表格线）骗到错误位置，
    ///   造成重影与漏行。窗口内搜不到合格落点再回退全画布粗搜。
    fn find_align(
        &self,
        fgray: &[Vec<u8>],
        fh: usize,
        hint: Option<(usize, usize)>,
    ) -> Option<(usize, u32, f64)> {
        let h = self.h;
        let k = fh.min(ALIGN_STRIP_MAX).min(h);
        if k < 8 || fgray.len() < fh { return None; }
        let cw = self.w / GS;

        // score(p)：条带内逐行（步距2）与画布对应行求平均差；【整体偏移】
        // 评分——±2px 的五种整体错位各算一遍条带总差取最优，而不是逐行
        // 独立取邻域最小。逐行独立会让「整体错 1~2px」的假匹配每行都找到
        // 替身（重复纹理：表格线/文本行），分数与真匹配同样合格，接口处
        // 整段错位被拼进画布；且 score(p±1) 被邻域取整拉平失真，整像素
        // 滚动也输出 frac=±0.5 伪影（diag 实锤：diff=0 的会话 frac 恒 0.50，
        // Bresenham 被骗着每两步 ±1 行乱切）。整体偏移保持行间相对关系，
        // 错位候选总差显著变大被自然淘汰，峰回归单点、插值恢复意义
        let score_at = |p: usize| -> u64 {
            if p + k > h { return u64::MAX; }
            let mut best_total = u64::MAX;
            for dp in -2i32..=2 {
                let base = p as i32 + dp;
                if base < 0 || base + k as i32 > h as i32 { continue; }
                let base = base as usize;
                let mut total = 0u64;
                for r in (0..k).step_by(2) {
                    total += row_diff(&self.gray[base + r], &fgray[r], cw);
                }
                if total < best_total { best_total = total; }
            }
            if best_total == u64::MAX { return u64::MAX; }
            best_total / ((k + 1) / 2).max(1) as u64
        };

        let best_in = |lo: usize, hi: usize, step: usize| -> Option<(usize, u64)> {
            let hi = hi.min(h - k);
            if lo > hi { return None; }
            let mut best_p = lo;
            let mut best_v = score_at(lo);
            let mut p = lo;
            while p < hi {
                p = (p + step).min(hi);
                let v = score_at(p);
                if v < best_v { best_v = v; best_p = p; }
            }
            // 邻域精修 ±step
            let lo2 = best_p.saturating_sub(step);
            for q in lo2..=best_p + step {
                if q > hi { break; }
                let v = score_at(q);
                if v < best_v { best_v = v; best_p = q; }
            }
            if best_v == u64::MAX { None } else { Some((best_p, best_v)) }
        };

        // 先试落点提示窗口（逐像素密搜），不合格回退全画布
        let mut cand: Option<(usize, u64)> = None;
        if let Some((lo, hi)) = hint {
            if let Some(res) = best_in(lo, hi, 1) {
                if res.1 <= THRESH_ALIGN as u64 { cand = Some(res); }
            }
        }
        let (p, v) = match cand {
            Some(x) => x,
            None => best_in(0, h - k, ((h / 60).max(2)).max(4))?,
        };
        if v > THRESH_ALIGN as u64 { return None; }

        // 亚像素估计：对 score(p-1/p/p+1) 抛物线插值取顶点偏移。
        // 平滑滚动常停在分数像素上，真实位移是「整数+小数」，只按整数切
        // 会每步留下 ≤1px 系统误差，逐帧累积成长距离漂移
        let s_m = if p > 0 { score_at(p - 1) } else { v };
        let s_p = score_at((p + 1).min(h - k));
        let denom = (s_m + s_p) as i64 - 2 * (v as i64);
        let frac: f64 = if denom > 0 {
            (0.5 * (s_m as f64 - s_p as f64) / denom as f64).clamp(-0.5, 0.5)
        } else {
            0.0
        };
        Some((p, v as u32, frac))
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

// ---------- 自动滚动（程序代滚） ----------

/// 光标是否在捕获区域内：SendInput 注入的滚轮落在光标下的窗口上，
/// 光标在选区内时走这条最兼容的路径（与用户自己滚滚轮完全等价）
#[cfg(windows)]
fn cursor_in_region(rx: i32, ry: i32, rw: i32, rh: i32) -> bool {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    unsafe {
        if GetCursorPos(&mut p).is_ok() {
            return p.x >= rx && p.x < rx + rw && p.y >= ry && p.y < ry + rh;
        }
    }
    false
}

/// 选区中心下的目标窗口：PostMessage 虚拟滚动的收件人
#[cfg(windows)]
fn window_at_region_center(rx: i32, ry: i32, rw: i32, rh: i32) -> Option<isize> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::WindowFromPoint;
    let p = POINT { x: rx + rw / 2, y: ry + rh / 2 };
    unsafe {
        let h = WindowFromPoint(p);
        if h.is_invalid() { None } else { Some(h.0 as isize) }
    }
}

/// 【虚拟鼠标】向目标窗口直接投递 WM_MOUSEWHEEL（向下 120）：
/// 不移动、不占用用户的真实鼠标——鼠标停在进度条上点按钮的同时，
/// 页面照常滚动。lParam 带选区中心的屏幕坐标，Chromium 等按坐标路由
#[cfg(windows)]
fn post_wheel_to(hwnd: isize, x: i32, y: i32) -> bool {
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_MOUSEWHEEL};
    let wparam = ((-120i32) as u16 as usize) << 16; // HIWORD = wheel delta -120
    let lparam = (((y as i64 & 0xFFFF) << 16) | (x as i64 & 0xFFFF)) as isize;
    unsafe {
        PostMessageW(Some(HWND(hwnd as *mut _)), WM_MOUSEWHEEL, WPARAM(wparam), LPARAM(lparam))
            .is_ok()
    }
}

/// 向下滚一格（WHEEL_DELTA=120）：负 delta = 内容向上走，露出下方新内容。
/// SendInput 注入的是真实系统级输入，浏览器/编辑器/资源管理器通吃
#[cfg(windows)]
fn wheel_down() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_MOUSE, MOUSEEVENTF_WHEEL, MOUSEINPUT, SendInput,
    };
    let mut inp = INPUT { r#type: INPUT_MOUSE, ..Default::default() };
    inp.Anonymous.mi = MOUSEINPUT {
        dx: 0,
        dy: 0,
        mouseData: (-120i32) as u32,
        dwFlags: MOUSEEVENTF_WHEEL,
        time: 0,
        dwExtraInfo: 0,
    };
    unsafe {
        SendInput(&[inp], std::mem::size_of::<INPUT>() as i32);
    }
}

/// 每步的目标滚动高度：速度档 × 40px，且钳到选区高度的 60%——
/// 步进超过选区会让相邻两帧失去重叠，无法对齐
fn step_target_px(fh: usize) -> f64 {
    let s = SPEED.load(Ordering::Relaxed).clamp(SPEED_MIN, SPEED_MAX) as f64;
    (s * PX_PER_LEVEL).min(fh as f64 * 0.6)
}

/// 当前速度档对应的每步间隔：大步进给更长的停顿让动画停稳
fn step_pause_ms() -> u64 {
    let s = SPEED.load(Ordering::Relaxed).clamp(SPEED_MIN, SPEED_MAX);
    ((360 - s * 16) as u64).clamp(160, 344)
}

fn run<R: Runtime + 'static>(
    app: AppHandle<R>,
    rx: i32, ry: i32, rw: i32, rh: i32,
    mon: (i32, i32, i32, i32),
) {
    // RAII：本线程退出即释放自���那份 DXGI 采集上下文。D3D11 immediate context
    // 不可跨线程复用；ThreadId 被后续线程复用时也不能拿到上一轮的陈旧 ctx。
    struct ScrollThreadGuard;
    impl Drop for ScrollThreadGuard {
        fn drop(&mut self) {
            crate::dupl::win::release_thread();
        }
    }
    let _thread_guard = ScrollThreadGuard;

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

    // 【不碰用户的鼠标】光标在选区内走 SendInput；否则向目标窗口
    // PostMessage 虚拟滚轮（见滚动步注释）
    #[cfg(windows)]
    let mut target_hwnd: Option<isize> = window_at_region_center(rx, ry, rw, rh);

    let mut canvas: Option<Canvas> = None;
    // 上一次成功追加的新增行数：滚动步长已知（本程序自己发的滚轮），
    // 作为本次对齐落点的搜索提示，避免全画布盲搜被重复纹理骗走
    let mut last_shift: Option<usize> = None;
    // 实测单格滚轮的滚动像素数：不同应用差异大（~50~150px），
    // 用它把「每步目标高度」换算成格数；初始按常见值 100px 估
    #[cfg(windows)]
    let mut notch_px: f64 = 100.0;
    // 本步已发送、尚未被实测校准的格数
    #[cfg(windows)]
    let mut pending_notches: usize = 0;
    // 内容稳定检测：本帧与上一抓帧逐字节相同才算"滚动了且已停稳"。
    // 平滑滚动动画进行中的帧是运动的中间态，拿去对齐必然错位
    let mut last_raw: Vec<u8> = Vec::new();
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

        // 与上一抓帧不同 → 滚动/动画未停稳：记录并等下一帧
        // 【绝不自动收尾】只有用户按 结束/取消 才停
        if f.bgra != last_raw {
            last_raw = f.bgra;
            std::thread::sleep(std::time::Duration::from_millis(CAPTURE_INTERVAL_MS));
            continue;
        }

        // 画面已停稳：对齐并追加新内容，滚动开关打开时再推进一步
        let scrolling = SCROLLING.load(Ordering::SeqCst);
        let fgray: Vec<Vec<u8>> =
            (0..fh).map(|r| row_gray(&f.bgra[r * stride..], fw)).collect();

        match &mut canvas {
            None => {
                canvas = Some(Canvas::new(&f.bgra, fw, fh));
                let h = canvas.as_ref().unwrap().h as u32;
                let _ = app.emit(EVT_PROGRESS, Progress { height: h });
            }
            Some(c) => {
                if c.h < MAX_HEIGHT_PX && c.bgra.len() < MAX_BYTES {
                    // 预期落点窗口：上次新增 s 行 → 本帧顶部应落在
                    // c.h + s - fh 附近（±s/2，至少 ±16px）
                    let hint = last_shift.map(|s| {
                        let exp = c.h as isize + s as isize - fh as isize;
                        let w = ((s / 2) as isize).max(16).min(140);
                        ((exp - w).max(0) as usize, (exp + w).max(0) as usize)
                    });
                    if let Some((p, diff, frac)) = c.find_align(&fgray, fh, hint) {
                        let h_before = c.h;
                        let cw = c.w / GS;
                        // 新帧第 j 行对应画布第 p+j 行；超出画布底部的内容为新增
                        let mut j_start = h_before.saturating_sub(p);
                        if j_start < fh {
                            // 衔接行自适应：只有画布末行与新帧首行对不上
                            // （亚像素混合行）才跳一行；整像素滚动时边界行
                            // 本来就吻合，固定跳行会每步白丢一行内容
                            let mut trim = 1usize;
                            if j_start > 0
                                && row_diff(&c.gray[h_before - 1], &fgray[j_start - 1], cw) <= 8
                            {
                                trim = 0;
                            }
                            j_start += trim;
                            // 【Bresenham 亚像素 ±1 行补偿已移除】diag 实锤它是
                            // 接口错位源头：整像素滚动（diff=0）时旧逐行容差
                            // 评分让 frac 恒输出 ±0.5 伪影，err 交替触发 ±1 行
                            // 切割，每两步就在接口处错开一行。分数滚动交给
                            // trim 丢混合行处理，接口无重影；代价是总高每步
                            // 可能少 1px（肉眼无感），换来每条接口严格对齐
                            if j_start < fh {
                                c.push_from(&f.bgra, &fgray, fh, j_start);
                                last_shift = Some(c.h - h_before);
                                // 用【实际滚动高度】校准单格像素数：不同应用
                                // 一格滚的距离差异大（~50~150px）。到底/钳制
                                // 时实测会偏小，偏差超 35% 视为异常不更新，
                                // 防止到底阶段把估计值拖歪
                                if pending_notches > 0 {
                                    let measured =
                                        (c.h - h_before) as f64 / pending_notches as f64;
                                    if measured > 10.0
                                        && (measured - notch_px).abs() <= notch_px * 0.35
                                    {
                                        notch_px = notch_px * 0.7 + measured * 0.3;
                                    }
                                    pending_notches = 0;
                                }
                                crate::storage::diag_write(&format!(
                                    "[scrollshot] +{}px (p={p} diff={diff} frac={frac:.2} notch={notch_px:.0}) total={}px",
                                    c.h - h_before, c.h
                                ));
                                let _ = app.emit(EVT_PROGRESS, Progress { height: c.h as u32 });
                            }
                        }
                        // 整帧都在画布里：本步没滚出新内容，继续滚即可
                    } else {
                        // 窗口与全画布都搜不到合格落点：画面变化过大或滚距突变，
                        // 作废提示让下一帧重新全画布定位
                        last_shift = None;
                    }
                    // 对齐失败：画面变化过大（动画/弹窗），跳过该帧继续观察
                }
            }
        }

        // 【程序代滚】只有用户按下开始后才推进。速度档 = 每步目标高度
        // （档×40px，钳到选区高 60%），按实测单格像素数换算成本步格数。
        // 双路径：真实光标在选区内 → SendInput（最兼容）；光标在别处 →
        // 向选区中心下的窗口 PostMessage 虚拟滚轮，绝不占用用户的鼠标。
        // 无自动收尾：到底后页面不再变化拼接停止增长，由用户决定何时结束
        if !scrolling {
            std::thread::sleep(std::time::Duration::from_millis(CAPTURE_INTERVAL_MS));
            continue;
        }
        if STOP.load(Ordering::SeqCst) || CANCEL.load(Ordering::SeqCst) { continue; }
        #[cfg(windows)]
        {
            let n = ((step_target_px(fh) / notch_px).round() as usize).clamp(1, 8);
            let use_input = cursor_in_region(rx, ry, rw, rh);
            if !use_input && target_hwnd.is_none() {
                target_hwnd = window_at_region_center(rx, ry, rw, rh);
            }
            let mut sent = 0usize;
            for _ in 0..n {
                let ok = if use_input {
                    wheel_down();
                    true
                } else {
                    match target_hwnd {
                        Some(h) if post_wheel_to(h, rx + rw / 2, ry + rh / 2) => true,
                        // 投递失败：窗口可能已销毁，重探一次
                        _ => {
                            target_hwnd = window_at_region_center(rx, ry, rw, rh);
                            false
                        }
                    }
                };
                if ok { sent += 1; }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            pending_notches = if sent > 0 { sent } else { 0 };
        }
        std::thread::sleep(std::time::Duration::from_millis(step_pause_ms()));
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
    // 进入长截图先待命不滚：等用户按 空格/「开始」才开始自动滚动
    SCROLLING.store(false, Ordering::SeqCst);

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

/// 设置自动滚动速度档位（1..=10），进度条滑杆实时调用，滚动线程每步读取
#[tauri::command]
pub fn scrollshot_set_speed(speed: u32) -> Result<(), String> {
    SPEED.store(speed.clamp(SPEED_MIN, SPEED_MAX), Ordering::Relaxed);
    Ok(())
}

/// 开始自动滚动（进度条「开始」按钮 / 空格键）
#[tauri::command]
pub fn scrollshot_start_scroll(_app: AppHandle) -> Result<(), String> {
    SCROLLING.store(true, Ordering::SeqCst);
    Ok(())
}

/// 查询当前自动滚动速度档位（进度条窗复用、每次呼出恢复显示用）
#[tauri::command]
pub fn scrollshot_get_speed() -> u32 {
    SPEED.load(Ordering::Relaxed)
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
