import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FireModifier, FiringContext, FiringResultSummary, RoundNumber } from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import type { PublicEventRecord, PublicGameEvent, PublicGameState } from "../../src/multiplayer/index.ts";
import { fireCardHistory } from "../../src/ui/fireCardHistory.ts";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import { TabletopGameExperience } from "../../src/ui/TabletopGameExperience.tsx";
import { startedGame } from "./helpers.ts";

function game(): PublicGameState {
  return projectPublicGameState(startedGame(2, 127_980).state);
}

function record(sequence: number, event: PublicGameEvent): PublicEventRecord {
  return { roomId: "fire-history", sequence, revision: sequence, commandId: `command-${sequence}`, actorId: "P1", event };
}

function reveal(sequence: number, modifier: FireModifier): PublicEventRecord {
  return record(sequence, { type: "FIRE_REVEALED", modifier, baseHeat: 2, globalHeat: 2 + modifier });
}

function round(sequence: number, value: RoundNumber): PublicEventRecord {
  return record(sequence, { type: "ROUND_STARTED", round: value, firstPlayerId: "P1" });
}

function summary(value: RoundNumber, modifier: FireModifier): FiringResultSummary {
  return { round: value, baseHeat: 2, fireModifier: modifier, globalHeat: 2 + modifier, kilnYardShifuAdjustments: [] };
}

function context(value: RoundNumber, modifier: FireModifier | null): FiringContext {
  return {
    round: value,
    contributors: ["P1"],
    contributions: { P1: "TEND" },
    fuelLedgerUpgradedBy: [],
    baseHeat: 2,
    fireModifier: modifier,
    globalHeat: modifier === null ? null : 2 + modifier,
    kilnYardShifuAdjustments: [],
    ceramicResults: {},
  };
}

function renderTable(state: PublicGameState, events: PublicEventRecord[], locale: Locale = "en"): string {
  return renderToStaticMarkup(createElement(LanguageProvider, {
    initialLocale: locale,
    children: createElement(TabletopGameExperience, {
      game: state,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      events,
      describeEvent: (entry) => entry.event.type,
      busy: false,
      send: async () => true,
    }),
  }));
}

describe("public Fire card history", () => {
  it("records each public main Fire reveal under its actual round, including Round 1 without a start event", () => {
    const state = game();
    state.round = 3;
    expect(fireCardHistory(state, [reveal(1, -1), round(2, 2), reveal(3, 0), round(4, 3), reveal(5, 2)]))
      .toEqual([
        { round: 1, modifier: -1, kind: "round" },
        { round: 2, modifier: 0, kind: "round" },
        { round: 3, modifier: 2, kind: "round" },
      ]);
  });

  it("does not invent a Fire card for a round with no firing", () => {
    const state = game();
    state.round = 3;
    expect(fireCardHistory(state, [reveal(1, -2), round(2, 2), round(3, 3), reveal(4, 1)]))
      .toEqual([
        { round: 1, modifier: -2, kind: "round" },
        { round: 3, modifier: 1, kind: "round" },
      ]);
  });

  it("keeps each Second Firing separate from the round's main Fire card and identifies its owner", () => {
    const state = game();
    const events = [
      reveal(1, -1),
      record(2, { type: "SECOND_FIRING_RESOLVED", playerId: "P2", ceramicId: "ceramic-2", fireModifier: 2, quality: "fine" }),
      record(3, { type: "SECOND_FIRING_RESOLVED", playerId: "P1", ceramicId: "ceramic-1", fireModifier: 0, quality: "standard" }),
    ];

    expect(fireCardHistory(state, events)).toEqual([
      { round: 1, modifier: -1, kind: "round" },
      { round: 1, modifier: 2, kind: "second", playerId: "P2" },
      { round: 1, modifier: 0, kind: "second", playerId: "P1" },
    ]);
  });

  it("orders event records by sequence and ignores repeated delivery without mutating the input", () => {
    const state = game();
    state.round = 2;
    const first = reveal(2, -1);
    const start = round(5, 2);
    const second = reveal(7, 0);
    const events = [second, first, start, first, second];
    const before = JSON.stringify({ state, events });

    expect(fireCardHistory(state, events)).toEqual([
      { round: 1, modifier: -1, kind: "round" },
      { round: 2, modifier: 0, kind: "round" },
    ]);
    expect(JSON.stringify({ state, events })).toBe(before);
  });

  it("retains historical reveals after the discard pile has been reshuffled", () => {
    const state = game();
    state.round = 2;
    state.discards.fire = [];
    state.decks.fireRemaining = 12;

    expect(fireCardHistory(state, [reveal(1, -1), round(2, 2), reveal(3, 0)]))
      .toEqual([
        { round: 1, modifier: -1, kind: "round" },
        { round: 2, modifier: 0, kind: "round" },
      ]);
  });

  it("does not infer chronology from discard order when no historical events are available", () => {
    const state = game();
    state.round = 4;
    state.discards.fire = [-1, 2, 0, 1];

    expect(fireCardHistory(state, [])).toEqual([]);
  });

  it("fills a missing main reveal from the retained firing summary at its recorded round", () => {
    const state = game();
    state.round = 4;
    state.lastFiringResult = summary(3, 1);

    expect(fireCardHistory(state, [reveal(1, -1)])).toEqual([
      { round: 1, modifier: -1, kind: "round" },
      { round: 3, modifier: 1, kind: "round" },
    ]);
  });

  it("includes the current public reveal, but never invents an upcoming card before it is revealed", () => {
    const state = game();
    state.round = 2;
    state.lastFiringResult = summary(1, -1);
    state.firingContext = context(2, null);
    expect(fireCardHistory(state, [])).toEqual([{ round: 1, modifier: -1, kind: "round" }]);

    state.firingContext = context(2, 0);
    expect(fireCardHistory(state, [])).toEqual([
      { round: 1, modifier: -1, kind: "round" },
      { round: 2, modifier: 0, kind: "round" },
    ]);
  });

  it("does not duplicate main reveals present in both public events and firing snapshots", () => {
    const state = game();
    state.round = 2;
    state.lastFiringResult = summary(2, 1);
    state.firingContext = context(2, 1);

    expect(fireCardHistory(state, [reveal(1, -1), round(2, 2), reveal(3, 1), reveal(4, 1)]))
      .toEqual([
        { round: 1, modifier: -1, kind: "round" },
        { round: 2, modifier: 1, kind: "round" },
      ]);
  });

  it("includes a publicly revealed pending Second Firing once, before and after its resolution event arrives", () => {
    const state = game();
    state.round = 2;
    state.firingContext = context(2, -1);
    state.phase = {
      type: "firing_second_before_quality",
      actorId: "P2",
      ceramicId: "ceramic-2",
      fireModifier: 2,
      afterQualityPhase: {
        queue: { actors: ["P2"], currentIndex: 0 },
        techniqueIds: ["T14"],
        declinedTechniqueIds: {},
      },
    };
    const events = [round(1, 2), reveal(2, -1)];
    const expected = [
      { round: 2, modifier: -1, kind: "round" },
      { round: 2, modifier: 2, kind: "second", playerId: "P2" },
    ];

    expect(fireCardHistory(state, events)).toEqual(expected);
    events.push(record(3, {
      type: "SECOND_FIRING_RESOLVED", playerId: "P2", ceramicId: "ceramic-2", fireModifier: 2, quality: "fine",
    }));
    expect(fireCardHistory(state, events)).toEqual(expected);
  });
});

describe("Fire deck discard UI", () => {
  it("provides an accessible inspection button with round history and the current discard count", () => {
    const state = game();
    state.round = 2;
    state.discards.fire = [-1, 2, 0];
    state.decks.fireRemaining = 9;
    const events = [
      reveal(1, -1),
      record(2, { type: "SECOND_FIRING_RESOLVED", playerId: "P2", ceramicId: "ceramic-2", fireModifier: 2, quality: "fine" }),
      round(3, 2),
      reveal(4, 0),
    ];
    const markup = renderTable(state, events);
    const renderedText = markup.replace(/<[^>]*>/g, "");
    const button = markup.match(/<button[^>]*data-testid="fire-discard"[^>]*>[\s\S]*?<\/button>/)?.[0];

    expect(button).toBeDefined();
    expect(button).toContain('aria-label="Fire deck discard"');
    expect(button).toContain("aria-describedby=");
    expect(button).toMatch(/kiln-tabletop-fire-card[\s\S]*?<small>3<\/small>/);
    expect(button).not.toContain("<small>9</small>");
    expect(renderedText).toContain("Round 1: -1");
    expect(renderedText).toContain("Round 2: 0");
    expect(renderedText).toContain("Second Firing");
    expect(renderedText).toContain("Player 2");
    expect(markup).not.toContain("LAST FIRING");
  });

  it("explains an empty history instead of displaying a fabricated firing result", () => {
    const markup = renderTable(game(), []);

    expect(markup).toContain('data-testid="fire-discard"');
    expect(markup).toContain("No Fire cards revealed yet.");
    expect(markup).not.toContain("Round 1: 0");
  });

  it("localizes the historical rounds without changing game state or event records", () => {
    const state = game();
    state.round = 2;
    const events = [reveal(1, -1), round(2, 2), reveal(3, 0)];
    const before = JSON.stringify({ state, events });
    const markup = renderTable(state, events, "zh-CN");
    const renderedText = markup.replace(/<[^>]*>/g, "");

    expect(renderedText).toContain("第1轮：-1");
    expect(renderedText).toContain("第2轮：0");
    expect(renderedText).not.toContain("Round 1: -1");
    expect(JSON.stringify({ state, events })).toBe(before);
  });
});
