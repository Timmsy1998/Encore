// Real Electron smoke test; no provider accounts or test tracks are injected.
import { _electron as electron, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
const profile = await mkdtemp(resolve(tmpdir(), "encore-smoke-"));
// Some Windows development shells inherit this flag from their host editor.
delete process.env.ELECTRON_RUN_AS_NODE;
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
  // Provider WebContentsView pages can arrive before the application window.
  let window;
  await expect
    .poll(async () => {
      for (const page of app.windows()) {
        const isPlayer = await page
          .evaluate(() => typeof window.encore !== "undefined")
          .catch(() => false);
        if (isPlayer) {
          window = page;
          return true;
        }
      }
      return false;
    }, { timeout: 60000 })
    .toBe(true);
  if (!window) throw Error("Encore application window did not load.");
  await expect(
    window.getByRole("heading", { name: "Set up Encore" }),
  ).toBeVisible();
  const state = await window.evaluate(() => window.encore.snapshot());
  if (state.playing || state.current || state.queue.length)
    throw Error("Fresh profile must start empty and paused.");
  // Keep authorization local while exercising the real setup and IPC path.
  await app.evaluate(({ shell }) => {
    globalThis.encoreSmokeOpenExternal = shell.openExternal;
    shell.openExternal = async (url) => { globalThis.encoreSmokeAuthUrl = url; };
  });
  try {
    await window.evaluate(() => window.encore.command({
      type: "settings", settings: { setupStep: 4, volume: 23 },
    }));
    await window.getByLabel("Spotify Client ID").fill("a".repeat(32));
    await window.getByRole("button", { name: "Connect Spotify", exact: true }).click();
    await expect.poll(() => app.evaluate(() => globalThis.encoreSmokeAuthUrl))
      .toContain("https://accounts.spotify.com/authorize?");
    const authUrl = new URL(await app.evaluate(() => globalThis.encoreSmokeAuthUrl));
    expect(authUrl.searchParams.get("client_id")).toBe("a".repeat(32));
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const saved = await window.evaluate(() => window.encore.snapshot());
    expect(saved.settings.setupStep).toBe(4);
    expect(saved.settings.volume).toBe(23);
    expect(saved.settings.clientId).toBe("a".repeat(32));
    await window.getByRole("button", { name: "Continue / skip", exact: true }).click();
    await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).settings.setupStep)
      .toBe(5);
    expect((await window.evaluate(() => window.encore.snapshot())).settings.clientId)
      .toBe("a".repeat(32));
  } finally {
    await app.evaluate(({ shell }) => {
      shell.openExternal = globalThis.encoreSmokeOpenExternal;
      delete globalThis.encoreSmokeOpenExternal;
      delete globalThis.encoreSmokeAuthUrl;
    });
  }
  await window.getByRole("button", { name: "Queue", exact: true }).click();
  await expect(
    window.getByRole("heading", { name: "Request queue" }),
  ).toBeVisible();
  // Exercise the actual renderer → validated IPC → native clipboard path.
  const previousClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await window.getByRole("button", { name: "Settings", exact: true }).click();
    await window.getByRole("button", { name: "Copy redirect URI" }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("http://127.0.0.1:17843/callback");
    await window.getByRole("button", { name: "Overlay", exact: true }).click();
    await window.getByRole("button", { name: "Copy overlay URL" }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("http://127.0.0.1:17843/overlay.html");
  } finally {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard);
  }
  await window.getByRole("button", { name: "Queue", exact: true }).click();
  await mkdir("test-results", { recursive: true });
  await window.screenshot({ path: "test-results/electron-player.png" });
  const denied = await window.evaluate(
    () =>
      typeof window.require === "undefined" &&
      typeof window.process === "undefined",
  );
  if (!denied) throw Error("Node unexpectedly exposed in renderer");
  console.log(
    "Electron startup, preload, empty paused state, Spotify setup/authorization launch, navigation and native clipboard passed.",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
