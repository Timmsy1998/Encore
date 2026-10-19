import { expect, it, vi } from "vitest";
import { ProviderHttpError } from "../desktop/providers";
import { playSpotify } from "../desktop/spotify-playback";

it("replaces a stale SDK device on 404 and retries only the Encore device", async () => {
  let device = "old-encore";
  const reconnect = vi.fn(async () => { device = "new-encore"; });
  const play = vi.fn().mockRejectedValueOnce(new ProviderHttpError(404, "gone")).mockResolvedValue(null);
  await playSpotify(() => device, reconnect, play);
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(play.mock.calls).toEqual([["old-encore"], ["new-encore"]]);
});

it("reconnects a missing device without issuing an untargeted playback command", async () => {
  const play = vi.fn();
  await expect(playSpotify(() => "", async () => {}, play)).rejects.toThrow("offline");
  expect(play).not.toHaveBeenCalled();
});

it("does not loop when the replacement device also returns 404", async () => {
  const reconnect = vi.fn(async () => {});
  const play = vi.fn().mockRejectedValue(new ProviderHttpError(404, "gone"));
  await expect(playSpotify(() => "encore", reconnect, play)).rejects.toThrow("gone");
  expect(reconnect).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledTimes(2);
});

for (const status of [401, 403, 429, 500]) {
  it(`preserves ${status} errors without rebuilding the SDK`, async () => {
    const reconnect = vi.fn();
    const failure = new ProviderHttpError(status, "provider failure");
    await expect(playSpotify(() => "encore", reconnect, vi.fn().mockRejectedValue(failure))).rejects.toBe(failure);
    expect(reconnect).not.toHaveBeenCalled();
  });
}
