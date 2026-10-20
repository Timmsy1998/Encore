import { createConnection, type Socket } from "node:net";
import { posix } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { discordActivity, type DiscordActivity } from "../src/core/discord";
import type { Snapshot } from "../src/core/contracts";

const Message = z.object({ cmd: z.string().optional(), evt: z.string().nullable().optional(), nonce: z.string().nullable().optional() });
export function discordSocketPath(index: number, platform = process.platform, env = process.env) {
  return platform === "win32" ? `\\\\?\\pipe\\discord-ipc-${index}`
    : posix.join(env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || "/tmp", `discord-ipc-${index}`);
}
export function discordFrame(opcode: number, payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
// Main-owned local IPC only: no Discord token, OAuth, listening port or renderer bridge.
export class DiscordPresence {
  status = "Disabled";
  private clientId = "";
  private socket?: Socket;
  private ready = false;
  private desired: DiscordActivity | null = null;
  private sent = "";
  private lastSent = 0;
  private nonce = "";
  private retry?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private ack?: ReturnType<typeof setTimeout>;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private backoff = 15000;
  constructor(private changed: () => void, private connect: (path: string) => Socket = path => createConnection(path)) {}
  private report(status: string) {
    if (this.status === status) return;
    this.status = status;
    queueMicrotask(this.changed);
  }
  update(state: Snapshot) {
    const id = state.settings.discordEnabled ? state.settings.discordClientId : "";
    this.desired = discordActivity(state);
    if (id !== this.clientId) {
      this.disconnect();
      this.clientId = id;
      this.backoff = 15000;
      if (id) this.open(0);
      else this.report("Disabled");
    }
    this.flush();
  }
  private disconnect() {
    clearTimeout(this.retry); clearTimeout(this.deadline); clearTimeout(this.ack); clearTimeout(this.flushTimer);
    this.retry = this.deadline = this.ack = this.flushTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      if (this.ready && !socket.destroyed) {
        socket.end(discordFrame(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: null }, nonce: randomUUID() }));
        setTimeout(() => socket.destroy(), 500).unref();
      } else socket.destroy();
    }
    this.ready = false;
    this.sent = ""; this.lastSent = 0; this.nonce = "";
  }
  stop() { this.disconnect(); this.clientId = ""; this.report("Disabled"); }
  private reconnect(status: string) {
    this.disconnect();
    if (!this.clientId) return;
    this.report(status);
    this.retry = setTimeout(() => { this.retry = undefined; this.open(0); }, this.backoff);
    this.retry.unref();
    this.backoff = Math.min(60000, this.backoff * 2);
  }
  private open(index: number) {
    if (!this.clientId) return;
    if (index > 9) { this.reconnect("Discord unavailable · open the desktop app; retrying automatically"); return; }
    this.report("Connecting to Discord…");
    let socket: Socket;
    try { socket = this.connect(discordSocketPath(index)); }
    catch { this.open(index + 1); return; }
    this.socket = socket;
    let buffer = Buffer.alloc(0);
    const fail = () => {
      if (this.socket !== socket) return;
      clearTimeout(this.deadline);
      this.socket = undefined;
      socket.destroy();
      if (this.ready) { this.ready = false; this.reconnect("Discord disconnected · retrying automatically"); }
      else this.open(index + 1);
    };
    this.deadline = setTimeout(fail, 3000); this.deadline.unref();
    socket.on("connect", () => {
      if (this.socket === socket) socket.write(discordFrame(0, { v: 1, client_id: this.clientId }));
    });
    socket.on("error", fail);
    socket.on("close", fail);
    socket.on("data", (chunk: Buffer) => {
      if (this.socket !== socket) return;
      if (buffer.length + chunk.length > 131072) { fail(); return; }
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8 && this.socket === socket) {
        const opcode = buffer.readUInt32LE(0), length = buffer.readUInt32LE(4);
        if (length > 65536) { fail(); return; }
        if (buffer.length < length + 8) return;
        const body = buffer.subarray(8, length + 8);
        buffer = buffer.subarray(length + 8);
        if (opcode === 3) {
          const header = Buffer.alloc(8); header.writeUInt32LE(4, 0); header.writeUInt32LE(body.length, 4);
          socket.write(Buffer.concat([header, body])); continue;
        }
        if (opcode !== 1) { fail(); return; }
        let message: z.infer<typeof Message>;
        try { message = Message.parse(JSON.parse(body.toString("utf8"))); }
        catch { fail(); return; }
        if (message.evt === "ERROR") {
          this.reconnect("Discord rejected presence · check the application ID and Discord activity settings; retrying automatically"); return;
        }
        if (message.cmd === "DISPATCH" && message.evt === "READY" && !this.ready) {
          clearTimeout(this.deadline); this.deadline = undefined;
          this.ready = true; this.sent = ""; this.lastSent = 0;
          this.flush();
        } else if (message.cmd === "SET_ACTIVITY" && this.nonce && message.nonce === this.nonce) {
          clearTimeout(this.ack); this.ack = undefined; this.nonce = ""; this.backoff = 15000;
          this.report(this.desired ? "Connected · sharing your track" : "Connected · presence hidden while idle or paused");
          this.flush();
        }
      }
    });
  }
  private flush() {
    if (!this.ready || !this.socket || this.nonce) return;
    const payload = JSON.stringify(this.desired);
    if (payload === this.sent) return;
    // Coalesce progress/seek events and stay below Discord's activity rate limit.
    const delay = this.desired === null ? 0 : Math.max(0, this.lastSent + 15000 - Date.now());
    if (delay) {
      if (!this.flushTimer) { this.flushTimer = setTimeout(() => { this.flushTimer = undefined; this.flush(); }, delay); this.flushTimer.unref(); }
      return;
    }
    clearTimeout(this.flushTimer); this.flushTimer = undefined;
    this.sent = payload; this.lastSent = Date.now(); this.nonce = randomUUID();
    this.socket.write(discordFrame(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: this.desired }, nonce: this.nonce }));
    this.ack = setTimeout(() => this.reconnect("Discord did not confirm presence · retrying automatically"), 10000); this.ack.unref();
  }
}
