# Playback approach

The requested browser-playback direction is implemented using Spotify's official Web Playback SDK and YouTube's official IFrame API, inside one isolated Encore provider view. There is one main-owned queue and common transport. Encore does not control or require an external Spotify app. An iframe-free YouTube audio player is not supported by the official API; Encore retains the visible 320×200 video and controls. YouTube pauses when the app is hidden/minimised; playback restores the window.

## Spotify

[Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) creates the named Encore device. [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) authorization uses the system browser, random state, S256 and a one-use expiring verifier. The exact [loopback redirect](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) is `http://127.0.0.1:17843/callback`. Main retains refresh tokens; only a scoped access token reaches the isolated SDK page through an authenticated endpoint. Playback commands specify Encore's own SDK device ID and never choose an arbitrary active device.

Stock Electron is not assumed to supply Widevine. The runtime downloader pins Castlabs ECS `44.5.1+wvcus` and verifies the release archive hash before extraction. [Castlabs EVS documentation](https://github.com/castlabs/electron-releases/wiki/EVS) requires VMP signing for production Windows/macOS packages. The build hook signs Windows after Authenticode, before archive creation. Linux smoke does not establish Windows DRM support. Spotify's supported-browser list does not name Electron; a successful CDM initialization or account login is not proof of playable audio.

Premium, developer-app access/account allowlisting, working Widevine and an SDK `ready` event are required. SDK errors are surfaced and playback paused. Local SDK state sampling every two seconds detects completion without Web API polling. End events carry track/generation identity and are deduplicated by main. Provider changes pause the outgoing source before starting the next.

**Distribution gate:** [Spotify Developer Policy](https://developer.spotify.com/policy) restricts integrating its platform with another service's content and includes restrictions relevant to broadcasting. This source implementation is not evidence of provider approval. Resolve permission and music rights before distributing or broadcasting. Do not represent successful technical playback as permission.

## YouTube

[Official IFrame API](https://developers.google.com/youtube/iframe_api_reference) runs from the fixed HTTP loopback origin in a sandboxed WebContentsView. No downloads, stream extraction, certificate overrides or disabled browser security are used. Preserve origin/Referer and the visible video: [required minimum functionality](https://developers.google.com/youtube/terms/required-minimum-functionality). Autoplay, embedding restrictions, removed videos, live streams and quotas remain provider-controlled. Metadata comes from YouTube Data API v3; a successful API test does not establish playback acceptance.

## Audio and OBS

Both providers render audio inside Encore. The OBS HTML overlay displays text only and receives no credentials. Capture Encore application audio once. Verify transitions, pause, skip, recovery and capture on the actual Windows package, including switching after an expired Spotify session. Do not capture overlay audio or duplicate Desktop Audio.
