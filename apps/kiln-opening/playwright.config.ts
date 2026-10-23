/**
 * Playwright for the V1.6.1 app (UI plan §9.6). Specs live in `e2e/`, outside vitest's
 * `test/**` include, and are not part of `npm test`.
 *
 * - `npm run test:e2e`: every local project against `npm run dev:local` (port 4317).
 * - `npm run test:e2e:ci`: Chromium only, against `vite preview` of `npm run build:e2e`
 *   (`output/dist-e2e`, port 4318; the local backend is mounted through
 *   `configurePreviewServer`): `smoke.spec.ts`, and the `@ci` case of `full_game.spec.ts`.
 *
 * Browsers: `npx playwright install chromium webkit`.
 */

import { defineConfig, devices } from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";

const preview = process.env["KILN_E2E_SERVER"] === "preview";
const port = preview ? 4318 : 4317;
const origin = `http://localhost:${port}`;
/** The app's Vite `base`; pages are addressed relative to it, e.g. `page.goto("next/")`. */
const baseURL = `${origin}/kiln-opening/`;

type Project = NonNullable<PlaywrightTestConfig["projects"]>[number];

/**
 * `KILN_E2E_CHROMIUM_ONLY=1` runs the phone and tablet projects in Chromium with the same
 * viewport, touch and mobile emulation, for a machine without Playwright's WebKit build
 * (`npx playwright install webkit`). The WebKit runs stay the reference; say which one ran.
 */
const chromiumOnly = process.env["KILN_E2E_CHROMIUM_ONLY"] === "1";

function phone(name: string, width: number, height: number): Project {
  const device = chromiumOnly ? devices["Pixel 7"] : devices["iPhone 13"];
  return {
    name,
    use: { ...device, viewport: { width, height }, isMobile: true, hasTouch: true },
  };
}

function tablet(name: string, width: number, height: number): Project {
  if (chromiumOnly) return { name, use: { ...devices["Desktop Chrome"], viewport: { width, height }, hasTouch: true } };
  return { name, use: { ...devices["iPad (gen 7)"], viewport: { width, height } } };
}

function desktop(name: string, width: number, height: number): Project {
  return { name, use: { ...devices["Desktop Chrome"], viewport: { width, height } } };
}

/** The eight local sizes (§9.6 "Projects"). */
const localProjects: Project[] = [
  phone("phone-320", 320, 568),
  phone("phone-390", 390, 844),
  tablet("tablet-768", 768, 1024),
  phone("landscape-844", 844, 390),
  phone("landscape-932", 932, 430),
  tablet("tablet-1024", 1024, 768),
  desktop("desktop-1440", 1440, 900),
  desktop("wide-2560", 2560, 1080),
];

/** The CI job: Chromium at 1440 against the built bundle. */
const ciProjects: Project[] = [
  { ...desktop("ci-smoke", 1440, 900), testMatch: /smoke\.spec\.ts$/ },
  { ...desktop("ci-full-game", 1440, 900), testMatch: /full_game\.spec\.ts$/, grep: /@ci/ },
];

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts$/,
  outputDir: "output/playwright/results",
  snapshotPathTemplate: "e2e/__snapshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: false,
  // One in-memory backend per server process: specs reset it, so they run one at a time.
  workers: 1,
  forbidOnly: process.env["CI"] !== undefined,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"] !== undefined ? [["list"], ["html", { open: "never", outputFolder: "output/playwright/report" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: preview ? ciProjects : localProjects,
  webServer: {
    command: preview
      ? `VITE_E2E_LOCAL_BACKEND=1 npx vite preview --outDir output/dist-e2e --port ${port} --strictPort`
      : `npm run dev:local -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 120_000,
  },
});
