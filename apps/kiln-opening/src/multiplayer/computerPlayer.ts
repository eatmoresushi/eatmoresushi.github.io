import { withOwnOrderHand } from "./projection.ts";
import {
  DECORATION_COSTS,
  DECORATIONS,
  DING_EXTRA_SHAPES,
  FIRE_CARDS,
  GAME_CONFIG,
  formingTechniqueRewards,
  FORMING_TECH_COINS,
  GLAZES,
  IMPERIAL_PROGRESS,
  KILN_IDS,
  ORDER_DEFINITIONS,
  QUALITY_RANK,
  SHAPE_COSTS,
  SHAPES,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  canCompleteOrder,
  currentDecisionActor,
  locationCapacity,
  DISCIPLINES,
  matchingOrderCeramicGroups,
  matchesOrder,
  findGeDecoration,
  orderHandLimit,
  preferredHeat,
  qualityFromDifference,
  qualityForOrderOrExhibition,
} from "../game/index.ts";
import type {
  CeramicState,
  Decoration,
  FinishedCeramic,
  GameAction,
  GameState,
  Glaze,
  GlazedCeramic,
  KilnSpaceId,
  KilnLoadSelection,
  LocationId,
  LoadedCeramic,
  OrderDefinition,
  OrderId,
  PlayerId,
  PlayerState,
  Shape,
  StartingTechniqueId,
  TechniqueId,
  WorkerState,
} from "../game/index.ts";
import type { ComputerObservation } from "./computerObservation.ts";
import type { AuthoritativeCommand, PublicGameState, StoredSeat, SubmitWoodCommand } from "./types.ts";

export const ONLINE_COMPUTER_POLICY_VERSION = "rules-v1.2.7-strategic-002" as const;
export const PREVIOUS_ONLINE_COMPUTER_POLICY_VERSION = "rules-v1.2.6-strategic-002" as const;
export const LEGACY_ONLINE_COMPUTER_POLICY_VERSION = "selfplay-003" as const;

export function nextOnlineDecisionActor(state: Pick<GameState, "phase">): PlayerId | null {
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

function cartesian<T>(choices: readonly (readonly T[])[]): T[][] {
  let result: T[][] = [[]];
  for (const values of choices) {
    result = result.flatMap((prefix) => values.map((value) => [...prefix, value]));
  }
  return result;
}

function indexed<T>(values: readonly T[], indices: readonly number[]): T[] {
  return indices.flatMap((index) => values[index] === undefined ? [] : [values[index]!]);
}

/** Stable, seed-specific tie-breaking without exposing or consuming game RNG state. */
function seededTieRank(seed: number, key: string): number {
  let value = (Math.trunc(seed) ^ 0x811c9dc5) >>> 0;
  for (const character of key) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

function multisetContains<T>(actual: readonly T[], required: readonly T[]): boolean {
  const remaining = [...actual];
  for (const value of required) {
    const at = remaining.indexOf(value);
    if (at < 0) return false;
    remaining.splice(at, 1);
  }
  return true;
}

function assignmentDeficit<T>(assignment: readonly T[], existing: readonly T[]): number {
  const remaining = [...existing];
  let deficit = 0;
  for (const value of assignment) {
    const at = remaining.indexOf(value);
    if (at < 0) deficit += 1;
    else remaining.splice(at, 1);
  }
  return deficit;
}

function missingFromAssignment<T>(assignment: readonly T[], existing: readonly T[]): T[] {
  const remaining = [...existing];
  return assignment.filter((value) => {
    const at = remaining.indexOf(value);
    if (at < 0) return true;
    remaining.splice(at, 1);
    return false;
  });
}

const shapeAssignments = new Map<OrderId, Shape[][]>();
const glazeAssignments = new Map<OrderId, Glaze[][]>();
const decorationAssignments = new Map<OrderId, Decoration[][]>();

/**
 * Enumerate each rules-legal attribute route independently, exactly as V1.2.7 Orders are
 * read. The deck has at most three slots, so this is bounded to 5^3 Shape routes and 4^3
 * Glaze/Decoration routes and can be cached by stable Order ID.
 */
function legalShapeAssignments(order: OrderDefinition): Shape[][] {
  const cached = shapeAssignments.get(order.id);
  if (cached !== undefined) return cached;
  const routes = cartesian(order.ceramics.map((requirement) =>
    requirement.shape === undefined
      ? requirement.shapes ?? SHAPES
      : [requirement.shape],
  )).filter((route) => (order.relations ?? []).every((relation) => {
    if (relation.type === "same_shape") return new Set(indexed(route, relation.indices)).size === 1;
    if (relation.type === "different_shape" || relation.type === "all_different_shape") {
      const values = indexed(route, relation.indices);
      return new Set(values).size === values.length;
    }
    return true;
  }));
  shapeAssignments.set(order.id, routes);
  return routes;
}

function legalGlazeAssignments(order: OrderDefinition): Glaze[][] {
  const cached = glazeAssignments.get(order.id);
  if (cached !== undefined) return cached;
  const routes = cartesian(order.ceramics.map((requirement) =>
    requirement.glaze === undefined
      ? requirement.glazes ?? GLAZES
      : [requirement.glaze],
  )).filter((route) => (order.relations ?? []).every((relation) => {
    if (relation.type === "same_glaze") return new Set(indexed(route, relation.indices)).size === 1;
    if (relation.type === "different_glaze" || relation.type === "all_different_glaze") {
      const values = indexed(route, relation.indices);
      return new Set(values).size === values.length;
    }
    if (relation.type === "at_least_n_distinct_glazes") {
      return new Set(indexed(route, relation.indices)).size >= relation.count;
    }
    if (relation.type === "required_glazes") return multisetContains(route, relation.values);
    if (relation.type === "glaze_categories") {
      return relation.categories.every((category) => route.some((glaze) => category.includes(glaze)));
    }
    return true;
  }));
  glazeAssignments.set(order.id, routes);
  return routes;
}

function legalDecorationAssignments(order: OrderDefinition): Decoration[][] {
  const cached = decorationAssignments.get(order.id);
  if (cached !== undefined) return cached;
  const routes = cartesian(order.ceramics.map((requirement) =>
    requirement.decoration === undefined ? DECORATIONS : [requirement.decoration],
  )).filter((route) => (order.relations ?? []).every((relation) => {
    if (relation.type === "same_decoration") return new Set(indexed(route, relation.indices)).size === 1;
    if (relation.type === "different_decoration") {
      const values = indexed(route, relation.indices);
      return new Set(values).size === values.length;
    }
    if (relation.type === "at_least_n_distinct_decorations") {
      return new Set(indexed(route, relation.indices)).size >= relation.count;
    }
    if (relation.type === "required_decorations") return multisetContains(route, relation.values);
    return true;
  }));
  decorationAssignments.set(order.id, routes);
  return routes;
}

function pipelineCeramics(state: PublicGameState, playerId: PlayerId): CeramicState[] {
  return Object.values(state.ceramics).filter((ceramic) =>
    ceramic.ownerId === playerId
    && ceramic.stage !== "delivered"
    && ceramic.stage !== "presented"
    && ceramic.stage !== "sold",
  );
}

function bestAssignment<T>(
  routes: readonly T[][],
  existing: readonly T[],
  preference: (value: T) => number,
): T[] {
  return [...routes].sort((left, right) =>
    assignmentDeficit(left, existing) - assignmentDeficit(right, existing)
    || left.reduce((sum, value) => sum + preference(value), 0)
      - right.reduce((sum, value) => sum + preference(value), 0)
    || left.map(String).join("|").localeCompare(right.map(String).join("|"))
  )[0] ?? [];
}

interface OrderRoute {
  definition: OrderDefinition;
  held: boolean;
  shapes: Shape[];
  glazes: Glaze[];
  decorations: Decoration[];
  remainingCeramics: number;
  score: number;
}

function canCompleteNow(state: PublicGameState, playerId: PlayerId, order: OrderDefinition): boolean {
  const finished = Object.values(state.ceramics).filter(
    (ceramic): ceramic is FinishedCeramic => ceramic.ownerId === playerId && ceramic.stage === "finished",
  );
  return canCompleteOrder(order, finished, state.players[playerId]);
}

function recognitionValue(player: PlayerState, crowns: number): number {
  let recognition = player.imperialRecognition;
  let value = 0;
  for (let crown = 0; crown < crowns; crown += 1) {
    if (recognition >= 4) value += 1;
    else {
      recognition += 1;
      // The one-off rewards are deliberately valued in VP-equivalent terms. Recognition 4
      // is printed 6 VP; earlier milestones receive modest values for their tempo/resources.
      value += recognition === 1 ? 2.5 : recognition === 2 ? 2 : recognition === 3 ? 2 : 6;
    }
  }
  return value;
}

function routeForOrder(
  state: PublicGameState,
  player: PlayerState,
  definition: OrderDefinition,
  held: boolean,
): OrderRoute {
  const ceramics = pipelineCeramics(state, player.id);
  const shapes = bestAssignment(legalShapeAssignments(definition), ceramics.map(({ shape }) => shape), (shape) => SHAPE_COSTS[shape]);
  const glazed = ceramics.filter((ceramic): ceramic is Exclude<CeramicState, { stage: "shaped" | "sold" }> => "glaze" in ceramic);
  const glazes = bestAssignment(legalGlazeAssignments(definition), glazed.map(({ glaze }) => glaze), (glaze) => Math.abs(preferredHeat(glaze) - 2));
  const decorations = bestAssignment(legalDecorationAssignments(definition), glazed.map(({ decoration }) => decoration), (decoration) => DECORATION_COSTS[decoration]);
  const remainingCeramics = Math.max(
    assignmentDeficit(shapes, ceramics.map(({ shape }) => shape)),
    assignmentDeficit(glazes, glazed.map(({ glaze }) => glaze)),
    assignmentDeficit(decorations, glazed.map(({ decoration }) => decoration)),
    Math.max(0, definition.ceramics.length - ceramics.length),
  );
  const progress = definition.ceramics.length - remainingCeramics;
  const remainingRounds = 6 - state.round;
  const latePenalty = remainingCeramics > remainingRounds ? (remainingCeramics - remainingRounds) * 4 : 0;
  const qualityPenalty = definition.minQuality === "masterpiece" ? 2 : definition.minQuality === "fine" ? 0.75 : 0;
  const contestedBonus = !held && Object.values(state.players).some(
    (opponent) => opponent.id !== player.id && canCompleteNow(state, opponent.id, definition),
  ) ? 1 : 0;
  return {
    definition,
    held,
    shapes,
    glazes,
    decorations,
    remainingCeramics,
    score: definition.vp
      + definition.coins * 0.35
      + recognitionValue(player, definition.crowns)
      + progress * 4
      + (held ? 2 : contestedBonus)
      - definition.ceramics.length * 0.75
      - qualityPenalty
      - latePenalty,
  };
}

function bestOrderRoute(state: PublicGameState, player: PlayerState): OrderRoute | null {
  // Production follows protected held Orders only. Face-up Orders can disappear before the
  // next Order Phase; they influence reservation urgency but are too volatile to justify
  // repainting the workshop's pipeline around them.
  return player.orderHand
    .map((id) => ORDER_DEFINITIONS[id])
    .filter((definition): definition is OrderDefinition => definition !== undefined)
    .map((definition) => routeForOrder(state, player, definition, player.orderHand.includes(definition.id)))
    .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id))[0] ?? null;
}

function plannedValues<T>(
  route: readonly T[],
  existing: readonly T[],
  count: number,
  fallback: readonly T[],
): T[] {
  const missing = missingFromAssignment(route, existing);
  const result = [...missing];
  for (const value of fallback) {
    if (result.length >= count) break;
    result.push(value);
  }
  return result.slice(0, count);
}

function chooseContribution(
  state: PublicGameState,
  playerId: PlayerId,
  windowId: string,
  knownFire: number | null,
): SubmitWoodCommand {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Computer contributor disappeared");
  const loaded = Object.values(state.ceramics).filter(
    (ceramic): ceramic is LoadedCeramic => ceramic.stage === "loaded" && ceramic.ownerId === playerId,
  );
  // Test Pieces paid 1 Wood to see the Fire card; the peek sat in state and was never read,
  // so the tile fired 0.81 times a game and changed nothing. Actual Heat is
  // Base Heat + Fire + zone, so a known Fire modifier moves the Contribution target by -F.
  const fireAdjustment = knownFire ?? 0;
  const desiredAdjustment = loaded.length === 0 ? 0 : Math.round(loaded.reduce((sum, ceramic) => {
    const zone = ceramic.kilnSpaceId === "imperial" || ceramic.kilnFurnitureUsed === true
      ? 0
      : ceramic.kilnSpaceId.startsWith("high_") ? 1 : ceramic.kilnSpaceId.startsWith("low_") ? -1 : 0;
    return sum + preferredHeat(ceramic.glaze) - 2 - zone - fireAdjustment;
  }, 0) / loaded.length);
  const hasLedger = player.techniques.some((technique) => technique.id === "T12");
  if (hasLedger && player.resources.wood >= 2 && desiredAdjustment >= 2) return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "STOKE", useFuelLedger: true };
  if (hasLedger && player.resources.wood >= 2 && desiredAdjustment <= -2) return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "BANK", useFuelLedger: true };
  if (desiredAdjustment > 0 && player.resources.wood >= 1) return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "STOKE", useFuelLedger: false };
  if (desiredAdjustment < 0 && player.resources.wood >= 1) return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "BANK", useFuelLedger: false };
  return { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, card: "TEND", useFuelLedger: false };
}

function orderAction(state: PublicGameState, playerId: PlayerId): GameAction {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Computer order actor disappeared");
  const finished = Object.values(state.ceramics).filter(
    (ceramic): ceramic is FinishedCeramic => ceramic.stage === "finished" && ceramic.ownerId === playerId,
  );
  const orderIds = [...player.orderHand, ...state.displays.market].sort((a, b) => {
    const left = ORDER_DEFINITIONS[a]; const right = ORDER_DEFINITIONS[b];
    const leftValue = left === undefined ? 0 : left.vp + left.coins * 0.35 + recognitionValue(player, left.crowns);
    const rightValue = right === undefined ? 0 : right.vp + right.coins * 0.35 + recognitionValue(player, right.crowns);
    return rightValue - leftValue || a.localeCompare(b);
  });
  for (const orderId of orderIds) {
    const order = ORDER_DEFINITIONS[orderId];
    if (order === undefined) continue;
    const matching = matchingOrderCeramicGroups(order, finished, player)
      // Preserve Masterpieces and diverse ceramics for the Exhibition when a cheaper
      // ceramic delivers the same Order. Required minimum Quality is already validated.
      .sort((left, right) => left.reduce((sum, ceramic) => sum + QUALITY_RANK[qualityForOrderOrExhibition(ceramic, player.kilnId)], 0)
        - right.reduce((sum, ceramic) => sum + QUALITY_RANK[qualityForOrderOrExhibition(ceramic, player.kilnId)], 0)
        || left.map(({ id }) => id).join("|").localeCompare(right.map(({ id }) => id).join("|")));
    for (const group of matching) {
      const crossesGrant = player.imperialRecognition < 1 && player.imperialRecognition + order.crowns >= 1;
      return {
        type: "COMPLETE_ORDER",
        orderId,
        ceramicIds: group.map((ceramic) => ceramic.id),
        ...(!matchesOrder(order, group, player.kilnId) ? { geDecoration: findGeDecoration(order, group)! } : {}),
        ...(crossesGrant ? {
          imperialGrantChoice: player.resources.clay + player.resources.wood < 3
            ? "resources" as const
            : "coins" as const,
        } : {}),
      };
    }
  }
  return { type: "END_ORDER_TURN" };
}

function locationHasSpace(state: PublicGameState, locationId: LocationId, workerKind: "shifu" | "apprentice"): boolean {
  return workerKind === "shifu"
    || state.actionBoard.placements[locationId].length < locationCapacity(locationId, state.playerCount);
}

/** Zone modifier a Shared Kiln space applies, or 0 for the Imperial Kiln. */
function zoneModifierOf(kilnSpaceId: KilnSpaceId | "imperial"): number {
  if (kilnSpaceId === "imperial") return 0;
  return kilnSpaceId.startsWith("high_") ? 1 : kilnSpaceId.startsWith("low_") ? -1 : 0;
}

/**
 * The Glaze this workshop should be making.
 *
 * Every ceramic used to be Celadon and Plain. Only 2 of the 8 single-ceramic Crown Orders
 * are reachable that way, and 13 of the 20 Crown Orders demand a Glaze that is not Celadon,
 * so Imperial Recognition was closed off by construction: across 180 measured seats, 138
 * finished on 0 Crowns and not one reached the Imperial Kiln at Recognition 3.
 *
 * One Glaze is chosen for the whole workshop rather than per ceramic. Preferred Heat is a
 * property of the Glaze and one Base Heat serves the entire firing, so a mixed load leaves
 * the Contribution aimed at an average that suits none of it -- the same way wiring Kiln
 * Furniture measured worse than leaving it alone.
 *
 * Crown Orders are weighted double: Recognition compounds, paying a milestone reward on the
 * way and 6 VP at the top, where a commercial Order pays once.
 */
function targetGlaze(
  state: PublicGameState,
  player: PlayerState,
  additionallyPlanned: readonly Glaze[] = [],
): Glaze {
  const route = bestOrderRoute(state, player);
  if (route === null) return "celadon";
  const existing = pipelineCeramics(state, player.id)
    .flatMap((ceramic) => "glaze" in ceramic ? [ceramic.glaze] : []);
  return plannedValues<Glaze>(route.glazes, [...existing, ...additionallyPlanned], 1, [
    "celadon", "white", "grey_green", "moon_white",
  ])[0] ?? "celadon";
}

/**
 * The Decoration this workshop should apply alongside `glaze`.
 *
 * Six of the eight single-ceramic Crown Orders name a Decoration, and the policy could only
 * make Plain, so those Orders were unreachable whatever it glazed. Unlike a Glaze -- whose
 * Preferred Heat has to agree with one shared Base Heat -- a Decoration has no effect on
 * firing, so it can be aimed per ceramic at whatever the held Orders actually ask for.
 */
function targetDecoration(
  state: PublicGameState,
  player: PlayerState,
  _glaze: Glaze,
  additionallyPlanned: readonly Decoration[] = [],
): Decoration {
  const route = bestOrderRoute(state, player);
  if (route === null) return "plain";
  const existing = pipelineCeramics(state, player.id)
    .flatMap((ceramic) => "decoration" in ceramic ? [ceramic.decoration] : []);
  return plannedValues<Decoration>(route.decorations, [...existing, ...additionallyPlanned], 1, [
    "plain", "carved", "impressed", "crackle",
  ])[0] ?? "plain";
}

function targetShapes(state: PublicGameState, player: PlayerState, count: number): Shape[] {
  const route = bestOrderRoute(state, player);
  const existing = pipelineCeramics(state, player.id).map(({ shape }) => shape);
  const fallback = [...SHAPES].sort((left, right) =>
    existing.filter((shape) => shape === left).length - existing.filter((shape) => shape === right).length
    || SHAPE_COSTS[left] - SHAPE_COSTS[right]
    || left.localeCompare(right),
  );
  return plannedValues(route?.shapes ?? [], existing, count, fallback);
}

/** An owned Tech that is ready to use this round, or undefined. */
function ownedUnexhausted(player: PlayerState, techniqueId: TechniqueId) {
  return player.techniques.find((technique) => technique.id === techniqueId && !technique.exhausted);
}

/**
 * What an Advanced Tech is worth to *this* policy, measured rather than assumed.
 *
 * Granting each tile free to one seat across 42 games and comparing its final score to the
 * rest of the table, after the activation fields were wired:
 *
 *   T04 Drying Frames       +8.67   fires 4.60x per game
 *   T02 Measuring Calipers  +2.72   fires 1.52x per game
 *   T07 Carving Knives      +2.57   fires 4.48x per game
 *   T08 Seal Stamps         +2.52   fires 4.38x per game
 *   T09 Crackle Slips       +1.91   fires 4.45x per game
 *   T14 Second Firing       +1.91   fires 1.19x per game
 *   T11 Protective Saggars  +1.19   fires 0.86x per game
 *   T10 Colour Samples      +0.90   fires 1.21x per game
 *   T13 Test Pieces         +0.62   fires 0.67x per game
 *   T01 Large Throwing Wheel +0.04  fires 2.05x per game -- fires often, worth nothing
 *
 * The original measured values remain the anchor. Newly supported route-repair effects use
 * conservative utilities below until a larger post-change self-play sample is available;
 * none is ranked above Drying Frames merely because it has just been implemented.
 */
const MEASURED_TECHNIQUE_VALUE: Partial<Record<TechniqueId, number>> = {
  T04: 8.67,
  T02: 2.72,
  T07: 2.57,
  T08: 2.52,
  T06: 1.50,
  T05: 1.45,
  T09: 1.91,
  T14: 1.91,
  T03: 1.40,
  T01: 1.50,
  T12: 1.20,
  T11: 1.19,
  T10: 0.90,
  T15: 0.80,
  T13: 0.62,
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
function guildIsWorthwhile(state: PublicGameState, playerId: PlayerId, kind: WorkerState["kind"]): boolean {
  const player = state.players[playerId];
  if (player === undefined || player.techniques.length >= GAME_CONFIG.techniques.maxOwned) return false;
  if (!locationHasSpace(state, "guild_academy", kind)) return false;
  const discount = kind === "shifu" ? 1 : 0;
  return [...state.displays.techniques.forming, ...state.displays.techniques.glazing, ...state.displays.techniques.firing]
    .some((id) => Math.max(0, (TECHNIQUE_DEFINITIONS[id]?.cost ?? 99) - discount) <= player.resources.coins);
}

function availableWorker(
  state: PublicGameState,
  player: PlayerState,
  locationId: LocationId,
  preferShifu: boolean,
): WorkerState | null {
  const workers = Object.values(player.workers).filter(({ status }) => status === "available");
  const shifu = workers.find(({ kind }) => kind === "shifu");
  const apprentice = workers.find(({ kind }) => kind === "apprentice");
  if (preferShifu && shifu !== undefined) return shifu;
  if (apprentice !== undefined && locationHasSpace(state, locationId, "apprentice")) return apprentice;
  if (shifu !== undefined) return shifu;
  return null;
}

function locationThreatened(state: PublicGameState, playerId: PlayerId, locationId: LocationId): boolean {
  const capacity = locationCapacity(locationId, state.playerCount);
  if (!Number.isFinite(capacity)) return false;
  const remaining = capacity - state.actionBoard.placements[locationId].length;
  if (remaining > 1) return false;
  return Object.values(state.players).some((opponent) =>
    opponent.id !== playerId
    && !opponent.passedWorkPhase
    && Object.values(opponent.workers).some(({ status }) => status === "available"),
  );
}

function openSharedKilnSpaces(state: PublicGameState): KilnSpaceId[] {
  return activeKilnSpaceIds(state.playerCount).filter((spaceId) =>
    !Object.values(state.ceramics).some((ceramic) => ceramic.stage === "loaded" && ceramic.kilnSpaceId === spaceId),
  );
}

function buildKilnAction(state: PublicGameState, player: PlayerState): GameAction | null {
  const glazed = Object.values(state.ceramics).filter((ceramic): ceramic is GlazedCeramic =>
    ceramic.ownerId === player.id
    && ceramic.stage === "glazed"
    && (ceramic.loadableFromRound === undefined || state.round >= ceramic.loadableFromRound),
  );
  const sharedSpaces = openSharedKilnSpaces(state);
  const imperialEmpty = player.imperialKilnUnlocked && !Object.values(state.ceramics).some(
    (ceramic) => ceramic.ownerId === player.id && ceramic.stage === "loaded" && ceramic.kilnSpaceId === "imperial",
  );
  if (glazed.length === 0 || sharedSpaces.length === 0 && !imperialEmpty) return null;
  const worker = availableWorker(state, player, "kiln_yard", glazed.length >= 2 && sharedSpaces.length + Number(imperialEmpty) >= 2);
  if (worker === null) return null;
  const destinations: Array<KilnSpaceId | "imperial"> = [...sharedSpaces, ...(imperialEmpty ? ["imperial" as const] : [])];
  const maximum = worker.kind === "shifu" ? 2 : 1;
  const loads: KilnLoadSelection[] = [];
  const palette = paletteImprovement(state, player, []);
  const remainingDestinations = [...destinations];
  for (const ceramic of glazed.slice(0, maximum)) {
    const glazePalette = palette?.ceramicId === ceramic.id ? palette.glaze : undefined;
    const wantedZone = preferredHeat(glazePalette ?? ceramic.glaze) - 2;
    const destination = [...remainingDestinations].sort((left, right) =>
      Math.abs(zoneModifierOf(left) - wantedZone) - Math.abs(zoneModifierOf(right) - wantedZone)
      || String(left).localeCompare(String(right)),
    )[0];
    if (destination === undefined) break;
    loads.push({ ceramicId: ceramic.id, kilnSpaceId: destination, ...(glazePalette === undefined ? {} : { glazePalette }) });
    remainingDestinations.splice(remainingDestinations.indexOf(destination), 1);
  }
  if (loads.length === 0) return null;

  // Furniture is valuable only when cancelling a forced High/Low modifier moves the loaded
  // ceramic strictly closer to its preferred heat. This avoids the old unconditional use
  // that split an otherwise coherent firing plan.
  if (ownedUnexhausted(player, "T15") !== undefined) {
    const candidate = loads.map((load) => {
      const ceramic = state.ceramics[load.ceramicId];
      const wanted = ceramic !== undefined && "glaze" in ceramic ? preferredHeat(load.glazePalette ?? ceramic.glaze) - 2 : 0;
      const normal = Math.abs(zoneModifierOf(load.kilnSpaceId) - wanted);
      const withFurniture = Math.abs(wanted);
      return { load, improvement: normal - withFurniture };
    }).filter(({ load, improvement }) =>
      load.kilnSpaceId !== "imperial"
      && (load.kilnSpaceId.startsWith("high_") || load.kilnSpaceId.startsWith("low_"))
      && improvement > 0,
    ).sort((left, right) => right.improvement - left.improvement)[0];
    if (candidate !== undefined) candidate.load.useKilnFurniture = true;
  }

  const existingShared = Object.values(state.ceramics).find(
    (ceramic) => ceramic.ownerId === player.id && ceramic.stage === "loaded" && ceramic.kilnSpaceId !== "imperial",
  );
  const shifuCeramicId = worker.kind === "shifu"
    ? loads.find(({ kilnSpaceId }) => kilnSpaceId !== "imperial")?.ceramicId ?? existingShared?.id
    : undefined;
  return {
    type: "USE_KILN_YARD",
    workerId: worker.id,
    loads,
    ...(shifuCeramicId === undefined ? {} : { shifuCeramicId }),
    ...(player.startingTechniqueId === "ST04"
      ? player.resources.wood < 2 ? { kilnTendingWood: 1 } : { kilnTendingClay: 1 }
      : {}),
  };
}

function paletteImprovement(
  state: PublicGameState,
  player: PlayerState,
  plannedGlazes: readonly Glaze[],
): { ceramicId: string; glaze: Glaze } | null {
  if (ownedUnexhausted(player, "T06") === undefined) return null;
  const route = bestOrderRoute(state, player);
  if (route === null) return null;
  const glazed = pipelineCeramics(state, player.id).filter((ceramic): ceramic is GlazedCeramic => ceramic.stage === "glazed");
  const current = glazed.map(({ glaze }) => glaze);
  const before = assignmentDeficit(route.glazes, [...current, ...plannedGlazes]);
  let best: { ceramicId: string; glaze: Glaze; improvement: number } | null = null;
  for (const ceramic of glazed) {
    for (const glaze of GLAZES) {
      if (glaze === ceramic.glaze) continue;
      const without = [...current];
      without.splice(without.indexOf(ceramic.glaze), 1);
      const after = assignmentDeficit(route.glazes, [...without, glaze, ...plannedGlazes]);
      const improvement = before - after;
      if (improvement > (best?.improvement ?? 0)) best = { ceramicId: ceramic.id, glaze, improvement };
    }
  }
  return best === null ? null : { ceramicId: best.ceramicId, glaze: best.glaze };
}

function buildGlazeAction(state: PublicGameState, player: PlayerState): GameAction | null {
  const shaped = Object.values(state.ceramics).filter((ceramic) => ceramic.ownerId === player.id && ceramic.stage === "shaped");
  if (shaped.length === 0) return null;
  const worker = availableWorker(state, player, "glaze_workshop", shaped.length >= 2);
  if (worker === null) return null;
  const maximum = worker.kind === "shifu" ? 2 : 1;
  const selections: Array<{ ceramicId: string; glaze: Glaze; decoration: Decoration; newShape?: Shape }> = [];
  const plannedGlazes: Glaze[] = [];
  const plannedDecorations: Decoration[] = [];
  for (const ceramic of shaped.slice(0, maximum)) {
    const glaze = targetGlaze(state, player, plannedGlazes);
    const decoration = targetDecoration(state, player, glaze, plannedDecorations);
    selections.push({ ceramicId: ceramic.id, glaze, decoration });
    plannedGlazes.push(glaze);
    plannedDecorations.push(decoration);
  }

  const useTechniqueIds: TechniqueId[] = [];
  const route = bestOrderRoute(state, player);
  if (route !== null && ownedUnexhausted(player, "T05") !== undefined) {
    const currentShapes = pipelineCeramics(state, player.id).map(({ shape }) => shape);
    const before = assignmentDeficit(route.shapes, currentShapes);
    for (const selection of selections) {
      const ceramic = state.ceramics[selection.ceramicId];
      if (ceramic === undefined) continue;
      const otherShapes = [...currentShapes];
      otherShapes.splice(otherShapes.indexOf(ceramic.shape), 1);
      const newShape = missingFromAssignment(route.shapes, otherShapes).find((shape) => shape !== ceramic.shape);
      if (newShape !== undefined && assignmentDeficit(route.shapes, [...otherShapes, newShape]) < before) {
        selection.newShape = newShape;
        useTechniqueIds.push("T05");
        break;
      }
    }
  }

  for (const [techniqueId, decoration] of [["T07", "carved"], ["T08", "impressed"], ["T09", "crackle"]] as const) {
    if (
      ownedUnexhausted(player, techniqueId) !== undefined
      && selections.some((selection) => selection.decoration === decoration)
    ) useTechniqueIds.push(techniqueId);
  }

  const totalCost = () => {
    const unusedWaivers = new Set(useTechniqueIds);
    const decorationCost = selections.reduce((sum, selection) => {
      const freeTechnique = selection.decoration === "carved" ? "T07"
        : selection.decoration === "impressed" ? "T08"
        : selection.decoration === "crackle" ? "T09"
        : null;
      if (freeTechnique !== null && unusedWaivers.delete(freeTechnique)) return sum;
      return sum + DECORATION_COSTS[selection.decoration];
    }, 0);
    return Math.max(0, decorationCost - (worker.kind === "shifu" && selections.length === 2 ? 1 : 0));
  };
  while (selections.length > 0 && totalCost() > player.resources.coins) {
    selections.pop();
  }
  if (selections.length === 0) return null;

  // Affordability can trim the second Shifu selection. Do not retain an activation that
  // belonged only to the removed ceramic; the engine correctly rejects such orphan uses.
  if (!selections.some(({ newShape }) => newShape !== undefined)) {
    const at = useTechniqueIds.indexOf("T05");
    if (at >= 0) useTechniqueIds.splice(at, 1);
  }
  for (const [techniqueId, decoration] of [["T07", "carved"], ["T08", "impressed"], ["T09", "crackle"]] as const) {
    if (!selections.some((selection) => selection.decoration === decoration)) {
      const at = useTechniqueIds.indexOf(techniqueId);
      if (at >= 0) useTechniqueIds.splice(at, 1);
    }
  }

  const openSpaces = openSharedKilnSpaces(state);
  const imperialEmpty = player.imperialKilnUnlocked && !Object.values(state.ceramics).some(
    (ceramic) => ceramic.ownerId === player.id && ceramic.stage === "loaded" && ceramic.kilnSpaceId === "imperial",
  );
  const rapidCeramic = selections[0];
  const rapidDestination = rapidCeramic === undefined || player.startingTechniqueId !== "ST03" || player.resources.wood < 1
    ? undefined
    : [...openSpaces, ...(imperialEmpty ? ["imperial" as const] : [])].sort((left, right) =>
      Math.abs(zoneModifierOf(left) - (preferredHeat(rapidCeramic.glaze) - 2))
      - Math.abs(zoneModifierOf(right) - (preferredHeat(rapidCeramic.glaze) - 2)),
    )[0];
  return {
    type: "GLAZE_CERAMICS",
    workerId: worker.id,
    selections,
    ...(useTechniqueIds.length === 0 ? {} : { useTechniqueIds }),

    ...(rapidCeramic === undefined || rapidDestination === undefined
      ? {}
      : { rapidDrying: { ceramicId: rapidCeramic.ceramicId, kilnSpaceId: rapidDestination } }),
  };
}

function buildFormAction(state: PublicGameState, player: PlayerState): GameAction | null {
  const shifu = Object.values(player.workers).find(({ kind, status }) => kind === "shifu" && status === "available");
  const preferred = availableWorker(state, player, "forming_studio", shifu !== undefined && player.resources.clay >= 2);
  if (preferred === null) return null;
  const maximum = preferred.kind === "shifu" ? 2 : 1;
  const formShapes = targetShapes(state, player, maximum);
  const techniqueIds: TechniqueId[] = [];
  const formCost = (values: readonly Shape[], useWheel: boolean, ding: Shape | undefined) =>
    Math.max(0, values.reduce((sum, shape) => sum + SHAPE_COSTS[shape], 0)
      - (preferred.kind === "shifu" && values.length === 2 ? 1 : 0)
      - (useWheel ? 2 : 0))
      + (ding === undefined ? 0 : SHAPE_COSTS[ding]);
  while (formShapes.length > 0) {
    const wheel = ownedUnexhausted(player, "T01") !== undefined && formShapes.some((shape) => shape === "vase" || shape === "censer");
    if (formCost(formShapes, wheel, undefined) <= player.resources.clay) break;
    formShapes.pop();
  }
  if (formShapes.length === 0) return null;
  const useWheel = ownedUnexhausted(player, "T01") !== undefined && formShapes.some((shape) => shape === "vase" || shape === "censer");
  if (useWheel) techniqueIds.push("T01");
  const dingExtraShape = player.kilnId === "DI" && !player.kilnAbilityUsedThisRound
    ? formShapes.find((shape): shape is (typeof DING_EXTRA_SHAPES)[number] => DING_EXTRA_SHAPES.includes(shape as (typeof DING_EXTRA_SHAPES)[number]))
    : undefined;
  const affordableDing = dingExtraShape !== undefined
    && formCost(formShapes, useWheel, dingExtraShape) <= player.resources.clay
    ? dingExtraShape
    : undefined;

  const glaze = targetGlaze(state, player);
  const decoration = targetDecoration(state, player, glaze);
  const selectedRewards = formingTechniqueRewards(state, player, [...formShapes, ...(affordableDing === undefined ? [] : [affordableDing])]);
  techniqueIds.push(...selectedRewards);
  const availableCoins = player.resources.coins + selectedRewards.length * FORMING_TECH_COINS;
  const whiteWanted = glaze === "white";
  const canWhiteSlip = player.startingTechniqueId === "ST02" && availableCoins >= DECORATION_COSTS.plain;
  // White Slip is optional: use it only when the current Order route actually wants White.
  // Automatically glazing every vessel White merely because Drying Frames is absent can
  // break an otherwise coherent Celadon, Grey-green, or Moon-white plan.
  const whiteSlipIndex = canWhiteSlip && whiteWanted ? 0 : undefined;
  const dryingIndex = ownedUnexhausted(player, "T04") !== undefined
    ? whiteSlipIndex === 0 ? (formShapes.length >= 2 ? 1 : undefined) : 0
    : undefined;
  const dryingCost = dryingIndex === undefined ? 0 : DECORATION_COSTS[decoration];
  const whiteCost = whiteSlipIndex === undefined ? 0 : DECORATION_COSTS.plain;
  const affordableDryingIndex = dryingIndex !== undefined && dryingCost + whiteCost <= availableCoins
    ? dryingIndex
    : undefined;
  if (affordableDryingIndex !== undefined) techniqueIds.push("T04");
  return {
    type: "FORM_CERAMICS",
    workerId: preferred.id,
    shapes: formShapes,
    ...(techniqueIds.length === 0 ? {} : { useTechniqueIds: techniqueIds }),
    ...(affordableDing === undefined ? {} : { dingExtraShape: affordableDing }),
    ...(whiteSlipIndex === undefined ? {} : { whiteSlip: { formedIndex: whiteSlipIndex } }),
    ...(affordableDryingIndex === undefined ? {} : {
      dryingFrames: { formedIndex: affordableDryingIndex, glaze, decoration },
    }),
  };
}

function buildMaterialsAction(state: PublicGameState, player: PlayerState): GameAction | null {
  if (player.resources.clay + player.resources.wood >= 6) return null;
  const worker = availableWorker(state, player, "materials_yard", player.resources.clay + player.resources.wood <= 2);
  if (worker === null) return null;
  const amount = worker.kind === "shifu" ? 4 : 3;
  const wantedShape = targetShapes(state, player, 1)[0] ?? "bowl";
  const preparedCost = SHAPE_COSTS[wantedShape] + 1;
  let clay = player.startingTechniqueId === "ST01"
    ? Math.min(amount, Math.max(2, preparedCost - player.resources.clay))
    : Math.ceil(amount / 2);
  clay = Math.max(0, Math.min(amount, clay));
  const wood = amount - clay;
  const gainedClay = clay;
  const preparedClayShape = player.startingTechniqueId === "ST01" && player.resources.clay + gainedClay >= preparedCost
    ? wantedShape
    : undefined;
  const selectedRewards = formingTechniqueRewards(state, player, preparedClayShape === undefined ? [] : [preparedClayShape]);
  return {
    type: "GAIN_MATERIALS",
    workerId: worker.id,
    clay,
    wood,
    ...(worker.kind === "shifu" && player.resources.coins > 1 ? { buyShifuBonus: true } : {}),
    ...(preparedClayShape === undefined ? {} : { preparedClayShape }),
    ...(selectedRewards.length === 0 ? {} : { useTechniqueIds: selectedRewards }),
  };
}

function workAction(state: PublicGameState, playerId: PlayerId): GameAction {
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Computer worker disappeared");
  if (!Object.values(player.workers).some(({ status }) => status === "available")) return { type: "PASS_WORK_PHASE" };

  const shifu = Object.values(player.workers).find(({ kind, status }) => kind === "shifu" && status === "available");
  if (
    shifu !== undefined
    && guildIsWorthwhile(state, playerId, "shifu")
    && !guildIsWorthwhile(state, playerId, "apprentice")
  ) {
    return { type: "BEGIN_GUILD_ACTION", workerId: shifu.id };
  }

  const glazeAction = buildGlazeAction(state, player);
  const formAction = buildFormAction(state, player);
  // Secure a final contested production space before taking an uncapped Kiln Yard action.
  // This is intentionally local opponent awareness, not access to any hidden information.
  if (glazeAction !== null && locationThreatened(state, playerId, "glaze_workshop")) return glazeAction;
  if (formAction !== null && locationThreatened(state, playerId, "forming_studio")) return formAction;

  // A load already prepared for this firing has the highest tempo value. Otherwise advance
  // the oldest stage of the Order route, preserving the Shifu for a two-item action or an
  // over-capacity placement whenever an Apprentice can do the same job.
  const kilnAction = buildKilnAction(state, player);
  if (kilnAction !== null) return kilnAction;
  if (glazeAction !== null) return glazeAction;
  if (formAction !== null) return formAction;

  const guildWorker = availableWorker(
    state,
    player,
    "guild_academy",
    guildIsWorthwhile(state, playerId, "shifu") && !guildIsWorthwhile(state, playerId, "apprentice"),
  );
  if (guildWorker !== null && guildIsWorthwhile(state, playerId, guildWorker.kind)) {
    return { type: "BEGIN_GUILD_ACTION", workerId: guildWorker.id };
  }
  const orderSourceAvailable = state.displays.market.length > 0
    || state.decks.marketRemaining + state.discards.market.length > 0;
  const marketWorker = availableWorker(state, player, "market_imperial_office", player.orderHand.length <= 1);
  // V1.2.7 has no hand limit during the round. Keeping at most one speculative Order above
  // the Cleanup limit gives the bot room to improve its hand without spending every spare
  // worker on Orders it already knows it must discard.
  if (marketWorker !== null && orderSourceAvailable && player.orderHand.length < orderHandLimit() + 1) {
    return {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: marketWorker.id,
      mode: marketWorker.kind === "shifu" ? "take_up_to_two" : "take_one",
    };
  }
  const materials = buildMaterialsAction(state, player);
  if (materials !== null) return materials;
  const courtWorker = availableWorker(state, player, "court_patronage", false);
  if (courtWorker !== null && player.imperialRecognition < 3 && player.resources.coins >= 4 && (player.resources.coins >= 8 || player.imperialRecognition === 1)) return { type: "USE_COURT_PATRONAGE", workerId: courtWorker.id, imperialGrantChoice: "resources" };
  const labourWorker = availableWorker(state, player, "labour", false);
  return labourWorker === null ? { type: "PASS_WORK_PHASE" } : { type: "USE_LABOUR", workerId: labourWorker.id };
}

function chooseStartingOrders(
  state: PublicGameState,
  player: PlayerState,
  offered: readonly OrderId[],
): OrderId[] {
  const candidates = offered
    .map((id) => ORDER_DEFINITIONS[id])
    .filter((definition): definition is OrderDefinition => definition !== undefined);
  const pairs = combinations(candidates, Math.min(2, candidates.length));
  return (pairs.sort((left, right) => {
    const value = (pair: readonly OrderDefinition[]) => {
      const routes = pair.map((definition) => routeForOrder(state, player, definition, true));
      const glazeHeatSpread = routes.length < 2
        ? 0
        : Math.abs(preferredHeat(routes[0]?.glazes[0] ?? "celadon") - preferredHeat(routes[1]?.glazes[0] ?? "celadon"));
      return routes.reduce((sum, route) => sum + route.score, 0) - glazeHeatSpread;
    };
    return value(right) - value(left)
      || left.map(({ id }) => id).join("|").localeCompare(right.map(({ id }) => id).join("|"));
  })[0] ?? candidates).slice(0, 2).map(({ id }) => id);
}

function chooseStartingTechnique(state: PublicGameState, player: PlayerState): StartingTechniqueId {
  const routes = player.orderHand
    .map((id) => ORDER_DEFINITIONS[id])
    .filter((definition): definition is OrderDefinition => definition !== undefined)
    .map((definition) => routeForOrder(state, player, definition, true));
  const whiteDemand = routes.reduce((sum, route) => sum + route.glazes.filter((glaze) => glaze === "white").length, 0);
  const expensiveShapes = routes.reduce((sum, route) => sum + route.shapes.filter((shape) => SHAPE_COSTS[shape] >= 2).length, 0);
  const scores: Record<StartingTechniqueId, number> = {
    ST01: 3 + expensiveShapes * 1.25,
    ST02: 2.5 + whiteDemand * 3,
    ST03: 4 + routes.length * 0.5,
    ST04: 3.5 + routes.length * 0.4,
  };
  return [...(["ST01", "ST02", "ST03", "ST04"] as const)]
    .sort((left, right) => scores[right] - scores[left] || left.localeCompare(right))[0] ?? "ST03";
}

function bestReservableOrder(
  state: PublicGameState,
  player: PlayerState,
  orderIds: readonly OrderId[],
): OrderId | null {
  const remainingRounds = 6 - state.round;
  const pipelineCount = pipelineCeramics(state, player.id).length;
  return orderIds
    .map((orderId) => ORDER_DEFINITIONS[orderId])
    .filter((definition): definition is OrderDefinition => definition !== undefined)
    .map((definition) => routeForOrder(state, player, definition, false))
    .filter((route) =>
      (route.definition.ceramics.length === 1 || route.definition.ceramics.length <= pipelineCount)
      && route.remainingCeramics <= Math.max(1, remainingRounds),
    )
    .sort((left, right) => right.score - left.score || left.definition.id.localeCompare(right.definition.id))[0]
    ?.definition.id ?? null;
}

function commissionAdvanceResource(state: PublicGameState, player: PlayerState): "clay" | "wood" | "coins" {
  const route = bestOrderRoute(state, player);
  const neededClay = route?.shapes.reduce((sum, shape) => sum + SHAPE_COSTS[shape], 0) ?? 2;
  const neededCoins = route?.decorations.reduce((sum, decoration) => sum + DECORATION_COSTS[decoration], 0) ?? 1;
  if (player.resources.clay < Math.min(4, neededClay)) return "clay";
  if (player.resources.coins < Math.min(3, neededCoins + 1)) return "coins";
  return "wood";
}

function kilnYardReposition(state: PublicGameState, player: PlayerState, knownFire: number | null): GameAction {
  const ceramicId = player.kilnYardShifuCeramicId;
  const ceramic = ceramicId === null ? undefined : state.ceramics[ceramicId];
  if (ceramic === undefined || ceramic.stage !== "loaded" || ceramic.kilnSpaceId === "imperial" || ceramic.kilnFurnitureUsed === true) {
    return { type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: null, toSpaceId: null };
  }
  const currentModifier = zoneModifierOf(ceramic.kilnSpaceId);
  const predictedGlobalHeat = (state.firingContext?.baseHeat ?? 2) + (knownFire ?? 0);
  const before = Math.abs(predictedGlobalHeat + currentModifier - preferredHeat(ceramic.glaze));
  const destination = openSharedKilnSpaces(state)
    .filter((spaceId) => Math.abs(zoneModifierOf(spaceId) - currentModifier) === 1)
    .map((spaceId) => ({
      spaceId,
      difference: Math.abs(predictedGlobalHeat + zoneModifierOf(spaceId) - preferredHeat(ceramic.glaze)),
    }))
    .filter(({ difference }) => difference < before)
    .sort((left, right) => left.difference - right.difference || left.spaceId.localeCompare(right.spaceId))[0]?.spaceId;
  return destination === undefined
    ? { type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: null, toSpaceId: null }
    : { type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId, toSpaceId: destination };
}

function qualityAdjustmentAction(state: PublicGameState, player: PlayerState): GameAction {
  const second = state.phase.type === "firing_second_before_quality" ? state.phase.ceramicId : null;
  const results = Object.values(state.firingContext?.ceramicResults ?? {})
    .filter((result) => state.ceramics[result.ceramicId]?.ownerId === player.id && (second === null || result.ceramicId === second))
    .sort((left, right) => right.finalHeatDifference - left.finalHeatDifference || left.ceramicId.localeCompare(right.ceramicId));
  if (player.kilnId === "JU" && player.resources.wood > 0) {
    const result = results.find(({ finalHeatDifference }) => finalHeatDifference > 0);
    if (result !== undefined) {
      const ceramic = state.ceramics[result.ceramicId];
      if (ceramic?.stage === "loaded") {
        return {
          type: "RESOLVE_JUN",
          ceramicId: result.ceramicId,
          delta: result.finalActualHeat < preferredHeat(ceramic.glaze) ? 1 : -1,
        };
      }
    }
  }
  return { type: "RESOLVE_JUN", ceramicId: null, delta: null };
}

function remainingFireCards(state: PublicGameState): number[] {
  const remaining = [...FIRE_CARDS];
  for (const discarded of state.discards.fire) {
    const index = remaining.indexOf(discarded);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining.length === state.decks.fireRemaining && remaining.length > 0 ? remaining : [...FIRE_CARDS];
}

function afterQualityAction(state: PublicGameState, player: PlayerState): GameAction {
  const eligible = Object.values(state.firingContext?.ceramicResults ?? {})
    .filter((result) => state.ceramics[result.ceramicId]?.ownerId === player.id
      && (result.assignedQuality === "flawed" || result.assignedQuality === "standard"));
  if (state.phase.type !== "firing_after_quality") {
    return { type: "RESOLVE_SECOND_FIRING", ceramicId: null };
  }
  if (state.phase.techniqueIds.includes("T11")) {
    const best = eligible.map((result) => {
      const ceramic = state.ceramics[result.ceramicId];
      if (ceramic?.stage !== "loaded" || result.assignedQuality === null) {
        return { result, gain: Number.NEGATIVE_INFINITY };
      }
      const currentQuality = qualityForOrderOrExhibition({ ...ceramic, quality: result.assignedQuality }, player.kilnId);
      return { result, gain: QUALITY_RANK.fine - QUALITY_RANK[currentQuality] };
    }).sort((left, right) => right.gain - left.gain || left.result.ceramicId.localeCompare(right.result.ceramicId))[0];
    return {
      type: "RESOLVE_PROTECTIVE_SAGGARS",
      ceramicId: player.resources.wood > 0 && best !== undefined && best.gain > 0 ? best.result.ceramicId : null,
    };
  }

  const baseHeat = state.firingContext?.baseHeat ?? 2;
  const fireCards = remainingFireCards(state);
  const best = eligible.map((result) => {
    const ceramic = state.ceramics[result.ceramicId];
    const assignedQuality = result.assignedQuality;
    if (ceramic?.stage !== "loaded" || assignedQuality === null) {
      return { result, gain: Number.NEGATIVE_INFINITY };
    }
    const zone = ceramic.kilnSpaceId === "imperial" || ceramic.kilnFurnitureUsed === true
      ? 0
      : zoneModifierOf(ceramic.kilnSpaceId);
    const expectedRank = fireCards.reduce((sum, fire) => sum + QUALITY_RANK[
      qualityForOrderOrExhibition({
        ...ceramic,
        quality: qualityFromDifference(Math.abs(baseHeat + fire + zone - preferredHeat(ceramic.glaze))),
      }, player.kilnId)
    ], 0) / fireCards.length;
    const currentRank = QUALITY_RANK[qualityForOrderOrExhibition({ ...ceramic, quality: assignedQuality }, player.kilnId)];
    return { result, gain: expectedRank - currentRank };
  }).sort((left, right) => right.gain - left.gain || left.result.ceramicId.localeCompare(right.result.ceramicId))[0];
  return {
    type: "RESOLVE_SECOND_FIRING",
    ceramicId: best !== undefined && best.gain > 0.2 ? best.result.ceramicId : null,
  };
}

function cleanupOrders(state: PublicGameState, player: PlayerState): GameAction {
  const overflow = Math.max(0, player.orderHand.length - orderHandLimit());
  const ranked = player.orderHand
    .map((orderId) => ({ orderId, definition: ORDER_DEFINITIONS[orderId] }))
    .filter((entry): entry is { orderId: OrderId; definition: OrderDefinition } => entry.definition !== undefined)
    .map((entry) => ({ ...entry, route: routeForOrder(state, player, entry.definition, true) }))
    .sort((left, right) => left.route.score - right.route.score || left.orderId.localeCompare(right.orderId));
  return { type: "DISCARD_ORDERS_FOR_CLEANUP", orderIds: ranked.slice(0, overflow).map(({ orderId }) => orderId) };
}

function presentationAction(state: PublicGameState, playerId: PlayerId): GameAction {
  const eligible = Object.values(state.ceramics).filter(
    (ceramic): ceramic is FinishedCeramic & { quality: "standard" | "fine" | "masterpiece" } =>
      ceramic.ownerId === playerId && ceramic.stage === "finished" && ceramic.quality !== "flawed",
  );
  return { type: "SUBMIT_PRESENTATION", ceramicIds: eligible.map(({ id }) => id) };
}

export async function chooseOnlineComputerAction(
  observation: ComputerObservation,
  seat: StoredSeat,
): Promise<AuthoritativeCommand> {
  if (!seat.isComputer || seat.aiPolicyVersion !== ONLINE_COMPUTER_POLICY_VERSION || seat.aiSeed === null) {
    throw new Error(`Seat ${seat.seatId} is not a configured V1.2.7 computer seat`);
  }
  const aiSeed = seat.aiSeed;
  const { ownPrivate, playerId } = observation;
  const state = withOwnOrderHand(observation.game, playerId, ownPrivate.orderHand);
  if (playerId !== seat.playerId) throw new Error(`Observation does not belong to ${seat.playerId}`);
  if (nextOnlineDecisionActor(state) !== playerId) throw new Error(`Computer ${playerId} is not the current actor`);
  const player = state.players[playerId];
  if (player === undefined) throw new Error("Computer player disappeared");
  switch (state.phase.type) {
    case "setup_kiln_selection": {
      const available = KILN_IDS.filter((id) => !Object.values(state.players).some((entry) => entry.kilnId === id));
      // Kiln Traditions are intentionally asymmetric. A stable per-seat seed breaks
      // otherwise identical opening choices so computer workshops develop distinct plans.
      const kilnId = [...available].sort((left, right) =>
        seededTieRank(aiSeed, left) - seededTieRank(aiSeed, right)
        || left.localeCompare(right)
      )[0] ?? "RU";
      return { type: "SELECT_KILN", kilnId };
    }
    case "setup_starting_orders":
      return { type: "SUBMIT_STARTING_ORDERS", orderIds: chooseStartingOrders(state, player, ownPrivate.startingOrderOffer) };
    case "setup_starting_tech":
      return { type: "SELECT_STARTING_TECH", techniqueId: chooseStartingTechnique(state, player) };
    case "work": {
      const plannedWork = workAction(state, playerId);
      const priorityCeramic = Object.values(state.ceramics).find(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "glazed",
      );
      const imperialOccupied = Object.values(state.ceramics).some(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "loaded" && ceramic.kilnSpaceId === "imperial",
      );
      if (
        plannedWork.type !== "PASS_WORK_PHASE"
        && player.imperialPriorityAvailable
        && player.imperialKilnUnlocked
        && !imperialOccupied
        && priorityCeramic !== undefined
      ) {
        return { type: "RESOLVE_IMPERIAL_PRIORITY", ceramicId: priorityCeramic.id };
      }
      return plannedWork;
    }
    case "work_imperial_priority": {
      const priorityCeramic = Object.values(state.ceramics).find(
        (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "glazed",
      );
      return { type: "RESOLVE_IMPERIAL_PRIORITY", ceramicId: priorityCeramic?.id ?? null };
    }
    case "work_office_orders":
      if (state.phase.step === "gain_advance") return { type: "COMMISSION_GAIN_ADVANCE", resource: commissionAdvanceResource(state, player) };
      if (state.phase.step === "colour_samples_or_skip") {
        return player.techniques.some((technique) => technique.id === "T10" && !technique.exhausted)
          && state.decks.marketRemaining + state.discards.market.length > 0
          ? { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }
          : { type: "OFFICE_SKIP_COLOUR_SAMPLES" };
      }
      if (state.phase.step === "colour_samples_choose") {
        const selected = bestReservableOrder(state, player, [...ownPrivate.colourSamplesChoices, ...state.displays.market])
          ?? ownPrivate.colourSamplesChoices[0]
          ?? state.displays.market[0];
        if (selected === undefined) throw new Error("Colour Samples produced no selectable Order");
        return { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId: selected };
      }
      if (state.phase.remainingTakes > 0) {
        const best = bestReservableOrder(state, player, state.displays.market);
        if (best !== null) return { type: "OFFICE_TAKE_ORDER", orderId: best };
        if (state.decks.marketRemaining + state.discards.market.length > 0) return { type: "OFFICE_TAKE_TOP_ORDER" };
        const fallback = state.displays.market[0];
        if (fallback !== undefined) return { type: "OFFICE_TAKE_ORDER", orderId: fallback };
      }
      return { type: "OFFICE_END_ORDERS" };
    case "work_guild":
      if (state.phase.step === "inspect") {
        const discipline = DISCIPLINES.reduce((best, current) =>
          state.decks.techniqueRemaining[current] > state.decks.techniqueRemaining[best] ? current : best,
        DISCIPLINES[0]!);
        return { type: "GUILD_INSPECT_DISCIPLINE", discipline };
      }
      {
        const isShifu = player.workers[state.phase.workerId]?.kind === "shifu";
        const chosen = bestTechniquePurchase([
          ...ownPrivate.inspectedTechniqueIds,
          ...state.displays.techniques.forming,
          ...state.displays.techniques.glazing,
          ...state.displays.techniques.firing,
        ], player.resources.coins, isShifu ? 1 : 0);
        if (chosen === null) throw new Error("No affordable Advanced Tech after Guild validation");
        return { type: "GUILD_BUY_TECHNIQUE", techniqueId: chosen };
      }
    case "firing_before_contribution":
      return { type: "RESOLVE_TEST_PIECES", use: player.resources.wood > 2 };
    case "firing_contributions":
      return chooseContribution(state, playerId, state.phase.windowId, ownPrivate.firePeek);
    case "firing_reposition":
      return kilnYardReposition(state, player, ownPrivate.firePeek);
    case "firing_reveal_fire":
      return { type: "REVEAL_FIRE_CARD" };
    case "firing_before_quality":
    case "firing_second_before_quality":
      return qualityAdjustmentAction(state, player);
    case "firing_after_quality":
      return afterQualityAction(state, player);
    case "firing_workshop_seconds":
      return {
        type: "RESOLVE_WORKSHOP_SECONDS",
        ceramicId: Object.values(state.firingContext?.ceramicResults ?? {})
            .find((result) => result.assignedQuality === "flawed" && state.ceramics[result.ceramicId]?.ownerId === playerId)
            ?.ceramicId ?? null,
      };
    case "orders":
      return orderAction(state, playerId);
    case "cleanup_orders":
      return cleanupOrders(state, player);
    case "presentation":
      return presentationAction(state, playerId);
    case "finished":
      throw new Error("Finished games have no computer action");
  }
}

export function computerPolicyLabel(policyVersion: string | null): string {
  if (policyVersion === ONLINE_COMPUTER_POLICY_VERSION) return "V1.2.7 Strategic";
  if (policyVersion === PREVIOUS_ONLINE_COMPUTER_POLICY_VERSION) return "V1.2.6 Strategic";
  if (policyVersion === LEGACY_ONLINE_COMPUTER_POLICY_VERSION) return "V003";
  return policyVersion ?? "—";
}
