import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { expect, it, vi } from "vitest";

async function player() {
  const events: any[] = [];
  let stream: any;
  let model: any = {
    current: { source: "youtube", id: "youtube001" },
    playing: true,
    generation: 1,
    volume: 70,
    spotifyConnected: true,
  };
  const yt = {
    pauseVideo: vi.fn(),
    cueVideoById: vi.fn(),
    playVideo: vi.fn(),
    setVolume: vi.fn(),
    getVideoData: () => ({ video_id: model.current.id }),
  };
  const listeners: Record<string, (...args: any[]) => void> = {};
  const sdk = {
    pause: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    connect: vi.fn(async () => true),
    disconnect: vi.fn(),
    addListener: (name: string, fn: any) => {
      listeners[name] = fn;
    },
  };
  const context: any = {
    URLSearchParams,
    Date,
    setInterval: () => 1,
    clearInterval: () => {},
    document: {
      querySelector: () => ({ textContent: "" }),
      body: { classList: { toggle: () => {} } },
    },
    location: { search: "?token=test", origin: "http://127.0.0.1:17843" },
    addEventListener: () => {},
    fetch: async (path: string, options: any) => {
      if (path === "/player-event") events.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => model };
    },
    EventSource: class {
      constructor() {
        // Retain the fake event stream so the test can deliver state changes.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        stream = this;
      }
    },
    YT: {
      Player: function (_: string, options: any) {
        queueMicrotask(() => options.events.onReady());
        return yt;
      },
    },
    Spotify: {
      Player: function () {
        return sdk;
      },
    },
  };
  context.window = context;
  createContext(context);
  runInContext(readFileSync("public/player.js", "utf8"), context);
  context.onYouTubeIframeAPIReady();
  context.onSpotifyWebPlaybackSDKReady();
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  await flush();
  return {
    yt,
    sdk,
    listeners,
    events,
    flush,
    change: async (next: any) => {
      model = next;
      stream.onmessage();
      await flush();
    },
  };
}
it("switches providers using one playback intent and pauses the other source", async () => {
  const p = await player();
  expect(p.yt.playVideo).toHaveBeenCalledTimes(1);
  await p.change({
    current: { source: "spotify", id: "spotify001" },
    playing: true,
    generation: 2,
    volume: 40,
    spotifyConnected: true,
  });
  expect(p.yt.pauseVideo).toHaveBeenCalled();
  expect(p.sdk.setVolume).toHaveBeenLastCalledWith(0.4);
  await p.change({
    current: { source: "youtube", id: "youtube002" },
    playing: true,
    generation: 3,
    volume: 40,
    spotifyConnected: true,
  });
  expect(p.sdk.pause).toHaveBeenCalledTimes(1);
  expect(p.yt.cueVideoById).toHaveBeenLastCalledWith("youtube002");
  expect(p.yt.playVideo).toHaveBeenCalledTimes(2);
});
it("deduplicates Spotify endings and discards a completion after a provider switch", async () => {
  const p = await player();
  const spotify = {
    current: { source: "spotify", id: "spotify001" },
    playing: true,
    generation: 2,
    volume: 70,
    spotifyConnected: true,
  };
  await p.change(spotify);
  const sample = (paused: boolean, position: number) => ({
    paused,
    position,
    duration: 10000,
    track_window: { current_track: { id: "spotify001" } },
  });
  p.listeners.player_state_changed(sample(false, 9900));
  p.listeners.player_state_changed(sample(true, 0));
  p.listeners.player_state_changed(sample(true, 0));
  await p.flush();
  expect(p.events.filter((e) => e.event === "ended")).toHaveLength(1);
  await p.change({ ...spotify, generation: 3 });
  let resolvePause!: () => void;
  p.sdk.pause.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        resolvePause = resolve;
      }),
  );
  p.listeners.player_state_changed(sample(false, 9900));
  p.listeners.player_state_changed(sample(true, 0));
  await p.change({
    ...spotify,
    current: { source: "youtube", id: "youtube002" },
    generation: 4,
  });
  resolvePause();
  await p.flush();
  expect(p.events.filter((e) => e.event === "ended")).toHaveLength(1);
});
