# Changelog

## 1.0.8

- Añade registro, desregistro y diagnóstico completos del Native Messaging Host para Edge y Chrome en HKCU.
- Mantiene el ID estable `jnpgebgidkgjmafnbpknialnjhkaigic` y prueba framing/ping mediante el launcher real.
- Sustituye las ventanas internas múltiples por una única ventana con pestañas `WebContentsView` aisladas.
- Mantiene monitor, heartbeat y pestañas al minimizar, con tratamiento de suspensión y reanudación de Windows.
- Añade reapertura controlada tras confirmar que el directo continúa, con retraso y límite configurables.

## 1.0.7

- Añade tres modos de apertura: navegador externo, Chrome/Edge mediante extensión y navegador interno aislado.
- Incorpora extensión Manifest V3 inerte sin sesión, protocolo validado, heartbeat y control exclusivo por `tabId`.
- Añade relay Native Messaging con framing seguro, manifiestos HKCU separados y scripts de registro/desregistro.
- Genera una sesión de monitor nueva al encender, evita duplicados y permite reapertura en una sesión posterior.
- Amplía ajustes, pruebas, documentación y empaquetado de la extensión.

## 1.0.6

- Completa el apagado del monitor eliminando `nextScan` sin escribir valores `undefined` en electron-store.
- Consulta el estado en directo de Twitch exclusivamente mediante la sesión cifrada de `TwitchAuth`.
- Valida estrictamente cada URL de stream antes de crear una ventana y oculta la ventana gestionada hasta completar la carga.

## 1.0.5 (Device Flow y monitor)

- Sustituye por completo callback/PKCE por Device Code Flow para cliente público sin secretos.
- Invalida barridos tardíos y cancela planificadores al apagar manualmente.
- Rediseña Ajustes con ocho categorías, borrador, validación y guardado explícito.

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
