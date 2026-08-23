//! Screen capture (GDI BitBlt) + fullscreen overlay windows + smart window detection.

use crate::config::{ConfigState, ShotConfig};
use crate::storage::diag_write;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

/// 截图会话进行中按下全局「显示/隐藏贴图」热键：
/// RegisterHotKey/钩子会吞掉该按键（遮罩 webview 收不到 keydown），
/// 此事件把「贴图」语义转发给遮罩页执行选区输出
pub const EVT_PIN_HOTKEY: &str = "shot://pin-hotkey";

pub const OVERLAY_PREFIX: &str = "shot-overlay";
static SHOOTING: AtomicBool = AtomicBool::new(false);
/// 本次会话是否为屏幕取色模式：复用遮罩窗与冻结帧，但前端只渲染
/// 十字线+颜色面板（无压暗遮罩/选区/工具条），Esc/单击复制后收场
static PICKER: AtomicBool = AtomicBool::new(false);

/// 截图会话是否进行中（遮罩已打开/正在准备）。
/// 全局快捷键 handler 据此判断：截图模式中 F8 语义是「贴图」而非「显示/隐藏贴图」，
/// 避免与遮罩前端 F8 贴图冲突（RegisterHotKey 全局触发与遮罩 WebView 焦点并存）。
pub fn shooting() -> bool {
    SHOOTING.load(Ordering::SeqCst)
}
static LAST_REGION: Mutex<Option<[i32; 4]>> = Mutex::new(None);
/// 本次截图光标所在显示器索引（shot_ready 时只给这台遮罩焦点）
static CURSOR_MON: AtomicUsize = AtomicUsize::new(0);
/// 本次会话是否已有任一遮罩页就绪（区分"前端死了"和"用户已正常结束"）
static OVERLAY_READY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShotMonitorGeom {
    pub index: usize,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone)]
pub struct MonitorShot {
    pub geom: ShotMonitorGeom,
    /// 原始 BGRA 像素（GetDIBits 原样输出，不做通道交换）。
    /// 经自定义协议按 BMP 提供给前端（WebView2 原生流式解码），
    /// 绕开 IPC 的 base64/JSON 序列化瓶颈——33MB 一帧走 postMessage
    /// 要数百毫秒，这是"呼出延迟"的最大头。
    pub bgra: std::sync::Arc<Vec<u8>>,
}

#[derive(Default)]
pub struct ShotState {
    pub shots: Mutex<Vec<MonitorShot>>,
    /// 呼出瞬间桌面顶层窗口 Z 序快照（从顶到底，全局物理坐标）。
    /// 悬停智能识别直接查这份表——活调 WindowFromPoint 只会命中盖在最上面的
    /// 遮罩自己，这是"智能框选时灵时不灵"的根因。
    /// hwnd 供元素级识别（UIA）用：ElementFromHandle 直达目标窗口的元素树，
    /// 绕开遮罩（ElementFromPoint 同样只会命中遮罩自己）
    pub candidates: Mutex<Vec<SnapWin>>,
    /// 呼出瞬间光标下窗口矩形（全局物理坐标）。
    /// 在 Rust 端截图瞬间就做好智能识别，前端拿到 geometry 即可高亮，
    /// 无需等整屏 RGBA 传完——这是"立马智能识别"的关键。
    pub initial_snap: Mutex<Option<ShotRect>>,
    /// 记忆的上次选区（全局物理坐标；仅当智能识别未命中时作为预填）
    pub prefill: Mutex<Option<[i32; 4]>>,
}

/// Z 序快照条目：窗口视觉矩形 + 顶层 HWND（元素级识别用）
#[derive(Debug, Clone)]
pub struct SnapWin {
    pub rect: ShotRect,
    pub hwnd: isize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShotRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn hwnd_of_webview<R: Runtime>(w: &WebviewWindow<R>) -> Option<windows::Win32::Foundation::HWND> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    if let Ok(h) = w.window_handle() {
        if let RawWindowHandle::Win32(h) = h.as_raw() {
            return Some(windows::Win32::Foundation::HWND(h.hwnd.get() as *mut _));
        }
    }
    None
}

pub fn overlay_index(label: &str) -> Option<usize> {
    label.strip_prefix(OVERLAY_PREFIX)?.strip_prefix('-')?.parse().ok()
}

#[allow(dead_code)]
pub fn is_overlay_label(label: &str) -> bool {
    label.starts_with(OVERLAY_PREFIX)
}

/// 结束本次截图：遮罩窗【隐藏】而非销毁——WebView2 页面保持加载状态，
/// 下次呼出直接换图显示，省掉重建窗口 + 加载整个前端应用的开销
/// （每次数百毫秒起步，是"截图慢"的最大头）。窗口销毁仅发生在显示器数量变化时。
/// pin.rs 的贴图就绪时序也依赖它（先显贴图再收遮罩），故 pub(crate)。
pub(crate) fn hide_all<R: Runtime>(app: &AppHandle<R>) {
    SHOOTING.store(false, Ordering::SeqCst);
    PICKER.store(false, Ordering::SeqCst);
    // 拖拽进行中被收场（Esc/输出/贴图）：停更线程 + 还原冻结层原帧，
    // 避免下一会话亮窗瞬间残留上一场拖拽的压暗/边框
    drag_stop(app);
    let labels: Vec<String> = app.webview_windows().keys()
        .filter(|k| k.starts_with(OVERLAY_PREFIX))
        .cloned().collect();
    for l in labels {
        if let Some(w) = app.get_webview_window(&l) { let _ = w.hide(); }
    }
}

#[cfg(windows)]
pub(crate) fn disable_show_animation(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    let on: i32 = 1;
    unsafe {
        // 禁掉 DWM 的窗口开合过渡动画：截图遮罩要"凭空出现"，任何淡入/滑入
        // 都会让冻结画面与真实屏幕之间产生可感知的不连贯
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &on as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
    }
}

// ---------- capture ----------

fn capture_all<R: Runtime>(app: &AppHandle<R>, capture_cursor: bool) -> Result<Vec<MonitorShot>, String> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDC, GetDIBits, ReleaseDC, SelectObject,
        BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, SRCCOPY,
    };

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() { return Err("no monitors".into()); }

    let screen_dc = unsafe { GetDC(None) };
    if screen_dc.0.is_null() { return Err("GetDC failed".into()); }

    let mut results = Vec::with_capacity(monitors.len());

    for (i, monitor) in monitors.iter().enumerate() {
        let pos = monitor.position();
        let sz = monitor.size();
        let mw = sz.width as i32;
        let mh = sz.height as i32;
        if mw <= 0 || mh <= 0 { continue; }

        let mem_dc = unsafe { CreateCompatibleDC(Some(screen_dc)) };
        if mem_dc.0.is_null() {
            unsafe { ReleaseDC(None, screen_dc); }
            return Err(format!("CreateCompatibleDC failed monitor {i}"));
        }
        let hbmp = unsafe { CreateCompatibleBitmap(screen_dc, mw, mh) };
        let old = unsafe { SelectObject(mem_dc, hbmp.into()) };

        let rop = windows::Win32::Graphics::Gdi::ROP_CODE(SRCCOPY.0 | 0x4000_0000);
        if unsafe { BitBlt(mem_dc, 0, 0, mw, mh, Some(screen_dc), pos.x, pos.y, rop) }.is_err() {
            unsafe { SelectObject(mem_dc, old); let _ = DeleteObject(hbmp.into()); let _ = DeleteDC(mem_dc); let _ = ReleaseDC(None, screen_dc); }
            return Err(format!("BitBlt failed monitor {i}"));
        }

        // optional cursor
        if capture_cursor {
            draw_cursor(mem_dc, *pos);
        }

        // read pixels
        let mut bmi: BITMAPINFO = unsafe { std::mem::zeroed() };
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = mw;
        bmi.bmiHeader.biHeight = -mh;
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = 0; // BI_RGB

        let mut pixels = vec![0u8; (mw * mh * 4) as usize];
        let ok = unsafe {
            GetDIBits(mem_dc, hbmp, 0, mh as u32, Some(pixels.as_mut_ptr() as _), &mut bmi, DIB_RGB_COLORS)
        };
        unsafe { SelectObject(mem_dc, old); let _ = DeleteObject(hbmp.into()); let _ = DeleteDC(mem_dc); }
        if ok == 0 { unsafe { ReleaseDC(None, screen_dc); } return Err(format!("GetDIBits failed monitor {i}")); }

        // BGRA 原样保留：BMP 格式天然就是 BGRA，无需逐字节换通道

        results.push(MonitorShot {
            geom: ShotMonitorGeom { index: i, x: pos.x, y: pos.y, width: sz.width, height: sz.height },
            bgra: std::sync::Arc::new(pixels),
        });
    }
    unsafe { ReleaseDC(None, screen_dc); }
    Ok(results)
}

#[cfg(windows)]
fn draw_cursor(mem_dc: windows::Win32::Graphics::Gdi::HDC, mon_pos: tauri::PhysicalPosition<i32>) {
    use windows::Win32::Graphics::Gdi::DeleteObject;
    use windows::Win32::UI::WindowsAndMessaging::{DrawIconEx, GetCursorInfo, GetIconInfo, HICON, CURSORINFO, ICONINFO};

    let mut ci: CURSORINFO = unsafe { std::mem::zeroed() };
    ci.cbSize = std::mem::size_of::<CURSORINFO>() as u32;
    if unsafe { GetCursorInfo(&mut ci) }.is_err() { return; }
    if (ci.flags.0 & 0x1) == 0 { return; } // not showing

    let mut ii: ICONINFO = unsafe { std::mem::zeroed() };
    if unsafe { GetIconInfo(HICON(ci.hCursor.0), &mut ii) }.is_err() { return; }
    if ii.fIcon.as_bool() {
        unsafe { let _ = DeleteObject(ii.hbmMask.into()); let _ = DeleteObject(ii.hbmColor.into()); }
        return;
    }
    let cx = ci.ptScreenPos.x - mon_pos.x - ii.xHotspot as i32;
    let cy = ci.ptScreenPos.y - mon_pos.y - ii.yHotspot as i32;
    let _ = unsafe {
        DrawIconEx(mem_dc, cx, cy, HICON(ci.hCursor.0), 0, 0, 0, None,
            windows::Win32::UI::WindowsAndMessaging::DI_NORMAL)
    };
    unsafe { let _ = DeleteObject(ii.hbmMask.into()); let _ = DeleteObject(ii.hbmColor.into()); }
}

// ---------- native freeze layer ----------
// 原生冻结层：每个遮罩窗最底层的子 HWND，直接 BitBlt 冻结帧。
// 显示路径完全绕开前端与 IPC——呼出延迟只剩「抓屏一次 memcpy + 一次 blit」，
// 逼近 Snipaste（原生窗口直贴位图）的速度。WebView 以透明背景盖在其上，
// 仅绘制压暗遮罩/选区/工具栏等 UI。

#[cfg(windows)]
struct FreezeLayer {
    child: windows::Win32::Foundation::HWND,
    memdc: windows::Win32::Graphics::Gdi::HDC,
    hbmp: windows::Win32::Graphics::Gdi::HBITMAP,
    /// DIB 内存指针（BGRA，top-down）
    bits: *mut u8,
    w: i32,
    h: i32,
    /// 已写入有效帧
    ready: bool,
}
// GDI 对象仅主线程触达；ready 位由 shot_ready 的异步命令线程只读
#[cfg(windows)]
unsafe impl Send for FreezeLayer {}

#[cfg(windows)]
static FREEZES: std::sync::LazyLock<Mutex<std::collections::HashMap<usize, FreezeLayer>>> =
    std::sync::LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

#[cfg(windows)]
fn ensure_freeze_class() {
    use windows::core::w;
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{RegisterClassW, WNDCLASSW};
    static DONE: AtomicBool = AtomicBool::new(false);
    if DONE.swap(true, Ordering::SeqCst) { return; }
    unsafe {
        let hinstance = GetModuleHandleW(None)
            .map(|m| HINSTANCE(m.0))
            .unwrap_or_default();
        let wc = WNDCLASSW {
            lpfnWndProc: Some(freeze_wndproc),
            hInstance: hinstance,
            lpszClassName: w!("XiaoxinShotFreeze"),
            ..Default::default()
        };
        RegisterClassW(&wc);
    }
}

#[cfg(windows)]
unsafe extern "system" fn freeze_wndproc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wp: windows::Win32::Foundation::WPARAM,
    lp: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::Graphics::Gdi::{BeginPaint, BitBlt, EndPaint, PAINTSTRUCT, BLACKNESS, SRCCOPY};
    use windows::Win32::UI::WindowsAndMessaging::{DefWindowProcW, WM_ERASEBKGND, WM_PAINT};
    if msg == WM_ERASEBKGND { return LRESULT(1); } // 全帧自绘，禁掉背景擦除防闪烁
    if msg == WM_PAINT {
        let mut ps = PAINTSTRUCT::default();
        let hdc = BeginPaint(hwnd, &mut ps);
        // 与原生拖拽层的 DIB 直写互斥（锁序：先 BITS 后 FREEZES），防边框撕裂
        let _bits_guard = FREEZE_BITS_LOCK.lock().unwrap();
        // 锁内只取值，BitBlt 也在锁内完成——拖拽更新线程写一半时绝不 blit
        let frame = FREEZES.lock().unwrap().values()
            .find(|l| l.child == hwnd)
            .map(|l| (l.memdc, l.w, l.h, l.ready));
        match frame {
            Some((memdc, w, h, true)) => {
                let _ = BitBlt(hdc, 0, 0, w, h, Some(memdc), 0, 0, SRCCOPY);
            }
            other => {
                // 尚无帧：填黑兜底（预热期间窗口不可见，不会真的显示出来）
                let (w, h) = other.map(|(_, w, h, _)| (w.max(1), h.max(1))).unwrap_or((1, 1));
                let _ = BitBlt(hdc, 0, 0, w, h, None, 0, 0, BLACKNESS);
            }
        }
        let _ = EndPaint(hwnd, &ps);
        return LRESULT(0);
    }
    DefWindowProcW(hwnd, msg, wp, lp)
}

/// 确保遮罩窗内有冻结层子 HWND（复用窗口时只校正尺寸并压回最底层）
#[cfg(windows)]
fn attach_freeze_layer(idx: usize, parent: windows::Win32::Foundation::HWND, w: i32, h: i32) {
    use windows::core::w;
    use windows::Win32::Foundation::HINSTANCE;
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE,
        WINDOW_EX_STYLE, WS_CHILD, WS_VISIBLE,
    };
    ensure_freeze_class();
    let mut map = FREEZES.lock().unwrap();
    if let Some(l) = map.get_mut(&idx) {
        unsafe {
            // 分辨率可能变化；同时压回最底层，确保始终在 WebView 子窗之下
            let _ = SetWindowPos(l.child, Some(HWND_BOTTOM), 0, 0, w, h, SWP_NOMOVE | SWP_NOACTIVATE);
        }
        return;
    }
    unsafe {
        let hinstance = GetModuleHandleW(None)
            .map(|m| HINSTANCE(m.0))
            .unwrap_or_default();
        let child = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("XiaoxinShotFreeze"),
            w!(""),
            WS_CHILD | WS_VISIBLE,
            0, 0, w, h,
            Some(parent),
            None,
            Some(hinstance),
            None,
        );
        let Ok(child) = child else { return; };
        let _ = SetWindowPos(child, Some(HWND_BOTTOM), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOACTIVATE);
        map.insert(idx, FreezeLayer {
            child,
            memdc: Default::default(),
            hbmp: Default::default(),
            bits: std::ptr::null_mut(),
            w, h, ready: false,
        });
    }
}

/// 把一帧 BGRA 写进冻结层 DIB（尺寸变化时重建），随后触发子窗重绘
#[cfg(windows)]
fn update_freeze_frame(idx: usize, w: i32, h: i32, pixels: &[u8]) {
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, InvalidateRect,
        SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS,
    };
    let need = (w as usize) * (h as usize) * 4;
    if w <= 0 || h <= 0 || pixels.len() < need { return; }
    // 全局锁序统一为【先 BITS 后 FREEZES】（与 WM_PAINT/拖拽直写一致），防死锁
    let _bits_guard = FREEZE_BITS_LOCK.lock().unwrap();
    let child = {
        let mut map = FREEZES.lock().unwrap();
        let Some(l) = map.get_mut(&idx) else { return; };
        unsafe {
            if l.w != w || l.h != h || l.memdc.is_invalid() {
                let mut bmi: BITMAPINFO = std::mem::zeroed();
                bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
                bmi.bmiHeader.biWidth = w;
                bmi.bmiHeader.biHeight = -h; // top-down
                bmi.bmiHeader.biPlanes = 1;
                bmi.bmiHeader.biBitCount = 32;
                bmi.bmiHeader.biCompression = 0; // BI_RGB
                let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
                let Ok(hbmp) = CreateDIBSection(None, &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
                    else { return; };
                let memdc = CreateCompatibleDC(None);
                if memdc.is_invalid() { let _ = DeleteObject(hbmp.into()); return; }
                SelectObject(memdc, hbmp.into());
                if !l.memdc.is_invalid() { let _ = DeleteDC(l.memdc); }
                if !l.hbmp.is_invalid() { let _ = DeleteObject(l.hbmp.into()); }
                l.memdc = memdc;
                l.hbmp = hbmp;
                l.bits = bits.cast::<u8>();
                l.w = w;
                l.h = h;
            }
            if !l.bits.is_null() {
                // 已在 BITS 锁内：与 WM_PAINT / 拖拽直写互斥，防帧替换撕裂
                std::ptr::copy_nonoverlapping(pixels.as_ptr(), l.bits, need);
                l.ready = true;
            }
            l.child
        }
    };
    unsafe { let _ = InvalidateRect(Some(child), None, false); } // 锁外触发重绘
}

/// 该显示器的冻结层是否已就绪可显
#[cfg(windows)]
fn freeze_ready(idx: usize) -> bool {
    FREEZES.lock().unwrap().get(&idx).map(|l| l.ready).unwrap_or(false)
}

/// 原生即时亮窗：冻结帧写入后【立刻】show + 抢焦点，不等前端 shot_ready。
///
/// 为什么可以不等前端：冻结层贴出的是呼出瞬间的真实屏幕像素，与用户眼前
/// 的画面完全一致——窗口凭空出现也不会有任何可感知的跳变；压暗遮罩/选区
/// UI 由 webview 稍后淡入补上。此前必须等「事件→JS 拉几何→React 渲染→
/// 双 rAF→IPC shot_ready」整条链路走完才敢亮窗，白付几十到一百多毫秒，
/// 这正是"呼出比 Snipaste 慢一拍"的最大剩余来源（Snipaste 是纯原生直绘）。
///
/// OVERLAY_READY 已置位（webview 先就绪）时本函数是幂等的重复 show。
pub(crate) fn native_show_overlay<R: Runtime>(app: &AppHandle<R>, idx: usize) {
    if !SHOOTING.load(Ordering::SeqCst) { return; }
    if let Some(w) = app.get_webview_window(&format!("{OVERLAY_PREFIX}-{idx}")) {
        let _ = w.show();
        if idx == CURSOR_MON.load(Ordering::SeqCst) {
            let _ = w.set_focus();
            #[cfg(windows)]
            if let Some(hwnd) = hwnd_of_webview(&w) {
                crate::acrylic::force_foreground_robust(hwnd);
            }
        }
    }
}

/// 销毁全部冻结层的 GDI 资源（显示器数量变化重建前调用）
#[cfg(windows)]
fn freezes_drop_all() {
    use windows::Win32::Graphics::Gdi::{DeleteDC, DeleteObject};
    // 先停掉可能在直写 DIB 的拖拽线程，再在 BITS 锁内释放，杜绝 use-after-free
    DRAG_ACTIVE.store(false, Ordering::SeqCst);
    *DIM_CACHE.lock().unwrap() = None;
    let _bits_guard = FREEZE_BITS_LOCK.lock().unwrap();
    let mut map = FREEZES.lock().unwrap();
    for (_, l) in map.drain() {
        unsafe {
            if !l.memdc.is_invalid() { let _ = DeleteDC(l.memdc); }
            if !l.hbmp.is_invalid() { let _ = DeleteObject(l.hbmp.into()); }
        }
    }
}

#[cfg(not(windows))]
fn freezes_drop_all() {}

/// 新会话开始：把全部冻结层标记为「未就绪」。
/// 遮罩窗是复用的——上一会话的旧帧还留在冻结层 DIB 里，若不失效，
/// shot_ready 会因 ready 仍为 true 而【立即亮窗】，用户先看到上一次的
/// 截图、等新帧 blit 完才换成当前画面（"先闪旧截图再变新截图"的根因）。
/// 失效后 shot_ready 会一直等到【本会话】帧真正写入才显示窗口，
/// 且 ready=false 时 WM_PAINT 的黑帧兜底也绝不会有机会上屏（窗口未显）。
#[cfg(windows)]
fn invalidate_freezes() {
    let mut map = FREEZES.lock().unwrap();
    for (_, l) in map.iter_mut() {
        l.ready = false;
    }
}

#[cfg(not(windows))]
fn invalidate_freezes() {}

// ---------- native drag layer ----------
// 原生拖拽层：左键框选/手柄缩放期间，专用线程高频轮询 GetCursorPos，
// 把「压暗遮罩 + 选区镂空 + 主题色边框 (+ 缩放手柄)」直接写进冻结层 DIB。
//
// 为什么不画在 webview 里：WebView2 的 鼠标事件→rAF→光栅化→合成器 管线
// 天生落后真实光标 1~3 帧（60Hz 下 16~50ms），此前 SVG→canvas、去
// desynchronized、事件内直绘、rAF 合并都试过，仍达不到 Snipaste 的"零延迟
// 跟手"——Snipaste 是原生 GDI 直绘，光标移动到像素上屏只隔一次 DWM 合成。
// 现在热路径完全绕开 webview：前端仅在按下后首次移动、松手时各发一次 IPC，
// 拖动过程【零通信】，原生线程自己读光标、自己画。
//
// 绘制目标选冻结层（webview 之下）而非新建窗口：无 z 序/输入穿透问题；
// 前端激活时清空自己的选区画布保持全透明让位，松手交还时先按最终矩形
// 重画自己的层再通知原生还原，无缝衔接。

#[cfg(windows)]
#[derive(Clone)]
struct DragParams {
    mon: usize,
    /// 0=框选（anchor→光标），1=手柄缩放（hx/hy 定活动边，s* 为起始矩形）
    mode: u8,
    /// 全局物理坐标
    ax: i32,
    ay: i32,
    hx: i8,
    hy: i8,
    sx: i32,
    sy: i32,
    sw: u32,
    sh: u32,
    /// 主题强调色 RGB（前端从 CSS 变量取，保证与 UI 配色一致）
    accent: [u8; 3],
    /// 物理/CSS 像素比（150% DPI = 1.5），边框/手柄尺寸换算用
    scale: f64,
}

#[cfg(windows)]
static DRAG_ACTIVE: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static DRAG_UPDATER_RUNNING: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static DRAG_PARAMS: std::sync::LazyLock<Mutex<Option<DragParams>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));
/// 全屏 50% 压暗副本：拖拽开始时构建一次，之后逐行 memcpy 复用（纯内存带宽活）
#[cfg(windows)]
static DIM_CACHE: std::sync::LazyLock<Mutex<Option<std::sync::Arc<Vec<u8>>>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));
/// 冻结层 DIB 写入（更新线程）与 WM_PAINT BitBlt（主线程）互斥，防边框撕裂。
/// 锁序统一为【先 BITS 后 FREEZES】。
#[cfg(windows)]
static FREEZE_BITS_LOCK: std::sync::LazyLock<Mutex<()>> =
    std::sync::LazyLock::new(|| Mutex::new(()));

/// 结束原生拖拽：停更线程 + 还原冻结层为原始帧（去掉压暗/边框残留）
#[cfg(windows)]
fn drag_stop<R: Runtime>(app: &AppHandle<R>) {
    DRAG_ACTIVE.store(false, Ordering::SeqCst);
    *DRAG_PARAMS.lock().unwrap() = None;
    *DIM_CACHE.lock().unwrap() = None;
    let Some(state) = app.try_state::<ShotState>() else { return };
    let shots = state.shots.lock().unwrap();
    let _bits = FREEZE_BITS_LOCK.lock().unwrap();
    let mut map = FREEZES.lock().unwrap();
    for (idx, l) in map.iter_mut() {
        let Some(s) = shots.iter().find(|s| s.geom.index == *idx) else { continue };
        let need = (l.w as usize) * (l.h as usize) * 4;
        if l.bits.is_null() || s.bgra.len() < need || !l.ready { continue; }
        unsafe { std::ptr::copy_nonoverlapping(s.bgra.as_ptr(), l.bits, need); }
        unsafe { let _ = windows::Win32::Graphics::Gdi::InvalidateRect(Some(l.child), None, false); }
    }
}

#[cfg(not(windows))]
fn drag_stop<R: Runtime>(_: &AppHandle<R>) {}

/// 拖拽更新线程：轮询光标 → 计算矩形 → 写冻结层 DIB → 触发重绘。
/// sleep 1ms ≈ 数百 Hz，远超刷新率；单次全帧重写约 16MB memcpy 级别，
/// 相比 webview 管线的合成排队可忽略。退出条件：会话结束/参数被清。
#[cfg(windows)]
fn drag_updater<R: Runtime>(app: AppHandle<R>) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    loop {
        if !DRAG_ACTIVE.load(Ordering::SeqCst) || !SHOOTING.load(Ordering::SeqCst) { break; }
        let Some(p) = DRAG_PARAMS.lock().unwrap().clone() else { break };
        let mut pt = POINT::default();
        unsafe { if GetCursorPos(&mut pt).is_err() { break; } }
        // 光标裁剪到起始显示器内：与 webview 版语义一致（矩形不出本屏）
        let g = app.try_state::<ShotState>().and_then(|st| {
            st.shots.lock().unwrap().iter()
                .find(|s| s.geom.index == p.mon).map(|s| s.geom.clone())
        });
        let Some(g) = g else { break };
        let px = pt.x.clamp(g.x, g.x + g.width as i32 - 1);
        let py = pt.y.clamp(g.y, g.y + g.height as i32 - 1);
        // 由模式计算全局矩形；缩放模式的固定锚点取对边/对角
        let (fx, fy) = if p.mode == 1 {
            let fx = match p.hx { -1 => p.sx + p.sw as i32, 1 => p.sx, _ => p.sx + p.sw as i32 / 2 };
            let fy = match p.hy { -1 => p.sy + p.sh as i32, 1 => p.sy, _ => p.sy + p.sh as i32 / 2 };
            (fx, fy)
        } else {
            (p.ax, p.ay)
        };
        let gx = fx.min(px);
        let gy = fy.min(py);
        let gr: [i32; 4] = [gx, gy, (px - gx).max(0), (py - gy).max(0)];
        // 全局 → 本显示器局部物理坐标
        let lr: [i32; 4] = [gr[0] - g.x, gr[1] - g.y, gr[2].max(0), gr[3].max(0)];
        let Some(pristine) = shot_frame_of(&app, p.mon) else { break };
        paint_drag_frame(p.mon, lr, &p, &pristine);
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
    DRAG_UPDATER_RUNNING.store(false, Ordering::SeqCst);
}

/// 会话中该显示器的原始帧像素（BGRA）
#[cfg(windows)]
fn shot_frame_of<R: Runtime>(app: &AppHandle<R>, idx: usize) -> Option<std::sync::Arc<Vec<u8>>> {
    let state = app.try_state::<ShotState>()?;
    let shots = state.shots.lock().unwrap();
    shots.iter().find(|s| s.geom.index == idx).map(|s| s.bgra.clone())
}

/// 把「压暗 + 镂空 + 边框 (+手柄)」写进指定显示器的冻结层 DIB
#[cfg(windows)]
fn paint_drag_frame(idx: usize, r: [i32; 4], p: &DragParams, pristine: &[u8]) {
    // 压暗缓存：首帧构建（每字节 >>1 即 50% 变暗），此后只读复用
    let dim: std::sync::Arc<Vec<u8>> = {
        let mut cache = DIM_CACHE.lock().unwrap();
        if cache.is_none() {
            let mut v = pristine.to_vec();
            for b in v.iter_mut() { *b >>= 1; }
            *cache = Some(std::sync::Arc::new(v));
        }
        match cache.as_ref() { Some(d) => d.clone(), None => return }
    };

    let target = {
        let _bits = FREEZE_BITS_LOCK.lock().unwrap();
        let map = FREEZES.lock().unwrap();
        let Some(l) = map.get(&idx) else { return };
        if l.bits.is_null() || !l.ready || l.w <= 0 || l.h <= 0 { return; }
        unsafe { composite_drag(l.bits, l.w, l.h, pristine, &dim, r, p); }
        l.child
    };
    unsafe { let _ = windows::Win32::Graphics::Gdi::InvalidateRect(Some(target), None, false); }
}

/// 直接往 DIB 位图写「压暗 + 选区镂空 + 边框 (+缩放手柄)」。
/// 行外/两侧 memcpy 自预构建的压暗副本，镂空行中央 memcpy 自原始帧——
/// 全程零逐像素混合运算（50% 压暗已在缓存里做好），单帧成本≈几次大 memcpy。
///
/// # Safety
/// `bits` 必须指向 ≥ w*h*4 字节的可写 DIB 内存；调用方需持有 FREEZE_BITS_LOCK。
#[cfg(windows)]
unsafe fn composite_drag(
    bits: *mut u8, w: i32, h: i32,
    pristine: &[u8], dim: &[u8],
    r: [i32; 4], p: &DragParams,
) {
    if w <= 0 || h <= 0 || pristine.len() < (w as usize) * (h as usize) * 4 { return; }
    let stride = (w as usize) * 4;
    let bt = ((1.5f64 * p.scale).round() as i32).max(2).min(6); // 边框厚（物理px）
    let hs = ((8f64 * p.scale).round() as i32).max(8);          // 手柄边长
    let x0 = r[0].clamp(0, w);
    let y0 = r[1].clamp(0, h);
    let x1 = (r[0] + r[2] as i32).clamp(0, w);
    let y1 = (r[1] + r[3] as i32).clamp(0, h);
    if x1 - x0 < 2 || y1 - y0 < 2 { return; }
    let [ar, ag, ab] = p.accent;
    let border_px: [u8; 4] = [ab, ag, ar, 0xFF]; // DIB 字节序 BGRA
    let handle_px: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];

    let copy_row = |row: *mut u8, src: &[u8], xa: i32, xb: i32| {
        let len = ((xb - xa).max(0) as usize) * 4;
        if len > 0 {
            std::ptr::copy_nonoverlapping(src.as_ptr().add(xa as usize * 4), row.add(xa as usize * 4), len);
        }
    };
    let fill_span = |row: *mut u8, xa: i32, xb: i32, px: [u8; 4]| {
        for x in xa.max(0)..xb.min(w) {
            let o = row.add(x as usize * 4);
            *o = px[0]; *o.add(1) = px[1]; *o.add(2) = px[2]; *o.add(3) = px[3];
        }
    };

    // 缩放模式画手柄（框选阶段与 webview 行为一致：只有边框没有手柄）
    let mut handles: Vec<[i32; 4]> = Vec::with_capacity(8);
    if p.mode == 1 {
        let hw = hs;
        for hy in [r[1], r[1] + r[3] as i32 / 2, r[1] + r[3] as i32] {
            for hx in [r[0], r[0] + r[2] as i32 / 2, r[0] + r[2] as i32] {
                handles.push([hx - hw / 2, hy - hw / 2, hx - hw / 2 + hw, hy - hw / 2 + hw]);
            }
        }
    }

    for y in 0..h {
        let row = bits.add(y as usize * stride);
        if y < y0 || y >= y1 {
            copy_row(row, dim, 0, w); // 选区行之外：整行压暗
            continue;
        }
        copy_row(row, dim, 0, x0);       // 左侧压暗
        copy_row(row, pristine, x0, x1); // 选区内：透出原亮度
        copy_row(row, dim, x1, w);       // 右侧压暗
        // 边框：上下边缘整段 + 中间行两侧竖条（内描边）
        if y < (y0 + bt).min(y1) || y >= (y1 - bt).max(y0) {
            fill_span(row, x0, x1, border_px);
        } else {
            fill_span(row, x0, x0 + bt, border_px);
            fill_span(row, x1 - bt, x1, border_px);
        }
        // 手柄：accent 底 + 白芯（覆盖在边框之上）
        for hr in &handles {
            if y >= hr[1] && y < hr[3] {
                fill_span(row, hr[0], hr[2], border_px);
                fill_span(row, hr[0] + 1, hr[2] - 1, handle_px);
            }
        }
    }
}

// ---------- overlay creation ----------

fn create_overlays<R: Runtime>(app: &AppHandle<R>, geoms: &[ShotMonitorGeom]) {
    let url = match app.config().build.dev_url.clone() {
        Some(u) => WebviewUrl::External(u),
        None => WebviewUrl::App("index.html".into()),
    };
    for g in geoms {
        let idx = g.index;
        let label = format!("{OVERLAY_PREFIX}-{idx}");
        let (x, y, w, h) = (g.x, g.y, g.width, g.height);
        let url2 = url.clone();
        let app2 = app.clone();
        crate::defer_to_main_loop(app.clone(), move || {
            // 保持隐藏：等前端画好遮罩/高亮后调 shot_ready 才显示。
            // 冻结画面由原生冻结层（子 HWND）直接贴出，webview 仅需透明背景+遮罩 UI
            if let Ok(win) = WebviewWindowBuilder::new(&app2, &label, url2)
                .title("screenshot").decorations(false).transparent(true)
                .always_on_top(true).skip_taskbar(true).resizable(false)
                .shadow(false).visible(false).focused(false).build()
            {
                let _ = win.set_position(PhysicalPosition::new(x, y));
                let _ = win.set_size(PhysicalSize::new(w, h));
                #[cfg(windows)]
                if let Some(parent) = hwnd_of_webview(&win) {
                    attach_freeze_layer(idx, parent, w as i32, h as i32);
                    disable_show_animation(parent);
                    // 自愈兜底：若 begin_impl 的统一写帧闭包先于本建窗在主循环执行
                    // （两批闭包乱序的极小概率），此处直接从会话状态补写本屏冻结帧，
                    // 确保新建窗的冻结层必有帧可显，绝不带黑帧亮窗。
                    // 预热路径（非会话）写入的是上一会话旧帧：窗口隐藏不可见，
                    // 且下次 begin 会先 invalidate_freezes 再写新帧，无副作用
                    if let Some(state) = app2.try_state::<ShotState>() {
                        let shots = state.shots.lock().unwrap();
                        if let Some(s) = shots.iter().find(|s| s.geom.index == idx) {
                            update_freeze_frame(idx, w as i32, h as i32, &s.bgra);
                        }
                    }
                    // 会话进行中的补写路径同样原生即时亮窗（与统一写帧闭包同速）；
                    // 预热建窗时 SHOOTING=false，native_show_overlay 直接入空
                    native_show_overlay(&app2, idx);
                }
                // 兜底：仅当本会话前端从未就绪（页面加载失败等）时超时强制显示。
                // 不能只看 is_visible——用户可能在 3 秒内已正常完成截图（窗口被隐藏），
                // 此时绝不能把遮罩窗重新弹出来；预热建窗时 SHOOTING=false 同理不弹
                let idx2 = idx;
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(3000));
                    if SHOOTING.load(Ordering::SeqCst) && !OVERLAY_READY.load(Ordering::SeqCst) {
                        match win.is_visible() {
                            Ok(false) => {
                                let _ = win.show();
                                if idx2 == CURSOR_MON.load(Ordering::SeqCst) { let _ = win.set_focus(); }
                            }
                            _ => {}
                        }
                    }
                });
            }
        });
    }
}

/// 呼出截图时准备遮罩窗：
/// - 已有同数量遮罩窗（预热/上次隐藏复用的）→ 只更新位置尺寸 + 推送刷新事件，
///   页面 JS 保持热身状态，呼出接近零启动开销；
/// - 数量对不上（显示器热插拔）→ 销毁重建。
fn ensure_overlays<R: Runtime>(app: &AppHandle<R>, shots: &[MonitorShot]) {
    let existing: Vec<WebviewWindow<R>> = app.webview_windows().into_iter()
        .filter(|(l, _)| l.starts_with(OVERLAY_PREFIX))
        .map(|(_, w)| w).collect();
    if existing.len() != shots.len() {
        // 旧窗口连同其冻结层一起销毁（GDI 资源须在主线程释放）
        {
            let app2 = app.clone();
            crate::defer_to_main_loop(app.clone(), move || { freezes_drop_all(); });
            let _ = app2;
        }
        for w in existing { let _ = w.close(); }
        let geoms: Vec<ShotMonitorGeom> = shots.iter().map(|s| s.geom.clone()).collect();
        create_overlays(app, &geoms);
        return;
    }
    for shot in shots {
        let label = format!("{OVERLAY_PREFIX}-{}", shot.geom.index);
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.set_position(PhysicalPosition::new(shot.geom.x, shot.geom.y));
            let _ = w.set_size(PhysicalSize::new(shot.geom.width, shot.geom.height));
            // 通知已加载的页面重新拉取本屏数据（新窗口收不到也没关系，走挂载拉取）
            let _ = w.emit("shot-refresh", ());
        }
    }
}

/// 启动后预热：为每台显示器提前把隐藏遮罩窗建好（WebView 页面加载完毕、
/// JS 就绪待命）。没有这一步，首次呼出要付 WebView2 创建 + 前端应用加载
/// 的数百毫秒；预热后首次呼出即走"复用+换帧"快路径。
pub fn prewarm_overlays<R: Runtime>(app: &AppHandle<R>) {
    if SHOOTING.load(Ordering::SeqCst) { return; }
    let existing = app.webview_windows().keys()
        .filter(|k| k.starts_with(OVERLAY_PREFIX))
        .count();
    let monitors = match app.available_monitors() { Ok(m) => m, Err(_) => return };
    if existing == monitors.len() || monitors.is_empty() { return; }
    let geoms: Vec<ShotMonitorGeom> = monitors.iter().enumerate()
        .map(|(i, m)| ShotMonitorGeom {
            index: i, x: m.position().x, y: m.position().y,
            width: m.size().width, height: m.size().height,
        })
        .collect();
    create_overlays(app, &geoms);
    diag_write("[shot] prewarmed overlay windows");
}

// ---------- smart detection ----------

/// 悬停/初始识别：在窗口 Z 序快照里找包含该全局坐标的最顶层窗口
fn candidate_at(cands: &[SnapWin], gx: i32, gy: i32) -> Option<ShotRect> {
    cands.iter()
        .find(|w| gx >= w.rect.x && gx < w.rect.x + w.rect.width as i32 && gy >= w.rect.y && gy < w.rect.y + w.rect.height as i32)
        .map(|w| w.rect.clone())
}

#[cfg(windows)]
struct SnapCtx {
    own_roots: Vec<isize>,
    out: Vec<SnapWin>,
}

#[cfg(windows)]
unsafe extern "system" fn snap_enum_proc(
    hwnd: windows::Win32::Foundation::HWND,
    lp: windows::Win32::Foundation::LPARAM,
) -> windows::core::BOOL {
    use windows::core::BOOL;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetWindowRect, IsIconic, IsWindowVisible, GA_ROOT};

    let ctx = &mut *(lp.0 as *mut SnapCtx);
    // 只要可见、未最小化的顶层窗口（EnumWindows 本就按 Z 序从顶到底枚举）
    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() { return BOOL(1); }
    let root = GetAncestor(hwnd, GA_ROOT);
    if ctx.own_roots.contains(&(root.0 as isize)) { return BOOL(1); }
    // UWP 挂起/不在当前虚拟桌面的窗口被 cloak，视觉上不存在，跳过
    let mut cloaked: u32 = 0;
    if DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut _ as *mut _, std::mem::size_of::<u32>() as u32).is_ok() && cloaked != 0 {
        return BOOL(1);
    }
    // DWM 扩展边框不含不可见阴影余量，比 GetWindowRect 更贴近视觉边界
    let mut rect: RECT = std::mem::zeroed();
    if DwmGetWindowAttribute(root, DWMWA_EXTENDED_FRAME_BOUNDS, &mut rect as *mut _ as *mut _, std::mem::size_of::<RECT>() as u32).is_err() {
        if GetWindowRect(root, &mut rect).is_err() { return BOOL(1); }
    }
    let w = rect.right - rect.left;
    let h = rect.bottom - rect.top;
    if w >= 16 && h >= 16 {
        ctx.out.push(SnapWin { rect: ShotRect { x: rect.left, y: rect.top, width: w as u32, height: h as u32 }, hwnd: root.0 as isize });
    }
    BOOL(1)
}

/// 呼出瞬间对桌面可见顶层窗口做一次 Z 序快照（从最顶层到最底层）。
///
/// 为什么不用 WindowFromPoint 做悬停识别：遮罩窗是置顶且接收鼠标输入的窗口，
/// 截图期间光标下的"最顶层窗口"永远是遮罩自己——活调 WindowFromPoint 必然
/// 命中遮罩、被排除后返回空。之前只在遮罩建好前的那一瞬间能识别成功，
/// 表现即"时灵时不灵"。改为呼出瞬间枚举一次列表，悬停时纯查表：
/// 稳定、确定、零系统调用开销。代价是会话期间新弹出的窗口不参与识别。
#[cfg(windows)]
fn snapshot_windows<R: Runtime>(app: &AppHandle<R>) -> Vec<SnapWin> {
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::UI::WindowsAndMessaging::EnumWindows;

    let own_roots: Vec<isize> = app.webview_windows().values()
        .filter_map(|w| hwnd_of_webview(w))
        .map(|h| h.0 as isize)
        .collect();
    let mut ctx = SnapCtx { own_roots, out: Vec::new() };
    unsafe {
        let _ = EnumWindows(Some(snap_enum_proc), LPARAM(&mut ctx as *mut SnapCtx as isize));
    }
    ctx.out
}

#[cfg(not(windows))]
fn snapshot_windows<R: Runtime>(_: &AppHandle<R>) -> Vec<SnapWin> { Vec::new() }

// ---------- internal ----------

pub(crate) fn begin_impl<R: Runtime>(app: AppHandle<R>, picker: bool) -> Result<(), String> {
    if SHOOTING.swap(true, Ordering::SeqCst) { return Ok(()); }
    PICKER.store(picker, Ordering::SeqCst);
    let cfg: ShotConfig = app.try_state::<ConfigState>()
        .map(|s| s.0.lock().unwrap().shot.clone())
        .unwrap_or_default();
    // 取色是独立工具（有自己的快捷键）：不受「启用截图功能」开关限制
    if !cfg.enabled && !picker {
        SHOOTING.store(false, Ordering::SeqCst);
        PICKER.store(false, Ordering::SeqCst);
        return Err("disabled".into());
    }
    let delay = cfg.delay_ms;
    let capture_cursor = cfg.capture_cursor;
    // 取色模式不做智能识别/区域记忆：无选区概念，省掉窗口快照开销
    let smart_detect = cfg.smart_detect && !picker;
    let remember_region = cfg.remember_region && !picker;
    std::thread::spawn(move || {
        if delay > 0 { std::thread::sleep(std::time::Duration::from_millis(delay as u64)); }
        match capture_all(&app, capture_cursor) {
            Ok(shots) => {
                // find cursor monitor
                let cursor = app.cursor_position().unwrap_or(PhysicalPosition::new(0.0, 0.0));
                let mut cursor_mon = 0usize;
                for s in &shots {
                    let g = &s.geom;
                    if cursor.x >= g.x as f64 && cursor.x < (g.x + g.width as i32) as f64
                        && cursor.y >= g.y as f64 && cursor.y < (g.y + g.height as i32) as f64
                    { cursor_mon = g.index; break; }
                }
                CURSOR_MON.store(cursor_mon, Ordering::SeqCst);
                // 窗口 Z 序快照：此刻本会话遮罩窗还不存在，列表天然干净。
                // 初始高亮与后续悬停识别统一查这份表
                let cands = if smart_detect { snapshot_windows(&app) } else { Vec::new() };
                // 智能识别在截图瞬间完成：光标处命中的第一个（最顶层）窗口
                let snap = if smart_detect {
                    candidate_at(&cands, cursor.x as i32, cursor.y as i32)
                } else { None };
                // 记忆区域回退：仅当智能识别未命中且开关开启
                let prefill = if snap.is_none() && remember_region {
                    *LAST_REGION.lock().unwrap()
                } else { None };
                // store
                OVERLAY_READY.store(false, Ordering::SeqCst);
                // 冻结层旧帧失效：本会话帧写入前不得亮窗（防旧画面闪现）
                invalidate_freezes();
                if let Some(state) = app.try_state::<ShotState>() {
                    *state.shots.lock().unwrap() = shots.clone();
                    *state.candidates.lock().unwrap() = cands;
                    *state.initial_snap.lock().unwrap() = snap;
                    *state.prefill.lock().unwrap() = prefill;
                }
                // 先确保遮罩窗就位（复用或调度重建），随后才把帧写入冻结层——
                // 顺序绝不能反：重建路径（显示器数量变化/预热未完成）下，若写帧
                // 闭包先于新窗口创建执行，get_webview_window 落空 → 冻结层永远
                // 无帧 → shot_ready 等 300ms 超时后照样亮窗 → 整屏漆黑一整场
                ensure_overlays(&app, &shots);
                {
                    let app3 = app.clone();
                    let shots2 = shots.clone();
                    crate::defer_to_main_loop(app.clone(), move || {
                        for s in &shots2 {
                            let g = &s.geom;
                            let Some(win) = app3.get_webview_window(&format!("{OVERLAY_PREFIX}-{}", g.index)) else { continue };
                            let Some(parent) = hwnd_of_webview(&win) else { continue };
                            attach_freeze_layer(g.index, parent, g.width as i32, g.height as i32);
                            update_freeze_frame(g.index, g.width as i32, g.height as i32, &s.bgra);
                        }
                        // 原生即时亮窗：帧已贴出即显示。给前端留 ~24ms 宽限
                        // （复用窗口时它要先收到 shot-refresh 清掉上一会话的
                        // 选区/工具栏残留 DOM，再画本会话压暗层）——期间若前端
                        // 先调了 shot_ready（OVERLAY_READY 置位）则立即交还，
                        // 走的还是"前端就绪才亮"的老次序，绝不闪旧内容。
                        // 预热建窗路径 SHOOTING=false 时 native_show_overlay 直接入空。
                        std::thread::spawn(move || {
                            let deadline = std::time::Instant::now() + std::time::Duration::from_millis(24);
                            while std::time::Instant::now() < deadline {
                                if OVERLAY_READY.load(Ordering::SeqCst) { return; }
                                std::thread::sleep(std::time::Duration::from_millis(3));
                            }
                            for s in &shots2 {
                                native_show_overlay(&app3, s.geom.index);
                            }
                        });
                    });
                }
                diag_write(&format!("[shot] begin ok, {} monitors", shots.len()));
                // 看门狗：只兜底「遮罩从未就绪」的异常会话。前端就绪（OVERLAY_READY）
                // 说明遮罩正常显示、用户可交互——此后由用户 Esc/输出/取消操作收场，
                // 看门狗退出，绝不 60s 踢掉正在慢慢选区的正常截图。
                // 全屏置顶遮罩若前端挂起（页面加载失败、事件链路中断）会吞掉整个桌面
                // 的输入——表现就是"按什么键都卡死"；此时才 60s 强制收场兜底。
                {
                    let app_wd = app.clone();
                    std::thread::spawn(move || {
                        for _ in 0..120 {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            if !SHOOTING.load(Ordering::SeqCst) { return; }
                            if OVERLAY_READY.load(Ordering::SeqCst) { return; }
                        }
                        diag_write("[shot] watchdog: overlay never ready >60s, force hide");
                        SHOOTING.store(false, Ordering::SeqCst);
                        hide_all(&app_wd);
                    });
                }
            }
            Err(e) => {
                SHOOTING.store(false, Ordering::SeqCst);
                diag_write(&format!("[shot] capture failed: {e}"));
            }
        }
    });
    Ok(())
}

// ---------- commands ----------

#[tauri::command]
pub fn shot_begin(app: AppHandle) -> Result<(), String> {
    begin_impl(app, false)
}

/// 屏幕取色：复用遮罩窗进入纯取色模式（十字线 + 颜色面板，无选区）
#[tauri::command]
pub fn shot_begin_picker(app: AppHandle) -> Result<(), String> {
    begin_impl(app, true)
}

#[derive(Serialize)]
pub struct ShotGeomResp {
    #[serde(flatten)]
    pub geom: ShotMonitorGeom,
    /// 智能识别初始高亮框（本显示器局部坐标）
    pub snap: Option<ShotRect>,
    /// 上次截取区域预填（本显示器局部坐标；仅当无智能识别结果时给出）
    pub prefill: Option<ShotRect>,
    /// 本次会话是否为屏幕取色模式（前端据此渲染取色面板而非截图选区 UI）
    pub picker: bool,
}

/// 全局矩形 → 本显示器局部坐标，并裁剪到显示器范围内（不相交/过小则 None）
fn clip_to_monitor(r: &ShotRect, g: &ShotMonitorGeom) -> Option<ShotRect> {
    let lx = r.x - g.x;
    let ly = r.y - g.y;
    let x = lx.max(0);
    let y = ly.max(0);
    let w = ((r.width as i32) - (x - lx)).min(g.width as i32 - x).max(0) as u32;
    let h = ((r.height as i32) - (y - ly)).min(g.height as i32 - y).max(0) as u32;
    if x >= g.width as i32 || y >= g.height as i32 { return None; }
    if w > 4 && h > 4 { Some(ShotRect { x, y, width: w, height: h }) } else { None }
}

#[tauri::command]
pub fn shot_geometry(window: WebviewWindow) -> Result<ShotGeomResp, String> {
    let idx = overlay_index(window.label()).ok_or("not overlay")?;
    let state = window.try_state::<ShotState>().ok_or("no state")?;
    let shots = state.shots.lock().unwrap();
    let shot = shots.iter().find(|s| s.geom.index == idx).ok_or("not found")?;
    let g = shot.geom.clone();
    drop(shots);
    let snap = state.initial_snap.lock().unwrap().clone().and_then(|r| clip_to_monitor(&r, &g));
    // 记忆区域：智能识别没有命中时才作为预填选区（Snipaste 优先级：智能识别 > 记忆区域）
    let prefill = if snap.is_none() {
        state.prefill.lock().unwrap().clone().and_then(|last| {
            clip_to_monitor(&ShotRect { x: last[0], y: last[1], width: last[2] as u32, height: last[3] as u32 }, &g)
        })
    } else { None };
    Ok(ShotGeomResp { geom: g, snap, prefill, picker: PICKER.load(Ordering::SeqCst) })
}

/// 当前显示器的截屏原始 BGRA（二进制 IPC；宽高从 shot_geometry 取）。
/// 仅作自定义协议不可用时的兜底路径。
#[tauri::command]
pub fn shot_image_raw(window: WebviewWindow) -> Result<tauri::ipc::Response, String> {
    let idx = overlay_index(window.label()).ok_or("not overlay")?;
    let state = window.try_state::<ShotState>().ok_or("no state")?;
    let shots = state.shots.lock().unwrap();
    let shot = shots.iter().find(|s| s.geom.index == idx).ok_or("not found")?;
    Ok(tauri::ipc::Response::new(shot.bgra.as_ref().clone()))
}

/// 把 BGRA 像素包成 top-down 32bpp BMP（54 字节头 + 原样像素，零压缩零转换，
/// 编码成本≈一次 memcpy；Chromium 解码走 SIMD，比 PNG 快一个数量级）
fn wrap_bmp(bgra: &[u8], w: u32, h: u32) -> Vec<u8> {
    let mut v = Vec::with_capacity(54 + bgra.len());
    v.extend_from_slice(b"BM");
    v.extend_from_slice(&((54u32 + bgra.len() as u32)).to_le_bytes()); // 文件大小
    v.extend_from_slice(&0u16.to_le_bytes()); // 保留
    v.extend_from_slice(&0u16.to_le_bytes()); // 保留
    v.extend_from_slice(&54u32.to_le_bytes()); // 像素数据偏移
    v.extend_from_slice(&40u32.to_le_bytes()); // BITMAPINFOHEADER 大小
    v.extend_from_slice(&(w as i32).to_le_bytes()); // 宽
    v.extend_from_slice(&(-(h as i32)).to_le_bytes()); // 负高 = top-down
    v.extend_from_slice(&1u16.to_le_bytes()); // planes
    v.extend_from_slice(&32u16.to_le_bytes()); // bpp
    v.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB 无压缩
    v.extend_from_slice(&(bgra.len() as u32).to_le_bytes()); // 数据大小
    v.extend_from_slice(&2835u32.to_le_bytes()); // 水平 DPI
    v.extend_from_slice(&2835u32.to_le_bytes()); // 垂直 DPI
    v.extend_from_slice(&0u32.to_le_bytes()); // 调色板
    v.extend_from_slice(&0u32.to_le_bytes()); // 重要色
    v.extend_from_slice(bgra);
    v
}

// ---------- 自定义协议：帧/贴图直出 ----------
//
// 前端统一经 http://screenshot.localhost 访问（WebView2 自定义协议映射）：
// - GET /frame/{显示器索引}   当前冻结帧 → BMP 流式回传（原生解码，绕开 IPC 序列化）
// - GET /pin/{id}             贴图图片文件原字节直出（取代 base64 data URL）
//
// 【截图输出不走协议】此前试过 POST /output/* 让前端把 PNG 字节经协议上传，
// 实测 WebView2 的 WebResourceRequested 对 POST body 投递不可靠（请求到不了
// handler 时 fetch 挂起、遮罩永不隐藏 → 全屏遮罩吞掉所有点击，表现为整个
// 桌面卡死）。输出已改为 Tauri 原生二进制 IPC：invoke 直接携带 ArrayBuffer
// 原始字节 + 请求头传元数据，见下方 shot_output 命令。
type ProtoResp = tauri::http::Response<std::borrow::Cow<'static, [u8]>>;

pub fn frame_protocol<R: Runtime>(
    ctx: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
) -> Result<ProtoResp, Box<dyn std::error::Error>> {
    use tauri::Manager;
    let path = request.uri().path().to_string();

    // GET /pin/{id}：贴图图片文件直出
    if let Some(id) = path.strip_prefix("/pin/") {
        let id = id.split('?').next().unwrap_or("");
        return serve_pin_file(ctx.app_handle(), id);
    }

    // GET /frame/{idx}：当前冻结帧 BMP
    let idx: usize = path
        .strip_prefix("/frame/")
        .and_then(|s| s.split('?').next())
        .and_then(|s| s.parse().ok())
        .ok_or("bad frame path")?;
    let state = ctx.app_handle().state::<ShotState>();
    let shots = state.shots.lock().unwrap();
    let shot = shots.iter().find(|s| s.geom.index == idx).ok_or("frame not ready")?;
    let body = wrap_bmp(&shot.bgra, shot.geom.width, shot.geom.height);
    drop(shots);
    tauri::http::Response::builder()
        .header("Content-Type", "image/bmp")
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-store")
        .body(std::borrow::Cow::Owned(body))
        .map_err(Into::into)
}

fn not_found() -> Result<ProtoResp, Box<dyn std::error::Error>> {
    tauri::http::Response::builder()
        .status(404)
        .header("Access-Control-Allow-Origin", "*")
        .body(std::borrow::Cow::Borrowed(&b""[..]))
        .map_err(Into::into)
}

/// GET /pin/{id}：把贴图图片文件原字节直接回给 webview。
/// 取代旧 pin_image_data 命令（读文件→base64→JSON IPC 传数 MB 字符串→webview
/// 再解码巨型 data URL），现在由 WebView2 原生网络栈读盘直传，GIF 动画原生支持。
fn serve_pin_file<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
) -> Result<ProtoResp, Box<dyn std::error::Error>> {
    // id 白名单：uuid 仅十六进制与连字符，杜绝任何路径拼接可能
    if id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
        return not_found();
    }
    let file = {
        let Some(store) = app.try_state::<crate::pin::PinStore>() else { return not_found(); };
        let entries = store.0.lock().unwrap();
        match entries.iter().find(|p| p.id == id) {
            Some(p) => std::path::PathBuf::from(&p.file),
            None => return not_found(),
        }
    };
    let mime = if file.extension().and_then(|e| e.to_str()) == Some("gif") {
        "image/gif"
    } else {
        "image/png"
    };
    let bytes = std::fs::read(&file).map_err(|_| -> Box<dyn std::error::Error> { "pin file gone".into() })?;
    tauri::http::Response::builder()
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-store")
        .body(std::borrow::Cow::Owned(bytes))
        .map_err(Into::into)
}

/// 前端画好遮罩/高亮后调用：此刻才显示遮罩窗（冻结画面由原生层提供）。
/// 光标所在显示器额外抢焦点（保证键盘事件立即可用）。
#[tauri::command]
pub async fn shot_ready(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    OVERLAY_READY.store(true, Ordering::SeqCst);
    let idx = overlay_index(window.label()).ok_or("not overlay")?;
    // 冻结层更新闭包在主循环排队中，可能比事件晚到一拍：短暂等待就绪再亮窗。
    // 上限放宽到 500ms——高负载/多屏大 memcpy 下 300ms 可能不够，超时亮窗
    // 撞上黑帧兜底就是一次整屏黑闪
    #[cfg(windows)]
    {
        let mut waited = 0u32;
        while !freeze_ready(idx) && waited < 500 {
            std::thread::sleep(std::time::Duration::from_millis(5));
            waited += 5;
        }
    }
    if let Some(w) = app.get_webview_window(window.label()) {
        let _ = w.show();
        if idx == CURSOR_MON.load(Ordering::SeqCst) {
            let _ = w.set_focus();
            #[cfg(windows)]
            if let Some(hwnd) = hwnd_of_webview(&w) {
                crate::acrylic::force_foreground_robust(hwnd);
            }
        }
    }
    Ok(())
}

/// 全局物理坐标下的光标位置（截图启动瞬间定位初始智能高亮用）
#[tauri::command]
pub fn shot_cursor_global(app: AppHandle) -> (i32, i32) {
    let p = app.cursor_position().unwrap_or(PhysicalPosition::new(0.0, 0.0));
    (p.x as i32, p.y as i32)
}

/// 智能识别：返回全局物理坐标 (x,y) 处的窗口矩形。
/// 基于 begin 时拍的窗口 Z 序快照查表（活调 WindowFromPoint 只会命中遮罩自身）
#[tauri::command]
pub fn shot_window_rect_at(app: AppHandle, x: i32, y: i32) -> Option<ShotRect> {
    let state = app.try_state::<ShotState>()?;
    let cands = state.candidates.lock().unwrap();
    candidate_at(&cands, x, y)
}

/// 元素级智能识别（UIA）：返回全局物理坐标 (x,y) 处最合适 UI 元素的矩形。
///
/// 【为什么不能用 ElementFromPoint】遮罩窗是全屏置顶且接收鼠标输入的窗口，
/// UIA 的 ElementFromPoint 与 WindowFromPoint 一样只会命中遮罩自己——
/// 返回的"元素"是遮罩/其 WebView2 宿主，矩形≈全屏，被前端过滤后什么都选不中。
///
/// 正确路径：从呼出瞬间的 Z 序快照里查到光标下目标窗口的 HWND，
/// 用 ElementFromHandle 直达【目标窗口】的 UIA 元素树，再反复下钻到
/// 「包含该点且面积最小」的子元素——从而能框选浏览器页面里的按钮组/
/// 输入框/标签页等细粒度组件。过小（<10px，噪点）与异常返回 None，
/// 前端自动回退窗口级识别。
#[cfg(windows)]
pub fn ui_element_rect_at(app: &AppHandle, x: i32, y: i32) -> Option<ShotRect> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomationElement, TreeScope_Children};

    // 快照查表：光标下最顶层的目标窗口（含其 HWND）
    let state = app.try_state::<ShotState>()?;
    let cands = state.candidates.lock().unwrap();
    let target = cands.iter().find(|w| {
        x >= w.rect.x && x < w.rect.x + w.rect.width as i32
            && y >= w.rect.y && y < w.rect.y + w.rect.height as i32
    })?;
    let hwnd = HWND(target.hwnd as *mut _);

    // COM 线程初始化：命令跑在 tokio 线程池，各线程首次使用时初始化一次；
    // 已初始化（含模式不符）的错误直接忽略，CoCreateInstance 仍可成功
    unsafe { let _ = windows::Win32::System::Com::CoInitializeEx(
        None, windows::Win32::System::Com::COINIT_MULTITHREADED); }
    let auto: windows::Win32::UI::Accessibility::IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()? };

    let area = |r: &windows::Win32::Foundation::RECT| (r.right - r.left) * (r.bottom - r.top);
    let contains = |r: &windows::Win32::Foundation::RECT| x >= r.left && x < r.right && y >= r.top && y < r.bottom;

    // 直达目标窗口的 UIA 元素（Chromium 系浏览器会在收到 UIA 查询时
    // 自动激活无障碍树，首次查询可能略慢，属预期行为）
    let mut cur: IUIAutomationElement = unsafe { auto.ElementFromHandle(hwnd).ok()? };
    let mut cur_rect = unsafe { cur.CurrentBoundingRectangle() }.ok()?;

    // 下钻：在子元素里找包含该点且面积最小的矩形，最多 8 层；子树过大（>800，
    // 病态树）放弃下钻保响应性。UIA 调用全部失败安全——出错即返回当前结果
    if let Ok(cond) = unsafe { auto.CreateTrueCondition() } {
        for _ in 0..8 {
            let Ok(children) = (unsafe { cur.FindAll(TreeScope_Children, &cond) }) else { break };
            let Ok(n) = (unsafe { children.Length() }) else { break };
            if n == 0 || n > 800 { break; }
            let mut best: Option<(IUIAutomationElement, windows::Win32::Foundation::RECT)> = None;
            for i in 0..n {
                let Ok(c) = (unsafe { children.GetElement(i) }) else { continue };
                let Ok(r) = (unsafe { c.CurrentBoundingRectangle() }) else { continue };
                if contains(&r) {
                    match &best {
                        Some((_, br)) if area(br) <= area(&r) => {}
                        _ => best = Some((c, r)),
                    }
                }
            }
            match best {
                Some((c, r)) if area(&r) < area(&cur_rect) => {
                    cur = c; cur_rect = r;
                }
                _ => break,
            }
        }
    }

    let w = cur_rect.right - cur_rect.left;
    let h = cur_rect.bottom - cur_rect.top;
    // 过小视为命中噪点（1px 分隔线等）；与目标窗口几乎等大的结果（下钻失败，
    // 仍停留在窗口根元素）也返回 None，避免与窗口级识别重复
    if w < 10 || h < 10 { return None; }
    if w >= target.rect.width as i32 && h >= target.rect.height as i32 { return None; }
    Some(ShotRect { x: cur_rect.left, y: cur_rect.top, width: w.max(0) as u32, height: h.max(0) as u32 })
}

#[cfg(not(windows))]
pub fn ui_element_rect_at(_: &AppHandle, _x: i32, _y: i32) -> Option<ShotRect> { None }

/// 元素级识别命令：与 shot_window_rect_at 并行调用，前端择优（取更精细者）
#[tauri::command]
pub fn shot_ui_rect_at(app: AppHandle, x: i32, y: i32) -> Option<ShotRect> {
    ui_element_rect_at(&app, x, y)
}

#[tauri::command]
pub fn shot_last_region() -> Option<[i32; 4]> {
    LAST_REGION.lock().unwrap().clone()
}

/// PNG 原始字节 → 解码 RGBA → 写入剪贴板（后台线程执行，整图解码不占主线程）
fn copy_png_to_clipboard(png: &[u8]) -> Result<(), String> {
    let img = image::load_from_memory(png).map_err(|e| format!("decode: {e}"))?;
    let rgba = img.to_rgba8();
    let mut cb = arboard::Clipboard::new().map_err(|e| format!("clipboard: {e}"))?;
    cb.set_image(arboard::ImageData {
        width: rgba.width() as usize,
        height: rgba.height() as usize,
        bytes: std::borrow::Cow::Borrowed(rgba.as_raw()),
    }).map_err(|e| format!("set image: {e}"))
}

/// 截图输出（复制 / 另存为 / 贴图）：选区 PNG【原始字节】经 Tauri 原生二进制
/// 通道直传（前端 invoke 携带 ArrayBuffer，零 base64、零 JSON 序列化），
/// 元数据走请求头。async 命令运行于 tokio 线程池——重活全部不占主线程。
///
/// 头字段：
///   x-shot-action = pin | save | copy
///   x-shot-x / x-shot-y   （pin：屏幕全局物理坐标）
///   x-shot-path           （save：用户在另存为对话框选择的目标路径）
#[tauri::command]
pub async fn shot_output(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    use tauri::ipc::InvokeBody;
    let hdr = |k: &str| {
        request.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string())
    };
    let action = hdr("x-shot-action").unwrap_or_default();
    let body = match request.body() {
        InvokeBody::Raw(b) => b,
        InvokeBody::Json(_) => return Err("期望二进制请求体".into()),
    };
    match action.as_str() {
        "pin" => {
            let x: i32 = hdr("x-shot-x").and_then(|v| v.parse().ok()).unwrap_or(0);
            let y: i32 = hdr("x-shot-y").and_then(|v| v.parse().ok()).unwrap_or(0);
            let pin = crate::pin::create_store_entry(&app, &body, "image/png", x, y)?;
            // 装进预建的隐藏复用窗：图片就绪后先显贴图、再由 pin_ready 收遮罩
            // （此处绝不提前 hide_all——那会先露出裸桌面，正是"贴图闪一下"的根源）
            crate::pin::attach_to_staging(&app, pin);
        }
        "save" => {
            let dest = hdr("x-shot-path").filter(|p| !p.is_empty()).ok_or("缺少保存路径")?;
            std::fs::write(&dest, &body).map_err(|e| format!("write: {e}"))?;
            hide_all(&app);
        }
        "copy" => {
            // 整图解码成 RGBA 是重活：丢到阻塞线程池，本命令立即继续
            let png = body.clone();
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(e) = copy_png_to_clipboard(&png) {
                    diag_write(&format!("[shot] copy failed: {e}"));
                }
            });
            hide_all(&app);
        }
        _ => return Err(format!("未知输出动作 {action}")),
    }
    Ok(())
}

pub(crate) fn cancel_impl<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    hide_all(app);
    Ok(())
}

/// 遮罩窗被非命令途径（Alt+F4 等）销毁时重置"截图进行中"标志，
/// 否则之后每次 shot_begin 都会因标志未复位而静默失败。
/// 注意：遮罩窗现在是复用的（正常结束=隐藏），只有全部销毁（显示器热插拔
/// 重建、系统关机等）才算会话异常终止；部分销毁时 SHOOTING 必须保持，
/// 否则重建过程中用户再按快捷键会触发并发截图。
pub fn on_overlay_destroyed<R: Runtime>(app: &AppHandle<R>) {
    let remaining = app.webview_windows().keys()
        .filter(|k| k.starts_with(OVERLAY_PREFIX))
        .count();
    if remaining == 0 {
        SHOOTING.store(false, Ordering::SeqCst);
        PICKER.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn shot_cancel(app: AppHandle) -> Result<(), String> {
    cancel_impl(&app)
}

#[tauri::command]
pub fn shot_save_region(region: [i32; 4]) {
    *LAST_REGION.lock().unwrap() = Some(region);
}

/// 原生拖拽开始：登记参数（起始点/手柄模式/主题色/DPI 比）并拉起更新线程。
/// 只在按下后首次移动时调用一次——拖动过程零 IPC，原生线程自己轮询光标。
#[tauri::command]
pub fn shot_drag_begin(
    app: AppHandle,
    window: WebviewWindow,
    mode: u8,
    ax: i32,
    ay: i32,
    hx: i8,
    hy: i8,
    sx: i32,
    sy: i32,
    sw: u32,
    sh: u32,
    accent: Vec<u8>,
    scale: f64,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let idx = overlay_index(window.label()).ok_or("not overlay")?;
        let a = [accent.first().copied().unwrap_or(76), accent.get(1).copied().unwrap_or(141), accent.get(2).copied().unwrap_or(255)];
        *DRAG_PARAMS.lock().unwrap() = Some(DragParams {
            mon: idx, mode, ax, ay, hx, hy, sx, sy, sw, sh,
            accent: a, scale,
        });
        *DIM_CACHE.lock().unwrap() = None; // 新一场拖拽重建压暗缓存
        DRAG_ACTIVE.store(true, Ordering::SeqCst);
        if !DRAG_UPDATER_RUNNING.swap(true, Ordering::SeqCst) {
            let app2 = app.clone();
            std::thread::spawn(move || drag_updater(app2));
        }
    }
    Ok(())
}

/// 原生拖拽结束：前端已按最终矩形重画自己的层，这里停线程并还原冻结层原帧
#[tauri::command]
pub fn shot_drag_end(app: AppHandle) -> Result<(), String> {
    drag_stop(&app);
    Ok(())
}
