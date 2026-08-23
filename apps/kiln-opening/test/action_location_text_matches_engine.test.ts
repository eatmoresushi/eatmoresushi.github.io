import { describe, expect, it } from "vitest";
import {
  LOCATION_DEFINITIONS,
  ACTION_LOCATION_PRICES,
  LOCATION_IDS,
  locationCapacity,
} from "../src/game";
import type { LocationId, OfficeOrderMode, PlayerCount } from "../src/game";

/**
 * The board's printed effects must describe what the handlers do.
 *
 * This is the surface where the worst drift of the lot survived: the Office card still
 * advertised "take 1 Order and gain 2 Coins" long after v1.1.5 moved Coin income to Labour,
 * and the mode was still implemented and offered, so Labour never actually replaced
 * anything. Court Patronage reported a cost of 5 in its event while charging 4, and a unit
 * test asserted the 5 -- pinning the defect rather than catching it.
 */
const location = (id: LocationId) => LOCATION_DEFINITIONS[id];
const both = (id: LocationId): string => `${location(id).apprentice} ${location(id).shifu}`;
const bothZh = (id: LocationId): string => `${location(id).apprenticeZh} ${location(id).shifuZh}`;

describe("Action location text agrees with the engine", () => {
  it("Labour prints the Coins each worker kind gains", () => {
    expect(location("labour").apprentice).toContain(`${ACTION_LOCATION_PRICES.labourApprenticeCoins} Coins`);
    expect(location("labour").shifu).toContain(`${ACTION_LOCATION_PRICES.labourShifuCoins} Coins`);
    expect(location("labour").apprenticeZh).toContain(`${ACTION_LOCATION_PRICES.labourApprenticeCoins}铜钱`);
    expect(location("labour").shifuZh).toContain(`${ACTION_LOCATION_PRICES.labourShifuCoins}铜钱`);
  });

  it("Court Patronage prints the Coins it charges, and stays Shifu-only", () => {
    expect(location("court_patronage").shifu).toContain(`${ACTION_LOCATION_PRICES.courtPatronageCoins} Coins`);
    expect(location("court_patronage").shifuZh).toContain(`${ACTION_LOCATION_PRICES.courtPatronageCoins}铜钱`);
    expect(location("court_patronage").apprentice).toMatch(/Shifu only/i);
    // It cannot take a player from Progress 4 to 5.
    expect(location("court_patronage").shifu).toMatch(/4 to space 5|from space 4/i);
  });

  it("the Office no longer advertises Coins, which moved to Labour in v1.1.5", () => {
    // The retired mode must be gone from the type as well as the text; while it existed,
    // the printed board and the playable action disagreed in opposite directions.
    const modes: OfficeOrderMode[] = ["take_one", "take_up_to_two"];
    expect(modes).toHaveLength(2);
    expect(both("market_imperial_office")).not.toMatch(/gain 2 Coins/i);
    expect(bothZh("market_imperial_office")).not.toContain("并获得2铜钱");
    // The Flawed sale is still there and still pays the engine's price.
    expect(both("market_imperial_office")).toContain(`${ACTION_LOCATION_PRICES.flawedSaleCoins} Coins`);
  });

  it("states the uncapped locations as uncapped, and only those", () => {
    for (const id of LOCATION_IDS) {
      const uncapped = /no worker limit|Shifu only/i.test(both(id));
      const roomy = locationCapacity(id, 2) > 4;
      expect(uncapped, `${id} text and capacity disagree`).toBe(roomy);
    }
  });

  it("prints a Shifu and an Apprentice effect for every location, in both languages", () => {
    for (const id of LOCATION_IDS) {
      for (const field of ["apprentice", "shifu", "apprenticeZh", "shifuZh"] as const) {
        expect(location(id)[field], `${id}.${field}`).toBeTruthy();
      }
    }
  });

  it("keeps the Chinese text free of stray non-Chinese scripts", () => {
    // "不能от第4格" -- Cyrillic had crept into Court Patronage's text.
    for (const id of LOCATION_IDS) {
      expect(bothZh(id), `${id} has Cyrillic in its Chinese text`).not.toMatch(/[Ѐ-ӿ]/);
    }
  });

  it("matches every printed capacity to the content table", () => {
    for (const id of LOCATION_IDS) {
      for (const count of [2, 3, 4] as PlayerCount[]) {
        expect(locationCapacity(id, count), `${id} at ${count}P`).toBeGreaterThan(0);
      }
    }
  });
});
