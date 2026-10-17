import { OverlayAppearanceSchema, type Settings } from "./contracts";

export function overlayAppearance(settings: Settings, presetId?: string) {
  if (!presetId) return OverlayAppearanceSchema.parse(settings);
  const preset = settings.overlayPresets.find(preset => preset.id === presetId);
  if (!preset) throw new Error("Overlay no longer exists. Choose another overlay in Encore.");
  return preset.appearance;
}

export function overlayUrl(base: string, presetId?: string, test = false) {
  const url = new URL(base);
  if (presetId) url.searchParams.set("preset", presetId);
  if (test) url.searchParams.set("test", "1");
  return url.href;
}
