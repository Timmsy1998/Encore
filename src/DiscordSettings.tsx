import { usePlaybackProgress } from "./usePlaybackProgress";
import { useId, useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import { AudioLines, ExternalLink } from "lucide-react";
import { Button } from "./components/ui/button";
import { Cover, Provider, time } from "./Playback";
import { discordActivity, discordApplicationId } from "./core/discord";
import type { Command, Settings, Snapshot } from "./core/contracts";

function Option({ label, checked, disabled, change }: { label: string; checked: boolean; disabled: boolean; change: (value: boolean) => void }) {
  const id = useId();
  return <div className="toggle-row"><label htmlFor={id}>{label}</label><Switch.Root id={id} className="switch" checked={checked} disabled={disabled} onCheckedChange={change}><Switch.Thumb className="thumb" /></Switch.Root></div>;
}
export function DiscordSettings({ state, busy, send }: { state: Snapshot; busy: boolean; send: (command: Command) => Promise<boolean> }) {
  const [id, setId] = useState<string | null>(null);
  const settings = state.settings;
  const config = (settings: Partial<Settings>) => { void send({ type: "settings", settings }); };
  const progress = usePlaybackProgress(state);
  const activity = discordActivity({ ...state, progress });
  const validId = /^[0-9]{17,20}$/.test(id ?? settings.discordClientId);
  return <section className="section discord-section" aria-labelledby="discord-heading">
    <div className="discord-heading"><div><span className="eyebrow">SHARE THE SOUND</span><h2 id="discord-heading">Discord Rich Presence</h2></div><span className={`discord-status ${settings.discordEnabled ? "enabled" : ""}`} role="status">{state.discordStatus || (settings.discordEnabled ? "Waiting for Discord" : "Disabled")}</span></div>
    <p>Put your music on your Discord profile with album artwork, a playback countdown and a link to listen along.</p>
    <div className="discord-layout"><div className="discord-options">
      <Option label="Share music on Discord" checked={settings.discordEnabled} disabled={busy} change={value => config({ discordEnabled: value })} />
      <Option label="Show track artwork" checked={settings.discordArtwork} disabled={busy} change={value => config({ discordArtwork: value })} />
      <Option label="Keep paused tracks visible" checked={settings.discordShowPaused} disabled={busy} change={value => config({ discordShowPaused: value })} />
      <Option label="Include Download Encore button" checked={settings.discordDownloadButton} disabled={busy} change={value => config({ discordDownloadButton: value })} />
      <p className="muted">Requires the Discord desktop app and activity sharing enabled in Discord. Track title, artist, platform and artwork are public while sharing. Requester names and your queue stay private.</p>
      <details><summary>Application settings</summary><label className="field"><span>Discord application ID</span><input inputMode="numeric" maxLength={20} value={id ?? settings.discordClientId} aria-invalid={!validId} onChange={event => setId(event.target.value)} /><small>Encore’s application: {discordApplicationId}. No token or login needed.</small></label>
        <Button variant="secondary" disabled={busy || !validId || id === null} onClick={async () => { if (await send({ type: "settings", settings: { discordClientId: id! } })) setId(null); }}>Save application ID</Button>
      </details>
    </div><div className="discord-preview" aria-label="Discord presence preview">
      <div className="discord-preview-label">PROFILE PREVIEW <span>{activity ? "Listening" : "Hidden"}</span></div>
      {activity && state.current ? <><div className="discord-track">
        <div className="discord-art">{settings.discordArtwork ? <Cover track={state.current} /> : <div className="art artwork-placeholder"><AudioLines aria-hidden="true" /></div>}<img className="discord-app-icon" src="/icon.png" alt="Encore" /></div>
        <div className="discord-track-text"><strong>Encore</strong><b>{activity.details}</b><span>{activity.state}</span><Provider source={state.current.source} />{activity.timestamps && <small>{time(Math.max(0, activity.timestamps.end - Date.now() / 1000))} remaining</small>}</div>
      </div><div className="discord-preview-buttons">{activity.buttons.map(button => <span key={button.label}>{button.label}<ExternalLink size={13} aria-hidden="true" /></span>)}</div></> : <div className="discord-empty"><AudioLines size={30} aria-hidden="true" /><strong>{!settings.discordEnabled ? "Your music, when you choose" : state.current ? "Paused · presence hidden" : "Ready for your next track"}</strong><span>{!settings.discordEnabled ? "Enable sharing to show the track you’re listening to." : "Your profile stays clear until music is playing."}</span></div>}
      <small className="muted">Preview only. Discord controls the final layout; buttons may only appear to other people. Changes can take 15 seconds.</small>
    </div></div>
  </section>;
}
