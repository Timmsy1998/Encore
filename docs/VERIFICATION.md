# Verification record

Verified on 2026-10-17. This is a development preview, not a real-account playback certification.

## Automated and visual checks

- Linux/WSL, Node 22.23.3: TypeScript, ESLint with zero warnings, 25 unit/contract tests and production build passed.
- Queue checks cover request/personal/base priority, finish-current behaviour, duplicate events, limits, bans, votes and paused restart. Storage checks cover atomic writes, recovery and version rejection. Provider/IPC/reconnect contracts use test doubles.
- Six Chromium UI checks cover resumable/skippable setup, personal listening, visible provider failures, navigation and persistent controls at 1440×900/100%, 900×700/125% and 760×600/150%. Test states are explicit fixtures; production has no fake tracks.
- Actual Castlabs Electron Linux startup checks the typed preload, empty paused state, navigation and absence of renderer Node globals. The README screenshot comes from this running application with no accounts connected. Narrow layouts were visually inspected.
- Both GitHub workflows passed actionlint 1.7.12 static validation. Hosted GitHub Actions have not run for these local commits.
- Production dependency audit: zero advisories. Full development-toolchain audit: nine advisories (eight moderate, one high). The unresolved high advisory is in the development archive-extraction chain; runtime archives are pinned and hash-verified before extraction. This is a release-maintenance concern, not a claim that the complete toolchain is vulnerability-free.

## Clipboard fix checks

- Spotify redirect URI and overlay URL copy buttons now use named, validated main-process commands and Electron's native clipboard API. Browser clipboard permissions remain denied.
- Node 24.11.0 on Linux/WSL: TypeScript, lint, all 31 tests, production build and nine Chromium UI checks passed. Real Electron smoke clicked both copy buttons and verified their exact native clipboard contents. Windows clipboard interaction has not been rechecked locally.

## Spotify setup fix checks

- Partial settings commands now validate supplied fields without applying defaults to omitted fields. Regression tests cover retaining setup progress, Spotify client ID and unrelated preferences across saves and step navigation, plus empty and invalid updates.
- Node 24.11.0 on Linux/WSL: TypeScript, lint, all 33 unit/contract tests and production build passed. Nine Chromium UI checks passed. Real Electron smoke entered a client ID in setup, clicked Connect, verified the authorization URL and PKCE method, and confirmed setup progress, volume and client ID survived saving and continuing. Only the external browser launch was intercepted; the renderer, IPC validation and main-process settings/provider code ran normally.
- Setup and playback documentation now explain Development Mode User Management and adding the Spotify account that will connect. Real-account authorization, audible playback and Windows behaviour remain unverified for this fix.
- Follow-up real Electron smoke also clicked Streamer.bot Save & connect with a changed port and YouTube Save & test API with a test-only key. Both retained the active setup step and unrelated settings; the YouTube request carried the saved key and received a controlled API response. No real Streamer.bot server or Google account was used.

## GitHub updater checks

- Node 24.11.0 on Linux/WSL: TypeScript, ESLint, all 31 unit/contract tests and production build passed. Updater tests cover stable-only downloads, explicit restart, in-flight deduplication, offline retry, periodic checks and unsupported-copy fallback. Release verification tests reject mismatched installer metadata.
- Nine Chromium UI checks passed, including the update notice across navigation and explicit restart at all three display sizes. Local browser runs use cached system libraries; the first attempt lacked libnspr4. Real Electron startup/preload/paused-state smoke passed after the build completed.
- Windows 10.0.26300 x64, Node 25.1.0, fresh temporary checkout: clean dependency installation and installer/portable packaging passed. Generated app-update.yml points at the public Encore repository. The artifact verifier matched latest.yml to the installer and hashed both update assets. Packages are unsigned and VMP signing was skipped. The updated packaged startup smoke was blocked because the existing installed Encore process owns port 17843; that running app was left open. Linux packaged-code startup passed as recorded above.
- Production dependency audit remains clear; workflow static validation passed. Hosted publication and a two-version installed Windows update have not been exercised. See the update checklist in RELEASE.md.

## Windows and account checks

- Windows 10.0.26300 x64, Node 25.1.0, in a temporary Windows checkout: clean dependency installation, TypeScript, lint, all 25 tests and production build passed.
- electron-builder produced both unsigned NSIS installer and portable executable using the pinned Castlabs runtime and Encore icon. The artifact verifier checked executable headers, minimum sizes and generated SHA-256 checksums and preview notes.
- Playwright launched the actual unpacked Windows packaged executable and verified startup, preload, fresh empty/paused state, navigation and renderer isolation. An inherited `ELECTRON_RUN_AS_NODE` flag initially blocked launch; clearing it resolved the failure. The smoke script clears that development-host flag. A separate page-selection race was corrected so provider pages cannot be mistaken for the player window.
- Installer/uninstaller interaction, the portable self-extracting launcher, login startup and account audio have not been exercised. These are explicit remaining manual checks; packaging and unpacked startup do not establish them.

No real Spotify/YouTube account, Streamer.bot installation, OBS session, signing certificate or Castlabs EVS account was used. Test doubles establish command/state contracts, not audible playback or platform approval.

Before stable distribution, complete the [Windows/account checklist](RELEASE.md), including installed and portable playback, provider switching, natural end, refresh, secure storage, OBS capture and installer/uninstaller behaviour. Spotify DRM signing and cross-service permission remain gates. YouTube uses the visible official video player; this is not an iframe-free audio implementation.

No release tag, push or publication was performed. Local commits exclude brief.md, AGENTS.md, credentials, user data, generated build output and unrelated existing edits.


## Playlist import fix checks (after v1.0.1)

- Spotify uses the current playlist-items endpoint and item field, retaining compatibility with legacy track fields. Tests cover pagination, inaccessible/local/episode filtering, empty/malformed responses and safe access errors.
- YouTube metadata is batched per playlist page, preserving playlist order and skipping missing, non-embeddable and live/untimed entries. Quota errors abort rather than silently truncating the import.
- Node 24.11.0 on Linux/WSL: TypeScript, ESLint, all 44 unit/contract tests and production build passed. Twelve Chromium UI checks passed across the three display sizes, including pending/completed/failed imports and retaining saved tracks.
- Real Castlabs Electron smoke imported Spotify and YouTube playlists from the setup UI through validated IPC and provider parsing. It exercised a one-use Spotify OAuth callback with controlled token/API responses, verified setup progress stayed at step 5, and confirmed a failed YouTube import retained the previous saved playlist. Existing clipboard/setup/isolation checks also passed.
- These controlled responses do not verify real accounts or the user's exact playlists. Windows/account checks remain unrun for this fix. No new release has been published for these changes.


## Custom overlay and YouTube autoplay checks (v1.0.2)

- Node 24.11.0 on Linux/WSL: TypeScript, ESLint, all 45 unit/contract tests and production build passed. Eighteen Chromium checks passed across three display sizes, including persisted overlay settings, shared preview, safe metadata rendering, provider progress and live paused visibility.
- Player fixtures verify direct YouTube load-and-play, provider switching, resume without reload, repeated-track restart and visible autoplay blocking. They do not establish live account audio.
- Real Castlabs Electron smoke passed setup saves, controlled OAuth and both playlist imports, failure preservation, native clipboard and isolation. A second sandboxed Electron window loaded the actual loopback OBS page and verified live style/accent changes; its screenshot was visually inspected.
- Windows packaging/startup checks run in the tag workflow. Manual account audio, installed update interaction and OBS capture remain unverified locally. This release includes the previously recorded playlist import fixes.

## Independent saved overlays

- Node 24.11.0 on Linux/WSL: TypeScript, ESLint, all 47 unit/contract tests, production build and 21 Chromium checks passed. Coverage includes old-settings migration, validated unique preset IDs, independent styles, rename URL stability, persisted designs and deletion.
- Real Castlabs Electron smoke passed with two simultaneous sandboxed windows loading actual loopback overlay URLs. Editing a saved design updated its window while the default stayed unchanged; renaming preserved its URL, native clipboard copied that URL, and deletion hid only that source. Existing setup, controlled provider import and isolation checks also passed.
- Manual Windows OBS capture and live provider accounts were not exercised for this change. No new release was published for these changes.

## Gallery layouts and overlay motion

- Node 24.11.0 on Linux/WSL: TypeScript, ESLint, 47 unit/contract tests, production build and 24 Chromium checks passed. Older settings retain horizontal artwork; independent presets persist vertical layout and vinyl options. Browser checks cover request/listening/base attribution, omitted platform names, playback-aware vinyl/equalizer animation, song crossfades, progress updates without repeated transitions, and reduced motion.
- Real Castlabs Electron smoke passed live horizontal and vertical/vinyl overlays in separate sandboxed windows, alongside setup, controlled playlist imports, clipboard and isolation checks. The gallery screenshot was inspected, including fallback vinyl artwork. The global Working indicator was removed; operation errors and specific import feedback remain available.
- Windows OBS capture and real-account audio were not exercised for this change. No new release was published.


## Request search preference

- Node 24.11.0 on Linux/WSL: TypeScript, ESLint, all 58 unit/contract tests and production build passed. New controlled provider cases cover Spotify preference, unavailable-track fallback, artist Topic/auto-generated and official-audio ranking, video fallback, metadata ordering, encoded queries, explicit links and visible provider failures.
- All 24 Chromium UI checks passed across three display sizes. The real Castlabs Electron smoke passed existing setup, controlled playlist imports, clipboard, navigation and live overlays. Search priority itself is covered by controlled provider unit tests.
- YouTube Music preference uses metadata heuristics within YouTube search results, not a separately authenticated Music catalogue. Real-account search quality, audio and Windows checks remain unverified for this change.

## Canvas artwork

- Node 24.11.0 on Linux/WSL: TypeScript, ESLint, all 58 unit/contract tests and production build passed. Migration coverage includes the default-off Canvas setting and independent saved designs.
- All 27 Chromium checks passed across three display sizes, covering the persisted toggle, static settings preview, minimum square player size, muted initialization, playback/seek synchronisation without reload, track changes without cloned video frames, error fallback and disposal when hidden or switching to Spotify. Provider playback uses a controlled IFrame API fixture rather than a live YouTube account.
- Real Castlabs Electron smoke passed setup saves, controlled playlist imports, native clipboard, navigation and live independent loopback overlays. Live YouTube Canvas embedding/autoplay in OBS, Windows capture and real-account audio remain unverified. Spotify Canvas is unavailable through its public APIs and is not implemented; Spotify retains cover art. No release was published for this change.

## v1.1.0 release checks

- Linux/WSL with Node 24.11.0: TypeScript, ESLint, all 58 unit/contract tests, production build, all 27 Chromium checks across three display sizes, and real Castlabs Electron smoke passed for version 1.1.0.
- Windows packaging, packaged startup and checksum validation run in the tagged GitHub release workflow before stable publication. Live accounts, OBS Canvas playback and manual Windows installation/capture remain unverified.
- The standalone songrequest.cs action and unrelated local upstream edits are excluded from the release commit.

## Saved mixed stream playlists

- Linux/WSL, Node 24.11.0: typecheck, lint, 62 unit/contract tests and production build passed. The storage round-trip check was extended and rerun successfully for a saved mixed playlist and active selection.
- Library checks cover provider-ID deduplication, independent saved ordering and playback rotation, active edits/deletion without interrupting the current song, request → personal → mixed base scheduling, banned tracks, paused restoration, invalid-edit preservation, IPC validation and migration of older base-only state.
- All 30 Chromium UI checks passed across three desktop sizes, including saved mixed playlist controls, keyboard ordering boundaries, navigation and overflow checks.
- Real Castlabs Electron smoke passed mixed playlist creation, Spotify and YouTube import appends, stream activation, reorder, reload persistence, rename, failed-import preservation, removal and stopping through the real UI/validated IPC/provider parsers. The library screenshot was inspected. Existing setup, OAuth, clipboard, isolation and OBS checks also passed.
- Provider responses in automated tests are controlled fixtures. Real-account audio/provider switching and Windows installed playback remain unverified for this change. No version bump or release is included.
