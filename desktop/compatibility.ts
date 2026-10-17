export const requiredFeatures = [
  "IMPORT_DIAGNOSTICS",
  "CHAT_MESSAGE",
  "SONG_REQUEST_SETTINGS",
  "NOW_PLAYING_WIDGET_STATE",
  "VOTE_SKIP",
  "WHEN_SONG",
  "QUEUE_SONGS",
  "CHANNEL_POINT_REWARD_TRIGGER",
  "KICK_CHANNEL_REWARD_TRIGGER",
  "MULTI_CHAT_SOURCE",
  "SPOTIFY_TRACK_REQUEST",
];
export function importDiagnostics(event: Record<string, unknown>) {
  const version = String(
    event.version ?? event.importVersion ?? "unknown",
  ).slice(0, 30);
  const features = new Set(
    Array.isArray(event.features)
      ? event.features.filter((x) => typeof x === "string")
      : [],
  );
  const missing = requiredFeatures.filter((x) => !features.has(x));
  if (version !== "1.1.0") missing.unshift("version 1.1.0");
  return missing.length
    ? `Import ${version} · missing: ${missing.join(", ")}. Reimport supplied actions.`
    : `Import ${version} · all required capabilities reported. Review command permissions in Streamer.bot.`;
}
export function requestVolume(current: number, event: Record<string, unknown>) {
  const mode = event.mode ?? "set";
  if (mode === "get") return current;
  const value = Number(event.value ?? event.volume ?? event.input);
  if (!["set", "add", "sub"].includes(String(mode)) || !Number.isFinite(value))
    throw Error("Invalid volume command.");
  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        mode === "add"
          ? current + value
          : mode === "sub"
            ? current - value
            : value,
      ),
    ),
  );
}
export function chatTarget(
  event: Record<string, unknown>,
): Record<string, string> {
  const source = String(
    event.chatSource ??
      event.platform ??
      event.eventSource ??
      event.source ??
      "all",
  ).toLowerCase();
  const chatSource = ["twitch", "kick", "youtube"].includes(source)
    ? source
    : "all";
  const id =
    event.youtubeBroadcastId ?? event.broadcastId ?? event.youTubeBroadcastId;
  return {
    chatSource,
    ...(chatSource === "youtube" && typeof id === "string"
      ? { youtubeBroadcastId: id.slice(0, 150) }
      : {}),
  };
}
