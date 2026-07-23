import { defaults, type AppState, type Settings } from "./types";
export function migrateSettings110(raw: Partial<AppState>): Settings {
  const previous = raw.settings as Partial<Settings> | undefined;
  const configured = Boolean(
    raw.streamers?.length || previous?.platforms?.twitch?.clientId,
  );
  const upgrading = (raw.schemaVersion ?? 0) < 5;
  return {
    ...defaults.settings,
    ...previous,
    platforms: { ...defaults.settings.platforms, ...previous?.platforms },
    onboardingCompleted: upgrading
      ? configured
      : (previous?.onboardingCompleted ?? false),
  };
}
