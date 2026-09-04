# 将 1024x1024 源图转换为 Tauri 所需的各尺寸 PNG 与多尺寸 ICO
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$src = "C:\Users\18087\.qoder-cn\vibe_images\xiaoxin-toolbox-icon_1786276208.png"
$icons = "d:\MyCustomTools\XiaoxinToolBox\src-tauri\icons"

function Resize-Png([System.Drawing.Image]$img, [int]$size, [string]$out) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "PNG -> $out"
}

# 背景抠透：从四角 BFS 洪水填充，仅将"与边缘连通的白色背景"置为透明。
# 用双阈值做软边：亮于 hi 的完全透明，介于 lo/hi 的按亮度线性衰减 alpha，
# 消除圆角边缘的白边/锯齿。图标内部的白色图案不受影响（不与边缘连通）。
# 注意：位图必须是 32bppArgb 才能写入透明，24bppRgb 会静默丢弃 alpha。
function Remove-Background([System.Drawing.Bitmap]$bmp, [double]$lo = 0.88, [double]$hi = 0.94) {
    $w = $bmp.Width; $h = $bmp.Height
    $maxX = $w - 1; $maxY = $h - 1
    $vis = New-Object 'bool[,]' $w, $h
    $queue = New-Object System.Collections.Generic.Queue[int]
    # 边缘一圈的亮像素作为种子，保证任意位置的背景白都能被连通；
    # 种子自身也要立即置透明，否则会在四周留下 1px 不透边
    for ($x = 0; $x -lt $w; $x++) {
        foreach ($y in @(0, $maxY)) {
            $c = $bmp.GetPixel($x, $y)
            if ($c.A -gt 0 -and $c.R -ge ($hi * 255) -and $c.G -ge ($hi * 255) -and $c.B -ge ($hi * 255)) {
                $vis[$x, $y] = $true; $queue.Enqueue($y * $w + $x)
                $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
            }
        }
    }
    for ($y = 0; $y -lt $h; $y++) {
        foreach ($x in @(0, $maxX)) {
            $c = $bmp.GetPixel($x, $y)
            if (-not $vis[$x, $y] -and $c.A -gt 0 -and $c.R -ge ($hi * 255) -and $c.G -ge ($hi * 255) -and $c.B -ge ($hi * 255)) {
                $vis[$x, $y] = $true; $queue.Enqueue($y * $w + $x)
                $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
            }
        }
    }
    $loB = $lo * 255; $hiB = $hi * 255
    while ($queue.Count -gt 0) {
        $p = $queue.Dequeue()
        $x = $p % $w; $y = [int]($p / $w)
        foreach ($d in @(@(1,0), @(-1,0), @(0,1), @(0,-1))) {
            $nx = $x + $d[0]; $ny = $y + $d[1]
            if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $w -or $ny -ge $h -or $vis[$nx, $ny]) { continue }
            $c = $bmp.GetPixel($nx, $ny)
            if ($c.A -eq 0) { continue }
            # 亮度取三通道最小值：带色边的像素不算背景白
            $m = [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
            if ($m -ge $loB) {
                $vis[$nx, $ny] = $true
                $queue.Enqueue($ny * $w + $nx)
                if ($m -ge $hiB) {
                    $bmp.SetPixel($nx, $ny, [System.Drawing.Color]::FromArgb(0, 255, 255, 255))
                } else {
                    # 软边：亮度越接近 hi 越透明
                    $alpha = [int](255 * ($hiB - $m) / ($hiB - $loB))
                    $bmp.SetPixel($nx, $ny, [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B))
                }
            }
        }
    }
}

# 源图抠透一次，后续所有尺寸从透明版缩放。
# 强制绘制到 32bppArgb 画布：ImageGen 源图是 24bppRgb（无 alpha 通道），
# 直接 SetPixel 透明色会被静默丢弃。
$raw0 = [System.Drawing.Bitmap]::new($src)
$raw = New-Object System.Drawing.Bitmap($raw0.Width, $raw0.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g0 = [System.Drawing.Graphics]::FromImage($raw)
$g0.DrawImage($raw0, 0, 0, $raw0.Width, $raw0.Height)
$g0.Dispose()
$raw0.Dispose()
Remove-Background $raw
$proc = Join-Path $env:TEMP "icon_src_transparent.png"
$raw.Save($proc, [System.Drawing.Imaging.ImageFormat]::Png)
$raw.Dispose()
Write-Output "背景已抠透 -> $proc"

$img = [System.Drawing.Image]::FromFile($proc)

Resize-Png $img 512 "$icons\icon.png"
Resize-Png $img 32 "$icons\32x32.png"
Resize-Png $img 128 "$icons\128x128.png"
Resize-Png $img 256 "$icons\128x128@2x.png"

# 生成多尺寸 ICO（每个尺寸一条 PNG 压缩条目，Vista+ 支持）
# 注意：用 ArrayList.Add 保存字节数组，避免 += 把字节展开成单字节元素
$sizes = @(256, 64, 48, 32, 24, 16)
$pngs = New-Object System.Collections.ArrayList
foreach ($s in $sizes) {
    $tmp = Join-Path $env:TEMP "ico_$s.png"
    Resize-Png $img $s $tmp
    [void]$pngs.Add([System.IO.File]::ReadAllBytes($tmp))
}
$img.Dispose()

$fs = [System.IO.File]::OpenWrite("$icons\icon.ico")
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)              # reserved
$bw.Write([uint16]1)              # type: icon
$bw.Write([uint16]$sizes.Count)   # count
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))  # width (0 = 256)
    $bw.Write([byte]$(if ($s -ge 256) { 0 } else { $s }))  # height
    $bw.Write([byte]0)             # colors
    $bw.Write([byte]0)             # reserved
    $bw.Write([uint16]1)           # planes
    $bw.Write([uint16]32)          # bpp
    $bw.Write([uint32]$pngs[$i].Length)
    $bw.Write([uint32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($b in $pngs) { $bw.Write($b) }
$bw.Dispose(); $fs.Dispose()
Write-Output "ICO -> $icons\icon.ico ($($sizes -join ',') px)"
