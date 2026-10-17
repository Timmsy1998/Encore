import { test, expect, type Page } from "@playwright/test";
import { defaults, type Snapshot } from "../src/core/contracts";
async function boot(page: Page, setup = false, updateReady = false) {
  const state: Snapshot = {
    ...defaults(),
    current: null,
    playing: false,
    currentLane: "request",
    streamerbot: "Disconnected",
    youtube: "Not tested",
    spotify: "Disconnected",
    error: "",
    logs: [],
    secureStorage: false,
    overlayUrl: "http://127.0.0.1:17843/overlay.html",
    dataPath: "Development fixture",
    appVersion: "1.0.0",
    importStatus: "Not checked",
    updateReady,
    updateStatus: updateReady ? "Encore 1.0.1 is ready." : "Not checked",
  };
  state.settings.setupComplete = !setup;
  await page.addInitScript((initial) => {
    const state =
      JSON.parse(localStorage.getItem("fixture-state") || "null") || initial;
    const callbacks = new Set<(state: Snapshot) => void>();
    window.encore = {
      snapshot: async () => state,
      subscribe: (callback) => {
        callbacks.add(callback);
        return () => {
          callbacks.delete(callback);
        };
      },
      command: async (c) => {
        if (c.type === "settings") Object.assign(state.settings, c.settings);
        if (c.type === "request" || c.type === "listen")
          throw Error("Provider unavailable: development test fixture.");
        localStorage.setItem("fixture-state", JSON.stringify(state));
        callbacks.forEach((callback) => callback(structuredClone(state)));
      },
    };
  }, state);
  await page.goto("/");
}
test("resumable wizard and optional services", async ({ page }) => {
  await boot(page, true);
  await expect(
    page.getByRole("heading", { name: "Set up Encore" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "WebSocket port" }),
  ).toHaveValue("8080");
  await page.getByRole("button", { name: "Continue / skip" }).click();
  await expect(
    page.getByRole("button", { name: "Copy actions" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Copy actions" }),
  ).toBeVisible();
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "Continue / skip" }).click();
  await expect(
    page.getByRole("textbox", { name: "Test request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open player" }).click();
  await expect(
    page.getByRole("heading", { name: "Request queue" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Request queue" }),
  ).toBeVisible();
});
test("personal listening, errors, navigation and window scaling", async ({
  page,
}, testInfo) => {
  await boot(page);
  await page.getByRole("button", { name: "Listening", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Listening", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Add listening track" })
    .fill("A song to find");
  await page.getByRole("button", { name: "Add music", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Provider unavailable");
  await expect(
    page.getByRole("textbox", { name: "Add listening track" }),
  ).toHaveValue("A song to find");
  for (const name of ["Overlay", "Settings", "About", "Queue"]) {
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const content = page.locator(".content");
    expect(
      await content.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    ).toBe(true);
  }
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/workspace-${testInfo.project.name}.png`,
  });
});

test("downloaded update stays available across navigation and restarts only on request", async ({ page }) => {
  await boot(page, false, true);
  const restart = page.getByRole("button", { name: "Restart and install", exact: true });
  await expect(restart).toBeVisible();
  await page.getByRole("button", { name: "Listening", exact: true }).click();
  await expect(restart).toBeVisible();
  await page.evaluate(() => {
    const command = window.encore.command;
    window.encore.command = async (value) => {
      if (value.type === "installUpdate") localStorage.setItem("restart-requested", "yes");
      await command(value);
    };
  });
  expect(await page.evaluate(() => localStorage.getItem("restart-requested"))).toBeNull();
  await restart.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("restart-requested"))).toBe("yes");
});
