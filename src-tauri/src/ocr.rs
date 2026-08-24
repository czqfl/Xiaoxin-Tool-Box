//! Windows.Media.Ocr 本地文字识别（WinRT 系统引擎，无需第三方模型/联网）。
//!
//! 输入：选定区域的 PNG 字节；输出：逐行文本 + 行/词矩形（图像内坐标）。
//! 引擎语言：优先用户配置的语言列表，否则取第一个可用语言包；
//! 一个都没有时返回明确错误（前端提示去系统设置添加语言）。

use serde::Serialize;

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

#[cfg(windows)]
pub fn recognize_png(png: &[u8]) -> Result<Vec<OcrLineResp>, String> {
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    // WinRT 初始化：本函数跑在专用线程上（调用方保证），MTA 模式
    unsafe { let _ = RoInitialize(RO_INIT_MULTITHREADED); }

    // ---- 引擎：用户语言 → 任一可用语言包 ----
    let engine = OcrEngine::TryCreateFromUserProfileLanguages().ok().or_else(|| {
        let langs = OcrEngine::AvailableRecognizerLanguages().ok()?;
        let Ok(n) = langs.Size() else { return None };
        for i in 0..n {
            let Ok(lang) = langs.GetAt(i) else { continue };
            let Ok(tag) = lang.LanguageTag() else { continue };
            if let Ok(l2) = Language::CreateLanguage(&tag) {
                if let Ok(e) = OcrEngine::TryCreateFromLanguage(&l2) {
                    return Some(e);
                }
            }
        }
        None
    }).ok_or_else(|| "本机没有可用的 OCR 语言包：请在 Windows 设置 → 时间和语言 → 语言 中添加中文或英文".to_string())?;

    // ---- 预处理：小图 Lanczos 放大（Windows OCR 对小字号/低分辨率识别率差，
    //      放大到长边 ~2400px 是公认的免费精度提升；大图不缩不扰）----
    let png_owned;
    let png = {
        let img = image::load_from_memory(png).map_err(|e| format!("decode: {e}"))?;
        let long = img.width().max(img.height());
        let prepared = if long > 0 && long < 1600 {
            let k = (2200f64 / long as f64).min(3.0);
            let nw = ((img.width() as f64) * k).round() as u32;
            let nh = ((img.height() as f64) * k).round() as u32;
            image::DynamicImage::ImageRgba8(image::imageops::resize(
                &img.to_rgba8(), nw.max(1), nh.max(1),
                image::imageops::FilterType::Lanczos3,
            ))
        } else { img };
        let mut out = std::io::Cursor::new(Vec::new());
        prepared.write_to(&mut out, image::ImageFormat::Png).map_err(|e| format!("encode: {e}"))?;
        png_owned = out.into_inner();
        &png_owned[..]
    };

    // ---- PNG 字节 → 内存流 → SoftwareBitmap ----
    let stream = InMemoryRandomAccessStream::new().map_err(|e| format!("stream: {e}"))?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| format!("writer: {e}"))?;
    writer.WriteBytes(png).map_err(|e| format!("write: {e}"))?;
    writer.StoreAsync().and_then(|op| op.get()).map_err(|e| format!("store: {e}"))?;
    writer.FlushAsync().and_then(|op| op.get()).ok();
    writer.DetachStream().map_err(|e| format!("detach: {e}"))?;
    drop(writer);
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .and_then(|op| op.get()).map_err(|e| format!("decode: {e}"))?;
    let bmp = decoder.GetSoftwareBitmapAsync()
        .and_then(|op| op.get()).map_err(|e| format!("bitmap: {e}"))?;

    // ---- 识别 ----
    let result = engine.RecognizeAsync(&bmp)
        .and_then(|op| op.get()).map_err(|e| format!("recognize: {e}"))?;

    let lines = result.Lines().map_err(|e| format!("lines: {e}"))?;
    let Ok(n) = lines.Size() else { return Ok(Vec::new()) };
    let mut out = Vec::with_capacity(n as usize);
    for i in 0..n {
        let Ok(line) = lines.GetAt(i) else { continue };
        let Ok(text) = line.Text() else { continue };
        let text = text.to_string();
        if text.trim().is_empty() { continue; }
        // 行矩形由词矩形并集推导（OcrLine 不提供 BoundingRect）
        let mut words_out: Vec<OcrWordResp> = Vec::new();
        let mut lx = f32::MAX; let mut ly = f32::MAX; let mut lr = f32::MIN; let mut lb = f32::MIN;
        if let Ok(words) = line.Words() {
            if let Ok(wn) = words.Size() {
                for j in 0..wn {
                    let Ok(w) = words.GetAt(j) else { continue };
                    let wr = w.BoundingRect().unwrap_or_default();
                    let t = w.Text().map(|s| s.to_string()).unwrap_or_default();
                    lx = lx.min(wr.X); ly = ly.min(wr.Y);
                    lr = lr.max(wr.X + wr.Width); lb = lb.max(wr.Y + wr.Height);
                    words_out.push(OcrWordResp { t: t.to_string(), x: wr.X, y: wr.Y, w: wr.Width, h: wr.Height });
                }
            }
        }
        let (rx, ry, rw, rh) = if lx < lr { (lx, ly, lr - lx, lb - ly) } else { (0.0, 0.0, 0.0, 0.0) };
        out.push(OcrLineResp {
            text,
            x: rx, y: ry, w: rw, h: rh,
            words: words_out,
        });
    }
    Ok(out)
}

#[cfg(not(windows))]
pub fn recognize_png(_png: &[u8]) -> Result<Vec<OcrLineResp>, String> {
    Err("仅支持 Windows".into())
}
