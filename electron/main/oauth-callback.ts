import { lookup } from "node:dns/promises";
import { createServer, type Server } from "node:http";
import {
  TWITCH_OAUTH_PATH,
  TWITCH_OAUTH_PORT,
  TWITCH_REDIRECT_URI,
} from "../../src/domain/twitch-oauth";
export { TWITCH_REDIRECT_URI } from "../../src/domain/twitch-oauth";

export const TWITCH_OAUTH_LISTEN_HOST = "::";
export const OAUTH_PORT_BUSY_MESSAGE =
  "No se pudo iniciar la conexión con Twitch porque el puerto local 3000 está ocupado. Cierra la aplicación que lo esté utilizando e inténtalo de nuevo.";
const HEALTH_PATH = "/__oauth_health";

export type OAuthCallbackResult =
  | { kind: "success"; code: string }
  | { kind: "error"; message: string }
  | { kind: "invalid-state"; message: string }
  | { kind: "missing-parameters"; message: string }
  | { kind: "invalid-path"; message: string };

export function parseOAuthCallback(
  value: string,
  expectedState: string,
): OAuthCallbackResult {
  const url = new URL(value, TWITCH_REDIRECT_URI);
  if (url.pathname !== TWITCH_OAUTH_PATH)
    return { kind: "invalid-path", message: "Ruta OAuth no válida." };
  const hasOAuthParameters =
    url.searchParams.has("code") ||
    url.searchParams.has("error") ||
    url.searchParams.has("state");
  if (!hasOAuthParameters)
    return {
      kind: "missing-parameters",
      message:
        "Esta página espera la respuesta de autorización de Twitch. Puedes volver a la aplicación e iniciar la conexión.",
    };
  if (url.searchParams.get("state") !== expectedState)
    return {
      kind: "invalid-state",
      message:
        "Estado OAuth no válido. La conexión sigue esperando una respuesta válida de Twitch.",
    };
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
        kind: "missing-parameters",
        message:
          "Twitch no devolvió un código de autorización. La conexión sigue esperando una respuesta válida.",
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
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OAuth Twitch</title><style>body{font-family:Segoe UI,sans-serif;background:#0d0a13;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:640px;padding:2rem;background:#211a2b;border-radius:16px}h1{color:${success ? "#7ee2a8" : "#ff9aad"}}</style></head><body><main><h1>${success ? "Conexión completada" : "Conexión de Twitch"}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

export interface OAuthLogger {
  info(message: string, detail?: Record<string, unknown>): void;
  error(message: string, detail?: Record<string, unknown>): void;
}
const defaultLogger: OAuthLogger = {
  info: (message, detail) => console.info(message, detail ?? ""),
  error: (message, detail) => console.error(message, detail ?? ""),
};
export interface LocalAddress {
  address: string;
  family: number;
}
export async function resolveLocalhost(): Promise<LocalAddress[]> {
  return lookup("localhost", { all: true });
}
function addressUrl(address: LocalAddress) {
  return `http://${address.family === 6 ? `[${address.address}]` : address.address}:${TWITCH_OAUTH_PORT}${HEALTH_PATH}`;
}
export async function verifyResolvedAddresses(addresses: LocalAddress[]) {
  for (const address of addresses) {
    const response = await fetch(addressUrl(address), {
      signal: AbortSignal.timeout(2_000),
    });
    if (response.status !== 204)
      throw new Error(
        `El listener OAuth no responde por IPv${address.family}.`,
      );
  }
}

export async function startOAuthCallback(
  expectedState: string,
  timeoutMs = 180_000,
  logger: OAuthLogger = defaultLogger,
): Promise<{
  waitForCode: Promise<string>;
  close: (reason?: string) => Promise<void>;
  server: Server;
}> {
  const server = createServer();
  let closed = false;
  let settle!: {
    resolve: (code: string) => void;
    reject: (error: Error) => void;
  };
  const waitForCode = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const close = async (reason = "cierre solicitado") => {
    clearTimeout(timeout);
    if (closed) return;
    closed = true;
    await closeServer(server);
    logger.info("[twitch-oauth] servidor OAuth cerrado", {
      reason,
      port: TWITCH_OAUTH_PORT,
    });
  };
  const timeout = setTimeout(() => {
    logger.error("[twitch-oauth] timeout", { port: TWITCH_OAUTH_PORT });
    void close("timeout").finally(() =>
      settle.reject(new Error("La conexión OAuth con Twitch agotó el tiempo.")),
    );
  }, timeoutMs);
  server.on("request", (request, response) => {
    const requestUrl = new URL(request.url ?? "/", TWITCH_REDIRECT_URI);
    if (requestUrl.pathname === HEALTH_PATH) {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    if (requestUrl.pathname !== TWITCH_OAUTH_PATH) {
      response.writeHead(404, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(oauthHtml(false, "Página no encontrada."));
      return;
    }
    logger.info("[twitch-oauth] callback recibido", {
      port: TWITCH_OAUTH_PORT,
    });
    const result = parseOAuthCallback(request.url ?? "/", expectedState);
    if (result.kind === "success") {
      const message =
        "Cuenta de Twitch conectada correctamente. Ya puedes cerrar esta ventana.";
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(oauthHtml(true, message));
      void close("éxito").finally(() => settle.resolve(result.code));
      return;
    }
    response.writeHead(400, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(oauthHtml(false, result.message));
    if (result.kind === "error") {
      logger.error("[twitch-oauth] error OAuth", {
        reason: "respuesta de Twitch",
      });
      void close("error OAuth").finally(() =>
        settle.reject(new Error(result.message)),
      );
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(
        {
          port: TWITCH_OAUTH_PORT,
          host: TWITCH_OAUTH_LISTEN_HOST,
          ipv6Only: false,
        },
        () => {
          server.off("error", onError);
          resolve();
        },
      );
    });
    const bound = server.address();
    logger.info("[twitch-oauth] listener iniciado", {
      address: typeof bound === "string" ? bound : bound?.address,
      family: typeof bound === "string" ? "pipe" : bound?.family,
      port: typeof bound === "string" ? TWITCH_OAUTH_PORT : bound?.port,
    });
    const addresses = await resolveLocalhost();
    logger.info("[twitch-oauth] localhost resuelto", {
      addresses: addresses.map((item) => ({
        address: item.address,
        family: item.family,
      })),
    });
    await verifyResolvedAddresses(addresses);
    logger.info("[twitch-oauth] direcciones localhost verificadas", {
      families: [...new Set(addresses.map((item) => item.family))],
    });
  } catch (error) {
    await close(
      (error as NodeJS.ErrnoException).code === "EADDRINUSE"
        ? "error de puerto"
        : "error de listener",
    );
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      logger.error("[twitch-oauth] error de puerto", {
        port: TWITCH_OAUTH_PORT,
      });
      throw new Error(OAUTH_PORT_BUSY_MESSAGE, { cause: error });
    }
    throw new Error("No se pudo iniciar la conexión local con Twitch.", {
      cause: error,
    });
  }
  return { waitForCode, close, server };
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
