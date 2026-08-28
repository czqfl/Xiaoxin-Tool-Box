//! 智能选区候选链诊断探针（诊断用，不进发布路径）：
//! cargo run --example uia_chain_dump -- [窗口标题子串|0xhwnd] [x y|auto|grid]
//!
//! 复刻 uia_pick.rs 的完整管线（DFS 带回溯 → build_chain → filter_chain），
//! 但把每一级的输入/输出连同"被谁杀掉"全部打印出来，用于回答：
//! · 光标处的 UIA 树到底有几层嵌套（seen）
//! · DFS 实际选出的 best_path 有几层
//! · 近等大合并(MERGE_RATIO) 吃掉了哪几层
//! · 链收尾过滤(尺寸/越界) 又吃掉了哪几层
//! 默认探测鼠标所在窗口，坐标缺省取窗口中心，`grid` 则采样 3x3 内容点。

use std::time::{Duration, Instant};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationCacheRequest, IUIAutomationCondition,
    IUIAutomationElement, TreeScope_Children, UIA_BoundingRectanglePropertyId, UIA_ControlTypePropertyId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetAncestor, GetCursorPos, GetWindowTextW, GetWindowRect, IsIconic,
    IsWindowVisible, WindowFromPoint, GA_ROOT,
};

fn env_i(name: &str, def: i32) -> i32 {
    std::env::var(name).ok().and_then(|v| v.parse().ok()).unwrap_or(def)
}
fn env_u64(name: &str, def: u64) -> u64 {
    std::env::var(name).ok().and_then(|v| v.parse().ok()).unwrap_or(def)
}

const MAX_DEPTH: usize = 14;
const MAX_CHAIN: usize = 10;
const MERGE_RATIO: f64 = 1.05;
const PARENT_HOPS: usize = 16;
const PARENT_BUDGET_MS: u64 = 25;

fn rect_contains(r: &RECT, x: i32, y: i32) -> bool {
    x >= r.left && x < r.right && y >= r.top && y < r.bottom
}
fn area(r: &RECT) -> i64 {
    (r.right - r.left) as i64 * (r.bottom - r.top) as i64
}
fn same_rect(a: &RECT, b: &RECT) -> bool {
    a.left == b.left && a.top == b.top && a.right == b.right && a.bottom == b.bottom
}
fn fmt_rect(r: &RECT) -> String {
    format!("{}x{}@{},{}", r.right - r.left, r.bottom - r.top, r.left, r.top)
}

fn ct_name(ct: i32) -> &'static str {
    match ct {
        50000 => "Button", 50002 => "CheckBox", 50003 => "ComboBox", 50004 => "Edit",
        50005 => "Hyperlink", 50006 => "Image", 50007 => "ListItem", 50008 => "List",
        50011 => "MenuItem", 50013 => "RadioButton", 50015 => "Slider", 50016 => "Spinner",
        50018 => "Tab", 50019 => "TabItem", 50020 => "Text", 50021 => "ToolBar",
        50023 => "Tree", 50024 => "TreeItem", 50025 => "Pane", 50026 => "Custom",
        50027 => "Thumb", 50028 => "DataGrid", 50029 => "DataItem", 50030 => "Group",
        50031 => "SplitButton", 50032 => "Window", 50033 => "Document", 50034 => "Splitter",
        50035 => "ToolTip", 50036 => "MenuBar", 50037 => "ScrollBar", 50039 => "TitleBar",
        50040 => "Menu", 50041 => "MenuItem", 50042 => "Separator", 50043 => "SemanticZoom",
        50044 => "AppBar", _ => "?",
    }
}

fn interactive(ct: i32) -> bool {
    matches!(
        ct,
        50000 | 50002 | 50003 | 50004 | 50005 | 50007 | 50011 | 50013 | 50015 | 50016
            | 50019 | 50024 | 50027 | 50029 | 50031
    )
}

struct St<'a> {
    cond: &'a IUIAutomationCondition,
    x: i32,
    y: i32,
    deadline: Instant,
    visited: i32,
    expanded: i32,
    best_depth: u32,
    best_area: i64,
    best_path: Vec<(RECT, IUIAutomationElement)>,
    path: Vec<(RECT, IUIAutomationElement)>,
    /// DFS 期间见到的所有含点候选（含未进入 best_path 的兄弟层），用于回答
    /// "中间层到底存不存在"
    seen: Vec<(u32, RECT, i32, String)>,
}

fn dfs(st: &mut St, el: &IUIAutomationElement, depth: u32) {
    if depth as usize > MAX_DEPTH
        || st.visited >= env_i("VIS", 320)
        || st.expanded >= env_i("EXP", 50)
        || Instant::now() > st.deadline
    {
        return;
    }
    let Ok(children) = (unsafe { el.FindAll(TreeScope_Children, st.cond) }) else { return };
    st.expanded += 1;
    let Ok(n) = (unsafe { children.Length() }) else { return };
    let mut cands: Vec<(i64, RECT, IUIAutomationElement)> = Vec::new();
    for i in 0..n {
        st.visited += 1;
        let Ok(c) = (unsafe { children.GetElement(i) }) else { continue };
        let Ok(r) = (unsafe { c.CurrentBoundingRectangle() }) else { continue };
        let w = r.right - r.left;
        let h = r.bottom - r.top;
        if w < 6 || h < 6 || !rect_contains(&r, st.x, st.y) {
            continue;
        }
        let ct = unsafe { c.CurrentControlType() }.map(|t| t.0).unwrap_or(0);
        let nm = unsafe { c.CurrentName() }.map(|s| s.to_string()).unwrap_or_default();
        let nm: String = nm.chars().take(28).collect();
        st.seen.push((depth, r.clone(), ct, nm));
        cands.push((w as i64 * h as i64, r, c));
    }
    cands.sort_by_key(|(a, _, _)| *a);
    let mut explored: Vec<(RECT, bool)> = Vec::new();
    for (a, r, c) in &cands {
        if let Some((_, true)) = explored.iter().find(|(er, _)| same_rect(er, r)) {
            continue;
        }
        st.path.push((r.clone(), c.clone()));
        let better = depth > st.best_depth || (depth == st.best_depth && *a < st.best_area);
        if better {
            st.best_depth = depth;
            st.best_area = *a;
            st.best_path = st.path.clone();
        }
        let subtree_before = st.best_depth;
        dfs(st, c, depth + 1);
        st.path.pop();
        let productive = st.best_depth > subtree_before;
        if let Some(e) = explored.iter_mut().find(|(er, _)| same_rect(er, r)) {
            e.1 = productive;
        } else {
            explored.push((r.clone(), productive));
        }
        if Instant::now() > st.deadline {
            return;
        }
    }
}

/// 复刻 uia_pick 的新链管线：DFS 定位最内层命中 → 向上父链 → 顺序合并 → 裁剪过滤
fn probe(auto: &IUIAutomation, hwnd: isize, wr: &RECT, x: i32, y: i32) {
    println!("\n########## 探测点 ({x},{y})  窗口 DWM 矩形={} ##########", fmt_rect(wr));
    let root = match unsafe { auto.ElementFromHandle(HWND(hwnd as *mut _)) } {
        Ok(r) => r,
        Err(e) => { println!("ElementFromHandle 失败: {e}"); return; }
    };
    let root_rect = match unsafe { root.CurrentBoundingRectangle() } {
        Ok(r) => r,
        Err(e) => { println!("根矩形读取失败: {e}"); return; }
    };
    println!("UIA 根矩形 = {}", fmt_rect(&root_rect));
    if !rect_contains(&root_rect, x, y) {
        println!("!! 根矩形不含探测点 → query() 直接 return None（整条链不会产出）");
        return;
    }
    let cond = unsafe { auto.CreateTrueCondition() }.unwrap();
    let mut st = St {
        cond: &cond, x, y,
        deadline: Instant::now() + Duration::from_millis(env_u64("DL", 130)),
        visited: 0, expanded: 0, best_depth: 0, best_area: i64::MAX,
        best_path: vec![(root_rect.clone(), root.clone())],
        path: vec![(root_rect.clone(), root.clone())],
        seen: Vec::new(),
    };
    let t0 = Instant::now();
    dfs(&mut st, &root, 1);
    let ms_dfs = t0.elapsed().as_secs_f64() * 1000.0;
    println!(
        "DFS(仅用于定位最内层): 最深 depth={} visited={}/{} expanded={}/{}  {:.1} ms",
        st.best_depth, st.visited, env_i("VIS", 320), st.expanded, env_i("EXP", 50), ms_dfs
    );
    println!("-- 旧链输入：FindAll 下钻路径（{} 项，注意大量同矩形包裹层）--", st.best_path.len());
    for (i, (r, e)) in st.best_path.iter().enumerate() {
        let ct = unsafe { e.CurrentControlType() }.map(|t| t.0).unwrap_or(50025);
        println!("  [{i}] {:>12} {:<9}", fmt_rect(r), ct_name(ct));
    }

    // ===== 新链输入：向上父链 =====
    println!("\n-- 新链输入：RawViewWalker 向上父链（内→外）--");
    let walker = match unsafe { auto.RawViewWalker() } { Ok(w) => w, Err(e) => { println!("RawViewWalker 失败 {e}"); return; } };
    let mut hits: Vec<(RECT, i32, String)> = Vec::new();
    {
        let mut cur = st.best_path.last().unwrap().1.clone();
        let tp = Instant::now();
        for hop in 0..env_i("HOPS", PARENT_HOPS as i32) as usize {
            let r = match unsafe { cur.CurrentBoundingRectangle() } { Ok(r) => r, Err(_) => break };
            let ct = unsafe { cur.CurrentControlType() }.map(|t| t.0).unwrap_or(50025);
            let cls = unsafe { cur.CurrentClassName() }.map(|s| s.to_string()).unwrap_or_default();
            let nm = unsafe { cur.CurrentName() }.map(|s| s.to_string()).unwrap_or_default();
            let nm: String = nm.chars().take(20).collect();
            hits.push((r.clone(), ct, format!("{cls:?} {nm:?}")));
            if hop + 1 >= PARENT_HOPS || tp.elapsed().as_millis() as u64 > env_u64("PB", PARENT_BUDGET_MS) {
                println!("  (父链提前收手：hop={hop} {:.1} ms)", tp.elapsed().as_secs_f64() * 1000.0);
                break;
            }
            if same_rect(&r, &root_rect) || ct == 50032 { println!("  (到根/Window，父链终止)"); break; }
            match unsafe { walker.GetParentElement(&cur) } { Ok(pp) => cur = pp, Err(_) => { println!("  (父链断裂)"); break; } }
        }
        println!("  父链 {:.1} ms 共 {} 跳", tp.elapsed().as_secs_f64() * 1000.0, hits.len());
    }
    for (i, (r, ct, tag)) in hits.iter().enumerate() {
        println!("  [{i:>2}] {:>12} {:<9} {tag}", fmt_rect(r), ct_name(*ct));
    }

    // ===== build_chain：按父链顺序合并（不再按面积重排）=====
    println!("\n-- build_chain 顺序合并（MERGE_RATIO={MERGE_RATIO}）--");
    let mut layered: Vec<(RECT, i32)> = Vec::new();
    for (r, ct, _) in hits.iter() {
        if let Some((pr, _)) = layered.last() {
            if same_rect(pr, r) { println!("  跳过(等矩形) {:>12}", fmt_rect(r)); continue; }
            let (a, pa) = (area(r) as f64, area(pr) as f64);
            if a < pa * MERGE_RATIO {
                println!("  合并(差<5%)  {:>12}  area={a:.0} vs 上层 {pa:.0}", fmt_rect(r));
                continue;
            }
        }
        println!("  保留         {:>12} {:<9}", fmt_rect(r), ct_name(*ct));
        layered.push((r.clone(), *ct));
    }
    let mut inner = 0usize;
    if let Some(&(r, ct)) = layered.first() {
        let fw = r.right - r.left; let fh = r.bottom - r.top;
        if !interactive(ct) && fw < 40 && fh < 28 {
            for (i, &(_, c)) in layered.iter().enumerate() { if interactive(c) { inner = i; break; } }
            if inner > 0 { println!("  交互回退：起点移到 [{inner}] {}", ct_name(layered[inner].1)); }
        }
    }
    let chain: Vec<RECT> = layered[inner..].iter().take(MAX_CHAIN).map(|(r, _)| r.clone()).collect();

    // ===== filter_chain：越界裁剪 =====
    println!("\n-- filter_chain（越界裁剪到窗口，win={}）--", fmt_rect(wr));
    let (wx, wy) = (wr.left, wr.top);
    let (ww, wh) = ((wr.right - wr.left) as i32, (wr.bottom - wr.top) as i32);
    let mut kept: Vec<RECT> = Vec::new();
    for r in &chain {
        let (l, t) = (r.left.max(wx), r.top.max(wy));
        let (ri, b) = (r.right.min(wx + ww), r.bottom.min(wy + wh));
        let (w, h) = (ri - l, b - t);
        if w < 10 || h < 10 { println!("  剔除(过小)   {:>12} → 裁剪后 {w}x{h}", fmt_rect(r)); continue; }
        if w >= ww && h >= wh { println!("  剔除(等窗)   {:>12} → {w}x{h}", fmt_rect(r)); continue; }
        let nr = RECT { left: l, top: t, right: ri, bottom: b };
        if let Some(last) = kept.last() {
            if same_rect(last, &nr) { println!("  去重         {:>12} → 与上一层裁剪后相同", fmt_rect(r)); continue; }
        }
        let clipped = if same_rect(&nr, r) { String::new() } else { format!("  ← 裁剪自 {}", fmt_rect(r)) };
        println!("  保留         {:>12}{clipped}", fmt_rect(&nr));
        kept.push(nr);
    }
    println!("\n==> 最终链层数 = {}   （旧算法同点位实测只有 1~2 层）", kept.len());

    // ===== ENUM：宽层两种枚举姿势对比（能否在预算内吃到扁平化 300+ 子元素）=====
    if std::env::var("ENUM").is_ok() {
        let walker = unsafe { auto.RawViewWalker() }.unwrap();
        let inner = st.best_path.last().unwrap().1.clone();
        let wide = unsafe { walker.GetParentElement(&inner) }.unwrap_or(root.clone());
        let wn = unsafe { wide.FindAll(TreeScope_Children, &cond) }
            .ok().map(|a| unsafe { a.Length() }.unwrap_or(0)).unwrap_or(0);
        println!("\n-- [ENUM] 宽层父元素子元素数 = {wn} --");
        let t = Instant::now();
        let mut ok_a = 0i32;
        if let Ok(arr) = unsafe { wide.FindAll(TreeScope_Children, &cond) } {
            let n = unsafe { arr.Length() }.unwrap_or(0);
            for i in 0..n.min(600) {
                if let Ok(c) = unsafe { arr.GetElement(i) } {
                    if let Ok(r) = unsafe { c.CurrentBoundingRectangle() } {
                        if r.right - r.left > 0 { ok_a += 1; }
                    }
                }
            }
        }
        println!("  A 裸 FindAll + Current*       : {:>7.1} ms  可读 {ok_a}", t.elapsed().as_secs_f64() * 1000.0);
        let t2 = Instant::now();
        let mut ok_b = 0i32; let mut note = String::new();
        match unsafe { auto.CreateCacheRequest() } {
            Ok(cr) => {
                let _ = unsafe { cr.SetTreeScope(TreeScope_Children) };
                let _ = unsafe { cr.AddProperty(UIA_BoundingRectanglePropertyId) };
                let _ = unsafe { cr.AddProperty(UIA_ControlTypePropertyId) };
                match unsafe { wide.FindAllBuildCache(TreeScope_Children, &cond, &cr) } {
                    Ok(arr) => {
                        let n = unsafe { arr.Length() }.unwrap_or(0);
                        for i in 0..n.min(600) {
                            if let Ok(c) = unsafe { arr.GetElement(i) } {
                                match unsafe { c.CachedBoundingRectangle() } {
                                    Ok(r) => { if r.right - r.left > 0 { ok_b += 1; } }
                                    Err(e) => { if note.is_empty() { note = e.to_string(); } }
                                }
                            }
                        }
                    }
                    Err(e) => note = format!("FindAllBuildCache 失败 {e}"),
                }
            }
            Err(e) => note = format!("CreateCacheRequest 失败 {e}"),
        }
        println!("  B FindAllBuildCache + Cached* : {:>7.1} ms  可读 {ok_b}  {note}", t2.elapsed().as_secs_f64() * 1000.0);
        let t3 = Instant::now();
        let mut ok_c = 0i32;
        if let Ok(arr) = unsafe { wide.FindAll(TreeScope_Children, &cond) } {
            let n = unsafe { arr.Length() }.unwrap_or(0);
            for i in 0..n.min(600) {
                if let Ok(c) = unsafe { arr.GetElement(i) } {
                    if let Ok(r) = unsafe { c.CurrentBoundingRectangle() } {
                        if r.right - r.left > 0 { ok_c += 1; }
                    }
                }
            }
        }
        println!("  A2 裸 FindAll 第二次(热态)     : {:>7.1} ms  可读 {ok_c}", t3.elapsed().as_secs_f64() * 1000.0);
    }
}


struct Ctx { out: Vec<(isize, String, RECT)> }

unsafe extern "system" fn proc_cb(hwnd: HWND, lp: LPARAM) -> windows::core::BOOL {
    let ctx = &mut *(lp.0 as *mut Ctx);
    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return windows::core::BOOL(1);
    }
    let root = GetAncestor(hwnd, GA_ROOT);
    let mut rect: RECT = RECT::default();
    if DwmGetWindowAttribute(root, DWMWA_EXTENDED_FRAME_BOUNDS,
        &mut rect as *mut _ as *mut _, std::mem::size_of::<u32>() as u32).is_err() {
        if GetWindowRect(root, &mut rect).is_err() { return windows::core::BOOL(1); }
    }
    let mut cloaked: u32 = 0;
    if DwmGetWindowAttribute(root, DWMWA_CLOAKED,
        &mut cloaked as *mut _ as *mut _, std::mem::size_of::<u32>() as u32).is_ok()
        && cloaked != 0 { return windows::core::BOOL(1); }
    let mut buf = [0u16; 256];
    let n = GetWindowTextW(root, &mut buf);
    let title = String::from_utf16_lossy(&buf[..n as usize]);
    if title.is_empty() { return windows::core::BOOL(1); }
    if ctx.out.iter().any(|(h, _, _)| *h == root.0 as isize) { return windows::core::BOOL(1); }
    ctx.out.push((root.0 as isize, title, rect));
    windows::core::BOOL(1)
}

fn main() {
    unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
    let auto: IUIAutomation = unsafe {
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).expect("CUIAutomation")
    };
    let args: Vec<String> = std::env::args().skip(1).collect();
    let want = args.get(0).cloned().unwrap_or_default();
    let mut ctx = Ctx { out: Vec::new() };
    unsafe { let _ = EnumWindows(Some(proc_cb), LPARAM(&mut ctx as *mut Ctx as isize)); };

    println!("== 可见顶层窗口（Z 序顶→底）==");
    for (i, (h, t, r)) in ctx.out.iter().enumerate() {
        println!("  [{i}] {h:#x} {:>12} {t:?}", fmt_rect(r));
    }

    // 目标窗口选择：0x 前缀按 hwnd、否则按标题子串、再否则取光标下窗口
    let target = if let Some(hex) = want.strip_prefix("0x") {
        let h = isize::from_str_radix(hex, 16).expect("hwnd 解析失败");
        ctx.out.into_iter().find(|(th, _, _)| *th == h).unwrap_or((h, "hwnd".into(), RECT::default()))
    } else if !want.is_empty() {
        let lw = want.to_lowercase();
        ctx.out.into_iter().find(|(_, t, _)| t.to_lowercase().contains(&lw))
            .expect("没有匹配标题的窗口")
    } else {
        let mut pt = POINT::default();
        unsafe { GetCursorPos(&mut pt).ok(); };
        let h = unsafe { WindowFromPoint(pt) };
        let root = unsafe { GetAncestor(h, GA_ROOT) };
        let mut rect: RECT = RECT::default();
        unsafe { let _ = GetWindowRect(root, &mut rect); };
        let mut buf = [0u16; 256];
        let n = unsafe { GetWindowTextW(root, &mut buf) };
        (root.0 as isize, String::from_utf16_lossy(&buf[..n as usize]), rect)
    };
    let (hwnd, title, mut wr) = target;
    if wr.right == 0 {
        unsafe {
            let mut r: RECT = std::mem::zeroed();
            let _ = DwmGetWindowAttribute(HWND(hwnd as *mut _), DWMWA_EXTENDED_FRAME_BOUNDS,
                &mut r as *mut _ as *mut _, std::mem::size_of::<u32>() as u32);
            wr = r;
        }
    }
    println!("\n目标: {title:?} hwnd={hwnd:#x} DWM矩形={}", fmt_rect(&wr));

    let mode = args.get(1).map(|s| s.as_str()).unwrap_or("auto");
    if mode == "grid" {
        for fy in [0.35f32, 0.55, 0.75] {
            for fx in [0.3f32, 0.55, 0.8] {
                let x = wr.left + ((wr.right - wr.left) as f32 * fx) as i32;
                let y = wr.top + ((wr.bottom - wr.top) as f32 * fy) as i32;
                probe(&auto, hwnd, &wr, x, y);
            }
        }
    } else if let Some((a, b)) = mode.split_once(',') {
        let x: i32 = a.trim().parse().expect("x 解析失败");
        let y: i32 = b.trim().parse().expect("y 解析失败");
        probe(&auto, hwnd, &wr, x, y);
    } else {
        probe(&auto, hwnd, &wr, (wr.left + wr.right) / 2, (wr.top + wr.bottom) / 2);
    }
}
