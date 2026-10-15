/**
 * The computer-player plug-in point of the authoritative service (DESIGN §3.4, §4.6).
 *
 * A policy sees only an `ActorView` (its own seat's public + private view) and proposes
 * one command for that seat. The service owns everything else:
 * - routing: it asks a computer seat only when `decisionPrompt(state).actorIds` contains
 *   it, in every decision mode (`single`, `parallel`, `simultaneous_secret`);
 * - legality: it shape-checks the proposal with `parseCommand` and applies it through the
 *   engine; an illegal, missing or throwing proposal falls back to
 *   `fallbackComputerCommands(view)`;
 * - privacy: a policy exception is logged server-side only and never forwarded, because
 *   its message may name the seat's hand or private look (DESIGN §4.5).
 *
 * The service's default policy is the strategic V1.6.1 policy (`STRATEGIC_COMPUTER_POLICY`
 * in `computerPlayer.ts`, package P9); `AuthoritativeGameServiceOptions.computerPolicy`
 * replaces it. `CANONICAL_COMPUTER_POLICY` below — a seeded choice among the canonical legal
 * commands — is no longer the default: the service keeps it registered as an additional
 * policy (`additionalComputerPolicies`) so seats stamped with its version still resolve, and
 * tests use it as a simple baseline.
 */

import { SeededRandom } from "../game/index.ts";
import type { ActorView, AuthoritativeCommand, PlayerId } from "../game/index.ts";
import { fallbackComputerCommands } from "./computerFallback.ts";
import type { ComputerPolicyVersion } from "./types.ts";

/** The seat facts a policy may use. `aiSeed` is private to the server and the policy. */
export interface ComputerSeatContext {
  playerId: PlayerId;
  displayName: string;
  aiSeed: number | null;
  aiPolicyVersion: string | null;
}

export interface ComputerPolicy {
  /** Stamped on new computer seats; must match `rules-v1.6.1-<name>-<nnn>`. */
  readonly version: ComputerPolicyVersion;
  /** A short player-facing name, e.g. "V1.6.1 Strategic". */
  readonly label: string;
  /**
   * Proposes one command for `view.viewerId`, which is always one of
   * `decisionPrompt(view.game).actorIds`. Returning null defers to the fallback. Throwing
   * is allowed: the service logs the cause and falls back.
   */
  chooseCommand(
    view: ActorView,
    seat: ComputerSeatContext,
  ): AuthoritativeCommand | null | Promise<AuthoritativeCommand | null>;
}

export const CANONICAL_COMPUTER_POLICY_VERSION = "rules-v1.6.1-canonical-001" satisfies ComputerPolicyVersion;

/** A deterministic per-decision seed: the same seat, seed and revision choose the same. */
function decisionSeed(view: ActorView, seat: ComputerSeatContext): number {
  let hash = (seat.aiSeed ?? 0) >>> 0;
  const text = `${view.game.gameId}|${view.game.revision}|${seat.playerId}`;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * The canonical baseline policy (not the service default): a seeded uniform choice among
 * `fallbackComputerCommands(view)`.
 * It never reads anything outside its view, so it cannot leak or depend on hidden state.
 */
export const CANONICAL_COMPUTER_POLICY: ComputerPolicy = {
  version: CANONICAL_COMPUTER_POLICY_VERSION,
  label: "V1.6.1 Canonical",
  chooseCommand(view, seat) {
    const candidates = fallbackComputerCommands(view);
    if (candidates.length === 0) return null;
    const rng = new SeededRandom(decisionSeed(view, seat));
    return candidates[rng.nextInt(candidates.length)] ?? null;
  },
};

/** Player-facing name of a seat's stored policy label. */
export function computerPolicyLabel(policyVersion: string | null, policies: readonly ComputerPolicy[] = [CANONICAL_COMPUTER_POLICY]): string {
  const known = policies.find((policy) => policy.version === policyVersion);
  if (known !== undefined) return known.label;
  return policyVersion === null ? "Computer" : `Computer (${policyVersion})`;
}
