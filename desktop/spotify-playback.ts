import { ProviderHttpError } from "./providers";

// Device IDs come only from Encore's authenticated SDK page, never device discovery.
export async function playSpotify(
  device: () => string,
  reconnect: () => Promise<void>,
  play: (id: string) => Promise<unknown>,
) {
  if (device()) {
    try {
      await play(device());
      return;
    } catch (error) {
      if (!(error instanceof ProviderHttpError) || error.status !== 404) throw error;
    }
  }
  await reconnect();
  const id = device();
  if (!id) throw Error("Spotify browser player is offline. Retry Play or reconnect in Setup.");
  await play(id);
}
