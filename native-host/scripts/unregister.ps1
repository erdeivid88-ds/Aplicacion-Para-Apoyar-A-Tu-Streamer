param([Parameter(Mandatory=$true)][ValidateSet('chrome','edge')]$Browser)
$root = if ($Browser -eq 'chrome') {'HKCU:\Software\Google\Chrome\NativeMessagingHosts'} else {'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'}
$key = Join-Path $root 'es.vortexstudio.apoyaatustreamer'; if(Test-Path -LiteralPath $key){Remove-Item -LiteralPath $key}
