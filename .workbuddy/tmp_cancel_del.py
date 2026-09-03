# -*- coding: utf-8 -*-
"""ocr.rs 增量：下载取消旗标 + delete_model + 两个 command。保 CRLF。"""
P = r"D:/My-Custom-Tool/Xiaoxin-Tool-Box/src-tauri/src/ocr.rs"
with open(P, encoding="utf-8", newline="") as f:
    raw = f.read()
L = raw.split("\r\n")

def idx(s, start=0):
    return L.index(s, start)

# ---- 1. use 区补 HashSet 与 atomic ----
i = idx("use std::path::{Path, PathBuf};")
assert "HashSet" not in raw
L.insert(i + 1, "use std::collections::HashSet;")
i = idx("use std::sync::{Mutex, MutexGuard};")
L.insert(i, "use std::sync::atomic::{AtomicBool, Ordering};")

# ---- 2. OCR_DL_EVENT 后加取消旗标 ----
i = idx('pub const OCR_DL_EVENT: &str = "ocr://dl-progress";')
L[i + 1:i + 1] = [
    "",
    "/// 下载取消旗标：设置页「停止」按钮置位，fetch_asset / ensure_in_dir 每步检查；",
    "/// 触发取消时保留 .part 半成品，下次下载从断点接着下。",
    "static DL_CANCEL: AtomicBool = AtomicBool::new(false);",
    "",
    "pub fn cancel_download() {",
    "    DL_CANCEL.store(true, Ordering::Relaxed);",
    "}",
    "",
    "fn cancelled() -> bool {",
    "    DL_CANCEL.load(Ordering::Relaxed)",
    "}",
]

# ---- 3. fetch 读循环加取消检查 ----
i = idx("        if n == 0 {")
assert L[i + 1] == "            break;"
assert L[i + 2] == "        }"
L[i + 3:i + 3] = [
    "        if cancelled() {",
    "            return Err(\"下载已取消（半成品已保留，可随时继续）\".to_string());",
    "        }",
]

# ---- 4. ensure_in_dir 下载循环开头加取消检查 ----
i = idx("    let mut done: u64 = 0;")
assert L[i + 1] == "    let dir_owned = dir.to_path_buf();"
assert L[i + 2] == "    for a in &todo {"
L[i + 3:i + 3] = [
    "        if cancelled() {",
    "            return Err(\"下载已取消（半成品已保留，可随时继续）\".to_string());",
    "        }",
]

# ---- 5. command 开头清旗标 ----
i = idx("    tauri::async_runtime::spawn_blocking(move || {")
assert L[i + 1] == "        let mut last = Instant::now();"
L.insert(i + 1, "        DL_CANCEL.store(false, Ordering::Relaxed);")

# ---- 6. 尾部追加 delete_model + 两个 command ----
j = len(L) - 1
while j > 0 and L[j] == "":
    j -= 1
assert L[j] == "}"
tail = [
    "",
    "/// 删除档位在数据目录的模型文件（设置页「删除」按钮）。",
    "/// 使用中拒删；其它已就位档位共享的文件（如 small/medium 共用字典）保留，",
    "/// 避免删一个档位把另一个也弄残。`.part` 半成品一并清理。",
    "pub fn delete_model(id: &str) -> Result<(), String> {",
    "    let spec = model_set_by_name(id).ok_or_else(|| format!(\"未知的 OCR 模型档位：{id}\"))?;",
    "    if current_model() == id {",
    "        return Err(\"正在使用中的档位不能删除，请先切换到其它档位\".to_string());",
    "    }",
    "    let dir = crate::storage::AppPaths::resolve().data_dir.join(\"models\");",
    "    // 保护集合：其它已就位档位需要的文件（跨档共用，例如 ppocrv6_dict.txt）",
    "    let mut protected: HashSet<&str> = HashSet::new();",
    "    for choice in MODEL_CHOICES {",
    "        let other = choice.0;",
    "        if other == id || !ready_set(other) {",
    "            continue;",
    "        }",
    "        if let Some(os) = model_set_by_name(other) {",
    "            for a in os.assets_for_pipeline(pipeline()) {",
    "                protected.insert(a.filename);",
    "            }",
    "        }",
    "    }",
    "    for a in spec.assets_for_pipeline(pipeline()) {",
    "        if protected.contains(a.filename) {",
    "            continue;",
    "        }",
    "        let p = dir.join(a.filename);",
    "        if p.is_file() {",
    "            fs::remove_file(&p).map_err(|e| format!(\"删除 {} 失败：{e}\", p.display()))?;",
    "        }",
    "        let part = dir.join(a.filename).with_extension(\"part\");",
    "        if part.is_file() {",
    "            fs::remove_file(&part).ok();",
    "        }",
    "    }",
    "    crate::storage::diag_write(&format!(\"[ocr] deleted model set {id}\"));",
    "    Ok(())",
    "}",
    "",
    "/// 删除档位模型（数据目录内），返回删除后的最新状态列表。",
    "#[tauri::command]",
    "pub fn ocr_model_delete(model: String) -> Result<Vec<OcrModelInfo>, String> {",
    "    delete_model(&model)?;",
    "    Ok(model_status())",
    "}",
    "",
    "/// 请求取消进行中的模型下载（半成品保留，下次从断点接着下）。",
    "#[tauri::command]",
    "pub fn ocr_model_cancel() {",
    "    cancel_download();",
    "}",
]
L[j + 1:j + 1] = tail

out = "\r\n".join(L)
with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(out)

with open(P, encoding="utf-8", newline="") as f:
    raw2 = f.read()
for c in [
    "use std::collections::HashSet;",
    "use std::sync::atomic::{AtomicBool, Ordering};",
    "static DL_CANCEL: AtomicBool = AtomicBool::new(false);",
    "pub fn cancel_download() {",
    "        if cancelled() {",
    "        DL_CANCEL.store(false, Ordering::Relaxed);",
    "pub fn delete_model(id: &str)",
    "pub fn ocr_model_delete(model: String)",
    "pub fn ocr_model_cancel() {",
]:
    print(("OK  " if c in raw2 else "MISS"), c)
print("lines:", raw2.count("\r\n") + 1)
