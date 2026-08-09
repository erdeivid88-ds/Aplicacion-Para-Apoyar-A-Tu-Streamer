import { describe, expect, it, vi } from "vitest";
import {
  configureManagedKickPlayback,
  type KickPlayerActivation,
} from "./kick-playback";

const player = (ready = true): KickPlayerActivation => ({
  playerFound: ready,
  playerMutedBefore: true,
  playerMutedAfter: ready ? false : true,
  playerVolumeBefore: 0,
  playerVolumeAfter: ready ? 1 : 0,
  muteButtonFound: true,
  muteButtonClicked: true,
  playbackReady: ready,
  attempts: 2,
});

describe("salida administrada de Kick", () => {
  it.each(["browserTab", "webContents"] as const)(
    "activa primero el player y después silencia %s",
    async (output) => {
      const order: string[] = [];
      let muted = false;
      const result = await configureManagedKickPlayback(
        output,
        async () => {
          order.push("player-unmuted");
          return player();
        },
        async () => {
          order.push("output-muted");
          muted = true;
        },
        () => muted,
      );
      expect(order).toEqual(["player-unmuted", "output-muted"]);
      expect(result).toMatchObject({
        playerMutedAfter: false,
        playerVolumeAfter: 1,
        success: true,
      });
    },
  );

  it("no silencia la salida ni declara éxito cuando falla el player", async () => {
    const mute = vi.fn();
    const result = await configureManagedKickPlayback(
      "browserTab",
      async () => player(false),
      mute,
      () => false,
    );
    expect(mute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      errorCode: "PLAYER_NOT_FOUND",
    });
  });

  it("comprueba el mute de salida y devuelve TAB_MUTE_FAILED", async () => {
    const result = await configureManagedKickPlayback(
      "browserTab",
      async () => player(),
      vi.fn(),
      () => false,
    );
    expect(result).toMatchObject({
      playerMutedAfter: false,
      browserTabMutedAfter: false,
      success: false,
      errorCode: "TAB_MUTE_FAILED",
    });
  });
});
