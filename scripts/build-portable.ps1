# 小心工具箱 - 便携版打包脚本
# 用法：
#   .\scripts\build-portable.ps1            # 完整构建（tauri build + 打包 zip）
#   .\scripts\build-portable.ps1 -SkipBuild # 仅打包（已执行过 tauri build 时）
#
# 产出：
#   - src-tauri\target\release\bundle\nsis\*.exe  NSIS 安装包（tauri build 顺带产出）
#   - release\小心工具箱-便携版-v<版本>.zip  便携版（exe 同级 data/ 目录存数据）

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 读取版本号
$conf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$version = $conf.version
$exeName = "xiaoxin-toolbox.exe"
$releaseExe = Join-Path $root "src-tauri\target\release\$exeName"

if (-not $SkipBuild) {
    Write-Host "==> 开始 Tauri 构建（前端 + Rust release + NSIS）..." -ForegroundColor Cyan
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build 失败" }
}

if (-not (Test-Path $releaseExe)) {
    throw "未找到 $releaseExe，请先执行 npm run tauri build（或不带 -SkipBuild 运行本脚本）"
}

# 组装便携版目录：exe 同级 data/ 目录 → 应用启动时自动将其作为数据目录
$stage = Join-Path $root "dist-portable\stage\小心工具箱"
if (Test-Path (Split-Path $stage -Parent)) {
    Remove-Item (Split-Path $stage -Parent) -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $stage "data") -Force | Out-Null
Copy-Item $releaseExe (Join-Path $stage "小心工具箱.exe")

# OCR 模型必须与 exe 同级：应用按「exe 同级 → exe\models → data\models」找模型，
# 便携版缺了就得联网下载才能识别，破坏"解压即用"
$ocrModels = Join-Path $root "src-tauri\ocr-models"
if (-not (Test-Path $ocrModels)) { throw "缺少 OCR 模型目录：$ocrModels" }
Copy-Item (Join-Path $ocrModels "*") $stage -Force

# 附带便携版说明
@'
小心工具箱 · 便携版说明
========================
1. 解压到任意有读写权限的目录（避免 C:\Program Files）。
2. 双击「小心工具箱.exe」运行，程序常驻系统托盘。
3. 所有数据（配置、剪贴板历史、文件夹记录）保存在本目录下的 data\ 文件夹中，
   整体复制即可完成迁移。
4. 默认快捷键：Alt+C 呼出剪贴板面板，Alt+F 呼出文件夹面板，可在设置中修改。
'@ | Out-File -FilePath (Join-Path $stage "使用说明.txt") -Encoding utf8

# 打包 zip（统一输出到顶层 release\，与安装版产物同目录）
$out = Join-Path $root "release\小心工具箱-便携版-v$version.zip"
if (Test-Path $out) { Remove-Item $out -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $out -CompressionLevel Optimal

Write-Host ""
Write-Host "==> 打包完成：" -ForegroundColor Green
Write-Host "    便携版：$out"
Write-Host "    NSIS：  src-tauri\target\release\bundle\nsis\"
