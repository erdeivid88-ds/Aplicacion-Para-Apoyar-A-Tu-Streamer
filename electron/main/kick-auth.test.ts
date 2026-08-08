import { describe, expect, it } from "vitest";
import { kickChatBody, KICK_REDIRECT_URI, pkceChallenge } from "./kick-auth";

describe("Kick OAuth y chat oficiales", () => {
  it("mantiene una Redirect URI local fija", () => {
    expect(KICK_REDIRECT_URI).toBe("http://localhost:17654/oauth/kick/callback");
  });
  it("genera el challenge S256 del ejemplo RFC", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("usa exactamente el modelo user de POST chat", () => {
    expect(kickChatBody("123", "👋👋👋")).toEqual({
      broadcaster_user_id: 123,
      content: "👋👋👋",
      type: "user",
    });
  });
});
