import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { TrackSchema, type Track } from "../src/core/contracts";
export const redirectUri = "http://127.0.0.1:17843/callback";
async function json(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
  if (!res.ok)
    throw Error(
      `Provider returned ${res.status}. ${res.status === 401 ? "Reconnect your account." : res.status === 403 ? "Check API access, quota and Premium requirements." : res.status === 404 ? "The Encore browser player is not ready. Check Spotify connection and DRM support." : "Try again or check the provider dashboard."}`,
    );
  return res.status === 204 ? null : res.json();
}
export class Providers {
  youtubeKey = "";
  clientId = "";
  access = "";
  refresh = "";
  expires = 0;
  private oauth?: { state: string; verifier: string; expires: number };
  private refreshing?: Promise<void>;
  constructor(private persist: () => void) {}
  begin() {
    if (!/^[a-f0-9]{32}$/.test(this.clientId))
      throw Error("Save a valid Spotify Client ID first.");
    const verifier = randomBytes(48).toString("base64url");
    const state = randomBytes(32).toString("hex");
    this.oauth = { state, verifier, expires: Date.now() + 300000 };
    return (
      "https://accounts.spotify.com/authorize?" +
      new URLSearchParams({
        client_id: this.clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        state,
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        scope:
          "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative",
      })
    );
  }
  async callback(url: URL) {
    const pending = this.oauth;
    this.oauth = undefined;
    const state = url.searchParams.get("state") ?? "";
    if (
      !pending ||
      pending.expires < Date.now() ||
      state.length !== pending.state.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))
    )
      throw Error("OAuth state expired or mismatched. Connect again.");
    const code = url.searchParams.get("code");
    if (!code) throw Error("Spotify authorization was declined.");
    await this.token({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pending.verifier,
    });
  }
  private async token(fields: Record<string, string>) {
    const data = await json("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, client_id: this.clientId }),
    });
    if (typeof data.access_token !== "string")
      throw Error("Invalid Spotify token response.");
    this.access = data.access_token;
    this.refresh = data.refresh_token ?? this.refresh;
    this.expires = Date.now() + data.expires_in * 1000;
    this.persist();
  }
  async sdkToken() {
    await this.ensureToken();
    return this.access;
  }
  private async ensureToken() {
    if (!this.access || Date.now() > this.expires - 30000) {
      if (!this.refresh) throw Error("Connect Spotify first.");
      this.refreshing ??= this.token({
        grant_type: "refresh_token",
        refresh_token: this.refresh,
      }).finally(() => {
        this.refreshing = undefined;
      });
      await this.refreshing;
    }
  }
  async spotify(path: string, method = "GET", body?: unknown): Promise<any> {
    await this.ensureToken();
    return json("https://api.spotify.com/v1" + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.access}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  disconnect() {
    this.oauth = undefined;
    this.access = "";
    this.refresh = "";
    this.expires = 0;
    this.persist();
  }
  async youtube(route: string, params: Record<string, string>) {
    if (!this.youtubeKey)
      throw Error("Add and test your YouTube Data API key in Setup.");
    return json(
      "https://www.googleapis.com/youtube/v3/" +
        route +
        "?" +
        new URLSearchParams({ ...params, key: this.youtubeKey }),
    );
  }
  async validateYoutube() {
    await this.youtube("videos", { part: "id", id: "M7lc1UVf-VE" });
  }
  private spotifyTrack(t: any, user: string): Track {
    return TrackSchema.parse({
      source: "spotify",
      coverId: /^https:\/\/i\.scdn\.co\/image\/([a-f0-9]{40,64})$/.exec(
        t.album?.images?.[0]?.url ?? "",
      )?.[1],
      id: t.id,
      title: t.name,
      author: t.artists?.map((a: any) => a.name).join(", "),
      duration: t.duration_ms / 1000,
      user,
    });
  }
  async resolve(input: string, user = "Streamer"): Promise<Track> {
    let url: URL | undefined;
    try {
      url = new URL(input);
    } catch {
      /* title search */
    }
    if (url && url.protocol !== "https:")
      throw Error("Use HTTPS provider links.");
    if (url?.hostname === "open.spotify.com") {
      const match = url.pathname.match(
        /^\/(?:intl-[a-z]+\/)?track\/([a-zA-Z0-9]{22})$/,
      );
      if (!match) throw Error("Paste a Spotify track link.");
      return this.spotifyTrack(await this.spotify("/tracks/" + match[1]), user);
    }
    let id = "";
    if (url) {
      if (
        ["www.youtube.com", "youtube.com", "music.youtube.com"].includes(
          url.hostname,
        )
      )
        id =
          url.searchParams.get("v") ??
          url.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})$/)?.[1] ??
          "";
      else if (url.hostname === "youtu.be") id = url.pathname.slice(1);
      else throw Error("Only YouTube and Spotify links are supported.");
    } else {
      const data = await this.youtube("search", {
        part: "snippet",
        type: "video",
        maxResults: "1",
        q: input,
      });
      id = data.items?.[0]?.id?.videoId ?? "";
    }
    if (!/^[\w-]{11}$/.test(id)) throw Error("No supported track found.");
    const data = await this.youtube("videos", {
      part: "snippet,contentDetails,status",
      id,
    });
    const item = data.items?.[0];
    if (!item || !item.status.embeddable)
      throw Error("This video is unavailable or cannot be embedded.");
    const d = item.contentDetails.duration.match(
      /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/,
    );
    const duration = d
      ? Number(d[1] ?? 0) * 3600 + Number(d[2] ?? 0) * 60 + Number(d[3] ?? 0)
      : 0;
    return TrackSchema.parse({
      source: "youtube",
      id,
      title: item.snippet.title,
      author: item.snippet.channelTitle,
      duration,
      user,
    });
  }
  async playlist(input: string): Promise<Track[]> {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw Error("Paste a YouTube or Spotify playlist URL.");
    }
    if (url.protocol !== "https:") throw Error("Use HTTPS playlist links.");
    const tracks: Track[] = [];
    if (url.hostname === "open.spotify.com") {
      const id = url.pathname.match(
        /^\/(?:intl-[a-z]+\/)?playlist\/([a-zA-Z0-9]{22})$/,
      )?.[1];
      if (!id) throw Error("Invalid Spotify playlist.");
      let offset = 0;
      for (let page = 0; page < 20; page++) {
        const data = await this.spotify(
          `/playlists/${id}/tracks?limit=50&offset=${offset}`,
        );
        for (const entry of data.items ?? [])
          if (entry.track?.id)
            tracks.push(this.spotifyTrack(entry.track, "Auto"));
        if (!data.next) break;
        offset += 50;
      }
      if (!tracks.length) throw Error("Playlist has no accessible tracks.");
      return tracks;
    }
    if (
      !["youtube.com", "www.youtube.com", "music.youtube.com"].includes(
        url.hostname,
      )
    )
      throw Error("Unsupported playlist host.");
    const id = url.searchParams.get("list");
    if (!id || !/^[\w-]{10,100}$/.test(id))
      throw Error("Invalid YouTube playlist.");
    let token = "";
    for (let page = 0; page < 20; page++) {
      const data = await this.youtube("playlistItems", {
        part: "contentDetails",
        playlistId: id,
        maxResults: "50",
        ...(token ? { pageToken: token } : {}),
      });
      for (const entry of data.items ?? []) {
        try {
          tracks.push(
            await this.resolve(
              "https://youtu.be/" + entry.contentDetails.videoId,
              "Auto",
            ),
          );
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "This video is unavailable or cannot be embedded."
          )
            throw error; /* Skip genuinely unavailable videos; quota/network failures abort. */
        }
      }
      token = data.nextPageToken;
      if (!token) break;
    }
    if (!tracks.length) throw Error("Playlist has no accessible tracks.");
    return tracks;
  }
}
