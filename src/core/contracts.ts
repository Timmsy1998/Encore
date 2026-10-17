import { z } from "zod";
export const TrackSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{6,64}$/),
  source: z.enum(["youtube", "spotify"]),
  coverId: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .optional(),
  title: z.string().min(1).max(500),
  author: z.string().max(300).default(""),
  duration: z.number().positive().max(86400),
  user: z.string().min(1).max(100).default("Streamer"),
});
export type Track = z.infer<typeof TrackSchema>;
export const SettingsSchema = z.object({
  wsPort: z.number().int().min(1).max(65535).default(8080),
  clientId: z
    .string()
    .regex(/^([a-f0-9]{32})?$/)
    .default(""),
  requests: z.boolean().default(true),
  volume: z.number().int().min(0).max(100).default(70),
  userLimit: z.number().int().min(1).max(1000).default(5),
  globalLimit: z.number().int().min(1).max(10000).default(100),
  maxMinutes: z.number().int().min(1).max(1440).default(15),
  votes: z.number().int().min(1).max(1000).default(5),
  closeToTray: z.boolean().default(false),
  launchAtLogin: z.boolean().default(false),
  setupStep: z.number().int().min(0).max(8).default(0),
  setupComplete: z.boolean().default(false),
  overlayAccent: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .default("#e5aa73"),
  overlayCompact: z.boolean().default(false),
  reply: z.string().max(500).default("@{user} · {message}"),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const StateSchema = z.object({
  version: z.literal(1),
  settings: SettingsSchema,
  queue: z.array(TrackSchema).max(10000),
  listening: z.array(TrackSchema).max(10000).default([]),
  resume: z
    .object({
      track: TrackSchema,
      lane: z.enum(["request", "listening", "base"]),
    })
    .nullable()
    .default(null),
  base: z.array(TrackSchema).max(10000),
  favorites: z.array(TrackSchema).max(10000),
  history: z.array(TrackSchema).max(1000),
  banned: z.array(z.string().max(100)).max(10000),
});
export type SavedState = z.infer<typeof StateSchema>;
export type Snapshot = SavedState & {
  current: Track | null;
  playing: boolean;
  currentLane: string;
  streamerbot: string;
  youtube: string;
  spotify: string;
  error: string;
  logs: string[];
  secureStorage: boolean;
  overlayUrl: string;
  dataPath: string;
  appVersion: string;
  importStatus: string;
  updateStatus?: string;
  updateReady?: boolean;
};
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("settings"), settings: SettingsSchema.partial() }),
  z.object({
    type: z.literal("secrets"),
    youtube: z.string().max(250).optional(),
    password: z.string().max(250).optional(),
  }),
  z.object({
    type: z.enum(["request", "listen", "base"]),
    input: z.string().trim().min(1).max(1000),
  }),
  z.object({
    type: z.enum(["remove", "favorite", "ban", "unban", "readd"]),
    key: z.string().max(100),
  }),
  z.object({
    type: z.literal("reorder"),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.enum([
      "play",
      "pause",
      "skip",
      "connect",
      "testYoutube",
      "spotifyConnect",
      "spotifyDisconnect",
      "export",
      "import",
      "overlayTest",
      "diagnostics",
      "copyImport",
      "checkImport",
      "checkUpdates",
      "installUpdate",
      "showPlayer",
    ]),
  }),
  z.object({
    type: z.literal("open"),
    target: z.enum([
      "spotify",
      "google",
      "streamerbot",
      "upstream",
      "releases",
      "license",
    ]),
  }),
]);
export type Command = z.infer<typeof CommandSchema>;
export interface EncoreBridge {
  snapshot(): Promise<Snapshot>;
  command(command: Command): Promise<void>;
  subscribe(callback: (s: Snapshot) => void): () => void;
}
declare global {
  interface Window {
    encore: EncoreBridge;
  }
}
export const key = (t: Track) => `${t.source}:${t.id}`;
export function migrate(input: unknown): SavedState {
  return StateSchema.parse(input);
}
export function defaults(): SavedState {
  return {
    version: 1,
    settings: SettingsSchema.parse({}),
    queue: [],
    base: [],
    favorites: [],
    history: [],
    banned: [],
    listening: [],
    resume: null,
  };
}
