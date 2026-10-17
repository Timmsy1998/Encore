import { describe, expect, it } from "vitest";
import { CommandSchema, defaults, migrate, OverlayAppearanceSchema, SettingsSchema } from "../src/core/contracts";
import { overlayAppearance, overlayUrl } from "../src/core/overlays";
const id = "5f3bf9f0-e41f-4c13-9b3c-cb893b38dc2b";
describe("independent overlays", () => {
  it("migrates existing appearance and persists independent presets", () => {
    const old = defaults();
    const settings = { ...old.settings } as Record<string, unknown>;
    delete settings.overlayPresets;
    settings.overlayTheme = "glass";
    const state = migrate({ ...old, settings });
    expect(state.settings.overlayPresets).toEqual([]);
    const appearance = OverlayAppearanceSchema.parse({ overlayTheme: "minimal" });
    state.settings.overlayPresets.push({ id, name: "Small box", appearance });
    const restored = migrate(JSON.parse(JSON.stringify(state)));
    expect(overlayAppearance(restored.settings).overlayTheme).toBe("glass");
    expect(overlayAppearance(restored.settings, id).overlayTheme).toBe("minimal");
    expect(overlayAppearance(restored.settings)).not.toHaveProperty("overlayPresets");
    restored.settings.overlayPresets = [];
    expect(() => overlayAppearance(restored.settings, id)).toThrow("no longer exists");
  });
  it("keeps URLs stable across names and validates preset identity and bounds", () => {
    const base = "http://127.0.0.1:17843/overlay.html";
    expect(overlayUrl(base)).toBe(base);
    expect(overlayUrl(base, id, true)).toBe(`${base}?preset=${id}&test=1`);
    const preset = { id, name: "Box", appearance: {} };
    expect(SettingsSchema.safeParse({ overlayPresets: [preset, preset] }).success).toBe(false);
    expect(SettingsSchema.safeParse({ overlayPresets: [{ ...preset, name: " " }] }).success).toBe(false);
    expect(SettingsSchema.safeParse({ overlayPresets: [{ ...preset, appearance: { overlayWidth: 10000 } }] }).success).toBe(false);
    expect(CommandSchema.safeParse({ type: "copyOverlayUrl", presetId: "../../secrets" }).success).toBe(false);
    expect(CommandSchema.parse({ type: "settings", settings: { volume: 50 } })).toEqual({ type: "settings", settings: { volume: 50 } });
  });
});
