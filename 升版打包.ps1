# 小心工具箱 - 升版打包脚本
# 双击运行：弹出输入框填新版本号（直接回车 = 自动递增 patch 位），
# 自动完成 三处版本号同步 → npm run pack（构建+签名+收集产物）。
# 产物：项目根目录 小心工具箱-安装版-v<版本>.exe / .exe.sig
# 注意：本文件必须保持 UTF-8 带 BOM 编码（PS5.1 依赖 BOM 识别 UTF-8），
#       中文注释/路径才不会乱码导致解析错误。

Add-Type -AssemblyName Microsoft.VisualBasic

# 双击启动时先停住窗口，失败时不闪退（能看到报错）
$ErrorActionPreference = "Stop"
try {
    # ---- 1. 读取当前版本号（只解析，不重写整个文件） ----
    $confPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
    # UTF-8 无 BOM 必须显式指定编码，PS5.1 默认按 ANSI 读会乱码
    $confRaw = Get-Content $confPath -Raw -Encoding UTF8
    if ($confRaw -notmatch '(?m)^\s*"version"\s*:\s*"([\d.]+)"') {
        throw "无法从 tauri.conf.json 解析版本号"
    }
    $current = $Matches[1]

    # ---- 2. 输入新版本号（默认：patch 自动 +1） ----
    $bump = $current -split '\.'
    $bump[2] = [int]$bump[2] + 1
    $suggested = $bump -join '.'
    $input = [Microsoft.VisualBasic.Interaction]::InputBox(
        "当前版本：v$current`n`n请输入新版本号（格式 x.y.z）：`n（直接确定 = 自动递增为 v$suggested）",
        "小心工具箱 - 升版打包",
        $suggested)
    # 取消按钮 → 退出
    if ($null -eq $input) {
        Write-Host "已取消" -ForegroundColor Yellow
        return
    }
    $new = $input.Trim()
    if ($new -eq "") { $new = $suggested }
    # 校验格式（必须 x.y.z 纯数字，防止手滑输错打出废包）
    if ($new -notmatch '^\d+\.\d+\.\d+$') {
        throw "版本号格式不正确：'$new'（应为 x.y.z，如 1.0.3）"
    }
    if ($new -eq $current) {
        throw "新版本号与当前版本相同（$current），请输入更大的版本号"
    }

    # ---- 3. 三处版本号同步（tauri.conf.json / package.json / Cargo.toml） ----
    # 全部用逐行正则替换"版本行"，绝不整体 ConvertTo-Json 重写（会重排格式/
    # 丢注释）。UTF-8 无 BOM 写回，与仓库现状一致。
    Write-Host "==> 版本号 v$current -> v$new" -ForegroundColor Cyan
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

    # tauri.conf.json：文件内唯一的 "version": "x.y.z" 行（顶层应用版本）
    $confNew = $confRaw -replace '(?m)^(\s*"version"\s*:\s*)"[\d.]+"', "`${1}`"$new`""
    [System.IO.File]::WriteAllText($confPath, $confNew, $utf8NoBom)

    # package.json：同样唯一（顶层 "version"）
    $pkgPath = Join-Path $PSScriptRoot "package.json"
    $pkgRaw = Get-Content $pkgPath -Raw -Encoding UTF8
    $pkgNew = $pkgRaw -replace '(?m)^(\s*"version"\s*:\s*)"[\d.]+"', "`${1}`"$new`""
    [System.IO.File]::WriteAllText($pkgPath, $pkgNew, $utf8NoBom)

    # Cargo.toml：只改 crate 自身版本（文件第一个 ^version = 行，跳过依赖的）
    $cargoPath = Join-Path $PSScriptRoot "src-tauri\Cargo.toml"
    $cargoLines = [System.IO.File]::ReadAllLines($cargoPath, $utf8NoBom)
    $replaced = $false
    for ($i = 0; $i -lt $cargoLines.Length; $i++) {
        if ($cargoLines[$i] -match '^version\s*=\s*"[^"]*"\s*$') {
            $cargoLines[$i] = "version = `"$new`""
            $replaced = $true
            break
        }
    }
    if (-not $replaced) { throw "Cargo.toml 中未找到 crate 版本行" }
    [System.IO.File]::WriteAllLines($cargoPath, $cargoLines, $utf8NoBom)
    # Cargo.lock 不手改：tauri build 时 cargo 自动同步

    # ---- 4. 打包 ----
    Write-Host "==> 开始打包（前端 + Rust release + NSIS + 签名）..." -ForegroundColor Cyan
    Set-Location $PSScriptRoot
    # 显式传 -Versioned：升版流程产物带 v<版本号>，正式发版用；
    # 而 npm run pack 裸调用（默认）产物不带版本，仅开发测试用
    npm run pack -- -Versioned
    if ($LASTEXITCODE -ne 0) { throw "打包失败" }

    Write-Host ""
    Write-Host "==> 升版打包完成：v$current -> v$new" -ForegroundColor Green
    Write-Host "    上传更新服务器：http://82.157.156.62/upload（exe + .sig 两个文件）" -ForegroundColor Gray
} catch {
    Write-Host "错误：$_" -ForegroundColor Red
} finally {
    # 双击运行时停住窗口看结果；从终端运行多按一次回车即可
    Write-Host ""
    Write-Host "按回车键退出..."
    Read-Host | Out-Null
}
