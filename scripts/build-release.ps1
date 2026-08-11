# 小心工具箱 - 一键打包脚本（安装版 x2 + 便携版）
# 用法：
#   .\scripts\build-release.ps1             # 完整构建（前端 + Rust release + 两种安装包 + 便携版）
#   .\scripts\build-release.ps1 -SkipBuild  # 仅打包（已执行过 tauri build 时）
#
# 产出（dist-release\）：
#   小心工具箱-安装版-v<版本>.exe    NSIS 安装包（双击安装）
#   小心工具箱-安装版-v<版本>.msi    MSI 安装包（企业分发用，需 WiX；失败自动跳过）
#   小心工具箱-便携版-v<版本>.zip    绿色便携版（解压即用，数据存 exe 同级 data\，可整体迁移）

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 读取版本号
$conf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$version = $conf.version
$outDir = Join-Path $root "dist-release"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

# ---- 1. Tauri 构建（NSIS + MSI 两种安装包） ----
if (-not $SkipBuild) {
    Write-Host "==> 构建安装包（NSIS + MSI）..." -ForegroundColor Cyan
    # 一次构建两种；MSI 需要 WiX（首次构建自动下载，可能因网络失败），失败则回退仅 NSIS
    npm run tauri build -- --bundles nsis,msi
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "NSIS+MSI 构建失败（常见原因：WiX 下载失败）。回退为仅构建 NSIS..."
        npm run tauri build
        if ($LASTEXITCODE -ne 0) { throw "tauri build 失败" }
    }
}

# ---- 2. 收集安装包 ----
$nsisExe = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nsisExe) {
    $dest = Join-Path $outDir "小心工具箱-安装版-v$version.exe"
    Copy-Item $nsisExe.FullName $dest -Force
    Write-Host "  [NSIS]   $dest" -ForegroundColor Green
} else {
    Write-Warning "未找到 NSIS 产物，跳过安装版 exe"
}

$msiFile = Get-ChildItem "src-tauri\target\release\bundle\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($msiFile) {
    $dest = Join-Path $outDir "小心工具箱-安装版-v$version.msi"
    Copy-Item $msiFile.FullName $dest -Force
    Write-Host "  [MSI]    $dest" -ForegroundColor Green
} else {
    Write-Warning "未找到 MSI 产物（可能 WiX 不可用），跳过"
}

# ---- 3. 便携版（绿色 exe，可直接执行） ----
$releaseExe = Join-Path $root "src-tauri\target\release\xiaoxin-toolbox.exe"
if (Test-Path $releaseExe) {
    $stage = Join-Path $root "dist-release\stage\小心工具箱"
    if (Test-Path (Split-Path $stage -Parent)) {
        Remove-Item (Split-Path $stage -Parent) -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Join-Path $stage "data") -Force | Out-Null
    Copy-Item $releaseExe (Join-Path $stage "小心工具箱.exe")

    @'
小心工具箱 · 便携版说明
========================
1. 解压到任意有读写权限的目录（避免 C:\Program Files）。
2. 双击「小心工具箱.exe」运行，程序常驻系统托盘。
3. 所有数据（配置、剪贴板历史、文件夹记录）保存在本目录下的 data\ 文件夹中，
   整体复制即可完成迁移。
4. 默认快捷键：Alt+C 呼出剪贴板面板，Alt+F 呼出文件夹面板，可在设置中修改。
'@ | Out-File -FilePath (Join-Path $stage "使用说明.txt") -Encoding utf8

    $zip = Join-Path $outDir "小心工具箱-便携版-v$version.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Optimal
    Remove-Item (Split-Path $stage -Parent) -Recurse -Force
    Write-Host "  [便携版] $zip" -ForegroundColor Green
} else {
    Write-Warning "未找到 $releaseExe，无法生成便携版（请先执行 tauri build）"
}

# ---- 4. 汇总 ----
Write-Host ""
Write-Host "==> 打包完成，产物目录：$outDir" -ForegroundColor Cyan
Get-ChildItem $outDir -File | ForEach-Object {
    Write-Host ("    {0}  ({1:N2} MB)" -f $_.Name, ($_.Length / 1MB))
}
