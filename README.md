# Apoya a tu Streamer

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

## Desarrollo

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build:win
```

Los instaladores se generan en `release/`. Las credenciales no deben incorporarse nunca a Git.
