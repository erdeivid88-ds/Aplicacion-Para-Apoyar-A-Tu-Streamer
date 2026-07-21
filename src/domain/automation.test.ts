import { describe, expect, it } from "vitest";
import {
  decideAutomation,
  normalizeAutomation,
  recordFailure,
  recordSuccess,
} from "./automation";
import { defaultAutomation, defaultRuntime, type Streamer } from "./types";
const channel = (patch: Partial<Streamer> = {}): Streamer => ({
  id: "1",
  platform: "twitch",
  displayName: "Bot Test",
  normalizedName: "bot_test",
  externalId: "10",
  url: "https://twitch.tv/bot_test",
  enabled: true,
  live: true,
  sessionId: "live-1",
  automation: defaultAutomation(),
  automationRuntime: defaultRuntime(),
  ...patch,
});
describe("mensajería automática", () => {
  it("está desactivada por defecto", () =>
    expect(decideAutomation(channel(), Date.now()).reason).toBe("disabled"));
  it("rechaza canal sin autorización", () =>
    expect(
      decideAutomation(
        channel({ automation: { ...defaultAutomation(), enabled: true } }),
        Date.now(),
      ).reason,
    ).toBe("unauthorized"));
  it("envía el inicial una sola vez", () => {
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: new Date().toISOString(),
      },
    });
    const d = decideAutomation(c, Date.now());
    expect(d.send).toBe(true);
    c.automationRuntime = recordSuccess(d.runtime, new Date().toISOString());
    expect(decideAutomation(c, Date.now()).send).toBe(false);
  });
  it("impone intervalo mínimo", () =>
    expect(normalizeAutomation({ intervalMinutes: 1 }).intervalMinutes).toBe(
      15,
    ));
  it("impone máximo por directo", () =>
    expect(normalizeAutomation({ maxPerStream: 99 }).maxPerStream).toBe(5));
  it("previene duplicados y sobrevive reinicio mediante runtime persistido", () => {
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: "2026-01-01",
        repeat: true,
      },
      automationRuntime: {
        sessionId: "live-1",
        sentCount: 1,
        initialSent: true,
        lastSentAt: new Date().toISOString(),
        consecutiveErrors: 0,
        paused: false,
      },
    });
    expect(decideAutomation(c, Date.now()).reason).toBe("interval");
  });
  it("reinicia al terminar el directo", () =>
    expect(
      decideAutomation(channel({ live: false }), Date.now()).runtime.sentCount,
    ).toBe(0));
  it("se detiene en cinco", () => {
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: "2026-01-01",
        repeat: true,
      },
      automationRuntime: {
        sessionId: "live-1",
        sentCount: 5,
        initialSent: true,
        lastSentAt: "2026-01-01",
        consecutiveErrors: 0,
        paused: false,
      },
    });
    expect(decideAutomation(c, Date.now()).reason).toBe("maximum");
  });
  it("pausa tras tres errores", () => {
    let r = defaultRuntime();
    r = recordFailure(recordFailure(recordFailure(r)));
    expect(r.paused).toBe(true);
  });
  it("Kick no está disponible", () =>
    expect(
      decideAutomation(channel({ platform: "kick" }), Date.now()).reason,
    ).toBe("kick-unavailable"));
});
