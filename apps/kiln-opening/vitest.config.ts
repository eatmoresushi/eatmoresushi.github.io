import { configDefaults, defineConfig } from "vitest/config";

// These suites assert superseded V0.6.5–V1.0.9 values or preserve completed
// A/B-study fixtures. Keep them as historical evidence, but do not make the
// live V1.1.1 regression gate satisfy obsolete mechanics.
const historicalRulesTests = [
  "test/imperial_progress.test.ts",
  "test/office_guild.test.ts",
  "test/setup.test.ts",
  "test/techniques_kilns.test.ts",
  "test/work_locations.test.ts",
  "test/v065_office.test.ts",
  "test/jun_ab_001.test.ts",
  "test/imperial_track_ab_001.test.ts",
  "test/v104_baseline.test.ts",
  "test/v104_population.test.ts",
  "test/v104_population002.test.ts",
  "test/v104_population003.test.ts",
  // Suites pinned to rulesets the engine no longer implements. v1.1.4 removed the
  // numeric contribution, the contributor-count formula, the rebate and the Progress
  // stipends, so anything asserting those was deleted rather than migrated.
  "test/v109_bilingual_parity.test.ts",
  "test/v109_population.test.ts",
];

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "test/e2e/**", ...historicalRulesTests],
    // Several suites play complete authoritative games or run belief rollouts, and the
    // GitHub runner is roughly three times slower than a dev machine. V1.1.1 widened
    // the search further: Wood bids now genuinely vary across 0-3 instead of collapsing
    // onto one value, so rollouts explore more branches. Vitest's 5s default left the
    // slowest of these under a second of headroom in CI. This is generous enough that
    // normal variance cannot fail the build, while still failing fast on a real hang.
    testTimeout: 30_000,
  },
});
