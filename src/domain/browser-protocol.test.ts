import { describe, expect, it } from "vitest";
import { validateBrowserMessage, validateOpenPayload } from "./browser-protocol";
describe("protocolo del navegador", () => {
  const base = { protocolVersion: 1, requestId: "r", appSessionId: "s", action: "ping", payload: {} };
  it("acepta mensajes completos", () => expect(validateBrowserMessage(base).action).toBe("ping"));
  it.each([{...base, protocolVersion: 2}, {...base, requestId: ""}, {...base, appSessionId: ""}, {...base, action: "old"}])("rechaza mensajes inseguros", value => expect(() => validateBrowserMessage(value)).toThrow());
  it("canonicaliza canales", () => expect(validateOpenPayload({streamerId:"1",streamSessionId:"2",monitorSessionId:"3",platform:"twitch",url:"https://twitch.tv/Test"}).url).toBe("https://www.twitch.tv/test"));
  it("rechaza dominios falsos", () => expect(() => validateOpenPayload({streamerId:"1",streamSessionId:"2",monitorSessionId:"3",platform:"kick",url:"https://kick.com.evil.test/a"})).toThrow());
});
