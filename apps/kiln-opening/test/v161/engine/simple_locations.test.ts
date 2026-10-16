/**
 * Canal Wharf (L216–221) and Magistrate's Hall (L223–233): Apprentice and Shifu effects,
 * Recognition 0–2 only, never to 4, the reached milestone resolved (fixed Grant 1/1/1, L432,
 * change 8), both spaces usable by one player at 4 players (L225).
 */

import { describe, expect, it } from "vitest";
import type { GameAction, Recognition } from "../../../src/game/types.ts";
import { expectPublicEvents, keySorted, reject, scrambleHidden, table, types, verdict, withHands, buildState } from "./workshop_support.ts";

const wharf = (workerId: string): GameAction => ({ type: "PLACE_CANAL_WHARF", workerId });
const hall = (workerId: string): GameAction => ({ type: "PLACE_MAGISTRATES_HALL", workerId });

describe("Canal Wharf: 2 Coins (Apprentice) / 4 Coins (Shifu) (L220–221)", () => {
  it.each([
    ["p1:apprentice:2", "apprentice", 2],
    ["p1:shifu", "shifu", 4],
  ] as const)("%s gains its Coins and hands over", (workerId, effect, coins) => {
    const t = table();
    const events = t.act("p1", wharf(workerId));
    expect(events).toEqual([
      {
        type: "WORKER_PLACED",
        playerId: "p1",
        workerId,
        kind: effect,
        locationId: "canal_wharf",
        spaceIndex: 0,
        effect,
        viaSeniorApprentice: false,
      },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins, reason: "canal_wharf" },
    ]);
    expect(t.player("p1").resources.coins).toBe(3 + coins);
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expectPublicEvents(events);
  });

  it("is uncapped and costs nothing, so it is always legal (L143)", () => {
    const t = table({
      players: [{ resources: { clay: 0, wood: 0, coins: 0 } }, {}, {}, {}],
      placements: [
        { player: "p2", worker: "shifu", locationId: "canal_wharf" },
        { player: "p2", worker: 1, locationId: "canal_wharf" },
        { player: "p3", worker: "shifu", locationId: "canal_wharf" },
        { player: "p3", worker: 1, locationId: "canal_wharf" },
        { player: "p4", worker: "shifu", locationId: "canal_wharf" },
        { player: "p4", worker: 1, locationId: "canal_wharf" },
        { player: "p1", worker: 1, locationId: "canal_wharf" },
      ],
    });
    const events = t.act("p1", wharf("p1:shifu"));
    expect(events[0]).toMatchObject({ spaceIndex: 7 });
    expect(t.player("p1").resources).toEqual({ clay: 0, wood: 0, coins: 4 });
  });
});

describe("Magistrate's Hall: 4 Coins (Apprentice) / 3 Coins (Shifu) for +1 Recognition (L229–230)", () => {
  it("Apprentice: pays 4, advances 0 → 1 and receives the fixed Imperial Grant (L432)", () => {
    const t = table({ players: [{ resources: { clay: 2, wood: 2, coins: 7 } }, {}] });
    const events = t.act("p1", hall("p1:apprentice:1"));
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "RESOURCES_CHANGED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_GRANT_RECEIVED",
      "RESOURCES_CHANGED",
    ]);
    expect(events[1]).toEqual({ type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: -4, reason: "magistrates_hall" });
    expect(events[2]).toEqual({ type: "RECOGNITION_ADVANCED", playerId: "p1", from: 0, to: 1, source: "magistrates_hall", orderId: null });
    expect(events[4]).toMatchObject({ clay: 1, wood: 1, coins: 1, reason: "imperial_grant" });
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 3, coins: 4 });
    expect(t.player("p1").imperial).toMatchObject({ recognition: 1, grantReceived: true });
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expectPublicEvents(events);
  });

  it("Shifu: pays 3, advances 1 → 2 and gains the Imperial Kiln tile (L285, L433)", () => {
    const t = table({ players: [{ recognition: 1, resources: { coins: 3 } }, {}] });
    const events = t.act("p1", hall("p1:shifu"));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "RECOGNITION_ADVANCED", "IMPERIAL_KILN_GAINED"]);
    expect(t.player("p1").resources.coins).toBe(0);
    expect(t.player("p1").imperial).toMatchObject({ recognition: 2, kilnGained: true });
  });

  it("advances 2 → 3 and takes the Imperial Priority token (L434)", () => {
    const t = table({ players: [{ recognition: 2, resources: { coins: 4 } }, {}] });
    const events = t.act("p1", hall("p1:apprentice:3"));
    expect(types(events).slice(2)).toEqual(["RECOGNITION_ADVANCED", "IMPERIAL_PRIORITY_GAINED"]);
    expect(t.player("p1").imperial).toMatchObject({ recognition: 3, priority: "held" });
  });

  it.each([3, 4] as const)("cannot be used at Recognition %i: it never advances you to 4 (L232–233)", (recognition: Recognition) => {
    const error = reject(table({ players: [{ recognition, resources: { coins: 9 } }, {}] }), "p1", hall("p1:shifu"), "RECOGNITION_GATE");
    expect(error.details).toMatchObject({ recognition });
  });

  it("needs no Crown, only the Coins (L232)", () => {
    expect(verdict(buildState({ players: [{ resources: { coins: 4 } }, {}] }), "p1", hall("p1:apprentice:1"))).toBeNull();
    const short = reject(table({ players: [{ resources: { coins: 3 } }, {}] }), "p1", hall("p1:apprentice:1"), "INSUFFICIENT_RESOURCES");
    expect(short.details).toMatchObject({ resource: "coins", needed: 4, have: 3 });
    reject(table({ players: [{ resources: { coins: 2 } }, {}] }), "p1", hall("p1:shifu"), "INSUFFICIENT_RESOURCES");
  });

  it("a player may use both spaces in a 4-player round (L225)", () => {
    const t = table({ players: [{ resources: { coins: 10 } }, {}, {}, {}] });
    t.act("p1", hall("p1:apprentice:1"));
    t.act("p1", hall("p1:shifu"));
    expect(t.player("p1").imperial.recognition).toBe(2);
    expect(t.player("p1").resources.coins).toBe(10 - 4 + 1 - 3);
    reject(t, "p1", hall("p1:apprentice:2"), "LOCATION_FULL");
  });
});

describe("privacy and determinism", () => {
  it("validation depends on the public view only (hidden contents scrambled)", () => {
    for (const recognition of [0, 2, 3] as const) {
      const state = buildState(withHands({ players: [{ recognition, resources: { coins: 4 } }, {}] }));
      for (const command of [hall("p1:apprentice:1"), hall("p1:shifu"), wharf("p1:apprentice:1")]) {
        expect(verdict(scrambleHidden(state), "p1", command)).toBe(verdict(state, "p1", command));
      }
    }
  });

  it("a key-sorted (jsonb) state resolves to the same events and state", () => {
    const spec = withHands({ players: [{ recognition: 1, resources: { coins: 5 } }, {}] });
    const plain = table(spec);
    const sorted = table(spec);
    sorted.state = keySorted(sorted.state);
    expect(sorted.act("p1", hall("p1:shifu"))).toEqual(plain.act("p1", hall("p1:shifu")));
    expect(keySorted(sorted.state)).toEqual(keySorted(plain.state));
  });
});
