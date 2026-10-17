import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Store } from "../desktop/store";
import { defaults } from "../src/core/contracts";
const dirs: string[] = [];
function store() {
  const dir = mkdtempSync(join(tmpdir(), "encore-"));
  dirs.push(dir);
  return new Store(dir);
}
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);
it("atomically writes validated state and reloads preferences", () => {
  const s = store();
  const data = defaults();
  data.settings.volume = 36;
  s.save(data);
  expect(s.load().settings.volume).toBe(36);
  expect(readdirSync(s.directory)).toEqual(["state.json"]);
  expect(
    JSON.parse(readFileSync(join(s.directory, "state.json"), "utf8")),
  ).not.toHaveProperty("access");
});
it("rejects invalid writes without overwriting the last valid state", () => {
  const s = store();
  s.save(defaults());
  expect(() => s.save({ ...defaults(), version: 9 } as any)).toThrow();
  expect(s.load().version).toBe(1);
});
it("preserves rejected state rather than silently resetting", () => {
  const s = store();
  writeFileSync(join(s.directory, "state.json"), "{broken");
  expect(() => s.load()).toThrow("recovery copy");
  expect(readdirSync(s.directory).some((n) => n.includes(".rejected-"))).toBe(
    true,
  );
  expect(readFileSync(join(s.directory, "state.json"), "utf8")).toBe("{broken");
});
