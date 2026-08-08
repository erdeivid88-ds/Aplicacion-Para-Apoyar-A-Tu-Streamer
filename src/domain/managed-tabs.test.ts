import { describe, expect, it, vi } from "vitest";
import {
  createManagedTabRegistry,
  type ManagedTab,
} from "../../browser-extension/managed-tabs";

const item = (patch: Partial<ManagedTab> = {}): ManagedTab => ({
  tabId: 10,
  platform: "kick",
  streamerId: "yourview",
  streamSessionId: "stream-1",
  monitorSessionId: "monitor-1",
  appSessionId: "app-1",
  canonicalUrl: "https://kick.com/yourview",
  createdAt: 1,
  muted: false,
  createdByIntegration: true,
  ...patch,
});

function setup(stored?: Record<string, ManagedTab> | ManagedTab[]) {
  let saved = stored;
  const save = vi.fn(async (value: Record<string, ManagedTab>) => {
    saved = value;
  });
  const getTab = vi.fn(async (tabId: number) => ({
    id: tabId,
    url: "https://kick.com/yourview" as string | undefined,
  }));
  const registry = createManagedTabRegistry({
    load: async () => saved,
    save,
    getTab,
    canonicalize: (_platform, url) => String(url),
  });
  return { registry, save, getTab };
}

describe("registro persistente de tabs administradas", () => {
  it("registra y persiste antes de devolver la pestaña abierta", async () => {
    const { registry, save } = setup();
    await registry.register(item());
    expect(registry.items.get(10)).toMatchObject({ appSessionId: "app-1" });
    expect(save).toHaveBeenCalledOnce();
  });
  it("restaura tras reinicio aunque la URL aún no esté lista", async () => {
    const { registry, getTab } = setup({ "10": item() });
    getTab.mockResolvedValueOnce({ id: 10, url: undefined });
    await registry.restore();
    expect(registry.items.has(10)).toBe(true);
  });
  it("reconoce la recién creada y diferencia sesión incorrecta", async () => {
    const { registry } = setup();
    await registry.register(item());
    await expect(registry.getManagedTab(10, "app-1")).resolves.toMatchObject({
      item: { streamerId: "yourview" },
    });
    await expect(registry.getManagedTab(10, "app-2")).rejects.toThrow(
      "APP_SESSION_MISMATCH",
    );
  });
  it("adopta reutilizada y actualiza monitor/session", async () => {
    const { registry } = setup();
    await registry.register(item());
    await registry.adopt(item(), {
      appSessionId: "app-2",
      streamSessionId: "stream-2",
      monitorSessionId: "monitor-2",
    });
    expect(registry.items.get(10)).toMatchObject({
      appSessionId: "app-2",
      streamSessionId: "stream-2",
      monitorSessionId: "monitor-2",
    });
  });
  it("desasocia solo la sesión desconectada", async () => {
    const { registry } = setup();
    await registry.register(item());
    await registry.register(item({ tabId: 11, appSessionId: "app-2" }));
    await registry.clearSession("app-1");
    expect(registry.items.get(10)?.appSessionId).toBe("");
    expect(registry.items.get(11)?.appSessionId).toBe("app-2");
  });
  it("reapertura sustituye el tabId cerrado", async () => {
    const { registry } = setup();
    await registry.register(item());
    await registry.remove(10);
    await registry.register(item({ tabId: 12 }));
    expect(registry.items.has(10)).toBe(false);
    expect(registry.items.get(12)?.streamerId).toBe("yourview");
  });
});
