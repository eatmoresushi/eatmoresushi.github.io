import { defineConfig } from "vitest/config";

/**
 * Runs the UI fixture generator (tools/uiFixtures.ts, tests target) under Vitest:
 *   npx vitest run --config tools/uiFixtures.vitest.config.ts
 * `KILN_UI_FIXTURES_CHECK=1` compares instead of writing. Not part of `npm test` (the root
 * config only includes test/**). The generator registers its test only when
 * `KILN_UI_FIXTURES_VITEST` is set, so importing it from a test (fixtures_current) runs nothing.
 */
export default defineConfig({
  test: {
    include: ["tools/uiFixtures.ts"],
    testTimeout: 600_000,
    env: { KILN_UI_FIXTURES_VITEST: "1" },
  },
});
