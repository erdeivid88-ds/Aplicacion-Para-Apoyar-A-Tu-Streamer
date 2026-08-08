param([string]$Executable)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$executable = if ($Executable) { $Executable } else { Join-Path $root "release/win-unpacked/Apoya a tu Streamer.exe" }
if (-not (Test-Path -LiteralPath $executable)) { throw "Ejecuta npm run build:win antes del smoke test." }

$resolvedExecutable = (Resolve-Path -LiteralPath $executable).Path
$smokeData = Join-Path ([System.IO.Path]::GetTempPath()) ("apoya-smoke-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $smokeData | Out-Null
$stdout = Join-Path $smokeData "stdout.log"
$stderr = Join-Path $smokeData "stderr.log"
$process = $null
$previousRunAsNode = $env:ELECTRON_RUN_AS_NODE
try {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $env:APOYA_SMOKE_USER_DATA = $smokeData
  $env:ELECTRON_ENABLE_LOGGING = "1"
  $process = Start-Process -FilePath $resolvedExecutable -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Start-Sleep -Seconds 8
  $process.Refresh()
  if ($process.HasExited) {
    $details = if (Test-Path -LiteralPath $stderr) { Get-Content -Raw -LiteralPath $stderr } else { "Sin stderr." }
    throw "El proceso main termino prematuramente con codigo $($process.ExitCode): $details"
  }
  if ($process.MainWindowHandle -eq 0) {
    $details = if (Test-Path -LiteralPath $stderr) { Get-Content -Raw -LiteralPath $stderr } else { "Sin stderr." }
    throw "Electron siguio vivo pero no creo la ventana principal: $details"
  }
  Write-Output "Smoke Windows correcto: main PID $($process.Id), ventana 0x$($process.MainWindowHandle.ToString('X'))."
} finally {
  Remove-Item Env:APOYA_SMOKE_USER_DATA -ErrorAction SilentlyContinue
  Remove-Item Env:ELECTRON_ENABLE_LOGGING -ErrorAction SilentlyContinue
  if ($null -ne $previousRunAsNode) { $env:ELECTRON_RUN_AS_NODE = $previousRunAsNode }
  Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $resolvedExecutable } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
  $resolvedSmokeData = $null
  $resolved = Resolve-Path -LiteralPath $smokeData -ErrorAction SilentlyContinue
  if ($resolved) { $resolvedSmokeData = $resolved.Path }
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if ($resolvedSmokeData -and $resolvedSmokeData.StartsWith($tempRoot) -and (Split-Path -Leaf $resolvedSmokeData).StartsWith("apoya-smoke-")) {
    Remove-Item -LiteralPath $resolvedSmokeData -Recurse -Force -ErrorAction SilentlyContinue
  }
}
