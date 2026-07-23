import type {
  AppState,
  Platform,
  Settings,
  Streamer,
  TwitchAccountType,
} from "./domain/types";
declare global {
  interface Window {
    api: {
      state: () => Promise<AppState>;
      onState: (callback: (state: AppState) => void) => () => void;
      start: () => Promise<void>;
      stop: () => Promise<void>;
      forceStop: () => Promise<void>;
      scan: () => Promise<void>;
      checkExtension: () => Promise<void>;
      testExtension: () => Promise<void>;
      muteExtensionTabs: () => Promise<void>;
      closeExtensionTabs: () => Promise<void>;
      detectBrowsers: () => Promise<{ chrome: boolean; edge: boolean }>;
      developmentExtensionPath: () => Promise<string>;
      openExtensionSettings: (browser: "chrome" | "edge") => Promise<{ opened: boolean; address: string }>;
      registerNativeHost: (browser: "chrome" | "edge") => Promise<{ registered: boolean }>;
      unregisterNativeHost: (browser: "chrome" | "edge") => Promise<void>;
      diagnoseNativeHost: (browser: "chrome" | "edge") => Promise<{ registered: boolean }>;
      connectTwitch: (type: TwitchAccountType) => Promise<void>;
      disconnectBot: () => Promise<void>;
      cancelTwitchConnect: () => Promise<void>;
      openTwitchDevice: () => Promise<void>;
      switchTwitchType: (type: TwitchAccountType) => Promise<void>;
      checkTwitchPermissions: () => Promise<void>;
      saveStreamer: (value: Partial<Streamer>) => Promise<void>;
      resolveStreamer: (
        platform: Platform,
        value: string,
      ) => Promise<{
        externalId: string;
        login: string;
        displayName: string;
        avatar?: string;
      }>;
      deleteStreamer: (id: string) => Promise<void>;
      retryStream: (id: string) => Promise<void>;
      cancelReopen: (id: string) => Promise<void>;
      saveSettings: (value: Partial<Settings>) => Promise<void>;
      open: (url: string) => Promise<void>;
      copy: (text: string) => Promise<void>;
      clearActivity: () => Promise<void>;
      exportData: () => Promise<void>;
      importData: () => Promise<void>;
    };
  }
}
export {};
