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

Spotify and YouTube run in a separate sandboxed `WebContentsView` without the app's preload. Spotify commands target Encore's SDK device. Provider tokens aren't sent to the React interface or OBS.

The local server listens at `127.0.0.1:17843`. It checks the Host header, routes, origins and request sizes. Overlay routes expose current-track information only. Player control endpoints require a random per-process bearer token. Spotify login uses PKCE and expiring, one-use state.

Credentials use Electron's `safeStorage`. Linux's plaintext backend is rejected; without secure storage, credentials are session-only and the app shows a warning. Backups omit credentials.

## Connections and updates

Streamer.bot reconnects with backoff and subscribes once per connection. Shutdown closes sockets, timers, player connections and overlay event streams.

Installed copies use `electron-updater` with the public GitHub repository. Downloads are checked against release metadata and installed when the user chooses **Restart and install**. Update downloads run separately from playback commands. Portable copies are updated manually.

Windows builds use the pinned Castlabs Electron runtime. See [releasing](RELEASE.md) for packaging and signing.
