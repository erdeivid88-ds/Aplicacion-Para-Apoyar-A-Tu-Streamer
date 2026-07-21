import { describe, expect, it, vi } from "vitest";
import { openOrReuseManaged } from "./managed-window";

function fake(loadFails = false) {
  let muted = false;
  const listeners: Record<string, () => void> = {};
  return {
    listeners,
    w: {
      webContents: {
        setAudioMuted: vi.fn((value: boolean) => (muted = value)),
        isAudioMuted: () => muted,
        on: (event: string, listener: () => void) =>
          (listeners[event] = listener),
      },
      isDestroyed: () => false,
      show: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      loadURL: vi.fn(async () => {
        if (loadFails) throw new Error("load failed");
      }),
    },
  };
}

describe("navegador gestionado", () => {
  it("silencia antes de cargar y solo muestra tras cargar", async () => {
    const item = fake();
    await openOrReuseManaged(undefined, () => item.w, "https://twitch.tv/test");
    expect(item.w.webContents.setAudioMuted).toHaveBeenCalledBefore(
      item.w.loadURL,
    );
    expect(item.w.loadURL).toHaveBeenCalledBefore(item.w.show);
    item.listeners["did-finish-load"]();
    expect(item.w.webContents.isAudioMuted()).toBe(true);
  });
  it("reutiliza y enfoca la ventana existente", async () => {
    const item = fake();
    const create = vi.fn(() => fake().w);
    expect(
      await openOrReuseManaged(item.w, create, "https://twitch.tv/test"),
    ).toBe(item.w);
    expect(create).not.toHaveBeenCalled();
    expect(item.w.focus).toHaveBeenCalled();
  });
  it("cierra una ventana nueva si la carga falla", async () => {
    const item = fake(true);
    await expect(
      openOrReuseManaged(undefined, () => item.w, "https://twitch.tv/test"),
    ).rejects.toThrow("load failed");
    expect(item.w.close).toHaveBeenCalled();
    expect(item.w.show).not.toHaveBeenCalled();
  });
});
