import { describe, expect, it } from "vitest";
import { FIRING, GAME_CONFIG, IMPERIAL_TRACK } from "../../../../src/game/index.ts";
import { RULE_NUMBERS } from "../../../../src/app/i18n/content.ts";
import { allStrings, bareText } from "./catalog_support.ts";

/**
 * §6.4 `no_rule_numbers` (ports test/v127 `printed_numbers_guard`): catalogue strings carry no
 * digits; numbers arrive as placeholders filled from content (§5 gap 19). The sourced
 * `locationSummary` namespace is exempt by name (its own parity test checks it).
 */
describe("no literal rule numbers in the catalogue", () => {
  it("has no digit outside placeholders", () => {
    const offences = allStrings()
      .filter((entry) => !entry.sourced && /\d/.test(bareText(entry.text)))
      .map((entry) => `${entry.id} (${entry.locale}): ${entry.text}`);
    expect(offences).toEqual([]);
  });

  it("reads the placeholder numbers from content", () => {
    expect(RULE_NUMBERS.rounds).toBe(GAME_CONFIG.rounds);
    expect(RULE_NUMBERS.coinsPerVp).toBe(GAME_CONFIG.coinEndGame.coinsPerVp);
    expect(RULE_NUMBERS.coinVpMax).toBe(GAME_CONFIG.coinEndGame.maxVp);
    expect(RULE_NUMBERS.workers).toBe(GAME_CONFIG.workers.shifu + GAME_CONFIG.workers.apprentices);
    expect(RULE_NUMBERS.overflowVpPerCrown).toBe(IMPERIAL_TRACK.overflowVpPerCrown);
    expect(RULE_NUMBERS.recognitionMax).toBe(IMPERIAL_TRACK.track.length - 1);
    expect([RULE_NUMBERS.baseHeatMin, RULE_NUMBERS.baseHeatMax]).toEqual([FIRING.baseHeat.minimum, FIRING.baseHeat.maximum]);
  });
});
