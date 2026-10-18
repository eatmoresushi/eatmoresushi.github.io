/**
 * `LocalTable` (DESIGN §8.1): an in-memory table holding the authoritative state, the
 * `PrivateFiringState` and the RNG, driving the engine exactly as the service does.
 *
 * - `{ flow: "full" }` (default) uses the production flow.
 * - `{ flow: "halt" }` uses `haltingFlow`: a Phase 2 resolver test stops at the first
 *   cross-package hand-over (recorded in `halts`) instead of reaching another package's stub.
 *   `pass` lets chosen hand-overs run the production wiring.
 * - Every command runs with `checkInvariants: true`.
 * - `commandMarks` records, per accepted command, where its events start in `events`, its
 *   revision and its actor, so UI fixtures can number a scenario's log like the service.
 *
 * No `vitest` import: the UI fixture generator (`tools/uiFixtures.ts`, run by `vite-node`)
 * builds the phase scenarios on this table outside the test runner. `expectRuleError` asserts
 * with `node:assert`, which fails a test the same way.
 */

import { deepStrictEqual, equal, fail } from "node:assert/strict";
import { applyAction, submitContribution } from "../../../../src/game/engine.ts";
import { SeededRandom } from "../../../../src/game/rng.ts";
import { decisionPrompt, player } from "../../../../src/game/state.ts";
import { actorViewOf, viewOf } from "../../../../src/game/view.ts";
import type {
  ActorView,
  ApplyResult,
  ContributionCardId,
  DecisionPrompt,
  FlowController,
  GameAction,
  GameEvent,
  GameRuleError,
  GameRuleErrorCode,
  GameState,
  PlayerId,
  PlayerState,
  PlayerView,
  PrivateFiringState,
  RandomSource,
  SubmitContributionResult,
} from "../../../../src/game/types.ts";
import { newGame, type NewGameOptions } from "./fixtures.ts";
import { type FlowHalt, type HaltPoint, haltingFlow } from "./flow.ts";

export interface LocalTableOptions {
  flow?: "full" | "halt";
  /** With `flow: "halt"`: hand-overs that run the production wiring instead. */
  pass?: readonly HaltPoint[];
  /** Default `new SeededRandom(seed ?? 1)`. */
  rng?: RandomSource;
  seed?: number;
  privateState?: PrivateFiringState;
}

export class LocalTable {
  state: GameState;
  privateState: PrivateFiringState;
  readonly rng: RandomSource;
  readonly halts: FlowHalt[] = [];
  /** Every event of every accepted command, in order. */
  readonly events: GameEvent[] = [];
  /** One entry per accepted command: the index of its first event in `events`, the revision
   * it committed and its actor. Events pushed before any mark (setup, `openFiringTable`) have
   * none. */
  readonly commandMarks: Array<{ firstEventIndex: number; revision: number; actorId: PlayerId }> = [];
  private readonly flow: FlowController | undefined;

  constructor(state: GameState, options: LocalTableOptions = {}) {
    this.state = state;
    this.rng = options.rng ?? new SeededRandom(options.seed ?? 1);
    this.flow = options.flow === "halt" ? haltingFlow(this.halts, { pass: options.pass ?? [] }) : undefined;
    this.privateState = options.privateState ?? { gameId: state.gameId, windowId: null, submissions: {} };
    this.syncPrivateWindow();
  }

  /** `newGame(seed, n)` on a table (needs P2's setup). The table continues the game's RNG;
   * with `flow: "halt"` the Kiln selection already halts at `setup_done`. */
  static newGame(
    seed: number,
    playerCount: 2 | 3 | 4,
    options: Omit<LocalTableOptions, "rng" | "seed"> & Omit<NewGameOptions, "flow"> = {},
  ): LocalTable {
    const halts: FlowHalt[] = [];
    const flow = options.flow === "halt" ? haltingFlow(halts, { pass: options.pass ?? [] }) : undefined;
    const game = newGame(seed, playerCount, {
      ...(options.kilns === undefined ? {} : { kilns: options.kilns }),
      ...(flow === undefined ? {} : { flow }),
    });
    const table = new LocalTable(game.state, { ...options, rng: game.rng });
    table.halts.push(...halts);
    table.events.push(...game.events);
    return table;
  }

  private engineOptions(): { checkInvariants: true; flow?: FlowController } {
    return this.flow === undefined ? { checkInvariants: true } : { checkInvariants: true, flow: this.flow };
  }

  /** Opens a fresh private window when the state has opened a new Contribution window. */
  private syncPrivateWindow(): void {
    const phase = this.state.phase;
    if (phase.type === "firing_contributions" && this.privateState.windowId !== phase.windowId) {
      this.privateState = { gameId: this.state.gameId, windowId: phase.windowId, submissions: {} };
    }
  }

  tryAct(actorId: PlayerId, action: GameAction): ApplyResult {
    const result = applyAction(this.state, actorId, action, this.rng, this.engineOptions());
    if (result.ok) {
      this.state = result.state;
      this.commandMarks.push({ firstEventIndex: this.events.length, revision: result.state.revision, actorId });
      this.events.push(...result.events);
      this.syncPrivateWindow();
    }
    return result;
  }

  /** Applies a command that must succeed; returns its events. */
  act(actorId: PlayerId, action: GameAction): GameEvent[] {
    const result = this.tryAct(actorId, action);
    if (!result.ok) {
      throw new Error(`${actorId} ${action.type} rejected: ${result.error.code} — ${result.error.message}`);
    }
    return result.events;
  }

  tryContribute(actorId: PlayerId, card: ContributionCardId): SubmitContributionResult {
    const windowId = this.state.phase.type === "firing_contributions" ? this.state.phase.windowId : "no-window";
    const result = submitContribution(
      this.state,
      this.privateState,
      actorId,
      { type: "SUBMIT_CONTRIBUTION", windowId, card },
      this.rng,
      this.engineOptions(),
    );
    if (result.ok) {
      this.state = result.state;
      this.privateState = result.privateState;
      this.commandMarks.push({ firstEventIndex: this.events.length, revision: result.state.revision, actorId });
      this.events.push(...result.events);
      this.syncPrivateWindow();
    }
    return result;
  }

  /** Submits a Contribution that must be accepted; returns its events. */
  contribute(actorId: PlayerId, card: ContributionCardId): GameEvent[] {
    const result = this.tryContribute(actorId, card);
    if (!result.ok) {
      throw new Error(`${actorId} SUBMIT_CONTRIBUTION rejected: ${result.error.code} — ${result.error.message}`);
    }
    return result.events;
  }

  /** Asserts the command fails (with `code`, when given) and leaves the state untouched. */
  expectRuleError(actorId: PlayerId, action: GameAction, code?: GameRuleErrorCode): GameRuleError {
    const before = structuredClone(this.state);
    const result = this.tryAct(actorId, action);
    if (result.ok) {
      fail(`${action.type} should be rejected`);
    }
    if (code !== undefined) {
      equal(result.error.code, code, `${action.type} rejected with ${result.error.code}, expected ${code}`);
    }
    deepStrictEqual(this.state, before, `${action.type} was rejected but changed the state`);
    return result.error;
  }

  view(viewerId: PlayerId | null): PlayerView {
    return viewOf(this.state, viewerId, this.privateState);
  }

  actorView(actorId: PlayerId): ActorView {
    return actorViewOf(this.state, actorId, this.privateState);
  }

  player(playerId: PlayerId): PlayerState {
    return player(this.state, playerId);
  }

  prompt(): DecisionPrompt {
    return decisionPrompt(this.state);
  }
}
