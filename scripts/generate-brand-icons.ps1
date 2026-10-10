# Generates bill-source brand icons (WeChat Pay / Alipay).
#
# NOTE: these are recreated marks using the official brand colours, not licensed
# official artwork. Replace the files in static/brand/ with official assets if needed.
#
# Run: powershell -ExecutionPolicy Bypass -File scripts/generate-brand-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'static\brand'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function New-RoundedPath([int]$x, [int]$y, [int]$w, [int]$h, [int]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

# WeChat Pay: green tile + white double speech bubbles
function New-WeChatIcon([string]$path) {
  $size = 96
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#07C160'))
  $bgPath = New-RoundedPath 0 0 $size $size 22
  $g.FillPath($bg, $bgPath)

  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

  $g.FillEllipse($white, 14, 24, 44, 38)
  $tailA = [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 20, 56),
    (New-Object System.Drawing.Point 34, 60),
    (New-Object System.Drawing.Point 22, 70)
  )
  $g.FillPolygon($white, $tailA)

  $g.FillEllipse($white, 46, 36, 38, 32)
  $tailB = [System.Drawing.Point[]]@(
    (New-Object System.Drawing.Point 62, 64),
    (New-Object System.Drawing.Point 76, 62),
    (New-Object System.Drawing.Point 68, 74)
  )
  $g.FillPolygon($white, $tailB)

  $g.FillEllipse($bg, 27, 38, 7, 7)
  $g.FillEllipse($bg, 40, 38, 7, 7)
  $g.FillEllipse($bg, 56, 47, 6, 6)
  $g.FillEllipse($bg, 68, 47, 6, 6)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# Alipay: blue tile + white "Zhi" glyph (U+652F)
function New-AlipayIcon([string]$path) {
  $size = 96
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Transparent)

  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#1677FF'))
  $bgPath = New-RoundedPath 0 0 $size $size 22
  $g.FillPath($bg, $bgPath)

  $glyph = [string][char]0x652F
  $font = New-Object System.Drawing.Font 'Microsoft YaHei', 46, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $g.DrawString($glyph, $font, $white, $rect, $fmt)

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-WeChatIcon (Join-Path $outDir 'wechat-pay.png')
New-AlipayIcon (Join-Path $outDir 'alipay.png')

Get-ChildItem $outDir | Select-Object Name, Length
