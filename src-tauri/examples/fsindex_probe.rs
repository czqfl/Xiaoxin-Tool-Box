//! 全盘文件名索引离线校验（诊断用，不进发布路径）：
//! cargo run --release --example fsindex_probe -- [查询词...]
//!
//! 完整跑一遍真实链路：扫描本机固定盘 → 落盘 → 读回 → 搜索打分排序，
//! 打印条目数/体积/各阶段耗时，用于判断"秒级搜索"是否成立。

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

use xiaoxin_toolbox_lib::fsindex;

fn main() {
    let queries: Vec<String> = {
        let a: Vec<String> = std::env::args().skip(1).collect();
        if a.is_empty() {
            ["ocr", "Cargo.toml", "截图", "tauri.conf", "rs"].iter().map(|s| s.to_string()).collect()
        } else {
            a
        }
    };

    let roots = fsindex::fixed_roots();
    println!("待扫描根：{:?}", roots.iter().map(|p| p.display().to_string()).collect::<Vec<_>>());

    let last = AtomicUsize::new(0);
    let t = Instant::now();
    let ix = match fsindex::scan(&|n| {
        let prev = last.swap(n / 200_000, Ordering::Relaxed);
        if prev != n / 200_000 {
            println!("  … 已收录 {n} 条");
        }
    }) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("扫描失败：{e}");
            std::process::exit(1);
        }
    };
    let scan_ms = t.elapsed().as_millis();
    let bytes = ix.to_bytes();
    println!(
        "扫描完成：{} 条（父目录 {} 个）耗时 {}ms，序列化体积 {:.1} MB",
        ix.len(),
        ix.dir_count(),
        scan_ms,
        bytes.len() as f64 / 1048576.0
    );

    // 落盘 → 读回（校验二进制格式自洽 + 加载耗时）
    let tmp = PathBuf::from(std::env::temp_dir()).join("xtool_fsindex_probe.bin");
    if let Err(e) = ix.save(&tmp) {
        eprintln!("落盘失败：{e}");
        std::process::exit(1);
    }
    let t = Instant::now();
    let reloaded = match fsindex::Index::load(&tmp) {
        Some(v) => v,
        None => {
            eprintln!("读回失败：二进制格式不自洽");
            std::process::exit(1);
        }
    };
    println!(
        "读回 {} 条（与写出 {} 条一致：{}），加载耗时 {}ms",
        reloaded.len(),
        ix.len(),
        reloaded.len() == ix.len(),
        t.elapsed().as_millis()
    );
    let _ = std::fs::remove_file(&tmp);

    for q in &queries {
        let t = Instant::now();
        let hits = fsindex::search(&reloaded, q, 300);
        let ms = t.elapsed().as_millis();
        println!("\n查询 {q:?} → {} 条命中，{}ms", hits.len(), ms);
        for h in hits.iter().take(5) {
            println!("   {}{}  {}", if h.is_dir { "[目录] " } else { "" }, h.path, h.name);
        }
    }
}
