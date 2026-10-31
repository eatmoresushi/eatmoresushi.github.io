/**
 * B5's firing draft models (UI_V1.6.1_ARCHITECTURE §3.5, §9.2): `reduce` / `options` / `build`
 * tables per window, over the scripted scenarios and played moments. Owner: B5.
 *
 * Every option comes from the engine (selectors or `validateAction`), so the tables check the
 * forms against the engine rather than against restated rules.
 */
import { describe, expect, it } from "vitest";
import { contributionCardsOfTech, validateAction } from "../../../../src/game/index.ts";
import type { ActorView, AuthoritativeCommand, PlayerView, TechId } from "../../../../src/game/index.ts";
import { afterQualityDraft } from "../../../../src/app/decision/firing/AfterQuality.draft.ts";
import { contributionsDraft } from "../../../../src/app/decision/firing/Contributions.draft.ts";
import { junDraft } from "../../../../src/app/decision/firing/Jun.draft.ts";
import { secondFiringDraft } from "../../../../src/app/decision/firing/SecondFiring.draft.ts";
import { testPiecesDraft } from "../../../../src/app/decision/firing/TestPieces.draft.ts";
import { techsFreeingContributionCard } from "../../../../src/app/i18n/content.ts";
import { checkCommand } from "../../../../src/app/session/fixtureSource.ts";
import { REVALIDATE } from "../../../../src/app/state/draftStore.ts";
import type { DraftActionBase, DraftModel } from "../../../../src/app/state/draftStore.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
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

/** The same view with one Tech taken off the viewer's board (a player who never bought it), and the Contribution cards it brings. */
function withoutTech(id: string, techId: TechId): Ctx {
  const view = structuredClone(fixture(id).playerView);
  const me = view.game.players[view.viewerId!]!;
  me.techs = me.techs.filter((tech) => tech.id !== techId);
  const brought = contributionCardsOfTech(techId);
  me.contributionCards = me.contributionCards.filter((card) => !brought.includes(card));
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

  it("offers the selector's cards, the viewer's own 5 with Fuel Ledger, nothing chosen (v1.6.2 change 26)", () => {
    const draft = contributionsDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ card: null });
    const options = contributionsDraft.options(draft, c.model, c.engine);
    expect(options.cards.map((choice) => choice.card)).toEqual(["TEND", "BANK", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
    expect(options.cards.map((choice) => choice.card).sort()).toEqual([...c.view.game.players[c.view.viewerId!]!.contributionCards].sort());
    expect(options.cards.every((choice) => choice.available)).toBe(true);
    expect(contributionsDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(contributionsDraft.summary(draft, c.model, c.engine)?.key).toBe("firing.contrib.pick");
  });

  it("builds the selector's own command, window ID included, with nothing but the card", () => {
    const draft = run(contributionsDraft, c, { type: "card", card: "BANK" });
    const command = contributionsDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "SUBMIT_CONTRIBUTION", windowId: "test-game:r1:contributions", card: "BANK" });
    expect(valid(c, command)).toBe(true);
    expect(contributionsDraft.summary(draft, c.model, c.engine)?.key).toBe("firing.contrib.summary");
    expect(contributionsDraft.fromCommand(command!, c.model, c.engine)).toEqual({ card: "BANK" });
  });

  it("Fuel Ledger: its own 2 cards cost 1 Wood each for −2 / +2 and name the Tech; the owner's Bank and Stoke cost none, and name the Tech that makes them free (v1.6.2 L634)", () => {
    const options = contributionsDraft.options(contributionsDraft.initial(c.model, c.engine), c.model, c.engine);
    // [card, Wood, Heat, below its printed Wood, made free by, came with]
    expect(options.cards.map((choice) => [choice.card, choice.option.woodCost, choice.option.heat, choice.belowPrintedCost, choice.freeBy, choice.techId])).toEqual([
      ["TEND", 0, 0, false, null, null],
      ["BANK", 0, -1, true, "T12", null],
      ["STOKE", 0, 1, true, "T12", null],
      ["FUEL_LEDGER_BANK", 1, -2, false, null, "T12"],
      ["FUEL_LEDGER_STOKE", 1, 2, false, null, "T12"],
    ]);
    // The link comes from the tile's printed text (T12 freeCards), never from which Tech brought cards.
    expect(techsFreeingContributionCard("BANK")).toEqual(["T12"]);
    expect(techsFreeingContributionCard("STOKE")).toEqual(["T12"]);
    for (const card of ["TEND", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const) expect(techsFreeingContributionCard(card)).toEqual([]);
    for (const card of ["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const) {
      const draft = run(contributionsDraft, c, { type: "card", card });
      const command = contributionsDraft.build(draft, c.model, c.engine);
      expect(command).toEqual({ type: "SUBMIT_CONTRIBUTION", windowId: "test-game:r1:contributions", card });
      expect(valid(c, command)).toBe(true);
    }
    // Without the Tech: the 3 cards every player holds, Bank and Stoke at their printed Wood, nothing marked.
    const m9 = withoutTech("m9_contributions_step1_3p", "T12");
    const plain = contributionsDraft.options(contributionsDraft.initial(m9.model, m9.engine), m9.model, m9.engine);
    expect(plain.cards.map((choice) => [choice.card, choice.option.woodCost, choice.belowPrintedCost, choice.freeBy, choice.techId])).toEqual([
      ["TEND", 0, false, null, null],
      ["BANK", 1, false, null, null],
      ["STOKE", 1, false, null, null],
    ]);
    expect(run(contributionsDraft, m9, { type: "card", card: "FUEL_LEDGER_STOKE" })).toEqual({ card: null });
  });

  it("Fuel Ledger with no Wood: Bank and Stoke stay free, its own 2 cards are unavailable and never chosen", () => {
    const view = structuredClone(fixture("w-secret-contributions-with-fuel-ledger").playerView);
    view.game.players[view.viewerId!]!.resources.wood = 0;
    const poor = ctxOf(view);
    const options = contributionsDraft.options(contributionsDraft.initial(poor.model, poor.engine), poor.model, poor.engine);
    expect(options.cards.map((choice) => [choice.card, choice.available, choice.reason])).toEqual([
      ["TEND", true, null],
      ["BANK", true, null],
      ["STOKE", true, null],
      ["FUEL_LEDGER_BANK", false, "cant_afford"],
      ["FUEL_LEDGER_STOKE", false, "cant_afford"],
    ]);
    expect(run(contributionsDraft, poor, { type: "card", card: "FUEL_LEDGER_BANK" })).toEqual({ card: null });
    // A Fuel Ledger card chosen before the Wood was gone is dropped on revalidation.
    expect(contributionsDraft.reduce({ card: "FUEL_LEDGER_STOKE" }, REVALIDATE, poor.model, poor.engine)).toEqual({ card: null });
    const bank = run(contributionsDraft, poor, { type: "card", card: "BANK" });
    const command = contributionsDraft.build(bank, poor.model, poor.engine);
    expect(command).toMatchObject({ card: "BANK" });
    expect(valid(poor, command)).toBe(true);
  });

  it("with only Tend affordable, Tend is the choice (§3.5)", () => {
    const m9 = withoutTech("m9_contributions_step1_3p", "T12");
    m9.view.game.players[m9.view.viewerId!]!.resources.wood = 0;
    const poor = ctxOf(m9.view);
    expect(contributionsDraft.initial(poor.model, poor.engine)).toEqual({ card: "TEND" });
  });

  it("revalidation keeps a legal draft as is and drops a card the viewer does not hold", () => {
    const legal = { card: "FUEL_LEDGER_BANK" as const };
    expect(contributionsDraft.reduce(legal, REVALIDATE, c.model, c.engine)).toBe(legal);
    const m9 = withoutTech("m9_contributions_step1_3p", "T12");
    expect(contributionsDraft.reduce(legal, REVALIDATE, m9.model, m9.engine)).toEqual({ card: null });
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

describe("Jun", () => {
  it("step 3: a ceramic and a side, or decline", () => {
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

  it("is step 3 only: Second Firing's choice carries an unused Jun itself (rev. 4 L627)", () => {
    const c = ctx("w-second-firing-choice-with-jun-r7");
    expect(junDraft.options(junDraft.initial(c.model, c.engine), c.model, c.engine).during).toBeNull();
  });
});

describe("Second Firing's choice (rev. 4 L627)", () => {
  it("chooses 1 of the 2 revealed cards, with R7's Jun when ready; nothing preselected", () => {
    const c = ctx("w-second-firing-choice-with-jun-r7");
    const draft = secondFiringDraft.initial(c.model, c.engine);
    expect(draft).toEqual({ cardIndex: null, jun: null });
    const options = secondFiringDraft.options(draft, c.model, c.engine);
    const stage = c.model.firingStage?.extraFire;
    expect(stage).toMatchObject({ playerId: "p1", ceramicId: "c1" });
    expect(options.ceramicId).toBe("c1");
    expect(options.cards.map((card) => card.modifier)).toEqual(stage?.modifiers);
    expect(options.jun).toEqual({ offered: true, ready: true, woodCost: 1, sides: [1, -1], reason: null });
    expect(secondFiringDraft.build(draft, c.model, c.engine)).toBeNull();
    expect(secondFiringDraft.summary(draft, c.model, c.engine)?.key).toBe("firing.sf.pick");
    const second = run(secondFiringDraft, c, { type: "card", cardIndex: 1 });
    expect(secondFiringDraft.build(second, c.model, c.engine)).toEqual({ type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: null });
    expect(secondFiringDraft.summary(second, c.model, c.engine)?.key).toBe("firing.sf.sum");
    const withJun = run(secondFiringDraft, c, { type: "card", cardIndex: 0 }, { type: "jun", delta: -1 });
    const command = secondFiringDraft.build(withJun, c.model, c.engine);
    expect(command).toEqual({ type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: { delta: -1 } });
    expect(valid(c, command)).toBe(true);
    expect(secondFiringDraft.summary(withJun, c.model, c.engine)?.key).toBe("firing.sf.sumJun");
    expect(secondFiringDraft.fromCommand(command!, c.model, c.engine)).toEqual(withJun);
    // Back to not using Jun.
    expect(run(secondFiringDraft, c, { type: "card", cardIndex: 0 }, { type: "jun", delta: -1 }, { type: "jun", delta: null }).jun).toBeNull();
  });

  it("a played Jun owner (m18) is offered Jun's +1 or −1 with the card", () => {
    const c = ctx("m18_jun_second_firing");
    const options = secondFiringDraft.options(secondFiringDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.cards).toHaveLength(2);
    expect(options.jun).toMatchObject({ offered: true, ready: true, woodCost: 1, sides: [1, -1], reason: null });
    const command = secondFiringDraft.build(run(secondFiringDraft, c, { type: "card", cardIndex: 1 }, { type: "jun", delta: -1 }), c.model, c.engine);
    expect(command).toEqual({ type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: { delta: -1 } });
    expect(valid(c, command)).toBe(true);
  });

  it("offers no Jun without the Jun Kiln, and drops a Jun choice on revalidation", () => {
    // The R7 scenario with the viewer on the Ding Kiln instead: Jun is not their ability.
    const view = structuredClone(fixture("w-second-firing-choice-with-jun-r7").playerView);
    view.game.players[view.viewerId!]!.kilnId = "DI";
    const c = ctxOf(view);
    const options = secondFiringDraft.options(secondFiringDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.jun).toMatchObject({ offered: false, ready: false, sides: [], reason: null });
    expect(run(secondFiringDraft, c, { type: "jun", delta: 1 }).jun).toBeNull();
    expect(secondFiringDraft.reduce({ cardIndex: 1, jun: 1 }, REVALIDATE, c.model, c.engine)).toEqual({ cardIndex: 1, jun: null });
    expect(secondFiringDraft.build(run(secondFiringDraft, c, { type: "card", cardIndex: 1 }), c.model, c.engine)).toEqual({ type: "SECOND_FIRING_CHOOSE", cardIndex: 1, jun: null });
  });
});

type ViewPlayer = NonNullable<PlayerView["game"]["players"][string]>;

describe("Second Firing's choice: a Jun owner whose Jun is not ready sees the engine's reason (R7)", () => {
  function junCtx(edit: (player: ViewPlayer) => void): Ctx {
    const view = structuredClone(fixture("w-second-firing-choice-with-jun-r7").playerView);
    edit(view.game.players[view.viewerId!]!);
    return ctxOf(view);
  }
  const usedJun = (player: ViewPlayer): void => {
    player.kilnAbilityUsedThisRound = true;
  };
  const noWood = (player: ViewPlayer): void => {
    player.resources.wood = 0;
  };

  it.each([
    ["used in step 3", usedJun, "ABILITY_ALREADY_USED"],
    ["no Wood", noWood, "INSUFFICIENT_RESOURCES"],
  ] as const)("%s", (_, edit, code) => {
    const c = junCtx(edit);
    const options = secondFiringDraft.options(secondFiringDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.jun).toMatchObject({ offered: true, ready: false, sides: [], woodCost: 1 });
    expect(options.jun.reason?.code).toBe(code);
    expect(run(secondFiringDraft, c, { type: "card", cardIndex: 0 }, { type: "jun", delta: 1 })).toEqual({ cardIndex: 0, jun: null });
    const command = secondFiringDraft.build(run(secondFiringDraft, c, { type: "card", cardIndex: 0 }), c.model, c.engine);
    expect(command).toEqual({ type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null });
    expect(valid(c, command)).toBe(true);
  });
});

describe("after-Quality", () => {
  const c = ctx("w-after-quality-saggars-and-ge");

  it("offers each ability with its eligible ceramics; one use per command", () => {
    const options = afterQualityDraft.options(afterQualityDraft.initial(c.model, c.engine), c.model, c.engine);
    // Rev. 5 L643: Saggars upgrades a Standard ceramic (its floored one included) for nothing.
    // Rev. 5 L482 (change 39, R30): Ge crackles any of its owner's ceramics of the firing, so the Fine c3 is a Ge target too.
    expect(options.abilities.map((option) => [option.ability, option.ceramicIds])).toEqual([
      ["protective_saggars", ["c1", "c2"]],
      ["ge_crackle", ["c1", "c2", "c3"]],
    ]);
    // No sale during the firing (owner revision 5, R26): the step's options carry none.
    expect(Object.keys(options).sort()).toEqual(["abilities", "canEnd"]);
    expect(options.abilities.every((option) => option.cost.clay + option.cost.wood + option.cost.coins === 0)).toBe(true);
    expect(c.model.firingStage?.ceramics.find((ceramic) => ceramic.id === "c2")).toMatchObject({ quality: "standard", saggarsFloor: true });
    const ge = run(afterQualityDraft, c, { type: "use", ability: "ge_crackle", ceramicId: "c1" });
    expect(afterQualityDraft.build(ge, c.model, c.engine)).toEqual({ type: "USE_GE_CRACKLE", ceramicId: "c1" });
    // The Fine ceramic is a Ge target (rev. 4 L463), but no Protective Saggars target (Standard only).
    expect(afterQualityDraft.build(run(afterQualityDraft, c, { type: "use", ability: "ge_crackle", ceramicId: "c3" }), c.model, c.engine)).toEqual({ type: "USE_GE_CRACKLE", ceramicId: "c3" });
    expect(run(afterQualityDraft, c, { type: "use", ability: "protective_saggars", ceramicId: "c3" }).choice).toBeNull();
    // A sale is no choice of this step (R26): an action naming one is dropped.
    expect(run(afterQualityDraft, c, { type: "use", ability: "sell_flawed" as never, ceramicId: "c1" }).choice).toBeNull();
    expect(afterQualityDraft.build(run(afterQualityDraft, c, { type: "end" }), c.model, c.engine)).toEqual({ type: "END_AFTER_QUALITY" });
  });

  it("each ability's summary states its card effect (Saggars: Standard → Fine, no Wood; R4: declining is the alternative)", () => {
    const saggars = run(afterQualityDraft, c, { type: "use", ability: "protective_saggars", ceramicId: "c2" });
    expect(afterQualityDraft.build(saggars, c.model, c.engine)).toEqual({ type: "USE_PROTECTIVE_SAGGARS", ceramicId: "c2" });
    expect(afterQualityDraft.summary(saggars, c.model, c.engine)?.key).toBe("firing.aq.sumSaggars");
    // Ge on a Standard ceramic: it becomes Fine; on a Fine one it keeps its Quality (change 39, R30).
    expect(afterQualityDraft.summary(run(afterQualityDraft, c, { type: "use", ability: "ge_crackle", ceramicId: "c1" }), c.model, c.engine)?.key).toBe("firing.aq.sumGe");
    expect(afterQualityDraft.summary(run(afterQualityDraft, c, { type: "use", ability: "ge_crackle", ceramicId: "c3" }), c.model, c.engine)?.key).toBe("firing.aq.sumGeKeep");
    // The same firing with Second Firing (T14) as the viewer's Firing Tech instead of Protective Saggars.
    const view = structuredClone(fixture("w-after-quality-saggars-and-ge").playerView);
    const me = view.game.players[view.viewerId!]!;
    me.techs = me.techs.map((tech) => (tech.id === "T11" ? { ...tech, id: "T14" as const } : tech));
    const sf = ctxOf(view);
    const second = afterQualityOptionsFirst(sf, "second_firing");
    expect(second).not.toBeNull();
    expect(afterQualityOptionsFirst(sf, "protective_saggars")).toBeNull();
    const draft = run(afterQualityDraft, sf, { type: "use", ability: "second_firing", ceramicId: second! });
    expect(afterQualityDraft.build(draft, sf.model, sf.engine)).toEqual({ type: "USE_SECOND_FIRING", ceramicId: second });
    expect(afterQualityDraft.summary(draft, sf.model, sf.engine)?.key).toBe("firing.aq.sumSecond");
    expect(afterQualityDraft.summary(run(afterQualityDraft, c, { type: "end" }), c.model, c.engine)?.key).toBe("firing.aq.sumEnd");
  });
});

/** The first ceramic the after-Quality window offers for an ability, or null. */
function afterQualityOptionsFirst(c: Ctx, ability: "protective_saggars" | "second_firing" | "ge_crackle"): string | null {
  const options = afterQualityDraft.options(afterQualityDraft.initial(c.model, c.engine), c.model, c.engine);
  return options.abilities.find((option) => option.ability === ability)?.ceramicIds[0] ?? null;
}

describe("after-Quality: Ge on any ceramic (changes 29, 39; R30) and no sale (R26)", () => {
  it("Ge on a played Fine ceramic builds the command; the summary says it gains a Crackle marker and stays Fine", () => {
    const c = ctx("m26_ge_crackle_fine");
    const options = afterQualityDraft.options(afterQualityDraft.initial(c.model, c.engine), c.model, c.engine);
    const ge = options.abilities.find((option) => option.ability === "ge_crackle");
    expect(ge?.ceramicIds.length).toBeGreaterThan(0);
    const fine = ge!.ceramicIds.find((id) => c.model.firingStage?.ceramics.find((ceramic) => ceramic.id === id)?.quality === "fine");
    expect(fine).toBeDefined();
    const draft = run(afterQualityDraft, c, { type: "use", ability: "ge_crackle", ceramicId: fine! });
    const command = afterQualityDraft.build(draft, c.model, c.engine);
    expect(command).toEqual({ type: "USE_GE_CRACKLE", ceramicId: fine });
    expect(valid(c, command)).toBe(true);
    const summary = afterQualityDraft.summary(draft, c.model, c.engine);
    expect(summary?.key).toBe("firing.aq.sumGeKeep");
    expect(createTranslator("en", { strict: true }).message(summary!)).toMatch(/gains a Crackle marker and stays Fine$/);
    expect(createTranslator("zh-CN", { strict: true }).message(summary!)).toMatch(/开片，品质仍为上品$/);
  });

  it("the own after-Quality turn with a Flawed ceramic of this firing offers Second Firing and no sale (R26)", () => {
    const c = ctx("t-after-quality-no-sale");
    const options = afterQualityDraft.options(afterQualityDraft.initial(c.model, c.engine), c.model, c.engine);
    expect(options.abilities.find((option) => option.ability === "second_firing")?.ceramicIds).toEqual(["c1"]);
    expect(c.model.firingStage?.ceramics.find((ceramic) => ceramic.id === "c1")?.quality).toBe("flawed");
    expect(Object.keys(options)).not.toContain("sale");
    // A sale command is neither built nor expressed here: the engine refuses it during the firing.
    expect(afterQualityDraft.fromCommand({ type: "SELL_FLAWED", ceramicId: "c1" }, c.model, c.engine)).toBeNull();
    expect(valid(c, { type: "SELL_FLAWED", ceramicId: "c1" })).toBe(false);
  });
});

describe("every built command validates", () => {
  it.each([
    ["w-test-pieces-decision", testPiecesDraft, { type: "choose", choice: "peek" }],
    ["w-second-firing-choice-with-jun-r7", secondFiringDraft, { type: "card", cardIndex: 1 }],
    ["w-after-quality-saggars-and-ge", afterQualityDraft, { type: "use", ability: "protective_saggars", ceramicId: "c2" }],
    ["t-after-quality-no-sale", afterQualityDraft, { type: "use", ability: "second_firing", ceramicId: "c1" }],
    ["m26_ge_crackle_fine", afterQualityDraft, { type: "end" }],
  ] as const)("%s", (id, model, action) => {
    const c = ctx(id);
    const draftModel = model as unknown as DraftModel<unknown, DraftActionBase, unknown>;
    const draft = draftModel.reduce(draftModel.initial(c.model, c.engine), action, c.model, c.engine);
    const command = draftModel.build(draft, c.model, c.engine);
    expect(command).not.toBeNull();
    expect(validateAction(c.engine.actor as ActorView, command as never)).toBeNull();
  });
});
