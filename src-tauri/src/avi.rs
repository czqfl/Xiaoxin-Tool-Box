//! 极简 MJPEG AVI 封装器（无外部依赖）：
//! - 流式写帧：JPEG 逐帧写入 'movi'，内存里只留索引（16B/帧），
//!   一小时的录制也不会把整段视频攒在内存里；
//! - 结束时 seek 回文件头回填总帧数/缓冲区大小等字段，再追加 idx1 索引。
//!
//! MJPEG AVI 是兼容性最好的"无编码器"视频方案：每帧就是一张 JPEG，
//! Windows 播放器 / 浏览器 <video> / 剪映等均可直接播放与剪辑。

use std::io::{Seek, SeekFrom, Write};

pub struct AviWriter<W: Write + Seek> {
    w: W,
    fps: u32,
    riff_size_pos: u64,
    movi_size_pos: u64,
    movi_data_start: u64,
    avih_total_frames_pos: u64,
    avih_suggest_buf_pos: u64,
    avih_max_bps_pos: u64,
    strh_length_pos: u64,
    frames: u32,
    total_chunk_bytes: u32,
    max_chunk: u32,
    idx: Vec<u8>,
}

fn le16(v: u16, out: &mut Vec<u8>) { out.extend_from_slice(&v.to_le_bytes()); }
fn le32(v: u32, out: &mut Vec<u8>) { out.extend_from_slice(&v.to_le_bytes()); }

impl<W: Write + Seek> AviWriter<W> {
    pub fn new(mut w: W, width: u32, height: u32, fps: u32) -> std::io::Result<Self> {
        let mut h = Vec::with_capacity(512);
        // RIFF 头
        h.extend_from_slice(b"RIFF");
        let riff_size_pos = h.len() as u64;
        le32(0, &mut h); // 占位：结束回填
        h.extend_from_slice(b"AVI ");
        // hdrl
        h.extend_from_slice(b"LIST");
        le32(4 + (8 + 56) + (8 + 116), &mut h); // "hdrl" + avih + strl LIST
        h.extend_from_slice(b"hdrl");
        // avih（主头部，56 字节）
        h.extend_from_slice(b"avih");
        le32(56, &mut h);
        let avih_body = h.len();
        le32(1_000_000 / fps.max(1), &mut h); // dwMicroSecPerFrame
        le32(0, &mut h);                      // dwMaxBytesPerSec（结束回填）
        le32(0, &mut h);                      // dwPaddingGranularity
        le32(0x10, &mut h);                   // dwFlags: AVIF_HASINDEX
        let avih_total_frames_pos = (avih_body + 16) as u64;
        le32(0, &mut h);                      // dwTotalFrames（结束回填）
        le32(0, &mut h);                      // dwInitialFrames
        le32(1, &mut h);                      // dwStreams
        let avih_suggest_buf_pos = (avih_body + 36) as u64;
        le32(0, &mut h);                      // dwSuggestedBufferSize（结束回填）
        le32(width, &mut h);                  // dwWidth
        le32(height, &mut h);                 // dwHeight
        le32(0, &mut h); le32(0, &mut h); le32(0, &mut h); le32(0, &mut h);
        // strl LIST
        h.extend_from_slice(b"LIST");
        le32(4 + (8 + 56) + (8 + 40), &mut h); // "strl" + strh + strf
        h.extend_from_slice(b"strl");
        // strh（流头部，56 字节）
        h.extend_from_slice(b"strh");
        le32(56, &mut h);
        h.extend_from_slice(b"vids");
        h.extend_from_slice(b"MJPG");
        le32(0, &mut h);              // dwFlags
        le16(0, &mut h);              // wPriority
        le16(0, &mut h);              // wLanguage
        le32(0, &mut h);              // dwInitialFrames
        le32(1, &mut h);              // dwScale
        le32(fps.max(1), &mut h);     // dwRate → 帧率 = Rate/Scale
        le32(0, &mut h);              // dwStart
        let strh_length_pos = h.len() as u64;
        le32(0, &mut h);              // dwLength（结束回填：总帧数）
        le32(0, &mut h);              // dwSuggestedBufferSize
        le32(u32::MAX, &mut h);       // dwQuality
        le32(0, &mut h);              // dwSampleSize
        le16(0, &mut h); le16(0, &mut h); le16(width as u16, &mut h); le16(height as u16, &mut h);
        // strf（BITMAPINFOHEADER，40 字节）
        h.extend_from_slice(b"strf");
        le32(40, &mut h);
        le32(40, &mut h);                    // biSize
        le32(width, &mut h);                 // biWidth
        le32(height, &mut h);                // biHeight
        le16(1, &mut h);                     // biPlanes
        le16(24, &mut h);                    // biBitCount
        h.extend_from_slice(b"MJPG");        // biCompression
        le32(0, &mut h);                         // biSizeImage（MJPEG 可变，填 0）
        le32(0, &mut h); le32(0, &mut h); le32(0, &mut h); le32(0, &mut h); le32(0, &mut h);
        // movi LIST
        h.extend_from_slice(b"LIST");
        let movi_size_pos = h.len() as u64;
        le32(0, &mut h); // 占位：结束回填
        h.extend_from_slice(b"movi");
        let movi_data_start = h.len() as u64;

        w.seek(SeekFrom::Start(0))?;
        w.write_all(&h)?;
        Ok(Self {
            w,
            fps,
            riff_size_pos,
            movi_size_pos,
            movi_data_start,
            avih_total_frames_pos,
            avih_suggest_buf_pos,
            avih_max_bps_pos: (avih_body + 4) as u64,
            strh_length_pos,
            frames: 0,
            total_chunk_bytes: 0,
            max_chunk: 0,
            idx: Vec::new(),
        })
    }

    /// 写入一帧 JPEG（内部自动偶对齐）
    pub fn write_jpeg(&mut self, jpg: &[u8]) -> std::io::Result<()> {
        let pos = self.w.stream_position()?;
        let chunk_len = jpg.len() as u32;
        // idx1 的 offset 相对 'movi' 数据区起点
        self.idx.extend_from_slice(b"00dc");
        le32(0x10, &mut self.idx); // AVIIF_KEYFRAME
        le32((pos - self.movi_data_start) as u32, &mut self.idx);
        le32(chunk_len, &mut self.idx);

        self.w.write_all(b"00dc")?;
        self.w.write_all(&chunk_len.to_le_bytes())?;
        self.w.write_all(jpg)?;
        if jpg.len() % 2 == 1 { self.w.write_all(&[0u8])?; }
        let padded = chunk_len + (chunk_len & 1);
        self.total_chunk_bytes = self.total_chunk_bytes.wrapping_add(8 + padded);
        self.max_chunk = self.max_chunk.max(chunk_len);
        self.frames += 1;
        Ok(())
    }

    /// 收尾：追加 idx1 并回填所有占位长度。消费自身（写完即完）
    pub fn finish(mut self) -> std::io::Result<W> {
        // idx1
        self.w.write_all(b"idx1")?;
        let idx_len = self.idx.len() as u32;
        self.w.write_all(&idx_len.to_le_bytes())?;
        self.w.write_all(&self.idx)?;
        let end = self.w.stream_position()?;

        // movi LIST size = "movi"(4) + 全部帧块
        self.w.seek(SeekFrom::Start(self.movi_size_pos))?;
        self.w.write_all(&(4 + self.total_chunk_bytes).to_le_bytes())?;
        // avih 回填
        self.w.seek(SeekFrom::Start(self.avih_total_frames_pos))?;
        self.w.write_all(&self.frames.to_le_bytes())?;
        self.w.seek(SeekFrom::Start(self.avih_suggest_buf_pos))?;
        self.w.write_all(&(self.max_chunk + 8).to_le_bytes())?;
        self.w.seek(SeekFrom::Start(self.avih_max_bps_pos))?;
        self.w.write_all(&(self.max_chunk.saturating_mul(self.fps)).to_le_bytes())?;
        // strh dwLength = 总帧数
        self.w.seek(SeekFrom::Start(self.strh_length_pos))?;
        self.w.write_all(&self.frames.to_le_bytes())?;
        // RIFF size = 文件总长 - 8（u64 溢出保护：超 4GB 时截断为 u32::MAX）
        self.w.seek(SeekFrom::Start(self.riff_size_pos))?;
        let riff_size = end.saturating_sub(8).min(u32::MAX as u64) as u32;
        self.w.write_all(&riff_size.to_le_bytes())?;
        self.w.flush()?;
        Ok(self.w)
    }
}
