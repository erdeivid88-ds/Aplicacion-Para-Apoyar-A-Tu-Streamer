import { describe, expect, it } from "vitest";
import {
  decideAutomation,
  formatAutomationSuccess,
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
  it("acepta límites superiores a cinco hasta 9999", () => {
    expect(normalizeAutomation({ maxPerStream: 100 }).maxPerStream).toBe(100);
    expect(normalizeAutomation({ maxPerStream: 9999 }).maxPerStream).toBe(9999);
    expect(normalizeAutomation({ maxPerStream: 10000 }).maxPerStream).toBe(
      9999,
    );
  });
  it("conserva el límite antiguo de cinco", () =>
    expect(normalizeAutomation({ maxPerStream: 5 }).maxPerStream).toBe(5));
  it("representa sin límite con null", () =>
    expect(
      normalizeAutomation({ maxPerStream: null }).maxPerStream,
    ).toBeNull());
  it("conserva el último límite al activar el modo ilimitado", () =>
    expect(
      normalizeAutomation({
        maxPerStream: null,
        lastLimitedMaxPerStream: 20,
      }).lastLimitedMaxPerStream,
    ).toBe(20));
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
  it("respeta un límite de un mensaje", () => {
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: "2026-01-01",
        repeat: true,
        maxPerStream: 1,
      },
      automationRuntime: {
        ...defaultRuntime(),
        sessionId: "live-1",
        initialSent: true,
        sentCount: 1,
      },
    });
    expect(decideAutomation(c, Date.now()).reason).toBe("maximum");
  });
  it("no se detiene por contador en modo sin límite", () => {
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: "2026-01-01",
        repeat: true,
        maxPerStream: null,
      },
      automationRuntime: {
        ...defaultRuntime(),
        sessionId: "live-1",
        initialSent: true,
        sentCount: 100,
        lastSentAt: "2026-01-01",
      },
    });
    expect(decideAutomation(c, Date.now()).send).toBe(true);
  });
  it.each([
    [["A"], ["A", "A", "A", "A"]],
    [
      ["A", "B"],
      ["A", "B", "A", "B"],
    ],
    [
      ["A", "B", "C"],
      ["A", "B", "C", "A", "B", "C"],
    ],
  ])("rota de forma cíclica %#", (texts, expected) => {
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: "2026-01-01",
        repeat: true,
        maxPerStream: null,
        automaticMessages: texts.map((text) => ({ id: text, text })),
      },
    });
    const actual: string[] = [];
    for (let sentCount = 0; sentCount < expected.length; sentCount++) {
      c.automationRuntime = {
        ...defaultRuntime(),
        sessionId: "live-1",
        initialSent: sentCount > 0,
        sentCount,
        lastSentAt: "2026-01-01",
      };
      actual.push(decideAutomation(c, Date.now()).message!.text);
    }
    expect(actual).toEqual(expected);
  });
  it("rota 200 mensajes y vuelve al primero", () => {
    const messages = Array.from({ length: 200 }, (_, index) => ({
      id: String(index + 1),
      text: String(index + 1),
    }));
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: "2026-01-01",
        repeat: true,
        maxPerStream: null,
        automaticMessages: messages,
      },
      automationRuntime: {
        ...defaultRuntime(),
        sessionId: "live-1",
        initialSent: true,
        sentCount: 200,
        lastSentAt: "2026-01-01",
      },
    });
    expect(decideAutomation(c, Date.now()).message?.text).toBe("1");
  });
  it("limita el número total de envíos, no los ciclos", () => {
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: "2026-01-01",
        repeat: true,
        maxPerStream: 5,
        automaticMessages: ["A", "B", "C"].map((text) => ({ id: text, text })),
      },
      automationRuntime: {
        ...defaultRuntime(),
        sessionId: "live-1",
        initialSent: true,
        sentCount: 4,
        lastSentAt: "2026-01-01",
      },
    });
    expect(decideAutomation(c, Date.now()).message?.text).toBe("B");
    c.automationRuntime.sentCount = 5;
    expect(decideAutomation(c, Date.now()).reason).toBe("maximum");
  });
  it("migra el mensaje legacy sin perderlo y de forma idempotente", () => {
    const migrated = normalizeAutomation({ message: "Hola" });
    expect(migrated.automaticMessages).toHaveLength(1);
    expect(migrated.automaticMessages[0].text).toBe("Hola");
    expect(normalizeAutomation(migrated).automaticMessages).toEqual(
      migrated.automaticMessages,
    );
  });
  it("espera el intervalo antes del primer mensaje si se desactiva el envío al entrar", () => {
    const now = Date.now();
    const c = channel({
      automation: {
        ...defaultAutomation(),
        enabled: true,
        authorized: true,
        authorizedAt: "2026-01-01",
        sendOnStart: false,
      },
      automationRuntime: {
        ...defaultRuntime(),
        sessionId: "live-1",
        startedAt: new Date(now - 15 * 60000).toISOString(),
      },
    });
    expect(decideAutomation(c, now).message?.text).toBe(
      defaultAutomation().message,
    );
    expect(decideAutomation(c, now).send).toBe(true);
  });
  it("formatea Activity con y sin límite", () => {
    expect(formatAutomationSuccess(1, 5, 1, 3)).toBe(
      "Mensaje automático 2/3 enviado (1/5).",
    );
    expect(formatAutomationSuccess(6, null, 1, 3)).toBe(
      "Mensaje automático 2/3 enviado · envío #6.",
    );
  });
  it("pausa tras tres errores", () => {
    let r = defaultRuntime();
    r = recordFailure(recordFailure(recordFailure(r)));
    expect(r.paused).toBe(true);
  });
  it("Kick no está disponible", () =>
    expect(
      decideAutomation(
        channel({
          platform: "kick",
          automation: {
            ...defaultAutomation(),
            enabled: true,
            authorized: true,
            authorizedAt: new Date().toISOString(),
          },
        }),
        Date.now(),
      ).send,
    ).toBe(true));
});
