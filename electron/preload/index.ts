import { contextBridge, ipcRenderer } from "electron";
import type {
  AppState,
  Settings,
  Streamer,
  TwitchAccountType,
} from "../../src/domain/types";
contextBridge.exposeInMainWorld("api", {
  state: (): Promise<AppState> => ipcRenderer.invoke("state:get"),
  onState: (callback: (state: AppState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) =>
      callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  start: () => ipcRenderer.invoke("monitor:start"),
  stop: () => ipcRenderer.invoke("monitor:stop"),
  forceStop: () => ipcRenderer.invoke("monitor:force-stop"),
  scan: () => ipcRenderer.invoke("monitor:scan"),
  checkExtension: () => ipcRenderer.invoke("extension:ping"),
  testExtension: () => ipcRenderer.invoke("extension:test-open"),
  muteExtensionTabs: () => ipcRenderer.invoke("extension:mute-all"),
  closeExtensionTabs: () => ipcRenderer.invoke("extension:close-all"),
  connectTwitch: (type: TwitchAccountType) =>
    ipcRenderer.invoke("bot:connect", type),
  disconnectBot: () => ipcRenderer.invoke("bot:disconnect"),
  cancelTwitchConnect: () => ipcRenderer.invoke("bot:cancel-connect"),
  openTwitchDevice: () => ipcRenderer.invoke("bot:open-device"),
  switchTwitchType: (type: TwitchAccountType) =>
    ipcRenderer.invoke("bot:switch-type", type),
  checkTwitchPermissions: () => ipcRenderer.invoke("bot:check"),
  saveStreamer: (value: Partial<Streamer>) =>
    ipcRenderer.invoke("streamer:save", value),
  deleteStreamer: (id: string) => ipcRenderer.invoke("streamer:delete", id),
  saveSettings: (value: Partial<Settings>) =>
    ipcRenderer.invoke("settings:save", value),
  open: (url: string) => ipcRenderer.invoke("external:open", url),
  copy: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  clearActivity: () => ipcRenderer.invoke("activity:clear"),
  exportData: () => ipcRenderer.invoke("data:export"),
  importData: () => ipcRenderer.invoke("data:import"),
});
