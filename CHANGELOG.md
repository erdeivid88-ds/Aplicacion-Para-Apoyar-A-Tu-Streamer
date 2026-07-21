# Changelog

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
