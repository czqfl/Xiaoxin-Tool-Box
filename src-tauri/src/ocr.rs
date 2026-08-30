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
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use rapidocr_core::{
    config::{InferenceOptions, PipelineConfig},
    model::{model_set_by_name, ModelCache, ModelDownloadMode},
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
    // 兜底：往可写数据目录下载（用户选了未内置的档位，或开发期源码目录缺文件）
    let dir = crate::storage::AppPaths::resolve().data_dir.join("models");
    let cache = ModelCache::new(&dir);
    cache
        .ensure_model_set_for_pipeline(spec, pipeline(), ModelDownloadMode::Missing)
        .map_err(|e| format!(
            "OCR 模型 {set_name} 未就位且下载失败（需要联网，或手动把模型放到 {}）：{e}",
            dir.display()
        ))?;
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

/// 下载指定档位模型到可写数据目录（设置页「下载」按钮）。
/// 同步阻塞（6~170MB，走 ModelScope 国内源），调用方放 spawn_blocking。
pub fn download_model(id: &str) -> Result<(), String> {
    let spec = model_set_by_name(id).ok_or_else(|| format!("未知的 OCR 模型档位：{id}"))?;
    if ready_set(id) {
        return Ok(());
    }
    let dir = crate::storage::AppPaths::resolve().data_dir.join("models");
    ModelCache::new(&dir)
        .ensure_model_set_for_pipeline(spec, pipeline(), ModelDownloadMode::Missing)
        .map_err(|e| format!("模型下载失败：{e}"))
}

#[tauri::command]
pub fn ocr_model_status() -> Vec<OcrModelInfo> {
    model_status()
}

/// 下载档位模型（6~170MB，ModelScope 国内源）。整段放阻塞线程池，
/// 完成后直接回一份最新状态列表，设置页不必再发一次查询。
#[tauri::command]
pub async fn ocr_model_download(model: String) -> Result<Vec<OcrModelInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        download_model(&model)?;
        Ok(model_status())
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}
