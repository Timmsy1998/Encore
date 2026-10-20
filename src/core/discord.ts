import { TrackSchema, type Snapshot } from "./contracts";

export const discordApplicationId = "1562085890510159892";
export const latestReleaseUrl = "https://github.com/Timmsy1998/Encore/releases/latest";
export const encoreArtwork = "https://raw.githubusercontent.com/Timmsy1998/Encore/main/public/icon.png";
export type DiscordActivity = {
  type: 2;
  details: string;
  state: string;
  timestamps?: { start: number; end: number };
  assets?: { large_image: string; large_text: string; small_image?: string; small_text?: string };
  buttons: { label: string; url: string }[];
};
type PresenceState = Pick<Snapshot, "current" | "playing" | "progress" | "settings">;
// Discord text limits are byte limits. Never publish requester or account data.
function text(value: string) {
  let result = "";
  for (const char of value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()) {
    if (new TextEncoder().encode(result + char).length > 128) break;
    result += char;
  }
  return result || "Unknown artist";
}
export function discordActivity(state: PresenceState, now = Date.now()): DiscordActivity | null {
  if (!state.settings.discordEnabled || (!state.playing && !state.settings.discordShowPaused)) return null;
  const parsed = TrackSchema.safeParse(state.current);
  if (!parsed.success) return null;
  const track = parsed.data;
  const provider = track.source === "spotify" ? "Spotify" : "YouTube";
  const url = track.source === "spotify"
    ? `https://open.spotify.com/track/${track.id}`
    : `https://www.youtube.com/watch?v=${track.id}`;
  const image = track.source === "youtube"
    ? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`
    : track.coverId ? `https://i.scdn.co/image/${track.coverId}` : encoreArtwork;
  const activity: DiscordActivity = {
    type: 2,
    details: text(track.title),
    state: text(`${state.playing ? "" : "Paused · "}${track.author || "Unknown artist"} · ${provider}`),
    buttons: [{ label: `Open on ${provider}`, url }],
  };
  if (state.settings.discordDownloadButton) activity.buttons.push({ label: "Download Encore", url: latestReleaseUrl });
  if (state.settings.discordArtwork) activity.assets = {
    large_image: image, large_text: text(`${track.title} · ${track.author}`),
    small_image: encoreArtwork, small_text: `Encore · ${state.playing ? "Listening" : "Paused"} on ${provider}`,
  };
  const sample = state.progress;
  if (state.playing && sample?.active && Number.isFinite(sample.position) && Number.isFinite(sample.observedAt)) {
    const position = Math.min(track.duration, Math.max(0, sample.position + Math.min(3, Math.max(0, now - sample.observedAt) / 1000)));
    const start = Math.floor(now / 1000 - position);
    activity.timestamps = { start, end: start + Math.ceil(track.duration) };
  }
  return activity;
}
