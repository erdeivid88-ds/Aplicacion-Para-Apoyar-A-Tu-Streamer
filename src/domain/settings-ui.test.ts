import { describe, expect, it } from "vitest";
import { defaults } from "./types";
import {
  MONITOR_LABELS,
  SETTINGS_CATEGORIES,
  mergeSettingsPatch,
  validateSettings,
} from "./settings-ui";
describe("interfaz de ajustes", () => {
  it("incluye nueve categorías", () =>
    expect(SETTINGS_CATEGORIES).toHaveLength(9));
  it("traduce estados internos", () =>
    expect(MONITOR_LABELS["partial-error"]).toBe("⚠️ Activo con errores"));
  it("valida intervalos", () =>
    expect(
      validateSettings({ ...defaults.settings, scanMinutes: 1 }),
    ).not.toHaveLength(0));
  it("incluye datos y privacidad", () =>
    expect(SETTINGS_CATEGORIES).toContain("Datos y privacidad"));
  it("permite navegación ordenada", () =>
    expect(SETTINGS_CATEGORIES[0]).toBe("General"));
  it("conserva extension al guardar otra preferencia", () => {
    const current = {
      ...defaults.settings,
      browserMode: "extension" as const,
    };
    expect(mergeSettingsPatch(current, { notifications: false })).toMatchObject(
      {
        browserMode: "extension",
        notifications: false,
      },
    );
  });
  it("persiste extension tras reiniciar y aplicar autosave", () => {
    const saved = mergeSettingsPatch(defaults.settings, {
      browserMode: "extension",
    });
    expect(saved.browserMode).toBe("extension");
    expect(mergeSettingsPatch(saved, { theme: "dark" }).browserMode).toBe(
      "extension",
    );
  });
});
