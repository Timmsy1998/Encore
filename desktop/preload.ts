import { contextBridge, ipcRenderer } from "electron";
import type { Command, EncoreBridge, Snapshot } from "../src/core/contracts";
const bridge: EncoreBridge = {
  snapshot: () => ipcRenderer.invoke("encore:snapshot"),
  command: (c: Command) => ipcRenderer.invoke("encore:command", c),
  subscribe: (callback: (s: Snapshot) => void) => {
    const handler = (_event: unknown, s: Snapshot) => callback(s);
    ipcRenderer.on("encore:state", handler);
    return () => ipcRenderer.removeListener("encore:state", handler);
  },
};
contextBridge.exposeInMainWorld("encore", bridge);
