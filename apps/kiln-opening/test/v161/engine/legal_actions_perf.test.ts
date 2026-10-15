/**
 * The enumeration budget (DESIGN §5.2, §8.2 `legal_actions_perf`): canonical `legalCommands`
 * with default limits runs in under 50 ms on a 4-player Round 4 fixture with 6 Shaped
 * vessels, the Shifu available, an Imperial Kiln and every applicable Tech ready — measured
 * as the median of 20 runs.
 */

import { describe, expect, it } from "vitest";
import { legalActionFamilies, legalCommands, sampleLegalAction } from "../../../src/game/legalActions.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { placementOptions } from "../../../src/game/selectors.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import { buildState } from "./support/fixtures.ts";

const BUDGET_MS = 50;
const RUNS = 20;

/** p1: Ding (Form & Decorate extra), Reworking Table, Kiln Furniture and Second Firing ready,
 * Recognition 3 (Imperial Kiln, Imperial Priority held), 6 Shaped vessels of 6 classes,
 * plenty of resources, a hand with completable Orders; the Shared Kiln partly filled. */
function round4Fixture() {
  return buildState({
    round: 4,
    players: [
      { kilnId: "DI", techs: ["T05", "T15", "T14"], recognition: 3, resources: { clay: 12, wood: 12, coins: 15 }, hand: ["S01", "S02", "O01"] },
      { kilnId: "RU", techs: ["T21"] },
      { kilnId: "GU", techs: ["T22"] },
      { kilnId: "JU" },
    ],
    ceramics: [
      { owner: "p1", stage: "shaped", shape: "bowl" },
      { owner: "p1", stage: "shaped", shape: "plate", decoration: "carved" },
      { owner: "p1", stage: "shaped", shape: "washer", decoration: "impressed" },
      { owner: "p1", stage: "shaped", shape: "vase", decoration: "painted" },
      { owner: "p1", stage: "shaped", shape: "censer" },
      { owner: "p1", stage: "shaped", shape: "bowl", decoration: "painted" },
      { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
      { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" },
      { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
      { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      { owner: "p3", stage: "loaded", shape: "vase", glaze: "grey_green", at: "low_1" },
    ],
  });
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
}

function timeIt(run: () => unknown): number {
  run(); // warm-up
  const samples: number[] = [];
  for (let index = 0; index < RUNS; index += 1) {
    const start = process.hrtime.bigint();
    run();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return median(samples);
}

describe("legal-action budget", () => {
  const view = actorViewOf(round4Fixture(), "p1");

  it(`canonical legalCommands with default limits: median of ${RUNS} runs under ${BUDGET_MS} ms`, () => {
    const commands = legalCommands(view, { mode: "canonical" });
    // Every family of the before-action window is represented, each within the 64 limit
    // (not the Guild Hall: p1 already owns 3 Techs, L211; not the Magistrate's Hall: Recognition 3).
    const types = new Set(commands.map((c) => c.type));
    for (const type of ["USE_IMPERIAL_PRIORITY", "PLACE_MATERIALS_YARD", "PLACE_FORM_DECORATE", "PLACE_GLAZE_LOAD", "PLACE_COMMISSION_MARKET", "PLACE_CANAL_WHARF"]) {
      expect(types.has(type as never), type).toBe(true);
    }
    for (const type of types) {
      expect(commands.filter((c) => c.type === type).length).toBeLessThanOrEqual(64);
    }
    const ms = timeIt(() => legalCommands(view, { mode: "canonical" }));
    console.info(`legalCommands (canonical, ${commands.length} commands): median ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("families, placement options and sampling are well within the budget", () => {
    const families = timeIt(() => legalActionFamilies(view));
    const placements = timeIt(() => placementOptions(view));
    const chooser = new SeededRandom(1);
    const sample = timeIt(() => sampleLegalAction(view, chooser));
    console.info(`legalActionFamilies ${families.toFixed(2)} ms, placementOptions ${placements.toFixed(2)} ms, sampleLegalAction ${sample.toFixed(2)} ms`);
    expect(families).toBeLessThan(BUDGET_MS);
    expect(placements).toBeLessThan(BUDGET_MS);
    expect(sample).toBeLessThan(BUDGET_MS);
  });
});
