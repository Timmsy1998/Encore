# Releasing Encore

Windows releases are built in GitHub Actions from a version tag. The workflow tests the tagged commit, builds the installer and portable executable, checks the artifacts, then publishes a stable GitHub release.

## Prepare a release

1. Update the version in `package.json` and `package-lock.json`.
2. Add release notes in `docs/releases/VERSION.md`.
3. Run the checks below and try the packaged app on Windows.
4. Commit the release changes, then push a matching tag such as `v1.2.0`.

The tag must match the package version. Existing tags and releases aren't overwritten.

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

Desktop smoke tests need a graphical session. For manual package checks, try installation and removal, the portable data folder, Spotify/YouTube switching, queued requests, OBS audio capture and reopening with playback paused. Automated tests use controlled provider responses, so they don't replace listening to the packaged app.

## Signing

Add these repository secrets for the release workflow:

| Secret | Used for |
| --- | --- |
| `CSC_LINK` | Optional Authenticode certificate, as a URL or base64 PFX |
| `CSC_KEY_PASSWORD` | Certificate password |
| `EVS_ACCOUNT_NAME` | Castlabs EVS account |
| `EVS_PASSWD` | Castlabs EVS password |

Authenticode is optional. Unsigned builds may show a SmartScreen warning.

Spotify's Windows DRM support needs Castlabs VMP signing. Create and verify an account using the [EVS instructions](https://github.com/castlabs/electron-releases/wiki/EVS). With both EVS secrets present, CI enables VMP signing automatically. Credentials aren't included in the app.

For local VMP signing, install `castlabs-evs==1.3.2`, authenticate with `python -m castlabs_evs.account reauth`, and set `ENCORE_VMP_SIGN=1` before packaging. `ENCORE_PYTHON` can select a Python executable. The signing hook runs after Authenticode and before the installer and portable archives are created. Signing failures stop the build.

## GitHub workflow

`.github/workflows/ci.yml` runs checks for pushes and pull requests without signing secrets. `release.yml` runs for `v*` tags and rejects version mismatches.

The release build creates:

- `Encore-VERSION-windows-x64-installer.exe`
- `Encore-VERSION-windows-x64-portable.exe`
- `latest.yml` and the installer's `.blockmap`
- `SHA256SUMS.txt`
- `RELEASE-NOTES.md`

The artifact checker validates executable headers, sizes, update metadata and checksums. The publishing job downloads and checks those artifacts again; it doesn't rebuild them. Keep the installer, blockmap and `latest.yml` attached so automatic updates work.

Use tag protection and the GitHub **release** environment to control release access. Only trusted release builds should receive signing secrets. Include the GPL licence and corresponding source with distributions.

## Automatic updates

Installed copies check stable releases shortly after startup and every six hours. They download a newer version in the background and offer **Restart and install**. Playback pauses and the queue is saved before restarting. Closing the app normally doesn't install an update.

A new release needs a higher package version to trigger an update. Test an update between two installed versions on Windows, including queue restoration and offline retry. Portable users replace the executable manually and keep `Encore-data`.
