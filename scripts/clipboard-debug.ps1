# 剪贴板格式诊断工具
# 用法：先在任意应用（如 Snipaste）中复制内容，然后运行：
#   powershell -ExecutionPolicy Bypass -File scripts\clipboard-debug.ps1
# 输出系统剪贴板中当前所有数据格式，用于排查"复制了但应用读不到"的问题。
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Write-Output "===== 剪贴板格式诊断 ====="

$data = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($null -eq $data) {
    Write-Output "剪贴板为空（还没有复制任何内容）"
    exit 1
}

$formats = $data.GetFormats($false)
Write-Output "剪贴板格式清单（共 $($formats.Count) 种）："
foreach ($f in $formats) {
    try {
        $d = $data.GetData($f, $false)
        $info = "类型=$($d.GetType().Name)"
        if ($d -is [System.IO.MemoryStream]) {
            $info = "Stream($($d.Length)B)"
        } elseif ($d -is [System.Drawing.Bitmap]) {
            $info = "Bitmap($($d.Width)x$($d.Height))"
        } elseif ($d -is [System.Drawing.Imaging.Metafile]) {
            $info = "EMF/Metafile($($d.Width)x$($d.Height))"
        } elseif ($d -is [string]) {
            $info = "Text($($d.Length)字符)"
        } elseif ($d -is [System.Collections.Specialized.StringCollection]) {
            $info = "FileDrop($($d.Count)个)"
        }
        Write-Output ("  [{0}]  =>  {1}" -f $f, $info)
    } catch {
        Write-Output ("  [{0}]  =>  读取失败：{1}" -f $f, $_.Exception.Message)
    }
}

Write-Output ""
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -ne $img) {
    Write-Output "[GetImage] 成功：$($img.Width)x$($img.Height)（有可解码位图/PNG，应用应能读到）"
} else {
    Write-Output "[GetImage] 失败：无标准位图/PNG（这是 Snipaste 图片读不到的直接原因）"
}

$files = [System.Windows.Forms.Clipboard]::GetFileDropList()
if ($null -ne $files -and $files.Count -gt 0) {
    Write-Output ("[FileDrop] {0} 个文件，第一个：{1}" -f $files.Count, $files[0])
} else {
    Write-Output "[FileDrop] 无文件列表"
}

Write-Output ""
Write-Output "===== 诊断完成 ====="
