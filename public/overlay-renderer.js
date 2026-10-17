import { updateCanvas, disposeCanvas } from "./overlay-canvas.js";
const transitions = new WeakMap();

export function disposeOverlay(box) {
  const art = box.querySelector(".encore-art");
  if (art) disposeCanvas(art);
}

// Shared by the OBS page and the settings preview. Metadata is always text.
export function renderOverlay(box, state, demo = false, preview = false) {
  if (!box.firstElementChild) box.innerHTML = `<div class="encore-art"><img alt="Cover artwork"><span>♪</span></div><div class="encore-info"><div class="encore-top"><small></small><span class="encore-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div><h1></h1><p></p><div class="encore-requester"></div><div class="encore-timeline"><div class="encore-times"><span></span><span></span></div><div class="encore-rail"><div></div></div></div></div>`;
  const a = state.appearance || {};
  const track = state.current || (demo ? { title: "Your next favourite song", author: "Artist name", user: "A lovely viewer", duration: 214 } : null);
  const playing = demo || state.playing;
  const identity = track ? JSON.stringify([track.source, track.id, track.title, track.author, state.trackGeneration]) : null;
  const previous = transitions.get(box);
  let outgoing;
  const changed = previous?.identity !== identity;
  if (changed) {
    previous?.cancel();
    if (previous?.identity && !box.hidden && track && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const bounds = box.getBoundingClientRect();
      outgoing = box.cloneNode(true);
      outgoing.querySelectorAll(".encore-canvas, iframe").forEach(node => node.remove());
      outgoing.removeAttribute("id");
      outgoing.removeAttribute("aria-label");
      outgoing.setAttribute("aria-hidden", "true");
      outgoing.inert = true;
      outgoing.dataset.transition = "outgoing";
      Object.assign(outgoing.style, { position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, margin: "0", pointerEvents: "none", zIndex: "10" });
      document.body.append(outgoing);
    }
  }
  box.hidden = !track || (!demo && a.overlayHidePaused && !playing);
  if (!track) {
    disposeOverlay(box);
    transitions.set(box, { identity, cancel() {} });
    return;
  }
  const canvas = a.overlayCanvas && a.overlayArtwork !== false && track.source === "youtube" && /^[\w-]{11}$/.test(track.id);
  box.className = `encore-overlay ${a.overlayTheme || "card"}${a.overlayCompact ? " compact" : ""}${playing ? " playing" : ""} ${a.overlayLayout || "horizontal"}${canvas ? " canvas" : a.overlayVinyl ? " vinyl" : ""}`;
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
  q("small").textContent = `${demo ? "PREVIEW" : playing ? "NOW PLAYING" : "PAUSED"}`;
  q(".encore-requester").textContent = `Requested by ${track.user}`;
  q(".encore-requester").hidden = a.overlayRequester === false || !(state.current ? state.currentLane === "request" : demo) || !track.user;
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
  updateCanvas(q(".encore-art"), track, identity, position, !!state.playing && !!sample?.active, canvas && !preview && !box.hidden);
  const time = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
  q(".encore-timeline").hidden = a.overlayProgress === false;
  q(".encore-times span:first-child").textContent = time(position);
  q(".encore-times span:last-child").textContent = time(track.duration || 0);
  q(".encore-rail div").style.width = `${track.duration ? position / track.duration * 100 : 0}%`;
  if (changed) {
    const animations = [];
    if (!box.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animations.push(box.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 460, easing: "cubic-bezier(.22,1,.36,1)" }));
      if (outgoing) animations.push(outgoing.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 240, easing: "ease-out", fill: "forwards" }));
    }
    const cancel = () => { animations.forEach(animation => animation.cancel()); outgoing?.remove(); };
    transitions.set(box, { identity, cancel });
    Promise.all(animations.map(animation => animation.finished)).then(cancel, cancel);
  }
}
