export type Platform = "twitch" | "kick";
export type MonitorStatus =
  "off" | "starting" | "checking" | "active" | "paused" | "partial-error";
export type BotStatus =
  | "connected"
  | "disconnected"
  | "expired"
  | "insufficient-permissions"
  | "unauthorized-channel"
  | "rate-limited"
  | "paused";
export const DEFAULT_AUTO_MESSAGE =
  "🤖 Mensaje automático autorizado por el canal: recuerda seguir las normas del chat.";
export interface AutomationConfig {
  enabled: boolean;
  authorized: boolean;
  authorizedAt?: string;
  message: string;
  sendOnStart: boolean;
  repeat: boolean;
  intervalMinutes: number;
  maxPerStream: number;
}
export interface AutomationRuntime {
  sessionId?: string;
  sentCount: number;
  initialSent: boolean;
  lastSentAt?: string;
  consecutiveErrors: number;
  paused: boolean;
}
export interface Streamer {
  id: string;
  platform: Platform;
  displayName: string;
  normalizedName: string;
  externalId?: string;
  url: string;
  avatar?: string;
  enabled: boolean;
  live: boolean;
  title?: string;
  category?: string;
  lastCheckedAt?: string;
  openedAt?: string;
  sessionId?: string;
  openedSessionId?: string;
  lastError?: string;
  automation: AutomationConfig;
  automationRuntime: AutomationRuntime;
}
export interface Settings {
  scanMinutes: number;
  idleMinutes: number;
  autoStart: boolean;
  countdownSeconds: number;
  startup: boolean;
  startMinimized: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  browserMode: "default" | "managed";
  closeManagedTabs: boolean;
  theme: "light" | "dark" | "system";
  showStartNotice: boolean;
  platforms: Record<Platform, { enabled: boolean; clientId?: string }>;
}
export interface Activity {
  id: string;
  at: string;
  level: "info" | "warning" | "error";
  platform?: Platform;
  channel?: string;
  description: string;
}
export interface BotConnection {
  status: BotStatus;
  displayName?: string;
  userId?: string;
  expiresAt?: string;
  detail?: string;
}
export interface AppState {
  schemaVersion: number;
  settings: Settings;
  streamers: Streamer[];
  activity: Activity[];
  bot: BotConnection;
  monitor: {
    status: MonitorStatus;
    lastScan?: string;
    nextScan?: string;
    errors: string[];
  };
}
export const defaultAutomation = (): AutomationConfig => ({
  enabled: false,
  authorized: false,
  message: DEFAULT_AUTO_MESSAGE,
  sendOnStart: true,
  repeat: false,
  intervalMinutes: 15,
  maxPerStream: 5,
});
export const defaultRuntime = (): AutomationRuntime => ({
  sentCount: 0,
  initialSent: false,
  consecutiveErrors: 0,
  paused: false,
});
export const defaults: AppState = {
  schemaVersion: 2,
  settings: {
    scanMinutes: 15,
    idleMinutes: 10,
    autoStart: true,
    countdownSeconds: 30,
    startup: false,
    startMinimized: false,
    minimizeToTray: true,
    notifications: true,
    browserMode: "default",
    closeManagedTabs: true,
    theme: "system",
    showStartNotice: true,
    platforms: { twitch: { enabled: false }, kick: { enabled: false } },
  },
  streamers: [],
  activity: [],
  bot: { status: "disconnected" },
  monitor: { status: "off", errors: [] },
};
