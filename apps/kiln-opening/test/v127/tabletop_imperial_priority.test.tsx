import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameState, PlayerId } from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { TabletopGameExperience } from "../../src/ui/TabletopGameExperience.tsx";
import { startedGame } from "./helpers.ts";

function renderTable(state: GameState, ownPlayerId: PlayerId = "P1", locale: Locale = "en"): string {
  return renderToStaticMarkup(createElement(LanguageProvider, {
    initialLocale: locale,
    children: createElement(TabletopGameExperience, {
      game: projectPublicGameState(state),
      ownPlayerId,
      ownPendingContribution: null,
      events: [],
      describeEvent: (record) => record.event.type,
      busy: false,
      send: async () => true,
    }),
  }));
}

function priorityTokens(markup: string, location?: "track" | "workshop"): string[] {
  const tokens = [...markup.matchAll(/<button[^>]*data-testid="imperial-priority-token"[^>]*>/g)]
    .map(([token]) => token);
  return location === undefined ? tokens : tokens.filter((token) => token.includes(`data-token-location="${location}"`));
}

function tokenOwner(token: string): string | undefined {
  return token.match(/data-player-id="([^"]+)"/)?.[1];
}

describe("V1.2.7 physical Imperial Priority markers", () => {
  it.each([2, 3, 4] as const)("places one matching player-colour token at Recognition 3 for each of %i players", (count) => {
    const { state } = startedGame(count, 127_960 + count);
    const markup = renderTable(state);
    const recognitionThree = markup.match(/<li[^>]*data-recognition-space="3"[^>]*>[\s\S]*?<\/li>/)?.[0];

    expect(recognitionThree).toBeDefined();
    expect(recognitionThree).toContain('data-testid="imperial-priority-supply"');
    const tokens = priorityTokens(recognitionThree ?? "", "track");
    expect(tokens).toHaveLength(count);
    expect(tokens.map(tokenOwner)).toEqual(state.playerOrder);
    expect(priorityTokens(markup, "workshop")).toEqual([]);
    expect(markup).not.toContain("kiln-tabletop-imperial-status");

    const accents = ["cinnabar", "river", "ochre", "plum"];
    for (const [index, token] of tokens.entries()) {
      expect(token).toContain(`kiln-tabletop-accent-${accents[index]}`);
      expect(token).toContain(`aria-label="Player ${index + 1}&#x27;s Imperial Priority"`);
    }
  });

  it("moves the owner's marker from Recognition 3 into their workshop, then removes it when spent", () => {
    const { state } = startedGame(3, 127_967);
    const player = state.players["P1"]!;
    player.imperialRecognition = 2;

    expect(priorityTokens(renderTable(state), "track").map(tokenOwner)).toContain("P1");
    expect(priorityTokens(renderTable(state), "workshop")).toEqual([]);

    player.imperialRecognition = 3;
    player.imperialPriorityAvailable = true;
    const claimed = renderTable(state);
    expect(priorityTokens(claimed, "track").map(tokenOwner)).toEqual(["P2", "P3"]);
    expect(priorityTokens(claimed, "workshop").map(tokenOwner)).toEqual(["P1"]);
    expect(priorityTokens(claimed, "workshop")[0]).toContain("kiln-tabletop-accent-cinnabar");
    expect(claimed).not.toContain("kiln-tabletop-imperial-status");

    player.imperialRecognition = 4;
    expect(priorityTokens(renderTable(state), "workshop").map(tokenOwner)).toEqual(["P1"]);

    player.imperialPriorityAvailable = false;
    const spent = renderTable(state);
    expect(priorityTokens(spent, "workshop")).toEqual([]);
    expect(priorityTokens(spent, "track").map(tokenOwner)).toEqual(["P2", "P3"]);
    expect(priorityTokens(spent).map(tokenOwner)).not.toContain("P1");
  });

  it("keeps a marker collected when Recognition advances directly past 3 to 4", () => {
    const { state } = startedGame(2, 127_968);
    state.players["P1"]!.imperialRecognition = 4;
    state.players["P1"]!.imperialPriorityAvailable = true;

    const markup = renderTable(state);
    expect(priorityTokens(markup, "track").map(tokenOwner)).toEqual(["P2"]);
    expect(priorityTokens(markup, "workshop").map(tokenOwner)).toEqual(["P1"]);
  });

  it("shows only the viewing player's collected marker on their personal board", () => {
    const { state } = startedGame(4, 127_969);
    for (const id of ["P1", "P2"] as const) {
      state.players[id]!.imperialRecognition = 3;
      state.players[id]!.imperialPriorityAvailable = true;
    }
    state.players["P3"]!.imperialRecognition = 4;
    state.players["P3"]!.imperialPriorityAvailable = false;

    const firstPlayer = renderTable(state, "P1");
    const secondPlayer = renderTable(state, "P2");
    expect(priorityTokens(firstPlayer, "track").map(tokenOwner)).toEqual(["P4"]);
    expect(priorityTokens(secondPlayer, "track").map(tokenOwner)).toEqual(["P4"]);
    expect(priorityTokens(firstPlayer, "workshop").map(tokenOwner)).toEqual(["P1"]);
    expect(priorityTokens(secondPlayer, "workshop").map(tokenOwner)).toEqual(["P2"]);
    expect(priorityTokens(secondPlayer, "workshop")[0]).toContain("kiln-tabletop-accent-river");
  });

  it("does not put an early availability flag in the workshop before Recognition 3", () => {
    const { state } = startedGame(2, 127_970);
    state.players["P1"]!.imperialRecognition = 2;
    state.players["P1"]!.imperialPriorityAvailable = true;

    const markup = renderTable(state);
    expect(priorityTokens(markup, "track").map(tokenOwner)).toEqual(["P1", "P2"]);
    expect(priorityTokens(markup, "workshop")).toEqual([]);
  });

  it("localizes token ownership in both locations without mutating game state", () => {
    const { state } = startedGame(2, 127_971);
    state.players["P1"]!.displayName = "Celadon Studio";
    state.players["P1"]!.imperialRecognition = 3;
    state.players["P1"]!.imperialPriorityAvailable = true;
    state.players["P2"]!.displayName = "River Studio";
    const before = JSON.stringify(state);

    const english = priorityTokens(renderTable(state));
    const chinese = priorityTokens(renderTable(state, "P1", "zh-CN"));
    expect(english.find((token) => tokenOwner(token) === "P1"))
      .toContain('aria-label="Celadon Studio&#x27;s Imperial Priority"');
    expect(english.find((token) => tokenOwner(token) === "P2"))
      .toContain('aria-label="River Studio&#x27;s Imperial Priority"');
    expect(chinese.find((token) => tokenOwner(token) === "P1"))
      .toContain('aria-label="Celadon Studio的御烧优先"');
    expect(chinese.find((token) => tokenOwner(token) === "P2"))
      .toContain('aria-label="River Studio的御烧优先"');
    expect(JSON.stringify(state)).toBe(before);
  });
});
