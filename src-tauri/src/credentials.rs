//! 常用账号密码面板：手动添加的凭据条目，支持增删改与一键复制。
//! 数据以明文 JSON 保存在本地数据目录（便携版为 exe 同级 data/），
//! 仅用于本机便捷访问，不含任何加密 —— 请勿存放极高敏感性的密码。
use crate::storage::{save_json, AppPaths};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credential {
    pub id: String,
    /// 名称/用途，如「GitHub」「公司邮箱」
    pub label: String,
    /// 账号（用户名 / 邮箱 / 手机号）
    pub account: String,
    /// 密码
    pub password: String,
    /// 备注（可选）
    pub note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 添加 / 修改共用入参
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialInput {
    pub label: String,
    pub account: String,
    pub password: String,
    pub note: Option<String>,
}

pub struct CredentialStore(pub Mutex<Vec<Credential>>);

fn persist(entries: &[Credential], paths: &AppPaths) -> Result<(), String> {
    save_json(&paths.creds_file, entries).map_err(|e| format!("保存失败：{e}"))
}

#[tauri::command]
pub fn cred_list(store: State<'_, CredentialStore>) -> Vec<Credential> {
    store.0.lock().unwrap().clone()
}

/// 添加凭据：名称、账号、密码均必填
#[tauri::command]
pub fn cred_add(
    input: CredentialInput,
    store: State<'_, CredentialStore>,
    paths: State<'_, AppPaths>,
) -> Result<Credential, String> {
    let label = input.label.trim();
    if label.is_empty() {
        return Err("请填写名称 / 用途".into());
    }
    if input.account.trim().is_empty() {
        return Err("请填写账号".into());
    }
    if input.password.is_empty() {
        return Err("请填写密码".into());
    }
    let now = chrono::Utc::now().timestamp_millis();
    let cred = Credential {
        id: uuid::Uuid::new_v4().to_string(),
        label: label.to_string(),
        account: input.account.trim().to_string(),
        password: input.password,
        note: input.note.filter(|n| !n.trim().is_empty()),
        created_at: now,
        updated_at: now,
    };
    let mut entries = store.0.lock().unwrap();
    entries.push(cred.clone());
    persist(&entries, &paths)?;
    Ok(cred)
}

/// 修改凭据
#[tauri::command]
pub fn cred_update(
    id: String,
    input: CredentialInput,
    store: State<'_, CredentialStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let label = input.label.trim();
    if label.is_empty() {
        return Err("请填写名称 / 用途".into());
    }
    if input.account.trim().is_empty() {
        return Err("请填写账号".into());
    }
    if input.password.is_empty() {
        return Err("请填写密码".into());
    }
    let mut entries = store.0.lock().unwrap();
    let Some(cred) = entries.iter_mut().find(|e| e.id == id) else {
        return Err("未找到该账号".into());
    };
    cred.label = label.to_string();
    cred.account = input.account.trim().to_string();
    cred.password = input.password;
    cred.note = input.note.filter(|n| !n.trim().is_empty());
    cred.updated_at = chrono::Utc::now().timestamp_millis();
    persist(&entries, &paths)
}

#[tauri::command]
pub fn cred_delete(
    id: String,
    store: State<'_, CredentialStore>,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    let mut entries = store.0.lock().unwrap();
    entries.retain(|e| e.id != id);
    persist(&entries, &paths)
}
