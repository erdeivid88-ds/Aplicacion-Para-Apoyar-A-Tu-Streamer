import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
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
import { migrateConnectionFrom102 } from "../../src/domain/twitch-account";
import {
  defaultAutomation,
  defaultRuntime,
  defaults,
  type AppState,
  type BotStatus,
  type Streamer,
  type TwitchAccountType,
} from "../../src/domain/types";
import { openOrReuseManaged } from "./managed-window";
import { KickProvider, TwitchProvider } from "./providers";
import { TwitchApiError, TwitchAuth } from "./twitch-auth";
import { BrowserExtensionClient } from "./browser-extension-client";
const __dirname = dirname(fileURLToPath(import.meta.url));
const store = new Store<AppState>({ name: "app-data", defaults });
let win: BrowserWindow | null = null,
  tray: Tray | null = null,
  timer: NodeJS.Timeout | null = null,
  quitting = false;
let monitorGeneration = 0;
let scanController: AbortController | null = null;
const managed = new Map<string, BrowserWindow>();
const userClosedForMonitorSession = new Set<string>();
let extensionClient: BrowserExtensionClient | null = null;
const lock = new ScanLock();
const auth = new TwitchAuth(() =>
  store.get("settings.platforms.twitch.clientId"),
);
function migrate() {
  const raw = store.store as AppState;
  store.set("schemaVersion", 4);
  store.set("settings", {
    ...defaults.settings,
    ...raw.settings,
    platforms: { ...defaults.settings.platforms, ...raw.settings?.platforms },
  });
  store.set("bot", migrateConnectionFrom102(raw.bot));
  store.set("deviceAuth", raw.deviceAuth ?? { status: "idle" });
  store.set("monitor", {
    ...raw.monitor,
    status: "off",
    nextScan: undefined,
    manuallyStopped: raw.monitor?.manuallyStopped ?? false,
  });
  store.set("extension", { ...defaults.extension, ...raw.extension, connected: false, nativeHostConnected: false, sessionActive: false });
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
const state = () => structuredClone(store.store);
const emit = () =>
  win && !win.isDestroyed() && win.webContents.send("state:changed", state());
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
      "dev.twitch.tv",
    ].includes(url.hostname)
  )
    throw new Error("Dominio no permitido.");
  return shell.openExternal(url.toString());
};
async function openStream(s: Streamer) {
  const browserMode = store.get("settings.browserMode");
  const existing = managed.get(s.id);
  const reusable = existing && !existing.isDestroyed() ? existing : undefined;
  const validation = validateStreamUrl(s.platform, s.url);
  console.info("[stream-open]", {
    streamerId: s.id,
    platform: s.platform,
    normalizedLogin: s.normalizedName,
    url: typeof s.url === "string" ? s.url : "(invalid)",
    browserMode,
    existingWindow: Boolean(reusable),
    validated: validation.valid,
    windowRole: browserMode === "managed" ? "managed-stream" : "external",
  });
  if (!validation.valid) {
    log(`Apertura bloqueada: ${validation.reason}`, "error", s);
    throw new Error(validation.reason);
  }
  const monitorSessionId = store.get("monitor.monitorSessionId") ?? randomUUID();
  const streamSessionId = s.sessionId ?? `${s.id}:${s.lastCheckedAt ?? "live"}`;
  const blockKey = `${s.id}:${streamSessionId}:${monitorSessionId}`;
  if (userClosedForMonitorSession.has(blockKey)) return;
  if (browserMode === "managed") {
    const result = (await openOrReuseManaged(
      reusable,
      () =>
        new BrowserWindow({
          width: 1100,
          height: 760,
          show: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        }),
      validation.url,
    )) as BrowserWindow;
    managed.set(s.id, result);
    if (!reusable) {
      result.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      result.webContents.on("will-navigate", (event, url) => {
        const checked = validateStreamUrl(s.platform, url);
        if (!checked.valid || checked.url !== validation.url) event.preventDefault();
      });
      result.once("closed", () => { managed.delete(s.id); userClosedForMonitorSession.add(blockKey); });
    }
  } else if (browserMode === "extension") {
    try {
      const opened = await extensionClient?.request("open_stream", {streamerId:s.id,platform:s.platform,url:validation.url,streamSessionId,monitorSessionId,muted:store.get("settings.muteManagedStreams"),active:!store.get("settings.openStreamsInBackground")||store.get("settings.focusStreamOnOpen")});
      if (opened) store.set("extension.managedTabs", Math.max(store.get("extension.managedTabs"), 1));
    } catch (error) {
      if (store.get("settings.extensionFallback")) await safeExternal(validation.url);
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
          const tab = managed.get(current.id);
          if (tab && store.get("settings.closeInternalWindowsOnEnd")) tab.close();
          if (store.get("settings.browserMode") === "extension" && store.get("settings.closeExtensionTabsOnEnd") && previous.sessionId && store.get("monitor.monitorSessionId"))
            void extensionClient?.request("get_stream_tabs").then(({tabs})=>tabs.find((item:{streamerId:string;streamSessionId:string;monitorSessionId:string})=>item.streamerId===current.id&&item.streamSessionId===previous.sessionId&&item.monitorSessionId===store.get("monitor.monitorSessionId"))).then(item=>item&&extensionClient?.request("close_stream",item)).catch(error=>log(`No se pudo cerrar la pestaña administrada: ${error.message}`,"warning",current));
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
    store.set("streamers", store.get("streamers").map(item => ({ ...item, openedSessionId: undefined })));
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
    store
      .get("streamers")
      .map((item) => ({
        ...item,
        automationRuntime: { ...item.automationRuntime, paused: true },
      })),
  );
  if (store.get("settings.closeInternalWindowsOnMonitorStop"))
    for (const window of managed.values())
      if (!window.isDestroyed()) window.close();
  if (store.get("settings.closeExtensionTabsOnMonitorStop"))
    await extensionClient?.request("close_all_managed_streams").catch(()=>{});
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
    store.set("extension", {...store.get("extension"), connected:true, sessionActive:true, ...payload, lastCommunication:new Date().toISOString(), lastError:undefined}); emit(); return payload;
  });
  handle("extension:test-open", async () => {
    const item=store.get("streamers")[0]; if(!item) throw new Error("Añade un streamer para probar la apertura.");
    const checked=validateStreamUrl(item.platform,item.url); if(!checked.valid) throw new Error(checked.reason);
    return extensionClient?.request("open_stream",{streamerId:item.id,platform:item.platform,url:checked.url,streamSessionId:`manual:${randomUUID()}`,monitorSessionId:store.get("monitor.monitorSessionId")??`manual:${randomUUID()}`,muted:true,active:false});
  });
  handle("extension:mute-all", async () => { const {tabs=[]}=await extensionClient?.request("get_stream_tabs")??{}; await Promise.all(tabs.map((item:Record<string,unknown>)=>extensionClient?.request("mute_stream",item))); });
  handle("extension:close-all", () => extensionClient?.request("close_all_managed_streams"));
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
  handle("streamer:save", (value) => {
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
    const item: Streamer = {
      ...(old ?? {}),
      id: input.id ?? randomUUID(),
      platform: input.platform,
      displayName: input.displayName.trim(),
      normalizedName: normalizeName(input.displayName),
      externalId: input.externalId?.trim() || undefined,
      url: streamUrl(input.platform, normalizeName(input.displayName)),
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
    store.set(
      "streamers",
      store.get("streamers").filter((x) => x.id !== value),
    );
    emit();
  });
  handle("settings:save", (value) => {
    const patch = value as Partial<AppState["settings"]>;
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
      "notifyExtensionErrors",
      "theme",
      "showStartNotice",
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
    store.set("settings", { ...store.get("settings"), ...allowed });
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
    },
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
  extensionClient = new BrowserExtensionClient(app.getVersion(), () => store.get("monitor.status"), patch => { store.set("extension", {...store.get("extension"),...patch}); emit(); });
  extensionClient.start();
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
  if (store.get("settings.closeExtensionTabsOnAppClose")) void extensionClient?.request("close_all_managed_streams").finally(()=>extensionClient?.stop());
  else extensionClient?.stop();
  for (const window of managed.values())
    if (!window.isDestroyed()) window.close();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !store.get("settings.minimizeToTray"))
    app.quit();
});
