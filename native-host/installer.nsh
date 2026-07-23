!macro customInstall
  ExecWait '"$INSTDIR\resources\native-host\node.exe" "$INSTDIR\resources\native-host\scripts\native-host-cli.mjs" register --all --extension-id=jnpgebgidkgjmafnbpknialnjhkaigic'
!macroend
!macro customUnInstall
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\es.vortexstudio.apoyaatustreamer"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\es.vortexstudio.apoyaatustreamer"
!macroend
