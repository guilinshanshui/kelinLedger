# Recolours the selected tabBar icons to match each app theme.
#
# The source icons ship in a fixed blue (#3668FC) which does not match the theme
# primary colour, so we generate one recoloured set per theme and let the app
# swap selectedIconPath at runtime with uni.setTabBarItem.
#
# Run: powershell -ExecutionPolicy Bypass -File scripts/generate-tabbar-theme-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'static\tabbar'

# index -> source file (the icons referenced by pages.json)
$sources = @{
  '0' = 'tn-tabbar0-cur.png'
  '2' = 'tn-tabbar2-cur.png'
  '3' = 'tn-tabbar3-cur.png'
}

$themes = @{
  'daiqing' = '#2F5D6B'
  'nuanzhe' = '#6F5643'
}

function Recolor-Icon([string]$sourcePath, [string]$targetPath, [string]$hex) {
  $src = [System.Drawing.Image]::FromFile($sourcePath)
  $bmp = New-Object System.Drawing.Bitmap $src.Width, $src.Height
  $target = [System.Drawing.ColorTranslator]::FromHtml($hex)
  $sourceBlue = [System.Drawing.Color]::FromArgb(0x36, 0x68, 0xFC)

  for ($x = 0; $x -lt $src.Width; $x++) {
    for ($y = 0; $y -lt $src.Height; $y++) {
      $c = $src.GetPixel($x, $y)
      if ($c.A -eq 0) {
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        continue
      }

      # Only recolour the brand-blue glyph pixels; keep white cut-outs (e.g. the smile).
      $distance = [Math]::Sqrt(
        [Math]::Pow($c.R - $sourceBlue.R, 2) +
        [Math]::Pow($c.G - $sourceBlue.G, 2) +
        [Math]::Pow($c.B - $sourceBlue.B, 2)
      )

      if ($distance -lt 120) {
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, $target.R, $target.G, $target.B))
      } else {
        $bmp.SetPixel($x, $y, $c)
      }
    }
  }

  $bmp.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $src.Dispose()
}

foreach ($themeName in $themes.Keys) {
  foreach ($index in $sources.Keys) {
    $sourcePath = Join-Path $dir $sources[$index]
    if (-not (Test-Path $sourcePath)) { Write-Warning "missing source: $sourcePath"; continue }
    $targetPath = Join-Path $dir "tn-tabbar$index-cur-$themeName.png"
    Recolor-Icon $sourcePath $targetPath $themes[$themeName]
  }
}

Get-ChildItem $dir -Filter '*-cur-*.png' | Select-Object Name, Length
