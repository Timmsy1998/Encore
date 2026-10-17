/* Isolated provider context. Refresh tokens and Node APIs never enter this page. */
let yt,
  spotify,
  ytReady = false,
  sdkReady = false,
  connecting = false;
let state = null,
  ytKey = "",
  intent = -1,
  spotifyActive = false;
let spotifyPrevious = null,
  observationTime = 0,
  endedGeneration = -1,
  observedGeneration = -1;
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
  });
}
function ended(expected = state) {
  if (expected?.generation !== state?.generation) return;
  if (endedGeneration === state.generation) return;
  endedGeneration = state.generation;
  void report("ended");
}
window.encorePause = async () => {
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
        if (state?.current?.source !== "youtube" || !state.playing) return;
        if (
          event.data === 0 &&
          ytKey === "youtube:" + state.current.id &&
          yt.getVideoData().video_id === state.current.id
        )
          ended();
        if (event.data === 1)
          status.textContent = "YouTube · playing in Encore";
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
        .catch(() =>
          report("not_ready", {
            message: "Spotify authorization expired. Reconnect in Setup.",
          }),
        ),
  });
  spotify.addListener("ready", ({ device_id }) => {
    status.textContent = "Spotify browser player ready";
    report("ready", { device: device_id });
  });
  spotify.addListener("not_ready", () =>
    report("not_ready", {
      message: "Spotify browser player offline. Reconnect in Setup.",
    }),
  );
  for (const type of [
    "initialization_error",
    "authentication_error",
    "account_error",
    "playback_error",
    "autoplay_failed",
  ]) {
    spotify.addListener(type, () => {
      status.textContent =
        type === "initialization_error"
          ? "DRM unavailable. See Spotify setup requirements."
          : type === "account_error"
            ? "Spotify Premium is required."
            : "Spotify playback failed. Reconnect or retry.";
      report("not_ready", { message: status.textContent });
    });
  }
  spotify.addListener("player_state_changed", observeSpotify);
  try {
    if (!(await spotify.connect())) throw Error("SDK connection refused");
  } catch {
    report("not_ready", {
      message:
        "Spotify browser playback could not initialise. Check DRM support.",
    });
  } finally {
    connecting = false;
  }
}
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
      const id = "youtube:" + track.id;
      if (ytKey !== id) {
        ytKey = id;
        yt.cueVideoById(track.id);
        intent = -1;
      }
      yt.setVolume(state.volume);
      if (state.playing && intent !== state.generation) {
        intent = state.generation;
        yt.playVideo();
      } else if (!state.playing) yt.pauseVideo();
    } else {
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
  if (spotify && spotifyActive && state?.playing)
    spotify
      .getCurrentState()
      .then(observeSpotify)
      .catch(() => report("not_ready"));
}, 2000);
window.addEventListener("beforeunload", () => {
  clearInterval(sampler);
  stream.close();
  spotify?.disconnect();
});
