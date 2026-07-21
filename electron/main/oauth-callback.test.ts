import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OAUTH_PORT_BUSY_MESSAGE,
  oauthHtml,
  parseOAuthCallback,
  startOAuthCallback,
} from "./oauth-callback";
import {
  TWITCH_OAUTH_HOST,
  TWITCH_OAUTH_PORT,
  TWITCH_REDIRECT_URI,
} from "../../src/domain/twitch-oauth";

const logger = { info: vi.fn(), error: vi.fn() };
const active: { close: () => Promise<void> }[] = [];
afterEach(async () => {
  while (active.length) await active.pop()!.close();
  vi.clearAllMocks();
});

describe.sequential("callback OAuth fijo", () => {
  it("usa la redirect URI fija exacta", () =>
    expect(TWITCH_REDIRECT_URI).toBe("http://localhost:3000/oauth/twitch"));
  it("procesa correctamente code y devuelve HTML claro", async () => {
    const callback = await startOAuthCallback("state-ok", 1_000, logger);
    active.push(callback);
    const response = await fetch(
      `${TWITCH_REDIRECT_URI}?code=secret-code&state=state-ok`,
    );
    expect(await callback.waitForCode).toBe("secret-code");
    expect(await response.text()).toContain(
      "Cuenta de Twitch conectada correctamente. Ya puedes cerrar esta ventana.",
    );
  });
  it("rechaza un state incorrecto", async () => {
    const callback = await startOAuthCallback("expected", 1_000, logger);
    active.push(callback);
    const rejection = expect(callback.waitForCode).rejects.toThrow(
      /Estado OAuth no válido/,
    );
    await fetch(`${TWITCH_REDIRECT_URI}?code=hidden&state=wrong`);
    await rejection;
  });
  it("procesa el error OAuth devuelto por Twitch sin credenciales", async () => {
    const callback = await startOAuthCallback("state", 1_000, logger);
    active.push(callback);
    const rejection = expect(callback.waitForCode).rejects.toThrow(
      "El usuario canceló",
    );
    const response = await fetch(
      `${TWITCH_REDIRECT_URI}?error=access_denied&error_description=El+usuario+canceló&state=state`,
    );
    await rejection;
    expect(await response.text()).not.toContain("secret-code");
  });
  it("cierra el servidor tras timeout", async () => {
    const callback = await startOAuthCallback("state", 10, logger);
    active.push(callback);
    await expect(callback.waitForCode).rejects.toThrow(/agotó el tiempo/);
    const next = await startOAuthCallback("next", 1_000, logger);
    active.push(next);
    await next.close();
  });
  it("informa cuando el puerto 3000 está ocupado", async () => {
    const holder = createServer();
    await new Promise<void>((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(TWITCH_OAUTH_PORT, TWITCH_OAUTH_HOST, resolve);
    });
    try {
      await expect(startOAuthCallback("state", 1_000, logger)).rejects.toThrow(
        OAUTH_PORT_BUSY_MESSAGE,
      );
    } finally {
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
  });
  it("cierra correctamente cuando se solicita", async () => {
    const callback = await startOAuthCallback("state", 1_000, logger);
    active.push(callback);
    await callback.close();
    const replacement = await startOAuthCallback("replacement", 1_000, logger);
    active.push(replacement);
    await replacement.close();
  });
  it("escapa el motivo mostrado en HTML", () =>
    expect(oauthHtml(false, "<script>bad()</script>")).not.toContain(
      "<script>",
    ));
  it("distingue rutas incorrectas", () =>
    expect(parseOAuthCallback("/wrong?state=x", "x").kind).toBe(
      "invalid-path",
    ));
});
