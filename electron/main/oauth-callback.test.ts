import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OAUTH_PORT_BUSY_MESSAGE,
  oauthHtml,
  parseOAuthCallback,
  startOAuthCallback,
  TWITCH_OAUTH_LISTEN_HOST,
} from "./oauth-callback";
import {
  TWITCH_OAUTH_PORT,
  TWITCH_REDIRECT_URI,
} from "../../src/domain/twitch-oauth";

const logger = { info: vi.fn(), error: vi.fn() };
const active: { close: (reason?: string) => Promise<void> }[] = [];
afterEach(async () => {
  while (active.length) await active.pop()!.close("fin de prueba");
  vi.clearAllMocks();
});
async function start(state = "state", timeout = 2_000) {
  const callback = await startOAuthCallback(state, timeout, logger);
  active.push(callback);
  return callback;
}
async function finish(
  callback: Awaited<ReturnType<typeof start>>,
  host = "localhost",
  state = "state",
) {
  const response = await fetch(
    `http://${host.includes(":") ? `[${host}]` : host}:3000/oauth/twitch?code=test-code&state=${state}`,
  );
  expect(response.status).toBe(200);
  await expect(callback.waitForCode).resolves.toBe("test-code");
}

describe.sequential("callback OAuth dual-stack", () => {
  it("mantiene la redirect URI exacta con localhost", () =>
    expect(TWITCH_REDIRECT_URI).toBe("http://localhost:3000/oauth/twitch"));
  it("es accesible por IPv4", async () => {
    const callback = await start();
    await finish(callback, "127.0.0.1");
  });
  it("es accesible por IPv6 cuando está disponible", async () => {
    const callback = await start();
    await finish(callback, "::1");
  });
  it("procesa un callback válido y cierra después del éxito", async () => {
    const callback = await start();
    await finish(callback);
    expect(callback.server.listening).toBe(false);
  });
  it("una visita sin parámetros responde 400 y mantiene abierto el flujo", async () => {
    const callback = await start();
    const response = await fetch(TWITCH_REDIRECT_URI);
    expect(response.status).toBe(400);
    expect(callback.server.listening).toBe(true);
    await finish(callback);
  });
  it("favicon responde 404 y mantiene abierto el flujo", async () => {
    const callback = await start();
    const response = await fetch("http://localhost:3000/favicon.ico");
    expect(response.status).toBe(404);
    expect(callback.server.listening).toBe(true);
    await finish(callback);
  });
  it("una ruta desconocida responde 404 y mantiene abierto el flujo", async () => {
    const callback = await start();
    const response = await fetch("http://localhost:3000/desconocida");
    expect(response.status).toBe(404);
    expect(callback.server.listening).toBe(true);
    await finish(callback);
  });
  it("state inválido responde 400 sin cerrar y después acepta uno válido", async () => {
    const callback = await start("expected");
    const response = await fetch(
      `${TWITCH_REDIRECT_URI}?code=hidden&state=wrong`,
    );
    expect(response.status).toBe(400);
    expect(callback.server.listening).toBe(true);
    await finish(callback, "localhost", "expected");
  });
  it("un error OAuth de Twitch es definitivo y cierra el servidor", async () => {
    const callback = await start();
    const rejection = expect(callback.waitForCode).rejects.toThrow(
      "El usuario canceló",
    );
    const response = await fetch(
      `${TWITCH_REDIRECT_URI}?error=access_denied&error_description=El+usuario+canceló&state=state`,
    );
    expect(response.status).toBe(400);
    await rejection;
    expect(callback.server.listening).toBe(false);
  });
  it("timeout cierra el servidor", async () => {
    const callback = await start("state", 15);
    await expect(callback.waitForCode).rejects.toThrow(/agotó el tiempo/);
    expect(callback.server.listening).toBe(false);
  });
  it("puerto ocupado devuelve el mensaje esperado", async () => {
    const holder = createServer();
    await new Promise<void>((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(
        {
          port: TWITCH_OAUTH_PORT,
          host: TWITCH_OAUTH_LISTEN_HOST,
          ipv6Only: false,
        },
        resolve,
      );
    });
    try {
      await expect(startOAuthCallback("state", 1_000, logger)).rejects.toThrow(
        OAUTH_PORT_BUSY_MESSAGE,
      );
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });
  it("escapa el motivo mostrado en HTML", () =>
    expect(oauthHtml(false, "<script>bad()</script>")).not.toContain(
      "<script>",
    ));
  it("clasifica una visita sin parámetros como no definitiva", () =>
    expect(parseOAuthCallback("/oauth/twitch", "state").kind).toBe(
      "missing-parameters",
    ));
});
