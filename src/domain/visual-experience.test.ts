import { describe, expect, it } from "vitest";
import {
  resolveStartupSurface,
  shouldShowUpdateModal,
} from "./visual-experience";

describe("experiencia visual de arranque", () => {
  it("muestra onboarding en una instalación nueva", () => {
    expect(
      resolveStartupSurface({
        onboardingCompleted: false,
        lastSeenVersion: "",
        currentVersion: "1.1.1",
        manualReplay: false,
      }),
    ).toBe("onboarding");
  });
  it("entra directamente para un usuario existente en la misma versión", () => {
    expect(
      resolveStartupSurface({
        onboardingCompleted: true,
        lastSeenVersion: "1.1.1",
        currentVersion: "1.1.1",
        manualReplay: false,
      }),
    ).toBe("application");
  });
  it("muestra novedades después de actualizar", () => {
    expect(
      resolveStartupSurface({
        onboardingCompleted: true,
        lastSeenVersion: "1.1.0",
        currentVersion: "1.1.1",
        manualReplay: false,
      }),
    ).toBe("whats-new");
  });
  it("repite la guía sin cambiar la configuración recibida", () => {
    const settings = { onboardingCompleted: true, lastSeenVersion: "1.1.1" };
    expect(
      resolveStartupSurface({
        ...settings,
        currentVersion: "1.1.1",
        manualReplay: true,
      }),
    ).toBe("onboarding");
    expect(settings).toEqual({
      onboardingCompleted: true,
      lastSeenVersion: "1.1.1",
    });
  });
  it.each(["available", "downloading", "ready"] as const)(
    "centra el modal de update en estado %s",
    (status) => {
      expect(
        shouldShowUpdateModal("application", {
          version: "1.1.1",
          packaged: true,
          installable: true,
          status,
          availableVersion: "1.2.0",
        }),
      ).toBe(true);
    },
  );
  it("no superpone update al onboarding", () => {
    expect(
      shouldShowUpdateModal("onboarding", {
        version: "1.1.1",
        packaged: true,
        installable: true,
        status: "available",
        availableVersion: "1.2.0",
      }),
    ).toBe(false);
  });
});
