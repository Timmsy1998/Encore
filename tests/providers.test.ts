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
