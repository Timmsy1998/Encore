import { key, PlaylistSchema, type SavedState, type Track } from "./contracts";

function shuffle(tracks: Track[]) {
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  return tracks;
}

// Main owns this library. The rotating base is a playback copy, so rotation
// never changes the saved order. Library edits preserve the next base track.
export class Playlists {
  constructor(private state: SavedState) {}
  get(id: string) {
    const playlist = this.state.playlists.find(item => item.id === id);
    if (!playlist) throw Error("Playlist no longer exists.");
    return playlist;
  }
  create(id: string, name: string) {
    if (this.state.playlists.length >= 100) throw Error("Playlist library is full.");
    if (this.state.playlists.some(item => item.id === id)) throw Error("Playlist already exists.");
    this.state.playlists.push(PlaylistSchema.parse({ id, name, tracks: [] }));
  }
  rename(id: string, name: string) {
    const playlist = this.get(id);
    playlist.name = PlaylistSchema.shape.name.parse(name);
  }
  delete(id: string) {
    this.get(id);
    if (this.state.activePlaylistId === id) this.stop();
    this.state.playlists = this.state.playlists.filter(item => item.id !== id);
  }
  activate(id: string, shuffled = false) {
    const playlist = this.get(id);
    if (!playlist.tracks.length) throw Error("Add some tracks before using this playlist for the stream.");
    this.state.base = playlist.tracks.map(track => ({ ...track, user: "Auto" }));
    if (shuffled) shuffle(this.state.base);
    this.state.baseShuffle = shuffled;
    this.state.activePlaylistId = id;
  }
  stop() {
    this.state.activePlaylistId = null;
    this.state.base = [];
    this.state.baseShuffle = false;
  }
  private update(id: string, tracks: Track[]) {
    const playlist = this.get(id);
    const checked = PlaylistSchema.shape.tracks.parse(tracks);
    const next = this.state.base[0];
    playlist.tracks = checked;
    if (this.state.activePlaylistId === id) {
      if (this.state.baseShuffle) {
        const remaining = new Map(checked.map(track => [key(track), track]));
        const ordered: Track[] = [];
        for (const track of this.state.base) {
          const updated = remaining.get(key(track));
          if (updated) ordered.push(updated);
          remaining.delete(key(track));
        }
        this.state.base = [...ordered, ...shuffle([...remaining.values()])]
          .map(track => ({ ...track, user: "Auto" }));
        return;
      }
      const index = next ? checked.findIndex(track => key(track) === key(next)) : -1;
      const rotated = index > 0 ? [...checked.slice(index), ...checked.slice(0, index)] : checked;
      this.state.base = rotated.map(track => ({ ...track, user: "Auto" }));
    }
  }
  append(id: string, tracks: Track[]) {
    const playlist = this.get(id);
    const merged = new Map(playlist.tracks.map(track => [key(track), track]));
    for (const track of tracks) if (!merged.has(key(track))) merged.set(key(track), { ...track, user: "Auto" });
    this.update(id, [...merged.values()]);
  }
  remove(id: string, trackKey: string) {
    this.update(id, this.get(id).tracks.filter(track => key(track) !== trackKey));
  }
  move(id: string, from: number, to: number) {
    const tracks = [...this.get(id).tracks];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length)
      throw Error("Playlist changed; try again.");
    tracks.splice(to, 0, tracks.splice(from, 1)[0]);
    this.update(id, tracks);
  }
}
