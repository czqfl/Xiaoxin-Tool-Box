//! 启动门禁：前端就绪前禁止所有功能入口。
//!
//! 为什么需要：遮罩窗是"预创建、前端异步加载"的全屏透明 webview。启动早期
//! 触发截图时，前端尚未加载（无法调 shot_ready），但"原生即时亮窗"宽限逻辑
//! （160ms 不等前端）会把空页面亮出——全屏透明窗口吃掉全部输入，页面 JS 又
//! 没在跑、Esc 无效，用户点不到任何东西只能干等看门狗。故所有功能入口在
//! 工具栏前端挂载完成（app_frontend_ready 被调用）前一律忽略。

/// 前端就绪标志：工具栏前端挂载完成时置位
pub static APP_READY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// 功能门禁检查：未就绪时记一条诊断并返回 false（调用方直接忽略本次触发）
pub fn features_ready() -> bool {
    let ok = APP_READY.load(std::sync::atomic::Ordering::SeqCst);
    if !ok {
        crate::storage::diag_write("[gate] feature triggered before frontend ready, ignored");
    }
    ok
}

/// 工具栏前端挂载完成时调用：打开功能门禁。幂等：HMR 重挂载重复调用无害。
#[tauri::command]
pub fn app_frontend_ready() {
    if !APP_READY.swap(true, std::sync::atomic::Ordering::SeqCst) {
        crate::storage::diag_write("[boot] frontend ready, features enabled");
    }
}
