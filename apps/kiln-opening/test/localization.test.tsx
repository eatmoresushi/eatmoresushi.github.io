import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG, ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS } from "../src/game";
import { projectPublicGameState } from "../src/multiplayer";
import { GameTable, OrderCard } from "../src/ui/GameTable";
import { LanguageProvider, localizeMultiplayerError, rulebookHref, term, translate } from "../src/ui/i18n";
import type { Locale } from "../src/ui/i18n";
import { startedGame } from "./helpers";

function localizedMarkup(locale: Locale, child: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(LanguageProvider, { initialLocale: locale }, child));
}

describe("English / Simplified Chinese localization", () => {
  it("uses English by default and the official Chinese core terminology", () => {
    expect(translate("en", "End-game Exhibition")).toBe("End-game Exhibition");
    expect(translate("zh-CN", "End-game Exhibition")).toBe("终局展陈");
    expect(term("zh-CN", "shifu")).toBe("师傅");
    expect(term("zh-CN", "grey_green")).toBe("灰青釉");
    expect(term("zh-CN", "masterpiece")).toBe("杰作");
    expect(GAME_CONFIG.fireDeck).toEqual({ "-2": 4, "-1": 3, "0": 6, "1": 3, "2": 4 });
    expect(Object.values(TECHNIQUE_DEFINITIONS)).toHaveLength(15);
    expect(Object.values(TECHNIQUE_DEFINITIONS).every((technique) => technique.nameZh.length > 0 && technique.abilityZh.length > 0)).toBe(true);
    expect(localizeMultiplayerError("zh-CN", "ORDER_REQUIREMENTS_NOT_MET", "English fallback")).toBe("所选陶瓷不符合订单要求。");
    expect(rulebookHref("en", "/kiln-opening/"))
      .toBe("/kiln-opening/rulebooks/Kiln_Opening_v1.0.4_Full_Rulebook.pdf");
    expect(rulebookHref("zh-CN", "/kiln-opening"))
      .toBe("/kiln-opening/rulebooks/Kiln_Opening_v1.0.4_Chinese_Full_Rulebook.pdf");
  });

  it("renders I02, I04, and I09 from identical structural data in both languages", () => {
    const snapshot = JSON.stringify([ORDER_DEFINITIONS.I02, ORDER_DEFINITIONS.I04, ORDER_DEFINITIONS.I09]);
    for (const orderId of ["I02", "I04", "I09"] as const) {
      const english = localizedMarkup("en", createElement(OrderCard, { orderId, imperial: true }));
      const chinese = localizedMarkup("zh-CN", createElement(OrderCard, { orderId, imperial: true }));
      expect(english).toContain(orderId);
      expect(chinese).toContain(orderId);
      expect(english).toContain("Fine+");
      expect(chinese).toContain("精品+");
    }
    expect(localizedMarkup("en", createElement(OrderCard, { orderId: "I09", imperial: true }))).toContain("at least 1 Masterpiece");
    expect(localizedMarkup("zh-CN", createElement(OrderCard, { orderId: "I09", imperial: true }))).toContain("至少1件杰作");
    expect(JSON.stringify([ORDER_DEFINITIONS.I02, ORDER_DEFINITIONS.I04, ORDER_DEFINITIONS.I09])).toBe(snapshot);
  });

  it("changes visible labels without mutating round, resources, scores, IDs, or AI-facing state", () => {
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
    expect(english).toContain("Exhibition capacity 1");
    expect(english).toContain("Exhibition capacity 2");
    expect(english).toContain("Exhibition capacity 3 with diversity bonuses");
    expect(chinese).toContain("终局展陈最多1件");
    expect(chinese).toContain("终局展陈最多2件");
    expect(chinese).toContain("终局展陈最多3件");
    expect(chinese).toContain("V1.0.4");
    expect(JSON.stringify(publicGame)).toBe(before);
  });

  it("renders persisted public states created before stipend history was added", () => {
    const publicGame = projectPublicGameState(startedGame(2, 10_402).state);
    const ownPlayerId = publicGame.playerOrder[0]!;
    const legacyPlayer = publicGame.players[ownPlayerId] as unknown as {
      imperialStipendsReceived?: Array<2 | 4>;
    };
    delete legacyPlayer.imperialStipendsReceived;

    const english = localizedMarkup("en", createElement(GameTable, { game: publicGame, ownPlayerId }));
    const chinese = localizedMarkup("zh-CN", createElement(GameTable, { game: publicGame, ownPlayerId }));

    expect(english).toContain("Progress 2 not reached");
    expect(chinese).toContain("进度2 未触发");
  });
});
