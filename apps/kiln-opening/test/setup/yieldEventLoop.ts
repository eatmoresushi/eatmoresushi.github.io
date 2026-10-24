/**
 * Let the worker's event loop run after every test.
 *
 * Vitest's runner sends throttled task updates to the main process over RPC (birpc, a fixed
 * 60 s timeout) and runs a file's tests back to back with only microtask breaks. A file whose
 * tests compute for more than 60 s in a row (computer_legality.test.ts on GitHub's runner)
 * never reaches the poll phase, so the main process's reply sits unread while the timeout timer
 * fires first: "[vitest-worker]: Timeout calling onTaskUpdate", an unhandled error that fails
 * `npm test` with every test passing (Pages deploy of #25, 2026-10-24). One macrotask turn
 * after each test lets the reply in; the longest single test (about 28 s on CI) stays well
 * inside the timeout. `node:timers/promises` is used so fake timers can never stall it.
 */
import { setImmediate as nextMacrotask } from "node:timers/promises";
import { afterEach } from "vitest";

afterEach(async () => {
  await nextMacrotask();
});
