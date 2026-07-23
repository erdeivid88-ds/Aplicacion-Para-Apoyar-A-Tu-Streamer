import { BrowserWindow, WebContentsView } from "electron";
import { validateStreamUrl } from "../../src/domain/stream-url";
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
export class InternalBrowserManager {
  internalBrowserWindow: BrowserWindow | null = null;
  readonly tabs = new Map<string, InternalTab>();
  activeInternalTabId?: string;
  private order: string[] = [];
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
      this.activate(input.streamerId);
      return existing;
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
    return tab;
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
