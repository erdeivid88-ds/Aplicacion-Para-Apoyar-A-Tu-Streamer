# Apoya a tu Streamer

Aplicación Electron para Windows 10/11 x64 que monitoriza canales de Twitch y Kick, abre directos y permite mensajes funcionales mediante una cuenta bot claramente identificada. La mensajería está desactivada por defecto y solo funciona en canales cuya autorización se haya confirmado.

No simula actividad humana, envía spam, automatiza el DOM, manipula cookies ni evade moderación, antifraude o límites.

## Cuentas y mensajería Twitch

La integración usa exclusivamente OAuth oficial (Authorization Code con PKCE), validación y renovación automática, resolución de `broadcaster_id`/`sender_id` y el endpoint Helix de chat. Hay dos modos excluyentes por perfil local: **Personal**, con únicamente `user:write:chat`, y **Bot**, con `user:write:chat` y `user:bot`. La cuenta personal escribe con su identidad real; la cuenta bot usa una identidad separada. Cambiar de modo elimina primero los tokens cifrados anteriores.

### Configurar la URL de redirección

Entra en **Twitch Developer Console → Applications → Manage → OAuth Redirect URLs** y añade exactamente:

```text
http://localhost:3000/oauth/twitch
```

Después pulsa `Add` y guarda los cambios. `http://localhost:3000` sin `/oauth/twitch` no sirve. Tampoco debe añadirse una barra final: la URL registrada debe coincidir exactamente con `http://localhost:3000/oauth/twitch`.

Durante el inicio de sesión la aplicación abre un listener dual-stack en el puerto `3000`, accesible por `localhost` tanto mediante IPv4 (`127.0.0.1`) como IPv6 (`::1`). La `redirect_uri` enviada a Twitch sigue siendo exactamente la URL anterior con `localhost`, tanto al autorizar como al intercambiar el código. Antes de abrir el navegador se resuelve y verifica localmente `localhost`. Si el puerto está ocupado, cierra la aplicación que lo esté utilizando y vuelve a intentarlo.

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
