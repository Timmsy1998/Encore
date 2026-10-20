// Real Electron smoke test; provider responses below are controlled fixtures, not account verification.
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
  expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu())).toBe(null);
  await expect(window.getByRole("group", { name: "Window controls" })).toBeVisible();
  // Check the real IPC boundary and preserve the close-to-tray behaviour.
  expect(await window.evaluate(async () => {
    try { await window.encore.windowAction("invalid"); return false; } catch { return true; }
  })).toBe(true);
  await window.evaluate(() => window.encore.command({ type: "settings", settings: { closeToTray: true } }));
  await window.getByRole("button", { name: "Close window", exact: true }).click();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await window.evaluate(() => window.encore.command({ type: "settings", settings: { closeToTray: false } }));
  // A fresh idle app must not bootstrap either provider SDK or an iframe.
  const idleProviders = await app.evaluate(async ({ webContents }) => {
    const player = webContents.getAllWebContents().find(contents => contents.getURL().includes("/player.html?"));
    if (!player) throw Error("Missing playback view");
    return player.executeJavaScript(`({ scripts: [...document.scripts].map(s => s.src), frames: document.querySelectorAll('iframe').length })`);
  });
  expect(idleProviders.frames).toBe(0);
  expect(idleProviders.scripts.some(url => /youtube|scdn/.test(url))).toBe(false);
  // Streamer.bot saves must retain the active step and unrelated settings.
  await window.evaluate(() => window.encore.command({
    type: "settings", settings: { setupStep: 1, volume: 23 },
  }));
  await window.getByLabel("WebSocket port").fill("65534");
  await window.getByRole("button", { name: "Save & connect", exact: true }).click();
  await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).settings.wsPort)
    .toBe(65534);
  expect((await window.evaluate(() => window.encore.snapshot())).settings.setupStep).toBe(1);
  expect((await window.evaluate(() => window.encore.snapshot())).settings.volume).toBe(23);

  // Use a controlled API response, while the real secret-save/test path runs.
  await app.evaluate(() => {
    globalThis.encoreSmokeFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://www.googleapis.com/youtube/v3/")) {
        globalThis.encoreSmokeYoutubeKey = new URL(url).searchParams.get("key");
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return globalThis.encoreSmokeFetch(url, init);
    };
  });
  try {
    await window.evaluate(() => window.encore.command({ type: "settings", settings: { setupStep: 3 } }));
    await window.getByLabel("YouTube API key").fill("encore-smoke-key");
    await window.getByRole("button", { name: "Save & test API", exact: true }).click();
    await expect.poll(() => app.evaluate(() => globalThis.encoreSmokeYoutubeKey)).toBe("encore-smoke-key");
    await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).youtube)
      .toContain("API verified");
    expect((await window.evaluate(() => window.encore.snapshot())).youtubeConfigured).toBe(true);
    await expect(window.getByLabel("YouTube API key")).toHaveValue("");
    await expect(window.getByLabel("YouTube API key")).toHaveAttribute("placeholder", "•••••••• (saved key)");
    expect(JSON.stringify(await window.evaluate(() => window.encore.snapshot()))).not.toContain("encore-smoke-key");
    await window.reload();
    await expect(window.getByLabel("YouTube API key")).toHaveAttribute("placeholder", "•••••••• (saved key)");
    await expect(window.getByRole("status").filter({ hasText: "API verified" })).toBeVisible();
    // An empty replacement field must test the existing key, not erase it.
    await window.getByRole("button", { name: "Save & test API", exact: true }).click();
    await expect.poll(() => app.evaluate(() => globalThis.encoreSmokeYoutubeKey)).toBe("encore-smoke-key");
    expect((await window.evaluate(() => window.encore.snapshot())).settings.setupStep).toBe(3);
    expect((await window.evaluate(() => window.encore.snapshot())).settings.wsPort).toBe(65534);
    expect((await window.evaluate(() => window.encore.snapshot())).settings.volume).toBe(23);
  } finally {
    await app.evaluate(() => {
      globalThis.fetch = globalThis.encoreSmokeFetch;
      delete globalThis.encoreSmokeFetch;
      delete globalThis.encoreSmokeYoutubeKey;
    });
  }
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
    // Exercise both playlist buttons through real IPC/provider parsing, including
    // OAuth callback, replacement and failure preservation. No live account used.
    await app.evaluate(() => {
      globalThis.encoreSmokeFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const address = new URL(String(url));
        let body;
        let status = 200;
        if (address.href === "https://accounts.spotify.com/api/token")
          body = { access_token: "smoke-access", refresh_token: "smoke-refresh", expires_in: 3600 };
        else if (address.hostname === "api.spotify.com" && address.pathname === "/v1/search")
          body = { tracks: { items: [{ id: "b".repeat(22), type: "track", name: "Spotify search smoke", artists: [{ name: "Fixture" }], duration_ms: 180000 }] } };
        else if (address.hostname === "www.googleapis.com" && address.pathname.endsWith("/search"))
          body = { items: [{ id: { videoId: "abcdefghijk" } }] };
        else if (address.hostname === "api.spotify.com" && address.pathname.endsWith("/items"))
          body = { items: [{ item: { id: "b".repeat(22), type: "track", name: "Spotify import smoke", artists: [{ name: "Fixture" }], duration_ms: 180000 } }] };
        else if (address.hostname === "www.googleapis.com" && address.pathname.endsWith("/playlistItems")) {
          if (address.searchParams.get("playlistId") === "PLmissing000") { body = {}; status = 404; }
          else body = { items: [{ contentDetails: { videoId: "abcdefghijk" } }] };
        } else if (address.hostname === "www.googleapis.com" && address.pathname.endsWith("/videos"))
          body = { items: [{ id: "abcdefghijk", status: { embeddable: true }, snippet: { title: "YouTube import smoke", channelTitle: "Fixture" }, contentDetails: { duration: "PT3M" } }] };
        else return globalThis.encoreSmokeFetch(url, init);
        return new Response(JSON.stringify(body), { status });
      };
    });
    try {
      const callback = new URL("http://127.0.0.1:17843/callback");
      callback.searchParams.set("state", authUrl.searchParams.get("state"));
      callback.searchParams.set("code", "smoke-code");
      expect((await fetch(callback)).status).toBe(200);
      const choices = await window.evaluate(() => window.encore.searchSongs("Fixture song"));
      expect(choices.tracks.map(track => track.source)).toEqual(["spotify", "youtube"]);
      expect(choices.warnings).toEqual([]);
      expect((await window.evaluate(() => window.encore.snapshot())).queue).toEqual([]);
      expect(await window.evaluate(() => window.encore.searchSongs(" ").then(() => false, () => true))).toBe(true);
      for (const [url, source] of [
        ["https://open.spotify.com/playlist/" + "a".repeat(22), "spotify"],
        ["https://www.youtube.com/playlist?list=PLabcdefghijk", "youtube"],
      ]) {
        await window.getByLabel("Base playlist URL").fill(url);
        await window.getByRole("button", { name: "Import playlist", exact: true }).click();
        await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).base[0]?.source).toBe(source);
        await expect(window.getByText("Playlist imported. 1 base tracks saved")).toBeVisible();
        expect((await window.evaluate(() => window.encore.snapshot())).settings.setupStep).toBe(5);
      }
      await window.getByLabel("Base playlist URL").fill("https://www.youtube.com/playlist?list=PLmissing000");
      await window.getByRole("button", { name: "Import playlist", exact: true }).click();
      await expect(window.getByRole("alert")).toContainText("YouTube playlist not found");
      expect((await window.evaluate(() => window.encore.snapshot())).base[0]?.title).toBe("YouTube import smoke");
      // Build and persist a mixed playlist through the real UI, IPC and providers.
      await window.getByRole("button", { name: "Playlists", exact: true }).click();
      await window.getByLabel("New playlist name").fill("Mixed stream");
      await window.getByRole("button", { name: "Create playlist", exact: true }).click();
      await expect(window.getByLabel("Playlist song or URL")).toHaveCount(0);
      await window.getByLabel("New playlist name").fill("Later collection");
      await window.getByRole("button", { name: "Create playlist", exact: true }).click();
      await window.getByRole("button", { name: "Move playlist Later collection up", exact: true }).click();
      await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).playlists[0].name).toBe("Later collection");
      await window.getByRole("button", { name: "Move playlist Later collection down", exact: true }).click();
      await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).playlists[0].name).toBe("Mixed stream");
      await window.getByRole("button", { name: "Open playlist Mixed stream", exact: true }).click();
      for (const input of ["https://open.spotify.com/playlist/" + "a".repeat(22), "https://www.youtube.com/playlist?list=PLabcdefghijk"]) {
        await window.getByLabel("Playlist song or URL").fill(input);
        await window.getByRole("button", { name: "Append playlist", exact: true }).click();
        await expect(window.getByLabel("Playlist song or URL")).toHaveValue("");
      }
      await expect(window.getByRole("list", { name: "Mixed stream tracks" }).getByRole("listitem")).toHaveCount(2);
      await window.getByRole("region", { name: "Saved playlists" }).screenshot({ path: "test-results/mixed-playlists-electron.png" });
      await window.getByRole("button", { name: "Use for stream", exact: true }).click();
      await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).base.map(t => t.source)).toEqual(["spotify", "youtube"]);
      await window.getByRole("button", { name: "Move YouTube import smoke up", exact: true }).click();
      await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).playlists[0].tracks[0].source).toBe("youtube");
      await window.reload();
      await window.getByRole("button", { name: "Playlists", exact: true }).click();
      await expect(window.getByRole("status").filter({ hasText: "Stream playlist: Mixed stream" })).toBeVisible();
      await expect(window.getByLabel("Playlist song or URL")).toHaveCount(0);
      await window.getByRole("button", { name: "Open playlist Mixed stream", exact: true }).click();
      await window.getByLabel("Rename playlist").fill("Mixed favourites");
      await window.getByRole("button", { name: "Rename", exact: true }).click();
      await expect(window.getByRole("list", { name: "Mixed favourites tracks" }).getByRole("listitem")).toHaveCount(2);
      await window.getByLabel("Playlist song or URL").fill("https://www.youtube.com/playlist?list=PLmissing000");
      await window.getByRole("button", { name: "Append playlist", exact: true }).click();
      await expect(window.getByRole("alert")).toContainText("YouTube playlist not found");
      expect((await window.evaluate(() => window.encore.snapshot())).playlists[0].tracks).toHaveLength(2);
      await window.getByRole("button", { name: "Remove Spotify import smoke from playlist", exact: true }).click();
      await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).base.map(t => t.source)).toEqual(["youtube"]);
      // Exercise the real window lifecycle with a controlled official-SDK-shaped player.
      // This verifies background timers and queue control, not real YouTube/account playback.
      await app.context().route("https://www.youtube.com/iframe_api", route => route.fulfill({
        contentType: "application/javascript",
        body: `window.YT = { Player: class {
          constructor(_, options) {
            window.encoreSmokeYT = this;
            this.id = ""; this.playback = 2; this.started = Date.now();
            setTimeout(() => options.events.onReady(), 0);
          }
          loadVideoById(id) { this.id = id; this.playVideo(); }
          cueVideoById(id) { this.id = id; this.pauseVideo(); }
          playVideo() { this.playback = 1; this.started = Date.now(); }
          pauseVideo() { this.playback = 2; }
          setVolume() {}
          getVideoData() { return { video_id: this.id }; }
          getPlayerState() { return this.playback; }
          getCurrentTime() { return (Date.now() - this.started) / 1000; }
        }}; window.onYouTubeIframeAPIReady();`,
      }));
      const playerValue = expression => app.evaluate(async ({ webContents }, expression) => {
        const player = webContents.getAllWebContents().find(contents => contents.getURL().includes("/player.html?"));
        if (!player) throw Error("Missing playback view");
        return player.executeJavaScript(expression);
      }, expression);
      const windowState = () => app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        return { minimised: win.isMinimized(), visible: win.isVisible() };
      });
      await window.evaluate(() => window.encore.command({ type: "play" }));
      await expect.poll(() => playerValue("window.encoreSmokeYT?.getPlayerState()")).toBe(1);
      await window.evaluate(() => window.encore.windowAction("minimize"));
      await expect.poll(async () => (await windowState()).minimised).toBe(true);
      // The unthrottled sampler must keep reporting progress to main while minimised.
      const position = ((await window.evaluate(() => window.encore.snapshot())).progress?.position ?? 0);
      await expect.poll(async () => ((await window.evaluate(() => window.encore.snapshot())).progress?.position ?? 0), { timeout: 10000 })
        .toBeGreaterThan(position + 1);
      expect((await window.evaluate(() => window.encore.snapshot())).playing).toBe(true);
      // A provider-ended event rotates the base playlist without opening the window.
      const generation = await playerValue("state.generation");
      await playerValue("window.encoreSmokeYT.playback = 0");
      await expect.poll(() => playerValue("state.generation")).toBeGreaterThan(generation);
      await expect.poll(() => playerValue("window.encoreSmokeYT.getPlayerState()")).toBe(1);
      expect((await windowState()).minimised).toBe(true);
      await window.evaluate(() => window.encore.command({ type: "pause" }));
      expect((await window.evaluate(() => window.encore.snapshot())).playing).toBe(false);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
      expect((await window.evaluate(() => window.encore.snapshot())).playing).toBe(false);
      expect(await playerValue("window.encoreSmokeYT.getPlayerState()")).toBe(2);
      await window.getByRole("button", { name: "Stop stream playlist", exact: true }).click();
      await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).activePlaylistId).toBeNull();
      await window.evaluate(() => window.encore.command({ type: "skip" }));

    } finally {
      await app.evaluate(() => {
        globalThis.fetch = globalThis.encoreSmokeFetch;
        delete globalThis.encoreSmokeFetch;
      });
    }

  } finally {
    await app.evaluate(({ shell }) => {
      shell.openExternal = globalThis.encoreSmokeOpenExternal;
      delete globalThis.encoreSmokeOpenExternal;
      delete globalThis.encoreSmokeAuthUrl;
    });
  }
  await window.getByRole("button", { name: "Queue / Up Next", exact: true }).click();
  await expect(
    window.getByRole("heading", { name: "Queue / Up Next" }),
  ).toBeVisible();
  // Exercise the actual renderer → validated IPC → native clipboard path.
  const previousClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await window.getByRole("button", { name: "Settings", exact: true }).click();
    await window.getByRole("button", { name: "Copy redirect URI" }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("http://127.0.0.1:17843/callback");
    await window.getByRole("button", { name: "Overlay", exact: true }).click();
    await window.getByLabel("Overlay style", { exact: true }).selectOption("glass");
    await window.getByLabel("Accent colour", { exact: true }).fill("#70e0cc");
    await expect.poll(async () => (await window.evaluate(() => window.encore.snapshot())).settings.overlayTheme).toBe("glass");
    const overlayId = await app.evaluate(async ({ BrowserWindow }) => {
      const view = new BrowserWindow({ width: 960, height: 260, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      await view.loadURL("http://127.0.0.1:17843/overlay.html?test=1");
      return view.id;
    });
    const overlay = app.windows().find(page => page.url().includes("/overlay.html?test=1"));
    if (!overlay) throw Error("OBS overlay window did not load.");
    try {
      await expect(overlay.locator("main")).toHaveClass(/glass/);
      await expect(overlay.locator("main")).toHaveCSS("--accent", "#70e0cc");
      await expect(overlay.locator("h1")).toHaveText("Your next favourite song");
      await window.getByLabel("Overlay style", { exact: true }).selectOption("minimal");
      await expect(overlay.locator("main")).toHaveClass(/minimal/);
      await overlay.screenshot({ path: "test-results/electron-overlay.png" });
      await window.getByRole("button", { name: "Add overlay", exact: true }).click();
      await expect(window.getByRole("textbox", { name: "Browser-source URL" })).toHaveValue(/\?preset=/);
      const sourceUrl = await window.getByRole("textbox", { name: "Browser-source URL" }).inputValue();
      if (!sourceUrl.includes("?preset=")) throw Error("Missing independent overlay URL");
      await window.getByLabel("Overlay style", { exact: true }).selectOption("card");
      const secondId = await app.evaluate(async ({ BrowserWindow }, url) => {
        const view = new BrowserWindow({ width: 960, height: 1100, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        await view.loadURL(url + "&test=1");
        return view.id;
      }, sourceUrl);
      const second = app.windows().find(page => page.url() === sourceUrl + "&test=1");
      if (!second) throw Error("Second OBS overlay did not load");
      try {
        await expect(second.locator("main")).toHaveClass(/card/);
        await window.getByLabel("Overlay layout", { exact: true }).selectOption("vertical");
        await window.getByRole("switch", { name: "Spinning vinyl artwork", exact: true }).click();
        await expect(second.locator("main")).toHaveClass(/vertical vinyl/);
        await expect(second.locator(".encore-art")).toHaveCSS("animation-play-state", "running");
        await expect(overlay.locator("main")).toHaveClass(/horizontal/);
        await expect(second.locator("small")).toHaveText("PREVIEW");
        await second.locator("main").evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
        await second.screenshot({ path: "test-results/electron-overlay-gallery.png" });
        await expect(overlay.locator("main")).toHaveClass(/minimal/);
        await window.getByLabel("Overlay name", { exact: true }).fill("Second box");
        await window.getByRole("button", { name: "Save name", exact: true }).click();
        await expect(window.getByRole("textbox", { name: "Browser-source URL" })).toHaveValue(sourceUrl);
        await window.getByRole("button", { name: "Copy overlay URL" }).click();
        await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(sourceUrl);
        await window.getByLabel("Overlay style", { exact: true }).selectOption("glass");
        await expect(second.locator("main")).toHaveClass(/glass/);
        await expect(overlay.locator("main")).toHaveClass(/minimal/);
        await window.getByRole("button", { name: "Delete overlay", exact: true }).click();
        await expect(second.locator("main")).toBeHidden();
        await expect(overlay.locator("main")).toBeVisible();
      } finally { await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), secondId); }

    } finally { await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), overlayId); }
    await window.getByRole("button", { name: "Copy overlay URL" }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("http://127.0.0.1:17843/overlay.html");
  } finally {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard);
  }
  await window.getByRole("button", { name: "Queue / Up Next", exact: true }).click();
  await mkdir("test-results", { recursive: true });
  await window.screenshot({ path: "test-results/electron-player.png" });
  const denied = await window.evaluate(
    () =>
      typeof window.require === "undefined" &&
      typeof window.process === "undefined",
  );
  if (!denied) throw Error("Node unexpectedly exposed in renderer");
  console.log(
    "Electron startup, preload, empty paused state, Streamer.bot/YouTube/Spotify setup saves, authorization launch, Spotify/YouTube playlist imports, mixed stream playlist creation/activation/reorder/reload/editing, failure preservation, minimised YouTube playback/rotation and pause, navigation, live OBS overlay customisation and native clipboard passed.",
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
