//! 划词翻译：有道智云 / 百度翻译开放平台。
//!
//! 触发方式（快捷键）：保存当前剪贴板 → 模拟 Ctrl+C 复制选中文本 → 读剪贴板
//! → 恢复原剪贴板（不污染历史）→ 调翻译 API → 弹窗展示，可一键复制译文。
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

/// 快捷键触发划词翻译：整体流程放异步任务，不阻塞事件循环
pub fn trigger_selection_translate<R: Runtime>(app: &AppHandle<R>) {
    // AppHandle 是 Clone 的；async 闭包需 'static，先克隆再 move 进去
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // 1. 保存当前剪贴板文本（用于恢复，避免划词破坏用户复制内容）
        let prev = arboard::Clipboard::new()
            .ok()
            .and_then(|mut c| c.get_text().ok());

        // 2-4. 模拟 Ctrl+C 复制选中文本并读取，最多重试 3 次：
        //      有些应用复制异步完成/较慢，一次读不到不代表没选中；
        //      通过"剪贴板内容是否变化"判断复制是否真的生效。
        let mut selected = String::new();
        for _ in 0..3 {
            // 关键：先等修饰键释放再注入 Ctrl+C——否则注入的 C 与用户按住的
            // Alt 组合成 Alt+C，命中 QQ 等截图工具热键（"无论设什么热键都截屏"根因）
            #[cfg(windows)]
            crate::keyhook::wait_modifiers_released();
            #[cfg(windows)]
            crate::keyhook::send_ctrl_c();
            std::thread::sleep(std::time::Duration::from_millis(120));
            let cur = arboard::Clipboard::new()
                .ok()
                .and_then(|mut c| c.get_text().ok())
                .unwrap_or_default();
            // 内容相对原剪贴板发生了变化 → 复制成功
            if cur != prev.clone().unwrap_or_default() {
                selected = cur.trim().to_string();
                break;
            }
        }

        // 5. 恢复原剪贴板（SUPPRESS_WATCH 置位，不触发历史记录）
        if let Some(prev_text) = &prev {
            if let Ok(mut cb) = arboard::Clipboard::new() {
                crate::clipboard::SUPPRESS_WATCH.store(true, std::sync::atomic::Ordering::SeqCst);
                let _ = cb.set_text(prev_text.clone());
            }
        }

        if selected.is_empty() {
            // 没有选中文本：弹窗提示（常见原因：当前窗口以管理员运行，模拟按键被系统拦截）
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
            let _ = app.emit(EVT_TRANSLATE_RESULT, hint);
            show_popup(&app);
            return;
        }

        // 6. 翻译
        let cfg = {
            let Some(c) = app.try_state::<ConfigState>() else {
                return;
            };
            let guard = c.0.lock().unwrap();
            guard.translator.clone()
        };
        let to = cfg.target_lang.clone();
        match translate_text(&selected, "auto", &to, &cfg).await {
            Ok(result) => {
                if let Some(store) = app.try_state::<TranslateStore>() {
                    *store.0.lock().unwrap() = Some(result.clone());
                }
                let _ = app.emit(EVT_TRANSLATE_RESULT, result);
                show_popup(&app);
            }
            Err(e) => {
                // 把错误也广播给弹窗展示
                let err = TranslateResult {
                    text: selected,
                    translation: format!("翻译失败：{e}"),
                    from: String::new(),
                    to: cfg.target_lang,
                    provider: cfg.provider,
                };
                if let Some(store) = app.try_state::<TranslateStore>() {
                    *store.0.lock().unwrap() = Some(err.clone());
                }
                let _ = app.emit(EVT_TRANSLATE_RESULT, err);
                show_popup(&app);
            }
        }
    });
}

/// 显示翻译弹窗：定位到鼠标附近（跟随划词位置）
fn show_popup<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = app.get_webview_window(TRANSLATE_PANEL) else {
        return;
    };
    if let Ok(cursor) = app.cursor_position() {
        let _ = w.set_position(tauri::LogicalPosition::new(cursor.x + 14.0, cursor.y + 14.0));
    }
    // 顺序必须与其它面板一致：先 show 再置前激活！
    // 之前 force_foreground 在 show 之前调用——SetForegroundWindow 对隐藏窗口无效，
    // 窗口显示后从未被激活 → 鼠标事件进不了 webview（diag.log 显示无任何交互记录）。
    // force_foreground 对已 TOPMOST 的窗口直接 SetForegroundWindow，能正常激活。
    let _ = w.unminimize();
    let _ = w.show();
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Ok(handle) = w.window_handle() {
            if let RawWindowHandle::Win32(h) = handle.as_raw() {
                let hwnd = windows::Win32::Foundation::HWND(h.hwnd.get() as *mut _);
                crate::acrylic::force_foreground(hwnd);
            }
        }
    }
    // 系统级 Esc 关闭兜底：标记弹窗打开（webview 无焦点时由键盘钩子关闭）
    #[cfg(windows)]
    crate::keyhook::set_translate_popup_open(true);
    // 确保弹窗获得键盘焦点：后台 SetForegroundWindow 常被前台锁拒绝，
    // 延时到后台线程再补一次（落入用户输入窗口期成功率更高）。
    let w2 = w.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        #[cfg(windows)]
        {
            use raw_window_handle::{HasWindowHandle, RawWindowHandle};
            if let Ok(handle) = w2.window_handle() {
                if let RawWindowHandle::Win32(h) = handle.as_raw() {
                    crate::acrylic::force_foreground(windows::Win32::Foundation::HWND(
                        h.hwnd.get() as *mut _,
                    ));
                }
            }
        }
        let _ = w2.set_focus();
    });
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
