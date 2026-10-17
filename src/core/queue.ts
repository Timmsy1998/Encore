import { defaults, key, type SavedState, type Track } from "./contracts";
export class Queue {
  state: SavedState;
  current: Track | null = null;
  playing = false;
  currentLane: "request" | "listening" | "base" = "request";
  votes = new Set<string>();
  private events = new Set<string>();
  constructor(state = defaults()) {
    this.state = state;
    if (state.resume) {
      const { track, lane } = state.resume;
      if (lane !== "base") {
        const target = lane === "request" ? state.queue : state.listening;
        if (!target.some((t) => key(t) === key(track))) target.unshift(track);
      }
      state.resume = null;
    }
  }
  persisted() {
    return {
      ...this.state,
      resume: this.current
        ? { track: this.current, lane: this.currentLane }
        : null,
    };
  }
  listen(track: Track) {
    if (this.state.banned.includes(key(track)))
      throw Error("This track is banned.");
    if (this.state.listening.length >= 10000)
      throw Error("Listening queue is full.");
    this.state.listening.push(track);
  }
  add(track: Track, eventId?: string, force = false) {
    if (eventId && this.events.has(eventId)) return false;
    if (eventId) {
      this.events.add(eventId);
      if (this.events.size > 2000)
        this.events.delete(this.events.values().next().value!);
    }
    const s = this.state.settings;
    if (!force && !s.requests) throw Error("Requests are turned off.");
    if (this.state.banned.includes(key(track)))
      throw Error("This track is banned.");
    if (
      [...this.state.queue, ...(this.current ? [this.current] : [])].some(
        (t) => key(t) === key(track),
      )
    )
      throw Error("That track is already queued.");
    if (track.duration > s.maxMinutes * 60)
      throw Error(`Track exceeds the ${s.maxMinutes} minute limit.`);
    const active = [
      ...this.state.queue,
      ...(this.current && this.currentLane === "request" ? [this.current] : []),
    ];
    if (!force && active.length >= s.globalLimit)
      throw Error("The request queue is full.");
    if (
      !force &&
      active.filter((t) => t.user.toLowerCase() === track.user.toLowerCase())
        .length >= s.userLimit
    )
      throw Error("Your request limit has been reached.");
    this.state.queue.push(track);
    this.state.history = [
      track,
      ...this.state.history.filter((t) => key(t) !== key(track)),
    ].slice(0, 1000);
    return true;
  }
  next() {
    this.votes.clear();
    this.playing = false;
    this.current = null;
    if (this.state.queue.length) {
      this.currentLane = "request";
      this.current = this.state.queue.shift()!;
    } else if (this.state.listening.length) {
      this.currentLane = "listening";
      this.current = this.state.listening.shift()!;
    } else {
      this.currentLane = "base";
      const i = this.state.base.findIndex(
        (t) => !this.state.banned.includes(key(t)),
      );
      if (i >= 0) {
        this.current = this.state.base.splice(i, 1)[0];
        this.state.base.push(this.current);
      }
    }
    return this.current;
  }

  vote(user: string) {
    this.votes.add(user.toLowerCase());
    return this.votes.size >= this.state.settings.votes;
  }
  wrong(user: string) {
    const i = this.state.queue.findLastIndex(
      (t) => t.user.toLowerCase() === user.toLowerCase(),
    );
    if (i < 0) throw Error("No queued request found for you.");
    this.state.queue.splice(i, 1);
  }
  reorder(from: number, to: number) {
    if (
      from < 0 ||
      to < 0 ||
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from >= this.state.queue.length ||
      to >= this.state.queue.length
    )
      throw Error("Queue changed; try again.");
    this.state.queue.splice(to, 0, this.state.queue.splice(from, 1)[0]);
  }
  ban(id: string) {
    if (!this.state.banned.includes(id)) this.state.banned.push(id);
    this.state.queue = this.state.queue.filter((t) => key(t) !== id);
    this.state.listening = this.state.listening.filter((t) => key(t) !== id);
  }
}
