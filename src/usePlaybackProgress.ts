import { useEffect, useState } from "react";
import type { PlaybackProgress, Snapshot } from "./core/contracts";

// Keep frequent position updates local to playback widgets, outside the library tree.
export function usePlaybackProgress(state: Snapshot) {
  const [live, setLive] = useState<PlaybackProgress | null>(null);
  useEffect(() => window.encore.subscribeProgress(sample => {
    if (sample.generation !== state.playbackGeneration) return;
    setLive(previous => previous?.generation === sample.generation && previous.observedAt > sample.observedAt ? previous : sample);
  }), [state.playbackGeneration]);
  const saved = state.progress;
  return live && live.generation === state.playbackGeneration && (!saved || live.observedAt >= saved.observedAt) ? live : saved;
}
