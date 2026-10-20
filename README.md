# Encore

A desktop music player for Spotify, YouTube and song requests. Use it for your stream or just listen on your own, with one queue and one set of playback controls. You don't need the Spotify or YouTube apps open.

Chat requests play after the current song finishes. When there are no requests, Encore plays your personal queue, then rotates through your stream playlist. You can mix Spotify and YouTube songs in the same saved playlist.

![Encore music player](docs/images/player.png)

## Download

Get the latest Windows build from [Releases](https://github.com/Timmsy1998/Encore/releases).

- **Installer:** installs Encore for your Windows account and supports automatic updates.
- **Portable:** runs from a writable folder without installation. Your settings live in the `Encore-data` folder beside the executable, so keep that folder when moving or updating Encore.

Unsigned builds may show a Windows SmartScreen prompt. Each release includes `SHA256SUMS.txt` if you want to check your download with PowerShell's `Get-FileHash`.

## Getting started

Encore walks you through setup on first launch. You can skip steps and come back to them in Settings.

### Spotify

You'll need Spotify Premium and a Spotify developer app with Web Playback SDK access.

1. Add `http://127.0.0.1:17843/callback` as a redirect URI in your Spotify app. It must match exactly.
2. If your app is in development mode, add the Spotify account you'll use under **User Management** in the developer dashboard.
3. Enter the app's **Client ID** in Encore and click **Connect Spotify**. Finish signing in through your browser.

No Client Secret is needed. Once Encore shows **Browser player ready**, you're ready to play.

### YouTube

Enable **YouTube Data API v3** in a Google Cloud project, then enter and test the API key in Encore. YouTube playback happens inside Encore; keep its player visible while listening.

In-app song searches show Spotify and YouTube options with artist, duration and platform labels. Choose **Add** beside each song you want. Connect Spotify and configure a YouTube Data API key to search both; if one service fails, available results and a warning remain visible. Pasting a track link adds that track directly. Chat requests still select a match automatically, preferring Spotify and then YouTube audio.

### Chat requests

Run Streamer.bot and enable its local WebSocket server. Connect Encore using the same port and password, then copy the supplied **1.1.0 action import** into Streamer.bot. Run Encore's import diagnostics to check the connection and actions.

Set command names, permissions and channel-point rewards in Streamer.bot. Keep it running while taking requests; Encore works on its own for personal listening. There's no need to enable Streamer.bot's HTTP server.

You can set request limits, bans, skip votes and chat replies in Encore's Settings. See the [Streamer.bot integration notes](docs/UPSTREAM.md) for the supported actions and differences from the original project.

## Your music

Open **Playlists** to create a playlist. Collections stay closed until you select **Open playlist**; returning to the library or navigating away closes the contents. Add individual songs from either service, or use **Append playlist** to bring in a Spotify or YouTube playlist. You can rename playlists, arrange playlists and songs with drag handles or keyboard-accessible move buttons, and remove songs whenever you like. Library order is saved separately from playback rotation.

Choose **Use for stream** to make a playlist your background music. Requests still go first, followed by anything in your personal listening queue. Changing the stream playlist won't cut off the current song.

Choose **Shuffle for stream** to randomise its playback order without changing the saved playlist. Every song plays once per rotation, excluding banned songs. Requests still take priority after the current song finishes. **Use for stream** returns to the saved order.

Queue rows can be dragged or moved with buttons. You can also favourite songs, ban them or play them again from History. Playback controls stay available as you move around the app.

**Queue / Up Next** shows the current track, requests with requester names, personal listening, and a preview of the next five stream-playlist tracks in playback order. Filter by song, artist or requester. Use **Listening** to add personal music and **Playlists** to manage saved collections.

Encore saves your queue and playlists between sessions. When you reopen it, playback starts paused.

## OBS overlays

Open **Overlay**, choose a design and copy its URL into an OBS Browser source. Use **Add overlay** to create more designs with their own URLs, so you can have different boxes in different scenes or show several at once.

Each design has its own colours, sizing and visibility settings, with horizontal cards and vertical gallery layouts. Artwork can spin like a vinyl record, or you can enable **Canvas** to show the muted YouTube video. Spotify uses cover art; Spotify Canvas isn't available through its public API.

Suggested Browser source sizes:

| Layout | Width × height |
| --- | --- |
| Horizontal | 960 × 260 |
| Horizontal with Canvas | 960 × 320 |
| Vertical gallery | 960 × 1100 |

Overlays update live, with animated equalizer bars and transitions between songs. They only show “Requested by” for chat requests. Reduced-motion settings turn off animations.

**Overlays are visual only.** Capture Encore's application audio in OBS for both services, and avoid capturing it a second time through Desktop Audio. Encore must stay running for the overlays to work.

## Updates and settings

Installed copies check for stable GitHub releases on startup and every six hours. Updates download in the background; choose **Restart and install** when you're ready. You can also check manually from About.

For portable copies, download the new executable from Releases and keep your existing `Encore-data` folder.

Settings shows where Encore stores its data and includes backup and restore. Backups don't contain credentials. Credentials use your operating system's secure storage; if that isn't available, Encore warns you and keeps them only until you close the app.

## Having trouble?

- **Spotify won't connect:** check the Client ID, exact redirect URI and User Management entry. The account needs Premium. If it connects but the browser player won't become ready, see the [playback guide](docs/PLAYBACK.md).
- **A YouTube song won't play:** it may have been removed or blocked from embedded playback. Try another version of the song and keep Encore's player visible.
- **There's no sound:** check Encore's volume and the Windows volume mixer. After restarting Encore, press Play to resume your saved queue.
- **Requests aren't arriving:** check that Streamer.bot is running, the WebSocket port and password match, and the imported commands have the right permissions. Run import diagnostics in Encore.
- **Port 17843 is busy:** close the other app using that port, then restart Encore. Spotify's callback uses this address too.

The [playback guide](docs/PLAYBACK.md) covers provider requirements and restrictions in more detail. Encore's desktop interface is currently English only, and releases are for Windows.

## Development

Use Node 22.12+ and npm:

```sh
npm ci
npm run dev
```

The first launch downloads the pinned Castlabs Electron runtime. Enter provider credentials in the app; don't put them in the source.

To run checks and build:

```sh
npm run check
npx playwright install chromium
npm run test:ui
npm run build
npm run test:desktop
```

Desktop smoke tests need the Electron runtime and a graphical session. Build Windows packages on Windows with `npm run package:win`.

More details: [architecture](docs/ARCHITECTURE.md), [releasing](docs/RELEASE.md).

## Credits and licence

Encore is based on [Better Song Request](https://github.com/xHackMe/better-song-request-streamerbot) by **HackMe_ and contributors**. The original browser source, translations and copyright notices are preserved in this repository.

Licensed under **GPL-3.0-only**; see [LICENSE](LICENSE). Redistributed builds must include the licence and access to their corresponding source. Encore isn't affiliated with Spotify, YouTube, Streamer.bot, Electron or Castlabs. You're responsible for the music and broadcast permissions needed for your stream.
