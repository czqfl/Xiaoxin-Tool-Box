//! 用户配置：结构定义 + 读写命令。所有默认值通过 Default 实现集中管理。
use crate::storage::{load_json, save_json, AppPaths};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

/// 配置变更广播事件（与前端 core/events.ts 的 EVT_CONFIG_CHANGED 同名）：
/// 快捷键保存等场景由 Rust 广播全量配置，前端各窗口只同步内存、不回写
pub const EVT_CONFIG_CHANGED: &str = "config://changed";

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
    /// 是否启用剪贴板功能（关闭：快捷键不注册、工具栏/托盘/设置入口隐藏）
    #[serde(default = "default_true")]
    pub enabled: bool,
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
            enabled: true,
            max_history: 200,
            watch_images: true,
            watch_files: true,
            close_after_paste: true,
            always_on_top: false,
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
    /// 是否启用文件夹功能（关闭：快捷键不注册、入口隐藏）
    #[serde(default = "default_true")]
    pub enabled: bool,
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
            enabled: true,
            show_visit_count: true,
            layout: FolderLayout::Grid,
            split: FolderSplit::Columns,
            page_size: 12,
            always_on_top: false,
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
    /// 呼出语速贴面板
    pub snippets: String,
    /// 开始截图
    pub screenshot: String,
    /// 显示 / 隐藏全部贴图
    pub pins: String,
    /// 关闭全部贴图（与贴图热键分离：贴图键专职贴出内容，关闭键收摊）
    pub pins_close: String,
    /// 屏幕取色（呼出十字取色模式，复用截图遮罩窗）
    pub picker: String,
    /// 屏幕录制 GIF
    pub recorder: String,
    /// 呼出全局命令面板
    pub palette: String,
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
            // 语速贴：Alt+K（K = 快捷/Quick，快捷短语一键粘贴）
            snippets: "Alt+K".into(),
            // 截图：Ctrl+Alt+A（QQ 截图习惯键位）
            screenshot: "Ctrl+Alt+A".into(),
            // 显示/隐藏全部贴图：Ctrl+Alt+P（Pin）
            pins: "Ctrl+Alt+P".into(),
            // 关闭全部贴图：Ctrl+Alt+K——与贴图热键分离（贴图键专职贴出内容）
            pins_close: "Ctrl+Alt+K".into(),
            // 屏幕取色：Alt+D（Dropper / 取色），纯 Alt 组合由键盘钩子主动吞键
            picker: "Alt+D".into(),
            // 屏幕录制：Ctrl+Alt+R（Record）
            recorder: "Ctrl+Alt+R".into(),
            // 全局命令面板：Alt+G（Global，纯 Alt 组合由键盘钩子主动吞键）
            palette: "Alt+G".into(),
        }
    }
}

/// 屏幕录制（GIF / MP4）配置。
/// 这些值即【录制面板的默认值】——面板里改动只影响当次录制，改这里才是持久默认。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RecorderConfig {
    /// 是否启用屏幕录制功能（关闭：快捷键不注册、托盘/工具栏/侧栏入口隐藏）
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 默认输出格式："mp4" = 视频 | "gif" = 动图
    pub fmt: String,
    /// 默认分辨率预设："raw" = 原始 | "1080" | "720" | "360"
    pub res: String,
    /// 采集帧率（5-60）
    pub fps: u32,
    /// 编码质量："high" | "normal" | "fast"
    pub quality: String,
    /// 【已废弃】单次录制时长上限（秒，0 = 不限）。保留字段仅为兼容旧配置，
    /// 录制不再自动掐断，结束与否由用户决定。
    pub max_duration_secs: u32,
    /// 录像保存目录；为空回退截图保存目录，再回退系统图片目录
    pub save_dir: Option<String>,
    /// 默认音源："off" = 不录音 | "mic" = 麦克风 | "system" = 系统声音 |
    /// "mix" = 麦克风 + 系统声音。仅 MP4 生效（GIF 容器不支持音频）。
    #[serde(default = "default_audio_source")]
    pub audio: String,
}

fn default_audio_source() -> String {
    "off".into()
}

impl Default for RecorderConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            fmt: "mp4".into(),
            res: "raw".into(),
            fps: 12,
            quality: "normal".into(),
            max_duration_secs: 0,
            save_dir: None,
            audio: "off".into(),
        }
    }
}

/// 端口工具面板配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PortConfig {
    /// 是否启用端口工具功能（关闭：快捷键不注册、入口隐藏）
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 端口工具面板是否置顶显示（置顶时常驻，失焦不自动隐藏）
    pub always_on_top: bool,
}

impl Default for PortConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            always_on_top: false,
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
    /// 是否启用快速文件功能（关闭：快捷键不注册、入口隐藏）
    #[serde(default = "default_true")]
    pub enabled: bool,
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
    /// 分组展示布局："vertical" 垂直列表 / "horizontal" 水平多列并排
    pub default_layout: String,
}

impl Default for FilesConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            location: None,
            file_types: vec![
                FileTypeDef { ext: "txt".into(), label: "文本".into(), color: "#8a94a6".into(), opener: None },
                FileTypeDef { ext: "md".into(), label: "Markdown".into(), color: "#4c8dff".into(), opener: None },
                FileTypeDef { ext: "json".into(), label: "JSON".into(), color: "#e0a23a".into(), opener: None },
                FileTypeDef { ext: "csv".into(), label: "CSV".into(), color: "#36b37e".into(), opener: None },
                FileTypeDef { ext: "log".into(), label: "日志".into(), color: "#b06fd6".into(), opener: None },
                FileTypeDef { ext: "yaml".into(), label: "YAML".into(), color: "#d96aa0".into(), opener: None },
            ],
            always_on_top: false,
            default_group: "type".into(),
            default_sort: "created".into(),
            default_layout: "vertical".into(),
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
    /// 工具栏尺寸档位："small"(28px) / "medium"(34px) / "large"(40px)
    #[serde(default)]
    pub size: String,
    /// 工具栏停靠位置（物理像素）；None = 尚未记忆，启动用右下角默认位。
    /// 用户拖动工具栏后落定即保存，重启恢复到上次位置。
    #[serde(default)]
    pub position: Option<(i32, i32)>,
}

/// 工具栏排列方向默认值：竖直（竖条，右下角贴边常驻更省横向空间）
pub fn default_toolbar_orientation() -> String {
    "vertical".into()
}

/// 任务栏透明配置：修改 Windows 任务栏窗口背景（透明度 + 亚克力）。
/// 启用状态由功能开关页统一控制（feature_enabled("taskbar")）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TaskbarConfig {
    /// 是否启用
    #[serde(default)]
    pub enabled: bool,
    /// 任务栏底色不透明度 0~100：0=完全透明只留图标，100=趋近原版底色
    #[serde(default = "default_taskbar_opacity")]
    pub opacity: u32,
    /// 亚克力实时毛玻璃（与不透明度叠加；关=纯透明/纯色 tint）
    #[serde(default = "default_true")]
    pub acrylic: bool,
}

fn default_taskbar_opacity() -> u32 {
    60
}

impl Default for TaskbarConfig {
    fn default() -> Self {
        Self { enabled: false, opacity: default_taskbar_opacity(), acrylic: true }
    }
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
            size: "small".into(),
            position: None,
        }
    }
}

/// 语速贴面板配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SnippetsConfig {
    /// 是否启用语速贴功能（关闭：快捷键不注册、入口隐藏）
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 语速贴面板是否置顶显示（置顶时常驻，失焦不自动隐藏）
    pub always_on_top: bool,
}

impl Default for SnippetsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            always_on_top: false,
        }
    }
}

/// 截图功能配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ShotConfig {
    /// 是否启用截图功能（关闭时快捷键/入口不生效）
    pub enabled: bool,
    /// 截图是否包含鼠标指针
    pub capture_cursor: bool,
    /// 智能识别窗口/控件边缘（鼠标悬停自动吸附选框）
    pub smart_detect: bool,
    /// 放大镜（像素级取色）
    pub magnifier: bool,
    /// 放大镜形状：false=方形（默认）/ true=圆形（Tab 切换，持久化）
    pub magnifier_round: bool,
    /// 记住上次截取区域（下次呼出预填同样区域）
    pub remember_region: bool,
    /// 选区完成后默认动作：复制到剪贴板（回车触发）
    pub auto_copy: bool,
    /// 保存格式："png" | "jpg"
    pub save_format: String,
    /// JPG 保存质量（1-100）
    pub jpg_quality: u8,
    /// 默认保存目录；为空时用系统的图片目录
    pub save_dir: Option<String>,
    /// 截图历史（呼出时冻结的全屏画面）是否启用：< > 翻页重截、H 打开列表
    pub history_enabled: bool,
    /// 历史最多保留多少次截屏（按「一次呼出」计，多屏各存一张）
    pub history_max_count: u32,
    /// 历史最多保留多少天（超期自动清理）
    pub history_max_days: u32,
    /// 文字识别模型档位（rapidocr-core 的模型集 id，见 ocr.rs::MODEL_CHOICES）
    pub ocr_model: String,
}

impl Default for ShotConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            capture_cursor: false,
            smart_detect: true,
            magnifier: true,
            magnifier_round: false,
            remember_region: true,
            auto_copy: true,
            save_format: "png".into(),
            jpg_quality: 95,
            save_dir: None,
            history_enabled: true,
            history_max_count: 20,
            history_max_days: 7,
            ocr_model: crate::ocr::DEFAULT_MODEL.into(),
        }
    }
}

/// 贴图配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PinConfig {
    /// 新贴图默认不透明度（百分比 1-100）
    pub opacity: u8,
    /// 贴图边框阴影
    pub border_shadow: bool,
    /// 开机恢复上次的贴图布局
    pub restore_on_start: bool,
}

impl Default for PinConfig {
    fn default() -> Self {
        Self {
            opacity: 100,
            border_shadow: true,
            restore_on_start: true,
        }
    }
}

/// 标注工具默认参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AnnotateConfig {
    /// 默认画笔粗细（px）
    pub stroke_width: u32,
    /// 文字工具默认字号（px）
    pub font_size: u32,
    /// 马赛克块大小（px）
    pub mosaic_block: u32,
    /// 标注色板（十六进制颜色列表）
    pub colors: Vec<String>,
}

impl Default for AnnotateConfig {
    fn default() -> Self {
        Self {
            stroke_width: 3,
            font_size: 18,
            mosaic_block: 12,
            colors: vec![
                "#e5484d".into(),
                "#ff8d1a".into(),
                "#ffd60a".into(),
                "#36b37e".into(),
                "#4c8dff".into(),
                "#b06fd6".into(),
                "#ffffff".into(),
                "#000000".into(),
            ],
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
    /// 橙色主题（暖奶油背景 + 琥珀橙品牌色，浅色系）
    Orange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CredentialConfig {
    /// 是否启用账号密码功能（关闭：快捷键不注册、入口隐藏）
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 账号密码面板是否置顶显示
    pub always_on_top: bool,
    /// 是否默认显示全部密码（按配置持久化，下次打开遵循）
    pub show_passwords: bool,
}

impl Default for CredentialConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            always_on_top: false,
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
    /// 是否启用划词翻译功能（关闭：快捷键不注册、入口隐藏）
    #[serde(default = "default_true")]
    pub enabled: bool,
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
            enabled: true,
            provider: "youdao".into(),
            youdao_key: String::new(),
            youdao_secret: String::new(),
            baidu_appid: String::new(),
            baidu_secret: String::new(),
            target_lang: "zh".into(),
            // 默认不置顶常驻：划词翻译后失焦自动隐藏（与其他面板一致）
            always_on_top: false,
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
    /// 语速贴面板配置
    pub snippets: SnippetsConfig,
    /// 截图功能配置
    #[serde(default)]
    pub shot: ShotConfig,
/// 屏幕录制配置
    #[serde(default)]
    pub recorder: RecorderConfig,
    /// 贴图配置
    #[serde(default)]
    pub pin: PinConfig,
    /// 标注工具默认参数
    #[serde(default)]
    pub annotate: AnnotateConfig,
    /// 任务栏透明配置
    #[serde(default)]
    pub taskbar: TaskbarConfig,
    /// 各面板上次关闭时的窗口位置（标签 -> 屏幕坐标），下次呼出恢复（记忆位置）
    pub panel_positions: std::collections::HashMap<String, (i32, i32)>,
    /// 各面板上次关闭时的窗口尺寸（标签 -> 物理像素宽高），下次呼出恢复（记忆大小）
    #[serde(default)]
    pub panel_sizes: std::collections::HashMap<String, (u32, u32)>,
}

impl AppConfig {
    /// 功能开关统一判定：快捷键注册、托盘/工具栏/设置入口、面板呼出
    /// 全部以此为准。key 与快捷键 target、工具栏工具键同名词。
    pub fn feature_enabled(&self, key: &str) -> bool {
        match key {
            "clipboard" => self.clipboard.enabled,
            "folder" => self.folder.enabled,
            "credentials" => self.credentials.enabled,
            "translation" => self.translator.enabled,
            "port" => self.port.enabled,
            "files" => self.files.enabled,
            "snippets" => self.snippets.enabled,
            "screenshot" => self.shot.enabled,
            "recorder" => self.recorder.enabled,
            "toolbar" => self.toolbar.enabled,
            "taskbar" => self.taskbar.enabled,
            _ => true,
        }
    }
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
    mut config: AppConfig,
    paths: State<'_, AppPaths>,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    // 快捷键的唯一写入口是 shortcut_apply（注册成功才落盘）。任何窗口持陈旧
    // 快照调用整份 config_save 时，一律以运行时当前快捷键覆盖回去——根除
    // 「旧配置把刚改好的快捷键悄悄改回、重启后旧键复活」的问题。
    config.shortcuts = state.0.lock().unwrap().shortcuts.clone();
    let old_toolbar_enabled = state.0.lock().unwrap().toolbar.enabled;
    let old_taskbar = state.0.lock().unwrap().taskbar.clone();
    save_json(&paths.config_file, &config).map_err(|e| format!("保存配置失败：{e}"))?;
    *state.0.lock().unwrap() = config.clone();
    // OCR 档位切换即时生效（set_model 内部比对，未变化时不重建引擎）
    crate::ocr::set_model(&config.shot.ocr_model);
    // 工具栏启用开关变化时立即显隐（功能开关页切工具栏开关即时反馈；
    // 原设置页开关的 setToolbarVisible 行为迁移至此）
    if config.toolbar.enabled != old_toolbar_enabled {
        let _ = crate::panel::toolbar_set_visible(app.clone(), config.toolbar.enabled);
    }
    // 任务栏透明配置变化时立即应用（开/关/滑不透明度/切亚克力，滑杆拖动即时反馈；
    // 未变化时不调用，避免无谓的 SWCA 系统调用）
    #[cfg(windows)]
    if (config.taskbar.enabled, config.taskbar.opacity, config.taskbar.acrylic)
        != (old_taskbar.enabled, old_taskbar.opacity, old_taskbar.acrylic)
    {
        crate::taskbar::apply(&config.taskbar);
    }
    // 全量重注册快捷键：功能启用开关变化（停用的功能热键即时注销）、
    // 快捷键以外的配置调整都借此保证运行时与配置严格一致（推倒重来语义）
    crate::shortcut::resync_all(&app, &config);
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
/// 导入后立即【推倒重来】重注册全部快捷键——先全量注销再按新配置注册，
/// 运行时与配置严格一致，无需重启（杜绝"旧键残留/新键不生效"）。
#[tauri::command]
pub fn config_import_from(
    app: tauri::AppHandle,
    path: String,
    paths: State<'_, AppPaths>,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取失败：{e}"))?;
    let config: AppConfig =
        serde_json::from_str(&content).map_err(|e| format!("配置格式不正确：{e}"))?;
    save_json(&paths.config_file, &config).map_err(|e| format!("保存失败：{e}"))?;
    *state.0.lock().unwrap() = config.clone();
    crate::shortcut::resync_all(&app, &config);
    Ok(())
}
