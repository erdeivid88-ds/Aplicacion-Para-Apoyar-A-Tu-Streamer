import type {
  AppState,
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
      connectTwitch: (type: TwitchAccountType) => Promise<void>;
      disconnectBot: () => Promise<void>;
      cancelTwitchConnect: () => Promise<void>;
      openTwitchDevice: () => Promise<void>;
      switchTwitchType: (type: TwitchAccountType) => Promise<void>;
      checkTwitchPermissions: () => Promise<void>;
      saveStreamer: (value: Partial<Streamer>) => Promise<void>;
      deleteStreamer: (id: string) => Promise<void>;
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
