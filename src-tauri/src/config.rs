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
    Tree,
}

/// 终端类型：Windows Terminal / 命令提示符 / PowerShell
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TerminalShell {
    Wt,
    Cmd,
    Powershell,
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
    /// 卡片快捷按钮默认打开的终端类型
    pub terminal_shell: TerminalShell,
    /// 用户手动指定的 VS Code 可执行文件路径（自动探测失败时由前端引导选择并记录）
    pub vscode_path: Option<String>,
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
            terminal_shell: TerminalShell::Powershell,
            vscode_path: None,
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
    /// 划词翻译
    pub translation: String,
    /// 呼出端口工具面板
    pub port: String,
    /// 呼出快速文件面板
    pub files: String,
}

impl Default for ShortcutsConfig {
    fn default() -> Self {
        Self {
            clipboard: "Alt+C".into(),
            folder: "Alt+F".into(),
            credentials: "Alt+A".into(),
            // 默认 Alt+S：单个功能键+字母（用户偏好）。纯 Alt 组合由键盘钩子
            // 主动吞键（不依赖 RegisterHotKey），不会泄漏进编辑器替换选中文字。
            translation: "Alt+S".into(),
            // 端口工具：Alt+P（Port）
            port: "Alt+P".into(),
            // 快速文件：Alt+Q（Quick Files）
            files: "Alt+Q".into(),
        }
    }
}

/// 端口工具面板配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PortConfig {
    /// 端口工具面板是否置顶显示（置顶时常驻，失焦不自动隐藏）
    pub always_on_top: bool,
}

impl Default for PortConfig {
    fn default() -> Self {
        Self {
            always_on_top: true,
        }
    }
}

/// 单一文件类型定义（快速文件面板用）。
/// 每种类型可单独配置：扩展名、显示名、强调色、默认打开方式。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct FileTypeDef {
    /// 扩展名（不含点，小写），如 "md"
    pub ext: String,
    /// 显示名，如 "Markdown"
    pub label: String,
    /// 强调色（十六进制，如 #4c8dff），用于面板内该类型卡片的醒目区分
    pub color: String,
    /// 默认打开方式：应用 exe 完整路径或命令（如 VS Code 路径）。
    /// 为空表示使用系统默认程序打开。
    pub opener: Option<String>,
}

impl Default for FileTypeDef {
    fn default() -> Self {
        Self {
            ext: "txt".into(),
            label: "文本".into(),
            color: "#8a94a6".into(),
            opener: None,
        }
    }
}

/// 快速文件面板配置：在统一位置快速新建/打开/管理多种类型文件。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FilesConfig {
    /// 文件统一保存位置（绝对路径）。为空时回退到 data 目录下的 quickfiles 子目录。
    pub location: Option<String>,
    /// 可新建的文件类型列表（每种类型单独配置扩展名/强调色/默认打开方式）
    pub file_types: Vec<FileTypeDef>,
    /// 面板是否置顶显示
    pub always_on_top: bool,
    /// 默认分组方式："none" 不分组 / "type" 按文件类型 / "date" 按创建日期
    pub default_group: String,
    /// 默认排序方式："created" 按创建时间 / "name" 按名称
    pub default_sort: String,
}

impl Default for FilesConfig {
    fn default() -> Self {
        Self {
            location: None,
            file_types: vec![
                FileTypeDef { ext: "txt".into(), label: "文本".into(), color: "#8a94a6".into(), opener: None },
                FileTypeDef { ext: "md".into(), label: "Markdown".into(), color: "#4c8dff".into(), opener: None },
                FileTypeDef { ext: "json".into(), label: "JSON".into(), color: "#e0a23a".into(), opener: None },
                FileTypeDef { ext: "csv".into(), label: "CSV".into(), color: "#36b37e".into(), opener: None },
                FileTypeDef { ext: "log".into(), label: "日志".into(), color: "#b06fd6".into(), opener: None },
                FileTypeDef { ext: "yaml".into(), label: "YAML".into(), color: "#d96aa0".into(), opener: None },
            ],
            always_on_top: true,
            default_group: "type".into(),
            default_sort: "created".into(),
        }
    }
}

/// 悬浮工具栏配置：常驻小工具条，快速呼出各面板
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ToolbarConfig {
    /// 是否启用（显示）悬浮工具栏
    #[serde(default)]
    pub enabled: bool,
    /// 工具栏上显示的工具图标（顺序即排列顺序）
    #[serde(default)]
    pub tools: Vec<String>,
    /// 排列方向："horizontal" 水平横条 / "vertical" 竖直竖条
    #[serde(default = "default_toolbar_orientation")]
    pub orientation: String,
    /// 贴边自动收起：贴到屏幕边缘后鼠标离开自动滑出、靠近边缘自动弹出
    #[serde(default = "default_true")]
    pub auto_hide: bool,
}

/// 工具栏排列方向默认值：水平
pub fn default_toolbar_orientation() -> String {
    "horizontal".into()
}

/// 布尔默认值 true（serde 字段级 default 用）
pub fn default_true() -> bool {
    true
}

impl Default for ToolbarConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            tools: vec![
                "clipboard".into(),
                "folder".into(),
                "credentials".into(),
                "translation".into(),
                "port".into(),
                "settings".into(),
            ],
            orientation: default_toolbar_orientation(),
            auto_hide: default_true(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
    /// 浅青色主题（淡青背景 + 青绿品牌色，浅色系）
    Mint,
    /// 浅蓝色主题（淡蓝背景 + 天蓝品牌色，浅色系）
    Skyblue,
    /// 红色主题（浅红背景 + 红品牌色，浅色系）
    Red,
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
            acrylic_opacity: 60,
        }
    }
}

/// 划词翻译配置（有道智云 / 百度翻译开放平台，需用户自行申请 key）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TranslatorConfig {
    /// 翻译服务商："youdao" | "baidu"
    pub provider: String,
    /// 有道智云 APP Key
    pub youdao_key: String,
    /// 有道智云 APP Secret
    pub youdao_secret: String,
    /// 百度翻译开放平台 APPID
    pub baidu_appid: String,
    /// 百度翻译开放平台密钥
    pub baidu_secret: String,
    /// 目标语言（通用代码 zh/en/ja/ko/fr/de/ru/es…），源语言由服务商自动检测
    pub target_lang: String,
    /// 翻译面板是否置顶常驻（失焦不自动隐藏），与其他面板的置顶语义一致
    #[serde(default)]
    pub always_on_top: bool,
}

impl Default for TranslatorConfig {
    fn default() -> Self {
        Self {
            provider: "youdao".into(),
            youdao_key: String::new(),
            youdao_secret: String::new(),
            baidu_appid: String::new(),
            baidu_secret: String::new(),
            target_lang: "zh".into(),
            // 默认置顶常驻：与其他面板一致，划词翻译后不因失焦自动关闭
            always_on_top: true,
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
    /// 划词翻译配置（含各服务商凭据，全部持久化在 config.json）
    pub translator: TranslatorConfig,
    /// 端口工具面板配置
    pub port: PortConfig,
    /// 快速文件面板配置（统一位置新建/打开/管理多种类型文件）
    /// serde(default)：旧配置缺失该字段时仅用默认填充，不破坏整份配置
    #[serde(default)]
    pub files: FilesConfig,
    /// 悬浮工具栏配置
    pub toolbar: ToolbarConfig,
    /// 各面板上次关闭时的窗口位置（标签 -> 屏幕坐标），下次呼出恢复（记忆位置）
    pub panel_positions: std::collections::HashMap<String, (i32, i32)>,
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
        crate::panel::PORT_PANEL,
        crate::panel::FILES_PANEL,
        crate::panel::TOOLBAR_WINDOW,
    ] {
        if let Some(w) = app.get_webview_window(label) {
            crate::apply_panel_effects_for(&w, config.general.acrylic_enabled);
        }
    }
    // 设置窗口（带原生边框）：主题切换后立即同步标题栏深浅
    if let Some(w) = app.get_webview_window("settings") {
        crate::apply_titlebar_theme(&w);
    }
    Ok(())
}

/// 导出配置：把 config.json 复制到用户指定位置（备份/迁移）
#[tauri::command]
pub fn config_export_to(
    path: String,
    paths: State<'_, AppPaths>,
) -> Result<(), String> {
    std::fs::copy(&paths.config_file, &path).map_err(|e| format!("导出失败：{e}"))?;
    Ok(())
}

/// 导入配置：从备份文件恢复（校验 JSON 后写回 data 目录并更新运行时状态）。
/// 导入成功后由前端触发全量重载（load + 广播），快捷键等即时生效。
#[tauri::command]
pub fn config_import_from(
    path: String,
    paths: State<'_, AppPaths>,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取失败：{e}"))?;
    let config: AppConfig =
        serde_json::from_str(&content).map_err(|e| format!("配置格式不正确：{e}"))?;
    save_json(&paths.config_file, &config).map_err(|e| format!("保存失败：{e}"))?;
    *state.0.lock().unwrap() = config;
    Ok(())
}
