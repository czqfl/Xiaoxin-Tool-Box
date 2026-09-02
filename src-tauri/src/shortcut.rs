//! 全局快捷键：注册/冲突检测/运行时切换。
use crate::config::{AppConfig, ConfigState, PasteMode};
use crate::panel::{
    self, CLIPBOARD_PANEL, CREDENTIAL_PANEL, FILES_PANEL, FOLDER_PANEL, PORT_PANEL,
    SNIPPETS_PANEL,
};
use crate::storage::{save_json, AppPaths};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut};

/// 启动时热键注册失败事件（payload: "clipboard" | "folder"）
pub const EVT_REGISTER_FAILED: &str = "shortcut://register-failed";
/// 捕获模式下钩子拦到的 Win 组合键（payload: "Super+X" 组合串）
pub const EVT_WIN_CAPTURED: &str = "shortcut://win-captured";

/// 运行时已注册的热键绑定（面板呼出 × 2）
#[derive(Default)]
pub struct ShortcutBindings(pub Mutex<ShortcutBindingsInner>);

#[derive(Default)]
pub struct ShortcutBindingsInner {
    pub clipboard: Option<Shortcut>,
    pub folder: Option<Shortcut>,
    pub credentials: Option<Shortcut>,
    /// 划词翻译（非面板，触发翻译动作）
    pub translation: Option<Shortcut>,
    /// 呼出端口工具面板
    pub port: Option<Shortcut>,
    /// 呼出快速文件面板
    pub files: Option<Shortcut>,
    /// 呼出语速贴面板
    pub snippets: Option<Shortcut>,
    /// 截图
    pub screenshot: Option<Shortcut>,
    /// 显示/隐藏全部贴图
    pub pins: Option<Shortcut>,
    /// 关闭全部贴图（独立热键）
    pub pins_close: Option<Shortcut>,
    /// 屏幕取色（呼出十字取色模式，复用截图遮罩窗）
    pub picker: Option<Shortcut>,
    /// 屏幕录制 GIF（呼出区域选择）
    pub recorder: Option<Shortcut>,
    /// 呼出全局命令面板
    pub palette: Option<Shortcut>,
}

pub fn parse(shortcut: &str) -> Result<Shortcut, String> {
    shortcut.parse::<Shortcut>().map_err(|_| {
        format!("快捷键格式不正确：{shortcut}（示例：Ctrl+Alt+C、Alt+F5）")
    })
}

/// 全部快捷键目标（顺序 = 注册顺序 = 绑定表字段顺序）
const TARGETS: [&str; 13] = [
    "clipboard",
    "folder",
    "credentials",
    "translation",
    "port",
    "files",
    "snippets",
    "screenshot",
    "pins",
    "pins_close",
    "picker",
    "recorder",
    "palette",
];

fn is_valid_target(t: &str) -> bool {
    TARGETS.contains(&t)
}

/// 读配置中某 target 的快捷键字符串
fn config_shortcut(config: &AppConfig, target: &str) -> String {
    match target {
        "clipboard" => config.shortcuts.clipboard.clone(),
        "folder" => config.shortcuts.folder.clone(),
        "credentials" => config.shortcuts.credentials.clone(),
        "translation" => config.shortcuts.translation.clone(),
        "port" => config.shortcuts.port.clone(),
        "files" => config.shortcuts.files.clone(),
        "snippets" => config.shortcuts.snippets.clone(),
        "screenshot" => config.shortcuts.screenshot.clone(),
        "pins" => config.shortcuts.pins.clone(),
        "pins_close" => config.shortcuts.pins_close.clone(),
        "recorder" => config.shortcuts.recorder.clone(),
        "palette" => config.shortcuts.palette.clone(),
        _ => config.shortcuts.picker.clone(),
    }
}

/// 写配置中某 target 的快捷键字符串
fn set_config_shortcut(config: &mut AppConfig, target: &str, value: String) {
    match target {
        "clipboard" => config.shortcuts.clipboard = value,
        "folder" => config.shortcuts.folder = value,
        "credentials" => config.shortcuts.credentials = value,
        "translation" => config.shortcuts.translation = value,
        "port" => config.shortcuts.port = value,
        "files" => config.shortcuts.files = value,
        "snippets" => config.shortcuts.snippets = value,
        "screenshot" => config.shortcuts.screenshot = value,
        "pins" => config.shortcuts.pins = value,
        "pins_close" => config.shortcuts.pins_close = value,
        "recorder" => config.shortcuts.recorder = value,
        "palette" => config.shortcuts.palette = value,
        _ => config.shortcuts.picker = value,
    }
}

/// 写运行时绑定表字段
fn set_binding(inner: &mut ShortcutBindingsInner, target: &str, v: Option<Shortcut>) {
    match target {
        "clipboard" => inner.clipboard = v,
        "folder" => inner.folder = v,
        "credentials" => inner.credentials = v,
        "translation" => inner.translation = v,
        "port" => inner.port = v,
        "files" => inner.files = v,
        "snippets" => inner.snippets = v,
        "screenshot" => inner.screenshot = v,
        "pins" => inner.pins = v,
        "pins_close" => inner.pins_close = v,
        "recorder" => inner.recorder = v,
        "palette" => inner.palette = v,
        _ => inner.picker = v,
    }
}

/// Win 组合键被系统 shell 保留，RegisterHotKey 无法注册，
/// 改由低级键盘钩子（keyhook）在事件到达系统前接管。
/// 纯 Alt 组合【双保险】：
///   1. 交给钩子主动吞键（防"主键泄漏进编辑器替换选中文字"）并触发；
///   2. 同时注册 RegisterHotKey 作为兜底——钩子匹配一旦因任何原因
///      （ALT_HELD 未置位等）失败，由系统热键保证一定能触发。
///   两者互不冲突：钩子吞键后按键不会到达系统，RegisterHotKey 不触发；
///   钩子放行时按键到达系统，RegisterHotKey 正常触发。
/// 是否需要低级键盘钩子接管：
///   - Win 组合：RegisterHotKey 无法注册（被 shell 保留）
///   - 纯 Alt 组合：钩子吞键防主键泄漏 + RegisterHotKey 兜底
///   - 裸功能键（F1~F12 无修饰键）：RegisterHotKey 在 Electron/Chromium 系
///     应用里被吃掉（消息循环自消费 F 键、不交 DefWindowProc，WM_HOTKEY 不生成），
///     只有钩子能在事件到达应用前接管
#[cfg(windows)]
fn is_hook_combo(s: &Shortcut) -> bool {
    s.mods == Modifiers::SUPER
        || s.mods == Modifiers::ALT
        || (s.mods.is_empty() && crate::keyhook::is_function_key(s.key))
}

#[cfg(not(windows))]
fn is_hook_combo(_s: &Shortcut) -> bool {
    false
}

/// 钩子接管的热键主键虚拟键码（仅支持字母/数字/F 键）
#[cfg(windows)]
fn hook_vk(s: &Shortcut) -> Result<u16, String> {
    crate::keyhook::code_to_vk(s.key)
        .ok_or_else(|| "钩子接管的热键仅支持字母、数字与 F 键".to_string())
}

/// 注册单个面板热键：Win 组合交给低级钩子接管；纯 Alt 组合【钩子 + RegisterHotKey
/// 双保险】；裸功能键【钩子 + RegisterHotKey 双保险】（钩子免疫 Electron/Chromium
/// 吞键，RegisterHotKey 兜底钩子异常）；其余（Ctrl、Ctrl+Alt 等）走全局热键插件
fn register_combo<R: Runtime>(
    app: &AppHandle<R>,
    target: &str,
    s: Shortcut,
) -> Result<(), String> {
    if is_hook_combo(&s) {
        #[cfg(windows)]
        {
            let mode = if s.mods == Modifiers::SUPER {
                crate::keyhook::HookMode::Win
            } else if s.mods == Modifiers::ALT {
                crate::keyhook::HookMode::Alt
            } else {
                crate::keyhook::HookMode::Bare
            };
            crate::keyhook::set_panel_hotkey(target, mode, hook_vk(&s)?);
            // Alt 组合 / 裸功能键兜底注册 RegisterHotKey：保证钩子异常时也能触发
            if mode == crate::keyhook::HookMode::Alt || mode == crate::keyhook::HookMode::Bare {
                app.global_shortcut().register(s).map_err(|_| {
                    "该快捷键已被系统或其他应用占用，请更换其他组合".to_string()
                })?;
            }
            return Ok(());
        }
        #[cfg(not(windows))]
        return Err("当前平台不支持 Win/Alt 组合键".into());
    }
    app.global_shortcut()
        .register(s)
        .map_err(|_| "该快捷键已被系统或其他应用占用，请更换其他组合".to_string())
}

/// 冲突检测：尝试注册后立即回滚。若与当前应用已绑定一致则直接视为可用
#[tauri::command]
pub fn shortcut_test(
    app: AppHandle,
    shortcut: String,
    bindings: State<'_, ShortcutBindings>,
) -> Result<(), String> {
    let parsed = parse(&shortcut)?;
    {
        let inner = bindings.0.lock().unwrap();
        if inner.clipboard == Some(parsed)
            || inner.folder == Some(parsed)
            || inner.credentials == Some(parsed)
            || inner.translation == Some(parsed)
            || inner.port == Some(parsed)
            || inner.files == Some(parsed)
            || inner.snippets == Some(parsed)
            || inner.screenshot == Some(parsed)
            || inner.pins == Some(parsed)
            || inner.pins_close == Some(parsed)
            || inner.picker == Some(parsed)
            || inner.recorder == Some(parsed)
            || inner.palette == Some(parsed)
        {
            return Ok(());
        }
    }
    #[cfg(windows)]
    if is_hook_combo(&parsed) {
        let needs_register = parsed.mods == Modifiers::ALT
            || (parsed.mods.is_empty() && crate::keyhook::is_function_key(parsed.key));
        if needs_register {
            // Alt 组合 / 裸功能键双保险中的 RegisterHotKey 需要真注册：试注册检测
            // 占用（钩子虽总能拦截，但若系统里该组合已被占用，兜底注册会失败）
            let gs = app.global_shortcut();
            gs.register(parsed).map_err(|_| {
                "该快捷键已被系统或其他应用占用，请更换其他组合".to_string()
            })?;
            if let Err(e) = gs.unregister(parsed) {
                crate::storage::diag_write(&format!(
                    "[shortcut] test unregister {parsed} FAILED: {e}"
                ));
            }
            return Ok(());
        }
        // Win 组合：钩子总是能拦截（Win+L 等系统直取组合除外），无需试注册
        return hook_vk(&parsed).map(|_| ());
    }
    let gs = app.global_shortcut();
    gs.register(parsed)
        .map_err(|_| "该快捷键已被系统或其他应用占用，请更换其他组合".to_string())?;
    if let Err(e) = gs.unregister(parsed) {
        // 试注册后的注销若失败会留下幽灵热键，必须留痕
        crate::storage::diag_write(&format!("[shortcut] test unregister {parsed} FAILED: {e}"));
    }
    Ok(())
}

/// 开始录入捕获：钩子接管 Win 组合，避免系统功能（剪贴板历史等）抢先触发
#[tauri::command]
pub fn shortcut_capture_begin() {
    #[cfg(windows)]
    crate::keyhook::set_capture_mode(true);
}

/// 结束录入捕获
#[tauri::command]
pub fn shortcut_capture_end() {
    #[cfg(windows)]
    crate::keyhook::set_capture_mode(false);
}

/// 应用新快捷键：【推倒重来】全量注销所有运行时热键，再按更新后的配置
/// 全部重建——运行时与配置严格一致，任何一步失败自动回滚为原配置重建，
/// 从根上杜绝「新旧键混存」（旧键还在触发=卡死、新键不生效的典型症状）。
/// 持久化只发生在这里（单一写入口），随后以 config://changed 广播全量配置。
/// 返回更新后的完整配置供前端直接同步。
#[tauri::command]
pub fn shortcut_apply(
    app: AppHandle,
    target: String,
    shortcut: String,
    paths: State<'_, AppPaths>,
    config_state: State<'_, ConfigState>,
) -> Result<AppConfig, String> {
    if !is_valid_target(&target) {
        return Err("未知的快捷键目标".into());
    }
    parse(&shortcut)?; // 提前校验格式，避免进入重建流程才发现

    let current = config_state.0.lock().unwrap().clone();
    if config_shortcut(&current, &target) == shortcut {
        // 无变化：直接返回当前配置（不重复注册/落盘）
        return Ok(current);
    }

    let mut next = current.clone();
    set_config_shortcut(&mut next, &target, shortcut.clone());

    // 全清 → 按新配置重建
    if let Err(e) = resync_all_result(&app, &next) {
        // 回滚：全清 → 按原配置重建，保证运行时与磁盘一致、绝不混存
        crate::storage::diag_write(&format!(
            "[shortcut] apply {target}={shortcut} FAILED: {e} → rollback to previous"
        ));
        let _ = resync_all_result(&app, &current);
        return Err(e);
    }

    // 持久化 + 运行时状态 + 广播（唯一写点）
    let _ = save_json(&paths.config_file, &next);
    *config_state.0.lock().unwrap() = next.clone();
    let _ = app.emit(crate::config::EVT_CONFIG_CHANGED, &next);
    crate::storage::diag_write(&format!("[shortcut] applied {target} = {shortcut}（全量重建）"));
    Ok(next)
}

/// 运行时【真实生效】的快捷键绑定（区别于配置文件里声称的值）。
/// 设置页据此展示实际注册状态——配置与运行时一旦脱节立刻可见，
/// 这正是排查"改了快捷键却不生效/旧的还在"的决定性依据。
#[tauri::command]
pub fn shortcut_runtime_bindings(bindings: State<'_, ShortcutBindings>) -> Vec<String> {
    let inner = bindings.0.lock().unwrap();
    let mut out: Vec<String> = Vec::new();
    let mut push = |name: &str, s: &Option<Shortcut>| {
        if let Some(s) = s {
            out.push(format!("{name}={s}"));
        }
    };
    push("clipboard", &inner.clipboard);
    push("folder", &inner.folder);
    push("credentials", &inner.credentials);
    push("translation", &inner.translation);
    push("port", &inner.port);
    push("files", &inner.files);
    push("snippets", &inner.snippets);
    push("screenshot", &inner.screenshot);
    push("pins", &inner.pins);
    push("pins_close", &inner.pins_close);
    push("picker", &inner.picker);
    push("recorder", &inner.recorder);
    push("palette", &inner.palette);
    out
}

/// 启动时按配置注册全局热键（先全清再按配置重建，保证与磁盘一致）；
/// 失败则通知前端并打开设置页引导修改
pub fn register_initial<R: Runtime>(app: &AppHandle<R>, config: &AppConfig) {
    if let Err(e) = resync_all_result(app, config) {
        crate::storage::diag_write(&format!("[shortcut] initial FAILED: {e}"));
        notify_failed(app, "initial");
    }
    sync_seq_shortcut(app, config.clipboard.paste_mode);
    // 启动即记录配置声称的快捷键全貌：与 diag 里 registered/FAILED 行对照，
    // 任何"配置与运行时脱节"（改了不生效、旧的还在）都能一眼定位
    crate::storage::diag_write(&format!(
        "[shortcut] initial from config: shot={} pins={} picker={} cb={} fd={} cr={} tr={} pt={} fl={} sn={}",
        config.shortcuts.screenshot, config.shortcuts.pins, config.shortcuts.picker,
        config.shortcuts.clipboard, config.shortcuts.folder,
        config.shortcuts.credentials, config.shortcuts.translation,
        config.shortcuts.port, config.shortcuts.files, config.shortcuts.snippets,
    ));
}

/// 按粘贴模式同步全局 Ctrl+V 顺序粘贴：顺序模式由低级钩子拦截，普通模式放行
pub fn sync_seq_shortcut<R: Runtime>(app: &AppHandle<R>, mode: PasteMode) {
    let _ = app;
    #[cfg(windows)]
    crate::keyhook::set_seq_paste_enabled(mode != PasteMode::Normal);
}

/// 全量注销所有运行时热键：插件侧 unregister_all + 钩子槽位清零 + 绑定表清空。
/// 用于「推倒重来」场景——先删干净再注册，杜绝新旧残留并存
/// （旧键还在触发、新键不生效正是残留并存的典型症状）。
pub fn unregister_all_runtime<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.global_shortcut().unregister_all();
    #[cfg(windows)]
    for target in TARGETS {
        crate::keyhook::set_panel_hotkey(target, crate::keyhook::HookMode::Win, 0);
        crate::keyhook::set_panel_hotkey(target, crate::keyhook::HookMode::Alt, 0);
        crate::keyhook::set_panel_hotkey(target, crate::keyhook::HookMode::Bare, 0);
    }
    if let Some(b) = app.try_state::<ShortcutBindings>() {
        *b.0.lock().unwrap() = ShortcutBindingsInner::default();
    }
}

/// 快捷键目标 → 所属功能开关 key（截图/贴图/取色同属截图功能）。
/// 功能停用时其快捷键一律不注册（resync 跳过），入口同步隐藏。
fn feature_of_target(target: &str) -> &str {
    match target {
        "screenshot" | "pins" | "pins_close" | "picker" => "screenshot",
        t => t,
    }
}

/// 全量重建：注销全部 → 按给定配置逐个注册。任一 target 失败即返回错误
/// （此时运行时处于"已清空+部分重建"状态，调用方必须回滚/重试）。
/// 功能停用的 target 直接跳过注册（绑定表保持 None，热键不生效）。
pub fn resync_all_result<R: Runtime>(
    app: &AppHandle<R>,
    config: &AppConfig,
) -> Result<(), String> {
    unregister_all_runtime(app);
    crate::storage::diag_write("[shortcut] resync: all cleared, re-registering");
    for target in TARGETS {
        if !config.feature_enabled(feature_of_target(target)) {
            crate::storage::diag_write(&format!(
                "[shortcut] skip {target}: feature '{}' disabled",
                feature_of_target(target)
            ));
            continue;
        }
        let s = config_shortcut(config, target);
        register_one_result(app, target, &s)?;
    }
    // 【恢复便签全局快捷键】unregister_all 会连便签注册的 F4 等一起注销，
    // 而便签热键注册在独立的 sticky_settings.json（不在 config.shortcuts）——
    // 不补注册的话，用户在工具箱保存任何一次配置后便签快捷键就全部失效
    crate::sticky::register_all_shortcuts(app);
    Ok(())
}

/// 推倒重来：全量注销后按给定配置重新注册全部快捷键（失败仅留痕，不中断）。
/// 导入配置/恢复备份后调用，保证运行时与配置严格一致（无需重启）。
pub fn resync_all<R: Runtime>(app: &AppHandle<R>, config: &AppConfig) {
    if let Err(e) = resync_all_result(app, config) {
        crate::storage::diag_write(&format!("[shortcut] resync partial failure: {e}"));
    }
}

/// 手动触发全量重注册（设置页排查用）：以运行时配置为准推倒重来，
/// 返回重注册后的完整配置。
#[tauri::command]
pub fn shortcut_resync(
    app: AppHandle,
    config_state: State<'_, ConfigState>,
) -> Result<AppConfig, String> {
    let config = config_state.0.lock().unwrap().clone();
    resync_all(&app, &config);
    Ok(config)
}


/// 注册单个 target 并写入绑定表；失败返回具体错误（供 apply 回滚 / 启动留痕）
fn register_one_result<R: Runtime>(
    app: &AppHandle<R>,
    target: &str,
    shortcut_str: &str,
) -> Result<(), String> {
    let parsed = parse(shortcut_str)
        .map_err(|e| format!("{target} 快捷键格式错误：{e}"))?;
    register_combo(app, target, parsed)
        .map_err(|e| format!("{target} 注册失败：{e}"))?;
    if let Some(b) = app.try_state::<ShortcutBindings>() {
        let mut inner = b.0.lock().unwrap();
        set_binding(&mut inner, target, Some(parsed));
    }
    crate::storage::diag_write(&format!("[shortcut] registered {target} = {shortcut_str}"));
    Ok(())
}

fn notify_failed<R: Runtime>(app: &AppHandle<R>, target: &str) {
    let _ = app.emit(EVT_REGISTER_FAILED, target);
    crate::tray::show_settings_window(app);
}

/// 根据热键解析对应面板标签
pub fn panel_label_for(
    bindings: &ShortcutBindingsInner,
    shortcut: &Shortcut,
) -> Option<&'static str> {
    if bindings.clipboard == Some(*shortcut) {
        Some(CLIPBOARD_PANEL)
    } else if bindings.folder == Some(*shortcut) {
        Some(FOLDER_PANEL)
    } else if bindings.credentials == Some(*shortcut) {
        Some(CREDENTIAL_PANEL)
    } else if bindings.port == Some(*shortcut) {
        Some(PORT_PANEL)
    } else if bindings.files == Some(*shortcut) {
        Some(FILES_PANEL)
    } else if bindings.snippets == Some(*shortcut) {
        Some(SNIPPETS_PANEL)
    } else if bindings.palette == Some(*shortcut) {
        Some(crate::panel::PALETTE_PANEL)
    } else {
        None
    }
}

/// 供 lib.rs 中全局热键 handler 调用（仅插件注册的非 Win 组合会到这里）
pub fn handle_shortcut_pressed<R: Runtime>(app: &AppHandle<R>, shortcut: &Shortcut) {
    // 记录具体组合串：区分"哪个键触发了动作"，改键后旧键残留一眼可见
    crate::storage::diag_write(&format!("[shortcut] pressed {}", shortcut.into_string()));
    let Some(bindings) = app.try_state::<ShortcutBindings>() else {
        return;
    };
    // 翻译快捷键：触发划词翻译动作，不切换面板
    let is_translate = {
        let inner = bindings.0.lock().unwrap();
        inner.translation == Some(*shortcut)
    };
    if is_translate {
        crate::translate::trigger_selection_translate(app);
        return;
    }
    // 截图快捷键
    let is_screenshot = {
        let inner = bindings.0.lock().unwrap();
        inner.screenshot == Some(*shortcut)
    };
    if is_screenshot {
        crate::storage::diag_write("[shortcut] screenshot triggered");
        let _ = crate::screenshot::begin_impl(app.clone(), false);
        return;
    }
    // 屏幕取色：复用截图遮罩窗，但进入纯取色模式（无遮罩/选区/工具条）
    let is_picker = {
        let inner = bindings.0.lock().unwrap();
        inner.picker == Some(*shortcut)
    };
    if is_picker {
        crate::storage::diag_write("[shortcut] picker triggered");
        let _ = crate::screenshot::begin_impl(app.clone(), true);
        return;
    }
    // 屏幕录制 GIF
    let is_recorder = {
        let inner = bindings.0.lock().unwrap();
        inner.recorder == Some(*shortcut)
    };
    if is_recorder {
        crate::storage::diag_write("[shortcut] recorder triggered");
        crate::recorder::begin_select(app);
        return;
    }
    // 贴图显示/隐藏
    let is_pins = {
        let inner = bindings.0.lock().unwrap();
        inner.pins == Some(*shortcut)
    };
    if is_pins {
        // 截图会话进行中：全局贴图热键语义变为「把当前选区贴到桌面」。
        // 热键已被 RegisterHotKey 吞掉（遮罩 webview 收不到按键），必须以事件
        // 转发给遮罩页执行；直接 return 会让用户配置的贴图键在截图里失灵
        if crate::screenshot::shooting() {
            let _ = app.emit(crate::screenshot::EVT_PIN_HOTKEY, ());
            return;
        }
        // toggle: 有可见贴图 → 全隐藏；否则全显示。
        // 整个动作移出主线程（见 pin::toggle_all 注释）——热键回调里直接做
        // 窗口操作一旦卡住会冻结全部窗口
        crate::storage::diag_write("[shortcut] pins toggle triggered");
        crate::pin::toggle_all(app);
        return;
    }
    // 关闭全部贴图（独立热键）
    let is_pins_close = {
        let inner = bindings.0.lock().unwrap();
        inner.pins_close == Some(*shortcut)
    };
    if is_pins_close {
        crate::storage::diag_write("[shortcut] pins close-all triggered");
        let _ = crate::pin::hide_all_impl(app);
        return;
    }
    let label = {
        let inner = bindings.0.lock().unwrap();
        panel_label_for(&inner, shortcut)
    };
    if let Some(label) = label {
        panel::toggle_panel(app, label);
    }
}
