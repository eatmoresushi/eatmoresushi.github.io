/**
 * The split Confirm against the engine (owner UI decision D21; `windows.work.ts`, `decision/endTurn.ts`,
 * and the selectors they read, `afterActionMayOpen` and `guildDecisionLeftAfterTake`, tested on their
 * own in `test/v161/engine/end_turn_selectors.test.ts`).
 *
 * The buttons promise what the next screen does, so random legal games check each promise on the
 * command the UI would send, against what the engine then does with it:
 * - a split means the worker action ends with this command ("· end turn" is true);
 * - a plain Confirm on a worker-action command means the action goes on (the choice waits for its
 *   last step, and the turn never costs an End turn press the split could have saved);
 * - no second button means the after-action step does not open ("then free actions" would have
 *   offered nothing), while a second button that turns out to offer nothing is only ever the safe
 *   side, counted here to stay rare.
 * `KILN_UI_SPLIT_GAMES` plays more games per player count.
 */
import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS, SeededRandom, endTurnOptions, sampleLegalAction, validateAction } from "../../../../src/game/index.ts";
import type { AuthoritativeCommand, EndTurnCommandType, GameAction, OrderId, PlayerCount, PlayerView } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { buildGameModel, engineViewOf } from "../../../../src/app/state/model.ts";
import { buildState } from "../../engine/support/fixtures.ts";
import { LocalTable } from "../../engine/support/localTable.ts";

const GAMES = Math.max(1, Number(process.env["KILN_UI_SPLIT_GAMES"] ?? "12"));

const WORKER_ACTION_TYPES: ReadonlySet<string> = new Set([
  "PLACE_MATERIALS_YARD",
  "PLACE_FORM_DECORATE",
  "PLACE_GLAZE_LOAD",
  "PLACE_COMMISSION_MARKET",
  "PLACE_GUILD_HALL",
  "PLACE_CANAL_WHARF",
  "PLACE_MAGISTRATES_HALL",
  "SELECT_CHOOSE",
  "GUILD_TAKE",
  "GUILD_FINISH",
] satisfies EndTurnCommandType[]);

interface Tally {
  split: number;
  plain: number;
  noStay: number;
  /** Second buttons that offered nothing: the safe side. */
  stayWithoutStep: number;
  byType: Map<string, number>;
}

function playGame(players: PlayerCount, seed: number, tally: Tally): void {
  const table = LocalTable.newGame(seed, players as 2 | 3 | 4);
  const chooser = new SeededRandom(seed * 31 + 7);
  for (let moves = 0; table.state.phase.type !== "finished"; moves += 1) {
    expect(moves, "the game ends").toBeLessThan(6_000);
    const phase = table.state.phase;
    if (phase.type === "firing_contributions") {
      // Contributions are not the point here: everyone tends the kiln (the card that costs nothing).
      for (const actor of table.prompt().actorIds) table.contribute(actor, "TEND");
      continue;
    }
    const actorId = table.prompt().actorIds[0];
    if (actorId === undefined) throw new Error(`nobody acts in ${phase.type}`);
    const view = table.actorView(actorId) as unknown as PlayerView;
    const command = sampleLegalAction(view, chooser) as GameAction;
    const stage = endTurnOptions(view)?.stage;
    const watched = WORKER_ACTION_TYPES.has(command.type) && (stage === "before_action" || stage === "worker_action");
    const expected = (() => {
      if (!watched) return null;
      const model = buildGameModel(view, []);
      const engine = engineViewOf(view);
      const spec = WINDOWS[model.window.kind];
      const draft = spec.draft.fromCommand(command as AuthoritativeCommand, model, engine);
      if (draft === null) return null;
      return { split: spec.confirmSplit?.(draft as never, model, engine) ?? null, turn: phase.type === "work_turn" ? phase.activePlayerId : null };
    })();
    const accepted = validateAction(table.actorView(actorId), command);
    expect(accepted, command.type).toBeNull();
    table.act(actorId, command);
    if (expected === null) continue;
    const after = table.state.phase;
    const sameTurn = after.type === "work_turn" && after.activePlayerId === expected.turn;
    const going = sameTurn && after.step.kind !== "before_action" && after.step.kind !== "after_action";
    const label = `${command.type} (game seed ${seed}, round ${table.state.round})`;
    tally.byType.set(command.type, (tally.byType.get(command.type) ?? 0) + 1);
    if (expected.split === null) {
      tally.plain += 1;
      expect(going, `${label}: a plain Confirm, so the action goes on`).toBe(true);
    } else {
      tally.split += 1;
      expect(going, `${label}: the split says the action ends here`).toBe(false);
      const stepOpened = sameTurn && after.step.kind === "after_action";
      if (expected.split.stay === null) {
        tally.noStay += 1;
        expect(stepOpened, `${label}: no second button, so the after-action step does not open`).toBe(false);
      } else if (!stepOpened) {
        tally.stayWithoutStep += 1;
      }
    }
  }
}

describe("the split Confirm says what the engine then does (D21)", () => {
  it.each([2, 3, 4] as const)("%i players: random legal games", (players) => {
    const tally: Tally = { split: 0, plain: 0, noStay: 0, stayWithoutStep: 0, byType: new Map() };
    for (let game = 0; game < GAMES; game += 1) playGame(players, 9_000 + players * 100 + game, tally);
    // The check saw what it is for: each kind of Confirm, and the Guild Hall's takes among them.
    expect(tally.split).toBeGreaterThan(0);
    expect(tally.plain).toBeGreaterThan(0);
    expect(tally.noStay).toBeGreaterThan(0);
    expect(tally.byType.get("GUILD_TAKE") ?? 0).toBeGreaterThan(0);
    expect(tally.byType.get("SELECT_CHOOSE") ?? 0).toBeGreaterThan(0);
    if (process.env["KILN_UI_SPLIT_LOG"] !== undefined) console.info(players, tally);
    // A second button that offers nothing is the safe side, and stays the exception (1 of about
    // 6,000 such buttons when this was written): one in 50 would mean the selector `afterActionMayOpen`
    // has drifted from R27's facts, or `placementBrings` from what a placement does. Most second buttons
    // do open the step.
    const stays = tally.split - tally.noStay;
    expect(stays - tally.stayWithoutStep).toBeGreaterThan(0);
    expect(tally.stayWithoutStep).toBeLessThanOrEqual(Math.ceil(stays / 50));
  }, 600_000);

  // Random games do not reach this: all their Colour Samples takes opened a Select.
  it("a Colour Samples take with no Select to open (B1): the swap it brings opens the step, if an Order is held", () => {
    const take = (hand: OrderId[]) => {
      const table = new LocalTable(
        buildState({
          players: [{ hand, resources: { coins: 3 } }, { hand: MAIN_ORDER_IDS.filter((id) => !hand.includes(id)) }],
          display: [null, null, null, null, null, null],
          mainDeck: [],
          mainDiscard: [],
          techDecks: { glazing_loading: ["T10", "T20", "T15", "T21"] },
          techDisplay: { glazing_loading: ["T22", "T23"] },
        }),
      );
      table.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "glazing_loading" } });
      const command: GameAction = { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T10" } };
      const view = table.actorView("p1") as unknown as PlayerView;
      const model = buildGameModel(view, []);
      const engine = engineViewOf(view);
      const spec = WINDOWS[model.window.kind];
      const draft = spec.draft.fromCommand(command as AuthoritativeCommand, model, engine);
      if (draft === null) throw new Error("the take does not express");
      const split = spec.confirmSplit?.(draft as never, model, engine) ?? null;
      table.act("p1", command);
      return { split, phase: table.state.phase };
    };

    const held = take(["O01"]);
    expect(held.split?.end).toMatchObject({ key: "common.confirm.takeEnd" });
    expect(held.split?.stay).toMatchObject({ key: "common.confirm.takeStay" });
    expect(held.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });

    const empty = take([]);
    expect(empty.split?.end).toMatchObject({ key: "common.confirm.takeEnd" });
    expect(empty.split?.stay).toBeNull();
    expect(empty.phase).toMatchObject({ activePlayerId: "p2" });
  });
});
