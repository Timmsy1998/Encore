// Verify both Windows outputs before anything is uploaded or published.
import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (
  process.env.GITHUB_REF_NAME &&
  process.env.GITHUB_REF_NAME !== `v${version}`
)
  throw Error("Release tag and package version disagree");
const names = ["installer", "portable"].map(
  (type) => `Encore-${version}-windows-x64-${type}.exe`,
);
const sums = [];
for (const name of names) {
  const file = await readFile("release/" + name);
  if (
    (await stat("release/" + name)).size < 1000000 ||
    file.subarray(0, 2).toString() !== "MZ"
  )
    throw Error(`Missing or invalid Windows package: ${name}`);
  sums.push(createHash("sha256").update(file).digest("hex") + "  " + name);
}
await writeFile("release/SHA256SUMS.txt", sums.join("\n") + "\n");
await writeFile(
  "release/RELEASE-NOTES.md",
  `# Encore ${version} preview\n\nBuilt from tested commit ${process.env.GITHUB_SHA || "local working tree"}. Includes Windows x64 installer and portable packages with SHA-256 checksums.\n\nAuthenticode: ${process.env.CSC_LINK ? "credentials supplied; executable signature checked by workflow" : "unsigned; Windows SmartScreen warnings are expected"}.\nWidevine VMP: ${process.env.ENCORE_VMP_SIGN === "1" ? "signing hook completed" : "not signed; Spotify DRM is a distribution blocker"}.\n\nAutomated tests establish startup and queue/provider contracts, not real-account audio, installer UX or broadcast rights. Complete docs/RELEASE.md account and Windows checks before promoting this preview. YouTube requires a visible video player. Desktop UI is English only.\n\nUpdates are manual through About → Releases. Keep the portable Encore-data folder when replacing the executable. Source/licence: https://github.com/Timmsy1998/Encore/tree/v${version} (GPL-3.0-only), based on Better Song Request by HackMe_: https://github.com/xHackMe/better-song-request-streamerbot .\n`,
);
console.log(
  "Both Windows packages verified; checksums and release notes written.",
);
