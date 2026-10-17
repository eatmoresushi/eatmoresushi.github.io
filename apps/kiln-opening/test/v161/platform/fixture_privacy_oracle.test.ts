/**
 * The fixture privacy oracle (`tools/fixturePrivacy.ts`) on Orders a seat saw and that then moved
 * where only another seat saw them go (ENGINE_V1.6.2_DELTA.md §9, B3):
 * - a face-up Order reserved in public and then given up face down for a Colour Samples swap
 *   (v1.6.2 L617, L641): which held Order went is private, so the face-down discard may not show
 *   it to another seat;
 * - a card a seat looked at and put under the Main deck (change 24) that another seat then draws
 *   unseen at the Canal Wharf (L220): the looker may not learn where it went.
 * Such an ID is `rehidden`: an old event record may still name it, a current payload may not.
 * The full-game sweep (`privacy_full_games.test.ts`) applies the same oracle to service games.
 */

import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS, projectEvent, viewOf } from "../../../src/game/index.ts";
import type { GameEvent, OrderId, PlayerId, PublicGameEvent } from "../../../src/game/index.ts";
import { entryPrivacyProblems, foreignSecrets, secretIdsFor, type PrivacyCheckedEntry } from "../../../tools/fixturePrivacy.ts";
import { buildState } from "../engine/support/fixtures.ts";
import { LocalTable } from "../engine/support/localTable.ts";

const DISPLAY: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06"];

function secretOf(event: GameEvent): { visibleTo: PlayerId } | undefined {
  return (event as { secret?: { visibleTo: PlayerId } }).secret;
}

/**
 * The viewer's honest payload: its view, every public event so far and its own secrets. With
 * `plant`, extra keys are added to the public game view, as a leaking server would.
 */
function entryFor(t: LocalTable, viewerId: PlayerId, plant: Record<string, unknown> = {}): PrivacyCheckedEntry {
  const view = viewOf(t.state, viewerId);
  return {
    id: "oracle probe",
    viewerId,
    playerView: { ...view, game: { ...view.game, ...plant } as typeof view.game },
    recentPublicEvents: t.events.map((event, index) => ({ sequence: index + 1, revision: index + 1, actorId: "p1", event: projectEvent(event) })),
    ownSecrets: t.events.flatMap((event, index) =>
      secretOf(event)?.visibleTo === viewerId ? [{ sequence: index + 1, revision: index + 1, actorId: viewerId, event }] : [],
    ),
  };
}

describe("fixture privacy oracle: IDs seen once and moved unseen since", () => {
  it("a face-up Order given up for a Colour Samples swap is secret again in the face-down discard", () => {
    const t = new LocalTable(buildState({ players: [{ techs: ["T10"], hand: ["O40"] }, {}] }), { seed: 3 });
    const faceUp = t.state.market.display[0] as OrderId;
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    t.act("p1", { type: "COMMISSION_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId: faceUp }] });
    // Everyone saw p1 take it.
    expect(foreignSecrets(t.state, "p2", t.events).rehidden.has(faceUp)).toBe(false);
    expect(foreignSecrets(t.state, "p2", t.events).unseen.has(faceUp)).toBe(false);

    t.act("p1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: faceUp });
    expect(t.state.hidden.mainDiscard).toEqual([faceUp]);
    // p2 cannot tell whether faceUp or O40 went: faceUp is secret to p2 again, and so is O40.
    const p2 = foreignSecrets(t.state, "p2", t.events);
    expect(p2.rehidden.get(faceUp)).toMatch(/^Main discard/);
    expect(p2.unseen.get("O40")).toBe("p1's hand");
    // p1 did it, so p1 knows.
    const p1 = foreignSecrets(t.state, "p1", t.events);
    expect(p1.rehidden.has(faceUp) || p1.unseen.has(faceUp)).toBe(false);

    // The old public event that named it is no leak; a payload that places it now is.
    expect(entryPrivacyProblems(t.state, null, entryFor(t, "p2"), t.events)).toEqual([]);
    const leak = entryPrivacyProblems(t.state, null, entryFor(t, "p2", { leakedDiscard: [...t.state.hidden.mainDiscard] }), t.events);
    expect(leak).toEqual([`${faceUp} from Main discard, moved there unseen by p2 at playerView.game.leakedDiscard.0`]);
    // The secrets oracle for pages and fixture files lists only IDs that may appear nowhere:
    // a page may show the old reservation.
    expect(secretIdsFor(t.state, "p2", t.events)).not.toContain(faceUp);
    expect(secretIdsFor(t.state, "p2", t.events)).toContain("O40");
  });

  it("a card the looker put under the deck and another seat then drew unseen is secret to the looker again", () => {
    const rest = MAIN_ORDER_IDS.filter((id) => ![...DISPLAY, "O07", "O08"].includes(id));
    const t = new LocalTable(buildState({ players: [{}, { hand: rest }], display: DISPLAY, mainDeck: ["O07", "O08"], mainDiscard: [] }), { seed: 5 });
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    t.act("p1", { type: "COMMISSION_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId: "O01" }] });
    // Both looked cards went under the deck; the turn-end refill revealed the upper one.
    const revealed = t.state.market.display[5] as OrderId;
    expect(["O07", "O08"]).toContain(revealed);
    const [under] = t.state.hidden.mainDeck as [OrderId];
    expect(foreignSecrets(t.state, "p1", t.events).rehidden.has(under)).toBe(false);

    t.act("p2", { type: "PLACE_CANAL_WHARF", workerId: "p2:shifu" });
    expect(t.state.hidden.orderHands["p2"]).toContain(under);
    // p1 knows the card but not that p2 took it.
    expect(foreignSecrets(t.state, "p1", t.events).rehidden.get(under)).toBe("p2's hand, moved there unseen by p1");
    expect(entryPrivacyProblems(t.state, null, entryFor(t, "p1"), t.events)).toEqual([]);
    const leak = entryPrivacyProblems(t.state, null, entryFor(t, "p1", { leakedHand: [...(t.state.hidden.orderHands["p2"] ?? [])] }), t.events);
    expect(leak.filter((problem) => problem.startsWith(`${under} `))).toEqual([`${under} from p2's hand, moved there unseen by p1 at playerView.game.leakedHand.${rest.length}`]);
  });

  it("checks a response's public events against the authoritative log", () => {
    const t = new LocalTable(buildState({}), { seed: 1 });
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    const honest = { ...entryFor(t, "p1"), events: t.events.map(projectEvent) };
    expect(entryPrivacyProblems(t.state, null, honest, t.events)).toEqual([]);
    const forged = { ...honest, events: [{ type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p1", count: 7 }] as unknown as PublicGameEvent[] };
    expect(entryPrivacyProblems(t.state, null, forged, t.events)).toContain("events[0] is not the projection of an authoritative event");
  });
});
