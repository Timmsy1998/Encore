# How Encore is organised

Encore has three parts: the Electron main process, the React interface and a separate browser view for playback.

| Location | Purpose |
| --- | --- |
| `desktop/main.ts` | App lifecycle, commands, queue and connections |
| `desktop/preload.ts` | Typed bridge between the interface and main process |
| `src/core/queue.ts` | Queue ordering and request rules |
| `src/core/playlists.ts` | Saved mixed-provider playlists |
| `src/core/contracts.ts` | Shared types and Zod validation |
| `desktop/providers.ts` | Provider metadata, Spotify login and token refresh |
| `desktop/discord.ts` | Main-owned Discord IPC lifecycle, acknowledgements and reconnect |
| `src/core/discord.ts` | Privacy-aware activity payload and validated provider artwork/links |
| `desktop/streamerbot.ts` | Streamer.bot connection and events |
| `desktop/compatibility.ts` | Upstream action compatibility |
| `desktop/store.ts` | Settings storage and recovery |
| `src/` | React interface |

## State and playback

Main owns the queue and saves changes serially. React displays snapshots and sends commands, so changing pages doesn't interrupt playback or create new provider connections.

The queue plays requests first, then personal listening, then the rotating stream playlist. A new request waits for the current song to finish. Provider callbacks include the track and playback generation so late or repeated callbacks can't advance the queue twice. On restart, interrupted music returns to its queue and playback stays paused.

Settings use a versioned schema and atomic writes. Invalid or unsupported files are kept as recovery copies. Saved playlist order is separate from the current playback rotation.

## Process boundaries

The interface runs with Node disabled, sandboxing enabled and context isolation enabled. The preload exposes named operations; main validates their payloads and sender. Navigation, popups and external links are restricted.

The desktop window has a custom draggable title bar and no native application menu. Its labelled minimise, maximise/restore and close controls use narrowly scoped IPC with validated actions and the trusted main-frame check. Main publishes focus/maximise changes through events, without polling. Close follows the existing close-to-tray setting. The playback view is positioned below the title bar; compact navigation keeps controls reachable at the minimum window size. Native Windows dragging, snapping, resizing and display scaling remain release checks.

Spotify and YouTube run in a separate sandboxed `WebContentsView` without the app's preload. Spotify commands target Encore's SDK device. Provider tokens aren't sent to the React interface or OBS.

The local server listens at `127.0.0.1:17843`. It checks the Host header, routes, origins and request sizes. Overlay routes expose current-track information only. Player control endpoints require a random per-process bearer token. Spotify login uses PKCE and expiring, one-use state.

Credentials use Electron's `safeStorage`. Linux's plaintext backend is rejected; without secure storage, credentials are session-only and the app shows a warning. Backups omit credentials.

## Connections and updates

Streamer.bot reconnects with backoff and subscribes once per connection. Shutdown closes sockets, timers, player connections and overlay event streams.

Discord Rich Presence is opt-in. Main connects as a client to Discord’s native local IPC pipes using the [documented RPC protocol](https://discord.com/developers/docs/topics/rpc), without tokens or an extra server. Framed input is size bounded and validated; connection/acknowledgement deadlines, coalesced updates and bounded reconnect backoff handle Discord restarts. Only current-song public metadata is sent. Idle/paused hiding and disconnect clear activity; shutdown closes the socket. React only renders the status/preview and changes typed settings. Real Discord rendering and Windows pipe verification remain release checks.

Installed copies use `electron-updater` with the public GitHub repository. Downloads are checked against release metadata and installed when the user chooses **Restart and install**. Update downloads run separately from playback commands. Portable copies are updated manually.

Windows builds use the pinned Castlabs Electron runtime. See [releasing](RELEASE.md) for packaging and signing.

## Resource use

Playback positions use a small, generation-scoped IPC event. Only transport widgets and the Discord preview subscribe; the library and queue are not cloned across IPC and rendered every second. Hidden/minimised windows skip progress delivery and refresh from main when shown. Timeline clocks run once per second only while playback is active.

The playback view starts without external provider scripts or iframes. YouTube loads when a YouTube track is selected; Spotify loads when an account is connected so Encore's device can register. Paused/idle playback stops the SDK sampling timer. Spotify sampling permits one outstanding call and rejects responses from an old playback generation. Active playback and failed end-event delivery retain their one-second checks. Background Spotify playback remains supported.

OBS polls progress once per second during playback, stops when paused/idle, and resumes through the existing event stream. Reconnect refreshes the current state; failed state reads retry after five seconds. Requests are serialised and concurrent notifications coalesced. Provider iframes and Chromium still have a baseline memory cost; account playback, video decoding, Canvas overlays and machine hardware determine actual usage.

`npm run check`, `npm run test:ui` and `npm run test:desktop` cover these behaviours, including an empty native playback view with no provider SDKs/iframes, paused polling, bounded Spotify sampling, stale progress rejection and idle overlay wakeup. Windows Task Manager measurements and long-running real-account CPU/RAM/GPU profiling remain release checks; no fixed resource budget has been verified.
