$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "logo-lurks.PNG"
$build = Join-Path $root "build"
$extensionIcons = Join-Path $root "browser-extension/icons"
$uiAssets = Join-Path $root "src/assets"

if (-not (Test-Path -LiteralPath $source)) { throw "No existe logo-lurks.PNG" }
New-Item -ItemType Directory -Force -Path $build, $extensionIcons, $uiAssets | Out-Null
Copy-Item -LiteralPath $source -Destination (Join-Path $build "logo-lurks.png") -Force
Copy-Item -LiteralPath $source -Destination (Join-Path $uiAssets "logo-lurks.png") -Force

$original = [System.Drawing.Bitmap]::FromFile($source)
if (($original.PixelFormat -band [System.Drawing.Imaging.PixelFormat]::Alpha) -eq 0) {
  $original.Dispose()
  throw "El logo fuente no tiene canal alpha."
}

function New-LogoPng([int]$size, [string]$destination) {
  $canvas = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $scale = [Math]::Min($size / $original.Width, $size / $original.Height)
    $width = [Math]::Max(1, [Math]::Round($original.Width * $scale))
    $height = [Math]::Max(1, [Math]::Round($original.Height * $scale))
    $x = [Math]::Floor(($size - $width) / 2)
    $y = [Math]::Floor(($size - $height) / 2)
    $graphics.DrawImage($original, $x, $y, $width, $height)
    $canvas.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
$icoFrames = @()
foreach ($size in $icoSizes) {
  $temporary = Join-Path $build "icon-$size.png"
  New-LogoPng $size $temporary
  $icoFrames += ,([System.IO.File]::ReadAllBytes($temporary))
}
foreach ($size in @(16, 32, 48, 128)) {
  New-LogoPng $size (Join-Path $extensionIcons "$size.png")
}
New-LogoPng 256 (Join-Path $extensionIcons "256.png")
$original.Dispose()

$iconPath = Join-Path $build "icon.ico"
$stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$writer = New-Object System.IO.BinaryWriter($stream)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$icoSizes.Count)
  $offset = 6 + (16 * $icoSizes.Count)
  for ($index = 0; $index -lt $icoSizes.Count; $index++) {
    $size = $icoSizes[$index]
    $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$icoFrames[$index].Length)
    $writer.Write([uint32]$offset)
    $offset += $icoFrames[$index].Length
  }
  foreach ($frame in $icoFrames) { $writer.Write($frame) }
} finally {
  $writer.Dispose()
  $stream.Dispose()
}

foreach ($size in $icoSizes) {
  Remove-Item -LiteralPath (Join-Path $build "icon-$size.png")
}
