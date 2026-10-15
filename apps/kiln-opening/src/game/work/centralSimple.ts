/**
 * Canal Wharf (L216–221) and Magistrate's Hall (L223–233).
 *
 * - **Canal Wharf:** gain 2 Coins (Apprentice) or 4 Coins (Shifu). Uncapped and costless, so
 *   it is always a legal placement for an available worker (L143, the Work Phase's progress
 *   guarantee, DESIGN §3.6).
 * - **Magistrate's Hall:** 1 space at 2–3 players, 2 at 4 (L225; capacity is the shared
 *   placement check). Pay 4 Coins (Apprentice) or 3 Coins (Shifu) to advance Imperial
 *   Recognition by 1 step, only from Recognition 0, 1 or 2, so never to 4 (L232–233). No Crown
 *   requirement; the milestone reached resolves normally (`recognition.advanceRecognitionStep`,
 *   P6). Senior Apprentice never applies here (R12; enforced by `validatePlacement`).
 *
 * Layer 4. Hands over through `ctx.flow.workerActionDone` (DESIGN §2.2).
 */

import { IMPERIAL_TRACK, LOCATIONS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { advanceRecognitionStep, magistratesHallOpen } from "../recognition.ts";
import { gain, player, spend } from "../state.ts";
import type {
  ActionHandlerTable,
  ActorView,
  GameAction,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerState,
  ResolveContext,
  WorkerEffect,
} from "../types.ts";

type CanalWharfAction = Extract<GameAction, { type: "PLACE_CANAL_WHARF" }>;
type MagistratesHallAction = Extract<GameAction, { type: "PLACE_MAGISTRATES_HALL" }>;

// ── Canal Wharf ──────────────────────────────────────────────────────────────────────

function validateCanalWharf(view: ActorView, action: CanalWharfAction): GameRuleError | null {
  return validatePlacement(view, action.workerId, "canal_wharf", false);
}

function resolveCanalWharf(draft: GameState, playerId: PlayerId, action: CanalWharfAction, ctx: ResolveContext): void {
  const placement = placeWorker(draft, playerId, action.workerId, "canal_wharf", false, ctx);
  gain(draft, playerId, { coins: LOCATIONS.canal_wharf.effects[placement.effect].coins }, "canal_wharf", ctx);
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

// ── Magistrate's Hall ────────────────────────────────────────────────────────────────

/** The top of the Imperial track (Recognition 4, Imperial Audience), which the Magistrate's
 * Hall can never reach (L227, L233). */
function topRecognition(): number {
  return Math.max(...IMPERIAL_TRACK.track.map((space) => space.space));
}

/** Recognition 0–2 only (`magistratesHallOpen`, L225), and the step never reaches 4 (L233). */
function recognitionGateError(p: PlayerState, effect: WorkerEffect): GameRuleError | null {
  const from = p.imperial.recognition;
  const steps = LOCATIONS.magistrates_hall.effects[effect].recognitionSteps;
  if (!magistratesHallOpen(p) || from + steps >= topRecognition()) {
    return ruleError(
      "RECOGNITION_GATE",
      "The Magistrate's Hall is usable only at Recognition 0–2 and never advances you to 4.",
      { recognition: from },
    );
  }
  return null;
}

function validateMagistratesHall(view: ActorView, action: MagistratesHallAction): GameRuleError | null {
  const placementError = validatePlacement(view, action.workerId, "magistrates_hall", false);
  if (placementError !== null) {
    return placementError;
  }
  const p = player(view.game, view.viewerId);
  const effect = workerEffectFor(view, action.workerId, false);
  const gate = recognitionGateError(p, effect);
  if (gate !== null) {
    return gate;
  }
  const cost = LOCATIONS.magistrates_hall.effects[effect].coins;
  if (p.resources.coins < cost) {
    return ruleError("INSUFFICIENT_RESOURCES", `Not enough coins: you need ${cost} and have ${p.resources.coins}.`, {
      resource: "coins",
      needed: cost,
      have: p.resources.coins,
    });
  }
  return null;
}

function resolveMagistratesHall(draft: GameState, playerId: PlayerId, action: MagistratesHallAction, ctx: ResolveContext): void {
  const placement = placeWorker(draft, playerId, action.workerId, "magistrates_hall", false, ctx);
  const effects = LOCATIONS.magistrates_hall.effects[placement.effect];
  invariant(recognitionGateError(player(draft, playerId), placement.effect) === null, "Magistrate's Hall gate must be validated first");
  spend(draft, playerId, { coins: effects.coins }, "magistrates_hall", ctx);
  for (let step = 0; step < effects.recognitionSteps; step += 1) {
    advanceRecognitionStep(draft, playerId, "magistrates_hall", null, ctx);
  }
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_CANAL_WHARF" | "PLACE_MAGISTRATES_HALL"> = {
  PLACE_CANAL_WHARF: {
    phases: ["work_turn"],
    validate: validateCanalWharf,
    resolve: resolveCanalWharf,
  },
  PLACE_MAGISTRATES_HALL: {
    phases: ["work_turn"],
    validate: validateMagistratesHall,
    resolve: resolveMagistratesHall,
  },
};
