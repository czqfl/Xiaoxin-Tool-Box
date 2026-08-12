//! 划词翻译：有道智云 / 百度翻译开放平台。
//!
//! 触发流程（快捷键）严格按此顺序，顺序本身就是正确性的一部分：
//!   1. 先复制：保存原剪贴板 → 模拟 Ctrl+C → 读回选中文本（此阶段不显示任何窗口）
//!   2. 再还原：把原剪贴板写回（抹掉我们复制的那条，且不进剪贴板历史）
//!   3. 后显示：显示并【激活】翻译面板，同时把原文带给前端（能拖动/点×/Esc）
//!   4. 最后译：异步调翻译 API，译文到达后填充面板
//! 两个服务商均支持 from=auto 自动检测源语言；凭据在设置页配置并持久化到 config.json。

use crate::config::{ConfigState, TranslatorConfig};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
#[cfg(windows)]
use windows::Win32::Foundation::HWND;

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
/// **顺序即正确性**（勿再倒回去）：
///   1. **先复制**——热键触发瞬间源应用天然在前台，此阶段绝不显示/激活任何窗口，
///      不与源应用争夺焦点，Ctrl+C 必然发到源应用；
///   2. **还原剪贴板**——把原内容写回（等价于删掉我们复制的那条），且不进历史；
///   3. **再显示并激活面板**——此时不再需要源应用前台，可放心抢焦点；
///      面板拿到真实焦点后才能拖动 / 点 × / 按 Esc，同时立刻带出原文；
///   4. **最后翻译**——异步调 API，译文到达后填充。
///
/// 历史教训：早期实现是"先显示弹窗再复制"，弹窗 `show()` 会抢前台，与"复制需源
/// 应用前台"形成结构性竞态 → 偶发复制失败；为回避竞态改用 `SW_SHOWNA`（只显示
/// 不激活），又导致面板全程无焦点 → 关不掉、拖不动、显示历史内容。把顺序倒过来，
/// 这几类问题一并消失，且不再需要任何焦点争夺技巧。
pub fn trigger_selection_translate<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();

    // 面板若还开着（上一次翻译没关），它就是当前前台窗口——必须先隐藏，
    // 否则 Ctrl+C 会发给面板自己，永远复制不到源应用的选中文本。
    #[cfg(windows)]
    let mut popup_raw: Option<usize> = None;
    if let Some(w) = app.get_webview_window(TRANSLATE_PANEL) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        }
        #[cfg(windows)]
        {
            popup_raw = get_hwnd(&w).map(|h| h.0 as usize);
        }
    }

    // 取按键瞬间由低级钩子记录的真实源窗口（此刻还没有任何窗口操作）。
    // 过滤掉"源窗口就是本面板"的情况（上一次翻译面板占着前台）。
    #[cfg(windows)]
    let src_raw: Option<usize> = crate::keyhook::source_hwnd_at_keydown()
        .or_else(|| crate::keyhook::foreground_hwnd())
        .map(|h| h.0 as usize)
        .filter(|h| Some(*h) != popup_raw);

    // 复制阶段是同步的 Win32 时序操作（含 sleep），放独立线程执行，不阻塞事件循环
    std::thread::spawn(move || {
        // 刚隐藏面板时，给 Windows 一点时间把前台交回源应用
        std::thread::sleep(std::time::Duration::from_millis(40));

        // ---------- 阶段 1：复制选中文本（全程不显示/不激活任何窗口）----------
        // 先存下用户原有剪贴板内容，复制完成后写回（等价于删掉我们复制的那条）
        let prev_default = arboard::Clipboard::new()
            .ok()
            .and_then(|mut c| c.get_text().ok())
            .unwrap_or_default();
        crate::storage::diag_write(&format!(
            "[translate] start(copy-first): prev_clip_len={}",
            prev_default.len()
        ));

        // 仅当源应用当前不在前台（如上一次面板刚占过前台）才主动拉回。
        // 此处已无"我们自己的 show() 抢焦点"，是确定性操作，不存在竞态。
        #[cfg(windows)]
        if let Some(r) = src_raw {
            let src = HWND(r as *mut std::ffi::c_void);
            crate::storage::diag_write(&format!("[translate] src_hwnd=0x{r:X}"));
            for _ in 0..5 {
                if crate::keyhook::foreground_hwnd().map(|x| x.0) == Some(src.0) {
                    break;
                }
                crate::keyhook::set_source_foreground(src);
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
        }

        let mut selected = String::new();
        for attempt in 0..3 {
            // 必须先等修饰键释放再注入 Ctrl+C：否则注入的 C 与用户仍按住的 Alt
            // 组合成 Alt+C，会命中 QQ 等截图工具热键
            #[cfg(windows)]
            crate::keyhook::wait_modifiers_released();

            // 以【剪贴板序列号】为复制成功的判据（见下）
            #[cfg(windows)]
            let seq_before = crate::keyhook::clipboard_seq();

            #[cfg(windows)]
            crate::keyhook::send_ctrl_c();
            // 第 2 次起补发 WM_COPY：原生编辑控件对 WM_COPY 比模拟按键更稳
            #[cfg(windows)]
            if attempt > 0 {
                if let Some(r) = src_raw {
                    crate::keyhook::send_wm_copy(HWND(r as *mut std::ffi::c_void));
                }
            }

            // 轮询等待复制落地。判据是【序列号变化】而非"文本和原来不同"——
            // 选中文字恰好与剪贴板已有内容相同时，内容比较会误判成"复制失败"，
            // 这是"偶尔复制不到"的一类隐藏成因。
            let mut cur = String::new();
            let mut copied = false;
            for d in [70u64, 90, 140, 220] {
                std::thread::sleep(std::time::Duration::from_millis(d));
                #[cfg(windows)]
                let seq_changed = crate::keyhook::clipboard_seq() != seq_before;
                #[cfg(not(windows))]
                let seq_changed = false;
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
                "[translate] attempt {}: clip_len={} copied={}",
                attempt,
                cur.len(),
                copied
            ));
            if copied {
                selected = cur.trim().to_string();
                break;
            }
        }
        crate::storage::diag_write(&format!("[translate] selected_len={}", selected.len()));

        // ---------- 阶段 2：还原剪贴板（抹掉我们复制的那条，且不进历史）----------
        if !selected.is_empty() {
            if let Ok(mut cb) = arboard::Clipboard::new() {
                crate::clipboard::SUPPRESS_WATCH.store(true, std::sync::atomic::Ordering::SeqCst);
                let _ = cb.set_text(prev_default.clone());
            }
        }

        // ---------- 阶段 3：显示并【激活】面板（带出原文）----------
        if selected.is_empty() {
            // 没复制到：直接把提示写进 store 再显示，面板一挂载就能看到原因
            let hint = TranslateResult {
                text: String::new(),
                translation: "未检测到选中文本：请先选中文字再按快捷键。\n若当前应用以管理员运行，本工具也需以管理员启动才能模拟复制。".into(),
                from: String::new(),
                to: String::new(),
                provider: String::new(),
            };
            if let Some(store) = app.try_state::<TranslateStore>() {
                *store.0.lock().unwrap() = Some(hint.clone());
            }
            show_popup_activated(&app, "");
            let _ = app.emit(EVT_TRANSLATE_RESULT, hint);
            return;
        }

        // 先把原文写入 store（translation 留空 = "原文已就位、译文在路上"），
        // 这样即使面板首次创建、错过了 start 事件，挂载兜底也能取到原文。
        if let Some(store) = app.try_state::<TranslateStore>() {
            *store.0.lock().unwrap() = Some(TranslateResult {
                text: selected.clone(),
                translation: String::new(),
                from: String::new(),
                to: String::new(),
                provider: String::new(),
            });
        }
        show_popup_activated(&app, &selected);

        // ---------- 阶段 4：翻译（智能方向：含中文→英文，否则→中文）----------
        let Some(cfg) = app
            .try_state::<ConfigState>()
            .map(|c| c.0.lock().unwrap().translator.clone())
        else {
            return;
        };
        let to = target_for_text(&selected);
        tauri::async_runtime::spawn(async move {
            let payload = match translate_text(&selected, "auto", &to, &cfg).await {
                Ok(result) => result,
                // 错误也推给面板展示（reqwest 已带 12s 超时，不会永久挂起）
                Err(e) => TranslateResult {
                    text: selected,
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
    });
}

/// 显示翻译面板并【可靠激活】，同时把原文带给前端。
///
/// 只在复制完成后调用——此时抢前台不会再干扰复制，所以可以正常 `show()` +
/// `force_foreground_robust()` 拿到真实焦点，面板才能拖动 / 点 × / 按 Esc。
fn show_popup_activated<R: Runtime>(app: &AppHandle<R>, text: &str) {
    let Some(w) = app.get_webview_window(TRANSLATE_PANEL) else {
        return;
    };
    // 居中呼出：用窗口尺寸与主显示器尺寸计算居中坐标（物理像素，避免缩放歧义）
    if let (Ok(win), Ok(Some(monitor))) = (w.outer_size(), app.primary_monitor()) {
        let m = monitor.position();
        let s = monitor.size();
        if win.width > 0 && win.height > 0 && s.width > 0 && s.height > 0 {
            let x = m.x as f64 + (s.width as f64 - win.width as f64) / 2.0;
            let y = m.y as f64 + (s.height as f64 - win.height as f64) / 2.0;
            let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }
    let _ = w.unminimize();
    let _ = w.show();
    // 已超出系统前台锁输入窗口，普通 SetForegroundWindow 会被拒 →
    // 用 AttachThreadInput 兜底的 force_foreground_robust
    #[cfg(windows)]
    {
        if let Some(hwnd) = get_hwnd(&w) {
            crate::acrylic::force_foreground_robust(hwnd);
        }
        // 系统级 Esc 关闭兜底（webview 万一没拿到焦点时由键盘钩子关闭）
        crate::keyhook::set_translate_popup_open(true);
    }
    let _ = w.set_focus();
    // 通知前端：进入"翻译中"并立刻带出原文
    let _ = app.emit(
        "translate://start",
        StartPayload {
            text: text.to_string(),
        },
    );
    // 前台锁偶发拒绝时补一次激活
    let w2 = w.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        #[cfg(windows)]
        {
            if let Some(hwnd) = get_hwnd(&w2) {
                crate::acrylic::force_foreground_robust(hwnd);
            }
        }
        let _ = w2.set_focus();
    });
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
