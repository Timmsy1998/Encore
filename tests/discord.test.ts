import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandSchema, defaults, migrate, type Snapshot, type Track } from "../src/core/contracts";
import { discordActivity, latestReleaseUrl } from "../src/core/discord";
import { DiscordPresence, discordFrame, discordSocketPath } from "../desktop/discord";

const track: Track = { id: "abcdefghijk", source: "youtube", title: "A song", author: "An artist", duration: 200, user: "Private viewer" };
function state(): Snapshot {
  return { ...defaults(), current: track, playing: true, currentLane: "request", streamerbot: "Disconnected", youtube: "Ready", youtubeConfigured: true, spotify: "Disconnected", error: "", logs: [], secureStorage: false, overlayUrl: "", dataPath: "", appVersion: "1.2.4", importStatus: "", progress: { position: 20, observedAt: Date.now(), active: true } };
}
class Pipe extends EventEmitter {
  writes: Buffer[] = [];
  destroyed = false;
  ended = false;
  write(data: Buffer) { this.writes.push(data); return true; }
  end(data: Buffer) { this.ended = true; this.write(data); return this; }
  destroy() { this.destroyed = true; this.emit("close"); return this; }
  message(data: unknown) { this.emit("data", discordFrame(1, data)); }
  ready() { this.emit("connect"); this.message({ cmd: "DISPATCH", evt: "READY" }); }
  last() { return JSON.parse(this.writes.at(-1)!.subarray(8).toString()); }
  ack() { this.message({ cmd: "SET_ACTIVITY", nonce: this.last().nonce }); }
}
function setup() {
  const pipes: Pipe[] = [];
  const changed = vi.fn();
  const connect = vi.fn(() => { const pipe = new Pipe(); pipes.push(pipe); return pipe as unknown as Socket; });
  const presence = new DiscordPresence(changed, connect);
  const snapshot = state(); snapshot.settings.discordEnabled = true;
  return { presence, pipes, changed, connect, snapshot };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T12:00:00Z")); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe("Discord activity", () => {
  it("migrates opt-in defaults and validates only explicit settings patches", () => {
    const saved = defaults();
    delete (saved.settings as Partial<typeof saved.settings>).discordEnabled;
    expect(migrate(saved).settings.discordEnabled).toBe(false);
    expect(CommandSchema.parse({ type: "settings", settings: { discordEnabled: true } })).toEqual({ type: "settings", settings: { discordEnabled: true } });
    expect(CommandSchema.safeParse({ type: "settings", settings: { discordClientId: "https://untrusted" } }).success).toBe(false);
  });
  it("builds provider-derived artwork, song and latest-release links without private metadata", () => {
    const s = state(); expect(discordActivity(s)).toBeNull();
    s.settings.discordEnabled = true;
    const activity = discordActivity(s)!;
    expect(activity.type).toBe(2);
    expect(activity.buttons).toEqual([{ label: "Open on YouTube", url: "https://www.youtube.com/watch?v=abcdefghijk" }, { label: "Download Encore", url: latestReleaseUrl }]);
    expect(activity.assets?.large_image).toBe("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
    expect(activity.timestamps!.end - activity.timestamps!.start).toBe(200);
    expect(activity.timestamps!.start).toBe(Date.now() / 1000 - 20);
    expect(JSON.stringify(activity)).not.toContain("Private viewer");
    s.current = { ...track, source: "spotify", coverId: "a".repeat(40) };
    expect(discordActivity(s)!.assets?.large_image).toBe(`https://i.scdn.co/image/${"a".repeat(40)}`);
    expect(discordActivity(s)!.buttons[0].url).toBe("https://open.spotify.com/track/abcdefghijk");
  });
  it("hides idle/paused tracks, supports privacy controls and never shows a paused countdown", () => {
    const s = state(); s.settings.discordEnabled = true; s.playing = false;
    expect(discordActivity(s)).toBeNull();
    s.settings.discordShowPaused = true; s.settings.discordArtwork = false; s.settings.discordDownloadButton = false;
    const activity = discordActivity(s)!;
    expect(activity.state).toContain("Paused"); expect(activity.timestamps).toBeUndefined();
    expect(activity.assets).toBeUndefined(); expect(activity.buttons).toHaveLength(1);
    s.current = null; expect(discordActivity(s)).toBeNull();
  });
  it("bounds text, rejects invalid IDs, and waits for actual progress before setting timestamps", () => {
    const s = state(); s.settings.discordEnabled = true;
    s.current = { ...track, title: "🎵".repeat(100) };
    expect(Buffer.byteLength(discordActivity(s)!.details)).toBeLessThanOrEqual(128);
    s.current.id = "../untrusted"; expect(discordActivity(s)).toBeNull();
    s.current = track; s.progress = null; expect(discordActivity(s)!.timestamps).toBeUndefined();
    s.progress = { position: 20, observedAt: Date.now(), active: false }; expect(discordActivity(s)!.timestamps).toBeUndefined();
  });
});
describe("Discord local RPC lifecycle", () => {
  it("uses native Discord IPC paths", () => {
    expect(discordSocketPath(2, "win32")).toBe("\\\\?\\pipe\\discord-ipc-2");
    expect(discordSocketPath(0, "linux", { XDG_RUNTIME_DIR: "/run/user/1000" })).toBe("/run/user/1000/discord-ipc-0");
    expect(discordSocketPath(1, "darwin", {})).toBe("/tmp/discord-ipc-1");
  });
  it("handshakes, waits for READY and confirms published activity via nonce", async () => {
    const { presence, snapshot, pipes } = setup();
    presence.update(snapshot); const pipe = pipes[0];
    pipe.emit("connect"); expect(pipe.last()).toEqual({ v: 1, client_id: "1562085890510159892" });
    expect(pipe.writes).toHaveLength(1);
    pipe.message({ cmd: "DISPATCH", evt: "READY" });
    expect(pipe.last().cmd).toBe("SET_ACTIVITY"); expect(pipe.last().args.pid).toBe(process.pid);
    expect(presence.status).toContain("Connecting");
    pipe.message({ cmd: "SET_ACTIVITY", nonce: "unrelated" }); expect(presence.status).toContain("Connecting");
    pipe.ack(); await Promise.resolve(); expect(presence.status).toContain("sharing your track");
    presence.stop(); expect(pipe.last().args.activity).toBeNull(); expect(pipe.ended).toBe(true);
    await vi.advanceTimersByTimeAsync(120000); expect(pipes).toHaveLength(1);
  });
  it("coalesces updates and sends the newest track after the rate limit", async () => {
    const { presence, snapshot, pipes } = setup(); presence.update(snapshot); const pipe = pipes[0]; pipe.ready(); pipe.ack();
    snapshot.current = { ...track, title: "Next" }; presence.update(snapshot);
    snapshot.current = { ...track, title: "Newest" }; presence.update(snapshot);
    expect(pipe.writes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(15000);
    expect(pipe.last().args.activity.details).toBe("Newest"); pipe.ack();
    snapshot.playing = false; presence.update(snapshot);
    expect(pipe.last().args.activity).toBeNull(); pipe.ack(); expect(presence.status).toContain("hidden");
    presence.stop();
  });
  it("tries all pipe slots with bounded timeout, backs off and cancels retries when disabled", async () => {
    const { presence, snapshot, pipes } = setup(); presence.update(snapshot);
    await vi.advanceTimersByTimeAsync(30000); expect(pipes).toHaveLength(10); expect(presence.status).toContain("unavailable");
    await vi.advanceTimersByTimeAsync(15000); expect(pipes).toHaveLength(11);
    snapshot.settings.discordEnabled = false; presence.update(snapshot);
    await vi.advanceTimersByTimeAsync(120000); expect(pipes).toHaveLength(11); expect(presence.status).toBe("Disabled");
  });
  it("reconnects after Discord restarts and republishes the current track", async () => {
    const { presence, snapshot, pipes } = setup(); presence.update(snapshot); pipes[0].ready(); pipes[0].ack();
    pipes[0].destroy(); expect(presence.status).toContain("disconnected");
    snapshot.current = { ...track, title: "After restart" }; presence.update(snapshot);
    await vi.advanceTimersByTimeAsync(15000); pipes[1].ready();
    expect(pipes[1].last().args.activity.details).toBe("After restart"); pipes[1].ack(); presence.stop();
  });
  it("handles fragmented frames, ping, malformed data, and oversized payloads", () => {
    const { presence, snapshot, pipes } = setup(); presence.update(snapshot); const pipe = pipes[0]; pipe.emit("connect");
    const frame = discordFrame(1, { cmd: "DISPATCH", evt: "READY" });
    pipe.emit("data", frame.subarray(0, 3)); expect(pipe.writes).toHaveLength(1);
    pipe.emit("data", frame.subarray(3)); pipe.ack();
    pipe.emit("data", discordFrame(3, { ping: true })); expect(pipe.writes.at(-1)!.readUInt32LE(0)).toBe(4);
    const oversized = Buffer.alloc(8); oversized.writeUInt32LE(1, 0); oversized.writeUInt32LE(65537, 4);
    pipe.emit("data", oversized); expect(pipe.destroyed).toBe(true);
    presence.stop();
    const other = setup(); other.presence.update(other.snapshot);
    const malformed = Buffer.from("nope"); const header = Buffer.alloc(8); header.writeUInt32LE(1, 0); header.writeUInt32LE(4, 4);
    other.pipes[0].emit("data", Buffer.concat([header, malformed])); expect(other.pipes[0].destroyed).toBe(true); other.presence.stop();
  });
  it("clears on application changes and ignores late frames from the old connection", () => {
    const { presence, snapshot, pipes } = setup(); presence.update(snapshot); pipes[0].ready(); pipes[0].ack();
    snapshot.settings.discordClientId = "123456789012345678"; presence.update(snapshot);
    expect(pipes[0].last().args.activity).toBeNull(); pipes[0].message({ cmd: "DISPATCH", evt: "READY" });
    pipes[1].ready(); expect(pipes[1].writes[0].toString()).toContain("123456789012345678"); presence.stop();
  });
  it("surfaces rejected and unacknowledged activity without exposing Discord error bodies", async () => {
    const { presence, snapshot, pipes } = setup(); presence.update(snapshot); pipes[0].ready();
    pipes[0].message({ evt: "ERROR", data: { message: "secret detail" } });
    expect(presence.status).toContain("rejected"); expect(presence.status).not.toContain("secret detail");
    await vi.advanceTimersByTimeAsync(15000); pipes[1].ready();
    await vi.advanceTimersByTimeAsync(10000); expect(presence.status).toContain("did not confirm"); presence.stop();
  });
});
