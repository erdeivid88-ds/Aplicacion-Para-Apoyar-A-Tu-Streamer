import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("integración de audio Kick", () => {
  const worker = readFileSync("browser-extension/service-worker.ts", "utf8");
  const main = readFileSync("electron/main/index.ts", "utf8");

  it("inyecta una rutina autocontenida sin construir URLs", () => {
    const injected = worker.slice(
      worker.indexOf("async function configureKickPlayer"),
      worker.indexOf("async function onMessage"),
    );
    expect(injected).toContain("location.protocol");
    expect(injected).toContain("location.hostname");
    expect(injected).not.toContain("new URL(");
    expect(injected).not.toContain("visualMuted");
  });

  it("envía audio solo con tabId, enabled y targetVolume", () => {
    const request = main.slice(
      main.indexOf('extensionClient.request("configure_audio"'),
      main.indexOf("if (audio.audioConfigured)"),
    );
    expect(request).toContain("tabId: opened.tabId");
    expect(request).toContain("targetVolume:");
    expect(request).not.toContain("canonicalUrl");
    expect(request).not.toContain("slug");
    expect(request).not.toContain("url:");
  });

  it("no emite el resumen heredado para Kick y conserva Twitch", () => {
    expect(main).toContain(
      'opened.mode !== "system" && current.platform !== "kick"',
    );
    expect(main).toContain('previous.platform === "twitch"');
  });
});
