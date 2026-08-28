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

/// 自动电平 + 暗底反色（OCR 精度关键预处理）：
/// ① 1%/99% 百分位线性拉伸——"发灰"的截图文字拉到纯黑纯白；
///    动态范围已接近满量程（跨度 ≥207 灰阶）时不处理，避免放大噪点。
/// ② 拉伸后均值偏暗（<128）判定为深色主题截图（白字黑底）——Windows OCR
///    按"深字浅底"训练，深色 UI 不反色会成片漏识别，故整体反色。
#[cfg(windows)]
fn auto_levels_invert(img: image::GrayImage) -> image::GrayImage {
    let total = img.width() as u64 * img.height() as u64;
    if total == 0 {
        return img;
    }
    let mut hist = [0u64; 256];
    for p in img.pixels() {
        hist[p[0] as usize] += 1;
    }
    let lo_target = (total as f64 * 0.01) as u64;
    let hi_target = (total as f64 * 0.01) as u64;
    let mut lo: usize = 0;
    let mut hi: usize = 255;
    let mut acc = 0u64;
    for i in 0..256 {
        acc += hist[i];
        if acc >= lo_target {
            lo = i;
            break;
        }
    }
    acc = 0;
    for i in (0..256).rev() {
        acc += hist[i];
        if acc >= hi_target {
            hi = i;
            break;
        }
    }
    let mut out = img;
    // 跨度不足说明整体偏平（低对比），拉伸有意义；已接近满量程则跳过
    if ((hi - lo) as i32) < 255 - 48 {
        let scale = 255f32 / (hi - lo).max(1) as f32;
        for p in out.pixels_mut() {
            let v = (p[0] as f32 - lo as f32) * scale;
            p[0] = v.clamp(0.0, 255.0).round() as u8;
        }
    }
    // 反色判定用拉伸后的直方图均值（深色 UI 底色占大面积 → 均值低）
    let mut sum = 0u64;
    let mut hist2 = [0u64; 256];
    for p in out.pixels() {
        hist2[p[0] as usize] += 1;
    }
    for i in 0..256 {
        sum += hist2[i] * i as u64;
    }
    if (sum / total) < 128 {
        for p in out.pixels_mut() {
            p[0] = 255 - p[0];
        }
    }
    out
}

/// 轻度非锐化掩蔽：out = c + amount*(c - 3x3均值)，抵消 Lanczos 放大的软化。
/// 仅在放大发生（k≠1）时调用，此时边长上限 ~2600，全图卷积开销可控。
#[cfg(windows)]
fn unsharp(img: &image::GrayImage, amount: f32) -> image::GrayImage {
    let (w, h) = img.dimensions();
    let mut out = image::GrayImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let c = img.get_pixel(x, y)[0] as f32;
            let mut sum = 0f32;
            let mut n = 0f32;
            for dy in -1..=1i32 {
                for dx in -1..=1i32 {
                    let xx = (x as i32 + dx).clamp(0, w as i32 - 1) as u32;
                    let yy = (y as i32 + dy).clamp(0, h as i32 - 1) as u32;
                    sum += img.get_pixel(xx, yy)[0] as f32;
                    n += 1.0;
                }
            }
            let v = c + amount * (c - sum / n);
            out.get_pixel_mut(x, y)[0] = v.clamp(0.0, 255.0).round() as u8;
        }
    }
    out
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

    // ---- 引擎：按【线程】缓存（spawn_blocking 线程池复用线程，命中率高）----
    // 每次命令调用都 TryCreate 引擎要付出语言匹配 + 引擎初始化的开销；
    // thread_local 存储，绕开 WinRT 包装类型的 Send 约束。失败不缓存，
    // 下次调用自动重试（如系统正在补装语言包）。
    // 【已知取舍】成功后引擎永不失效——用户新增 OCR 语言包需重启应用才
    // 会被新起的识别线程用到；语言包变更属极低频操作，不值得为此在每次
    // 调用上加失效检测
    thread_local! {
        static OCR_ENGINE: std::cell::RefCell<Option<OcrEngine>> =
            const { std::cell::RefCell::new(None) };
    }
    let cached = OCR_ENGINE.with(|c| c.borrow().clone());
    let engine = match cached {
        Some(e) => e,
        None => {
            let created = OcrEngine::TryCreateFromUserProfileLanguages().ok().or_else(|| {
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
            OCR_ENGINE.with(|c| *c.borrow_mut() = Some(created.clone()));
            created
        }
    };

    // ---- 预处理（精度优先，统一管线）----
    // 【精度】① 小图 Lanczos 放大（Windows OCR 对小字号/低分辨率识别率差；
    //         上限 6x：工具栏/状态栏级别的极小截图放大更足才够认）；
    //         ② 自动电平：1%/99% 百分位对比度拉伸——浅灰底淡字、拍照/压缩
    //         截图的"发灰"文字拉到纯黑纯白，识别率显著改善；
    //         ③ 暗底反色：均值偏暗判定为深色主题截图（白字黑底），整体反色
    //         ——Windows OCR 按"深字浅底"训练，不反色时深色 UI 成片漏识别；
    //         ④ 放大后轻度锐化，抵消 Lanczos 的软化；
    //         ⑤ 四周加中灰(#808080)描边——文字贴边时引擎经常整行漏识别；
    //         透明底先合成到白底再灰度化，防"透明底深色字"被灰度成全黑。
    //         所有尺寸统一走该管线：原先 1600-4096 直出分支跳过了 ②③⑤，
    //         同一张图不同尺寸精度不一致；且 has_alpha 判定本就要全图解码，
    //         直出省下的解码在这里重编码里会赚回来
    // 【速度】缩放后重编码用 BMP 而不是 PNG——BMP 几乎是内存直拷
    // 【坐标】pad/scale 全程记录：返回矩形统一 (c - pad) / scale 映射回
    //         原图像素坐标系，调用方（贴图选词高亮）按原图坐标做命中
    let mut scale = 1f64;
    let mut pad = 0f32;
    let png_owned;
    let png: &[u8] = {
        let img = image::load_from_memory(png).map_err(|e| format!("decode: {e}"))?;
        let long = img.width().max(img.height());
        let k: f64 = if long < 1600 {
            (2200f64 / long as f64).min(6.0)
        } else if long > 4096 {
            4096f64 / long as f64
        } else {
            1.0
        };
        // 透明底合成到白底（防透明 PNG 灰度化后内容全黑）
        let mut flat = image::RgbaImage::from_pixel(img.width(), img.height(), image::Rgba([255u8, 255, 255, 255]));
        image::imageops::overlay(&mut flat, &img.to_rgba8(), 0, 0);
        let gray = image::imageops::grayscale(&flat);
        let mut gray = auto_levels_invert(gray);
        let nw = ((img.width() as f64) * k).round().max(1.0) as u32;
        let nh = ((img.height() as f64) * k).round().max(1.0) as u32;
        // k=1 时跳过等尺寸重采样（也就不做锐化——原尺寸本就清晰）
        if k != 1.0 {
            let resized = image::imageops::resize(&gray, nw, nh, image::imageops::FilterType::Lanczos3);
            gray = unsharp(&resized, 0.35);
        }
        // 中灰描边：给贴边文字留出引擎需要的呼吸空间
        let p = (((nw.max(nh)) as f64) * 0.02).round().clamp(12.0, 48.0) as u32;
        let mut canvas = image::GrayImage::from_pixel(nw + p * 2, nh + p * 2, image::Luma([128u8]));
        image::imageops::replace(&mut canvas, &gray, p as i64, p as i64);
        // 转 RGB 再编码：BMP 编码器对 Rgb8 的支持最有保证
        let mut out = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image::DynamicImage::ImageLuma8(canvas).to_rgb8())
            .write_to(&mut out, image::ImageFormat::Bmp)
            .map_err(|e| format!("encode: {e}"))?;
        png_owned = out.into_inner();
        scale = k;
        pad = p as f32;
        &png_owned[..]
    };

    // ---- 图像字节 → 内存流 → SoftwareBitmap（BMP 或透传的原始 PNG）----
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
    // 【坐标还原回原图】预处理做了 pad 描边 + 缩放：OCR 矩形在
    // "pad 后缩放图"坐标系，统一 (c - pad) / scale 映射回原图像素坐标系。
    // 不还原的话前端高亮会整体偏移放大数倍（"底纹和文本对不上"的根因）
    if scale != 1.0 || pad > 0.0 {
        let inv = 1.0f32 / scale as f32;
        for l in &mut out {
            l.x = (l.x - pad) * inv; l.y = (l.y - pad) * inv;
            l.w *= inv; l.h *= inv;
            for w in &mut l.words {
                w.x = (w.x - pad) * inv; w.y = (w.y - pad) * inv;
                w.w *= inv; w.h *= inv;
            }
        }
    }
    Ok(out)
}

#[cfg(not(windows))]
pub fn recognize_png(_png: &[u8]) -> Result<Vec<OcrLineResp>, String> {
    Err("仅支持 Windows".into())
}
