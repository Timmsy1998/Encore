const testing = new URLSearchParams(location.search).get("test") === "1";
const box = document.querySelector("main");
async function update() {
  try {
    const s = testing
      ? {
          current: {
            title: "Overlay test · Encore",
            author: "Example artist",
            user: "Test viewer",
          },
          playing: true,
          accent: "#e5aa73",
          compact: false,
        }
      : await (await fetch("/now")).json();
    box.hidden = !s.current;
    if (s.current) {
      box.style.setProperty("--accent", s.accent);
      box.classList.toggle("compact", s.compact);
      document.querySelector("h1").textContent = s.current.title;
      document.querySelector("p").textContent =
        s.current.author + " · requested by " + s.current.user;
      document.querySelector("small").textContent = s.playing
        ? "NOW PLAYING"
        : "PAUSED";
    }
  } catch {
    box.hidden = true;
  }
}
const events = new EventSource("/events");
events.onmessage = update;
events.onerror = () => {
  box.hidden = true;
};
update();
