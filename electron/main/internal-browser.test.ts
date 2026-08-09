import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: class {},
  WebContentsView: class {},
}));
describe("navegador interno con pestañas", () => {
  it("define una única ventana y WebContentsView", async () => {
    const source = await readFile("electron/main/internal-browser.ts", "utf8");
    expect(source).toContain("internalBrowserWindow");
    expect(source).toContain("new WebContentsView");
    expect(source.match(/new BrowserWindow/g)).toHaveLength(1);
    expect(source).not.toContain("BrowserView");
    expect(source).toMatch(/backgroundThrottling:\s*false/);
  });
  it("usa M solo como fallback interno verificado y con foco", async () => {
    const source = await readFile("electron/main/internal-browser.ts", "utf8");
    const shortcut = source.slice(
      source.indexOf("export async function toggleKickMuteWithShortcut"),
      source.indexOf("function kickAudioScript"),
    );
    expect(shortcut).toContain('keyCode: "M"');
    expect(shortcut).toContain('type: "keyDown"');
    expect(shortcut).toContain('type: "keyUp"');
    expect(shortcut).toContain("playerMutedAfter === false");
    expect(shortcut).toContain("KICK_SHORTCUT_UNMUTE_FAILED");
    expect(source).toContain("this.internalBrowserWindow?.isFocused()");
    expect(source.indexOf("kickAudioScript(safeVolume)")).toBeLessThan(
      source.indexOf(
        "toggleKickMuteWithShortcut(",
        source.indexOf("kickAudioScript(safeVolume)"),
      ),
    );
  });

  it("no manda M si el reproductor ya está activo", async () => {
    const { toggleKickMuteWithShortcut } = await import("./internal-browser");
    const sendInputEvent = vi.fn();
    const result = await toggleKickMuteWithShortcut(
      {
        getURL: () => "https://kick.com/yourview",
        isDestroyed: () => false,
        sendInputEvent,
        executeJavaScript: vi.fn().mockResolvedValue({
          playerFound: true,
          playerMutedAfter: false,
          playerVolumeAfter: 1,
          playbackReady: true,
        }),
      },
      true,
    );
    expect(sendInputEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      shortcutAttempted: false,
      shortcutResult: "not_needed",
    });
  });

  it("manda M una vez y comprueba el estado posterior", async () => {
    vi.useFakeTimers();
    const { toggleKickMuteWithShortcut } = await import("./internal-browser");
    const sendInputEvent = vi.fn();
    const executeJavaScript = vi
      .fn()
      .mockResolvedValueOnce({
        playerFound: true,
        playerMutedAfter: true,
        playerVolumeAfter: 1,
      })
      .mockResolvedValueOnce({
        playerFound: true,
        playerMutedAfter: false,
        playerVolumeAfter: 1,
        playbackReady: true,
      });
    const pending = toggleKickMuteWithShortcut(
      {
        getURL: () => "https://kick.com/yourview",
        isDestroyed: () => false,
        sendInputEvent,
        executeJavaScript,
      },
      true,
    );
    await vi.advanceTimersByTimeAsync(150);
    await expect(pending).resolves.toMatchObject({
      shortcutAttempted: true,
      shortcutResult: "unmuted",
      playerMutedAfter: false,
    });
    expect(sendInputEvent.mock.calls).toEqual([
      [{ type: "keyDown", keyCode: "M" }],
      [{ type: "keyUp", keyCode: "M" }],
    ]);
    expect(executeJavaScript).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
