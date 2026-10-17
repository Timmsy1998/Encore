# Verification record

Verified on 2026-10-17. This is a development preview, not a real-account playback certification.

## Automated and visual checks

- Linux/WSL, Node 22.23.3: TypeScript, ESLint with zero warnings, 25 unit/contract tests and production build passed.
- Queue checks cover request/personal/base priority, finish-current behaviour, duplicate events, limits, bans, votes and paused restart. Storage checks cover atomic writes, recovery and version rejection. Provider/IPC/reconnect contracts use test doubles.
- Six Chromium UI checks cover resumable/skippable setup, personal listening, visible provider failures, navigation and persistent controls at 1440×900/100%, 900×700/125% and 760×600/150%. Test states are explicit fixtures; production has no fake tracks.
- Actual Castlabs Electron Linux startup checks the typed preload, empty paused state, navigation and absence of renderer Node globals. The README screenshot comes from this running application with no accounts connected. Narrow layouts were visually inspected.
- Both GitHub workflows passed actionlint 1.7.12 static validation. Hosted GitHub Actions have not run for these local commits.
- Production dependency audit: zero advisories. Full development-toolchain audit: nine advisories (eight moderate, one high). The unresolved high advisory is in the development archive-extraction chain; runtime archives are pinned and hash-verified before extraction. This is a release-maintenance concern, not a claim that the complete toolchain is vulnerability-free.

## Windows and account checks

- Windows 10.0.26300 x64, Node 25.1.0, in a temporary Windows checkout: clean dependency installation, TypeScript, lint, all 25 tests and production build passed.
- electron-builder produced both unsigned NSIS installer and portable executable using the pinned Castlabs runtime and Encore icon. The artifact verifier checked executable headers, minimum sizes and generated SHA-256 checksums and preview notes.
- Playwright launched the actual unpacked Windows packaged executable and verified startup, preload, fresh empty/paused state, navigation and renderer isolation. An inherited `ELECTRON_RUN_AS_NODE` flag initially blocked launch; clearing it resolved the failure. The smoke script clears that development-host flag. A separate page-selection race was corrected so provider pages cannot be mistaken for the player window.
- Installer/uninstaller interaction, the portable self-extracting launcher, login startup and account audio have not been exercised. These are explicit remaining manual checks; packaging and unpacked startup do not establish them.

No real Spotify/YouTube account, Streamer.bot installation, OBS session, signing certificate or Castlabs EVS account was used. Test doubles establish command/state contracts, not audible playback or platform approval.

Before stable distribution, complete the [Windows/account checklist](RELEASE.md), including installed and portable playback, provider switching, natural end, refresh, secure storage, OBS capture and installer/uninstaller behaviour. Spotify DRM signing and cross-service permission remain gates. YouTube uses the visible official video player; this is not an iframe-free audio implementation.

No release tag, push or publication was performed. Local commits exclude brief.md, AGENTS.md, credentials, user data, generated build output and unrelated existing edits.
