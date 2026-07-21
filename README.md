# Apoya a tu Streamer

Aplicación Electron para Windows 10/11 x64 que monitoriza canales de Twitch y Kick, abre directos y permite mensajes funcionales mediante una cuenta bot claramente identificada. La mensajería está desactivada por defecto y solo funciona en canales cuya autorización se haya confirmado.

No simula actividad humana, envía spam, automatiza el DOM, manipula cookies ni evade moderación, antifraude o límites.

## Mensajería Twitch

La integración usa exclusivamente OAuth oficial (Authorization Code con PKCE), validación y renovación automática, resolución de `broadcaster_id`/`sender_id` y el endpoint Helix de chat. Los scopes mínimos solicitados a la cuenta bot son `user:write:chat` y `user:bot`. El propietario del canal debe confirmar la autorización en la aplicación y dar al bot la capacidad oficial de escribir en su canal según los requisitos de Twitch.

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
