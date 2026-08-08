export type ManagedTab = {
  tabId: number;
  platform: "twitch" | "kick";
  streamerId: string;
  streamSessionId: string;
  monitorSessionId: string;
  appSessionId: string;
  canonicalUrl: string;
  createdAt: number;
  muted: boolean;
  createdByIntegration: true;
};

type TabSnapshot = { id?: number; url?: string };
type ManagedTabDependencies = {
  load: () => Promise<Record<string, ManagedTab> | ManagedTab[] | undefined>;
  save: (items: Record<string, ManagedTab>) => Promise<void>;
  getTab: (tabId: number) => Promise<TabSnapshot>;
  canonicalize: (platform: ManagedTab["platform"], url: unknown) => string;
};

export function createManagedTabRegistry(dependencies: ManagedTabDependencies) {
  const items = new Map<number, ManagedTab>();
  const snapshot = () =>
    Object.fromEntries([...items].map(([id, item]) => [String(id), item]));
  const persist = () => dependencies.save(snapshot());

  async function restore() {
    const stored = await dependencies.load();
    const candidates = Array.isArray(stored)
      ? stored
      : Object.values(stored ?? {});
    for (const item of candidates) {
      try {
        await dependencies.getTab(item.tabId);
        items.set(item.tabId, item);
      } catch {
        items.delete(item.tabId);
      }
    }
    await persist();
  }

  async function register(item: ManagedTab) {
    items.set(item.tabId, item);
    await persist();
    return item;
  }

  async function get(tabId: number) {
    if (!Number.isInteger(tabId) || tabId <= 0) return undefined;
    const cached = items.get(tabId);
    if (cached) return cached;
    const stored = await dependencies.load();
    const candidates = Array.isArray(stored)
      ? stored
      : Object.values(stored ?? {});
    const item = candidates.find((candidate) => candidate.tabId === tabId);
    if (item) items.set(tabId, item);
    return item;
  }

  async function adopt(
    item: ManagedTab,
    patch: Pick<
      ManagedTab,
      "appSessionId" | "streamSessionId" | "monitorSessionId"
    >,
  ) {
    return register({ ...item, ...patch });
  }

  async function getManagedTab(tabId: number, appSessionId: string) {
    if (!Number.isInteger(tabId) || tabId <= 0)
      throw new Error("TAB_NOT_REGISTERED");
    const item = await get(tabId);
    if (!item) throw new Error("TAB_NOT_REGISTERED");
    if (item.appSessionId !== appSessionId)
      throw new Error("APP_SESSION_MISMATCH");
    let tab: TabSnapshot | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        tab = await dependencies.getTab(tabId);
      } catch {
        throw new Error("TAB_NOT_FOUND");
      }
      if (typeof tab.url === "string" && tab.url) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!tab || typeof tab.url !== "string" || !tab.url)
      throw new Error("TAB_URL_NOT_READY");
    let actual: string;
    try {
      actual = dependencies.canonicalize(item.platform, tab.url);
    } catch {
      throw new Error("TAB_URL_INVALID");
    }
    if (actual !== item.canonicalUrl) throw new Error("TAB_PLATFORM_MISMATCH");
    return { item, tab };
  }

  async function remove(tabId: number) {
    items.delete(tabId);
    await persist();
  }

  async function clearSession(sessionId: string) {
    for (const [tabId, item] of items)
      if (item.appSessionId === sessionId)
        items.set(tabId, { ...item, appSessionId: "" });
    await persist();
  }

  return {
    items,
    restore,
    register,
    get,
    adopt,
    getManagedTab,
    remove,
    clearSession,
    persist,
  };
}
