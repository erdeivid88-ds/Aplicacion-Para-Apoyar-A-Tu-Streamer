export type KickTabSnapshot = {
  id?: number;
  url?: string;
  status?: string;
  mutedInfo?: { muted?: boolean };
  windowId?: number;
};

type Listener<T extends (...args: any[]) => void> = {
  addListener(listener: T): void;
  removeListener(listener: T): void;
};

export type KickTabReadiness = {
  tab: KickTabSnapshot;
  tabCreatedAt: number;
  tabReadyAt: number;
  tabReadyDurationMs: number;
  tabUrlReady: true;
  documentComplete: boolean;
};

export type KickTabDependencies = {
  getTab(tabId: number): Promise<KickTabSnapshot>;
  onUpdated: Listener<
    (
      tabId: number,
      changeInfo: { status?: string; url?: string },
      tab: KickTabSnapshot,
    ) => void
  >;
  onRemoved: Listener<(tabId: number) => void>;
  now?: () => number;
};

function isKickUrl(value: unknown) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "kick.com" || url.hostname === "www.kick.com")
    );
  } catch {
    return false;
  }
}

export async function waitForKickTabReady(
  tabId: number,
  timeoutMs: number,
  dependencies: KickTabDependencies,
  tabCreatedAt = (dependencies.now ?? Date.now)(),
): Promise<KickTabReadiness> {
  const now = dependencies.now ?? Date.now;
  const ready = (tab: KickTabSnapshot): KickTabReadiness | undefined => {
    if (!isKickUrl(tab.url)) return undefined;
    if (tab.status && tab.status !== "complete") return undefined;
    const tabReadyAt = now();
    return {
      tab,
      tabCreatedAt,
      tabReadyAt,
      tabReadyDurationMs: Math.max(0, tabReadyAt - tabCreatedAt),
      tabUrlReady: true,
      documentComplete: tab.status === "complete",
    };
  };

  let initial: KickTabSnapshot;
  try {
    initial = await dependencies.getTab(tabId);
  } catch {
    throw new Error("TAB_CLOSED");
  }
  const immediate = ready(initial);
  if (immediate) return immediate;
  if (
    initial.status === "complete" &&
    typeof initial.url === "string" &&
    initial.url &&
    !isKickUrl(initial.url)
  )
    throw new Error("NOT_KICK_TAB");

  return new Promise<KickTabReadiness>((resolve, reject) => {
    const timer = setTimeout(() => fail("TAB_READY_TIMEOUT"), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      dependencies.onUpdated.removeListener(onUpdated);
      dependencies.onRemoved.removeListener(onRemoved);
    };
    const finish = (result: KickTabReadiness) => {
      cleanup();
      resolve(result);
    };
    const fail = (code: string) => {
      cleanup();
      reject(new Error(code));
    };
    const onUpdated = (
      updatedId: number,
      _changeInfo: { status?: string; url?: string },
      tab: KickTabSnapshot,
    ) => {
      if (updatedId !== tabId) return;
      const result = ready(tab);
      if (result) finish(result);
      else if (
        tab.status === "complete" &&
        typeof tab.url === "string" &&
        tab.url &&
        !isKickUrl(tab.url)
      )
        fail("NOT_KICK_TAB");
    };
    const onRemoved = (removedId: number) => {
      if (removedId === tabId) fail("TAB_CLOSED");
    };
    dependencies.onUpdated.addListener(onUpdated);
    dependencies.onRemoved.addListener(onRemoved);
    void dependencies
      .getTab(tabId)
      .then((tab) => {
        const result = ready(tab);
        if (result) finish(result);
      })
      .catch(() => fail("TAB_CLOSED"));
  });
}
