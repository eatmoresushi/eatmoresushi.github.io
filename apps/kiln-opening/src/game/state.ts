/**
 * Shared state helpers (DESIGN §2.3). Every package uses these instead of writing its own.
 *
 * - Helpers that take a `draft` mutate only that draft. Validators pass views and never
 *   mutate them.
 * - Helpers typed against `PublicCore` accept the authoritative state (resolving) and a
 *   projected view's `game` (validating).
 * - Rule order never comes from `Record` key order (DESIGN §2.3 "Iteration order"):
 *   players are iterated through `playerOrder` / `turnOrder`, ceramics by sequence.
 *
 * Layer 2. Within P0, `state.ts` is the base of layer 2: `techs.ts`, `kilns.ts`,
 * `placement.ts` and `actionGuard.ts` import it; it imports none of them.
 */

import { InvariantError, invariant } from "./errors.ts";
import type {
  CeramicId,
  CeramicStage,
  CeramicState,
  Decoration,
  DecisionPrompt,
  FormedBy,
  GameEvent,
  GamePhase,
  GamePhaseType,
  GameState,
  LoadedCeramic,
  OrderId,
  PendingLook,
  PlayerId,
  PlayerState,
  PublicCore,
  ResolveContext,
  ResourceChangeReason,
  ResourceKind,
  ResourceState,
  Shape,
  ShapedCeramic,
  TechId,
  VesselInstanceId,
  WorkTurnStep,
} from "./types.ts";

/** Clay, Wood, Coins: the fixed order used for resource events and checks. */
export const RESOURCE_KINDS: readonly ResourceKind[] = ["clay", "wood", "coins"];

// ── Lookups ──────────────────────────────────────────────────────────────────────────

/**
 * Own-property lookup in a state `Record`. Never returns an inherited member, so an
 * untrusted key such as `"__proto__"` or `"constructor"` reads as missing.
 */
export function lookup<V>(record: { readonly [key: string]: V }, key: string): V | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function isSeated(game: PublicCore, playerId: PlayerId): boolean {
  return lookup(game.players, playerId) !== undefined;
}

/** The seated player; an unknown ID is an engine bug (`InvariantError`). */
export function player(game: PublicCore, playerId: PlayerId): PlayerState {
  const found = lookup(game.players, playerId);
  if (found === undefined) {
    throw new InvariantError(`Unknown player ${playerId}`);
  }
  return found;
}

// ── Turn order and decisions ─────────────────────────────────────────────────────────

/** First Player, then clockwise (L136, L378). */
export function turnOrder(game: PublicCore): PlayerId[] {
  const order = game.playerOrder;
  const start = order.indexOf(game.firstPlayerId);
  invariant(start >= 0, `First Player ${game.firstPlayerId} is not seated`);
  return order.map((_, offset) => order[(start + offset) % order.length] as PlayerId);
}

/** The player to the left (clockwise) of `playerId`. */
export function nextClockwise(game: PublicCore, playerId: PlayerId): PlayerId {
  const order = game.playerOrder;
  const index = order.indexOf(playerId);
  invariant(index >= 0, `Player ${playerId} is not seated`);
  return order[(index + 1) % order.length] as PlayerId;
}

function queueHead(actorIds: readonly PlayerId[], index: number): PlayerId[] {
  const head = actorIds[index];
  return head === undefined ? [] : [head];
}

/** Who must act now, and how (DESIGN §3.4). Every consumer routes on this. */
export function decisionPrompt(game: PublicCore): DecisionPrompt {
  const phase = game.phase;
  switch (phase.type) {
    case "setup_kiln_selection":
      return { phaseType: phase.type, actorIds: queueHead(phase.selectionOrder, phase.index), mode: "single" };
    case "round_start_setters_mark":
    case "firing_test_pieces":
    case "firing_heat_markers":
    case "firing_heat_adjustment":
    case "firing_after_quality":
      return { phaseType: phase.type, actorIds: queueHead(phase.queue.actorIds, phase.queue.index), mode: "single" };
    case "work_turn":
      return { phaseType: phase.type, actorIds: [phase.activePlayerId], mode: "single" };
    case "firing_contributions":
      return {
        phaseType: phase.type,
        actorIds: phase.eligiblePlayerIds.filter((id) => !phase.submittedPlayerIds.includes(id)),
        mode: "simultaneous_secret",
      };
    case "firing_second_firing_choice":
      return { phaseType: phase.type, actorIds: [phase.actorId], mode: "single" };
    case "firing_salvage":
    case "cleanup_hand_limit":
      return { phaseType: phase.type, actorIds: [...phase.pendingPlayerIds], mode: "parallel" };
    case "orders":
      return { phaseType: phase.type, actorIds: queueHead(phase.turnOrder, phase.index), mode: "single" };
    case "finished":
      return { phaseType: phase.type, actorIds: [], mode: "single" };
    default: {
      const unreachable: never = phase;
      throw new InvariantError(`Unknown phase ${JSON.stringify(unreachable)}`);
    }
  }
}

/** The current phase narrowed to `type`; any other phase is an engine bug. */
export function phaseAs<T extends GamePhaseType>(game: PublicCore, type: T): Extract<GamePhase, { type: T }> {
  if (game.phase.type !== type) {
    throw new InvariantError(`Expected phase ${type}, found ${game.phase.type}`);
  }
  return game.phase as Extract<GamePhase, { type: T }>;
}

/** The current Work-turn step if it is `kind`, else null (also outside `work_turn`). */
export function workStep<K extends WorkTurnStep["kind"]>(
  game: PublicCore,
  kind: K,
): Extract<WorkTurnStep, { kind: K }> | null {
  const phase = game.phase;
  if (phase.type !== "work_turn" || phase.step.kind !== kind) {
    return null;
  }
  return phase.step as Extract<WorkTurnStep, { kind: K }>;
}

/** The Work-turn steps that hold an open Select (v1.6.2 L64, change 25). */
export type SelectStep = Extract<WorkTurnStep, { kind: "commission_market" | "colour_samples" | "colour_samples_swap" }>;

/** The current Work-turn step if it holds an open Select (the Commission Market, Colour Samples
 * when acquired or its swap), else null. */
export function selectStep(game: PublicCore): SelectStep | null {
  const phase = game.phase;
  if (phase.type !== "work_turn") {
    return null;
  }
  const step = phase.step;
  return step.kind === "commission_market" || step.kind === "colour_samples" || step.kind === "colour_samples_swap" ? step : null;
}

/** The Main Orders a pending look holds (Commission Market, Colour Samples and its swap). */
export function lookOrderIds(look: PendingLook | null): OrderId[] {
  return look === null || look.kind === "guild_inspection" ? [] : look.orderIds;
}

/**
 * The Techs a pending look holds: a Guild Hall Shifu's inspected Techs not yet taken, also
 * while they wait in a Colour Samples look the Shifu opened by taking Colour Samples
 * (v1.6.2 L207, L214).
 */
export function lookTechIds(look: PendingLook | null): TechId[] {
  if (look === null) {
    return [];
  }
  if (look.kind === "guild_inspection") {
    return look.techIds;
  }
  return look.kind === "colour_samples" ? (look.inspection?.techIds ?? []) : [];
}

// ── Events and resources ─────────────────────────────────────────────────────────────

/** Appends an event in resolution order (DESIGN §4.4). */
export function emit(ctx: ResolveContext, event: GameEvent): void {
  ctx.events.push(event);
}

function amountOf(delta: Partial<ResourceState>, kind: ResourceKind): number {
  const amount = delta[kind] ?? 0;
  invariant(Number.isSafeInteger(amount) && amount >= 0, `Resource amount ${kind}=${amount} must be a non-negative integer`);
  // `+ 0` turns -0 into +0, so gain/spend never store or emit -0 (DESIGN §7 round trip).
  return amount + 0;
}

export function canAfford(resources: ResourceState, cost: Partial<ResourceState>): boolean {
  return RESOURCE_KINDS.every((kind) => resources[kind] >= (cost[kind] ?? 0));
}

/**
 * Adds resources (supply is unlimited, L502) and emits `RESOURCES_CHANGED` with the
 * positive deltas. No event when every amount is 0.
 */
export function gain(
  draft: GameState,
  playerId: PlayerId,
  delta: Partial<ResourceState>,
  reason: ResourceChangeReason,
  ctx: ResolveContext,
): void {
  const target = player(draft, playerId);
  const clay = amountOf(delta, "clay");
  const wood = amountOf(delta, "wood");
  const coins = amountOf(delta, "coins");
  if (clay === 0 && wood === 0 && coins === 0) {
    return;
  }
  target.resources.clay += clay;
  target.resources.wood += wood;
  target.resources.coins += coins;
  emit(ctx, { type: "RESOURCES_CHANGED", playerId, clay, wood, coins, reason });
}

/**
 * Pays a cost and emits `RESOURCES_CHANGED` with negative deltas. Callers validate first;
 * a total that would go below 0 is an `InvariantError` and nothing is paid (atomic).
 * No event when every amount is 0.
 */
export function spend(
  draft: GameState,
  playerId: PlayerId,
  cost: Partial<ResourceState>,
  reason: ResourceChangeReason,
  ctx: ResolveContext,
): void {
  const target = player(draft, playerId);
  const clay = amountOf(cost, "clay");
  const wood = amountOf(cost, "wood");
  const coins = amountOf(cost, "coins");
  if (!canAfford(target.resources, { clay, wood, coins })) {
    throw new InvariantError(
      `${playerId} cannot pay ${clay} Clay, ${wood} Wood, ${coins} Coins (${reason}) with ` +
        `${target.resources.clay}/${target.resources.wood}/${target.resources.coins}`,
    );
  }
  if (clay === 0 && wood === 0 && coins === 0) {
    return;
  }
  target.resources.clay -= clay;
  target.resources.wood -= wood;
  target.resources.coins -= coins;
  // `0 - x` rather than `-x`, so a zero amount is +0, never -0.
  emit(ctx, { type: "RESOURCES_CHANGED", playerId, clay: 0 - clay, wood: 0 - wood, coins: 0 - coins, reason });
}

// ── Ceramics ─────────────────────────────────────────────────────────────────────────

export function ceramic(game: PublicCore, id: CeramicId): CeramicState {
  const found = lookup(game.ceramics, id);
  if (found === undefined) {
    throw new InvariantError(`Unknown ceramic ${id}`);
  }
  return found;
}

const CERAMIC_ID_PATTERN = /^c([1-9][0-9]*)$/;

/** `"c12"` → 12. */
export function ceramicSequence(id: CeramicId): number {
  const match = CERAMIC_ID_PATTERN.exec(id);
  if (match === null) {
    throw new InvariantError(`Malformed ceramic ID ${id}`);
  }
  return Number(match[1]);
}

/** Every ceramic by sequence (`c1, c2, …, c10`), never by key order. */
export function ceramicsInOrder(game: PublicCore): CeramicState[] {
  return Object.values(game.ceramics).sort((a, b) => ceramicSequence(a.id) - ceramicSequence(b.id));
}

/** One player's ceramics at one stage, in sequence order. */
export function ceramicsOf<S extends CeramicStage>(
  game: PublicCore,
  playerId: PlayerId,
  stage: S,
): Array<Extract<CeramicState, { stage: S }>> {
  return ceramicsInOrder(game).filter(
    (c): c is Extract<CeramicState, { stage: S }> => c.ownerId === playerId && c.stage === stage,
  );
}

const PROXY_PATTERN = /-proxy-[1-9][0-9]*$/;

/**
 * Takes the top Vessel card of a Shape, or mints a proxy when that supply is empty
 * (Vessel cards are not a limit, L329). Used by `formCeramic` and by Reworking Table.
 */
export function takeVesselCard(draft: GameState, shape: Shape): VesselInstanceId {
  const card = draft.vesselSupply[shape].shift();
  if (card !== undefined) {
    return card;
  }
  const proxy = `${shape}-proxy-${draft.nextProxySequence}`;
  draft.nextProxySequence += 1;
  return proxy;
}

/** Forms a Shaped ceramic with a Vessel card (or proxy) and emits `CERAMIC_FORMED`. */
export function formCeramic(
  draft: GameState,
  ownerId: PlayerId,
  shape: Shape,
  decoration: Decoration,
  formedBy: FormedBy,
  ctx: ResolveContext,
): ShapedCeramic {
  player(draft, ownerId);
  const id: CeramicId = `c${draft.nextCeramicSequence}`;
  draft.nextCeramicSequence += 1;
  const formed: ShapedCeramic = {
    id,
    ownerId,
    vesselInstanceId: takeVesselCard(draft, shape),
    shape,
    decoration,
    formedInRound: draft.round,
    formedBy,
    stage: "shaped",
  };
  draft.ceramics[id] = formed;
  emit(ctx, { type: "CERAMIC_FORMED", playerId: ownerId, ceramicId: id, shape, decoration, formedBy });
  return formed;
}

/**
 * Returns a physical Vessel card to its Shape's supply (kept sorted, so the supply never
 * depends on return history). Proxies simply vanish.
 */
export function returnVesselCard(draft: GameState, vesselInstanceId: VesselInstanceId): void {
  if (PROXY_PATTERN.test(vesselInstanceId)) {
    return;
  }
  const dash = vesselInstanceId.lastIndexOf("-");
  const shape = vesselInstanceId.slice(0, dash);
  invariant(dash > 0 && Object.hasOwn(draft.vesselSupply, shape), `Malformed Vessel card ${vesselInstanceId}`);
  const supply = draft.vesselSupply[shape as Shape];
  invariant(!supply.includes(vesselInstanceId), `Vessel card ${vesselInstanceId} is already in the supply`);
  supply.push(vesselInstanceId);
  supply.sort();
}

/** Every loaded ceramic (Shared and Imperial Kilns), in sequence order. */
export function loadedCeramics(game: PublicCore): LoadedCeramic[] {
  return ceramicsInOrder(game).filter((c): c is LoadedCeramic => c.stage === "loaded");
}

/** The loaded ceramic carrying this player's own Heat marker or Kiln Master marker. */
export function heatMarkerOf(game: PublicCore, playerId: PlayerId, source: "own" | "kiln_master"): LoadedCeramic | null {
  return loadedCeramics(game).find((c) => c.ownerId === playerId && c.heatMarker?.source === source) ?? null;
}

/** This firing's ceramic in the player's Imperial Kiln, if any (L287). */
export function imperialKilnCeramic(game: PublicCore, playerId: PlayerId): LoadedCeramic | null {
  return loadedCeramics(game).find((c) => c.ownerId === playerId && c.placement.kiln === "imperial") ?? null;
}
