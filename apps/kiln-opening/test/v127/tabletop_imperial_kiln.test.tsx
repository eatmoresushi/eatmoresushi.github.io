import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameState } from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { TabletopGameExperience } from "../../src/ui/TabletopGameExperience.tsx";
import { addFinished, addLoaded, startedGame } from "./helpers.ts";

function renderTable(state: GameState, locale: Locale = "en"): string {
  return renderToStaticMarkup(createElement(LanguageProvider, {
    initialLocale: locale,
    children: createElement(TabletopGameExperience, {
      game: projectPublicGameState(state),
      ownPlayerId: "P1",
      ownPendingContribution: null,
      events: [],
      describeEvent: (record) => record.event.type,
      busy: false,
      send: async () => true,
    }),
  }));
}

function imperialTiles(markup: string): string[] {
  return [...markup.matchAll(/<article[^>]*data-testid="imperial-kiln-tile"[^>]*>[\s\S]*?<\/article>/g)]
    .map(([tile]) => tile);
}

function tileFor(markup: string, playerId: string): string {
  const tile = imperialTiles(markup).find((candidate) =>
    candidate.match(/^<article[^>]*>/)?.[0].includes(`data-player-id="${playerId}"`));
  expect(tile, `a dedicated Imperial Kiln should be visible for ${playerId}`).toBeDefined();
  return tile ?? "";
}

describe("V1.2.7 dedicated Imperial Kiln spaces", () => {
  it("does not display Imperial Kiln spaces before any player unlocks one", () => {
    const { state } = startedGame(4, 127_950);
    const markup = renderTable(state);

    expect(markup).not.toContain('data-testid="imperial-kiln-gallery"');
    expect(imperialTiles(markup)).toEqual([]);
  });

  it("requires both Recognition 2 and the Imperial Gift before showing a tile", () => {
    const { state } = startedGame(4, 127_955);
    state.players["P1"]!.imperialKilnUnlocked = true;
    state.players["P2"]!.imperialRecognition = 1;
    state.players["P2"]!.imperialKilnUnlocked = true;
    state.players["P3"]!.imperialRecognition = 2;

    expect(imperialTiles(renderTable(state))).toEqual([]);

    state.players["P2"]!.imperialRecognition = 2;
    expect(imperialTiles(renderTable(state))).toHaveLength(1);
    expect(tileFor(renderTable(state), "P2")).toContain("Imperial Kiln");
  });

  it("shows one empty space only for each unlocked owner, using that player's colour", () => {
    const { state } = startedGame(3, 127_951);
    state.players["P2"]!.imperialRecognition = 2;
    state.players["P2"]!.imperialKilnUnlocked = true;
    state.players["P2"]!.displayName = "River Studio";

    const markup = renderTable(state);
    const tile = tileFor(markup, "P2");

    expect(markup).toContain('data-testid="imperial-kiln-gallery"');
    expect(imperialTiles(markup)).toHaveLength(1);
    expect(tile).toContain("kiln-tabletop-accent-river");
    expect(tile).toContain("Imperial Kiln");
    expect(tile).toContain("River Studio");
    expect(tile).toContain("+0");
    expect(tile).toContain('aria-label="Empty Imperial Kiln space"');
    expect(tile).not.toContain('data-hover-preview="ceramic"');
  });

  it("publicly maps simultaneous Imperial ceramics to their owners without mixing Shared Kiln pieces or private Orders", () => {
    const { state } = startedGame(4, 127_952);
    state.players["P1"]!.imperialRecognition = 2;
    state.players["P3"]!.imperialRecognition = 2;
    state.players["P1"]!.imperialKilnUnlocked = true;
    state.players["P3"]!.imperialKilnUnlocked = true;
    state.players["P1"]!.displayName = "Cinnabar Studio";
    state.players["P3"]!.displayName = "Ochre Studio";
    state.players["P3"]!.orderHand = ["S08", "O48"];
    state.marketDisplay = ["O01", "O02", "O03", "O04", "O05", "O06"];
    addLoaded(state, "P1", "bowl", "white", "crackle", "imperial");
    addLoaded(state, "P3", "vase", "grey_green", "impressed", "imperial");
    addLoaded(state, "P2", "plate", "celadon", "carved", "high_1");
    addLoaded(state, "P1", "washer", "moon_white", "plain", "low_1");
    addFinished(state, "P3", "censer", "fine", "moon_white", "carved");

    const publicGame = projectPublicGameState(state);
    const markup = renderTable(state);
    const cinnabar = tileFor(markup, "P1");
    const ochre = tileFor(markup, "P3");

    expect(imperialTiles(markup)).toHaveLength(2);
    expect(cinnabar).toContain("kiln-tabletop-accent-cinnabar");
    expect(ochre).toContain("kiln-tabletop-accent-ochre");
    expect(cinnabar).toContain('aria-label="Inspect Cinnabar Studio&#x27;s Bowl"');
    expect(cinnabar).toContain('data-glaze="white"');
    expect(cinnabar).toContain('data-decoration="crackle"');
    expect(ochre).toContain('aria-label="Inspect Ochre Studio&#x27;s Vase"');
    expect(ochre).toContain('data-glaze="grey_green"');
    expect(ochre).toContain('data-decoration="impressed"');
    for (const tile of [cinnabar, ochre]) {
      expect(tile).toContain('data-testid="imperial-kiln-slot"');
      expect(tile.match(/data-hover-preview="ceramic"/g)).toHaveLength(1);
      expect(tile).toContain("Imperial Kiln +0");
      expect(tile).not.toContain('aria-label="Empty Imperial Kiln space"');
      expect(tile).not.toContain('data-shape="plate"');
      expect(tile).not.toContain('data-shape="washer"');
      expect(tile).not.toContain('data-shape="censer"');
      expect(tile).not.toContain('data-hover-preview="order"');
      expect(tile).not.toContain("S08");
      expect(tile).not.toContain("O48");
    }
    expect(cinnabar).not.toContain('data-shape="vase"');
    expect(ochre).not.toContain('data-shape="bowl"');
    expect(publicGame.players["P3"]!.orderHand).toEqual([]);
    expect(publicGame.players["P3"]!.orderHandCount).toBe(2);
  });

  it("localizes the public ceramic inspection's Imperial location and attributes without changing state", () => {
    const { state } = startedGame(2, 127_953);
    state.players["P2"]!.imperialRecognition = 2;
    state.players["P2"]!.imperialKilnUnlocked = true;
    addLoaded(state, "P2", "bowl", "white", "crackle", "imperial");
    const before = JSON.stringify(state);

    const english = tileFor(renderTable(state), "P2");
    const chinese = tileFor(renderTable(state, "zh-CN"), "P2");

    expect(english).toContain('aria-label="Inspect Player 2&#x27;s Bowl"');
    expect(english).toContain("Imperial Kiln +0");
    expect(english).toContain(">White</strong>");
    expect(english).toContain(">Crackle</strong>");
    expect(chinese).toContain('aria-label="查看Player 2的碗"');
    expect(chinese).toContain("御窑 +0");
    expect(chinese).toContain(">白釉</strong>");
    expect(chinese).toContain(">开片</strong>");
    expect(chinese).not.toContain("Imperial Kiln");
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(["finished", "delivered"] as const)("frees the owner's Imperial space once its ceramic is %s", (stage) => {
    const { state } = startedGame(2, 127_954);
    state.players["P2"]!.imperialRecognition = 2;
    state.players["P2"]!.imperialKilnUnlocked = true;
    const loaded = addLoaded(state, "P2", "plate", "celadon", "carved", "imperial");
    expect(tileFor(renderTable(state), "P2")).toContain('data-hover-preview="ceramic"');

    const fired = {
      id: loaded.id,
      vesselInstanceId: loaded.vesselInstanceId,
      ownerId: loaded.ownerId,
      shape: loaded.shape,
      glaze: loaded.glaze,
      decoration: loaded.decoration,
      quality: "fine" as const,
    };
    state.ceramics[loaded.id] = stage === "finished"
      ? { ...fired, stage, firedInRound: state.round }
      : { ...fired, stage, orderId: "O01" };
    const tile = tileFor(renderTable(state), "P2");

    expect(tile).toContain('aria-label="Empty Imperial Kiln space"');
    expect(tile).not.toContain('data-hover-preview="ceramic"');
    expect(tile).not.toContain('data-shape="plate"');
  });
});
