//! DXGI 桌面复制（Desktop Duplication）截屏——比 GDI BitBlt 更底层、快一个量级。
//!
//! 为什么换：
//! - BitBlt(SRCCOPY) 在大屏/视频播放场景可达数百毫秒（"按快捷键后屏幕还
//!   动 ~0.5 秒才冻结"的主因）；DXGI 复制是 GPU 纹理拷贝 + 一次 CPU map，
//!   单屏几毫秒。
//! - BitBlt 不带 CAPTUREBLT 拿不到半透明分层窗口（本应用贴图等），带 CAPTUREBLT
//!   更慢且闪烁；DXGI 直接读【DWM 合成后】的桌面纹理，所见即所得。
//!
//! 失败安全：任何一步出错返回 None，调用方逐屏回退老 GDI 路径。设备/复制接口
//! 按「显示器坐标」跨会话缓存复用（重复呼出零初始化开销）；访问丢失（切换全屏
//! 独占、显示模式变更、显卡重置等）时自动重建一次，再失败即回退。

#[cfg(windows)]
pub mod win {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use windows::core::Interface;
    use windows::Win32::Foundation::{HMODULE, RECT};
    use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
    use windows::Win32::Graphics::Direct3D11::{
        D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
        D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_CPU_ACCESS_READ,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_CREATE_DEVICE_FLAG, D3D11_MAP_READ,
        D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
        D3D11_USAGE_STAGING,
    };
    use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIAdapter, IDXGIAdapter1, IDXGIFactory1, IDXGIOutput,
        IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource, DXGI_ERROR_WAIT_TIMEOUT,
        DXGI_OUTDUPL_FRAME_INFO,
    };

    /// 一屏的采集结果（BGRA top-down，行距=宽×4）
    pub struct DuplFrame {
        pub bgra: Vec<u8>,
    }

    struct OutputCtx {
        device: ID3D11Device,
        context: ID3D11DeviceContext,
        duplication: IDXGIOutputDuplication,
        /// 上一次成功采集到的桌面帧（GPU 默认用法纹理）——
        /// AcquireNextFrame 只在屏幕变化时出新帧，静止画面会超时；
        /// 超时且有缓存帧时直接拷缓存，连续截图零等待
        last_frame: Option<(ID3D11Texture2D, u32, u32)>,
        staging: Option<(ID3D11Texture2D, u32, u32)>,
    }

    // COM 包装按「调用方串行化」使用：所有触达都在 begin 的截图线程内，
    // 与 FREEZES 同一并发模型。按显示器坐标缓存各屏的复制上下文
    static OUTPUTS: Mutex<Option<HashMap<(i32, i32), OutputCtx>>> = Mutex::new(None);

    /// 枚举所有 DXGI 输出：（桌面坐标矩形, 适配器, 输出）
    fn factory_outputs() -> Option<Vec<(RECT, IDXGIAdapter1, IDXGIOutput)>> {
        let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.ok()?;
        let mut out = Vec::new();
        for a in 0..8u32 {
            let adapter = (unsafe { factory.EnumAdapters1(a) }).ok()?;
            for o in 0..8u32 {
                let output = (unsafe { adapter.EnumOutputs(o) }).ok()?;
                let Ok(desc) = (unsafe { output.GetDesc() }) else { continue };
                if desc.DesktopCoordinates.right <= desc.DesktopCoordinates.left { continue; }
                out.push((desc.DesktopCoordinates, adapter.clone(), output));
            }
        }
        if out.is_empty() { None } else { Some(out) }
    }

    fn create_ctx(adapter: &IDXGIAdapter1, output: &IDXGIOutput) -> Option<OutputCtx> {
        unsafe {
            let dxgi_adapter: IDXGIAdapter = adapter.cast().ok()?;
            let mut device_opt: Option<ID3D11Device> = None;
            let mut ctx_opt: Option<ID3D11DeviceContext> = None;
            let mut fl = Default::default();
            D3D11CreateDevice(
                &dxgi_adapter,
                D3D_DRIVER_TYPE_UNKNOWN,
                HMODULE::default(),
                D3D11_CREATE_DEVICE_FLAG(D3D11_CREATE_DEVICE_BGRA_SUPPORT.0),
                None,
                D3D11_SDK_VERSION,
                Some(&mut device_opt),
                Some(&mut fl),
                Some(&mut ctx_opt),
            ).ok()?;
            let device: ID3D11Device = device_opt?;
            let context: ID3D11DeviceContext = ctx_opt?;
            let output1: IDXGIOutput1 = output.cast().ok()?;
            let duplication = output1.DuplicateOutput(&device).ok()?;
            Some(OutputCtx { device, context, duplication, last_frame: None, staging: None })
        }
    }

    fn ensure_staging(ctx: &mut OutputCtx, w: u32, h: u32) -> Option<ID3D11Texture2D> {
        if let Some((tex, lw, lh)) = &ctx.staging {
            if *lw == w && *lh == h { return Some(tex.clone()); }
        }
        unsafe {
            let desc = D3D11_TEXTURE2D_DESC {
                Width: w, Height: h, MipLevels: 1, ArraySize: 1,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_STAGING,
                BindFlags: 0,
                CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                MiscFlags: 0,
            };
            let mut tex_opt: Option<ID3D11Texture2D> = None;
            ctx.device.CreateTexture2D(&desc, None, Some(&mut tex_opt)).ok()?;
            let tex: ID3D11Texture2D = tex_opt?;
            ctx.staging = Some((tex.clone(), w, h));
            Some(tex)
        }
    }

    fn keep_texture(ctx: &mut OutputCtx, w: u32, h: u32) -> Option<ID3D11Texture2D> {
        if let Some((t, lw, lh)) = &ctx.last_frame {
            if *lw == w && *lh == h { return Some(t.clone()); }
        }
        unsafe {
            let d = D3D11_TEXTURE2D_DESC {
                Width: w, Height: h, MipLevels: 1, ArraySize: 1,
                Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
                CPUAccessFlags: 0, MiscFlags: 0,
            };
            let mut t_opt: Option<ID3D11Texture2D> = None;
            ctx.device.CreateTexture2D(&d, None, Some(&mut t_opt)).ok()?;
            let t: ID3D11Texture2D = t_opt?;
            ctx.last_frame = Some((t.clone(), w, h));
            Some(t)
        }
    }

    /// 把 GPU 纹理拷到 CPU 并展开成紧凑 BGRA（处理 RowPitch 行距）
    fn download(ctx: &mut OutputCtx, tex: &ID3D11Texture2D, w: u32, h: u32) -> Option<Vec<u8>> {
        unsafe {
            let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
            ctx.context.Map(tex, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).ok()?;
            let stride = (w * 4) as usize;
            let mut out = vec![0u8; stride * h as usize];
            let src = mapped.pData as *const u8;
            for row in 0..h as usize {
                std::ptr::copy_nonoverlapping(
                    src.add(row * mapped.RowPitch as usize),
                    out.as_mut_ptr().add(row * stride),
                    stride,
                );
            }
            ctx.context.Unmap(tex, 0);
            Some(out)
        }
    }

    /// 采集指定矩形（显示器全局坐标）的一帧。失败返回 None（调用方回退 GDI）。
    pub fn capture(pos: (i32, i32), expect_w: i32, expect_h: i32) -> Option<DuplFrame> {
        let outputs = factory_outputs()?;
        // 显示器原点精确匹配 DXGI 输出的桌面坐标（多显示器不同 DPI 也成立）
        let (_, adapter, output) = outputs.into_iter()
            .find(|(r, _, _)| r.left == pos.0 && r.top == pos.1)?;

        let key = pos;
        let w = expect_w.max(1) as u32;
        let h = expect_h.max(1) as u32;
        let mut map_guard = OUTPUTS.lock().unwrap();
        let map = map_guard.get_or_insert_with(HashMap::new);

        for _attempt in 0..2 {
            if !map.contains_key(&key) {
                match create_ctx(&adapter, &output) {
                    Some(c) => { map.insert(key, c); }
                    None => return None,
                }
            }
            let ctx = map.get_mut(&key)?;

            unsafe {
                let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
                let mut resource: Option<IDXGIResource> = None;
                match ctx.duplication.AcquireNextFrame(60, &mut frame_info, &mut resource) {
                    Ok(()) => {
                        let tex: ID3D11Texture2D = match resource.and_then(|r| r.cast().ok()) {
                            Some(t) => t,
                            None => { let _ = ctx.duplication.ReleaseFrame(); return None; }
                        };
                        let mut desc = D3D11_TEXTURE2D_DESC::default();
                        tex.GetDesc(&mut desc);
                        if desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM
                            || desc.Width != w || desc.Height != h {
                            // HDR(fp16)/分辨率不符：本模块不处理，交回 GDI 路径
                            let _ = ctx.duplication.ReleaseFrame();
                            map.remove(&key);
                            return None;
                        }
                        // 缓存最新桌面帧（GPU→GPU），供静止画面的下次超时复用
                        let keep = keep_texture(ctx, w, h)?;
                        ctx.context.CopyResource(&keep, &tex);
                        let staging = ensure_staging(ctx, w, h)?;
                        ctx.context.CopyResource(&staging, &tex);
                        let _ = ctx.duplication.ReleaseFrame();
                        let data = download(ctx, &staging, w, h)?;
                        return Some(DuplFrame { bgra: data });
                    }
                    Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => {
                        // 屏幕自上次采集后没变化：用缓存的上一帧（首采超时则回退 GDI）
                        if let Some((t, lw, lh)) = ctx.last_frame.clone() {
                            if lw == w && lh == h {
                                let staging = ensure_staging(ctx, w, h)?;
                                ctx.context.CopyResource(&staging, &t);
                                if let Some(data) = download(ctx, &staging, w, h) {
                                    return Some(DuplFrame { bgra: data });
                                }
                            }
                        }
                        return None;
                    }
                    Err(_) => {
                        // ACCESS_LOST / 会话切换 / 模式变更等：丢缓存重建再试一轮
                        map.remove(&key);
                        continue;
                    }
                }
            }
        }
        None
    }

    /// 清空全部缓存（保守入口；匹配靠坐标精确相等，拔插后对不上自然走不到旧缓存）
    #[allow(dead_code)]
    pub fn invalidate_all() {
        *OUTPUTS.lock().unwrap() = None;
    }
}

#[cfg(not(windows))]
pub mod win {
    pub struct DuplFrame { pub bgra: Vec<u8> }
    pub fn capture(_pos: (i32, i32), _w: i32, _h: i32) -> Option<DuplFrame> { None }
}
