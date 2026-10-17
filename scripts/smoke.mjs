// Real Electron smoke test; no provider accounts or test tracks are injected.
import { _electron as electron, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
const profile = await mkdtemp(resolve(tmpdir(), "encore-smoke-"));
const app = await electron.launch({
  executablePath:
    process.env.ENCORE_SMOKE_EXE ||
    resolve(
      ".runtime",
      process.platform,
      process.platform === "win32" ? "electron.exe" : "electron",
    ),
  args: [
    ...(process.env.ENCORE_SMOKE_EXE ? [] : ["."]),
    "--user-data-dir=" + profile,
  ],
  timeout: 60000,
});
try {
  const window = await app.firstWindow({ timeout: 60000 });
  await expect(
    window.getByRole("heading", { name: "Set up Encore" }),
  ).toBeVisible();
  const state = await window.evaluate(() => window.encore.snapshot());
  if (state.playing || state.current || state.queue.length)
    throw Error("Fresh profile must start empty and paused.");
  await window.getByRole("button", { name: "Queue", exact: true }).click();
  await expect(
    window.getByRole("heading", { name: "Request queue" }),
  ).toBeVisible();
  await mkdir("test-results", { recursive: true });
  await window.screenshot({ path: "test-results/electron-workspace.png" });
  const denied = await window.evaluate(
    () =>
      typeof window.require === "undefined" &&
      typeof window.process === "undefined",
  );
  if (!denied) throw Error("Node unexpectedly exposed in renderer");
  console.log(
    "Electron startup, preload, empty paused state and navigation passed.",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
