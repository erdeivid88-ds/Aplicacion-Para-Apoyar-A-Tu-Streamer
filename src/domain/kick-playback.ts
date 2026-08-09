export type KickPlayerActivation = {
  playerFound: boolean;
  playerMutedBefore: boolean | null;
  playerMutedAfter: boolean | null;
  playerVolumeBefore: number | null;
  playerVolumeAfter: number | null;
  muteButtonFound: boolean;
  muteButtonClicked: boolean;
  playbackReady: boolean;
  attempts: number;
  errorCode?:
    "PLAYER_NOT_FOUND" | "PLAYER_UNMUTE_FAILED" | "KICK_SHORTCUT_UNMUTE_FAILED";
};

export type KickPlaybackResult = Omit<KickPlayerActivation, "errorCode"> & {
  browserTabMuted?: boolean;
  browserTabMutedBefore?: boolean;
  browserTabMutedAfter?: boolean;
  webContentsMutedBefore?: boolean;
  webContentsMutedAfter?: boolean;
  success: boolean;
  errorCode?:
    | "PLAYER_NOT_FOUND"
    | "PLAYER_UNMUTE_FAILED"
    | "KICK_SHORTCUT_UNMUTE_FAILED"
    | "TAB_MUTE_FAILED"
    | "WEB_CONTENTS_MUTE_FAILED";
};

export async function configureManagedKickPlayback(
  output: "browserTab" | "webContents",
  activatePlayer: () => Promise<KickPlayerActivation>,
  setOutputMuted: (muted: boolean) => Promise<void> | void,
  getOutputMuted: () => Promise<boolean> | boolean,
): Promise<KickPlaybackResult> {
  const outputBefore = await getOutputMuted();
  const player = await activatePlayer();
  const playerReady =
    player.playerFound &&
    player.playerMutedAfter === false &&
    (player.playerVolumeAfter ?? 0) > 0 &&
    player.playbackReady;
  if (!playerReady)
    return {
      ...player,
      ...(output === "browserTab"
        ? {
            browserTabMuted: outputBefore,
            browserTabMutedBefore: outputBefore,
            browserTabMutedAfter: outputBefore,
          }
        : {
            webContentsMutedBefore: outputBefore,
            webContentsMutedAfter: outputBefore,
          }),
      success: false,
      errorCode:
        player.errorCode ??
        (player.playerFound ? "PLAYER_UNMUTE_FAILED" : "PLAYER_NOT_FOUND"),
    };
  await setOutputMuted(true);
  const outputAfter = await getOutputMuted();
  return {
    ...player,
    ...(output === "browserTab"
      ? {
          browserTabMuted: outputAfter,
          browserTabMutedBefore: outputBefore,
          browserTabMutedAfter: outputAfter,
        }
      : {
          webContentsMutedBefore: outputBefore,
          webContentsMutedAfter: outputAfter,
        }),
    success: outputAfter,
    errorCode: outputAfter
      ? undefined
      : output === "browserTab"
        ? "TAB_MUTE_FAILED"
        : "WEB_CONTENTS_MUTE_FAILED",
  };
}
