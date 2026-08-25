//! Screen capture (GDI BitBlt) + fullscreen overlay windows + smart window detection.

use crate::config::{ConfigState, ShotConfig};
use crate::storage::diag_write;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime,
    WebviewWindow, WebviewWindowBuilder,
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
    // UIA 元素识别缓存一并作废：会话期间缓存的命中结果可能指向已关闭的窗口
    crate::uia_pick::clear_cache();
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
    let t0 = std::time::Instant::now();

    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    if monitors.is_empty() { return Err("no monitors".into()); }

    // 首选 DXGI 桌面复制（几毫秒/屏 + 分层窗口可见）；含鼠标指针时走 GDI
    // （指针由 DrawIconEx 直接画进 GDI 位图）。DXGI 任一屏失败自动回退该屏 GDI。
    let use_dxgi = !capture_cursor;

    let screen_dc = unsafe { GetDC(None) };
    if screen_dc.0.is_null() { return Err("GetDC failed".into()); }

    let mut results: Vec<MonitorShot> = Vec::with_capacity(monitors.len());

    for (i, monitor) in monitors.iter().enumerate() {
        let pos = monitor.position();
        let sz = monitor.size();
        let mw = sz.width as i32;
        let mh = sz.height as i32;
        if mw <= 0 || mh <= 0 { continue; }

        let need = (mw as usize) * (mh as usize) * 4;
        let mut pixels: Option<Vec<u8>> = None;
        if use_dxgi {
            if let Some(f) = crate::dupl::win::capture((pos.x, pos.y), mw, mh) {
                if f.bgra.len() >= need { pixels = Some(f.bgra); }
            }
        }
        if pixels.is_none() {
            // ---- GDI 回退路径（与老实现一致）----
            let mem_dc = unsafe { CreateCompatibleDC(Some(screen_dc)) };
            if mem_dc.0.is_null() {
                unsafe { ReleaseDC(None, screen_dc); }
                return Err(format!("CreateCompatibleDC failed monitor {i}"));
            }
            let hbmp = unsafe { CreateCompatibleBitmap(screen_dc, mw, mh) };
            let old = unsafe { SelectObject(mem_dc, hbmp.into()) };

            // 纯 SRCCOPY，不带 CAPTUREBLT(0x40000000)：CAPTUREBLT 强制 GDI 走
            // 分层窗口合成路径——2560×1600 下 BitBlt 从 ~50ms 暴涨到几百毫秒
            // （"按快捷键后屏幕还动 0.5 秒才冻结"的主因），且文档明确会造成
            // 分层窗口/指针可见闪烁（托盘图标闪现）。代价：半透明分层窗口
            // （如贴图）不进入冻结帧——DXGI 路径无此问题
            let rop = SRCCOPY;
            if unsafe { BitBlt(mem_dc, 0, 0, mw, mh, Some(screen_dc), pos.x, pos.y, rop) }.is_err() {
                unsafe { SelectObject(mem_dc, old); let _ = DeleteObject(hbmp.into()); let _ = DeleteDC(mem_dc); let _ = ReleaseDC(None, screen_dc); }
                return Err(format!("BitBlt failed monitor {i}"));
            }

            if capture_cursor {
                draw_cursor(mem_dc, *pos);
            }

            let mut bmi: BITMAPINFO = unsafe { std::mem::zeroed() };
            bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
            bmi.bmiHeader.biWidth = mw;
            bmi.bmiHeader.biHeight = -mh;
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            bmi.bmiHeader.biCompression = 0; // BI_RGB

            let mut buf = vec![0u8; need];
            let ok = unsafe {
                GetDIBits(mem_dc, hbmp, 0, mh as u32, Some(buf.as_mut_ptr() as _), &mut bmi, DIB_RGB_COLORS)
            };
            unsafe { SelectObject(mem_dc, old); let _ = DeleteObject(hbmp.into()); let _ = DeleteDC(mem_dc); }
            if ok == 0 { unsafe { ReleaseDC(None, screen_dc); } return Err(format!("GetDIBits failed monitor {i}")); }
            pixels = Some(buf);
        }
        let bgra = pixels.unwrap();
        // BGRA 原样保留：BMP/DXGI 天然就是 BGRA，无需逐字节换通道

        results.push(MonitorShot {
            geom: ShotMonitorGeom { index: i, x: pos.x, y: pos.y, width: sz.width, height: sz.height },
            bgra: std::sync::Arc::new(bgra),
        });
    }
    unsafe { ReleaseDC(None, screen_dc); }
    diag_write(&format!("[shot] capture_all {} mon in {} ms", results.len(), t0.elapsed().as_millis()));
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
/// 原生拖拽层已画出第一帧（每次拖拽开始时复位）
static DRAG_FIRST_PAINT: AtomicBool = AtomicBool::new(false);
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
        // 首帧已画进冻结层：通知 webview 可以放心让位（清掉自己的选区画布）。
        // 握手消除「webview 先清屏、原生层还没画出第一帧」间隙的全亮闪屏
        if !DRAG_FIRST_PAINT.swap(true, Ordering::SeqCst) {
            let _ = app.emit("shot://drag-first-paint", ());
        }
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
        let Some(l) = map.get(&idx) else {
            diag_write(&format!("[drag] paint skip: no freeze layer mon={idx}")); return;
        };
        if l.bits.is_null() || !l.ready || l.w <= 0 || l.h <= 0 {
            diag_write("[drag] paint skip: layer not ready"); return;
        }
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
    let url = crate::frontend_url(app);
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

    let own_roots: Vec<isize> = app.webview_windows().iter()
        // 【只排除截图遮罩自己】贴图/便签/面板等本应用其他可见窗口必须参与候选：
        // 它们的像素就冻结在本会话画面里，盖住下层应用时理应选中它们——
        // 此前把本应用窗口全部排除，悬停贴图时会"穿透"选中底下被盖住的
        // 应用边框（正是"被覆盖的应用还能选到"的主因之一）
        .filter(|(l, _)| l.starts_with(OVERLAY_PREFIX))
        .filter_map(|(_, w)| hwnd_of_webview(w))
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

// ---------- 截图历史 ----------
// 每次呼出把各屏冻结帧落盘 PNG（后台线程，不阻塞会话）：
// data/shot_history/{毫秒时间戳}_{屏索引}.png（+ .thumb.png 缩略图供列表 UI）。
// 前端 < > 逐条翻页「重截」（换冻结帧重新选区，Snipaste 同款），H 打开缩略图列表。
// 条数/天数可配（ShotConfig.history_max_count / history_max_days），呼出时顺带清理。

#[derive(Debug, Clone, Serialize)]
pub struct HistItem {
    /// 文件名（不含目录）
    pub file: String,
    /// 毫秒时间戳
    pub ts: i64,
    pub width: u32,
    pub height: u32,
    /// 该帧被框选过的范围（本显示器局部物理像素 [x,y,w,h]），
    /// 存于同名 sidecar 文件（{stem}.region.json）；None=当时没确认过选区
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<Vec<i32>>,
}

fn hist_dir<R: Runtime>(app: &AppHandle<R>) -> Option<std::path::PathBuf> {
    let dir = app.try_state::<crate::storage::AppPaths>()
        .map(|p| p.data_dir.join("shot_history"))?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir)
}

/// 解析文件名 "{millis}_{mon}.png" → (millis, mon)
fn parse_hist_name(name: &str) -> Option<(i64, usize)> {
    let stem = name.strip_suffix(".png")?;
    let (ts, mon) = stem.split_once('_')?;
    Some((ts.parse().ok()?, mon.parse().ok()?))
}

/// 列出【指定显示器】的历史档（新→旧）。
/// want: 只留与当前冻结帧同分辨率的条目（分辨率变了的历史无法整屏替换）
fn hist_list(dir: &std::path::Path, mon: usize, want: Option<(u32, u32)>) -> Vec<HistItem> {
    let mut items: Vec<HistItem> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            // 缩略图与别的显示器的档都不进本屏列表（跨屏翻页会张冠李戴）
            if !name.ends_with(".png") || name.contains(".thumb.") { continue; }
            let Some((ts, m)) = parse_hist_name(&name) else { continue };
            if m != mon { continue; }
            let (w, h) = match image::image_dimensions(e.path()) {
                Ok(d) => d,
                Err(_) => continue,
            };
            if let Some((ww, hh)) = want {
                if w != ww || h != hh { continue; }
            }
            // 读选区 sidecar（有则随条目返回，跳回该帧时还原"当时的选区"）
            let stem = name.trim_end_matches(".png");
            let region = std::fs::read_to_string(dir.join(format!("{stem}.region.json")))
                .ok()
                .and_then(|s| serde_json::from_str::<Vec<i32>>(&s).ok())
                .filter(|r| r.len() == 4);
            items.push(HistItem { file: name, ts, width: w, height: h, region });
        }
    }
    items.sort_by(|a, b| b.ts.cmp(&a.ts));
    items
}

/// 清理超期/超额旧档（组前缀 = 毫秒时间戳，帧 png 与选区 sidecar 同组同生共死）
fn hist_cleanup(dir: &std::path::Path, max_count: usize, max_days: i64) {
    let mut groups: std::collections::HashMap<i64, Vec<std::path::PathBuf>> = std::collections::HashMap::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if let Some((ts_str, _)) = name.split_once('_') {
                if let Ok(ts) = ts_str.parse::<i64>() {
                    groups.entry(ts).or_default().push(e.path());
                }
            }
        }
    }
    let mut kept: Vec<(i64, Vec<std::path::PathBuf>)> = groups.into_iter().collect();
    kept.sort_by_key(|(ts, _)| *ts);
    let cutoff = chrono::Utc::now().timestamp_millis() - max_days * 24 * 3600 * 1000;
    kept.retain(|(ts, files)| {
        if *ts < cutoff {
            for f in files { let _ = std::fs::remove_file(f); }
            false
        } else { true }
    });
    while kept.len() >= max_count {
        let (_, files) = kept.remove(0);
        for f in files { let _ = std::fs::remove_file(f); }
    }
}

/// 本次会话已提交历史档的时间戳（首次输出时生成）：同一场截图多次输出
/// （先复制再贴图）只建一个档，选区随每次输出刷新到该档的 sidecar
static HIST_COMMIT_TS: Mutex<Option<i64>> = Mutex::new(None);
/// 实时画面上确认的选区（显示器局部物理像素 [x,y,w,h]）：
/// 呼出时文件还不存在，先暂存内存，输出提交时一并写入 sidecar
static HIST_PENDING_REGION: Mutex<Option<(usize, Vec<i32>)>> = Mutex::new(None);
/// 历史条目列表缓存（按 显示器+分辨率 键控）：< > 翻页不再每步重扫目录
static HIST_LIST_CACHE: Mutex<Option<(usize, u32, u32, Vec<HistItem>)>> = Mutex::new(None);

fn hist_items_cached(dir: &std::path::Path, mon: usize, want: (u32, u32)) -> Vec<HistItem> {
    if let Some(c) = HIST_LIST_CACHE.lock().unwrap().as_ref() {
        if c.0 == mon && c.1 == want.0 && c.2 == want.1 { return c.3.clone(); }
    }
    let items = hist_list(dir, mon, Some(want));
    *HIST_LIST_CACHE.lock().unwrap() = Some((mon, want.0, want.1, items.clone()));
    items
}

/// 【输出成功后】把发生输出的这块屏冻结帧提交为历史档。
/// 语义（用户明确要求）：只有真正用了这次截图（复制/另存/贴图）才算一条历史，
/// 光呼出又 Esc 掉的不留档。重活在后台线程且延迟 400ms 启动——绝不与
/// 贴图/复制热路径抢 CPU。任何失败静默（历史是附属功能，绝不影响主流程）。
pub(crate) fn history_commit<R: Runtime>(app: &AppHandle<R>, idx: usize) {
    let cfg = app.try_state::<ConfigState>()
        .map(|s| s.0.lock().unwrap().shot.clone())
        .unwrap_or_default();
    if !cfg.history_enabled { return; }
    let Some(dir) = hist_dir(app) else { return };
    // 同步快照（Arc 克隆零拷贝）：延迟落盘期间用户可能已开新会话覆盖 shots，
    // 必须先把这一帧的数据所有权拿到手
    let snap = {
        let Some(state) = app.try_state::<ShotState>() else { return };
        let shots = state.shots.lock().unwrap();
        shots.iter().find(|s| s.geom.index == idx)
            .map(|s| (s.geom.clone(), s.bgra.clone()))
    };
    let Some((geom, bgra)) = snap else { return };
    let region = HIST_PENDING_REGION.lock().unwrap().as_ref()
        .filter(|(i, _)| *i == idx).map(|(_, r)| r.clone());
    let ts = { *HIST_COMMIT_TS.lock().unwrap()
        .get_or_insert_with(|| chrono::Utc::now().timestamp_millis()) };
    let max_count = cfg.history_max_count.max(1) as usize;
    let max_days = cfg.history_max_days.max(1) as i64;
    std::thread::spawn(move || {
        // 让位贴图/复制热路径后再做 PNG 编码这种 CPU 大户
        std::thread::sleep(std::time::Duration::from_millis(400));
        hist_cleanup(&dir, max_count, max_days);
        let w = geom.width as u32;
        let h = geom.height as u32;
        let path = dir.join(format!("{ts}_{}.png", geom.index));
        if !path.exists() && bgra.len() >= (w as usize) * (h as usize) * 4 {
            let mut rgba = vec![0u8; bgra.len()];
            for (d, src) in rgba.chunks_exact_mut(4).zip(bgra.chunks_exact(4)) {
                d[0] = src[2]; d[1] = src[1]; d[2] = src[0]; d[3] = 0xFF;
            }
            if let Some(img) = image::RgbaImage::from_raw(w, h, rgba) {
                // Fast 压缩级别：编码 CPU 降到 ~1/3——历史档速度远比体积重要
                save_png_fast(&img, &path);
                let thumb = image::imageops::thumbnail(&img, 320, 320);
                let _ = image::DynamicImage::ImageRgba8(thumb)
                    .save(dir.join(format!("{ts}_{}.thumb.png", geom.index)));
            }
        }
        // 选区 sidecar 随每次输出刷新为最终框选范围
        if let Some(r) = region {
            if let Ok(json) = serde_json::to_string(&r) {
                let _ = std::fs::write(
                    dir.join(format!("{ts}_{}.region.json", geom.index)), json);
            }
        }
        // 新档落盘：翻页列表缓存作废
        *HIST_LIST_CACHE.lock().unwrap() = None;
    });
}

/// 删除单条历史档（帧 png + 缩略图 + 选区 sidecar）。文件名白名单校验。
#[tauri::command]
pub fn shot_history_delete(app: AppHandle, file: String) -> Result<(), String> {
    let ok = !file.is_empty() && file.len() <= 80
        && file.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.' || b == b'-')
        && file.ends_with(".png") && !file.contains("..");
    if !ok { return Err("bad filename".into()); }
    let dir = hist_dir(&app).ok_or("no dir")?;
    let stem = file.trim_end_matches(".png").to_string();
    for suffix in [".png", ".thumb.png", ".region.json"] {
        let _ = std::fs::remove_file(dir.join(format!("{stem}{suffix}")));
    }
    // 该档若还在解码缓存里也一并清掉，避免幽灵帧
    HIST_DECODE_CACHE.lock().unwrap().retain(|(f, _)| f != &file);
    *HIST_LIST_CACHE.lock().unwrap() = None;
    Ok(())
}

/// 清空全部历史截屏档
#[tauri::command]
pub fn shot_history_clear(app: AppHandle) -> Result<(), String> {
    let dir = hist_dir(&app).ok_or("no dir")?;
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() { let _ = std::fs::remove_file(e.path()); }
    }
    HIST_DECODE_CACHE.lock().unwrap().clear();
    *HIST_LIST_CACHE.lock().unwrap() = None;
    Ok(())
}

/// PNG 快速编码（CompressionType::Fast + 无滤镜）：历史档专用
fn save_png_fast(img: &image::RgbaImage, path: &std::path::Path) {
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};
    use image::{ExtendedColorType, ImageEncoder};
    let Ok(file) = std::fs::File::create(path) else { return };
    let enc = PngEncoder::new_with_quality(file, CompressionType::Fast, FilterType::NoFilter);
    let _ = enc.write_image(
        img.as_raw(), img.width(), img.height(), ExtendedColorType::Rgba8,
    );
}

/// 当前会话各屏的【原始实时帧】缓存：< > 翻回"实时"时还原（历史加载会覆盖 shots）
static HIST_LIVE: Mutex<Option<Vec<MonitorShot>>> = Mutex::new(None);

#[tauri::command]
pub fn shot_history_list(window: WebviewWindow) -> Result<Vec<HistItem>, String> {
    let idx = overlay_index(window.label()).ok_or("not overlay")?;
    let state = window.try_state::<ShotState>().ok_or("no state")?;
    let (w, h) = {
        let shots = state.shots.lock().unwrap();
        shots.iter().find(|s| s.geom.index == idx)
            .map(|s| (s.geom.width, s.geom.height))
            .ok_or("no frame")?
    };
    let dir = hist_dir(window.app_handle()).ok_or("no dir")?;
    Ok(hist_items_cached(&dir, idx, (w, h)))
}

/// 历史翻页位置：-1 = 实时，0..len-1 = 历史（0 最新）。全局共享（同一时刻
/// 只有一个遮罩在交互），会话开始时复位
static HIST_POS: Mutex<isize> = Mutex::new(-1);

/// 解码缓存：历史档文件名 → 已转好的 BGRA 帧。< > 来回翻页命中缓存即
/// 零读盘零解码，切换从"整屏 PNG 解码数百 ms"降到近乎瞬时。
/// 整屏 BGRA 每帧可达十几 MB，只留最近几帧；预取相邻帧把连续翻页也喂满
static HIST_DECODE_CACHE: Mutex<Vec<(String, std::sync::Arc<Vec<u8>>)>> = Mutex::new(Vec::new());
const HIST_DECODE_CACHE_MAX: usize = 3;

/// 读历史档 → BGRA（物理分辨率，与冻结帧同字节序），带解码缓存。
/// want_w/h 校验尺寸相符（分辨率不符的历史档无法整屏替换）
fn hist_load_bgra(dir: &std::path::Path, name: &str, want_w: u32, want_h: u32)
    -> Result<(u32, u32, std::sync::Arc<Vec<u8>>), String>
{
    if let Some(hit) = HIST_DECODE_CACHE.lock().unwrap().iter().find(|(f, _)| f == name) {
        return Ok((want_w, want_h, hit.1.clone()));
    }
    let path = dir.join(name);
    if !path.exists() { return Err("历史文件缺失".into()); }
    let bytes = std::fs::read(&path).map_err(|e| format!("read: {e}"))?;
    let img = image::load_from_memory(&bytes).map_err(|e| format!("decode: {e}"))?.to_rgba8();
    let (iw, ih) = (img.width(), img.height());
    if iw != want_w || ih != want_h { return Err("尺寸不符".into()); }
    let mut bgra = img.into_raw();
    for px in bgra.chunks_exact_mut(4) { px.swap(0, 2); } // RGBA→BGRA
    let arc = std::sync::Arc::new(bgra);
    {
        let mut cache = HIST_DECODE_CACHE.lock().unwrap();
        if !cache.iter().any(|(f, _)| f == name) {
            cache.push((name.to_string(), arc.clone()));
            let len = cache.len();
            if len > HIST_DECODE_CACHE_MAX { cache.drain(..len - HIST_DECODE_CACHE_MAX); }
        }
    }
    Ok((iw, ih, arc))
}

/// 翻历史：dir=-1 更旧 / +1 更新；或直接跳到 index（-1=实时，0=最新…）。
/// 加载即替换本屏冻结帧并通知前端重载（选区/标注清空，重新框选）。
#[tauri::command]
pub fn shot_history_step(app: AppHandle, window: WebviewWindow, dir: i32, index: Option<isize>) -> Result<String, String> {
    let idx = overlay_index(window.label()).ok_or("not overlay")?;
    let state = app.try_state::<ShotState>().ok_or("no state")?;
    let geom = {
        let shots = state.shots.lock().unwrap();
        shots.iter().find(|s| s.geom.index == idx).ok_or("no frame")?.geom.clone()
    };
    let dir_path = hist_dir(&app).ok_or("no dir")?;
    let items = hist_items_cached(&dir_path, idx, (geom.width, geom.height));
    if items.is_empty() { return Err("无历史截屏".into()); }

    let pos = *HIST_POS.lock().unwrap();
    let np = match index {
        Some(i) => i.clamp(-1, items.len() as isize - 1),
        None => if dir < 0 {
            if pos + 1 < items.len() as isize { pos + 1 } else { -1 }
        } else {
            if pos > -1 { pos - 1 } else { 0 }
        },
    };

    let label = format!("{OVERLAY_PREFIX}-{idx}");
    if np < 0 {
        // 回到实时：还原原始帧
        let live_lock = HIST_LIVE.lock().unwrap();
        if let Some(live) = live_lock.as_ref() {
            if let Some(orig) = live.iter().find(|s| s.geom.index == idx) {
                {
                    let mut shots = state.shots.lock().unwrap();
                    if let Some(slot) = shots.iter_mut().find(|s| s.geom.index == idx) {
                        slot.bgra = orig.bgra.clone();
                    }
                }
                let g = orig.geom.clone();
                let bgra = orig.bgra.clone();
                crate::defer_to_main_loop(app.clone(), move || {
                    update_freeze_frame(g.index, g.width as i32, g.height as i32, &bgra);
                });
            }
        }
        drop(live_lock);
        *HIST_POS.lock().unwrap() = -1;
        // 【轻量刷新】只通知前端换帧，不走 shot-refresh 整页重载——
        // 整页重载会清空遮罩/选区 UI 再重画，表现为"切换历史闪一下"
        let _ = app.emit_to(label, "shot://history-changed", ());
        return Ok("live".into());
    }

    let item_file = items[np as usize].file.clone();
    // 读档（命中解码缓存则零读盘零解码）
    let (_, _, bgra_arc) = hist_load_bgra(&dir_path, &item_file, geom.width, geom.height)?;

    // 首次进历史前缓存实时帧
    {
        let mut live = HIST_LIVE.lock().unwrap();
        if live.is_none() {
            *live = Some(state.shots.lock().unwrap().clone());
        }
    }
    {
        let mut shots = state.shots.lock().unwrap();
        if let Some(slot) = shots.iter_mut().find(|s| s.geom.index == idx) {
            slot.bgra = bgra_arc.clone();
        }
    }
    let g = geom.clone();
    crate::defer_to_main_loop(app.clone(), move || {
        update_freeze_frame(g.index, g.width as i32, g.height as i32, &bgra_arc);
    });
    // 预取相邻两帧进缓存（后台线程，不阻塞本次翻页返回）：
    // 连续按 < / > 时下一帧早已就绪，切换近乎瞬时
    {
        let dir2 = dir_path.clone();
        let mut names: Vec<(String, u32, u32)> = Vec::new();
        if np + 1 < items.len() as isize { names.push((items[(np + 1) as usize].file.clone(), geom.width, geom.height)); }
        if np >= 1 { names.push((items[(np - 1) as usize].file.clone(), geom.width, geom.height)); }
        std::thread::spawn(move || {
            for (f, w, h) in names {
                let _ = hist_load_bgra(&dir2, &f, w, h);
            }
        });
    }
    *HIST_POS.lock().unwrap() = np;
        let _ = app.emit_to(label, "shot://history-changed", ());
    Ok(item_file)
}

/// 会话开始时复位历史翻页状态与实时帧缓存
fn history_reset() {
    *HIST_POS.lock().unwrap() = -1;
    *HIST_LIVE.lock().unwrap() = None;
    // 新会话重新计数：未输出过的会话不留档（按需提交语义）
    *HIST_COMMIT_TS.lock().unwrap() = None;
    HIST_PENDING_REGION.lock().unwrap().take();
}

/// 记录当前查看帧的框选范围（本显示器局部物理像素 [x,y,w,h]）。
/// 浏览历史时写入该帧 sidecar，点回这一帧可还原「当时的选区」；
/// 实时画面则暂存内存，等本次输出提交历史档时一并落盘——
/// （呼出时文件还不存在：只有真正输出过的会话才留档）
#[tauri::command]
pub fn shot_history_save_region(window: WebviewWindow, region: Vec<i32>) -> Result<(), String> {
    let idx = overlay_index(window.label()).ok_or("not overlay")?;
    if region.len() != 4 { return Err("bad region".into()); }
    let app = window.app_handle();
    let pos = *HIST_POS.lock().unwrap();
    if pos < 0 {
        // 实时画面：暂存，输出提交时随帧一起写 sidecar
        *HIST_PENDING_REGION.lock().unwrap() = Some((idx, region));
        return Ok(());
    }
    let dir_path = hist_dir(app).ok_or("no dir")?;
    let state = app.try_state::<ShotState>().ok_or("no state")?;
    let geom = {
        let shots = state.shots.lock().unwrap();
        shots.iter().find(|s| s.geom.index == idx).ok_or("no frame")?.geom.clone()
    };
    let items = hist_items_cached(&dir_path, idx, (geom.width, geom.height));
    let stem = items.get(pos as usize)
        .ok_or("bad pos")?.file.trim_end_matches(".png").to_string();
    let json = serde_json::to_string(&region).map_err(|e| e.to_string())?;
    std::fs::write(dir_path.join(format!("{stem}.region.json")), json)
        .map_err(|e| format!("write: {e}"))?;
    *HIST_LIST_CACHE.lock().unwrap() = None;
    Ok(())
}

pub(crate) fn begin_impl<R: Runtime>(app: AppHandle<R>, picker: bool) -> Result<(), String> {
    if SHOOTING.swap(true, Ordering::SeqCst) { return Ok(()); }
    PICKER.store(picker, Ordering::SeqCst);
    let cfg: ShotConfig = app.try_state::<ConfigState>()
        .map(|s| s.0.lock().unwrap().shot.clone())
        .unwrap_or_default();
    // 功能停用守卫：截图功能关闭时截图与取色（同一功能）都不生效。
    // 快捷键已不注册（resync 跳过），这里兜工具栏残留图标等残余入口
    if !cfg.enabled {
        SHOOTING.store(false, Ordering::SeqCst);
        PICKER.store(false, Ordering::SeqCst);
        return Err("disabled".into());
    }
    let capture_cursor = cfg.capture_cursor;
    // 取色模式不做智能识别/区域记忆：无选区概念，省掉窗口快照开销
    let smart_detect = cfg.smart_detect && !picker;
    let remember_region = cfg.remember_region && !picker;
    std::thread::spawn(move || {
        let t0 = std::time::Instant::now();
        // 窗口 Z 序快照与屏幕采集【并行】：EnumWindows+GetRect 不依赖帧数据，
        // 串行执行白白给"呼出到高亮出现"加一段延迟。子线程结果 join 回收，
        // 异常（极少）时退化为空列表=无智能识别，绝不阻塞主流程
        let snap_thread = if smart_detect {
            let app2 = app.clone();
            Some(std::thread::spawn(move || snapshot_windows(&app2)))
        } else { None };
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
                // 快照此刻本会话遮罩窗还不存在，列表天然干净。
                // 初始高亮与后续悬停识别统一查这份表
                let cands = snap_thread
                    .map(|t| t.join().unwrap_or_default())
                    .unwrap_or_default();
                // 智能识别在截图瞬间完成：光标处命中的第一个（最顶层）窗口
                let snap = if smart_detect {
                    candidate_at(&cands, cursor.x as i32, cursor.y as i32)
                } else { None };
                // 记忆区域回退：仅当智能识别未命中且开关开启
                let prefill = if snap.is_none() && remember_region {
                    *LAST_REGION.lock().unwrap()
                } else { None };
                // 快照条目数（cands/snap 随后 move 进 state，先留档供诊断）
                let cands_count = cands.len();
                let snap_diag = snap.as_ref().map(|r| format!("{}x{}@{},{}", r.width, r.height, r.x, r.y)).unwrap_or_else(|| "None".into());
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
                // 诊断：会话开始时的识别基础数据（候选窗口数/初始命中/光标显示器几何）。
                // 悬停识别失效时对照：cands=0 → 快照失败；snap=None 且 cands>0 →
                // 光标处无窗口（桌面）；后续 rect@ 查询全 None 而 cands>0 → 坐标系错位
                {
                    // 多屏诊断：全部显示器原点/尺寸 + 候选窗口数。副屏智能识框
                    // 错位类问题时，对照「窗口快照矩形」与这里的物理坐标系即可
                    // 判断是否 DPI 虚拟化（坐标被缩放）或原点映射错误
                    let mons = shots.iter().map(|s| {
                        let g = &s.geom;
                        format!("mon{}=({},{},{},{})", g.index, g.x, g.y, g.width, g.height)
                    }).collect::<Vec<_>>().join(" ");
                    diag_write(&format!(
                        "[shot] begin smart: cands={} snap={} cursor=({},{}) {}",
                        if smart_detect { cands_count } else { 0 },
                        snap_diag,
                        cursor.x as i32, cursor.y as i32,
                        mons,
                    ));
                }
                // 截图历史：只复位翻页状态。【不再呼出即落盘】——
                // 只有本次会话真正输出（复制/另存/贴图）才由 shot_output
                // 调 history_commit 提交为历史档（用户明确的语义）
                if !picker {
                    history_reset();
                }
                // 先确保遮罩窗就位（复用或调度重建），随后才把帧写入冻结层——
                // 顺序绝不能反：重建路径（显示器数量变化/预热未完成）下，若写帧
                // 闭包先于新窗口创建执行，get_webview_window 落空 → 冻结层永远
                // 无帧 → shot_ready 等 300ms 超时后照样亮窗 → 整屏漆黑一整场
                ensure_overlays(&app, &shots);
                {
                    let t_freeze = std::time::Instant::now();
                    // 每屏独立排队「挂冻结层+写帧」：多屏时某屏的大 memcpy 不再
                    // 拖住其他屏的亮窗；写完立即触发该屏重绘
                    for s in &shots {
                        let app2 = app.clone();
                        let g = s.geom.clone();
                        let bgra = s.bgra.clone();
                        crate::defer_to_main_loop(app.clone(), move || {
                            let Some(win) = app2.get_webview_window(&format!("{OVERLAY_PREFIX}-{}", g.index)) else { return };
                            let Some(parent) = hwnd_of_webview(&win) else { return };
                            attach_freeze_layer(g.index, parent, g.width as i32, g.height as i32);
                            update_freeze_frame(g.index, g.width as i32, g.height as i32, &bgra);
                        });
                    }
                    diag_write(&format!("[shot] freeze writes queued in {} ms", t_freeze.elapsed().as_millis()));
                    let app3 = app.clone();
                    let shots2 = shots.clone();
                    // 原生即时亮窗：帧已贴出即显示。【宽限期 24ms→160ms】
                    // 复用遮罩窗时页面仍显示着【上一会话的旧压暗层/旧选区 DOM】，
                    // 前端要经历「收 shot-refresh → IPC 拉几何 → 双 rAF 重画压暗层」
                    // 才能盖掉旧画面——实测整条链路 40~90ms，24ms 宽限几乎必然
                    // 超时后强行亮窗：用户先看到旧黑遮罩闪现 → 画布清空变亮 →
                    // 压暗层再淡入，正是"呼出时屏幕闪几下、黑色遮罩消失又出现"
                    // 的根因。前端就绪（shot_ready 置 OVERLAY_READY）则立即交还
                    // 亮窗权、一毫秒不多等；只有前端真的挂了才付满 160ms 兜底
                    // （60s 看门狗另收极端场景）。预热首呼出页面是空白的，不受影响
                    std::thread::spawn(move || {
                        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(160);
                        while std::time::Instant::now() < deadline {
                            if OVERLAY_READY.load(Ordering::SeqCst) { return; }
                            std::thread::sleep(std::time::Duration::from_millis(3));
                        }
                        for s in &shots2 {
                            native_show_overlay(&app3, s.geom.index);
                        }
                        diag_write(&format!("[shot] overlays shown {} ms after capture start", t0.elapsed().as_millis()));
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
    /// 窗口 Z 序快照（全局物理坐标，顶→底）。随 geometry 一次性下发前端，
    /// 悬停的窗口级命中改为前端本地扫描——零 IPC 往返，高亮首帧延迟从
    /// ~10-20ms 降到 <0.1ms（Snipaste 级跟手）。UIA 元素级细化仍走服务端
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub cands: Vec<ShotRect>,
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
    // 窗口 Z 序快照随 geometry 下发（上限 512 条封顶 payload；正常桌面远少于此）
    let cands = state.candidates.lock().unwrap().iter().take(512).map(|c| c.rect.clone()).collect();
    // 记忆区域：智能识别没有命中时才作为预填选区（Snipaste 优先级：智能识别 > 记忆区域）
    let prefill = if snap.is_none() {
        state.prefill.lock().unwrap().clone().and_then(|last| {
            clip_to_monitor(&ShotRect { x: last[0], y: last[1], width: last[2] as u32, height: last[3] as u32 }, &g)
        })
    } else { None };
    Ok(ShotGeomResp { geom: g, snap, prefill, picker: PICKER.load(Ordering::SeqCst), cands })
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
pub(crate) fn wrap_bmp(bgra: &[u8], w: u32, h: u32) -> Vec<u8> {
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

    // GET /history/{name}：截图历史文件（缩略图/原图）直出。
    // 文件名白名单：字母/数字/下划线/点/连字符，杜绝路径拼接。
    // 【必须放行字母】缩略图文件名形如 {ts}_{mon}.thumb.png——旧白名单只允许
    // 数字/下划线/点/连字符，"thumb" 五个字母全被判非法 → 缩略图全部 404，
    // 表现为"H 打开历史列表有记录但缩略图一律不可见"
    if let Some(name) = path.strip_prefix("/history/") {
        let name = name.split('?').next().unwrap_or("");
        let ok = !name.is_empty() && name.len() <= 80
            && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.' || b == b'-')
            && !name.contains("..");
        if !ok { return not_found(); }
        use tauri::Manager;
        let dir = ctx.app_handle().try_state::<crate::storage::AppPaths>()
            .map(|p| p.data_dir.join("shot_history"));
        let Some(dir) = dir else { return not_found(); };
        match std::fs::read(dir.join(name)) {
            Ok(bytes) => {
                return tauri::http::Response::builder()
                    .header("Content-Type", "image/png")
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "no-store")
                    .body(std::borrow::Cow::Owned(bytes))
                    .map_err(Into::into);
            }
            Err(_) => return not_found(),
        }
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
    // 【内存直通】新建贴图的首次取图直接命中内存缓存——免去「刚写盘又立刻
    // 读回」的双倍磁盘 IO（大截图几十 MB 时读写合计上百毫秒）。克隆一份返回、
    // 缓存保留（加载失败自愈重试还能拿到），由容量上限与关闭贴图回收
    if let Some((bytes, mime)) = crate::pin::pin_mem_get(id) {
        return tauri::http::Response::builder()
            .header("Content-Type", mime)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "no-store")
            .body(std::borrow::Cow::Owned(bytes))
            .map_err(Into::into);
    }
    let file = {
        let Some(store) = app.try_state::<crate::pin::PinStore>() else { return not_found(); };
        let entries = store.0.lock().unwrap();
        match entries.iter().find(|p| p.id == id) {
            Some(p) => std::path::PathBuf::from(&p.file),
            None => return not_found(),
        }
    };
    let mime = match file.extension().and_then(|e| e.to_str()) {
        Some("gif") => "image/gif",
        Some("html") => "text/html",
        Some("bmp") => "image/bmp",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => "image/png",
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
/// 基于 begin 时拍的窗口 Z 序快照查表（活调 WindowFromPoint 只会命中遮罩自身）。
/// 参数收 f64 自行取整：前端若传来小数坐标，i32 反序列化会直接 reject，
/// 表现恰为"悬停识别一次后全部静默失效"
#[tauri::command]
pub fn shot_window_rect_at(app: AppHandle, x: f64, y: f64) -> Option<ShotRect> {
    let (x, y) = (x.round() as i32, y.round() as i32);
    let state = app.try_state::<ShotState>()?;
    let cands = state.candidates.lock().unwrap();
    let hit = candidate_at(&cands, x, y);
    // 诊断：仅当命中结果相对上次发生变化时记一条（悬停跨窗口/进出桌面时），
    // 用于定位"悬停识别失效"类问题——坐标错会表现为恒 None，快照空则 count=0
    static LAST: std::sync::Mutex<Option<(i32, i32, Option<(i32, i32, u32, u32)>, usize)>> =
        std::sync::Mutex::new(None);
    let sig = (x, y, hit.as_ref().map(|r| (r.x, r.y, r.width, r.height)), cands.len());
    let mut last = LAST.lock().unwrap();
    if last.map(|l| l.2 != sig.2 || l.3 != sig.3).unwrap_or(true) {
        diag_write(&format!(
            "[shot] rect@({x},{y}) -> {} cands={}",
            hit.as_ref().map(|r| format!("({},{},{},{})", r.x, r.y, r.width, r.height))
                .unwrap_or_else(|| "None".into()),
            cands.len(),
        ));
        *last = Some(sig);
    }
    drop(last);
    hit
}

/// 元素级智能识别（UIA）：返回全局物理坐标 (x,y) 处最合适 UI 元素的矩形。
///
/// 【为什么不能用 ElementFromPoint】遮罩窗是全屏置顶且接收鼠标输入的窗口，
/// UIA 的 ElementFromPoint 与 WindowFromPoint 一样只会命中遮罩自己——
/// 返回的"元素"是遮罩/其 WebView2 宿主，矩形≈全屏，什么都选不中。
///
/// 正确路径：从呼出瞬间的 Z 序快照里查到光标下目标窗口的 HWND，
/// 用 ElementFromHandle 直达【目标窗口】的 UIA 元素树逐层下钻到
/// 「包含该点且面积最小」的子元素——能框选浏览器页面里的导航栏/按钮组/
/// 输入框等细粒度组件。
///
/// 实际查询在专用 UIA 工作线程完成（见 uia_pick 模块）：
/// · CreateCacheRequest 批量缓存：每层下钻仅 1 次跨进程往返，Chromium
///   数百节点网页树毫秒级完成（旧实现 N×2 次/层，动辄秒级）
/// · 命中交互控件（按钮/链接/菜单项/输入框）即停——按"件"识别不钻文本碎片
/// · 极小同型叶子组（≥3 兄弟）上浮父容器——工具条/列表按"组"可选
/// · 160ms 层间自限 + latest-wins：慢 provider 不拖累后续悬停
///
/// 过小（<10px，噪点）与异常返回 None，前端自动回退窗口级识别。
#[cfg(windows)]
#[tauri::command]
pub async fn shot_ui_rect_at(app: AppHandle, x: f64, y: f64) -> Option<ShotRect> {
    let (x, y) = (x.round() as i32, y.round() as i32);
    // 快照查表拿到目标窗口 HWND+矩形后【立刻放锁】：UIA 查询可能阻塞数秒
    // （Chromium 无障碍树首次激活），锁被占住会卡死并行的窗口级查表
    let target = {
        let state = app.try_state::<ShotState>()?;
        let cands = state.candidates.lock().unwrap();
        cands.iter().find(|w| {
            x >= w.rect.x && x < w.rect.x + w.rect.width as i32
                && y >= w.rect.y && y < w.rect.y + w.rect.height as i32
        }).map(|w| (w.hwnd, w.rect.clone()))?
    };
    let (hwnd, win) = target;
    tauri::async_runtime::spawn_blocking(move || crate::uia_pick::pick(hwnd, win, x, y, 220))
        .await
        .ok()
        .flatten()
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn shot_ui_rect_at(_app: AppHandle, _x: f64, _y: f64) -> Option<ShotRect> { None }

#[tauri::command]
pub fn shot_last_region() -> Option<[i32; 4]> {
    LAST_REGION.lock().unwrap().clone()
}

/// PNG 原始字节 → 解码 RGBA → 写入剪贴板（后台线程执行，整图解码不占主线程）
fn copy_png_to_clipboard<R: Runtime>(app: &AppHandle<R>, png: &[u8]) -> Result<(), String> {
    let img = image::load_from_memory(png).map_err(|e| format!("decode: {e}"))?;
    copy_rgba_to_clipboard(app, &img.to_rgba8())
}

/// RGBA 位图写入剪贴板（Windows：Win32 直写；其他平台：arboard）。
///
/// 【为什么 Windows 不用 arboard】arboard 在 Windows 以 `OpenClipboard(NULL)`
/// 打开（无属主窗口），`EmptyClipboard()` 后剪贴板属主为 NULL，随后的
/// `SetClipboardData` 会报 ERROR_CLIPBOARD_NOT_OPEN(1418)——本机剪贴板
/// 监听方多（含本应用自己的历史监听），几乎必现。改为用本应用自己的
/// 窗口句柄做属主打开 + 显式重试跨过瞬时占用。截图复制与贴图复制共用。
pub(crate) fn copy_rgba_to_clipboard<R: Runtime>(app: &AppHandle<R>, rgba: &image::RgbaImage) -> Result<(), String> {
    #[cfg(windows)]
    {
        let owner = app.webview_windows().values()
            .find_map(|w| hwnd_of_webview(w))
            .map(|h| h.0 as isize)
            .unwrap_or(0);
        clipboard_set_image_windows(owner, rgba)
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        let mut cb = arboard::Clipboard::new().map_err(|e| format!("clipboard: {e}"))?;
        cb.set_image(arboard::ImageData {
            width: rgba.width() as usize,
            height: rgba.height() as usize,
            bytes: std::borrow::Cow::Borrowed(rgba.as_raw()),
        }).map_err(|e| format!("set image: {e}"))
    }
}

/// Win32 直写剪贴板位图：CF_DIBV5（兼容性最好）+ "PNG" 注册格式（无损）。
/// 打开失败/写入失败都整体重试（重开剪贴板），总窗口 ~300ms。
#[cfg(windows)]
fn clipboard_set_image_windows(owner_hwnd: isize, rgba: &image::RgbaImage) -> Result<(), String> {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Gdi::{BITMAPV5HEADER, BI_BITFIELDS};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    // ---- 预编码两份数据（DIBV5 = BGRA 行序自下而上；PNG 原样）----
    let (w, h) = (rgba.width() as i32, rgba.height() as i32);
    let mut bgra = rgba.as_raw().clone();
    for px in bgra.chunks_exact_mut(4) { px.swap(0, 2); } // RGBA -> BGRA
    let row = (w * 4) as usize;
    let mut rows: Vec<&[u8]> = bgra.chunks_exact(row).collect();
    rows.reverse(); // DIB 自下而上
    let mut dib: Vec<u8> = Vec::with_capacity(4 * row * h as usize + 124);
    for r in rows { dib.extend_from_slice(r); }

    let header = BITMAPV5HEADER {
        bV5Size: std::mem::size_of::<BITMAPV5HEADER>() as u32,
        bV5Width: w,
        bV5Height: h, // 正高 = 自下而上
        bV5Planes: 1,
        bV5BitCount: 32,
        bV5Compression: BI_BITFIELDS,
        bV5SizeImage: (4 * w * h) as u32,
        bV5RedMask: 0x00ff_0000,
        bV5GreenMask: 0x0000_ff00,
        bV5BlueMask: 0x0000_00ff,
        bV5AlphaMask: 0xff00_0000,
        // LCS_sRGB = 'sRGB' 四字符码（windows crate 未导出该常量，直接给值）
        bV5CSType: 0x7352_4742u32,
        ..Default::default()
    };
    let mut dib_buf: Vec<u8> = Vec::with_capacity(std::mem::size_of::<BITMAPV5HEADER>() + dib.len());
    dib_buf.extend_from_slice(unsafe { std::slice::from_raw_parts(
        &header as *const BITMAPV5HEADER as *const u8, std::mem::size_of::<BITMAPV5HEADER>()) });
    dib_buf.extend_from_slice(&dib);

    let png_bytes: Vec<u8> = {
        // Fast 压缩级别：默认级别下大图 PNG 编码要数百 ms~2s，是
        // "Ctrl+C 之后要等好久才有反馈"的主因；PNG 只是给偏好该格式的
        // 应用准备的附加格式（DIBV5 才是主格式），体积大点无所谓
        use image::codecs::png::{CompressionType, FilterType, PngEncoder};
        use image::{ExtendedColorType, ImageEncoder};
        let mut out = std::io::Cursor::new(Vec::new());
        let enc = PngEncoder::new_with_quality(&mut out, CompressionType::Fast, FilterType::NoFilter);
        enc.write_image(rgba.as_raw(), rgba.width(), rgba.height(), ExtendedColorType::Rgba8)
            .map_err(|e| format!("png encode: {e}"))?;
        out.into_inner()
    };

    let png_fmt = unsafe {
        let f = RegisterClipboardFormatW(windows::core::w!("PNG"));
        if f == 0 { return Err("register PNG format failed".into()); }
        f
    };

    /// 全局内存拷入并 SetClipboardData；成功后系统接管内存，失败时释放
    unsafe fn put_format(fmt: u32, data: &[u8]) -> Result<(), String> {
        let h = GlobalAlloc(GMEM_MOVEABLE, data.len()).map_err(|e| format!("alloc: {e}"))?;
        let p = GlobalLock(h);
        if p.is_null() {
            let _ = windows::Win32::Foundation::GlobalFree(Some(h));
            return Err("global lock failed".into());
        }
        std::ptr::copy_nonoverlapping(data.as_ptr(), p as *mut u8, data.len());
        let _ = GlobalUnlock(h);
        match SetClipboardData(fmt, Some(HANDLE(h.0))) {
            Ok(_) => Ok(()),
            Err(e) => {
                let _ = windows::Win32::Foundation::GlobalFree(Some(h));
                Err(format!("SetClipboardData({fmt}): {e}"))
            }
        }
    }

    // 分段耗时诊断：定位"复制慢"（encode=PNG 附加格式 / win=剪贴板打开重试）
    let t = std::time::Instant::now();
    let hwnd = windows::Win32::Foundation::HWND(owner_hwnd as *mut _);
    let mut last = String::from("open failed");
    for attempt in 0..10 {
        if attempt > 0 { std::thread::sleep(std::time::Duration::from_millis(30)); }
        unsafe {
            if OpenClipboard(Some(hwnd)).is_err() { last = "open failed".into(); continue; }
            let r = (|| -> Result<(), String> {
                EmptyClipboard().map_err(|e| format!("empty: {e}"))?;
                // DIBV5 优先：多数应用认它；PNG 随后（无损，支持的应用取用）
                put_format(17, &dib_buf)?; // CF_DIBV5
                if let Err(e) = put_format(png_fmt, &png_bytes) {
                    diag_write(&format!("[shot] clipboard png fmt skipped: {e}"));
                }
                Ok(())
            })();
            let _ = CloseClipboard();
            match r {
                Ok(()) => {
                    let ms = t.elapsed().as_millis();
                    if ms > 150 {
                        diag_write(&format!("[shot] clipboard set image slow: {ms}ms (attempts={})", attempt + 1));
                    }
                    return Ok(());
                }
                Err(e) => last = e,
            }
        }
    }
    Err(last)
}

/// 截图输出（复制 / 另存为 / 贴图）：选区 PNG【原始字节】经 Tauri 原生二进制
/// 通道直传（前端 invoke 携带 ArrayBuffer，零 base64、零 JSON 序列化），
/// 元数据走请求头。async 命令运行于 tokio 线程池——重活全部不占主线程。
///
/// 头字段：
///   x-shot-action = pin | save | copy
///   x-shot-x / x-shot-y   （pin：屏幕全局物理坐标）
///   x-shot-path           （save：用户在另存为对话框选择的目标路径）
/// 【零像素传输】无标注输出：前端只发选区矩形，直接从【本屏冻结帧】裁剪
/// BGRA 行块返回。冻结帧就是呼出瞬间的原始桌面像素（遮罩/高亮都画在
/// webview 层，从未污染它），裁剪结果与旧「前端 getImageData 回读 + IPC
/// 传整块像素」逐字节一致；省掉像素回读 + 过桥传输，4K 选区可省
/// 100~400ms。坐标为全局物理像素，行级 memcpy 裁剪
fn crop_frame_region(
    app: &AppHandle,
    label: &str,
    x: i32, y: i32, w: u32, h: u32,
) -> Result<(Vec<u8>, u32, u32), String> {
    let idx = overlay_index(label).ok_or("not overlay")?;
    let state = app.try_state::<ShotState>().ok_or("no state")?;
    let shots = state.shots.lock().unwrap();
    let shot = shots.iter().find(|s| s.geom.index == idx).ok_or("frame gone")?;
    let g = &shot.geom;
    if w == 0 || h == 0 { return Err("empty region".into()); }
    let lx = (x - g.x).clamp(0, g.width as i32) as usize;
    let ly = (y - g.y).clamp(0, g.height as i32) as usize;
    let cw = (w as usize).min(g.width as usize - lx);
    let ch = (h as usize).min(g.height as usize - ly);
    if cw == 0 || ch == 0 { return Err("region outside monitor".into()); }
    let stride = g.width as usize * 4;
    let src = shot.bgra.as_ref();
    if src.len() < (ly + ch - 1) * stride + (lx + cw) * 4 {
        return Err("frame truncated".into());
    }
    let mut out = Vec::with_capacity(cw * ch * 4);
    for row in 0..ch {
        let s = (ly + row) * stride + lx * 4;
        out.extend_from_slice(&src[s..s + cw * 4]);
    }
    // 返回【钳制后】的实际尺寸——选区越出屏幕边缘时与入参不同，
    // 调用方必须用这对尺寸包装/编码，否则缓冲区与头声明错配
    Ok((out, cw as u32, ch as u32))
}

#[tauri::command]
pub async fn shot_output(app: AppHandle, window: WebviewWindow, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    use tauri::ipc::InvokeBody;
    let hdr = |k: &str| {
        request.headers().get(k).and_then(|v| v.to_str().ok()).map(|s| s.to_string())
    };
    let action = hdr("x-shot-action").unwrap_or_default();
    let crop = hdr("x-shot-crop").as_deref() == Some("1");
    // 选区矩形（全局物理像素）+ 尺寸头：pin/crop 路径共用
    let gx_hdr = hdr("x-shot-x").and_then(|v| v.parse().ok()).unwrap_or(0);
    let gy_hdr = hdr("x-shot-y").and_then(|v| v.parse().ok()).unwrap_or(0);
    let (gw_hdr, gh_hdr) = (
        hdr("x-shot-w").and_then(|v| v.parse::<u32>().ok()),
        hdr("x-shot-h").and_then(|v| v.parse::<u32>().ok()),
    );
    let body = match request.body() {
        InvokeBody::Raw(b) => b,
        InvokeBody::Json(_) => return Err("期望二进制请求体".into()),
    };
    match action.as_str() {
        "pin" => {
            // 【零传输裁剪路径】无标注贴图：Rust 直接从本屏冻结帧裁剪，
            // 前端零像素回读、零 IPC 体积
            if crop {
                let (Some(w), Some(h)) = (gw_hdr, gh_hdr)
                    else { return Err("crop 需要 w/h 头".into()); };
                let (bgra, cw, ch) = crop_frame_region(&app, window.label(), gx_hdr, gy_hdr, w, h)?;
                let bmp = wrap_bmp(&bgra, cw, ch);
                let pin = crate::pin::create_store_entry(&app, &bmp, "image/bmp", gx_hdr, gy_hdr)?;
                crate::pin::attach_to_staging(&app, pin);
            } else {
                // 【最快路径】前端直传选区原始 BGRA 像素（头带 x-shot-w/h）：
                // 包成零压缩 BMP 落盘——省掉 PNG 编码/解码两大耗时。
                // 字节数不匹配时回退旧 PNG 路径（兼容）
                let (bytes, mime): (std::borrow::Cow<'_, [u8]>, &str) = match (gw_hdr, gh_hdr) {
                    // 【最快路径】前端 cropSelectionRaw 已交付 BMP 字节序（BGRA、不透明）：
                    // 此处零拷贝零循环直接包 BMP 头落盘——此前这里又逐像素 swap 一次，
                    // 与前端的交换叠加导致红蓝颠倒（"贴图颜色不对"的根源）
                    (Some(w), Some(h)) if w > 0 && h > 0 && body.len() == (w as usize) * (h as usize) * 4 => {
                        (std::borrow::Cow::Owned(wrap_bmp(&body, w, h)), "image/bmp")
                    }
                    _ => (std::borrow::Cow::Borrowed(&body), "image/png"),
                };
                let pin = crate::pin::create_store_entry(&app, &bytes, mime, gx_hdr, gy_hdr)?;
                // 装进预建的隐藏复用窗：图片就绪后先显贴图、再由 pin_ready 收遮罩
                // （此处绝不提前 hide_all——那会先露出裸桌面，正是"贴图闪一下"的根源）
                crate::pin::attach_to_staging(&app, pin);
            }
        }
        "save" => {
            let dest = hdr("x-shot-path").filter(|p| !p.is_empty()).ok_or("缺少保存路径")?;
            if crop {
                let (Some(w), Some(h)) = (gw_hdr, gh_hdr)
                    else { return Err("crop 需要 w/h 头".into()); };
                let (mut rgba, cw, ch) = crop_frame_region(&app, window.label(), gx_hdr, gy_hdr, w, h)?;
                for px in rgba.chunks_exact_mut(4) { px.swap(0, 2); px[3] = 0xFF; }
                // PNG 编码是重活：丢阻塞线程池；save_png_fast 用 Fast 压缩级
                let img = image::RgbaImage::from_raw(cw, ch, rgba).ok_or("bad buf")?;
                tauri::async_runtime::spawn_blocking(move || {
                    save_png_fast(&img, std::path::Path::new(&dest));
                })
                .await
                .map_err(|e| format!("join: {e}"))?;
            } else {
                std::fs::write(&dest, &body).map_err(|e| format!("write: {e}"))?;
            }
            hide_all(&app);
        }
        "copy" => {
            if crop {
                let (Some(w), Some(h)) = (gw_hdr, gh_hdr)
                    else { return Err("crop 需要 w/h 头".into()); };
                let (mut rgba, cw, ch) = crop_frame_region(&app, window.label(), gx_hdr, gy_hdr, w, h)?;
                // 冻结帧 alpha 字节不可靠（GDI 路径常为 0），写剪贴板必须补不透明
                for px in rgba.chunks_exact_mut(4) { px.swap(0, 2); px[3] = 0xFF; }
                let img = image::RgbaImage::from_raw(cw, ch, rgba).ok_or("bad buf")?;
                let app2 = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(e) = copy_rgba_to_clipboard(&app2, &img) {
                        diag_write(&format!("[shot] copy failed: {e}"));
                    }
                });
            } else {
                // 整图解码成 RGBA 是重活：丢到阻塞线程池，本命令立即继续。
                // app 句柄一并带入：写剪贴板要用本应用窗口做属主（见 copy_rgba_to_clipboard）
                let png = body.clone();
                let app2 = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(e) = copy_png_to_clipboard(&app2, &png) {
                        diag_write(&format!("[shot] copy failed: {e}"));
                    }
                });
            }
            hide_all(&app);
        }
        _ => return Err(format!("未知输出动作 {action}")),
    }
    // 【输出成功 = 一条历史记录】只有真正用过这次截图才留档（用户语义）。
    // 提交的是发生输出的这块屏的冻结帧 + 当时确认的选区
    if let Some(idx) = overlay_index(window.label()) {
        history_commit(&app, idx);
    }
    Ok(())
}

pub(crate) fn cancel_impl<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    hide_all(app);
    Ok(())
}

/// 选定区域文字识别：前端把选区 PNG 经原生二进制通道直传，
/// Rust 调 Windows.Media.Ocr 系统引擎逐行识别（文本 + 行/词矩形）。
/// 重活放阻塞线程池（RoInitialize 线程级，spawn_blocking 线程池足够）。
#[tauri::command]
pub async fn shot_ocr(request: tauri::ipc::Request<'_>) -> Result<Vec<crate::ocr::OcrLineResp>, String> {
    let body = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b,
        tauri::ipc::InvokeBody::Json(_) => return Err("期望二进制请求体".into()),
    };
    if body.is_empty() { return Err("图像为空".into()); }
    let png = body.to_vec();
    tauri::async_runtime::spawn_blocking(move || crate::ocr::recognize_png(&png))
        .await
        .map_err(|e| format!("join: {e}"))?
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
        diag_write(&format!(
            "[drag] begin mon={idx} mode={mode} anchor=({ax},{ay}) hx={hx} hy={hy} start=({sx},{sy},{sw},{sh}) scale={scale}"
        ));
        *DRAG_PARAMS.lock().unwrap() = Some(DragParams {
            mon: idx, mode, ax, ay, hx, hy, sx, sy, sw, sh,
            accent: a, scale,
        });
        *DIM_CACHE.lock().unwrap() = None; // 新一场拖拽重建压暗缓存
        DRAG_FIRST_PAINT.store(false, Ordering::SeqCst);
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
