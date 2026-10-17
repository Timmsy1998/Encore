import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { key, type Command, type Snapshot } from "./core/contracts";

export function PlaylistLibrary({ state, busy, send }: {
  state: Snapshot; busy: boolean; send: (command: Command) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [input, setInput] = useState("");
  const [rename, setRename] = useState("");
  const [deleting, setDeleting] = useState(false);
  const playlist = state.playlists.find(item => item.id === selected) ?? state.playlists[0];
  const active = state.playlists.find(item => item.id === state.activePlaylistId);
  return <section className="section playlist-library" aria-label="Saved playlists">
    <h2>Your playlists</h2>
    <p>Mix Spotify and YouTube songs in one playlist. Requests play first, then your listening queue, then the stream playlist. The current song always finishes.</p>
    <p role="status">Stream playlist: {active?.name ?? (state.base.length ? "Imported base playlist" : "None")}</p>
    {active && state.baseShuffle && <p className="muted">Shuffle is on. The stream playlist rotates in a randomised order.</p>}
    <form className="playlist-controls" onSubmit={async event => {
      event.preventDefault();
      const id = crypto.randomUUID();
      if (await send({ type: "playlistCreate", id, name })) { setSelected(id); setName(""); setDeleting(false); }
    }}>
      <input aria-label="New playlist name" placeholder="New playlist name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
      <Button disabled={busy || !name.trim() || state.playlists.length >= 100}>Create playlist</Button>
    </form>
    {!playlist ? <p className="muted">Create a playlist, then add songs or import playlists from either service.</p> : <>
      <label className="field"><span>Saved playlist</span><select value={playlist.id} onChange={event => { setSelected(event.target.value); setInput(""); setRename(""); setDeleting(false); }}>
        {state.playlists.map(item => <option key={item.id} value={item.id}>{item.name} ({item.tracks.length})</option>)}
      </select></label>
      <div className="playlist-controls">
        <Button disabled={busy || !playlist.tracks.length} onClick={() => send({ type: "playlistActivate", id: playlist.id, shuffle: false })}>Use for stream</Button>
        <Button variant="secondary" disabled={busy || !playlist.tracks.length} onClick={() => send({ type: "playlistActivate", id: playlist.id, shuffle: true })}>Shuffle for stream</Button>
        {(state.base.length > 0 || active) && <Button variant="secondary" disabled={busy} onClick={() => send({ type: "playlistStop" })}>Stop stream playlist</Button>}
        <Button variant="secondary" disabled={busy} onClick={() => setDeleting(!deleting)}>Delete playlist</Button>
      </div>
      {deleting && <div className="playlist-controls"><span>Delete “{playlist.name}”? {active?.id === playlist.id && "Future playlist tracks will stop; the current song finishes."}</span><Button disabled={busy} onClick={async () => { if (await send({ type: "playlistDelete", id: playlist.id })) setDeleting(false); }}>Confirm delete</Button></div>}
      <form className="playlist-controls" onSubmit={async event => { event.preventDefault(); if (await send({ type: "playlistRename", id: playlist.id, name: rename })) setRename(""); }}>
        <input aria-label="Rename playlist" placeholder={playlist.name} value={rename} maxLength={80} onChange={event => setRename(event.target.value)} />
        <Button variant="secondary" disabled={busy || !rename.trim()}>Rename</Button>
      </form>
      <form className="playlist-controls" onSubmit={async event => { event.preventDefault(); if (await send({ type: "playlistAdd", id: playlist.id, input })) setInput(""); }}>
        <input aria-label="Playlist song or URL" placeholder="Song and artist, track link, or playlist URL" value={input} maxLength={1000} onChange={event => setInput(event.target.value)} />
        <Button disabled={busy || !input.trim()}>Add song</Button>
        <Button type="button" variant="secondary" disabled={busy || !input.trim()} onClick={async () => { if (await send({ type: "playlistImport", id: playlist.id, input })) setInput(""); }}>Append playlist</Button>
      </form>
      <p className="muted">Song searches prefer Spotify, then YouTube Music, then YouTube video. Append imports from either service; existing songs stay and duplicates are skipped. Changes to the stream playlist apply to future tracks.</p>
      <ol className="playlist-tracks" aria-label={`${playlist.name} tracks`}>
        {playlist.tracks.map((track, index) => <li key={key(track)}>
          <span className="playlist-song"><strong>{track.title}</strong><span>{track.author} · {track.source === "spotify" ? "Spotify" : "YouTube"}</span></span>
          <div className="row-actions">
            <Button variant="ghost" size="icon" aria-label={`Move ${track.title} up`} disabled={busy || index === 0} onClick={() => send({ type: "playlistMove", id: playlist.id, from: index, to: index - 1 })}><ArrowUp size={16} /></Button>
            <Button variant="ghost" size="icon" aria-label={`Move ${track.title} down`} disabled={busy || index === playlist.tracks.length - 1} onClick={() => send({ type: "playlistMove", id: playlist.id, from: index, to: index + 1 })}><ArrowDown size={16} /></Button>
            <Button variant="ghost" size="icon" aria-label={`Remove ${track.title} from playlist`} disabled={busy} onClick={() => send({ type: "playlistRemove", id: playlist.id, key: key(track) })}><Trash2 size={16} /></Button>
          </div>
        </li>)}
      </ol>
      {!playlist.tracks.length && <p className="muted">This playlist is empty. Add a song or append a Spotify or YouTube playlist.</p>}
    </>}
  </section>;
}
