import { describe, expect, it } from "vitest";
import { streamUrl, validateStreamUrl } from "./stream-url";

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
});
