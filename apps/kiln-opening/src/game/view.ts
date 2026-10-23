/**
 * Projection and views: the hidden-information boundary (DESIGN §4).
 *
 * Secrets are structurally separate, so projection never edits fields one by one:
 * - `GameState.hidden` holds every server-only secret; the public projection drops it by
 *   destructuring and adds `counts`;
 * - unrevealed Contributions live in `PrivateFiringState`, outside `GameState`;
 * - each event's private payload lives under `secret`, which `projectEvent` removes.
 *
 * Validators, selectors, `legalActions` and the computer player see only `PlayerView` /
 * `ActorView`, so legality can never depend on hidden information.
 *
 * Layer 2.
 */

import { InvariantError } from "./errors.ts";
import { isSeated, player } from "./state.ts";
import type {
  ActorView,
  GameEvent,
  GameState,
  PlayerId,
  PlayerView,
  PrivateFiringState,
  PrivatePlayerView,
  PublicCounts,
  PublicGameEvent,
  PublicGameState,
} from "./types.ts";

/** Public counts of every hidden pile (L201, L507, B3). Never identities. */
export function publicCounts(state: GameState): PublicCounts {
  const hidden = state.hidden;
  const orderHands: Record<PlayerId, number> = {};
  for (const playerId of state.playerOrder) {
    orderHands[playerId] = Object.hasOwn(hidden.orderHands, playerId) ? (hidden.orderHands[playerId]?.length ?? 0) : 0;
  }
  const look = hidden.pendingLook;
  return {
    orderHands,
    mainDeck: hidden.mainDeck.length,
    mainDiscard: hidden.mainDiscard.length,
    techDecks: {
      workshop: hidden.techDecks.workshop.length,
      glazing_loading: hidden.techDecks.glazing_loading.length,
      firing: hidden.techDecks.firing.length,
    },
    fireDeck: hidden.fireDeck.length,
    fireBuried: hidden.fireBuried,
    pendingLook:
      look === null
        ? null
        : {
            playerId: look.playerId,
            kind: look.kind,
            count: look.kind === "guild_inspection" ? look.techIds.length : look.orderIds.length,
          },
  };
}

/**
 * The public projection: everything except `hidden`, plus `counts` (DESIGN §4.3). Safe for
 * `public.game_public_states`, realtime payloads and logs. Never aliases `state`.
 */
export function projectPublicState(state: GameState): PublicGameState {
  // Sealed Contributions never enter `GameState`; the revealed set appears only after the
  // window closes. A non-null set while the window is open is an engine bug.
  if (state.phase.type === "firing_contributions" && state.firing !== null && state.firing.contributions !== null) {
    throw new InvariantError("Contributions are recorded in public state while the Contribution window is open");
  }
  const { hidden: _hidden, ...publicCore } = state;
  return { ...structuredClone(publicCore), counts: publicCounts(state) };
}

/**
 * One seat's private data (DESIGN §4.3). `privateFiring` must be the `PrivateFiringState`
 * rebuilt from the store; passing null during an open Contribution window hides the seat's
 * own sealed choice.
 */
export function projectPrivateView(
  state: GameState,
  playerId: PlayerId,
  privateFiring: PrivateFiringState | null,
): PrivatePlayerView {
  player(state, playerId);
  const hidden = state.hidden;
  const hand = Object.hasOwn(hidden.orderHands, playerId) ? (hidden.orderHands[playerId] ?? []) : [];
  const look = hidden.pendingLook;
  const peek = Object.hasOwn(hidden.firePeeks, playerId) ? (hidden.firePeeks[playerId] ?? null) : null;
  // Only the open Contribution window's sealed card is shown; a stale or misrouted private
  // state (e.g. after the window rolled over) shows nothing.
  const openWindowId = state.phase.type === "firing_contributions" ? state.phase.windowId : null;
  const windowId = privateFiring !== null && privateFiring.windowId === openWindowId ? openWindowId : null;
  const submission =
    privateFiring !== null && windowId !== null && privateFiring.gameId === state.gameId && Object.hasOwn(privateFiring.submissions, playerId)
      ? (privateFiring.submissions[playerId] ?? null)
      : null;
  return {
    playerId,
    orderHand: [...hand],
    pendingLook: look !== null && look.playerId === playerId ? structuredClone(look) : null,
    firePeek: peek === null ? null : { ...peek },
    pendingContribution:
      submission === null || windowId === null
        ? null
        : { card: submission.card, windowId },
  };
}

/**
 * What one viewer may know. A seated viewer gets their private data; a spectator (`null`)
 * or an unseated ID gets `own: null`.
 */
export function viewOf(
  state: GameState,
  viewerId: PlayerId | null,
  privateFiring: PrivateFiringState | null = null,
): PlayerView {
  const seated = viewerId !== null && isSeated(state, viewerId);
  return {
    viewerId,
    game: projectPublicState(state),
    own: seated ? projectPrivateView(state, viewerId, privateFiring) : null,
  };
}

/** The input of every action validator. An unseated actor is an `InvariantError`. */
export function actorViewOf(
  state: GameState,
  actorId: PlayerId,
  privateFiring: PrivateFiringState | null = null,
): ActorView {
  if (!isSeated(state, actorId)) {
    throw new InvariantError(`Cannot build an actor view for unseated player ${actorId}`);
  }
  return {
    viewerId: actorId,
    game: projectPublicState(state),
    own: projectPrivateView(state, actorId, privateFiring),
  };
}

/** The event with any `secret` payload removed; safe for the public log. */
export function projectEvent(event: GameEvent): PublicGameEvent {
  const { secret: _secret, ...rest } = event as GameEvent & { secret?: unknown };
  return structuredClone(rest) as PublicGameEvent;
}

/** The full event for its `secret.visibleTo` seat; the public event for everyone else. */
export function eventForViewer(event: GameEvent, viewerId: PlayerId | null): PublicGameEvent | GameEvent {
  const secret = (event as { secret?: { visibleTo: PlayerId } }).secret;
  if (secret !== undefined && viewerId !== null && secret.visibleTo === viewerId) {
    return structuredClone(event);
  }
  return projectEvent(event);
}
