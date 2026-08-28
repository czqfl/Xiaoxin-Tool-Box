//! UIA 元素级智能选区：专用工作线程 + 带回溯 DFS 逐层下钻。
//!
//! 【为什么是独立线程】UIA 查询可能因目标进程无障碍树首次激活而阻塞数百毫秒
//! 甚至秒级（Chromium 系浏览器最典型）。同步命令跑在主线程会卡住整个应用；
//! 直接丢 tokio 池也会占住 worker 且请求会无序堆积。专用线程 + latest-wins：
//! 悬停识别永远只处理【最新】光标位置，排队中的陈旧请求立即回 None 放弃。
//!
//! 【为什么绝不用 BuildCache/FindAllBuildCache】实测（examples/uia_probe.rs）：
//! · 对 ElementFromHandleBuildCache 返回的元素调 FindAllBuildCache 必然失败
//!   （0x80004005：缓存元素仅支持 GetCachedParent/GetCachedChildren——UIA 规范
//!   行为，所有 provider 一致）。旧实现第一步即死，元素级识别从未生效过。
//! · FindAllBuildCache 返回的子元素在 Chrome 上是"空壳"（缓存属性全空，
//!   CachedBoundingRectangle 全部报错）；且 Descendants 全子树物化要 2.7s
//!   （1908 节点，热态同样），完全不可用。
//! 可行路径 = 不带缓存的 ElementFromHandle 裸根 + 每层 FindAll(Children)
//! + CurrentBoundingRectangle 直读（实测 Chrome 每层 7~10ms）。
//!
//! 【为什么必须回溯（DFS）】Chrome 窗口根下有两个同矩形 Custom 子元素，
//! 贪心"最小面积"会选进第一个【空分支】直接到头（depth=0）。带回溯的
//! DFS 逐候选尝试，实测 53ms 触达 13 层深的真实内容元素。
//!
//! 【识别语义】（对齐 Snipaste 手感）
//! · 候选链 = 最内层命中 + 沿 raw 视图【向上父链】（内→外），供前端滚轮切换：
//!   按钮 → 工具条 → 面板 → 整窗
//! · 【为什么链不能直接用 DFS 下钻路径】实测（examples/uia_chain_dump.rs）：
//!   Chromium 的 FindAll(Children) 返回的是【扁平化】子列表——整页 300+ 个控件
//!   平铺在页面 Document 之下，DOM 的容器 div（卡片/网格块/主内容区）不在下钻
//!   路径上，于是链只剩"最小碎片 + 整页 + 整窗"，中级单元全丢。同一坐标改走
//!   GetParentElement 向上，则能拿到 detail-info 378x37 → task-card 448x157 →
//!   vue-grid-item 480x358 → app-main ... 完整层级（Qt/VCL 同理，TPanel →
//!   TTabSheet → TPageControl）。故 DFS 只负责【定位最内层命中】，层级由父链给。
//! · 链最内端是非交互的小 Text/Image 碎片时自动回退最近可交互祖先
//! · <6px 噪点（分隔线等）不入链；<10px、与窗口等大的矩形被剔除；越出窗口可见
//!   边界的矩形【裁剪】到边界（网页容器溢出视口是常态，丢弃会白丢中级层）。
//!   全链为空返回 None，前端自动保持窗口级高亮
//!
//! 【Warm 预热】呼出截图时对光标下窗口发一次轻量查询（结果丢弃），
//! 提前触发 Chromium 无障碍树激活——否则首次悬停要陪 provider 激活
//! 等到超时，表现为"浏览器里智能选区第一次永远没反应"。

#[cfg(windows)]
pub use imp::{clear_cache, pick, warm};

#[cfg(not(windows))]
pub fn clear_cache() {}

#[cfg(not(windows))]
pub fn pick(
    _hwnd: isize,
    _win: crate::screenshot::ShotRect,
    _x: i32,
    _y: i32,
    _timeout_ms: u64,
) -> Option<Vec<crate::screenshot::ShotRect>> {
    None
}

#[cfg(not(windows))]
pub fn warm(_hwnd: isize) {}

#[cfg(windows)]
mod imp {
    use crate::screenshot::ShotRect;
    use std::collections::{HashMap, HashSet};
    use std::sync::mpsc::{channel, Receiver, Sender};
    use std::sync::{LazyLock, Mutex};
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationCondition, IUIAutomationElement,
        IUIAutomationTreeWalker, TreeScope_Children,
    };

    /// DFS 探索软时限：超时即收手，用已找到的最优路径出结果。
    /// 【时限链条】DFS 130ms + 父链上探 25ms < 命令侧 recv_timeout 300ms
    /// < 前端竞速窗口 320ms——任何一环超出，结果都会被整批丢弃（前端竞速拿不到、
    /// 迟到采纳拿到的是 null），表现为"高亮卡死不更新"。Qt 系应用（Navicat 等）
    /// provider 每次跨进程调用 5~6ms（Chrome 约 0.3ms，差 15~20 倍），190ms 时限
    /// 下查询要 250~320ms 全部超窗；130ms 收手后 ~140-180ms 送达，竞速窗口内正常
    /// 提交。代价是慢 provider 链更浅——原本也只钻到 1~2 层。快速 provider
    /// （Chrome 30~60ms）完全不受影响。
    const DFS_DEADLINE_MS: u64 = 130;
    /// 下钻最大层数。14 层足以触达主流应用的深层控件（浏览器网页内容树
    /// 实测 ≤13 层），再深的多为病态/装饰节点。
    const MAX_DEPTH: usize = 14;
    /// 单次查询访问元素数上限（含读取矩形失败的）：约 320×0.45ms≈145ms，
    /// 通常先于时间兜底触发，保证确定性。
    const MAX_VISITED: i32 = 320;
    /// 单次查询 FindAll 展开数上限：防"宽浅树"（每层子节点极多）时
    /// FindAll 的 provider 侧开销失控。
    const MAX_EXPANDED: i32 = 50;
    /// 候选链最大层数（内→外）：父链实测能给出 6~9 个有意义层级（碎片→控件→
    /// 行→卡片→区块→主内容区→页面），8 会把卡片以上的区块裁掉，故取 10；
    /// 更外层用户直接用窗口级高亮。
    const MAX_CHAIN: usize = 10;
    /// 相邻两层面积差小于该比例视为"同层"合并（几乎等大的嵌套 div 很多，
    /// 不合并的话滚轮要滚很多下才见变化）。同时天然排除"面积反而比子级小"的
    /// 被裁剪父级（overflow 容器比溢出内容小）。
    const MERGE_RATIO: f64 = 1.05;
    /// 向上父链最大跳数。父链没有天然终点——实测能从窗口内一路走到桌面元素
    /// （class="#32769" name="桌面 1"），必须限跳数 + 到根矩形即停。
    const PARENT_HOPS: usize = 16;
    /// 向上父链独立时间预算：每一跳都是一次跨进程调用，Chrome ~0.3ms 但
    /// Qt/VCL 系 5~6ms，不设预算 16 跳就能吃掉整个 DFS 时限（130ms）。
    /// 25ms ≈ 慢 provider 下 4~5 跳，够拿到"控件→面板→区块"这几层。
    const PARENT_BUDGET_MS: u64 = 25;

    /// 元素矩形缓存有效期：截图后画面定格、目标应用不再变化，树不会失真，
    /// TTL 放宽到 30 秒——期内悬停命中缓存即亚毫秒返回
    const CACHE_TTL_MS: u128 = 30_000;
    /// 单次整树预建的节点/时间上限：防病态巨型树把后台线程拖死
    const BUILD_NODE_CAP: usize = 6000;
    const BUILD_TIME_MS: u64 = 4000;

    /// 缓存元素：物理矩形 + 控件类型（后者只在交互修正里用）
    struct Elem {
        x: i32,
        y: i32,
        w: i32,
        h: i32,
        ct: i32,
    }
    struct TreeCache {
        elems: Vec<Elem>,
        built: Instant,
    }
    /// hwnd → 整树元素矩形表（后台线程建，worker 线程读）
    static CACHE: LazyLock<Mutex<HashMap<isize, TreeCache>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));
    /// 后台建表线程的投递端
    static BTX: Mutex<Option<Sender<isize>>> = Mutex::new(None);
    /// 正在建表的窗口集合：防止同一窗口被重复提交建表
    static BUILDING: LazyLock<Mutex<HashSet<isize>>> =
        LazyLock::new(|| Mutex::new(HashSet::new()));

    enum Msg {
        Pick {
            hwnd: isize,
            win: ShotRect,
            x: i32,
            y: i32,
            resp: Sender<Option<Vec<ShotRect>>>,
        },
        /// 呼出预热：轻量查询触发 provider（尤其 Chromium）无障碍树激活，结果丢弃
        Warm { hwnd: isize },
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

    /// 查询全局物理坐标 (x,y) 处的元素候选链（内→外有序，最内层最精确）。
    /// hwnd/win 来自呼出瞬间的窗口 Z 序快照（遮罩盖屏后活查必然命中遮罩自己）。
    /// timeout_ms 是等待结果的上限；超时返回 None（前端保持窗口级高亮）。
    pub fn pick(
        hwnd: isize,
        win: ShotRect,
        x: i32,
        y: i32,
        timeout_ms: u64,
    ) -> Option<Vec<ShotRect>> {
        let tx = worker()?;
        let (rtx, rrx) = channel();
        tx.send(Msg::Pick { hwnd, win, x, y, resp: rtx }).ok()?;
        rrx.recv_timeout(Duration::from_millis(timeout_ms)).ok().flatten()
    }

    /// 呼出预热：fire-and-forget，不等待结果。目的只是"敲一下门"让
    /// Chromium 切入完整无障碍模式（首次激活可达秒级，等用户真正悬停
    /// 时树已就绪，首查即命中）。
    pub fn warm(hwnd: isize) {
        if let Some(tx) = worker() {
            let _ = tx.send(Msg::Warm { hwnd });
        }
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
        // 带 400ms TTL——页面在光标下滚动时坐标不变但内容已换，过期强制重查
        let mut memo: Option<(isize, i32, i32, Vec<ShotRect>, Instant)> = None;
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
                Msg::Reset => {
                    memo = None;
                    CACHE.lock().unwrap().clear();
                    BUILDING.lock().unwrap().clear();
                }
                Msg::Warm { hwnd } => {
                    warm_probe(&mut auto, hwnd);
                    request_build(hwnd);
                }
                Msg::Pick { hwnd, win, x, y, resp } => {
                    // 快路径：后台预建的元素矩形缓存——命中即纯内存点-矩形
                    // 命中，亚毫秒返回，不跨进程。截图后画面定格，缓存内悬停
                    // 始终跟手；未命中则提交后台预建，之后的悬停即可吃上缓存
                    let cached = {
                        let cache = CACHE.lock().unwrap();
                        match cache.get(&hwnd) {
                            Some(tc) if tc.built.elapsed().as_millis() < CACHE_TTL_MS => {
                                chain_from_cache(tc, x, y, &win)
                            }
                            _ => None,
                        }
                    };
                    if let Some(chain) = cached {
                        crate::storage::diag_write(&format!(
                            "[uia] pick@({x},{y}) hwnd={hwnd:#x} CACHE chain={}",
                            chain.len()
                        ));
                        let _ = resp.send(Some(chain));
                        continue;
                    }
                    request_build(hwnd);
                    if let Some((mh, mx, my, mr, at)) = &memo {
                        // 邻近复用：新点落在记忆链【最内层】矩形内、且该层足够小
                        // （≤200×200，即真实控件而非大容器）时直接复用——悬停微调
                        // /扫过控件内部免掉整趟 DFS（30~50ms 的 provider 树遍历），
                        // 是悬停跟手的主要提速点。大容器不复用：其内部更小组件
                        // 必须重新下钻才能发现
                        let inside_inner = mr.first().map(|r| {
                            let w = r.width as i32;
                            let h = r.height as i32;
                            w * h < 40_000 && x >= r.x && x < r.x + w && y >= r.y && y < r.y + h
                        }).unwrap_or(false);
                        if *mh == hwnd && at.elapsed().as_millis() < 400
                            && (inside_inner || (*mx == x && *my == y)) {
                            let _ = resp.send(Some(mr.clone()));
                            continue;
                        }
                    }
                    let t0 = Instant::now();
                    let r = query(&mut auto, hwnd, &win, x, y);
                    // 诊断：悬停识别失效时对照（duration 恒 300ms=等待超时；
                    // hit=false 且 duration 小=快速无命中；chain=候选链层数）
                    crate::storage::diag_write(&format!(
                        "[uia] pick@({x},{y}) hwnd={hwnd:#x} hit={} chain={} {}ms",
                        r.is_some(),
                        r.as_ref().map(|c| c.len()).unwrap_or(0),
                        t0.elapsed().as_millis(),
                    ));
                    match &r {
                        Some(rr) => memo = Some((hwnd, x, y, rr.clone(), Instant::now())),
                        None => memo = None,
                    }
                    let _ = resp.send(r);
                }
            }
        }
    }

    /// 预热探测：ElementFromHandle + 一次轻量 FindAll，结果全部丢弃。
    /// 目的是触发 provider 侧无障碍树激活/缓存，任何失败都无所谓。
    fn warm_probe(auto_slot: &mut Option<IUIAutomation>, hwnd_raw: isize) {
        let Ok(auto) = ensure_auto(auto_slot) else { return };
        unsafe {
            let hwnd = HWND(hwnd_raw as *mut _);
            if let Ok(root) = auto.ElementFromHandle(hwnd) {
                if let Ok(cond) = auto.CreateTrueCondition() {
                    if let Ok(c) = root.FindAll(TreeScope_Children, &cond) {
                        let _ = c.Length();
                    }
                }
            }
        }
    }

    /// 提交一次后台整树预建（幂等）：缓存仍新或已在建都直接跳过，
    /// 否则登记在建并投递到建表线程。
    fn request_build(hwnd: isize) {
        let fresh = CACHE
            .lock()
            .unwrap()
            .get(&hwnd)
            .is_some_and(|tc| tc.built.elapsed().as_millis() < CACHE_TTL_MS);
        if fresh || !BUILDING.lock().unwrap().insert(hwnd) {
            return;
        }
        if ensure_builder().and_then(|tx| tx.send(hwnd).ok()).is_none() {
            BUILDING.lock().unwrap().remove(&hwnd);
        }
    }

    /// 懒启动建表线程并返回投递端（常驻，单线程独占自己的 COM 实例）。
    fn ensure_builder() -> Option<Sender<isize>> {
        let mut g = BTX.lock().unwrap();
        if let Some(tx) = g.as_ref() {
            return Some(tx.clone());
        }
        let (tx, rx) = channel::<isize>();
        if std::thread::Builder::new()
            .name("uia-build".into())
            .spawn(move || builder_worker(rx))
            .is_err()
        {
            return None;
        }
        *g = Some(tx.clone());
        Some(tx)
    }

    /// 建表线程主循环：独立 COM 实例；排干积压并按 hwnd 去重，一次建一批。
    fn builder_worker(rx: Receiver<isize>) {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        let mut auto: Option<IUIAutomation> = None;
        while let Ok(first) = rx.recv() {
            let mut todo = vec![first];
            while let Ok(h) = rx.try_recv() {
                if !todo.contains(&h) {
                    todo.push(h);
                }
            }
            for h in todo {
                build_tree(&mut auto, h);
                BUILDING.lock().unwrap().remove(&h);
            }
        }
    }

    /// RawViewWalker 深度遍历，收集整棵树的物理矩形 + 控件类型进缓存。
    /// 用 raw 视图是因为 FindAll(Children) 在 Chromium 上是扁平的，拿不到
    /// 卡片/面板这类中间容器；父/子导航（GetFirstChild/GetNextSibling）才有真嵌套。
    /// 受节点数与时间双上限约束，防病态巨型树拖死后台线程。
    fn build_tree(auto_slot: &mut Option<IUIAutomation>, hwnd_raw: isize) {
        let Ok(auto) = ensure_auto(auto_slot) else { return };
        let Ok(walker) = (unsafe { auto.RawViewWalker() }) else { return };
        let Ok(root) = (unsafe { auto.ElementFromHandle(HWND(hwnd_raw as *mut _)) }) else { return };
        let t0 = Instant::now();
        let mut elems: Vec<Elem> = Vec::new();
        let mut stack: Vec<IUIAutomationElement> = vec![root];
        while let Some(el) = stack.pop() {
            if elems.len() >= BUILD_NODE_CAP || t0.elapsed().as_millis() as u64 > BUILD_TIME_MS {
                break;
            }
            if let Ok(r) = unsafe { el.CurrentBoundingRectangle() } {
                let (w, h) = (r.right - r.left, r.bottom - r.top);
                if w >= 6 && h >= 6 {
                    let ct = unsafe { el.CurrentControlType() }.map(|t| t.0).unwrap_or(50025);
                    elems.push(Elem { x: r.left, y: r.top, w, h, ct });
                }
            }
            // 子元素：GetFirstChild 起、GetNextSibling 串，逆序压栈保持先左后右
            let mut kids: Vec<IUIAutomationElement> = Vec::new();
            let mut c = unsafe { walker.GetFirstChildElement(&el) };
            while let Ok(ch) = c {
                if kids.len() >= 400 {
                    break;
                }
                kids.push(ch.clone());
                c = unsafe { walker.GetNextSiblingElement(&ch) };
            }
            stack.extend(kids.into_iter().rev());
        }
        if !elems.is_empty() {
            CACHE
                .lock()
                .unwrap()
                .insert(hwnd_raw, TreeCache { elems, built: Instant::now() });
        }
    }

    /// 从某窗口的新鲜缓存里建候选链：过滤出含点元素、按面积升序（内→外），
    /// 复用现有 build_chain（近等大合并 + 交互修正）与 filter_chain（裁剪窗口）。
    /// 纯内存，无任何跨进程调用。
    fn chain_from_cache(tc: &TreeCache, x: i32, y: i32, win: &ShotRect) -> Option<Vec<ShotRect>> {
        let mut hits: Vec<(RECT, i32)> = tc
            .elems
            .iter()
            .filter(|e| x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h)
            .map(|e| {
                (
                    RECT { left: e.x, top: e.y, right: e.x + e.w, bottom: e.y + e.h },
                    e.ct,
                )
            })
            .collect();
        if hits.is_empty() {
            return None;
        }
        hits.sort_by_key(|(r, _)| rect_area(r));
        filter_chain(build_chain(hits), win)
    }

    #[inline]
    fn rect_contains(r: &RECT, x: i32, y: i32) -> bool {
        x >= r.left && x < r.right && y >= r.top && y < r.bottom
    }

    #[inline]
    fn same_rect(a: &RECT, b: &RECT) -> bool {
        a.left == b.left && a.top == b.top && a.right == b.right && a.bottom == b.bottom
    }

    #[inline]
    fn rect_area(r: &RECT) -> i64 {
        (r.right - r.left).max(0) as i64 * (r.bottom - r.top).max(0) as i64
    }

    /// 交互控件类型（UIA_CONTROLTYPE_ID）：作为链最内端时不再向内细化。
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

    fn ensure_auto(auto_slot: &mut Option<IUIAutomation>) -> Result<IUIAutomation, ()> {
        match auto_slot {
            Some(a) => Ok(a.clone()),
            None => {
                // 各线程首次使用需初始化 COM；已初始化（含模式不符）的错误忽略，
                // CoCreateInstance 仍可成功
                unsafe {
                    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
                }
                let a: IUIAutomation = unsafe {
                    CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).map_err(|_| ())?
                };
                *auto_slot = Some(a.clone());
                Ok(a)
            }
        }
    }

    /// DFS 状态：path 为当前根→当前元素的矩形路径（含控件类型），
    /// best_path 为目前最优（最深、同深最小面积）路径快照。
    /// 【性能】best_path 存元素引用、控件类型留待最终统一读——旧写法在每次
    /// "更优命中"时重读整条路径的 ControlType（每次最多 14 次跨进程调用，
    /// 一次 DFS 改善几十次），是复杂页面上查询拖到时限的主要开销之一
    struct DfsState {
        cond: IUIAutomationCondition,
        x: i32,
        y: i32,
        deadline: Instant,
        visited: i32,
        expanded: i32,
        best_depth: u32,
        best_area: i64,
        best_path: Vec<(RECT, IUIAutomationElement)>,
        path: Vec<(RECT, IUIAutomationElement)>,
    }

    /// 带回溯 DFS 下钻。候选按面积升序尝试（先精确后粗略），
    /// 空分支自动回退到同层兄弟——Chrome 双分支陷阱的解药。
    fn dfs(st: &mut DfsState, el: &IUIAutomationElement, depth: u32) {
        if depth as usize > MAX_DEPTH
            || st.visited >= MAX_VISITED
            || st.expanded >= MAX_EXPANDED
            || Instant::now() > st.deadline
        {
            return;
        }
        let Ok(children) = (unsafe { el.FindAll(TreeScope_Children, &st.cond) }) else { return };
        st.expanded += 1;
        let Ok(n) = (unsafe { children.Length() }) else { return };
        // 收集包含光标点的候选（≥6px 噪点过滤），按面积升序
        let mut cands: Vec<(i64, RECT, IUIAutomationElement)> = Vec::new();
        for i in 0..n {
            // 【循环内查预算】Chromium 会把整页 300+ 控件扁平铺在页面 Document
            // 一层，每个子元素要 1 次 GetElement + 1 次 CurrentBoundingRectangle
            // 跨进程调用，单层枚举实测 200~590ms。只在 dfs 入口查预算的后果是
            // "枚举烧光时限 → 递归立刻返回 → 链照样浅 → 整趟查询还被命令侧
            // recv_timeout 整批丢弃"（浏览器里智能选区经常完全不出）。
            // 就地收手至少能把已看到的候选交出去。
            if st.visited >= MAX_VISITED || Instant::now() > st.deadline {
                break;
            }
            st.visited += 1;
            let Ok(c) = (unsafe { children.GetElement(i) }) else { continue };
            let Ok(r) = (unsafe { c.CurrentBoundingRectangle() }) else { continue };
            let w = r.right - r.left;
            let h = r.bottom - r.top;
            if w < 6 || h < 6 || !rect_contains(&r, st.x, st.y) {
                continue;
            }
            cands.push((w as i64 * h as i64, r, c));
        }
        cands.sort_by_key(|(a, _, _)| *a);
        // 【同矩形兄弟自适应去重】Chrome 窗口根下常有完全同矩形的分支
        // （一个空壳一个内容树），不处理会钻进空壳到头；无脑去重又会跳过
        // 内容分支。规则：同矩形分支只在先前同矩形分支【无产出】时才尝试
        // ——杀掉重复探索，又不丢内容。探索顺序固定 ⇒ 确定性。
        let mut explored: Vec<(RECT, bool)> = Vec::new();
        for (a, r, c) in &cands {
            if let Some((_, true)) = explored.iter().find(|(er, _)| er == r) {
                continue;
            }
            st.path.push((r.clone(), c.clone()));
            // 最优判定：更深，或同深更小面积
            let better = depth > st.best_depth || (depth == st.best_depth && *a < st.best_area);
            if better {
                st.best_depth = depth;
                st.best_area = *a;
                st.best_path = st.path.clone();
            }
            // 产出判定只看【子树是否钻出更深的元素】：候选自己成为最优不算
            // （首次访问必然深度+1，空壳分支也会"命中自己"，算产出会漏掉
            // Chrome 空壳分支后面真正有内容的同矩形分支）
            let subtree_before = st.best_depth;
            dfs(st, c, depth + 1);
            st.path.pop();
            let productive = st.best_depth > subtree_before;
            if let Some(e) = explored.iter_mut().find(|(er, _)| er == r) {
                e.1 = productive;
            } else {
                explored.push((r.clone(), productive));
            }
            if Instant::now() > st.deadline {
                return;
            }
        }
    }

    /// 从最内层命中沿 raw 视图【向上】收集祖先矩形，返回内→外有序列表。
    /// 这是候选层的唯一合法来源（见模块头：Chromium 的 FindAll 子列表是扁平的，
    /// 下钻路径拿不到 DOM 容器层级）。
    /// 【终点判定】父链没有天然终点：与根矩形等值即停；控件类型已是 Window 即停
    /// （再向上实测会走到桌面 "#32769"，高亮会框到别的窗口外面去）。
    fn parent_chain(
        walker: &IUIAutomationTreeWalker,
        inner: &IUIAutomationElement,
        root_rect: &RECT,
    ) -> Vec<(RECT, i32)> {
        let mut out: Vec<(RECT, i32)> = Vec::with_capacity(PARENT_HOPS);
        let mut cur = inner.clone();
        let t0 = Instant::now();
        unsafe {
            for hop in 0..PARENT_HOPS {
                let r = match cur.CurrentBoundingRectangle() {
                    Ok(r) => r,
                    Err(_) => break,
                };
                let ct = cur.CurrentControlType().map(|t| t.0).unwrap_or(50025);
                out.push((r.clone(), ct));
                // 时间预算在 push 之后判：慢 provider 至少已拿到最内层+1~2 个祖先
                if hop + 1 >= PARENT_HOPS || t0.elapsed().as_millis() as u64 > PARENT_BUDGET_MS {
                    break;
                }
                if same_rect(&r, root_rect) || ct == 50032 {
                    break;
                }
                match walker.GetParentElement(&cur) {
                    Ok(p) => cur = p,
                    Err(_) => break,
                }
            }
        }
        out
    }

    /// 从"内→外有序的父链"构建候选链：等矩形跳过、近等大合并、
    /// 交互控件修正、截断上限。
    fn build_chain(path: Vec<(RECT, i32)>) -> Vec<ShotRect> {
        if path.is_empty() {
            return Vec::new();
        }
        // 【不能按面积重排】父链天然内→外，但被 overflow 裁剪的父级面积可能
        // 小于子级（实测 vue-grid-layout 1471x1106 比其父 main-web-container
        // 1471x818 更大），按面积排序会把祖先顺序打乱、滚轮档位随之错乱
        let mut layered: Vec<(RECT, i32)> = Vec::with_capacity(path.len());
        for (r, ct) in path {
            if let Some((pr, _)) = layered.last() {
                if same_rect(pr, &r) {
                    continue;
                }
                // 与上一层面积差 <5% 视为同层；比上一层更小的（裁剪父级）同规则排除
                if (rect_area(&r) as f64) < (rect_area(pr) as f64) * MERGE_RATIO {
                    continue;
                }
            }
            layered.push((r, ct));
        }
        // 交互控件修正：最内端是非交互的小 Text/Image 碎片（<40×28）时，
        // 回退到最近的可交互祖先——不高亮按钮内部的文本切片
        let inner = match layered.first() {
            Some((r, ct)) if !interactive(*ct) && r.right - r.left < 40 && r.bottom - r.top < 28 => {
                layered.iter().position(|(_, c)| interactive(*c)).unwrap_or(0)
            }
            _ => 0,
        };
        layered[inner..]
            .iter()
            .take(MAX_CHAIN)
            .map(|(r, _)| ShotRect {
                x: r.left,
                y: r.top,
                width: (r.right - r.left).max(0) as u32,
                height: (r.bottom - r.top).max(0) as u32,
            })
            .collect()
    }

    /// 链收尾过滤：尺寸兜底 + 越界【裁剪】+ 与窗口等大剔除。
    /// 越界的矩形裁剪到窗口可见边界而不是丢弃：网页容器溢出视口是常态
    /// （滚动区、绝对定位浮层），丢弃会白丢一个中级层，裁剪后仍是有效选区。
    /// 全部被滤掉返回 None → 前端保持窗口级高亮。
    fn filter_chain(chain: Vec<ShotRect>, win: &ShotRect) -> Option<Vec<ShotRect>> {
        let wx = win.x;
        let wy = win.y;
        let wr = wx + win.width as i32;
        let wb = wy + win.height as i32;
        let mut kept: Vec<ShotRect> = Vec::with_capacity(chain.len());
        for r in chain {
            let l = r.x.max(wx);
            let t = r.y.max(wy);
            let ri = (r.x + r.width as i32).min(wr);
            let b = (r.y + r.height as i32).min(wb);
            let w = ri - l;
            let h = b - t;
            if w < 10 || h < 10 {
                continue;
            }
            // 与窗口等大 = 下钻到顶了，交还给前端补的窗口层，不占档位
            if w >= win.width as i32 && h >= win.height as i32 {
                continue;
            }
            let nr = ShotRect { x: l, y: t, width: w as u32, height: h as u32 };
            // 裁剪后可能与相邻层重合（都被裁成视口大小）→ 相邻等矩形去重
            if let Some(last) = kept.last() {
                if last.x == nr.x && last.y == nr.y && last.width == nr.width && last.height == nr.height
                {
                    continue;
                }
            }
            kept.push(nr);
        }
        if kept.is_empty() { None } else { Some(kept) }
    }

    fn query(
        auto_slot: &mut Option<IUIAutomation>,
        hwnd_raw: isize,
        win: &ShotRect,
        x: i32,
        y: i32,
    ) -> Option<Vec<ShotRect>> {
        let auto = ensure_auto(auto_slot).ok()?;
        unsafe {
            // 【必须用不带缓存的 ElementFromHandle】BuildCache 变体返回的元素
            // 不允许 Find*（见模块头注释）；根矩形用 Current 直读
            let hwnd = HWND(hwnd_raw as *mut _);
            let root = auto.ElementFromHandle(hwnd).ok()?;
            let root_rect = root.CurrentBoundingRectangle().ok()?;
            // 根矩形必须包含该点：不包含说明窗口已移动/销毁、快照陈旧，
            // 此时任何下钻结果都不可信——交还窗口级识别兜底
            if !rect_contains(&root_rect, x, y) {
                return None;
            }
            let cond = auto.CreateTrueCondition().ok()?;
            let mut st = DfsState {
                cond,
                x,
                y,
                deadline: Instant::now() + Duration::from_millis(DFS_DEADLINE_MS),
                visited: 0,
                expanded: 0,
                best_depth: 0,
                best_area: i64::MAX,
                // 根自身作为初始最优（depth=0）：无更深的命中时链只剩根，
                // 经 filter_chain 的"与窗口等大"过滤自然回 None → 窗口级兜底
                best_path: vec![(root_rect, root.clone())],
                path: vec![(root_rect, root.clone())],
            };
            dfs(&mut st, &root, 1);
            // 链的层级来源 = 最内层命中的【向上父链】（见模块头实测说明）
            let hits: Vec<(RECT, i32)> = match auto.RawViewWalker() {
                Ok(walker) => match st.best_path.last() {
                    Some((_, el)) => parent_chain(&walker, el, &root_rect),
                    None => Vec::new(),
                },
                // walker 不可用（个别 provider）：退回下钻路径，聊胜于无
                Err(_) => st
                    .best_path
                    .iter()
                    .rev()
                    .map(|(r, e)| {
                        let ct = e.CurrentControlType().map(|t| t.0).unwrap_or(50025);
                        (r.clone(), ct)
                    })
                    .collect(),
            };
            filter_chain(build_chain(hits), win)
        }
    }
}
