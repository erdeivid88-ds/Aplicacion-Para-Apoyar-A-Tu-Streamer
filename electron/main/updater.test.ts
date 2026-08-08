import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { AppUpdater } from "./updater";

class FakeUpdater extends EventEmitter {
  autoDownload = false; autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn(async () => undefined);
  quitAndInstall = vi.fn();
}

describe("actualizador", () => {
  it("no comprueba automáticamente en desarrollo", () => {
    const adapter = new FakeUpdater();
    const updater = new AppUpdater({ packaged: false, installable: false, version: "1.1.1", changed: vi.fn(), adapter: adapter as never, delayMs: 0 });
    updater.start();
    expect(adapter.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.state.version).toBe("1.1.1");
  });
  it("evita comprobaciones concurrentes y publica progreso/descarga", async () => {
    const adapter = new FakeUpdater();
    const updater = new AppUpdater({ packaged: true, installable: true, version: "1.1.1", changed: vi.fn(), adapter: adapter as never });
    await Promise.all([updater.check(), updater.check()]);
    expect(adapter.checkForUpdates).toHaveBeenCalledTimes(1);
    adapter.emit("update-available", { version: "1.1.2" });
    adapter.emit("download-progress", { percent: 45 });
    expect(updater.state).toMatchObject({ status: "downloading", progress: 45, availableVersion: "1.1.2" });
    adapter.emit("update-downloaded", { version: "1.1.2" });
    updater.install();
    expect(adapter.quitAndInstall).toHaveBeenCalledOnce();
  });
  it("publica sin actualización y errores", () => {
    const adapter = new FakeUpdater();
    const updater = new AppUpdater({ packaged: true, installable: true, version: "1.1.1", changed: vi.fn(), adapter: adapter as never });
    adapter.emit("update-not-available", {});
    expect(updater.state.status).toBe("current");
    adapter.emit("error", new Error("red"));
    expect(updater.state).toMatchObject({ status: "error", error: "red" });
  });
});
