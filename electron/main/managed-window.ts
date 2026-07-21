export interface ManagedWebContents {
  setAudioMuted(value: boolean): void;
  isAudioMuted(): boolean;
  on(event: string, listener: () => void): unknown;
}
export interface ManagedWindowLike {
  webContents: ManagedWebContents;
  isDestroyed(): boolean;
  show(): void;
  focus(): void;
  loadURL(url: string): Promise<unknown>;
  close?(): void;
}
export function enforceMuted(contents: ManagedWebContents) {
  contents.setAudioMuted(true);
  if (!contents.isAudioMuted()) contents.setAudioMuted(true);
}
export async function openOrReuseManaged(
  existing: ManagedWindowLike | undefined,
  create: () => ManagedWindowLike,
  url: string,
) {
  if (existing && !existing.isDestroyed()) {
    enforceMuted(existing.webContents);
    existing.show();
    existing.focus();
    return existing;
  }
  const window = create();
  enforceMuted(window.webContents);
  for (const event of [
    "did-finish-load",
    "did-navigate",
    "did-navigate-in-page",
  ])
    window.webContents.on(event, () => enforceMuted(window.webContents));
  try {
    await window.loadURL(url);
    enforceMuted(window.webContents);
    window.show();
    window.focus();
    return window;
  } catch (error) {
    window.close?.();
    throw error;
  }
}
