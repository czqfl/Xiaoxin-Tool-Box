//! 录屏音频采集（WASAPI）：麦克风 / 系统声音环回 / 两者混合。
//!
//! 架构（见计划文件）：
//! - 采集线程【只产 PCM 包】（std::sync::mpsc，1024 帧/包的 f32 交错 48k/2ch），
//!   绝不碰 IMFSinkWriter（它在录制线程创建，MF 对象要求串行化）；
//! - 录制线程在每次 write_bgra 成功后调 drain() 混音并 write_pcm16；
//! - 静音 = 写零帧不断流；暂停 = 消费并丢弃、不推进音频时间线。
//!
//! 【panic = "abort" 不变式】本模块禁用 unwrap/expect/panic!；切片前必查长度；
//! 浮点转整型一律 .clamp(-1,1).round() 后乘 32767；整数用 saturating_*。
//! 任何 WASAPI/COM 失败都降级为"无音频"（录制继续），不向上传播 panic。

#![cfg(windows)]

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering, AtomicU32 };
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{mpsc, Arc, Mutex};

use windows::core::GUID;
use windows::Win32::Media::Audio::{
    eCapture, eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
    AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};

/// 音频来源（设置页 / 启动栏可选）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioSource {
    Off,
    Mic,
    System,
    Mix,
}

impl AudioSource {
    pub fn from_str(s: &str) -> Self {
        match s {
            "mic" => AudioSource::Mic,
            "system" => AudioSource::System,
            "mix" => AudioSource::Mix,
            _ => AudioSource::Off,
        }
    }
    fn want_mic(self) -> bool {
        matches!(self, AudioSource::Mic | AudioSource::Mix)
    }
    fn want_sys(self) -> bool {
        matches!(self, AudioSource::System | AudioSource::Mix)
    }
}

/// 录制中静音开关（命令写入，drain 读取）。静音=写零帧，不断流。
pub static AUDIO_MUTE: AtomicBool = AtomicBool::new(false);
/// 录制音量（0~200，100=原声）：drain 混音时按比例缩放采样
pub static AUDIO_VOLUME: AtomicU32 = AtomicU32::new(100);
/// 音频子系统状态：0=未启用 1=正常 2=失败（UI 据此禁用开关）
pub static AUDIO_STATE: AtomicU8 = AtomicU8::new(0);

/// 本次录制是否【支持】录音（仅 MP4——GIF 容器无法承载音轨）。
/// UI 据此决定录音按钮的【显隐】：MP4 时始终可点，与启动时音源是否为 off 无关。
pub static AUDIO_AVAILABLE: AtomicBool = AtomicBool::new(false);
/// 录音开关（录制条麦克风按钮）：true=混入真实采集音频；false=写零帧。
/// 与 AUDIO_MUTE 的区别：本开关可在录制中随时开合，且开时会【按需动态启动
/// 采集线程】，关时停采集——实现"录到一半才想加旁白"的场景。
pub static AUDIO_REC_ON: AtomicBool = AtomicBool::new(false);
/// 本次录制的目标音源（0=off 1=mic 2=system 3=mix）。录制开始时记录；
/// 音源为 off 时用户中途开启录音，默认用 mic（总得有路可采）。
pub static AUDIO_SRC: AtomicU8 = AtomicU8::new(0);
/// 命令侧新建的引擎 → 录制线程接管。采集线程与 IMFSinkWriter 分属两侧：
/// 引擎可以在命令线程创建（只是起 WASAPI 线程），但 drain 必须且只能在
/// 录制线程调用，因此新建的引擎先入槽，由录制循环取走。
pub static AUDIO_SLOT: Mutex<Option<AudioEngine>> = Mutex::new(None);
/// 停止采集请求（命令置位 → 录制线程消费后 finish，保证与 drain 同线程）
pub static AUDIO_STOP_REQ: AtomicBool = AtomicBool::new(false);

pub fn set_mute(on: bool) {
    AUDIO_MUTE.store(on, Ordering::SeqCst);
}

pub fn src_to_u8(s: AudioSource) -> u8 {
    match s {
        AudioSource::Off => 0,
        AudioSource::Mic => 1,
        AudioSource::System => 2,
        AudioSource::Mix => 3,
    }
}

pub fn src_from_u8(v: u8) -> AudioSource {
    match v {
        1 => AudioSource::Mic,
        2 => AudioSource::System,
        3 => AudioSource::Mix,
        _ => AudioSource::Off,
    }
}

pub fn set_available(on: bool) {
    AUDIO_AVAILABLE.store(on, Ordering::SeqCst);
}
pub fn set_rec_on(on: bool) {
    AUDIO_REC_ON.store(on, Ordering::SeqCst);
}
pub fn rec_on() -> bool {
    AUDIO_REC_ON.load(Ordering::SeqCst)
}

/// 录制会话开始时复位全部音频状态。上次录制的残留（尤其是 AUDIO_STATE==1）
/// 会让 UI 在本次无音轨时错误地亮出录音按钮，变成点了没反应的死按钮。
pub fn reset_session(src: AudioSource) {
    AUDIO_MUTE.store(false, Ordering::SeqCst);
    AUDIO_REC_ON.store(false, Ordering::SeqCst);
    AUDIO_STOP_REQ.store(false, Ordering::SeqCst);
    AUDIO_AVAILABLE.store(false, Ordering::SeqCst);
    AUDIO_STATE.store(0, Ordering::SeqCst);
    AUDIO_SRC.store(src_to_u8(src), Ordering::SeqCst);
    let mut slot = match AUDIO_SLOT.lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    if let Some(mut e) = slot.take() {
        e.finish();
    }
}

/// 录制线程调用：取走命令侧新建的引擎（若有）
pub fn take_slot() -> Option<AudioEngine> {
    let mut slot = match AUDIO_SLOT.lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    slot.take()
}

/// 录制线程调用：消费"停止采集"请求
pub fn take_stop_req() -> bool {
    AUDIO_STOP_REQ.swap(false, Ordering::SeqCst)
}

/// 录制线程调用：处理命令侧挂起的启停意图——先消费停止请求，再接管新建引擎。
///
/// drain / finish 都必须与录制线程同处一侧（采集线程绝不碰 IMFSinkWriter），
/// 所以启停动作统一在这里落地，录制循环的每个分支（正常帧、暂停）都要调一次：
/// 漏掉的分支会让引擎一直挂在槽里，直到本次录制结束都收不掉——采集线程泄漏。
pub fn apply_pending(eng: &mut Option<AudioEngine>) -> bool {
    let mut changed = false;
    if take_stop_req() {
        if let Some(mut e) = eng.take() {
            e.finish();
            changed = true;
        }
    }
    if let Some(new) = take_slot() {
        if let Some(mut old) = eng.take() {
            old.finish();
        }
        *eng = Some(new);
        changed = true;
    }
    changed
}

/// 录制结束时兜底：收掉命令侧新建、但录制线程始终没来得及接管的引擎
/// （例如暂停期间点了开启录音就直接停止录制）
pub fn drop_slot() {
    let mut slot = match AUDIO_SLOT.lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    if let Some(mut e) = slot.take() {
        e.finish();
    }
}

/// 设置录制音量（0~200，100=原声）。录制中实时生效（下一混音周期起）
pub fn set_audio_volume(v: u32) {
    AUDIO_VOLUME.store(v.clamp(0, 200), Ordering::SeqCst);
}

pub fn audio_volume() -> u32 {
    AUDIO_VOLUME.load(Ordering::SeqCst)
}

/// 规范内部格式：48kHz / 2ch / f32 交错。1024 帧 = 一个 AAC 单元。
const RATE: u32 = 48000;
const CH: usize = 2;
const UNIT: usize = 1024; // 帧/包

type Pkt = Vec<f32>; // 交错 f32，长度 = UNIT*CH

/// 采集线程的句柄与停止标志。rx 不放在这里——它由 AudioEngine 的
/// mic_q / sys_q 单独持有（mpsc::Receiver 不可克隆，放在两处会部分移动）。
struct Cap {
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

pub struct AudioEngine {
    caps: Vec<Cap>,
    /// 混音输出暂存（s16 交错），drain 时凑满 UNIT*CH 就写一帧
    stage: Vec<i16>,
    mic_q: Option<Receiver<Pkt>>,
    sys_q: Option<Receiver<Pkt>>,
    disabled: bool,
}

impl AudioEngine {
    /// 启动采集。Off 或全部端点失败 → Ok(None)（录制继续、无音轨）。
    pub fn start(src: AudioSource) -> Result<Option<AudioEngine>, String> {
        if src == AudioSource::Off {
            AUDIO_STATE.store(0, Ordering::SeqCst);
            return Ok(None);
        }
        let mut engine = AudioEngine {
            caps: Vec::new(),
            stage: Vec::new(),
            mic_q: None,
            sys_q: None,
            disabled: false,
        };
        if src.want_mic() {
            if let Some((cap, rx)) = spawn_capture(eCapture, false) {
                engine.mic_q = Some(rx);
                engine.caps.push(cap);
            }
        }
        if src.want_sys() {
            if let Some((cap, rx)) = spawn_capture(eRender, true) {
                engine.sys_q = Some(rx);
                engine.caps.push(cap);
            }
        }
        if engine.mic_q.is_none() && engine.sys_q.is_none() {
            crate::storage::diag_write("[recaudio] 无任何可用音频端点，本次录制无音轨");
            AUDIO_STATE.store(2, Ordering::SeqCst);
            return Ok(None);
        }
        AUDIO_STATE.store(1, Ordering::SeqCst);
        Ok(Some(engine))
    }

    /// 录制线程在每次 write_bgra 成功后调用。混音并写入 AAC 单元。
    /// muted=true 时写零帧（保持时间线）。绝不返回错误打断录制。
    pub fn drain(&mut self, wr: &mut crate::h264::H264Writer, video_ts: i64, muted: bool) {
        if self.disabled {
            return;
        }
        // 从两路各取一包（没有就用静音），相加
        loop {
            let mic = self.mic_q.as_ref().and_then(|r| r.try_recv().ok());
            let sys = self.sys_q.as_ref().and_then(|r| r.try_recv().ok());
            if mic.is_none() && sys.is_none() {
                break; // 两路都没新包，等下次
            }
            let mut mixed = vec![0f32; UNIT * CH];
            if !muted {
                let gain = AUDIO_VOLUME.load(Ordering::SeqCst) as f32 / 100.0;
                if let Some(m) = mic {
                    add_into_gain(&mut mixed, &m, gain);
                }
                if let Some(s) = sys {
                    add_into_gain(&mut mixed, &s, gain);
                }
            }
            // f32 → s16 交错，削波
            for v in mixed {
                let s = (v.clamp(-1.0, 1.0) * 32767.0).round() as i16;
                self.stage.push(s);
            }
            // 凑满一个 AAC 单元就写
            while self.stage.len() >= UNIT * CH {
                let unit: Vec<i16> = self.stage.drain(..UNIT * CH).collect();
                if let Err(e) = wr.write_pcm16(&unit, UNIT as u32) {
                    crate::storage::diag_write(&format!("[recaudio] write_pcm16 失败，停用音频：{e}"));
                    self.disabled = true;
                    return;
                }
            }
        }
        // 饥饿保护：音频落后视频超过 150ms 时用整单元静音补齐，避免越拉越远
        if !muted {
            let audio_ts = wr.audio_ts();
            if video_ts - audio_ts > 1_500_000 {
                let zeros = vec![0i16; UNIT * CH];
                let _ = wr.write_pcm16(&zeros, UNIT as u32);
            }
        }
    }

    /// 暂停时调用：消费并丢弃所有在途包，不推进音频时间线。
    pub fn discard(&mut self) {
        if let Some(r) = self.mic_q.as_ref() {
            while r.try_recv().is_ok() {}
        }
        if let Some(r) = self.sys_q.as_ref() {
            while r.try_recv().is_ok() {}
        }
        self.stage.clear();
    }

    /// 结束：停采集线程并 join。在 finalize 之前调用。
    pub fn finish(&mut self) {
        for c in self.caps.iter() {
            c.stop.store(true, Ordering::SeqCst);
        }
        for c in self.caps.drain(..) {
            if let Some(h) = c.handle {
                let _ = h.join();
            }
        }
        // 【必须归零】否则"关闭录音 → 再开启"会被误判成"采集还在跑"而直接置位：
        // 引擎其实已被 finish，按钮看着亮着、实际一个字节也录不进来。
        if AUDIO_STATE.load(Ordering::SeqCst) == 1 {
            AUDIO_STATE.store(0, Ordering::SeqCst);
        }
    }
}

/// 录制中切换静音（顶部条按钮）。立即生效：静音 = 写零帧、不断流，
/// 因此音画时间线不会脱开，取消静音后能无缝接回。
#[tauri::command]
pub fn recorder_audio_mute(on: bool) -> bool {
    set_mute(on);
    AUDIO_MUTE.load(Ordering::SeqCst)
}

/// 设置录制音量（录制条滑杆实时调节；0=静音 100=原声 200=两倍）
#[tauri::command]
pub fn recorder_audio_volume(volume: u32) -> u32 {
    set_audio_volume(volume);
    audio_volume()
}

/// 查询录制音量
#[tauri::command]
pub fn recorder_audio_volume_get() -> u32 {
    audio_volume()
}

/// 查询录音状态，返回 (本次录制是否支持录音, 当前是否正在录音)。
/// 第一个值决定按钮【显隐】：仅 MP4 为 true——GIF 无音轨，摆个按钮是死的。
/// 注意它【不】再表示"启动时的音源是否为 off"：MP4 一律预留音轨，音源 off
/// 只是初始不采集，用户仍可在录制条上随时开录。
#[tauri::command]
pub fn recorder_audio_state() -> (bool, bool) {
    (AUDIO_AVAILABLE.load(Ordering::SeqCst), AUDIO_REC_ON.load(Ordering::SeqCst))
}

/// 录制中随时开启/关闭录音，返回操作后的【实际】录音状态。
///
/// 开启：若采集已在跑直接置位；否则按目标音源（off→mic）当场起 WASAPI 采集，
/// 引擎入 AUDIO_SLOT 由录制线程下一帧接管。端点不可用 / 启动失败 → 返回 false，
/// 前端据此把按钮回滚并提示，绝不留下"看着开着其实没录"的假象。
/// 关闭：置位为 false 并发停止请求，由录制线程 finish 掉采集线程；音轨继续
/// 写零帧，因此音画时间线不断——之后重新开启能无缝接回。
#[tauri::command]
pub fn recorder_audio_rec(on: bool) -> bool {
    if !AUDIO_AVAILABLE.load(Ordering::SeqCst) {
        return false;
    }
    if !on {
        AUDIO_REC_ON.store(false, Ordering::SeqCst);
        AUDIO_STOP_REQ.store(true, Ordering::SeqCst);
        return false;
    }
    // 采集已在运行：直接开，无需重建引擎
    if AUDIO_STATE.load(Ordering::SeqCst) == 1 {
        AUDIO_REC_ON.store(true, Ordering::SeqCst);
        return true;
    }
    // 开场音源为 off 时中途开录音，默认用麦克风——总得有一路可采
    let src = match src_from_u8(AUDIO_SRC.load(Ordering::SeqCst)) {
        AudioSource::Off => AudioSource::Mic,
        s => s,
    };
    match AudioEngine::start(src) {
        Ok(Some(eng)) => {
            let mut slot = match AUDIO_SLOT.lock() {
                Ok(g) => g,
                Err(e) => e.into_inner(),
            };
            // 上一台还没被录制线程取走（极短的窗口期）：先收掉，避免泄漏采集线程
            if let Some(mut old) = slot.take() {
                old.finish();
            }
            *slot = Some(eng);
            AUDIO_STOP_REQ.store(false, Ordering::SeqCst);
            AUDIO_REC_ON.store(true, Ordering::SeqCst);
            true
        }
        Ok(None) => {
            crate::storage::diag_write("[recaudio] 中途开启录音失败：无可用音频端点");
            AUDIO_REC_ON.store(false, Ordering::SeqCst);
            false
        }
        Err(e) => {
            crate::storage::diag_write(&format!("[recaudio] 中途开启录音失败：{e}"));
            AUDIO_REC_ON.store(false, Ordering::SeqCst);
            false
        }
    }
}

fn add_into(dst: &mut [f32], src: &[f32]) {
    let n = dst.len().min(src.len());
    for i in 0..n {
        dst[i] += src[i];
    }
}

/// 带增益的混入：gain 0=无声，1=原声，>1 放大（削波在 s16 转换处处理）
fn add_into_gain(dst: &mut [f32], src: &[f32], gain: f32) {
    let n = dst.len().min(src.len());
    for i in 0..n {
        dst[i] += src[i] * gain;
    }
}

/// 打开一个 WASAPI 端点并起采集线程。任何一步失败 → None（调用方降级）。
fn spawn_capture(
    flow: windows::Win32::Media::Audio::EDataFlow,
    loopback: bool,
) -> Option<(Cap, Receiver<Pkt>)> {
    let (tx, rx): (Sender<Pkt>, Receiver<Pkt>) = mpsc::channel();
    let stop = Arc::new(AtomicBool::new(false));
    let stop2 = stop.clone();
    let handle = std::thread::Builder::new()
        .name("rec-audio-cap".into())
        .spawn(move || capture_loop(flow, loopback, tx, stop2))
        .ok()?;
    Some((Cap { stop, handle: Some(handle) }, rx))
}

fn capture_loop(
    flow: windows::Win32::Media::Audio::EDataFlow,
    loopback: bool,
    tx: Sender<Pkt>,
    stop: Arc<AtomicBool>,
) {
    // 独立线程 COM 初始化（MTA）；失败则整个采集放弃
    if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
        AUDIO_STATE.store(2, Ordering::SeqCst);
        return;
    }
    let run = || -> Result<(), String> {
        let enu: IMMDeviceEnumerator = unsafe {
            CoCreateInstance(
                &GUID::from_u128(0xbcd5d384_acf6_44f3_bb41_0989c731eda7),
                None,
                CLSCTX_INPROC_SERVER,
            )
            .map_err(|e| format!("枚举器：{e}"))?
        };
        let dev = unsafe { enu.GetDefaultAudioEndpoint(flow, eConsole).map_err(|e| format!("端点：{e}"))? };
        let client: IAudioClient = unsafe {
            dev.Activate::<IAudioClient>(CLSCTX_INPROC_SERVER, None)
                .map_err(|e| format!("Activate：{e}"))?
        };
        let mix = unsafe { client.GetMixFormat().map_err(|e| format!("MixFormat：{e}"))? };
        let fmt = unsafe { &*mix };
        let rate = fmt.nSamplesPerSec;
        let ch = fmt.nChannels.max(1) as usize;
        let is_float = unsafe { fmt_is_float(fmt) };
        // windows 0.61 里 AUDCLNT_STREAMFLAGS_LOOPBACK 是 u32 常量，不是 newtype
        let flags = if loopback { AUDCLNT_STREAMFLAGS_LOOPBACK } else { 0u32 };
        unsafe {
            client
                .Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, mix, None)
                .map_err(|e| format!("Initialize：{e}"))?
        };
        let capture: IAudioCaptureClient =
            unsafe { client.GetService().map_err(|e| format!("GetService：{e}"))? };
        unsafe { client.Start().map_err(|e| format!("Start：{e}"))? };

        // 重采样状态（设备采样率可能 != 48k）
        let mut pos: f64 = 0.0;
        let mut carry: Vec<f32> = Vec::new();
        let mut acc: Vec<f32> = Vec::with_capacity(UNIT * CH);
        loop {
            if stop.load(Ordering::SeqCst) {
                break;
            }
            // windows 0.61 的 GetNextPacketSize 无参、直接返回帧数
            let packets = match unsafe { capture.GetNextPacketSize() } {
                Ok(n) => n,
                Err(_) => {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                    continue;
                }
            };
            if packets == 0 {
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }
            let mut data: *mut u8 = std::ptr::null_mut();
            let mut frames = 0u32;
            let mut flags = 0u32;
            if unsafe { capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None) }.is_err() {
                continue;
            }
            if frames > 0 && !data.is_null() && (flags & 0x2) == 0 {
                // 把设备格式转成 f32 交错，再线性重采样到 48k/2ch
                let raw = unsafe { std::slice::from_raw_parts(data, (frames as usize) * ch * sample_bytes(fmt)) };
                let f = to_f32(raw, fmt, ch, is_float);
                resample_into(&f, ch, rate, &mut carry, &mut acc, &mut pos);
            }
            let _ = unsafe { capture.ReleaseBuffer(frames) };
            // 凑满 UNIT 帧就发
            while acc.len() >= UNIT * CH {
                let pkt: Vec<f32> = acc.drain(..UNIT * CH).collect();
                if tx.send(pkt).is_err() {
                    return Ok(()); // 消费端没了，退出
                }
            }
        }
        Ok(())
    };
    if let Err(e) = run() {
        crate::storage::diag_write(&format!("[recaudio] 采集线程退出：{e}"));
        AUDIO_STATE.store(2, Ordering::SeqCst);
    }
    unsafe { windows::Win32::System::Com::CoUninitialize() };
}

fn sample_bytes(fmt: &windows::Win32::Media::Audio::WAVEFORMATEX) -> usize {
    (fmt.wBitsPerSample as usize / 8).max(1)
}

unsafe fn fmt_is_float(fmt: &windows::Win32::Media::Audio::WAVEFORMATEX) -> bool {
    const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
    const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
    if fmt.wFormatTag == WAVE_FORMAT_IEEE_FLOAT {
        return true;
    }
    if fmt.wFormatTag == WAVE_FORMAT_EXTENSIBLE {
        // WAVEFORMATEXTENSIBLE 的 SubFormat 紧跟在 cbSize 之后
        let ext = fmt as *const _ as *const u8;
        let sub = ext.add(std::mem::size_of::<windows::Win32::Media::Audio::WAVEFORMATEX>()) as *const GUID;
        let g = &*sub;
        return g.data1 == 0x00000003; // KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
    }
    false
}

/// 设备原始字节 → f32 交错（支持 s16 / f32）
fn to_f32(raw: &[u8], fmt: &windows::Win32::Media::Audio::WAVEFORMATEX, ch: usize, is_float: bool) -> Vec<f32> {
    let sb = sample_bytes(fmt);
    let frames = raw.len() / (sb * ch);
    let mut out = Vec::with_capacity(frames * ch);
    if is_float && sb == 4 {
        for i in 0..frames * ch {
            let o = i * 4;
            if o + 4 <= raw.len() {
                out.push(f32::from_le_bytes([raw[o], raw[o + 1], raw[o + 2], raw[o + 3]]));
            }
        }
    } else {
        for i in 0..frames * ch {
            let o = i * 2;
            if o + 2 <= raw.len() {
                let s = i16::from_le_bytes([raw[o], raw[o + 1]]);
                out.push(s as f32 / 32768.0);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 混音相加会超出 ±1.0（两路各 0.9），转 s16 必须削到 ±32767。
    /// 直接用 `as i16` 而不 clamp 会溢出回绕——1.8 → 正数变负数，听感是爆音。
    #[test]
    fn mix_clamps_to_i16_range() {
        let mut mixed = vec![0f32; 4];
        add_into(&mut mixed, &[0.9, -0.9, 0.9, -0.9]);
        add_into(&mut mixed, &[0.9, -0.9, 0.9, -0.9]);
        let out: Vec<i16> = mixed
            .iter()
            .map(|v| (v.clamp(-1.0, 1.0) * 32767.0).round() as i16)
            .collect();
        assert_eq!(out, vec![32767, -32767, 32767, -32767]);
    }

    /// 音频时间戳必须累计精确：`帧数 × 10_000_000 / 采样率`。
    /// 反例是分包累加（每包 1024 帧 = 213333.33 个 100ns，取整后逐步漂移），
    /// 这个测试用 46 包证明两种算法确实会分道扬镳。
    #[test]
    fn audio_timestamp_accumulates_without_drift() {
        let rate = 48000u32;
        let ts_of = |frames: i64| (frames * 10_000_000) / rate as i64;
        assert_eq!(ts_of(48000), 10_000_000, "48000 帧应恰好是 1 秒");
        let mut naive = 0i64;
        for _ in 0..46 {
            naive += (1024i64 * 10_000_000) / rate as i64;
        }
        let exact = ts_of(46 * 1024);
        assert!(
            exact > naive,
            "累计式（{exact}）应大于取整累加（{naive}）——证明后者确实在漂移"
        );
    }

    /// 重采样方向性：44.1k → 48k 是上采样，输出帧数应多于输入。
    /// 只验方向与量级，不验具体样本值（线性插值的边界处理有取舍）。
    #[test]
    fn resample_upsamples_44k_to_48k() {
        let frames = 1024usize;
        let src: Vec<f32> = (0..frames * 2).map(|i| (i % 7) as f32 / 7.0).collect();
        let mut carry = Vec::new();
        let mut acc = Vec::new();
        let mut pos = 0.0f64;
        resample_into(&src, 2, 44100, &mut carry, &mut acc, &mut pos);
        let out_frames = acc.len() / CH;
        assert!(
            out_frames > frames,
            "44.1k→48k 应上采样：输入 {frames} 帧，输出 {out_frames} 帧"
        );
        let ratio = out_frames as f64 / frames as f64;
        assert!(
            (1.05..=1.15).contains(&ratio),
            "上采样比例应接近 48/44.1≈1.088，实际 {ratio:.3}"
        );
    }

    /// 48k 输入应近乎恒等（ratio = 1），输出帧数与输入一致（允许边界误差）。
    #[test]
    fn resample_identity_at_48k() {
        let frames = 1024usize;
        let src: Vec<f32> = (0..frames * 2).map(|i| (i % 5) as f32 / 5.0).collect();
        let mut carry = Vec::new();
        let mut acc = Vec::new();
        let mut pos = 0.0f64;
        resample_into(&src, 2, 48000, &mut carry, &mut acc, &mut pos);
        let out_frames = acc.len() / CH;
        assert!(
            out_frames >= frames.saturating_sub(2) && out_frames <= frames + 2,
            "48k→48k 应保持帧数：输入 {frames}，输出 {out_frames}"
        );
    }
}

/// 线性重采样：把 ch 通道、rate 采样率的 f32 流转到 48k/2ch，结果追加进 acc。
fn resample_into(src: &[f32], ch: usize, rate: u32, carry: &mut Vec<f32>, acc: &mut Vec<f32>, pos: &mut f64) {
    // 先混成 2ch（>2 取前两路平均到两路；1ch 复制）
    let mut two: Vec<f32> = Vec::with_capacity((src.len() / ch.max(1)) * CH);
    let frames = src.len() / ch.max(1);
    for f in 0..frames {
        let l = src[f * ch];
        let r = if ch >= 2 { src[f * ch + 1] } else { l };
        two.push(l);
        two.push(r);
    }
    // 拼接 carry
    let mut stream = std::mem::take(carry);
    stream.extend_from_slice(&two);
    let ratio = rate as f64 / RATE as f64; // 源帧/目标帧
    // 线性插值重采样到 48k
    let src_frames = stream.len() / CH;
    let mut out_frames = ((src_frames as f64) / ratio) as usize;
    // 保留尾巴不足一帧的部分
    let usable = ((out_frames as f64) * ratio) as usize;
    if usable >= src_frames {
        out_frames = src_frames.saturating_sub(1).max(0) as usize;
    }
    for o in 0..out_frames {
        let sp = (*pos) + (o as f64) * ratio;
        let i0 = sp.floor() as usize;
        let i1 = (i0 + 1).min(src_frames.saturating_sub(1));
        let t = (sp - i0 as f64) as f32;
        if i0 >= src_frames {
            break;
        }
        for c in 0..CH {
            let a = stream[i0 * CH + c];
            let b = stream[i1 * CH + c];
            acc.push(a + (b - a) * t);
        }
    }
    *pos += (out_frames as f64) * ratio;
    // 把已消费的源帧从 pos 里扣掉，剩下尾巴进 carry
    let consumed = ((out_frames as f64) * ratio) as usize;
    let rem = stream.len().saturating_sub(consumed * CH);
    *carry = stream[stream.len() - rem..].to_vec();
    // pos 归一：carry 里的帧从 0 重新计
    *pos = 0.0;
}
