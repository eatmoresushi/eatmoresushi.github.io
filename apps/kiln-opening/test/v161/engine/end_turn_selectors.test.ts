/**
 * The read-only selectors behind the split Confirm (owner UI decision D21; ENGINE_V1.6.2_DELTA.md
 * §16.24):
 *
 * - `afterActionMayOpen(view, brings)`: may the after-action step open once this action is done
 *   (R27), on public facts and what the action brings, and never on what a hand holds;
 * - `guildDecisionLeftAfterTake(view, take)` and `guildDecisionLeftOnResume(view)`: does the Guild
 *   Hall inspection go on after this take, or after Colour Samples' Select with an inspection
 *   behind it. Both ask the engine's own `decisionLeft`, on the state after the take.
 *
 * Random legal games check the Guild selectors against the step the engine then leaves open, for
 * every legal take at every inspection. `KILN_END_TURN_SELECTOR_GAMES` plays more games per player
 * count.
 */

import { describe, expect, it } from "vitest";
import { DISCIPLINES, IMPERIAL_TRACK, TECHS, TECH_IDS } from "../../../src/game/content.ts";
import { applyAction, validateAction } from "../../../src/game/engine.ts";
import { sampleLegalAction } from "../../../src/game/legalActions.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { afterActionMayOpen, guildDecisionLeftAfterTake, guildDecisionLeftOnResume, guildInspectionOptions } from "../../../src/game/selectors.ts";
import type { ActionBrings, GameAction, GameState, GuildTake, OrderId, PlayerId, TechDiscipline, TechId } from "../../../src/game/types.ts";
import { viewOf } from "../../../src/game/view.ts";
import { type CeramicSpec, type PlayerSpec, buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

const GAMES = Math.max(1, Number(process.env["KILN_END_TURN_SELECTOR_GAMES"] ?? "20"));

const SHAPED: CeramicSpec = { owner: "p1", stage: "shaped", shape: "bowl" };
const STANDARD: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "standard" };
const FLAWED: CeramicSpec = { owner: "p1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" };
const IN_IMPERIAL_KILN: CeramicSpec = { owner: "p1", stage: "loaded", shape: "plate", glaze: "white", at: "imperial" };

function inspect(discipline: TechDiscipline): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline } };
}

function face(techId: TechId): GuildTake {
  return { kind: "face_up", techId };
}

function inspected(techId: TechId): GuildTake {
  return { kind: "inspected", techId };
}

function stepOf(state: GameState): string {
  const phase = state.phase;
  return phase.type === "work_turn" ? phase.step.kind : phase.type;
}

/**
 * A table with only the named Techs showing and the named ones on top of their decks (the rest
 * below them), so each case counts its own options. `seats` own Techs: every Tech must sit in
 * exactly one zone, so a deck of fewer than 2 needs the other seats to hold the rest.
 */
function guildTable(coins: number, display: Partial<Record<TechDiscipline, TechId[]>>, tops: Partial<Record<TechDiscipline, TechId[]>>, seats: PlayerSpec[] = [{}, {}]): LocalTable {
  const owned = seats.flatMap((seat) => (seat.techs ?? []).map((tech) => (typeof tech === "string" ? tech : tech.id)));
  const techDisplay: Partial<Record<TechDiscipline, TechId[]>> = {};
  const techDecks: Partial<Record<TechDiscipline, TechId[]>> = {};
  for (const discipline of DISCIPLINES) {
    const shown = display[discipline] ?? [];
    const top = tops[discipline] ?? [];
    techDisplay[discipline] = shown;
    techDecks[discipline] = [...top, ...TECH_IDS.filter((id) => TECHS[id].discipline === discipline && ![...owned, ...shown, ...top].includes(id))];
  }
  const [me = {}, ...others] = seats;
  return new LocalTable(buildState({ players: [{ ...me, resources: { coins } }, ...others], techDisplay, techDecks }));
}

// ── afterActionMayOpen ────────────────────────────────────────────────────────────────

describe("afterActionMayOpen (R27): public facts now, and what the action brings", () => {
  function mayOpen(me: PlayerSpec, ceramics: CeramicSpec[], brings?: ActionBrings): boolean {
    const t = new LocalTable(buildState({ players: [me, {}], ceramics }));
    return afterActionMayOpen(t.view("p1"), brings);
  }
  /** Recognition 2: the Imperial Kiln is gained, the token still on the track. */
  const KILN: PlayerSpec = { recognition: 2 };
  /** Recognition 3: the Imperial Kiln is gained and the token held. */
  const TOKEN: PlayerSpec = { recognition: 3 };

  it("with nothing held and nothing brought, it stays shut whatever the action is", () => {
    expect(mayOpen({}, [])).toBe(false);
    for (const brings of [{ order: true }, { vessel: true }, { colourSamples: true }, { recognition: 1 }, { recognition: null }, { recognition: 3 }] satisfies ActionBrings[]) {
      expect(mayOpen({}, [], brings), JSON.stringify(brings)).toBe(false);
    }
  });

  it("is true whenever the step would open on the facts as they stand, brought or not", () => {
    expect(mayOpen({}, [FLAWED])).toBe(true);
    expect(mayOpen({ hand: ["O01"] }, [STANDARD])).toBe(true);
    expect(mayOpen({ hand: ["O01"], techs: ["T10"] }, [])).toBe(true);
    expect(mayOpen(TOKEN, [SHAPED])).toBe(true);
  });

  it("an Order into the hand counts with a Finished ceramic or a ready swap", () => {
    expect(mayOpen({}, [STANDARD])).toBe(false);
    expect(mayOpen({}, [STANDARD], { order: true })).toBe(true);
    expect(mayOpen({ techs: ["T10"] }, [])).toBe(false);
    expect(mayOpen({ techs: ["T10"] }, [], { order: true })).toBe(true);
    // The swap has been used this round.
    expect(mayOpen({ techs: [{ id: "T10", usedThisRound: true }] }, [], { order: true })).toBe(false);
  });

  it("Colour Samples counts with a held Order, or with the Order the action brings too", () => {
    expect(mayOpen({ hand: ["O01"] }, [])).toBe(false);
    expect(mayOpen({ hand: ["O01"] }, [], { colourSamples: true })).toBe(true);
    expect(mayOpen({}, [], { colourSamples: true })).toBe(false);
    expect(mayOpen({}, [], { colourSamples: true, order: true })).toBe(true);
  });

  it("a Shaped vessel counts with the token held and the Imperial Kiln gained and empty", () => {
    expect(mayOpen(TOKEN, [])).toBe(false);
    expect(mayOpen(TOKEN, [], { vessel: true })).toBe(true);
    expect(mayOpen(TOKEN, [IN_IMPERIAL_KILN], { vessel: true })).toBe(false);
    expect(mayOpen(KILN, [], { vessel: true })).toBe(false);
    expect(mayOpen({ recognition: 3, imperial: { priority: "spent" } }, [], { vessel: true })).toBe(false);
    expect(mayOpen({ recognition: 3, imperial: { kilnGained: false } }, [], { vessel: true })).toBe(false);
  });

  it("reaching the space of the Imperial Priority token counts with an empty Imperial Kiln and a Shaped vessel", () => {
    expect(IMPERIAL_TRACK.track.find((space) => space.reward?.kind === "imperial_priority")?.space).toBe(3);
    expect(mayOpen(KILN, [SHAPED])).toBe(false);
    expect(mayOpen(KILN, [SHAPED], { recognition: 3 })).toBe(true);
    expect(mayOpen(KILN, [], { recognition: 3 })).toBe(false);
    expect(mayOpen(KILN, [SHAPED, IN_IMPERIAL_KILN], { recognition: 3 })).toBe(false);
    expect(mayOpen({ recognition: 1 }, [SHAPED], { recognition: 3 })).toBe(false);
    // Any other space brings no token, and null is a Magistrate's Hall that cannot be reached.
    for (const recognition of [0, 1, 2, 4, null]) {
      expect(mayOpen(KILN, [SHAPED], { recognition }), String(recognition)).toBe(false);
    }
  });

  it("reads the hand count, never the hand: the same size gives the same answer", () => {
    const answers = (hand: OrderId[]): boolean[] => {
      const t = new LocalTable(buildState({ players: [{ hand }, {}] }));
      return [{}, { order: true }, { colourSamples: true }, { vessel: true }, { recognition: 3 }].map((brings) => afterActionMayOpen(t.view("p1"), brings));
    };
    expect(answers(["O01"])).toEqual(answers(["O40"]));
    expect(answers(["O01"])).toEqual([false, false, true, false, false]);
    // A view with the viewer's own hand blanked out answers the same too.
    const t = new LocalTable(buildState({ players: [{ hand: ["O01"], techs: ["T10"] }, {}] }));
    const blank = t.view("p1");
    if (blank.own === null) throw new Error("the seat has a private view");
    blank.own.orderHand = [];
    expect(afterActionMayOpen(blank)).toBe(true);
    // And where the public count itself decides: Colour Samples is what this action brings.
    const counted = new LocalTable(buildState({ players: [{ hand: ["O01"] }, {}] })).view("p1");
    if (counted.own === null) throw new Error("the seat has a private view");
    counted.own.orderHand = [];
    expect(afterActionMayOpen(counted, { colourSamples: true })).toBe(true);
  });

  it("a spectator gets no; another seat's public facts answer for that seat, with no turn of theirs needed", () => {
    const t = new LocalTable(buildState({ players: [{}, { hand: ["O01"] }] }));
    expect(afterActionMayOpen(t.view(null))).toBe(false);
    expect(afterActionMayOpen(t.view(null), { order: true, vessel: true, colourSamples: true, recognition: 3 })).toBe(false);
    expect(afterActionMayOpen(t.view("p2"))).toBe(false);
    expect(afterActionMayOpen(t.view("p2"), { colourSamples: true })).toBe(true);
  });
});

// ── The Guild Hall selectors ──────────────────────────────────────────────────────────

describe("guildDecisionLeftAfterTake: the engine's own `decisionLeft`, on the state after the take", () => {
  /** The selector's answer, then the engine's: the inspection step open after the take. */
  function expectAnswer(t: LocalTable, take: GuildTake, answer: boolean): void {
    expect(guildDecisionLeftAfterTake(t.view("p1"), take)).toBe(answer);
    t.act("p1", { type: "GUILD_TAKE", take });
    expect(stepOf(t.state) === "guild_inspection").toBe(answer);
  }

  it("2 inspected Techs left to return: a bottom order is a decision, at 0 Coins and after a second take", () => {
    const poor = guildTable(2, { workshop: ["T01"] }, { firing: ["T13", "T14"] });
    poor.act("p1", inspect("firing"));
    expectAnswer(poor, face("T01"), true);

    const second = guildTable(5, { workshop: ["T01"], glazing_loading: ["T20"] }, { firing: ["T13", "T14"] });
    second.act("p1", inspect("firing"));
    second.act("p1", { type: "GUILD_TAKE", take: face("T01") });
    expectAnswer(second, face("T20"), true);
  });

  it("the second take with at most 1 inspected Tech left closes the step, whatever else could be afforded", () => {
    const t = guildTable(20, { workshop: ["T01"], glazing_loading: ["T20"] }, { firing: ["T13", "T14"] });
    t.act("p1", inspect("firing"));
    expectAnswer(t, inspected("T13"), true);
    expectAnswer(t, face("T01"), false);
  });

  it("an affordable face-up Tech of a discipline not owned goes on; the Coins are the ones left after this take", () => {
    const enough = guildTable(5, { workshop: ["T01"] }, { firing: ["T13", "T14"] });
    enough.act("p1", inspect("firing"));
    expectAnswer(enough, inspected("T13"), true);

    const short = guildTable(4, { workshop: ["T01"] }, { firing: ["T13", "T14"] });
    short.act("p1", inspect("firing"));
    expectAnswer(short, inspected("T13"), false);
  });

  it("uses the inspected Tech's own price, for the viewer who has seen it", () => {
    const setup = (): LocalTable => {
      const t = guildTable(4, { workshop: ["T01"] }, { firing: ["T13", "T14"] });
      t.act("p1", inspect("firing"));
      return t;
    };
    // T13 costs 3 and leaves 1 Coin; T14 costs 2 and leaves the 2 that T01 costs.
    expectAnswer(setup(), inspected("T13"), false);
    expectAnswer(setup(), inspected("T14"), true);
  });

  it("the taken Tech and its discipline count as gone: the 1-per-discipline limit refuses them, though they still show", () => {
    // Nothing inspected, Firing owned, Coins to spare: T01 still shows when the selector asks, and
    // T16 beside it is of the discipline T01 brings.
    const seats: PlayerSpec[] = [{ techs: ["T13"] }, { techs: ["T14"] }, { techs: ["T24"] }, { techs: ["T25"] }];
    const t = guildTable(20, { workshop: ["T01", "T16"], firing: ["T11", "T12"] }, {}, seats);
    t.act("p1", inspect("firing"));
    expect(t.state.phase).toMatchObject({ step: { inspectedCount: 0 } });
    expect(t.view("p1").game.techDisplay.workshop).toContain("T01");
    expectAnswer(t, face("T01"), false);
  });

  it("1 inspected Tech left of a discipline not owned goes on though its price is private; owned, it does not", () => {
    const open = guildTable(2, { workshop: ["T01"], firing: ["T11", "T14"] }, { firing: ["T13"] }, [{}, { techs: ["T12"] }, { techs: ["T24"] }, { techs: ["T25"] }]);
    open.act("p1", inspect("firing"));
    expect(open.state.phase).toMatchObject({ step: { inspectedCount: 1 } });
    expectAnswer(open, face("T01"), true);

    const owned = guildTable(2, { workshop: ["T01"], firing: ["T14"] }, { firing: ["T13"] }, [{ techs: ["T11"] }, { techs: ["T12"] }, { techs: ["T24"] }, { techs: ["T25"] }]);
    owned.act("p1", inspect("firing"));
    expect(owned.state.phase).toMatchObject({ step: { inspectedCount: 1 } });
    expectAnswer(owned, face("T01"), false);
  });

  it("the third Tech owned ends it, with 1 inspected Tech left and Coins to spare", () => {
    const t = guildTable(20, { firing: ["T11"] }, { firing: ["T13", "T14"] }, [{ techs: ["T01", "T20"] }, {}]);
    t.act("p1", inspect("firing"));
    expectAnswer(t, inspected("T13"), false);
  });

  it("no inspection, or a take that is not an option, answers no", () => {
    const t = guildTable(20, { workshop: ["T01"] }, { firing: ["T13", "T14"] });
    expect(guildDecisionLeftAfterTake(t.view("p1"), face("T01"))).toBe(false);
    t.act("p1", inspect("firing"));
    expect(guildDecisionLeftAfterTake(t.view("p1"), inspected("T25"))).toBe(false);
    expect(guildDecisionLeftAfterTake(t.view("p1"), face("T13"))).toBe(false);
    expect(guildDecisionLeftAfterTake(t.view("p1"), inspected("T01"))).toBe(false);
  });

  it("privacy: another seat and a spectator get no for every take, inspected or face up, and nothing throws", () => {
    const t = guildTable(20, { workshop: ["T01"] }, { firing: ["T13", "T14"] });
    t.act("p1", inspect("firing"));
    const takes = [inspected("T13"), inspected("T14"), face("T01")];
    expect(takes.map((take) => guildDecisionLeftAfterTake(t.view("p1"), take))).toEqual([true, true, true]);
    for (const viewerId of ["p2", null] as const) {
      const view = t.view(viewerId);
      expect(guildInspectionOptions(view)).toBeNull();
      expect(takes.map((take) => guildDecisionLeftAfterTake(view, take))).toEqual([false, false, false]);
      expect(guildDecisionLeftOnResume(view)).toBe(false);
    }
  });

  it("changes nothing in the view it reads", () => {
    const t = guildTable(20, { workshop: ["T01"] }, { firing: ["T13", "T14"] });
    t.act("p1", inspect("firing"));
    const view = t.view("p1");
    const before = structuredClone(view);
    guildDecisionLeftAfterTake(view, inspected("T13"));
    guildDecisionLeftAfterTake(view, face("T01"));
    expect(view).toEqual(before);
  });
});

describe("guildDecisionLeftOnResume: Colour Samples' Select with an inspection behind it", () => {
  /** A Glazing & Loading deck of 1: the other seats hold 3 of its Techs. */
  const SHORT_GLAZING = {
    display: { glazing_loading: ["T10", "T23"] },
    tops: { glazing_loading: ["T15"] },
    seats: [{}, { techs: ["T20"] }, { techs: ["T21"] }, { techs: ["T22"] }],
  } satisfies { display: Record<string, TechId[]>; tops: Record<string, TechId[]>; seats: PlayerSpec[] };

  /** The Shifu has inspected `discipline` and taken Colour Samples: the Select is open. */
  function samplesFirst(coins: number, display: Partial<Record<TechDiscipline, TechId[]>>, tops: Partial<Record<TechDiscipline, TechId[]>>, discipline: TechDiscipline, seats?: PlayerSpec[]): LocalTable {
    const t = guildTable(coins, display, tops, seats);
    t.act("p1", inspect(discipline));
    t.act("p1", { type: "GUILD_TAKE", take: face("T10") });
    expect(stepOf(t.state)).toBe("colour_samples");
    return t;
  }

  function reserveFirstLooked(t: LocalTable): void {
    const look = t.state.hidden.pendingLook;
    if (look === null || look.kind !== "colour_samples") throw new Error("the Select is open");
    t.act("p1", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[0] as OrderId }] });
  }

  it("2 inspected Techs behind it: the inspection resumes", () => {
    const t = samplesFirst(3, { glazing_loading: ["T10"] }, { firing: ["T13", "T14"] }, "firing");
    expect(guildDecisionLeftOnResume(t.view("p1"))).toBe(true);
    reserveFirstLooked(t);
    expect(stepOf(t.state)).toBe("guild_inspection");
  });

  it("nothing left to decide: the worker action ends with the Select", () => {
    const t = samplesFirst(3, SHORT_GLAZING.display, SHORT_GLAZING.tops, "glazing_loading", SHORT_GLAZING.seats);
    expect(t.state.phase).toMatchObject({ step: { resume: { inspectedCount: 1 } } });
    expect(guildDecisionLeftOnResume(t.view("p1"))).toBe(false);
    reserveFirstLooked(t);
    expect(stepOf(t.state)).not.toBe("guild_inspection");
  });

  it("agrees with what the take said first; a face-up Tech the Coins can still pay keeps it open", () => {
    const t = guildTable(5, { ...SHORT_GLAZING.display, workshop: ["T01"] }, SHORT_GLAZING.tops, SHORT_GLAZING.seats);
    t.act("p1", inspect("glazing_loading"));
    const said = guildDecisionLeftAfterTake(t.view("p1"), face("T10"));
    expect(said).toBe(true);
    t.act("p1", { type: "GUILD_TAKE", take: face("T10") });
    expect(guildDecisionLeftOnResume(t.view("p1"))).toBe(said);
    reserveFirstLooked(t);
    expect(stepOf(t.state)).toBe("guild_inspection");
  });

  it("an Apprentice's Colour Samples has no inspection behind it; another seat and a spectator get no", () => {
    const apprentice = guildTable(3, { glazing_loading: ["T10"] }, {});
    apprentice.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T10" } });
    expect(stepOf(apprentice.state)).toBe("colour_samples");
    expect(guildDecisionLeftOnResume(apprentice.view("p1"))).toBe(false);

    const t = samplesFirst(3, { glazing_loading: ["T10"] }, { firing: ["T13", "T14"] }, "firing");
    expect(guildDecisionLeftOnResume(t.view("p2"))).toBe(false);
    expect(guildDecisionLeftOnResume(t.view(null))).toBe(false);
  });

  it("any other step answers no", () => {
    const t = new LocalTable(buildState({ players: [{ hand: ["O01"], techs: ["T10"] }, {}] }));
    expect(guildDecisionLeftOnResume(t.view("p1"))).toBe(false);
    t.act("p1", { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "O01" });
    expect(stepOf(t.state)).toBe("colour_samples_swap");
    expect(guildDecisionLeftOnResume(t.view("p1"))).toBe(false);
  });
});

// ── Against the engine, in random legal games ─────────────────────────────────────────

interface Tally {
  takesGoingOn: number;
  takesClosing: number;
  resumesGoingOn: number;
  resumesClosing: number;
  playedResumes: number;
}

/** A Select's command from a state the table is not playing, from its own stream. */
function resolveSelect(state: GameState, actorId: PlayerId, chooser: SeededRandom, privateState: LocalTable["privateState"]): GameState {
  const command = sampleLegalAction(viewOf(state, actorId, privateState), chooser);
  expect(command.type).toBe("SELECT_CHOOSE");
  const result = applyAction(state, actorId, command, new SeededRandom(1), { checkInvariants: true });
  if (!result.ok) throw new Error(`SELECT_CHOOSE rejected: ${result.error.code}`);
  return result.state;
}

/** Every legal take of this inspection, each tried on the side: the answer, then the engine. */
function checkEveryTake(table: LocalTable, actorId: PlayerId, chooser: SeededRandom, tally: Tally): void {
  const view = table.view(actorId);
  const options = guildInspectionOptions(view);
  if (options === null) throw new Error("the actor's inspection is open");
  const everyOption = [...options.inspected, ...options.faceUp];
  for (const viewerId of [...table.state.playerOrder.filter((id) => id !== actorId), null]) {
    const other = table.view(viewerId);
    for (const option of everyOption) expect(guildDecisionLeftAfterTake(other, { kind: option.source, techId: option.techId })).toBe(false);
  }
  for (const option of everyOption) {
    if (!option.legal) continue;
    const take: GuildTake = { kind: option.source, techId: option.techId };
    const answer = guildDecisionLeftAfterTake(view, take);
    const label = `${take.kind} ${take.techId}, round ${table.state.round}, takes before ${options.takes.length}`;
    const result = applyAction(table.state, actorId, { type: "GUILD_TAKE", take }, new SeededRandom(1), { checkInvariants: true });
    if (!result.ok) throw new Error(`GUILD_TAKE rejected: ${result.error.code}`);
    let after = result.state;
    if (stepOf(after) === "colour_samples") {
      expect(guildDecisionLeftOnResume(viewOf(after, actorId, table.privateState)), `${label}: the Select's answer`).toBe(answer);
      after = resolveSelect(after, actorId, chooser, table.privateState);
      if (answer) tally.resumesGoingOn += 1;
      else tally.resumesClosing += 1;
    }
    if (answer) tally.takesGoingOn += 1;
    else tally.takesClosing += 1;
    expect(stepOf(after) === "guild_inspection", label).toBe(answer);
  }
}

function playGame(players: 2 | 3 | 4, seed: number, tally: Tally): void {
  const table = LocalTable.newGame(seed, players);
  const chooser = new SeededRandom(seed * 31 + 7);
  const disciplines: TechDiscipline[] = ["workshop", "glazing_loading", "firing"];
  for (let moves = 0; table.state.phase.type !== "finished"; moves += 1) {
    expect(moves, "the game ends").toBeLessThan(6_000);
    const phase = table.state.phase;
    if (phase.type === "firing_contributions") {
      for (const actor of table.prompt().actorIds) table.contribute(actor, "TEND");
      continue;
    }
    const actorId = table.prompt().actorIds[0];
    if (actorId === undefined) throw new Error(`nobody acts in ${phase.type}`);
    const view = table.view(actorId);
    const step = phase.type === "work_turn" ? phase.step : null;
    if (step?.kind === "guild_inspection") checkEveryTake(table, actorId, chooser, tally);
    // The Shifu inspects often, so that the games reach many inspections.
    const discipline = disciplines[chooser.nextInt(disciplines.length)] as TechDiscipline;
    const inspection: GameAction = { type: "PLACE_GUILD_HALL", workerId: `${actorId}:shifu`, choice: { kind: "inspect", discipline } };
    const wantInspection = step?.kind === "before_action" && chooser.nextInt(2) === 0 && validateAction(table.actorView(actorId), inspection) === null;
    const command = wantInspection ? inspection : sampleLegalAction(view, chooser);
    const resumes = command.type === "SELECT_CHOOSE" && step?.kind === "colour_samples" && step.resume !== null;
    const resumeAnswer = guildDecisionLeftOnResume(view);
    const mayOpen = command.type === "SELECT_CHOOSE" ? afterActionMayOpen(view, { order: true }) : command.type === "GUILD_FINISH" ? afterActionMayOpen(view) : true;
    table.act(actorId, command);
    if (resumes) {
      tally.playedResumes += 1;
      expect(stepOf(table.state) === "guild_inspection", "the played Select's answer").toBe(resumeAnswer);
    } else {
      expect(resumeAnswer, "no Select with an inspection behind it").toBe(false);
    }
    // "Certainly will not open" is a promise, whichever way the action ends.
    if (!mayOpen && table.state.phase.type === "work_turn" && table.state.phase.activePlayerId === actorId) {
      expect(stepOf(table.state), command.type).not.toBe("after_action");
    }
  }
}

describe("the Guild selectors say what the engine then does (random legal games)", () => {
  it.each([2, 3, 4] as const)(
    "%i players: every legal take at every inspection",
    (players) => {
      const tally: Tally = { takesGoingOn: 0, takesClosing: 0, resumesGoingOn: 0, resumesClosing: 0, playedResumes: 0 };
      for (let game = 0; game < GAMES; game += 1) playGame(players, 12_000 + players * 100 + game, tally);
      if (process.env["KILN_END_TURN_SELECTOR_LOG"] !== undefined) console.info(players, tally);
      // The check saw what it is for: takes both ways, and Selects with an inspection behind them.
      expect(tally.takesGoingOn).toBeGreaterThan(0);
      expect(tally.takesClosing).toBeGreaterThan(0);
      expect(tally.resumesGoingOn + tally.resumesClosing).toBeGreaterThan(0);
    },
    600_000,
  );
});
