/**
 * Test Pieces (T13, L645, L655, Appendix D "end of 1"; INT "Test Pieces"; owner ruling
 * R15): once per round, after Base Heat is determined and before the Fire card is revealed
 * (there is no Heat-marker step since changes 28 and 31); needs a ceramic in this firing
 * (Imperial counts) and 1 Wood; a private peek, then a public, optional bury to the bottom of
 * the Fire deck. A buried card is drawn last: when only buried cards are left, the open discard
 * is shuffled and placed above them (R15).
 */

import { describe, expect, it } from "vitest";
import { testPiecesOptions } from "../../../src/game/firing/pipeline.ts";
import { SeededRandom, shuffle } from "../../../src/game/rng.ts";
import type { FireModifier, GameEvent } from "../../../src/game/types.ts";
import { eventForViewer, projectEvent, projectPublicState } from "../../../src/game/view.ts";
import type { StateSpec } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable, tendAll, typesOf } from "./support/firing.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function spec(extra: Partial<StateSpec> = {}): StateSpec {
  return {
    players: [{ techs: ["T13"] }, {}],
    fireDeck: [2, -1, 0],
    ceramics: [
      { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
      { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" },
    ],
    ...extra,
  };
}

describe("eligibility (L645, INT)", () => {
  it("opens after Base Heat for a ready owner with a ceramic in this firing and 1 Wood", () => {
    const table = openFiringTable(spec());
    const events = tendAll(table);
    expect(typesOf(events).at(-1)).toBe("BASE_HEAT_DETERMINED");
    expect(table.state.phase).toEqual({ type: "firing_test_pieces", queue: { actorIds: ["p1"], index: 0 }, awaiting: "decision" });
    expect(table.prompt()).toEqual({ phaseType: "firing_test_pieces", actorIds: ["p1"], mode: "single" });
    expect(table.state.firing?.fireModifier).toBeNull();
  });

  it("an Imperial Kiln ceramic is enough (INT), even with no Contribution participant", () => {
    const table = openFiringTable({
      players: [{ techs: ["T13"], recognition: 2 }, {}],
      fireDeck: [2, -1, 0],
      ceramics: [{ owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "imperial" }],
    });
    expect(typesOf(table.events)).toEqual(["FIRING_STARTED", "CONTRIBUTIONS_REVEALED", "BASE_HEAT_DETERMINED"]);
    expect(table.state.phase).toMatchObject({ type: "firing_test_pieces", queue: { actorIds: ["p1"] } });
  });

  it.each([
    ["no ceramic in this firing", spec({ ceramics: [{ owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" }] })],
    ["no Wood", spec({ players: [{ techs: ["T13"], resources: { wood: 0 } }, {}] })],
    ["already used this round", spec({ players: [{ techs: [{ id: "T13", usedThisRound: true }] }, {}] })],
  ])("is skipped with %s; the Fire card is revealed in the same command", (_label, scenario) => {
    const table = openFiringTable(scenario);
    const events = tendAll(table);
    expect(typesOf(events)).not.toContain("TEST_PIECES_PEEKED");
    expect(eventsOfType(events, "FIRE_REVEALED")[0]?.modifier).toBe(2);
  });

  it("a player who spends their last Wood on the Contribution is not queued", () => {
    const table = openFiringTable(spec({ players: [{ techs: ["T13"], resources: { wood: 1 } }, {}] }));
    table.contribute("p1", "STOKE");
    const events = table.contribute("p2", "TEND");
    expect(table.player("p1").resources.wood).toBe(0);
    expect(eventsOfType(events, "FIRE_REVEALED")).toHaveLength(1);
  });
});

describe("the private peek and the public bury (v1.6.2 L645, L655, R15)", () => {
  it("pays 1 Wood, uses the Tech and shows the top card to its owner only", () => {
    const table = openFiringTable(spec());
    tendAll(table);
    const deckBefore = [...table.state.hidden.fireDeck];
    const events = table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    expect(events).toEqual([
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: -1, coins: 0, reason: "test_pieces" },
      { type: "TECH_USED", playerId: "p1", techId: "T13" },
      { type: "TEST_PIECES_PEEKED", playerId: "p1", secret: { visibleTo: "p1", modifier: 2 } },
    ]);
    expect(table.state.hidden.fireDeck).toEqual(deckBefore);
    expect(table.state.hidden.firePeeks).toEqual({ p1: { playerId: "p1", round: 1, modifier: 2, buried: null } });
    expect(table.state.firing?.testPieces).toEqual([{ playerId: "p1", peeked: true, buried: false }]);
    expect(table.state.phase).toMatchObject({ type: "firing_test_pieces", awaiting: "bury" });
    expect(table.player("p1").techs.find((t) => t.id === "T13")?.usedThisRound).toBe(true);

    // Privacy: the value is in the owner's view and secret only.
    const peeked = events[2] as GameEvent;
    expect(projectEvent(peeked)).toEqual({ type: "TEST_PIECES_PEEKED", playerId: "p1" });
    expect(eventForViewer(peeked, "p2")).toEqual({ type: "TEST_PIECES_PEEKED", playerId: "p1" });
    expect(eventForViewer(peeked, "p1")).toEqual(peeked);
    const publicJson = JSON.stringify(projectPublicState(table.state));
    expect(publicJson).not.toContain("firePeeks");
    expect(publicJson).not.toContain('"modifier":2');
    expect(table.view("p1").own?.firePeek).toEqual({ playerId: "p1", round: 1, modifier: 2, buried: null });
    expect(table.view("p2").own?.firePeek).toBeNull();
    expect(testPiecesOptions(table.view("p1"))).toEqual({ awaiting: "bury", woodCost: 1, canPeek: false, peekedModifier: 2 });
    expect(testPiecesOptions(table.view("p2"))).toBeNull();
  });

  it("burying moves the card to the bottom; the next card is revealed (public bury)", () => {
    const table = openFiringTable(spec());
    tendAll(table);
    table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    const events = table.act("p1", { type: "TEST_PIECES_BURY", bury: true });
    expect(events[0]).toEqual({ type: "TEST_PIECES_USED", playerId: "p1", buried: true });
    expect(projectEvent(events[0] as GameEvent)).toEqual(events[0]);
    // No Heat-marker actor: the Fire card is revealed in the same command (L683).
    expect(eventsOfType(events, "FIRE_REVEALED")[0]?.modifier).toBe(-1);
    expect(table.state.hidden.fireDeck.at(-1)).toBe(2);
    // The bury is public, so is the number of buried cards (R15).
    expect(table.state.hidden.fireBuried).toBe(1);
    expect(projectPublicState(table.state).counts.fireBuried).toBe(1);
    expect(table.state.lastFiring?.testPieces ?? table.state.firing?.testPieces).toEqual([{ playerId: "p1", peeked: true, buried: true }]);
  });

  it("R15: burying the deck's only card reshuffles the discard above it at the reveal; the buried card is drawn last", () => {
    const table = openFiringTable(spec({ fireDeck: [2] }), { seed: 13 });
    tendAll(table);
    const discard = [...table.state.fireDiscard];
    expect(discard).toHaveLength(11);
    table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    const events = table.act("p1", { type: "TEST_PIECES_BURY", bury: true });
    const shuffled = shuffle<FireModifier>(discard, new SeededRandom(13));
    expect(eventsOfType(events, "FIRE_DECK_RESHUFFLED")).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 11, buriedBelow: 1 }]);
    // The reveal draws from the reshuffled discard, not the buried +2 (without R15 the bury
    // would do nothing).
    expect(eventsOfType(events, "FIRE_REVEALED")[0]?.modifier).toBe(shuffled[0]);
    const deck = table.state.hidden.fireDeck;
    expect(deck.at(-1)).toBe(2);
    expect(deck).toEqual([...shuffled.slice(1), 2]);
    expect(table.state.hidden.fireBuried).toBe(1);
  });

  it("R15: a peek at a deck of only buried cards reshuffles the discard on top first, and sees the reveal's card", () => {
    const table = openFiringTable(spec({ fireDeck: [-2], fireBuried: 1 }), { seed: 5 });
    tendAll(table);
    const discard = [...table.state.fireDiscard];
    const events = table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    expect(eventsOfType(events, "FIRE_DECK_RESHUFFLED")).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 11, buriedBelow: 1 }]);
    const peeked = eventsOfType(events, "TEST_PIECES_PEEKED")[0]?.secret.modifier;
    expect(peeked).toBe(shuffle<FireModifier>(discard, new SeededRandom(5))[0]);
    const reveal = table.act("p1", { type: "TEST_PIECES_BURY", bury: false });
    expect(eventsOfType(reveal, "FIRE_REVEALED")[0]?.modifier).toBe(peeked);
    expect(eventsOfType(reveal, "FIRE_DECK_RESHUFFLED")).toEqual([]);
    expect(table.state.hidden.fireDeck.at(-1)).toBe(-2);
    expect(table.state.hidden.fireBuried).toBe(1);
  });

  it("leaving the card on top reveals the peeked card", () => {
    const table = openFiringTable(spec());
    tendAll(table);
    table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    const events = table.act("p1", { type: "TEST_PIECES_BURY", bury: false });
    expect(events[0]).toEqual({ type: "TEST_PIECES_USED", playerId: "p1", buried: false });
    expect(eventsOfType(events, "FIRE_REVEALED")[0]?.modifier).toBe(2);
  });

  it("declining costs nothing and keeps the once-per-round use (R4)", () => {
    const table = openFiringTable(spec());
    tendAll(table);
    const events = table.act("p1", { type: "TEST_PIECES_DECIDE", peek: false });
    expect(typesOf(events)).not.toContain("TEST_PIECES_PEEKED");
    expect(typesOf(events)).not.toContain("TECH_USED");
    expect(typesOf(events)).not.toContain("RESOURCES_CHANGED");
    expect(eventsOfType(events, "FIRE_REVEALED")[0]?.modifier).toBe(2);
    expect(table.player("p1").techs.find((t) => t.id === "T13")?.usedThisRound).toBe(false);
    expect(table.player("p1").resources.wood).toBe(3);
    expect(table.state.lastFiring?.testPieces ?? table.state.firing?.testPieces).toEqual([{ playerId: "p1", peeked: false, buried: false }]);
  });

  it("peeking at an empty deck reshuffles the open discard first (L526), and the reveal draws that card", () => {
    const table = openFiringTable(spec({ fireDeck: [] }), { seed: 11 });
    tendAll(table);
    const discard = [...table.state.fireDiscard];
    expect(discard).toHaveLength(12);
    const events = table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    expect(eventsOfType(events, "FIRE_DECK_RESHUFFLED")).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 12, buriedBelow: 0 }]);
    const peeked = eventsOfType(events, "TEST_PIECES_PEEKED")[0]?.secret.modifier;
    const reveal = table.act("p1", { type: "TEST_PIECES_BURY", bury: false });
    expect(eventsOfType(reveal, "FIRE_REVEALED")[0]?.modifier).toBe(peeked);
    expect(eventsOfType(reveal, "FIRE_DECK_RESHUFFLED")).toEqual([]);
    // The shuffle used the table's seeded RNG (DESIGN §7).
    const rng = new SeededRandom(11);
    expect(shuffle<FireModifier>(discard, rng)[0]).toBe(peeked);
  });

  it("the peek is forgotten when the firing finishes", () => {
    // Fire 0: Masterpiece and Fine, so nothing stops the firing before step 12.
    const table = openFiringTable(spec({ fireDeck: [0, -1] }));
    tendAll(table);
    table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    table.act("p1", { type: "TEST_PIECES_BURY", bury: false });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    expect(table.state.hidden.firePeeks).toEqual({});
  });
});

describe("timing and step errors (L645, L687–689)", () => {
  it("resolves after Base Heat is determined and before the Fire card is revealed (L645, L689)", () => {
    const table = openFiringTable(
      spec({
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "high_1" },
        ],
      }),
    );
    tendAll(table);
    expect(table.state.phase.type).toBe("firing_test_pieces");
    expect(table.state.firing?.baseHeat).not.toBeNull();
    expect(table.state.firing?.fireModifier).toBeNull();
    table.expectRuleError("p1", { type: "RESOLVE_JUN", adjustment: null }, "WRONG_PHASE");
    // No Heat-marker step follows (changes 28, 31): the Fire card is revealed at once.
    const events = table.act("p1", { type: "TEST_PIECES_DECIDE", peek: false });
    expect(events.map((event) => event.type)).toContain("FIRE_REVEALED");
    // The Fire card is turned in the same command (the firing may even finish in it, since
    // revision 4 has no salvage step either).
    expect((table.state.firing ?? table.state.lastFiring)?.fireModifier).not.toBeNull();
  });

  it("bury before deciding, deciding twice, or another player acting are rejected", () => {
    const table = openFiringTable(spec());
    tendAll(table);
    expectDocumentedDetails(table.expectRuleError("p1", { type: "TEST_PIECES_BURY", bury: true }, "WRONG_PHASE"));
    table.expectRuleError("p2", { type: "TEST_PIECES_DECIDE", peek: true }, "NOT_YOUR_DECISION");
    table.act("p1", { type: "TEST_PIECES_DECIDE", peek: true });
    expectDocumentedDetails(table.expectRuleError("p1", { type: "TEST_PIECES_DECIDE", peek: false }, "WRONG_PHASE"));
  });

  it("the validator checks Wood (unreachable through the queue, which needs 1 Wood)", () => {
    const table = openFiringTable(spec());
    tendAll(table);
    table.state.players["p1"]!.resources.wood = 0;
    const error = table.expectRuleError("p1", { type: "TEST_PIECES_DECIDE", peek: true }, "INSUFFICIENT_RESOURCES");
    expectDocumentedDetails(error);
    expect(error.details).toMatchObject({ resource: "wood", needed: 1, have: 0 });
    // Declining is always legal (DESIGN §3.6).
    expect(table.tryAct("p1", { type: "TEST_PIECES_DECIDE", peek: false }).ok).toBe(true);
  });

  it("testPiecesOptions offers the peek while deciding", () => {
    const table = openFiringTable(spec());
    tendAll(table);
    expect(testPiecesOptions(table.view("p1"))).toEqual({ awaiting: "decision", woodCost: 1, canPeek: true, peekedModifier: null });
    expect(testPiecesOptions(table.view(null))).toBeNull();
  });
});
