# Apoya a tu Streamer

Aplicación de escritorio libre para Windows 10/11 x64 que vigila una lista personal de canales de Twitch y Kick y abre un directo nuevo en el navegador. Es un monitor y lanzador legítimo: no escribe en chats, no simula actividad, no manipula cookies y no genera audiencia artificial.

## Funciones

- Twitch y Kick pueden configurarse juntas o de forma independiente.
- Barridos periódicos con aislamiento de fallos, bloqueo de concurrencia y prevención persistente de aperturas duplicadas.
- Inicio/apagado manual, estado, próxima comprobación, errores e historial local.
- Navegador predeterminado o ventana gestionada aislada, silenciada y cerrable por la aplicación.
- Alta, edición, activación, búsqueda, eliminación e importación/exportación JSON de canales.
- Mensaje de apoyo copiado al portapapeles; el usuario realiza cualquier envío.
- Bandeja de Windows, notificaciones, inicio con Windows, tema y ajustes de inactividad.
- IPC mínimo, `contextIsolation`, renderer sin Node, CSP y enlaces externos validados.

> Pendiente de capturas: añade imágenes verificadas de Inicio, Streamers y Ajustes en `docs/screenshots/`.

## Navegadores

El modo **predeterminado** abre la URL con Windows. La aplicación no puede silenciar ni cerrar esa pestaña; cuando finaliza, solo informa. El modo **gestionado** usa una ventana Chromium de Electron y un perfil local separado (`persist:managed-browser`): debes iniciar sesión también allí. Solo controla ventanas que ella misma crea. Está desactivado de forma predeterminada.

## APIs y credenciales

Twitch requiere una aplicación registrada en [Twitch Developers](https://dev.twitch.tv/console), un Client ID y un token OAuth con acceso de lectura. Kick usa su [API pública](https://docs.kick.com/) y actualmente requiere token OAuth; para consultar por API se recomienda guardar también la ID externa del canal. Introduce estos datos en **Plataformas**. Permanecen en el archivo local de Electron y nunca deben compartirse ni incorporarse a Git. Esta primera versión no promete almacenamiento cifrado: usa tokens de alcance mínimo y revócalos si el equipo se comparte.

Sin credenciales la aplicación conserva toda la gestión y apertura manual, pero no puede confirmar el estado en directo mediante la API oficial. No se usa scraping de respaldo. Algunas capacidades dependen de la disponibilidad y condiciones vigentes de las APIs.

Puedes obtener IDs mediante [ids.vortexstudio.es](https://ids.vortexstudio.es). Al añadir un canal, elige plataforma, escribe su nombre exacto y, para Kick, la ID externa.

## Desarrollo

Requisitos: Node.js 22 LTS, npm y Git.

```bash
git clone git@github.com:erdeivid88-ds/Aplicacion-Para-Apoyar-A-Tu-Streamer.git
cd Aplicacion-Para-Apoyar-A-Tu-Streamer
npm ci
npm run dev
```

Validación completa:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Genera NSIS y portable para Windows desde Windows con `npm run build:win`. Los artefactos aparecen en `release/`. También puedes crear y subir un tag `v1.0.0`; GitHub Actions compila ambos `.exe`, calcula SHA-256 y publica la release. Al no estar firmado, SmartScreen puede advertir al usuario.

## Estructura

- `electron/main`: ventana, bandeja, persistencia, monitor, APIs y navegador gestionado.
- `electron/preload`: puente IPC permitido.
- `src/domain`: modelos y lógica comprobable sin Electron.
- `src/ui`: React y estilos adaptables.
- `.github/workflows`: validación y releases Windows.

Los datos viven en la ruta `userData` propia de Electron y sobreviven a las actualizaciones. El esquema incluye una versión para migraciones futuras. Exporta una copia desde Ajustes antes de cambios importantes.

## Solución de problemas

- **No se pudo comprobar Twitch/Kick:** revisa que la plataforma esté habilitada y el token sea vigente.
- **No abre el canal:** comprueba el navegador predeterminado y la URL guardada.
- **El modo gestionado pide sesión:** su perfil es deliberadamente independiente; inicia sesión en esa ventana.
- **Canal duplicado:** se compara plataforma + ID externa y plataforma + nombre normalizado.

## Privacidad, uso y licencia

No existe servidor propio ni telemetría. La aplicación no está afiliada oficialmente con Twitch ni Kick. El usuario debe cumplir sus condiciones; no se garantiza que una reproducción sea contabilizada y está prohibido usar el proyecto para audiencia artificial. Las credenciales permanecen localmente.

Consulta [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) y la licencia [MIT](LICENSE). Contacto: [contacto@vortexstudio.es](mailto:contacto@vortexstudio.es).
