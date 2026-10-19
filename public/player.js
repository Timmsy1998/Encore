/* Isolated provider context. Refresh tokens and Node APIs never enter this page. */
let yt,
  spotify,
  ytReady = false,
  sdkReady = false,
  connecting = false;
let reconnecting = null,
  readyWaiter = null;
let state = null,
  ytKey = "",
  ytPlayingKey = "",
  intent = -1,
  spotifyActive = false;
let spotifyPrevious = null,
  observationTime = 0,
  endedGeneration = -1,
  observedGeneration = -1,
  pendingEnd = null,
  endReporting = false;
const status = document.querySelector("#status");
const auth = {
  Authorization: "Bearer " + new URLSearchParams(location.search).get("token"),
  "Content-Type": "application/json",
};
async function post(path, data = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw Error("Encore connection failed");
  return response.status === 204 ? null : response.json();
}
function report(event, extra = {}) {
  return post("/player-event", {
    event,
    key: state?.current ? state.current.source + ":" + state.current.id : "",
    generation: state?.generation ?? -1,
    ...extra,
  }).catch(() => {
    status.textContent = "Encore disconnected. Restart the app to reconnect.";
    return false;
  });
}
function ended(expected = state) {
  if (expected?.generation !== state?.generation) return;
  if (endedGeneration === state.generation) return;
  pendingEnd = expected;
  if (endReporting) return;
  endReporting = true;
  void report("ended").then((delivered) => {
    if (delivered !== false) {
      endedGeneration = expected.generation;
      if (pendingEnd?.generation === expected.generation) pendingEnd = null;
    }
  }).finally(() => { endReporting = false; });
}
function observeYouTube(playbackState) {
  if (
    state?.current?.source !== "youtube" ||
    !state.playing ||
    ytKey !== "youtube:" + state.current.id + ":" + state.trackGeneration ||
    yt.getVideoData().video_id !== state.current.id
  ) return;
  if (playbackState === 1) {
    ytPlayingKey = ytKey;
    status.textContent = "YouTube · playing in Encore";
  }
  // A newly loaded rotation can still expose the previous video's ended state.
  if (playbackState === 0 && ytPlayingKey === ytKey) ended();
}
window.encorePause = async () => {
  intent = -1;
  if (ytReady) yt.pauseVideo();
  if (spotify && spotifyActive) await spotify.pause();
  spotifyActive = false;
};
window.onYouTubeIframeAPIReady = () => {
  yt = new YT.Player("player", {
    height: 200,
    width: 320,
    playerVars: { origin: location.origin, playsinline: 1 },
    events: {
      onReady: () => {
        ytReady = true;
        update();
      },
      onStateChange: (event) => {
        observeYouTube(event.data);
      },
      onAutoplayBlocked: () => {
        if (state?.current?.source !== "youtube" || !state.playing) return;
        status.textContent = "YouTube autoplay was blocked. Press Play to retry.";
        report("error", { message: status.textContent });
      },
      onError: (event) => {
        status.textContent = "YouTube error " + event.data;
        if (state?.current?.source === "youtube")
          report("error", {
            message:
              "YouTube error " +
              event.data +
              ". This video may restrict embedded playback. Skip or try another video.",
          });
      },
    },
  });
};
window.onSpotifyWebPlaybackSDKReady = () => {
  sdkReady = true;
  update();
};
function observeSpotify(sample) {
  if (!sample || state?.current?.source !== "spotify" || !state.playing) {
    spotifyPrevious = null;
    return;
  }
  if (observedGeneration !== state.generation) {
    spotifyPrevious = null;
    observedGeneration = state.generation;
  }
  const previous = spotifyPrevious;
  const elapsed = Date.now() - observationTime;
  const track = sample.track_window.current_track;
  // The SDK can move to a recommended track automatically. Keep progression in main.
  const reachedEnd =
    previous &&
    previous.track_window.current_track?.id === state.current.id &&
    !previous.paused &&
    previous.position + elapsed >= previous.duration - 1500;
  if (
    reachedEnd &&
    (track?.id !== state.current.id || (sample.paused && sample.position === 0))
  ) {
    const observed = state;
    void spotify
      .pause()
      .then(() => ended(observed))
      .catch(() =>
        report("not_ready", {
          message: "Spotify could not pause. Reconnect in Setup.",
        }),
      );
    return;
  }
  if (track?.id === state.current.id) {
    spotifyPrevious = sample;
    observationTime = Date.now();
    void report("progress", { position: sample.position / 1000, active: !sample.paused });
    if (!sample.paused) status.textContent = "Spotify · playing in Encore";
  }
}
async function connectSpotify() {
  if (connecting || spotify || !sdkReady || !state?.spotifyConnected) return;
  connecting = true;
  spotify = new Spotify.Player({
    name: "Encore",
    volume: (state.volume ?? 70) / 100,
    getOAuthToken: (callback) =>
      post("/sdk-token")
        .then((token) => callback(token.access))
        .catch(() => {
          if (spotify === instance) report("not_ready", {
            message: "Spotify authorization expired. Reconnect in Setup.",
          });
        }),
  });
  const instance = spotify;
  spotify.addListener("ready", async ({ device_id }) => {
    if (spotify !== instance) return;
    status.textContent = "Spotify browser player ready";
    const delivered = await report("ready", { device: device_id });
    if (spotify === instance && delivered !== false) readyWaiter?.();
  });
  spotify.addListener("not_ready", () => {
    if (spotify !== instance) return;
    void report("not_ready", {
      message: "Spotify browser player offline. Reconnect in Setup.",
    });
  });
  for (const type of [
    "initialization_error",
    "authentication_error",
    "account_error",
    "playback_error",
    "autoplay_failed",
  ]) {
    spotify.addListener(type, () => {
      if (spotify !== instance) return;
      status.textContent =
        type === "initialization_error"
          ? "DRM unavailable. See Spotify setup requirements."
          : type === "account_error"
            ? "Spotify Premium is required."
            : "Spotify playback failed. Reconnect or retry.";
      report("not_ready", { message: status.textContent });
    });
  }
  spotify.addListener("player_state_changed", (sample) => {
    if (spotify === instance) observeSpotify(sample);
  });
  try {
    if (!(await instance.connect())) throw Error("SDK connection refused");
  } catch {
    if (spotify === instance) report("not_ready", {
      message:
        "Spotify browser playback could not initialise. Check DRM support.",
    });
  } finally {
    if (spotify === instance) connecting = false;
  }
}
// Main requests one fresh SDK device after an expired device or playback 404.
// Resolve only after main has accepted the new device ID; never choose another device.
window.encoreReconnectSpotify = () => {
  if (reconnecting) return reconnecting;
  reconnecting = (async () => {
    if (!sdkReady || !state?.spotifyConnected || connecting)
      throw Error("Spotify SDK is not ready. Retry Play.");
    const previous = spotify;
    spotify = null;
    previous?.disconnect();
    spotifyActive = false;
    spotifyPrevious = null;
    status.textContent = "Reconnecting Spotify browser player…";
    let timeout;
    const ready = new Promise((resolve, reject) => {
      readyWaiter = resolve;
      timeout = setTimeout(() => reject(Error("Spotify reconnect timed out")), 15000);
    });
    try {
      void connectSpotify();
      await ready;
    } catch (error) {
      const failed = spotify;
      spotify = null;
      connecting = false;
      failed?.disconnect();
      throw error;
    } finally {
      clearTimeout(timeout);
      readyWaiter = null;
    }
  })().finally(() => { reconnecting = null; });
  return reconnecting;
};
let updating = false,
  again = false;
async function update() {
  if (updating) {
    again = true;
    return;
  }
  updating = true;
  try {
    state = await post("/player-state");
    await connectSpotify();
    if (!state.spotifyConnected && spotify) {
      spotify.disconnect();
      spotify = null;
      spotifyActive = false;
      spotifyPrevious = null;
    }
    const track = state.current;
    document.body.classList.toggle("spotify", track?.source === "spotify");
    if (!track) {
      await window.encorePause();
      status.textContent = "Add music to start listening.";
      return;
    }
    if (track.source === "youtube") {
      if (spotifyActive && spotify) {
        await spotify.pause();
        spotifyActive = false;
      }
      spotifyPrevious = null;
      if (!ytReady) return;
      const id = "youtube:" + track.id + ":" + state.trackGeneration;
      yt.setVolume(state.volume);
      if (ytKey !== id) {
        ytKey = id;
        ytPlayingKey = "";
        intent = state.playing ? state.generation : -1;
        if (state.playing) {
          // Loading starts playback atomically; cue + immediate play races the iframe.
          yt.loadVideoById(track.id);
        } else yt.cueVideoById(track.id);
      } else if (state.playing && intent !== state.generation) {
        intent = state.generation;
        yt.playVideo();
      }
      if (!state.playing) {
        intent = -1;
        yt.pauseVideo();
      }
    } else {
      intent = -1;
      ytKey = "";
      if (ytReady) yt.pauseVideo();
      if (spotify) {
        await spotify.setVolume(state.volume / 100);
        if (!state.playing && spotifyActive) await spotify.pause();
        spotifyActive = state.playing;
      }
    }
  } catch {
    status.textContent =
      "Playback connection unavailable. Check Encore diagnostics.";
  } finally {
    updating = false;
    if (again) {
      again = false;
      void update();
    }
  }
}
const stream = new EventSource("/events");
stream.onmessage = () => update();
stream.onerror = () => {
  status.textContent = "Reconnecting to Encore…";
};
// Sample local SDK state; this makes no Web API requests and detects track endings reliably.
const sampler = setInterval(() => {
  // Retry a failed local delivery for either provider, even after Spotify pauses.
  if (pendingEnd) {
    if (pendingEnd.generation === state?.generation && state.playing) ended(pendingEnd);
    else pendingEnd = null;
  }
  if (spotify && spotifyActive && state?.playing)
    spotify
      .getCurrentState()
      .then(observeSpotify)
      .catch(() => report("not_ready"));
  if (ytReady && state?.current?.source === "youtube" && yt.getVideoData().video_id === state.current.id) {
    const playbackState = yt.getPlayerState();
    observeYouTube(playbackState);
    const position = yt.getCurrentTime();
    if (Number.isFinite(position))
      void report("progress", { position, active: playbackState === 1 });
  }
}, 1000);
window.addEventListener("beforeunload", () => {
  clearInterval(sampler);
  stream.close();
  spotify?.disconnect();
});
