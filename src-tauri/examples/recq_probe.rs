//! 录屏编码画质对比探针（诊断用，不进发布路径）：
//! cargo run --release --example recq_probe
//!
//! 同一份【确定性】合成屏幕内容（静止 UI 色块 + 滚动的"文字"高频细节 + 移动光标），
//! 分别用三种编码器参数组合编一遍，打印各自字节数。因为输入完全相同，
//! 差异 100% 来自编码参数；文件同时落在临时目录，供人眼对比"滚动时糊不糊"。

use std::path::PathBuf;
use std::time::Instant;
use xiaoxin_toolbox_lib::h264::{EncTuning, H264Writer};
use xiaoxin_toolbox_lib::recorder::RecQuality;

const W: u32 = 1280;
const H: u32 = 720;
const FPS: u32 = 12;
const SECONDS: u32 = 6;
const FRAMES: u32 = FPS * SECONDS;
/// 对比矩阵：三档参数组合 + tuned 下的质量梯度（后三行码率参数完全相同，
/// 只有编码器质量档不同 —— 若文件大小随质量单调上升，就证明 ICodecAPI 的
/// 属性真的被编码器吃进去了，而不是"设了但无效"）
const CASES: &[(&str, &str, EncTuning, RecQuality)] = &[
    ("baseline", "baseline（现状：只设码率）", EncTuning::Baseline, RecQuality::Normal),
    ("profile", "profile（+H.264 High）", EncTuning::ProfileOnly, RecQuality::Normal),
    ("tuned_normal", "tuned@Normal(q=75)", EncTuning::Tuned, RecQuality::Normal),
    ("tuned_fast", "tuned@Fast(q=62)", EncTuning::Tuned, RecQuality::Fast),
    ("tuned_high", "tuned@High(q=88)", EncTuning::Tuned, RecQuality::High),
];

/// 完全自足的确定性伪随机（不引 crate，保证任何机器上生成内容一致）
#[inline]
fn hash32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^= x >> 16;
    x
}

/// 把一帧画进 buf（BGRA，自顶向下）。
/// `frame` 决定滚动位移与光标位置；"文字"按绝对行号取种子，滚动时形状稳定，
/// 这样测的是编码器的细边保持力，而不是逐帧噪声。
fn draw_frame(frame: u32, buf: &mut [u8]) {
    let stride = (W as usize) * 4;
    // 底色：浅灰界面
    for px in buf.iter_mut() {
        *px = 0;
    }
    for y in 0..H as usize {
        let row = &mut buf[y * stride..(y + 1) * stride];
        for x in (0..row.len()).step_by(4) {
            row[x] = 238;
            row[x + 1] = 240;
            row[x + 2] = 243;
            row[x + 3] = 255;
        }
    }
    // 静止区：左侧栏 + 顶栏（大面积静止，考验码率分配是否被浪费）
    fill_rect(buf, 0, 0, 200, H as usize, (60, 70, 90));
    fill_rect(buf, 0, 0, W as usize, 36, (24, 28, 36));
    // 滚动文字区：x∈[240,1180]，每 4 帧上移一行，行高 24，"字形"为 3~5px 笔画
    let line_h = 24usize;
    let scroll = (frame as usize / 4) % 400;
    let mut abs_row = 0isize;
    let mut top = 60isize - (scroll as isize % line_h as isize);
    while top < H as isize - line_h as isize {
        if top > 36isize {
            let base = (top.max(0) as usize).min(H as usize - line_h);
            draw_text_row(buf, base, abs_row);
        }
        abs_row += 1;
        top += line_h as isize;
    }
    // 移动光标：圆形高对比小物块（编码器最容易糊掉的东西）
    let cx = 260 + ((frame as usize * 17) % 880);
    let cy = 300 + ((frame as usize * 11) % 320);
    for dy in -7..=7 {
        for dx in -7..=7 {
            if dx * dx + dy * dy > 49 {
                continue;
            }
            let (x, y) = (cx as isize + dx, cy as isize + dy);
            if x < 0 || y < 0 || x >= W as isize || y >= H as isize {
                continue;
            }
            let o = (y as usize * stride) + (x as usize) * 4;
            buf[o] = 20;
            buf[o + 1] = 20;
            buf[o + 2] = 20;
        }
    }
}

fn fill_rect(buf: &mut [u8], x0: usize, y0: usize, w: usize, h: usize, rgb: (u8, u8, u8)) {
    let stride = (W as usize) * 4;
    for y in y0..(y0 + h).min(H as usize) {
        let from = y * stride + x0 * 4;
        let to = (y * stride + x0 * 4 + w * 4).min(buf.len());
        let row = &mut buf[from..to];
        for px in row.chunks_exact_mut(4) {
            px[0] = rgb.0;
            px[1] = rgb.1;
            px[2] = rgb.2;
        }
    }
}

/// 一行"文字"：按绝对行号取种子，画出若干 3~5px 宽的深色笔画块
fn draw_text_row(buf: &mut [u8], top: usize, row_index: isize) {
    let stride = (W as usize) * 4;
    let seed0 = (row_index as u32).wrapping_mul(2654435761);
    let mut x = 248usize;
    while x < 1170 {
        let r = hash32(seed0.wrapping_add(x as u32));
        let glyph_w = 4 + (r % 5) as usize; // 4~8px 宽字形
        let glyph_h = 9 + ((r >> 8) % 6) as usize; // 9~14px 高
        let gap = 3 + ((r >> 16) % 4) as usize;
        let dark = 30 + ((r >> 20) % 60) as u8;
        let y_top = top + (14 - glyph_h / 2).min(14);
        for dy in 0..glyph_h {
            let y = y_top + dy;
            if y >= H as usize {
                break;
            }
            for dx in 0..glyph_w {
                let xx = x + dx;
                if xx >= 1180 {
                    break;
                }
                // 只在部分行画，凑出笔画结构而非实心块
                if (hash32((r as usize * 31 + dy * 7 + dx * 13) as u32) & 3) == 0 {
                    continue;
                }
                let o = y * stride + xx * 4;
                buf[o] = dark;
                buf[o + 1] = dark;
                buf[o + 2] = dark;
            }
        }
        x += glyph_w + gap;
    }
}

fn encode(tuning: EncTuning, quality: RecQuality, bitrate: u32, out: &PathBuf) -> Result<(u64, u128), String> {
    if out.exists() {
        let _ = std::fs::remove_file(out);
    }
    let mut wr = H264Writer::new(out, W, H, FPS, bitrate, quality, tuning)?;
    let mut buf = vec![0u8; (W as usize) * (H as usize) * 4];
    let gap = 10_000_000i64 / FPS as i64;
    let t = Instant::now();
    for f in 0..FRAMES {
        draw_frame(f, &mut buf);
        wr.write_bgra(&buf, gap)?;
    }
    wr.finalize()?;
    let ms = t.elapsed().as_millis();
    let bytes = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
    Ok((bytes, ms))
}

fn main() {
    let bitrate = xiaoxin_toolbox_lib::h264::bitrate_for(W, H, FPS, RecQuality::Normal);
    println!("内容：{W}x{H} @{FPS}fps × {FRAMES} 帧（同一段确定性画面），码率参数 {bitrate} bps");
    println!("（ICodecAPI 是否取到，看 diag.log 里的 [recorder] ICodecAPI 行）\n");

    let dir = std::env::temp_dir();
    let mut baseline: u64 = 0;
    for (key, label, tuning, quality) in CASES {
        let path = dir.join(format!("recq_{key}.mp4"));
        match encode(*tuning, *quality, bitrate, &path) {
            Ok((bytes, ms)) => {
                if baseline == 0 {
                    baseline = bytes;
                }
                let ratio = if baseline > 0 { bytes as f64 / baseline as f64 } else { 1.0 };
                println!(
                    "{label:<30} {:>9.2} MB  编码 {ms}ms  相对 baseline {ratio:.3}x  → {}",
                    bytes as f64 / 1048576.0,
                    path.display()
                );
            }
            Err(e) => eprintln!("{label:<30} 失败：{e}"),
        }
    }
}
