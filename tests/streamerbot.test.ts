import { afterEach, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { StreamerBot, authenticate } from "../desktop/streamerbot";
let server: WebSocketServer | undefined, bot: StreamerBot | undefined;
afterEach(async () => {
  bot?.close();
  if (server) {
    for (const ws of server.clients) ws.terminate();
    await new Promise<void>((r) => server!.close(() => r()));
  }
});
const until = async (check: () => boolean) => {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline)
      throw Error("Timed out waiting for WebSocket lifecycle");
    await new Promise((r) => setTimeout(r, 20));
  }
};
it("authenticates, subscribes once per socket, dispatches nested upstream events and reconnects", async () => {
  server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server!.once("listening", r));
  const port = (server.address() as { port: number }).port;
  const requests: any[] = [],
    events: unknown[] = [],
    statuses: string[] = [];
  let connections = 0,
    last: WebSocket;
  server.on("connection", (ws) => {
    connections++;
    last = ws;
    ws.send(
      JSON.stringify({
        request: "Hello",
        authentication: { salt: "salt", challenge: "challenge" },
      }),
    );
    ws.on("message", (data) => {
      const m = JSON.parse(String(data));
      requests.push(m);
      if (m.request === "Authenticate") {
        expect(m.authentication).toBe(
          authenticate("password", "salt", "challenge"),
        );
        ws.send(JSON.stringify({ id: m.id, status: "ok" }));
      }
      if (m.request === "Subscribe") {
        ws.send(JSON.stringify({ id: m.id, status: "ok" }));
        ws.send(
          JSON.stringify({
            event: { source: "General", type: "Custom" },
            data: {
              data: JSON.stringify({ type: "VOTE_SKIP", user: "Viewer" }),
            },
          }),
        );
      }
    });
  });
  bot = new StreamerBot(
    (s) => statuses.push(s),
    (e) => events.push(e),
  );
  bot.connect(port, "password");
  await until(() => events.length === 1);
  expect(events[0]).toEqual({ type: "VOTE_SKIP", user: "Viewer" });
  bot.request("ChatMessage", { message: "hello" });
  await until(() => requests.some((r) => r.request === "DoAction"));
  last!.close();
  await until(() => events.length === 2);
  expect(connections).toBe(2);
  expect(requests.filter((r) => r.request === "Subscribe")).toHaveLength(2);
  bot.close();
  await new Promise((r) => setTimeout(r, 1100));
  expect(connections).toBe(2);
  expect(statuses).toContain("Reconnecting…");
});
