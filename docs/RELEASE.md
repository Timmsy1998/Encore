# Windows builds and release gates

Node 22.12+, Windows x64 and `npm ci` are required. The source version is `1.0.1`. See [release changes](releases/1.0.1.md).

```powershell
npm ci
npm run check
npx playwright install chromium
npm run test:ui
npm run runtime
npm run test:desktop
npm run package:win
node scripts/release.mjs
```

Both NSIS and portable executables must exist, be larger than 1 MB and have Windows executable headers before the checksum/notes script succeeds. These checks do not replace installing and running them. Output: `release/Encore-VERSION-windows-x64-installer.exe`, `release/Encore-VERSION-windows-x64-portable.exe`, `latest.yml`, installer `.blockmap`, `SHA256SUMS.txt`, `RELEASE-NOTES.md`. The verifier matches update metadata version, filename, size and SHA-512 against the installer and includes update assets in the SHA-256 manifest. Never ship the unpacked directory as a substitute for either package.

## Signing

Optional repository secrets `CSC_LINK` (electron-builder certificate URL/base64 PFX) and `CSC_KEY_PASSWORD` enable Authenticode. Without them the build remains possible and notes say unsigned; SmartScreen may warn. Never commit signing files/passwords. Review certificate identity and timestamping on a real Windows download.

Windows Spotify DRM requires production VMP signing. Register/verify a Castlabs EVS account following [EVS instructions](https://github.com/castlabs/electron-releases/wiki/EVS), then provide `EVS_ACCOUNT_NAME` and `EVS_PASSWD` secrets. CI pins `castlabs-evs==1.3.2`; both credentials set `ENCORE_VMP_SIGN=1`. Locally install that Python package, authenticate with `python -m castlabs_evs.account reauth`, set `ENCORE_VMP_SIGN=1` and package. Optional `ENCORE_PYTHON` selects Python. The `afterSign` hook runs `python -m castlabs_evs.vmp sign-pkg` after OS signing and before NSIS/portable archiving, failing on any signing failure. No EVS credentials are installed in the app. Without EVS credentials the package builds but is explicitly a preview with unverified/blocked Spotify DRM.

## Automation

`.github/workflows/ci.yml` checks pushes/PRs on Windows: lint, TypeScript, unit/contract tests, build, Chromium UI checks and real Electron smoke. It has read-only repository permission and no signing secrets. Actions are pinned to verified release commit SHAs.

`release.yml` runs only for `v*` tags and rejects version mismatches. It tests the tagged checkout, builds both Windows packages, smoke-tests the unpacked packaged app, verifies outputs, hashes them, and uploads exact assets. A separate job downloads and re-verifies checksums, then publishes a **stable release** with generated signing/DRM notes. Only that job gets `contents: write`. No code is rebuilt in the publishing job.

Configure the GitHub **release** environment with required reviewers before enabling publication. This is a maintainer release gate, not an approval demanded for local development. Tag protection and environment reviewers should limit who can run trusted release builds and use signing secrets. Do not expose these secrets through pull-request workflows. Existing tags/releases are not overwritten automatically. Automatic updates use stable GitHub releases; previews remain available from Releases. Keep the installer, its blockmap and latest.yml attached to the release. Packaging uses --publish never; only the publishing job uploads assets.

## Required manual record before stable distribution

Record package version, commit, Windows build/architecture, GPU/audio device, account class and observed result, without credentials:

- Run development and installed/portable packages as a standard Windows user. Verify installer/uninstaller, paths, SmartScreen/signature and launch at login; move the portable executable with its data folder and check read-only failure.
- Spotify: Premium and developer-account access, browser PKCE callback, Encore device ready, actual audible play/pause/skip/volume, natural end, expiry/refresh/disconnect and reconnect. Confirm Widevine VMP signing and downloaded package playback, not just unpacked startup.
- YouTube: API validation, real search/link, restricted/deleted video, origin/error recovery, natural end and pause on minimise/tray. Video must remain visible during playback.
- Switch Spotify → YouTube → Spotify with requests queued; confirm only one audio source and one advancement per end. Exercise rapid commands, unavailable media and provider timeouts.
- Streamer.bot real authentication/reconnect/import 1.1.0 diagnostics, Twitch/YouTube/Kick replies, moderator permissions, channel points and duplicate events.
- OBS in its own process: current-track updates, Encore restart/reconnect, compact/colour/test and exactly one captured audio path.
- Restart paused with pending/current tracks; backup/restore, secure storage, display scaling, off-screen monitor recovery, tray and second-instance behaviour.
- Resolve Spotify cross-service integration permission and broadcast/music rights. Source implementation does not grant these rights.

Local Windows packaging and unpacked packaged startup passed; see [the verification record](VERIFICATION.md). Real-account audio, installer/uninstaller and the portable launcher remain untested. Do not remove these gates based on a green automated build.

## Updating

Bump `package.json` and lockfile together, verify checks and release notes, commit, then (only when authorised) create/push matching `vX.Y.Z`. Preserve corresponding source and GPL notices with distributed binaries. Installed Windows copies check after 15 seconds and every six hours, then download newer stable releases automatically. About offers an immediate check. A notice across all pages offers **Restart and install**; playback pauses and queue state is saved before restarting. Ordinary quit does not install an update. No application GitHub credentials are needed for this public repository. Update errors offer retry or manual installation through Releases.

Portable copies replace the EXE manually while retaining `Encore-data`. Existing builds without this updater need one manual installer upgrade first. Use a higher package version for each subsequent release: the same version does not trigger an update. The workflow publishes stable releases directly, making newer versions available to installed clients without a separate promotion step.

Before shipping, test with two installed versions on Windows: publish the newer version with metadata, confirm detection/download, keep playing without interruption, restart from the notice, confirm the new version opens paused with the queue preserved, and verify close-to-tray does not block installation. Exercise offline/retry, checksum failure and portable manual fallback. These installed update checks have not yet been run locally.
