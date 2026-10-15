/**
 * The §5.4 agreement property (DESIGN §8.2 `selector_agreement`): every `legal`/`affordable`
 * flag and every listed option of the selectors agrees with `validateAction` /
 * `validateContribution` — over scripted states of every phase and at every decision of
 * seeded full games (the fuzz test also runs it every 10th command). Plus the view models:
 * public information only, never mutating the view, and the values the UI shows.
 */

import { describe, expect, it } from "vitest";
import { KILN_SPACE_IDS, LOCATION_IDS } from "../../../src/game/content.ts";
import { validateAction } from "../../../src/game/engine.ts";
import { legalActions } from "../../../src/game/legalActions.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import {
  boardView,
  canalBargeOptions,
  commissionOptions,
  contributionOptions,
  dingCopyableVesselIndexes,
  firingSummary,
  guildOptions,
  handLimitStatus,
  heatMarkerTargets,
  imperialPriorityOptions,
  kilnSelectionOptions,
  lookedOrderOptions,
  magistratesHallQuote,
  orderMatchOptions,
  orderSelectionCheck,
  placementOptions,
  playerSummary,
  scorePreview,
  settersMarkOptions,
  shapedVessels,
} from "../../../src/game/selectors.ts";
import { computeFinalResult } from "../../../src/game/scoring.ts";
import type { PlayerView } from "../../../src/game/types.ts";
import { actorViewOf, viewOf } from "../../../src/game/view.ts";
import { DIRECTED_WEIGHTS, FuzzTable, playFuzzGame, richStartState, selectorAgreementViolations } from "./p7_support.ts";
import { phaseScenarios } from "./phase_scenarios.ts";
import { buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as Record<string, unknown>)) {
      deepFreeze(inner);
    }
  }
  return value;
}

describe("selector agreement on scripted states", () => {
  it.each(phaseScenarios().map((s) => [s.name, s] as const))("%s", (_name, scenario) => {
    expect(selectorAgreementViolations(scenario.table.state, scenario.table.privateState, scenario.actor)).toEqual([]);
    // Players without the decision see options that the validator also refuses them.
    for (const playerId of scenario.table.state.playerOrder.filter((id) => id !== scenario.actor)) {
      expect(selectorAgreementViolations(scenario.table.state, scenario.table.privateState, playerId), playerId).toEqual([]);
    }
  });

  it.each([2, 3, 4] as const)("at the start of a rich %i-player game, for every seat", (count) => {
    const state = richStartState(20 + count, count);
    for (const playerId of state.playerOrder) {
      expect(selectorAgreementViolations(state, null, playerId), playerId).toEqual([]);
    }
  });
});

// Verifier finding (minor): canalBargeOptions listed Orders outside the Canal Barge window.
describe("Canal Barge options only in the owner's before- and after-action windows", () => {
  const base = {
    players: [{ techs: ["T23" as const], hand: ["O01" as const] }, {}],
    ceramics: [{ owner: "p1" as const, stage: "finished" as const, shape: "bowl" as const, glaze: "white" as const, quality: "standard" as const }],
  };
  it.each([
    ["the Order Phase", buildState({ ...base, phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 } }), []],
    ["another player's Work turn", buildState({ ...base, phase: { type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } } }), []],
    ["the owner's before-action window", buildState(base), ["O01"]],
  ] as const)("%s", (_name, state, expected) => {
    const view = actorViewOf(state, "p1");
    const options = canalBargeOptions(view);
    expect(options.map((o) => o.orderId)).toEqual(expected);
    for (const option of options) {
      expect(validateAction(view, { type: "USE_CANAL_BARGE", orderId: option.orderId, ceramicIds: option.ceramicIds })).toBeNull();
    }
    expect(selectorAgreementViolations(state, null, "p1")).toEqual([]);
  });
});

describe("selector agreement at every decision of full games", () => {
  it.each([
    [2, "new"],
    [3, "rich"],
    [4, "new"],
  ] as const)("%i players (%s start)", (playerCount, start) => {
    const seed = 8800 + playerCount;
    const result = playFuzzGame({ start, seed, chooserSeed: seed + 1, playerCount, agreementEvery: 1, legalityEvery: 0, weights: DIRECTED_WEIGHTS });
    expect(result.table.state.phase.type).toBe("finished");
  });
});

describe("view models", () => {
  const state = buildState({
    players: [{ kilnId: "DI", techs: ["T10", "T14"], recognition: 2, resources: { clay: 5, wood: 4, coins: 7 }, hand: ["S01", "O01", "O02", "O03", "O04", "O05"] }, { kilnId: "GU" }],
    ceramics: [
      { owner: "p1", stage: "shaped", shape: "bowl", decoration: "carved" },
      { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "middle_1", heatMarker: { source: "own", faceDown: true } },
      { owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "imperial", imperialModifier: 1 },
      { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" },
      { owner: "p1", stage: "finished", shape: "plate", glaze: "celadon", quality: "fine" },
    ],
    placements: [{ player: "p2", worker: "shifu", locationId: "materials_yard" }],
  });

  it("never mutate the view and need no hidden state", () => {
    const frozen = deepFreeze(viewOf(state, "p1")) as PlayerView;
    expect(() => {
      boardView(frozen);
      playerSummary(frozen, "p1");
      playerSummary(frozen, "p2");
      scorePreview(frozen, "p1");
      placementOptions(frozen);
      legalActions(frozen, { mode: "canonical" });
      commissionOptions(frozen, "shifu");
      guildOptions(frozen, "apprentice");
      magistratesHallQuote(frozen, "apprentice");
      imperialPriorityOptions(frozen);
      kilnSelectionOptions(frozen);
      orderMatchOptions(frozen, "S01");
    }).not.toThrow();
    expect(Object.hasOwn(frozen.game, "hidden")).toBe(false);
  });

  it("boardView lists the board in canonical order with occupants and effective modifiers", () => {
    const board = boardView(viewOf(state, null));
    expect(board.centralLocations.map((l) => l.locationId)).toEqual(["materials_yard", "commission_market", "guild_hall", "canal_wharf", "magistrates_hall"]);
    expect(board.centralLocations[0]?.occupants).toEqual([
      { playerId: "p2", workerId: "p2:shifu", kind: "shifu", effect: "shifu", viaSeniorApprentice: false, spaceIndex: 0, sequence: 0 },
    ]);
    expect(board.kilnSpaces.map((s) => s.spaceId)).toEqual([...KILN_SPACE_IDS]);
    expect(board.kilnSpaces.find((s) => s.spaceId === "middle_1")?.ceramics.map((c) => c.id)).toEqual(["c2"]);
    expect(board.kilnSpaces.find((s) => s.spaceId === "high_1")?.effectiveModifier).toBe(1);
    expect(board.techDisplay.map((t) => t.discipline)).toEqual(["workshop", "glazing_loading", "firing"]);
    expect(board.prompt).toEqual({ phaseType: "work_turn", actorIds: ["p1"], mode: "single" });
    expect(board.counts.orderHands).toEqual({ p1: 6, p2: 0 });
    expect(JSON.stringify(board)).not.toContain("O05");
  });

  it("playerSummary reports readiness, workers, spaces, Imperial status, markers and stages", () => {
    const summary = playerSummary(viewOf(state, "p2"), "p1");
    expect(summary).toMatchObject({
      playerId: "p1",
      kilnId: "DI",
      kilnAbilityReady: true,
      recognition: 2,
      orderHandCount: 6,
      handLimit: 5,
      heatMarkerCeramicId: "c2",
      kilnMasterCeramicId: null,
      shapedCeramicIds: ["c1"],
      loadedCeramicIds: ["c2", "c3"],
      finishedCeramicIds: ["c4", "c5"],
      availableWorkerIds: ["p1:shifu", "p1:apprentice:1", "p1:apprentice:2", "p1:apprentice:3"],
      imperial: { kilnGained: true, priority: "on_track", priorityUsableNow: false },
    });
    expect(summary.imperial.kilnCeramic?.id).toBe("c3");
    expect(summary.techs.map((t) => [t.techId, t.oncePerRound, t.ready])).toEqual([
      ["T10", false, true],
      ["T14", true, true],
    ]);
    expect(summary.personalSpaces.filter((s) => s.locationId === "glaze_load").map((s) => s.unlocked)).toEqual([true, true]);
    // Two Techs, each 1 VP recorded on gain (owner amendment A1).
    expect(summary.recorded.techs).toBe(2);
    expect(summary.recordedVp).toBe(2);
    expect(handLimitStatus(viewOf(state, "p2"), "p1")).toEqual({ held: 6, limit: 5, mustDiscard: 1 });
  });

  it("scorePreview is the final scoring of the public state", () => {
    const preview = scorePreview(viewOf(state, null), "p1");
    expect(preview.breakdown).toEqual(computeFinalResult(state).scores["p1"]);
    expect(firingSummary(viewOf(state, null))).toBeNull();
  });

  it("placementOptions marks occupancy, capacity, the next personal space and Senior Apprentice", () => {
    const options = placementOptions(viewOf(state, "p1"));
    expect(options.map((o) => o.locationId)).toEqual([...LOCATION_IDS]);
    const yard = options.find((o) => o.locationId === "materials_yard");
    expect(yard).toMatchObject({ legal: true, occupancy: 1, capacity: 2, seniorApprentice: false, nextSpaceIndex: null });
    expect(yard?.workers.map((w) => [w.workerId, w.effect, w.legal])).toEqual([
      ["p1:shifu", "shifu", true],
      ["p1:apprentice:1", "apprentice", true],
    ]);
    expect(options.find((o) => o.locationId === "glaze_load")).toMatchObject({ legal: true, capacity: 2, nextSpaceIndex: 0 });
    // Not p2's turn: nothing is legal for p2.
    const other = placementOptions(viewOf(state, "p2"));
    expect(other.every((o) => !o.legal && o.workers.every((w) => w.reason === "NOT_YOUR_DECISION"))).toBe(true);
    // A spectator sees the board without worker choices.
    expect(placementOptions(viewOf(state, null)).every((o) => o.workers.length === 0 && !o.legal)).toBe(true);
  });

  it("quotes and option lists carry the values the UI shows", () => {
    const view = viewOf(state, "p1");
    expect(magistratesHallQuote(view, "apprentice")).toMatchObject({ ok: true, pay: { clay: 0, wood: 0, coins: 4 }, reachable: 3 });
    expect(magistratesHallQuote(view, "shifu")).toMatchObject({ ok: true, pay: { coins: 3 }, reachable: 3 });
    const shifuGuild = guildOptions(view, "shifu");
    for (const option of shifuGuild.faceUp) {
      expect(option.price).toBe(Math.max(0, option.printedCost - 1));
    }
    expect(shifuGuild.inspect.map((i) => i.discipline)).toEqual(["workshop", "glazing_loading", "firing"]);
    expect(guildOptions(view, "apprentice").inspect).toEqual([]);
    expect(commissionOptions(view, "apprentice")).toMatchObject({ maxReservations: 1, lookTopThree: false, blind: true, faceUpSlots: [0, 1, 2, 3, 4, 5] });
    expect(commissionOptions(view, "shifu")).toMatchObject({ maxReservations: 2, lookTopThree: true });
    expect(shapedVessels(view, "p1").map((c) => c.id)).toEqual(["c1"]);
    expect(lookedOrderOptions(view)).toBeNull();
    expect(settersMarkOptions(view)).toEqual([]);
    expect(kilnSelectionOptions(view).map((k) => [k.kilnId, k.available, k.chosenBy])).toEqual([
      ["RU", true, null],
      ["GU", false, "p2"],
      ["GE", true, null],
      ["DI", false, "p1"],
      ["JU", true, null],
    ]);
  });

  it("heatMarkerTargets: loaded ceramics without a marker and the pending loads (R9); none once the marker is out", () => {
    const fresh = buildState({
      players: [{}, {}],
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "middle_1" },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
      ],
    });
    const view = actorViewOf(fresh, "p1");
    const loads = [{ ceramicId: "c1", glaze: "white" as const, destination: { kiln: "shared" as const, spaceId: "low_1" as const } }];
    expect(heatMarkerTargets(view, "p1", loads)).toEqual(["c2", "c1"]);
    expect(validateAction(view, { type: "PLACE_GLAZE_LOAD", workerId: "p1:shifu", loads, heatMarkerCeramicId: "c2" })).toBeNull();
    expect(validateAction(view, { type: "PLACE_GLAZE_LOAD", workerId: "p1:shifu", loads, heatMarkerCeramicId: "c3" })?.code).toBe("CERAMIC_NOT_OWNED");
    expect(heatMarkerTargets(viewOf(state, "p1"), "p1", [])).toEqual([]);
  });

  it("dingCopyableVesselIndexes lists only Bowls, Plates and Brush Washers, with Ding ready", () => {
    const view = viewOf(state, "p1");
    const draft = { type: "PLACE_FORM_DECORATE" as const, workerId: "p1:shifu", vessels: [{ shape: "vase" as const, decoration: "plain" as const }, { shape: "washer" as const, decoration: "carved" as const }] };
    expect(dingCopyableVesselIndexes(view, draft)).toEqual([1]);
    expect(dingCopyableVesselIndexes(viewOf(buildState({ players: [{ kilnId: "RU" }, {}] }), "p1"), draft)).toEqual([]);
  });

  it("orderSelectionCheck runs the validator's matcher and says whether the selection can still grow", () => {
    const view = viewOf(state, "p1");
    expect(orderSelectionCheck(view, "S01", ["c4"])).toMatchObject({ ok: true, match: { orderId: "S01", ceramicIds: ["c4"], vp: 2 } });
    const wrong = orderSelectionCheck(view, "O02", ["c4"]);
    expect(wrong).toMatchObject({ ok: false, error: { code: "ORDER_REQUIREMENTS_NOT_MET" } });
    const notHeld = orderSelectionCheck(view, "O40", ["c4"]);
    expect(notHeld).toMatchObject({ ok: false, error: { code: "ORDER_NOT_HELD" }, extendable: false });
    expect(orderSelectionCheck(view, "S01", [])).toMatchObject({ ok: false, extendable: true });
  });

  it("contributionOptions shows Wood, Heat and affordability, with Fuel Ledger only when owned", () => {
    const table = new FuzzTable(
      buildState({
        players: [{ techs: ["T12"], resources: { wood: 1 } }, {}],
        ceramics: [
          { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
        ],
        placements: [
          ...[1, 2, 3].map((n) => ({ player: "p1", worker: n as 1 | 2 | 3, locationId: "canal_wharf" as const })),
          ...[1, 2, 3].map((n) => ({ player: "p2", worker: n as 1 | 2 | 3, locationId: "canal_wharf" as const })),
          { player: "p2", worker: "shifu" as const, locationId: "canal_wharf" as const },
        ],
      }),
      new SeededRandom(1),
      [],
    );
    table.apply("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:shifu" });
    expect(table.state.phase.type).toBe("firing_contributions");
    const options = contributionOptions(table.view("p1"));
    expect(options.map((o) => [o.command.card, o.command.fuelLedger, o.woodCost, o.heat, o.affordable])).toEqual([
      ["TEND", false, 0, 0, true],
      ["BANK", false, 1, -1, true],
      ["STOKE", false, 1, 1, true],
      ["BANK", true, 2, -2, false],
      ["STOKE", true, 2, 2, false],
    ]);
    expect(contributionOptions(table.view("p2")).length).toBe(3);
    expect(contributionOptions(viewOf(table.state, null))).toEqual([]);
  });

  it("a completed scripted turn keeps the UI's own pickers in step (Commission sub-step)", () => {
    const table = new LocalTable(buildState({ players: [{ resources: { coins: 9 } }, {}] }));
    const orderId = table.state.market.display[2];
    if (orderId === null || orderId === undefined) {
      throw new Error("no display");
    }
    table.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:shifu", first: { kind: "face_up", slotIndex: 2, orderId, gain: "coins" } });
    const options = commissionOptions(table.view("p1"), "apprentice");
    expect(options).toMatchObject({ effect: "shifu", reservationsMade: 1, canStop: true, gainNow: false, lookTopThree: true });
    expect(options.faceUpSlots).not.toContain(2);
  });
});
