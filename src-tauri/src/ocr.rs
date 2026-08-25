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

    // ---- 预处理（精度 + 速度双优化）----
    // 【精度】小图 Lanczos 放大（Windows OCR 对小字号/低分辨率识别率差；
    //         上限 3x→4x：工具栏/状态栏级别的极小截图放大更足才够认）；
    //         四周加中灰(#808080)描边——文字贴边时引擎经常整行漏识别，
    //         留白后显著改善（灰色与黑字白字都能区分）；透明底先合成到
    //         白底再灰度化，防"透明底深色字"被灰度成全黑
    // 【速度】缩放后重编码用 BMP 而不是 PNG——BMP 几乎是内存直拷，
    //         PNG deflate 压缩是大图路径最大的 CPU 开销；BitmapDecoder
    //         原生支持 BMP，识别结果完全一致
    // 【坐标】pad/scale 全程记录：返回矩形统一 (c - pad) / scale 映射回
    //         原图像素坐标系，调用方（贴图选词高亮）按原图坐标做命中
    let mut scale = 1f64;
    let mut pad = 0f32;
    let png_owned;
    let png: &[u8] = {
        let img = image::load_from_memory(png).map_err(|e| format!("decode: {e}"))?;
        let long = img.width().max(img.height());
        // 缩放比：小图放大到长边 ~2200（上限 4x）；超大图降采样到长边 4096；
        // 尺寸合适的中间区间原字节直出（零重编码，WinRT 自行解码）
        let needs_resize = !(1600..=4096).contains(&long);
        let k: f64 = if !needs_resize {
            1.0
        } else if long < 1600 {
            (2200f64 / long as f64).min(4.0)
        } else {
            4096f64 / long as f64
        };
        // 【透明度一致性】中间尺寸区间虽然不需要缩放，但带透明像素的图不能
        // 直出——Windows OCR 对透明底的处理不可控（常按黑底合成，深色字直接
        // 隐没），此前小图/超大图路径都做白底合成、唯独这段直出，同一张透明
        // PNG 在不同尺寸下精度表现不一致。有实际透明像素（alpha<255）才走
        // 统一预处理管线；纯不透明图维持零成本直出
        let has_alpha = img.color().has_alpha() && {
            let rgba = img.to_rgba8();
            rgba.pixels().any(|p| p[3] < 255)
        };
        if !needs_resize && !has_alpha {
            png
        } else {
            // 透明底合成到白底（防透明 PNG 灰度化后内容全黑）
            let mut flat = image::RgbaImage::from_pixel(img.width(), img.height(), image::Rgba([255u8, 255, 255, 255]));
            image::imageops::overlay(&mut flat, &img.to_rgba8(), 0, 0);
            // 灰度化：去掉彩色噪声，后续 resize/BMP 编码的数据量也只有 1/3
            let gray = image::imageops::grayscale(&flat);
            let nw = ((img.width() as f64) * k).round().max(1.0) as u32;
            let nh = ((img.height() as f64) * k).round().max(1.0) as u32;
            // k=1（仅透明度触发的预处理）跳过等尺寸重采样
            let resized = if k == 1.0 {
                gray
            } else {
                image::imageops::resize(&gray, nw, nh, image::imageops::FilterType::Lanczos3)
            };
            // 中灰描边：给贴边文字留出引擎需要的呼吸空间
            let p = (((nw.max(nh)) as f64) * 0.02).round().clamp(12.0, 48.0) as u32;
            let mut canvas = image::GrayImage::from_pixel(nw + p * 2, nh + p * 2, image::Luma([128u8]));
            image::imageops::replace(&mut canvas, &resized, p as i64, p as i64);
            // 转 RGB 再编码：BMP 编码器对 Rgb8 的支持最有保证
            let mut out = std::io::Cursor::new(Vec::new());
            image::DynamicImage::ImageRgb8(image::DynamicImage::ImageLuma8(canvas).to_rgb8())
                .write_to(&mut out, image::ImageFormat::Bmp)
                .map_err(|e| format!("encode: {e}"))?;
            png_owned = out.into_inner();
            scale = k;
            pad = p as f32;
            &png_owned[..]
        }
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
