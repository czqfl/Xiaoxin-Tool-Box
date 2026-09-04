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
//!
//! 回复拉取（服务器建议 5~10 分钟轮询一次，取 7 分钟）：
//!   GET {REPLIES_ENDPOINT}?device_id=<UUID>&since=<上次最大回复id，首次0>
//!   响应：{ok, count, replies:[{id, message, created_at}]}
//!   有新回复 → 本地留档（feedback_replies.json，最新在前）+ 广播
//!   feedback://replies 事件（设置窗口刷新红点与列表）+ 系统通知弹窗。

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::storage::{save_json, AppPaths};

/// 反馈服务器接收端点（腾讯云正式服务器）
const FEEDBACK_ENDPOINT: &str = "http://82.157.156.62/api/feedback";
/// 反馈回复拉取端点（同服务器）
const REPLIES_ENDPOINT: &str = "http://82.157.156.62/api/feedback/replies";
/// 截图体积上限（原始字节；base64 后约为 4/3）
const MAX_SCREENSHOT_BYTES: u64 = 8 * 1024 * 1024;
/// 上传超时：截图 + 慢网络余量（共享翻译的 12s 客户端太紧）
const UPLOAD_TIMEOUT_SECS: u64 = 30;
/// 回复轮询间隔（服务器建议 5~10 分钟，取中值 7 分钟）
const POLL_INTERVAL_SECS: u64 = 7 * 60;
/// 首次轮询延迟：避开启动高峰（更新检查在 8s，这里再往后错开）
const POLL_FIRST_DELAY_SECS: u64 = 30;
/// 轮询请求超时
const POLL_TIMEOUT_SECS: u64 = 15;
/// 本地回复留档上限（最新在前，超出截掉最旧的）
const MAX_STORED_REPLIES: usize = 50;

/// 回复留档文件的读改写锁：轮询线程（推进游标+写入新回复）与命令线程
/// （标记已读）都会读改写 feedback_replies.json，串行化避免后写覆盖先写
/// （否则标记已读可能覆盖刚落盘的新回复，导致下轮重复拉取+重复通知）。
static REPLY_STORE_LOCK: Mutex<()> = Mutex::new(());

/// 拉取进行中标志：后台轮询与手动刷新（feedback_poll_replies_now）并发触发时，
/// 后到者直接跳过——两者拉的都是同一 since 游标，并发跑两遍只是重复网络请求，
/// 还可能在极端时序下重复合并同一批回复。
static POLL_INFLIGHT: Mutex<()> = Mutex::new(());

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

/// 读取已存在的档案（轮询用）：从未用过反馈功能（无档案文件）返回 None——
/// 服务器不可能有该设备的回复，直接跳过请求，也避免为从未反馈的设备
/// 提前生成 UUID 档案
fn load_existing_profile(paths: &AppPaths) -> Option<FeedbackProfile> {
    let p: Option<FeedbackProfile> = load_json_opt(&paths.feedback_file);
    p.filter(|p| !p.device_id.is_empty())
}

/* ==== 开发者回复：轮询拉取 + 本地留档 ==== */

/// 单条开发者回复（服务器原样字段；id 为增量游标键）
#[derive(Serialize, Deserialize, Clone)]
pub struct FeedbackReply {
    pub id: u64,
    pub message: String,
    #[serde(default)]
    pub created_at: String,
}

/// 回复留档（feedback_replies.json）。与 feedback.json 分开存：本文件只有
/// 轮询线程和已读命令写入（REPLY_STORE_LOCK 串行），与反馈提交写
/// feedback.json 的路径完全隔离，互不竞争。
#[derive(Serialize, Deserialize, Clone, Default)]
struct ReplyStore {
    /// 增量拉取游标：下次请求的 since（已拉取过的最大回复 id）
    #[serde(default)]
    last_id: u64,
    /// 已读游标：用户打开「关于」页时推进到 last_id（侧栏红点据此计算）
    #[serde(default)]
    last_read_id: u64,
    /// 本地留档，最新在前
    #[serde(default)]
    replies: Vec<FeedbackReply>,
}

/// 服务器响应：{ok, count, replies:[...]}（count 冗余，直接用数组长度）
#[derive(Deserialize)]
struct RepliesResponse {
    #[serde(default = "default_true")]
    ok: bool,
    #[serde(default)]
    replies: Vec<FeedbackReply>,
}
fn default_true() -> bool {
    true
}

fn default_store() -> ReplyStore {
    ReplyStore::default()
}

/// 拉取一次回复（阻塞式，跑在专用轮询线程或 spawn_blocking 上）：有新回复 →
/// 留档落盘 + 广播 feedback://replies + 系统通知。返回新回复条数。
fn poll_replies_once(app: &AppHandle) -> Result<usize, String> {
    // 已有一次拉取在途（后台轮询 vs 手动刷新并发）：跳过本次，视为无新回复。
    // 守卫必须绑定变量持有到函数返回，`let _ =` 会立即释放锁失去防抖意义。
    let Ok(_inflight) = POLL_INFLIGHT.try_lock() else {
        return Ok(0);
    };
    let paths = app.state::<AppPaths>().inner().clone();
    let Some(profile) = load_existing_profile(&paths) else {
        return Ok(0); // 从未用过反馈功能：不可能有回复，跳过
    };

    // 拉取期间不持锁（网络 IO 可能十几秒），拿到结果后再锁内合并落盘
    let since = {
        let _g = lock_store();
        load_json_opt(&paths.feedback_replies_file)
            .unwrap_or_else(default_store)
            .last_id
    };
    let url = format!(
        "{REPLIES_ENDPOINT}?device_id={}&since={since}",
        profile.device_id
    );
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(POLL_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("网络请求失败：{e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("服务器返回 {status}"));
    }
    let parsed: RepliesResponse = resp.json().map_err(|e| format!("解析响应失败：{e}"))?;
    if !parsed.ok {
        return Err("服务器返回 ok=false".into());
    }
    if parsed.replies.is_empty() {
        return Ok(0);
    }

    // 锁内合并：推进增量游标 + 新回复插到留档最前（按 id 降序排，不依赖
    // 服务器返回顺序）+ 截断上限
    let new_count = parsed.replies.len();
    let mut replies = parsed.replies;
    replies.sort_by(|a, b| b.id.cmp(&a.id));
    // 降序排列后第一条即最新（通知正文用，须在 append 留档前取出）
    let latest_msg = replies.first().map(|r| r.message.clone()).unwrap_or_default();
    {
        let _g = lock_store();
        let mut store: ReplyStore = load_json_opt(&paths.feedback_replies_file)
            .unwrap_or_else(default_store);
        let max_id = replies.iter().map(|r| r.id).max().unwrap_or(0);
        store.last_id = store.last_id.max(max_id);
        replies.append(&mut store.replies);
        replies.truncate(MAX_STORED_REPLIES);
        store.replies = replies;
        save_json(&paths.feedback_replies_file, &store).map_err(|e| e.to_string())?;
    }

    // 广播给设置窗口（若在运行）：刷新「关于」页回复列表与侧栏红点
    let _ = app.emit("feedback://replies", new_count);

    // 系统通知：单条直接给内容，多条给条数 + 最新一条
    let body = if new_count == 1 {
        truncate_notify(&latest_msg)
    } else {
        format!("收到 {new_count} 条新回复，最新：{}", truncate_notify(&latest_msg))
    };
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title("小心工具箱 · 反馈有新回复")
        .body(body)
        .show()
        .map_err(|e| format!("发送通知失败：{e}"))?;
    crate::storage::diag_write(&format!("[feedback] 收到新回复 {new_count} 条，已弹通知"));
    Ok(new_count)
}

/// 毒性锁兜底：某线程 panic 也不毒死后续轮询
fn lock_store() -> std::sync::MutexGuard<'static, ()> {
    REPLY_STORE_LOCK.lock().unwrap_or_else(|p| p.into_inner())
}

/// 通知正文截断（系统 toast 过长会被系统裁切，主动控长）
fn truncate_notify(s: &str) -> String {
    const MAX_CHARS: usize = 80;
    if s.chars().count() <= MAX_CHARS {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(MAX_CHARS).collect::<String>())
    }
}

/// 启动回复轮询线程：延迟 30s 首拉（避开启动高峰），此后每 7 分钟一次。
/// 失败静默记 diag 日志等下一轮（服务器未就绪/离线是常态，不能打扰用户）。
pub fn spawn_reply_poller(app: AppHandle) {
    std::thread::Builder::new()
        .name("feedback-reply-poll".into())
        .spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(POLL_FIRST_DELAY_SECS));
            loop {
                if let Err(e) = poll_replies_once(&app) {
                    crate::storage::diag_write(&format!("[feedback] 回复轮询失败：{e}"));
                }
                std::thread::sleep(std::time::Duration::from_secs(POLL_INTERVAL_SECS));
            }
        })
        .map(|_| ())
        .unwrap_or_else(|e| {
            crate::storage::diag_write(&format!("[feedback] 回复轮询线程启动失败：{e}"))
        });
}

/// 「关于」页展示：本地留档 + 未读数（未读 = id 超过已读游标的条数）
#[derive(Serialize)]
pub struct ReplySummary {
    pub replies: Vec<FeedbackReply>,
    pub unread: usize,
}

/// 读取留档摘要（feedback_list_replies 与手动拉取命令共用）
fn list_replies_summary(paths: &AppPaths) -> ReplySummary {
    let _g = lock_store();
    let store: ReplyStore = load_json_opt(&paths.feedback_replies_file).unwrap_or_else(default_store);
    let unread = store
        .replies
        .iter()
        .filter(|r| r.id > store.last_read_id)
        .count();
    ReplySummary { replies: store.replies, unread }
}

#[tauri::command]
pub fn feedback_list_replies(paths: State<'_, AppPaths>) -> ReplySummary {
    list_replies_summary(&paths)
}

/// 手动拉取一次回复（关于页「刷新」按钮）：立即向服务器拉取增量并返回
/// 最新留档，不必等 7 分钟轮询。poll_replies_once 是阻塞网络 IO，放
/// spawn_blocking 跑，不占用异步命令线程池的执行器。
#[tauri::command]
pub async fn feedback_poll_replies_now(app: AppHandle) -> Result<ReplySummary, String> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || poll_replies_once(&app2))
        .await
        .map_err(|e| format!("拉取任务执行失败：{e}"))?
        .map_err(|e| format!("拉取回复失败：{e}"))?;
    let paths = app.state::<AppPaths>().inner().clone();
    Ok(list_replies_summary(&paths))
}

/// 标记全部已读（用户打开「关于」页时调用：推进已读游标，侧栏红点熄灭）
#[tauri::command]
pub fn feedback_mark_replies_read(paths: State<'_, AppPaths>) -> Result<(), String> {
    let _g = lock_store();
    let mut store: ReplyStore = load_json_opt(&paths.feedback_replies_file).unwrap_or_else(default_store);
    if store.last_read_id < store.last_id {
        store.last_read_id = store.last_id;
        save_json(&paths.feedback_replies_file, &store).map_err(|e| e.to_string())?;
    }
    Ok(())
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
