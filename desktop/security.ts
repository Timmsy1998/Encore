export const origin = "http://127.0.0.1:17843";
export function trustedFrame(url: string, isMain: boolean) {
  return isMain && url === origin + "/";
}
export function safeMessage(error: unknown) {
  const text = error instanceof Error ? error.message : "Operation failed.";
  if (/(token|secret|https?:|api.?key|password=)/i.test(text))
    return "Provider or storage operation failed. Check configuration and reconnect.";
  return text.slice(0, 350);
}
