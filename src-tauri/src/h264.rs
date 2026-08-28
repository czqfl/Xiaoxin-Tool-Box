//! H.264/MP4 视频编码：Media Foundation Sink Writer。
//!
//! 取代旧 MJPEG 路径（MJPEG-in-AVI 黑屏 / MJPEG-in-MP4 播放器报错）：
//! - 输出标准 H.264 MP4，硬件编码器优先（MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS），
//!   不可用时自动协商系统软件编码器，任何 Win10+ 播放器/浏览器都能解；
//! - 输入 ARGB32（即 DXGI 采集的 BGRA 原始布局，自顶向下），Sink Writer 自动
//!   插入色彩转换 MFT 转 NV12 喂给编码器，无需手写 YUV；
//! - 帧时间戳用真实采集间隔（可变帧率），播放速度与实际一致。
//!
//! 线程约束：COM 接口非 Send，所有方法必须在创建线程（录制线程）上调用。

#![cfg(windows)]

use windows::Win32::Media::MediaFoundation::*;
use windows::core::PCWSTR;

/// 画质 → 码率（bits/s）。按“像素数 × 帧率 × 每像素位数”估算，
/// 屏幕内容 bpp 0.05~0.14 已很干净；夹在 600kbps~40Mbps 防极端区域。
pub fn bitrate_for(w: u32, h: u32, fps: u32, quality: crate::recorder::RecQuality) -> u32 {
    let bpp = match quality {
        crate::recorder::RecQuality::High => 0.14,
        crate::recorder::RecQuality::Normal => 0.09,
        crate::recorder::RecQuality::Fast => 0.055,
    };
    (((w as f64) * (h as f64) * (fps as f64) * bpp).round() as u32)
        .clamp(600_000, 40_000_000)
}

fn hr_err(ctx: &str, e: windows::core::Error) -> String {
    format!("{ctx} 失败: {e}")
}

pub struct H264Writer {
    /// 字段用 Option：Drop 需要控制释放顺序（接口先于 MFShutdown/CoUninitialize）
    writer: Option<IMFSinkWriter>,
    sample: Option<IMFSample>,
    buffer: Option<IMFMediaBuffer>,
    /// 一帧字节数 = w*h*4
    frame_bytes: usize,
    stream: u32,
    /// 下一帧时间戳（100ns 单位）
    next_ts: i64,
    mf_started: bool,
    com_inited: bool,
}

impl H264Writer {
    /// 创建 MP4 Sink Writer。path 需为绝对路径；尺寸需为偶数（调用方保证）。
    pub fn new(path: &std::path::Path, w: u32, h: u32, fps: u32, bitrate: u32) -> Result<Self, String> {
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

            // Sink Writer 属性：允许硬件编码器 + 不做写入节流（录制实时性优先）
            let mut attrs_opt: Option<IMFAttributes> = None;
            if let Err(e) = MFCreateAttributes(&mut attrs_opt, 2) {
                return unwind(Err(hr_err("MFCreateAttributes", e)));
            }
            let Some(attrs) = attrs_opt else { return unwind(Err("MFCreateAttributes 返回空".into())) };
            let _ = attrs.SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, 1);
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

            let stream = match writer.AddStream(&out_mt) {
                Ok(s) => s,
                Err(e) => return unwind(Err(hr_err("AddStream", e))),
            };

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
            if let Err(e) = writer.BeginWriting() {
                return unwind(Err(hr_err("BeginWriting", e)));
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
                stream,
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
            std::ptr::copy_nonoverlapping(bgra.as_ptr(), p, self.frame_bytes);
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

        let mut wr = H264Writer::new(&path, w, h, fps, 800_000)
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
