//! UIA 元素级智能选区：专用工作线程 + 批量缓存查询。
//!
//! 【为什么是独立线程】UIA 查询可能因目标进程无障碍树首次激活而阻塞数百毫秒
//! 甚至秒级（Chromium 系浏览器最典型）。同步命令跑在主线程会卡住整个应用；
//! 直接丢 tokio 池也会占住 worker 且请求会无序堆积。专用线程 + latest-wins：
//! 悬停识别永远只处理【最新】光标位置，排队中的陈旧请求立即回 None 放弃。
//!
//! 【性能核心】CreateCacheRequest 批量带回 BoundingRectangle+ControlType：
//! 每层下钻从「N 个子元素 × 2 次跨进程调用」压缩为 1 次 FindAllBuildCache——
//! Chromium 数百节点的网页树从秒级降到毫秒级，这是"浏览器里能逐按钮识别"
//! 而不卡顿的关键。配合 160ms 自限 deadline，慢 provider 不拖垮悬停体验。
//!
//! 【识别语义】（对齐 Snipaste 手感）
//! · 命中 Button/Hyperlink/MenuItem/TabItem/Edit 等交互控件即停——悬停浏览器
//!   导航栏高亮整条栏、悬停按钮只高亮该按钮，不会钻进按钮内部的文本碎片
//! · 极小的纯 Text/Image 叶子且同型兄弟 ≥3 个时上浮到父容器——列表行/
//!   工具条按"组"可选，同时不影响常规单件精度
//! · <6px 噪点（分隔线等）跳过；<10px 结果与与窗口几乎等大的结果视为
//!   下钻失败返回 None，前端自动保持窗口级高亮

#[cfg(windows)]
pub use imp::{clear_cache, pick};

#[cfg(not(windows))]
pub fn clear_cache() {}

#[cfg(not(windows))]
pub fn pick(
    _hwnd: isize,
    _win: crate::screenshot::ShotRect,
    _x: i32,
    _y: i32,
    _timeout_ms: u64,
) -> Option<crate::screenshot::ShotRect> {
    None
}

#[cfg(windows)]
mod imp {
    use crate::screenshot::ShotRect;
    use std::sync::mpsc::{channel, Receiver, Sender};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationCacheRequest, IUIAutomationCondition,
        IUIAutomationElement, TreeScope_Children, UIA_BoundingRectanglePropertyId,
        UIA_ControlTypePropertyId,
    };

    /// 单次查询的内部时限：超过即放弃继续下钻（已找到的最小命中仍然有效）。
    /// 首次激活无障碍树的阻塞发生在单个 COM 调用内部，无法中断——由外层
    /// recv_timeout 兜底超时，本 deadline 只控制「层间」进度。
    const DEPTH_DEADLINE_MS: u64 = 160;
    /// 下钻最大层数。14 层足以触达主流应用的深层控件（浏览器网页内容树
    /// document>div>nav>ul>li>a… 实测 ≤10 层），再深的多为病态/装饰节点。
    const MAX_DEPTH: usize = 14;
    /// 单层子元素上限：超过视为病态树（如某些 Electron 全量 DOM 平铺），
    /// 继续遍历只会白烧 CPU，放弃下钻保响应性
    const MAX_CHILDREN: i32 = 600;

    enum Msg {
        Pick {
            hwnd: isize,
            win: ShotRect,
            x: i32,
            y: i32,
            resp: Sender<Option<ShotRect>>,
        },
        Reset,
    }

    static TX: Mutex<Option<Sender<Msg>>> = Mutex::new(None);

    fn worker() -> Option<Sender<Msg>> {
        let mut guard = TX.lock().unwrap();
        if let Some(tx) = guard.as_ref() {
            return Some(tx.clone());
        }
        let (tx, rx) = channel::<Msg>();
        let spawned = std::thread::Builder::new()
            .name("uia-pick".into())
            .spawn(move || run(rx))
            .is_ok();
        if spawned {
            *guard = Some(tx.clone());
            Some(tx)
        } else {
            None
        }
    }

    /// 查询全局物理坐标 (x,y) 处的最合适 UI 元素矩形。
    /// hwnd/win 来自呼出瞬间的窗口 Z 序快照（遮罩盖屏后活查必然命中遮罩自己）。
    /// timeout_ms 是等待结果的上限；超时返回 None（前端保持窗口级高亮）。
    pub fn pick(hwnd: isize, win: ShotRect, x: i32, y: i32, timeout_ms: u64) -> Option<ShotRect> {
        let tx = worker()?;
        let (rtx, rrx) = channel();
        tx.send(Msg::Pick { hwnd, win, x, y, resp: rtx }).ok()?;
        rrx.recv_timeout(Duration::from_millis(timeout_ms)).ok().flatten()
    }

    /// 会话结束清理：丢弃 memo（COM 元素引用随之释放，避免持有已销毁窗口）
    pub fn clear_cache() {
        let tx = TX.lock().unwrap().clone();
        if let Some(tx) = tx {
            let _ = tx.send(Msg::Reset);
        }
    }

    fn run(rx: Receiver<Msg>) {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        // UIA 实例线程内常驻：CoCreateInstance 只做一次（COM 接口非 Send，
        // 不能放全局，正好 worker 单线程独占）
        let mut auto: Option<IUIAutomation> = None;
        // 同点重复查询 memo：悬停静止时前端补查同坐标，直接复用上次结果零开销。
        // 带 250ms TTL——页面在光标下滚动时坐标不变但内容已换，过期强制重查
        let mut memo: Option<(isize, i32, i32, ShotRect, Instant)> = None;
        while let Ok(msg) = rx.recv() {
            // latest-wins：把队列里积压的旧请求全部排干，只留最新一条处理；
            // 被排掉的立即回 None（调用方早已超时离开，响应只是礼貌性收尾）
            let mut cur = msg;
            while let Ok(next) = rx.try_recv() {
                if let Msg::Pick { resp, .. } = &cur {
                    let _ = resp.send(None);
                }
                cur = next;
            }
            match cur {
                Msg::Reset => memo = None,
                Msg::Pick { hwnd, win, x, y, resp } => {
                    if let Some((mh, mx, my, mr, at)) = &memo {
                        if *mh == hwnd && *mx == x && *my == y && at.elapsed().as_millis() < 250 {
                            let _ = resp.send(Some(mr.clone()));
                            continue;
                        }
                    }
                    let r = query(&mut auto, hwnd, &win, x, y);
                    match &r {
                        Some(rr) => memo = Some((hwnd, x, y, rr.clone(), Instant::now())),
                        None => memo = None,
                    }
                    let _ = resp.send(r);
                }
            }
        }
    }

    #[inline]
    fn rect_contains(r: &RECT, x: i32, y: i32) -> bool {
        x >= r.left && x < r.right && y >= r.top && y < r.bottom
    }

    /// 交互控件类型（UIA_CONTROLTYPE_ID）：命中即停，不再下钻其内部文本/图标。
    /// Button=50000 CheckBox=50002 ComboBox=50003 Edit=50004 Hyperlink=50005
    /// ListItem=50007 MenuItem=50011 RadioButton=50013 Slider=50015
    /// Spinner=50016 TabItem=50019 TreeItem=50024 Thumb=50027 DataItem=50029
    /// SplitButton=50031
    #[inline]
    fn interactive(ct: i32) -> bool {
        matches!(
            ct,
            50000 | 50002 | 50003 | 50004 | 50005 | 50007 | 50011 | 50013 | 50015 | 50016
                | 50019 | 50024 | 50027 | 50029 | 50031
        )
    }

    fn query(
        auto_slot: &mut Option<IUIAutomation>,
        hwnd_raw: isize,
        win: &ShotRect,
        x: i32,
        y: i32,
    ) -> Option<ShotRect> {
        let auto = match auto_slot {
            Some(a) => a.clone(),
            None => {
                // 各线程首次使用需初始化 COM；已初始化（含模式不符）的错误忽略，
                // CoCreateInstance 仍可成功
                unsafe {
                    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                }
                let a: IUIAutomation =
                    unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()? };
                *auto_slot = Some(a.clone());
                a
            }
        };
        let deadline = Instant::now() + Duration::from_millis(DEPTH_DEADLINE_MS);
        unsafe {
            // 缓存请求：子元素枚举一次性批量带回矩形+控件类型。
            // 【每层 1 次跨进程往返】替代旧实现每层 N×2 次——性能数量级差距所在
            let creq: IUIAutomationCacheRequest = auto.CreateCacheRequest().ok()?;
            creq.SetTreeScope(TreeScope_Children).ok()?;
            let _ = creq.AddProperty(UIA_BoundingRectanglePropertyId);
            let _ = creq.AddProperty(UIA_ControlTypePropertyId);
            let cond: IUIAutomationCondition = auto.CreateTrueCondition().ok()?;

            let hwnd = HWND(hwnd_raw as *mut _);
            let (root_el, root_rect) = match auto.ElementFromHandleBuildCache(hwnd, &creq) {
                Ok(e) => match e.CachedBoundingRectangle() {
                    Ok(r) => (e, r),
                    Err(_) => return None,
                },
                Err(_) => {
                    // BuildCache 失败退普通路径（个别 provider 不支持缓存取根）
                    let e = auto.ElementFromHandle(hwnd).ok()?;
                    let r = e.CurrentBoundingRectangle().ok()?;
                    (e, r)
                }
            };
            // 根矩形必须包含该点：不包含说明窗口已移动/销毁、快照陈旧，
            // 此时任何下钻结果都不可信——交还窗口级识别兜底
            if !rect_contains(&root_rect, x, y) {
                return None;
            }

            // 下钻路径栈：栈底=窗口根，栈顶=当前最深命中。父容器信息用于组上浮
            let mut stack: Vec<(IUIAutomationElement, RECT)> = vec![(root_el, root_rect)];
            for _ in 0..MAX_DEPTH {
                if Instant::now() > deadline {
                    break;
                }
                let (cur_el, cur_rect) = stack.last().unwrap().clone();
                let children = match cur_el.FindAllBuildCache(TreeScope_Children, &cond, &creq) {
                    Ok(c) => c,
                    Err(_) => break,
                };
                let n = match children.Length() {
                    Ok(n) => n,
                    Err(_) => break,
                };
                if n == 0 || n > MAX_CHILDREN {
                    break;
                }
                let cur_area = (cur_rect.right - cur_rect.left) as i64
                    * (cur_rect.bottom - cur_rect.top) as i64;
                let mut best_el: Option<IUIAutomationElement> = None;
                let mut best_rect = RECT::default();
                let mut best_area: i64 = i64::MAX;
                let mut best_ct = 0i32;
                for i in 0..n {
                    let Ok(c) = children.GetElement(i) else { continue };
                    let Ok(r) = c.CachedBoundingRectangle() else { continue };
                    let w = r.right - r.left;
                    let h = r.bottom - r.top;
                    // 噪点过滤：分隔线/零高容器/折叠态空矩形不做选区目标
                    if w < 6 || h < 6 {
                        continue;
                    }
                    if !rect_contains(&r, x, y) {
                        continue;
                    }
                    let a = w as i64 * h as i64;
                    if a < best_area {
                        best_area = a;
                        best_rect = r;
                        best_ct = c.CachedControlType().map(|t| t.0).unwrap_or(50025); // 非 Custom 即 Pane 兜底
                        best_el = Some(c);
                    }
                }
                let Some(child) = best_el else { break };
                // 不接受比父级更大/等大的"子"（防环防异常 provider）
                if best_area >= cur_area {
                    break;
                }
                let stop = interactive(best_ct);
                stack.push((child, best_rect));
                if stop {
                    break;
                }
            }

            // 组上浮：最终命中是极小的纯 Text(50020)/Image(50006) 叶子，且其
            // 父容器下有 ≥3 个同型子元素（一排同类项），则选整组父容器——
            // "按钮组/导航项组"语义。常规单件（按钮本体等）不受影响
            let (final_el, final_rect, parent) = {
                let top = stack.last().unwrap();
                let parent = if stack.len() >= 2 { Some(stack[stack.len() - 2].clone()) } else { None };
                (top.0.clone(), top.1, parent)
            };
            let fw = final_rect.right - final_rect.left;
            let fh = final_rect.bottom - final_rect.top;
            let fct = final_el.CachedControlType().map(|t| t.0).unwrap_or(50025);
            let mut out_rect = final_rect;
            if (fct == 50020 || fct == 50006) && fw < 40 && fh < 28 {
                if let Some((pel, prect)) = parent {
                    if let Ok(sibs) = pel.FindAllBuildCache(TreeScope_Children, &cond, &creq) {
                        if let Ok(sn) = sibs.Length() {
                            if sn >= 3 && sn <= MAX_CHILDREN {
                                let mut same = 0i32;
                                for i in 0..sn {
                                    if let Ok(s) = sibs.GetElement(i) {
                                        if s.CachedControlType().map(|t| t.0).unwrap_or(0) == fct {
                                            same += 1;
                                        }
                                    }
                                }
                                if same >= 3 {
                                    out_rect = prect;
                                }
                            }
                        }
                    }
                }
            }

            let ow = out_rect.right - out_rect.left;
            let oh = out_rect.bottom - out_rect.top;
            // 过小视为噪点命中；与窗口几乎等大 = 下钻失败停在根上，
            // 都交还窗口级识别（避免与窗口高亮重复）
            if ow < 10 || oh < 10 {
                return None;
            }
            if ow >= win.width as i32 && oh >= win.height as i32 {
                return None;
            }
            // 元素矩形必须落在窗口可见边界内（±1px 容忍 DWM 舍入）：UIA 树里
            // 不少容器带阴影余量，最大化窗口宿主甚至会越出屏幕——采纳它高亮框
            // 就缺一截/出屏。越界即放弃元素级
            let tol = 1;
            let wx = win.x;
            let wy = win.y;
            let wr = wx + win.width as i32;
            let wb = wy + win.height as i32;
            if out_rect.left < wx - tol
                || out_rect.top < wy - tol
                || out_rect.right > wr + tol
                || out_rect.bottom > wb + tol
            {
                return None;
            }
            Some(ShotRect {
                x: out_rect.left,
                y: out_rect.top,
                width: ow.max(0) as u32,
                height: oh.max(0) as u32,
            })
        }
    }
}
