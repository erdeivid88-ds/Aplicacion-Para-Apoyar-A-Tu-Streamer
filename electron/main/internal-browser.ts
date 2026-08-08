import { BrowserWindow, WebContentsView } from "electron";
import { inspectKickUrl, validateStreamUrl } from "../../src/domain/stream-url";
import { configureManagedKickPlayback } from "../../src/domain/kick-playback";
import type { Platform } from "../../src/domain/types";
export interface InternalTab {
  streamerId: string;
  platform: Platform;
  streamSessionId: string;
  monitorSessionId: string;
  canonicalUrl: string;
  view: WebContentsView;
  title: string;
  muted: boolean;
  userClosed: boolean;
  openedAt: string;
}
export interface InternalTabInput {
  streamerId: string;
  platform: Platform;
  streamSessionId: string;
  monitorSessionId: string;
  canonicalUrl: string;
  title: string;
}
const BAR_HEIGHT = 54;
function kickAudioScript(volume: number) {
  return `(async () => {
    if(location.protocol!=="https:"||!(location.hostname==="kick.com"||location.hostname==="www.kick.com"))return{playerFound:false,playerMutedBefore:null,playerMutedAfter:null,playerVolumeBefore:null,playerVolumeAfter:null,muteButtonFound:false,muteButtonClicked:false,playbackReady:false,attempts:0,errorCode:"NOT_KICK_TAB"};
    const key = "__apoyaInternalKickAudio";
    const old = window[key]; if (old) { old.observer?.disconnect(); old.timers?.forEach(clearTimeout); }
    const control = { timers: [], attempts: 0, cancelled: false }; window[key] = control;
    const label = (button) => button?.getAttribute("aria-label") || button?.getAttribute("title") || button?.getAttribute("aria-pressed") || "";
    const attempt = () => { if (control.cancelled) return control.last;
      const videos = [...document.querySelectorAll("video")].filter((video) => { const box=video.getBoundingClientRect(); return box.width>200&&box.height>100&&getComputedStyle(video).visibility!=="hidden"; }).sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight);
      const video=videos[0]; const button=[...document.querySelectorAll('[role="button"],button')].find((item)=>/mute|unmute|silenciar|activar sonido|desmutear/i.test(label(item)));
      const before=video?{playerMutedBefore:video.muted,playerVolumeBefore:video.volume}:{playerMutedBefore:null,playerVolumeBefore:null}; const buttonBefore=label(button);
      if(video){video.muted=false;video.defaultMuted=false;if(${volume}>0)video.volume=${volume};video.dispatchEvent(new Event("volumechange",{bubbles:true}));}
      let clicked=false;
      if(button&&video&&(video.muted||video.volume===0)){button.click();clicked=true;}
      control.attempts++;control.last={playerFound:!!video,...before,playerMutedAfter:video?.muted??null,playerVolumeAfter:video?.volume??null,muteButtonFound:!!button,muteButtonStateBefore:buttonBefore,muteButtonClicked:clicked,muteButtonStateAfter:label(button),attempts:control.attempts,playbackReady:!!video&&!video.muted&&video.volume>0}; return control.last;
    };
    control.observer=new MutationObserver(attempt);control.observer.observe(document.documentElement,{childList:true,subtree:true});
    addEventListener("loadedmetadata",attempt,{once:true,capture:true});addEventListener("playing",attempt,{once:true,capture:true});addEventListener("canplay",attempt,{once:true,capture:true});
    for(const delay of [0,250,250,500,1000,2000]){if(delay)await new Promise((resolve)=>setTimeout(resolve,delay));const state=attempt();if(state?.playbackReady)return state;}
    control.cancelled=true;control.observer?.disconnect();return control.last??{playerFound:false,playerMutedBefore:null,playerMutedAfter:null,playerVolumeBefore:null,playerVolumeAfter:null,muteButtonFound:false,muteButtonClicked:false,playbackReady:false,attempts:control.attempts};
  })()`;
}
export class InternalBrowserManager {
  internalBrowserWindow: BrowserWindow | null = null;
  readonly tabs = new Map<string, InternalTab>();
  activeInternalTabId?: string;
  private order: string[] = [];
  private readonly kickVolumes = new Map<string, number>();
  private intentionalWindowClose = false;
  constructor(
    private onClosed: (
      tab: InternalTab,
      reason:
        | "user_closed"
        | "stream_ended"
        | "monitor_stopped"
        | "application_closing",
    ) => void,
    private closeWhenEmpty = () => true,
    private muteOthers = () => true,
  ) {}
  private createWindow() {
    const window = new BrowserWindow({
      width: 1180,
      height: 780,
      show: false,
      title: "Navegador interno · Apoya a tu Streamer",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
      },
    });
    window.webContents.setBackgroundThrottling(false);
    window.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith("app-tab://")) {
        event.preventDefault();
        const parsed = new URL(url);
        const id = decodeURIComponent(parsed.hostname);
        if (id === "nav" && parsed.pathname === "/previous")
          this.moveActive(-1);
        else if (id === "nav" && parsed.pathname === "/next")
          this.moveActive(1);
        else if (parsed.pathname === "/close") this.close(id, "user_closed");
        else if (parsed.pathname === "/mute") this.toggleMute(id);
        else this.activate(id);
      } else if (!url.startsWith("data:text/html")) event.preventDefault();
    });
    window.on("resize", () => this.layout());
    window.on("closed", () => {
      const manual = !this.intentionalWindowClose;
      this.internalBrowserWindow = null;
      this.intentionalWindowClose = false;
      for (const tab of [...this.tabs.values()])
        this.destroyTab(
          tab,
          manual ? "user_closed" : "application_closing",
          false,
        );
    });
    this.internalBrowserWindow = window;
    return window;
  }
  private toolbar() {
    const tabs = this.order
      .map((id) => this.tabs.get(id))
      .filter(Boolean) as InternalTab[];
    const buttons = tabs
      .map(
        (tab) =>
          `<span class="tab ${tab.streamerId === this.activeInternalTabId ? "active" : ""}"><a href="app-tab://${encodeURIComponent(tab.streamerId)}/">${tab.platform === "twitch" ? "🟣" : "🟢"} ${escapeHtml(tab.title)} ${tab.muted ? "🔇" : "🔊"}</a><a title="Silenciar/activar" href="app-tab://${encodeURIComponent(tab.streamerId)}/mute">◉</a><a title="Cerrar" href="app-tab://${encodeURIComponent(tab.streamerId)}/close">×</a></span>`,
      )
      .join("");
    const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#151927;color:white;font:14px system-ui;white-space:nowrap;overflow-x:auto;padding:8px}.tab{display:inline-flex;gap:7px;padding:8px;margin-right:5px;background:#292f43;border-radius:7px}.active{outline:2px solid #8a73ff}a{color:white;text-decoration:none}</style><span class=tab><a href="app-tab://nav/previous">◀</a><a href="app-tab://nav/next">▶</a></span>${buttons}<span class=tab><a href="app-tab://all/close">Cerrar todas</a></span>`;
    void this.internalBrowserWindow?.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
  }
  async open(input: InternalTabInput, focus = false) {
    const existing = this.tabs.get(input.streamerId);
    if (existing) {
      existing.streamSessionId = input.streamSessionId;
      existing.monitorSessionId = input.monitorSessionId;
      this.activate(input.streamerId);
      return { tab: existing, reusedExistingTab: true };
    }
    const checked = validateStreamUrl(input.platform, input.canonicalUrl);
    if (!checked.valid) throw new Error(checked.reason);
    const window =
      this.internalBrowserWindow && !this.internalBrowserWindow.isDestroyed()
        ? this.internalBrowserWindow
        : this.createWindow();
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
      },
    });
    view.webContents.setBackgroundThrottling(false);
    view.webContents.setAudioMuted(true);
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event, url) => {
      try {
        const target = new URL(url);
        const allowed =
          input.platform === "twitch"
            ? ["twitch.tv", "www.twitch.tv"]
            : ["kick.com", "www.kick.com"];
        if (target.protocol !== "https:" || !allowed.includes(target.hostname))
          event.preventDefault();
      } catch {
        event.preventDefault();
      }
    });
    const tab: InternalTab = {
      ...input,
      canonicalUrl: checked.url,
      view,
      muted: true,
      userClosed: false,
      openedAt: new Date().toISOString(),
    };
    if (input.platform === "kick") {
      const retry = () => {
        const current = this.tabs.get(input.streamerId);
        if (current && !current.muted)
          void current.view.webContents
            .executeJavaScript(
              kickAudioScript(this.kickVolumes.get(input.streamerId) ?? 1),
              true,
            )
            .catch(() => undefined);
      };
      view.webContents.on("did-start-loading", retry);
      view.webContents.on("dom-ready", retry);
      view.webContents.on("did-finish-load", retry);
      view.webContents.on("did-navigate-in-page", retry);
    }
    this.tabs.set(input.streamerId, tab);
    this.order.push(input.streamerId);
    window.contentView.addChildView(view);
    view.setVisible(false);
    await view.webContents.loadURL(checked.url);
    view.webContents.setAudioMuted(true);
    if (!this.activeInternalTabId) this.activeInternalTabId = input.streamerId;
    this.layout();
    this.toolbar();
    if (!window.isVisible() && !window.isMinimized()) window.show();
    if (focus) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
    return { tab, reusedExistingTab: false };
  }
  async configureAudio(id: string, enabled = true, volume = 1) {
    const tab = this.tabs.get(id);
    if (!tab) throw new Error("internal_tab_missing");
    const shouldUnmute = tab.platform === "kick" && enabled;
    if (!shouldUnmute) {
      if (tab.platform === "kick")
        await tab.view.webContents
          .executeJavaScript(
            `(() => { const control=window.__apoyaInternalKickAudio; if(control){control.cancelled=true;control.observer?.disconnect();control.timers?.forEach(clearTimeout);delete window.__apoyaInternalKickAudio;} })()`,
            true,
          )
          .catch(() => undefined);
      tab.muted = true;
      tab.view.webContents.setAudioMuted(true);
      return { tabMuted: true, playerMuted: undefined, audioConfigured: true };
    }
    const diagnostic = inspectKickUrl(
      tab.view.webContents.getURL(),
      "webContents.getURL",
    );
    if (!diagnostic.success)
      return {
        tabMuted: tab.view.webContents.isAudioMuted(),
        playerMuted: undefined,
        audioConfigured: false,
        audioAttempted: false,
        audioSuccess: false,
        ...diagnostic,
      };
    const safeVolume = Math.min(1, Math.max(0, volume));
    this.kickVolumes.set(id, safeVolume);
    const playback = await configureManagedKickPlayback(
      "webContents",
      () =>
        tab.view.webContents.executeJavaScript(
          kickAudioScript(safeVolume),
          true,
        ),
      () => tab.view.webContents.setAudioMuted(true),
      () => tab.view.webContents.isAudioMuted(),
    );
    tab.muted = playback.webContentsMutedAfter ?? true;
    this.toolbar();
    return {
      tabMuted: playback.webContentsMutedAfter ?? true,
      playerMuted: playback.playerMutedAfter ?? undefined,
      playerVolume: playback.playerVolumeAfter,
      audioConfigured: playback.success,
      audioAttempted: true,
      audioSuccess: playback.success,
      ...playback,
      ...diagnostic,
    };
  }
  activate(id: string) {
    if (!this.tabs.has(id)) return;
    this.activeInternalTabId = id;
    this.layout();
    this.toolbar();
  }
  private moveActive(offset: number) {
    if (!this.order.length) return;
    const current = Math.max(
      0,
      this.order.indexOf(this.activeInternalTabId ?? this.order[0]),
    );
    this.activate(
      this.order[(current + offset + this.order.length) % this.order.length],
    );
  }
  toggleMute(id: string) {
    if (id === "all") {
      this.closeAll("user_closed");
      return;
    }
    const tab = this.tabs.get(id);
    if (!tab) return;
    const next = !tab.muted;
    if (!next && this.muteOthers())
      for (const other of this.tabs.values()) {
        other.muted = true;
        other.view.webContents.setAudioMuted(true);
      }
    tab.muted = next;
    tab.view.webContents.setAudioMuted(next);
    this.toolbar();
  }
  private layout() {
    const window = this.internalBrowserWindow;
    if (!window || window.isDestroyed()) return;
    const [width, height] = window.getContentSize();
    for (const [id, tab] of this.tabs) {
      const active = id === this.activeInternalTabId;
      tab.view.setVisible(active);
      if (active)
        tab.view.setBounds({
          x: 0,
          y: BAR_HEIGHT,
          width,
          height: Math.max(0, height - BAR_HEIGHT),
        });
    }
  }
  close(
    id: string,
    reason:
      | "user_closed"
      | "stream_ended"
      | "monitor_stopped"
      | "application_closing",
  ) {
    if (id === "all") {
      this.closeAll(reason);
      return;
    }
    const tab = this.tabs.get(id);
    if (!tab) return;
    this.destroyTab(tab, reason, true);
  }
  private destroyTab(
    tab: InternalTab,
    reason: Parameters<InternalBrowserManager["close"]>[1],
    update = true,
  ) {
    this.tabs.delete(tab.streamerId);
    this.order = this.order.filter((id) => id !== tab.streamerId);
    try {
      this.internalBrowserWindow?.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    } catch {
      void tab.view;
    }
    this.onClosed(tab, reason);
    if (this.activeInternalTabId === tab.streamerId)
      this.activeInternalTabId = this.order[0];
    if (update) {
      if (!this.tabs.size && this.closeWhenEmpty()) {
        this.intentionalWindowClose = true;
        this.internalBrowserWindow?.close();
      } else {
        this.layout();
        this.toolbar();
      }
    }
  }
  closeAll(reason: Parameters<InternalBrowserManager["close"]>[1]) {
    for (const tab of [...this.tabs.values()])
      this.destroyTab(tab, reason, false);
    if (
      this.internalBrowserWindow &&
      !this.internalBrowserWindow.isDestroyed()
    ) {
      this.intentionalWindowClose = true;
      this.internalBrowserWindow.close();
    }
    this.activeInternalTabId = undefined;
  }
  has(id: string) {
    return this.tabs.has(id);
  }
  count() {
    return this.tabs.size;
  }
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
