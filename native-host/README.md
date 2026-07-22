# Native Messaging Host

Relay `stdio` mínimo entre Chrome/Edge y el pipe local de la aplicación. Implementa framing de 4 bytes little-endian, límite de 64 KiB y logs filtrados en stderr. No interpreta ni registra mensajes completos.

El ID exacto se fija mediante la clave pública del manifiesto de la extensión. `register.ps1` sustituye la ruta absoluta y registra solo en HKCU; apunta `HostPath` a `native-host.cmd`. Este launcher requiere Node.js en el equipo durante el flujo de desarrollo. La versión portable nunca lo ejecuta automáticamente.
