import { describe, expect, it, vi } from "vitest";
import { waitForKickTabReady } from "./kick-tab-ready";

function event<T extends (...args: any[]) => void>() {
  const listeners = new Set<T>();
  return {
    addListener: (listener: T) => listeners.add(listener),
    removeListener: (listener: T) => listeners.delete(listener),
    emit: (...args: Parameters<T>) =>
      [...listeners].forEach((item) => item(...args)),
    size: () => listeners.size,
  };
}

describe("waitForKickTabReady", () => {
  it("espera la URL y status complete de la pestaña esperada", async () => {
    const onUpdated = event<any>();
    const onRemoved = event<any>();
    const pending = waitForKickTabReady(7, 1000, {
      getTab: vi.fn().mockResolvedValue({ id: 7 }),
      onUpdated,
      onRemoved,
    });
    await Promise.resolve();
    onUpdated.emit(
      8,
      { status: "complete" },
      { id: 8, url: "https://kick.com/other", status: "complete" },
    );
    onUpdated.emit(
      7,
      { url: "https://kick.com/yourview" },
      { id: 7, url: "https://kick.com/yourview", status: "loading" },
    );
    onUpdated.emit(
      7,
      { status: "complete" },
      { id: 7, url: "https://kick.com/yourview", status: "complete" },
    );
    await expect(pending).resolves.toMatchObject({
      tabUrlReady: true,
      documentComplete: true,
    });
    expect(onUpdated.size()).toBe(0);
    expect(onRemoved.size()).toBe(0);
  });

  it("devuelve inmediatamente una pestaña ya lista", async () => {
    const onUpdated = event<any>();
    const onRemoved = event<any>();
    await expect(
      waitForKickTabReady(7, 1000, {
        getTab: async () => ({
          id: 7,
          url: "https://www.kick.com/yourview",
          status: "complete",
        }),
        onUpdated,
        onRemoved,
      }),
    ).resolves.toMatchObject({ documentComplete: true });
    expect(onUpdated.size()).toBe(0);
  });

  it("limpia listeners al agotar timeout", async () => {
    vi.useFakeTimers();
    const onUpdated = event<any>();
    const onRemoved = event<any>();
    const pending = waitForKickTabReady(7, 100, {
      getTab: async () => ({ id: 7 }),
      onUpdated,
      onRemoved,
    });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).rejects.toThrow("TAB_READY_TIMEOUT");
    expect(onUpdated.size()).toBe(0);
    expect(onRemoved.size()).toBe(0);
    vi.useRealTimers();
  });

  it("detecta cierre y limpia listeners", async () => {
    const onUpdated = event<any>();
    const onRemoved = event<any>();
    const pending = waitForKickTabReady(7, 1000, {
      getTab: async () => ({ id: 7 }),
      onUpdated,
      onRemoved,
    });
    await Promise.resolve();
    onRemoved.emit(7);
    await expect(pending).rejects.toThrow("TAB_CLOSED");
    expect(onUpdated.size()).toBe(0);
    expect(onRemoved.size()).toBe(0);
  });

  it("ignora una URL transitoria y rechaza una URL final no Kick", async () => {
    const onUpdated = event<any>();
    const onRemoved = event<any>();
    const pending = waitForKickTabReady(7, 1000, {
      getTab: async () => ({
        id: 7,
        url: "chrome://newtab/",
        status: "loading",
      }),
      onUpdated,
      onRemoved,
    });
    await Promise.resolve();
    onUpdated.emit(
      7,
      { status: "complete" },
      {
        id: 7,
        url: "https://example.com/",
        status: "complete",
      },
    );
    await expect(pending).rejects.toThrow("NOT_KICK_TAB");
    expect(onUpdated.size()).toBe(0);
    expect(onRemoved.size()).toBe(0);
  });
});
