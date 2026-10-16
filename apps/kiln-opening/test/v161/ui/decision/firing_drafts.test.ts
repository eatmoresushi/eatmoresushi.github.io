/**
 * B5's firing draft models (UI_V1.6.1_ARCHITECTURE §3.5, §9.2): `reduce` / `options` / `build`
 * tables per window, over the scripted scenarios and played moments. Owner: B5.
 *
 * Every option comes from the engine (selectors or `validateAction`), so the tables check the
 * forms against the engine rather than against restated rules.
 */
import { describe, expect, it } from "vitest";
import { validateAction } from "../../../../src/game/index.ts";
import type { ActorView, AuthoritativeCommand, PlayerView } from "../../../../src/game/index.ts";
import { afterQualityDraft } from "../../../../src/app/decision/firing/AfterQuality.draft.ts";
import { contributionsDraft } from "../../../../src/app/decision/firing/Contributions.draft.ts";
import { heatMarkersDraft } from "../../../../src/app/decision/firing/HeatMarkers.draft.ts";
import { junDraft } from "../../../../src/app/decision/firing/Jun.draft.ts";
import { salvageDraft } from "../../../../src/app/decision/firing/Salvage.draft.ts";
import { testPiecesDraft } from "../../../../src/app/decision/firing/TestPieces.draft.ts";
import { checkCommand } from "../../../../src/app/session/fixtureSource.ts";
import { REVALIDATE } from "../../../../src/app/state/draftStore.ts";
import type { DraftActionBase, DraftModel } from "../../../../src/app/state/draftStore.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import type { EngineView, GameModel } from "../../../../src/app/state/model.ts";
import { fixture } from "../support/fixtures.ts";

interface Ctx {
  view: PlayerView;
  model: GameModel;
  engine: EngineView;
}

function ctxOf(view: PlayerView): Ctx {
  return { view, model: buildGameModel(view, []), engine: engineViewOf(view) };
}

function ctx(id: string): Ctx {
  return ctxOf(structuredClone(fixture(id).playerView));
}

/** The same view with one Tech taken off the viewer's board (a player who never bought it). */
function withoutTech(id: string, techId: string): Ctx {
  const view = structuredClone(fixture(id).playerView);
  const me = view.game.players[view.viewerId!]!;
  me.techs = me.techs.filter((tech) => tech.id !== techId);
  return ctxOf(view);
}

/** Applies actions in order, from `initial`. */
function run<D, A extends DraftActionBase, O>(model: DraftModel<D, A, O>, c: Ctx, ...actions: A[]): D {
  let draft = model.initial(c.model, c.engine);
  for (const action of actions) draft = model.reduce(draft, action, c.model, c.engine);
  return draft;
}

function valid(c: Ctx, command: AuthoritativeCommand | null): boolean {
  return command !== null && checkCommand(c.view, command) === null;
}

describe("Contributions", () => {
  const c = ctx("w-secret-contributions-with-fuel-ledger");

  it("offers the selector's cards and the Fuel Ledger toggle, nothing chosen", () => {
    const draft = contributionsDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ card: null, fuelLedger: false });
    const options = contributionsDraft.options(draft, c.model, c.engine);
    expect(options.cards.map((choice) => choice.card)).toEqual(["TEND", "BANK", "STOKE"]);
    expect(options.cards.every((choice) => choice.available)).toBe(true);
    expect(options.fuelLedger?.appliesTo).toEqual(["BANK", "STOKE"]);
    expect(contributionsDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(contributionsDraft.summary(draft, c.model, c.engine)?.key).toBe("firing.contrib.pick");
  });

  it("builds the selector's own command, window ID included", () => {
    const draft = run(contributionsDraft, c, { type: "card", card: "BANK" });
    const command = contributionsDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "SUBMIT_CONTRIBUTION", windowId: "test-game:r1:contributions", card: "BANK", fuelLedger: false });
    expect(valid(c, command)).toBe(true);
    expect(contributionsDraft.summary(draft, c.model, c.engine)?.key).toBe("firing.contrib.summary");
  });

  it("Fuel Ledger: Bank and Stoke only; Tend becomes unavailable and is dropped", () => {
    const withTend = run(contributionsDraft, c, { type: "card", card: "TEND" }, { type: "fuelLedger", on: true });
    expect(withTend).toEqual({ card: null, fuelLedger: true });
    const options = contributionsDraft.options(withTend, c.model, c.engine);
    expect(options.cards.find((choice) => choice.card === "TEND")).toMatchObject({ available: false, reason: "fuel_ledger_bank_stoke" });
    expect(options.cards.find((choice) => choice.card === "STOKE")?.option).toMatchObject({ woodCost: 2, heat: 2 });
    expect(contributionsDraft.reduce(withTend, { type: "card", card: "TEND" }, c.model, c.engine)).toBe(withTend);
    const stoke = contributionsDraft.reduce(withTend, { type: "card", card: "STOKE" }, c.model, c.engine);
    const command = contributionsDraft.build(stoke, c.model, c.engine);
    expect(command).toMatchObject({ card: "STOKE", fuelLedger: true });
    expect(valid(c, command)).toBe(true);
    expect(contributionsDraft.summary(stoke, c.model, c.engine)?.key).toBe("firing.contrib.summaryFuel");
  });

  it("without Fuel Ledger the toggle is not offered and cannot be set", () => {
    const m9 = withoutTech("m9_contributions_step1_3p", "T12");
    expect(contributionsDraft.options(contributionsDraft.initial(m9.model, m9.engine), m9.model, m9.engine).fuelLedger).toBeNull();
    expect(run(contributionsDraft, m9, { type: "fuelLedger", on: true }).fuelLedger).toBe(false);
  });

  it("revalidation keeps a legal draft as is and drops what is not offered", () => {
    const legal = { card: "BANK" as const, fuelLedger: true };
    expect(contributionsDraft.reduce(legal, REVALIDATE, c.model, c.engine)).toBe(legal);
    const m9 = withoutTech("m9_contributions_step1_3p", "T12");
    expect(contributionsDraft.reduce(legal, REVALIDATE, m9.model, m9.engine)).toEqual({ card: "BANK", fuelLedger: false });
  });
});

describe("Test Pieces", () => {
  it("decision: peek or decline, each building its command", () => {
    const c = ctx("w-test-pieces-decision");
    const options = testPiecesDraft.options(testPiecesDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options).toMatchObject({ awaiting: "decision", woodCost: 1, peekedModifier: null });
    expect(options.choices).toEqual([{ choice: "peek", error: null }, { choice: "decline", error: null }]);
    expect(testPiecesDraft.build(run(testPiecesDraft, c, { type: "choose", choice: "peek" }), c.model, c.engine)).toEqual({ type: "TEST_PIECES_DECIDE", peek: true });
    expect(testPiecesDraft.build(run(testPiecesDraft, c, { type: "choose", choice: "decline" }), c.model, c.engine)).toEqual({ type: "TEST_PIECES_DECIDE", peek: false });
    expect(run(testPiecesDraft, c, { type: "choose", choice: "bury" })).toEqual({ choice: null });
  });

  it("bury: the viewer's own peek, then bottom or top", () => {
    const c = ctx("w-test-pieces-bury");
    const options = testPiecesDraft.options(testPiecesDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.awaiting).toBe("bury");
    expect(options.peekedModifier).toBe(c.view.own?.firePeek?.modifier);
    expect(testPiecesDraft.build(run(testPiecesDraft, c, { type: "choose", choice: "bury" }), c.model, c.engine)).toEqual({ type: "TEST_PIECES_BURY", bury: true });
    expect(testPiecesDraft.build(run(testPiecesDraft, c, { type: "choose", choice: "keep" }), c.model, c.engine)).toEqual({ type: "TEST_PIECES_BURY", bury: false });
    expect(run(testPiecesDraft, c, { type: "choose", choice: "peek" })).toEqual({ choice: null });
  });
});

describe("Heat markers", () => {
  const c = ctx("w-heat-marker-step-with-a-face-down-marker-and-kiln-master");

  it("requires the own marker; Kiln Master defaults to not placing it", () => {
    const draft = heatMarkersDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ own: null, kmTarget: "none", kmValue: null });
    const options = heatMarkersDraft.options(draft, c.model, c.engine);
    expect(options.own?.ceramicId).toBe("c1");
    expect(options.own?.choices.map((entry) => entry.choice)).toEqual([1, -1, "return"]);
    expect(heatMarkersDraft.build(draft, c.model, c.engine)).toBeNull();
    const turned = run(heatMarkersDraft, c, { type: "own", choice: -1 });
    expect(heatMarkersDraft.build(turned, c.model, c.engine)).toEqual({ type: "RESOLVE_HEAT_MARKERS", ownMarker: -1 });
  });

  it("Kiln Master may go on the own marker's ceramic only once that marker is returned", () => {
    const before = heatMarkersDraft.options(run(heatMarkersDraft, c, { type: "own", choice: 1 }), c.model, c.engine).kilnMaster;
    expect(before?.targets).toEqual([
      { ceramicId: "c2", available: true, needsReturn: false },
      { ceramicId: "c1", available: false, needsReturn: true },
    ]);
    expect(run(heatMarkersDraft, c, { type: "own", choice: 1 }, { type: "kmTarget", target: "c1" }).kmTarget).toBeNull();
    const returned = run(heatMarkersDraft, c, { type: "own", choice: "return" }, { type: "kmTarget", target: "c1" }, { type: "kmValue", value: -1 });
    const command = heatMarkersDraft.build(returned, c.model, c.engine);
    expect(command).toEqual({ type: "RESOLVE_HEAT_MARKERS", ownMarker: "return", kilnMaster: { ceramicId: "c1", value: -1 } });
    expect(valid(c, command)).toBe(true);
    // Turning the marker after all takes the ceramic away from Kiln Master again.
    expect(heatMarkersDraft.reduce(returned, { type: "own", choice: 1 }, c.model, c.engine)).toEqual({ own: 1, kmTarget: null, kmValue: -1 });
  });

  it("a Kiln Master target needs a side before it builds", () => {
    const halfway = run(heatMarkersDraft, c, { type: "own", choice: 1 }, { type: "kmTarget", target: "c2" });
    expect(heatMarkersDraft.build(halfway, c.model, c.engine)).toBeNull();
    expect(heatMarkersDraft.summary(halfway, c.model, c.engine)?.key).toBe("firing.km.pickTarget");
  });

  it("without Kiln Master only the own marker is offered", () => {
    const m3 = ctx("m3_heat_marker_step_3p");
    expect(heatMarkersDraft.options(heatMarkersDraft.initial(m3.model, m3.engine), m3.model, m3.engine).kilnMaster).toBeNull();
  });
});

describe("Jun", () => {
  it("step 8: a ceramic and a side, or decline", () => {
    const c = ctx("w-jun-heat-adjustment");
    const draft = junDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ ceramicId: null, delta: null, decline: false });
    const options = junDraft.options(draft, c.model, c.engine);
    expect(options).toMatchObject({ during: "first_firing", ready: true, woodCost: 1, ceramicIds: ["c1", "c2"], sides: [1, -1] });
    const chosen = run(junDraft, c, { type: "ceramic", ceramicId: "c2" }, { type: "delta", delta: -1 });
    expect(junDraft.build(chosen, c.model, c.engine)).toEqual({ type: "RESOLVE_JUN", adjustment: { ceramicId: "c2", delta: -1 } });
    expect(junDraft.build(run(junDraft, c, { type: "decline" }), c.model, c.engine)).toEqual({ type: "RESOLVE_JUN", adjustment: null });
    expect(run(junDraft, c, { type: "ceramic", ceramicId: "c99" }).ceramicId).toBeNull();
  });

  it("R7: the Second Firing ceramic is the only, preselected choice", () => {
    const c = ctx("w-jun-during-second-firing-r7");
    const draft = junDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ ceramicId: "c1", delta: null, decline: false });
    expect(junDraft.options(draft, c.model, c.engine).during).toBe("second_firing");
    expect(c.model.firingStage?.extraFire).toMatchObject({ playerId: "p1", ceramicId: "c1" });
  });
});

describe("after-Quality", () => {
  const c = ctx("w-after-quality-saggars-and-ge");

  it("offers each ability with its eligible ceramics; one use per command", () => {
    const options = afterQualityDraft.options(afterQualityDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.abilities.map((option) => [option.ability, option.ceramicIds])).toEqual([
      ["protective_saggars", ["c1", "c2"]],
      ["ge_crackle", ["c1"]],
    ]);
    const ge = run(afterQualityDraft, c, { type: "use", ability: "ge_crackle", ceramicId: "c1" });
    expect(afterQualityDraft.build(ge, c.model, c.engine)).toEqual({ type: "USE_GE_CRACKLE", ceramicId: "c1" });
    expect(run(afterQualityDraft, c, { type: "use", ability: "ge_crackle", ceramicId: "c2" }).choice).toBeNull();
    expect(afterQualityDraft.build(run(afterQualityDraft, c, { type: "end" }), c.model, c.engine)).toEqual({ type: "END_AFTER_QUALITY" });
  });
});

describe("Salvage", () => {
  it("a still-Flawed ceramic for Coins, or keep it", () => {
    const c = ctx("w-salvage");
    const draft = salvageDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ choice: null });
    expect(salvageDraft.options(draft, c.model, c.engine)).toMatchObject({ ceramicIds: ["c1"], coins: 2 });
    expect(salvageDraft.build(run(salvageDraft, c, { type: "salvage", ceramicId: "c1" }), c.model, c.engine)).toEqual({ type: "SALVAGE_FLAWED", ceramicId: "c1" });
    expect(salvageDraft.build(run(salvageDraft, c, { type: "keep" }), c.model, c.engine)).toEqual({ type: "SALVAGE_FLAWED", ceramicId: null });
  });
});

describe("every built command validates", () => {
  it.each([
    ["w-test-pieces-decision", testPiecesDraft, { type: "choose", choice: "peek" }],
    ["w-jun-during-second-firing-r7", junDraft, { type: "delta", delta: 1 }],
    ["w-after-quality-saggars-and-ge", afterQualityDraft, { type: "use", ability: "protective_saggars", ceramicId: "c2" }],
    ["m14_salvage", salvageDraft, { type: "keep" }],
  ] as const)("%s", (id, model, action) => {
    const c = ctx(id);
    const draftModel = model as unknown as DraftModel<unknown, DraftActionBase, unknown>;
    const draft = draftModel.reduce(draftModel.initial(c.model, c.engine), action, c.model, c.engine);
    const command = draftModel.build(draft, c.model, c.engine);
    expect(command).not.toBeNull();
    expect(validateAction(c.engine.actor as ActorView, command as never)).toBeNull();
  });
});
