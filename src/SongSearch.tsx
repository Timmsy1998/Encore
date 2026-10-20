import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "./components/ui/button";
import { Cover, Provider, time } from "./Playback";
import { key, type SongSearchResult, type Track } from "./core/contracts";

export function SongSearch({ label, busy, add, children, initialQuery = "", excludeKey }: {
  label: string; busy: boolean; add: (input: string) => Promise<boolean>;
  initialQuery?: string; excludeKey?: string;
  children?: (input: string, clear: () => void) => ReactNode;
}) {
  const [input, setInput] = useState(initialQuery);
  const [result, setResult] = useState<SongSearchResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  useEffect(() => {
    if (!initialQuery) return;
    const current = ++revision.current;
    setLoading(true);
    window.encore.searchSongs(initialQuery).then(found => {
      if (current === revision.current) setResult(found);
    }).catch(cause => {
      if (current === revision.current) setError(cause instanceof Error ? cause.message : "Search failed. Try again.");
    }).finally(() => { if (current === revision.current) setLoading(false); });
    return () => { revision.current++; };
  }, [initialQuery]);
  const tracks = result?.tracks.filter(track => key(track) !== excludeKey) ?? [];
  function clear() {
    revision.current++;
    setInput(""); setResult(undefined); setError(""); setLoading(false); setAdded([]);
  }
  async function choose(track: Track) {
    const current = revision.current;
    setAdding(true);
    try {
      const url = track.source === "spotify" ? `https://open.spotify.com/track/${track.id}` : `https://www.youtube.com/watch?v=${track.id}`;
      if (await add(url) && current === revision.current) setAdded(previous => [...previous, key(track)]);
    } finally { setAdding(false); }
  }
  return <section className="song-search">
    <form className="add-track" onSubmit={async event => {
      event.preventDefault();
      if (!input.trim() || loading || adding || busy) return;
      const current = ++revision.current;
      setError(""); setResult(undefined); setAdded([]);
      // Explicit links already identify the song the user chose.
      if (/^https?:\/\//i.test(input.trim())) {
        setAdding(true);
        try { if (await add(input) && current === revision.current) clear(); }
        finally { setAdding(false); }
        return;
      }
      setLoading(true);
      try {
        const found = await window.encore.searchSongs(input);
        if (current === revision.current) setResult(found);
      } catch (cause) {
        if (current === revision.current) setError(cause instanceof Error ? cause.message : "Search failed. Try again.");
      } finally { if (current === revision.current) setLoading(false); }
    }}>
      <Search size={21} aria-hidden="true" />
      <input aria-label={label} placeholder="Find a song or paste a link" maxLength={1000} value={input} onChange={event => {
        revision.current++; setInput(event.target.value); setResult(undefined); setError(""); setLoading(false); setAdded([]);
      }} />
      <Button disabled={busy || loading || adding || !input.trim()}>{loading ? "Searching…" : /^https?:\/\//i.test(input.trim()) ? "Add song" : "Search"}</Button>
      {children?.(input, clear)}
    </form>
    {loading && <p role="status">Searching Spotify and YouTube…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div className="song-search-results">
      <div className="list-toolbar"><span role="status">{tracks.length ? `${tracks.length} results · Choose songs to add` : "No songs found. Try another song or artist."}</span><Button variant="ghost" onClick={clear}>Close results</Button></div>
      {result.warnings.map(warning => <p className="notice" role="status" key={warning}>{warning}</p>)}
      <ul aria-label="Song search results">{tracks.map(track => <li key={key(track)}>
        <Cover track={track} />
        <div className="song-search-title"><strong>{track.title}</strong><span>{track.author}</span><Provider source={track.source} /></div>
        <span className="duration">{time(track.duration)}</span>
        <Button variant="secondary" disabled={busy || adding || added.includes(key(track))} aria-label={`Add ${track.title} from ${track.source === "spotify" ? "Spotify" : "YouTube"}`} onClick={() => choose(track)}>{added.includes(key(track)) ? "Added" : "Add"}</Button>
      </li>)}</ul>
    </div>}
  </section>;
}
