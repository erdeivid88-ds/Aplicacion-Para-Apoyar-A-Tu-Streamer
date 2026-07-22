# Apoya a tu Streamer

Versión actual: **1.0.7**.

## Modos de apertura

- **Navegador predeterminado:** usa `shell.openExternal`; la aplicación no puede silenciar ni cerrar esa pestaña.
- **Navegador predeterminado con extensión:** abre una pestaña real de Chrome o Edge, conserva su `tabId` y solo controla pestañas creadas por la integración.
- **Navegador interno de la aplicación:** abre una `BrowserWindow` secundaria aislada, sin preload privilegiado, silenciada y separada de la ventana principal.

La extensión no modifica ninguna pestaña cuando Apoya a tu Streamer está cerrada o desconectada. No recibe tokens, no consulta Twitch/Kick y no adopta pestañas manuales. Una sesión aleatoria solo en memoria, un handshake y heartbeats cada 10 segundos autorizan las órdenes; tras 30 segundos sin heartbeat o al desconectarse queda inerte y deja las pestañas como están.

## Instalar la extensión y Native Messaging

Ejecuta `npm run build:extension`. En Chrome abre `chrome://extensions`; en Edge, `edge://extensions`. Activa el modo desarrollador, elige **Cargar descomprimida/desempaquetada** y selecciona `browser-extension/dist`. El ID de desarrollo fijo es `jnpgebgidkgjmafnbpknialnjhkaigic`.

El host se compila con `npm run build:native-host`. Los manifiestos separados están en `native-host/manifests`; registra por usuario (HKCU) con `native-host/scripts/register.ps1`, indicando navegador, manifiesto y ruta absoluta del host. `unregister.ps1` elimina únicamente la clave de esta aplicación. La edición portable nunca registra el host automáticamente.

Permisos: `tabs`, `storage`, `nativeMessaging`, y acceso limitado a URLs de canal de Twitch y Kick. No se solicitan cookies, historial, `webRequest`, scripting ni `<all_urls>`.

Si la extensión no responde, el fallback predeterminado abre el navegador normal; puede desactivarse en Ajustes. Chrome/Edge no permiten instalar silenciosamente una extensión normal: para producción deben configurarse las URLs de sus tiendas.

### Diagnóstico

Comprueba que la aplicación esté abierta, que el host figure en HKCU para el navegador usado, que el manifiesto contenga una ruta absoluta existente y el ID exacto. Nunca compartas tokens ni códigos OAuth en un diagnóstico.

Aplicación Electron para Windows 10/11 x64 que monitoriza canales de Twitch y Kick, abre directos y permite mensajes funcionales mediante una cuenta bot claramente identificada. La mensajería está desactivada por defecto y solo funciona en canales cuya autorización se haya confirmado.

No simula actividad humana, envía spam, automatiza el DOM, manipula cookies ni evade moderación, antifraude o límites.

## Cuentas y mensajería Twitch

La integración usa exclusivamente el Device Code Flow oficial para aplicaciones públicas, validación y renovación automática, resolución de `broadcaster_id`/`sender_id` y el endpoint Helix de chat. No usa servidor local, PKCE ni secretos. Hay dos modos excluyentes por perfil local: **Personal**, con únicamente `user:write:chat`, y **Bot**, con `user:write:chat` y `user:bot`.

### Configurar Twitch

En Twitch Developer Console crea o administra una aplicación, selecciona el tipo de cliente **Público**, copia el Client ID y pégalo en Ajustes → Twitch. No se necesita ni debe configurarse un Client Secret. Al conectar, la aplicación muestra el código de dispositivo y abre la página oficial de Twitch para autorizarlo.

Los tokens se cifran con `safeStorage` en el proceso principal. Nunca llegan al renderer, registros ni exportaciones. Cada canal configura mensaje, envío inicial, repetición, intervalo (mínimo 15 minutos) y máximo por directo (hasta 5). El estado del directo y los envíos se persisten para evitar duplicados después de reiniciar. La automatización se detiene al terminar el directo y se pausa tras tres fallos consecutivos.

## Kick

`Mensajería automática no disponible para Kick mediante la API oficial actual.`

No existe fallback por Playwright, DOM, scraping, pulsaciones ni cookies.

## Navegador gestionado y seguridad

El navegador gestionado reutiliza una única ventana por canal y aplica silencio antes de cargar y después de cargas, navegaciones y recargas. La aplicación solo cierra ventanas creadas por ella. Se mantienen `contextIsolation: true`, `nodeIntegration: false`, sandbox, CSP estricta, IPC validado, entradas sanitizadas y límites de longitud.

Antes de abrir un directo, la aplicación valida el destino en un único punto. Solo admite una URL HTTPS de canal con un único segmento en `twitch.tv`/`www.twitch.tv` o `kick.com`/`www.kick.com`; bloquea destinos locales, OAuth, archivos y rutas internas de la aplicación.

## Desarrollo

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:extension
npm run test:native-host
npm run build:extension
npm run build:native-host
npm run build:win
```

Los instaladores se generan en `release/`. Las credenciales no deben incorporarse nunca a Git.

## Prueba manual reproducible

Instala la aplicación; carga la extensión en Chrome o Edge; abre la aplicación y verifica el estado conectado; enciende el monitor con un canal en directo y confirma apertura silenciada sin duplicados. Cierra manualmente la pestaña y verifica que no reaparece en esa sesión; apaga y enciende el monitor y confirma que puede abrir de nuevo. Simula el final y comprueba que solo se cierra la pestaña registrada. Cierra la aplicación, abre Twitch manualmente y confirma que no se silencia ni cierra. Repite con navegador interno y confirma que la ventana secundaria se silencia/cierra y la principal permanece abierta.
