declare const chrome: any;
import { normalizeKickUrl } from "../src/domain/stream-url";
import { configureManagedKickPlayback } from "../src/domain/kick-playback";
import { createManagedTabRegistry, type ManagedTab } from "./managed-tabs";
import { waitForKickTabReady } from "./kick-tab-ready";
const HOST = "es.vortexstudio.apoyaatustreamer";
const VERSION = 1;
const MANAGED_REGISTRY_VERSION = 2;
const MAX_IDS = 1000;
let nativePort: any = null;
let applicationConnected = false;
let appSessionId: string | undefined;
let lastHeartbeat = 0;
let watchdog: any;
const requestIds = new Set<string>();

function safeUrl(platform: unknown, value: unknown) {
  if (platform !== "twitch" && platform !== "kick")
    throw new Error("invalid_platform");
  if (platform === "kick") {
    const normalized = normalizeKickUrl(value);
    if (!normalized.valid) throw new Error(normalized.reason);
    return normalized.url;
  }
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("invalid_url");
  const u = new URL(value.trim());
  const hosts =
    platform === "twitch"
      ? ["twitch.tv", "www.twitch.tv"]
      : ["kick.com", "www.kick.com"];
  const parts = u.pathname.split("/").filter(Boolean);
  if (
    u.protocol !== "https:" ||
    u.port ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !hosts.includes(u.hostname.toLowerCase()) ||
    parts.length !== 1 ||
    !/^[a-zA-Z0-9_]{2,30}$/.test(parts[0])
  )
    throw new Error("invalid_url");
  return `https://${platform === "twitch" ? "www.twitch.tv" : "kick.com"}/${parts[0].toLowerCase()}`;
}
const registry = createManagedTabRegistry({
  load: async () => {
    const saved = await chrome.storage.session.get([
      "managedTabsById",
      "managedTabs",
    ]);
    return saved.managedTabsById ?? saved.managedTabs;
  },
  save: async (items) => {
    await chrome.storage.session.set({ managedTabsById: items });
    await chrome.storage.session.remove("managedTabs");
  },
  getTab: (tabId) => chrome.tabs.get(tabId),
  canonicalize: safeUrl,
});
const managed = registry.items;
function traceManaged(
  stage: string,
  m: any,
  details: Record<string, unknown> = {},
) {
  console.info("[managed-tab-trace]", {
    stage,
    traceId: m?.payload?.traceId,
    appSessionId: m?.appSessionId,
    ...details,
  });
}
async function readyKickTab(tabId: number, tabCreatedAt: number) {
  return waitForKickTabReady(
    tabId,
    15000,
    {
      getTab: (id) => chrome.tabs.get(id),
      onUpdated: chrome.tabs.onUpdated,
      onRemoved: chrome.tabs.onRemoved,
    },
    tabCreatedAt,
  );
}
function stopKickAudio(tabId: number) {
  return chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => {
        const page = window as typeof window & {
          __apoyaKickAudio?: {
            observer?: MutationObserver;
            timers: number[];
            cancelled: boolean;
          };
        };
        const control = page.__apoyaKickAudio;
        if (control) {
          control.cancelled = true;
          control.observer?.disconnect();
          control.timers.forEach(clearTimeout);
          delete page.__apoyaKickAudio;
        }
      },
    })
    .catch(() => undefined);
}
function inactive() {
  const previous = appSessionId;
  applicationConnected = false;
  appSessionId = undefined;
  lastHeartbeat = 0;
  requestIds.clear();
  clearTimeout(watchdog);
  watchdog = undefined;
  for (const item of managed.values())
    if (item.platform === "kick") void stopKickAudio(item.tabId);
  if (previous) void registry.clearSession(previous);
}
function armWatchdog() {
  clearTimeout(watchdog);
  watchdog = setTimeout(inactive, 30001);
}
function response(m: any, success: boolean, payload: any = {}, error?: string) {
  nativePort?.postMessage({
    protocolVersion: VERSION,
    requestId: m?.requestId ?? "unknown",
    success,
    ...(success ? { payload } : { error: error ?? "rejected" }),
  });
}
function validate(m: any, handshake = false) {
  if (
    !m ||
    m.protocolVersion !== VERSION ||
    typeof m.requestId !== "string" ||
    !m.requestId ||
    typeof m.appSessionId !== "string" ||
    !m.appSessionId ||
    typeof m.action !== "string" ||
    !m.payload ||
    typeof m.payload !== "object"
  )
    throw new Error("invalid_message");
  if (requestIds.has(m.requestId)) throw new Error("duplicate_request");
  requestIds.add(m.requestId);
  if (requestIds.size > MAX_IDS)
    requestIds.delete(requestIds.values().next().value);
  if (
    !handshake &&
    (!applicationConnected ||
      m.appSessionId !== appSessionId ||
      Date.now() - lastHeartbeat > 30000)
  )
    throw new Error("inactive_session");
}
async function exact(m: any) {
  const tabId = m.payload.tabId;
  const cached = typeof tabId === "number" ? managed.get(tabId) : undefined;
  traceManaged("I_MANAGED_LOOKUP", m, {
    tabId,
    tabIdType: typeof tabId,
    managedTabIds: [...managed.keys()],
    entryFound: Boolean(cached),
    storedAppSessionId: cached?.appSessionId,
    receivedAppSessionId: m.appSessionId,
  });
  try {
    const managedTab = await registry.getManagedTab(
      tabId,
      m.appSessionId,
      m.action !== "configure_audio",
    );
    const { item, tab } = managedTab;
    if (
      m.action !== "configure_audio" &&
      (item.streamerId !== m.payload.streamerId ||
        item.platform !== m.payload.platform ||
        item.streamSessionId !== m.payload.streamSessionId ||
        item.monitorSessionId !== m.payload.monitorSessionId)
    )
      throw new Error("TAB_NOT_REGISTERED");
    traceManaged("I_MANAGED_LOOKUP_RESULT", m, {
      tabId,
      result: "FOUND",
      storedAppSessionId: item.appSessionId,
    });
    const ready =
      item.platform === "kick"
        ? await readyKickTab(tabId, item.createdAt)
        : undefined;
    if (ready)
      traceManaged("TAB_READY", m, {
        tabId,
        tabReadyDurationMs: ready.tabReadyDurationMs,
        tabUrlReady: ready.tabUrlReady,
        documentComplete: ready.documentComplete,
      });
    return { item, tab: ready?.tab ?? tab, diagnostic: ready };
  } catch (error) {
    traceManaged("I_MANAGED_LOOKUP_RESULT", m, {
      tabId,
      result: "REJECTED",
      errorCode: error instanceof Error ? error.message : "rejected",
    });
    throw error;
  }
}
async function configureKickPlayer(tabId: number, volume: number) {
  const [result] = await chrome.scripting
    .executeScript({
      target: { tabId },
      func: async (configuredVolume: number) => {
        if (
          location.protocol !== "https:" ||
          !(
            location.hostname === "kick.com" ||
            location.hostname === "www.kick.com"
          )
        )
          return {
            playerFound: false,
            playerMutedBefore: null,
            playerMutedAfter: null,
            playerVolumeBefore: null,
            playerVolumeAfter: null,
            muteButtonFound: false,
            muteButtonClicked: false,
            playbackReady: false,
            attempts: 0,
            errorCode: "NOT_KICK_TAB",
          };
        const page = window as typeof window & {
          __apoyaKickAudio?: {
            observer?: MutationObserver;
            timers: number[];
            cancelled: boolean;
            attempts: number;
            last?: unknown;
          };
        };
        if (page.__apoyaKickAudio) {
          page.__apoyaKickAudio.cancelled = true;
          page.__apoyaKickAudio.observer?.disconnect();
          page.__apoyaKickAudio.timers.forEach(clearTimeout);
        }
        const control = {
          timers: [] as number[],
          cancelled: false,
          attempts: 0,
        } as {
          observer?: MutationObserver;
          timers: number[];
          cancelled: boolean;
          attempts: number;
          last?: unknown;
        };
        page.__apoyaKickAudio = control;
        const buttonState = (button: HTMLElement | undefined) =>
          button
            ? (button.getAttribute("aria-label") ??
              button.getAttribute("title") ??
              button.getAttribute("aria-pressed") ??
              "")
            : undefined;
        const attempt = async () => {
          if (control.cancelled) return;
          const videos = [...document.querySelectorAll("video")].filter(
            (video) => {
              const box = video.getBoundingClientRect();
              return (
                box.width > 200 &&
                box.height > 100 &&
                getComputedStyle(video).visibility !== "hidden"
              );
            },
          ) as HTMLVideoElement[];
          const video = videos.sort(
            (a, b) =>
              b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
          )[0];
          const buttons = [
            ...document.querySelectorAll<HTMLElement>('[role="button"],button'),
          ];
          const muteButton = buttons.find((candidate) =>
            /mute|unmute|silenciar|activar sonido|desmutear/i.test(
              buttonState(candidate) ?? "",
            ),
          );
          const before = video
            ? {
                playerMutedBefore: video.muted,
                playerVolumeBefore: video.volume,
              }
            : { playerMutedBefore: null, playerVolumeBefore: null };
          const stateBefore = buttonState(muteButton);
          const alreadyReady = Boolean(
            video && !video.muted && video.volume > 0,
          );
          let domUnmuteAttempted = false;
          if (video && !alreadyReady) {
            domUnmuteAttempted = true;
            video.muted = false;
            video.defaultMuted = false;
            if (video.volume === 0)
              video.volume = configuredVolume > 0 ? configuredVolume : 1;
            video.dispatchEvent(new Event("volumechange", { bubbles: true }));
            await Promise.resolve();
          }
          let clicked = false;
          const buttonIndicatesMuted = Boolean(
            muteButton &&
            (/unmute|activar sonido|desmutear/i.test(stateBefore ?? "") ||
              muteButton.getAttribute("aria-pressed") === "true"),
          );
          if (
            muteButton &&
            video &&
            (video.muted || video.volume === 0) &&
            buttonIndicatesMuted
          ) {
            muteButton.click();
            clicked = true;
            await Promise.resolve();
          }
          control.attempts++;
          control.last = {
            playerFound: Boolean(video),
            ...before,
            playerMutedAfter: video?.muted ?? null,
            playerVolumeAfter: video?.volume ?? null,
            muteButtonFound: Boolean(muteButton),
            muteButtonStateBefore: stateBefore,
            muteButtonClicked: clicked,
            domUnmuteAttempted,
            buttonUnmuteAttempted: clicked,
            shortcutAttempted: false,
            shortcutResult: "not_used_in_extension",
            muteButtonStateAfter: buttonState(muteButton),
            attempts: control.attempts,
            playbackReady: Boolean(video && !video.muted && video.volume > 0),
          };
          return control.last;
        };
        control.observer = new MutationObserver(() => void attempt());
        control.observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
        document.addEventListener("loadedmetadata", attempt, {
          once: true,
          capture: true,
        });
        document.addEventListener("playing", attempt, {
          once: true,
          capture: true,
        });
        document.addEventListener("canplay", attempt, {
          once: true,
          capture: true,
        });
        for (const delay of [0, 250, 250, 500, 1000, 2000]) {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          const state = (await attempt()) as any;
          if (state?.playbackReady) return state;
        }
        control.observer?.disconnect();
        control.cancelled = true;
        return (
          control.last ?? {
            playerFound: false,
            playerMutedBefore: null,
            playerMutedAfter: null,
            playerVolumeBefore: null,
            playerVolumeAfter: null,
            muteButtonFound: false,
            muteButtonClicked: false,
            playbackReady: false,
            attempts: control.attempts,
          }
        );
      },
      args: [volume],
    })
    .catch(() => {
      throw new Error("CONTENT_SCRIPT_NOT_READY");
    });
  return result?.result;
}
async function onMessage(m: any) {
  try {
    if (m?.action === "handshake") {
      validate(m, true);
      inactive();
      requestIds.add(m.requestId);
      applicationConnected = true;
      appSessionId = m.appSessionId;
      lastHeartbeat = Date.now();
      armWatchdog();
      response(m, true, {
        extensionVersion: chrome.runtime.getManifest().version,
        managedRegistryVersion: MANAGED_REGISTRY_VERSION,
        browser: navigator.userAgent.includes("Edg/") ? "edge" : "chrome",
        connected: true,
      });
      return;
    }
    validate(m);
    if (m.action === "heartbeat") {
      lastHeartbeat = Date.now();
      armWatchdog();
      response(m, true, { connected: true });
      return;
    }
    if (m.action === "ping") {
      response(m, true, {
        connected: true,
        extensionVersion: chrome.runtime.getManifest().version,
        browser: navigator.userAgent.includes("Edg/") ? "edge" : "chrome",
        managedTabs: managed.size,
      });
      return;
    }
    if (m.action === "open_stream") {
      const p = m.payload;
      traceManaged("B_WORKER_OPEN_RECEIVED", m, {
        streamerId: p.streamerId,
        streamSessionId: p.streamSessionId,
        monitorSessionId: p.monitorSessionId,
      });
      const canonicalUrl = safeUrl(p.platform, p.url);
      for (const item of managed.values())
        if (item.streamerId === p.streamerId) {
          const current = await chrome.tabs.get(item.tabId);
          const updated = await chrome.tabs.update(item.tabId, {
            muted: p.muted === true,
          });
          traceManaged("C_TAB_UPDATED", m, {
            tabId: item.tabId,
            url: current.url,
          });
          const adopted = await registry.adopt(
            { ...item, muted: Boolean(updated.mutedInfo?.muted) },
            {
              appSessionId: m.appSessionId,
              streamSessionId: p.streamSessionId,
              monitorSessionId: p.monitorSessionId,
            },
          );
          traceManaged("D_MANAGED_REGISTERED", m, {
            tabId: adopted.tabId,
            platform: adopted.platform,
            streamSessionId: adopted.streamSessionId,
            monitorSessionId: adopted.monitorSessionId,
          });
          if (!(await registry.get(adopted.tabId)))
            throw new Error("MANAGED_TAB_REGISTER_FAILED");
          traceManaged("E_WORKER_OPENED_RESPONSE", m, { tabId: adopted.tabId });
          response(m, true, {
            ...adopted,
            created: false,
            muted: adopted.muted,
          });
          return;
        }
      const tab = await chrome.tabs.create({
        url: canonicalUrl,
        active: p.active === true,
      });
      if (typeof tab.id !== "number") throw new Error("missing_tab_id");
      const updated =
        p.muted === false
          ? tab
          : await chrome.tabs.update(tab.id, { muted: true });
      traceManaged("C_TAB_CREATED", m, {
        tabId: tab.id,
        url: tab.url ?? canonicalUrl,
      });
      const item: ManagedTab = {
        streamerId: p.streamerId,
        platform: p.platform,
        canonicalUrl,
        tabId: tab.id,
        streamSessionId: p.streamSessionId,
        monitorSessionId: p.monitorSessionId,
        appSessionId: m.appSessionId,
        createdAt: Date.now(),
        muted: Boolean(updated.mutedInfo?.muted),
        createdByIntegration: true,
      };
      await registry.register(item);
      traceManaged("D_MANAGED_REGISTERED", m, {
        tabId: item.tabId,
        platform: item.platform,
        streamSessionId: item.streamSessionId,
        monitorSessionId: item.monitorSessionId,
      });
      if (!(await registry.get(item.tabId)))
        throw new Error("MANAGED_TAB_REGISTER_FAILED");
      traceManaged("E_WORKER_OPENED_RESPONSE", m, { tabId: item.tabId });
      response(m, true, { ...item, created: true });
      return;
    }
    if (m.action === "get_stream_tabs") {
      response(m, true, { tabs: [...managed.values()] });
      return;
    }
    if (m.action === "close_all_managed_streams") {
      const ids = [...managed.keys()];
      if (ids.length) await chrome.tabs.remove(ids);
      for (const id of ids) await registry.remove(id);
      response(m, true, { closed: ids.length });
      return;
    }
    if (m.action === "configure_audio")
      traceManaged("H_WORKER_ENSURE_AUDIO", m, {
        tabId: m.payload.tabId,
        tabIdType: typeof m.payload.tabId,
      });
    const { item, tab, diagnostic } = await exact(m);
    if (m.action === "configure_audio") {
      if (item.platform !== "kick") {
        response(m, true, {
          tabId: item.tabId,
          tabMuted: Boolean(tab.mutedInfo?.muted),
          playerMuted: undefined,
          audioConfigured: true,
        });
        return;
      }
      const enabled = m.payload.enabled !== false;
      const volume = Math.min(
        1,
        Math.max(0, Number(m.payload.targetVolume ?? 1)),
      );
      if (!enabled) {
        await stopKickAudio(item.tabId);
        const muted = await chrome.tabs.update(item.tabId, { muted: true });
        item.muted = Boolean(muted.mutedInfo?.muted);
        response(m, true, {
          tabId: item.tabId,
          browserTabMuted: item.muted,
          playerMuted: null,
          audioConfigured: true,
          attempts: 0,
        });
        return;
      }
      if (
        !applicationConnected ||
        m.appSessionId !== appSessionId ||
        Date.now() - lastHeartbeat > 30000
      )
        throw new Error("inactive_session");
      const playback = await configureManagedKickPlayback(
        "browserTab",
        () => configureKickPlayer(item.tabId, volume),
        async () => {
          await chrome.tabs.update(item.tabId, { muted: true });
        },
        async () =>
          Boolean((await chrome.tabs.get(item.tabId)).mutedInfo?.muted),
      );
      item.muted = playback.browserTabMutedAfter ?? false;
      response(
        m,
        playback.success,
        {
          tabId: item.tabId,
          ...playback,
          audioConfigured: playback.success,
          audioAttempted: true,
          audioSuccess: playback.success,
          ...diagnostic,
          actionTaken: "player_unmuted_then_tab_muted",
        },
        playback.errorCode,
      );
      return;
    }
    if (m.action === "mute_stream" || m.action === "unmute_stream") {
      const muted = m.action === "mute_stream";
      const updated = await chrome.tabs.update(item.tabId, { muted });
      item.muted = Boolean(updated.mutedInfo?.muted);
      response(m, true, { tabId: item.tabId, muted: item.muted });
      return;
    }
    if (m.action === "focus_stream") {
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(item.tabId, { active: true });
      response(m, true, { tabId: item.tabId });
      return;
    }
    if (m.action === "release_stream") {
      await registry.remove(item.tabId);
      response(m, true, { released: true });
      return;
    }
    if (m.action === "close_stream") {
      await registry.remove(item.tabId);
      await chrome.tabs.remove(item.tabId);
      response(m, true, { closed: true });
      return;
    }
    throw new Error("unknown_action");
  } catch (e) {
    response(m, false, {}, e instanceof Error ? e.message : "rejected");
  }
}
async function restoreIdentityOnly() {
  await registry.restore();
}
function connect() {
  inactive();
  try {
    nativePort = chrome.runtime.connectNative(HOST);
    nativePort.onMessage.addListener(onMessage);
    nativePort.onDisconnect.addListener(() => {
      nativePort = null;
      inactive();
    });
  } catch {
    nativePort = null;
    inactive();
    void chrome.runtime.lastError;
  }
}
chrome.tabs.onRemoved.addListener(async (tabId: number) => {
  const item = managed.get(tabId);
  if (!item) return;
  await registry.remove(tabId);
  if (applicationConnected && nativePort)
    nativePort.postMessage({
      protocolVersion: VERSION,
      requestId: crypto.randomUUID(),
      success: true,
      event: "managed_tab_closed",
      payload: {
        streamerId: item.streamerId,
        platform: item.platform,
        streamSessionId: item.streamSessionId,
        monitorSessionId: item.monitorSessionId,
        reason: "user_closed",
      },
    });
});
chrome.tabs.onUpdated.addListener(
  async (tabId: number, change: any, tab: any) => {
    const item = managed.get(tabId);
    if (!item || !applicationConnected || Date.now() - lastHeartbeat > 30000)
      return;
    try {
      if (change.url && safeUrl(item.platform, tab.url) !== item.canonicalUrl) {
        await registry.remove(tabId);
        return;
      }
      if (item.muted && !tab.mutedInfo?.muted)
        await chrome.tabs.update(tabId, { muted: true });
    } catch {
      await registry.remove(tabId);
    }
  },
);
chrome.runtime.onMessage.addListener(
  (message: any, _sender: any, sendResponse: (value: any) => void) => {
    if (message?.action !== "status") return false;
    if (!nativePort) connect();
    sendResponse({
      connected: applicationConnected && Date.now() - lastHeartbeat <= 30000,
      monitorStatus: "La aplicación informa su estado mediante heartbeat",
      managedTabs: managed.size,
      version: chrome.runtime.getManifest().version,
    });
    return false;
  },
);
void restoreIdentityOnly().then(connect);
