import WebSocket from "ws";
import { createHash } from "node:crypto";
export const authenticate = (
  password: string,
  salt: string,
  challenge: string,
) => {
  const hash = (s: string) => createHash("sha256").update(s).digest("base64");
  return hash(hash(password + salt) + challenge);
};
export class StreamerBot {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private attempt = 0;
  private ready = false;
  constructor(
    private status: (s: string) => void,
    private event: (e: unknown) => void,
  ) {}
  connect(port: number, password: string) {
    this.close();
    const generation = this.generation;
    const connect = () => {
      if (generation !== this.generation) return;
      this.status(this.attempt ? "Reconnecting…" : "Connecting…");
      const ws = new WebSocket(`ws://127.0.0.1:${port}/`, {
        maxPayload: 65536,
        handshakeTimeout: 8000,
      });
      this.socket = ws;
      let timeout: ReturnType<typeof setTimeout> = setTimeout(
        () => ws.close(),
        10000,
      );
      const subscribe = () => {
        clearTimeout(timeout);
        ws.send(
          JSON.stringify({
            request: "Subscribe",
            events: { General: ["Custom"] },
            id: "encore-sub",
          }),
        );
        timeout = setTimeout(() => ws.close(), 8000);
      };
      ws.on("message", (buffer) => {
        if (this.socket !== ws) return;
        try {
          const raw = JSON.parse(buffer.toString());
          if (raw.request === "Hello") {
            if (raw.authentication) {
              ws.send(
                JSON.stringify({
                  request: "Authenticate",
                  authentication: authenticate(
                    password,
                    raw.authentication.salt,
                    raw.authentication.challenge,
                  ),
                  id: "encore-auth",
                }),
              );
            } else subscribe();
          } else if (raw.id === "encore-auth") {
            if (raw.status === "ok") subscribe();
            else {
              this.status("Authentication failed; check password.");
              clearTimeout(timeout);
              this.close();
            }
          } else if (raw.id === "encore-sub") {
            clearTimeout(timeout);
            this.ready = raw.status === "ok";
            this.status(this.ready ? "Connected" : "Subscription rejected");
            if (this.ready) this.attempt = 0;
          } else if (
            this.ready &&
            raw.event?.source === "General" &&
            raw.event?.type === "Custom"
          ) {
            const inner =
              typeof raw.data?.data === "string"
                ? JSON.parse(raw.data.data)
                : raw.data;
            this.event(inner);
          }
        } catch {
          this.status("Invalid Streamer.bot event ignored.");
        }
      });
      ws.on("error", () =>
        this.status("Connection failed; check Streamer.bot WebSocket server."),
      );
      ws.on("close", () => {
        clearTimeout(timeout);
        if (generation !== this.generation) return;
        this.ready = false;
        this.status("Reconnecting…");
        this.timer = setTimeout(
          connect,
          Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5)),
        );
      });
    };
    connect();
  }
  request(action: string, args: Record<string, unknown> = {}) {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN)
      throw Error("Connect Streamer.bot first.");
    this.socket.send(
      JSON.stringify({
        request: "DoAction",
        action: { name: action },
        args,
        id: `encore-${Date.now()}`,
      }),
    );
  }
  close() {
    this.generation++;
    clearTimeout(this.timer);
    this.ready = false;
    this.socket?.close();
    this.socket = undefined;
  }
}
