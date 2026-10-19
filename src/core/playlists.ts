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
  reorder(id: string, to: number) {
    const playlist = this.get(id);
    if (!Number.isInteger(to) || to < 0 || to >= this.state.playlists.length)
      throw Error("Playlist library changed; try again.");
    const from = this.state.playlists.indexOf(playlist);
    this.state.playlists.splice(to, 0, this.state.playlists.splice(from, 1)[0]);
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
  setShuffle(enabled: boolean) {
    if (enabled === this.state.baseShuffle) return;
    if (enabled) shuffle(this.state.base);
    else if (this.state.activePlaylistId) {
      const remaining = new Map(this.state.base.map(track => [key(track), track]));
      this.state.base = this.get(this.state.activePlaylistId).tracks
        .flatMap(track => remaining.has(key(track)) ? [remaining.get(key(track))!] : []);
    }
    this.state.baseShuffle = enabled;
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
    const previousKeys = new Set(playlist.tracks.map(key));
    const upcomingKeys = new Set(this.state.base.map(key));
    playlist.tracks = checked;
    if (this.state.activePlaylistId === id) {
      if (!this.state.settings.repeatBase) {
        const eligible = checked.filter(track => upcomingKeys.has(key(track)) || !previousKeys.has(key(track)));
        const remaining = new Map(eligible.map(track => [key(track), track]));
        const ordered = this.state.base.flatMap(track => remaining.has(key(track)) ? [remaining.get(key(track))!] : []);
        const existing = new Set(ordered.map(key));
        this.state.base = (this.state.baseShuffle ? [...ordered, ...shuffle(eligible.filter(track => !existing.has(key(track))))] : eligible).map(track => ({ ...track, user: "Auto" }));
        return;
      }
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
