import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("verifies update assets and rejects installer metadata mismatches before publication", () => {
  const directory = mkdtempSync(join(tmpdir(), "encore-release-"));
  try {
    mkdirSync(join(directory, "release"));
    writeFileSync(join(directory, "package.json"), JSON.stringify({ version: "1.0.0" }));
    const installer = "Encore-1.0.0-windows-x64-installer.exe";
    const file = Buffer.alloc(1000001);
    file.write("MZ");
    for (const name of [installer, installer.replace("installer", "portable")])
      writeFileSync(join(directory, "release", name), file);
    writeFileSync(join(directory, "release", installer + ".blockmap"), "blockmap fixture");
    const sha512 = createHash("sha512").update(file).digest("base64");
    const metadata = {
      version: "1.0.0", path: installer, sha512,
      files: [{ url: installer, sha512, size: file.length }],
    };
    const run = () => spawnSync(process.execPath, [resolve("scripts/release.mjs")], {
      cwd: directory, encoding: "utf8",
      env: { ...process.env, GITHUB_REF_NAME: "v1.0.0" },
    });
    const manifest = join(directory, "release", "latest.yml");
    writeFileSync(manifest, JSON.stringify(metadata));
    const valid = run();
    expect(valid.status, valid.stderr).toBe(0);
    const checksums = readFileSync(join(directory, "release", "SHA256SUMS.txt"), "utf8");
    expect(checksums).toContain("latest.yml");
    expect(checksums).toContain(installer + ".blockmap");
    mkdirSync(join(directory, "docs", "releases"), { recursive: true });
    writeFileSync(join(directory, "docs", "releases", "1.0.0.md"), "## Changes\n\nSetup fixes.");
    expect(run().status).toBe(0);
    expect(readFileSync(join(directory, "release", "RELEASE-NOTES.md"), "utf8"))
      .toContain("## Changes\n\nSetup fixes.");
    metadata.files[0].size--;
    writeFileSync(manifest, JSON.stringify(metadata));
    expect(run().status).not.toBe(0);
    metadata.files[0].size++;
    metadata.sha512 = "tampered";
    writeFileSync(manifest, JSON.stringify(metadata));
    expect(run().status).not.toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
