// Verify Windows packages and update metadata before publication.
import { readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { load } from "js-yaml";
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (
  process.env.GITHUB_REF_NAME &&
  process.env.GITHUB_REF_NAME !== `v${version}`
)
  throw Error("Release tag and package version disagree");
const names = ["installer", "portable"].map(
  (type) => `Encore-${version}-windows-x64-${type}.exe`,
);
const metadata = load(await readFile("release/latest.yml", "utf8"));
const installer = await readFile("release/" + names[0]);
const sha512 = createHash("sha512").update(installer).digest("base64");
if (
  metadata?.version !== version || metadata.path !== names[0] ||
  metadata.sha512 !== sha512 || metadata.files?.length !== 1 ||
  metadata.files[0].url !== names[0] || metadata.files[0].sha512 !== sha512 ||
  metadata.files[0].size !== installer.length
) throw Error("Update metadata does not match the installer");
const blockmap = names[0] + ".blockmap";
if (!(await stat("release/" + blockmap)).size) throw Error("Empty installer blockmap");
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
for (const name of ["latest.yml", blockmap]) {
  sums.push(createHash("sha256").update(await readFile("release/" + name)).digest("hex") + "  " + name);
}
await writeFile("release/SHA256SUMS.txt", sums.join("\n") + "\n");
const changes = await readFile(`docs/releases/${version}.md`, "utf8").catch((error) => {
  if (error.code === "ENOENT") return "";
  throw error;
});
await writeFile(
  "release/RELEASE-NOTES.md",
  `# Encore ${version}\n\n${changes.trim() ? changes.trim() + "\n\n" : ""}Built from tested commit ${process.env.GITHUB_SHA || "local working tree"}. Includes Windows x64 installer and portable packages with SHA-256 checksums.\n\nAuthenticode: ${process.env.CSC_LINK ? "credentials supplied; executable signature checked by workflow" : "unsigned; Windows SmartScreen warnings are expected"}.\nWidevine VMP: ${process.env.ENCORE_VMP_SIGN === "1" ? "signing hook completed" : "not signed; Spotify DRM is a distribution blocker"}.\n\nSpotify requires Premium and developer-app access. Keep YouTube’s player visible during playback. The desktop interface is English only.\n\nInstalled copies automatically download newer stable GitHub releases and offer Restart and install. Portable copies update manually through About → Open releases; retain the Encore-data folder. Source/licence: https://github.com/Timmsy1998/Encore/tree/v${version} (GPL-3.0-only), based on Better Song Request by HackMe_: https://github.com/xHackMe/better-song-request-streamerbot .\n`,
);
console.log(
  "Windows packages and update metadata verified; checksums and release notes written.",
);
