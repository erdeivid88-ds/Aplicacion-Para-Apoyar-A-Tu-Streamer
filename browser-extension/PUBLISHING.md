# Publicar la extensión

La extensión Manifest V3 se distribuye únicamente mediante las tiendas oficiales. El ZIP generado por `npm run package:extension` no contiene secretos, código remoto ni dependencias externas.

## Material de la ficha

- Nombre público: **Apoya a tu Streamer**.
- Descripción: controla exclusivamente las pestañas abiertas por la aplicación de escritorio y queda inerte cuando la aplicación no está conectada.
- Permisos: `nativeMessaging` comunica con la aplicación local; `tabs` abre, silencia y cierra solo pestañas administradas; `storage` conserva el estado mínimo de la extensión.
- Sitios permitidos: Twitch y Kick, únicamente para abrir sus directos.
- Política de privacidad: consultar [PRIVACY.md](PRIVACY.md).
- Iconos PNG incluidos en 16, 32, 48 y 128 px.
- Pendiente antes de enviar: añadir capturas de la interfaz de tienda.

## Chrome Web Store

1. Crear una cuenta en Chrome Web Store Developer Dashboard.
2. Ejecutar `npm run build:extension` y `npm run package:extension` y subir el ZIP limpio.
3. Completar la ficha, la política de privacidad y la justificación de permisos anterior.
4. Añadir capturas, comprobar la versión sincronizada y enviar a revisión.
5. Tras publicarla, copiar la URL pública en `CHROME_EXTENSION_STORE_URL`, definida centralmente en `src/domain/support.ts`.

## Microsoft Edge Add-ons

1. Crear una cuenta en Partner Center para Microsoft Edge.
2. Subir el mismo ZIP limpio, completar la ficha, permisos, privacidad y capturas.
3. Enviar a certificación.
4. Tras publicarla, copiar la URL pública en `EDGE_EXTENSION_STORE_URL`, definida centralmente en `src/domain/support.ts`.

No se publica automáticamente ni se usan políticas empresariales para instalarla.
