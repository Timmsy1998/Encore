import { renderOverlay } from "./overlay-renderer.js";
const params = new URLSearchParams(location.search);
const testing = params.get("test") === "1";
const endpoint = params.has("preset") ? `/now?preset=${encodeURIComponent(params.get("preset"))}` : "/now";
const box = document.querySelector("main");
let updating = false;
async function update() {
  if (updating) return;
  updating = true;
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw Error("Disconnected");
    renderOverlay(box, await response.json(), testing);
  } catch { box.hidden = true; }
  finally { updating = false; }
}
const events = new EventSource("/events");
events.onmessage = update;
events.onerror = () => { box.hidden = true; };
const timer = setInterval(update, 1000);
window.addEventListener("beforeunload", () => { events.close(); clearInterval(timer); });
update();
