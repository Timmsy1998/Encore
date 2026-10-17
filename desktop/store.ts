import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { defaults, migrate, type SavedState } from "../src/core/contracts";
export class Store {
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
  }
  load(): SavedState {
    const path = join(this.directory, "state.json");
    if (!existsSync(path)) return defaults();
    try {
      return migrate(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      copyFileSync(path, `${path}.rejected-${Date.now()}`);
      throw Error(
        "Saved state is invalid or from a newer version. A recovery copy was saved; repair or move state.json before restarting.",
      );
    }
  }
  save(state: SavedState) {
    const data = migrate(state);
    const path = join(this.directory, "state.json");
    writeFileSync(`${path}.tmp`, JSON.stringify(data), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  }
}
