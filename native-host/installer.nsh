!macro customInstall
  ; Los IDs de tienda exactos se inyectan en los manifiestos del canal de distribución.
  ; La edición portable no pasa por este macro y nunca registra automáticamente.
!macroend
!macro customUnInstall
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\es.vortexstudio.apoyaatustreamer"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\es.vortexstudio.apoyaatustreamer"
!macroend
