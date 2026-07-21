import { describe, expect, it } from "vitest";
import { defaults } from "./types";
import {
  MONITOR_LABELS,
  SETTINGS_CATEGORIES,
  validateSettings,
} from "./settings-ui";
describe("interfaz de ajustes", () => {
  it("incluye ocho categorías", () =>
    expect(SETTINGS_CATEGORIES).toHaveLength(8));
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
});
