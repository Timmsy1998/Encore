import { test, expect, type Page } from "@playwright/test";
import { defaults, type Snapshot } from "../src/core/contracts";
async function boot(page: Page, setup = false, updateReady = false) {
  const state: Snapshot = {
    ...defaults(),
    current: null,
    playing: false,
    currentLane: "request",
    streamerbot: "Disconnected",
    youtube: "Not tested",
    spotify: "Disconnected",
    error: "",
    logs: [],
    secureStorage: false,
    overlayUrl: "http://127.0.0.1:17843/overlay.html",
    dataPath: "Development fixture",
    appVersion: "1.0.0",
    importStatus: "Not checked",
    updateReady,
    updateStatus: updateReady ? "Encore 1.0.1 is ready." : "Not checked",
  };
  state.settings.setupComplete = !setup;
  await page.addInitScript((initial) => {
    const state =
      JSON.parse(localStorage.getItem("fixture-state") || "null") || initial;
    const callbacks = new Set<(state: Snapshot) => void>();
    window.encore = {
      snapshot: async () => state,
      subscribe: (callback) => {
        callbacks.add(callback);
        return () => {
          callbacks.delete(callback);
        };
      },
      command: async (c) => {
        const commands = JSON.parse(localStorage.getItem("fixture-commands") || "[]");
        commands.push(c); localStorage.setItem("fixture-commands", JSON.stringify(commands));
        if (c.type === "playlistReorder") {
          const from = state.playlists.findIndex((item: { id: string }) => item.id === c.id);
          state.playlists.splice(c.to, 0, state.playlists.splice(from, 1)[0]);
        }
        if (c.type === "playlistMove") {
          const tracks = state.playlists.find((item: { id: string }) => item.id === c.id).tracks;
          tracks.splice(c.to, 0, tracks.splice(c.from, 1)[0]);
        }
        if (c.type === "playlistCreate") state.playlists.push({ id: c.id, name: c.name, tracks: [] });
        if (c.type === "playlistDelete") {
          state.playlists = state.playlists.filter((item: { id: string }) => item.id !== c.id);
          if (state.activePlaylistId === c.id) { state.activePlaylistId = null; state.base = []; }
        }
        if (c.type === "settings") Object.assign(state.settings, c.settings);
        if (c.type === "playlistActivate") {
          state.activePlaylistId = c.id;
          state.baseShuffle = c.shuffle;
          state.base = state.playlists.find((item: { id: string }) => item.id === c.id).tracks;
        }
        if (c.type === "base") {
          if (c.input.includes("missing")) throw Error("Playlist unavailable: test fixture.");
          state.base = [{ id: "abcdefghijk", source: "youtube", title: "Imported fixture", author: "Fixture", duration: 180, user: "Auto" }];
        }
        if (c.type === "request" || c.type === "listen")
          throw Error("Provider unavailable: development test fixture.");
        localStorage.setItem("fixture-state", JSON.stringify(state));
        callbacks.forEach((callback) => callback(structuredClone(state)));
      },
    };
  }, state);
  await page.goto("/");
}
test("resumable wizard and optional services", async ({ page }) => {
  await boot(page, true);
  await expect(
    page.getByRole("heading", { name: "Set up Encore" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "WebSocket port" }),
  ).toHaveValue("8080");
  await page.getByRole("button", { name: "Continue / skip" }).click();
  await expect(
    page.getByRole("button", { name: "Copy actions" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Copy actions" }),
  ).toBeVisible();
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Continue / skip" }).click();
  await expect(
    page.getByRole("textbox", { name: "Test request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open player" }).click();
  await expect(
    page.getByRole("heading", { name: "Queue / Up Next" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Queue / Up Next" }),
  ).toBeVisible();
});
test("personal listening, errors, navigation and window scaling", async ({
  page,
}, testInfo) => {
  await boot(page);
  await page.getByRole("button", { name: "Listening", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Add listening track" })
    .fill("A song to find");
  await page.getByRole("button", { name: "Add music", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Provider unavailable");
  await expect(
    page.getByRole("textbox", { name: "Add listening track" }),
  ).toHaveValue("A song to find");
  for (const name of ["Overlay", "Settings", "About", "Playlists", "Queue / Up Next"]) {
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const content = page.locator(".content");
    expect(
      await content.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
  }
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/workspace-${testInfo.project.name}.png`,
  });
});

test("downloaded update stays available across navigation and restarts only on request", async ({ page }) => {
  await boot(page, false, true);
  const restart = page.getByRole("button", { name: "Restart and install", exact: true });
  await expect(restart).toBeVisible();
  await page.getByRole("button", { name: "Listening", exact: true }).click();
  await expect(restart).toBeVisible();
  await page.evaluate(() => {
    const command = window.encore.command;
    window.encore.command = async (value) => {
      if (value.type === "installUpdate") localStorage.setItem("restart-requested", "yes");
      await command(value);
    };
  });
  expect(await page.evaluate(() => localStorage.getItem("restart-requested"))).toBeNull();
  await restart.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("restart-requested"))).toBe("yes");
});

test("playlist imports show progress, completion and failure without losing saved tracks", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  await page.evaluate(() => {
    const command = window.encore.command;
    window.encore.command = async value => {
      if (value.type === "base")
        await new Promise<void>(resolve => window.addEventListener("finish-import", () => resolve(), { once: true }));
      await command(value);
    };
  });
  await page.getByText("Import directly into the stream rotation", { exact: true }).click();
  const input = page.getByLabel("Base playlist URL");
  await input.fill("https://www.youtube.com/playlist?list=PLabcdefghijk");
  await page.getByRole("button", { name: "Import playlist", exact: true }).click();
  await expect(page.getByRole("button", { name: "Importing playlist…" })).toBeDisabled();
  await expect(page.getByText("Fetching playlist tracks…", { exact: false })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("finish-import")));
  await expect(page.getByText("Playlist imported. 1 base tracks saved")).toBeVisible();
  await input.fill("https://www.youtube.com/playlist?list=PLmissing000");
  await page.getByRole("button", { name: "Import playlist", exact: true }).click();
  await expect(page.getByRole("button", { name: "Importing playlist…" })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("finish-import")));
  await expect(page.getByRole("alert")).toContainText("Playlist unavailable");
  await expect(page.getByText("your saved playlist is unchanged", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Queue / Up Next", exact: true }).click();
  await expect(page.locator(".track-info").getByText("Imported fixture", { exact: true })).toBeVisible();
});

test("overlay customisation persists and matches the OBS renderer", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: "Overlay", exact: true }).click();
  await page.getByLabel("Overlay style", { exact: true }).selectOption("glass");
  await page.getByLabel("Overlay layout", { exact: true }).selectOption("vertical");
  await page.getByRole("switch", { name: "Spinning vinyl artwork", exact: true }).click();
  await page.getByRole("switch", { name: "Canvas video artwork", exact: true }).click();
  await page.getByLabel("Accent colour", { exact: true }).fill("#70e0cc");
  await page.getByRole("switch", { name: "Show artwork", exact: true }).click();
  await page.getByRole("switch", { name: "Compact layout", exact: true }).click();
  const preview = page.getByLabel("Overlay preview", { exact: true });
  await expect(preview).toHaveClass(/glass compact/);
  await expect(preview.locator(".encore-art")).toBeHidden();
  await expect(preview.locator(".encore-times")).toContainText("1:18");
  await page.reload();
  await page.getByRole("button", { name: "Overlay", exact: true }).click();
  await expect(page.getByLabel("Overlay style", { exact: true })).toHaveValue("glass");
  await expect(preview).toHaveCSS("--accent", "#70e0cc");
  await expect(preview).toHaveClass(/vertical vinyl/);
  await expect(page.getByRole("switch", { name: "Canvas video artwork", exact: true })).toBeChecked();
  await expect(preview.locator("iframe")).toHaveCount(0);
});

test("OBS overlay shows provider progress, safe metadata, and live appearance", async ({ page }) => {
  const model = { current: { id: "youtube001", source: "youtube", title: "<script>viewer text</script>", author: "Example artist", user: "Viewer", duration: 180 }, playing: true, appearance: { overlayTheme: "minimal", overlayAccent: "#70e0cc", overlayRequester: false }, progress: { position: 42, observedAt: Date.now(), active: false } };
  await page.route("**/now", route => route.fulfill({ json: model }));
  await page.route("**/events", route => route.fulfill({ contentType: "text/event-stream", body: "data: connected\n\n" }));
  await page.route("https://i.ytimg.com/**", route => route.abort());
  await page.goto("/overlay.html");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("h1")).toHaveText(model.current.title);
  await expect(page.locator("main script")).toHaveCount(0);
  await expect(page.locator(".encore-times")).toHaveText("0:423:00");
  await expect(page.locator(".encore-requester")).toBeHidden();
  model.appearance = { ...model.appearance, overlayTheme: "glass" };
  await expect(page.locator("main")).toHaveClass(/glass/);
  model.playing = false;
  Object.assign(model.appearance, { overlayHidePaused: true });
  await expect(page.locator("main")).toBeHidden();
});

test("saved overlays have independent designs, stable URLs and persistent names", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: "Overlay", exact: true }).click();
  const url = page.getByRole("textbox", { name: "Browser-source URL" });
  const original = await url.inputValue();
  await page.getByRole("button", { name: "Add overlay", exact: true }).click();
  await expect(url).toHaveValue(/\?preset=/);
  const separate = await url.inputValue();
  await page.getByLabel("Overlay style", { exact: true }).selectOption("minimal");
  await page.getByLabel("Overlay name", { exact: true }).fill("Compact stream box");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(url).toHaveValue(separate);
  await page.getByLabel("Saved overlay", { exact: true }).selectOption("");
  await expect(url).toHaveValue(original);
  await expect(page.getByLabel("Overlay style", { exact: true })).toHaveValue("card");
  await page.reload();
  await page.getByRole("button", { name: "Overlay", exact: true }).click();
  await page.getByLabel("Saved overlay", { exact: true }).selectOption({ label: "Compact stream box" });
  await expect(url).toHaveValue(separate);
  await expect(page.getByLabel("Overlay style", { exact: true })).toHaveValue("minimal");
  await page.getByRole("button", { name: "Delete overlay", exact: true }).click();
  await expect(url).toHaveValue(original);
  await expect(page.getByRole("option", { name: "Compact stream box" })).toHaveCount(0);
});


test("overlay gallery, vinyl, request attribution and transitions follow live playback", async ({ page }) => {
  const model = { current: { id: "youtube001", source: "youtube", title: "First song", author: "Artist", user: "Viewer", duration: 180 }, currentLane: "listening", trackGeneration: 1, playing: true, appearance: { overlayLayout: "vertical", overlayVinyl: true }, progress: { position: 42, observedAt: Date.now(), active: false } };
  await page.route("**/now", route => route.fulfill({ json: model }));
  await page.route("**/events", route => route.fulfill({ contentType: "text/event-stream", body: "data: connected\n\n" }));
  await page.route("https://i.ytimg.com/**", route => route.abort());
  await page.goto("/overlay.html");
  const card = page.locator("main:not([data-transition])");
  await expect(card).toHaveClass(/vertical vinyl/);
  await expect(card.locator(".encore-requester")).toBeHidden();
  await expect(card.locator("small")).toHaveText("NOW PLAYING");
  await expect(card.locator(".encore-art")).toHaveCSS("animation-play-state", "running");
  await expect(card.locator(".encore-bars i").first()).toHaveCSS("animation-play-state", "running");
  model.currentLane = "request";
  await expect(card.locator(".encore-requester")).toHaveText("Requested by Viewer");
  await expect(card.locator(".encore-requester")).toBeVisible();
  await page.evaluate(() => {
    document.body.dataset.transitions = "0";
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && node.dataset.transition === "outgoing") document.body.dataset.transitions = String(Number(document.body.dataset.transitions) + 1);
      }
    }).observe(document.body, { childList: true });
  });
  // Track changes crossfade; a rapid second change must leave the latest metadata.
  model.current = { ...model.current, id: "youtube002", title: "Second song" };
  model.trackGeneration++;
  await expect(card.locator("h1")).toHaveText("Second song");
  model.current = { ...model.current, id: "youtube003", title: "Latest song" };
  model.trackGeneration++;
  await expect(card.locator("h1")).toHaveText("Latest song");
  await expect(page.locator('[data-transition="outgoing"]')).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-transitions", "2");
  model.progress.position = 60;
  await expect(card.locator(".encore-times")).toHaveText("1:003:00");
  expect(await card.evaluate(el => el.getAnimations().length)).toBe(0);
  await expect(page.locator("body")).toHaveAttribute("data-transitions", "2");
  model.playing = false;
  model.currentLane = "base";
  await expect(card.locator("small")).toHaveText("PAUSED");
  await expect(card.locator(".encore-requester")).toBeHidden();
  await expect(card.locator(".encore-art")).toHaveCSS("animation-play-state", "paused");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(card.locator(".encore-art")).toHaveCSS("animation-name", "none");
  model.current.title = "Reduced motion song";
  await expect(card.locator("h1")).toHaveText("Reduced motion song");
  expect(await card.evaluate(el => el.getAnimations().length)).toBe(0);
});

test("Canvas follows playback silently, cleans up and falls back to covers", async ({ page }) => {
  const model = { current: { id: "youtube0001", source: "youtube", title: "Canvas song", author: "Artist", duration: 180 }, trackGeneration: 1, playing: true, appearance: { overlayCanvas: true, overlayVinyl: true, overlayHidePaused: false }, progress: { position: 42, observedAt: Date.now(), active: true } };
  await page.addInitScript(() => {
    const calls: string[] = [];
    // Keep the fixture event stream connected; polling supplies controlled updates.
    Object.assign(window, { EventSource: class { close() {} }, canvasCalls: calls, YT: { Player: class {
      position = 0;
      state = -1;
      frame = document.createElement("iframe");
      constructor(host: HTMLElement, options: { playerVars: { mute: number }; events: { onReady: (event: { target: unknown }) => void; onError: () => void } }) {
        calls.push(`create:mute=${options.playerVars.mute}`);
        host.replaceWith(this.frame);
        Object.assign(window, { failCanvas: options.events.onError });
        queueMicrotask(() => options.events.onReady({ target: this }));
      }
      mute() { calls.push("mute"); }
      seekTo(position: number) { this.position = position; calls.push(`seek:${Math.floor(position)}`); }
      getCurrentTime() { return this.position; }
      getPlayerState() { return this.state; }
      playVideo() { this.state = 1; calls.push("play"); }
      pauseVideo() { this.state = 2; calls.push("pause"); }
      destroy() { this.frame.remove(); calls.push("destroy"); }
    } } });
  });
  await page.route("**/now", route => route.fulfill({ json: model }));
  await page.route("**/events", route => route.fulfill({ contentType: "text/event-stream", body: "data: connected\n\n" }));
  await page.route("https://i.ytimg.com/**", route => route.abort());
  await page.goto("/overlay.html");
  const art = page.locator("main:not([data-transition]) .encore-art");
  const calls = () => page.evaluate(() => (window as unknown as { canvasCalls: string[] }).canvasCalls);
  await expect(art).toHaveAttribute("data-canvas", "ready");
  await expect(art).toHaveCSS("width", "200px");
  await expect(art).toHaveCSS("height", "200px");
  expect(await calls()).toEqual(expect.arrayContaining(["create:mute=1", "mute", "play"]));
  await expect(page.locator("iframe")).toHaveCount(1);
  model.progress.position = 90;
  model.progress.active = false;
  model.playing = false;
  await expect.poll(calls).toContain("seek:90");
  await expect.poll(calls).toContain("pause");
  expect((await calls()).filter(call => call.startsWith("create"))).toHaveLength(1);
  model.playing = true;
  model.progress.active = true;
  model.trackGeneration++;
  model.current.id = "youtube0002";
  await expect.poll(async () => (await calls()).filter(call => call.startsWith("create")).length).toBe(2);
  await expect(page.locator('[data-transition="outgoing"] iframe')).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(1);
  await page.evaluate(() => (window as unknown as { failCanvas: () => void }).failCanvas());
  await expect(art).toHaveAttribute("data-canvas", "fallback");
  await expect(art).toHaveAttribute("title", /Showing cover art/);
  await expect(page.locator("iframe")).toHaveCount(0);
  model.progress.position = 100;
  model.progress.active = false;
  await expect(page.locator(".encore-times").first()).toHaveText("1:403:00");
  expect((await calls()).filter(call => call.startsWith("create"))).toHaveLength(2);
  model.current.source = "spotify";
  model.current.id = "spotify001";
  model.trackGeneration++;
  await expect(art).not.toHaveAttribute("data-canvas");
  await expect(page.locator("iframe")).toHaveCount(0);
  model.current.source = "youtube";
  model.current.id = "youtube0003";
  model.trackGeneration++;
  await expect(art).toHaveAttribute("data-canvas", "ready");
  model.appearance.overlayHidePaused = true;
  model.playing = false;
  await expect(page.locator("main").first()).toBeHidden();
  await expect(page.locator("iframe")).toHaveCount(0);
});


test("saved playlists stay closed until opened and can be arranged with buttons and drag", async ({ page }, testInfo) => {
  await boot(page);
  await page.evaluate(async () => {
    const state = await window.encore.snapshot();
    const id = "11111111-1111-4111-8111-111111111111";
    state.playlists = [{ id, name: "Mixed stream", tracks: [
      { id: "a".repeat(22), source: "spotify", title: "Spotify favourite", author: "Artist", duration: 180, user: "Auto" },
      { id: "abcdefghijk", source: "youtube", title: "YouTube exclusive", author: "Artist", duration: 180, user: "Auto" },
    ] }, { id: "22222222-2222-4222-8222-222222222222", name: "Evening collection", tracks: [] }];
    state.activePlaylistId = id;
    state.base = state.playlists[0].tracks;
    localStorage.setItem("fixture-state", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  const library = page.getByRole("region", { name: "Saved playlists" });
  const cards = library.getByRole("list", { name: "Playlist library", exact: true });
  await expect(library.getByText("Stream playlist: Mixed stream", { exact: true })).toBeVisible();
  await expect(library.getByText("Spotify favourite", { exact: true })).toHaveCount(0);
  await expect(cards.getByRole("listitem")).toHaveCount(2);
  await library.getByRole("button", { name: "Move playlist Evening collection up", exact: true }).click();
  await expect(cards.getByRole("listitem").first()).toContainText("Evening collection");
  await page.reload();
  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  await expect(cards.getByRole("listitem").first()).toContainText("Evening collection");
  await library.getByRole("button", { name: "Drag playlist Mixed stream", exact: true }).dragTo(cards.getByRole("listitem").first());
  await expect(cards.getByRole("listitem").first()).toContainText("Mixed stream");
  await library.getByRole("button", { name: "Open playlist Mixed stream", exact: true }).click();
  const tracks = library.getByRole("list", { name: "Mixed stream tracks", exact: true });
  await expect(tracks.getByRole("listitem")).toHaveCount(2);
  await library.getByRole("button", { name: "Shuffle for stream", exact: true }).click();
  await expect(library.getByText("Shuffle is on.", { exact: false })).toBeVisible();
  await expect(library.getByRole("button", { name: "Move Spotify favourite up", exact: true })).toBeDisabled();
  await expect(library.getByRole("button", { name: "Move YouTube exclusive down", exact: true })).toBeDisabled();
  const move = library.getByRole("button", { name: "Move YouTube exclusive up", exact: true });
  await move.focus(); await page.keyboard.press("Enter");
  await expect(tracks.getByRole("listitem").first()).toContainText("YouTube exclusive");
  await library.getByRole("button", { name: "Drag song Spotify favourite", exact: true }).dragTo(tracks.getByRole("listitem").first());
  await expect(tracks.getByRole("listitem").first()).toContainText("Spotify favourite");
  expect(await page.locator(".content").evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: `test-results/playlists-open-${testInfo.project.name}.png` });
  await library.getByRole("button", { name: "All playlists", exact: true }).click();
  await expect(library.getByText("Spotify favourite", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `test-results/playlists-library-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Queue / Up Next", exact: true }).click();
  await page.getByRole("button", { name: "Playlists", exact: true }).click();
  await expect(library.getByText("Spotify favourite", { exact: true })).toHaveCount(0);
  await library.getByRole("button", { name: "Open playlist Mixed stream", exact: true }).click();
  await library.getByRole("button", { name: "Use for stream", exact: true }).click();
  await expect(library.getByText("Shuffle is on.", { exact: false })).toHaveCount(0);
  await library.getByRole("button", { name: "Delete playlist", exact: true }).click();
  await library.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(library.getByRole("button", { name: "Open playlist Evening collection", exact: true })).toBeVisible();
  await expect(library.getByRole("heading", { name: "Evening collection", exact: true })).toHaveCount(0);
  await library.getByRole("textbox", { name: "New playlist name" }).fill("New collection");
  await library.getByRole("button", { name: "Create playlist", exact: true }).click();
  await expect(library.getByRole("button", { name: "Open playlist New collection", exact: true })).toBeVisible();
  await expect(library.getByRole("textbox", { name: "Playlist song or URL" })).toHaveCount(0);
});

test("up next shows current music, requester text and all playback lanes without navigation commands", async ({ page }, testInfo) => {
  await boot(page);
  await page.evaluate(async () => {
    const state = await window.encore.snapshot();
    const track = { id: "abcdefghijk", source: "youtube" as const, title: "Current song", author: "Artist", duration: 180, user: "First viewer" };
    state.current = track; state.playing = true;
    state.queue = [{ ...track, id: "request0001", title: "Requested song", user: "<b>Viewer</b>" }];
    state.listening = [{ ...track, id: "personal001", title: "Personal song", user: "Streamer" }];
    state.base = [{ ...track, id: "banned00001", title: "Banned rotation song", user: "Auto" }, { ...track, id: "base0000001", title: "Rotation song", user: "Auto" }];
    state.banned = ["youtube:banned00001"];
    localStorage.setItem("fixture-state", JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByRole("region", { name: "Current track", exact: true })).toContainText("Requested by First viewer");
  await expect(page.locator(".track-requester").filter({ hasText: "Requested by <b>Viewer</b>" })).toBeVisible();
  await expect(page.locator(".track-info b").filter({ hasText: "Viewer" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Personal listening up next", exact: true })).toContainText("Personal song");
  await expect(page.getByRole("region", { name: "Stream playlist up next", exact: true })).toContainText("Rotation song");
  await expect(page.getByText("Banned rotation song", { exact: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Filter tracks" }).fill("Viewer");
  await expect(page.locator(".track-info").getByText("Requested song", { exact: true })).toBeVisible();
  await expect(page.getByText("Personal song", { exact: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Filter tracks" }).fill("");
  await page.screenshot({ path: `test-results/up-next-${testInfo.project.name}.png` });
  for (const name of ["Playlists", "Listening", "Queue / Up Next"]) await page.getByRole("button", { name, exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("fixture-commands"))).toBeNull();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(await page.locator(".content").evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
});

test("queue filters, action menus and transport send explicit playback commands", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const state = await window.encore.snapshot();
    const track = { id: "abcdefghijk", source: "youtube" as const, title: "Live song", author: "Artist", duration: 180, user: "Viewer" };
    Object.assign(state, { current: track, playing: false, playbackGeneration: 7, progress: { position: 30, observedAt: Date.now(), active: false }, queue: [{ ...track, id: "request0001", title: "Viewer request" }], base: [{ ...track, id: "base0000001", title: "Base song" }] });
    localStorage.setItem("fixture-state", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "Show requests tracks" }).click();
  await expect(page.getByRole("region", { name: "Stream playlist up next", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Actions for Viewer request" }).click();
  await expect(page.getByRole("button", { name: "Move Viewer request up", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Move Viewer request up", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Shuffle stream playlist" }).click();
  await page.getByRole("button", { name: "Repeat stream playlist" }).click();
  await page.getByRole("button", { name: "Restart track" }).click();
  const slider = page.getByRole("slider", { name: "Playback position", exact: true });
  await slider.focus(); await slider.press("ArrowRight");
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  const commands = await page.evaluate(() => JSON.parse(localStorage.getItem("fixture-commands") || "[]"));
  expect(commands).toEqual(expect.arrayContaining([
    { type: "playlistShuffle", enabled: true }, { type: "settings", settings: { repeatBase: false } },
    { type: "seek", key: "youtube:abcdefghijk", generation: 7, position: 0 },
    { type: "seek", key: "youtube:abcdefghijk", generation: 7, position: 31 },
    { type: "settings", settings: { volume: 0 } }, { type: "settings", settings: { volume: 70 } },
  ]));
});
