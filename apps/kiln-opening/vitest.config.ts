import { configDefaults, defineConfig } from "vitest/config";

// These suites assert superseded V0.6.5–V1.0.4 values or preserve completed
// A/B-study fixtures. Keep them as historical evidence, but do not make the
// live V1.0.9 regression gate satisfy obsolete mechanics.
const historicalRulesTests = [
  "test/firing.test.ts",
  "test/imperial_progress.test.ts",
  "test/office_guild.test.ts",
  "test/orders_scoring.test.ts",
  "test/setup.test.ts",
  "test/techniques_kilns.test.ts",
  "test/work_locations.test.ts",
  "test/v065_office.test.ts",
  "test/v100_rules.test.ts",
  "test/v101_fire_deck.test.ts",
  "test/v102_rules.test.ts",
  "test/jun_ab_001.test.ts",
  "test/imperial_track_ab_001.test.ts",
  "test/v104_baseline.test.ts",
  "test/v104_population.test.ts",
  "test/v104_population002.test.ts",
  "test/v104_population003.test.ts",
];

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "test/e2e/**", ...historicalRulesTests],
  },
});
