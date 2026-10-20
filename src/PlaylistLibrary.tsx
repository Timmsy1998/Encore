import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, GripVertical, Library, Music2, Trash2 } from "lucide-react";
import { SongSearch } from "./SongSearch";
import { Button } from "./components/ui/button";
import { key, type Command, type Snapshot } from "./core/contracts";

const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function PlaylistLibrary({ state, busy, send }: {
  state: Snapshot; busy: boolean; send: (command: Command) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [rename, setRename] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [drag, setDrag] = useState<{ playlist: string; track?: string }>();
  const [announcement, setAnnouncement] = useState("");
  // The library always opens closed. A missing/deleted selection never opens another playlist.
  const playlist = state.playlists.find(item => item.id === selected);
  const active = state.playlists.find(item => item.id === state.activePlaylistId);
  async function movePlaylist(id: string, to: number) {
    if (await send({ type: "playlistReorder", id, to })) setAnnouncement(`Playlist moved to position ${to + 1}.`);
  }
  async function moveTrack(id: string, from: number, to: number) {
    if (await send({ type: "playlistMove", id, from, to })) setAnnouncement(`Song moved to position ${to + 1}.`);
  }
  return <section className="playlist-library" aria-label="Saved playlists">
    <div className="playlist-stream">
      <div><span className="eyebrow">STREAM SOUNDTRACK</span><p role="status">Stream playlist: {active?.name ?? (state.base.length ? "Imported base playlist" : "None")}</p>
        <span className="muted">Requests → Personal listening → Stream playlist</span>
        {active && state.baseShuffle && <p className="muted">Shuffle is on. The stream playlist rotates in a randomised order.</p>}
      </div>
      {(state.base.length > 0 || active) && <Button variant="secondary" disabled={busy} onClick={() => send({ type: "playlistStop" })}>Stop stream playlist</Button>}
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {!playlist ? <>
      <form className="playlist-controls playlist-create" onSubmit={async event => {
        event.preventDefault();
        const id = crypto.randomUUID();
        if (await send({ type: "playlistCreate", id, name })) { setName(""); setAnnouncement("Playlist created. Open it to add songs."); }
      }}>
        <input aria-label="New playlist name" placeholder="Give your next playlist a name…" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
        <Button disabled={busy || !name.trim() || state.playlists.length >= 100}>Create playlist</Button>
      </form>
      <div className="list-toolbar"><span>YOUR PLAYLISTS · {state.playlists.length}</span><span>DRAG TO ARRANGE · OR USE ARROWS</span></div>
      {!state.playlists.length ? <div className="empty"><Library size={32} /><h3>Your collection starts here</h3><p>Create a playlist, then open it to add songs or import from Spotify and YouTube.</p></div> :
        <ol className="playlist-cards" aria-label="Playlist library">
          {state.playlists.map((item, index) => <li key={item.id} className={`playlist-card ${active?.id === item.id ? "is-active" : ""}`}
            onDragOver={event => { if (!busy && drag && !drag.track) event.preventDefault(); }}
            onDrop={event => {
              event.preventDefault();
              if (!busy && drag && !drag.track && drag.playlist !== item.id) void movePlaylist(drag.playlist, index);
              setDrag(undefined);
            }}>
            <Button variant="ghost" size="icon" aria-label={`Drag playlist ${item.name}`} disabled={busy} draggable={!busy}
              onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDrag({ playlist: item.id }); }} onDragEnd={() => setDrag(undefined)}><GripVertical size={16} /></Button>
            <button className="playlist-open" aria-label={`Open playlist ${item.name}`} onClick={() => { setSelected(item.id); setRename(""); setDeleting(false); setDrag(undefined); }}>
              <span className="playlist-cover"><Music2 size={24} /></span>
              <span className="playlist-card-info"><strong>{item.name}</strong><span>{item.tracks.length} songs · {Math.round(item.tracks.reduce((sum, track) => sum + track.duration, 0) / 60)} min{active?.id === item.id ? " · Stream playlist" : ""}</span></span>
              <ChevronRight size={18} />
            </button>
            <div className="row-actions">
              <Button variant="ghost" size="icon" aria-label={`Move playlist ${item.name} up`} disabled={busy || index === 0} onClick={() => movePlaylist(item.id, index - 1)}><ArrowUp size={16} /></Button>
              <Button variant="ghost" size="icon" aria-label={`Move playlist ${item.name} down`} disabled={busy || index === state.playlists.length - 1} onClick={() => movePlaylist(item.id, index + 1)}><ArrowDown size={16} /></Button>
            </div>
          </li>)}
        </ol>}
    </> : <div className="playlist-detail" key={playlist.id}>
      <Button variant="ghost" onClick={() => { setSelected(""); setDrag(undefined); }}><ArrowLeft size={16} />All playlists</Button>
      <div className="playlist-detail-heading"><span className="playlist-cover"><Music2 size={32} /></span><div><span className="eyebrow">MIXED PLAYLIST</span><h2>{playlist.name}</h2><p>{playlist.tracks.length} songs · Spotify + YouTube</p></div></div>
      <div className="playlist-controls">
        <Button disabled={busy || !playlist.tracks.length} onClick={() => send({ type: "playlistActivate", id: playlist.id, shuffle: false })}>Use for stream</Button>
        <Button variant="secondary" disabled={busy || !playlist.tracks.length} onClick={() => send({ type: "playlistActivate", id: playlist.id, shuffle: true })}>Shuffle for stream</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setDeleting(!deleting)}>Delete playlist</Button>
      </div>
      {deleting && <div className="notice playlist-controls"><span>Delete “{playlist.name}”? {active?.id === playlist.id && "Future playlist tracks will stop; the current song finishes."}</span><Button variant="destructive" disabled={busy} onClick={async () => { if (await send({ type: "playlistDelete", id: playlist.id })) { setDeleting(false); setSelected(""); } }}>Confirm delete</Button><Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button></div>}
      <form className="playlist-controls" onSubmit={async event => { event.preventDefault(); if (await send({ type: "playlistRename", id: playlist.id, name: rename })) setRename(""); }}>
        <input aria-label="Rename playlist" placeholder={playlist.name} value={rename} maxLength={80} onChange={event => setRename(event.target.value)} />
        <Button variant="secondary" disabled={busy || !rename.trim()}>Rename</Button>
      </form>
      <SongSearch key={playlist.id} label="Playlist song or URL" busy={busy} add={input => send({ type: "playlistAdd", id: playlist.id, input })}>
        {(input, clear) => <Button type="button" variant="secondary" disabled={busy || !input.trim()} onClick={async () => { if (await send({ type: "playlistImport", id: playlist.id, input })) clear(); }}>Append playlist</Button>}
      </SongSearch>
      <p className="muted">Search Spotify and YouTube, then choose songs to add. Imports append and skip duplicates. Drag songs or use the arrows to arrange them. Stream edits apply to future tracks; the current song finishes.</p>
      <ol className="playlist-tracks" aria-label={`${playlist.name} tracks`}>
        {playlist.tracks.map((track, index) => <li key={key(track)}
          onDragOver={event => { if (!busy && drag?.playlist === playlist.id && drag.track) event.preventDefault(); }}
          onDrop={event => {
            event.preventDefault();
            if (!busy && drag?.playlist === playlist.id && drag.track) {
              const from = playlist.tracks.findIndex(item => key(item) === drag.track);
              if (from >= 0 && from !== index) void moveTrack(playlist.id, from, index);
            }
            setDrag(undefined);
          }}>
          <Button variant="ghost" size="icon" aria-label={`Drag song ${track.title}`} disabled={busy} draggable={!busy}
            onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", key(track)); setDrag({ playlist: playlist.id, track: key(track) }); }} onDragEnd={() => setDrag(undefined)}><GripVertical size={16} /></Button>
          <span className="position">{String(index + 1).padStart(2, "0")}</span>
          <span className="playlist-song"><strong>{track.title}</strong><span>{track.author} · {track.source === "spotify" ? "Spotify" : "YouTube"}</span></span>
          <span className="duration">{duration(track.duration)}</span>
          <div className="row-actions">
            <Button variant="ghost" size="icon" aria-label={`Move ${track.title} up`} disabled={busy || index === 0} onClick={() => moveTrack(playlist.id, index, index - 1)}><ArrowUp size={16} /></Button>
            <Button variant="ghost" size="icon" aria-label={`Move ${track.title} down`} disabled={busy || index === playlist.tracks.length - 1} onClick={() => moveTrack(playlist.id, index, index + 1)}><ArrowDown size={16} /></Button>
            <Button variant="ghost" size="icon" aria-label={`Remove ${track.title} from playlist`} disabled={busy} onClick={() => send({ type: "playlistRemove", id: playlist.id, key: key(track) })}><Trash2 size={16} /></Button>
          </div>
        </li>)}
      </ol>
      {!playlist.tracks.length && <div className="empty"><Music2 size={32} /><h3>Make it yours</h3><p>Add a song or append a Spotify or YouTube playlist above.</p></div>}
    </div>}
  </section>;
}
