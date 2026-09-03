//! 用户反馈：匿名设备码 + 表单提交（POST JSON 到反馈服务器）。
//! 无账号体系：首次使用生成 UUID 设备码持久化于 feedback.json（与 IP 无关——
//! IP 受动态分配/NAT/CGNAT 影响无法稳定标识用户，设备码在重装系统前恒定），
//! 服务器以 device_id 关联"谁反馈过什么"，问题修复后可按 device_id 推送通知。
//!
//! 接口约定（服务器侧按此实现）：
//!   POST {FEEDBACK_ENDPOINT}
//!   Content-Type: application/json
//!   {
//!     "device_id": "uuid-v4",           // 匿名设备码（推送定位键）
//!     "app_version": "1.0.1",           // 应用版本
//!     "os": "windows",                  // 操作系统
//!     "category": "bug|suggestion|other",
//!     "text": "问题描述",
//!     "name": "",                       // 可选反馈人姓名
//!     "contact": "",                    // 可选联系方式（QQ/邮箱等）
//!     "screenshot": null | {            // 可选截图
//!       "name": "xxx.png", "mime": "image/png",
//!       "data_base64": "..."            // 原始字节 base64，上限 8MB
//!     }
//!   }
//!   响应：2xx 即成功（正文忽略），其余视为失败并把状态码回传前端展示。

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::storage::{save_json, AppPaths};

/// 反馈服务器接收端点（占位符，域名定稿后与更新服务器一起替换）
const FEEDBACK_ENDPOINT: &str = "https://feedback.xiaoxin.example.com/api/feedback";
/// 截图体积上限（原始字节；base64 后约为 4/3）
const MAX_SCREENSHOT_BYTES: u64 = 8 * 1024 * 1024;
/// 上传超时：截图 + 慢网络余量（共享翻译的 12s 客户端太紧）
const UPLOAD_TIMEOUT_SECS: u64 = 30;

/// 本机反馈档案（feedback.json）
#[derive(Serialize, Deserialize, Clone)]
pub struct FeedbackProfile {
    /// 匿名设备码：UUID v4，首次访问生成，重装/清数据才更换
    pub device_id: String,
    /// 可选反馈人姓名（预填记忆，下次自动带出）
    #[serde(default)]
    pub name: String,
    /// 可选联系方式（同上）
    #[serde(default)]
    pub contact: String,
}

/// 读取（不存在则创建）本机反馈档案
fn load_or_create_profile(paths: &AppPaths) -> FeedbackProfile {
    let existing: Option<FeedbackProfile> =
        load_json_opt(&paths.feedback_file);
    match existing {
        Some(p) if !p.device_id.is_empty() => p,
        _ => {
            // 首次：生成设备码并立即落盘（后续提交都复用）
            let p = FeedbackProfile {
                device_id: uuid::Uuid::new_v4().to_string(),
                name: String::new(),
                contact: String::new(),
            };
            let _ = save_json(&paths.feedback_file, &p);
            p
        }
    }
}

/// load_json 的 Option 版：文件不存在返回 None（解析失败也走重建——档案可
/// 无损再生，不像配置那样需要 .bak 留底）
fn load_json_opt<T: serde::de::DeserializeOwned>(path: &std::path::Path) -> Option<T> {
    std::fs::read_to_string(path).ok().and_then(|c| serde_json::from_str(&c).ok())
}

/// 图片扩展名 → MIME（仅白名单格式；不认识的返回 None 由调用方拒绝）
fn image_mime(path: &std::path::Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "bmp" => Some("image/bmp"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// 读取设备档案（关于页表单初始化：设备码展示 + 姓名联系方式预填）
#[tauri::command]
pub fn feedback_profile(paths: State<'_, AppPaths>) -> FeedbackProfile {
    load_or_create_profile(&paths)
}

/// 记住反馈人姓名/联系方式（提交成功后调用，下次打开表单自动带出）
#[tauri::command]
pub fn feedback_save_contact(
    paths: State<'_, AppPaths>,
    name: String,
    contact: String,
) -> Result<(), String> {
    let mut p = load_or_create_profile(&paths);
    p.name = name.trim().to_string();
    p.contact = contact.trim().to_string();
    save_json(&paths.feedback_file, &p).map_err(|e| e.to_string())
}

/// 截图预览数据（前端 <img src> 直接用）
#[derive(Serialize)]
pub struct FeedbackImagePreview {
    /// data URL：data:image/png;base64,....
    pub data_url: String,
    /// 文件体积（原始字节）
    pub size: u64,
}

/// 读取本地图片为 data URL（表单选择截图后即时预览，确认没选错图）
#[tauri::command]
pub fn feedback_read_image(path: String) -> Result<FeedbackImagePreview, String> {
    let p = std::path::Path::new(&path);
    let mime = image_mime(p).ok_or("仅支持 PNG/JPG/BMP/GIF/WEBP 图片")?;
    let meta = std::fs::metadata(p).map_err(|e| format!("读取文件失败：{e}"))?;
    if meta.len() > MAX_SCREENSHOT_BYTES {
        return Err(format!(
            "截图超过 {} MB 上限",
            MAX_SCREENSHOT_BYTES / 1024 / 1024
        ));
    }
    let bytes = std::fs::read(p).map_err(|e| format!("读取文件失败：{e}"))?;
    Ok(FeedbackImagePreview {
        data_url: format!("data:{mime};base64,{}", STANDARD.encode(&bytes)),
        size: meta.len(),
    })
}

/// 提交负载（结构与文件头注释的接口约定一一对应）
#[derive(Serialize)]
struct FeedbackPayload {
    device_id: String,
    app_version: String,
    os: &'static str,
    category: String,
    text: String,
    name: String,
    contact: String,
    screenshot: Option<FeedbackScreenshot>,
}

#[derive(Serialize)]
struct FeedbackScreenshot {
    name: String,
    mime: String,
    data_base64: String,
}

/// 提交反馈：POST JSON 到反馈服务器。2xx 成功，其余把状态码报给前端。
#[tauri::command]
pub async fn submit_feedback(
    app: AppHandle,
    paths: State<'_, AppPaths>,
    category: String,
    text: String,
    name: String,
    contact: String,
    screenshot_path: Option<String>,
) -> Result<(), String> {
    let profile = load_or_create_profile(&paths);
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("请填写问题描述".into());
    }

    // 截图：读取 + base64（预览命令已限制过体积，这里防御性复查）
    let screenshot = match screenshot_path {
        Some(ref path) if !path.is_empty() => {
            let p = std::path::Path::new(path);
            let mime = image_mime(p).ok_or("仅支持 PNG/JPG/BMP/GIF/WEBP 图片")?;
            let meta = std::fs::metadata(p).map_err(|e| format!("读取截图失败：{e}"))?;
            if meta.len() > MAX_SCREENSHOT_BYTES {
                return Err(format!(
                    "截图超过 {} MB 上限",
                    MAX_SCREENSHOT_BYTES / 1024 / 1024
                ));
            }
            let bytes = std::fs::read(p).map_err(|e| format!("读取截图失败：{e}"))?;
            Some(FeedbackScreenshot {
                name: p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "screenshot.png".into()),
                mime: mime.to_string(),
                data_base64: STANDARD.encode(&bytes),
            })
        }
        _ => None,
    };

    let version = app.package_info().version.clone();
    let payload = FeedbackPayload {
        device_id: profile.device_id,
        app_version: format!("{}.{}.{}", version.major, version.minor, version.patch),
        os: std::env::consts::OS,
        category,
        text,
        name: name.trim().to_string(),
        contact: contact.trim().to_string(),
        screenshot,
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(UPLOAD_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(FEEDBACK_ENDPOINT)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("网络请求失败：{e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("服务器返回 {status}"));
    }
    crate::storage::diag_write("[feedback] 反馈已提交");
    Ok(())
}
