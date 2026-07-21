import { describe, expect, it } from "vitest";
import { completedStopState, MonitorControl } from "./monitor-control";
describe("apagado robusto del monitor", () => {
  it("apaga desde activo", () => {
    const m = new MonitorControl();
    m.start();
    m.stop();
    expect(m.status).toBe("off");
  });
  it("apaga desde checking", () => {
    const m = new MonitorControl();
    m.start();
    m.checking();
    m.stop();
    expect(m.status).toBe("off");
  });
  it("invalida un barrido tardío", () => {
    const m = new MonitorControl();
    const generation = m.start();
    m.checking();
    m.stop();
    expect(m.isCurrent(generation)).toBe(false);
  });
  it("elimina nextScan y timers", () => {
    const m = new MonitorControl();
    m.start();
    m.nextScan = "soon";
    m.timers = 2;
    m.stop();
    expect(m.nextScan).toBeUndefined();
    expect(m.timers).toBe(0);
  });
  it("cancela automatizaciones", () => {
    const m = new MonitorControl();
    m.start();
    m.automations = 3;
    m.stop();
    expect(m.automations).toBe(0);
  });
  it("apagado manual bloquea inactividad", () => {
    const m = new MonitorControl();
    m.start();
    m.stop();
    expect(m.canAutoStart(false)).toBe(false);
  });
  it("encendido manual limpia manuallyStopped", () => {
    const m = new MonitorControl();
    m.start();
    m.stop();
    m.start();
    expect(m.manuallyStopped).toBe(false);
  });
  it("admite parada forzada", () => {
    const m = new MonitorControl();
    m.start();
    expect(m.stop(true)).toBe(true);
  });
  it("crea el estado final persistible sin nextScan", () => {
    const final = completedStopState(
      {
        status: "stopping",
        nextScan: "2026-07-22T10:00:00.000Z",
        errors: [],
      },
      true,
    );
    expect(final).toEqual({ status: "off", errors: [], manuallyStopped: true });
    expect("nextScan" in final).toBe(false);
  });
});
