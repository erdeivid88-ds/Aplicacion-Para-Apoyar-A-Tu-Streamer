import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  shell,
  Tray,
} from "electron";
import Store from "electron-store";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideAutomation,
  normalizeAutomation,
  recordFailure,
  recordSuccess,
  sanitizeMessage,
} from "../../src/domain/automation";
import {
  isDuplicate,
  normalizeName,
  validName,
} from "../../src/domain/channels";
import { parseImport } from "../../src/domain/import";
import { ScanLock, transition } from "../../src/domain/monitor";
import { completedStopState } from "../../src/domain/monitor-control";
import { streamUrl, validateStreamUrl } from "../../src/domain/stream-url";
import { validateSettings } from "../../src/domain/settings-ui";
import { migrateConnectionFrom102 } from "../../src/domain/twitch-account";
import { migrateSettings110 } from "../../src/domain/migration";
import {
  defaultAutomation,
  defaultRuntime,
  defaults,
  type AppState,
  type BotStatus,
  type Streamer,
  type TwitchAccountType,
} from "../../src/domain/types";
import { InternalBrowserManager, type InternalTab } from "./internal-browser";
import { KickProvider, TwitchProvider } from "./providers";
import { TwitchApiError, TwitchAuth } from "./twitch-auth";
import { BrowserExtensionClient } from "./browser-extension-client";
import { errorReportMailto } from "../../src/domain/support";
import {
  browserInstallations,
  developmentExtensionPath,
  diagnoseNativeHost,
  registerNativeHost,
  unregisterNativeHost,
} from "./extension-installer";
const __dirname = dirname(fileURLToPath(import.meta.url));
const store = new Store<AppState>({ name: "app-data", defaults });
let win: BrowserWindow | null = null,
  tray: Tray | null = null,
  timer: NodeJS.Timeout | null = null,
  quitting = false;
let monitorGeneration = 0;
let scanController: AbortController | null = null;
const userClosedForMonitorSession = new Set<string>();
let extensionClient: BrowserExtensionClient | null = null;
let systemSuspended = false;
let lastSettingsRevision = 0;
const reopenState = new Map<
  string,
  {
    count: number;
    timer?: NodeJS.Timeout;
    monitorSessionId: string;
    streamSessionId: string;
  }
>();
const internalBrowser = new InternalBrowserManager(
  (tab, reason) => {
    syncInternalBrowserState();
    if (reason === "user_closed") scheduleReopen(tab);
  },
  () => store.get("settings.closeInternalBrowserWhenEmpty"),
  () => store.get("settings.muteOtherInternalTabs"),
);
const lock = new ScanLock();
const auth = new TwitchAuth(() =>
  store.get("settings.platforms.twitch.clientId"),
);
function migrate() {
  const raw = store.store as AppState;
  store.set("schemaVersion", 5);
  store.set("settings", migrateSettings110(raw));
  store.set("bot", migrateConnectionFrom102(raw.bot));
  store.set("deviceAuth", raw.deviceAuth ?? { status: "idle" });
  store.set("monitor", {
    ...raw.monitor,
    status: "off",
    nextScan: undefined,
    manuallyStopped: raw.monitor?.manuallyStopped ?? false,
  });
  store.set("extension", {
    ...defaults.extension,
    ...raw.extension,
    connected: false,
    nativeHostConnected: false,
    sessionActive: false,
  });
  store.set(
    "streamers",
    (raw.streamers ?? []).map((s) => ({
      ...s,
      automation: normalizeAutomation(s.automation ?? defaultAutomation()),
      automationRuntime: s.automationRuntime ?? defaultRuntime(),
    })),
  );
  const platforms = raw.settings.platforms as Record<
    string,
    { enabled: boolean; clientId?: string; accessToken?: string }
  >;
  if (platforms.twitch?.accessToken || platforms.kick?.accessToken) {
    delete platforms.twitch?.accessToken;
    delete platforms.kick?.accessToken;
    store.set(
      "settings.platforms",
      platforms as AppState["settings"]["platforms"],
    );
  }
}
const state = () => ({
  ...structuredClone(store.store),
  runtime: {
    mainWindowVisible: Boolean(win?.isVisible()),
    mainWindowMinimized: Boolean(win?.isMinimized()),
    timersProcess: "main" as const,
    scanTimerActive: Boolean(timer),
    backgroundThrottlingDisabled: true,
    suspended: systemSuspended,
  },
});
const emit = () =>
  win && !win.isDestroyed() && win.webContents.send("state:changed", state());
function syncInternalBrowserState() {
  store.set("internalBrowser", {
    open: Boolean(
      internalBrowser.internalBrowserWindow &&
      !internalBrowser.internalBrowserWindow.isDestroyed(),
    ),
    tabs: internalBrowser.count(),
    activeStreamerId: internalBrowser.activeInternalTabId,
  });
  emit();
}
function cancelReopens() {
  for (const item of reopenState.values())
    if (item.timer) clearTimeout(item.timer);
  reopenState.clear();
}
function scheduleReopen(
  closed: Pick<
    InternalTab,
    "streamerId" | "streamSessionId" | "monitorSessionId"
  >,
) {
  if (
    !store.get("settings.reopenClosedStreams") ||
    store.get("settings.askBeforeReopen")
  )
    return;
  const status = store.get("monitor.status");
  if (status === "off" || status === "stopping") return;
  if (closed.monitorSessionId !== store.get("monitor.monitorSessionId")) return;
  const current = reopenState.get(closed.streamerId);
  if (current?.timer) return;
  const count = current?.count ?? 0;
  if (count >= store.get("settings.maxReopensPerStream")) {
    log(
      `No se volvió a abrir el directo porque se alcanzó el límite de reaperturas.`,
      "warning",
      store.get("streamers").find((x) => x.id === closed.streamerId),
    );
    return;
  }
  const timer = setTimeout(
    async () => {
      const tracking = reopenState.get(closed.streamerId);
      if (
        !tracking ||
        tracking.monitorSessionId !== store.get("monitor.monitorSessionId")
      )
        return;
      tracking.timer = undefined;
      const streamer = store
        .get("streamers")
        .find((x) => x.id === closed.streamerId);
      if (
        !streamer ||
        !streamer.enabled ||
        streamer.sessionId !== closed.streamSessionId ||
        !store.get(`settings.platforms.${streamer.platform}.enabled`)
      )
        return;
      try {
        const fresh =
          streamer.platform === "twitch"
            ? await new TwitchProvider(auth).check(streamer)
            : await new KickProvider().check(streamer);
        if (!fresh.live || fresh.sessionId !== closed.streamSessionId) return;
        await openStream({ ...streamer, ...fresh });
        tracking.count++;
        log(
          `Directo reabierto automáticamente (${tracking.count}/${store.get("settings.maxReopensPerStream")}).`,
          "info",
          streamer,
        );
      } catch (error) {
        log(
          `No se pudo reabrir: ${error instanceof Error ? error.message : "error"}.`,
          "warning",
          streamer,
        );
      }
    },
    store.get("settings.reopenDelaySeconds") * 1000,
  );
  reopenState.set(closed.streamerId, {
    count,
    timer,
    monitorSessionId: closed.monitorSessionId,
    streamSessionId: closed.streamSessionId,
  });
}
function log(
  description: string,
  level: "info" | "warning" | "error" = "info",
  s?: Streamer,
) {
  store.set(
    "activity",
    [
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        level,
        platform: s?.platform,
        channel: s?.displayName,
        description,
      },
      ...store.get("activity", []),
    ].slice(0, 2000),
  );
}
const safeExternal = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "mailto:")
    throw new Error("Enlace no permitido.");
  if (
    url.protocol === "https:" &&
    ![
      "twitch.tv",
      "www.twitch.tv",
      "kick.com",
      "www.kick.com",
      "ids.vortexstudio.es",
      "chromewebstore.google.com",
      "microsoftedge.microsoft.com",
      "dev.twitch.tv",
      "github.com",
    ].includes(url.hostname)
  )
    throw new Error("Dominio no permitido.");
  return shell.openExternal(url.toString());
};
async function openStream(s: Streamer) {
  const browserMode = store.get("settings.browserMode");
  const reusable = internalBrowser.has(s.id);
  const validation = validateStreamUrl(s.platform, s.url);
  console.info("[stream-open]", {
    streamerId: s.id,
    platform: s.platform,
    normalizedLogin: s.normalizedName,
    url: typeof s.url === "string" ? s.url : "(invalid)",
    browserMode,
    existingWindow: reusable,
    validated: validation.valid,
    windowRole: browserMode === "managed" ? "managed-stream" : "external",
  });
  if (!validation.valid) {
    log(`Apertura bloqueada: ${validation.reason}`, "error", s);
    throw new Error(validation.reason);
  }
  const monitorSessionId =
    store.get("monitor.monitorSessionId") ?? randomUUID();
  const streamSessionId = s.sessionId ?? `${s.id}:${s.lastCheckedAt ?? "live"}`;
  const blockKey = `${s.id}:${streamSessionId}:${monitorSessionId}`;
  if (userClosedForMonitorSession.has(blockKey)) return;
  if (browserMode === "managed") {
    await internalBrowser.open(
      {
        streamerId: s.id,
        platform: s.platform,
        canonicalUrl: validation.url,
        streamSessionId,
        monitorSessionId,
        title: s.displayName,
      },
      store.get("settings.focusStreamOnOpen"),
    );
    syncInternalBrowserState();
  } else if (browserMode === "extension") {
    try {
      const opened = await extensionClient?.request("open_stream", {
        streamerId: s.id,
        platform: s.platform,
        url: validation.url,
        streamSessionId,
        monitorSessionId,
        muted: store.get("settings.muteManagedStreams"),
        active:
          !store.get("settings.openStreamsInBackground") ||
          store.get("settings.focusStreamOnOpen"),
      });
      if (opened)
        store.set(
          "extension.managedTabs",
          Math.max(store.get("extension.managedTabs"), 1),
        );
    } catch (error) {
      if (store.get("settings.extensionFallback"))
        await safeExternal(validation.url);
      else throw error;
    }
  } else await safeExternal(validation.url);
  if (store.get("settings.notifications"))
    new Notification({
      title: `${s.displayName} está en directo`,
      body: s.title ?? "Se ha abierto el canal.",
    }).show();
}
function botStatus(error: unknown): BotStatus {
  return error instanceof TwitchApiError
    ? error.status === 401
      ? "expired"
      : error.status === 403
        ? "insufficient-permissions"
        : error.status === 429
          ? "rate-limited"
          : "disconnected"
    : "disconnected";
}
function monitorCurrent(generation: number) {
  return (
    generation === monitorGeneration &&
    store.get("monitor.status") !== "off" &&
    store.get("monitor.status") !== "stopping" &&
    !scanController?.signal.aborted
  );
}
async function automate(s: Streamer, generation: number) {
  if (!monitorCurrent(generation)) return;
  const decision = decideAutomation(s, Date.now());
  s.automationRuntime = decision.runtime;
  if (decision.reason === "unauthorized" && s.automation.enabled)
    store.set("bot.status", "unauthorized-channel");
  if (!decision.send) return;
  if (store.get("bot.status") !== "connected") return;
  try {
    const broadcasterId =
      s.externalId ?? (await auth.resolveBroadcaster(s.normalizedName));
    if (!monitorCurrent(generation)) return;
    await auth.send(broadcasterId, sanitizeMessage(s.automation.message));
    if (!monitorCurrent(generation)) return;
    s.externalId = broadcasterId;
    s.automationRuntime = recordSuccess(
      s.automationRuntime,
      new Date().toISOString(),
    );
    log(
      `Mensaje automático enviado (${s.automationRuntime.sentCount}/${s.automation.maxPerStream}).`,
      "info",
      s,
    );
  } catch (error) {
    s.automationRuntime = recordFailure(s.automationRuntime);
    const status = botStatus(error);
    store.set("bot", {
      ...store.get("bot"),
      status,
      detail: error instanceof Error ? error.message : "Error de Twitch",
    });
    log(
      `Fallo de mensajería automática (${s.automationRuntime.consecutiveErrors}/3): ${error instanceof Error ? error.message : "error"}.`,
      "error",
      s,
    );
    if (s.automationRuntime.paused) {
      store.set("bot.status", "paused");
      log(
        "Automatización pausada tras tres errores consecutivos.",
        "warning",
        s,
      );
    }
  }
}
async function scan(generation = monitorGeneration) {
  if (!monitorCurrent(generation)) return null;
  return lock.run(async () => {
    if (!monitorCurrent(generation)) return null;
    store.set("monitor.status", "checking");
    emit();
    let partial = false;
    const items = [...store.get("streamers")];
    for (let i = 0; i < items.length; i++) {
      const previous = items[i];
      if (
        !previous.enabled ||
        !store.get(`settings.platforms.${previous.platform}.enabled`)
      )
        continue;
      try {
        const result =
          previous.platform === "twitch"
            ? await new TwitchProvider(auth).check(previous)
            : await new KickProvider().check(previous);
        if (!monitorCurrent(generation)) return null;
        const change = transition(previous, result);
        const current = {
          ...previous,
          ...result,
          lastCheckedAt: new Date().toISOString(),
          lastError: undefined,
        };
        if (change.shouldOpen) {
          await openStream(current);
          current.openedSessionId = result.sessionId;
          current.openedAt = new Date().toISOString();
          log("Canal detectado y abierto en directo.", "info", current);
        }
        if (change.ended) {
          current.automationRuntime = defaultRuntime();
          log("El directo ha terminado; mensajería detenida.", "info", current);
          if (
            internalBrowser.has(current.id) &&
            store.get("settings.closeInternalWindowsOnEnd")
          )
            internalBrowser.close(current.id, "stream_ended");
          const pending = reopenState.get(current.id);
          if (pending?.timer) clearTimeout(pending.timer);
          reopenState.delete(current.id);
          if (
            store.get("settings.browserMode") === "extension" &&
            store.get("settings.closeExtensionTabsOnEnd") &&
            previous.sessionId &&
            store.get("monitor.monitorSessionId")
          )
            void extensionClient
              ?.request("get_stream_tabs")
              .then(({ tabs }) =>
                tabs.find(
                  (item: {
                    streamerId: string;
                    streamSessionId: string;
                    monitorSessionId: string;
                  }) =>
                    item.streamerId === current.id &&
                    item.streamSessionId === previous.sessionId &&
                    item.monitorSessionId ===
                      store.get("monitor.monitorSessionId"),
                ),
              )
              .then(
                (item) =>
                  item && extensionClient?.request("close_stream", item),
              )
              .catch((error) =>
                log(
                  `No se pudo cerrar la pestaña administrada: ${error.message}`,
                  "warning",
                  current,
                ),
              );
        }
        await automate(current, generation);
        if (!monitorCurrent(generation)) return null;
        items[i] = current;
      } catch (error) {
        partial = true;
        items[i] = {
          ...previous,
          lastCheckedAt: new Date().toISOString(),
          lastError:
            error instanceof Error ? error.message : "Error desconocido",
        };
        log(items[i].lastError!, "error", previous);
      }
    }
    if (!monitorCurrent(generation)) return null;
    store.set("streamers", items);
    const now = Date.now();
    store.set("monitor", {
      status: partial ? "partial-error" : "active",
      lastScan: new Date(now).toISOString(),
      nextScan: new Date(
        now + store.get("settings.scanMinutes") * 60000,
      ).toISOString(),
      errors: items
        .flatMap((x) => (x.lastError ? [x.lastError] : []))
        .slice(0, 5),
      manuallyStopped: false,
      monitorSessionId: store.get("monitor.monitorSessionId"),
    });
    emit();
    updateTray();
    return true;
  });
}
function schedule(generation: number) {
  if (timer) clearInterval(timer);
  timer = setInterval(
    () => void scan(generation),
    Math.max(5, store.get("settings.scanMinutes")) * 60000,
  );
}
function start() {
  monitorGeneration++;
  scanController?.abort();
  scanController = new AbortController();
  const generation = monitorGeneration;
  const monitorSessionId = randomUUID();
  userClosedForMonitorSession.clear();
  if (store.get("settings.reopenOnNewMonitorSession"))
    store.set(
      "streamers",
      store
        .get("streamers")
        .map((item) => ({ ...item, openedSessionId: undefined })),
    );
  schedule(generation);
  store.set("monitor.status", "starting");
  store.set("monitor.monitorSessionId", monitorSessionId);
  store.set("monitor.manuallyStopped", false);
  store.set("monitor.toast", "Monitor encendido");
  emit();
  updateTray();
  void scan(generation);
}
async function stop(manual = true, forced = false) {
  store.set("monitor.status", "stopping");
  store.set("monitor.toast", forced ? "Detención forzada" : "Monitor apagado");
  emit();
  monitorGeneration++;
  scanController?.abort();
  scanController = null;
  if (timer) clearInterval(timer);
  timer = null;
  store.set(
    "streamers",
    store.get("streamers").map((item) => ({
      ...item,
      automationRuntime: { ...item.automationRuntime, paused: true },
    })),
  );
  cancelReopens();
  if (store.get("settings.closeInternalWindowsOnMonitorStop"))
    internalBrowser.closeAll("monitor_stopped");
  if (store.get("settings.closeExtensionTabsOnMonitorStop"))
    await extensionClient?.request("close_all_managed_streams").catch(() => {});
  userClosedForMonitorSession.clear();
  log(
    forced
      ? "Monitor detenido de forma forzada"
      : manual
        ? "Monitor apagado manualmente"
        : "Monitor apagado",
  );
  await Promise.resolve();
  store.set("monitor", completedStopState(store.get("monitor"), manual));
  emit();
  updateTray();
}
function assertSender(event: Electron.IpcMainInvokeEvent) {
  if (!win || event.sender !== win.webContents)
    throw new Error("IPC no autorizado.");
}
function register() {
  const handle = (name: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle(name, (event, ...args) => {
      assertSender(event);
      return fn(...args);
    });
  handle("state:get", () => state());
  handle("extension:ping", async () => {
    const payload = await extensionClient?.request("ping");
    store.set("extension", {
      ...store.get("extension"),
      connected: true,
      sessionActive: true,
      ...payload,
      lastCommunication: new Date().toISOString(),
      lastError: undefined,
    });
    emit();
    return payload;
  });
  handle("extension:test-open", async () => {
    const item = store.get("streamers")[0];
    if (!item) throw new Error("Añade un streamer para probar la apertura.");
    const checked = validateStreamUrl(item.platform, item.url);
    if (!checked.valid) throw new Error(checked.reason);
    return extensionClient?.request("open_stream", {
      streamerId: item.id,
      platform: item.platform,
      url: checked.url,
      streamSessionId: `manual:${randomUUID()}`,
      monitorSessionId:
        store.get("monitor.monitorSessionId") ?? `manual:${randomUUID()}`,
      muted: true,
      active: false,
    });
  });
  handle("extension:mute-all", async () => {
    const { tabs = [] } =
      (await extensionClient?.request("get_stream_tabs")) ?? {};
    await Promise.all(
      tabs.map((item: Record<string, unknown>) =>
        extensionClient?.request("mute_stream", item),
      ),
    );
  });
  handle("extension:close-all", () =>
    extensionClient?.request("close_all_managed_streams"),
  );
  handle("extension:detect-browsers", () => browserInstallations());
  handle("extension:development-path", () => developmentExtensionPath());
  handle("extension:open-settings", async (value) => {
    if (value !== "chrome" && value !== "edge") throw new Error("Navegador no válido.");
    const address = `${value}://extensions`;
    try {
      await shell.openExternal(address);
      return { opened: true, address };
    } catch {
      return { opened: false, address };
    }
  });
  handle("extension:register-host", async (value) => {
    const result = await registerNativeHost(value);
    store.set("extension.nativeHostConnected", result.registered);
    emit();
    return result;
  });
  handle("extension:unregister-host", async (value) => {
    await unregisterNativeHost(value);
    store.set("extension.nativeHostConnected", false);
    emit();
  });
  handle("extension:diagnose-host", (value) => diagnoseNativeHost(value));
  handle("monitor:start", () => start());
  handle("monitor:stop", () => stop());
  handle("monitor:force-stop", () => stop(true, true));
  handle("monitor:scan", () => scan());
  handle("bot:connect", async (value) => {
    if (value !== "personal" && value !== "bot")
      throw new Error("Tipo de cuenta no válido.");
    try {
      store.set("deviceAuth", {
        status: "requesting",
        accountType: value as TwitchAccountType,
      });
      emit();
      const device = await auth.beginDevice(value as TwitchAccountType);
      store.set("deviceAuth", device);
      emit();
      if (device.verificationUri)
        await auth.openDeviceVerification(device.verificationUri);
      void auth
        .pollDevice((status) => {
          store.set("deviceAuth", { ...store.get("deviceAuth"), ...status });
          emit();
        })
        .then((bot) => {
          store.set("bot", bot);
          store.set("deviceAuth", {
            status: "success",
            accountType: bot.accountType,
          });
          emit();
          new Notification({
            title: "Cuenta de Twitch conectada",
            body: bot.displayName ?? "Autorización completada.",
          }).show();
        })
        .catch((error) => {
          const cancelled =
            error instanceof DOMException && error.name === "AbortError";
          store.set("deviceAuth", {
            status: cancelled
              ? "cancelled"
              : /caducado/i.test(String(error))
                ? "expired"
                : /denegado/i.test(String(error))
                  ? "denied"
                  : "error",
            accountType: value as TwitchAccountType,
            detail: cancelled
              ? "Conexión cancelada."
              : error instanceof Error
                ? error.message
                : "Error OAuth",
          });
          emit();
        });
    } catch (error) {
      store.set("deviceAuth", {
        status: "error",
        accountType: value as TwitchAccountType,
        detail: error instanceof Error ? error.message : "Error OAuth",
      });
      emit();
      throw error;
    }
  });
  handle("bot:cancel-connect", () => {
    auth.cancelDevice();
    store.set("deviceAuth", { status: "cancelled" });
    emit();
  });
  handle("bot:open-device", async () => {
    const url = store.get("deviceAuth.verificationUri");
    if (!url) throw new Error("No hay URL de autorización.");
    await auth.openDeviceVerification(url);
  });
  handle("bot:disconnect", () => {
    auth.clear();
    store.set("bot", { status: "disconnected" });
    store.set("deviceAuth", { status: "idle" });
    emit();
  });
  handle("bot:switch-type", (value) => {
    if (value !== "personal" && value !== "bot")
      throw new Error("Tipo de cuenta no válido.");
    auth.clear();
    monitorGeneration++;
    store.set("bot", { status: "disconnected", accountType: value });
    store.set("deviceAuth", { status: "idle", accountType: value });
    emit();
  });
  handle("bot:check", async () => {
    try {
      store.set("bot", await auth.validate());
      emit();
    } catch (error) {
      store.set("bot", {
        ...store.get("bot"),
        status: botStatus(error),
        detail: error instanceof Error ? error.message : "Error OAuth",
      });
      emit();
      throw error;
    }
  });
  handle("streamer:resolve", async (platform, value) => {
    if (
      (platform !== "twitch" && platform !== "kick") ||
      typeof value !== "string"
    )
      throw new Error("Canal no válido.");
    let login = value.trim().replace(/^@/, "").toLowerCase();
    if (/^https:/i.test(login)) {
      const checked = validateStreamUrl(platform, login);
      if (!checked.valid) throw new Error(checked.reason);
      login = checked.login;
    }
    if (!validName(login)) throw new Error("Nombre de canal no válido.");
    if (platform === "kick")
      return { externalId: "", login, displayName: login };
    const user = await auth.resolveChannel(login);
    return {
      externalId: user.id,
      login: user.login,
      displayName: user.displayName,
      avatar: user.avatar,
    };
  });
  handle("streamer:save", async (value) => {
    const input = value as Partial<Streamer>;
    if (!input.platform || !input.displayName || !validName(input.displayName))
      throw new Error("Nombre de canal no válido.");
    const list = store.get("streamers");
    const old = list.find((x) => x.id === input.id);
    const automation = normalizeAutomation(
      input.automation ?? old?.automation ?? defaultAutomation(),
    );
    if (automation.authorized && !old?.automation.authorized)
      automation.authorizedAt = new Date().toISOString();
    if (!automation.authorized) automation.authorizedAt = undefined;
    const resolved =
      input.platform === "twitch" && !input.externalId
        ? await auth.resolveChannel(normalizeName(input.displayName))
        : undefined;
    const item: Streamer = {
      ...(old ?? {}),
      id: input.id ?? randomUUID(),
      platform: input.platform,
      displayName: resolved?.displayName ?? input.displayName.trim(),
      normalizedName: resolved?.login ?? normalizeName(input.displayName),
      externalId: resolved?.id ?? (input.externalId?.trim() || undefined),
      avatar: resolved?.avatar ?? input.avatar ?? old?.avatar,
      url: streamUrl(
        input.platform,
        resolved?.login ?? normalizeName(input.displayName),
      ),
      enabled: input.enabled ?? true,
      live: old?.live ?? false,
      automation,
      automationRuntime: old?.automationRuntime ?? defaultRuntime(),
    };
    if (
      isDuplicate(
        list.filter((x) => x.id !== item.id),
        item,
      )
    )
      throw new Error("El canal ya estaba añadido.");
    store.set(
      "streamers",
      old ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item],
    );
    emit();
  });
  handle("streamer:delete", (value) => {
    if (typeof value !== "string") throw new Error("ID no válido.");
    const pending = reopenState.get(value);
    if (pending?.timer) clearTimeout(pending.timer);
    reopenState.delete(value);
    store.set(
      "streamers",
      store.get("streamers").filter((x) => x.id !== value),
    );
    emit();
  });
  handle("streamer:cancel-reopen", (value) => {
    if (typeof value !== "string") throw new Error("ID no válido.");
    const pending = reopenState.get(value);
    if (pending?.timer) clearTimeout(pending.timer);
    reopenState.delete(value);
  });
  handle("streamer:retry-open", async (value) => {
    if (typeof value !== "string") throw new Error("ID no válido.");
    const streamer = store.get("streamers").find((x) => x.id === value);
    if (!streamer) throw new Error("Streamer no encontrado.");
    const pending = reopenState.get(value);
    if (pending?.timer) clearTimeout(pending.timer);
    reopenState.delete(value);
    const result =
      streamer.platform === "twitch"
        ? await new TwitchProvider(auth).check(streamer)
        : await new KickProvider().check(streamer);
    if (!result.live) throw new Error("El streamer ya no está en directo.");
    await openStream({ ...streamer, ...result });
  });
  handle("settings:save", (value) => {
    const envelope = value as {
      patch?: Partial<AppState["settings"]>;
      revision?: number;
    };
    const patch = envelope.patch ?? (value as Partial<AppState["settings"]>);
    if (envelope.revision !== undefined) {
      if (
        !Number.isSafeInteger(envelope.revision) ||
        envelope.revision <= lastSettingsRevision
      )
        return;
      lastSettingsRevision = envelope.revision;
    }
    const previousMode = store.get("settings.browserMode");
    const allowed: Partial<AppState["settings"]> = {};
    for (const key of [
      "scanMinutes",
      "idleMinutes",
      "autoStart",
      "allowAutoReactivateAfterManualStop",
      "countdownSeconds",
      "startup",
      "startMinimized",
      "minimizeToTray",
      "notifications",
      "language",
      "browserMode",
      "closeManagedTabs",
      "muteManagedStreams",
      "openStreamsInBackground",
      "focusStreamOnOpen",
      "closeExtensionTabsOnEnd",
      "closeExtensionTabsOnMonitorStop",
      "closeExtensionTabsOnAppClose",
      "closeInternalWindowsOnEnd",
      "closeInternalWindowsOnMonitorStop",
      "reopenOnNewMonitorSession",
      "extensionFallback",
      "extensionBrowser",
      "extensionInstallCompleted",
      "notifyExtensionErrors",
      "reopenClosedStreams",
      "reopenDelaySeconds",
      "maxReopensPerStream",
      "askBeforeReopen",
      "muteOtherInternalTabs",
      "closeInternalBrowserWhenEmpty",
      "theme",
      "showStartNotice",
      "onboardingCompleted",
    ] as const)
      if (patch[key] !== undefined)
        (allowed as Record<string, unknown>)[key] = patch[key];
    if (patch.platforms)
      allowed.platforms = {
        ...store.get("settings.platforms"),
        ...patch.platforms,
        twitch: {
          ...store.get("settings.platforms.twitch"),
          ...patch.platforms.twitch,
        },
        kick: {
          ...store.get("settings.platforms.kick"),
          ...patch.platforms.kick,
        },
      };
    const nextSettings = { ...store.get("settings"), ...allowed };
    const validationErrors = validateSettings(nextSettings);
    if (validationErrors.length) throw new Error(validationErrors[0]);
    store.set("settings", nextSettings);
    if (
      (patch.browserMode && patch.browserMode !== previousMode) ||
      patch.reopenClosedStreams === false
    )
      cancelReopens();
    if (store.get("monitor.status") !== "off") schedule(monitorGeneration);
    emit();
  });
  handle("external:open", (value) => {
    if (typeof value !== "string" || value.length > 2048)
      throw new Error("URL no válida.");
    return safeExternal(value);
  });
  handle("clipboard:write", (value) => {
    if (typeof value !== "string" || value.length > 100000)
      throw new Error("Texto no válido.");
    clipboard.writeText(value);
  });
  handle("activity:clear", () => {
    store.set("activity", []);
    emit();
  });
  handle("data:export", async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: "apoya-a-tu-streamer.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!result.canceled && result.filePath)
      await writeFile(
        result.filePath,
        JSON.stringify(
          {
            settings: store.get("settings"),
            streamers: store.get("streamers"),
          },
          null,
          2,
        ),
      );
  });
  handle("data:import", async () => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (!result.canceled) {
      const parsed = parseImport(await readFile(result.filePaths[0], "utf8"));
      store.set("streamers", parsed.streamers as Streamer[]);
      emit();
    }
  });
}
async function loadRenderer(window: BrowserWindow) {
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) {
    await window.loadURL(dev);
    return;
  }
  const path = join(app.getAppPath(), "dist", "index.html");
  if (!existsSync(path)) throw new Error(`Renderer no encontrado: ${path}`);
  await window.loadFile(path);
}
function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    show: !store.get("settings.startMinimized"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on("did-finish-load", () => {
    lastSettingsRevision = 0;
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void safeExternal(url);
    return { action: "deny" };
  });
  void loadRenderer(win);
  win.on("close", (event) => {
    if (store.get("settings.minimizeToTray") && !quitting) {
      event.preventDefault();
      win?.hide();
    }
  });
  win.on("show", emit);
  win.on("restore", emit);
}
function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Apoya a tu Streamer");
  updateTray();
}
function updateTray() {
  if (!tray) return;
  const status = store.get("monitor.status");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Abrir aplicación",
        click: () => {
          win?.show();
          win?.focus();
        },
      },
      {
        label: status === "off" ? "✓ Monitor apagado" : `Monitor: ${status}`,
        enabled: false,
      },
      { label: "Encender monitor", click: start, enabled: status === "off" },
      {
        label: "Apagar monitor",
        click: () => void stop(),
        enabled: status !== "off" && status !== "stopping",
      },
      { type: "separator" },
      {
        label: "Informar sobre un error",
        click: () => void safeExternal(errorReportMailto(state() as AppState, process.platform)),
      },
      { type: "separator" },
      {
        label: "Salir completamente",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}
app.whenReady().then(async () => {
  migrate();
  Menu.setApplicationMenu(null);
  register();
  createWindow();
  createTray();
  extensionClient = new BrowserExtensionClient(
    app.getVersion(),
    () => store.get("monitor.status"),
    (patch) => {
      store.set("extension", { ...store.get("extension"), ...patch });
      const closed = patch.lastClosedStream as
        | Pick<
            InternalTab,
            "streamerId" | "streamSessionId" | "monitorSessionId"
          >
        | undefined;
      if (closed) scheduleReopen(closed);
      if (
        patch.connected === false &&
        store.get("settings.browserMode") === "extension"
      )
        cancelReopens();
      emit();
    },
  );
  extensionClient.start();
  powerMonitor.on("suspend", () => {
    systemSuspended = true;
    scanController?.abort();
    scanController = null;
    log("Windows suspendido; se descartan barridos pendientes.");
    emit();
  });
  powerMonitor.on("resume", () => {
    systemSuspended = false;
    log("Windows reanudado; se ejecuta un barrido inmediato.");
    if (
      store.get("monitor.status") !== "off" &&
      store.get("monitor.status") !== "stopping"
    ) {
      monitorGeneration++;
      scanController = new AbortController();
      schedule(monitorGeneration);
      void auth.validate().catch(() => undefined);
      void scan(monitorGeneration);
    }
    emit();
  });
  powerMonitor.on("unlock-screen", () => {
    if (
      store.get("monitor.status") !== "off" &&
      store.get("monitor.status") !== "stopping"
    )
      void scan(monitorGeneration);
  });
  try {
    store.set("bot", await auth.validate());
  } catch (error) {
    store.set("bot", {
      ...store.get("bot"),
      status: botStatus(error),
      detail: error instanceof Error ? error.message : undefined,
    });
  }
  emit();
});
app.on("before-quit", () => {
  quitting = true;
  auth.cancelDevice();
  void stop(false, true);
  if (store.get("settings.closeExtensionTabsOnAppClose"))
    void extensionClient
      ?.request("close_all_managed_streams")
      .finally(() => extensionClient?.stop());
  else extensionClient?.stop();
  cancelReopens();
  internalBrowser.closeAll("application_closing");
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !store.get("settings.minimizeToTray"))
    app.quit();
});
