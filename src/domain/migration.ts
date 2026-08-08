import { defaults, type AppState, type BrowserMode, type Settings } from "./types";

export function normalizeBrowserMode(value: unknown): BrowserMode {
  if (value === "extension") return "extension";
  if (value === "internal" || value === "managed") return "internal";
  return "system";
}
export function migrateSettings110(raw: Partial<AppState>): Settings {
  const previous = raw.settings as Partial<Settings> | undefined;
  const configured = Boolean(
    raw.streamers?.length || previous?.platforms?.twitch?.clientId,
  );
  const upgrading = (raw.schemaVersion ?? 0) < 5;
  return {
    ...defaults.settings,
    ...previous,
    browserMode: normalizeBrowserMode(previous?.browserMode),
    kickAudioEnabled: previous?.kickAudioEnabled !== false,
    kickInitialVolume:
      typeof previous?.kickInitialVolume === "number"
        ? Math.min(1, Math.max(0, previous.kickInitialVolume))
        : 1,
    platforms: { ...defaults.settings.platforms, ...previous?.platforms },
    onboardingCompleted: upgrading
      ? configured
      : (previous?.onboardingCompleted ?? false),
  };
}
