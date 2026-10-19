import * as electron from "electron";
import { autoUpdater } from "electron-updater";
import { Updates } from "./updates";
import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  safeStorage,
  shell,
  dialog,
  clipboard,
  Tray,
  Menu,
  nativeImage,
  screen,
} from "electron";
import { createServer, type ServerResponse } from "node:http";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { join, extname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  CommandSchema,
  SettingsSchema,
  migrate,
  key,
  type Snapshot,
  type Command,
} from "../src/core/contracts";
import { overlayAppearance, overlayUrl } from "../src/core/overlays";
import { Playlists } from "../src/core/playlists";
import { Queue } from "../src/core/queue";
import { Store } from "./store";
import { Providers } from "./providers";
import { playSpotify } from "./spotify-playback";
import { StreamerBot } from "./streamerbot";
import { origin, trustedFrame, safeMessage } from "./security";
import { importDiagnostics, requestVolume, chatTarget } from "./compatibility";

let main: BrowserWindow | undefined,
  player: WebContentsView | undefined,
  tray: Tray | undefined;
let quitting = false,
  queue: Queue,
  store: Store,
  providers: Providers,
  bot: StreamerBot;
let secure = false,
  password = "",
  youtube = "Not tested",
  streamerbot = "Disconnected",
  error = "",
  importStatus = "Not checked";
let updates: Updates | undefined;
const logs: string[] = [];
const clients = new Set<ServerResponse>();
const playerToken = randomBytes(32).toString("hex");
const root = resolve(__dirname, "../dist");
let chain = Promise.resolve();
let spotifyDevice = "",
  spotifyStatus = "Disconnected",
  generation = 0,
  startedKey = "";
function serial(task: () => Promise<void> | void, propagate = false) {
  const operation = chain.then(task);
  chain = operation.catch((e) => {
    error = safeMessage(e);
    logs.unshift(new Date().toISOString() + " " + error);
    logs.splice(100);
    emit();
  });
  return propagate ? operation : chain;
}
function snapshot(): Snapshot {
  return {
    ...queue.state,
    current: queue.current,
    playing: queue.playing,
    currentLane: queue.currentLane,
    streamerbot,
    youtube,
    spotify: providers.refresh ? spotifyStatus : "Disconnected",
    error,
    logs,
    secureStorage: secure,
    overlayUrl: origin + "/overlay.html",
    dataPath: store.directory,
    appVersion: app.getVersion(),
    importStatus,
    updateStatus: updates?.status,
    updateReady: updates?.ready ?? false,
  };
}
let trackGeneration = 0;
let playbackSample = { generation: -1, position: 0, observedAt: 0, active: false };
function publicState(presetId?: string) {
  const appearance = overlayAppearance(queue.state.settings, presetId);
  return {
    current: queue.current,
    currentLane: queue.currentLane,
    playing: queue.playing,
    generation,
    trackGeneration,
    volume: queue.state.settings.volume,
    accent: appearance.overlayAccent,
    compact: appearance.overlayCompact,
    appearance,
    progress: playbackSample.generation === generation ? playbackSample : null,
  };
}
function emit() {
  if (main && !main.isDestroyed())
    main.webContents.send("encore:state", snapshot());
  for (const client of clients) client.write("data: update\n\n");
}
function save() {
  store.save(queue.persisted());
  emit();
  syncSettings();
}
function persistSecrets() {
  if (!secure) return;
  const data = JSON.stringify({
    youtube: providers.youtubeKey,
    password,
    access: providers.access,
    refresh: providers.refresh,
    expires: providers.expires,
  });
  const path = join(store.directory, "secrets.bin");
  writeFileSync(path + ".tmp", safeStorage.encryptString(data), {
    mode: 0o600,
  });
  renameSync(path + ".tmp", path);
}
function syncSettings() {
  if (streamerbot !== "Connected") return;
  const s = queue.state.settings;
  const counts: Record<string, number> = {};
  for (const t of [
    ...queue.state.queue,
    ...(queue.current && queue.currentLane === "request"
      ? [queue.current]
      : []),
  ])
    counts[t.user] = (counts[t.user] ?? 0) + 1;
  try {
    bot.request("SongRequestSettings", {
      maxDurationMinutes: String(s.maxMinutes),
      voteSkipRequired: String(s.votes),
      userQueueLimit: String(s.userLimit),
      globalQueueLimit: String(s.globalLimit),
      userLimitEnabled: "true",
      globalLimitEnabled: "true",
      srEnabled: String(s.requests),
      globalRequestCount: String(
        Object.values(counts).reduce((a, b) => a + b, 0),
      ),
      userRequestCountsJson: JSON.stringify(counts),
      requireMusicCategory: "false",
    });
  } catch {
    /* socket can close between status and send */
  }
}
function feedback(
  user: string,
  message: string,
  target: Record<string, string> = { chatSource: "all" },
) {
  const now = Date.now();
  if (now - lastReply < 1200) return;
  lastReply = now;
  try {
    bot.request("ChatMessage", {
      message: queue.state.settings.reply
        .replaceAll("{user}", user)
        .replaceAll("{message}", message)
        .slice(0, 500),
      ...target,
    });
  } catch {
    /* visible connection status handles this */
  }
}
let lastReply = 0;
function windowSecurity(win: BrowserWindow, allowed: string) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== allowed) event.preventDefault();
  });
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
}
function placePlayer() {
  if (main && player) {
    const [width] = main.getContentSize();
    player.setBounds({ x: width - 344, y: 112, width: 320, height: 240 });
  }
}
function showPlayer() {
  if (player) return;
  if (!main) return;
  player = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: "encore-player",
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  main.contentView.addChildView(player);
  const url = origin + "/player.html?token=" + playerToken;
  player.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  player.webContents.on("will-navigate", (e, next) => {
    if (next !== url) e.preventDefault();
  });
  player.webContents.session.setPermissionRequestHandler(
    (wc, permission, callback) =>
      callback(
        wc === player?.webContents && String(permission) === "mediaKeySystem",
      ),
  );
  player.webContents.on("render-process-gone", () => {
    spotifyDevice = "";
    spotifyStatus = "Player stopped";
    queue.playing = false;
    error = "Playback process stopped. Restart Encore to reconnect.";
    emit();
  });
  void player.webContents.loadURL(url);
  placePlayer();
}
async function pause() {
  queue.playing = false;
  emit();
  if (player && !player.webContents.isDestroyed())
    await player.webContents.executeJavaScript("window.encorePause?.()");
}
async function start(resume = false) {
  if (!queue.current) return;
  if (queue.current.source === "youtube" && main) {
    main.show();
    if (main.isMinimized()) main.restore();
  }
  showPlayer();
  if (queue.current.source === "spotify") {
    let body: { uris: string[]; position_ms?: number } | undefined = resume && startedKey === key(queue.current)
      ? undefined
      : { uris: ["spotify:track:" + queue.current.id] };
    await playSpotify(
      () => spotifyDevice,
      async () => {
        if (!body) body = {
          uris: ["spotify:track:" + queue.current!.id],
          position_ms: playbackSample.generation === generation
            ? Math.round(playbackSample.position * 1000) : 0,
        };
        spotifyDevice = "";
        spotifyStatus = "Reconnecting browser player…";
        queue.playing = false;
        emit();
        try {
          await player!.webContents.executeJavaScript("window.encoreReconnectSpotify()");
        } catch {
          spotifyStatus = "Browser player unavailable";
          emit();
          throw Error("Spotify browser player could not reconnect. Retry Play or check Spotify connection and DRM support in Setup.");
        }
      },
      (device) => providers.spotify(
        "/me/player/play?device_id=" + encodeURIComponent(device),
        "PUT",
        body,
      ),
    );
  }
  if (!resume || startedKey !== key(queue.current)) trackGeneration++;
  startedKey = key(queue.current);
  generation++;
  queue.playing = true;
  emit();
}
async function advance() {
  await pause();
  startedKey = "";
  queue.next();
  queue.playing = false;
  save();
  await start();
}
const EventSchema = z
  .object({
    type: z.string().max(60),
    user: z.string().max(100).default("Viewer"),
    id: z.string().max(100).optional(),
    spotifyId: z.string().max(100).optional(),
    input: z.string().max(1000).optional(),
    volume: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
const seen = new Set<string>();
async function event(input: unknown) {
  const result = EventSchema.safeParse(input);
  if (!result.success) {
    error = "Malformed Streamer.bot event ignored.";
    emit();
    return;
  }
  const e = result.data;
  const reply = (message: string) => feedback(e.user, message, chatTarget(e));
  try {
    switch (e.type) {
      case "IMPORT_DIAGNOSTICS":
        importStatus = importDiagnostics(e);
        break;
      case "SONG_REQUEST":
      case "SONG_REQUEST_FORCE":
      case "SPOTIFY_SONG_REQUEST": {
        const signature = JSON.stringify([
          e.type,
          e.user,
          e.id,
          e.spotifyId,
          e.input,
        ]);
        if (seen.has(signature)) return;
        seen.add(signature);
        setTimeout(() => seen.delete(signature), 10000).unref();
        const input =
          e.type === "SPOTIFY_SONG_REQUEST"
            ? "https://open.spotify.com/track/" + (e.spotifyId ?? e.id)
            : e.id
              ? "https://youtu.be/" + e.id
              : e.input;
        if (!input) throw Error("Request has no supported track link.");
        const track = await providers.resolve(input, e.user);
        queue.add(track, undefined, e.type === "SONG_REQUEST_FORCE");
        reply("Added: " + track.title);
        break;
      }
      case "GET_SONG":
        reply(
          queue.current
            ? queue.current.title + " — " + queue.current.author
            : "Nothing is playing.",
        );
        break;
      case "QUEUE_SONGS":
        reply(
          queue.state.queue
            .slice(0, 5)
            .map((t, i) => `${i + 1}. ${t.title}`)
            .join(" · ") || "Queue is empty.",
        );
        break;
      case "WHEN_SONG": {
        const i = queue.state.queue.findIndex(
          (t) => t.user.toLowerCase() === e.user.toLowerCase(),
        );
        reply(i < 0 ? "No upcoming request." : `Your request is #${i + 1}.`);
        break;
      }
      case "SKIP_SONG":
        await advance();
        break;
      case "VOTE_SKIP":
        if (queue.current && queue.vote(e.user)) await advance();
        break;
      case "WRONG_SONG":
        queue.wrong(e.user);
        reply("Removed your last request.");
        break;
      case "PLAY_SONG":
        if (!queue.current) await advance();
        else await start(true);
        break;
      case "PAUSE_SONG":
      case "STOP_SONG":
        await pause();
        break;
      case "VOLUME":
        queue.state.settings.volume = requestVolume(
          queue.state.settings.volume,
          e,
        );
        reply("Volume: " + queue.state.settings.volume + "%");
        break;
      case "SR_SEARCHING":
        reply("Searching for your track…");
        break;
      case "SR_FORCE_ERROR":
      case "SR_ERROR":
        reply(
          "Request could not be accepted. Check the link, limits and provider configuration.",
        );
        break;
      default:
        return;
    }
    save();
  } catch (err) {
    reply(safeMessage(err));
    throw err;
  }
}
async function command(c: Command) {
  error = "";
  const playlists = new Playlists(queue.state);
  switch (c.type) {
    case "playlistCreate": playlists.create(c.id, c.name); break;
    case "playlistReorder": playlists.reorder(c.id, c.to); break;
    case "playlistRename": playlists.rename(c.id, c.name); break;
    case "playlistDelete": playlists.delete(c.id); break;
    case "playlistActivate": playlists.activate(c.id, c.shuffle); break;
    case "playlistStop": playlists.stop(); break;
    case "playlistAdd":
    case "playlistImport": {
      playlists.get(c.id);
      const tracks = c.type === "playlistImport"
        ? await providers.playlist(c.input)
        : [await providers.resolve(c.input)];
      playlists.append(c.id, tracks);
      break;
    }
    case "playlistRemove": playlists.remove(c.id, c.key); break;
    case "playlistMove": playlists.move(c.id, c.from, c.to); break;
    case "settings": {
      const old = queue.state.settings;
      const next = SettingsSchema.parse({ ...old, ...c.settings });
      if (next.clientId !== old.clientId) {
        if (queue.current?.source === "spotify") await pause();
        spotifyDevice = "";
        spotifyStatus = "Disconnected";
        providers.disconnect();
      }
      queue.state.settings = next;
      providers.clientId = next.clientId;
      if (next.launchAtLogin !== old.launchAtLogin) {
        if (
          process.env.PORTABLE_EXECUTABLE_DIR ||
          process.platform !== "win32"
        ) {
          queue.state.settings.launchAtLogin = false;
          throw Error(
            "Launch at login is available in the installed Windows build.",
          );
        }
        app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
      }
      break;
    }
    case "secrets":
      if (c.youtube !== undefined) {
        providers.youtubeKey = c.youtube;
        youtube = "Not tested";
      }
      if (c.password !== undefined) password = c.password;
      persistSecrets();
      break;
    case "listen":
      queue.listen(await providers.resolve(c.input));
      break;
    case "request":
      queue.add(await providers.resolve(c.input));
      break;
    case "base": {
      const tracks = await providers.playlist(c.input);
      queue.state.base = [...new Map(tracks.map((t) => [key(t), t])).values()];
      queue.state.activePlaylistId = null;
      queue.state.baseShuffle = false;
      break;
    }
    case "remove":
      queue.state.listening = queue.state.listening.filter(
        (t) => key(t) !== c.key,
      );
      queue.state.queue = queue.state.queue.filter((t) => key(t) !== c.key);
      if (queue.state.activePlaylistId) playlists.remove(queue.state.activePlaylistId, c.key);
      else queue.state.base = queue.state.base.filter((t) => key(t) !== c.key);
      break;
    case "reorder":
      queue.reorder(c.from, c.to);
      break;
    case "favorite": {
      const existing = queue.state.favorites.find((t) => key(t) === c.key);
      if (existing)
        queue.state.favorites = queue.state.favorites.filter(
          (t) => key(t) !== c.key,
        );
      else {
        const t = [
          ...queue.state.listening,
          ...queue.state.queue,
          ...queue.state.history,
          ...queue.state.base,
          ...(queue.current ? [queue.current] : []),
        ].find((t) => key(t) === c.key);
        if (t) queue.state.favorites.push(t);
      }
      break;
    }
    case "readd": {
      const t = [...queue.state.favorites, ...queue.state.history].find(
        (t) => key(t) === c.key,
      );
      if (t) queue.add({ ...t, user: "Streamer" });
      break;
    }
    case "ban":
      queue.ban(c.key);
      if (queue.current && key(queue.current) === c.key) await advance();
      break;
    case "unban":
      queue.state.banned = queue.state.banned.filter((k) => k !== c.key);
      break;
    case "play":
      if (!queue.current) await advance();
      else if (!queue.playing) await start(true);
      break;
    case "pause":
      await pause();
      break;
    case "skip":
      await advance();
      break;
    case "connect":
      bot.connect(queue.state.settings.wsPort, password);
      break;
    case "testYoutube":
      await providers.validateYoutube();
      youtube = "API verified · playback requires player test";
      break;
    case "spotifyConnect":
      await shell.openExternal(providers.begin());
      break;
    case "spotifyDisconnect":
      if (queue.current?.source === "spotify") await pause();
      spotifyDevice = "";
      spotifyStatus = "Disconnected";
      providers.disconnect();
      break;
    case "showPlayer":
      showPlayer();
      break;
    case "copyRedirectUri":
      clipboard.writeText(origin + "/callback");
      break;
    case "copyOverlayUrl":
      overlayAppearance(queue.state.settings, c.presetId);
      clipboard.writeText(overlayUrl(origin + "/overlay.html", c.presetId));
      break;
    case "copyImport":
      clipboard.writeText(
        readFileSync(join(root, "streamerbot-import.txt"), "utf8"),
      );
      break;
    case "checkImport":
      importStatus = "Waiting for YtmImportDiagnostics…";
      bot.request("YtmImportDiagnostics");
      setTimeout(() => {
        if (importStatus.startsWith("Waiting")) {
          importStatus =
            "No diagnostics response. Reimport the supplied actions, then retry.";
          emit();
        }
      }, 8000).unref();
      break;
    case "checkUpdates":
      void updates?.check();
      break;
    case "installUpdate":
      if (updates?.ready) {
        await pause();
        save();
        updates.install(() => {
          quitting = true;
        });
      }
      break;
    case "diagnostics":
      clipboard.writeText(
        JSON.stringify(
          {
            version: app.getVersion(),
            platform: process.platform,
            streamerbot,
            youtube,
            spotify: !!providers.refresh,
            secureStorage: secure,
            importStatus,
            logs,
          },
          null,
          2,
        ),
      );
      break;
    case "overlayTest":
      overlayAppearance(queue.state.settings, c.presetId);
      await shell.openExternal(overlayUrl(origin + "/overlay.html", c.presetId, true));
      break;
    case "export": {
      const result = await dialog.showSaveDialog({
        defaultPath: "encore-backup.json",
        filters: [{ name: "Encore backup", extensions: ["json"] }],
      });
      if (result.filePath)
        writeFileSync(
          result.filePath,
          JSON.stringify(queue.persisted(), null, 2),
          { mode: 0o600 },
        );
      break;
    }
    case "import": {
      const result = await dialog.showOpenDialog({
        filters: [{ name: "Encore backup", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (result.canceled) return;
      const path = result.filePaths[0];
      if (statSync(path).size > 4_000_000) throw Error("Backup exceeds 4 MB.");
      const restored = migrate(JSON.parse(readFileSync(path, "utf8")));
      await pause();
      providers.disconnect();
      queue = new Queue(restored);
      providers.clientId = restored.settings.clientId;
      queue.state.settings.launchAtLogin = false;
      app.setLoginItemSettings({ openAtLogin: false });
      break;
    }
    case "open": {
      const urls = {
        spotify: "https://developer.spotify.com/dashboard",
        google:
          "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
        streamerbot: "https://docs.streamer.bot/api/websocket",
        upstream: "https://github.com/xHackMe/better-song-request-streamerbot",
        releases: "https://github.com/Timmsy1998/Encore/releases",
        license: "https://github.com/Timmsy1998/Encore/blob/main/LICENSE",
      };
      await shell.openExternal(urls[c.target]);
      break;
    }
  }
  save();
}
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== "127.0.0.1:17843") {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url ?? "/", origin);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com https://sdk.scdn.co; style-src 'self' 'unsafe-inline'; img-src 'self' https://i.ytimg.com https://i.scdn.co data:; frame-src https://www.youtube.com https://sdk.scdn.co https://open.spotify.com; connect-src 'self' https://www.youtube.com https://*.spotify.com https://*.scdn.co wss://*.spotify.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    const playerAuth =
      req.headers.authorization === "Bearer " + playerToken &&
      req.headers.origin === origin;
    if (req.method === "POST" && url.pathname === "/sdk-token") {
      if (!playerAuth) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ access: await providers.sdkToken() }));
      return;
    }
    if (req.method === "POST" && url.pathname === "/player-state") {
      if (!playerAuth) {
        res.writeHead(403).end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ...publicState(),
          spotifyConnected: !!providers.refresh,
        }),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/player-event") {
      if (!playerAuth) {
        res.writeHead(403).end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) {
          res.writeHead(413).end();
          return;
        }
      }
      const data = z
        .object({
          event: z.enum(["ended", "error", "ready", "not_ready", "progress"]),
          key: z.string().max(100).default(""),
          generation: z.number().int().default(-1),
          device: z
            .string()
            .regex(/^[a-zA-Z0-9_-]{1,128}$/)
            .optional(),
          message: z.string().max(200).optional(),
          position: z.number().min(0).max(86400).optional(),
          active: z.boolean().optional(),
        })
        .parse(JSON.parse(body));
      if (data.event === "progress") {
        if (queue.current && data.key === key(queue.current) && data.generation === generation && data.position !== undefined) {
          playbackSample = { generation, position: data.position, observedAt: Date.now(), active: queue.playing && !!data.active };
        }
      } else if (data.event === "ready" && data.device) {
        spotifyDevice = data.device;
        spotifyStatus = "Browser player ready";
        emit();
      } else if (data.event === "not_ready") {
        spotifyDevice = "";
        spotifyStatus = data.message ?? "Browser player unavailable";
        if (queue.current?.source === "spotify") queue.playing = false;
        emit();
      } else if (
        queue.current &&
        data.key === key(queue.current) &&
        data.generation === generation &&
        queue.playing
      )
        void serial(async () => {
          if (
            !queue.current ||
            data.key !== key(queue.current) ||
            data.generation !== generation ||
            !queue.playing
          )
            return;
          if (data.event === "ended") await advance();
          else {
            await pause();
            error =
              data.message ??
              "Provider could not play this track. Skip or try another track.";
            emit();
          }
        });
      res.writeHead(204).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (url.pathname === "/callback") {
      let connected = false;
      await serial(async () => {
        await providers.callback(url);
        connected = true;
        emit();
      });
      res.setHeader("Content-Type", "text/plain");
      res.end(
        connected
          ? "Spotify connected. You can close this tab."
          : "Authorization failed. Return to Encore for details.",
      );
      return;
    }
    if (url.pathname === "/now") {
      res.setHeader("Content-Type", "application/json");
      try {
        res.end(JSON.stringify(publicState(url.searchParams.get("preset") ?? undefined)));
      } catch {
        res.writeHead(404).end(JSON.stringify({ error: "Overlay not found" }));
      }
      return;
    }
    if (url.pathname === "/events") {
      if (clients.size >= 24) {
        res.writeHead(429).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
      });
      res.write("data: connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    const path =
      url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    if (
      !/^\/(?:index\.html|overlay(?:-renderer|-canvas)?\.(?:html|css|js)|player\.(?:html|css|js)|assets\/[a-zA-Z0-9_.-]+)$/.test(
        path,
      )
    ) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      (
        {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "application/javascript",
          ".svg": "image/svg+xml",
        } as Record<string, string>
      )[extname(path)] ?? "application/octet-stream",
    );
    res.end(readFileSync(join(root, path)));
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end("Request failed.");
  }
});
function createMain() {
  let bounds = {
    width: 1240,
    height: 840,
    x: undefined as number | undefined,
    y: undefined as number | undefined,
  };
  try {
    const data = z
      .object({
        width: z.number().min(760).max(7680),
        height: z.number().min(600).max(4320),
        x: z.number(),
        y: z.number(),
      })
      .parse(
        JSON.parse(readFileSync(join(store.directory, "window.json"), "utf8")),
      );
    const visible = screen
      .getAllDisplays()
      .some(
        (d) =>
          data.x + data.width > d.workArea.x &&
          data.x < d.workArea.x + d.workArea.width &&
          data.y + data.height > d.workArea.y &&
          data.y < d.workArea.y + d.workArea.height,
      );
    bounds = { ...data, ...(!visible ? { x: undefined, y: undefined } : {}) };
  } catch {
    /* default on first run or invalid bounds */
  }
  main = new BrowserWindow({
    icon: join(root, "icon.png"),
    ...bounds,
    minWidth: 760,
    minHeight: 600,
    title: "Encore",
    backgroundColor: "#121416",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowSecurity(main, origin + "/");
  void main.loadURL(origin + "/");
  showPlayer();
  main.on("resize", placePlayer);
  main.on("minimize", () => {
    if (queue.current?.source === "youtube") void serial(pause);
  });
  main.on("close", (event) => {
    if (main && !main.isDestroyed())
      writeFileSync(
        join(store.directory, "window.json"),
        JSON.stringify(main.getNormalBounds()),
      );
    if (!quitting && queue.state.settings.closeToTray) {
      event.preventDefault();
      main?.hide();
      if (queue.current?.source === "youtube") void serial(pause);
    } else {
      quitting = true;
      app.quit();
    }
  });
  main.on("closed", () => (main = undefined));
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    main?.show();
    main?.restore();
    main?.focus();
  });
  app.whenReady().then(async () => {
    try {
      if (process.env.PORTABLE_EXECUTABLE_DIR) {
        const directory = join(
          process.env.PORTABLE_EXECUTABLE_DIR,
          "Encore-data",
        );
        mkdirSync(directory, { recursive: true });
        app.setPath("userData", directory);
      }
      const components = (
        electron as unknown as {
          components?: { whenReady: () => Promise<void> };
        }
      ).components;
      if (components) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            components.whenReady(),
            new Promise((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    Error(
                      "Spotify DRM initialization timed out. Check your network and restart Encore.",
                    ),
                  ),
                45000,
              );
            }),
          ]);
        } catch {
          error =
            "Spotify DRM could not initialize. YouTube remains available. Check your network and restart Encore before using Spotify.";
        } finally {
          clearTimeout(timer);
        }
      }
      store = new Store(app.getPath("userData"));
      queue = new Queue(store.load());
      providers = new Providers(() => persistSecrets());
      providers.clientId = queue.state.settings.clientId;
      secure =
        safeStorage.isEncryptionAvailable() &&
        (process.platform !== "linux" ||
          safeStorage.getSelectedStorageBackend() !== "basic_text");
      if (secure && existsSync(join(store.directory, "secrets.bin"))) {
        try {
          const data = z
            .object({
              youtube: z.string(),
              password: z.string(),
              access: z.string(),
              refresh: z.string(),
              expires: z.number(),
            })
            .parse(
              JSON.parse(
                safeStorage.decryptString(
                  readFileSync(join(store.directory, "secrets.bin")),
                ),
              ),
            );
          providers.youtubeKey = data.youtube;
          password = data.password;
          providers.access = data.access;
          providers.refresh = data.refresh;
          providers.expires = data.expires;
        } catch {
          error =
            "Stored credentials could not be unlocked. Enter them again in Setup.";
        }
      }
      if (!secure)
        error =
          "OS secure storage is unavailable. Credentials will only last for this session.";
      bot = new StreamerBot(
        (status) => {
          streamerbot = status;
          emit();
          if (status === "Connected") syncSettings();
        },
        (e) => void serial(() => event(e)),
      );
      await new Promise<void>((done, reject) => {
        server.once("error", reject);
        server.listen(17843, "127.0.0.1", done);
      });
      ipcMain.handle("encore:snapshot", (e) => {
        if (
          !trustedFrame(
            e.senderFrame?.url ?? "",
            e.senderFrame === main?.webContents.mainFrame,
          )
        )
          throw Error("Untrusted sender");
        return snapshot();
      });
      ipcMain.handle("encore:command", async (e, input) => {
        if (
          !trustedFrame(
            e.senderFrame?.url ?? "",
            e.senderFrame === main?.webContents.mainFrame,
          )
        )
          throw Error("Untrusted sender");
        const result = CommandSchema.safeParse(input);
        if (!result.success) throw Error("Invalid command");
        await serial(() => command(result.data), true);
      });
      updates = new Updates(
        autoUpdater,
        app.isPackaged &&
          process.platform === "win32" &&
          !process.env.PORTABLE_EXECUTABLE_DIR &&
          !process.env.PORTABLE_EXECUTABLE_FILE,
        emit,
      );
      createMain();
      tray = new Tray(
        nativeImage
          .createFromPath(join(root, "icon.png"))
          .resize({ width: 16, height: 16 }),
      );
      tray.setToolTip("Encore · song requests");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Show Encore", click: () => main?.show() },
          {
            label: "Play / pause",
            click: () =>
              void serial(() =>
                command({ type: queue.playing ? "pause" : "play" }),
              ),
          },
          { label: "Skip", click: () => void serial(advance) },
          { type: "separator" },
          {
            label: "Quit Encore",
            click: () => {
              quitting = true;
              app.quit();
            },
          },
        ]),
      );
      tray.on("double-click", () => main?.show());
      bot.connect(queue.state.settings.wsPort, password);
      updates.start();
    } catch (e) {
      dialog.showErrorBox(
        "Encore could not start",
        safeMessage(e) +
          "\nCheck that port 17843 is free and the data folder is writable.",
      );
      app.quit();
    }
  });
}
const heartbeat = setInterval(() => {
  for (const c of clients) c.write(": keepalive\n\n");
}, 25000);
app.on("before-quit", () => {
  quitting = true;
  clearInterval(heartbeat);
  updates?.stop();
  bot?.close();
  player?.webContents.close();
  for (const c of clients) c.end();
  server.close();
  tray?.destroy();
});
app.on("window-all-closed", () => {
  if (!queue?.state.settings.closeToTray) app.quit();
});
