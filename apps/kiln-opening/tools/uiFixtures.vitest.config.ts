import { defineConfig } from "vitest/config";

/**
 * Runs the UI fixture generator (tools/uiFixtures.ts) under Vitest:
 *   npx vitest run --config tools/uiFixtures.vitest.config.ts
 * Not part of `npm test` (the root config only includes test/**).
 */
export default defineConfig({
  test: {
    include: ["tools/uiFixtures.ts"],
    testTimeout: 600_000,
  },
});
