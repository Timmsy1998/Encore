import { useEffect, useState } from "react";
import { AudioLines, Heart, ListMusic, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { usePlaybackProgress } from "./usePlaybackProgress";
import { Button } from "./components/ui/button";
import { key, type Command, type Snapshot, type Track } from "./core/contracts";

export const time = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export function artwork(track: Track) {
  return track.source === "youtube"
    ? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`
    : track.coverId ? `https://i.scdn.co/image/${track.coverId}` : undefined;
}
export function Cover({ track, className = "art" }: { track?: Track | null; className?: string }) {
  const url = track && artwork(track);
  return url ? <img className={className} src={url} alt="" loading="lazy" /> : <div className={`${className} artwork-placeholder`}><AudioLines aria-hidden="true" /></div>;
}
export function Provider({ source }: { source: Track["source"] }) {
  return <span className={`provider ${source}`}><span aria-hidden="true">{source === "spotify" ? "≋" : "▶"}</span>{source === "spotify" ? "Spotify" : "YouTube"}</span>;
}
export function Timeline({ state, send, disabled = false, compact = false }: { state: Snapshot; send: (c: Command) => Promise<boolean>; disabled?: boolean; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  const [draft, setDraft] = useState<number | null>(null);
  const sample = usePlaybackProgress(state);
  useEffect(() => {
    if (!state.playing || !sample?.active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.playing, sample?.active]);
  useEffect(() => setDraft(null), [state.current?.id, state.playbackGeneration]);
  const duration = state.current?.duration ?? 0;
  const position = draft ?? Math.min(duration, Math.max(0, sample ? sample.position + (state.playing && sample.active ? Math.min(3, Math.max(0, Math.max(now, sample.observedAt) - sample.observedAt) / 1000) : 0) : 0));
  const ready = !!state.current && !!sample && state.playbackGeneration !== undefined;
  const commit = () => {
    if (draft === null || !ready) return;
    const value = draft;
    setDraft(null);
    void send({ type: "seek", key: key(state.current!), generation: state.playbackGeneration!, position: value });
  };
  return <div className={`timeline ${compact ? "compact" : ""}`}>
    <span>{time(position)}</span>
    <input aria-label={compact ? "Now playing position" : "Playback position"} aria-valuetext={`${time(position)} of ${time(duration)}`} type="range" min={0} max={duration || 1} step={1} value={position} disabled={disabled || !ready}
      style={{ "--progress": `${duration ? position / duration * 100 : 0}%` } as React.CSSProperties}
      onChange={e => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    <span>-{time(Math.max(0, duration - position))}</span>
  </div>;
}
export function Playback({ state: s, send, busy, showQueue }: { state: Snapshot; send: (c: Command) => Promise<boolean>; busy: boolean; showQueue: () => void }) {
  const [lastVolume, setLastVolume] = useState(70);
  const progress = usePlaybackProgress(s);
  const current = s.current;
  return <footer className="playback">
    <div className="playback-title"><Cover track={current} /><div><strong>{current?.title || "Nothing playing"}</strong><small>{current?.author || "Your next track is waiting"}</small></div>
      <Button variant="ghost" size="icon" aria-label="Favourite current track" aria-pressed={!!current && s.favorites.some(t => key(t) === key(current))} disabled={!current || busy} onClick={() => current && send({ type: "favorite", key: key(current) })}><Heart size={21} fill={current && s.favorites.some(t => key(t) === key(current)) ? "currentColor" : "none"} /></Button>
    </div>
    <div className="playback-center"><div className="transport">
      <Button variant="ghost" size="icon" aria-label="Shuffle stream playlist" aria-pressed={s.baseShuffle} disabled={!s.base.length || busy} onClick={() => send({ type: "playlistShuffle", enabled: !s.baseShuffle })}><Shuffle size={20} /></Button>
      <Button variant="ghost" size="icon" aria-label="Restart track" disabled={!current || !progress || busy} onClick={() => current && s.playbackGeneration !== undefined && send({ type: "seek", key: key(current), generation: s.playbackGeneration, position: 0 })}><SkipBack size={22} /></Button>
      <Button className="play-button" aria-label={s.playing ? "Pause" : "Play"} disabled={busy} size="icon" onClick={() => send({ type: s.playing ? "pause" : "play" })}>{s.playing ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</Button>
      <Button variant="ghost" size="icon" aria-label="Skip track" disabled={busy} onClick={() => send({ type: "skip" })}><SkipForward size={22} /></Button>
      <Button variant="ghost" size="icon" aria-label="Repeat stream playlist" aria-pressed={s.settings.repeatBase} disabled={busy} onClick={() => send({ type: "settings", settings: { repeatBase: !s.settings.repeatBase } })}><Repeat size={21} /></Button>
    </div><Timeline state={s} send={send} disabled={busy} /></div>
    <div className="volume"><Button size="icon" variant="ghost" aria-label={s.settings.volume ? "Mute" : "Unmute"} onClick={() => { if (s.settings.volume) setLastVolume(s.settings.volume); void send({ type: "settings", settings: { volume: s.settings.volume ? 0 : lastVolume } }); }}>{s.settings.volume ? <Volume2 size={22} /> : <VolumeX size={22} />}</Button><input aria-label="Volume" type="range" min="0" max="100" value={s.settings.volume} onChange={e => send({ type: "settings", settings: { volume: Number(e.target.value) } })} /><span>{s.settings.volume}%</span><Button className="queue-button" variant="ghost" size="icon" aria-label={`View queue, ${s.queue.length + s.listening.length} tracks`} onClick={showQueue}><ListMusic size={22} /><em>{s.queue.length + s.listening.length}</em></Button></div>
  </footer>;
}
