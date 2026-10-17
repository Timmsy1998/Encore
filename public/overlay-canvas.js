// A visual-only, muted YouTube player. Encore remains the playback authority.
const players = new WeakMap();
let api;
function youtubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!api) api = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => { script.remove(); reject(Error("Video artwork timed out")); }, 15000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); previous?.(); resolve(window.YT); };
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(Error("Video artwork could not load")); };
    document.head.append(script);
  });
  return api;
}
export function disposeCanvas(art) {
  const entry = players.get(art);
  if (!entry) return;
  players.delete(art);
  clearTimeout(entry.timer);
  entry.player?.destroy();
  entry.host.remove();
  delete art.dataset.canvas;
  art.removeAttribute("title");
}
export function updateCanvas(art, track, identity, position, playing, enabled) {
  if (!enabled) { disposeCanvas(art); return; }
  let entry = players.get(art);
  if (entry?.identity !== identity) { disposeCanvas(art); entry = null; }
  if (!entry) {
    const host = document.createElement("div");
    host.className = "encore-canvas";
    art.append(host);
    entry = { identity, host, player: null, ready: false, failed: false, position, playing };
    players.set(art, entry);
    art.dataset.canvas = "loading";
    const current = () => players.get(art) === entry;
    const fail = () => {
      if (!current()) return;
      clearTimeout(entry.timer);
      entry.failed = true;
      entry.ready = false;
      entry.player?.destroy();
      entry.host.remove();
      art.dataset.canvas = "fallback";
      art.title = "Video artwork unavailable. Showing cover art.";
    };
    entry.timer = setTimeout(fail, 15000);
    youtubeApi().then(YT => {
      if (!current() || entry.failed) return;
      const mount = document.createElement("div");
      host.append(mount);
      entry.player = new YT.Player(mount, {
        videoId: track.id,
        width: "100%", height: "100%",
        playerVars: { origin: location.origin, autoplay: 0, mute: 1, controls: 1, playsinline: 1, fs: 0 },
        events: {
          onReady: event => {
            if (!current() || entry.failed) { event.target.destroy(); return; }
            clearTimeout(entry.timer);
            entry.player = event.target;
            entry.ready = true;
            event.target.mute();
            event.target.seekTo(entry.position, true);
            sync(entry);
            art.dataset.canvas = "ready";
          },
          onStateChange: () => { if (current() && entry.ready) sync(entry); },
          onError: fail,
          onAutoplayBlocked: fail,
        },
      });
    }).catch(fail);
  }
  entry.position = position;
  entry.playing = playing;
  sync(entry);
}
function sync(entry) {
  if (!entry.ready || entry.failed) return;
  const player = entry.player;
  player.mute();
  if (Math.abs(player.getCurrentTime() - entry.position) > 2) player.seekTo(entry.position, true);
  const state = player.getPlayerState();
  if (entry.playing) {
    if (state !== 0 && state !== 1 && state !== 3) player.playVideo();
  } else if (state !== 2 && state !== -1 && state !== 5) player.pauseVideo();
}
