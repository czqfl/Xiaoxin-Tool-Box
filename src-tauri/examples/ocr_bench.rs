//! OCR 离线评测台（诊断用，不进发布路径）：
//! cargo run --example ocr_bench -- <图片路径...>
//!
//! 对每张图跑 recognize_png，把逐行文本以 JSON 打到 stdout（供 Python 侧算 CER），
//! 人类可读的耗时信息打到 stderr，避免污染 JSON。

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("usage: ocr_bench <image path>...");
        std::process::exit(2);
    }
    let mut out = Vec::new();
    for path in &args {
        let t0 = std::time::Instant::now();
        let res = (|| -> Result<_, String> {
            let bytes = std::fs::read(path).map_err(|e| format!("read: {e}"))?;
            xiaoxin_toolbox_lib::ocr::recognize_png(&bytes)
        })();
        let ms = t0.elapsed().as_millis();
        match res {
            Ok(lines) => {
                eprintln!("{path}: {ms}ms, {} 行", lines.len());
                out.push(serde_json::json!({
                    "file": path,
                    "ms": ms,
                    "lines": lines.iter().map(|l| l.text.clone()).collect::<Vec<_>>(),
                    "words": lines.iter().map(|l| l.words.iter().map(|w| serde_json::json!({
                        "t": w.t, "x": (w.x * 10.0).round() / 10.0,
                        "y": (w.y * 10.0).round() / 10.0,
                        "w": (w.w * 10.0).round() / 10.0, "h": (w.h * 10.0).round() / 10.0,
                    })).collect::<Vec<_>>()).collect::<Vec<_>>(),
                }));
            }
            Err(e) => {
                eprintln!("{path}: {ms}ms ERROR {e}");
                let empty: Vec<String> = Vec::new();
                out.push(serde_json::json!({ "file": path, "ms": ms, "error": e, "lines": empty }));
            }
        }
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&out).unwrap_or_else(|_| "[]".into())
    );
}
