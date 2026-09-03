//! PP-OCR（RapidOCR ONNX 管线）本地文字识别。
//!
//! 引擎：`rapidocr-core`（PaddleOCR PP-OCRv6 的 ONNX 导出 + ONNX Runtime 推理），
//! det → rec 两级（关闭方向分类 cls：屏幕文字不存在 180° 倒置，省一次推理）。
//! 输入：选定区域的 PNG 字节；输出：逐行文本 + 行/词矩形（原图像素坐标）。
//!
//! 相比此前的 Windows.Media.Ocr 系统引擎（11 例真值集字级召回 90.4% → 现 99.7%）：
//! ① 中文不再逐字插空格，混排标点/数字错误显著减少；
//! ② 小字号、低对比、深色主题截图都能识别；
//! ③ 因此删除了原先为系统引擎准备的一整套手工预处理（百分位电平拉伸、暗底
//!    反色、Lanczos 放大 + 非锐化掩蔽、中灰描边）——CNN 检测模型自带 resize
//!    与行裁剪垂直 padding，那些补偿手段反而会干扰它。

use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Instant;

use sha2::{Digest, Sha256};

use tauri::Emitter;

use rapidocr_core::{
    config::{InferenceOptions, PipelineConfig},
    model::{model_set_by_name, ModelAssetSpec, ModelCache, ModelDownloadMode, ModelSetSpec},
    RapidOcr,
};

#[derive(Debug, Clone, Serialize)]
pub struct OcrWordResp {
    pub t: String,
    pub x: f32, pub y: f32, pub w: f32, pub h: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct OcrLineResp {
    pub text: String,
    pub x: f32, pub y: f32, pub w: f32, pub h: f32,
    pub words: Vec<OcrWordResp>,
}

/// 出厂内置档位：6.3MB，无需联网即可用（随安装包落在 exe 同级 models/ 下）。
pub const DEFAULT_MODEL: &str = "ppocrv6-tiny";

/// 设置页可选项：(档位 id, 显示名, 说明, 体积 MB 约)。
/// 体积是 det + rec + 字典的下载实测值，仅用于展示。
const MODEL_CHOICES: &[(&str, &str, &str, f64)] = &[
    (DEFAULT_MODEL, "PP-OCRv6 tiny", "内置默认 · 中英混排够用 · 速度最快", 6.3),
    ("ppocrv6-small", "PP-OCRv6 small", "字典更全 · 生僻字与复杂版面更稳", 31.2),
    ("ppocrv6-medium", "PP-OCRv6 medium", "高精度 · 体积大、耗时数倍", 138.7),
    ("ppocrv5-ch-mobile", "PP-OCRv5 中文 mobile", "上一代移动端", 21.5),
    ("ppocrv5-ch-server", "PP-OCRv5 中文 server", "服务器级精度 · 体积很大", 172.7),
];

#[derive(Debug, Clone, Serialize)]
pub struct OcrModelInfo {
    pub id: String,
    pub name: String,
    pub desc: String,
    pub size_mb: f64,
    /// 模型文件已在某个可读目录就位（无需下载）
    pub ready: bool,
    pub active: bool,
}

struct Engine {
    set: String,
    ocr: RapidOcr,
}

// ONNX Runtime session 执行要求 &mut self（run_image），且整条管线持有 session，
// 因此引擎整体挂在 Mutex 后面串行使用；OCR 是用户触发的低频操作，串行不构成瓶颈。
static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);
static MODEL: Mutex<Option<String>> = Mutex::new(None);

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn pipeline() -> PipelineConfig {
    PipelineConfig::without_cls()
}

/// 当前生效档位：未由配置注入过（启动早期/独立工具）时用出厂默认。
pub fn current_model() -> String {
    lock(&MODEL).clone().unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

/// 切换档位：只记名字并丢弃已缓存引擎，下次识别时按需重建（热生效，无需重启）。
pub fn set_model(name: &str) {
    let name = name.to_string();
    let mut m = lock(&MODEL);
    if m.as_deref() == Some(name.as_str()) {
        return;
    }
    *m = Some(name);
    drop(m);
    *lock(&ENGINE) = None;
}

/// ONNX Runtime 线程数。OCR 已改为按需触发（按 Alt 才跑），2 线程识别稍慢
/// 但给贴图拖拽/缩放留足 CPU 余量，避免推理抢占导致界面卡顿。
fn intra_threads() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).clamp(1, 2)
}

/// 模型搜索目录（按优先级）：exe 同级（安装包把 resources 平铺在这里）→
/// exe/models（手工放置）→ 源码目录（开发期）→ 可写数据目录（下载落点）。
fn model_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::with_capacity(4);
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            dirs.push(parent.to_path_buf());
            dirs.push(parent.join("models"));
        }
    }
    dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ocr-models"));
    dirs.push(crate::storage::AppPaths::resolve().data_dir.join("models"));
    dirs
}

/// 该档位是否已在某个候选目录就位（含 SHA256 校验，只读探测、不下载）。
fn ready_set(id: &str) -> bool {
    let Some(spec) = model_set_by_name(id) else { return false };
    model_dirs().iter().any(|dir| {
        ModelCache::new(dir)
            .ensure_model_set_for_pipeline(spec, pipeline(), ModelDownloadMode::Never)
            .is_ok()
    })
}

pub fn model_status() -> Vec<OcrModelInfo> {
    let active = current_model();
    MODEL_CHOICES
        .iter()
        .map(|(id, name, desc, size)| OcrModelInfo {
            id: (*id).to_string(),
            name: (*name).to_string(),
            desc: (*desc).to_string(),
            size_mb: *size,
            ready: ready_set(id),
            active: *id == active,
        })
        .collect()
}

/// 取引擎：内置目录命中直接用；都没命中时下载进可写数据目录（首次联网一次）。
fn build_engine(set_name: &str) -> Result<Engine, String> {
    let spec = model_set_by_name(set_name).ok_or_else(|| format!("未知的 OCR 模型档位：{set_name}"))?;
    let make = |cache: &ModelCache| {
        let mut cfg = cache
            .config_for(spec)
            .with_pipeline(pipeline())
            .with_inference_options(InferenceOptions {
                intra_threads: intra_threads(),
                inter_threads: intra_threads(),
                ..Default::default()
            });
        // 检测端 min-side 由默认 736 降到 320：截图选区多是"宽而扁"的窄条，
        // 默认值会把它整幅放大 5 倍再检测，白烧卷积。实测 11 例真值集精度不变
        // （99.7%），单行/双行选区 835ms → 259ms（3.2x）；全屏图耗时不受影响
        // （那条路径的开销主要在各行的识别上）。
        if let Some(d) = cfg.det.as_mut() {
            d.limit_side_len = 320;
        }
        RapidOcr::from_config(cfg)
            .map(|ocr| Engine { set: set_name.to_string(), ocr })
            .map_err(|e| format!("OCR 模型加载失败：{e}"))
    };
    // Never 模式：文件齐且 SHA256 通过才算就位（内置目录只读，用下载模式只会白试）
    for dir in model_dirs() {
        let cache = ModelCache::new(&dir);
        if cache
            .ensure_model_set_for_pipeline(spec, pipeline(), ModelDownloadMode::Never)
            .is_ok()
        {
            return make(&cache);
        }
    }
    // 兜底：往可写数据目录下载（用户选了未内置的档位，或开发期源码目录缺文件）。
    // 走自写管线（.part + SHA256 + 损坏文件清理）；预热/识别路径静默，无进度 UI。
    let dir = crate::storage::AppPaths::resolve().data_dir.join("models");
    ensure_in_dir(&dir, spec, &mut |_| {}).map_err(|e| format!(
        "OCR 模型 {set_name} 未就位且下载失败（需要联网，或手动把模型放到 {}）：{e}",
        dir.display()
    ))?;
    let cache = ModelCache::new(&dir);
    // 文件此时必然已就位，Never 二次把关（语义等价原 Missing 下载成功分支）
    cache
        .ensure_model_set_for_pipeline(spec, pipeline(), ModelDownloadMode::Never)
        .map_err(|e| format!("OCR 模型 {set_name} 就位检查失败：{e}"))?;
    make(&cache)
}

/// 预热：启动后台线程把引擎（含 session 构建）先建好并缓存，避免首次识别
/// 才付这笔钱。识别本身是 spawn_blocking 上的重活，这里同样用独立线程。
/// 预热失败只落诊断日志（不打扰用户），真正识别时才给出明确原因。
pub fn warm_up() {
    std::thread::spawn(|| {
        let set = current_model();
        match build_engine(&set) {
            Ok(engine) => {
                crate::storage::diag_write(&format!("[ocr] warm_up {set} ok"));
                let mut guard = lock(&ENGINE);
                // 预热期间用户可能已改档位：档位不一致就别把旧引擎塞回去
                if guard.is_none() && current_model() == set {
                    *guard = Some(engine);
                }
            }
            Err(e) => crate::storage::diag_write(&format!("[ocr] warm_up {set} failed: {e}")),
        }
    });
}

/// 单字显示宽度权重：中日韩全角字≈1，半角字母数字≈0.55，其余≈0.5，空格≈0.35。
/// 用于把行矩形按字符宽度比例切成词——PP-OCR 只给行级 quad，词框得自己推。
fn char_weight(c: char) -> f32 {
    if c == ' ' {
        0.35
    } else if matches!(c as u32,
        0x1100..0x1160            // 韩文初声
        | 0x2E80..0xA4D0          // CJK 符号标点 / 假名 / 汉字 / 彝文
        | 0xAC00..0xD7A4          // 韩文音节
        | 0xF900..0xFB00          // 兼容表意文字
        | 0xFE10..0xFE70          // 竖排与小形式变体
        | 0xFF00..0xFF61          // 全角标点与字母
        | 0xFFE0..0xFFE7          // 全角货币符号
        | 0x20000..0x2FA20)       // 扩展 B 及以后
    {
        1.0
    } else if c.is_alphanumeric() {
        0.55
    } else {
        0.5
    }
}

/// 由行 quad（左上、右上、右下、左下）+ 文本推导词级矩形。
/// 词切分：全角字符逐字成词（贴图划选要落到单字），连续的半字母数字合并成词；
/// 空间分配按字符权重累加，并沿 quad 上下两边线性插值——轻微倾斜的行也能贴住文字。
fn split_words(text: &str, pts: &[[f32; 2]; 4]) -> Vec<OcrWordResp> {
    let chars: Vec<char> = text.chars().collect();
    if chars.is_empty() {
        return Vec::new();
    }
    let total: f32 = chars.iter().map(|c| char_weight(*c)).sum();
    if total <= 0.0 {
        return Vec::new();
    }
    // 先算出每个词的 [起点, 字符数)
    let mut groups: Vec<(usize, usize)> = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] == ' ' {
            i += 1;
            continue;
        }
        let wide = char_weight(chars[i]) >= 1.0;
        let start = i;
        i += 1;
        // 全角字逐字切；半角一直吃到下一个空格或全角字
        if !wide {
            while i < chars.len() && chars[i] != ' ' && char_weight(chars[i]) < 1.0 {
                i += 1;
            }
        }
        groups.push((start, i));
    }
    let (tl, tr, br, bl) = (pts[0], pts[1], pts[2], pts[3]);
    let mut words = Vec::with_capacity(groups.len());
    for (start, end) in groups {
        let w0: f32 = chars[..start].iter().map(|c| char_weight(*c)).sum();
        let w1: f32 = chars[..end].iter().map(|c| char_weight(*c)).sum();
        let (t0, t1) = (w0 / total, w1 / total);
        let lerp = |a: [f32; 2], b: [f32; 2], t: f32| [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        let corners = [
            lerp(tl, tr, t0), lerp(tl, tr, t1),
            lerp(bl, br, t1), lerp(bl, br, t0),
        ];
        let minx = corners.iter().map(|p| p[0]).fold(f32::INFINITY, f32::min);
        let maxx = corners.iter().map(|p| p[0]).fold(f32::MIN, f32::max);
        let miny = corners.iter().map(|p| p[1]).fold(f32::INFINITY, f32::min);
        let maxy = corners.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
        words.push(OcrWordResp {
            t: chars[start..end].iter().collect(),
            x: minx, y: miny,
            w: (maxx - minx).max(1.0), h: (maxy - miny).max(1.0),
        });
    }
    words
}

pub fn recognize_png(png: &[u8]) -> Result<Vec<OcrLineResp>, String> {
    let want = current_model();

    // 透明底先合成到白底：PP-OCR 只接受 RGB，直接灰度化会把透明区变成纯黑块
    let decoded = image::load_from_memory(png).map_err(|e| format!("decode: {e}"))?;
    let rgb = if decoded.color().has_alpha() {
        let rgba = decoded.to_rgba8();
        let mut flat = image::RgbaImage::from_pixel(rgba.width(), rgba.height(), image::Rgba([255, 255, 255, 255]));
        image::imageops::overlay(&mut flat, &rgba, 0, 0);
        image::DynamicImage::ImageRgba8(flat).into_rgb8()
    } else {
        decoded.to_rgb8()
    };

    let mut guard = lock(&ENGINE);
    if guard.as_ref().map(|e| e.set.as_str()) != Some(want.as_str()) {
        *guard = Some(build_engine(&want)?);
    }
    let engine = guard.as_mut().ok_or_else(|| "OCR 引擎未就位".to_string())?;
    let out = engine.ocr.run_image(&rgb).map_err(|e| format!("recognize: {e}"))?;
    drop(guard);

    let mut lines: Vec<OcrLineResp> = Vec::with_capacity(out.lines.len());
    for l in out.lines {
        if l.text.trim().is_empty() {
            continue;
        }
        let minx = l.bbox.points.iter().map(|p| p[0]).fold(f32::INFINITY, f32::min);
        let maxx = l.bbox.points.iter().map(|p| p[0]).fold(f32::MIN, f32::max);
        let miny = l.bbox.points.iter().map(|p| p[1]).fold(f32::INFINITY, f32::min);
        let maxy = l.bbox.points.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
        let words = split_words(&l.text, &l.bbox.points);
        lines.push(OcrLineResp {
            text: l.text,
            x: minx, y: miny,
            w: (maxx - minx).max(1.0), h: (maxy - miny).max(1.0),
            words,
        });
    }
    Ok(lines)
}

// ===================== 自写模型下载管线（进度 + 续传 + 不留垃圾） =====================
// rapidocr-core 自带的 download_asset 不能直接用：整包 .bytes() 吞进内存没有进度；
// 且先把文件写进正式路径，SHA256 一不对就报错走人——那份损坏文件留在原地，而 ensure
// 的 exists 短路会让下次下载永远卡死在这份“垃圾”上、绝不重下。
// 这里统一改成：正式名就位且 SHA256 通过 → 跳过；否则下载到 `<文件名>.part`（支持
// Range 断点续传）→ SHA256 校验通过才 rename 成正式名。损坏的正式文件与校验不过的
// .part 立即删除；网络中断保留 .part 供下次“接着下”。

/// OCR 模型下载进度（经 `ocr://dl-progress` 事件推给设置页进度条）
#[derive(Debug, Clone, Serialize)]
pub struct OcrDlProgress {
    /// 档位 id（如 ppocrv6-small）
    pub id: String,
    /// 当前正在传输的文件（det/rec 模型或字典文件名）
    pub file: String,
    /// download（传输中）| verify（SHA256 校验）| done（该文件落位完成）
    pub phase: String,
    /// 本档位累计已完成字节（含此前已就位/完成的文件）
    pub done: u64,
    /// 本档位需下载总字节（Range 探测汇总）；0 = 未知（进度条退化为无百分比形态）
    pub total: u64,
    /// 当前文件已下字节
    pub file_done: u64,
    /// 当前文件总字节（0 = 未知）
    pub file_total: u64,
}

/// 前端进度事件名（设置页 listen 它）
pub const OCR_DL_EVENT: &str = "ocr://dl-progress";

/// 下载取消旗标：设置页「停止」按钮置位，fetch_asset / ensure_in_dir 每步检查；
/// 触发取消时保留 .part 半成品，下次下载从断点接着下。
static DL_CANCEL: AtomicBool = AtomicBool::new(false);

pub fn cancel_download() {
    DL_CANCEL.store(true, Ordering::Relaxed);
}

fn cancelled() -> bool {
    DL_CANCEL.load(Ordering::Relaxed)
}

/// 就位判定：文件存在且 SHA256 与库登记一致才算好文件。正式路径上若躺着损坏文件
/// （历史下载残留的“垃圾”），当场删除——否则 exists 短路会让它永远占着坑位。
fn asset_ready(dir: &Path, asset: ModelAssetSpec) -> Result<bool, String> {
    let path = dir.join(asset.filename);
    if !path.is_file() {
        return Ok(false);
    }
    let Some(exp) = asset.sha256 else {
        return Ok(true);
    };
    let bytes = fs::read(&path).map_err(|e| format!("读取 {} 失败：{e}", path.display()))?;
    let actual = format!("{:x}", Sha256::digest(&bytes));
    if actual.eq_ignore_ascii_case(exp) {
        return Ok(true);
    }
    fs::remove_file(&path).map_err(|e| format!("删除损坏模型 {} 失败：{e}", path.display()))?;
    crate::storage::diag_write(&format!(
        "[ocr] sha256 mismatch, removed stale model {}",
        path.display()
    ));
    Ok(false)
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 xiaoxin-toolbox")
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败：{e}"))
}

/// 流式下载单个资产到 `.part` 并落位正式名，返回该文件最终字节数。
///
/// 断点续传：`.part` 已存在则带 `Range` 续传——服务器回 206 追加写；回 200 说明它
/// 忽略 Range（不支持断点），从头覆盖；回 416 说明 part 已不短于全量，删掉全量重下。
/// 传输中断（网络/超时/写盘失败）保留 `.part` 供下次接着下；校验不过删 part 报错，
/// 下次干净重下。`report(file_done, file_total, phase)` 每 128KB 上报一次（调用方节流）。
fn fetch_asset(
    client: &reqwest::blocking::Client,
    asset: ModelAssetSpec,
    final_path: &Path,
    report: &mut dyn FnMut(u64, u64, &str),
) -> Result<u64, String> {
    let part = final_path.with_extension("part");
    let mut part_len = part.metadata().map(|m| m.len()).unwrap_or(0);
    let mut rounds = 0u32;
    let (mut file, mut resp, file_total) = loop {
        let resume = part_len > 0 && rounds == 0;
        let mut req = client.get(asset.url);
        if resume {
            req = req.header(reqwest::header::RANGE, format!("bytes={part_len}-"));
        }
        let resp_ev = req.send().map_err(|e| {
            format!("下载失败：{e}（已保留半成品，可再次下载续传）")
        })?;
        let status = resp_ev.status();
        if status == reqwest::StatusCode::PARTIAL_CONTENT && resume {
            let f = OpenOptions::new().append(true).open(&part)
                .map_err(|e| format!("打开续传文件 {} 失败：{e}", part.display()))?;
            let flen = part_len + resp_ev.content_length().unwrap_or(0);
            break (f, resp_ev, flen);
        }
        if status == reqwest::StatusCode::OK {
            if resume {
                part_len = 0; // 服务器不支持 Range，从头覆盖
            }
            let f = File::create(&part)
                .map_err(|e| format!("创建 {} 失败：{e}", part.display()))?;
            let flen = resp_ev.content_length().unwrap_or(0);
            break (f, resp_ev, flen);
        }
        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && resume {
            fs::remove_file(&part).ok();
            part_len = 0;
            rounds = 1;
            continue; // part 已 ≥ 全量，删掉后全量重下
        }
        return Err(format!(
            "HTTP {}（{}）",
            status.as_u16(),
            status.canonical_reason().unwrap_or("请求被拒绝")
        ));
    };
    // 流式落盘（128KB/块），边写边上报进度
    let mut file_done = part_len;
    let mut buf = vec![0u8; 128 * 1024];
    loop {
        let n = resp.read(&mut buf).map_err(|e| {
            format!("下载中断：{e}（已保留半成品，可再次下载续传）")
        })?;
        if n == 0 {
            break;
        }
        if cancelled() {
            return Err("下载已取消（半成品已保留，可随时继续）".to_string());
        }
        file.write_all(&buf[..n])
            .map_err(|e| format!("写入 {} 失败：{e}", part.display()))?;
        file_done += n as u64;
        report(file_done, file_total, "download");
    }
    drop(file);
    report(file_done, file_total, "verify");
    if let Some(exp) = asset.sha256 {
        let bytes = fs::read(&part).map_err(|e| format!("读取 {} 失败：{e}", part.display()))?;
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if !actual.eq_ignore_ascii_case(exp) {
            fs::remove_file(&part).ok();
            return Err(format!(
                "SHA256 校验失败（内容不完整或源文件已变更），已删除半成品，请重试"
            ));
        }
    }
    if final_path.exists() {
        fs::remove_file(final_path).ok();
    }
    fs::rename(&part, final_path)
        .map_err(|e| format!("落位 {} 失败：{e}", final_path.display()))?;
    report(file_total, file_total, "done");
    Ok(file_total)
}

/// 确保 `dir` 内本档位（去 cls 的 det/rec/dict 三件）齐备且 SHA256 通过；缺失即下载。
/// `report` 每份进度变化回调一次；`done` 已按本档位全量累计（含此前就位文件），
/// 配合 HEAD 预算出的 `total`，前端一条总进度条即可走到 100%。
fn ensure_in_dir(
    dir: &Path,
    spec: &ModelSetSpec,
    report: &mut dyn FnMut(&OcrDlProgress),
) -> Result<(), String> {
    let mut todo: Vec<ModelAssetSpec> = Vec::new();
    for a in spec.assets_for_pipeline(pipeline()) {
        if !asset_ready(dir, a)? {
            todo.push(a);
        }
    }
    if todo.is_empty() {
        return Ok(());
    }
    fs::create_dir_all(dir).map_err(|e| format!("创建模型目录 {} 失败：{e}", dir.display()))?;
    let client = http_client()?;
    // 预检缺失文件的真实总字节并加总。HEAD 拿不到长度（ModelScope 经 302 跳到
    // cdn-lfs，响应不含 Content-Length），改用 GET + Range: bytes=0-0 探测：跟随后
    // 返回 206，响应头 `Content-Range: bytes 0-0/N` 里的 N 就是该文件总字节数。
    // 任一文件探测失败都不致命——total=0 时前端退化为「已下载量 + 速率」无百分比形态。
    let mut total: u64 = 0;
    let mut unknown = false;
    for a in &todo {
        match client
            .get(a.url)
            .header(reqwest::header::RANGE, "bytes=0-0")
            .send()
        {
            Ok(r) => {
                let from_range = r
                    .headers()
                    .get(reqwest::header::CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.split('/').nth(1))
                    .and_then(|x| x.trim().parse::<u64>().ok())
                    .filter(|n| *n > 0);
                match from_range {
                    Some(n) => total += n,
                    // 无 Content-Range（可能 200 全量返回）退到 Content-Length；
                    // 模型文件皆 MB 级，>1 才当总量，206 单字节响应的 content_length==1 不算。
                    None => match r.content_length() {
                        Some(n) if n > 1 => total += n,
                        _ => unknown = true,
                    },
                }
            }
            Err(_) => unknown = true,
        }
    }
    if unknown {
        total = 0;
    }
    let mut done: u64 = 0;
    let dir_owned = dir.to_path_buf();
    for a in &todo {
        if cancelled() {
            return Err("下载已取消（半成品已保留，可随时继续）".to_string());
        }
        let id = spec.name.to_string();
        let file = a.filename.to_string();
        let final_path = dir_owned.join(a.filename);
        let base = done;
        let size = fetch_asset(&client, *a, &final_path, &mut |fd, ft, phase| {
            report(&OcrDlProgress {
                id: id.clone(),
                file: file.clone(),
                phase: phase.to_string(),
                done: base + fd,
                total,
                file_done: fd,
                file_total: ft,
            });
        })
        .map_err(|e| format!("{}：{e}", a.name))?;
        done = base + size;
    }
    Ok(())
}

/// 下载指定档位模型到可写数据目录（设置页「下载」按钮 / 引擎兜底）。
/// 同步阻塞（6~170MB，走 ModelScope 国内源），调用方放 spawn_blocking。
/// `report` 收到每份进度（下载/校验/完成）；不需要进度就传空闭包。
pub fn download_model(id: &str, report: &mut dyn FnMut(&OcrDlProgress)) -> Result<(), String> {
    let spec = model_set_by_name(id).ok_or_else(|| format!("未知的 OCR 模型档位：{id}"))?;
    if ready_set(id) {
        return Ok(());
    }
    let dir = crate::storage::AppPaths::resolve().data_dir.join("models");
    ensure_in_dir(&dir, spec, report).map_err(|e| format!("模型下载失败：{e}"))
}

#[tauri::command]
pub fn ocr_model_status() -> Vec<OcrModelInfo> {
    model_status()
}

/// 下载档位模型（6~170MB，ModelScope 国内源）。整段放阻塞线程池，进度经
/// `ocr://dl-progress` 事件实时推给设置页（~120ms 节流，文件完成强制刷一次），
/// 完成后直接回一份最新状态列表，设置页不必再发一次查询。
#[tauri::command]
pub async fn ocr_model_download(
    app: tauri::AppHandle,
    model: String,
) -> Result<Vec<OcrModelInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        DL_CANCEL.store(false, Ordering::Relaxed);
        let mut last = Instant::now();
        let mut on_progress = |p: &OcrDlProgress| {
            if last.elapsed().as_millis() >= 120 || p.phase == "done" {
                last = Instant::now();
                let _ = app.emit(OCR_DL_EVENT, p);
            }
        };
        download_model(&model, &mut on_progress)?;
        Ok(model_status())
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

/// 删除档位在数据目录的模型文件（设置页「删除」按钮）。
/// 使用中拒删；其它已就位档位共享的文件（如 small/medium 共用字典）保留，
/// 避免删一个档位把另一个也弄残。`.part` 半成品一并清理。
pub fn delete_model(id: &str) -> Result<(), String> {
    let spec = model_set_by_name(id).ok_or_else(|| format!("未知的 OCR 模型档位：{id}"))?;
    if current_model() == id {
        return Err("正在使用中的档位不能删除，请先切换到其它档位".to_string());
    }
    let dir = crate::storage::AppPaths::resolve().data_dir.join("models");
    // 保护集合：其它已就位档位需要的文件（跨档共用，例如 ppocrv6_dict.txt）
    let mut protected: HashSet<&str> = HashSet::new();
    for choice in MODEL_CHOICES {
        let other = choice.0;
        if other == id || !ready_set(other) {
            continue;
        }
        if let Some(os) = model_set_by_name(other) {
            for a in os.assets_for_pipeline(pipeline()) {
                protected.insert(a.filename);
            }
        }
    }
    for a in spec.assets_for_pipeline(pipeline()) {
        if protected.contains(a.filename) {
            continue;
        }
        let p = dir.join(a.filename);
        if p.is_file() {
            fs::remove_file(&p).map_err(|e| format!("删除 {} 失败：{e}", p.display()))?;
        }
        let part = dir.join(a.filename).with_extension("part");
        if part.is_file() {
            fs::remove_file(&part).ok();
        }
    }
    crate::storage::diag_write(&format!("[ocr] deleted model set {id}"));
    Ok(())
}

/// 删除档位模型（数据目录内），返回删除后的最新状态列表。
#[tauri::command]
pub fn ocr_model_delete(model: String) -> Result<Vec<OcrModelInfo>, String> {
    delete_model(&model)?;
    Ok(model_status())
}

/// 请求取消进行中的模型下载（半成品保留，下次从断点接着下）。
#[tauri::command]
pub fn ocr_model_cancel() {
    cancel_download();
}
