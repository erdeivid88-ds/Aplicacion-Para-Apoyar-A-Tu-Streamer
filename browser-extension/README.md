# Extensión Chrome/Edge

Extensión Manifest V3 sin scripts de contenido ni acceso a tokens. Solo actúa ante órdenes autenticadas de la sesión efímera que llegan por Native Messaging. Al desconectar o caducar el heartbeat queda inerte y deja intactas las pestañas existentes.

Desarrollo: ejecuta `npm run build:extension`, abre `chrome://extensions` o `edge://extensions`, activa el modo desarrollador y carga `browser-extension/dist`.
