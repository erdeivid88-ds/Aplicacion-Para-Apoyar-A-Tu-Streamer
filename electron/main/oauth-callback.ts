import { createServer, type Server } from "node:http";
import {
  TWITCH_OAUTH_HOST,
  TWITCH_OAUTH_PATH,
  TWITCH_OAUTH_PORT,
  TWITCH_REDIRECT_URI,
} from "../../src/domain/twitch-oauth";
export { TWITCH_REDIRECT_URI } from "../../src/domain/twitch-oauth";
export const OAUTH_PORT_BUSY_MESSAGE =
  "No se pudo iniciar la conexión con Twitch porque el puerto local 3000 está ocupado. Cierra la aplicación que lo esté utilizando e inténtalo de nuevo.";

export type OAuthCallbackResult =
  | { kind: "success"; code: string }
  | { kind: "error"; message: string }
  | { kind: "invalid-state"; message: string }
  | { kind: "invalid-path"; message: string };

export function parseOAuthCallback(
  value: string,
  expectedState: string,
): OAuthCallbackResult {
  const url = new URL(value, TWITCH_REDIRECT_URI);
  if (url.pathname !== TWITCH_OAUTH_PATH)
    return { kind: "invalid-path", message: "Ruta OAuth no válida." };
  if (url.searchParams.get("state") !== expectedState)
    return { kind: "invalid-state", message: "Estado OAuth no válido." };
  const oauthError = url.searchParams.get("error");
  if (oauthError)
    return {
      kind: "error",
      message: url.searchParams.get("error_description") || oauthError,
    };
  const code = url.searchParams.get("code");
  return code
    ? { kind: "success", code }
    : {
        kind: "error",
        message: "Twitch no devolvió un código de autorización.",
      };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
export function oauthHtml(success: boolean, message: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OAuth Twitch</title><style>body{font-family:Segoe UI,sans-serif;background:#0d0a13;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:640px;padding:2rem;background:#211a2b;border-radius:16px}h1{color:${success ? "#7ee2a8" : "#ff9aad"}}</style></head><body><main><h1>${success ? "Conexión completada" : "No se pudo conectar"}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

export interface OAuthLogger {
  info(message: string, detail?: Record<string, unknown>): void;
  error(message: string, detail?: Record<string, unknown>): void;
}
const defaultLogger: OAuthLogger = {
  info: (message, detail) => console.info(message, detail ?? ""),
  error: (message, detail) => console.error(message, detail ?? ""),
};

export async function startOAuthCallback(
  expectedState: string,
  timeoutMs = 180_000,
  logger: OAuthLogger = defaultLogger,
): Promise<{ waitForCode: Promise<string>; close: () => Promise<void> }> {
  const server = createServer();
  const close = () => {
    clearTimeout(timeout);
    return closeServer(server);
  };
  let settle!: {
    resolve: (code: string) => void;
    reject: (error: Error) => void;
  };
  const waitForCode = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const timeout = setTimeout(() => {
    logger.error("[twitch-oauth] timeout", { port: TWITCH_OAUTH_PORT });
    void close().finally(() =>
      settle.reject(new Error("La conexión OAuth con Twitch agotó el tiempo.")),
    );
  }, timeoutMs);
  server.on("request", (request, response) => {
    logger.info("[twitch-oauth] callback recibido", {
      port: TWITCH_OAUTH_PORT,
    });
    const result = parseOAuthCallback(request.url ?? "/", expectedState);
    const success = result.kind === "success";
    const message = success
      ? "Cuenta de Twitch conectada correctamente. Ya puedes cerrar esta ventana."
      : result.message;
    response.writeHead(
      success ? 200 : result.kind === "invalid-path" ? 404 : 400,
      {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    );
    response.end(oauthHtml(success, message));
    clearTimeout(timeout);
    if (!success)
      logger.error("[twitch-oauth] error OAuth", { reason: result.kind });
    void close().finally(() =>
      success ? settle.resolve(result.code) : settle.reject(new Error(message)),
    );
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(TWITCH_OAUTH_PORT, TWITCH_OAUTH_HOST, resolve);
    });
  } catch (error) {
    clearTimeout(timeout);
    await close();
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EADDRINUSE")
      throw new Error(OAUTH_PORT_BUSY_MESSAGE, { cause: error });
    throw new Error("No se pudo iniciar la conexión local con Twitch.", {
      cause: error,
    });
  }
  logger.info("[twitch-oauth] servidor OAuth iniciado", {
    host: TWITCH_OAUTH_HOST,
    port: TWITCH_OAUTH_PORT,
  });
  return { waitForCode, close };
}

function closeServer(server: Server) {
  return new Promise<void>((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}
