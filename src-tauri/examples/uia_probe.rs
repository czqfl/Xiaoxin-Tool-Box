//! UIA 全子树查询耗时探针（诊断用，不进发布路径）：
//! cargo run --example uia_probe
//!
//! 对每个可见的 Chrome/Edge 顶层窗口测量：
//! 1. COLD  全子树物化（ElementFromHandleBuildCache+FindAllBuildCache(Descendants)）首次耗时
//! 2. WARM  同查询重复耗时（真实悬停的稳态成本）
//! 3. LEGACY 旧逐层下钻耗时（对照）
//! 4. 窗口中心点的候选链样本（验证几何链可用性）

use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationCacheRequest, TreeScope_Children,
    TreeScope_Descendants, UIA_BoundingRectanglePropertyId, UIA_ControlTypePropertyId,
    UIA_IsOffscreenPropertyId,
};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetAncestor, GetWindowTextW, GetWindowRect, IsIconic, IsWindowVisible, GA_ROOT};
use std::time::Instant;

struct Ctx { out: Vec<(isize, String)> }

unsafe extern "system" fn proc_cb(hwnd: HWND, lp: LPARAM) -> windows::core::BOOL {
    let ctx = &mut *(lp.0 as *mut Ctx);
    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() { return windows::core::BOOL(1); }
    let mut cloaked: u32 = 0;
    if DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut _ as *mut _, 4).is_ok() && cloaked != 0 {
        return windows::core::BOOL(1);
    }
    let mut buf = [0u16; 256];
    let n = GetWindowTextW(hwnd, &mut buf);
    let title = String::from_utf16_lossy(&buf[..n as usize]);
    let lower = title.to_lowercase();
    let want = std::env::args().nth(1).unwrap_or_default().to_lowercase();
    let matched = if want.is_empty() {
        lower.contains("edge") || lower.contains("chrome") || lower.contains("chrome_widget")
    } else {
        lower.contains(&want)
    };
    let debug_all = want == "debug";
    if matched || debug_all {
        let root = GetAncestor(hwnd, GA_ROOT);
        if debug_all && !matched {
            println!("  [枚举] {:?} visible={} ", title, IsWindowVisible(hwnd).as_bool());
        }
        ctx.out.push((root.0 as isize, title));
    }
    windows::core::BOOL(1)
}

fn creq_desc(auto: &IUIAutomation) -> windows::core::Result<IUIAutomationCacheRequest> {
    unsafe {
        let c = auto.CreateCacheRequest()?;
        c.SetTreeScope(TreeScope_Descendants)?;
        let _ = c.AddProperty(UIA_BoundingRectanglePropertyId);
        let _ = c.AddProperty(UIA_ControlTypePropertyId);
        let _ = c.AddProperty(UIA_IsOffscreenPropertyId);
        Ok(c)
    }
}

fn creq_children(auto: &IUIAutomation) -> windows::core::Result<IUIAutomationCacheRequest> {
    unsafe {
        let c = auto.CreateCacheRequest()?;
        c.SetTreeScope(TreeScope_Children)?;
        let _ = c.AddProperty(UIA_BoundingRectanglePropertyId);
        let _ = c.AddProperty(UIA_ControlTypePropertyId);
        Ok(c)
    }
}

fn main() {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    let auto: IUIAutomation = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).expect("CUIAutomation") };
    let mut ctx = Ctx { out: Vec::new() };
    unsafe { let _ = EnumWindows(Some(proc_cb), LPARAM(&mut ctx as *mut Ctx as isize)); };
    // 支持直接传 HWND（如 0x880ba4）：绕过标题匹配（部分应用 GetWindowTextW
    // 拿不到标题，但应用 diag 日志里有真实 hwnd）
    if ctx.out.is_empty() {
        if let Some(h) = std::env::args().nth(1).and_then(|a| {
            let a = a.trim().to_lowercase();
            a.strip_prefix("0x").and_then(|hex| isize::from_str_radix(hex, 16).ok())
        }) {
            ctx.out.push((h, format!("hwnd {h:#x}")));
        }
    }
    if ctx.out.is_empty() {
        println!("没找到 Chrome/Edge 窗口。请先打开浏览器再运行。");
        return;
    }
    for (i, (hwnd, title)) in ctx.out.iter().enumerate() {
        println!("候选[{i}] hwnd={hwnd:#x} title={title:?}");
    }
    let (hwnd, title) = &ctx.out[0];
    println!("\n=== 探测目标: {title:?} hwnd={hwnd:#x} ===");
    let hwnd = HWND(*hwnd as *mut _);

    // --- 1. COLD 全子树物化（裸根 + Descendants FindAll）---
    // 注意：ElementFromHandleBuildCache(Descendants) 返回的元素不允许 FindAllBuildCache
    // （HRESULT 0x80004005：仅有效调用是 GetCachedParent/GetCachedChildren），
    // 必须先用不带缓存的 ElementFromHandle 拿根，再对它做 Descendants FindAll
    let creq = creq_desc(&auto).unwrap();
    let cond = unsafe { auto.CreateTrueCondition().unwrap() };
    let t0 = Instant::now();
    let bare_root = unsafe { auto.ElementFromHandle(hwnd).expect("ElementFromHandle") };
    let t_efh = t0.elapsed().as_secs_f64() * 1000.0;
    let all = unsafe { bare_root.FindAllBuildCache(TreeScope_Descendants, &cond, &creq).expect("FindAll Descendants") };
    let n = unsafe { all.Length().unwrap() };
    println!("COLD  全子树: {:>8.1} ms (ElementFromHandle {t_efh:.1})  nodes={n}", t0.elapsed().as_secs_f64() * 1000.0);

    // --- 1b. BuildCache 版全子树（provider 若支持属性缓存则单次往返物化整树）---
    let creq_d = creq_desc(&auto).unwrap();
    let t1b = Instant::now();
    let cached_root_d = unsafe { auto.ElementFromHandleBuildCache(hwnd, &creq_d) };
    match cached_root_d {
        Ok(cr) => match (unsafe { cr.FindAllBuildCache(TreeScope_Descendants, &cond, &creq_d) }, unsafe { cr.CachedBoundingRectangle() }) {
            (Ok(arr), Ok(rr)) => {
                let cn = unsafe { arr.Length().unwrap_or(0) };
                println!("1b BuildCache 全子树: {:.1} ms nodes={} 根矩形={}x{}@{},{}",
                    t1b.elapsed().as_secs_f64() * 1000.0, cn, rr.right - rr.left, rr.bottom - rr.top, rr.left, rr.top);
                // 抽查子元素缓存属性是否真的物化了
                if cn > 0 {
                    if let Ok(c0) = unsafe { arr.GetElement(0) } {
                        match (unsafe { c0.CachedBoundingRectangle() }, unsafe { c0.CurrentBoundingRectangle() }) {
                            (Ok(rc), _) => println!("  子[0] Cached 矩形可用: {}x{}@{},{}", rc.right - rc.left, rc.bottom - rc.top, rc.left, rc.top),
                            (_, Err(e)) => println!("  子[0] Cached/Current 矩形均失败: {e}"),
                            (_, Ok(rc)) => println!("  子[0] Cached 失败但 Current 可用: {}x{}@{},{}", rc.right - rc.left, rc.bottom - rc.top, rc.left, rc.top),
                        }
                    }
                }
            }
            (Err(e), _) => println!("1b BuildCache 全子树: FindAll 失败 {e} ({} ms)", t1b.elapsed().as_secs_f64() * 1000.0),
            (_, Err(e)) => println!("1b BuildCache 全子树: 根矩形读取失败 {e}"),
        },
        Err(e) => println!("1b BuildCache 全子树: ElementFromHandleBuildCache 失败 {e}"),
    }

    // --- 2. WARM 重复同查询 ---
    for run in 1..=3 {
        let t = Instant::now();
        let root = unsafe { auto.ElementFromHandle(hwnd).expect("efh") };
        let all = unsafe { root.FindAllBuildCache(TreeScope_Descendants, &cond, &creq).expect("fa") };
        let n = unsafe { all.Length().unwrap() };
        println!("WARM{run} 全子树: {:>8.1} ms  nodes={n}", t.elapsed().as_secs_f64() * 1000.0);
    }

    // 窗口矩形 + 中心点候选链样本
    let mut wr = RECT::default();
    unsafe { let _ = GetWindowRect(hwnd, &mut wr); };
    let cx = (wr.left + wr.right) / 2;
    let cy = (wr.top + wr.bottom) / 2;
    let mut hits: Vec<(RECT, i32)> = Vec::new();
    let mut offscreen_cnt = 0i32;
    unsafe {
        for i in 0..n {
            let Ok(c) = all.GetElement(i) else { continue };
            let Ok(r) = c.CachedBoundingRectangle() else { continue };
            let off = c.CachedIsOffscreen().map(|o| o.as_bool()).unwrap_or(false);
            if off { offscreen_cnt += 1; }
            let w = r.right - r.left; let h = r.bottom - r.top;
            if w < 6 || h < 6 || off { continue; }
            if cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom { hits.push((r, 0)); }
        }
    }
    hits.sort_by_key(|(r, _)| (r.right - r.left) as i64 * (r.bottom - r.top) as i64);
    println!("中心点({cx},{cy}) 命中链: {} 层 (offscreen 剔除 {offscreen_cnt} 个)", hits.len());
    for (k, (r, _)) in hits.iter().take(6).enumerate() {
        println!("  [{k}] {}x{} @{},{}", r.right - r.left, r.bottom - r.top, r.left, r.top);
    }

    // 矩形分布统计：元素矩形到底落在哪（坐标系/可见性诊断）
    let mut n_empty = 0i32; let mut n_tiny = 0i32; let mut n_off = 0i32;
    let mut minx = i32::MAX; let mut miny = i32::MAX; let mut maxx = i32::MIN; let mut maxy = i32::MIN;
    let mut n_valid = 0i32;
    unsafe {
        for i in 0..n {
            let Ok(c) = all.GetElement(i) else { continue };
            let Ok(r) = c.CachedBoundingRectangle() else { continue };
            let w = r.right - r.left; let h = r.bottom - r.top;
            if w == 0 || h == 0 { n_empty += 1; continue; }
            if w < 6 || h < 6 { n_tiny += 1; continue; }
            if c.CachedIsOffscreen().map(|o| o.as_bool()).unwrap_or(false) { n_off += 1; continue; }
            n_valid += 1;
            minx = minx.min(r.left); miny = miny.min(r.top);
            maxx = maxx.max(r.right); maxy = maxy.max(r.bottom);
            if i < 5 { println!("  样本[{i}] {}x{}@{},{} off={}", w, h, r.left, r.top, c.CachedIsOffscreen().map(|o| o.as_bool()).unwrap_or(false)); }
        }
    }
    println!("矩形统计: empty={n_empty} tiny={n_tiny} offscreen={n_off} valid={n_valid}");
    println!("valid 矩形包围盒: ({minx},{miny})-({maxx},{maxy})  窗口GetWindowRect=({},{})-({},{})", wr.left, wr.top, wr.right, wr.bottom);
    unsafe {
        let root_r = bare_root.CachedBoundingRectangle().map(|_| ()); let _ = root_r;
        let rb = bare_root.CurrentBoundingRectangle().unwrap_or_default();
        println!("裸根 CurrentBoundingRectangle: {}x{}@{},{}", rb.right - rb.left, rb.bottom - rb.top, rb.left, rb.top);
    }

    // --- 3. LEGACY 逐层下钻对照（复现旧行为：BuildCache 根 + FindAll）---
    let creq_c = creq_children(&auto).unwrap();
    let t_legacy = Instant::now();
    let cached_root = unsafe { auto.ElementFromHandleBuildCache(hwnd, &creq_c).expect("efh-c") };
    let r = unsafe { cached_root.FindAllBuildCache(TreeScope_Children, &cond, &creq_c) };
    println!("LEGACY 在 BuildCache 根上 FindAll: {:?} ({} ms)",
        r.as_ref().map(|c| unsafe { c.Length() }.unwrap_or(-1)).map_err(|e| e.to_string()),
        t_legacy.elapsed().as_secs_f64() * 1000.0);

    // --- 4. 正确姿势：裸根 + 每层 FindAllBuildCache(Children)，测下钻连通性与耗时 ---
    let mut depth2 = 0usize;
    let mut cur2 = unsafe { auto.ElementFromHandle(hwnd).expect("efh-bare") };
    let mut layer_ms: Vec<f64> = Vec::new();
    loop {
        let tl = Instant::now();
        let children = unsafe { cur2.FindAllBuildCache(TreeScope_Children, &cond, &creq_c) };
        let Ok(children) = children else {
            println!("  层{depth2} FindAll 失败: {:?}", children.unwrap_err().to_string());
            break;
        };
        let Ok(cn) = (unsafe { children.Length() }) else { break };
        if cn == 0 { break; }
        let mut best_el = None;
        let mut best_area = i64::MAX;
        for i in 0..cn {
            let Ok(c) = (unsafe { children.GetElement(i) }) else { continue };
            let Ok(rc) = (unsafe { c.CachedBoundingRectangle() }) else { continue };
            let w = rc.right - rc.left; let h = rc.bottom - rc.top;
            if w < 6 || h < 6 { continue; }
            if cx < rc.left || cx >= rc.right || cy < rc.top || cy >= rc.bottom { continue; }
            let a = w as i64 * h as i64;
            if a < best_area { best_area = a; best_el = Some(c.clone()); }
        }
        let Some(next) = best_el else { break };
        layer_ms.push(tl.elapsed().as_secs_f64() * 1000.0);
        cur2 = next;
        depth2 += 1;
        if depth2 >= 14 { break; }
    }
    let fr = unsafe { cur2.CachedBoundingRectangle().unwrap_or_default() };
    let total: f64 = layer_ms.iter().sum();
    println!("BARE 逐层: depth={depth2} 总耗时={:.1} ms 各层={:?} final={}x{}@{},{}",
        total, layer_ms.iter().map(|m| format!("{m:.1}")).collect::<Vec<_>>(),
        fr.right - fr.left, fr.bottom - fr.top, fr.left, fr.top);
    // --- 5. TreeWalker + Current* 逐层下钻（最大兼容路径，实测耗时）---
    let walker = unsafe { auto.ControlViewWalker().expect("walker") };
    let mut depth3 = 0usize;
    let mut cur3 = unsafe { auto.ElementFromHandle(hwnd).expect("efh-bare3") };
    let mut layer3: Vec<f64> = Vec::new();
    let t3 = Instant::now();
    loop {
        let tl = Instant::now();
        let mut best_el = None;
        let mut best_area = i64::MAX;
        let mut child = unsafe { walker.GetFirstChildElement(&cur3) };
        let mut cnt = 0i32;
        while let Ok(c) = child {
            cnt += 1;
            if cnt > 300 { break; }
            let Ok(rc) = (unsafe { c.CurrentBoundingRectangle() }) else {
                child = unsafe { walker.GetNextSiblingElement(&c) };
                continue;
            };
            let w = rc.right - rc.left; let h = rc.bottom - rc.top;
            if w >= 6 && h >= 6 && cx >= rc.left && cx < rc.right && cy >= rc.top && cy < rc.bottom {
                let a = w as i64 * h as i64;
                if a < best_area { best_area = a; best_el = Some(c.clone()); }
            }
            child = unsafe { walker.GetNextSiblingElement(&c) };
        }
        let Some(next) = best_el else { break };
        layer3.push(tl.elapsed().as_secs_f64() * 1000.0);
        cur3 = next;
        depth3 += 1;
        if depth3 >= 14 { break; }
    }
    let fr3 = (unsafe { cur3.CurrentBoundingRectangle() }).unwrap_or_default();
    let ct3 = (unsafe { cur3.CurrentControlType() }).map(|t| t.0).unwrap_or(0);
    let nm3 = (unsafe { cur3.CurrentName() }).map(|s| s.to_string()).unwrap_or_default();
    println!("WALKER 逐层: depth={depth3} 总耗时={:.1} ms 各层={:?}",
        t3.elapsed().as_secs_f64() * 1000.0, layer3.iter().map(|m| format!("{m:.1}")).collect::<Vec<_>>());
    println!("  终点: {}x{}@{},{} ct={} name={:?}",
        fr3.right - fr3.left, fr3.bottom - fr3.top, fr3.left, fr3.top, ct3, nm3);

    // --- 6. FindAll(非缓存) + Current* 带回溯 DFS 下钻 ---
    use windows::Win32::UI::Accessibility::IUIAutomationElement;
    fn dfs(
        auto: &IUIAutomation,
        el: &IUIAutomationElement,
        depth: u32,
        cx: i32, cy: i32,
        cond: &windows::Win32::UI::Accessibility::IUIAutomationCondition,
        best: &mut Option<(u32, i64, IUIAutomationElement)>,
        deadline: Instant,
        visited: &mut i32,
    ) {
        if depth >= 14 || Instant::now() > deadline || *visited > 400 { return; }
        let Ok(children) = (unsafe { el.FindAll(TreeScope_Children, cond) }) else { return };
        let Ok(cn) = (unsafe { children.Length() }) else { return };
        let mut cands: Vec<(i64, IUIAutomationElement)> = Vec::new();
        for i in 0..cn {
            *visited += 1;
            let Ok(c) = (unsafe { children.GetElement(i) }) else { continue };
            let Ok(rc) = (unsafe { c.CurrentBoundingRectangle() }) else { continue };
            let w = rc.right - rc.left; let h = rc.bottom - rc.top;
            if w >= 6 && h >= 6 && cx >= rc.left && cx < rc.right && cy >= rc.top && cy < rc.bottom {
                cands.push((w as i64 * h as i64, c));
            }
        }
        cands.sort_by_key(|(a, _)| *a);
        let cur_area = cands.first().map(|(a, _)| *a).unwrap_or(i64::MAX);
        match best {
            Some((bd, ba, _)) if depth > *bd || (depth == *bd && cur_area < *ba) => {}
            Some(_) => {}
            None => {}
        }
        // 记录：更深或同深更小者为最优
        let better = match best {
            None => true,
            Some((bd, ba, _)) => depth > *bd || (depth == *bd && cur_area < *ba),
        };
        if better && !cands.is_empty() {
            *best = Some((depth, cur_area, cands[0].1.clone()));
        }
        for (_, c) in &cands {
            dfs(auto, c, depth + 1, cx, cy, cond, best, deadline, visited);
            if Instant::now() > deadline { break; }
        }
    }
    let mut best = None;
    let mut visited = 0i32;
    let root4 = unsafe { auto.ElementFromHandle(hwnd).expect("efh4") };
    let t4 = Instant::now();
    dfs(&auto, &root4, 0, cx, cy, &cond, &mut best, t4 + std::time::Duration::from_millis(600), &mut visited);
    println!("DFS 带回溯: 访问元素={visited} 耗时={:.1} ms", t4.elapsed().as_secs_f64() * 1000.0);
    if let Some((d, a, el)) = best {
        let fr = (unsafe { el.CurrentBoundingRectangle() }).unwrap_or_default();
        let ct = (unsafe { el.CurrentControlType() }).map(|t| t.0).unwrap_or(0);
        let nm = (unsafe { el.CurrentName() }).map(|s| s.to_string()).unwrap_or_default();
        println!("  最优: depth={d} area={a} {}x{}@{},{} ct={} name={}", fr.right - fr.left, fr.bottom - fr.top, fr.left, fr.top, ct, nm);
    } else {
        println!("  无命中");
    }
}
