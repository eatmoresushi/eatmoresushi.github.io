import {
  DECORATION_COSTS,
  GAME_CONFIG,
  KILN_IDS,
  ORDER_DEFINITIONS,
  SHAPE_COSTS,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  currentDecisionActor,
  locationCapacity,
  DISCIPLINES,
  matchesOrder,
  orderHandLimit,
  preferredHeat,
} from "../game/index.ts";
import type {
  FinishedCeramic,
  GameAction,
  GameState,
  KilnId,
  LocationId,
  LoadedCeramic,
  OrderDefinition,
  OrderId,
  PlayerId,
  PrivateFiringState,
  Shape,
  TechniqueId,
  WorkerState,
} from "../game/index.ts";
import type { AuthoritativeCommand, StoredSeat, SubmitWoodCommand } from "./types.ts";

export const ONLINE_COMPUTER_POLICY_VERSION = "rules-v1.2.4-heuristic-001" as const;
export const LEGACY_ONLINE_COMPUTER_POLICY_VERSION = "selfplay-003" as const;

export function nextOnlineDecisionActor(state: GameState): PlayerId | null {
  const phase = state.phase;
  if (phase.type === "firing_contributions") {
    return phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  if (phase.type === "presentation") {
    return phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  return currentDecisionActor(phase);
}

function combinations<T>(values: readonly T[], count: number): T[][] {
  if (count === 0) return [[]];
  const result: T[][] = [];
  const visit = (start: number, chosen: T[]) => {
    if (chosen.length === count) {
      result.push([...chosen]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index];
      if (value !== undefined) visit(index + 1, [...chosen, value]);
    }
  };
  visit(0, []);
  return result;
}

function chooseContribution(state: GameState, playerId: PlayerId, windowId: string): SubmitWoodCommand {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Computer contributor disappeared");
  const loaded = Object.values(state.ceramics).filter(
    (ceramic): ceramic is LoadedCeramic => ceramic.stage === "loaded" && ceramic.ownerId === playerId,
  );
  const desiredAdjustment = loaded.length === 0 ? 0 : Math.round(loaded.reduce((sum, ceramic) => {
    const zone = ceramic.kilnSpaceId === "imperial" || ceramic.kilnFurnitureUsed === true
      ? 0
      : ceramic.kilnSpaceId.startsWith("high_") ? 1 : ceramic.kilnSpaceId.startsWith("low_") ? -1 : 0;
    return sum + preferredHeat(ceramic.glaze) - 2 - zone;
  }, 0) / loaded.length);
  const hasLedger = player.techniques.some((technique) => technique.id === "T12");
  if (hasLedger && player.resources.wood >= 2 && desiredAdjustment >= 2) return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "STOKE", useFuelLedger: true };
  if (hasLedger && player.resources.wood >= 2 && desiredAdjustment <= -2) return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "BANK", useFuelLedger: true };
  if (desiredAdjustment > 0 && player.resources.wood >= 1) return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "STOKE", useFuelLedger: false };
  if (desiredAdjustment < 0 && player.resources.wood >= 1) return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "BANK", useFuelLedger: false };
  return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "TEND", useFuelLedger: false };
}

function orderAction(state: GameState, playerId: PlayerId): GameAction {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Computer order actor disappeared");
  const finished = Object.values(state.ceramics).filter(
    (ceramic): ceramic is FinishedCeramic => ceramic.stage === "finished" && ceramic.ownerId === playerId,
  );
  const orderIds = [...player.orderHand, ...state.marketDisplay]
    .sort((a, b) => (ORDER_DEFINITIONS[b]?.vp ?? 0) - (ORDER_DEFINITIONS[a]?.vp ?? 0));
  for (const orderId of orderIds) {
    const order = ORDER_DEFINITIONS[orderId];
    if (order === undefined) continue;
    for (const group of combinations(finished, order.ceramics.length)) {
      if (!matchesOrder(order, group)) continue;
      const crossesGrant = player.imperialRecognition < 2 && player.imperialRecognition + order.crowns >= 2;
      return {
        type: "COMPLETE_ORDER",
        orderId,
        ceramicIds: group.map((ceramic) => ceramic.id),
        ...(crossesGrant ? { imperialGrantChoice: player.resources.coins < 3 ? "coins" as const : "resources" as const } : {}),
      };
    }
  }
  return { type: "END_ORDER_TURN" };
}

function locationHasSpace(state: GameState, playerId: PlayerId, locationId: LocationId): boolean {
  const player = state.players[playerId];
  if (player === undefined) return false;
  if (locationId === "forming_studio" || locationId === "glaze_workshop") {
    const capacity = locationId === "forming_studio"
      ? player.workshopSpaces.pottersWheelUnlocked
      : player.workshopSpaces.glazeDecorationUnlocked;
    const occupancy = Object.values(player.workers).filter(
      (worker) => worker.locationId === locationId,
    ).length;
    return occupancy < capacity;
  }
  return state.actionBoard.placements[locationId].length < locationCapacity(locationId, state.playerCount);
}

/**
 * What an Advanced Tech is worth to *this* policy, measured rather than assumed.
 *
 * Granting each tile free to one seat across 42 games and comparing its final score to the
 * rest of the table gives, net of the +1.64 every tile is worth simply for unlocking a
 * workshop space when acquired:
 *
 *   T14 Second Firing       +2.17   fires 1.45x per game
 *   T02 Measuring Calipers  +1.32   fires 1.60x per game
 *   T11 Protective Saggars  +0.93   fires 0.95x per game
 *   T10 Colour Samples      +0.34   fires 1.12x per game
 *   T13 Test Pieces          0.00   fires 0.81x per game, but the peek changes no decision
 *   the remaining ten        0.00   never fire at all
 *
 * The ten are inert because this policy never sends the field that switches them on. It
 * glazes every ceramic Plain, so the three free-Decoration tiles cannot trigger; it forms
 * the Shapes it owns fewest of, so Standardised Moulds' same-Shape condition is designed
 * against; and it passes no `useTechniqueIds`, `dryingFrames`, `glazePalette`,
 * `reworkingTable` or `useKilnFurniture` anywhere. Wiring those is separate work. Until it
 * lands, buying one of them spends Coins on a tile that will never resolve, so they score 0
 * here and the buyer falls back to cost.
 *
 * Re-measure this table if the policy learns to activate a tile; a stale entry here buys
 * the wrong tile silently.
 */
const MEASURED_TECHNIQUE_VALUE: Partial<Record<TechniqueId, number>> = {
  T14: 2.17,
  T02: 1.32,
  T11: 0.93,
  T10: 0.34,
};

/** Measured worth of a tile to this policy; 0 for anything it cannot currently resolve. */
function techniqueValue(techniqueId: TechniqueId): number {
  return MEASURED_TECHNIQUE_VALUE[techniqueId] ?? 0;
}

/**
 * The tile this workshop should buy from what it can see and afford.
 *
 * V1.2.2 took the first affordable tile in Forming, Glazing, Firing display order. Forming
 * tiles cost 2 and are always affordable, so across 312 measured Guild actions it bought a
 * Firing tile zero times -- including Second Firing, the single most valuable tile it has.
 * Ties break on cost because every tile is worth the same workshop unlock.
 */
function bestTechniquePurchase(
  candidates: readonly TechniqueId[],
  coins: number,
  discount: number,
): TechniqueId | null {
  const affordable = candidates.filter(
    (id) => Math.max(0, (TECHNIQUE_DEFINITIONS[id]?.cost ?? 99) - discount) <= coins,
  );
  return affordable.sort((a, b) =>
    techniqueValue(b) - techniqueValue(a)
    || (TECHNIQUE_DEFINITIONS[a]?.cost ?? 99) - (TECHNIQUE_DEFINITIONS[b]?.cost ?? 99)
  )[0] ?? null;
}

/**
 * Could this worker take an Advanced Tech at the Guild right now?
 *
 * The Shifu discount is part of the question -- a 2-Coin tile is out of reach for an
 * Apprentice holding 1 Coin but not for a Shifu -- so both placement branches ask through
 * here rather than each carrying its own copy of the affordability rule.
 */
function guildIsWorthwhile(state: GameState, playerId: PlayerId, kind: WorkerState["kind"]): boolean {
  const player = state.players[playerId];
  if (player === undefined || player.techniques.length >= GAME_CONFIG.techniques.maxOwned) return false;
  if (!locationHasSpace(state, playerId, "guild_academy")) return false;
  const discount = kind === "shifu" ? 1 : 0;
  return [...state.techniqueDisplay.forming, ...state.techniqueDisplay.glazing, ...state.techniqueDisplay.firing]
    .some((id) => Math.max(0, (TECHNIQUE_DEFINITIONS[id]?.cost ?? 99) - discount) <= player.resources.coins);
}

function workAction(state: GameState, playerId: PlayerId): GameAction {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Computer worker disappeared");
  const workers = Object.values(player.workers).filter((worker) => worker.status === "available");
  const worker = workers.find((candidate) => candidate.kind === "shifu") ?? workers[0];
  if (worker === undefined) return { type: "PASS_WORK_PHASE" };
  const shaped = Object.values(state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "shaped");
  const glazed = Object.values(state.ceramics).filter((ceramic) =>
    ceramic.ownerId === playerId &&
    ceramic.stage === "glazed" &&
    (ceramic.loadableFromRound === undefined || state.round >= ceramic.loadableFromRound)
  );
  const spaces = activeKilnSpaceIds(state.playerCount).filter((spaceId) => !Object.values(state.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId === spaceId));
  const imperialKilnEmpty = player.imperialKilnUnlocked && !Object.values(state.ceramics).some(
    (ceramic) => ceramic.stage === "loaded" && ceramic.ownerId === playerId && ceramic.kilnSpaceId === "imperial",
  );

  // Send the Shifu to the Guild only when its 1-Coin discount is load-bearing -- when it
  // buys a tile no Apprentice here could afford. Sending it whenever a Tech was merely
  // wanted cost a full Shifu production action every round and measured 2.4 VP worse.
  if (
    worker.kind === "shifu"
    && guildIsWorthwhile(state, playerId, "shifu")
    && !guildIsWorthwhile(state, playerId, "apprentice")
  ) {
    return { type: "BEGIN_GUILD_ACTION", workerId: worker.id };
  }

  if (glazed.length > 0 && (spaces.length > 0 || imperialKilnEmpty)) {
    const normalMaximum = worker.kind === "shifu" ? 2 : 1;
    const normalLoads = glazed.slice(0, Math.min(normalMaximum, spaces.length)).map((ceramic, index) => ({ ceramicId: ceramic.id, kilnSpaceId: spaces[index]! }));
    const canPriority = player.imperialPriorityAvailable && imperialKilnEmpty && normalLoads.length === normalMaximum && glazed.length > normalLoads.length;
    const loads = canPriority
      ? [...normalLoads, { ceramicId: glazed[normalLoads.length]!.id, kilnSpaceId: "imperial" as const }]
      : normalLoads.length > 0 ? normalLoads : [{ ceramicId: glazed[0]!.id, kilnSpaceId: "imperial" as const }];
    if (loads.length > 0) return {
      type: "USE_KILN_YARD",
      workerId: worker.id,
      loads,
      ...(canPriority ? { useImperialPriority: true } : {}),
      ...(player.startingTechniqueId === "ST04" ? { kilnTendingClay: 1, kilnTendingWood: 1 } : {}),
    };
  }

  if (shaped.length > 0 && locationHasSpace(state, playerId, "glaze_workshop")) {
    const maximum = worker.kind === "shifu" ? 2 : 1;
    const selections = shaped.slice(0, maximum).map((ceramic) => ({ ceramicId: ceramic.id, glaze: "celadon" as const, decoration: "plain" as const }));
    const cost = selections.reduce((sum, selection) => sum + DECORATION_COSTS[selection.decoration], 0);
    if (player.resources.coins >= cost) {
      const freeDecorationCeramicId = worker.kind === "shifu" ? selections[0]?.ceramicId : undefined;
      return {
        type: "GLAZE_CERAMICS",
        workerId: worker.id,
        selections,
        ...(freeDecorationCeramicId === undefined ? {} : { freeDecorationCeramicId }),
      };
    }
  }

  const ownedShapeCounts = Object.values(state.ceramics).filter((ceramic) => ceramic.ownerId === playerId).reduce<Record<Shape, number>>(
    (counts, ceramic) => ({ ...counts, [ceramic.shape]: counts[ceramic.shape] + 1 }),
    { bowl: 0, plate: 0, washer: 0, vase: 0, censer: 0 },
  );
  const shapes = (["bowl", "plate", "washer", "vase", "censer"] as Shape[])
    .filter((shape) => state.vesselSupply[shape].length > 0)
    .sort((a, b) => ownedShapeCounts[a] - ownedShapeCounts[b] || SHAPE_COSTS[a] - SHAPE_COSTS[b]);
  const formCount = worker.kind === "shifu" && player.resources.clay >= 2 ? 2 : 1;
  const formShapes = shapes.slice(0, formCount);
  let formCost = formShapes.reduce((sum, shape) => sum + SHAPE_COSTS[shape], 0) - (worker.kind === "shifu" && formShapes.length === 2 ? 1 : 0);
  if (formShapes.length > 0 && player.resources.clay >= formCost && locationHasSpace(state, playerId, "forming_studio")) {
    return { type: "FORM_CERAMICS", workerId: worker.id, shapes: formShapes };
  }

  if (guildIsWorthwhile(state, playerId, worker.kind)) {
    return { type: "BEGIN_GUILD_ACTION", workerId: worker.id };
  }
  const orderSourceAvailable = state.marketDisplay.length > 0
    || state.marketDeck.length + state.marketDiscard.length > 0;
  if (locationHasSpace(state, playerId, "market_imperial_office") && orderSourceAvailable && player.orderHand.length < orderHandLimit()) {
    return { type: "BEGIN_OFFICE_ORDERS", workerId: worker.id, mode: worker.kind === "shifu" ? "take_up_to_two" : "take_one" };
  }
  if (locationHasSpace(state, playerId, "materials_yard") && player.resources.clay + player.resources.wood < 6) {
    const amount = worker.kind === "shifu" ? 4 : 3;
    return { type: "GAIN_MATERIALS", workerId: worker.id, clay: Math.ceil(amount / 2), wood: Math.floor(amount / 2) };
  }
  return { type: "USE_LABOUR", workerId: worker.id };
}

export async function chooseOnlineComputerAction(
  state: GameState,
  _privateState: PrivateFiringState,
  seat: StoredSeat,
): Promise<AuthoritativeCommand> {
  if (!seat.isComputer || seat.aiPolicyVersion !== ONLINE_COMPUTER_POLICY_VERSION || seat.aiSeed === null) {
    throw new Error(`Seat ${seat.seatId} is not a configured V1.2.4 computer seat`);
  }
  const playerId = seat.playerId;
  if (nextOnlineDecisionActor(state) !== playerId) throw new Error(`Computer ${playerId} is not the current actor`);
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Computer player disappeared");
  switch (state.phase.type) {
    case "setup_kiln_selection": {
      const available = KILN_IDS.filter((id) => !Object.values(state.players).some((entry) => entry.kilnId === id));
      return { type: "SELECT_KILN", kilnId: (available[seat.aiSeed % available.length] ?? "RU") as KilnId };
    }
    case "setup_starting_orders":
      return { type: "SUBMIT_STARTING_ORDERS", orderIds: state.phase.offeredOrderIds[playerId]?.slice(0, 2) ?? [] };
    case "setup_starting_tech":
      return { type: "SELECT_STARTING_TECH", techniqueId: (["ST01", "ST02", "ST03", "ST04"] as const)[seat.aiSeed % 4]! };
    case "work":
      return workAction(state, playerId);
    case "work_office_orders":
      if (state.phase.step === "colour_samples_or_skip") return player.techniques.some((technique) => technique.id === "T10") ? { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" } : { type: "OFFICE_SKIP_COLOUR_SAMPLES" };
      if (state.phase.step === "colour_samples_choose") {
        const choices = state.phase.colourSamplesChoices ?? [];
        const selected = [...choices].sort((a, b) => (ORDER_DEFINITIONS[b]?.vp ?? 0) - (ORDER_DEFINITIONS[a]?.vp ?? 0))[0];
        if (selected === undefined) return { type: "OFFICE_SKIP_COLOUR_SAMPLES" };
        return { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId: selected };
      }
      if (state.phase.remainingTakes > 0) {
        const best = reservableFaceUpOrder(state, playerId);
        if (best !== null) return { type: "OFFICE_TAKE_ORDER", orderId: best };
        // Nothing face up this workshop could deliver. V1.2.4 lets a reservation take the
        // top card unseen instead, which beats reserving a card known to be unusable.
        if (state.marketDeck.length + state.marketDiscard.length > 0) return { type: "OFFICE_TAKE_TOP_ORDER" };
        const fallback = state.marketDisplay[0];
        if (fallback !== undefined) return { type: "OFFICE_TAKE_ORDER", orderId: fallback };
      }
      return { type: "OFFICE_END_ORDERS" };
    case "work_commission_advance":
      return { type: "COMMISSION_GAIN_ADVANCE", resource: player.resources.coins < 2 ? "coins" : player.resources.wood < player.resources.clay ? "wood" : "clay" };
    case "work_guild":
      // Inspect the discipline whose deck is deepest: the most tiles it could still reveal.
      if (state.phase.step === "inspect") {
        const deepest = DISCIPLINES.reduce((best, d) => (state.techniqueDecks[d].length > state.techniqueDecks[best].length ? d : best), DISCIPLINES[0]!);
        return { type: "GUILD_INSPECT_DISCIPLINE", discipline: deepest };
      }
      {
        const isShifu = player.workers[state.phase.workerId]?.kind === "shifu";
        const discount = isShifu ? 1 : 0;
        // Inspected tiles and the face-up display are one pool: V1.2.4 lets a Shifu buy
        // from either, so compare them on measured worth rather than on where they sat.
        const pool = [
          ...(state.phase.inspectedTechniqueIds ?? []),
          ...state.techniqueDisplay.forming,
          ...state.techniqueDisplay.glazing,
          ...state.techniqueDisplay.firing,
        ];
        const chosen = bestTechniquePurchase(pool, player.resources.coins, discount);
        if (chosen === null) throw new Error("No affordable Advanced Tech after Guild validation");
        return {
          type: "GUILD_BUY_TECHNIQUE",
          techniqueId: chosen,
          ...(player.techniques.length === 0
            ? { unlockWorkshop: shapedCount(state, playerId) > 0 ? "glaze_decoration" as const : "potters_wheel" as const }
            : {}),
        };
      }
    case "firing_before_contribution":
      return { type: "RESOLVE_TEST_PIECES", use: player.resources.wood > 2 };
    case "firing_contributions":
      return chooseContribution(state, playerId, state.phase.windowId);
    case "firing_reposition":
      return { type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: null, toSpaceId: null };
    case "firing_before_quality": {
      const results = Object.values(state.firingContext?.ceramicResults ?? {}).filter((result) => state.ceramics[result.ceramicId]?.ownerId === playerId);
      const best = results.sort((a, b) => b.finalHeatDifference - a.finalHeatDifference)[0];
      if (player.kilnId === "GE") return { type: "RESOLVE_GE", ceramicId: best?.finalHeatDifference === 1 ? best.ceramicId : null };
      if (player.kilnId === "JU" && best !== undefined && best.finalHeatDifference > 0 && player.resources.wood >= 1) {
        const ceramic = state.ceramics[best.ceramicId];
        if (ceramic?.stage === "loaded") return { type: "RESOLVE_JUN", ceramicId: best.ceramicId, delta: best.finalActualHeat < preferredHeat(ceramic.glaze) ? 1 : -1 };
      }
      return player.kilnId === "JU" ? { type: "RESOLVE_JUN", ceramicId: null, delta: null } : { type: "RESOLVE_GE", ceramicId: null };
    }
    case "firing_after_quality": {
      const currentTech = state.phase.techniqueIds[state.phase.queue.currentIndex];
      const eligible = Object.values(state.firingContext?.ceramicResults ?? {}).filter((result) => state.ceramics[result.ceramicId]?.ownerId === playerId && (result.assignedQuality === "flawed" || result.assignedQuality === "standard"));
      if (currentTech === "T11") return { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: player.resources.wood > 0 ? eligible[0]?.ceramicId ?? null : null };
      return { type: "RESOLVE_SECOND_FIRING", ceramicId: eligible[0]?.ceramicId ?? null };
    }
    case "firing_workshop_seconds": {
      const flawed = Object.values(state.firingContext?.ceramicResults ?? {}).find((result) => result.assignedQuality === "flawed" && state.ceramics[result.ceramicId]?.ownerId === playerId);
      return { type: "RESOLVE_WORKSHOP_SECONDS", ceramicId: flawed?.ceramicId ?? null };
    }
    case "orders":
      return orderAction(state, playerId);
    case "cleanup_orders":
      return { type: "DISCARD_ORDERS_FOR_CLEANUP", orderIds: player.orderHand.slice(0, Math.max(0, player.orderHand.length - orderHandLimit())) };
    case "presentation": {
      const ceramics = Object.values(state.ceramics).filter((ceramic): ceramic is FinishedCeramic => ceramic.stage === "finished" && ceramic.ownerId === playerId && ceramic.quality !== "flawed").slice(0, 5);
      return { type: "SUBMIT_PRESENTATION", ceramicIds: ceramics.map((ceramic) => ceramic.id), featuredCeramicIds: ceramics.length >= 3 ? ceramics.slice(0, 3).map((ceramic) => ceramic.id) : [] };
    }
    case "finished": throw new Error("Finished games have no computer action");
  }
}

/**
 * The best face-up Main Order this workshop could plausibly deliver, or null.
 *
 * V1.2.2 reserved whatever sat leftmost, which regularly took a three-ceramic Order to a
 * workshop that finishes about five ceramics a game. A single-ceramic Order is always
 * reachable; a larger one is only worth a reservation once the pipeline can actually fill
 * it. Returning null is what makes V1.2.4's unseen top-card reservation the better option.
 */
function reservableFaceUpOrder(state: GameState, playerId: PlayerId): OrderId | null {
  const pipeline = Object.values(state.ceramics).filter((ceramic) =>
    ceramic.ownerId === playerId && ceramic.stage !== "delivered" && ceramic.stage !== "presented",
  ).length;
  const candidates = state.marketDisplay
    .map((orderId) => ({ orderId, definition: ORDER_DEFINITIONS[orderId] }))
    .filter((entry): entry is { orderId: OrderId; definition: OrderDefinition } =>
      entry.definition !== undefined
      && (entry.definition.ceramics.length === 1 || entry.definition.ceramics.length <= pipeline))
    .sort((a, b) => b.definition.vp - a.definition.vp);
  return candidates[0]?.orderId ?? null;
}

function shapedCount(state: GameState, playerId: PlayerId): number {
  return Object.values(state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "shaped").length;
}

export function computerPolicyLabel(policyVersion: string | null): string {
  if (policyVersion === ONLINE_COMPUTER_POLICY_VERSION) return "V1.2.4";
  if (policyVersion === LEGACY_ONLINE_COMPUTER_POLICY_VERSION) return "V003";
  return policyVersion ?? "—";
}
