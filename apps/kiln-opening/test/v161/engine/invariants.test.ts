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
import type {
  FiringCeramicRecord,
  GameAction,
  GameState,
  GuildInspectionStep,
  HeatCalculation,
  LoadedCeramic,
  OrderId,
  TechId,
} from "../../../src/game/types.ts";
import { projectPublicState } from "../../../src/game/view.ts";
import { keySortedJsonRoundTrip, playFuzzGame, richStartState } from "./p7_support.ts";
import { resolveOrderCompletion } from "../../../src/game/orders/completion.ts";
import { buildState, stageCeramic, testContext } from "./support/fixtures.ts";

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
    ["a pending look outside its step", (s: GameState) => void (s.hidden.pendingLook = { kind: "colour_samples", playerId: "p1", orderIds: [s.hidden.mainDeck.shift() as OrderId], inspection: null }), /pending look colour_samples/],
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

describe("the Commission Market step and its Select (v1.6.2 L64, L201–202, B1, B3)", () => {
  /** p1's Shifu has just placed: the top 3 are in the private look, SELECT_CHOOSE is due. */
  function commissionState(): GameState {
    const start = buildState({ players: [{ hand: ["S01"] }, { hand: ["S02"] }] });
    const result = applyAction(start, "p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu" }, new SeededRandom(1));
    if (!result.ok) throw new Error(result.error.code);
    return result.state;
  }

  function stepOf(state: GameState) {
    const phase = state.phase;
    if (phase.type !== "work_turn" || phase.step.kind !== "commission_market") throw new Error("not in the Commission step");
    return phase.step;
  }

  function lookOf(state: GameState): OrderId[] {
    const look = state.hidden.pendingLook;
    if (look?.kind !== "commission_market") throw new Error("no Commission look");
    return look.orderIds;
  }

  it("a fresh Commission step, a 0-card look with a display Order included, is sound", () => {
    const state = commissionState();
    expect(stepOf(state)).toMatchObject({ effect: "shifu", select: { n: 3, maxReservations: 2, fromDisplay: true, lookedCount: 3 } });
    expect(invariantViolations(state, { live: true })).toEqual([]);
    // B1: a look may show no card while the display still offers one.
    state.hidden.mainDeck.unshift(...lookOf(state).splice(0));
    stepOf(state).select.lookedCount = 0;
    expect(invariantViolations(state, { live: true })).toEqual([]);
  });

  it.each([
    ["a look that disagrees with its step", (s: GameState) => {
      s.hidden.mainDeck.unshift(lookOf(s).pop() as OrderId);
    }, /the Commission look disagrees with its step/],
    ["a look larger than N", (s: GameState) => {
      lookOf(s).push(s.hidden.mainDeck.shift() as OrderId);
      stepOf(s).select.lookedCount = 4;
    }, /the commission_market Select shows 4 of 3 cards/],
    ["a reservation limit the effect does not print", (s: GameState) => void (stepOf(s).select.maxReservations = 1), /disagrees with its effect's printed limits/],
    ["an N the effect does not print", (s: GameState) => void (stepOf(s).select.n = 2), /disagrees with its effect's printed limits/],
    ["a Select without the display option", (s: GameState) => void (stepOf(s).select.fromDisplay = false), /the commission_market Select has no display option/],
    ["nothing to reserve", (s: GameState) => {
      s.hidden.mainDeck.unshift(...lookOf(s).splice(0));
      stepOf(s).select.lookedCount = 0;
      s.hidden.mainDiscard.push(...s.market.display.filter((id): id is OrderId => id !== null));
      s.market.display = s.market.display.map(() => null);
    }, /the commission_market Select has nothing to reserve/],
    ["a step whose worker is elsewhere", (s: GameState) => void (stepOf(s).workerId = "p1:apprentice:1"), /worker is not at the Commission Market/],
    ["a step whose effect is not the placement's", (s: GameState) => {
      const step = stepOf(s);
      step.effect = "apprentice";
      step.select.n = 2;
      step.select.maxReservations = 1;
      s.hidden.mainDeck.unshift(lookOf(s).pop() as OrderId);
      step.select.lookedCount = 2;
    }, /worker is not at the Commission Market with that effect/],
    ["a Commission look without its step", (s: GameState) => void (s.phase = { type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } }), /pending look commission_market during work_turn\/after_action/],
  ] as Array<[string, (s: GameState) => void, RegExp]>)("%s is reported", (_name, mutate, pattern) => {
    const state = commissionState();
    mutate(state);
    expect(invariantViolations(state, { live: true }).join("\n")).toMatch(pattern);
  });
});

describe("the Guild Hall inspection, its takes and the deferred Tech refill (v1.6.2 L207–212, B2)", () => {
  /** p1's Shifu inspected the Firing deck (T13, T14) and took `takes` in order. */
  function guildState(...takes: GameAction[]): GameState {
    let state = buildState({ players: [{ resources: { coins: 6 } }, {}] });
    for (const action of [{ type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "firing" } } as GameAction, ...takes]) {
      const result = applyAction(state, "p1", action, new SeededRandom(1), { checkInvariants: true });
      if (!result.ok) throw new Error(`${action.type}: ${result.error.code}`);
      state = result.state;
    }
    return state;
  }

  function stepOf(state: GameState): GuildInspectionStep {
    const phase = state.phase;
    if (phase.type !== "work_turn") throw new Error("not in a Work turn");
    if (phase.step.kind === "guild_inspection") return phase.step;
    if (phase.step.kind === "colour_samples" && phase.step.resume !== null) return phase.step.resume;
    throw new Error(`no Guild inspection in ${phase.step.kind}`);
  }

  const faceUpT10: GameAction = { type: "GUILD_TAKE", take: { kind: "face_up", techId: "T10" } };

  it("an open inspection, a first take with its display position still empty, and one waiting behind Colour Samples are sound", () => {
    expect(invariantViolations(guildState(), { live: true })).toEqual([]);
    const afterTake = guildState({ type: "GUILD_TAKE", take: { kind: "face_up", techId: "T20" } });
    expect(stepOf(afterTake).takes).toEqual([{ kind: "face_up", techId: "T20" }]);
    expect(afterTake.techDisplay.glazing_loading).toEqual(["T10"]);
    expect(invariantViolations(afterTake, { live: true })).toEqual([]);
    const waiting = guildState(faceUpT10);
    expect(waiting.hidden.pendingLook).toMatchObject({ kind: "colour_samples", inspection: { discipline: "firing", techIds: ["T13", "T14"] } });
    expect(invariantViolations(waiting, { live: true })).toEqual([]);
  });

  it.each([
    ["an inspection that disagrees with its step's count", (s: GameState) => {
      const look = s.hidden.pendingLook;
      if (look?.kind === "guild_inspection") s.hidden.techDecks.firing.unshift(look.techIds.pop()!);
    }, /the Guild inspection disagrees with its step's count/],
    ["a third take", (s: GameState) => {
      stepOf(s).takes.push({ kind: "face_up", techId: "T01" }, { kind: "face_up", techId: "T10" }, { kind: "face_up", techId: "T11" });
    }, /a Guild Hall Shifu took 3 Techs/],
    ["two takes of one discipline", (s: GameState) => void stepOf(s).takes.push({ kind: "face_up", techId: "T11" }, { kind: "face_up", techId: "T12" }), /two Techs of one discipline/],
    ["a take the Shifu does not own", (s: GameState) => void stepOf(s).takes.push({ kind: "face_up", techId: "T01" }), /a Guild Hall take is not owned by the Shifu/],
    ["an inspected take of another discipline", (s: GameState) => void stepOf(s).takes.push({ kind: "inspected", techId: "T01" }), /T01 was not inspected from firing/],
    ["an inspection whose worker is not the Shifu", (s: GameState) => void (stepOf(s).workerId = "p1:apprentice:1"), /worker is not the Shifu at the Guild Hall/],
    ["an inspected Tech of the wrong discipline", (s: GameState) => {
      const look = s.hidden.pendingLook;
      if (look?.kind !== "guild_inspection") return;
      s.hidden.techDecks.firing.unshift(look.techIds.pop()!);
      look.techIds.push(s.hidden.techDecks.workshop.pop()!);
    }, /is in a firing inspection/],
  ] as Array<[string, (s: GameState) => void, RegExp]>)("%s is reported", (_name, mutate, pattern) => {
    const state = guildState();
    mutate(state);
    expect(invariantViolations(state, { live: true }).join("\n")).toMatch(pattern);
  });

  it.each([
    ["a resumed inspection behind a look that holds none", (s: GameState) => {
      const look = s.hidden.pendingLook;
      if (look?.kind === "colour_samples" && look.inspection !== null) {
        s.hidden.techDecks.firing.unshift(...look.inspection.techIds);
        look.inspection = null;
      }
    }, /disagree on a resumed Guild inspection/],
    ["a resumed inspection that did not take Colour Samples", (s: GameState) => void (stepOf(s).takes = [{ kind: "face_up", techId: "T12" }]), /waits behind Colour Samples it did not take/],
    ["Techs waiting behind Colour Samples that left the deck twice", (s: GameState) => {
      const look = s.hidden.pendingLook;
      if (look?.kind === "colour_samples" && look.inspection !== null) s.hidden.techDecks.firing.unshift(...look.inspection.techIds);
    }, /Tech T13 is in 2 zones/],
  ] as Array<[string, (s: GameState) => void, RegExp]>)("%s is reported", (_name, mutate, pattern) => {
    const state = guildState(faceUpT10);
    mutate(state);
    expect(invariantViolations(state, { live: true }).join("\n")).toMatch(pattern);
  });

  it("a Tech display left short with cards in its deck is reported outside a worker action (v1.6.2 L209)", () => {
    const state = guildState({ type: "GUILD_TAKE", take: { kind: "face_up", techId: "T20" } });
    expect(invariantViolations(state, { live: true })).toEqual([]);
    // The same short display at the next player's turn start: the refill was skipped.
    state.hidden.pendingLook = null;
    state.phase = { type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } };
    expect(invariantViolations(state).join("\n")).toMatch(/the glazing_loading display shows 1 Techs with 4 in its deck/);
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
    // Salvaging the bottom ceramic (step 11, L281) leaves the stacked one alone in its space;
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
        c1: { ceramicId: "c1", ownerId: "p1", kiln: "shared", spaceId: "low_1", glaze: "moon_white", preferredHeat: 4, positionSource: "zone", first: null, second: null, secondFiringCards: null, saggarsFloor: false, quality: "flawed", history: [], crackle: false, salvaged: true },
        c2: { ceramicId: "c2", ownerId: "p1", kiln: "shared", spaceId: "low_1", glaze: "white", preferredHeat: 1, positionSource: "zone", first: null, second: null, secondFiringCards: null, saggarsFloor: false, quality: "fine", history: [], crackle: false, salvaged: false },
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

describe("the V1.6.2 Tech checks (ENGINE_V1.6.2_DELTA.md §4.12)", () => {
  /** p1 has 1 loaded White Bowl (c1) in this firing, its record merged with `record`. */
  function firingWith(record: Partial<FiringCeramicRecord>, techs: TechId[] = ["T11"]): GameState {
    const state = buildState({
      players: [{ techs }, {}],
      ceramics: [{ owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" }],
    });
    state.firing = {
      round: 1, kilnDie: 2, participantIds: ["p1"], firingPlayerIds: ["p1"], contributionWindowId: null, contributions: {}, unclampedBaseHeat: 2,
      baseHeat: 2, testPieces: [], fireModifier: state.hidden.fireDeck.shift() ?? 0, globalHeat: 2, pendingExtraFire: null,
      ceramics: {
        c1: {
          ceramicId: "c1", ownerId: "p1", kiln: "shared", spaceId: "high_1", glaze: "white", preferredHeat: 1, positionSource: "zone",
          first: null, second: null, secondFiringCards: null, saggarsFloor: false, quality: "standard", history: [], crackle: false, salvaged: false,
          ...record,
        },
      },
    };
    return state;
  }

  const calculation = (fireModifier: -2 | -1 | 0 | 1 | 2): HeatCalculation => ({
    fireModifier, heatSource: 2 + fireModifier, positionModifier: 1, heatMarker: 0, actualHeat: 3 + fireModifier, junAdjustment: 0,
    finalActualHeat: 3 + fireModifier, heatDifference: Math.abs(2 + fireModifier),
  });

  it("sound records pass: a floored Standard, a floored ceramic made Fine, a Second Firing with its 2 cards", () => {
    expect(invariantViolations(firingWith({ saggarsFloor: true }))).toEqual([]);
    expect(invariantViolations(firingWith({ saggarsFloor: true, quality: "fine" }))).toEqual([]);
    expect(invariantViolations(firingWith({ second: calculation(1), secondFiringCards: [-1, 1] }, []))).toEqual([]);
  });

  it.each([
    ["a Protective Saggars owner's Flawed record (v1.6.2 L628)", () => firingWith({ quality: "flawed" }), /c1 of Protective Saggars owner p1 is Flawed/],
    ["the Saggars floor without the Tech", () => firingWith({ saggarsFloor: true }, []), /c1 carries the Saggars floor without Protective Saggars/],
    ["a floored ceramic at Masterpiece", () => firingWith({ saggarsFloor: true, quality: "masterpiece" }), /floored c1 is masterpiece/],
    ["a Second Firing recalculation without its revealed cards", () => firingWith({ second: calculation(1) }, []), /Second Firing record of c1 disagrees/],
    ["a Second Firing card that was not revealed", () => firingWith({ second: calculation(2), secondFiringCards: [-1, 1] }, []), /Second Firing record of c1 disagrees/],
    ["revealed cards without a recalculation", () => firingWith({ secondFiringCards: [0, 0] }, []), /Second Firing record of c1 disagrees/],
  ] as Array<[string, () => GameState, RegExp]>)("%s is reported", (_name, build, pattern) => {
    expect(invariantViolations(build()).join("\n")).toMatch(pattern);
  });

  it("a Finished Flawed ceramic of a Saggars owner is reported only if it was fired after the Tech was gained (L642)", () => {
    const spec = (acquiredInRound: 1 | 2) => buildState({
      round: 2,
      players: [{ techs: [{ id: "T11", acquiredInRound }] }, {}],
      ceramics: [{ owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed", firedInRound: 1 }],
    });
    expect(invariantViolations(spec(1)).join("\n")).toMatch(/Finished c1 of Protective Saggars owner p1 is Flawed/);
    expect(invariantViolations(spec(2))).toEqual([]);
  });

  it("buried Fire cards must fit the deck (R15)", () => {
    const state = buildState({});
    state.hidden.fireBuried = state.hidden.fireDeck.length + 1;
    expect(invariantViolations(state).join("\n")).toMatch(/fireBuried is \d+ with \d+ cards in the Fire deck/);
    state.hidden.fireBuried = -1;
    expect(invariantViolations(state).join("\n")).toMatch(/fireBuried is -1/);
  });

  it("Second Firing's revealed cards wait only in its choice (live tier)", () => {
    const state = firingWith({}, ["T14"]);
    state.phase = { type: "firing_after_quality", queue: { actorIds: ["p1"], index: 0 } };
    const [a, b] = state.hidden.fireDeck.splice(0, 2) as [-2 | -1 | 0 | 1 | 2, -2 | -1 | 0 | 1 | 2];
    state.firing!.pendingExtraFire = { playerId: "p1", ceramicId: "c1", modifiers: [a, b] };
    expect(invariantViolations(state, { live: true }).join("\n")).toMatch(/Second Firing's revealed cards are pending outside its choice/);
  });

  it("Canal Barge's 2 Coins come at most once a round, only to its owner (live tier, v1.6.2 L622)", () => {
    /** p1 completes O01 and O02 (a Bowl and a Plate each) for real, then the record is edited. */
    const completed = (techs: TechId[]) => {
      const state = buildState({ round: 2, players: [{ techs, hand: ["O01", "O02"] }, {}] });
      const bowl = stageCeramic(state, { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" }).id;
      const plate = stageCeramic(state, { owner: "p1", stage: "finished", shape: "plate", glaze: "white", quality: "standard" }).id;
      resolveOrderCompletion(state, "p1", { orderId: "O01", ceramicIds: [bowl] }, testContext());
      resolveOrderCompletion(state, "p1", { orderId: "O02", ceramicIds: [plate] }, testContext());
      return state;
    };
    const sound = completed(["T23"]);
    expect(sound.players["p1"]!.completedOrders.map((r) => r.canalBargeCoins)).toEqual([2, 0]);
    expect(invariantViolations(sound, { live: true })).toEqual([]);
    const twice = completed(["T23"]);
    twice.players["p1"]!.completedOrders[1]!.canalBargeCoins = 2;
    expect(invariantViolations(twice, { live: true }).join("\n")).toMatch(/p1 gained Canal Barge's Coins twice in one round/);
    const unowned = completed([]);
    unowned.players["p1"]!.completedOrders[0]!.canalBargeCoins = 2;
    expect(invariantViolations(unowned, { live: true }).join("\n")).toMatch(/p1 gained Canal Barge's Coins without T23/);
  });

  it("the Colour Samples swap step needs its own look of a Select 3, and T10 spent (live tier)", () => {
    const state = buildState({ players: [{ techs: ["T10"], hand: ["O40"] }, {}] });
    const top = state.hidden.mainDeck.splice(0, 3) as OrderId[];
    state.phase = {
      type: "work_turn",
      activePlayerId: "p1",
      step: { kind: "colour_samples_swap", returnTo: "before_action", select: { n: 3, maxReservations: 1, fromDisplay: true, lookedCount: 3 } },
    };
    state.hidden.pendingLook = { kind: "colour_samples", playerId: "p1", orderIds: top, inspection: null };
    expect(invariantViolations(state, { live: true }).join("\n")).toMatch(/pending look colour_samples during work_turn\/colour_samples_swap/);
    state.hidden.pendingLook = { kind: "colour_samples_swap", playerId: "p1", orderIds: top };
    expect(invariantViolations(state, { live: true }).join("\n")).toMatch(/a Colour Samples swap is open but T10 is ready/);
    state.players["p1"]!.techs[0]!.usedThisRound = true;
    expect(invariantViolations(state, { live: true })).toEqual([]);
    // The swap Selects 3 with 1 reservation (v1.6.2 L622, change 25).
    const step = state.phase.type === "work_turn" && state.phase.step.kind === "colour_samples_swap" ? state.phase.step : null;
    step!.select.n = 2;
    expect(invariantViolations(state, { live: true }).join("\n")).toMatch(/the Colour Samples swap look disagrees with its step/);
    step!.select.n = 3;
    step!.select.maxReservations = 2;
    expect(invariantViolations(state, { live: true }).join("\n")).toMatch(/the Colour Samples swap look disagrees with its step/);
  });

  it("Contribution cards: Bank, Tend and Stoke, plus Fuel Ledger's 2 exactly while Fuel Ledger is owned (change 26)", () => {
    const sound = buildState({ players: [{ techs: ["T12"] }, {}] });
    expect(sound.players["p1"]!.contributionCards).toEqual(["BANK", "TEND", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(invariantViolations(sound)).toEqual([]);
    const missing = structuredClone(sound);
    missing.players["p1"]!.contributionCards.pop();
    expect(invariantViolations(missing).join("\n")).toMatch(/p1 holds Contribution cards BANK, TEND, STOKE, FUEL_LEDGER_BANK, expected/);
    const stolen = structuredClone(sound);
    stolen.players["p2"]!.contributionCards.push("FUEL_LEDGER_STOKE");
    expect(invariantViolations(stolen).join("\n")).toMatch(/p2 holds Contribution cards/);
  });

  it("no Tech VP line in the score ledger (change 27)", () => {
    const state = buildState({ players: [{ techs: ["T01", "T10"] }, {}] });
    expect(invariantViolations(state)).toEqual([]);
    (state.players["p1"]!.score as unknown as Record<string, number>)["techs"] = 2;
    expect(invariantViolations(state).join("\n")).toMatch(/p1's score ledger has lines/);
  });
});
