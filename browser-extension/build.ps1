$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$dist=Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$worker=Join-Path $dist 'service-worker.js'; $popup=Join-Path $dist 'popup.js'
& (Join-Path $root 'node_modules/.bin/esbuild.cmd') (Join-Path $PSScriptRoot 'service-worker.ts') --bundle --format=iife "--outfile=$worker"
& (Join-Path $root 'node_modules/.bin/esbuild.cmd') (Join-Path $PSScriptRoot 'popup.ts') --bundle --format=iife "--outfile=$popup"
Copy-Item -Force (Join-Path $PSScriptRoot 'manifest.json'),(Join-Path $PSScriptRoot 'popup.html'),(Join-Path $PSScriptRoot 'popup.css'),(Join-Path $PSScriptRoot 'options.html') -Destination $dist
$icons=Join-Path $dist 'icons'; New-Item -ItemType Directory -Force -Path $icons | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'icons/icon-16.png'),(Join-Path $PSScriptRoot 'icons/icon-32.png'),(Join-Path $PSScriptRoot 'icons/icon-48.png'),(Join-Path $PSScriptRoot 'icons/icon-128.png') -Destination $icons
