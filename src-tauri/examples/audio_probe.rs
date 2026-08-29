//! 录屏音频混流探针（诊断用，不进发布路径）：
//! cargo run --release --example audio_probe
//!
//! 目的：不靠人耳验证「MP4 里确实有音轨且不是静音」。
//! 做法：用【合成】的确定性内容（渐变画面 + 440Hz 正弦 PCM）录 3 秒，
//! 然后直接解析输出 MP4 的 box 结构断言：
//!   1. 同时存在 vide 与 soun 两种 track（hdlr handler_type）；
//!   2. 音轨时长与视轨时长相差 < 15%（证明音画时间线没跑偏）；
//!   3. 写入前的 PCM 峰值 > 500（证明喂进去的不是静音，否则断言无意义）。
//! 全程不碰 WASAPI——合成 PCM 使结果在任何机器上都确定可复现。

use xiaoxin_toolbox_lib::h264::{AudioCfg, EncTuning, H264Writer};
use xiaoxin_toolbox_lib::recorder::RecQuality;

const W: u32 = 320;
const H: u32 = 180;
const FPS: u32 = 12;
const SECONDS: u32 = 3;
const FRAMES: u32 = FPS * SECONDS;
/// 音频规范格式（与 recaudio.rs 一致）：48kHz / 2ch，1024 帧一个 AAC 单元
const RATE: u32 = 48000;
const UNIT: usize = 1024;
/// 正弦振幅（s16 量程 ±32767 内）；取 8000 既明显非静音，又留出混音余量
const AMP: f64 = 8000.0;

fn main() {
    let path = std::env::temp_dir().join("xiaoxin-audio-probe.mp4");
    let _ = std::fs::remove_file(&path);

    let cfg = AudioCfg { sample_rate: RATE, channels: 2, bitrate: 128_000 };
    let mut wr = match H264Writer::new_ex(
        &path, W, H, FPS, 2_000_000, RecQuality::Normal, EncTuning::Tuned, Some(cfg),
    ) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("创建带音轨 writer 失败（系统可能缺 AAC 编码器）：{e}");
            std::process::exit(2);
        }
    };

    let frame_bytes = (W * H * 4) as usize;
    let mut bgra = vec![0u8; frame_bytes];
    let mut carry: Vec<i16> = Vec::new();
    let mut phase = 0.0f64;
    let mut audio_frames: u64 = 0;
    let mut pcm_peak: i32 = 0;
    let per_frame_audio = RATE as usize / FPS as usize; // 每视频帧应产出的音频帧数

    for f in 0..FRAMES {
        // ---- 视频帧：横向渐变 + 随时间下移的色块（保证有运动，编码器不会全丢）----
        for y in 0..H as usize {
            for x in 0..W as usize {
                let o = (y * W as usize + x) * 4;
                bgra[o] = (x % 256) as u8;
                bgra[o + 1] = ((y + f as usize * 3) % 256) as u8;
                bgra[o + 2] = 200;
                bgra[o + 3] = 255;
            }
        }
        if let Err(e) = wr.write_bgra(&bgra, 10_000_000 / FPS as i64) {
            eprintln!("写视频帧 {f} 失败：{e}");
            std::process::exit(1);
        }

        // ---- 音频：生成本帧对应时长的正弦，凑满 1024 帧就写一个 AAC 单元 ----
        for _ in 0..per_frame_audio {
            let s = (phase * 2.0 * std::f64::consts::PI).sin();
            phase += 440.0 / RATE as f64;
            let v = (s * AMP).round() as i16;
            carry.push(v);
            carry.push(v);
        }
        while carry.len() >= UNIT * 2 {
            let unit: Vec<i16> = carry.drain(..UNIT * 2).collect();
            let peak = unit.iter().map(|v| (*v as i32).abs()).max().unwrap_or(0);
            if peak > pcm_peak {
                pcm_peak = peak;
            }
            if let Err(e) = wr.write_pcm16(&unit, UNIT as u32) {
                eprintln!("写音频单元失败：{e}");
                std::process::exit(1);
            }
            audio_frames += UNIT as u64;
        }
    }
    // 收尾：不足一个单元的余量也写进去（避免尾部被截断造成时长差）
    if carry.len() >= 2 {
        let n = carry.len() / 2;
        let peak = carry.iter().map(|v| (*v as i32).abs()).max().unwrap_or(0);
        if peak > pcm_peak {
            pcm_peak = peak;
        }
        if let Err(e) = wr.write_pcm16(&carry, n as u32) {
            eprintln!("写音频余量失败：{e}");
            std::process::exit(1);
        }
        audio_frames += n as u64;
    }

    if let Err(e) = wr.finalize() {
        eprintln!("finalize 失败：{e}");
        std::process::exit(1);
    }
    drop(wr); // Drop 触发 MFShutdown，文件完整落盘

    // ---------------- 断言 ----------------
    let data = match std::fs::read(&path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("读回输出失败：{e}");
            std::process::exit(1);
        }
    };

    let mut handlers: Vec<[u8; 4]> = Vec::new();
    let mut mdhd: Vec<(u32, u64)> = Vec::new(); // (timescale, duration) 按 track 顺序
    walk(&data, 0, data.len(), &mut handlers, &mut mdhd);

    let has = |t: &[u8; 4]| handlers.iter().any(|h| h == t);
    let video_secs = mdhd.first().map(|(ts, d)| *d as f64 / *ts as f64).unwrap_or(0.0);
    let audio_secs = mdhd.get(1).map(|(ts, d)| *d as f64 / *ts as f64).unwrap_or(0.0);

    println!("输出：{}", path.display());
    println!("  文件大小      : {} bytes", data.len());
    println!("  MP4 容器      : {}", if data.len() > 8 && &data[4..8] == b"ftyp" { "ftyp ✓" } else { "缺少 ftyp ✗" });
    println!("  track handler : {:?}", handlers.iter().map(|h| String::from_utf8_lossy(h).to_string()).collect::<Vec<_>>());
    println!("  视频轨时长    : {video_secs:.3}s");
    println!("  音频轨时长    : {audio_secs:.3}s");
    println!("  写入音频帧数  : {audio_frames}（期望约 {}）", RATE as u64 * SECONDS as u64);
    println!("  PCM 峰值      : {pcm_peak}");

    let mut failed = false;
    if !has(b"vide") {
        println!("  ✗ 缺少视频轨");
        failed = true;
    }
    if !has(b"soun") {
        println!("  ✗ 缺少音频轨（AAC 编码器不可用或音频流未写入）");
        failed = true;
    }
    if pcm_peak <= 500 {
        println!("  ✗ PCM 峰值 {pcm_peak} ≤ 500：喂进去的几乎是静音，时长断言失去意义");
        failed = true;
    }
    if video_secs > 0.0 && audio_secs > 0.0 {
        let diff = (video_secs - audio_secs).abs() / video_secs;
        println!("  音画时长差    : {:.2}%", diff * 100.0);
        if diff > 0.15 {
            println!("  ✗ 音画时长差 {:.2}% 超过 15%", diff * 100.0);
            failed = true;
        }
    }

    if failed {
        println!("\n结论：失败");
        std::process::exit(1);
    }
    println!("\n结论：通过（vide + soun 双轨、非静音、音画同步）");
}

/// 递归遍历 MP4 box 树，收集 hdlr 的 handler_type 与每个 mdhd 的 (timescale, duration)。
/// 只下潜容器盒（moov/trak/mdia/minf/stbl），其余跳过。
fn walk(data: &[u8], start: usize, end: usize, handlers: &mut Vec<[u8; 4]>, mdhd: &mut Vec<(u32, u64)>) {
    let mut off = start;
    while off + 8 <= end {
        let size = u32::from_be_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]]) as usize;
        let typ = [data[off + 4], data[off + 5], data[off + 6], data[off + 7]];
        // size == 1 表示 64 位 largesize；本探针不需要处理超大文件
        if size < 8 {
            break;
        }
        let box_end = off + size;
        if box_end > end {
            break;
        }
        if &typ == b"hdlr" && off + 20 <= box_end {
            // hdlr 载荷：version(1)+flags(3) | pre_defined(4) | handler_type(4)
            handlers.push([data[off + 16], data[off + 17], data[off + 18], data[off + 19]]);
        }
        // mdhd（version 0）：creation(4) modification(4) timescale(4) duration(4)
        if &typ == b"mdhd" && off + 8 + 20 <= box_end {
            let p = off + 8;
            let version = data[p];
            if version == 0 {
                let ts = u32::from_be_bytes([data[p + 12], data[p + 13], data[p + 14], data[p + 15]]);
                let du = u32::from_be_bytes([data[p + 16], data[p + 17], data[p + 18], data[p + 19]]);
                mdhd.push((ts, du as u64));
            } else {
                // version 1：时间戳扩为 8 字节
                let ts = u32::from_be_bytes([data[p + 20], data[p + 21], data[p + 22], data[p + 23]]);
                let mut b = [0u8; 8];
                b.copy_from_slice(&data[p + 24..p + 32]);
                mdhd.push((ts, u64::from_be_bytes(b)));
            }
        }
        if matches!(&typ, b"moov" | b"trak" | b"mdia" | b"minf" | b"stbl") {
            walk(data, off + 8, box_end, handlers, mdhd);
        }
        off = box_end;
    }
}
