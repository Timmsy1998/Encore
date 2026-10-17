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
