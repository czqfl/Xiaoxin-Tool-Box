# -*- coding: utf-8 -*-
import sys
def edit(path, pairs):
    with open(path, encoding="utf-8", newline="") as f:
        s = f.read()
    s = s.replace("\r\n", "\n")
    for old, new in pairs:
        if s.count(old) != 1:
            print(f"FAIL [{path}] count={s.count(old)}: {old[:60]!r}"); sys.exit(1)
        s = s.replace(old, new)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(s.replace("\n", "\r\n"))
    print("OK", path)

BASE = "D:/MyCustomTools/XiaoxinToolBox"
R = f"{BASE}/src-tauri/src/fsindex.rs"

edit(R, [
# 1) 取消标志
(
"static BUILDING: AtomicBool = AtomicBool::new(false);",
"static BUILDING: AtomicBool = AtomicBool::new(false);\n/// 取消当前扫描：visit 里置位后对后续条目一律 Skip（目录不再下钻），\n/// walker 把已入队目录排空即退出，等效快速中止。\nstatic CANCEL: AtomicBool = AtomicBool::new(false);",
),
# 2) scan 签名 + 文档
(
'''pub fn scan(progress: &(dyn Fn(usize) + Send + Sync)) -> Result<Index, String> {''',
'''pub fn scan(
    progress: &(dyn Fn(usize) + Send + Sync),
    is_cancelled: &(dyn Fn() -> bool + Send + Sync),
) -> Result<Index, String> {''',
),
# 3) Visitor 携带取消判定
(
'''    struct Visitor<'a> {
        sink: &'a Mutex<Index>,
        counter: &'a std::sync::atomic::AtomicUsize,
        progress: &'a (dyn Fn(usize) + Send + Sync),
        buf: Vec<(String, String, bool)>,
        last_emit: std::time::Instant,
    }''',
'''    struct Visitor<'a> {
        sink: &'a Mutex<Index>,
        counter: &'a std::sync::atomic::AtomicUsize,
        progress: &'a (dyn Fn(usize) + Send + Sync),
        is_cancelled: &'a (dyn Fn() -> bool + Send + Sync),
        buf: Vec<(String, String, bool)>,
        last_emit: std::time::Instant,
    }''',
),
(
'''    struct VisitorBuilder<'a> {
        sink: &'a Mutex<Index>,
        counter: &'a std::sync::atomic::AtomicUsize,
        progress: &'a (dyn Fn(usize) + Send + Sync),
    }''',
'''    struct VisitorBuilder<'a> {
        sink: &'a Mutex<Index>,
        counter: &'a std::sync::atomic::AtomicUsize,
        progress: &'a (dyn Fn(usize) + Send + Sync),
        is_cancelled: &'a (dyn Fn() -> bool + Send + Sync),
    }''',
),
(
'''            Box::new(Visitor {
                sink: self.sink,
                counter: self.counter,
                progress: self.progress,
                buf: Vec::with_capacity(FLUSH_BATCH),
                last_emit: std::time::Instant::now(),
            })''',
'''            Box::new(Visitor {
                sink: self.sink,
                counter: self.counter,
                progress: self.progress,
                is_cancelled: self.is_cancelled,
                buf: Vec::with_capacity(FLUSH_BATCH),
                last_emit: std::time::Instant::now(),
            })''',
),
# 4) visit 首行：已取消 → Skip（目录不下钻，快速排空）
(
'''        fn visit(&mut self, res: Result<ignore::DirEntry, ignore::Error>) -> WalkState {
            let Ok(de) = res else { return WalkState::Continue };''',
'''        fn visit(&mut self, res: Result<ignore::DirEntry, ignore::Error>) -> WalkState {
            if (self.is_cancelled)() {
                // Skip：对目录意味着不下钻，已入队目录被排空后 walker 即结束
                return WalkState::Skip;
            }
            let Ok(de) = res else { return WalkState::Continue };''',
),
# 5) walk 结束后：取消则丢弃半成品
(
'''    let mut vb = VisitorBuilder { sink: &sink, counter: &counter, progress };
    mpb.visit(&mut vb);

    let mut ix = sink.into_inner().map_err(|_| "索引构建状态异常".to_string())?;''',
'''    let mut vb = VisitorBuilder { sink: &sink, counter: &counter, progress, is_cancelled };
    mpb.visit(&mut vb);

    if (is_cancelled)() {
        return Err("__cancelled__".into());
    }
    let mut ix = sink.into_inner().map_err(|_| "索引构建状态异常".to_string())?;''',
),
# 6) rebuild：复位取消标志、传入判定、DONE 事件带 cancelled
(
'''    let paths = paths.inner().clone();
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
}''',
'''    CANCEL.store(false, Ordering::SeqCst);
    let paths = paths.inner().clone();
    std::thread::spawn(move || {
        let app2 = app.clone();
        let r = scan(
            &move |n| {
                let _ = app2.emit(EVT_FSINDEX_PROGRESS, serde_json::json!({ "entries": n }));
            },
            &|| CANCEL.load(Ordering::Relaxed),
        )
        .and_then(|ix| {
            let count = ix.len();
            ix.save(&paths.fs_index_file)?;
            *INDEX.lock().unwrap_or_else(|e| e.into_inner()) = Some(Arc::new(ix));
            crate::storage::diag_write(&format!("[fsindex] built {count} entries"));
            Ok(())
        });
        let cancelled = matches!(&r, Err(e) if e == "__cancelled__");
        if let Err(ref e) = r {
            crate::storage::diag_write(&format!(
                "[fsindex] rebuild {}: {e}",
                if cancelled { "cancelled" } else { "failed" }
            ));
        }
        let _ = app.emit(
            EVT_FSINDEX_DONE,
            serde_json::json!({ "ok": r.is_ok(), "cancelled": cancelled }),
        );
        BUILDING.store(false, Ordering::SeqCst);
    });
    Ok(())
}

/// 取消进行中的索引扫描。返回是否成功发出取消请求（没有扫描在进行时为 false）。
/// 取消是异步生效的：DONE 事件（cancelled: true）到达前 building 仍为 true。
#[tauri::command]
pub fn fs_index_cancel() -> bool {
    if !BUILDING.load(Ordering::SeqCst) {
        return false;
    }
    CANCEL.store(true, Ordering::SeqCst);
    true
}''',
),
])

# 7) lib.rs 注册命令
edit(f"{BASE}/src-tauri/src/lib.rs", [(
"            fsindex::fs_index_rebuild,",
"            fsindex::fs_index_rebuild,\n            fsindex::fs_index_cancel,",
)])

# 8) 前端 API
edit(f"{BASE}/src/core/tauri.ts", [(
"export const fsIndexRebuild = () => invoke<void>(\"fs_index_rebuild\");",
"export const fsIndexRebuild = () => invoke<void>(\"fs_index_rebuild\");\nexport const fsIndexCancel = () => invoke<boolean>(\"fs_index_cancel\");",
)])
