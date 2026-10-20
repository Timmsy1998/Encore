import { contextBridge, ipcRenderer } from "electron";
import type { Command, EncoreBridge, PlaybackProgress, Snapshot } from "../src/core/contracts";
const bridge: EncoreBridge = {
  searchSongs: (input: string) => ipcRenderer.invoke("encore:searchSongs", input),
  snapshot: () => ipcRenderer.invoke("encore:snapshot"),
  command: (c: Command) => ipcRenderer.invoke("encore:command", c),
  subscribeProgress: (callback: (sample: PlaybackProgress) => void) => {
    const handler = (_event: unknown, sample: PlaybackProgress) => callback(sample);
    ipcRenderer.on("encore:progress", handler);
    return () => ipcRenderer.removeListener("encore:progress", handler);
  },
  subscribe: (callback: (s: Snapshot) => void) => {
    const handler = (_event: unknown, s: Snapshot) => callback(s);
    ipcRenderer.on("encore:state", handler);
    return () => ipcRenderer.removeListener("encore:state", handler);
  },
};
contextBridge.exposeInMainWorld("encore", bridge);
