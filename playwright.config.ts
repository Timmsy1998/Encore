import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:5173", headless: true },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: "narrow-125",
      use: { viewport: { width: 900, height: 700 }, deviceScaleFactor: 1.25 },
    },
    {
      name: "minimum-150",
      use: { viewport: { width: 760, height: 600 }, deviceScaleFactor: 1.5 },
    },
  ],
});
