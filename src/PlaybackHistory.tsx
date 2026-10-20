import { useState } from "react";
import { Search, RotateCcw } from "lucide-react";
import { Button } from "./components/ui/button";
import { Cover, Provider } from "./Playback";
import { key, type PlaybackEntry, type Track } from "./core/contracts";

export const playbackReason: Record<PlaybackEntry["reason"], string> = {
  finished: "Played to the end",
  manual: "Skipped manually",
  votes: "Skipped by viewer votes",
  banned: "Skipped because the track was banned",
  "youtube-101": "YouTube blocked embedded playback (101)",
  "youtube-150": "YouTube blocked embedded playback (150)",
};
export function PlaybackHistory({ entries, search, busy, find, replay }: {
  entries: PlaybackEntry[]; search: string; busy: boolean;
  find: (track: Track) => void; replay: (track: Track) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(50);
  const filtered = entries.filter(entry => (filter === "all" || entry.outcome === filter) &&
    `${entry.track.title} ${entry.track.author} ${entry.track.user} ${playbackReason[entry.reason]}`.toLowerCase().includes(search.toLowerCase()));
  return <section aria-label="Playback history">
    <div className="queue-filters" role="group" aria-label="History filters">
      {[["all", "All plays"], ["completed", "Completed"], ["skipped", "Skipped"]].map(([value, label]) =>
        <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(50); }}>{label}</button>)}
    </div>
    {filtered.length ? <>
      <ul className="playback-history">{filtered.slice(0, limit).map(entry => <li key={entry.id}>
        <Cover track={entry.track} />
        <div className="history-description"><strong>{entry.track.title}</strong><span>{entry.track.author} · {entry.track.user}</span><Provider source={entry.track.source} />
          <small className={entry.outcome === "skipped" ? "history-skipped" : ""}>{playbackReason[entry.reason]}</small>
          <time dateTime={entry.endedAt}>{new Date(entry.endedAt).toLocaleString()}</time>
        </div>
        <div className="history-actions">
          <Button variant="secondary" onClick={() => find(entry.track)}><Search size={15} />Find another version</Button>
          <Button variant="ghost" disabled={busy} aria-label={`Queue again: ${entry.track.title}`} onClick={() => replay(entry.track)}><RotateCcw size={15} />Queue again</Button>
        </div>
      </li>)}</ul>
      {filtered.length > limit && <Button variant="ghost" onClick={() => setLimit(limit + 50)}>Show more plays</Button>}
    </> : <div className="empty"><h3>{entries.length ? "No matching plays" : "Your listening story starts here"}</h3><p>Completed and skipped songs appear here with their time and reason.</p></div>}
    <p className="hint">Keeps the latest 1,000 plays on this machine. Replaying adds to personal listening; the current song finishes first.</p>
  </section>;
}
export const songLink = (track: Track) => key(track).startsWith("spotify:")
  ? `https://open.spotify.com/track/${track.id}` : `https://www.youtube.com/watch?v=${track.id}`;
