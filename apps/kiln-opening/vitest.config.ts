import { configDefaults, defineConfig } from "vitest/config";

/**
 * Every suite under `test/` runs, except the Playwright e2e specs.
 *
 * This was briefly narrowed to an explicit `test/v122/**` include while the V1.1.6 suites
 * were being retired. That worked, but it meant a new suite outside that one directory
 * would be skipped in silence -- which is how forty-three files went dark without anything
 * failing. Excluding e2e and taking everything else keeps new tests wired in by default.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "test/e2e/**"],
    // Several suites play complete authoritative games; CI runners are far slower than a
    // dev machine, and Vitest's 5s default left the slowest under a second of headroom.
    testTimeout: 30_000,
  },
});
