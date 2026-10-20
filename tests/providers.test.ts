import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers, ProviderHttpError } from "../desktop/providers";
import { playSpotify } from "../desktop/spotify-playback";
afterEach(() => vi.unstubAllGlobals());
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
describe("YouTube credential status", () => {
  it("distinguishes configured keys from verification and keeps verification when the same key is saved", async () => {
    const changed = vi.fn();
    const p = new Providers(() => {}, changed);
    expect(p.youtubeStatus).toBe("Not configured");
    p.youtubeKey = "  saved-key  ";
    expect(p.youtubeKey).toBe("saved-key");
    expect(p.youtubeStatus).toContain("Key configured");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ items: [] })));
    await p.youtube("videos", { part: "id", id: "M7lc1UVf-VE" });
    expect(p.youtubeStatus).toContain("API verified");
    p.youtubeKey = "saved-key";
    expect(p.youtubeStatus).toContain("API verified");
    expect(changed).toHaveBeenCalledTimes(2);
    p.youtubeKey = "replacement";
    expect(p.youtubeStatus).toContain("API check pending");
    p.youtubeKey = "";
    expect(p.youtubeStatus).toBe("Not configured");
  });
  it("shows failed requests and recovers when the same key works again", async () => {
    const p = new Providers(() => {});
    p.youtubeKey = "saved-key";
    const fetch = vi.fn().mockResolvedValueOnce(reply({}, 403)).mockResolvedValueOnce(reply({ items: [] }));
    vi.stubGlobal("fetch", fetch);
    await expect(p.validateYoutube()).rejects.toThrow("403");
    expect(p.youtubeStatus).toContain("API request failed");
    expect(p.youtubeKey).toBe("saved-key");
    await p.validateYoutube();
    expect(p.youtubeStatus).toContain("API verified");
  });
  it("does not verify a replacement key from a previous key's in-flight request", async () => {
    const p = new Providers(() => {});
    p.youtubeKey = "old-key";
    let complete!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })));
    const request = p.validateYoutube();
    p.youtubeKey = "replacement";
    complete(reply({ items: [] }));
    await request;
    expect(p.youtubeStatus).toContain("API check pending");
  });
});
describe("Spotify playback acknowledgements", () => {
  const connected = () => {
    const providers = new Providers(() => {});
    providers.access = "test-access";
    providers.expires = Date.now() + 3600000;
    return providers;
  };
  it.each([
    [204, null],
    [200, ""],
    [200, "H1teI2ygNu-opaque-acknowledgement"],
    [202, "accepted"],
  ] as const)("allows playback state to advance after HTTP %s acknowledgements", async (status, body) => {
    const providers = connected();
    const fetch = vi.fn().mockImplementation(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", fetch);
    const reconnect = vi.fn();
    // Exercise both initial play and resume through the same provider path as main.
    for (const payload of [{ uris: ["spotify:track:" + "a".repeat(22)] }, undefined]) {
      await expect(playSpotify(
        () => "encore-device",
        reconnect,
        device => providers.spotify(`/me/player/play?device_id=${device}`, "PUT", payload, "none"),
      )).resolves.toBeUndefined();
    }
    expect(reconnect).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe("https://api.spotify.com/v1/me/player/play?device_id=encore-device");
    expect(fetch.mock.calls[1][1].body).toBeUndefined();
  });
  it.each([401, 403, 404, 429, 500])("preserves HTTP %s failures without exposing the response body", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-response-body", { status })));
    const result = connected().spotify("/me/player/play?device_id=encore-device", "PUT", undefined, "none");
    await expect(result).rejects.toBeInstanceOf(ProviderHttpError);
    await expect(result).rejects.toMatchObject({ status });
    await expect(result).rejects.not.toThrow("private-response-body");
  });
  it("still requires JSON for metadata and sanitises parse errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-response-body")));
    await expect(connected().spotify("/tracks/" + "a".repeat(22)))
      .rejects.toThrow("Provider returned an invalid JSON response. Try again.");
  });
});
describe("provider authentication and input boundaries", () => {
  it("uses one-use PKCE and refuses callbacks with the wrong state", async () => {
    const p = new Providers(() => {});
    p.clientId = "a".repeat(32);
    const auth = new URL(p.begin());
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(auth.searchParams.has("client_secret")).toBe(false);
    const fetch = vi.fn().mockResolvedValue(
      reply({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await p.callback(
      new URL(
        "http://127.0.0.1:17843/callback?code=code&state=" +
          auth.searchParams.get("state"),
      ),
    );
    const body = fetch.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("code_verifier")?.length).toBeGreaterThan(43);
    expect(body.has("client_secret")).toBe(false);
    await expect(
      p.callback(
        new URL(
          "http://127.0.0.1:17843/callback?code=code&state=" +
            auth.searchParams.get("state"),
        ),
      ),
    ).rejects.toThrow("state");
    p.begin();
    await expect(
      p.callback(new URL("http://127.0.0.1:17843/callback?state=bad")),
    ).rejects.toThrow("state");
  });
  it("shares concurrent token refreshes and exposes only an access token to the SDK", async () => {
    const p = new Providers(() => {});
    p.refresh = "refresh";
    const fetch = vi
      .fn()
      .mockResolvedValue(
        reply({ access_token: "new-access", expires_in: 3600 }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await Promise.all([p.sdkToken(), p.sdkToken()])).toEqual([
      "new-access",
      "new-access",
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    p.disconnect();
    await expect(p.sdkToken()).rejects.toThrow("Connect Spotify");
  });
  it("validates provider hosts before making network requests", async () => {
    const p = new Providers(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const url of [
      "http://youtube.com/watch?v=M7lc1UVf-VE",
      "https://open.spotify.com.evil.test/track/foo",
      "file:///etc/passwd",
    ])
      await expect(p.resolve(url)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unavailable videos and does not expose provider error bodies", async () => {
    const p = new Providers(() => {});
    p.youtubeKey = "secret";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          reply({ items: [{ status: { embeddable: false } }] }),
        ),
    );
    await expect(p.resolve("https://youtu.be/M7lc1UVf-VE")).rejects.toThrow(
      "unavailable",
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(reply({ secret: "private upstream response" }, 403)),
    );
    await expect(p.validateYoutube()).rejects.toThrow("403");
    await expect(p.validateYoutube()).rejects.not.toThrow("private upstream");
  });
});

describe("playlist imports", () => {
  const playlist = "https://open.spotify.com/playlist/" + "a".repeat(22);
  const track = {
    id: "b".repeat(22),
    type: "track",
    name: "Song",
    artists: [{ name: "Artist" }],
    duration_ms: 180000,
  };
  function spotify() {
    const p = new Providers(() => {});
    p.access = "access";
    p.expires = Date.now() + 3600000;
    return p;
  }
  it("reads current Spotify items across pages and accepts legacy track fields", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply({ items: [{ item: track }], next: "next" }))
      .mockResolvedValueOnce(reply({
        items: [{ track: { ...track, id: "c".repeat(22) } }], next: null,
      }));
    vi.stubGlobal("fetch", fetch);
    const tracks = await spotify().playlist(playlist);
    expect(tracks.map(t => t.id)).toEqual([track.id, "c".repeat(22)]);
    expect(tracks[0]).toMatchObject({ source: "spotify", title: "Song", duration: 180, user: "Auto" });
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      `https://api.spotify.com/v1/playlists/${"a".repeat(22)}/items?limit=50&offset=0`,
      `https://api.spotify.com/v1/playlists/${"a".repeat(22)}/items?limit=50&offset=50`,
    ]);
  });
  it("skips removed, local, unplayable and non-track items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ items: [
      null, { item: null, track }, { item: { ...track, type: "episode" } },
      { item: { ...track, is_local: true } }, { item: track, is_local: true },
      { item: { ...track, is_playable: false } }, { item: track },
    ] })));
    expect(await spotify().playlist(playlist)).toHaveLength(1);
  });
  it.each([403, 404])("explains Spotify playlist access on HTTP %s without exposing bodies", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ secret: "private upstream" }, status)));
    await expect(spotify().playlist(playlist)).rejects.toThrow("owns or collaborates");
    await expect(spotify().playlist(playlist)).rejects.not.toThrow("private upstream");
  });
  it.each([401, 429, 500])("preserves other provider errors on HTTP %s", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({}, status)));
    await expect(spotify().playlist(playlist)).rejects.toThrow(`Provider returned ${status}`);
  });
  it("rejects malformed and empty Spotify playlist responses", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply({})).mockResolvedValueOnce(reply({ items: [] }));
    vi.stubGlobal("fetch", fetch);
    await expect(spotify().playlist(playlist)).rejects.toThrow("invalid playlist response");
    await expect(spotify().playlist(playlist)).rejects.toThrow("no accessible tracks");
  });
  it("imports YouTube playlists while skipping inaccessible videos", async () => {
    const p = new Providers(() => {});
    p.youtubeKey = "test-key";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(reply({ items: [
        { contentDetails: { videoId: "M7lc1UVf-VE" } },
        { contentDetails: { videoId: "abcdefghijk" } },
      ] }))
      .mockResolvedValueOnce(reply({ items: [{ id: "abcdefghijk", status: { embeddable: true },
        snippet: { title: "Video", channelTitle: "Channel" },
        contentDetails: { duration: "PT3M" },
      }] })));
    expect(await p.playlist("https://www.youtube.com/playlist?list=PLabcdefghijk"))
      .toEqual([expect.objectContaining({ id: "abcdefghijk", source: "youtube", duration: 180 })]);
  });
  it("batches YouTube metadata, preserves playlist order and skips live streams", async () => {
    const p = new Providers(() => {});
    p.youtubeKey = "test-key";
    const video = (id: string, duration = "PT3M") => ({ id, status: { embeddable: true },
      snippet: { title: id, channelTitle: "Channel" }, contentDetails: { duration } });
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply({ items: ["abcdefghijk", "live0000000", "M7lc1UVf-VE"].map(videoId => ({ contentDetails: { videoId } })), nextPageToken: "page2" }))
      .mockResolvedValueOnce(reply({ items: [video("M7lc1UVf-VE"), video("live0000000", "P0D"), video("abcdefghijk")] }))
      .mockResolvedValueOnce(reply({ items: [{ contentDetails: { videoId: "abcdefghijk" } }] }))
      .mockResolvedValueOnce(reply({ items: [video("abcdefghijk")] }));
    vi.stubGlobal("fetch", fetch);
    expect((await p.playlist("https://music.youtube.com/playlist?list=PLabcdefghijk")).map(t => t.id))
      .toEqual(["abcdefghijk", "M7lc1UVf-VE", "abcdefghijk"]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("id")).toBe("abcdefghijk,live0000000,M7lc1UVf-VE");
    expect(new URL(fetch.mock.calls[2][0]).searchParams.get("pageToken")).toBe("page2");
  });
  it("aborts YouTube imports on quota errors instead of treating them as unavailable videos", async () => {
    const p = new Providers(() => {});
    p.youtubeKey = "test-key";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(reply({ items: [{ contentDetails: { videoId: "abcdefghijk" } }] }))
      .mockResolvedValueOnce(reply({ secret: "hidden" }, 403)));
    await expect(p.playlist("https://youtube.com/playlist?list=PLabcdefghijk")).rejects.toThrow("403");
  });

});

describe("request search preference", () => {
  const spotifySong = {
    id: "b".repeat(22),
    type: "track",
    name: "Song",
    artists: [{ name: "Artist" }],
    duration_ms: 180000,
  };
  const video = (
    id: string,
    title: string,
    channelTitle = "Artist",
    description = "",
    embeddable = true,
  ) => ({
    id,
    snippet: { title, channelTitle, description },
    status: { embeddable },
    contentDetails: { duration: "PT3M" },
  });
  function setup(connected = true) {
    const p = new Providers(() => {});
    p.youtubeKey = "key";
    if (connected) {
      p.access = "access";
      p.expires = Date.now() + 3600000;
    }
    return p;
  }
  function youtubeResults(items: ReturnType<typeof video>[]) {
    return [
      reply({ items: items.map(({ id }) => ({ id: { videoId: id } })) }),
      // Metadata order is not guaranteed to match search order.
      reply({ items: [...items].reverse() }),
    ];
  }
  it("returns choices from both services and filters unavailable tracks", async () => {
    const p = setup();
    vi.spyOn(p, "spotify").mockResolvedValue({ tracks: { items: [spotifySong, { ...spotifySong, is_playable: false }] } });
    vi.spyOn(p, "youtube").mockImplementation(async route => route === "search"
      ? { items: [{ id: { videoId: "video000001" } }, { id: { videoId: "hidden00001" } }] }
      : { items: [video("video000001", "Song video"), video("hidden00001", "Hidden", "Artist", "", false)] });
    const result = await p.searchSongs("Artist Song");
    expect(result.tracks.map(track => track.source)).toEqual(["spotify", "youtube"]);
    expect(result.warnings).toEqual([]);
    expect(p.spotify).toHaveBeenCalledWith(expect.stringContaining("q=Artist+Song"));
    expect(p.youtube).toHaveBeenCalledWith("search", expect.objectContaining({ q: "Artist Song" }));
  });
  it.each(["spotify", "youtube"] as const)("keeps results when %s fails", async failed => {
    const p = setup();
    vi.spyOn(p, "spotify").mockImplementation(async () => {
      if (failed === "spotify") throw Error("Reconnect your account.");
      return { tracks: { items: [spotifySong] } };
    });
    vi.spyOn(p, "youtube").mockImplementation(async route => {
      if (failed === "youtube") throw Error("Quota exhausted.");
      return route === "search" ? { items: [{ id: { videoId: "video000001" } }] } : { items: [video("video000001", "Song")] };
    });
    const result = await p.searchSongs("Artist Song");
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].source).not.toBe(failed);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(failed === "spotify" ? "Spotify:" : "YouTube:");
  });
  it("reports both unavailable services without inventing results", async () => {
    const p = new Providers(() => {});
    expect(await p.searchSongs("Song")).toEqual({ tracks: [], warnings: [
      "Spotify: Connect Spotify first.", "YouTube: Add and test your YouTube Data API key in Setup.",
    ] });
  });
  it("prefers Spotify and safely encodes the entire title query", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        reply({
          tracks: {
            items: [{ ...spotifySong, is_playable: false }, spotifySong],
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await setup().resolve("Artist & Song #1", "Viewer")).toMatchObject({
      source: "spotify",
      user: "Viewer",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/search");
    expect(url.searchParams.get("q")).toBe("Artist & Song #1");
    expect(url.searchParams.get("type")).toBe("track");
  });
  it("falls back from unavailable Spotify results to artist Topic audio before videos", async () => {
    const items = [
      video("video000001", "Song (Official Music Video)"),
      video("audio000001", "Song (Official Audio)"),
      video("topic000001", "Song", "Artist - Topic"),
    ];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        reply({ tracks: { items: [{ ...spotifySong, is_playable: false }] } }),
      );
    for (const response of youtubeResults(items))
      fetch.mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetch);
    expect(await setup().resolve("Artist Song")).toMatchObject({
      source: "youtube",
      id: "topic000001",
    });
    const search = new URL(fetch.mock.calls[1][0]);
    expect(search.searchParams.get("videoEmbeddable")).toBe("true");
    expect(search.searchParams.get("videoSyndicated")).toBe("true");
  });
  it.each([
    [
      "official audio",
      [
        video("video000001", "Song Official Video"),
        video("audio000001", "Song Official Audio"),
      ],
      "audio000001",
    ],
    [
      "auto-generated release",
      [
        video("video000001", "Song Music Video"),
        video(
          "audio000001",
          "Song",
          "Artist",
          "Provided to YouTube by Label\nSong",
        ),
      ],
      "audio000001",
    ],
    [
      "video fallback",
      [
        video("topic000001", "Song", "Artist - Topic", "", false),
        video("video000001", "Song Music Video"),
      ],
      "video000001",
    ],
    [
      "original relevance order",
      [video("video000001", "Song"), video("video000002", "Song live")],
      "video000001",
    ],
  ] as const)(
    "uses %s without Spotify connected",
    async (_label, items, expected) => {
      const fetch = vi.fn();
      for (const response of youtubeResults([...items]))
        fetch.mockResolvedValueOnce(response);
      vi.stubGlobal("fetch", fetch);
      expect((await setup(false).resolve("Artist Song")).id).toBe(expected);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    "https://youtu.be/video000001",
    "https://music.youtube.com/watch?v=video000001",
  ])("preserves explicit YouTube selection: %s", async (url) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        reply({ items: [video("video000001", "Song Music Video")] }),
      );
    vi.stubGlobal("fetch", fetch);
    expect((await setup().resolve(url)).id).toBe("video000001");
    expect(new URL(fetch.mock.calls[0][0]).pathname).toContain("/videos");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves explicit Spotify selection", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(spotifySong));
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await setup().resolve(
          "https://open.spotify.com/track/" + spotifySong.id,
        )
      ).source,
    ).toBe("spotify");
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe(
      "/v1/tracks/" + spotifySong.id,
    );
  });
  it("reports Spotify failures rather than silently changing service", async () => {
    const fetch = vi.fn().mockResolvedValue(reply({}, 401));
    vi.stubGlobal("fetch", fetch);
    await expect(setup().resolve("Artist Song")).rejects.toThrow(
      "Reconnect your account",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reports empty and unplayable YouTube searches", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply({ items: [] }));
    vi.stubGlobal("fetch", fetch);
    await expect(setup(false).resolve("No results")).rejects.toThrow(
      "No supported track",
    );
    for (const response of youtubeResults([
      video("video000001", "Unavailable", "Artist", "", false),
    ]))
      fetch.mockResolvedValueOnce(response);
    await expect(setup(false).resolve("Unavailable")).rejects.toThrow(
      "No playable track",
    );
  });
});
