//! H.264/MP4 视频编码：Media Foundation Sink Writer。
//!
//! 取代旧 MJPEG 路径（MJPEG-in-AVI 黑屏 / MJPEG-in-MP4 播放器报错）：
//! - 输出标准 H.264 MP4，走系统【软件】H.264 编码器：刻意不开
//!   MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS（硬件 MFT 连续喂 BGRA 会驱动级崩溃，
//!   见 new() 内注释），任何 Win10+ 播放器/浏览器都能解；
//! - 输入 ARGB32（即 DXGI 采集的 BGRA 原始布局，自顶向下），Sink Writer 自动
//!   插入色彩转换 MFT 转 NV12 喂给编码器，无需手写 YUV；
//! - 帧时间戳用真实采集间隔（可变帧率），播放速度与实际一致。
//!
//! 线程约束：COM 接口非 Send，所有方法必须在创建线程（录制线程）上调用。

#![cfg(windows)]

use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Variant::VARIANT;
use windows::core::{GUID, Interface, PCWSTR};

/// 画质 → 码率（bits/s）。按"像素数 × 帧率 × 每像素位数"估算，
/// 屏幕内容 bpp 0.10~0.25 才干净；夹在 800kbps~60Mbps 防极端区域。
pub fn bitrate_for(w: u32, h: u32, fps: u32, quality: crate::recorder::RecQuality) -> u32 {
    // 屏幕内容（文字/界面锐边）比影视画面难压，同分辨率需要更高码率才不糊。
    // 旧系数（0.14/0.09/0.055）在 1080p 下只有 ~2Mbps，文字发虚；整体上调 ~1.7x。
    let bpp = match quality {
        crate::recorder::RecQuality::High => 0.25,
        crate::recorder::RecQuality::Normal => 0.16,
        crate::recorder::RecQuality::Fast => 0.10,
    };
    (((w as f64) * (h as f64) * (fps as f64) * bpp).round() as u32)
        .clamp(800_000, 60_000_000)
}

fn hr_err(ctx: &str, e: windows::core::Error) -> String {
    format!("{ctx} 失败: {e}")
}

/// 编码器调参档位。生产路径恒用 `Tuned`；另两档只服务于
/// `examples/recq_probe.rs` 的同内容 A/B 对比——不要当成配置暴露给用户。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncTuning {
    /// 历史行为：只设平均码率，profile / 码控全跑编码器默认值
    Baseline,
    /// 只补 H.264 High profile
    ProfileOnly,
    /// profile + 质量优先 VBR + 质量档 + GOP（推荐）
    Tuned,
}

/// AAC 音频流参数（录制线程从 recaudio 的规范格式 48k/2ch 传入）
#[derive(Debug, Clone, Copy)]
pub struct AudioCfg {
    pub sample_rate: u32,
    pub channels: u16,
    /// AAC 码率 bits/s（如 128_000）
    pub bitrate: u32,
}

/// 通过 ICodecAPI 调编码器码控参数，成功取到并设上返回 true。
///
/// 微软那份 H.264 编码器文档【没有写】从 IMFSinkWriter 拿 ICodecAPI 时 guidService
/// 该传什么，所以两种候选依次试；实测在 AddStream 之后取会失败（编码器 MFT 还没
/// 建起来），故调用方在 SetInputMediaType 与 BeginWriting 之后各试一次。
/// 任何失败都只是保持编码器默认参数，绝不影响录制能否开始。
unsafe fn apply_codec_settings(
    writer: &IMFSinkWriter,
    stream: u32,
    fps: u32,
    quality: crate::recorder::RecQuality,
) -> bool {
    use crate::recorder::RecQuality::*;
    let iid = ICodecAPI::IID;
    let mut codec: Option<ICodecAPI> = None;
    let candidates: [(&str, GUID); 2] = [("GUID_NULL", GUID::zeroed()), ("IID_ICodecAPI", iid)];
    for (label, svc) in candidates {
        let mut obj: *mut core::ffi::c_void = std::ptr::null_mut();
        if writer.GetServiceForStream(stream, &svc, &iid, &mut obj).is_ok() && !obj.is_null() {
            codec = Some(ICodecAPI::from_raw(obj));
            crate::storage::diag_write(&format!("[recorder] ICodecAPI 取得成功（guidService={label}）"));
            break;
        }
    }
    let Some(codec) = codec else { return false };
    // 值域出自微软 H.264 编码器文档：Quality 1–100（默认 70）、
    // QualityVsSpeed 0–100（默认档 34–66）、GOP [0..2^32-1]（0 = 编码器自选）
    let (q, speed) = match quality {
        High => (88, 85),
        Normal => (75, 50),
        Fast => (62, 20),
    };
    // 这些属性的 VARIANT 类型文档里是 VT_UI4 居多，但也有 VT_I4（枚举）——
    // 类型不匹配时 SetValue 直接返回错误、参数被静默丢弃。所以逐个试两种类型，
    // 并把"哪种类型成功"记下来，否则根本看不出参数到底有没有生效。
    let mut report = String::new();
    let mut put = |name: &str, guid: &windows::core::GUID, i: i32, u: u32| {
        let r4 = codec.SetValue(guid, &VARIANT::from(i));
        if r4.is_ok() {
            report.push_str(&format!("{name}=i4 "));
            return;
        }
        let ru4 = codec.SetValue(guid, &VARIANT::from(u));
        report.push_str(&if ru4.is_ok() {
            format!("{name}=u4 ")
        } else {
            format!("{name}=拒绝({:?}) ", ru4.unwrap_err().code().0)
        });
    };
    // 质量优先 VBR：屏幕内容大面积静止，ABR 会把静止段省下的码率挪走，
    // 结果滚动时糊；改成按质量给码率才稳定
    put(
        "rateMode",
        &CODECAPI_AVEncCommonRateControlMode,
        eAVEncCommonRateControlMode_Quality.0,
        eAVEncCommonRateControlMode_Quality.0 as u32,
    );
    put("quality", &CODECAPI_AVEncCommonQuality, q, q as u32);
    put("qvsSpeed", &CODECAPI_AVEncCommonQualityVsSpeed, speed, speed as u32);
    // 5 秒一个关键帧：屏幕录制静止多，GOP 越稀越省码率给真正变化的画面
    let gop = fps.saturating_mul(5);
    put("gop", &CODECAPI_AVEncMPVGOPSize, gop as i32, gop);
    // 刻意不设 CODECAPI_AVEncVideoEncodeQP——它会覆盖 AVEncCommonQuality
    crate::storage::diag_write(&format!("[recorder] 编码器属性设置：{report}"));
    true
}

pub struct H264Writer {
    /// 字段用 Option：Drop 需要控制释放顺序（接口先于 MFShutdown/CoUninitialize）
    writer: Option<IMFSinkWriter>,
    sample: Option<IMFSample>,
    buffer: Option<IMFMediaBuffer>,
    /// 一帧字节数 = w*h*4
    frame_bytes: usize,
    /// 帧高（行数）与单行字节数，供写入时做上下翻转
    h: u32,
    stride: usize,
    stream: u32,
    /// AAC 音频流索引（None = 本次无音轨）
    audio_stream: Option<u32>,
    /// 音频下一帧时间戳（100ns 单位），用累计精确式推进避免漂移
    audio_next_ts: i64,
    /// 已写入的音频采样帧数（每通道）
    audio_frames: u64,
    /// 音频采样率（用于把帧数换算成 100ns 时间戳）
    audio_rate: u32,
    /// 下一帧时间戳（100ns 单位）
    next_ts: i64,
    mf_started: bool,
    com_inited: bool,
}

impl H264Writer {
    /// 创建 MP4 Sink Writer。path 需为绝对路径；尺寸需为偶数（调用方保证）。
    /// 创建编码器。`quality` 决定编码器质量档（映射到 CODECAPI_AVEncCommonQuality 等），
    /// `tuning` 决定用哪一档参数组合（生产用 `EncTuning::Tuned`）。
    /// 无音频入口（GIF / 音频不可用 / 探针 baseline），等价于 new_ex(audio=None)。
    pub fn new(
        path: &std::path::Path,
        w: u32,
        h: u32,
        fps: u32,
        bitrate: u32,
        quality: crate::recorder::RecQuality,
        tuning: EncTuning,
    ) -> Result<Self, String> {
        Self::new_ex(path, w, h, fps, bitrate, quality, tuning, None)
    }

    /// 创建 MP4 Sink Writer。`audio` 非 None 时额外加一条 AAC 音频流。
    /// 音频 AddStream/输入类型失败 → 返回 Err，调用方（recorder）用 None 重试，
    /// 绝不因音频让录制起不来。
    pub fn new_ex(
        path: &std::path::Path,
        w: u32,
        h: u32,
        fps: u32,
        bitrate: u32,
        quality: crate::recorder::RecQuality,
        tuning: EncTuning,
        audio: Option<AudioCfg>,
    ) -> Result<Self, String> {
        unsafe {
            // COM 初始化（录制线程独立于主线程）。已初始化（含模式冲突）不算错误
            let co = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
            let com_inited = co.is_ok();
            let init = |r: Result<Self, String>| {
                if com_inited {
                    windows::Win32::System::Com::CoUninitialize();
                }
                r
            };

            let ms = MFStartup(MF_VERSION, MFSTARTUP_LITE).map_err(|e| hr_err("MFStartup", e));
            let mf_started = match ms {
                Ok(()) => true,
                Err(e) => return init(Err(e)),
            };
            let unwind = |r: Result<Self, String>| {
                if mf_started {
                    let _ = MFShutdown();
                }
                init(r)
            };

            // Sink Writer 属性：不做写入节流（录制实时性优先）。
            // 【刻意不启用 MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS】：GPU 硬件编码 MFT
            // 在连续快速提交 BGRA 帧时会驱动级崩溃（0xc0000005，且发生在 native 内部、
            // Rust 无法捕获——实测第 1 帧成功、第 2 帧即死；GIF 路径同采集却完全正常，
            // 可锁定为编码器而非采集）。软件编码器（Microsoft H.264 Encoder MFT）
            // 对屏幕录制这种分辨率/帧率毫无压力，稳定性远高于各厂商驱动。
            let mut attrs_opt: Option<IMFAttributes> = None;
            if let Err(e) = MFCreateAttributes(&mut attrs_opt, 1) {
                return unwind(Err(hr_err("MFCreateAttributes", e)));
            }
            let Some(attrs) = attrs_opt else { return unwind(Err("MFCreateAttributes 返回空".into())) };
            let _ = attrs.SetUINT32(&MF_SINK_WRITER_DISABLE_THROTTLING, 1);

            let mut url: Vec<u16> = path
                .to_string_lossy()
                .replace('/', "\\")
                .encode_utf16()
                .collect();
            url.push(0);
            let writer = match MFCreateSinkWriterFromURL(
                PCWSTR(url.as_ptr()),
                None,
                Some(&attrs),
            ) {
                Ok(w) => w,
                Err(e) => return unwind(Err(hr_err("创建 MP4 SinkWriter", e))),
            };

            // 输出媒体类型：H.264
            let out_mt = match MFCreateMediaType() {
                Ok(m) => m,
                Err(e) => return unwind(Err(hr_err("MFCreateMediaType", e))),
            };
            let set = |r: windows::core::Result<()>| r.map_err(|e| hr_err("配置输出媒体类型", e));
            set(out_mt.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video))?;
            set(out_mt.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264))?;
            set(out_mt.SetUINT32(&MF_MT_AVG_BITRATE, bitrate))?;
            set(out_mt.SetUINT64(&MF_MT_FRAME_SIZE, ((w as u64) << 32) | h as u64))?;
            set(out_mt.SetUINT64(&MF_MT_FRAME_RATE, ((fps as u64) << 32) | 1))?;
            set(out_mt.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, (1u64 << 32) | 1))?;
            set(out_mt.SetUINT32(
                &MF_MT_INTERLACE_MODE,
                MFVideoInterlace_Progressive.0 as u32,
            ))?;
            // 【关键】微软 H.264 编码器文档要求 profile 走 MF_MT_MPEG2_PROFILE（不是
            // MF_MT_VIDEO_PROFILE）。不设的话编码器跑默认 profile，屏幕文字的锐边质量明显吃亏。
            // 取 High：软件 H.264 MFT 全支持，播放器兼容也没问题。
            if tuning != EncTuning::Baseline {
                set(out_mt.SetUINT32(&MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_High.0 as u32))?;
                // 兜底：个别构建读 VIDEO_PROFILE，设失败无所谓
                let _ = out_mt.SetUINT32(&MF_MT_VIDEO_PROFILE, eAVEncH264VProfile_High.0 as u32);
            }

            let stream = match writer.AddStream(&out_mt) {
                Ok(s) => s,
                Err(e) => return unwind(Err(hr_err("AddStream", e))),
            };
            // 编码器属性是否已设上。AddStream 之后立刻取 ICodecAPI 实测拿不到
            // ——此时内部编码器 MFT 尚未实例化，必须等 SetInputMediaType 之后。
            let mut codec_ok = false;

            // 输入媒体类型：ARGB32 = 自顶向下 BGRA（DXGI 采集数据原样喂入）
            let in_mt = match MFCreateMediaType() {
                Ok(m) => m,
                Err(e) => return unwind(Err(hr_err("MFCreateMediaType", e))),
            };
            let set = |r: windows::core::Result<()>| r.map_err(|e| hr_err("配置输入媒体类型", e));
            set(in_mt.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video))?;
            set(in_mt.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_ARGB32))?;
            set(in_mt.SetUINT64(&MF_MT_FRAME_SIZE, ((w as u64) << 32) | h as u64))?;
            set(in_mt.SetUINT64(&MF_MT_FRAME_RATE, ((fps as u64) << 32) | 1))?;
            set(in_mt.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, (1u64 << 32) | 1))?;
            set(in_mt.SetUINT32(
                &MF_MT_INTERLACE_MODE,
                MFVideoInterlace_Progressive.0 as u32,
            ))?;
            set(in_mt.SetUINT32(&MF_MT_ALL_SAMPLES_INDEPENDENT, 1))?;

            if let Err(e) = writer.SetInputMediaType(stream, &in_mt, None::<&IMFAttributes>) {
                return unwind(Err(hr_err("SetInputMediaType（无可用 H.264 编码器？）", e)));
            }
            // 码控/质量/GOP 属性：编码器实例此时才存在，先在这里试
            if tuning == EncTuning::Tuned {
                codec_ok = apply_codec_settings(&writer, stream, fps, quality);
            }

            // ---- 可选 AAC 音轨 ----
            // AddStream / SetInputMediaType 都必须在 BeginWriting 之前完成。
            // 【关键】任一步失败一律走 unwind（正确 MFShutdown + CoUninitialize 后
            // 才返回 Err），让 recorder 能用 None 干净地重建一个无音轨的 writer——
            // 绝不允许"音频起不来就整段录不了"。
            let mut audio_stream: Option<u32> = None;
            let mut audio_rate: u32 = 0;
            if let Some(cfg) = audio {
                let a_out = match MFCreateMediaType() {
                    Ok(m) => m,
                    Err(e) => return unwind(Err(hr_err("创建音频输出媒体类型", e))),
                };
                let aset =
                    |r: windows::core::Result<()>| r.map_err(|e| hr_err("配置 AAC 输出类型", e));
                if let Err(e) = aset(a_out.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio))
                    .and_then(|_| aset(a_out.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_AAC)))
                    .and_then(|_| {
                        aset(a_out.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, cfg.sample_rate))
                    })
                    .and_then(|_| {
                        aset(a_out.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, cfg.channels as u32))
                    })
                    .and_then(|_| aset(a_out.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)))
                    .and_then(|_| {
                        aset(a_out.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND, cfg.bitrate / 8))
                    })
                {
                    return unwind(Err(e));
                }
                let astream = match writer.AddStream(&a_out) {
                    Ok(s) => s,
                    Err(e) => return unwind(Err(hr_err("音频 AddStream", e))),
                };

                let a_in = match MFCreateMediaType() {
                    Ok(m) => m,
                    Err(e) => return unwind(Err(hr_err("创建音频输入媒体类型", e))),
                };
                // AAC 编码器收 PCM s16 交错；与 recaudio 的 48k/2ch 规范格式一致
                let aset =
                    |r: windows::core::Result<()>| r.map_err(|e| hr_err("配置 PCM 输入类型", e));
                let block_align = cfg.channels as u32 * 2;
                if let Err(e) = aset(a_in.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio))
                    .and_then(|_| aset(a_in.SetGUID(&MF_MT_SUBTYPE, &MFAudioFormat_PCM)))
                    .and_then(|_| {
                        aset(a_in.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, cfg.sample_rate))
                    })
                    .and_then(|_| {
                        aset(a_in.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, cfg.channels as u32))
                    })
                    .and_then(|_| aset(a_in.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE, 16)))
                    .and_then(|_| aset(a_in.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT, block_align)))
                    .and_then(|_| {
                        aset(a_in.SetUINT32(
                            &MF_MT_AUDIO_AVG_BYTES_PER_SECOND,
                            cfg.sample_rate.saturating_mul(block_align),
                        ))
                    })
                {
                    return unwind(Err(e));
                }
                if let Err(e) = writer.SetInputMediaType(astream, &a_in, None::<&IMFAttributes>) {
                    return unwind(Err(hr_err(
                        "音频 SetInputMediaType（无可用 AAC 编码器？）",
                        e,
                    )));
                }
                audio_stream = Some(astream);
                audio_rate = cfg.sample_rate;
                crate::storage::diag_write(&format!(
                    "[recorder] 音频流已就绪：AAC {}Hz/{}ch/{}kbps",
                    cfg.sample_rate,
                    cfg.channels,
                    cfg.bitrate / 1000
                ));
            }

            if let Err(e) = writer.BeginWriting() {
                return unwind(Err(hr_err("BeginWriting", e)));
            }
            // 有些环境要到 BeginWriting 才把内部 MFT 建起来，补试一次
            if tuning == EncTuning::Tuned && !codec_ok {
                codec_ok = apply_codec_settings(&writer, stream, fps, quality);
            }
            if tuning == EncTuning::Tuned && !codec_ok {
                crate::storage::diag_write(
                    "[recorder] ICodecAPI 不可达：编码器保持默认码控（仅 profile 生效）",
                );
            }

            let frame_bytes = (w as usize) * (h as usize) * 4;
            // 下面这一对仅作【初始化探测】：提前暴露内存不足等环境问题。
            // 真正写帧时 write_bgra 会每帧新建 sample + buffer（不可复用）。
            let buffer = match MFCreateMemoryBuffer(frame_bytes as u32) {
                Ok(b) => b,
                Err(e) => return unwind(Err(hr_err("MFCreateMemoryBuffer", e))),
            };
            let sample = match MFCreateSample() {
                Ok(s) => s,
                Err(e) => return unwind(Err(hr_err("MFCreateSample", e))),
            };
            if let Err(e) = sample.AddBuffer(&buffer) {
                return unwind(Err(hr_err("AddBuffer", e)));
            }

            Ok(Self {
                writer: Some(writer),
                sample: Some(sample),
                buffer: Some(buffer),
                frame_bytes,
                h,
                stride: w as usize * 4,
                stream,
                // 音轨：无 AudioCfg / 音频不可用 时为 None，write_pcm16 会安全拒绝
                audio_stream,
                audio_next_ts: 0,
                audio_frames: 0,
                audio_rate,
                next_ts: 0,
                mf_started,
                com_inited,
            })
        }
    }

    /// 写入一帧（BGRA，自顶向下，长度 ≥ w*h*4）。
    /// gap_100ns：距上一已写帧的真实间隔（首帧传名义间隔），决定本帧时间戳。
    ///
    /// 【为什么每帧新建 sample + buffer】SinkWriter 对已提交 sample 是异步消费的，
    /// 复用同一个 IMFMediaBuffer 会在编码器仍在读取上一帧时就覆写其内容——
    /// 典型症状就是录到第一帧后整个进程 0xc0000005 访问违规。
    pub fn write_bgra(&mut self, bgra: &[u8], gap_100ns: i64) -> Result<(), String> {
        let dur = gap_100ns.max(1);
        let Some(writer) = self.writer.as_ref() else {
            return Err("编码器已释放".into());
        };
        if bgra.len() < self.frame_bytes {
            return Err(format!("帧数据不足: {} < {}", bgra.len(), self.frame_bytes));
        }
        unsafe {
            let buffer = MFCreateMemoryBuffer(self.frame_bytes as u32)
                .map_err(|e| hr_err("MFCreateMemoryBuffer", e))?;

            let mut p: *mut u8 = std::ptr::null_mut();
            let mut max_len: u32 = 0;
            buffer
                .Lock(&mut p, Some(&mut max_len), None)
                .map_err(|e| hr_err("Lock", e))?;
            // 防御：指针为空或缓冲区不足时放弃写入——继续拷就是越界访问。
            // 必须 Unlock 后再返回，否则 buffer 一直挂锁定状态。
            if p.is_null() || (max_len as usize) < self.frame_bytes {
                let _ = buffer.Unlock();
                return Err(format!("编码缓冲区不足: {max_len} < {}", self.frame_bytes));
            }
            // MF 未压缩 RGB 约定自底向上，而 DXGI 采集是自顶向下——直接 memcpy
            // 会让成片上下颠倒。逐行倒序拷入，画面方向才正确。
            for row in 0..self.h as usize {
                let src_off = row * self.stride;
                let dst_off = (self.h as usize - 1 - row) * self.stride;
                std::ptr::copy_nonoverlapping(
                    bgra.as_ptr().add(src_off),
                    p.add(dst_off),
                    self.stride,
                );
            }
            buffer.Unlock().map_err(|e| hr_err("Unlock", e))?;
            buffer
                .SetCurrentLength(self.frame_bytes as u32)
                .map_err(|e| hr_err("SetCurrentLength", e))?;

            let sample = MFCreateSample().map_err(|e| hr_err("MFCreateSample", e))?;
            sample.AddBuffer(&buffer).map_err(|e| hr_err("AddBuffer", e))?;
            sample
                .SetSampleTime(self.next_ts)
                .map_err(|e| hr_err("SetSampleTime", e))?;
            sample
                .SetSampleDuration(dur)
                .map_err(|e| hr_err("SetSampleDuration", e))?;
            writer
                .WriteSample(self.stream, &sample)
                .map_err(|e| hr_err("WriteSample", e))?;
        }
        self.next_ts += dur;
        Ok(())
    }

    /// 写入一段 PCM（s16 交错 2ch）。frames = 每通道采样帧数。
    ///
    /// 【时间戳为什么用累计精确式】音频一秒上千个采样，`ts += 每包时长` 的累加
    /// 写法会因整除舍入逐步漂移（48k 下每包 208333 个 100ns 单位，零头累积），
    /// 几分钟后音画就对不上。这里改为 `已写帧数 × 10_000_000 / 采样率`，
    /// 误差不累积。
    #[allow(dead_code)] // 供 recaudio::AudioEngine::drain 调用
    pub fn write_pcm16(&mut self, pcm: &[i16], frames: u32) -> Result<(), String> {
        let Some(stream) = self.audio_stream else {
            return Err("本次录制无音轨".into());
        };
        let Some(writer) = self.writer.as_ref() else {
            return Err("编码器已释放".into());
        };
        if self.audio_rate == 0 {
            return Err("音频采样率未初始化".into());
        }
        let ch = 2usize; // recaudio 规范格式恒为 2ch
        let need = (frames as usize).saturating_mul(ch);
        if need == 0 {
            return Ok(());
        }
        if pcm.len() < need {
            return Err(format!("PCM 数据不足: {} < {}", pcm.len(), need));
        }
        let bytes = need * 2;
        unsafe {
            let buffer = MFCreateMemoryBuffer(bytes as u32)
                .map_err(|e| hr_err("音频 MFCreateMemoryBuffer", e))?;
            let mut p: *mut u8 = std::ptr::null_mut();
            let mut max_len: u32 = 0;
            buffer
                .Lock(&mut p, Some(&mut max_len), None)
                .map_err(|e| hr_err("音频 Lock", e))?;
            if p.is_null() || (max_len as usize) < bytes {
                let _ = buffer.Unlock();
                return Err(format!("音频缓冲区不足: {max_len} < {bytes}"));
            }
            std::ptr::copy_nonoverlapping(pcm.as_ptr() as *const u8, p, bytes);
            buffer.Unlock().map_err(|e| hr_err("音频 Unlock", e))?;
            buffer
                .SetCurrentLength(bytes as u32)
                .map_err(|e| hr_err("音频 SetCurrentLength", e))?;

            let sample = MFCreateSample().map_err(|e| hr_err("音频 MFCreateSample", e))?;
            sample
                .AddBuffer(&buffer)
                .map_err(|e| hr_err("音频 AddBuffer", e))?;
            let ts = (self.audio_frames as i64)
                .saturating_mul(10_000_000)
                .saturating_div(self.audio_rate as i64);
            let dur = (frames as i64)
                .saturating_mul(10_000_000)
                .saturating_div(self.audio_rate as i64);
            sample
                .SetSampleTime(ts)
                .map_err(|e| hr_err("音频 SetSampleTime", e))?;
            sample
                .SetSampleDuration(dur.max(1))
                .map_err(|e| hr_err("音频 SetSampleDuration", e))?;
            writer
                .WriteSample(stream, &sample)
                .map_err(|e| hr_err("音频 WriteSample", e))?;
        }
        self.audio_frames = self.audio_frames.saturating_add(frames as u64);
        self.audio_next_ts = (self.audio_frames as i64)
            .saturating_mul(10_000_000)
            .saturating_div(self.audio_rate as i64);
        Ok(())
    }

    /// 已写入视频的时间线位置（100ns）。recaudio 用它判断音画是否脱同步。
    #[allow(dead_code)] // 供 recaudio::AudioEngine::drain 调用
    pub fn video_ts(&self) -> i64 {
        self.next_ts
    }

    /// 已写入音频的时间线位置（100ns）。recaudio 用它判断音画是否脱同步。
    #[allow(dead_code)] // 供 recaudio::AudioEngine::drain 调用
    pub fn audio_ts(&self) -> i64 {
        if self.audio_rate == 0 {
            return 0;
        }
        (self.audio_frames as i64)
            .saturating_mul(10_000_000)
            .saturating_div(self.audio_rate as i64)
    }

    /// 收尾：Finalize 写出 moov 元数据。之后再调用 write_bgra 会报错。
    pub fn finalize(&mut self) -> Result<(), String> {
        let Some(writer) = self.writer.as_ref() else { return Ok(()) };
        unsafe {
            writer.Finalize().map_err(|e| hr_err("Finalize（收尾写盘）", e))
        }
    }
}

impl Drop for H264Writer {
    fn drop(&mut self) {
        unsafe {
            // 释放顺序：COM 接口先释放（让 sink writer 落盘关文件）→ MFShutdown → CoUninitialize
            self.buffer = None;
            self.sample = None;
            self.writer = None;
            if self.mf_started {
                let _ = MFShutdown();
            }
            if self.com_inited {
                windows::Win32::System::Com::CoUninitialize();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 端到端结构验证：写 10 帧渐变 → 输出必须是真 MP4（ftyp 开头 + 有体量）。
    /// 本机有 Media Foundation 即可跑（Win10+ 标配），不依赖具体硬件编码器。
    #[test]
    fn h264_writer_produces_valid_mp4() {
        let (w, h, fps) = (64u32, 48u32, 30u32);
        let path = std::env::temp_dir().join("xiaoxin-h264-test.mp4");
        let _ = std::fs::remove_file(&path);

        let mut wr = H264Writer::new(&path, w, h, fps, 800_000, crate::recorder::RecQuality::Normal, EncTuning::Tuned)
            .expect("创建 H264Writer 失败");
        let frame_bytes = (w * h * 4) as usize;
        let mut bgra = vec![0u8; frame_bytes];
        for f in 0..10u32 {
            for (i, px) in bgra.chunks_exact_mut(4).enumerate() {
                px[0] = (i % w as usize) as u8;            // B
                px[1] = ((i / w as usize) + f as usize) as u8; // G
                px[2] = 255 - (i % 64) as u8;              // R
                px[3] = 255;
            }
            wr.write_bgra(&bgra, 10_000_000 / fps as i64)
                .expect("写帧失败");
        }
        wr.finalize().expect("finalize 失败");
        drop(wr); // Drop 落盘

        let data = std::fs::read(&path).expect("读回输出失败");
        // 渐变图高度可压缩，几帧只需几百字节；关键是容器结构正确
        assert!(data.len() > 500, "输出过小: {} bytes", data.len());
        assert_eq!(&data[4..8], b"ftyp", "MP4 必须以 ftyp 开头");
        assert!(data.windows(4).any(|w| w == b"moov"), "缺少 moov box");
        let _ = std::fs::remove_file(&path);
    }
}
