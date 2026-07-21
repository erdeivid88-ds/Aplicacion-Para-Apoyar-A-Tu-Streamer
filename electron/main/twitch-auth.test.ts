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
  it("detecta expiración", () =>
    expect(shouldRefresh("2026-01-01", Date.parse("2026-02-01"))).toBe(true));
  it("migra tokens antiguos como bot", () =>
    expect(migrateStoredTokens(legacy).accountType).toBe("bot"));
  for (const status of [401, 403, 429])
    it(`maneja ${status}`, () =>
      expect(new TwitchApiError(status, "Twitch").status).toBe(status));
});
