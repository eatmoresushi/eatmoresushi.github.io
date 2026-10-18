/**
 * Opening the Firing Phase and the Contribution window (L237, v1.6.2 L246, L258–268, L508, L634,
 * L668–670, changes 16 and 26; INT "No Contribution participants"). Each participant secretly
 * plays exactly 1 of their own Contribution cards: Bank, Tend or Stoke, and for Fuel Ledger's
 * owner also Fuel Ledger Bank (1 Wood, −2) and Fuel Ledger Stoke (1 Wood, +2); Wood is paid
 * only on reveal.
 */

import { describe, expect, it } from "vitest";
import {
  applyContribution,
  createPrivateFiringState,
  legalContributions,
  openFiringPhase,
  validateContribution,
} from "../../../src/game/firing/contributions.ts";
import type { GameRuleError, Glaze, ImperialModifier, KilnSpaceId, SubmitContributionCommand } from "../../../src/game/types.ts";
import { actorViewOf, viewOf } from "../../../src/game/view.ts";
import { buildState, testContext, type CeramicSpec, type StateSpec } from "./support/fixtures.ts";
import { eventsOfType, openFiringTable, typesOf } from "./support/firing.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

const WINDOW = "test-game:r1:contributions";

function shared(owner: string, at: KilnSpaceId, glaze: Glaze = "celadon"): CeramicSpec {
  return { owner, stage: "loaded", shape: "bowl", glaze, at };
}

function imperial(owner: string, glaze: Glaze = "celadon", imperialModifier: ImperialModifier = 0): CeramicSpec {
  return { owner, stage: "loaded", shape: "vase", glaze, at: "imperial", imperialModifier };
}

/** Three players, each with one Shared ceramic in the middle zone (celadon, Preferred 2). */
function threeParticipants(extra: Partial<StateSpec> = {}): StateSpec {
  return {
    players: [{}, {}, {}],
    ceramics: [shared("p1", "middle_1"), shared("p2", "middle_2"), shared("p3", "high_1")],
    ...extra,
  };
}

/**
 * As `threeParticipants`, but p3's Moon White (Preferred 4) sits in a Low space: at Base
 * Heat 2 and Fire 0 its Actual Heat is 1, Flawed, so the firing stops at the salvage window
 * instead of finishing (the halting flow would otherwise leave the phase as it was).
 */
function threeWithFlawed(extra: Partial<StateSpec> = {}): StateSpec {
  return threeParticipants({
    ceramics: [shared("p1", "middle_1"), shared("p2", "middle_2"), shared("p3", "low_1", "moon_white")],
    fireDeck: [0],
    ...extra,
  });
}

function submitCommand(card: SubmitContributionCommand["card"], windowId = WINDOW): SubmitContributionCommand {
  return { type: "SUBMIT_CONTRIBUTION", windowId, card };
}

function expectError(error: GameRuleError | null, code: GameRuleError["code"]): void {
  expect(error?.code).toBe(code);
  expectDocumentedDetails(error);
}

describe("skip check (L237, L670)", () => {
  it("skips the Firing Phase when nothing is loaded: no Fire card, no firing, straight to firing_done", () => {
    const state = buildState({
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p2", stage: "finished", shape: "vase", glaze: "white", quality: "fine" },
      ],
    });
    const before = structuredClone(state);
    const ctx = testContext(4);
    const rngBefore = ctx.rng.getState();
    openFiringPhase(state, ctx);
    expect(ctx.events).toEqual([{ type: "FIRING_SKIPPED", round: 1 }]);
    expect(ctx.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
    expect(state.firing).toBeNull();
    expect(state.hidden.fireDeck).toEqual(before.hidden.fireDeck);
    expect(state.fireDiscard).toEqual(before.fireDiscard);
    expect(ctx.rng.getState()).toBe(rngBefore);
    expect(state).toEqual(before);
  });
});

describe("participants (L261, change 16, L290)", () => {
  it("only Shared Kiln ceramics make a participant; an Imperial ceramic is in the firing but gives no say", () => {
    const table = openFiringTable({
      players: [{ recognition: 2 }, {}, { recognition: 2 }],
      firstPlayerId: "p2",
      ceramics: [imperial("p1"), shared("p3", "low_1"), shared("p2", "high_1"), imperial("p3")],
    });
    expect(eventsOfType(table.events, "FIRING_STARTED")).toEqual([
      { type: "FIRING_STARTED", round: 1, participantIds: ["p2", "p3"], firingPlayerIds: ["p2", "p3", "p1"] },
    ]);
    expect(table.state.phase).toEqual({
      type: "firing_contributions",
      windowId: WINDOW,
      eligiblePlayerIds: ["p2", "p3"],
      submittedPlayerIds: [],
    });
    expect(table.prompt()).toEqual({ phaseType: "firing_contributions", actorIds: ["p2", "p3"], mode: "simultaneous_secret" });
    const firing = table.state.firing;
    expect(firing).toMatchObject({
      round: 1,
      kilnDie: 2,
      participantIds: ["p2", "p3"],
      firingPlayerIds: ["p2", "p3", "p1"],
      contributionWindowId: WINDOW,
      contributions: null,
      baseHeat: null,
      fireModifier: null,
      pendingExtraFire: null,
    });
    expect(Object.keys(firing?.ceramics ?? {}).sort()).toEqual(["c1", "c2", "c3", "c4"]);
    expect(firing?.ceramics["c1"]).toMatchObject({ kiln: "imperial", spaceId: null, positionSource: "imperial", preferredHeat: 2 });
    expect(firing?.ceramics["c2"]).toMatchObject({ kiln: "shared", spaceId: "low_1", positionSource: "zone" });
  });

  it("a non-participant cannot submit (NOT_CONTRIBUTOR), even one with an Imperial ceramic", () => {
    const table = openFiringTable({
      players: [{ recognition: 2 }, {}],
      ceramics: [imperial("p1"), shared("p2", "middle_1")],
    });
    const error = validateContribution(table.actorView("p1"), table.privateState, submitCommand("TEND"));
    expectError(error, "NOT_CONTRIBUTOR");
    // Through the dispatcher it is not p1's decision either; the state is untouched.
    const result = table.tryContribute("p1", "TEND");
    expect(result.ok).toBe(false);
    expect(table.state.phase.type).toBe("firing_contributions");
  });

  it("with no participant (only Imperial ceramics), Contributions are skipped and Base Heat = Kiln Die (INT)", () => {
    const table = openFiringTable({
      players: [{ recognition: 2 }, {}],
      kilnDie: 3,
      fireDeck: [0],
      ceramics: [imperial("p1", "grey_green")],
    });
    expect(typesOf(table.events)).toEqual([
      "FIRING_STARTED",
      "CONTRIBUTIONS_REVEALED",
      "BASE_HEAT_DETERMINED",
      "FIRE_REVEALED",
      "ACTUAL_HEAT_CALCULATED",
      "QUALITY_ASSIGNED",
      "FIRING_FINISHED",
    ]);
    expect(eventsOfType(table.events, "CONTRIBUTIONS_REVEALED")).toEqual([{ type: "CONTRIBUTIONS_REVEALED", windowId: null, contributions: {} }]);
    expect(eventsOfType(table.events, "BASE_HEAT_DETERMINED")).toEqual([
      { type: "BASE_HEAT_DETERMINED", kilnDie: 3, contributionSum: 0, unclamped: 3, baseHeat: 3 },
    ]);
    expect(table.state.lastFiring).toMatchObject({ participantIds: [], contributionWindowId: null, contributions: {}, baseHeat: 3 });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "firing_done" }]);
  });
});

describe("secret simultaneous submission (L672–673)", () => {
  it("records only who submitted; the card stays in the private state; any order", () => {
    const table = openFiringTable(threeParticipants());
    const events = table.contribute("p3", "STOKE");
    expect(events).toEqual([{ type: "CONTRIBUTION_SUBMITTED", playerId: "p3", windowId: WINDOW }]);
    expect(table.state.phase).toMatchObject({ type: "firing_contributions", submittedPlayerIds: ["p3"] });
    expect(table.state.firing?.contributions).toBeNull();
    expect(table.privateState.submissions).toEqual({ p3: { card: "STOKE" } });
    // Wood is paid only on reveal, so nothing is set aside (v1.6.2 L508).
    expect(table.player("p3").resources.wood).toBe(2);
    expect(table.prompt().actorIds).toEqual(["p1", "p2"]);
    table.contribute("p1", "BANK");
    expect(table.state.phase).toMatchObject({ submittedPlayerIds: ["p1", "p3"] });
    expect(table.prompt()).toEqual({ phaseType: "firing_contributions", actorIds: ["p2"], mode: "simultaneous_secret" });
  });

  it("a second submission by the same player is rejected and changes nothing", () => {
    const table = openFiringTable(threeParticipants());
    table.contribute("p1", "TEND");
    const before = structuredClone(table.state);
    const error = validateContribution(table.actorView("p1"), table.privateState, submitCommand("STOKE"));
    expectError(error, "CONTRIBUTION_ALREADY_SUBMITTED");
    const result = table.tryContribute("p1", "STOKE");
    expect(result.ok).toBe(false);
    expect(table.state).toEqual(before);
    expect(table.privateState.submissions["p1"]).toEqual({ card: "TEND" });
  });

  it("the last submission reveals every card together, then pays (L673)", () => {
    const table = openFiringTable(threeWithFlawed());
    table.contribute("p2", "STOKE");
    table.contribute("p1", "TEND");
    const events = table.contribute("p3", "BANK");
    expect(typesOf(events).slice(0, 5)).toEqual([
      "CONTRIBUTION_SUBMITTED",
      "CONTRIBUTIONS_REVEALED",
      "RESOURCES_CHANGED",
      "RESOURCES_CHANGED",
      "BASE_HEAT_DETERMINED",
    ]);
    expect(eventsOfType(events, "CONTRIBUTIONS_REVEALED")).toEqual([
      {
        type: "CONTRIBUTIONS_REVEALED",
        windowId: WINDOW,
        contributions: {
          p1: { card: "TEND", heat: 0, woodPaid: 0 },
          p2: { card: "STOKE", heat: 1, woodPaid: 1 },
          p3: { card: "BANK", heat: -1, woodPaid: 1 },
        },
      },
    ]);
    // Both Stoke and Bank pay their Wood, in First Player order; Tend pays nothing (L263).
    expect(eventsOfType(events, "RESOURCES_CHANGED")).toEqual([
      { type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: -1, coins: 0, reason: "contribution" },
      { type: "RESOURCES_CHANGED", playerId: "p3", clay: 0, wood: -1, coins: 0, reason: "contribution" },
    ]);
    expect([table.player("p1"), table.player("p2"), table.player("p3")].map((p) => p.resources.wood)).toEqual([2, 1, 1]);
    expect(eventsOfType(events, "BASE_HEAT_DETERMINED")).toEqual([
      { type: "BASE_HEAT_DETERMINED", kilnDie: 2, contributionSum: 0, unclamped: 2, baseHeat: 2 },
    ]);
    expect(table.privateState).toEqual({ gameId: "test-game", windowId: null, submissions: {} });
    expect(table.state.firing?.contributions).toEqual(eventsOfType(events, "CONTRIBUTIONS_REVEALED")[0]?.contributions);
    expect(table.state.phase.type).toBe("firing_salvage");
  });

  it("a late submission after the reveal is PRIVATE_WINDOW_MISMATCH", () => {
    const table = openFiringTable(threeWithFlawed());
    table.contribute("p1", "TEND");
    table.contribute("p2", "TEND");
    table.contribute("p3", "TEND");
    const result = table.tryContribute("p1", "TEND");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PRIVATE_WINDOW_MISMATCH");
    }
  });

  it("a command for another window is PRIVATE_WINDOW_MISMATCH", () => {
    const table = openFiringTable(threeParticipants());
    const error = validateContribution(table.actorView("p1"), table.privateState, submitCommand("TEND", "test-game:r0:contributions"));
    expectError(error, "PRIVATE_WINDOW_MISMATCH");
  });

  it("validateContribution outside the window is WRONG_PHASE", () => {
    const state = buildState();
    const error = validateContribution(actorViewOf(state, "p1"), createPrivateFiringState(state), submitCommand("TEND"));
    expectError(error, "WRONG_PHASE");
  });
});

describe("Base Heat (L263, L674)", () => {
  it.each([
    { die: 2 as const, cards: ["TEND", "TEND", "TEND"] as const, expected: 2 },
    { die: 2 as const, cards: ["STOKE", "TEND", "TEND"] as const, expected: 3 },
    { die: 2 as const, cards: ["BANK", "TEND", "TEND"] as const, expected: 1 },
    { die: 2 as const, cards: ["STOKE", "BANK", "TEND"] as const, expected: 2 },
    { die: 3 as const, cards: ["TEND", "TEND", "TEND"] as const, expected: 3 },
    { die: 3 as const, cards: ["BANK", "TEND", "TEND"] as const, expected: 2 },
    { die: 3 as const, cards: ["STOKE", "STOKE", "TEND"] as const, expected: 5 },
  ])("die $die with $cards → Base Heat $expected (the rulebook's examples)", ({ die, cards, expected }) => {
    const table = openFiringTable(threeParticipants({ kilnDie: die, fireDeck: [0] }));
    const events = cards.flatMap((card, seat) => table.contribute(`p${seat + 1}`, card));
    const [determined] = eventsOfType(events, "BASE_HEAT_DETERMINED");
    expect(determined?.baseHeat).toBe(expected);
    expect(table.state.lastFiring?.baseHeat ?? table.state.firing?.baseHeat).toBe(expected);
  });

  it("clamps to 5 above and 0 below, keeping the unclamped value (L249)", () => {
    const high = openFiringTable(
      threeParticipants({ kilnDie: 3, fireDeck: [0], players: [{ techs: ["T12"] }, {}, {}] }),
    );
    high.contribute("p1", "FUEL_LEDGER_STOKE");
    high.contribute("p2", "STOKE");
    const highEvents = high.contribute("p3", "STOKE");
    expect(eventsOfType(highEvents, "BASE_HEAT_DETERMINED")[0]).toEqual({
      type: "BASE_HEAT_DETERMINED",
      kilnDie: 3,
      contributionSum: 4,
      unclamped: 7,
      baseHeat: 5,
    });
    const low = openFiringTable(threeParticipants({ kilnDie: 1, fireDeck: [0], players: [{ techs: ["T12"] }, {}, {}] }));
    low.contribute("p1", "FUEL_LEDGER_BANK");
    low.contribute("p2", "BANK");
    const lowEvents = low.contribute("p3", "TEND");
    expect(eventsOfType(lowEvents, "BASE_HEAT_DETERMINED")[0]).toMatchObject({ contributionSum: -3, unclamped: -2, baseHeat: 0 });
  });
});

describe("Fuel Ledger as Contribution cards (T12, v1.6.2 L266, L634, change 26)", () => {
  function ledgerTable(wood: number): ReturnType<typeof openFiringTable> {
    return openFiringTable({
      players: [{ techs: ["T12"], resources: { wood } }, {}],
      fireDeck: [0],
      ceramics: [shared("p1", "middle_1"), shared("p2", "high_1")],
    });
  }

  it("the owner holds 5 Contribution cards, everybody else 3 (the cards come with the tile)", () => {
    const table = ledgerTable(2);
    expect(table.player("p1").contributionCards).toEqual(["BANK", "TEND", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(table.player("p2").contributionCards).toEqual(["BANK", "TEND", "STOKE"]);
  });

  it("the owner's Bank and Stoke cost no Wood: ±1 for 0 Wood, even with 0 Wood", () => {
    const stoke = ledgerTable(0);
    expect(validateContribution(stoke.actorView("p1"), stoke.privateState, submitCommand("STOKE"))).toBeNull();
    expect(validateContribution(stoke.actorView("p1"), stoke.privateState, submitCommand("BANK"))).toBeNull();
    stoke.contribute("p1", "STOKE");
    const events = stoke.contribute("p2", "TEND");
    expect(eventsOfType(events, "CONTRIBUTIONS_REVEALED")[0]?.contributions["p1"]).toEqual({ card: "STOKE", heat: 1, woodPaid: 0 });
    // Nothing is paid, so no Wood changes hands for p1.
    expect(eventsOfType(events, "RESOURCES_CHANGED").filter((event) => event.playerId === "p1" && event.wood !== 0)).toEqual([]);
    expect(eventsOfType(events, "BASE_HEAT_DETERMINED")[0]?.baseHeat).toBe(3);
    expect(stoke.player("p1").resources.wood).toBe(0);

    const bank = ledgerTable(0);
    bank.contribute("p1", "BANK");
    const bankEvents = bank.contribute("p2", "TEND");
    expect(eventsOfType(bankEvents, "CONTRIBUTIONS_REVEALED")[0]?.contributions["p1"]).toMatchObject({ heat: -1, woodPaid: 0 });
    expect(eventsOfType(bankEvents, "BASE_HEAT_DETERMINED")[0]?.baseHeat).toBe(1);
  });

  it("Fuel Ledger Stoke is +2 and Fuel Ledger Bank −2, each for its printed 1 Wood, paid only on reveal", () => {
    const stoke = ledgerTable(1);
    expect(stoke.contribute("p1", "FUEL_LEDGER_STOKE")).toEqual([{ type: "CONTRIBUTION_SUBMITTED", playerId: "p1", windowId: WINDOW }]);
    expect(stoke.privateState.submissions["p1"]).toEqual({ card: "FUEL_LEDGER_STOKE" });
    // Nothing is set aside before the reveal (v1.6.2 L508): the Wood is still p1's.
    expect(stoke.player("p1").resources.wood).toBe(1);
    const events = stoke.contribute("p2", "TEND");
    expect(eventsOfType(events, "CONTRIBUTIONS_REVEALED")[0]?.contributions["p1"]).toEqual({ card: "FUEL_LEDGER_STOKE", heat: 2, woodPaid: 1 });
    expect(eventsOfType(events, "RESOURCES_CHANGED")[0]).toMatchObject({ playerId: "p1", wood: -1, reason: "contribution" });
    expect(eventsOfType(events, "BASE_HEAT_DETERMINED")[0]?.baseHeat).toBe(4);
    expect(stoke.player("p1").resources.wood).toBe(0);

    const bank = ledgerTable(1);
    bank.contribute("p1", "FUEL_LEDGER_BANK");
    const bankEvents = bank.contribute("p2", "TEND");
    expect(eventsOfType(bankEvents, "CONTRIBUTIONS_REVEALED")[0]?.contributions["p1"]).toEqual({ card: "FUEL_LEDGER_BANK", heat: -2, woodPaid: 1 });
    expect(eventsOfType(bankEvents, "BASE_HEAT_DETERMINED")[0]?.baseHeat).toBe(0);
  });

  it("a non-owner still pays 1 Wood for Bank or Stoke (v1.6.2 L262–264)", () => {
    const table = ledgerTable(0);
    table.contribute("p1", "TEND");
    const events = table.contribute("p2", "STOKE");
    expect(eventsOfType(events, "CONTRIBUTIONS_REVEALED")[0]?.contributions["p2"]).toMatchObject({ heat: 1, woodPaid: 1 });
    expect(table.player("p2").resources.wood).toBe(1);
  });

  it("a Fuel Ledger card needs the Tech (CONTRIBUTION_CARD_NOT_HELD) and its 1 Wood (INVALID_CONTRIBUTION)", () => {
    const noTech = openFiringTable(threeParticipants({ players: [{ resources: { wood: 5 } }, {}, {}] }));
    for (const card of ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const) {
      const error = validateContribution(noTech.actorView("p1"), noTech.privateState, submitCommand(card));
      expectError(error, "CONTRIBUTION_CARD_NOT_HELD");
      expect(error?.details).toEqual({ card });
      expect(noTech.tryContribute("p1", card).ok).toBe(false);
    }
    const poor = ledgerTable(0);
    const error = validateContribution(poor.actorView("p1"), poor.privateState, submitCommand("FUEL_LEDGER_STOKE"));
    expectError(error, "INVALID_CONTRIBUTION");
    expect(error?.details).toEqual({ card: "FUEL_LEDGER_STOKE", needed: 1, have: 0 });
    expect(validateContribution(poor.actorView("p1"), poor.privateState, submitCommand("STOKE"))).toBeNull();
    expect(legalContributions(poor.view("p1"))).toEqual([submitCommand("TEND"), submitCommand("BANK"), submitCommand("STOKE")]);
  });

  it("the owner still plays exactly 1 card: a second card is CONTRIBUTION_ALREADY_SUBMITTED", () => {
    const table = ledgerTable(3);
    table.contribute("p1", "FUEL_LEDGER_BANK");
    expectError(validateContribution(table.actorView("p1"), table.privateState, submitCommand("STOKE")), "CONTRIBUTION_ALREADY_SUBMITTED");
    expect(table.privateState.submissions["p1"]).toEqual({ card: "FUEL_LEDGER_BANK" });
  });
});

describe("affordability (L672) and legalContributions", () => {
  it("Bank and Stoke need 1 Wood; Tend is always affordable (L261)", () => {
    const table = openFiringTable(threeParticipants({ players: [{ resources: { wood: 0 } }, {}, {}] }));
    const view = table.actorView("p1");
    expectError(validateContribution(view, table.privateState, submitCommand("BANK")), "INVALID_CONTRIBUTION");
    expectError(validateContribution(view, table.privateState, submitCommand("STOKE")), "INVALID_CONTRIBUTION");
    expect(validateContribution(view, table.privateState, submitCommand("TEND"))).toBeNull();
    expect(legalContributions(view)).toEqual([submitCommand("TEND")]);
  });

  it("lists Tend first, then Bank, Stoke and the Fuel Ledger cards, held and affordable only", () => {
    const table = openFiringTable({
      players: [{ techs: ["T12"], resources: { wood: 2 } }, { resources: { wood: 1 } }, { techs: ["T13"] }],
      ceramics: [shared("p1", "middle_1"), shared("p2", "high_1")],
    });
    expect(legalContributions(table.view("p1"))).toEqual([
      submitCommand("TEND"),
      submitCommand("BANK"),
      submitCommand("STOKE"),
      submitCommand("FUEL_LEDGER_BANK"),
      submitCommand("FUEL_LEDGER_STOKE"),
    ]);
    expect(legalContributions(table.view("p2"))).toEqual([submitCommand("TEND"), submitCommand("BANK"), submitCommand("STOKE")]);
    // Non-participants, spectators and players who already submitted get nothing.
    expect(legalContributions(table.view("p3"))).toEqual([]);
    expect(legalContributions(table.view(null))).toEqual([]);
    table.contribute("p2", "BANK");
    expect(legalContributions(table.view("p2"))).toEqual([]);
    expect(legalContributions(viewOf(buildState(), "p1"))).toEqual([]);
  });

  it("every listed command is accepted by submitContribution", () => {
    for (let index = 0; index < 5; index += 1) {
      const table = openFiringTable({
        players: [{ techs: ["T12"], resources: { wood: 2 } }, {}],
        fireDeck: [0],
        ceramics: [shared("p1", "middle_1"), shared("p2", "high_1")],
      });
      const command = legalContributions(table.view("p1"))[index];
      expect(command).toBeDefined();
      if (command === undefined) return;
      expect(table.tryContribute("p1", command.card).ok).toBe(true);
    }
  });
});

describe("createPrivateFiringState and applyContribution", () => {
  it("creates an empty private state for the open window, or windowId null", () => {
    const table = openFiringTable(threeParticipants());
    expect(createPrivateFiringState(table.state)).toEqual({ gameId: "test-game", windowId: WINDOW, submissions: {} });
    expect(createPrivateFiringState(buildState())).toEqual({ gameId: "test-game", windowId: null, submissions: {} });
  });

  it("applyContribution writes the card only to the private draft", () => {
    const table = openFiringTable(threeParticipants());
    const draft = structuredClone(table.state);
    const privateDraft = createPrivateFiringState(draft);
    const ctx = testContext();
    applyContribution(draft, privateDraft, "p2", submitCommand("STOKE"), ctx);
    expect(privateDraft.submissions).toEqual({ p2: { card: "STOKE" } });
    // The players' public card lists name every card they hold; the sealed choice is nowhere else.
    expect(JSON.stringify({ ...draft, players: {} })).not.toContain("STOKE");
    expect(draft.players).toEqual(table.state.players);
    expect(ctx.events).toEqual([{ type: "CONTRIBUTION_SUBMITTED", playerId: "p2", windowId: WINDOW }]);
  });
});
