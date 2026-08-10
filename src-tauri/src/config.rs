//! 用户配置：结构定义 + 读写命令。所有默认值通过 Default 实现集中管理。
use crate::storage::{load_json, save_json, AppPaths};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

/// 粘贴模式：普通 / 先进先出 / 后进先出
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PasteMode {
    Normal,
    Fifo,
    Lifo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ClipboardConfig {
    /// 历史容量上限
    pub max_history: u32,
    /// 是否监听图片
    pub watch_images: bool,
    /// 是否监听文件路径
    pub watch_files: bool,
    /// 粘贴后是否自动关闭面板
    pub close_after_paste: bool,
    /// 剪贴板面板是否置顶显示
    pub always_on_top: bool,
    /// 粘贴模式；顺序模式下全局 Ctrl+V 逐条带出队列内容
    pub paste_mode: PasteMode,
}

impl Default for ClipboardConfig {
    fn default() -> Self {
        Self {
            max_history: 200,
            watch_images: true,
            watch_files: true,
            close_after_paste: true,
            always_on_top: true,
            paste_mode: PasteMode::Normal,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FolderLayout {
    Grid,
    List,
}

/// 面板分区排布方式：左右分栏 / 上下分栏
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FolderSplit {
    Columns,
    Rows,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FolderConfig {
    /// 是否显示访问次数
    pub show_visit_count: bool,
    /// 卡片展示模式
    pub layout: FolderLayout,
    /// 分区排布方式
    pub split: FolderSplit,
    /// 每个分区每页展示的条目数
    pub page_size: u32,
    /// 文件夹面板是否置顶显示
    pub always_on_top: bool,
    /// 是否追踪资源管理器中打开的文件夹并自动统计访问次数
    pub track_explorer: bool,
}

impl Default for FolderConfig {
    fn default() -> Self {
        Self {
            show_visit_count: true,
            layout: FolderLayout::Grid,
            split: FolderSplit::Columns,
            page_size: 12,
            always_on_top: true,
            track_explorer: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ShortcutsConfig {
    /// 呼出剪贴板面板
    pub clipboard: String,
    /// 呼出文件夹面板
    pub folder: String,
    /// 呼出账号密码面板
    pub credentials: String,
}

impl Default for ShortcutsConfig {
    fn default() -> Self {
        Self {
            clipboard: "Alt+C".into(),
            folder: "Alt+F".into(),
            credentials: "Alt+A".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CredentialConfig {
    /// 账号密码面板是否置顶显示
    pub always_on_top: bool,
    /// 是否默认显示全部密码（按配置持久化，下次打开遵循）
    pub show_passwords: bool,
}

impl Default for CredentialConfig {
    fn default() -> Self {
        Self {
            always_on_top: true,
            show_passwords: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct GeneralConfig {
    /// 主题：system / light / dark
    pub theme: ThemeMode,
    /// 静默启动（最小化到托盘，不弹出设置窗口）
    pub silent_start: bool,
    /// 语言（首期仅实现简体中文，预留字段）
    pub language: String,
    /// 面板是否启用亚克力毛玻璃效果
    pub acrylic_enabled: bool,
    /// 面板底色不透明度（0-100，越大越不透明，亚克力模糊越不明显）
    pub acrylic_opacity: u8,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            silent_start: true,
            language: "zh-CN".into(),
            acrylic_enabled: true,
            acrylic_opacity: 75,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AppConfig {
    pub clipboard: ClipboardConfig,
    pub folder: FolderConfig,
    pub credentials: CredentialConfig,
    pub shortcuts: ShortcutsConfig,
    pub general: GeneralConfig,
}

/// 运行时共享的配置状态，供剪贴板监听线程等读取。
pub struct ConfigState(pub Mutex<AppConfig>);

#[tauri::command]
pub fn config_load(paths: State<'_, AppPaths>) -> AppConfig {
    load_json(&paths.config_file, AppConfig::default())
}

#[tauri::command]
pub fn config_save(
    app: tauri::AppHandle,
    config: AppConfig,
    paths: State<'_, AppPaths>,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    save_json(&paths.config_file, &config).map_err(|e| format!("保存配置失败：{e}"))?;
    *state.0.lock().unwrap() = config.clone();
    // 粘贴模式变化时同步全局 Ctrl+V 顺序粘贴快捷键的注册状态
    crate::shortcut::sync_seq_shortcut(&app, config.clipboard.paste_mode);
    // 面板亚克力开关变化时立即生效（开：重新上亚克力；关：清除亚克力）
    #[cfg(windows)]
    for label in [
        crate::panel::CLIPBOARD_PANEL,
        crate::panel::FOLDER_PANEL,
        crate::panel::CREDENTIAL_PANEL,
    ] {
        if let Some(w) = app.get_webview_window(label) {
            crate::apply_panel_effects_for(&w, config.general.acrylic_enabled);
        }
    }
    Ok(())
}
