import { describe, expect, it } from "vitest";
import {
  ACTION_LOCATION_PRICES, DECORATION_COSTS, FIRE_CARDS, FUEL_LEDGER_WOOD, GAME_CONFIG,
  GE_ACTIVATION_WOOD, GE_CORRECTABLE_DIFFERENCES, GUAN_ORDER_COINS, GUAN_ORDER_VP,
  IMPERIAL_ORDERS, IMPERIAL_PROGRESS, JUN_ACTIVATION_WOOD, KILN_SPACE_DEFINITIONS, LOCATION_IDS,
  MARKET_ORDERS, RU_BONUS_DECORATION, RU_BONUS_GLAZE, RU_BONUS_QUALITY, RU_ORDER_VP, SHAPE_COSTS,
  TECHNIQUES, activeKilnSpaceIds, kilnZoneModifier, locationCapacity, orderHandLimit,
  preferredHeat, qualityFromDifference,
} from "../src/game";
import type { PlayerCount } from "../src/game";

/**
 * Every value the v1.1.5 rulebook states, checked against the code that implements it.
 *
 * Written after a session in which the printed rules and the engine disagreed six separate
 * times -- Guan's hand limit, the Office's Coin mode, Fuel Ledger's surcharge, Court
 * Patronage's reported cost, Ding's Clay cost and Jun's Wood cost. Each was invisible to the
 * suite because the engine was internally consistent; only a player reading the rules could
 * tell. This transcribes the rulebook so that any future divergence fails here.
 *
 * Section numbers refer to the v1.1.5 rulebook.
 */
describe("v1.1.5 rulebook conformance", () => {
  const checks: Array<[string, unknown, unknown]> = [];
  const check = (label: string, got: unknown, want: unknown): void => { checks.push([label, got, want]); };

// Section 3 -- Setup
  check("§3 starting resources", GAME_CONFIG.startingResources, { clay: 2, wood: 2, coins: 3 });
  check("§3 workers", GAME_CONFIG.workers,
  { shifu: 1, apprenticesTotal: 5, apprenticesStarting: 3, apprenticeUnlockProgress: [1, 3] });
  check("§3 Order displays 4/4", [GAME_CONFIG.orderDisplay.market, GAME_CONFIG.orderDisplay.imperial], [4, 4]);
  check("§3 rounds", GAME_CONFIG.rounds, 5);
// Section 3 -- action capacity table
const capTable: Record<string, [number, number, number]> = {
  materials_yard: [2, 3, 4], forming_studio: [2, 3, 4], glaze_workshop: [2, 3, 4],
  kiln_yard: [3, 4, 5], market_imperial_office: [2, 3, 4], guild_academy: [1, 2, 3],
};
for (const [id, want] of Object.entries(capTable)) {
  check(`§3 capacity ${id}`, ([2, 3, 4] as PlayerCount[]).map((n) => locationCapacity(id as never, n)), want);
}
for (const id of ["labour", "court_patronage"] as const) {
  const uncapped = ([2, 3, 4] as PlayerCount[]).every((n) => locationCapacity(id, n) > 4);
  check(`§3 ${id} uncapped`, uncapped, true);
}
// Section 3 / 8 -- kiln layout
for (const [n, want] of [[2, { high: 2, middle: 1, low: 2 }], [3, { high: 2, middle: 2, low: 2 }], [4, { high: 3, middle: 2, low: 2 }]] as const) {
  const active = activeKilnSpaceIds(n as PlayerCount);
  const tally = { high: 0, middle: 0, low: 0 };
  for (const id of active) {
    const m = kilnZoneModifier(id);
    if (m === 1) tally.high += 1; else if (m === 0) tally.middle += 1; else tally.low += 1;
  }
  check(`§8 kiln layout ${n}P`, tally, want);
}
  check("§3 hand limit (uniform, no Guan exception)", orderHandLimit(), 3);
// Section 6 -- production
  check("§6 Shape costs", SHAPE_COSTS, { bowl: 1, plate: 1, washer: 1, vase: 2, censer: 2 });
  check("§6 Glaze Preferred Heat", ["white", "celadon", "grey_green", "moon_white"].map((g) => preferredHeat(g as never)), [1, 2, 3, 4]);
  check("§6 Decoration costs", DECORATION_COSTS, { plain: 1, carved: 2, impressed: 2, crackle: 2 });
// Section 8 -- Quality table
  check("§8 Quality by difference", [0, 1, 2, 3].map((d) => qualityFromDifference(d)), ["masterpiece", "fine", "standard", "flawed"]);
// Appendix A / C
  check("App A deck sizes", [MARKET_ORDERS.length, IMPERIAL_ORDERS.length], [30, 22]);
const fire: Record<string, number> = {};
for (const m of FIRE_CARDS) fire[String(m)] = (fire[String(m)] ?? 0) + 1;
  check("App C Fire deck (cards)", fire, { "-2": 1, "-1": 3, "0": 4, "1": 3, "2": 1 });
  check("App C Fire deck size", FIRE_CARDS.length, 12);
  check("App C Fire deck (config table)", GAME_CONFIG.fireDeck, { "-2": 1, "-1": 3, "0": 4, "1": 3, "2": 1 });
  check("App B Technique count", TECHNIQUES.length, 15);
// Section 9 -- Imperial Progress
  check("§9 Progress end-game VP", GAME_CONFIG.imperialProgressEndGameVp, [0, 0, 2, 2, 4, 8]);
  check("§9 Imperial Seal VP", GAME_CONFIG.imperialSealVp, 2);
  check("§9 every Imperial Order gives 1 Progress per ceramic",
  IMPERIAL_ORDERS.every((o) => (o as { imperialProgressReward?: number }).imperialProgressReward === o.ceramics.length), true);
// Section 11 -- scoring
  check("§11 Coins convert 3:1, max 5", GAME_CONFIG.coinEndGame, { coinsPerVp: 3, maxVp: 5 });
// Section 10 -- Kiln abilities
  check("§10 Ru trigger", [RU_BONUS_GLAZE, RU_BONUS_DECORATION, RU_BONUS_QUALITY], ["celadon", "plain", "masterpiece"]);
  check("§10 Ru award", RU_ORDER_VP, 4);
  check("§10 Guan award", [GUAN_ORDER_COINS, GUAN_ORDER_VP], [2, 1]);
  check("§10 Ge cost / window", [GE_ACTIVATION_WOOD, [...GE_CORRECTABLE_DIFFERENCES]], [1, [1, 2]]);
  check("§10 Jun cost", JUN_ACTIVATION_WOOD, 3);
// Section 5 / App B -- location and Technique prices
  check("§5 Labour Coins", [ACTION_LOCATION_PRICES.labourApprenticeCoins, ACTION_LOCATION_PRICES.labourShifuCoins], [2, 4]);
  check("§5 Court Patronage Coins", ACTION_LOCATION_PRICES.courtPatronageCoins, 4);
  check("§5 Flawed sale Coins", ACTION_LOCATION_PRICES.flawedSaleCoins, 2);
  check("App B Fuel Ledger surcharge", FUEL_LEDGER_WOOD, 1);
  check("§3 location count", LOCATION_IDS.length, 8);
  check("App A/§8 kiln spaces total", Object.keys(KILN_SPACE_DEFINITIONS).length, 7);
  check("§9 Progress track length", IMPERIAL_PROGRESS.track.length, 6);
  // §9 End-game Exhibition
  check("§9 Exhibition capacity by Progress", IMPERIAL_PROGRESS.exhibition.capacityByProgress, [1, 1, 2, 2, 3, 3]);
  check("§9 Exhibition VP by Quality", IMPERIAL_PROGRESS.exhibition.qualityVp, { standard: 1, fine: 2, masterpiece: 4 });
  check("§9 Exhibition diversity spaces", IMPERIAL_PROGRESS.exhibition.diversityEligibleSpaces, [4, 5]);
  check("§9 Exhibition diversity bonuses", [IMPERIAL_PROGRESS.exhibition.threeDifferentShapesBonus, IMPERIAL_PROGRESS.exhibition.threeDifferentGlazesBonus], [2, 2]);
  check("§9 Flawed cannot be exhibited", IMPERIAL_PROGRESS.exhibition.flawedEligible, false);
  check("§9 Exhibition minimum Quality", IMPERIAL_PROGRESS.exhibition.minimumQuality, "standard");
  // §9 Apprentice milestones sit at Progress 1 and 3
  check("§9 Apprentice unlock spaces",
    IMPERIAL_PROGRESS.track.filter((t) => t.unlocksApprentice).map((t) => t.space), [1, 3]);


  for (const [label, got, want] of checks) {
    it(label, () => { expect(got).toEqual(want); });
  }
});
