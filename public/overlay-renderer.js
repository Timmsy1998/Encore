// Shared by the OBS page and the settings preview. Metadata is always text.
export function renderOverlay(box, state, demo = false) {
  if (!box.firstElementChild) box.innerHTML = `<div class="encore-art"><img alt="Cover artwork"><span>♪</span></div><div class="encore-info"><div class="encore-top"><small></small><span class="encore-bars">▂ ▅ ▃ ▆</span></div><h1></h1><p></p><div class="encore-requester"></div><div class="encore-timeline"><div class="encore-times"><span></span><span></span></div><div class="encore-rail"><div></div></div></div></div>`;
  const a = state.appearance || {};
  const track = state.current || (demo ? { title: "Your next favourite song", author: "Artist name", user: "A lovely viewer", duration: 214 } : null);
  const playing = demo || state.playing;
  box.hidden = !track || (!demo && a.overlayHidePaused && !playing);
  if (!track) return;
  box.className = `encore-overlay ${a.overlayTheme || "card"}${a.overlayCompact ? " compact" : ""}${playing ? " playing" : ""}`;
  const style = box.style;
  style.setProperty("--accent", a.overlayAccent || state.accent || "#e5aa73");
  style.setProperty("--background", a.overlayBackground || "#17191f");
  style.setProperty("--text", a.overlayText || "#ffffff");
  style.setProperty("--opacity", (a.overlayOpacity ?? 92) + "%");
  style.setProperty("--radius", (a.overlayRadius ?? 24) + "px");
  style.setProperty("--width", (a.overlayWidth ?? 560) + "px");
  const q = (selector) => box.querySelector(selector);
  q("h1").textContent = track.title;
  q("p").textContent = track.author;
  q("small").textContent = `${demo ? "PREVIEW" : playing ? "NOW PLAYING" : "PAUSED"} · ${track.source === "spotify" ? "SPOTIFY" : track.source === "youtube" ? "YOUTUBE" : "ENCORE"}`;
  q(".encore-requester").textContent = `Requested by ${track.user}`;
  q(".encore-requester").hidden = a.overlayRequester === false;
  q(".encore-art").hidden = a.overlayArtwork === false;
  const img = q("img");
  const url = track.source === "youtube" && /^[\w-]{6,64}$/.test(track.id) ? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg` : track.source === "spotify" && /^[a-f0-9]{40,64}$/.test(track.coverId) ? `https://i.scdn.co/image/${track.coverId}` : "";
  if (img.getAttribute("src") !== url) {
    img.hidden = !url;
    img.onerror = () => { img.hidden = true; };
    if (url) img.src = url; else img.removeAttribute("src");
  }
  const sample = state.progress;
  const seconds = demo ? 78 : sample ? sample.position + (playing && sample.active ? Math.min(3, Math.max(0, (Date.now() - sample.observedAt) / 1000)) : 0) : 0;
  const position = Math.min(track.duration || 0, seconds);
  const time = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
  q(".encore-timeline").hidden = a.overlayProgress === false;
  q(".encore-times span:first-child").textContent = time(position);
  q(".encore-times span:last-child").textContent = time(track.duration || 0);
  q(".encore-rail div").style.width = `${track.duration ? position / track.duration * 100 : 0}%`;
}
