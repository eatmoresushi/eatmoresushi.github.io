/**
 * The computer seat's safety net (DESIGN §3.6, §4.6): when the policy throws, times out,
 * declines or proposes an illegal command, the service tries these candidates in order and
 * commits the first the engine accepts.
 *
 * 1. `legalCommands(view, {mode: "canonical"})`: built from the same validators the server
 *    runs. In `firing_contributions` it is `legalContributions(view)` with TEND first, which
 *    is always affordable (L261).
 * 2. `safeExitCommands(view)`: the progress-guarantee exit of every decision (DESIGN §3.6),
 *    built from the view alone without the enumerator, so the seat still has a way forward
 *    even if enumeration itself fails. Each one is validated by the service like any other
 *    candidate, but each must also be legal whenever it is offered: the canonical baseline
 *    policy samples its proposal from this whole list, so an illegal exit would become a
 *    rejected proposal (`computer_legality.test.ts`).
 *
 * Everything here reads only the seat's `PlayerView` (public projection plus its own private
 * data), never `GameState`.
 */

import { KILN_IDS, guildInspectionOptions, handLimitStatus, legalCommands, lookedOrderOptions } from "../game/index.ts";
import type { AuthoritativeCommand, LegalActionOptions, PlayerView } from "../game/index.ts";

export const FALLBACK_LEGAL_ACTION_OPTIONS: LegalActionOptions = { mode: "canonical", perFamilyLimit: 8 };

/**
 * The always-available way out of the viewer's current decision (DESIGN §3.6), in preference
 * order. Empty when the viewer has nothing to decide.
 */
export function safeExitCommands(view: PlayerView): AuthoritativeCommand[] {
  const viewerId = view.viewerId;
  const game = view.game;
  const me = viewerId === null ? undefined : game.players[viewerId];
  if (viewerId === null || me === undefined || view.own === null) return [];
  const phase = game.phase;
  switch (phase.type) {
    case "setup_kiln_selection": {
      // Setup step 9 (rev. 4 L122, R23): an available Kiln with the first face-up Main Order.
      // The display is refilled after every take, so it is full at every choice.
      const taken = new Set(game.playerOrder.map((playerId) => game.players[playerId]?.kilnId ?? null));
      const slotIndex = game.market.display.findIndex((orderId) => orderId !== null);
      const orderId = slotIndex < 0 ? null : game.market.display[slotIndex];
      if (orderId === null || orderId === undefined) return [];
      return KILN_IDS.filter((kilnId) => !taken.has(kilnId)).map((kilnId): AuthoritativeCommand => ({
        type: "SELECT_KILN",
        kilnId,
        mainOrder: { slotIndex, orderId },
      }));
    }
    case "round_start_setters_mark":
      return [{ type: "PLACE_SETTERS_MARK", spaceId: null }];
    case "work_turn": {
      const step = phase.step;
      switch (step.kind) {
        case "before_action":
          // The Canal Wharf is uncapped and costs nothing (L143): always legal for an
          // available worker. Workers in ID order (never Record key order).
          return Object.keys(me.workers)
            .sort()
            .filter((workerId) => me.workers[workerId]?.placement === null)
            .map((workerId): AuthoritativeCommand => ({ type: "PLACE_CANAL_WHARF", workerId }));
        case "after_action":
          return [{ type: "END_TURN" }];
        case "commission_market":
        case "colour_samples":
        case "colour_samples_swap": {
          // Every Select (v1.6.2 L64, change 25): one reservation is always possible and always
          // enough (B1: a Select opens only with a looked card or a face-up Main Order). Every
          // single pick, the face-up positions first, then the looked cards in look order.
          const options = lookedOrderOptions(view);
          if (options === null || options.kind !== step.kind) return [];
          const faceUp = options.faceUpSlots.flatMap((slotIndex): AuthoritativeCommand[] => {
            const orderId = game.market.display[slotIndex];
            return orderId === null || orderId === undefined
              ? []
              : [{ type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex, orderId }] }];
          });
          const looked = options.orderIds.map((orderId): AuthoritativeCommand => ({
            type: "SELECT_CHOOSE",
            reservations: [{ kind: "looked", orderId }],
          }));
          return [...faceUp, ...looked];
        }
        case "guild_inspection": {
          // Placement legality guaranteed an affordable face-up Tech for the first take (v1.6.2
          // L212); after a take, stopping is always legal, with the untaken inspected Techs in
          // look order (v1.6.2 L207, B2).
          const options = guildInspectionOptions(view);
          if (options === null) return [];
          if (options.canFinish) {
            return [{ type: "GUILD_FINISH", bottomOrder: options.inspected.map((option) => option.techId) }];
          }
          return [...options.inspected, ...options.faceUp]
            .filter((option) => option.legal)
            .map((option): AuthoritativeCommand => ({ type: "GUILD_TAKE", take: { kind: option.source, techId: option.techId } }));
        }
      }
      return [];
    }
    case "firing_contributions":
      return [{ type: "SUBMIT_CONTRIBUTION", windowId: phase.windowId, card: "TEND" }];
    case "firing_test_pieces":
      return phase.awaiting === "decision" ? [{ type: "TEST_PIECES_DECIDE", peek: false }] : [{ type: "TEST_PIECES_BURY", bury: false }];
    case "firing_heat_adjustment":
      return [{ type: "RESOLVE_JUN", adjustment: null }];
    case "firing_second_firing_choice":
      // A card must be chosen (v1.6.2 L631); the first one without Jun is always legal.
      return [{ type: "SECOND_FIRING_CHOOSE", cardIndex: 0, jun: null }];
    case "firing_after_quality":
      return [{ type: "END_AFTER_QUALITY" }];
    case "orders":
      return [{ type: "END_ORDER_TURN" }];
    case "cleanup_hand_limit": {
      const excess = handLimitStatus(view, viewerId).mustDiscard;
      const hand = view.own.orderHand;
      return excess > 0 && excess <= hand.length ? [{ type: "DISCARD_TO_HAND_LIMIT", orderIds: hand.slice(hand.length - excess) }] : [];
    }
    case "finished":
      return [];
  }
}

/**
 * The fallback candidates: the canonical legal commands, then the safe exits, without
 * duplicates. If the enumerator fails, the safe exits alone are returned (the service still
 * validates every candidate before committing it).
 */
export function fallbackComputerCommands(view: PlayerView): AuthoritativeCommand[] {
  let canonical: AuthoritativeCommand[] = [];
  try {
    canonical = legalCommands(view, FALLBACK_LEGAL_ACTION_OPTIONS);
  } catch {
    canonical = [];
  }
  const seen = new Set<string>();
  const candidates: AuthoritativeCommand[] = [];
  for (const command of [...canonical, ...safeExitCommands(view)]) {
    const key = JSON.stringify(command);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(command);
  }
  return candidates;
}

export interface ComputerCandidateFailure {
  command: unknown;
  code: string;
  message: string;
}

export interface ComputerCandidateSelection<T> {
  command: AuthoritativeCommand;
  result: T;
  usedFallback: boolean;
  rejected: ComputerCandidateFailure[];
}

export type CandidateCheck<T> = (command: unknown) => { ok: true; command: AuthoritativeCommand; result: T } | { ok: false; code: string; message: string };

/**
 * Tries the policy's choice, then each fallback, and returns the first one `check`
 * accepts. Identical candidates are tried once. `fallbacks` is evaluated lazily, only
 * when the policy's choice is missing or rejected.
 */
export function selectFirstLegalComputerCommand<T>(
  preferred: unknown,
  fallbacks: () => readonly unknown[],
  check: CandidateCheck<T>,
): ComputerCandidateSelection<T> | null {
  const tried = new Set<string>();
  const rejected: ComputerCandidateFailure[] = [];
  const attempt = (candidate: unknown): ComputerCandidateSelection<T> | null => {
    const key = JSON.stringify(candidate) ?? "undefined";
    if (tried.has(key)) return null;
    tried.add(key);
    const outcome = check(candidate);
    if (outcome.ok) {
      return { command: outcome.command, result: outcome.result, usedFallback: rejected.length > 0 || preferred === null, rejected };
    }
    rejected.push({ command: candidate, code: outcome.code, message: outcome.message });
    return null;
  };
  if (preferred !== null && preferred !== undefined) {
    const chosen = attempt(preferred);
    if (chosen !== null) return chosen;
  }
  for (const candidate of fallbacks()) {
    const chosen = attempt(candidate);
    if (chosen !== null) return { ...chosen, usedFallback: true };
  }
  return null;
}
