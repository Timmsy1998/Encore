import { describe, expect, it } from "vitest";
import { Queue } from "../src/core/queue";
import {
  defaults,
  migrate,
  CommandSchema,
  TrackSchema,
  key,
  type Track,
} from "../src/core/contracts";
import { trustedFrame, safeMessage } from "../desktop/security";
const track = (
  id = "aaaaaaa",
  user = "Viewer",
  source: Track["source"] = "youtube",
): Track => ({ id, user, source, title: id, author: "Artist", duration: 180 });
describe("request and personal listening scheduling", () => {
  it("finishes current music, drains requests first, then listening, then rotates base", () => {
    const q = new Queue();
    q.state.base = [track("baseone"), track("basetwo")];
    q.listen(track("personal"));
    expect(q.next()?.id).toBe("personal");
    q.add(track("request"));
    expect(q.current?.id).toBe("personal");
    expect(q.next()?.id).toBe("request");
    expect(q.state.base[0].id).toBe("baseone");
    expect(q.next()?.id).toBe("baseone");
    expect(q.next()?.id).toBe("basetwo");
  });
  it("works without requests or Streamer.bot and permits mixed providers", () => {
    const q = new Queue();
    q.state.settings.requests = false;
    q.listen(track("spotify1", "Streamer", "spotify"));
    q.listen(track("youtube1"));
    expect(q.next()?.source).toBe("spotify");
    expect(q.next()?.source).toBe("youtube");
    expect(q.next()).toBeNull();
  });
  it("deduplicates delivery IDs and rejects duplicate requests", () => {
    const q = new Queue();
    q.add(track(), "event1");
    expect(q.add(track(), "event1")).toBe(false);
    expect(() => q.add(track())).toThrow("already queued");
    q.next();
    expect(() => q.add(track())).toThrow("already queued");
  });
  it("enforces case-insensitive user limits, global limits, duration, disabled requests and bans", () => {
    const q = new Queue();
    q.state.settings.userLimit = 1;
    q.add(track());
    expect(() => q.add(track("bbbbbbb", "viewer"))).toThrow("limit");
    q.state.settings.globalLimit = 1;
    expect(() => q.add(track("bbbbbbb", "Other"))).toThrow("full");
    q.state.settings.requests = false;
    expect(() => q.add(track("bbbbbbb"))).toThrow("turned off");
    expect(() =>
      q.add({ ...track("bbbbbbb"), duration: 1000 }, undefined, true),
    ).toThrow("minute");
    q.ban("youtube:ccccccc");
    expect(() => q.add(track("ccccccc"), undefined, true)).toThrow("banned");
  });
  it("keeps bans out of requests, personal music and base playback", () => {
    const q = new Queue();
    q.add(track());
    q.listen(track());
    q.state.base = [track()];
    q.ban(key(track()));
    expect(q.state.queue).toEqual([]);
    expect(q.state.listening).toEqual([]);
    expect(q.next()).toBeNull();
  });
  it("removes only the last request by that viewer", () => {
    const q = new Queue();
    q.add(track());
    q.add(track("bbbbbbb", "Other"));
    q.add(track("ccccccc"));
    q.wrong("VIEWER");
    expect(q.state.queue.map((t) => t.id)).toEqual(["aaaaaaa", "bbbbbbb"]);
    expect(() => q.wrong("missing")).toThrow();
  });
  it("bounds ordering and preserves every track", () => {
    const q = new Queue();
    q.add(track());
    q.add(track("bbbbbbb"));
    q.reorder(0, 1);
    expect(q.state.queue.map((t) => t.id)).toEqual(["bbbbbbb", "aaaaaaa"]);
    for (const [a, b] of [
      [-1, 0],
      [0, -1],
      [0, 2],
      [0.5, 0],
    ])
      expect(() => q.reorder(a, b)).toThrow();
  });
  it("counts unique votes and resets for a new track", () => {
    const q = new Queue();
    q.state.settings.votes = 2;
    q.add(track());
    q.next();
    expect(q.vote("One")).toBe(false);
    expect(q.vote("ONE")).toBe(false);
    expect(q.vote("Two")).toBe(true);
    q.next();
    expect(q.votes.size).toBe(0);
  });
  it("restores interrupted tracks to the correct lane and always paused", () => {
    const q = new Queue();
    q.listen(track());
    q.next();
    q.playing = true;
    const restored = new Queue(migrate(q.persisted()));
    expect(restored.playing).toBe(false);
    expect(restored.current).toBeNull();
    expect(restored.state.listening[0].id).toBe("aaaaaaa");
    q.add(track("request"));
    q.next();
    const again = new Queue(migrate(q.persisted()));
    expect(again.state.queue[0].id).toBe("request");
  });
});
describe("trust boundaries and migration", () => {
  it("migrates v1 backups created before personal queues were added", () => {
    const old: any = defaults();
    delete old.listening;
    delete old.resume;
    expect(migrate(old).listening).toEqual([]);
    expect(() => migrate({ ...old, version: 2 })).toThrow();
  });
  it("rejects malformed IPC and unsafe track values", () => {
    for (const payload of [
      { type: "shell", command: "whoami" },
      { type: "reorder", from: -1, to: 0 },
      { type: "settings", settings: { wsPort: 0 } },
      { type: "open", target: "https://example.com" },
      { type: "request", input: "" },
    ])
      expect(CommandSchema.safeParse(payload).success).toBe(false);
    expect(TrackSchema.safeParse({ ...track(), duration: NaN }).success).toBe(
      false,
    );
  });
  it("accepts only the actual application main frame and redacts sensitive failures", () => {
    expect(trustedFrame("http://127.0.0.1:17843/", true)).toBe(true);
    for (const url of [
      "https://evil.test",
      "http://localhost:17843/",
      "http://127.0.0.1:17843/overlay.html",
      "http://127.0.0.1:17843/?x=1",
    ])
      expect(trustedFrame(url, true)).toBe(false);
    expect(trustedFrame("http://127.0.0.1:17843/", false)).toBe(false);
    expect(safeMessage(Error("token=secret"))).not.toContain("secret");
  });
});
