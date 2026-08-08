import electronUpdater, { type AppUpdater as ElectronUpdater } from "electron-updater";
import type { UpdateState } from "../../src/domain/types";

type UpdaterOptions = {
  packaged: boolean;
  installable: boolean;
  version: string;
  changed: () => void;
  adapter?: ElectronUpdater;
  delayMs?: number;
};

export class AppUpdater {
  state: UpdateState;
  private checking = false;
  private readonly adapter: ElectronUpdater;
  private timer?: NodeJS.Timeout;

  constructor(private readonly options: UpdaterOptions) {
    this.adapter = options.adapter ?? electronUpdater.autoUpdater;
    this.state = {
      version: options.version,
      packaged: options.packaged,
      installable: options.installable,
      status: "idle",
    };
    if (!options.packaged) return;
    this.adapter.autoDownload = true;
    this.adapter.autoInstallOnAppQuit = false;
    this.adapter.on("checking-for-update", () => this.set({ status: "checking" }));
    this.adapter.on("update-not-available", () => this.finish({ status: "current" }));
    this.adapter.on("update-available", (info) =>
      this.set({ status: "available", availableVersion: info.version }),
    );
    this.adapter.on("download-progress", (progress) =>
      this.set({ status: "downloading", progress: Math.round(progress.percent) }),
    );
    this.adapter.on("update-downloaded", (info) =>
      this.finish({ status: "ready", availableVersion: info.version, progress: 100 }),
    );
    this.adapter.on("error", (error) =>
      this.finish({ status: "error", error: error.message }),
    );
  }

  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch, error: patch.status === "error" ? patch.error : undefined };
    this.options.changed();
  }
  private finish(patch: Partial<UpdateState>) {
    this.checking = false;
    this.set(patch);
  }
  start() {
    if (!this.options.packaged) return;
    this.timer = setTimeout(() => void this.check(), this.options.delayMs ?? 8_000);
  }
  async check() {
    if (!this.options.packaged) {
      this.set({ status: "error", error: "Las actualizaciones sólo se comprueban en la aplicación empaquetada." });
      return;
    }
    if (this.checking) return;
    this.checking = true;
    this.set({ status: "checking", progress: undefined, availableVersion: undefined });
    try {
      await this.adapter.checkForUpdates();
    } catch (error) {
      this.finish({ status: "error", error: error instanceof Error ? error.message : "No se pudo buscar la actualización." });
    }
  }
  install() {
    if (!this.options.installable || this.state.status !== "ready") return;
    this.adapter.quitAndInstall(false, true);
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
  }
}
