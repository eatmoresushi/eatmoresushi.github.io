/**
 * Production-UI selectors (UI_V1.6.1_ARCHITECTURE.md §5): shape, D3/D4 and agreement tests.
 *
 * Contract part (A1.1): `handLimitStatus(...).trimDue` (gap 3), `kilnLayout` (gap 5),
 * `firingStageView` / `firingRecapView` (gaps 7, 18) and `ROUND_STRUCTURE` / `roundPhaseOf`
 * (gap 17). None of them is a rule: each is checked against the engine's own state or flow.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as engine from "../../../src/game/index.ts";
import { DECORATIONS, GAME_CONFIG, KILN_SPACE_IDS, LOCATIONS, LOCATION_IDS, SHAPES, zoneOf } from "../../../src/game/content.ts";
import { validateAction } from "../../../src/game/engine.ts";
import { legalActions } from "../../../src/game/legalActions.ts";
import { ROUND_PHASE_IDS, ROUND_STRUCTURE, roundPhaseOf } from "../../../src/game/roundStructure.ts";
import { CONTENT_SOURCES, RULES_BEHAVIOUR_REVISION, rulesFingerprint } from "../../../src/game/rulesFingerprint.ts";
import {
  SCORE_BREAKDOWN_ROWS,
  TIE_BREAK_ORDER,
  crackleDeclarationChecks,
  firingRecapView,
  firingStageView,
  glazeLoadVesselOptions,
  handLimitStatus,
  imperialPriorityOptions,
  kilnLayout,
  materialsYardOptions,
  placementLimits,
  placementOptions,
  playerSummary,
} from "../../../src/game/selectors.ts";
import { computeFinalResult } from "../../../src/game/scoring.ts";
import { ceramicSequence, lookup } from "../../../src/game/state.ts";
import type {
  FiringContext,
  FiringStageView,
  GamePhaseType,
  GameState,
  KilnZone,
  PlayerCount,
  PlayerId,
  RoundNumber,
  RoundPhaseId,
} from "../../../src/game/types.ts";
import { viewOf } from "../../../src/game/view.ts";
import { phaseScenarios } from "./phase_scenarios.ts";
import { openFiringTable, tendAll } from "./support/firing.ts";
import { buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { driveGame, firingStageKeyViolations, legalMaterialsYardCommands, uiOptionScenarios } from "./ui_support.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// ── Gap 3: trimDue ───────────────────────────────────────────────────────────────────

describe("handLimitStatus.trimDue (§5 gap 3)", () => {
  it("is mustDiscard > 0 in Rounds 1–4 and false in Round 5", () => {
    for (const round of [1, 2, 3, 4, 5] as const) {
      const state = buildState({
        round,
        players: [{ hand: ["S01", "S02", "O01", "O02", "O03", "O04"] }, { hand: ["O05", "O06", "S03", "S04"] }, { techs: ["T10"], hand: ["O07", "O08", "O09", "O10", "O11"] }],
        display: ["O20", "O21", "O22", "O23", "O24", "O25"],
      });
      for (const viewer of ["p1", "p2", "p3", null] as const) {
        const view = viewOf(state, viewer);
        const over = handLimitStatus(view, "p1");
        expect(over).toEqual({ held: 6, limit: 4, mustDiscard: 2, trimDue: round < 5 });
        expect(handLimitStatus(view, "p2")).toEqual({ held: 4, limit: 4, mustDiscard: 0, trimDue: false });
        // Colour Samples raises the limit to 5 (L626).
        expect(handLimitStatus(view, "p3")).toEqual({ held: 5, limit: 5, mustDiscard: 0, trimDue: false });
      }
    }
  });

  it("names exactly the players Cleanup asks to trim, and none in Round 5", () => {
    let cleanups = 0;
    for (const [seed, playerCount] of [
      [3, 3],
      [8, 4],
      [21, 2],
    ] as const) {
      driveGame({ seed, playerCount, start: "rich" }, (table) => {
        const state = table.state;
        const view = viewOf(state, null);
        const due = state.playerOrder.filter((pid) => handLimitStatus(view, pid).trimDue);
        if (state.round === 5) {
          expect(due, `round 5 ${state.phase.type}`).toEqual([]);
        }
        if (state.phase.type === "cleanup_hand_limit") {
          cleanups += 1;
          expect(due).toEqual(state.phase.pendingPlayerIds);
        }
      });
    }
    expect(cleanups).toBeGreaterThan(0);
  });
});

// ── Gap 5: kilnLayout ────────────────────────────────────────────────────────────────

function zoneCounts(ids: readonly string[]): Record<KilnZone, number> {
  const counts: Record<KilnZone, number> = { high: 0, middle: 0, low: 0 };
  for (const id of ids) counts[zoneOf(id as (typeof KILN_SPACE_IDS)[number])] += 1;
  return counts;
}

describe("kilnLayout (§5 gap 5)", () => {
  it.each([
    [2, { high: 2, middle: 1, low: 1 }],
    [3, { high: 2, middle: 2, low: 2 }],
    [4, { high: 3, middle: 3, low: 2 }],
  ] as const)("%i players: High-Middle-Low covers %o", (playerCount, expected) => {
    const state = buildState({ players: playerCount as PlayerCount });
    const layout = kilnLayout(viewOf(state, "p1"));
    expect(zoneCounts(layout.activeSpaceIds)).toEqual(expected);
    expect([...layout.activeSpaceIds, ...layout.coveredSpaceIds].sort()).toEqual([...KILN_SPACE_IDS].sort());
    expect(layout.activeSpaceIds).toEqual(KILN_SPACE_IDS.filter((id) => state.sharedKiln.spaces[id].active));
    expect(layout.coveredSpaceIds).toEqual(KILN_SPACE_IDS.filter((id) => !state.sharedKiln.spaces[id].active));
    expect(layout.emptyActiveSpaceIds).toEqual(layout.activeSpaceIds);
  });

  it("counts a space with a ceramic or a stack as filled, and a Setter's Mark space as empty", () => {
    const state = buildState({
      players: [{ techs: ["T21"] }, { techs: ["T22"] }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "middle_1" },
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
        { owner: "p3", stage: "loaded", shape: "vase", glaze: "celadon", at: "low_2" },
      ],
      settersMarks: { high_1: "p2" },
    });
    const layout = kilnLayout(viewOf(state, "p2"));
    expect(layout.emptyActiveSpaceIds).toEqual(["high_1", "high_2", "middle_2", "low_1"]);
    expect(layout.coveredSpaceIds).toEqual(["high_3", "middle_3"]);
  });
});

// ── Gaps 7 and 18: firingStageView / firingRecapView ─────────────────────────────────

const STEP_OF: Partial<Record<GamePhaseType, number>> = {
  firing_contributions: 1,
  firing_test_pieces: 4,
  firing_heat_markers: 5,
  firing_heat_adjustment: 8,
  firing_after_quality: 10,
  firing_second_firing_jun: 10,
  firing_salvage: 11,
};

/** The stage agrees with the engine's firing record and the live board, field by field. */
function agreement(state: GameState, firing: FiringContext, stage: FiringStageView, live: boolean): void {
  expect(firingStageKeyViolations(stage)).toEqual([]);
  expect(stage.round).toBe(firing.round);
  expect(stage.kilnDie).toBe(firing.kilnDie);
  expect(stage.baseHeat).toBe(firing.baseHeat);
  expect(stage.fireModifier).toBe(firing.fireModifier);
  expect(stage.globalHeat).toBe(firing.globalHeat);
  expect(stage.fireDiscard).toEqual(state.fireDiscard);
  expect(stage.firstPlayerOrder).toEqual([4, 5, 8, 10]);
  expect(stage.testPieces).toEqual(firing.testPieces);
  expect(stage.contributions.map((c) => c.playerId)).toEqual(firing.participantIds);
  for (const c of stage.contributions) {
    const revealed = firing.contributions === null ? undefined : lookup(firing.contributions, c.playerId);
    expect(c.revealed).toEqual(revealed === undefined ? null : { card: revealed.card, heat: revealed.heat, woodPaid: revealed.woodPaid });
  }
  const ids = Object.keys(firing.ceramics).sort((a, b) => ceramicSequence(a) - ceramicSequence(b));
  expect(stage.ceramics.map((c) => c.id)).toEqual(ids);
  for (const c of stage.ceramics) {
    const record = firing.ceramics[c.id];
    expect(record).toBeDefined();
    if (record === undefined) continue;
    expect(c).toMatchObject({ ownerId: record.ownerId, kiln: record.kiln, spaceId: record.spaceId, quality: record.quality, crackle: record.crackle, salvaged: record.salvaged });
    expect(c.secondFireModifier).toBe(record.second?.fireModifier ?? null);
    const current = lookup(state.ceramics, c.id);
    const marker = live && current !== undefined && current.stage === "loaded" ? current.heatMarker : null;
    expect(c.marker).toEqual(marker);
  }
  if (live) {
    expect(stage.extraFire).toEqual(firing.pendingExtraFire);
    const phase = state.phase;
    expect(stage.step).toBe(STEP_OF[phase.type]);
    if ("queue" in phase) {
      expect(stage.queue).toEqual(phase.queue);
    } else {
      expect(stage.queue).toBeNull();
    }
    if (phase.type === "firing_contributions") {
      expect(stage.submittedPlayerIds).toEqual(phase.submittedPlayerIds);
      expect(stage.contributions.every((c) => c.revealed === null)).toBe(true);
    }
  } else {
    expect(stage.step).toBe(12);
    expect(stage.queue).toBeNull();
    expect(stage.extraFire).toBeNull();
    expect(stage.ceramics.every((c) => c.marker === null)).toBe(true);
  }
}

/** Public: every viewer, seated or not, gets the same stage and recap. */
function samePerViewer(state: GameState): void {
  const views = [null, ...state.playerOrder].map((viewer) => viewOf(state, viewer));
  const stages = views.map((view) => firingStageView(view));
  const recaps = views.map((view) => firingRecapView(view));
  for (const stage of stages) expect(stage).toEqual(stages[0]);
  for (const recap of recaps) expect(recap).toEqual(recaps[0]);
}

describe("firingStageView and firingRecapView (§5 gaps 7, 18; D3, D4)", () => {
  it("are null before the first firing and outside the Firing Phase", () => {
    const view = viewOf(buildState(), "p1");
    expect(firingStageView(view)).toBeNull();
    expect(firingRecapView(view)).toBeNull();
  });

  it.each(phaseScenarios().filter((s) => s.phase.startsWith("firing_")).map((s) => [s.name, s] as const))(
    "%s: the allow-listed keys, agreeing with the firing record",
    (_name, scenario) => {
      const state = scenario.table.state;
      const stage = firingStageView(viewOf(state, scenario.actor, scenario.table.privateState));
      expect(stage).not.toBeNull();
      if (stage === null || state.firing === null) return;
      agreement(state, state.firing, stage, true);
      samePerViewer(state);
    },
  );

  it("shows the R7 extra Fire card beside its ceramic while Jun may adjust it", () => {
    const scenario = phaseScenarios().find((s) => s.phase === "firing_second_firing_jun");
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const state = scenario.table.state;
    const stage = firingStageView(viewOf(state, scenario.actor));
    const pending = state.firing?.pendingExtraFire ?? null;
    expect(pending).not.toBeNull();
    expect(stage?.extraFire).toEqual(pending);
    expect(stage?.ceramics.find((c) => c.id === pending?.ceramicId)?.secondFireModifier).toBe(pending?.modifier);
    // Resolving Jun discards the card and closes the window.
    scenario.table.act(scenario.actor, { type: "RESOLVE_JUN", adjustment: null });
    expect(firingStageView(scenario.table.view(scenario.actor))?.extraFire ?? null).toBeNull();
  });

  it("keeps Contributions sealed until all are revealed, then shows card, heat and Wood paid", () => {
    const table = openFiringTable({
      players: [{ techs: ["T12"], resources: { wood: 3 } }, {}],
      ceramics: [
        // The face-down marker keeps the firing open at step 5 after the reveal.
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1", heatMarker: { source: "own", faceDown: true } },
        { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
      ],
    });
    table.contribute("p1", "STOKE", true);
    for (const viewer of ["p1", "p2", null] as const) {
      const stage = firingStageView(table.view(viewer));
      expect(stage?.submittedPlayerIds).toEqual(["p1"]);
      expect(stage?.contributions).toEqual([
        { playerId: "p1", revealed: null },
        { playerId: "p2", revealed: null },
      ]);
    }
    table.contribute("p2", "BANK");
    const stage = firingStageView(table.view("p2"));
    expect(stage?.contributions).toEqual([
      { playerId: "p1", revealed: { card: "STOKE", heat: 2, woodPaid: 2 } },
      { playerId: "p2", revealed: { card: "BANK", heat: -1, woodPaid: 1 } },
    ]);
    expect(stage?.submittedPlayerIds).toEqual(["p1", "p2"]);
    expect(stage?.baseHeat).toBe(table.state.firing?.baseHeat);
  });

  it("an Imperial-only firing has no Contributions and Base Heat equals the Kiln Die", () => {
    const table = openFiringTable({
      kilnDie: 3,
      players: [{ recognition: 2 }, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "moon_white", at: "imperial", imperialModifier: 1, heatMarker: { source: "own", faceDown: true } },
      ],
    });
    const stage = firingStageView(table.view("p2"));
    expect(stage?.contributions).toEqual([]);
    expect(stage?.submittedPlayerIds).toEqual([]);
    expect(stage?.baseHeat).toBe(3);
    expect(stage?.kilnDie).toBe(3);
  });

  it("a recap is the last finished firing, without markers, and is cleared when the next firing starts", () => {
    const table = openFiringTable({
      players: [{}, {}],
      ceramics: [
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1", heatMarker: { source: "own", faceDown: true } },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "high_1" },
      ],
    });
    tendAll(table);
    let guard = 0;
    while (table.state.firing !== null && guard < 20) {
      const actor = table.prompt().actorIds[0] as PlayerId;
      const phase = table.state.phase.type;
      if (phase === "firing_heat_markers") table.act(actor, { type: "RESOLVE_HEAT_MARKERS", ownMarker: 1 });
      else if (phase === "firing_heat_adjustment") table.act(actor, { type: "RESOLVE_JUN", adjustment: null });
      else if (phase === "firing_after_quality") table.act(actor, { type: "END_AFTER_QUALITY" });
      else if (phase === "firing_salvage") table.act(actor, { type: "SALVAGE_FLAWED", ceramicId: null });
      else if (phase === "firing_test_pieces") table.act(actor, { type: "TEST_PIECES_DECIDE", peek: false });
      else throw new Error(`unexpected ${phase}`);
      guard += 1;
    }
    const last = table.state.lastFiring;
    expect(last).not.toBeNull();
    if (last === null) return;
    const recap = firingRecapView(table.view("p1"));
    expect(recap).not.toBeNull();
    if (recap === null) return;
    agreement(table.state, last, recap, false);
    expect(recap.ceramics.map((c) => c.quality)).toEqual(recap.ceramics.map((c) => last.ceramics[c.id]?.quality));
    expect(firingStageView(table.view("p1"))).toBeNull();
  });

  it("agrees with the engine at every decision of seeded games, and never shows a heat calculation", () => {
    const seen = new Set<string>();
    for (const [seed, playerCount, start] of [
      [5, 3, "rich"],
      [12, 4, "rich"],
      [2, 2, "new"],
      [40, 3, "rich"],
    ] as const) {
      driveGame({ seed, playerCount, start }, (table, actorId) => {
        const state = table.state;
        const view = table.view(actorId);
        const stage = firingStageView(view);
        if (state.firing !== null && STEP_OF[state.phase.type] !== undefined) {
          expect(stage).not.toBeNull();
          if (stage !== null) {
            agreement(state, state.firing, stage, true);
            seen.add(`step${stage.step}`);
            if (stage.extraFire !== null) seen.add("extraFire");
            if (stage.ceramics.some((c) => c.marker !== null)) seen.add("marker");
          }
        } else {
          expect(stage).toBeNull();
        }
        const recap = firingRecapView(view);
        if (state.lastFiring !== null && recap !== null) {
          agreement(state, state.lastFiring, recap, false);
          seen.add("recap");
        } else {
          expect(recap).toBeNull();
        }
      });
    }
    expect([...seen].sort()).toEqual(expect.arrayContaining(["marker", "recap", "step1", "step10", "step5"]));
  });

  it("is the same for every viewer at every firing decision (public information only)", () => {
    driveGame({ seed: 9, playerCount: 4, start: "rich" }, (table) => {
      if (table.state.firing !== null || table.state.lastFiring !== null) samePerViewer(table.state);
    });
  });
});

// ── Gap 17: ROUND_STRUCTURE and roundPhaseOf ─────────────────────────────────────────

/** Typed `Record<GamePhaseType, …>`: a new engine phase fails typecheck here as well. */
const EXPECTED_ROUND_PHASE: Record<GamePhaseType, RoundPhaseId | "final"> = {
  setup_kiln_selection: "start",
  round_start_setters_mark: "start",
  work_turn: "work",
  firing_contributions: "firing",
  firing_test_pieces: "firing",
  firing_heat_markers: "firing",
  firing_heat_adjustment: "firing",
  firing_after_quality: "firing",
  firing_second_firing_jun: "firing",
  firing_salvage: "firing",
  orders: "orders",
  cleanup_hand_limit: "cleanup",
  finished: "final",
};

describe("ROUND_STRUCTURE and roundPhaseOf (§5 gap 17)", () => {
  it("maps every engine phase to its round phase", () => {
    for (const [phaseType, expected] of Object.entries(EXPECTED_ROUND_PHASE) as Array<[GamePhaseType, RoundPhaseId | "final"]>) {
      expect(roundPhaseOf(phaseType), phaseType).toBe(expected);
    }
  });

  it("is data/round_structure.json, with one phase per id and as many rounds as the game", () => {
    const raw = JSON.parse(readFileSync(resolve(ROOT, "data/round_structure.json"), "utf8")) as unknown;
    expect(ROUND_STRUCTURE).toEqual(raw);
    expect(ROUND_STRUCTURE.roundCount).toBe(GAME_CONFIG.rounds);
    expect(ROUND_STRUCTURE.phases.map((p) => p.id)).toEqual(ROUND_PHASE_IDS);
    expect(Object.isFrozen(ROUND_STRUCTURE)).toBe(true);
  });

  it("is display text only: not a rules-fingerprint input, and the fingerprint is unchanged", () => {
    expect(CONTENT_SOURCES.map(([name]) => name)).not.toContain("round_structure");
    expect(RULES_BEHAVIOUR_REVISION).toBe(30);
    expect(rulesFingerprint()).toMatch(/^r30-[0-9a-f]{16}$/);
  });

  it("is exported from the barrel", () => {
    expect(engine.ROUND_STRUCTURE).toBe(ROUND_STRUCTURE);
    expect(engine.roundPhaseOf).toBe(roundPhaseOf);
    expect(typeof engine.firingStageView).toBe("function");
    expect(typeof engine.firingRecapView).toBe("function");
    expect(typeof engine.kilnLayout).toBe("function");
  });

  it("never runs backwards within a round of a played game", () => {
    let lastRound: RoundNumber = 1;
    let lastIndex = -1;
    driveGame({ seed: 14, playerCount: 3 }, (table) => {
      const state = table.state;
      const phase = roundPhaseOf(state.phase.type);
      const index = phase === "final" ? ROUND_PHASE_IDS.length : ROUND_PHASE_IDS.indexOf(phase);
      if (state.round !== lastRound) {
        lastRound = state.round;
        lastIndex = -1;
      }
      expect(index, `${state.phase.type} after index ${lastIndex}`).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
    });
  });
});

describe("the selectors stay in the public LocalTable views", () => {
  it("never mutate the view", () => {
    const table = new LocalTable(buildState({ players: 3 }));
    const view = table.view("p1");
    const before = structuredClone(view);
    handLimitStatus(view, "p1");
    kilnLayout(view);
    firingStageView(view);
    firingRecapView(view);
    expect(view).toEqual(before);
  });
});

// ── A1 rest: gaps 8–12 and 14–16 ─────────────────────────────────────────────────────

describe("crackleDeclarationChecks (§5 gap 8)", () => {
  it("gives the validator's verdict for auto, the declarations as given, and each Decoration", () => {
    const scenario = uiOptionScenarios().find((s) => s.name.startsWith("Order Phase with two Crackle"));
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const view = scenario.table.actorView("p1");
    // O29: Vase + Censer, different Decorations; both are Crackle, both printed Plain.
    const checks = crackleDeclarationChecks(view, "O29", ["c1", "c2"], [{ ceramicId: "c2", decoration: "carved" }]);
    expect(checks.auto.ok).toBe(true);
    expect(checks.declared.ok).toBe(true);
    expect(checks.ceramics.map((c) => [c.ceramicId, c.printedDecoration])).toEqual([
      ["c1", "plain"],
      ["c2", "plain"],
    ]);
    const c1 = Object.fromEntries((checks.ceramics[0]?.options ?? []).map((o) => [String(o.decoration), o.check.ok]));
    expect(c1).toEqual({ null: true, plain: true, carved: false, impressed: true, painted: true });
    const c2 = Object.fromEntries((checks.ceramics[1]?.options ?? []).map((o) => [String(o.decoration), o.check.ok]));
    // c1 undeclared counts as Plain, so c2 must be anything but Plain.
    expect(c2).toEqual({ null: false, plain: false, carved: true, impressed: true, painted: true });
    // Both undeclared: two Plain ceramics fail; the engine's own search succeeds.
    const none = crackleDeclarationChecks(view, "O29", ["c1", "c2"], []);
    expect(none.declared.ok).toBe(false);
    expect(none.auto.ok).toBe(true);
    // Agreement with the validator.
    expect(validateAction(view, { type: "COMPLETE_ORDER", orderId: "O29", ceramicIds: ["c1", "c2"], crackleDeclarations: [] }) === null).toBe(false);
    expect(validateAction(view, { type: "COMPLETE_ORDER", orderId: "O29", ceramicIds: ["c1", "c2"] })).toBeNull();
  });

  it("lists only selected Crackle ceramics", () => {
    const scenario = uiOptionScenarios().find((s) => s.name.startsWith("Canal Barge"));
    if (scenario === undefined) throw new Error("scenario missing");
    const view = scenario.table.actorView("p1");
    const checks = crackleDeclarationChecks(view, "O39", ["c1", "c2"], []);
    expect(checks.ceramics.map((c) => c.ceramicId)).toEqual(["c1"]);
    expect(validateAction(view, { type: "USE_CANAL_BARGE", orderId: "O39", ceramicIds: ["c1", "c2"], crackleDeclarations: [] }) === null).toBe(checks.declared.ok);
  });
});

describe("SCORE_BREAKDOWN_ROWS and TIE_BREAK_ORDER (§5 gap 9)", () => {
  it("cover every FinalScoreBreakdown key once, in L492–494 order", () => {
    const result = computeFinalResult(buildState({ players: 3 }));
    const keys = Object.keys(result.scores["p1"] ?? {});
    expect([...SCORE_BREAKDOWN_ROWS].sort()).toEqual([...keys].sort());
    expect(new Set(SCORE_BREAKDOWN_ROWS).size).toBe(SCORE_BREAKDOWN_ROWS.length);
    expect(SCORE_BREAKDOWN_ROWS[SCORE_BREAKDOWN_ROWS.length - 1]).toBe("total");
    expect(engine.SCORE_BREAKDOWN_ROWS).toBe(SCORE_BREAKDOWN_ROWS);
  });

  it("follow L498, cover every tie-break value, and decide the engine's ranking", () => {
    expect(TIE_BREAK_ORDER.map((t) => t.key)).toEqual(["recognition", "printedCrowns", "masterpieces"]);
    expect(TIE_BREAK_ORDER.map((t) => t.resolvedBy)).toEqual(["imperial_recognition", "printed_crowns", "masterpieces"]);
    const result = computeFinalResult(buildState({ players: 2 }));
    expect([...TIE_BREAK_ORDER.map((t) => t.key)].sort()).toEqual(Object.keys(result.standings[0]?.tieBreak ?? {}).sort());
    // Equal VP, p2 farther on the Recognition track: p2 wins by the first tie-breaker.
    const tied = buildState({ players: [{ score: { orders: 6 } }, { recognition: 2, score: { orders: 6 } }] });
    const ranked = computeFinalResult(tied);
    expect(ranked.winnerIds).toEqual(["p2"]);
    expect(ranked.resolvedBy).toBe(TIE_BREAK_ORDER[0]?.resolvedBy);
  });
});

describe("placementLimits (§5 gap 10)", () => {
  it("is the printed effect record of every location and worker effect, as a copy", () => {
    const view = viewOf(buildState(), "p1");
    for (const locationId of LOCATION_IDS) {
      for (const effect of ["apprentice", "shifu"] as const) {
        const limits = placementLimits(view, locationId, effect);
        expect(limits).toEqual(LOCATIONS[locationId].effects[effect]);
        expect(limits).not.toBe(LOCATIONS[locationId].effects[effect]);
      }
    }
    expect(placementLimits(view, "form_decorate", "shifu").maxVessels).toBe(LOCATIONS.form_decorate.effects.shifu.maxVessels);
    expect(placementLimits(view, "glaze_load", "shifu").placesHeatMarker).toBe(true);
  });
});

describe("PersonalSpaceView.addedByTechId (§5 gap 11, D7)", () => {
  it("names the Tech that added the second space, and nothing else", () => {
    const state = buildState({ players: [{ techs: ["T17", "T15", "T12"] }, {}] });
    const spaces = playerSummary(viewOf(state, "p2"), "p1").personalSpaces.map((s) => [s.locationId, s.spaceIndex, s.unlocked, s.addedByTechId]);
    expect(spaces).toEqual([
      ["form_decorate", 0, true, null],
      ["form_decorate", 1, true, "T17"],
      ["glaze_load", 0, true, null],
      ["glaze_load", 1, true, "T15"],
    ]);
    const bare = playerSummary(viewOf(state, "p1"), "p2").personalSpaces.map((s) => s.addedByTechId);
    expect(bare).toEqual([null, null, null, null]);
  });
});

describe("PlacementWorkerOption.error (§5 gap 12)", () => {
  it("carries the validator's error and details, for formatRuleError", () => {
    const state = buildState({ players: [{ resources: { coins: 1 } }, {}] });
    const view = viewOf(state, "p1");
    const hall = placementOptions(view).find((o) => o.locationId === "magistrates_hall");
    const shifu = hall?.workers.find((w) => w.kind === "shifu");
    expect(shifu?.legal).toBe(false);
    expect(shifu?.reason).toBe("INSUFFICIENT_RESOURCES");
    expect(shifu?.error).toEqual(validateAction(view as never, { type: "PLACE_MAGISTRATES_HALL", workerId: "p1:shifu" }));
    expect(shifu?.error?.details).toMatchObject({ resource: "coins", have: 1 });
    expect(engine.formatRuleError(shifu?.error ?? { code: "UNKNOWN_PLAYER", details: {} }, "en")).toMatch(/\d/);
    const wharf = placementOptions(view).find((o) => o.locationId === "canal_wharf");
    expect(wharf?.workers.every((w) => w.legal && w.error === null && w.reason === null)).toBe(true);
  });

  it("reports a full location with LOCATION_FULL and an unseated viewer with UNKNOWN_PLAYER", () => {
    const state = buildState({ players: 2, placements: [{ player: "p2", worker: "shifu", locationId: "magistrates_hall" }] });
    const hall = placementOptions(viewOf(state, "p1")).find((o) => o.locationId === "magistrates_hall");
    expect(hall?.workers.map((w) => w.error?.code)).toEqual(["LOCATION_FULL", "LOCATION_FULL"]);
    expect(placementOptions(viewOf(state, null)).every((o) => o.workers.length === 0)).toBe(true);
  });
});

describe("materialsYardOptions (§5 gap 14)", () => {
  const optionsFor = (name: string) => {
    const scenario = uiOptionScenarios().find((s) => s.name === name);
    if (scenario === undefined) throw new Error(`no scenario ${name}`);
    const view = scenario.table.actorView("p1");
    return placementOptions(view)
      .find((o) => o.locationId === "materials_yard")
      ?.workers.map((w) => ({ worker: w, options: materialsYardOptions(view, w), legal: legalMaterialsYardCommands(view, w) })) ?? [];
  };

  it("offers Prepared Clay only with T17 ready and never with Senior Apprentice (L350); the Shifu effect gains 6 (v1.6.2 L165)", () => {
    const senior = optionsFor("Materials Yard: Senior Apprentice, Prepared Clay used");
    expect(senior.map((x) => [x.worker.kind, x.worker.seniorApprentice, x.options.resources, x.options.preparedClay])).toEqual([
      ["shifu", false, 6, null],
      ["apprentice", false, 3, null],
      ["apprentice", true, 6, null],
    ]);
    // V1.6.2 removed the Shifu's 1-Coin option: the options carry no bonus.
    for (const { options } of senior) expect(Object.keys(options).sort()).toEqual(["preparedClay", "resources"]);
  });

  it("lists the Shapes and Decorations of some legal command, after the split", () => {
    const rich = optionsFor("Materials Yard: Prepared Clay with 2 Coins and no Clay");
    for (const { options, legal } of rich) {
      expect(options.preparedClay?.shapes).toEqual([...new Set(legal.flatMap((a) => (a.preparedClay ? [a.preparedClay.shape] : [])))].sort((a, b) => SHAPES.indexOf(a) - SHAPES.indexOf(b)));
      expect(options.preparedClay?.decorations.length).toBeGreaterThan(0);
    }
    const broke = optionsFor("Materials Yard: Prepared Clay with no Coins");
    for (const { options } of broke) {
      expect(options.preparedClay).toEqual({ shapes: [], decorations: [], pairs: [] });
    }
  });

  it("gates each Prepared Clay pair: the split covers its Clay, the Coins its Decoration", () => {
    // From 0 Clay even the Apprentice effect's 3 resources cover any Shape's Clay + 1 (L618),
    // and 2 Coins pay any Decoration: every pair is legal for every worker option.
    for (const name of ["Materials Yard: Prepared Clay with 2 Coins and no Clay", "Materials Yard: Prepared Clay with 3 Coins and no Clay"]) {
      for (const { options, legal } of optionsFor(name)) {
        expect(options.preparedClay?.pairs).toEqual(SHAPES.flatMap((shape) => DECORATIONS.map((decoration) => ({ shape, decoration }))));
        expect(legal.some((a) => a.preparedClay !== undefined)).toBe(true);
        // The projections are exactly the pairs' Shapes and Decorations.
        const pairs = options.preparedClay?.pairs ?? [];
        expect(options.preparedClay?.shapes).toEqual(SHAPES.filter((s) => pairs.some((p) => p.shape === s)));
        expect(options.preparedClay?.decorations).toEqual(DECORATIONS.filter((d) => pairs.some((p) => p.decoration === d)));
      }
    }
  });

  it("agrees with the exhaustive legal commands", () => {
    for (const name of ["Materials Yard: Prepared Clay with 2 Coins and no Clay", "Materials Yard: Prepared Clay with 3 Coins and no Clay", "Materials Yard: Prepared Clay with no Coins", "Materials Yard: Senior Apprentice, Prepared Clay used"]) {
      const scenario = uiOptionScenarios().find((s) => s.name === name);
      if (scenario === undefined) throw new Error(name);
      const view = scenario.table.actorView("p1");
      const exhaustive = legalActions(view, { mode: "exhaustive", perFamilyLimit: 5_000 }).filter((a) => a.type === "PLACE_MATERIALS_YARD");
      const probed = placementOptions(view)
        .find((o) => o.locationId === "materials_yard")
        ?.workers.filter((w) => w.legal)
        .flatMap((w) => legalMaterialsYardCommands(view, w)) ?? [];
      const key = (a: unknown) => JSON.stringify(a, Object.keys(a as object).sort());
      expect(new Set(exhaustive.map(key))).toEqual(new Set(probed.map(key)));
    }
  });
});

describe("glazeLoadVesselOptions (§5 gap 15)", () => {
  it("offers Glazes per vessel and Reworking Table Shapes only once per action", () => {
    const scenario = uiOptionScenarios().find((s) => s.name.startsWith("Glaze & Load: Reworking Table"));
    if (scenario === undefined) throw new Error("scenario missing");
    const view = scenario.table.actorView("p1");
    const first = glazeLoadVesselOptions(view, "p1", []);
    expect(first.map((o) => o.ceramicId)).toEqual(["c1", "c2", "c3"]);
    expect(first.every((o) => o.glazes.length === 4)).toBe(true);
    expect(first[0]?.reworkShapes).toEqual(["plate", "washer", "vase", "censer"]);
    const reworked = { ceramicId: "c1", glaze: "white" as const, destination: { kiln: "shared" as const, spaceId: "middle_2" as const }, reworkShape: "plate" as const };
    const second = glazeLoadVesselOptions(view, "p1", [reworked]);
    expect(second.map((o) => o.ceramicId)).toEqual(["c2", "c3"]);
    expect(second.every((o) => o.reworkShapes.length === 0 && o.glazes.length === 4)).toBe(true);
    const plainFirst = { ceramicId: "c1", glaze: "white" as const, destination: { kiln: "shared" as const, spaceId: "middle_2" as const } };
    expect(glazeLoadVesselOptions(view, "p1", [plainFirst])[0]?.reworkShapes.length).toBeGreaterThan(0);
  });

  it("agrees with every single-load command of the exhaustive enumeration", () => {
    for (const scenario of uiOptionScenarios().filter((s) => s.name.startsWith("Glaze & Load"))) {
      const view = scenario.table.actorView("p1");
      const singles = legalActions(view, { mode: "exhaustive", perFamilyLimit: 5_000 })
        .filter((a): a is Extract<typeof a, { type: "PLACE_GLAZE_LOAD" }> => a.type === "PLACE_GLAZE_LOAD" && a.loads.length === 1);
      expect(singles.length).toBeGreaterThan(0);
      const listed = glazeLoadVesselOptions(view, "p1", []);
      for (const action of singles) {
        const load = action.loads[0];
        if (load === undefined) continue;
        const option = listed.find((o) => o.ceramicId === load.ceramicId);
        expect(option?.glazes, scenario.name).toContain(load.glaze);
        if (load.reworkShape !== undefined) expect(option?.reworkShapes, scenario.name).toContain(load.reworkShape);
      }
      for (const option of listed) {
        for (const glaze of option.glazes) expect(singles.some((a) => a.loads[0]?.ceramicId === option.ceramicId && a.loads[0]?.glaze === glaze)).toBe(true);
        for (const shape of option.reworkShapes) expect(singles.some((a) => a.loads[0]?.ceramicId === option.ceramicId && a.loads[0]?.reworkShape === shape)).toBe(true);
      }
    }
  });
});

describe("imperialPriorityOptions.ceramics (§5 gap 16)", () => {
  it("lists Glazes, Imperial modifiers and Reworking Table Shapes per vessel, agreeing with every candidate", () => {
    const scenario = uiOptionScenarios().find((s) => s.name === "Imperial Priority with Reworking Table");
    if (scenario === undefined) throw new Error("scenario missing");
    const view = scenario.table.actorView("p1");
    const options = imperialPriorityOptions(view);
    expect(options.usable).toBe(true);
    expect(options.ceramics.map((c) => [c.ceramicId, c.glazes.length, c.imperialModifiers, c.reworkShapes])).toEqual([
      ["c1", 4, [-1, 0, 1], ["plate", "washer", "vase", "censer"]],
      ["c2", 4, [-1, 0, 1], ["bowl", "plate", "washer", "vase"]],
    ]);
    const exhaustive = legalActions(view, { mode: "exhaustive", perFamilyLimit: 5_000 }).filter((a) => a.type === "USE_IMPERIAL_PRIORITY");
    const offered = options.ceramics.reduce((n, c) => n + c.glazes.length * c.imperialModifiers.length * (1 + c.reworkShapes.length), 0);
    expect(exhaustive).toHaveLength(offered);
    const full = uiOptionScenarios().find((s) => s.name === "Imperial Priority with the Imperial Kiln full");
    expect(full === undefined ? null : imperialPriorityOptions(full.table.actorView("p1"))).toEqual({ usable: false, ceramicIds: [], ceramics: [] });
  });
});

describe("formatRuleError never prints a ceramic ID (owner decision D9, UI plan K14)", () => {
  it("renders no ceramic ID for any code, in either language, and resolves ceramic details through ceramicName", () => {
    const codes = Object.keys(engine.RULE_ERROR_TEXT) as Array<keyof typeof engine.RULE_ERROR_TEXT>;
    for (const code of codes) {
      for (const locale of ["en", "zh-CN"] as const) {
        const text = engine.formatRuleError({ code, details: { ceramicId: "c12", ceramicIds: "c12,c13", underCeramicId: "c14" } }, locale, {
          ceramicName: () => "Lin's Celadon Vase",
        });
        expect(text, `${code} ${locale}`).not.toMatch(/\bc1[234]\b/);
      }
    }
    expect(engine.detailLabel("ceramicId", "c12", "en")).toBe("c12");
    expect(engine.detailLabel("ceramicId", "c12", "en", { ceramicName: (id) => `vase ${id.length}` })).toBe("vase 3");
    expect(engine.detailLabel("ceramicIds", "c12, c13", "zh", { ceramicName: (id) => (id === "c12" ? "甲" : "乙") })).toBe("甲、乙");
  });
});
