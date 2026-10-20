# Streamer.bot and upstream compatibility

Encore is based on [Better Song Request by HackMe_](https://github.com/xHackMe/better-song-request-streamerbot). The original browser source and copyright notices remain in the repository. The desktop app uses its own React interface and main-process queue.

The supplied Streamer.bot action import is upstream version **1.1.0**, stored in `public/streamerbot-import.txt`. Import it into Streamer.bot, configure your commands and permissions there, then run Encore's import diagnostics.

## Supported actions

Encore accepts these `General.Custom` events:

```text
SONG_REQUEST       SPOTIFY_SONG_REQUEST   SONG_REQUEST_FORCE
GET_SONG           WHEN_SONG              QUEUE_SONGS
SKIP_SONG          VOTE_SKIP              WRONG_SONG
VOLUME             PLAY_SONG              PAUSE_SONG
STOP_SONG          IMPORT_DIAGNOSTICS
```

Moderator permissions and channel-point bindings are handled by Streamer.bot. Forced requests bypass request limits and the requests-off switch, but still respect bans and duration limits. Diagnostics check the import's version and capabilities; command permissions must be checked in Streamer.bot.

For Encore's automatic Spotify-first chat search, actions must send the song-and-artist text to Encore. An action that first turns that text into a YouTube link will keep that YouTube selection.

## Feature differences

| Feature | Encore |
| --- | --- |
| Playback | Spotify and YouTube inside the desktop app; bounded SDK device recovery for Spotify playback 404/offline devices; start/resume accepts successful acknowledgements without requiring JSON (real-account endurance remains unverified) |
| Queue | Requests, then personal listening, then a rotating stream playlist; current song finishes first |
| Playlists | Separate library page, closed until opened; mixed Spotify/YouTube imports, saved playlist/song ordering with drag handles and move buttons, and shuffled stream rotation |
| In-app song search | Explicit result picker across Spotify and YouTube, platform labels and partial-provider failure warnings; chat keeps automatic matching |
| Queue ordering | Queue / Up Next includes lane filters, search, requester details, action menus and a persistent next-track preview; request ordering uses drag handles or move buttons |
| Playback workspace | Persistent player panel and transport with provider progress, seek, restart, skip, favourite, mute, stream shuffle and repeat |
| Desktop window | Custom draggable title bar with minimise, maximise/restore and close controls; no native menu bar; respects close-to-tray; YouTube continues while minimised without restoring the window for new tracks (Windows snapping/scaling verification remains unverified) |
| Skip votes | One vote per viewer |
| Wrong song | Removes the viewer's last pending request |
| Bans, favourites and history | Saved between sessions; history keeps up to 1,000 songs |
| Chat replies | Configurable format, with Twitch, YouTube and Kick targets |
| Reconnection | Automatic reconnect with duplicate-event handling |
| YouTube credentials | Masked saved-key indicator; configured, verified and failed API states; blank replacement retains the key; session-only storage is labelled |
| Backups | Versioned JSON without credentials |
| OBS | Silent browser sources with separate saved designs, gallery layouts, vinyl and YouTube Canvas artwork |
| Resource use | Lazy provider SDKs, lightweight progress IPC, paused/idle polling suppression and bounded Spotify sampling; Windows/account endurance profiling remains unverified |
| Discord | Opt-in rich presence with track artwork, provider link, countdown and latest-release button; continuous presence across track transitions and automatic reconnect (Windows/account visual verification remains unverified) |
| Updates | Automatic for installed Windows copies; manual for portable copies |
| Languages | Desktop interface is English only |

The original source includes English, Polish, Ukrainian, German, French and Turkish translations. Those files are preserved, but haven't been ported to the desktop interface. Encore's overlay designs also differ from the original themes.

Streamer.bot must stay running for chat requests and replies. Personal listening works without it. See [playback](PLAYBACK.md) for provider setup and search behaviour.
