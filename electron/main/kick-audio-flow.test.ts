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

  it("registra la tab antes de responder open y usa el mismo registro para audio", () => {
    const worker = readFileSync("browser-extension/service-worker.ts", "utf8");
    const registerAt = worker.indexOf("await registry.register(item)");
    const openedAt = worker.indexOf(
      "response(m, true, { ...item, created: true })",
    );
    expect(registerAt).toBeGreaterThan(0);
    expect(openedAt).toBeGreaterThan(registerAt);
    expect(worker).toContain("registry.getManagedTab(");
    expect(worker).not.toContain('throw new Error("not_managed")');
  });

  it("espera readiness antes de asegurar audio y no sintetiza M", () => {
    const readyAt = worker.indexOf("await readyKickTab");
    const audioAt = worker.indexOf("configureManagedKickPlayback", readyAt);
    expect(readyAt).toBeGreaterThan(0);
    expect(audioAt).toBeGreaterThan(readyAt);
    expect(worker).not.toContain("KeyboardEvent");
    expect(worker).not.toContain('keyCode: "M"');
  });

  it("comprueba estado, intenta DOM y solo después el botón semántico", () => {
    const player = worker.slice(
      worker.indexOf("async function configureKickPlayer"),
      worker.indexOf("async function onMessage"),
    );
    const alreadyReadyAt = player.indexOf("alreadyReady");
    const domAt = player.indexOf("video.muted = false");
    const semanticAt = player.indexOf("buttonIndicatesMuted");
    const clickAt = player.indexOf("muteButton.click()");
    expect(alreadyReadyAt).toBeGreaterThan(0);
    expect(domAt).toBeGreaterThan(alreadyReadyAt);
    expect(semanticAt).toBeGreaterThan(domAt);
    expect(clickAt).toBeGreaterThan(semanticAt);
    expect(player).toContain("domUnmuteAttempted");
    expect(player).toContain("buttonUnmuteAttempted");
  });

  it("no emite el resumen heredado para Kick y conserva Twitch", () => {
    expect(main).toContain(
      'opened.mode !== "system" && current.platform !== "kick"',
    );
    expect(main).toContain('previous.platform === "twitch"');
  });
});
