# Upstream inventory and parity

Based on [Better Song Request by HackMe_](https://github.com/xHackMe/better-song-request-streamerbot), inspected 2026-10-17. Reviewed `app.js`, `index.html`, `style.css`, `translations.js`, README, widget and GPL v3 licence. Original browser code remains as reference; the Electron renderer does not load it. Initial unrelated working-tree changes were preserved.

Upstream uses browser-owned state, YouTube IFrame API, Spotify PKCE/Web Playback SDK, Streamer.bot WebSocket authentication and `General.Custom` event dispatch. The original 1.1.0 import is retained in `public/streamerbot-import.txt`; it remains upstream's encoded action data, not a fabricated replacement. Desktop logic extracts the contracts into main-owned TypeScript modules. See [current playback decision](PLAYBACK.md); the initial remote-player fallback was superseded by the user's instruction to use browser playback.

| Upstream capability                 | Encore status                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| YouTube requests/title search/links | Implemented through official metadata/API and visible player; account/network verification required           |
| Spotify requests/links/playlist     | Official PKCE, SDK-owned device and Web API commands; Windows DRM/account test pending                        |
| Shared queue/base playlist          | Main-owned request → personal → rotating base priority; current song finishes                                 |
| Drag order                          | Drag plus keyboard move buttons                                                                               |
| Skip/vote/wrong song                | Main queue handlers, unique voter accounting and last pending request removal                                 |
| User/global limits, forced requests | Preserved; force bypasses request-off/limits, not bans or duration                                            |
| Bans/favourites/history             | Persisted, with history capped at 1,000                                                                       |
| Bot replies                         | Configurable `{user}`/`{message}` template, throttled, Twitch/YouTube/Kick target handling                    |
| Channel points/permissions          | Supplied upstream actions; configure bindings/permissions in Streamer.bot                                     |
| Reconnect/duplicate events          | Authenticated single subscription, exponential backoff, bounded deduplication                                 |
| Unavailable tracks/timeouts         | Errors visible; no fake fallback, current playback pauses for explicit recovery/skip                          |
| Import diagnostics                  | Version/capability comparison with 1.1.0, timeout and missing-feature reporting                               |
| Setup tutorial                      | Eight persisted, skippable desktop steps                                                                      |
| Backup/restore                      | Validated version-1 JSON; no credentials, atomic writes/recovery copies                                       |
| Overlay                             | Silent, separate OBS browser process, SSE reconnect, accent/compact/test; legacy theme parity incomplete      |
| Updates                             | Installed Windows copies download stable GitHub releases; explicit restart, portable replacement manual |
| Languages                           | Upstream English/Polish/Ukrainian/German/French/Turkish source retained; desktop UI English only (parity gap) |

Supported event names: `SONG_REQUEST`, `SPOTIFY_SONG_REQUEST`, `SONG_REQUEST_FORCE`, `GET_SONG`, `WHEN_SONG`, `QUEUE_SONGS`, `SKIP_SONG`, `VOTE_SKIP`, `WRONG_SONG`, `VOLUME`, `PLAY_SONG`, `PAUSE_SONG`, `STOP_SONG`, `IMPORT_DIAGNOSTICS`. Moderator authorization is in imported Streamer.bot actions. Diagnostic capability reports do not prove channel permissions or account playback.

Intentional changes: playback inside Encore rather than external music apps; main owns durable state; personal listening does not require Streamer.bot; restart is paused; overlay never plays audio; YouTube remains visible. GPL licence and upstream notices are retained.
