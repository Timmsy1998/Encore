import { renderOverlay, disposeOverlay } from "./overlay-renderer.js";
const params = new URLSearchParams(location.search);
const testing = params.get("test") === "1";
const endpoint = params.has("preset") ? `/now?preset=${encodeURIComponent(params.get("preset"))}` : "/now";
const box = document.querySelector("main");
let updating = false;
let again = false;
let timer;
async function update() {
  if (updating) { again = true; return; }
  clearTimeout(timer);
  updating = true;
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw Error("Disconnected");
    const state = await response.json();
    renderOverlay(box, state, testing);
    clearTimeout(timer);
    if (state.playing) timer = setTimeout(update, 1000);
  } catch {
    box.hidden = true;
    disposeOverlay(box);
    timer = setTimeout(update, 5000);
  }
  finally {
    updating = false;
    if (again) { again = false; void update(); }
  }
}
const events = new EventSource("/events");
events.onopen = update;
events.onmessage = update;
events.onerror = () => { clearTimeout(timer); box.hidden = true; disposeOverlay(box); };
window.addEventListener("beforeunload", () => { disposeOverlay(box); events.close(); clearTimeout(timer); });
update();
