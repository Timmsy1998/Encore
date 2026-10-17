# Upstream inventory and implementation plan

Encore modifies Better Song Request by HackMe_ (2026-10-17). Original source remains at repository root, unchanged; GPL v3 LICENSE is preserved. Upstream: https://github.com/xHackMe/better-song-request-streamerbot . Existing working-tree edits were present before implementation; do not stage them accidentally.

Inspected app.js (browser state, queue, provider requests, PKCE, Web Playback SDK, WebSocket authentication and General.Custom event dispatch), index.html (setup and import 1.1.0), translations.js (English, Polish, Ukrainian, German, French, Turkish), style.css, README and GPL v3 licence.

Milestones: inventory/security decisions; desktop foundation; main-owned queue/providers/Streamer.bot; React workspace/setup/OBS; tests, release automation and documentation. Keep original browser application available as reference; it is not granted an Electron preload.

## Playback decision and evidence

YouTube uses the official IFrame API in a dedicated sandboxed player window served from a stable HTTP loopback origin. Do not strip Referer: https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity . Embedding restrictions, error 153 and autoplay restrictions remain provider-controlled. Display the video player; no audio extraction.

Stock Electron is not a supported Spotify Web Playback SDK target; no Widevine redistribution is attempted. Use public-client authorization code + PKCE in the system browser and Web API control of an already active official Spotify player. Premium and Spotify developer app access are required. Redirect is http://127.0.0.1:17843/callback (register exactly). Official references: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow , https://developer.spotify.com/documentation/web-api/concepts/redirect_uri , https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback . Spotify audio comes from the official app, YouTube audio from Encore's player. OBS overlay is silent. Do not enable both OBS application capture and desktop capture for the same audio.

Streamer.bot authentication hashes password+salt then secret+challenge; subscribe once per authenticated socket to General.Custom. Preserve import payloads SONG_REQUEST, SPOTIFY_SONG_REQUEST, SONG_REQUEST_FORCE, GET_SONG, WHEN_SONG, QUEUE_SONGS, SKIP_SONG, VOTE_SKIP, WRONG_SONG, VOLUME, PLAY_SONG, PAUSE_SONG, STOP_SONG and IMPORT_DIAGNOSTICS. Source: https://docs.streamer.bot/api/websocket/guide . Moderator permissions belong to imported Streamer.bot commands, not viewer text.

Electron guidance: https://www.electronjs.org/docs/latest/tutorial/security . Build tooling references: https://vite.dev/guide/ , https://ui.shadcn.com/docs/installation/vite , https://www.electron.build/ . Versions pinned via npm registry; Node 22.12+ required for Electron tooling, use Node 22 LTS in CI.

## Manual verification gate

This Linux/WSL workspace cannot establish Windows installer behaviour, account permissions, YouTube embedding acceptance or Spotify active-device playback without real accounts and Windows execution. These are release prerequisites, never assumed passing. Verify development and packaged Windows playback before distributing a release. See RELEASE.md.
