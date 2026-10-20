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
export const SongSearchInputSchema = z.string().trim().min(1).max(1000);
export type SongSearchResult = { tracks: Track[]; warnings: string[] };
export const OverlayAppearanceSchema = z.object({
  overlayAccent: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .default("#e5aa73"),
  overlayCompact: z.boolean().default(false),
  overlayLayout: z.enum(["horizontal", "vertical"]).default("horizontal"),
  overlayCanvas: z.boolean().default(false),
  overlayVinyl: z.boolean().default(false),
  overlayTheme: z.enum(["card", "glass", "minimal"]).default("card"),
  overlayBackground: z.string().regex(/^#[a-fA-F0-9]{6}$/).default("#17191f"),
  overlayText: z.string().regex(/^#[a-fA-F0-9]{6}$/).default("#ffffff"),
  overlayOpacity: z.number().int().min(0).max(100).default(92),
  overlayRadius: z.number().int().min(0).max(48).default(24),
  overlayWidth: z.number().int().min(300).max(900).default(560),
  overlayArtwork: z.boolean().default(true),
  overlayProgress: z.boolean().default(true),
  overlayRequester: z.boolean().default(true),
  overlayHidePaused: z.boolean().default(false),
});
export type OverlayAppearance = z.infer<typeof OverlayAppearanceSchema>;
export const OverlayPresetSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  appearance: OverlayAppearanceSchema,
});
export const SettingsSchema = z.object({
  wsPort: z.number().int().min(1).max(65535).default(8080),
  clientId: z
    .string()
    .regex(/^([a-f0-9]{32})?$/)
    .default(""),
  requests: z.boolean().default(true),
  repeatBase: z.boolean().default(true),
  volume: z.number().int().min(0).max(100).default(70),
  userLimit: z.number().int().min(1).max(1000).default(5),
  globalLimit: z.number().int().min(1).max(10000).default(100),
  maxMinutes: z.number().int().min(1).max(1440).default(15),
  votes: z.number().int().min(1).max(1000).default(5),
  discordEnabled: z.boolean().default(false),
  discordClientId: z.string().regex(/^[0-9]{17,20}$/).default("1562085890510159892"),
  discordShowPaused: z.boolean().default(false),
  discordArtwork: z.boolean().default(true),
  discordDownloadButton: z.boolean().default(true),
  closeToTray: z.boolean().default(false),
  launchAtLogin: z.boolean().default(false),
  setupStep: z.number().int().min(0).max(8).default(0),
  setupComplete: z.boolean().default(false),
  ...OverlayAppearanceSchema.shape,
  overlayPresets: z.array(OverlayPresetSchema).max(20).refine(
    presets => new Set(presets.map(preset => preset.id)).size === presets.length,
    "Overlay IDs must be unique",
  ).default([]),
  reply: z.string().max(500).default("@{user} · {message}"),
});
export type Settings = z.infer<typeof SettingsSchema>;
// Defaults belong to full settings loads, never to a partial update. Zod's
// partial() preserves inner defaults and would reset every omitted setting.
type SettingsShape = typeof SettingsSchema.shape;
const SettingsPatchSchema = z.object(
  Object.fromEntries(
    Object.entries(SettingsSchema.shape).map(([key, schema]) => [
      key,
      schema.removeDefault().optional(),
    ]),
  ) as {
    [K in keyof SettingsShape]: z.ZodOptional<
      ReturnType<SettingsShape[K]["removeDefault"]>
    >;
  },
);
export const PlaylistSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  tracks: z.array(TrackSchema).max(10000),
});
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
  playlists: z.array(PlaylistSchema).max(100).refine(
    items => new Set(items.map(item => item.id)).size === items.length,
    "Playlist IDs must be unique",
  ).default([]),
  activePlaylistId: z.uuid().nullable().default(null),
  baseShuffle: z.boolean().default(false),
  base: z.array(TrackSchema).max(10000),
  favorites: z.array(TrackSchema).max(10000),
  history: z.array(TrackSchema).max(1000),
  banned: z.array(z.string().max(100)).max(10000),
}).refine(state => state.activePlaylistId === null || state.playlists.some(item => item.id === state.activePlaylistId), "Active playlist must exist in the library");
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
  discordStatus?: string;
  updateStatus?: string;
  updateReady?: boolean;
  playbackGeneration?: number;
  progress?: { position: number; observedAt: number; active: boolean } | null;
};
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("seek"), key: z.string().max(100), generation: z.number().int().nonnegative(), position: z.number().min(0).max(86400) }),
  z.object({ type: z.literal("playlistShuffle"), enabled: z.boolean() }),
  z.object({ type: z.literal("playlistCreate"), id: z.uuid(), name: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("playlistReorder"), id: z.uuid(), to: z.number().int().nonnegative() }),
  z.object({ type: z.literal("playlistRename"), id: z.uuid(), name: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("playlistDelete"), id: z.uuid() }),
  z.object({ type: z.literal("playlistActivate"), id: z.uuid(), shuffle: z.boolean().default(false) }),
  z.object({ type: z.literal("playlistStop") }),
  z.object({ type: z.enum(["playlistAdd", "playlistImport"]), id: z.uuid(), input: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("playlistRemove"), id: z.uuid(), key: z.string().max(100) }),
  z.object({ type: z.literal("playlistMove"), id: z.uuid(), from: z.number().int().nonnegative(), to: z.number().int().nonnegative() }),
  z.object({ type: z.literal("settings"), settings: SettingsPatchSchema }),
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
      "diagnostics",
      "copyImport",
      "copyRedirectUri",
      "checkImport",
      "checkUpdates",
      "installUpdate",
      "showPlayer",
    ]),
  }),
  z.object({
    type: z.enum(["copyOverlayUrl", "overlayTest"]),
    presetId: z.uuid().optional(),
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
  searchSongs(input: string): Promise<SongSearchResult>;
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
    playlists: [],
    activePlaylistId: null,
    baseShuffle: false,
    favorites: [],
    history: [],
    banned: [],
    listening: [],
    resume: null,
  };
}
