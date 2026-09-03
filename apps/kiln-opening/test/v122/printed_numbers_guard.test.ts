import { describe, expect, it } from "vitest";
import {
  ACTION_LOCATION_PRICES, COLOUR_SAMPLES_LOOK, FUEL_LEDGER_WOOD,
  GE_CORRECTABLE_DIFFERENCES, GUAN_ORDER_COINS, JUN_ACTIVATION_WOOD,
  KILN_DEFINITIONS, LOCATION_DEFINITIONS, LOCATION_IDS, RU_ORDER_VP,
  STARTING_TECHNIQUES, TECHNIQUE_DEFINITIONS,
} from "../../src/game/index.ts";
import type { KilnId, LocationId } from "../../src/game/index.ts";

/**
 * Every number printed on a card or board, in order, must equal what the code says.
 *
 * The first attempt at this guard whitelisted 1, 2 and 3 as "ordinary English counts",
 * which is nearly every number in the game -- thirty tests passed while catching nothing.
 * Reintroducing Colour Samples' false "top 3", and repricing Jun without touching its card,
 * both sailed through. So this compares the *exact sequence* instead: any change on either
 * side moves the sequence and fails.
 *
 * The limit is honest -- this checks numbers, not meaning. Text that says "spend" where the
 * code says "gain" still passes. But all six printed-versus-enforced defects found so far
 * were numbers.
 */
const numbersIn = (text: string): number[] =>
  [...text.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));

const T = (name: string): string =>
  [...Object.values(TECHNIQUE_DEFINITIONS), ...STARTING_TECHNIQUES]
    .find((t) => t.name === name)!.ability;
const L = (id: LocationId) => LOCATION_DEFINITIONS[id];
const [geDifference] = GE_CORRECTABLE_DIFFERENCES as readonly [number];

/** [label, printed text, the exact sequence the code implies]. */
const cases: Array<[string, string, number[]]> = [
  // Advanced Techs
  ["Large Throwing Wheel", T("Large Throwing Wheel"), [1, 1]],
  ["Measuring Calipers", T("Measuring Calipers"), [1]],
  ["Standardised Moulds", T("Standardised Moulds"), [1]],
  ["Drying Frames", T("Drying Frames"), [1]],
  ["Reworking Table", T("Reworking Table"), [1]],
  ["Glaze Palette", T("Glaze Palette"), [1]],
  ["Carving Knives", T("Carving Knives"), [0]],
  ["Seal Stamps", T("Seal Stamps"), [0]],
  ["Crackle Slips", T("Crackle Slips"), [0]],
  ["Colour Samples", T("Colour Samples"), [COLOUR_SAMPLES_LOOK, 1]],
  ["Protective Saggars", T("Protective Saggars"), [1, 1]],
  // The commitment is 1 Wood; the two 2s are the -2/+2 Contribution it produces.
  ["Fuel Ledger", T("Fuel Ledger"), [FUEL_LEDGER_WOOD, 2, 2]],
  ["Test Pieces", T("Test Pieces"), [1]],
  ["Second Firing", T("Second Firing"), [1, 1]],
  ["Kiln Furniture", T("Kiln Furniture"), [0]],
  // Starting Techs
  ["Prepared Clay", T("Prepared Clay"), [1]],
  ["White Slip", T("White Slip"), [1]],
  ["Rapid Drying", T("Rapid Drying"), [1, 1]],
  ["Kiln Tending", T("Kiln Tending"), [1, 2]],
  // Kiln Traditions
  ["kiln RU", KILN_DEFINITIONS.RU.ability, [RU_ORDER_VP]],
  // Guan pays Coins only in V1.2.2; the leading 1 is "at least 1 Crown".
  ["kiln GU", KILN_DEFINITIONS.GU.ability, [1, GUAN_ORDER_COINS]],
  // Ge's correction is free, so the only number is the Heat Difference it may correct.
  ["kiln GE", KILN_DEFINITIONS.GE.ability, [geDifference]],
  ["kiln JU", KILN_DEFINITIONS.JU.ability, [JUN_ACTIVATION_WOOD, 1, 1]],
  // Action locations
  ["materials_yard.apprentice", L("materials_yard").apprentice, [3]],
  ["materials_yard.shifu", L("materials_yard").shifu, [4, 1, 1, 1]],
  ["forming_studio.apprentice", L("forming_studio").apprentice, [1]],
  ["forming_studio.shifu", L("forming_studio").shifu, [2, 2, 1]],
  ["glaze_workshop.apprentice", L("glaze_workshop").apprentice, [1]],
  ["glaze_workshop.shifu", L("glaze_workshop").shifu, [2, 0]],
  ["kiln_yard.apprentice", L("kiln_yard").apprentice, [1]],
  ["kiln_yard.shifu", L("kiln_yard").shifu, [2, 1]],
  ["market_imperial_office.apprentice", L("market_imperial_office").apprentice, [1, 1, 1, 1]],
  ["market_imperial_office.shifu", L("market_imperial_office").shifu, [2, 1, 1, 1]],
  ["guild_academy.apprentice", L("guild_academy").apprentice, [1]],
  ["guild_academy.shifu", L("guild_academy").shifu, [1, 1, 1, 0]],
  ["labour.apprentice", L("labour").apprentice, [ACTION_LOCATION_PRICES.labourApprenticeCoins]],
  ["labour.shifu", L("labour").shifu, [ACTION_LOCATION_PRICES.labourShifuCoins]],
];

describe("printed numbers match the code exactly", () => {
  for (const [label, text, expected] of cases) {
    it(label, () => {
      expect(numbersIn(text), `"${text}"`).toEqual(expected);
    });
  }

  it("covers every Technique, Kiln and location that prints a number", () => {
    const covered = new Set(cases.map(([label]) => label));
    const missing: string[] = [];
    for (const t of [...Object.values(TECHNIQUE_DEFINITIONS), ...STARTING_TECHNIQUES]) {
      if (numbersIn(t.ability).length > 0 && !covered.has(t.name)) missing.push(`technique ${t.name}`);
    }
    for (const id of Object.keys(KILN_DEFINITIONS) as KilnId[]) {
      if (numbersIn(KILN_DEFINITIONS[id].ability).length > 0 && !covered.has(`kiln ${id}`)) missing.push(`kiln ${id}`);
    }
    for (const id of LOCATION_IDS) {
      for (const role of ["apprentice", "shifu"] as const) {
        if (numbersIn(L(id)[role]).length > 0 && !covered.has(`${id}.${role}`)) missing.push(`${id}.${role}`);
      }
    }
    expect(missing, `not guarded: ${missing.join(", ")}`).toEqual([]);
  });

  /** Workshop Seconds prints its payout in the rulebook, not on a card, so guard it here. */
  it("pays Workshop Seconds the Coins V1.2.2 firing step 11 prints", () => {
    expect(ACTION_LOCATION_PRICES.workshopSecondsCoins).toBe(2);
  });
});
