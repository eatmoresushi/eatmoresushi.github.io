/**
 * What a computer seat may know (DESIGN §4.5, §4.6): exactly the `PlayerView` a human in the
 * same seat would receive — the public projection plus its own hand, private look, Test
 * Pieces peek and sealed Contribution (from `privateFiring`, rebuilt from the store). It is
 * `viewOf` for a seated viewer, typed as the `ActorView` the policy and the validators take.
 *
 * The policy never receives `GameState`: deck orders, other seats' hands, other seats' looks
 * and peeks, and unrevealed Contributions cannot reach it, so no choice can depend on them
 * (`computer_hidden_independence.test.ts`).
 */

import { actorViewOf } from "../game/index.ts";
import type { ActorView, GameState, PlayerId, PlayerView, PrivateFiringState } from "../game/index.ts";

export function createComputerObservation(
  state: GameState,
  playerId: PlayerId,
  privateFiring: PrivateFiringState | null = null,
): ActorView {
  return actorViewOf(state, playerId, privateFiring);
}

/** True when `observation` carries nothing beyond a `PlayerView` (no server-only state). */
export function isPlayerViewOnly(observation: PlayerView): boolean {
  return !Object.hasOwn(observation, "hidden") && !Object.hasOwn(observation.game, "hidden");
}
