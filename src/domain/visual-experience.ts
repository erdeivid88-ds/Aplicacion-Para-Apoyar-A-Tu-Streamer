import type { UpdateState } from "./types";

export type StartupSurface = "onboarding" | "whats-new" | "application";

export function resolveStartupSurface(input: {
  onboardingCompleted: boolean;
  lastSeenVersion: string;
  currentVersion: string;
  manualReplay: boolean;
}): StartupSurface {
  if (input.manualReplay || !input.onboardingCompleted) return "onboarding";
  if (input.lastSeenVersion !== input.currentVersion) return "whats-new";
  return "application";
}

export function shouldShowUpdateModal(
  startupSurface: StartupSurface,
  update: UpdateState,
  dismissedVersion?: string,
) {
  return (
    startupSurface === "application" &&
    ["available", "downloading", "ready"].includes(update.status) &&
    dismissedVersion !== update.availableVersion
  );
}
