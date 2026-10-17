import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../desktop/providers";
afterEach(() => vi.unstubAllGlobals());
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
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
