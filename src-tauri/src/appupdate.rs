//! 应用内更新（Rust 侧驱动下载）：下载统一走本模块而非前端插件 API——
//! 插件的 JS download() 把字节存在 Rust 侧资源里拿不出来，无法满足
//! "下载后让用户选择立即/稍后安装、安装包保留在磁盘"的需求。
//!
//! 流程（两条命令配合前端 updater.ts）：
//! 1. `updater_download`：updater.check() 比对 latest.json → update.download()
//!    （内部完成 minisign 签名验证——endpoint 是 http，这一步是防篡改生命线）
//!    → 字节写入系统"下载"目录 → emit 进度事件供前端进度条消费。
//! 2. `updater_install_saved`：运行已保存的安装包（插件 install：ShellExecuteW
//!    以 /P passive + /UPDATE 参数启动 NSIS，随后 exit(0)；passive 模式装完
//!    自动拉起新版应用）。用户也可不点、稍后直接双击下载目录里的安装包。

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use tauri_plugin_updater::UpdaterExt;

/// 下载进度事件（前端进度条）
#[derive(Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    /// 服务器未给 content-length 时为 0（前端按"已下载 xx MB"展示）
    total: u64,
}

/// `updater_download` 返回：新版本号 + 安装包保存路径
#[derive(Serialize)]
pub struct DownloadOutcome {
    pub version: String,
    pub path: String,
}

/// 构建更新器（endpoint/pubkey/installMode 均读 tauri.conf.json 的 updater 配置）
fn build_updater(
    app: &AppHandle,
) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("初始化更新器失败：{e}"))
}

/// 检查并下载新版安装包（含签名验证），保存到系统下载目录。
/// 返回版本号与保存路径；无新版返回 Err（前端按"已是最新"处理）。
#[tauri::command]
pub async fn updater_download(app: AppHandle) -> Result<DownloadOutcome, String> {
    let updater = build_updater(&app)?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("检查更新失败：{e}"))?
        .ok_or("当前已是最新版本")?;
    let version = update.version.clone();

    // 下载 + minisign 验签；进度推给前端
    let mut downloaded: u64 = 0;
    let app_for_progress = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = app_for_progress.emit(
                    "updater:download-progress",
                    DownloadProgress {
                        downloaded,
                        total: total.unwrap_or(0),
                    },
                );
            },
            || {},
        )
        .await
        .map_err(|e| format!("下载失败：{e}"))?;

    // 保存位置：优先系统"下载"目录（用户直觉位置），失败回退应用数据目录
    let dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir()));
    let path = dir.join(format!("小心工具箱-安装版-v{version}.exe"));
    std::fs::write(&path, &bytes).map_err(|e| format!("保存安装包失败：{e}"))?;
    crate::storage::diag_write(&format!(
        "[updater] v{version} 已下载并验签，保存至 {}",
        path.display()
    ));

    Ok(DownloadOutcome {
        version,
        path: path.to_string_lossy().to_string(),
    })
}

/// 安装已保存的安装包：插件 install 会以 passive 模式启动 NSIS 并退出应用，
/// 装完自动重启进新版，本函数正常情况下不会返回。
#[tauri::command]
pub async fn updater_install_saved(app: AppHandle, path: String) -> Result<(), String> {
    let updater = build_updater(&app)?;
    // install 是 Update 对象的方法（携带 installMode/重启等上下文），
    // 重新 check 一次仅为获取该对象（GET latest.json，毫秒级）。
    let update = updater
        .check()
        .await
        .map_err(|e| format!("检查更新失败：{e}"))?
        .ok_or("当前已是最新版本")?;
    let bytes =
        std::fs::read(&path).map_err(|e| format!("读取安装包失败：{e}"))?;
    crate::storage::diag_write("[updater] 启动 passive 安装器，应用退出");
    update
        .install(bytes)
        .map_err(|e| format!("启动安装器失败：{e}"))
}
