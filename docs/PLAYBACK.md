# Playback

Spotify and YouTube play inside Encore through their official browser players. They share a queue and playback controls; switching services pauses the outgoing player before starting the next song.

Spotify needs Premium, developer-app access and Widevine DRM. YouTube uses its visible video player and pauses when Encore is hidden or minimised. Reopening Encore always leaves playback paused.

## Connecting Spotify

Create a Spotify developer app with Web Playback SDK access. Register this redirect URI exactly:

```text
http://127.0.0.1:17843/callback
```

For a Development Mode app, add your Spotify account under **User Management** in the developer dashboard. Enter its Client ID in Encore and connect using that account. You don't need a Client Secret.

Encore creates its own playback device. Wait for **Browser player ready** before playing a song. If login succeeds but playback doesn't start, check Premium, app access and the browser-player error shown in Encore.

Windows packages use Castlabs Electron for Widevine support and need VMP signing. See [release setup](RELEASE.md#signing).

## Search and imports

Song-and-artist searches use this order:

1. Spotify, when connected.
2. Artist Topic releases, auto-generated releases and official audio on YouTube.
3. Other YouTube videos.

YouTube Music preference is based on YouTube search metadata, rather than a separate Music catalogue connection. Pasted Spotify, YouTube and `music.youtube.com` track links keep the chosen track. Authentication, quota and network errors are shown in the app.

Spotify playlist imports use `/playlists/{id}/items`. In Development Mode, the connected account must own or collaborate on the playlist; saving someone else's playlist doesn't grant API access. YouTube imports need a public or unlisted playlist and a Data API key.

Imports read up to 1,000 entries and skip unavailable or unsupported items. Failed imports leave the saved playlist intact.

## Mixed playlists

Open **Listening → Your playlists** to create a named playlist. Add songs from either service or use **Append playlist** to combine imports. Duplicate provider IDs are skipped.

Choose **Use for stream** to play it whenever requests and personal listening are empty. Reordering, switching, stopping or deleting a stream playlist affects upcoming tracks; the current song finishes normally. The library supports up to 100 playlists with 10,000 songs each and is included in backups.

The original **Base playlist** URL import replaces the stream selection. It doesn't delete named playlists. Use **Append playlist** when you want to add an import to an existing saved playlist.

## OBS artwork and audio

OBS overlays are silent. Capture Encore's application audio once for both services.

Each saved overlay has its own design and URL. You can keep the default overlay and add up to 20 more. Renaming preserves a source's URL; deleting hides that source. Styles include Album card, Accent glass and Minimal, inspired by [6K Labs Amuse](https://6klabs.com/amuse).

**Canvas video artwork** shows the muted YouTube player in a square, with letterboxing where needed. It follows Encore's playback position and takes precedence over spinning vinyl. Use a 960 × 320 horizontal source, or 960 × 1100 for a vertical gallery. Each Canvas source loads its own video player, so several sources use more resources.

If Canvas can't load, the overlay falls back to cover art. Reload the OBS Browser source to retry. The settings preview uses static artwork. Spotify's public APIs don't expose Canvas videos, so Spotify tracks use cover or vinyl artwork.

## Provider documentation

- Spotify: [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk), [Development Mode access](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), [playlist API changes](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
- YouTube: [IFrame API](https://developers.google.com/youtube/iframe_api_reference), [required player functionality](https://developers.google.com/youtube/terms/required-minimum-functionality).

Spotify's [Developer Policy](https://developer.spotify.com/policy) restricts cross-service integration and broadcasting. Working playback doesn't grant provider approval or music rights. Encore uses the official players and doesn't download or extract audio streams.
