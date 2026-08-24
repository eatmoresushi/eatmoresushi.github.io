import { describe, expect, it } from "vitest";
import {
  ACTION_LOCATION_PRICES, COLOUR_SAMPLES_LOOK, CONNOISSEUR_SALE_COINS, FUEL_LEDGER_WOOD,
  GE_ACTIVATION_WOOD, GE_CORRECTABLE_DIFFERENCES, GUAN_ORDER_COINS, GUAN_ORDER_VP,
  JUN_ACTIVATION_WOOD, KILN_DEFINITIONS, LOCATION_DEFINITIONS, LOCATION_IDS, RU_ORDER_VP,
  SHAPE_COSTS, TECHNIQUE_DEFINITIONS,
} from "../src/game";
import type { KilnId, LocationId } from "../src/game";

/**
 * Every number printed on a card or board, in order, must equal what the code says.
 *
 * The first attempt at this guard whitelisted 1, 2 and 3 as "ordinary English counts",
 * which is nearly every number in the game — thirty tests passed while catching nothing.
 * Reintroducing Colour Samples' false "top 3", and repricing Jun without touching its card,
 * both sailed through. So this compares the *exact sequence* instead: any change on either
 * side moves the sequence and fails.
 *
 * The limit is honest — this checks numbers, not meaning. Text that says "spend" where the
 * code says "gain" still passes. But all six printed-versus-enforced defects found so far
 * were numbers.
 */
const numbersIn = (text: string): number[] =>
  [...text.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));

const T = (name: string): string =>
  (Object.values(TECHNIQUE_DEFINITIONS) as Array<{ name: string; ability: string }>)
    .find((t) => t.name === name)!.ability;
const L = (id: LocationId) => LOCATION_DEFINITIONS[id] as { apprentice: string; shifu: string };
const [geLow, geHigh] = GE_CORRECTABLE_DIFFERENCES as readonly [number, number];

/** [label, printed text, the exact sequence the code implies]. */
const cases: Array<[string, string, number[]]> = [
  // Techniques
  ["Measuring Calipers", T("Measuring Calipers"), [1, 1]],
  ["Clay Substitution", T("Clay Substitution"), [3, 3]],
  ["Colour Samples", T("Colour Samples"), [COLOUR_SAMPLES_LOOK]],
  ["Protective Saggars", T("Protective Saggars"), [1]],
  ["Fuel Ledger", T("Fuel Ledger"), [FUEL_LEDGER_WOOD, 2, 1]],
  ["Test Pieces", T("Test Pieces"), [1]],
  ["Kiln Records", T("Kiln Records"), [1, 1]],
  ["Connoisseur Network", T("Connoisseur Network"),
    [CONNOISSEUR_SALE_COINS.standard, CONNOISSEUR_SALE_COINS.fine, CONNOISSEUR_SALE_COINS.masterpiece]],
  ["Sagger Selection", T("Sagger Selection"), [2, 1, 0]],
  // Kiln Traditions
  ["kiln RU", KILN_DEFINITIONS.RU.ability, [RU_ORDER_VP]],
  ["kiln GU", KILN_DEFINITIONS.GU.ability, [GUAN_ORDER_COINS, GUAN_ORDER_VP]],
  ["kiln GE", KILN_DEFINITIONS.GE.ability, [GE_ACTIVATION_WOOD, geLow, geHigh]],
  ["kiln JU", KILN_DEFINITIONS.JU.ability, [JUN_ACTIVATION_WOOD, 1, 1]],
  // Action locations
  ["materials_yard.apprentice", L("materials_yard").apprentice, [3]],
  ["materials_yard.shifu", L("materials_yard").shifu, [4, 1, 1]],
  ["forming_studio.apprentice", L("forming_studio").apprentice, [1]],
  ["forming_studio.shifu", L("forming_studio").shifu, [2, SHAPE_COSTS.bowl]],
  ["glaze_workshop.apprentice", L("glaze_workshop").apprentice, [1, 1, 1]],
  ["glaze_workshop.shifu", L("glaze_workshop").shifu, [2]],
  ["kiln_yard.apprentice", L("kiln_yard").apprentice, [1]],
  ["kiln_yard.shifu", L("kiln_yard").shifu, [2]],
  ["market_imperial_office.apprentice", L("market_imperial_office").apprentice,
    [1, 1, ACTION_LOCATION_PRICES.flawedSaleCoins]],
  ["market_imperial_office.shifu", L("market_imperial_office").shifu,
    [2, 2, ACTION_LOCATION_PRICES.flawedSaleCoins]],
  ["guild_academy.apprentice", L("guild_academy").apprentice, [1]],
  ["guild_academy.shifu", L("guild_academy").shifu, [1, 1, 1, 0]],
  ["labour.apprentice", L("labour").apprentice, [ACTION_LOCATION_PRICES.labourApprenticeCoins]],
  ["labour.shifu", L("labour").shifu, [ACTION_LOCATION_PRICES.labourShifuCoins]],
  ["court_patronage.shifu", L("court_patronage").shifu,
    [1, ACTION_LOCATION_PRICES.courtPatronageCoins, 1, 4, 5]],
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
    for (const t of Object.values(TECHNIQUE_DEFINITIONS) as Array<{ name: string; ability: string }>) {
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
});
