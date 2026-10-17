import { EventEmitter } from "node:events";
import type { AppUpdater } from "electron-updater";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Updates } from "../desktop/updates";

function setup(enabled = true) {
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn().mockResolvedValue(null),
    quitAndInstall: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
  });
  const changed = vi.fn();
  const updates = new Updates(updater as unknown as AppUpdater, enabled, changed);
  return { updater, updates, changed };
}
afterEach(() => vi.useRealTimers());
describe("release updates", () => {
  it("uses stable downloads and requires explicit installation after readiness", () => {
    const { updater, updates, changed } = setup();
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    const beforeQuit = vi.fn();
    updates.install(beforeQuit);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit("update-downloaded", { version: "1.0.1" });
    expect(updates.ready).toBe(true);
    expect(changed).toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updates.install(beforeQuit);
    expect(beforeQuit).toHaveBeenCalledOnce();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
  it("keeps one check in flight through the entire download", async () => {
    const { updater, updates } = setup();
    let finish!: () => void;
    const downloadPromise = new Promise<void>((resolve) => { finish = resolve; });
    updater.checkForUpdates.mockResolvedValue({ downloadPromise });
    const checking = updates.check();
    await Promise.resolve();
    await updates.check();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    finish();
    await checking;
    await updates.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });
  it("allows retry after failure without exposing error details", async () => {
    const { updater, updates } = setup();
    updater.checkForUpdates.mockRejectedValueOnce(Error("private network detail"));
    await updates.check();
    expect(updates.status).toContain("Could not update");
    expect(updates.status).not.toContain("private");
    await updates.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    updater.emit("update-available", { version: "1.0.1" });
    updater.emit("download-progress", { percent: 52.9 });
    expect(updates.status).toContain("52%");
    updater.emit("error", Error("secret"));
    expect(updates.status).toContain("Could not update");
  });
  it("checks after startup and periodically, and stops on shutdown", async () => {
    vi.useFakeTimers();
    const { updater, updates } = setup();
    updates.start();
    updates.start();
    await vi.advanceTimersByTimeAsync(14999);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    updates.stop();
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });
  it("never checks or installs unsupported copies", async () => {
    const { updater, updates } = setup(false);
    updates.start();
    await updates.check();
    updates.install(vi.fn());
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(updates.status).toContain("Open Releases");
  });
});
