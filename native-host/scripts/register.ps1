param([Parameter(Mandatory=$true)][ValidateSet('chrome','edge')]$Browser,[Parameter(Mandatory=$true)]$ManifestPath,[Parameter(Mandatory=$true)]$HostPath)
$template=Get-Content -Raw -LiteralPath $ManifestPath
$generated=Join-Path (Split-Path -Parent $HostPath) "$Browser-native-host.json"
$template.Replace('__ABSOLUTE_HOST_PATH__',([IO.Path]::GetFullPath($HostPath).Replace('\','\\'))) | Set-Content -Encoding utf8 -LiteralPath $generated
$root = if ($Browser -eq 'chrome') {'HKCU:\Software\Google\Chrome\NativeMessagingHosts'} else {'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'}
$key = Join-Path $root 'es.vortexstudio.apoyaatustreamer'; New-Item -Path $key -Force | Out-Null; Set-Item -Path $key -Value ([IO.Path]::GetFullPath($generated))
