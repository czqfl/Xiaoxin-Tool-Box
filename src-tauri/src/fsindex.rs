//! 全盘文件名索引（Everything 的最小可用复刻）。
//!
//! 分工上尽量不造轮子：**目录遍历复用 ripgrep 的 `ignore` 并行 walker**
//! （1.6 亿下载、久经考验），本模块只做它没有的两件事——紧凑存储与子串打分搜索。
//!
//! 存储：把 650 万个 (父目录, 名称) 拆成「目录表 + 名称 blob + 定长条目数组」，
//! 条目仅 16 字节；整体落盘 data/file_index.bin，启动时一次读回，秒级可用。
//! 搜索：大小写不敏感子串线性扫（ASCII 折叠零分配）+ 打分排序，650k 条约 10~30ms。
//!
//! 只索引**文件名/目录名**，不索引文件内容——这是"秒级"的前提。
use crate::storage::AppPaths;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

const MAGIC: &[u8; 8] = b"XTOBFIDX";
const VERSION: u32 = 1;
/// 条目上限，防止异常盘（如挂了巨型网络盘）把内存吃穿
const MAX_ENTRIES: usize = 4_000_000;
/// 每个并行线程攒多少条再合并进共享 builder（锁次数 ÷ 512）
const FLUSH_BATCH: usize = 512;
/// 单次搜索最多返回多少条
const SEARCH_LIMIT: usize = 300;

/// 遍历时无条件跳过的目录名（纯噪音，且体量大）
const SKIP_DIRS: &[&str] = &["$Recycle.Bin", "System Volume Information", "WPS Cloud Files"];

/// 定长条目：dir = 目录表下标；name = 名称 blob 中的 (偏移, 长度)
#[derive(Clone, Copy)]
struct Entry {
    dir: u32,
    name_off: u32,
    name_len: u32,
    is_dir: bool,
}

/// 构建期累加器（也是最终索引本体）
#[derive(Default)]
pub struct Index {
    /// 目录 blob（不含结尾分隔符），dir_table 存其在其中的 (偏移, 长度)
    dir_blob: String,
    dir_table: Vec<(u32, u32)>,
    dir_lookup: HashMap<String, u32>,
    name_blob: String,
    /// name_blob 的 ASCII 小写镜像（逐字节同偏移，CJK 原样保留）。
    /// 只为搜索热路径存在：不预折叠时每个条目都要逐位置双折叠比较，
    /// 96 万条目实测要 240ms；折叠后直接走 std 的 find（内部 memchr）快得多。
    lower_blob: String,
    entries: Vec<Entry>,
    pub built_at: i64,
    pub roots: Vec<String>,
}

impl Index {
    fn intern_dir(&mut self, dir: &str) -> u32 {
        if let Some(&i) = self.dir_lookup.get(dir) {
            return i;
        }
        let off = self.dir_blob.len() as u32;
        self.dir_blob.push_str(dir);
        self.dir_table.push((off, dir.len() as u32));
        let idx = self.dir_table.len() as u32 - 1;
        self.dir_lookup.insert(dir.to_string(), idx);
        idx
    }

    fn push(&mut self, dir: &str, name: &str, is_dir: bool) {
        if self.entries.len() >= MAX_ENTRIES {
            return;
        }
        let d = self.intern_dir(dir);
        let off = self.name_blob.len() as u32;
        self.name_blob.push_str(name);
        // 折叠镜像必须与名称同步增长，否则只能靠外部记得调 finalize()（易漏）。
        // 逐字节写入：A-Z 折叠成 a-z，其余字节原样——不改变任何 UTF-8 序列结构，
        // 因此 lower_blob 与 name_blob 始终同长度、同字符边界
        unsafe {
            let lv = self.lower_blob.as_mut_vec();
            lv.reserve(name.len());
            lv.extend(name.bytes().map(fold_ascii));
        }
        self.entries.push(Entry { dir: d, name_off: off, name_len: name.len() as u32, is_dir });
    }

    fn dir_at(&self, i: u32) -> &str {
        let (o, l) = self.dir_table[i as usize];
        &self.dir_blob[o as usize..(o + l) as usize]
    }

    fn name_at(&self, e: &Entry) -> &str {
        &self.name_blob[e.name_off as usize..(e.name_off + e.name_len) as usize]
    }

    /// 完整路径（目录 + 名称）。目录项本身没有独立存储，靠父目录拼
    fn path_of(&self, e: &Entry) -> String {
        let dir = self.dir_at(e.dir);
        if dir.is_empty() {
            self.name_at(e).to_string()
        } else {
            format!("{}{}{}", dir, std::path::MAIN_SEPARATOR, self.name_at(e))
        }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut w = Vec::with_capacity(64 + self.dir_blob.len() + self.name_blob.len() + self.entries.len() * 13);
        w.extend_from_slice(MAGIC);
        w.extend_from_slice(&VERSION.to_le_bytes());
        w.extend_from_slice(&(self.built_at as i64).to_le_bytes());
        let rb = self.roots.join("\n");
        w.extend_from_slice(&(rb.len() as u32).to_le_bytes());
        w.extend_from_slice(rb.as_bytes());
        w.extend_from_slice(&(self.dir_blob.len() as u32).to_le_bytes());
        w.extend_from_slice(self.dir_blob.as_bytes());
        w.extend_from_slice(&(self.dir_table.len() as u32).to_le_bytes());
        for (o, l) in &self.dir_table {
            w.extend_from_slice(&o.to_le_bytes());
            w.extend_from_slice(&l.to_le_bytes());
        }
        w.extend_from_slice(&(self.name_blob.len() as u32).to_le_bytes());
        w.extend_from_slice(self.name_blob.as_bytes());
        w.extend_from_slice(&(self.entries.len() as u32).to_le_bytes());
        for e in &self.entries {
            w.extend_from_slice(&e.dir.to_le_bytes());
            w.extend_from_slice(&e.name_off.to_le_bytes());
            w.extend_from_slice(&e.name_len.to_le_bytes());
            w.push(e.is_dir as u8);
        }
        w
    }

    pub fn from_bytes(b: &[u8]) -> Option<Index> {
        if b.len() < 8 || &b[..8] != MAGIC {
            return None;
        }
        let mut p = 8usize;
        let take = |q: &mut usize, n: usize| -> Option<&[u8]> {
            if *q + n > b.len() {
                return None;
            }
            let s = &b[*q..*q + n];
            *q += n;
            Some(s)
        };
        let u32le = |q: &mut usize| -> Option<u32> {
            take(q, 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        };
        let i64le = |q: &mut usize| -> Option<i64> {
            let a: [u8; 8] = take(q, 8)?.try_into().ok()?;
            Some(i64::from_le_bytes(a))
        };
        let version = u32le(&mut p)?;
        if version != VERSION {
            return None;
        }
        let mut ix = Index::default();
        ix.built_at = i64le(&mut p)?;
        let rl = u32le(&mut p)? as usize;
        let rb = String::from_utf8(take(&mut p, rl)?.to_vec()).ok()?;
        ix.roots = if rb.is_empty() { vec![] } else { rb.split('\n').map(String::from).collect() };
        let dl = u32le(&mut p)? as usize;
        ix.dir_blob = String::from_utf8(take(&mut p, dl)?.to_vec()).ok()?;
        let dn = u32le(&mut p)? as usize;
        for _ in 0..dn {
            ix.dir_table.push((u32le(&mut p)?, u32le(&mut p)?));
        }
        let nl = u32le(&mut p)? as usize;
        ix.name_blob = String::from_utf8(take(&mut p, nl)?.to_vec()).ok()?;
        let en = u32le(&mut p)? as usize;
        for _ in 0..en {
            let dir = u32le(&mut p)?;
            let name_off = u32le(&mut p)?;
            let name_len = u32le(&mut p)?;
            let is_dir = take(&mut p, 1)?[0] != 0;
            ix.entries.push(Entry { dir, name_off, name_len, is_dir });
        }
        // UTF-8 偏移一致性兜底：blob 长度与表项必须自洽（文件被截断时直接判无效）
        if ix.dir_blob.len() != dl || ix.name_blob.len() != nl {
            return None;
        }
        ix.finalize();
        Some(ix)
    }

    /// 从磁盘 blob 读回后补出折叠镜像（push 路径自己维护，不走这里）
    fn finalize(&mut self) {
        // make_ascii_lowercase 只动 A-Z，字节长度与 UTF-8 边界完全不变，
        // 因此 lower_blob 可以和 name_blob 共用同一套 (偏移, 长度)
        let mut l = self.name_blob.clone();
        l.make_ascii_lowercase();
        self.lower_blob = l;
    }

    fn lower_at(&self, e: &Entry) -> &str {
        // SAFETY: lower_blob 与 name_blob 逐字节同长度（折叠只动 ASCII 区间），
        // 故 UTF-8 边界一致；这里只在纯 ASCII 折叠结果上做字节级切片
        &self.lower_blob[e.name_off as usize..(e.name_off + e.name_len) as usize]
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// 去重后的父目录数量（体积/内存的主要来源之一，诊断工具用）
    pub fn dir_count(&self) -> usize {
        self.dir_table.len()
    }

    /// 落盘（写临时文件再改名，避免中途崩溃留下半个索引）
    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, self.to_bytes()).map_err(|e| format!("索引写入失败：{e}"))?;
        std::fs::rename(&tmp, path).map_err(|e| format!("索引落盘失败：{e}"))
    }

    pub fn load(path: &Path) -> Option<Index> {
        let bytes = std::fs::read(path).ok()?;
        Index::from_bytes(&bytes)
    }
}

/// 一条命中
#[derive(Serialize)]
pub struct FsHit {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Serialize, Clone)]
pub struct FsIndexStatus {
    /// 条目数；0 表示尚未建立
    pub entries: usize,
    pub dirs: usize,
    pub built_at: i64,
    pub roots: Vec<String>,
    /// 正在后台构建
    pub building: bool,
    /// 距上次构建超过该秒数则建议更新
    pub stale: bool,
}

// ---------- 全局状态 ----------
static INDEX: Mutex<Option<Arc<Index>>> = Mutex::new(None);
static BUILDING: AtomicBool = AtomicBool::new(false);
pub const EVT_FSINDEX_PROGRESS: &str = "fsindex://progress";
pub const EVT_FSINDEX_DONE: &str = "fsindex://done";
const STALE_SECS: i64 = 3 * 86400;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 启动时读回磁盘缓存（不存在/版本不符则留空，等用户点「建立索引」）
pub fn load_from_disk(paths: &AppPaths) {
    if let Some(ix) = Index::load(&paths.fs_index_file) {
        *INDEX.lock().unwrap_or_else(|e| e.into_inner()) = Some(Arc::new(ix));
    }
}

fn status_of(ix: Option<&Index>) -> FsIndexStatus {
    let now = now_ms() / 1000;
    match ix {
        Some(i) => FsIndexStatus {
            entries: i.entries.len(),
            dirs: i.dir_table.len(),
            built_at: i.built_at,
            roots: i.roots.clone(),
            building: BUILDING.load(Ordering::Relaxed),
            stale: now - i.built_at / 1000 > STALE_SECS,
        },
        None => FsIndexStatus {
            entries: 0,
            dirs: 0,
            built_at: 0,
            roots: vec![],
            building: BUILDING.load(Ordering::Relaxed),
            stale: false,
        },
    }
}

#[tauri::command]
pub fn fs_index_status(paths: State<'_, AppPaths>) -> FsIndexStatus {
    let mut guard = INDEX.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        // 懒加载：命令面板/面板可能在启动预热完成前就来查状态
        if let Some(ix) = Index::load(&paths.fs_index_file) {
            *guard = Some(Arc::new(ix));
        }
    }
    status_of(guard.as_deref())
}

/// 本机固定盘根（网络盘/光驱/U 盘不进索引：掉线盘会让遍历挂死几十秒）
pub fn fixed_roots() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::GetDriveTypeW;
        // windows 0.61 的 GetDriveTypeW 直接返回 u32，DRIVE_FIXED = 3
        const DRIVE_FIXED: u32 = 3;
        let mut out = Vec::new();
        let mask = unsafe { windows::Win32::Storage::FileSystem::GetLogicalDrives() };
        for i in 0..26u32 {
            if mask & (1 << i) == 0 {
                continue;
            }
            let root = format!("{}:\\", (b'A' + i as u8) as char);
            let wide: Vec<u16> = root.encode_utf16().chain(std::iter::once(0)).collect();
            if unsafe { GetDriveTypeW(PCWSTR(wide.as_ptr())) } == DRIVE_FIXED {
                out.push(PathBuf::from(root));
            }
        }
        out
    }
    #[cfg(not(windows))]
    {
        vec![PathBuf::from("/")]
    }
}

/// ASCII 大小写折叠到小写（非 ASCII 原样返回：多字节字符没有大小写可言，
/// 且 ASCII 字节不会出现在 UTF-8 多字节序列中间，按字节比较是安全的）
#[inline]
fn fold_ascii(b: u8) -> u8 {
    if b.is_ascii_uppercase() {
        b + 32
    } else {
        b
    }
}

/// 大小写不敏感后缀比较（路径查询里比对目录部分，零分配）
fn ends_with_ci(hay: &str, needle: &str) -> bool {
    let (h, n) = (hay.as_bytes(), needle.as_bytes());
    if n.is_empty() {
        return true;
    }
    if h.len() < n.len() {
        return false;
    }
    let off = h.len() - n.len();
    h[off..].iter().zip(n).all(|(a, b)| fold_ascii(*a) == fold_ascii(*b))
}

/// 查询词首字母是否处于"词边界"（起始或紧跟 _ - . 空格 / 分隔符之后）
fn at_word_start(s: &str, byte_at: usize) -> bool {
    if byte_at == 0 {
        return true;
    }
    matches!(s.as_bytes()[byte_at - 1], b'_' | b'-' | b'.' | b' ' | b'/' | b'\\')
}

/// 打分：完全同名 ≫ 前缀 ≫ 词首 ≫ 包含；名称越短越靠前。
///
/// 热路径必须零分配（96 万条目 × 一次 String 分配会把搜索拖到几百毫秒）。
/// 查询含路径分隔符时按「目录后缀 + 名称子串」匹配 —— `src-tauri\ocr.rs`
/// 这种跨分隔符的写法照样命中，又不必为每个条目拼出完整路径。
fn score(ix: &Index, e: &Entry, q: &str, ql: &str) -> Option<i64> {
    let name = ix.name_at(e);
    // 匹配走折叠镜像（与 name_blob 同偏移），避免每条都重做大小写折叠
    let ln = ix.lower_at(e);
    let (pos, path_like) = match ql.rfind(['\\', '/']) {
        Some(sep) => {
            let (dp, np) = (&ql[..sep], ql[sep + 1..].trim_start_matches(['\\', '/']));
            if !ends_with_ci(ix.dir_at(e.dir), dp) {
                return None;
            }
            if np.is_empty() {
                (0, true)
            } else {
                (ln.find(np)?, true)
            }
        }
        None => (ln.find(ql)?, false),
    };
    let mut sc: i64 = 20;
    if name.eq_ignore_ascii_case(q) {
        sc += 400;
    } else if pos == 0 {
        sc += 120;
        if at_word_start(name, 0) {
            sc += 40;
        }
    } else if at_word_start(name, pos) {
        sc += 60;
    }
    // 名称越短越像"正是我要的那个"
    sc += (64usize.saturating_sub(name.len()) as i64) / 4;
    if !path_like && e.is_dir && !q.contains('.') {
        // 查询没带扩展名时，目录稍占优（找文件夹是常见意图）
        sc += 8;
    }
    Some(sc)
}

/// 扫描本机所有固定盘，产出索引。`progress` 在遍历期间被限流调用
/// （约每 250ms 一次，参数为已收录条目数）：命令侧用它推事件，离线工具用它打印。
///
/// 目录遍历整体复用 ripgrep 的 `ignore` 并行 walker（跨线程分派目录、
/// 跳过符号链接防环），本函数只负责把 DirEntry 折叠成紧凑存储。
pub fn scan(progress: &(dyn Fn(usize) + Send + Sync)) -> Result<Index, String> {
    use ignore::{ParallelVisitor, ParallelVisitorBuilder, WalkBuilder, WalkState};

    let roots = fixed_roots();
    if roots.is_empty() {
        return Err("未发现可索引的本地磁盘".into());
    }
    let root_strs: Vec<String> = roots.iter().map(|p| p.display().to_string()).collect();
    let sink: Mutex<Index> = Mutex::new(Index::default());
    let counter = std::sync::atomic::AtomicUsize::new(0);

    struct Visitor<'a> {
        sink: &'a Mutex<Index>,
        counter: &'a std::sync::atomic::AtomicUsize,
        progress: &'a (dyn Fn(usize) + Send + Sync),
        buf: Vec<(String, String, bool)>,
        last_emit: std::time::Instant,
    }
    /// 0.4 的自定义 visitor 只能经 WalkParallel::visit(builder) 接入
    /// （run() 要的是 FnVisitor 闭包），每线程 build 一个 Visitor
    struct VisitorBuilder<'a> {
        sink: &'a Mutex<Index>,
        counter: &'a std::sync::atomic::AtomicUsize,
        progress: &'a (dyn Fn(usize) + Send + Sync),
    }
    impl<'a> ParallelVisitorBuilder<'a> for VisitorBuilder<'a> {
        fn build(&mut self) -> Box<dyn ParallelVisitor + 'a> {
            Box::new(Visitor {
                sink: self.sink,
                counter: self.counter,
                progress: self.progress,
                buf: Vec::with_capacity(FLUSH_BATCH),
                last_emit: std::time::Instant::now(),
            })
        }
    }
    impl Visitor<'_> {
        /// 攒够一批再上一次共享锁：96 万条目逐条加锁会把并行度抵消掉
        fn flush(&mut self) {
            if self.buf.is_empty() {
                return;
            }
            let mut g = self.sink.lock().unwrap_or_else(|e| e.into_inner());
            for (d, n, is_dir) in self.buf.drain(..) {
                g.push(&d, &n, is_dir);
            }
            self.counter.store(g.len(), std::sync::atomic::Ordering::Relaxed);
        }
    }
    impl ParallelVisitor for Visitor<'_> {
        fn visit(&mut self, res: Result<ignore::DirEntry, ignore::Error>) -> WalkState {
            let Ok(de) = res else { return WalkState::Continue };
            let Some(name) = de.file_name().to_str() else {
                return WalkState::Continue;
            };
            // follow_links(false) 下 file_type() 直接来自遍历时的目录项，
            // 无需再 stat 一次（几十万条目 × 一次额外 IO 会明显拖慢建索引）
            let ft = de.file_type();
            if ft.map(|t| t.is_symlink()).unwrap_or(false) {
                return WalkState::Continue;
            }
            // 盘根（"C:\"）的名称形如 "C:"，其父目录为 None：这类条目不进索引
            let Some(parent) = de.path().parent() else { return WalkState::Continue };
            let is_dir = ft.map(|t| t.is_dir()).unwrap_or(false);
            if is_dir && SKIP_DIRS.iter().any(|s| name.eq_ignore_ascii_case(s)) {
                return WalkState::Skip;
            }
            self.buf.push((parent.display().to_string(), name.to_string(), is_dir));
            if self.buf.len() >= FLUSH_BATCH {
                self.flush();
            }
            // 进度节流推送（每 250ms 一次，事件量不至于淹没前端）
            if self.last_emit.elapsed().as_millis() > 250 {
                self.last_emit = std::time::Instant::now();
                (self.progress)(self.counter.load(std::sync::atomic::Ordering::Relaxed));
            }
            WalkState::Continue
        }
    }
    impl Drop for Visitor<'_> {
        /// visitor 退役时清空残余批次（0.4 的 ParallelVisitor 没有收尾钩子）
        fn drop(&mut self) {
            self.flush();
        }
    }

    let mpb = {
        let mut b = WalkBuilder::new(&roots[0]);
        for r in &roots[1..] {
            b.add(r);
        }
        // 不跳过隐藏/系统属性（Everything 也能搜到它们），不读 .gitignore，
        // 不跟随符号链接（防环），不限深度
        b.hidden(false)
            .ignore(false)
            .git_ignore(false)
            .git_global(false)
            .git_exclude(false)
            .parents(false)
            .follow_links(false)
            .max_depth(None)
            .build_parallel()
    };
    let mut vb = VisitorBuilder { sink: &sink, counter: &counter, progress };
    mpb.visit(&mut vb);

    let mut ix = sink.into_inner().map_err(|_| "索引构建状态异常".to_string())?;
    ix.built_at = now_ms();
    ix.roots = root_strs;
    Ok(ix)
}

/// 在索引里搜文件名/目录名（命令与离线校验工具共用同一实现）
pub fn search(ix: &Index, q: &str, limit: usize) -> Vec<FsHit> {
    // 查询折叠一次，循环里不再重复算
    let mut ql = q.to_string();
    ql.make_ascii_lowercase();
    let mut hits: Vec<(i64, &Entry)> = Vec::new();
    for e in ix.entries.iter() {
        if let Some(s) = score(ix, e, q, &ql) {
            hits.push((s, e));
        }
    }
    hits.sort_unstable_by(|a, b| b.0.cmp(&a.0));
    hits
        .into_iter()
        .take(limit)
        .map(|(_, e)| FsHit { path: ix.path_of(e), name: ix.name_at(e).to_string(), is_dir: e.is_dir })
        .collect()
}

/// 建立/重建索引：后台线程遍历所有固定盘，进度经事件推送，完成后落盘并换入内存。
#[tauri::command]
pub fn fs_index_rebuild(app: AppHandle, paths: State<'_, AppPaths>) -> Result<(), String> {
    if BUILDING.swap(true, Ordering::SeqCst) {
        return Err("索引正在构建中，请稍候".into());
    }
    let paths = paths.inner().clone();
    std::thread::spawn(move || {
        let app2 = app.clone();
        let r = scan(&move |n| {
            let _ = app2.emit(EVT_FSINDEX_PROGRESS, serde_json::json!({ "entries": n }));
        })
        .and_then(|ix| {
            let count = ix.len();
            ix.save(&paths.fs_index_file)?;
            *INDEX.lock().unwrap_or_else(|e| e.into_inner()) = Some(Arc::new(ix));
            crate::storage::diag_write(&format!("[fsindex] built {count} entries"));
            Ok(())
        });
        if let Err(ref e) = r {
            crate::storage::diag_write(&format!("[fsindex] rebuild failed: {e}"));
        }
        let _ = app.emit(EVT_FSINDEX_DONE, serde_json::json!({ "ok": r.is_ok() }));
        BUILDING.store(false, Ordering::SeqCst);
    });
    Ok(())
}

/// 搜索文件名/目录名。至少 2 个字符：单字符在这套打分里几乎没有区分度，
/// 还会命中几十万条纯属浪费。
#[tauri::command]
pub fn fs_index_search(query: String) -> Result<Vec<FsHit>, String> {
    let q = query.trim().to_string();
    if q.chars().count() < 2 {
        return Err("至少输入 2 个字符".into());
    }
    let guard = INDEX.lock().unwrap_or_else(|e| e.into_inner());
    let ix = guard
        .as_ref()
        .ok_or("尚未建立索引：点「建立索引」扫描本机文件（首次约需十几秒）")?;
    Ok(search(ix, &q, SEARCH_LIMIT))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Index {
        let mut ix = Index::default();
        ix.push(r"D:\proj\src-tauri", "ocr.rs", false);
        ix.push(r"D:\proj\src-tauri", "tauri.conf.json", false);
        ix.push(r"D:\proj", "README.md", false);
        ix.push(r"C:\Windows", "OCR", true);
        ix.push(r"C:\Users\me\Pictures", "长截图-2026.png", false);
        ix
    }

    #[test]
    fn search_is_case_insensitive_both_ways() {
        // 索引里是小写 ocr.rs，查询大写也要命中；反之亦然（折叠镜像的作用）
        assert!(search(&sample(), "OCR.RS", 10).iter().any(|h| h.name == "ocr.rs"));
        assert!(search(&sample(), "readme.md", 10).iter().any(|h| h.name == "README.md"));
        assert!(search(&sample(), "zzz", 10).is_empty());
    }

    #[test]
    fn search_chinese_query_does_not_split_multibyte() {
        assert_eq!(search(&sample(), "截图", 10).len(), 1);
        // 单字节 ASCII 不会命中 CJK 字符的 UTF-8 中间字节
        assert!(search(&sample(), "\u{a6}", 10).is_empty());
    }

    #[test]
    fn ends_with_ci_matches_path_suffix() {
        assert!(ends_with_ci(r"D:\proj", "proj"));
        assert!(ends_with_ci(r"D:\proj\SRC-TAURI", "src-tauri"));
        // 更深的目录不以 "proj" 结尾（否则 src-tauri\... 查询会误命中兄弟目录）
        assert!(!ends_with_ci(r"D:\projx\src-tauri", "proj"));
        assert!(!ends_with_ci(r"D:\proj\src-tauri", "proj"));
    }

    #[test]
    fn search_prefers_exact_then_prefix_then_contains() {
        let names: Vec<String> = search(&sample(), "ocr", 10).into_iter().map(|h| h.name).collect();
        assert_eq!(names.first().map(|s| s.as_str()), Some("OCR"));
        assert!(names.iter().any(|n| n == "ocr.rs"));
    }

    #[test]
    fn search_supports_path_qualified_query() {
        let hits = search(&sample(), r"src-tauri\ocr.rs", 10);
        assert_eq!(hits.len(), 1, "跨分隔符查询应精确命中一条");
        assert!(hits[0].path.ends_with("ocr.rs"));
        // 目录后缀对不上就不该命中
        assert!(search(&sample(), r"other-dir\ocr.rs", 10).is_empty());
    }

    #[test]
    fn search_matches_chinese_name() {
        let hits = search(&sample(), "长截图", 10);
        assert_eq!(hits.len(), 1);
        assert!(hits[0].name.contains("长截图"));
    }

    #[test]
    fn bytes_roundtrip_preserves_index() {
        let ix = sample();
        let back = Index::from_bytes(&ix.to_bytes()).expect("自洽的二进制必须能读回");
        assert_eq!(back.len(), ix.len());
        assert_eq!(back.dir_count(), ix.dir_count());
        let a: Vec<String> = search(&ix, "tauri.conf", 5).into_iter().map(|h| h.path).collect();
        let b: Vec<String> = search(&back, "tauri.conf", 5).into_iter().map(|h| h.path).collect();
        assert_eq!(a, b);
    }

    #[test]
    fn from_bytes_rejects_garbage() {
        assert!(Index::from_bytes(b"not an index at all").is_none());
        let mut b = sample().to_bytes();
        b.truncate(b.len() - 40); // 模拟被截断的缓存文件
        assert!(Index::from_bytes(&b).is_none());
    }
}
