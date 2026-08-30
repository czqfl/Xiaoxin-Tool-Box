//! 常用语速贴：管理常用话术 / 文本片段，点击一键粘贴到当前输入框。
//! 存储为 data/snippets.json（Vec<Snippet>，每次操作全量读写，与 quickfiles 同模式，
//! 不维护内存 state，避免启动期加载与运行期写回的一致性负担）。
//! 粘贴链路（与剪贴板面板同一套验证过的模式）：
//!   snippets_paste → 写剪贴板（复用 clipboard_copy_text，抑制历史记录不污染）
//!   → spawn 延迟 80ms 注入 Ctrl+V（复用 keyhook::send_ctrl_v，带魔数防钩子误吞）
//!   → 前端点击后立即隐藏面板，焦点归还用户原窗口 → Ctrl+V 在目标窗口生效。
use crate::storage::AppPaths;
use serde::{Deserialize, Serialize};
use tauri::State;

/// 单个语速贴条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    /// 显示名（列表标题）
    pub title: String,
    /// 内容（点击后粘贴的正文）
    pub content: String,
    /// 分组名（空串 = 默认分组）
    pub group: String,
    /// 创建时间（毫秒时间戳）
    pub created_at: i64,
    /// 最近修改时间（毫秒时间戳）
    pub updated_at: i64,
}

fn load_snippets(paths: &AppPaths) -> Vec<Snippet> {
    crate::storage::load_json(&paths.snippets_file, vec![])
}

fn save_snippets(paths: &AppPaths, list: &[Snippet]) -> Result<(), String> {
    crate::storage::save_json(&paths.snippets_file, list).map_err(|e| format!("保存失败：{e}"))
}

/// 读-改-写序列的互斥锁：两个面板窗口并发写 snippets.json 时
/// 后写者会覆盖先写者的更新（storage save_json 的 tmp 竞态叠加）
static SNIPPETS_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 列出全部语速贴（按最近修改时间倒序，最新在前）
#[tauri::command]
pub fn snippets_list(paths: State<AppPaths>) -> Vec<Snippet> {
    let mut list = load_snippets(&paths);
    list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    list
}

/// 新增语速贴；标题与内容均非空，返回创建后的条目
#[tauri::command]
pub fn snippets_create(
    title: String,
    content: String,
    group: String,
    paths: State<AppPaths>,
) -> Result<Snippet, String> {
    let title = title.trim().to_string();
    let content = content.trim().to_string();
    if title.is_empty() {
        return Err("标题不能为空".into());
    }
    if content.is_empty() {
        return Err("内容不能为空".into());
    }
    let mut list = load_snippets(&paths);
    let now = now_ms();
    let sn = Snippet {
        id: uuid::Uuid::new_v4().to_string(),
        title,
        content,
        group: group.trim().to_string(),
        created_at: now,
        updated_at: now,
    };
    list.push(sn.clone());
    save_snippets(&paths, &list)?;
    Ok(sn)
}

/// 更新语速贴（标题 / 内容 / 分组）；仅刷新 updated_at，保留创建时间
#[tauri::command]
pub fn snippets_update(
    id: String,
    title: String,
    content: String,
    group: String,
    paths: State<AppPaths>,
) -> Result<Snippet, String> {
    let title = title.trim().to_string();
    let content = content.trim().to_string();
    if title.is_empty() {
        return Err("标题不能为空".into());
    }
    if content.is_empty() {
        return Err("内容不能为空".into());
    }
    let mut list = load_snippets(&paths);
    let Some(sn) = list.iter_mut().find(|s| s.id == id) else {
        return Err("片段不存在".into());
    };
    sn.title = title;
    sn.content = content;
    sn.group = group.trim().to_string();
    sn.updated_at = now_ms();
    let out = sn.clone();
    save_snippets(&paths, &list)?;
    Ok(out)
}

/// 删除语速贴
#[tauri::command]
pub fn snippets_delete(id: String, paths: State<AppPaths>) -> Result<(), String> {
    let mut list = load_snippets(&paths);
    list.retain(|s| s.id != id);
    save_snippets(&paths, &list)
}

/// 一键粘贴：写剪贴板（抑制历史记录）→ 延迟 80ms 注入 Ctrl+V。
/// 前端点击后需立即隐藏面板，焦点归还用户原窗口后粘贴才生效。
#[tauri::command]
pub fn snippets_paste(id: String, paths: State<AppPaths>) -> Result<(), String> {
    let sn = load_snippets(&paths)
        .into_iter()
        .find(|s| s.id == id)
        .ok_or("片段不存在")?;
    // 复用剪贴板模块的写剪贴板（SUPPRESS_WATCH 抑制监听，不污染剪贴板历史）
    crate::clipboard::clipboard_copy_text(sn.content.clone(), None)?;
    // 延迟注入 Ctrl+V：等待前端隐藏面板、焦点回到用户原窗口
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(80));
        crate::keyhook::send_ctrl_v();
    });
    Ok(())
}
