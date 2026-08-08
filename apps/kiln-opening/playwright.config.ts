import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "output/playwright/results",
  fullyParallel: false,
  // The local multiplayer backend is process-global and each scenario resets it.
  workers: 1,
  retries: process.env["CI"] === undefined ? 0 : 1,
  reporter: process.env["CI"] === undefined
    ? "line"
    : [["html", { outputFolder: "output/playwright/report", open: "never" }], ["github"]],
  use: {
    baseURL: "http://127.0.0.1:4173/kiln-opening/",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "VITE_E2E_LOCAL_BACKEND=1 npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/kiln-opening/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
