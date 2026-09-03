import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GAME_CONFIG, LOCATION_DEFINITIONS, LOCATION_IDS, MAIN_ORDERS,
  ORDER_DEFINITIONS, STARTING_ORDERS, TECHNIQUE_DEFINITIONS,
} from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { GameTable, OrderCard } from "../../src/ui/GameTable.tsx";
import { LanguageProvider, localizeMultiplayerError, term, translate } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { startedGame } from "./helpers.ts";

/**
 * Switching language must change only what is drawn, never what is true.
 *
 * The pre-V1.2.2 version of this suite asserted `court_patronage` and I-prefixed Imperial
 * Orders, so it pinned a ruleset the engine had already left. What it was actually guarding
 * -- that both locales render from one set of structural data, and that rendering mutates
 * nothing -- outlived those values, so it is the part kept here.
 */
function localizedMarkup(locale: Locale, child: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(
    createElement(LanguageProvider, { initialLocale: locale, children: child }),
  );
}

/** A Crown Order and a Masterpiece Order, chosen from the data rather than hardcoded. */
const CROWN_ORDER = MAIN_ORDERS.find((order) => order.crowns > 0)!.id;
const MASTERPIECE_ORDER = MAIN_ORDERS.find((order) => order.minQuality === "masterpiece")!.id;

describe("English / Simplified Chinese localization", () => {
  it("uses English by default and the official Chinese core terminology", () => {
    expect(translate("en", "End-game Exhibition")).toBe("End-game Exhibition");
    expect(translate("zh-CN", "End-game Exhibition")).toBe("终局展陈");
    expect(term("zh-CN", "shifu")).toBe("师傅");
    expect(term("zh-CN", "grey_green")).toBe("灰青");
    expect(term("zh-CN", "masterpiece")).toBe("珍品");
    expect(GAME_CONFIG.fireDeck).toEqual({ "-2": 1, "-1": 3, "0": 4, "1": 3, "2": 1 });
    expect(Object.values(TECHNIQUE_DEFINITIONS)).toHaveLength(15);
    expect(localizeMultiplayerError("zh-CN", "ORDER_REQUIREMENTS_NOT_MET", "English fallback"))
      .toBe("所选陶瓷不符合订单要求。");
  });

  it("gives every Order, Technique and location Chinese text as well as English", () => {
    for (const order of [...MAIN_ORDERS, ...STARTING_ORDERS]) {
      expect(order.commissionZh.length, order.id).toBeGreaterThan(0);
    }
    for (const technique of Object.values(TECHNIQUE_DEFINITIONS)) {
      expect(technique.nameZh.length, technique.id).toBeGreaterThan(0);
      expect(technique.abilityZh.length, technique.id).toBeGreaterThan(0);
    }
    for (const id of LOCATION_IDS) {
      const location = LOCATION_DEFINITIONS[id];
      for (const field of ["nameZh", "apprenticeZh", "shifuZh"] as const) {
        expect(location[field].length, `${id}.${field}`).toBeGreaterThan(0);
      }
    }
  });

  it("renders the same Order from identical structural data in both languages", () => {
    const snapshot = JSON.stringify([ORDER_DEFINITIONS[CROWN_ORDER], ORDER_DEFINITIONS[MASTERPIECE_ORDER]]);
    for (const orderId of [CROWN_ORDER, MASTERPIECE_ORDER]) {
      const english = localizedMarkup("en", createElement(OrderCard, { orderId }));
      const chinese = localizedMarkup("zh-CN", createElement(OrderCard, { orderId }));
      expect(english).toContain(orderId);
      expect(chinese).toContain(orderId);
    }
    // A Crown Order carries its Crowns in both locales; Crowns are the V1.2.2 Imperial marker.
    expect(localizedMarkup("en", createElement(OrderCard, { orderId: CROWN_ORDER }))).toContain("👑");
    expect(localizedMarkup("zh-CN", createElement(OrderCard, { orderId: CROWN_ORDER }))).toContain("👑");
    expect(localizedMarkup("en", createElement(OrderCard, { orderId: MASTERPIECE_ORDER }))).toContain("Masterpiece");
    expect(localizedMarkup("zh-CN", createElement(OrderCard, { orderId: MASTERPIECE_ORDER }))).toContain("珍品");
    expect(JSON.stringify([ORDER_DEFINITIONS[CROWN_ORDER], ORDER_DEFINITIONS[MASTERPIECE_ORDER]])).toBe(snapshot);
  });

  it("changes visible labels without mutating round, resources, scores, IDs, or engine state", () => {
    const game = startedGame(2, 10_401).state;
    const publicGame = projectPublicGameState(game);
    publicGame.phase = { type: "presentation", eligiblePlayerIds: [...publicGame.playerOrder], submittedPlayerIds: [] };
    const before = JSON.stringify(publicGame);
    const ownPlayerId = publicGame.playerOrder[0]!;
    const english = localizedMarkup("en", createElement(GameTable, { game: publicGame, ownPlayerId }));
    const chinese = localizedMarkup("zh-CN", createElement(GameTable, { game: publicGame, ownPlayerId }));
    expect(english).toContain("Player Workshops");
    expect(chinese).toContain("玩家作坊");
    expect(english).toContain("End-game Exhibition");
    expect(chinese).toContain("终局展陈");
    expect(chinese).toContain(`V${GAME_CONFIG.rulesVersion}`);
    expect(JSON.stringify(publicGame)).toBe(before);
  });
});
