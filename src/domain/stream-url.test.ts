import { describe, expect, it } from "vitest";
import {
  inspectKickUrl,
  normalizeKickUrl,
  safeParseUrl,
  streamUrl,
  validateStreamUrl,
  waitForKickUrl,
} from "./stream-url";

describe("validación única de URL de directos", () => {
  it.each([
    ["twitch", "https://www.twitch.tv/Streamer"],
    ["twitch", "https://twitch.tv/streamer"],
    ["kick", "https://kick.com/streamer"],
    ["kick", "https://www.kick.com/streamer"],
  ])("acepta %s %s", (platform, url) =>
    expect(validateStreamUrl(platform, url)).toMatchObject({ valid: true }),
  );

  it.each([
    "file:///dist/index.html",
    "app://index.html",
    "http://localhost:5173",
    "https://localhost/oauth/twitch",
    "https://127.0.0.1/channel",
    "https://id.twitch.tv/oauth2/authorize",
    "https://www.twitch.tv/directory/game/Test",
    "https://www.twitch.tv/test?oauth=1",
    "",
  ])("rechaza destinos internos o ambiguos: %s", (url) =>
    expect(validateStreamUrl("twitch", url).valid).toBe(false),
  );

  it("rechaza una URL válida para una plataforma distinta", () =>
    expect(validateStreamUrl("kick", "https://twitch.tv/test").valid).toBe(
      false,
    ));

  it("construye la URL canónica", () =>
    expect(streamUrl("twitch", "streamer")).toBe(
      "https://www.twitch.tv/streamer",
    ));

  it.each([
    ["yourview", "https://kick.com/yourview"],
    ["kick.com/yourview", "https://kick.com/yourview"],
    ["www.kick.com/yourview", "https://kick.com/yourview"],
    ["/yourview", "https://kick.com/yourview"],
    ["https://kick.com/yourview", "https://kick.com/yourview"],
    [
      "https://www.kick.com/yourview?ref=test#player",
      "https://kick.com/yourview",
    ],
  ])("normaliza Kick %s", (value, expected) =>
    expect(normalizeKickUrl(value)).toMatchObject({
      valid: true,
      url: expected,
    }),
  );

  it.each([
    undefined,
    "",
    "https://kick.com.evil.test/yourview",
    "javascript:alert(1)",
    "http://kick.com/yourview",
  ])("rechaza Kick inseguro o no preparado: %s", (value) =>
    expect(normalizeKickUrl(value).valid).toBe(false),
  );

  it("analiza URL sin propagar Invalid URL", () => {
    expect(safeParseUrl(undefined)).toBeNull();
    expect(safeParseUrl("yourview")).toBeNull();
  });

  it("distingue las URLs todavía no disponibles", () => {
    expect(inspectKickUrl(undefined, "tab.url")).toMatchObject({
      success: false,
      errorCode: "TAB_URL_NOT_READY",
      urlReady: false,
    });
    expect(inspectKickUrl("", "webContents.getURL")).toMatchObject({
      success: false,
      errorCode: "URL_NOT_READY",
      urlReady: false,
    });
  });

  it("reintenta tab.url de forma limitada durante la carga", async () => {
    const values = [undefined, "", "https://kick.com/yourview"];
    const result = await waitForKickUrl(async () => values.shift(), 3, 0);
    expect(result).toMatchObject({
      success: true,
      canonicalUrl: "https://kick.com/yourview",
      urlSource: "tab.url",
    });
    await expect(
      waitForKickUrl(async () => undefined, 2, 0),
    ).resolves.toMatchObject({
      success: false,
      errorCode: "TAB_URL_NOT_READY",
    });
  });
});
