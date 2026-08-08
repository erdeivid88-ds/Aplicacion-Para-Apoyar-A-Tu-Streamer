import { describe, expect, it } from "vitest";
import { beginMonitorSession } from "./monitor";
import { defaultAutomation, defaultRuntime, type Streamer } from "./types";
import { decideAutomation, recordSuccess } from "./automation";

const live = (): Streamer => ({
  id: "42", platform: "kick", displayName: "Canal", normalizedName: "canal",
  externalId: "123", url: "https://kick.com/canal", enabled: true, live: true,
  sessionId: "stream-y", openedSessionId: "stream-y",
  automation: { ...defaultAutomation("kick"), enabled: true, authorized: true, authorizedAt: "now" },
  automationRuntime: { ...defaultRuntime(), sessionId: "stream-y", monitorSessionId: "A", initialSent: true, sentCount: 1 },
});

describe("sesiones del monitor", () => {
  it("permite el mismo directo en una sesión nueva sin conservar deduplicación", () => {
    const [next] = beginMonitorSession([live()], "B");
    expect(next.openedSessionId).toBeUndefined();
    expect(next.automationRuntime).toMatchObject({ sessionId: "stream-y", monitorSessionId: "B", initialSent: false, sentCount: 0 });
  });
  it("no muta la sesión existente", () => {
    const current = live();
    beginMonitorSession([current], "B");
    expect(current.automationRuntime.monitorSessionId).toBe("A");
  });
  it("deduplica en A pero vuelve a permitir el mensaje en B", () => {
    const streamer = live();
    expect(decideAutomation(streamer, Date.now(), "A").send).toBe(false);
    const [sessionB] = beginMonitorSession([streamer], "B");
    const decision = decideAutomation(sessionB, Date.now(), "B");
    expect(decision.send).toBe(true);
    sessionB.automationRuntime = recordSuccess(decision.runtime, "now");
    expect(decideAutomation(sessionB, Date.now(), "B").send).toBe(false);
  });
});
