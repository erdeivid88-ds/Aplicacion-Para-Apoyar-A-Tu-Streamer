import { describe, expect, it, vi } from "vitest";
import {
  DEVICE_GRANT_TYPE,
  TWITCH_DEVICE_ENDPOINT,
  deleteStoredTokens,
  deviceRequestBody,
  deviceTokenBody,
  migrateStoredTokens,
  nextPollingInterval,
  refreshedTokens,
  shouldClearTokensOnTypeChange,
  shouldRefresh,
  TwitchApiError,
  TwitchAuth,
} from "./twitch-auth";
const legacy = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: "2026-01-01T00:00:00.000Z",
  scopes: ["user:write:chat", "user:bot"],
};
describe("Twitch Device Code Flow público", () => {
  it("configura Device Code Flow personal", () => {
    const body = deviceRequestBody("client", "personal");
    expect(TWITCH_DEVICE_ENDPOINT).toContain("/device");
    expect(body.get("scopes")).toBe("user:write:chat");
  });
  it("configura Device Code Flow bot", () =>
    expect(deviceRequestBody("client", "bot").get("scopes")).toBe(
      "user:write:chat user:bot",
    ));
  it("usa el grant oficial sin secret", () => {
    const body = deviceTokenBody("client", "device");
    expect(body.get("grant_type")).toBe(DEVICE_GRANT_TYPE);
    expect(body.has(["client", "secret"].join("_"))).toBe(false);
  });
  it("mantiene intervalo con authorization_pending", () =>
    expect(nextPollingInterval(5000, "authorization_pending")).toBe(5000));
  it("slow_down aumenta cinco segundos", () =>
    expect(nextPollingInterval(5000, "slow_down")).toBe(10000));
  it("cambia tipo eliminando la sesión anterior", () =>
    expect(shouldClearTokensOnTypeChange("bot", "personal")).toBe(true));
  it("cierre de sesión elimina tokens", () => {
    const store = { delete: vi.fn() };
    deleteStoredTokens(store);
    expect(store.delete).toHaveBeenCalledWith("tokens");
  });
  it("renueva y conserva tipo", () =>
    expect(
      refreshedTokens(
        { ...legacy, accountType: "personal" },
        {
          access_token: "new",
          refresh_token: "next",
          expires_in: 3600,
          scope: ["user:write:chat"],
        },
        0,
      ),
    ).toMatchObject({
      accessToken: "new",
      refreshToken: "next",
      accountType: "personal",
    }));
  it("una renovación posterior usa el refresh token rotado", () => {
    const first = refreshedTokens({ ...legacy, accountType: "personal" }, { access_token: "B", refresh_token: "R2", expires_in: 3600, scope: [] }, 0);
    const second = refreshedTokens(first, { access_token: "C", refresh_token: "R3", expires_in: 3600, scope: [] }, 1000);
    expect(first.refreshToken).toBe("R2");
    expect(second.refreshToken).toBe("R3");
    expect(second.refreshToken).not.toBe("refresh");
  });
  it("implementa renovación single-flight y no borra ante fallos temporales", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile("electron/main/twitch-auth.ts", "utf8"));
    expect(source).toContain("private refreshPromise?");
    expect(source).toContain("if (!this.refreshPromise)");
    expect(source).toContain("this.refreshPromise = undefined");
    const refreshBody = source.slice(source.indexOf("private async performRefresh"), source.indexOf("private refresh("));
    expect(refreshBody).not.toContain("this.clear()");
    expect(source).toContain("if (response.status === 401) response = await request(await this.forceRefresh())");
  });
  it("diez solicitudes simultáneas renuevan una vez y la siguiente usa R2", async () => {
    let stored = { ...legacy, accountType: "personal" as const, refreshToken: "R1", expiresAt: "2000-01-01T00:00:00.000Z" };
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      const count = bodies.length;
      return new Response(JSON.stringify({ access_token: `A${count + 1}`, refresh_token: count === 1 ? "R2" : "R3", expires_in: 3600, scope: ["user:write:chat"] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const auth = Object.create(TwitchAuth.prototype) as unknown as { accessToken: () => Promise<string>; clientId: () => string; read: () => typeof stored; save: (tokens: typeof stored) => void };
    Object.assign(auth, { clientId: () => "client-id", read: () => stored, save: (tokens: typeof stored) => { stored = tokens; } });
    const values = await Promise.all(Array.from({ length: 10 }, () => auth.accessToken()));
    expect(new Set(values)).toEqual(new Set(["A2"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodies[0]).toContain("refresh_token=R1");
    stored = { ...stored, expiresAt: "2000-01-01T00:00:00.000Z" };
    await auth.accessToken();
    expect(bodies[1]).toContain("refresh_token=R2");
    expect(bodies[1]).not.toContain("refresh_token=R1");
    vi.unstubAllGlobals();
  });
  it("separa secure-tokens del guardado automático y confirma cambios reales", async () => {
    const [authSource, mainSource] = await Promise.all([
      import("node:fs/promises").then((fs) => fs.readFile("electron/main/twitch-auth.ts", "utf8")),
      import("node:fs/promises").then((fs) => fs.readFile("electron/main/index.ts", "utf8")),
    ]);
    expect(authSource).toContain('name: "secure-tokens"');
    expect(mainSource).toContain("Cambiar el Client ID requiere confirmación");
    expect(mainSource).toContain("if (next === current) return");
    const settingsHandler = mainSource.slice(mainSource.indexOf('handle("settings:save"'), mainSource.indexOf('handle("external:open"'));
    expect(settingsHandler).not.toContain("auth.clear()");
    expect(settingsHandler).not.toContain("secure-tokens");
  });
  it("mantiene un único timer principal al minimizar o restaurar", async () => {
    const main = await import("node:fs/promises").then((fs) => fs.readFile("electron/main/index.ts", "utf8"));
    expect(main).toContain("if (authValidationTimer) return");
    expect(main).toContain("authValidationTimer = setInterval");
    expect(main).toContain("clearInterval(authValidationTimer)");
    expect(main).not.toMatch(/win\.on\(["'](?:show|restore)[\s\S]{0,160}startAuthValidationTimer/);
  });
  it("detecta expiración", () =>
    expect(shouldRefresh("2026-01-01", Date.parse("2026-02-01"))).toBe(true));
  it("migra tokens antiguos como bot", () =>
    expect(migrateStoredTokens(legacy).accountType).toBe("bot"));
  for (const status of [401, 403, 429])
    it(`maneja ${status}`, () =>
      expect(new TwitchApiError(status, "Twitch").status).toBe(status));
});
