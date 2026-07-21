import { describe, expect, it } from "vitest";
import {
  assertAuthenticatedSender,
  connectedAccountLabel,
  migrateConnectionFrom102,
  scopesForAccount,
} from "./twitch-account";

describe("tipos de cuenta Twitch", () => {
  it("la cuenta personal solicita solo user:write:chat", () => {
    expect(scopesForAccount("personal")).toEqual(["user:write:chat"]);
    expect(scopesForAccount("personal")).not.toContain("user:bot");
  });
  it("el sender_id coincide con el usuario autenticado", () => {
    expect(() => assertAuthenticatedSender("42", "42")).not.toThrow();
    expect(() => assertAuthenticatedSender("42", "99")).toThrow(/sender_id/);
  });
  it("migra una conexión 1.0.2 como bot sin perderla", () => {
    expect(
      migrateConnectionFrom102({
        status: "connected",
        userId: "42",
        displayName: "legacy",
      }),
    ).toMatchObject({
      accountType: "bot",
      userId: "42",
      displayName: "legacy",
    });
  });
  it("presenta la cuenta personal correctamente", () => {
    expect(
      connectedAccountLabel({ status: "connected", accountType: "personal" }),
    ).toBe("Cuenta personal conectada");
  });
});
