import type { AppUpdater } from "electron-updater";

// Keep update network work outside the playback command queue.
export class Updates {
  status: string;
  ready = false;
  private busy = false;
  private startup?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;

  constructor(
    private updater: AppUpdater,
    private enabled: boolean,
    private changed: () => void,
    unavailable = "Automatic updates are available in the Windows installer version. Open Releases to update this copy.",
  ) {
    this.status = enabled ? "Updates have not been checked." : unavailable;
    if (!enabled) return;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.logger = null;
    updater.on("checking-for-update", () => this.report("Checking GitHub releases…"));
    updater.on("update-available", (info) =>
      this.report(`Downloading Encore ${info.version}…`),
    );
    updater.on("update-not-available", () => this.report("Encore is up to date."));
    updater.on("download-progress", (progress) =>
      this.report(`Downloading update: ${Math.floor(progress.percent)}%`),
    );
    updater.on("update-downloaded", (info) => {
      this.ready = true;
      this.report(`Encore ${info.version} is ready. Restart and install when you finish listening.`);
    });
    updater.on("error", () => {
      if (!this.ready)
        this.report("Could not update. Check your connection or open Releases to install manually.");
    });
  }

  private report(status: string) {
    this.status = status;
    this.changed();
  }

  start() {
    if (!this.enabled || this.interval) return;
    this.startup = setTimeout(() => void this.check(), 15000);
    this.startup.unref();
    this.interval = setInterval(() => void this.check(), 6 * 60 * 60 * 1000);
    this.interval.unref();
  }

  async check() {
    if (!this.enabled || this.busy || this.ready) return;
    this.busy = true;
    try {
      const result = await this.updater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
    } catch {
      this.report("Could not update. Check your connection or open Releases to install manually.");
    } finally {
      this.busy = false;
    }
  }

  install(beforeQuit: () => void) {
    if (!this.enabled || !this.ready) return;
    beforeQuit();
    this.updater.quitAndInstall(false, true);
  }

  stop() {
    clearTimeout(this.startup);
    clearInterval(this.interval);
    this.interval = undefined;
  }
}
