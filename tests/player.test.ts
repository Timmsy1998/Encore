import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { expect, it, vi } from "vitest";

async function player() {
  const events: any[] = [];
  let stream: any;
  let sample!: () => void;
  let failedEndings = 0;
  let model: any = {
    current: { source: "youtube", id: "youtube001" },
    playing: true,
    generation: 1,
    trackGeneration: 1,
    volume: 70,
    spotifyConnected: true,
  };
  const yt = {
    pauseVideo: vi.fn(),
    cueVideoById: vi.fn(),
    loadVideoById: vi.fn(),
    playVideo: vi.fn(),
    setVolume: vi.fn(),
    seekTo: vi.fn(),
    getVideoData: vi.fn(() => ({ video_id: model.current.id })),
    getCurrentTime: vi.fn(() => 180),
    getPlayerState: vi.fn(() => 1),
  };
  let youtubeEvents: any;
  const listeners: Record<string, (...args: any[]) => void> = {};
  const sdk = {
    pause: vi.fn(async () => {}),
    seek: vi.fn(async () => {}),
    setVolume: vi.fn(async () => {}),
    connect: vi.fn(async () => true),
    disconnect: vi.fn(),
    getCurrentState: vi.fn(async (): Promise<any> => null),
    addListener: (name: string, fn: any) => {
      listeners[name] = fn;
    },
  };
  const context: any = {
    URLSearchParams,
    setTimeout,
    clearTimeout,
    Date,
    setInterval: (callback: () => void) => { sample = callback; return 1; },
    clearInterval: () => {},
    document: {
      querySelector: () => ({ textContent: "" }),
      body: { classList: { toggle: () => {} } },
    },
    location: { search: "?token=test", origin: "http://127.0.0.1:17843" },
    addEventListener: () => {},
    fetch: async (path: string, options: any) => {
      if (path === "/player-event") {
        const event = JSON.parse(options.body);
        events.push(event);
        if (event.event === "ended" && failedEndings > 0) {
          failedEndings--;
          throw Error("Temporary loopback failure");
        }
      }
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
        youtubeEvents = options.events;
        queueMicrotask(() => options.events.onReady());
        return yt;
      },
    },
    Spotify: {
      Player: function () {
        return { ...sdk };
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
    seek: (key: string, generation: number, position: number) => context.encoreSeek(key, generation, position),
    reconnect: () => context.encoreReconnectSpotify(),
    yt,
    youtubeEvents,
    sample,
    failNextEnding: () => { failedEndings++; },
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
  expect(p.yt.loadVideoById).toHaveBeenCalledExactlyOnceWith("youtube001");
  expect(p.yt.cueVideoById).not.toHaveBeenCalled();
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
  expect(p.yt.loadVideoById).toHaveBeenLastCalledWith("youtube002");
  expect(p.yt.loadVideoById).toHaveBeenCalledTimes(2);
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

it("resumes without reloading, restarts repeated tracks, and surfaces autoplay blocking", async () => {
  const p = await player();
  const state = { current: { source: "youtube", id: "youtube001" }, volume: 70, spotifyConnected: true, trackGeneration: 1, generation: 2, playing: false };
  await p.change(state);
  const loads = p.yt.loadVideoById.mock.calls.length;
  await p.change({ ...state, generation: 3, playing: true });
  expect(p.yt.playVideo).toHaveBeenCalledTimes(1);
  expect(p.yt.loadVideoById).toHaveBeenCalledTimes(loads);
  await p.change({ ...state, generation: 3, playing: true, volume: 25 });
  expect(p.yt.playVideo).toHaveBeenCalledTimes(1);
  await p.change({ ...state, generation: 4, trackGeneration: 2, playing: true });
  expect(p.yt.loadVideoById).toHaveBeenCalledTimes(loads + 1);
  p.youtubeEvents.onAutoplayBlocked();
  await p.flush();
  expect(p.events).toContainEqual(expect.objectContaining({ event: "error", generation: 4, message: expect.stringContaining("autoplay was blocked") }));
});

it("recovers a missed YouTube end event and reports each rotation only once", async () => {
  const p = await player();
  p.sample();
  p.yt.getPlayerState.mockReturnValue(0);
  p.sample();
  p.sample();
  await p.flush();
  expect(p.events.filter(e => e.event === "ended")).toHaveLength(1);
  p.youtubeEvents.onStateChange({ data: 0 });
  await p.flush();
  expect(p.events.filter(e => e.event === "ended")).toEqual([
    expect.objectContaining({ key: "youtube:youtube001", generation: 1 }),
  ]);
  // A one-track shuffled rotation must load and finish the same ID again.
  await p.change({ current: { source: "youtube", id: "youtube001" }, playing: true,
    generation: 2, trackGeneration: 2, volume: 70, spotifyConnected: true });
  // The old ended state may linger until the iframe starts the new load.
  p.sample();
  expect(p.events.filter(e => e.event === "ended")).toHaveLength(1);
  p.yt.getPlayerState.mockReturnValue(1);
  p.sample();
  p.yt.getPlayerState.mockReturnValue(0);
  p.sample();
  await p.flush();
  expect(p.yt.loadVideoById).toHaveBeenCalledTimes(2);
  expect(p.events.filter(e => e.event === "ended")).toHaveLength(2);
});

it("does not treat paused, buffering, cued or stale YouTube samples as endings", async () => {
  const p = await player();
  for (const value of [-1, 1, 2, 3, 5]) {
    p.yt.getPlayerState.mockReturnValue(value);
    p.sample();
  }
  p.yt.getPlayerState.mockReturnValue(0);
  p.yt.getVideoData.mockReturnValue({ video_id: "oldvideo001" });
  p.sample();
  p.youtubeEvents.onStateChange({ data: 0 });
  p.yt.getVideoData.mockReturnValue({ video_id: "youtube001" });
  await p.change({ current: { source: "youtube", id: "youtube001" }, playing: false,
    generation: 1, trackGeneration: 1, volume: 70, spotifyConnected: true });
  p.sample();
  p.youtubeEvents.onStateChange({ data: 0 });
  await p.flush();
  expect(p.events.filter(e => e.event === "ended")).toHaveLength(0);
});

it("advances YouTube through its normal end callback without waiting for a sample", async () => {
  const p = await player();
  p.youtubeEvents.onStateChange({ data: 1 });
  p.youtubeEvents.onStateChange({ data: 0 });
  p.youtubeEvents.onStateChange({ data: 0 });
  await p.flush();
  expect(p.events.filter(e => e.event === "ended")).toEqual([
    expect.objectContaining({ key: "youtube:youtube001", generation: 1 }),
  ]);
});

for (const source of ["youtube", "spotify"]) {
  it(`retries a failed ${source} completion and stops after delivery`, async () => {
    const p = await player();
    p.failNextEnding();
    if (source === "youtube") {
      p.youtubeEvents.onStateChange({ data: 1 });
      p.youtubeEvents.onStateChange({ data: 0 });
    } else {
      await p.change({ current: { source, id: "spotify001" }, playing: true,
        generation: 2, trackGeneration: 2, volume: 70, spotifyConnected: true });
      const sample = (paused: boolean, position: number) => ({ paused, position, duration: 10000,
        track_window: { current_track: { id: "spotify001" } } });
      p.listeners.player_state_changed(sample(false, 9900));
      p.listeners.player_state_changed(sample(true, 0));
      // Isolate the retry timer from further provider state observations.
      p.sdk.getCurrentState = vi.fn(async () => null);
    }
    await p.flush();
    expect(p.events.filter(e => e.event === "ended")).toHaveLength(1);
    p.sample();
    await p.flush();
    expect(p.events.filter(e => e.event === "ended")).toHaveLength(2);
    p.sample();
    await p.flush();
    expect(p.events.filter(e => e.event === "ended")).toHaveLength(2);
  });
}

it("discards failed completions after playback changes", async () => {
  const p = await player();
  p.failNextEnding();
  p.youtubeEvents.onStateChange({ data: 1 });
  p.youtubeEvents.onStateChange({ data: 0 });
  await p.flush();
  await p.change({ current: { source: "youtube", id: "youtube002" }, playing: true,
    generation: 2, trackGeneration: 2, volume: 70, spotifyConnected: true });
  p.sample();
  await p.flush();
  expect(p.events.filter(e => e.event === "ended")).toHaveLength(1);
  p.youtubeEvents.onStateChange({ data: 0 });
  await p.flush();
  expect(p.events.filter(e => e.event === "ended")).toHaveLength(2);
  expect(p.events.filter(e => e.event === "ended")[1]).toMatchObject({
    key: "youtube:youtube002", generation: 2,
  });
});

it("recreates an offline Spotify device and waits until its ready report reaches main", async () => {
  const p = await player();
  const oldReady = p.listeners.ready;
  const oldOffline = p.listeners.not_ready;
  const reconnect = p.reconnect();
  await p.flush();
  expect(p.sdk.disconnect).toHaveBeenCalledTimes(1);
  expect(p.sdk.connect).toHaveBeenCalledTimes(2);
  // Callbacks queued by the old SDK must not overwrite the replacement device.
  oldReady({ device_id: "stale-device" });
  oldOffline();
  await p.flush();
  expect(p.events.some(e => e.device === "stale-device")).toBe(false);
  await p.listeners.ready({ device_id: "fresh-device" });
  await reconnect;
  expect(p.events).toContainEqual(expect.objectContaining({ event: "ready", device: "fresh-device" }));
});

it("bounds Spotify reconnection and allows another attempt after timeout", async () => {
  vi.useFakeTimers();
  try {
    const p = await player();
    p.sdk.connect.mockImplementationOnce(() => new Promise<boolean>(() => {}));
    const reconnect = p.reconnect();
    const failure = expect(reconnect).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(15000);
    await failure;
    const retry = p.reconnect();
    await p.flush();
    await p.listeners.ready({ device_id: "retry-device" });
    await retry;
  } finally {
    vi.useRealTimers();
  }
});


it("seeks only the matching provider track and generation and rejects invalid positions", async () => {
  const p = await player();
  await p.change({ current: { source: "youtube", id: "youtube001", duration: 180 }, generation: 2, trackGeneration: 1, playing: true, volume: 70, spotifyConnected: true });
  expect(await p.seek("youtube:youtube001", 1, 30)).toBe(false);
  expect(await p.seek("youtube:different1", 2, 30)).toBe(false);
  expect(await p.seek("youtube:youtube001", 2, -1)).toBe(false);
  expect(await p.seek("youtube:youtube001", 2, 181)).toBe(false);
  expect(await p.seek("youtube:youtube001", 2, NaN)).toBe(false);
  expect(p.yt.seekTo).not.toHaveBeenCalled();
  expect(await p.seek("youtube:youtube001", 2, 30)).toBe(true);
  expect(p.yt.seekTo).toHaveBeenCalledExactlyOnceWith(30, true);
  await p.change({ current: { source: "spotify", id: "spotify001", duration: 180 }, generation: 3, playing: true, volume: 70, spotifyConnected: true });
  await p.listeners.ready({ device_id: "encore-device" });
  expect(await p.seek("youtube:youtube001", 2, 30)).toBe(false);
  p.sdk.getCurrentState.mockResolvedValue({ track_window: { current_track: { id: "different" } } });
  expect(await p.seek("spotify:spotify001", 3, 42)).toBe(false);
  p.sdk.getCurrentState.mockResolvedValue({ track_window: { current_track: { id: "spotify001" } } });
  expect(await p.seek("spotify:spotify001", 3, 42)).toBe(true);
  expect(p.sdk.seek).toHaveBeenCalledExactlyOnceWith(42000);
  p.listeners.not_ready({ device_id: "encore-device" });
  expect(await p.seek("spotify:spotify001", 3, 42)).toBe(false);
});
