import { defineConfig } from "vitest/config";

/**
 * Every suite under `test/` runs.
 *
 * This was briefly narrowed to an explicit `test/v122/**` include while the V1.1.6 suites
 * were being retired. That worked, but it meant a new suite outside that one directory
 * would be skipped in silence -- which is how forty-three files went dark without anything
 * failing. Take everything under `test/`, so new tests are wired in by default.
 */
export default defineConfig({
  test: {
    // Only the checked-in suites. Throwaway verification probes under output/ (gitignored)
    // must never decide whether the repository's tests pass.
    include: ["test/**/*.test.{ts,tsx}"],
    // Several suites play complete authoritative games; CI runners are far slower than a
    // dev machine, and Vitest's 5s default left the slowest under a second of headroom.
    testTimeout: 30_000,
    // One event-loop turn after every test, so a long file can never starve Vitest's fixed 60 s
    // worker RPC: "[vitest-worker]: Timeout calling onTaskUpdate" failed the Pages deploy of #25
    // with every test passing (2026-10-24; see the setup file).
    setupFiles: ["test/setup/yieldEventLoop.ts"],
  },
});
