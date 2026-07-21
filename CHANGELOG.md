# Changelog

## 1.0.5

- Hace el callback OAuth accesible por `localhost` mediante IPv4 e IPv6.
- Verifica las direcciones locales antes de abrir Twitch y mantiene vivo el flujo ante favicon, rutas desconocidas, visitas incompletas y `state` inválido.
- Añade diagnóstico seguro del listener y motivos de cierre.

## 1.0.4

- Fija el callback OAuth de Twitch en `http://localhost:3000/oauth/twitch`.
- Añade gestión segura de puerto ocupado, errores, cancelación y timeout.
- Muestra una página HTML clara al finalizar OAuth y documenta la URL exacta de Twitch Developer Console.

## 1.0.3

- Añade conexión OAuth de cuenta personal con `user:write:chat` sin scopes de bot.
- Mantiene el modo bot y separa de forma segura los tokens de ambos tipos de cuenta.
- Muestra usuario, avatar, scopes, tipo de cuenta y permisos de la sesión de Twitch.
- Migra las sesiones 1.0.2 existentes como cuentas bot.

## 1.0.2

- Mensajería autorizada para Twitch mediante cuenta bot, OAuth PKCE y Helix.
- Límites persistentes por directo, estados visibles y almacenamiento seguro.
- Silencio persistente y reutilización de ventanas gestionadas.
- Kick se mantiene sin mensajería al no existir API oficial compatible.

## 1.0.0 - 2026-07-21

- Primera versión pública: monitor Twitch/Kick, navegador gestionado opcional, bandeja, historial, ajustes e importación/exportación.
