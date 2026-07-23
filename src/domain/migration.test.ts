import { describe, expect, it } from "vitest";
import { defaults } from "./types";
import { migrateSettings110 } from "./migration";
describe("migración 1.0.x a 1.1.0", () => {
  it("conserva preferencias y añade defaults", () => {
    const settings = migrateSettings110({
      settings: {
        ...defaults.settings,
        browserMode: "extension",
        scanMinutes: 20,
        onboardingCompleted: undefined as never,
      },
    });
    expect(settings.browserMode).toBe("extension");
    expect(settings.scanMinutes).toBe(20);
    expect(settings.reopenClosedStreams).toBe(true);
  });
  it("no muestra onboarding a perfiles existentes", () => {
    const legacy = { ...defaults.settings } as Partial<
      typeof defaults.settings
    >;
    delete legacy.onboardingCompleted;
    expect(
      migrateSettings110({
        settings: legacy as never,
        streamers: [{} as never],
      }).onboardingCompleted,
    ).toBe(true);
  });
});
