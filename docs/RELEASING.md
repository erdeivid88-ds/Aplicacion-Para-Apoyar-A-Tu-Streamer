# Publicar una versión

La versión de `package.json` es la única fuente de verdad. El build copia ese valor al manifiesto de la extensión y Electron lo expone mediante `app.getVersion()`.

1. Completa los cambios y ejecuta las validaciones.
2. Elige el incremento SemVer: `npm run version:patch`, `npm run version:minor` o `npm run version:major`.
3. Ejecuta `npm run build:win`.
4. Confirma y sube el cambio de versión.
5. Crea y sube el tag correspondiente, por ejemplo `git tag v1.1.2` y `git push origin v1.1.2`.
6. El workflow de release valida el proyecto y adjunta a GitHub Release el instalador Setup, `latest.yml`, blockmap, portable, ZIP de extensión y sumas SHA-256.

Nunca reutilices una versión o un tag existentes. Los usuarios de la instalación NSIS reciben la actualización mediante GitHub Releases; la versión portable requiere actualización manual.

## Prueba real del updater

1. Instala una versión A mediante Setup.
2. Publica una versión B superior como release no preliminar con Setup, `latest.yml` y blockmap.
3. Abre A y comprueba que detecta y descarga B.
4. Pulsa **Reiniciar e instalar**.
5. Verifica que B se abre y conserva streamers, OAuth y ajustes del usuario.

Los mocks automatizados validan los estados del updater, pero no sustituyen esta prueba de extremo a extremo.
