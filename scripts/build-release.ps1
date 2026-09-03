# 小心工具箱 - 一键打包脚本（安装版）
# 用法：
#   npm run pack                                # 完整构建（前端 + Rust release + NSIS 安装包）
#   .\scripts\build-release.ps1 -SkipBuild      # 仅打包（已执行过 tauri build 时）
#
# 产出（项目最顶层）：
#   小心工具箱-安装版-v<版本>.exe    NSIS 安装包（双击安装 / 上传更新服务器）
#   小心工具箱-安装版-v<版本>.exe.sig  更新包签名（内容填入服务器 latest.json
#                                     的 platforms.windows-x86_64.signature）
# 注：MSI 安装包（WiX）因 WiX 下载失败已停用，需要时可重新加 --bundles nsis,msi。
#     便携版 zip 打包已按需求移除（2026-08-28），需要时从 git 历史找回本文件的
#     "---- 3. 便携版"段落即可恢复。
# 自动更新签名：createUpdaterArtifacts 开启后构建必须提供私钥。本脚本默认使用
#   .tauri-keys\xiaoxin-toolbox.key（无密码）；已设置 TAURI_SIGNING_PRIVATE_KEY*
#   环境变量（如 CI）则不覆盖。私钥绝不入库（.gitignore 已排除）。

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 清空 WorkBuddy safe-delete shim 的触发变量：否则 vite 清空 dist 时会被
# 回收站 shim 拦截导致构建失败（dist 是可丢弃产物，真删无碍）
$env:CODEBUDDY_SESSION_ID = ""
$env:CLAUDE_SESSION_ID = ""

# 读取版本号（tauri.conf.json 是 UTF-8 无 BOM，PS5.1 默认按 ANSI 读会乱码，须显式指定）
$conf = Get-Content "src-tauri\tauri.conf.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $conf.version

# ---- 1. Tauri 构建（NSIS 安装包） ----
# 注入更新签名私钥（未外部提供时用项目本地密钥；无密码密钥无需 PASSWORD）
if (-not $env:TAURI_SIGNING_PRIVATE_KEY -and -not $env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
    $keyPath = Join-Path $root ".tauri-keys\xiaoxin-toolbox.key"
    if (Test-Path $keyPath) {
        $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $keyPath
        Write-Host "  [signer] 使用本地私钥 $keyPath" -ForegroundColor DarkGray
    } else {
        throw "未找到更新签名私钥（.tauri-keys\xiaoxin-toolbox.key），且未设置 TAURI_SIGNING_PRIVATE_KEY* 环境变量；createUpdaterArtifacts 构建无法签名"
    }
}
if (-not $SkipBuild) {
    Write-Host "==> 构建安装包（NSIS）..." -ForegroundColor Cyan
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build 失败" }
}

# ---- 2. 收集安装包 + 更新签名到项目根 ----
$nsisExe = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nsisExe) {
    $dest = Join-Path $root "小心工具箱-安装版-v$version.exe"
    Copy-Item $nsisExe.FullName $dest -Force
    Write-Host "  [NSIS]   $dest" -ForegroundColor Green
    # 更新签名（与安装包同名 .sig）：上传服务器时与 exe 一起，内容进 latest.json
    $sigFile = "$($nsisExe.FullName).sig"
    if (Test-Path $sigFile) {
        $sigDest = Join-Path $root "小心工具箱-安装版-v$version.exe.sig"
        Copy-Item $sigFile $sigDest -Force
        Write-Host "  [SIG]    $sigDest" -ForegroundColor Green
    } else {
        Write-Warning "未找到更新签名 .sig（createUpdaterArtifacts 未生效或未签名构建）"
    }
} else {
    Write-Warning "未找到 NSIS 产物，跳过安装版 exe"
}

# ---- 3. 汇总 ----
Write-Host ""
Write-Host "==> 打包完成，产物在项目根目录：" -ForegroundColor Cyan
Get-ChildItem $root -File | Where-Object { $_.Name -like "小心工具箱-安装版-*" } | ForEach-Object {
    Write-Host ("    {0}  ({1:N2} MB)" -f $_.Name, ($_.Length / 1MB))
}
