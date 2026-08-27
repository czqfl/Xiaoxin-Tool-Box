//! 极简 MJPEG-in-MP4 封装器（无外部依赖）：
//! 把录制得到的 JPEG 帧序列封装成 MP4（每帧即一张 JPEG，与 AVI/MJPEG 同源）。
//! VLC / PotPlayer / 剪映 / QQ影音 等主流播放器可直接播放；文件结构为
//! ftyp + mdat + moov（非分片，moov 在尾部，时长短时秒开）。
//!
//! 不依赖任何编码器：帧内容完全复用 AVI 路径的 JPEG 编码结果，
//! 这里只负责写 MP4 容器（box 头、采样表、时长）。

use std::io::{Seek, SeekFrom, Write};

fn push_box(out: &mut Vec<u8>, typ: &[u8; 4], body: &[u8]) {
    out.extend_from_slice(&((8 + body.len()) as u32).to_be_bytes());
    out.extend_from_slice(typ);
    out.extend_from_slice(body);
}

pub struct Mp4Writer<W: Write + Seek> {
    w: W,
    width: u32,
    height: u32,
    fps: u32,
    /// 每帧 JPEG 字节数（用于 stsz 采样表）
    frame_sizes: Vec<u32>,
    mdat_data_start: u64,
    mdat_size_pos: u64,
}

impl<W: Write + Seek> Mp4Writer<W> {
    pub fn new(mut w: W, width: u32, height: u32, fps: u32) -> std::io::Result<Self> {
        let mut h = Vec::with_capacity(1024);
        // ftyp：major=isom，兼容 isom/iso2/mp41
        let mut ftyp_body = Vec::new();
        ftyp_body.extend_from_slice(b"isom");
        ftyp_body.extend_from_slice(&512u32.to_be_bytes());
        ftyp_body.extend_from_slice(b"isomiso2mp41");
        push_box(&mut h, b"ftyp", &ftyp_body);
        // mdat 占位（大小收尾回填）
        let mdat_size_pos = h.len() as u64;
        push_box(&mut h, b"mdat", &[]);
        let mdat_data_start = h.len() as u64;

        w.seek(SeekFrom::Start(0))?;
        w.write_all(&h)?;
        Ok(Self {
            w,
            width,
            height,
            fps,
            frame_sizes: Vec::new(),
            mdat_data_start,
            mdat_size_pos,
        })
    }

    /// 写入一帧 JPEG
    pub fn write_jpeg(&mut self, jpg: &[u8]) -> std::io::Result<()> {
        self.frame_sizes.push(jpg.len() as u32);
        self.w.write_all(jpg)?;
        Ok(())
    }

    /// 收尾：回填 mdat 大小，追加 moov（含全部采样表）。消费自身。
    pub fn finish(mut self) -> std::io::Result<W> {
        let frames = self.frame_sizes.len() as u32;
        let timescale = 1000u32;
        let dur_per_frame = (((timescale as f64) / (self.fps.max(1) as f64)).round() as u32).max(1);
        let duration = frames.saturating_mul(dur_per_frame);
        let data_start = self.mdat_data_start;
        let data_end = self.w.stream_position()?;
        let mdat_total = (data_end - data_start) as u32;

        // ---- moov 各 box 组装 ----
        // mvhd
        let mut mvhd_body = Vec::new();
        mvhd_body.extend_from_slice(&[0u8; 4]); // version+flags
        mvhd_body.extend_from_slice(&0u32.to_be_bytes()); // creation_time
        mvhd_body.extend_from_slice(&0u32.to_be_bytes()); // modification_time
        mvhd_body.extend_from_slice(&timescale.to_be_bytes());
        mvhd_body.extend_from_slice(&duration.to_be_bytes());
        mvhd_body.extend_from_slice(&0x0001_0000u32.to_be_bytes()); // rate 1.0
        mvhd_body.extend_from_slice(&0x0100u16.to_be_bytes()); // volume 1.0
        mvhd_body.extend_from_slice(&0u16.to_be_bytes()); // reserved
        mvhd_body.extend_from_slice(&[0u8; 8]); // reserved[2]
        mvhd_body.extend_from_slice(&[0u8; 36]); // matrix
        mvhd_body.extend_from_slice(&[0u8; 24]); // pre_defined[6]
        mvhd_body.extend_from_slice(&2u32.to_be_bytes()); // next_track_ID

        // tkhd
        let mut tkhd_body = Vec::new();
        tkhd_body.extend_from_slice(&[0u8; 4]); // version+flags
        tkhd_body.extend_from_slice(&0u32.to_be_bytes());
        tkhd_body.extend_from_slice(&0u32.to_be_bytes());
        tkhd_body.extend_from_slice(&1u32.to_be_bytes()); // track_ID
        tkhd_body.extend_from_slice(&0u32.to_be_bytes()); // reserved
        tkhd_body.extend_from_slice(&duration.to_be_bytes());
        tkhd_body.extend_from_slice(&[0u8; 8]); // reserved[2]
        tkhd_body.extend_from_slice(&0u16.to_be_bytes()); // layer
        tkhd_body.extend_from_slice(&0u16.to_be_bytes()); // alternate_group
        tkhd_body.extend_from_slice(&0x0100u16.to_be_bytes()); // volume
        tkhd_body.extend_from_slice(&0u16.to_be_bytes()); // reserved
        tkhd_body.extend_from_slice(&[0u8; 36]); // matrix
        tkhd_body.extend_from_slice(&(self.width << 16).to_be_bytes());
        tkhd_body.extend_from_slice(&(self.height << 16).to_be_bytes());

        // mdhd
        let mut mdhd_body = Vec::new();
        mdhd_body.extend_from_slice(&[0u8; 4]);
        mdhd_body.extend_from_slice(&0u32.to_be_bytes());
        mdhd_body.extend_from_slice(&0u32.to_be_bytes());
        mdhd_body.extend_from_slice(&timescale.to_be_bytes());
        mdhd_body.extend_from_slice(&duration.to_be_bytes());
        mdhd_body.extend_from_slice(&0x55C4u16.to_be_bytes()); // language 'und'
        mdhd_body.extend_from_slice(&0u16.to_be_bytes());

        // hdlr
        let mut hdlr_body = Vec::new();
        hdlr_body.extend_from_slice(&[0u8; 4]);
        hdlr_body.extend_from_slice(&0u32.to_be_bytes()); // pre_defined
        hdlr_body.extend_from_slice(b"vide");
        hdlr_body.extend_from_slice(&[0u8; 12]); // reserved[3]
        hdlr_body.extend_from_slice(b"VideoHandler\0");

        // vmhd
        let mut vmhd_body = Vec::new();
        vmhd_body.extend_from_slice(&[0u8; 4]);
        vmhd_body.extend_from_slice(&0u16.to_be_bytes()); // graphicsmode
        vmhd_body.extend_from_slice(&[0u8; 6]); // opcolor[3]

        // dinf / dref（自包含 url）
        let mut dref_body = Vec::new();
        dref_body.extend_from_slice(&[0u8; 4]);
        dref_body.extend_from_slice(&1u32.to_be_bytes()); // entry_count
        let mut url_body = Vec::new();
        url_body.extend_from_slice(&[0u8; 4]);
        url_body[3] = 1; // self-contained
        push_box(&mut dref_body, b"url ", &url_body);

        // stsd（sample entry = "jpeg"，78 字节 VisualSampleEntry）
        let mut stsd_body = Vec::new();
        stsd_body.extend_from_slice(&[0u8; 4]);
        stsd_body.extend_from_slice(&1u32.to_be_bytes()); // entry_count
        stsd_body.extend_from_slice(&[0u8; 6]); // reserved
        stsd_body.extend_from_slice(&1u16.to_be_bytes()); // data_reference_index
        stsd_body.extend_from_slice(&0u16.to_be_bytes()); // pre_defined
        stsd_body.extend_from_slice(&0u16.to_be_bytes()); // reserved
        stsd_body.extend_from_slice(&[0u8; 12]); // pre_defined[3]
        stsd_body.extend_from_slice(&(self.width as u16).to_be_bytes());
        stsd_body.extend_from_slice(&(self.height as u16).to_be_bytes());
        stsd_body.extend_from_slice(&0x0048_0000u32.to_be_bytes()); // horizresolution 72dpi
        stsd_body.extend_from_slice(&0x0048_0000u32.to_be_bytes()); // vertresolution
        stsd_body.extend_from_slice(&0u32.to_be_bytes()); // reserved
        stsd_body.extend_from_slice(&1u16.to_be_bytes()); // frame_count
        stsd_body.extend_from_slice(&[0u8; 32]); // compressorname
        stsd_body.extend_from_slice(&0x0018u16.to_be_bytes()); // depth 24
        stsd_body.extend_from_slice(&0xFFFFu16.to_be_bytes()); // pre_defined -1

        // stts：全部帧等时长
        let mut stts_body = Vec::new();
        stts_body.extend_from_slice(&[0u8; 4]);
        stts_body.extend_from_slice(&1u32.to_be_bytes());
        stts_body.extend_from_slice(&frames.to_be_bytes());
        stts_body.extend_from_slice(&dur_per_frame.to_be_bytes());

        // stsc：单 chunk 装全部帧
        let mut stsc_body = Vec::new();
        stsc_body.extend_from_slice(&[0u8; 4]);
        stsc_body.extend_from_slice(&1u32.to_be_bytes());
        stsc_body.extend_from_slice(&1u32.to_be_bytes()); // first_chunk
        stsc_body.extend_from_slice(&frames.to_be_bytes()); // samples_per_chunk
        stsc_body.extend_from_slice(&1u32.to_be_bytes()); // sample_description_index

        // stsz：逐帧大小
        let mut stsz_body = Vec::new();
        stsz_body.extend_from_slice(&[0u8; 4]);
        stsz_body.extend_from_slice(&0u32.to_be_bytes()); // sample_size（0=逐帧）
        stsz_body.extend_from_slice(&frames.to_be_bytes());
        for sz in &self.frame_sizes {
            stsz_body.extend_from_slice(&sz.to_be_bytes());
        }

        // stco：数据起始偏移
        let mut stco_body = Vec::new();
        stco_body.extend_from_slice(&[0u8; 4]);
        stco_body.extend_from_slice(&1u32.to_be_bytes());
        stco_body.extend_from_slice(&(data_start as u32).to_be_bytes());

        // 逐层装箱：stbl → minf → mdia → trak → moov
        let mut stbl_body = Vec::new();
        push_box(&mut stbl_body, b"stsd", &stsd_body);
        push_box(&mut stbl_body, b"stts", &stts_body);
        push_box(&mut stbl_body, b"stsc", &stsc_body);
        push_box(&mut stbl_body, b"stsz", &stsz_body);
        push_box(&mut stbl_body, b"stco", &stco_body);

        let mut minf_body = Vec::new();
        push_box(&mut minf_body, b"vmhd", &vmhd_body);
        let mut dinf_body = Vec::new();
        push_box(&mut dinf_body, b"dref", &dref_body);
        push_box(&mut minf_body, b"dinf", &dinf_body);
        push_box(&mut minf_body, b"stbl", &stbl_body);

        let mut mdia_body = Vec::new();
        push_box(&mut mdia_body, b"mdhd", &mdhd_body);
        push_box(&mut mdia_body, b"hdlr", &hdlr_body);
        push_box(&mut mdia_body, b"minf", &minf_body);

        let mut trak_body = Vec::new();
        push_box(&mut trak_body, b"tkhd", &tkhd_body);
        push_box(&mut trak_body, b"mdia", &mdia_body);

        let mut moov_body = Vec::new();
        push_box(&mut moov_body, b"mvhd", &mvhd_body);
        push_box(&mut moov_body, b"trak", &trak_body);
        let mut moov = Vec::new();
        push_box(&mut moov, b"moov", &moov_body);

        // 回填 mdat 大小，再写 moov
        self.w.seek(SeekFrom::Start(self.mdat_size_pos))?;
        self.w.write_all(&(8u32 + mdat_total).to_be_bytes())?;
        self.w.seek(SeekFrom::End(0))?;
        self.w.write_all(&moov)?;
        self.w.flush()?;
        Ok(self.w)
    }
}
