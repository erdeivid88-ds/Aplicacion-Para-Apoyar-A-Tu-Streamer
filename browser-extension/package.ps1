$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$version=(Get-Content -Raw (Join-Path $root 'package.json')|ConvertFrom-Json).version
$release=Join-Path $root 'release'; New-Item -ItemType Directory -Force $release|Out-Null
$zip=Join-Path $release "Apoya-a-tu-Streamer-Browser-Extension-$version.zip"
if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip}
Compress-Archive -Path (Join-Path $PSScriptRoot 'dist/*') -DestinationPath $zip -CompressionLevel Optimal
