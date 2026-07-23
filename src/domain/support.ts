import type { AppState } from "./types";

export const SUPPORT_EMAIL = "contacto@vortexstudio.es";
export const IDS_URL = "https://ids.vortexstudio.es";
export const CHROME_EXTENSION_STORE_URL = "";
export const EDGE_EXTENSION_STORE_URL = "";

export function safeDiagnostic(state: AppState, system: string) {
  return {
    version: "1.1.0",
    system,
    monitor: state.monitor.status,
    browserMode: state.settings.browserMode,
    selectedBrowser: state.settings.extensionBrowser,
    extensionConnected: state.extension.connected,
    connectorConfigured: state.extension.nativeHostConnected,
    protocolVersion: state.extension.protocolVersion,
  };
}

export function errorReportTemplate(state: AppState, system: string) {
  const diagnostic = safeDiagnostic(state, system);
  return `Hola,

He encontrado un error en Apoya a tu Streamer.

Descripción del problema:


Pasos para reproducirlo:


Resultado esperado:


Resultado obtenido:


Información técnica:
- Versión: ${diagnostic.version}
- Sistema operativo: ${diagnostic.system}
- Estado del monitor: ${diagnostic.monitor}
- Modo de navegador: ${diagnostic.browserMode}`;
}

export function errorReportMailto(state: AppState, system: string) {
  const query = new URLSearchParams({
    subject: "Apoya a tu Streamer - Informe de error",
    body: errorReportTemplate(state, system),
  });
  return `mailto:${SUPPORT_EMAIL}?${query.toString()}`;
}

export function extensionStoreUrl(browser: "chrome" | "edge") {
  const configured = browser === "chrome"
    ? CHROME_EXTENSION_STORE_URL
    : EDGE_EXTENSION_STORE_URL;
  return validExtensionStoreUrl(browser, configured);
}

export function validExtensionStoreUrl(browser: "chrome" | "edge", configured: string) {
  if (!configured) return "";
  try {
    const url = new URL(configured);
    const expectedHost = browser === "chrome" ? "chromewebstore.google.com" : "microsoftedge.microsoft.com";
    return url.protocol === "https:" && url.hostname === expectedHost ? url.href : "";
  } catch {
    return "";
  }
}
