import {
  StrictMode,
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  AudioLines,
  ListMusic,
  Heart,
  History,
  Settings2,
  Radio,
  Play,
  Pause,
  SkipForward,
  Volume2,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Ban,
  Copy,
  ExternalLink,
  Check,
  ChevronRight,
  Music2,
  SlidersHorizontal,
  CircleHelp,
} from "lucide-react";
import * as Switch from "@radix-ui/react-switch";
import { Button } from "./components/ui/button";
import {
  key,
  type Snapshot,
  type Command,
  type Track,
  type Settings,
} from "./core/contracts";
import "./styles.css";
import "../public/overlay.css";
import { renderOverlay } from "../public/overlay-renderer.js";
function OverlayPreview({ state }: { state: Snapshot }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderOverlay(ref.current, { current: state.current, playing: state.playing, appearance: state.settings }, true);
  }, [state]);
  return <div className="overlay-stage"><div ref={ref} aria-label="Overlay preview" /></div>;
}
const pages = [
  "Queue",
  "Listening",
  "Favourites",
  "History",
  "Overlay",
  "Settings",
  "Setup",
  "About",
] as const;
type Page = (typeof pages)[number];
function artwork(track: Track) {
  return track.source === "youtube"
    ? `https://i.ytimg.com/vi/${track.id}/default.jpg`
    : track.coverId
      ? `https://i.scdn.co/image/${track.coverId}`
      : undefined;
}
const icons = [
  ListMusic,
  Music2,
  Heart,
  History,
  Radio,
  Settings2,
  CircleHelp,
  AudioLines,
];
const steps = [
  "Welcome",
  "Streamer.bot",
  "Action import",
  "YouTube",
  "Spotify",
  "Your music",
  "OBS overlay",
  "Ready to listen",
];
const time = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle-label">
      <Switch.Root
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
        className="switch"
      >
        <Switch.Thumb className="thumb" />
      </Switch.Root>
      {label}
    </label>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function App() {
  const [s, setS] = useState<Snapshot>(),
    [page, setPage] = useState<Page>("Queue"),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState(""),
    [input, setInput] = useState(""),
    [search, setSearch] = useState(""),
    [password, setPassword] = useState(""),
    [apiKey, setApiKey] = useState(""),
    [playlist, setPlaylist] = useState(""),
    [importingPlaylist, setImportingPlaylist] = useState(false),
    [playlistResult, setPlaylistResult] = useState(""),
    [drag, setDrag] = useState<number>();
  const [draft, setDraft] = useState<Partial<Settings>>({});
  useEffect(() => {
    let live = true;
    const accept = (state: Snapshot) => {
      if (live) setS(state);
    };
    const unsubscribe = window.encore.subscribe(accept);
    window.encore
      .snapshot()
      .then((state) => {
        accept(state);
        if (!state.settings.setupComplete) setPage("Setup");
      })
      .catch(() =>
        setLocalError("Could not connect to Encore. Restart the application."),
      );
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  async function send(c: Command) {
    setBusy(true);
    setLocalError("");
    try {
      await window.encore.command(c);
      return true;
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : "Command failed. Please retry.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const config = (settings: Partial<Settings>) =>
    void send({ type: "settings", settings });
  const open = (target: Extract<Command, { type: "open" }>["target"]) =>
    void send({ type: "open", target });
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    if (
      await send({ type: page === "Listening" ? "listen" : "request", input })
    )
      setInput("");
  }
  if (!s)
    return (
      <main className="loading">
        <AudioLines size={40} />
        <h1>Opening Encore</h1>
        <p role="alert">{localError || "Loading Encore…"}</p>
      </main>
    );
  const settings = { ...s.settings, ...draft };
  const settingsForm = (
    <div className="form-grid">
      <Field
        label="WebSocket port"
        hint="Local Streamer.bot server; default 8080."
      >
        <input
          type="number"
          min="1"
          max="65535"
          value={settings.wsPort}
          onChange={(e) =>
            setDraft({ ...draft, wsPort: Number(e.target.value) })
          }
        />
      </Field>
      <Field
        label="WebSocket password"
        hint="Stored using the operating system when available."
      >
        <input
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <div className="actions">
        <Button
          disabled={busy}
          onClick={async () => {
            if (!(await send({ type: "settings", settings: draft }))) return;
            setDraft({});
            if (!(await send({ type: "secrets", password }))) return;
            setPassword("");
            await send({ type: "connect" });
          }}
        >
          Save & connect
        </Button>
        <span className="muted" role="status">
          {s.streamerbot}
        </span>
      </div>
    </div>
  );
  const youtubeForm = (
    <>
      <p>
        Enable the YouTube Data API v3 in a Google Cloud project. The key finds
        tracks; playback uses YouTube’s visible browser player inside Encore.
      </p>
      <div className="actions">
        <Button variant="secondary" onClick={() => open("google")}>
          Google Cloud <ExternalLink size={14} />
        </Button>
      </div>
      <Field label="YouTube API key">
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder="Paste a key to replace the saved key"
        />
      </Field>
      <div className="actions">
        <Button
          disabled={busy}
          onClick={async () => {
            if (apiKey) {
              if (!(await send({ type: "secrets", youtube: apiKey }))) return;
              setApiKey("");
            }
            await send({ type: "testYoutube" });
          }}
        >
          Save & test API
        </Button>
        <span className="muted" role="status">
          {s.youtube}
        </span>
      </div>
    </>
  );
  const spotifyForm = (
    <>
      <p>
        Spotify Premium and a developer app with Web Playback SDK access are
        required. Encore creates its own browser playback device; the Spotify
        app does not need to be open.
      </p>
      <p className="notice">
        Browser playback needs working Widevine DRM. A connected account alone
        does not prove playback. The player must report “Browser player ready”;
        test a track before relying on it.
      </p>
      <Button variant="secondary" onClick={() => open("spotify")}>
        Spotify developer dashboard <ExternalLink size={14} />
      </Button>
      <p>
        For an app in Development Mode, open its User Management tab, choose
        Add new user, and enter the name and Spotify email address of the
        account you will connect. This account needs access for Web Playback
        SDK playback. Then connect below using that same account.
      </p>
      <Field
        label="Redirect URI"
        hint="Add this exact URI to your Spotify application."
      >
        <div className="copy-field">
          <input readOnly value="http://127.0.0.1:17843/callback" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy redirect URI"
            onClick={() => send({ type: "copyRedirectUri" })}
          >
            <Copy size={16} />
          </Button>
        </div>
      </Field>
      <Field label="Spotify Client ID" hint="No Client Secret is needed.">
        <input
          value={settings.clientId}
          onChange={(e) =>
            setDraft({ ...draft, clientId: e.target.value.trim() })
          }
        />
      </Field>
      <div className="actions">
        <Button
          disabled={busy}
          onClick={async () => {
            if (
              !(await send({
                type: "settings",
                settings: { clientId: settings.clientId },
              }))
            )
              return;
            setDraft({});
            await send({ type: "spotifyConnect" });
          }}
        >
          Connect Spotify
        </Button>
        <Button
          variant="secondary"
          onClick={() => send({ type: "spotifyDisconnect" })}
        >
          Disconnect
        </Button>
        <span role="status" className="muted">
          {s.spotify}
        </span>
      </div>
    </>
  );
  const baseForm = (
    <>
      <p>
        Your requests play first, then your listening queue, then this rotating
        playlist. New requests start after the current track finishes.
      </p>
      <Field
        label="Base playlist URL"
        hint="Public or unlisted YouTube playlists, or Spotify playlists you own or collaborate on. Up to 1,000 entries. A successful import replaces the base playlist."
      >
        <input
          value={playlist}
          onChange={(e) => setPlaylist(e.target.value)}
          placeholder="https://www.youtube.com/playlist?list=…"
        />
      </Field>
      <Button
        disabled={busy || importingPlaylist || !playlist.trim()}
        onClick={async () => {
          setImportingPlaylist(true);
          setPlaylistResult("");
          try {
            const imported = await send({ type: "base", input: playlist });
            setPlaylistResult(
              imported
                ? "Playlist imported."
                : "Import failed. See the error above; your saved playlist is unchanged.",
            );
          } finally {
            setImportingPlaylist(false);
          }
        }}
      >
        {importingPlaylist ? "Importing playlist…" : "Import playlist"}
      </Button>
      <p role="status" className="muted">
        {importingPlaylist ? "Fetching playlist tracks…" : playlistResult}{" "}
        {s.base.length} base tracks saved
      </p>
    </>
  );
  const overlayForm = (
    <>
      <p>
        A silent now-playing overlay for OBS. Add a Browser source at 960 × 260
        and paste this URL. Changes appear live in OBS while Encore is open. Resize the source in OBS to fit your scene.
      </p>
      <Field label="Browser-source URL">
        <div className="copy-field">
          <input readOnly value={s.overlayUrl} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy overlay URL"
            onClick={() => send({ type: "copyOverlayUrl" })}
          >
            <Copy size={16} />
          </Button>
        </div>
      </Field>
      <OverlayPreview state={s} />
      <div className="overlay-controls">
        <Field label="Overlay style"><select aria-label="Overlay style" value={s.settings.overlayTheme} onChange={e => config({ overlayTheme: e.target.value as Settings["overlayTheme"] })}>
          <option value="card">Album card</option><option value="glass">Accent glass</option><option value="minimal">Minimal</option>
        </select></Field>
        {([ ["overlayAccent", "Accent colour"], ["overlayBackground", "Background colour"], ["overlayText", "Text colour"] ] as const).map(([name, label]) => <Field key={name} label={label}><input aria-label={label} type="color" value={s.settings[name]} onChange={e => config({ [name]: e.target.value })} /></Field>)}
        {([ ["overlayOpacity", "Background opacity", 0, 100, "%"], ["overlayRadius", "Corner radius", 0, 48, "px"], ["overlayWidth", "Card width", 300, 900, "px"] ] as const).map(([name, label, min, max, unit]) => <Field key={name} label={`${label} · ${s.settings[name]}${unit}`}><input aria-label={label} type="range" min={min} max={max} value={s.settings[name]} onChange={e => config({ [name]: Number(e.target.value) })} /></Field>)}
      </div>
      <div className="overlay-toggles">
        {([ ["overlayCompact", "Compact layout"], ["overlayArtwork", "Show artwork"], ["overlayProgress", "Show progress"], ["overlayRequester", "Show requester"], ["overlayHidePaused", "Hide when paused"] ] as const).map(([name, label]) => <Toggle key={name} label={label} checked={s.settings[name]} onChange={v => config({ [name]: v })} />)}
      </div>
      <Button variant="secondary" onClick={() => send({ type: "overlayTest" })}>Open test overlay</Button>
      <p className="notice">
        Music plays in Encore. Capture Encore application audio once in OBS;
        keep this browser source muted. Provider content needs appropriate
        broadcast rights. Spotify’s platform is intended for personal listening
        and restricts broadcasting.
      </p>
    </>
  );
  function rows(
    tracks: Track[],
    kind: "request" | "listening" | "saved" | "base",
  ) {
    const filtered = tracks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) =>
        `${t.title} ${t.author} ${t.user}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      );
    return (
      <div className="tracks">
        {filtered.length ? (
          filtered.map(({ t, i }) => (
            <div
              className="track"
              key={`${key(t)}-${i}`}
              draggable={kind === "request" && !search}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => {
                if (kind === "request") e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (kind === "request" && drag !== undefined)
                  void send({ type: "reorder", from: drag, to: i });
                setDrag(undefined);
              }}
            >
              <span className="position">{String(i + 1).padStart(2, "0")}</span>
              {artwork(t) ? (
                <img className="art" src={artwork(t)} alt="" loading="lazy" />
              ) : (
                <div className="art spotify-art">
                  <Music2 size={20} />
                </div>
              )}
              <div className="track-info">
                <strong>{t.title}</strong>
                <span>
                  {t.author} <b>·</b> {t.user}
                </span>
              </div>
              <span className={`source ${t.source}`}>
                {t.source === "youtube" ? "YT" : "SP"}
              </span>
              <span className="duration">{time(t.duration)}</span>
              <div className="row-actions">
                {kind === "request" && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${t.title} up`}
                      disabled={i === 0 || busy}
                      onClick={() =>
                        send({ type: "reorder", from: i, to: i - 1 })
                      }
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${t.title} down`}
                      disabled={i === tracks.length - 1 || busy}
                      onClick={() =>
                        send({ type: "reorder", from: i, to: i + 1 })
                      }
                    >
                      <ArrowDown size={14} />
                    </Button>
                  </>
                )}
                {kind === "saved" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Queue ${t.title} for listening`}
                    onClick={() =>
                      send({
                        type: "listen",
                        input:
                          t.source === "youtube"
                            ? "https://youtu.be/" + t.id
                            : "https://open.spotify.com/track/" + t.id,
                      })
                    }
                  >
                    <Plus size={16} />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Favourite ${t.title}`}
                  aria-pressed={s!.favorites.some((f) => key(f) === key(t))}
                  onClick={() => send({ type: "favorite", key: key(t) })}
                >
                  <Heart
                    size={15}
                    fill={
                      s!.favorites.some((f) => key(f) === key(t))
                        ? "currentColor"
                        : "none"
                    }
                  />
                </Button>
                {kind !== "saved" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${t.title}`}
                    onClick={() => send({ type: "remove", key: key(t) })}
                  >
                    <Trash2 size={15} />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Ban ${t.title}`}
                  onClick={() => send({ type: "ban", key: key(t) })}
                >
                  <Ban size={14} />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">
            <ListMusic size={32} />
            <h3>{search ? "No matching tracks" : "A little quiet in here"}</h3>
            <p>
              {kind === "request"
                ? "Add a request above, or let your listening queue play."
                : "Add some music to make yourself at home."}
            </p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="app">
      <aside className="navigation">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Queue");
          }}
        >
          <AudioLines />
          <span>encore</span>
        </a>
        <span className="nav-label">PLAYER</span>
        <nav>
          {pages.map((p, i) => {
            const Icon = icons[i];
            return (
              <button
                key={p}
                className={page === p ? "active" : ""}
                onClick={() => {
                  setPage(p);
                  setSearch("");
                }}
                title={p}
              >
                <Icon size={18} />
                <span>{p}</span>
                {p === "Queue" && s.queue.length > 0 && (
                  <em>{s.queue.length}</em>
                )}
              </button>
            );
          })}
        </nav>
        <div className="nav-footer">
          <span
            className={`dot ${s.streamerbot === "Connected" ? "online" : ""}`}
          />
          <span>
            {s.streamerbot === "Connected"
              ? "Streamer.bot online"
              : "Streamer.bot offline"}
          </span>
          <small>ENCORE {s.appVersion}</small>
        </div>
      </aside>
      <header className="topbar">
        <span className="breadcrumb">
          Your music, in good company <span>/ {page}</span>
        </span>
        <Toggle
          label="Accept requests"
          checked={s.settings.requests}
          onChange={(v) => config({ requests: v })}
        />
      </header>
      <main className="workspace">
        <div className="content">
          {(s.error || localError) && (
            <div className="alert" role="alert">
              {localError || s.error}
            </div>
          )}
          {s.updateReady && (
            <div className="notice" role="status">
              <p>{s.updateStatus}</p>
              <Button disabled={busy} onClick={() => send({ type: "installUpdate" })}>
                Restart and install
              </Button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              Working…
            </div>
          )}
          {["Queue", "Listening", "Favourites", "History"].includes(page) && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {page === "Queue" ? "UP NEXT" : "YOUR LIBRARY"}
                  </span>
                  <h1>{page === "Queue" ? "Request queue" : page}</h1>
                  <p>
                    {page === "Queue"
                      ? "Viewer requests get the next turn."
                      : page === "Listening"
                        ? "Music for you, with or without Streamer.bot."
                        : page === "Favourites"
                          ? "Keep the good ones close."
                          : "Recently accepted requests, ready to revisit."}
                  </p>
                </div>
                <span className="count">
                  {page === "Queue"
                    ? s.queue.length
                    : page === "Listening"
                      ? s.listening.length
                      : page === "Favourites"
                        ? s.favorites.length
                        : s.history.length}{" "}
                  tracks
                </span>
              </div>
              {["Queue", "Listening"].includes(page) && (
                <form className="add-track" onSubmit={add}>
                  <Plus size={18} />
                  <input
                    aria-label={
                      page === "Queue" ? "Request track" : "Add listening track"
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="YouTube / Spotify link, or search YouTube…"
                  />
                  <Button disabled={busy || !input.trim()} type="submit">
                    {page === "Queue" ? "Add request" : "Add music"}
                  </Button>
                </form>
              )}
              <div className="list-toolbar">
                <span>
                  {page === "Queue" ? "PRIORITY REQUESTS" : page.toUpperCase()}
                </span>
                <input
                  type="search"
                  aria-label="Filter tracks"
                  placeholder="Filter tracks"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {rows(
                page === "Queue"
                  ? s.queue
                  : page === "Listening"
                    ? s.listening
                    : page === "Favourites"
                      ? s.favorites
                      : s.history,
                page === "Queue"
                  ? "request"
                  : page === "Listening"
                    ? "listening"
                    : "saved",
              )}
              {page === "Listening" && (
                <section className="section">
                  <h2>When the queues are quiet</h2>
                  {baseForm}
                  {rows(s.base, "base")}
                </section>
              )}
            </>
          )}
          {page === "Setup" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                  <h1>Set up Encore</h1>
                  <p>
                    Your progress is saved. Optional services can be added
                    later.
                  </p>
                </div>
              </div>
              <div className="steps">
                {steps.map((name, i) => (
                  <button
                    key={name}
                    aria-current={
                      s.settings.setupStep === i ? "step" : undefined
                    }
                    className={s.settings.setupStep === i ? "selected" : ""}
                    onClick={() => config({ setupStep: i })}
                  >
                    <span>
                      {i < s.settings.setupStep ? <Check size={13} /> : i + 1}
                    </span>
                    {name}
                  </button>
                ))}
              </div>
              <section className="section setup-section">
                <span className="eyebrow">
                  STEP {Math.min(s.settings.setupStep, 7) + 1} OF 8
                </span>
                <h2>{steps[Math.min(s.settings.setupStep, 7)]}</h2>
                {s.settings.setupStep === 0 && (
                  <>
                    <p>
                      One player for music and viewer requests. Listen on
                      your own, or connect Streamer.bot to bring chat into the
                      queue.
                    </p>
                    <p>
                      Requests take priority over your listening queue and base
                      playlist. Encore starts paused each time you open it.
                    </p>
                    <p className="notice">
                      YouTube uses its visible player. Spotify browser audio
                      requires Premium, a supported DRM runtime and a successful
                      playback test. No other music app is required.
                    </p>
                  </>
                )}
                {s.settings.setupStep === 1 && (
                  <>
                    <p>
                      In Streamer.bot, enable Servers → WebSocket Server on
                      127.0.0.1. Keep Streamer.bot running while you accept chat
                      requests. Personal listening works without it.
                    </p>
                    {settingsForm}
                    <Button variant="ghost" onClick={() => open("streamerbot")}>
                      Connection guide <ExternalLink size={14} />
                    </Button>
                  </>
                )}
                {s.settings.setupStep === 2 && (
                  <>
                    <p>
                      Copy the original Better Song Request 1.1.0 action
                      package, then paste it in Streamer.bot’s Import window.
                      Review imported commands and moderator permissions before
                      enabling them.
                    </p>
                    <div className="actions">
                      <Button onClick={() => send({ type: "copyImport" })}>
                        <Copy size={15} />
                        Copy actions
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={s.streamerbot !== "Connected"}
                        onClick={() => send({ type: "checkImport" })}
                      >
                        Check import
                      </Button>
                    </div>
                    <p role="status">{s.importStatus}</p>
                  </>
                )}
                {s.settings.setupStep === 3 && youtubeForm}
                {s.settings.setupStep === 4 && spotifyForm}
                {s.settings.setupStep === 5 && baseForm}
                {s.settings.setupStep === 6 && overlayForm}
                {s.settings.setupStep >= 7 && (
                  <>
                    <ul className="checklist">
                      <li>Streamer.bot: {s.streamerbot}</li>
                      <li>YouTube API: {s.youtube}</li>
                      <li>Spotify: {s.spotify}</li>
                      <li>Base playlist: {s.base.length} tracks</li>
                      <li>
                        Secure credentials:{" "}
                        {s.secureStorage
                          ? "OS encryption available"
                          : "Session only"}
                      </li>
                    </ul>
                    <p>
                      Paste a track below, add it, then press Play. This
                      confirms actual playback, not just account access.
                    </p>
                    <form className="add-track" onSubmit={add}>
                      <input
                        aria-label="Test request"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="YouTube or Spotify track URL"
                      />
                      <Button disabled={!input || busy}>
                        Add test request
                      </Button>
                    </form>
                  </>
                )}
                <div className="setup-navigation">
                  <Button
                    variant="secondary"
                    disabled={s.settings.setupStep === 0 || busy}
                    onClick={() =>
                      config({ setupStep: s.settings.setupStep - 1 })
                    }
                  >
                    Back
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      if (s.settings.setupStep >= 7) {
                        config({ setupComplete: true });
                        setPage("Queue");
                      } else config({ setupStep: s.settings.setupStep + 1 });
                    }}
                  >
                    {s.settings.setupStep >= 7
                      ? "Open player"
                      : s.settings.setupStep === 0
                        ? "Get started"
                        : "Continue / skip"}
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </section>
            </>
          )}
          {page === "Overlay" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ON AIR</span>
                  <h1>Now-playing overlay</h1>
                  <p>Give your music a place on stream.</p>
                </div>
              </div>
              <section className="section">{overlayForm}</section>
            </>
          )}
          {page === "Settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">THE DETAILS</span>
                  <h1>Settings</h1>
                  <p>Connections, requests and your desktop.</p>
                </div>
              </div>
              <section className="section">
                <h2>Streamer.bot</h2>
                {settingsForm}
              </section>
              <section className="section">
                <h2>YouTube</h2>
                {youtubeForm}
              </section>
              <section className="section">
                <h2>Spotify</h2>
                {spotifyForm}
              </section>
              <section className="section">
                <h2>Request rules</h2>
                <div className="form-grid">
                  {(
                    [
                      ["userLimit", "Requests per user"],
                      ["globalLimit", "Global queue limit"],
                      ["maxMinutes", "Maximum minutes per track"],
                      ["votes", "Votes to skip"],
                    ] as const
                  ).map(([k, label]) => (
                    <Field key={k} label={label}>
                      <input
                        type="number"
                        min="1"
                        value={settings[k]}
                        onChange={(e) =>
                          setDraft({ ...draft, [k]: Number(e.target.value) })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <Field
                  label="Chat response"
                  hint="Placeholders: {user} and {message}. Responses are rate limited."
                >
                  <input
                    value={settings.reply}
                    onChange={(e) =>
                      setDraft({ ...draft, reply: e.target.value })
                    }
                  />
                </Field>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    await send({ type: "settings", settings: draft });
                    setDraft({});
                  }}
                >
                  Save rules
                </Button>
              </section>
              <section className="section">
                <h2>Desktop & data</h2>
                <Toggle
                  label="Close to tray (Spotify continues; YouTube pauses)"
                  checked={s.settings.closeToTray}
                  onChange={(v) => config({ closeToTray: v })}
                />
                <Toggle
                  label="Launch at login (installed Windows app)"
                  checked={s.settings.launchAtLogin}
                  onChange={(v) => config({ launchAtLogin: v })}
                />
                <p className="muted">
                  Data folder: <code>{s.dataPath}</code>
                </p>
                <div className="actions">
                  <Button
                    variant="secondary"
                    onClick={() => send({ type: "export" })}
                  >
                    Export backup
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => send({ type: "import" })}
                  >
                    Restore backup
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      config({ setupStep: 0 });
                      setPage("Setup");
                    }}
                  >
                    Reopen setup
                  </Button>
                </div>
                <small>
                  Backups contain queues and preferences, never account
                  credentials. Restore replaces current state and pauses
                  playback.
                </small>
              </section>
              <section className="section">
                <h2>Banned tracks</h2>
                {s.banned.length ? (
                  s.banned.map((id) => (
                    <div className="ban-row" key={id}>
                      <code>{id}</code>
                      <Button
                        variant="ghost"
                        onClick={() => send({ type: "unban", key: id })}
                      >
                        Unban
                      </Button>
                    </div>
                  ))
                ) : (
                  <p>No banned tracks.</p>
                )}
              </section>
            </>
          )}
          {page === "About" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">BUILT ON GOOD WORK</span>
                  <h1>Encore</h1>
                  <p>Version {s.appVersion} · GPL-3.0</p>
                </div>
              </div>
              <section className="section">
                <h2>Music, with company</h2>
                <p>
                  Encore is based on Better Song Request by HackMe_, adding a
                  desktop player, setup and coordinated playback.
                </p>
                <div className="actions">
                  <Button variant="secondary" onClick={() => open("upstream")}>
                    Upstream project <ExternalLink size={14} />
                  </Button>
                  <Button variant="secondary" onClick={() => open("license")}>
                    Licence
                  </Button>
                  <Button variant="secondary" onClick={() => open("releases")}>
                    Open releases
                  </Button>
                </div>
                <p>Installed copies check stable GitHub releases automatically and download updates in the background. Restart when you finish listening to install. Portable copies update through Open releases.</p>
                <p>{s.updateStatus || "Updates have not been checked."}</p>
                <Button
                  variant="secondary"
                  onClick={() => send({ type: "checkUpdates" })}
                >
                  Check for updates
                </Button>
                <p className="notice">
                  Spotify playback, Windows packaging and DRM approval need
                  real-account and Windows verification before release.
                  Combining services and broadcasting require provider
                  permission and appropriate rights. See the repository’s
                  playback and release documentation.
                </p>
              </section>
              <section className="section">
                <h2>Diagnostics</h2>
                <p>
                  {s.secureStorage
                    ? "OS secure storage available."
                    : "Credentials are session-only: secure storage unavailable."}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => send({ type: "diagnostics" })}
                >
                  <Copy size={15} />
                  Copy redacted diagnostics
                </Button>
                <pre>
                  {s.logs.join("\n") || "No errors recorded this session."}
                </pre>
              </section>
            </>
          )}
        </div>
        <aside className="now-panel">
          <span className="eyebrow">THE PLAYER</span>
          <div
            className="provider-space"
            aria-label="Provider browser playback area"
          />
          <div className="now-info">
            <span className="source-label">
              {s.current
                ? s.current.source.toUpperCase()
                : "READY WHEN YOU ARE"}
            </span>
            <h2>{s.current?.title || "Find your next favourite"}</h2>
            <p>
              {s.current?.author || "Add music to either queue and press Play."}
            </p>
            {s.current && (
              <span className="requester">
                {s.currentLane === "request"
                  ? "Requested by " + s.current.user
                  : s.currentLane === "listening"
                    ? "Personal listening"
                    : "From your base playlist"}
              </span>
            )}
          </div>
          <div className="connection-list">
            <div>
              <span
                className={`dot ${s.streamerbot === "Connected" ? "online" : ""}`}
              />
              Streamer.bot<small>{s.streamerbot}</small>
            </div>
            <div>
              <span
                className={`dot ${s.youtube.startsWith("API verified") ? "online" : ""}`}
              />
              YouTube<small>{s.youtube}</small>
            </div>
            <div>
              <span
                className={`dot ${s.spotify === "Browser player ready" ? "online" : ""}`}
              />
              Spotify<small>{s.spotify}</small>
            </div>
          </div>
          <div className="tip">
            <SlidersHorizontal size={17} />
            <p>
              Requests first. Your music next.
              <br />
              One set of playback controls.
            </p>
          </div>
        </aside>
      </main>
      <footer className="playback">
        <div className="playback-title">
          {s.current && artwork(s.current) ? (
            <img className="art" src={artwork(s.current)} alt="" />
          ) : (
            <AudioLines size={23} />
          )}
          <div>
            <strong>{s.current?.title || "Nothing playing"}</strong>
            <small>
              {s.current
                ? (s.playing ? "Playing" : "Paused") + " · " + s.current.source
                : "Your next track is waiting"}
            </small>
          </div>
        </div>
        <div className="transport">
          <Button
            aria-label={s.playing ? "Pause" : "Play"}
            disabled={busy}
            size="icon"
            onClick={() => send({ type: s.playing ? "pause" : "play" })}
          >
            {s.playing ? <Pause size={21} /> : <Play size={21} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Skip track"
            disabled={busy}
            onClick={() => send({ type: "skip" })}
          >
            <SkipForward size={22} />
          </Button>
        </div>
        <div className="volume">
          <Volume2 size={17} />
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="100"
            value={s.settings.volume}
            onChange={(e) => config({ volume: Number(e.target.value) })}
          />
          <span>{s.settings.volume}%</span>
        </div>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
