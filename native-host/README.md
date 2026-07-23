# Native Messaging Host

Relay `stdio` mínimo entre Chrome/Edge y el pipe local de la aplicación. Implementa framing de 4 bytes little-endian, límite de 64 KiB y logs filtrados en stderr. No interpreta ni registra mensajes completos.

El ID exacto se fija mediante la clave pública del manifiesto de la extensión. En desarrollo, `native-host:register` genera un launcher con la ruta absoluta detectada por `Get-Command node`. El instalador incorpora su propio `node.exe`, registra Chrome y Edge en HKCU y no depende del PATH del equipo destino. La versión portable nunca registra automáticamente.
