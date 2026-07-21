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
const __dirname = dirname(fileURLToPath(import.meta.url));
const store = new Store<AppState>({ name: "app-data", defaults });
let win: BrowserWindow | null = null,
  tray: Tray | null = null,
  timer: NodeJS.Timeout | null = null,
  quitting = false;
const managed = new Map<string, BrowserWindow>();
const lock = new ScanLock();
const auth = new TwitchAuth(() =>
  store.get("settings.platforms.twitch.clientId"),
);
function migrate() {
  const raw = store.store as AppState;
  store.set("schemaVersion", 3);
  store.set("bot", migrateConnectionFrom102(raw.bot));
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
const state = () => store.store;
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
  if (store.get("settings.browserMode") === "managed") {
    const existing = managed.get(s.id);
    const result = (await openOrReuseManaged(
      existing,
      () =>
        new BrowserWindow({
          width: 1100,
          height: 760,
          webPreferences: {
            partition: "persist:managed-browser",
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        }),
      s.url,
    )) as BrowserWindow;
    managed.set(s.id, result);
    if (!existing) result.once("closed", () => managed.delete(s.id));
  } else await safeExternal(s.url);
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
async function automate(s: Streamer) {
  const decision = decideAutomation(s, Date.now());
  s.automationRuntime = decision.runtime;
  if (decision.reason === "unauthorized" && s.automation.enabled)
    store.set("bot.status", "unauthorized-channel");
  if (!decision.send) return;
  if (store.get("bot.status") !== "connected") return;
  try {
    const broadcasterId =
      s.externalId ?? (await auth.resolveBroadcaster(s.normalizedName));
    await auth.send(broadcasterId, sanitizeMessage(s.automation.message));
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
async function scan() {
  return lock.run(async () => {
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
        let accessToken: string | undefined;
        if (previous.platform === "twitch")
          accessToken = await auth.accessToken();
        const provider =
          previous.platform === "twitch"
            ? new TwitchProvider()
            : new KickProvider();
        const result = await provider.check(previous, {
          clientId: store.get(
            `settings.platforms.${previous.platform}.clientId`,
          ),
          accessToken,
        });
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
          if (tab && store.get("settings.closeManagedTabs")) tab.close();
        }
        await automate(current);
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
    });
    emit();
    return true;
  });
}
function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(
    () => void scan(),
    Math.max(5, store.get("settings.scanMinutes")) * 60000,
  );
}
function start() {
  schedule();
  store.set("monitor.status", "starting");
  emit();
  void scan();
}
function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  store.set("monitor.status", "off");
  store.set("monitor.nextScan", undefined);
  emit();
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
  handle("monitor:start", () => start());
  handle("monitor:stop", () => stop());
  handle("monitor:scan", () => scan());
  handle("bot:connect", async (value) => {
    if (value !== "personal" && value !== "bot")
      throw new Error("Tipo de cuenta no válido.");
    try {
      const bot = await auth.connect(value as TwitchAccountType);
      store.set("bot", bot);
      emit();
    } catch (error) {
      store.set("bot", {
        status: botStatus(error),
        accountType: value as TwitchAccountType,
        detail: error instanceof Error ? error.message : "Error OAuth",
      });
      emit();
      throw error;
    }
  });
  handle("bot:disconnect", () => {
    auth.clear();
    store.set("bot", { status: "disconnected" });
    emit();
  });
  handle("bot:switch-type", (value) => {
    if (value !== "personal" && value !== "bot")
      throw new Error("Tipo de cuenta no válido.");
    auth.clear();
    store.set("bot", { status: "disconnected", accountType: value });
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
      url: `https://${input.platform === "twitch" ? "www.twitch.tv" : "kick.com"}/${normalizeName(input.displayName)}`,
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
      "countdownSeconds",
      "startup",
      "startMinimized",
      "minimizeToTray",
      "notifications",
      "browserMode",
      "closeManagedTabs",
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
    schedule();
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Abrir aplicación",
        click: () => {
          win?.show();
          win?.focus();
        },
      },
      { label: "Encender monitor", click: start },
      { label: "Apagar monitor", click: stop },
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
  stop();
  for (const window of managed.values())
    if (!window.isDestroyed()) window.close();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !store.get("settings.minimizeToTray"))
    app.quit();
});
