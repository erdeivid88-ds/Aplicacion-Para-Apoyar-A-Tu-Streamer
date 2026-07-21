import { describe, expect, it, vi } from "vitest";
import { deleteStoredTokens, migrateStoredTokens, refreshedTokens, shouldClearTokensOnTypeChange, shouldRefresh, TwitchApiError } from "./twitch-auth";

const legacy = { accessToken: "access", refreshToken: "refresh", expiresAt: "2026-01-01T00:00:00.000Z", scopes: ["user:write:chat", "user:bot"] };
describe("sesión OAuth Twitch", () => {
  it("cambia de bot a personal borrando la sesión anterior", () => expect(shouldClearTokensOnTypeChange("bot", "personal")).toBe(true));
  it("el cierre de sesión borra tokens", () => { const store = { delete: vi.fn() }; deleteStoredTokens(store); expect(store.delete).toHaveBeenCalledWith("tokens") });
  it("conserva tipo y sustituye refresh token durante renovación", () => { const next = refreshedTokens({ ...legacy, accountType: "personal" }, { access_token: "new", refresh_token: "new-refresh", expires_in: 3600, scope: ["user:write:chat"] }, 0); expect(next).toMatchObject({ accessToken: "new", refreshToken: "new-refresh", accountType: "personal" }) });
  it("detecta token caducado", () => expect(shouldRefresh("2026-01-01T00:00:00.000Z", Date.parse("2026-02-01"))).toBe(true));
  it("migra tokens 1.0.2 como bot", () => expect(migrateStoredTokens(legacy).accountType).toBe("bot"));
  for (const status of [401, 403, 429]) it(`conserva el error ${status}`, () => expect(new TwitchApiError(status, `Twitch ${status}`).status).toBe(status));
});
