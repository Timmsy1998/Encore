import { useEffect, useState, type ReactNode } from "react";
import { AudioLines, Copy, Minus, Square, X } from "lucide-react";
import type { WindowAction, WindowState } from "./core/contracts";

export function WindowChrome({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WindowState>({ maximized: false, focused: true });
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    let received = false;
    const unsubscribe = window.encore.subscribeWindow(next => { received = true; if (live) setState(next); });
    void window.encore.windowState().then(next => { if (live && !received) setState(next); }).catch(() => {
      if (live) setError("Window controls unavailable. Use your system window shortcuts.");
    });
    return () => { live = false; unsubscribe(); };
  }, []);
  const act = (action: WindowAction) => {
    void window.encore.windowAction(action).then(() => setError("")).catch(() => setError("Window action failed. Use your system window shortcuts."));
  };
  return <div className={`desktop-shell${state.focused ? "" : " window-inactive"}`}>
    <header className="window-titlebar" aria-label="Encore window">
      <div className="window-drag-region"><AudioLines size={15} aria-hidden="true" /><span>encore</span><span className="window-caption">YOUR MUSIC. YOUR STREAM.</span></div>
      <div className="window-controls" role="group" aria-label="Window controls">
        <button type="button" aria-label="Minimise window" title="Minimise" onClick={() => act("minimize")}><Minus aria-hidden="true" /></button>
        <button type="button" aria-label={state.maximized ? "Restore window" : "Maximise window"} title={state.maximized ? "Restore down" : "Maximise"} onClick={() => act("toggleMaximize")}>{state.maximized ? <Copy className="restore-icon" aria-hidden="true" /> : <Square aria-hidden="true" />}</button>
        <button type="button" className="window-close" aria-label="Close window" title="Close" onClick={() => act("close")}><X aria-hidden="true" /></button>
      </div>
    </header>
    {error && <div className="window-error" role="alert">{error}</div>}
    {children}
  </div>;
}
