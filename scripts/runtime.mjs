// Castlabs Electron for Content Security: checksums pinned from its release manifest.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, chmod } from "node:fs/promises";
import { resolve, join } from "node:path";
import extract from "extract-zip";
export const version = "44.5.1+wvcus";
const platform = process.argv[2] ?? process.platform;
const hashes = {
  linux: "afa7d4ea49abf1e91c5be0f88cfe1abdb977ff3454d57658e90b004aacbde9cc",
  win32: "c7d51e4bf80de9ef18b3306b0d140059bb203510d3dfc88f3404049a12c90f89",
};
if (!hashes[platform])
  throw Error("Runtime preparation currently supports Windows and Linux x64.");
const directory = resolve(".runtime", platform),
  marker = join(directory, ".encore-runtime");
let existing = "";
try {
  existing = await readFile(marker, "utf8");
} catch {
  /* first download */
}
if (existing !== hashes[platform]) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const name = `electron-v${version}-${platform}-x64.zip`;
  console.log(`Downloading verified ${name}`);
  const response = await fetch(
    `https://github.com/castlabs/electron-releases/releases/download/v${encodeURIComponent(version)}/${name}`,
    { signal: AbortSignal.timeout(300000) },
  );
  if (!response.ok) throw Error(`Runtime download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(data).digest("hex") !== hashes[platform])
    throw Error("Runtime checksum mismatch.");
  const zip = join(directory, "runtime.zip");
  await writeFile(zip, data);
  await extract(zip, { dir: directory });
  await rm(zip);
  if (platform === "linux") await chmod(join(directory, "electron"), 0o755);
  await writeFile(marker, hashes[platform]);
}
console.log(`Runtime ready: ${directory}`);
