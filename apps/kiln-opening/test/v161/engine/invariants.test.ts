/**
 * `assertInvariants` (DESIGN §8.3): sound states pass both tiers; each kind of corruption is
 * reported. The structural tier is the dispatcher's `checkInvariants` hook; the live tier adds
 * what holds only between production-flow commands.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../../src/game/engine.ts";
import { InvariantError } from "../../../src/game/errors.ts";
import { assertInvariants, hiddenIdsIn, invariantViolations, publiclyVisibleIds } from "../../../src/game/invariants.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import type { GameState, LoadedCeramic, OrderId } from "../../../src/game/types.ts";
import { projectPublicState } from "../../../src/game/view.ts";
import { keySortedJsonRoundTrip, playFuzzGame, richStartState } from "./p7_support.ts";
import { buildState } from "./support/fixtures.ts";

function base(): GameState {
  return buildState({
    players: [{ techs: ["T15", "T24"], hand: ["S01", "O01"] }, { techs: ["T22"], hand: ["S02"] }],
    ceramics: [
      { owner: "p1", stage: "shaped", shape: "bowl" },
      { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "middle_1", kilnFurniture: 1, heatMarker: { source: "own", faceDown: true } },
      { owner: "p2", stage: "loaded", shape: "vase", glaze: "celadon", at: "high_1" },
      { owner: "p1", stage: "finished", shape: "censer", glaze: "grey_green", quality: "fine", crackle: true },
    ],
    settersMarks: { low_1: "p2" },
  });
}

function violations(mutate: (state: GameState) => void, live = false): string[] {
  const state = base();
  mutate(state);
  return invariantViolations(state, { live });
}

function loaded(state: GameState, id: string): LoadedCeramic {
  const c = state.ceramics[id];
  if (c?.stage !== "loaded") {
    throw new Error(`${id} is not loaded`);
  }
  return c;
}

describe("sound states", () => {
  it("a scenario state passes the structural tier, and its key-sorted copy too", () => {
    expect(invariantViolations(base())).toEqual([]);
    expect(invariantViolations(keySortedJsonRoundTrip(base()))).toEqual([]);
    expect(() => assertInvariants(base())).not.toThrow();
  });

  it.each([2, 3, 4] as const)("a rich %i-player start passes the live tier", (count) => {
    expect(invariantViolations(richStartState(5, count), { live: true })).toEqual([]);
  });

  it("every state of a full game passes the live tier (checked by the driver after every command)", () => {
    const { table } = playFuzzGame({ seed: 31, chooserSeed: 32, playerCount: 4, agreementEvery: 0, legalityEvery: 0 });
    expect(invariantViolations(table.state, { live: true })).toEqual([]);
  });
});

describe("structural violations are reported", () => {
  it.each([
    ["JSON safety: NaN", (s: GameState) => void (s.players["p1"]!.resources.coins = Number.NaN), /not JSON-safe/],
    ["JSON safety: undefined", (s: GameState) => void ((s as unknown as Record<string, unknown>)["extra"] = undefined), /undefined/],
    ["JSON safety: -0", (s: GameState) => void (s.placementSequence = -0), /-0/],
    ["JSON safety: a class instance", (s: GameState) => void ((s as unknown as Record<string, unknown>)["extra"] = new Map()), /not a plain object/],
    ["negative resources", (s: GameState) => void (s.players["p1"]!.resources.wood = -1), /has -1 wood/],
    ["an Order in two zones", (s: GameState) => void s.hidden.mainDeck.push("S01"), /Order S01 is in 2 zones/],
    ["a missing Order", (s: GameState) => void s.hidden.orderHands["p2"]!.pop(), /Order S02 is in 0 zones/],
    ["a Starting Order in the Main deck", (s: GameState) => {
      s.hidden.orderHands["p2"] = [];
      s.hidden.mainDeck.push("S02");
    }, /Starting Order S02 is in the main deck/],
    ["a Tech in two zones", (s: GameState) => void s.hidden.techDecks.firing.push("T24"), /Tech T24 is in 2 zones/],
    ["a missing Fire card", (s: GameState) => void s.hidden.fireDeck.pop(), /Fire cards are/],
    ["a duplicated Vessel card", (s: GameState) => void s.vesselSupply.bowl.push(s.ceramics["c1"]!.vesselInstanceId), /Vessel card bowl-01 is in 2 places/],
    ["a Crackle ceramic that is not Fine", (s: GameState) => void ((s.ceramics["c4"] as { quality: string }).quality = "standard"), /Crackle ceramic c4 is standard/],
    ["a loaded ceramic its space does not list", (s: GameState) => void (s.sharedKiln.spaces.high_1.ceramicIds = []), /c3 is (not listed|loaded but no space lists it)/],
    ["a Setter's Mark on an occupied space", (s: GameState) => {
      s.sharedKiln.spaces.low_1.setterMarkOwnerId = null;
      s.sharedKiln.spaces.high_1.setterMarkOwnerId = "p2";
    }, /Setter's Mark on high_1/],
    ["a Setter's Mark without T22", (s: GameState) => void (s.sharedKiln.spaces.low_1.setterMarkOwnerId = "p1"), /without T22/],
    ["a Setter's Mark during Cleanup", (s: GameState) => void (s.phase = { type: "cleanup_hand_limit", pendingPlayerIds: [], openedAtRevision: 0 }), /during cleanup_hand_limit/],
    ["Kiln Furniture under another player's ceramic", (s: GameState) => {
      s.sharedKiln.spaces.middle_1.kilnFurniture = null;
      s.sharedKiln.spaces.high_1.kilnFurniture = { ownerId: "p1", modifier: 0, underCeramicId: "c3" };
    }, /beneath another player's ceramic/],
    ["two own Heat markers", (s: GameState) => {
      const other = loaded(s, "c3");
      other.ownerId = "p1";
      other.heatMarker = { source: "own", faceDown: true };
    }, /p1's Heat marker is on 2 ceramics/],
    ["a Kiln Master marker without T24", (s: GameState) => void (loaded(s, "c3").heatMarker = { source: "kiln_master", faceDown: false, value: 1 }), /lacks T24/],
    ["a face-down marker after the Fire reveal", (s: GameState) => {
      s.firing = {
        round: 1, kilnDie: 2, participantIds: ["p1", "p2"], firingPlayerIds: ["p1", "p2"], contributionWindowId: null, contributions: {}, unclampedBaseHeat: 2,
        baseHeat: 2, testPieces: [], fireModifier: s.hidden.fireDeck.shift() ?? 0, globalHeat: 2, ceramics: {}, pendingExtraFire: null,
      };
    }, /face-down Heat marker after the Fire reveal/],
    ["four Techs", (s: GameState) => {
      for (const id of ["T01", "T11"] as const) {
        for (const d of ["workshop", "firing"] as const) {
          s.hidden.techDecks[d] = s.hidden.techDecks[d].filter((tech) => tech !== id);
          s.techDisplay[d] = s.techDisplay[d].filter((tech) => tech !== id);
        }
        s.players["p1"]!.techs.push({ id, acquiredInRound: 1, usedThisRound: false });
      }
    }, /owns 4 Techs/],
    ["two Techs of one discipline", (s: GameState) => {
      s.hidden.techDecks.firing = s.hidden.techDecks.firing.filter((id) => id !== "T11");
      s.techDisplay.firing = s.techDisplay.firing.filter((id) => id !== "T11");
      s.players["p2"]!.techs.push({ id: "T11", acquiredInRound: 1, usedThisRound: false }, { id: "T14", acquiredInRound: 1, usedThisRound: false });
      s.hidden.techDecks.firing = s.hidden.techDecks.firing.filter((id) => id !== "T14");
      s.techDisplay.firing = s.techDisplay.firing.filter((id) => id !== "T14");
    }, /owns 2 firing Techs/],
    ["a second personal space unlocked without a Tech", (s: GameState) => void (s.players["p2"]!.personalSpaces.form_decorate[1].unlocked = true), /second form_decorate space unlocked=true/],
    ["Recognition flags that disagree", (s: GameState) => void (s.players["p2"]!.imperial.kilnGained = true), /Imperial Kiln flag disagrees/],
    ["an over-full location", (s: GameState) => {
      for (const id of ["p1:shifu", "p1:apprentice:1", "p2:shifu"]) {
        const owner = s.players[id.split(":")[0] as string]!;
        owner.workers[id]!.placement = { locationId: "magistrates_hall", spaceIndex: 0, effect: "shifu", viaSeniorApprentice: false, sequence: s.placementSequence++ };
      }
    }, /magistrates_hall holds 3 workers/],
    ["a non-limited Tech marked used", (s: GameState) => {
      s.hidden.techDecks.firing = s.hidden.techDecks.firing.filter((id) => id !== "T12");
      s.techDisplay.firing = s.techDisplay.firing.filter((id) => id !== "T12");
      s.players["p2"]!.techs.push({ id: "T12", acquiredInRound: 1, usedThisRound: true });
    }, /no per-round limit but is marked used/],
    ["an unseated actor", (s: GameState) => void (s.phase = { type: "work_turn", activePlayerId: "ghost", step: { kind: "before_action" } }), /not seated/],
    ["a hidden Order in the public projection", (s: GameState) => void (s.players["p2"]!.displayName = "O01"), /public projection names hidden IDs O01/],
  ] as Array<[string, (s: GameState) => void, RegExp]>)("%s", (_name, mutate, pattern) => {
    const found = violations(mutate);
    expect(found.join("\n")).toMatch(pattern);
  });

  it("assertInvariants throws an InvariantError listing the violations, and the dispatcher's hook runs it", () => {
    const state = base();
    state.players["p1"]!.resources.coins = -3;
    expect(() => assertInvariants(state)).toThrow(InvariantError);
    expect(() => assertInvariants(state)).toThrow(/p1 has -3 coins/);
    const result = () => applyAction(state, "p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" }, new SeededRandom(1), { checkInvariants: true });
    expect(result).toThrow(InvariantError);
  });
});

describe("live violations are reported", () => {
  it.each([
    ["an exhausted queue", (s: GameState) => void (s.phase = { type: "firing_heat_markers", queue: { actorIds: [], index: 0 } }), /has no actor|queue is exhausted|firing is null/],
    ["a firing phase without a firing", (s: GameState) => void (s.phase = { type: "firing_salvage", pendingPlayerIds: ["p1"], openedAtRevision: 0 }), /firing is null in firing_salvage/],
    ["a Setter's Mark out while T22 is ready", () => undefined, /Setter's Mark is out but T22 is ready/],
    ["Kiln Furniture in the kiln while T15 is ready", () => undefined, /Kiln Furniture is in the kiln but T15 is ready/],
    ["a ledger that disagrees with completed Orders", (s: GameState) => void (s.players["p2"]!.score.orders = 4), /recorded 4 Order VP/],
    ["a Kiln Die from another round", (s: GameState) => void (s.kilnDie = { round: 2, value: 1 }), /Kiln Die was not rolled this round/],
    ["a pending look outside its step", (s: GameState) => void (s.hidden.pendingLook = { kind: "colour_samples", playerId: "p1", orderIds: [s.hidden.mainDeck.shift() as OrderId] }), /pending look colour_samples/],
  ] as Array<[string, (s: GameState) => void, RegExp]>)("%s", (_name, mutate, pattern) => {
    const found = violations(mutate, true);
    expect(found.join("\n")).toMatch(pattern);
  });

  it("the structural tier tolerates states a halting-flow test leaves between hand-overs", () => {
    const state = base();
    state.phase = { type: "firing_salvage", pendingPlayerIds: [], openedAtRevision: 0 };
    state.sharedKiln.spaces.low_1.setterMarkOwnerId = null;
    expect(invariantViolations(state)).toEqual([]);
  });
});

describe("Inverted Firing stacks and salvage (found by the fuzz test)", () => {
  function stackState(): GameState {
    return buildState({
      players: [{ techs: ["T21"] }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "moon_white", at: "low_1" },
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "low_1" },
      ],
    });
  }

  it("a stacked ceramic left alone after the one beneath it is salvaged is sound", () => {
    // Salvaging the bottom ceramic (step 11, L280) leaves the stacked one alone in its space;
    // `stacked` records how it was loaded, and the kiln empties at step 12.
    const state = stackState();
    expect(invariantViolations(state)).toEqual([]);
    state.sharedKiln.spaces.low_1.ceramicIds = ["c2"];
    state.vesselSupply.plate.push(state.ceramics["c1"]!.vesselInstanceId);
    state.vesselSupply.plate.sort();
    delete state.ceramics["c1"];
    state.firing = {
      round: 1, kilnDie: 2, participantIds: ["p1"], firingPlayerIds: ["p1"], contributionWindowId: null, contributions: {}, unclampedBaseHeat: 2,
      baseHeat: 2, testPieces: [], fireModifier: state.hidden.fireDeck.shift() ?? 0, globalHeat: 2, pendingExtraFire: null,
      ceramics: {
        c1: { ceramicId: "c1", ownerId: "p1", kiln: "shared", spaceId: "low_1", glaze: "moon_white", preferredHeat: 4, positionSource: "zone", first: null, second: null, quality: "flawed", history: [], crackle: false, salvaged: true },
        c2: { ceramicId: "c2", ownerId: "p1", kiln: "shared", spaceId: "low_1", glaze: "white", preferredHeat: 1, positionSource: "zone", first: null, second: null, quality: "fine", history: [], crackle: false, salvaged: false },
      },
    };
    expect(invariantViolations(state)).toEqual([]);
  });

  it("a stacked ceramic alone in a space without a salvage is reported", () => {
    const state = stackState();
    (state.ceramics["c1"] as LoadedCeramic).placement = { kiln: "shared", spaceId: "low_1", stacked: true };
    (state.ceramics["c2"] as LoadedCeramic).placement = { kiln: "shared", spaceId: "low_1", stacked: false };
    expect(invariantViolations(state).join("\n")).toMatch(/c1 in low_1 has stacked=true at position 0/);
  });
});

describe("the public-ID scan", () => {
  it("allows displayed, completed and owned IDs only", () => {
    const state = base();
    const allowed = publiclyVisibleIds(state);
    expect(hiddenIdsIn(projectPublicState(state), allowed)).toEqual([]);
    expect(hiddenIdsIn({ a: ["S01", state.market.display[0]], T22: 1 }, allowed)).toEqual(["S01"]);
  });
});
