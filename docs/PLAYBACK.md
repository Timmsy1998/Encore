# Playback

Spotify and YouTube play inside Encore through their official browser players. They share a queue and playback controls; switching services pauses the outgoing player before starting the next song.

Spotify needs Premium, developer-app access and Widevine DRM. YouTube uses its embedded video player and keeps playing when Encore is minimised, including when the queue moves to the next song. Starting a song does not restore the window. Closing Encore to the tray still pauses YouTube. Relaunching Encore always leaves playback paused. YouTube embedding restrictions (errors 101/150) automatically skip to the next song and appear in the app error/log. Blocked videos are removed from the active rotation to avoid retry loops; saved playlists stay intact. If nothing remains, playback becomes idle. Other player errors still pause for recovery.

The dedicated playback view remains unthrottled while minimised; the main interface skips background progress updates and refreshes when restored. Native lifecycle checks use a controlled YouTube SDK fixture; prolonged playback with real YouTube videos on Windows remains a release check.

## Connecting Spotify

Create a Spotify developer app with Web Playback SDK access. Register this redirect URI exactly:

```text
http://127.0.0.1:17843/callback
```

For a Development Mode app, add your Spotify account under **User Management** in the developer dashboard. Enter its Client ID in Encore and connect using that account. You don't need a Client Secret.

Encore creates its own playback device. Wait for **Browser player ready** before playing a song. If login succeeds but playback doesn't start, check Premium, app access and the browser-player error shown in Encore.

If a previously working Spotify device goes offline, pressing Play recreates Encore's SDK device. A playback 404 also triggers one reconnect and retry automatically, with a 15-second readiness timeout. Encore never falls back to another Spotify device. Failed recovery leaves playback paused; check Setup and retry Play. The dedicated playback view stays unthrottled in the background. These paths are covered with controlled SDK tests; prolonged Windows playback with a real Premium account still needs verification.

Windows packages use Castlabs Electron for Widevine support and need VMP signing. See [release setup](RELEASE.md#signing).

## Search and imports

In-app searches in Queue, Listening, Setup and saved playlists show results from both Spotify and YouTube before adding anything. Each result shows its platform, artist and duration. Choose **Add** for the version you want; you can add multiple results. Provider failures appear beside any available results. Search needs a connected Spotify account and/or a configured YouTube Data API key. Explicit track links add the chosen track directly.

Chat song-and-artist requests continue to select one match automatically in this order:

1. Spotify, when connected.
2. Artist Topic releases, auto-generated releases and official audio on YouTube.
3. Other YouTube videos.

YouTube Music preference is based on YouTube search metadata, rather than a separate Music catalogue connection. Pasted Spotify, YouTube and `music.youtube.com` track links keep the chosen track. Authentication, quota and network errors are shown in the app.

Spotify playlist imports use `/playlists/{id}/items`. In Development Mode, the connected account must own or collaborate on the playlist; saving someone else's playlist doesn't grant API access. YouTube imports need a public or unlisted playlist and a Data API key.

Imports read up to 1,000 entries and skip unavailable or unsupported items. Failed imports leave the saved playlist intact.

## Mixed playlists

Open **Playlists** to create a named playlist. Add songs from either service or use **Append playlist** to combine imports. Duplicate provider IDs are skipped.

Choose **Use for stream** to play it whenever requests and personal listening are empty. Reordering, switching, stopping or deleting a stream playlist affects upcoming tracks; the current song finishes normally. The library supports up to 100 playlists with 10,000 songs each and is included in backups.

**Shuffle for stream** randomises the playback copy once, then rotates through that order without repeats within a rotation. Saved song order stays intact, banned songs are skipped, and requests and personal listening still go first. Playlist edits preserve the shuffled rotation, with new songs appended in random order. Shuffle and the upcoming order survive restarts; playback still reopens paused. Choose **Use for stream** to restore saved order, or choose **Shuffle for stream** again for a new random order.

YouTube completion is checked through both player events and local player-state sampling, so a missed end event can still advance the rotation. Paused, buffering and cued tracks do not trigger advancement. Both providers retry failed local completion reports until delivered or playback changes.

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

## Desktop playback workspace

The queue has All, Requests, Listening and Playlist filters, text search, requester details and per-track action menus. Request rows support drag handles and keyboard move buttons. The persistent Now playing panel previews the next eligible track in request → personal listening → stream playlist order. Provider connection and recovery status remain visible in that panel.

The bottom transport provides play/pause, restart track, skip, favourite, volume/mute and seeking. Progress comes from the active provider player; seeking stays disabled until a matching playback sample arrives. Main checks the track and playback generation before a seek, so a stale slider cannot seek the next song.

Shuffle changes the upcoming stream playlist copy without changing saved songs or the current track. Turning it off restores saved order for a named playlist; direct URL imports retain their current order. Repeat is enabled by default. Turning it off removes the current base track from the rotation and lets remaining songs finish once. Requests and personal listening are never repeated. Reopening remains paused and restores an interrupted single-pass track.

The redesigned workspace is checked in browser fixtures at 1440 × 900, 900 × 700 and 760 × 600. Real-account Spotify DRM playback and native YouTube placement on Windows still require Windows/account verification.

## Playback history and alternative versions

History records the latest 1,000 completed or skipped plays locally, including repeated playlist rotations, time, provider and requester. Skip reasons distinguish manual skips, viewer votes, bans and YouTube embedding restrictions (101/150). Pausing does not create a completed play. Older accepted-request history is preserved internally, but is not presented as actual playback history. Existing backups load with an empty playback log; new backups include it.

Use **Find another version** on a history entry, on a restricted-video error, or for the current song on Listening. Encore searches Spotify and YouTube using the song title and artist, excluding the original provider recording. Results retain platform labels, loading/errors and provider warnings. Edit the query if the title includes video-specific text. Choosing a result adds it to personal listening; no replacement is selected automatically and the current song finishes first. **Queue again** replays the original through the same personal listening queue. Bans and provider availability still apply.
