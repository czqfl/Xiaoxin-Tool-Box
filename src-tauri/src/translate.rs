//! 划词翻译：有道智云 / 百度翻译开放平台。
//!
//! 触发流程（快捷键）：
//!   1. 读选中：**优先用 UI Automation 直接读取**源窗口的选中文本（不碰剪贴板、不注入
//!      按键），无副作用、不误触 QQ 截图，覆盖绝大多数常规应用。仅当 UIA 读不到时
//!      （如 DeepSeek 回答区、VS Code 自绘编辑器等不标准暴露文本选区的应用，或确实
//!      无选中）才退回**带保护措施的剪贴板复制**兜底。
//!   2. 显面板：无论有无选中，都显示并【激活】翻译面板（能拖动/点×/Esc）。
//!      有选中 → 带出原文并异步翻译；无选中 → 直接空面板，不翻译，可手动输入/粘贴。
//! 两个服务商均支持 from=auto 自动检测源语言；凭据在设置页配置并持久化到 config.json。

use crate::config::{ConfigState, TranslatorConfig};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// 翻译结果事件（前端弹窗监听实时更新）
pub const EVT_TRANSLATE_RESULT: &str = "translate://result";
/// 翻译弹窗窗口标签
pub const TRANSLATE_PANEL: &str = "translate-popup";

/// 最近一次翻译结果，弹窗挂载时拉取（避免事件早于监听而丢失）
pub struct TranslateStore(pub Mutex<Option<TranslateResult>>);

#[derive(Debug, Clone, Serialize)]
pub struct TranslateResult {
    pub text: String,
    pub translation: String,
    /// 检测到的源语言（auto 时由服务商返回）
    pub from: String,
    pub to: String,
    pub provider: String,
}

/// 翻译命令（翻译面板手动翻译 / 设置页测试）。from/to 缺省时用配置（源默认 auto 自动检测）。
#[tauri::command]
pub async fn translate(
    text: String,
    config: State<'_, ConfigState>,
    from: Option<String>,
    to: Option<String>,
) -> Result<TranslateResult, String> {
    let cfg = config.0.lock().unwrap().translator.clone();
    let from = from.unwrap_or_else(|| "auto".to_string());
    let to = to.unwrap_or(cfg.target_lang.clone());
    translate_text(&text, &from, &to, &cfg).await
}

/// 弹窗挂载时拉取最近一次结果
#[tauri::command]
pub fn translate_last_result(store: State<'_, TranslateStore>) -> Option<TranslateResult> {
    store.0.lock().unwrap().clone()
}

/// 面板呼出事件载荷：带出原文，让面板显示的第一时间就有内容
#[derive(Clone, Serialize)]
struct StartPayload {
    text: String,
}

/// 快捷键触发划词翻译。
///
/// **核心思路：优先 UI Automation 直接读选中文本（无副作用），UIA 读不到再剪贴板兜底。**
///   1. **读选中**——优先 UIA：不碰剪贴板、不注入 Ctrl+C，无焦点竞争、不误触 QQ 截图，
///      覆盖绝大多数常规应用。仅当 UIA 读不到（不标准暴露选区的应用，或确实无选中）
///      才退回剪贴板复制：带【序列号判据】确认复制成功、【修饰键释放保护】避免误触 QQ、
///      复制后立即【还原剪贴板】抹掉我们复制的那条且不进历史。
///   2. **显示并激活面板**——无论有无选中，面板都拿到真实焦点（可拖动/点×/Esc）。
///      有选中 → 立刻带出原文并异步翻译；无选中 → 直接空面板，不翻译、不碰剪贴板。
///
/// 历史教训：早期"先复制后显示"偶发失败且会误触 QQ 截图；后来试过"纯 UIA、彻底不碰
/// 剪贴板"又发现 DeepSeek 回答区 / VS Code 等自绘编辑器不标准暴露文本选区，UIA 拿不到。
/// 最终落到混合方案：UIA 覆盖常规场景零副作用，剪贴板兜底补上残差应用，二者结合最稳。
pub fn trigger_selection_translate<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();

    // 面板若还开着（上一次翻译没关），先隐藏，让源应用回到前台。
    if let Some(w) = app.get_webview_window(TRANSLATE_PANEL) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        }
    }

    // 热键触发瞬间、面板尚未显示，前台窗口就是持有选中文本的来源应用。
    // 记录其 hwnd，复制兜底阶段据此把源应用拉回前台（确定性，无竞态）。
    #[cfg(windows)]
    let src_raw: Option<usize> = crate::keyhook::foreground_hwnd().map(|h| h.0 as usize);

    // 【提速】立即清空 store 并弹出空面板（不抢焦点、不激活）——弹窗与普通
    // 面板一样瞬间出现；选中文本随后由后台线程读回并填充。此前先读完选中再
    // 显示，剪贴板兜底（无选中时轮询剪贴板）可能耗时数百 ms，弹窗明显慢。
    // 显示不激活：源应用仍持焦点，剪贴板复制兜底不受干扰。
    if let Some(store) = app.try_state::<TranslateStore>() {
        *store.0.lock().unwrap() = None;
    }
    let _ = app.emit("translate://start", StartPayload { text: String::new() });
    show_popup_instant(&app);

    // 读取选中文本是同步的 Win32/UIA 操作（含 COM 初始化与剪贴板轮询），放独立线程执行，
    // 不阻塞事件循环。优先 UIA；UIA 读不到再走带保护的剪贴板复制兜底。
    std::thread::spawn(move || {
        // 刚隐藏面板时，给 Windows 一点时间把前台交回源应用
        std::thread::sleep(std::time::Duration::from_millis(40));

        // ---------- 阶段 1：读取选中文本（UIA 优先，剪贴板兜底）----------
        // 有选中 → Some(文本)；UIA 与剪贴板都读不到（确实无选中）→ None。
        #[cfg(windows)]
        let selected = read_selection(src_raw);
        #[cfg(not(windows))]
        let selected: Option<String> = None;

        // ---------- 阶段 2：激活面板（抢焦点，可交互）+ 带出原文 ----------
        match selected {
            Some(text) if !text.trim().is_empty() => {
                let text = text.trim().to_string();
                crate::storage::diag_write(&format!("[translate] selected_len={}", text.len()));
                // 先把原文写入 store（translation 留空 = "原文已就位、译文在路上"），
                // 这样即使面板首次创建、错过了 start 事件，挂载兜底也能取到原文。
                if let Some(store) = app.try_state::<TranslateStore>() {
                    *store.0.lock().unwrap() = Some(TranslateResult {
                        text: text.clone(),
                        translation: String::new(),
                        from: String::new(),
                        to: String::new(),
                        provider: String::new(),
                    });
                }
                // 先激活（抢焦点），再 emit 带出原文——前端填充并异步翻译
                activate_popup(&app);
                let _ = app.emit("translate://start", StartPayload { text: text.clone() });

                // ---------- 阶段 3：翻译（智能方向：含中文→英文，否则→中文）----------
                let Some(cfg) = app
                    .try_state::<ConfigState>()
                    .map(|c| c.0.lock().unwrap().translator.clone())
                else {
                    return;
                };
                let to = target_for_text(&text);
                tauri::async_runtime::spawn(async move {
                    let payload = match translate_text(&text, "auto", &to, &cfg).await {
                        Ok(result) => result,
                        // 错误也推给面板展示（reqwest 已带 12s 超时，不会永久挂起）
                        Err(e) => TranslateResult {
                            text,
                            translation: format!("翻译失败：{e}"),
                            from: String::new(),
                            to,
                            provider: cfg.provider,
                        },
                    };
                    if let Some(store) = app.try_state::<TranslateStore>() {
                        *store.0.lock().unwrap() = Some(payload.clone());
                    }
                    let _ = app.emit(EVT_TRANSLATE_RESULT, payload);
                });
            }
            _ => {
                // 无选中文本：空面板已显示，仅激活（可手动输入），不翻译、不碰剪贴板
                crate::storage::diag_write("[translate] no selection -> empty panel");
                if let Some(store) = app.try_state::<TranslateStore>() {
                    *store.0.lock().unwrap() = None;
                }
                activate_popup(&app);
            }
        }
    });
}

/// 立即弹出空面板（不抢焦点、不激活）：居中定位 + show。
/// 不激活是为了让源应用继续持有焦点——剪贴板复制兜底需要源应用在前台。
fn show_popup_instant<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = app.get_webview_window(TRANSLATE_PANEL) else {
        return;
    };
    center_popup(app, &w);
    let _ = w.unminimize();
    let _ = w.show();
    // 系统级 Esc 关闭兜底（webview 万一没拿到焦点时由键盘钩子关闭）
    #[cfg(windows)]
    crate::keyhook::set_translate_popup_open(true);
}

/// 激活翻译弹窗：抢焦点置前（force_foreground_robust 不受前台锁限制），
/// 120ms 后后台补一次（前台锁偶发拒绝时兜底）。空面板/带原文共用。
fn activate_popup<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = app.get_webview_window(TRANSLATE_PANEL) else {
        return;
    };
    #[cfg(windows)]
    {
        if let Some(hwnd) = get_hwnd(&w) {
            crate::acrylic::force_foreground_robust(hwnd);
        }
    }
    let _ = w.set_focus();
    let w2 = w.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        #[cfg(windows)]
        if let Some(hwnd) = get_hwnd(&w2) {
            crate::acrylic::force_foreground_robust(hwnd);
        }
        let _ = w2.set_focus();
    });
}

/// 翻译弹窗居中定位（物理像素，避免缩放歧义）
fn center_popup<R: Runtime>(app: &AppHandle<R>, w: &tauri::WebviewWindow<R>) {
    if let (Ok(win), Ok(Some(monitor))) = (w.outer_size(), app.primary_monitor()) {
        let m = monitor.position();
        let s = monitor.size();
        if win.width > 0 && win.height > 0 && s.width > 0 && s.height > 0 {
            let x = m.x as f64 + (s.width as f64 - win.width as f64) / 2.0;
            let y = m.y as f64 + (s.height as f64 - win.height as f64) / 2.0;
            let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }
}

/// 读取源窗口选中文本：优先 UI Automation（无副作用），UIA 读不到（不标准暴露选区的
/// 应用，或确实无选中）再走带保护的剪贴板复制兜底。返回 `Some(选中文本)`（已 trim）；
/// UIA 与剪贴板都读不到则 `None`（表示无选中，上层应呼出空面板）。
#[cfg(windows)]
fn read_selection(src_raw: Option<usize>) -> Option<String> {
    // 优先 UI Automation：不碰剪贴板、不注入按键，零副作用、不误触 QQ 截图。
    if let Some(t) = read_selection_uia() {
        if !t.trim().is_empty() {
            crate::storage::diag_write(&format!("[translate] source=UIA len={}", t.trim().len()));
            return Some(t);
        }
    }
    // 兜底：UIA 读不到时（DeepSeek 回答区 / VS Code 自绘编辑器等不标准暴露选区的
    // 应用，或确实无选中），用带保护措施的剪贴板复制。
    crate::storage::diag_write("[translate] source=clipboard-fallback");
    read_selection_clipboard(src_raw)
}

/// 通过 UI Automation 直接读取系统当前焦点元素的选中文本，无需复制到剪贴板、
/// 不注入任何按键。失败（应用不支持无障碍 / 无选中）返回 None。
///
/// 必须在 COM 已初始化的线程调用；本函数在独立线程以 MTA 初始化 COM 后执行，
/// 避免 STA 无消息泵可能导致的跨线程调用死锁。
#[cfg(windows)]
fn read_selection_uia() -> Option<String> {
    use windows::Win32::Foundation::S_OK;
    use windows::Win32::System::Com::{
        CLSCTX_ALL, CoCreateInstance, CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationTextPattern, UIA_TextPatternId,
    };

    unsafe {
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        if hr.is_err() {
            return None;
        }
        let need_uninit = hr == S_OK;

        let automation: IUIAutomation = match CoCreateInstance(&CUIAutomation, None, CLSCTX_ALL) {
            Ok(a) => a,
            Err(_) => {
                if need_uninit {
                    CoUninitialize();
                }
                return None;
            }
        };

        let mut result: Option<String> = None;
        if let Ok(element) = automation.GetFocusedElement() {
            if let Ok(pattern) =
                element.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
            {
                if let Ok(ranges) = pattern.GetSelection() {
                    if let Ok(len) = ranges.Length() {
                        let mut buf = String::new();
                        for i in 0..len {
                            if let Ok(range) = ranges.GetElement(i) {
                                if let Ok(text) = range.GetText(-1) {
                                    buf.push_str(&text.to_string());
                                    buf.push('\n');
                                }
                            }
                        }
                        if !buf.trim().is_empty() {
                            result = Some(buf);
                        }
                    }
                }
            }
        }

        if need_uninit {
            CoUninitialize();
        }
        result
    }
}

/// 剪贴板复制兜底：仅当 UI Automation 读不到选中文本时使用（如 DeepSeek 回答区、
/// VS Code 自绘编辑器，以及确实无选中的情况）。保留【序列号判据】、【源应用前台拉回】、
/// 【还原剪贴板】等逻辑；调用前先 `wait_modifiers_released`，避免注入 Ctrl+C 时与用户
/// 仍按住的修饰键组合命中 QQ 等截图热键。
///
/// 返回 `Some(文本)` 表示复制成功并填充；`None` 表示无选中（剪贴板未变化），此时上层应
/// 呼出空面板而非报错。复制成功后立即把原剪贴板写回，抹掉我们复制的那条、且不进历史。
#[cfg(windows)]
fn read_selection_clipboard(src_raw: Option<usize>) -> Option<String> {
    use windows::Win32::Foundation::HWND;

    // 仅当源应用当前不在前台（如上一次面板刚占过前台）才主动拉回。确定性操作，无竞态。
    if let Some(r) = src_raw {
        let src = HWND(r as *mut std::ffi::c_void);
        for _ in 0..5 {
            if crate::keyhook::foreground_hwnd().map(|x| x.0) == Some(src.0) {
                break;
            }
            crate::keyhook::set_source_foreground(src);
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
    }

    // 必须先等修饰键释放再注入 Ctrl+C：否则注入的 C 与用户仍按住的 Alt 组合成
    // Alt+C，会命中 QQ 等截图工具热键（这正是早期"长按快捷键误触截图"的根因）。
    crate::keyhook::wait_modifiers_released();

    let prev_default = arboard::Clipboard::new()
        .ok()
        .and_then(|mut c| c.get_text().ok())
        .unwrap_or_default();
    let seq_before = crate::keyhook::clipboard_seq();

    crate::keyhook::send_ctrl_c();
    // 等 Ctrl+C 被目标应用处理完（复制是异步的），再补发 WM_COPY：
    // 立即发可能与 Ctrl+C 抢时序被忽略；延时后原生编辑控件对 WM_COPY 响应更稳
    std::thread::sleep(std::time::Duration::from_millis(40));
    if let Some(r) = src_raw {
        crate::keyhook::send_wm_copy(HWND(r as *mut std::ffi::c_void));
    }

    // 轮询等待复制落地。判据是【序列号变化】而非"文本和原来不同"——
    // 选中文字恰好与剪贴板已有内容相同时，内容比较会误判成"复制失败"。
    let mut cur = String::new();
    let mut copied = false;
    for d in [70u64, 90, 140, 220] {
        std::thread::sleep(std::time::Duration::from_millis(d));
        let seq_changed = crate::keyhook::clipboard_seq() != seq_before;
        cur = arboard::Clipboard::new()
            .ok()
            .and_then(|mut c| c.get_text().ok())
            .unwrap_or_default();
        if (seq_changed || cur != prev_default) && !cur.trim().is_empty() {
            copied = true;
            break;
        }
    }
    crate::storage::diag_write(&format!(
        "[translate] clipboard-fallback: clip_len={} copied={}",
        cur.len(),
        copied
    ));

    // 还原剪贴板（抹掉我们复制的那条，且不进历史）
    if let Ok(mut cb) = arboard::Clipboard::new() {
        crate::clipboard::SUPPRESS_WATCH.store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = cb.set_text(prev_default);
    }

    if copied {
        Some(cur.trim().to_string())
    } else {
        None
    }
}

/// 取 webview 所属顶层窗口 HWND（用于 Win32 置前/激活）
#[cfg(windows)]
fn get_hwnd<R: Runtime>(w: &tauri::WebviewWindow<R>) -> Option<windows::Win32::Foundation::HWND> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    if let Ok(handle) = w.window_handle() {
        if let RawWindowHandle::Win32(h) = handle.as_raw() {
            return Some(windows::Win32::Foundation::HWND(h.hwnd.get() as *mut _));
        }
    }
    None
}

/// 按服务商调用对应翻译 API
async fn translate_text(
    text: &str,
    from: &str,
    to: &str,
    cfg: &TranslatorConfig,
) -> Result<TranslateResult, String> {
    match cfg.provider.as_str() {
        "baidu" => baidu_translate(text, from, to, cfg).await,
        _ => youdao_translate(text, from, to, cfg).await,
    }
}

/// 有道智云（v3 签名）：sha256(appKey + input + salt + curtime + appSecret)
async fn youdao_translate(
    text: &str,
    from: &str,
    to: &str,
    cfg: &TranslatorConfig,
) -> Result<TranslateResult, String> {
    use sha2::{Digest, Sha256};
    if cfg.youdao_key.is_empty() || cfg.youdao_secret.is_empty() {
        return Err("未配置有道翻译 Key/Secret，请在设置中填写".into());
    }
    let salt = chrono::Utc::now().timestamp_millis().to_string();
    let curtime = chrono::Utc::now().timestamp().to_string();
    // input 截断规则：>20 字符时取前 20 字符 + 总长度
    let input = if text.chars().count() > 20 {
        let head: String = text.chars().take(20).collect();
        format!("{head}{}", text.chars().count())
    } else {
        text.to_string()
    };
    let sign = {
        let mut h = Sha256::new();
        h.update(cfg.youdao_key.as_bytes());
        h.update(input.as_bytes());
        h.update(salt.as_bytes());
        h.update(curtime.as_bytes());
        h.update(cfg.youdao_secret.as_bytes());
        hex::encode(h.finalize())
    };
    let params = [
        ("q", text.to_string()),
        ("from", from.to_string()),
        ("to", target_code("youdao", to)),
        ("appKey", cfg.youdao_key.clone()),
        ("salt", salt),
        ("sign", sign),
        ("signType", "v3".to_string()),
        ("curtime", curtime),
    ];
    let resp: serde_json::Value = reqwest::Client::new()
        .post("https://openapi.youdao.com/api")
        .timeout(std::time::Duration::from_secs(12))
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("请求有道翻译失败：{e}"))?
        .json()
        .await
        .map_err(|e| format!("解析有道响应失败：{e}"))?;
    let code = resp.get("errorCode").and_then(|v| v.as_str()).unwrap_or("1");
    if code != "0" {
        return Err(format!("有道翻译失败（错误码 {code}）"));
    }
    let translation = resp
        .get("translation")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let from = resp
        .get("l")
        .and_then(|v| v.get("src"))
        .and_then(|v| v.as_str())
        .unwrap_or("auto")
        .to_string();
    Ok(TranslateResult {
        text: text.to_string(),
        translation,
        from,
        to: to.to_string(),
        provider: "youdao".into(),
    })
}

/// 百度翻译开放平台：md5(appid + q + salt + 密钥)
async fn baidu_translate(
    text: &str,
    from: &str,
    to: &str,
    cfg: &TranslatorConfig,
) -> Result<TranslateResult, String> {
    use md5::{Digest, Md5};
    if cfg.baidu_appid.is_empty() || cfg.baidu_secret.is_empty() {
        return Err("未配置百度翻译 APPID/密钥，请在设置中填写".into());
    }
    let salt = chrono::Utc::now().timestamp_millis().to_string();
    let sign = {
        let mut h = Md5::new();
        h.update(cfg.baidu_appid.as_bytes());
        h.update(text.as_bytes());
        h.update(salt.as_bytes());
        h.update(cfg.baidu_secret.as_bytes());
        hex::encode(h.finalize())
    };
    let params = [
        ("q", text.to_string()),
        ("from", from.to_string()),
        ("to", target_code("baidu", to)),
        ("appid", cfg.baidu_appid.clone()),
        ("salt", salt),
        ("sign", sign),
    ];
    let resp: serde_json::Value = reqwest::Client::new()
        .post("https://fanyi-api.baidu.com/api/trans/vip/translate")
        .timeout(std::time::Duration::from_secs(12))
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("请求百度翻译失败：{e}"))?
        .json()
        .await
        .map_err(|e| format!("解析百度响应失败：{e}"))?;
    if let Some(code) = resp.get("error_code").and_then(|v| v.as_str()) {
        if !code.is_empty() && code != "0" {
            return Err(format!("百度翻译失败（错误码 {code}）"));
        }
    }
    let translation = resp
        .get("trans_result")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .and_then(|v| v.get("dst"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let from = resp
        .get("from")
        .and_then(|v| v.as_str())
        .unwrap_or("auto")
        .to_string();
    Ok(TranslateResult {
        text: text.to_string(),
        translation,
        from,
        to: to.to_string(),
        provider: "baidu".into(),
    })
}

/// 智能默认目标语言：源内容含中日韩统一表意文字（CJK）→ 翻译为英文；否则 → 中文。
/// 用于划词触发（from=auto）的默认方向，符合"非中文翻中文、中文翻英文"的预期。
/// 不含 CJK 的非中文（英文/日文/韩文/法文等）一律翻中文。
fn target_for_text(text: &str) -> String {
    let has_cjk = text.chars().any(|c| {
        (c >= '\u{4E00}' && c <= '\u{9FFF}') // CJK 统一表意文字
        || (c >= '\u{3400}' && c <= '\u{4DBF}') // 扩展 A
        || (c >= '\u{F900}' && c <= '\u{FAFF}') // 兼容表意文字
    });
    if has_cjk {
        "en".into()
    } else {
        "zh".into()
    }
}

/// 通用语言代码 → 服务商代码（两家的编码不同：有道 ja/ko/fr/es、百度 jp/kor/fra/spa）
fn target_code(provider: &str, lang: &str) -> String {
    let pick = |youdao: &str, baidu: &str| -> String {
        if provider == "baidu" {
            baidu.into()
        } else {
            youdao.into()
        }
    };
    match lang {
        "zh" => pick("zh-CHS", "zh"),
        "en" => pick("en", "en"),
        "ja" => pick("ja", "jp"),
        "ko" => pick("ko", "kor"),
        "fr" => pick("fr", "fra"),
        "de" => pick("de", "de"),
        "ru" => pick("ru", "ru"),
        "es" => pick("es", "spa"),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_direction_chinese_to_english() {
        assert_eq!(target_for_text("你好世界"), "en");
        assert_eq!(target_for_text("这是一段中文内容"), "en");
        assert_eq!(target_for_text("请帮我翻译这句话"), "en");
    }

    #[test]
    fn target_direction_non_chinese_to_chinese() {
        assert_eq!(target_for_text("Hello, world!"), "zh");
        assert_eq!(target_for_text("This is English text"), "zh");
        assert_eq!(target_for_text("Bonjour le monde"), "zh");
        assert_eq!(target_for_text("안녕하세요"), "zh"); // 韩文（非 CJK 统一表意）按规则翻中文
    }

    #[test]
    fn target_direction_empty_and_mixed() {
        assert_eq!(target_for_text(""), "zh");
        // 混合：只要含中文即视为中文源 → 翻英文
        assert_eq!(target_for_text("hello 你好 world"), "en");
    }

    #[test]
    fn target_code_maps_per_provider() {
        assert_eq!(target_code("youdao", "ja"), "ja");
        assert_eq!(target_code("baidu", "ja"), "jp");
        assert_eq!(target_code("youdao", "ko"), "ko");
        assert_eq!(target_code("baidu", "ko"), "kor");
        assert_eq!(target_code("youdao", "fr"), "fr");
        assert_eq!(target_code("baidu", "fr"), "fra");
        assert_eq!(target_code("baidu", "zh"), "zh");
    }
}
