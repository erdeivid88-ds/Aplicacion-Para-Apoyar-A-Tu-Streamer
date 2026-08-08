$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$dist=Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$worker=Join-Path $dist 'service-worker.js'; $popup=Join-Path $dist 'popup.js'
& (Join-Path $root 'node_modules/.bin/esbuild.cmd') (Join-Path $PSScriptRoot 'service-worker.ts') --bundle --format=iife "--outfile=$worker"
& (Join-Path $root 'node_modules/.bin/esbuild.cmd') (Join-Path $PSScriptRoot 'popup.ts') --bundle --format=iife "--outfile=$popup"
$manifest=Get-Content -Raw (Join-Path $PSScriptRoot 'manifest.json')|ConvertFrom-Json
$appVersion=(Get-Content -Raw (Join-Path $root 'package.json')|ConvertFrom-Json).version
$manifest.version="$appVersion.1"
$manifest|Add-Member -NotePropertyName version_name -NotePropertyValue $appVersion -Force
$manifest|ConvertTo-Json -Depth 20|Set-Content -Encoding utf8 (Join-Path $dist 'manifest.json')
Copy-Item -Force (Join-Path $PSScriptRoot 'popup.html'),(Join-Path $PSScriptRoot 'popup.css'),(Join-Path $PSScriptRoot 'options.html') -Destination $dist
$icons=Join-Path $dist 'icons'
if(Test-Path -LiteralPath $icons){Remove-Item -LiteralPath $icons -Recurse -Force}
New-Item -ItemType Directory -Force -Path $icons | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'icons/16.png'),(Join-Path $PSScriptRoot 'icons/32.png'),(Join-Path $PSScriptRoot 'icons/48.png'),(Join-Path $PSScriptRoot 'icons/128.png') -Destination $icons
