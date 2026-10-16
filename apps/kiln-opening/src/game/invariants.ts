/**
 * State invariants for tests, development and the fuzz loop (DESIGN §8.3).
 *
 * Two tiers:
 * - **Structural** (`assertInvariants(state)`, the dispatcher's `checkInvariants` hook): facts
 *   that hold after every resolver, including a resolver that a test's halting flow stopped
 *   at a cross-package hand-over (DESIGN §8.1). JSON safety, resources, card conservation
 *   (Orders, Techs, Fire cards, Vessel cards), ceramics and kiln consistency, Setter's Mark,
 *   Kiln Furniture, Heat markers, Crackle, Tech limits and personal spaces, Recognition flags,
 *   placements, the shape of the decision prompt, and the public projection's
 *   hidden-information boundary.
 * - **Live** (`assertInvariants(state, { live: true })`): additionally the facts that hold
 *   only between commands of the production flow — every window has an actor (§3.6), the
 *   phase matches the firing and the pending looks, once-per-round flags match what is on
 *   the board, the Kiln Die belongs to this round, and the ledger matches completed Orders.
 *   The fuzz test, the legal-action tests and the determinism replay run this tier.
 *
 * Nothing here mutates the state. Every check iterates canonical ID lists or `playerOrder`
 * (never `Record` key order), so the result never depends on storage key order (DESIGN §7).
 *
 * Layer 5 (imports layers 0–3 only; `engine.ts` imports this module).
 */

import {
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  IMPERIAL_TRACK,
  KILN_IDS,
  KILN_SPACE_IDS,
  LOCATIONS,
  LOCATION_IDS,
  ORDERS,
  ORDER_IDS,
  PERSONAL_LOCATION_IDS,
  SHAPES,
  TECHS,
  TECH_IDS,
  activeKilnSpaces,
  isStartingOrderId,
  locationCapacity,
} from "./content.ts";
import { InvariantError } from "./errors.ts";
import { ceramicSequence, decisionPrompt, lookup } from "./state.ts";
import { ownsTech } from "./techs.ts";
import { projectPublicState } from "./view.ts";
import type {
  CeramicState,
  FireModifier,
  FiringContext,
  GamePhaseType,
  GameState,
  LoadedCeramic,
  OrderId,
  PlayerId,
  PlayerState,
  Shape,
  TechDiscipline,
  TechId,
} from "./types.ts";

export interface InvariantOptions {
  /**
   * Also check the facts that hold only between commands of the production flow (see the
   * module JSDoc). Off for the dispatcher's hook, so halting-flow tests keep working.
   */
  live?: boolean;
}

const SETTERS_MARK: TechId = "T22";
const KILN_FURNITURE: TechId = "T15";
const INVERTED_FIRING: TechId = "T21";
const KILN_MASTER: TechId = "T24";
const SENIOR_APPRENTICE: TechId = "T18";

/** Phases with every Setter's Mark returned or not yet placeable (L303, L630). */
const MARKLESS_PHASES: readonly GamePhaseType[] = ["setup_kiln_selection", "cleanup_hand_limit", "finished"];
/** Phases that belong to an open firing (Appendix D steps 1–11). */
const FIRING_PHASES: readonly GamePhaseType[] = [
  "firing_contributions",
  "firing_test_pieces",
  "firing_heat_markers",
  "firing_heat_adjustment",
  "firing_after_quality",
  "firing_second_firing_jun",
  "firing_salvage",
];
/** Phases with nothing in any kiln: the firing has finished or been skipped. */
const KILN_EMPTY_PHASES: readonly GamePhaseType[] = [
  "setup_kiln_selection",
  "round_start_setters_mark",
  "orders",
  "cleanup_hand_limit",
  "finished",
];

const ORDER_ID_SET: ReadonlySet<string> = new Set(ORDER_IDS);
const TECH_ID_SET: ReadonlySet<string> = new Set(TECH_IDS);

/** Collects violations; `check` records the message when the condition fails. */
class Violations {
  readonly messages: string[] = [];

  check(condition: unknown, message: string | (() => string)): void {
    if (!condition) {
      this.messages.push(typeof message === "string" ? message : message());
    }
  }

  add(message: string): void {
    this.messages.push(message);
  }
}

function playersInOrder(state: GameState): PlayerState[] {
  const found: PlayerState[] = [];
  for (const playerId of state.playerOrder) {
    const p = lookup(state.players, playerId);
    if (p !== undefined) {
      found.push(p);
    }
  }
  return found;
}

function ceramicsBySequence(state: GameState, v: Violations): CeramicState[] {
  const list: CeramicState[] = [];
  for (const [key, c] of Object.entries(state.ceramics)) {
    let sequence: number;
    try {
      sequence = ceramicSequence(key);
    } catch {
      v.add(`ceramic key ${key} is not a ceramic ID`);
      continue;
    }
    v.check(c.id === key, () => `ceramic ${key} records id ${c.id}`);
    v.check(sequence < state.nextCeramicSequence, () => `ceramic ${key} is not below nextCeramicSequence ${state.nextCeramicSequence}`);
    list.push(c);
  }
  return list.sort((a, b) => ceramicSequence(a.id) - ceramicSequence(b.id));
}

/** Counts each value; returns the values seen more than once and the counts. */
function tally<T>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

// ── JSON safety (DESIGN §2.3, §7) ────────────────────────────────────────────────────

function checkJsonSafe(value: unknown, path: string, v: Violations): void {
  if (value === null) {
    return;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      v.check(Number.isFinite(value), () => `${path} is ${value} (not JSON-safe)`);
      v.check(!Object.is(value, -0), () => `${path} is -0 (a JSON round trip turns it into 0)`);
      return;
    case "undefined":
      v.add(`${path} is undefined (omit optional keys instead)`);
      return;
    case "object": {
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          if (!(index in value)) {
            v.add(`${path}[${index}] is a hole`);
            continue;
          }
          checkJsonSafe(value[index], `${path}[${index}]`, v);
        }
        return;
      }
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        v.add(`${path} is not a plain object`);
        return;
      }
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
        checkJsonSafe(inner, `${path}.${key}`, v);
      }
      return;
    }
    default:
      v.add(`${path} is a ${typeof value} (not JSON-safe)`);
  }
}

// ── Resources ────────────────────────────────────────────────────────────────────────

function checkResources(players: readonly PlayerState[], v: Violations): void {
  for (const p of players) {
    for (const kind of ["clay", "wood", "coins"] as const) {
      const amount = p.resources[kind];
      v.check(Number.isSafeInteger(amount) && amount >= 0, () => `${p.id} has ${amount} ${kind}`);
    }
  }
}

// ── Card conservation (DESIGN §8.3) ──────────────────────────────────────────────────

function checkOrders(state: GameState, players: readonly PlayerState[], v: Violations): void {
  const hidden = state.hidden;
  const look = hidden.pendingLook;
  const zones: Array<[string, readonly OrderId[]]> = [
    ...state.playerOrder.map((pid): [string, OrderId[]] => [`hand ${pid}`, lookup(hidden.orderHands, pid) ?? []]),
    ["main deck", hidden.mainDeck],
    ["main discard", hidden.mainDiscard],
    ["starting box", hidden.startingBox],
    ["display", state.market.display.filter((id): id is OrderId => id !== null)],
    ...players.map((p): [string, OrderId[]] => [`completed ${p.id}`, p.completedOrders.map((record) => record.orderId)]),
    ["pending look", look !== null && look.kind !== "guild_inspection" ? look.orderIds : []],
  ];
  for (const handOwner of Object.keys(hidden.orderHands)) {
    v.check(state.playerOrder.includes(handOwner), () => `an Order hand belongs to unseated ${handOwner}`);
  }
  const all = zones.flatMap(([, ids]) => ids);
  const counts = tally(all);
  for (const orderId of ORDER_IDS) {
    const count = counts.get(orderId) ?? 0;
    v.check(count === 1, () => `Order ${orderId} is in ${count} zones`);
  }
  for (const orderId of counts.keys()) {
    v.check(ORDER_ID_SET.has(orderId), () => `unknown Order ${orderId}`);
  }
  for (const [zone, ids] of zones) {
    for (const orderId of ids) {
      if (!ORDER_ID_SET.has(orderId)) {
        continue;
      }
      const starting = isStartingOrderId(orderId);
      if (zone === "main deck" || zone === "main discard" || zone === "display" || zone === "pending look") {
        v.check(!starting, () => `Starting Order ${orderId} is in the ${zone}`);
      }
      if (zone === "starting box") {
        v.check(starting, () => `Main Order ${orderId} is in the starting box`);
      }
    }
  }
  v.check(
    state.market.display.length === GAME_CONFIG.mainMarket.displaySize,
    () => `the Main display has ${state.market.display.length} positions`,
  );
  const pending = state.market.refillPendingFor;
  v.check(pending === null || state.playerOrder.includes(pending), () => `refillPendingFor ${pending} is not seated`);
}

function checkTechs(state: GameState, players: readonly PlayerState[], v: Violations): void {
  const hidden = state.hidden;
  const look = hidden.pendingLook;
  const owned = players.flatMap((p) => p.techs.map((tech) => tech.id));
  const zoned: TechId[] = [...owned];
  for (const discipline of DISCIPLINES) {
    const display = state.techDisplay[discipline];
    const deck = hidden.techDecks[discipline];
    v.check(
      display.length <= GAME_CONFIG.techs.faceUpPerDiscipline,
      () => `the ${discipline} display shows ${display.length} Techs`,
    );
    for (const techId of [...display, ...deck]) {
      v.check(lookup(TECHS, techId)?.discipline === discipline, () => `${techId} is in the ${discipline} display or deck`);
    }
    zoned.push(...display, ...deck);
  }
  if (look?.kind === "guild_inspection") {
    for (const techId of look.techIds) {
      v.check(lookup(TECHS, techId)?.discipline === look.discipline, () => `${techId} is in a ${look.discipline} inspection`);
    }
    zoned.push(...look.techIds);
  }
  const counts = tally(zoned);
  for (const techId of TECH_IDS) {
    const count = counts.get(techId) ?? 0;
    v.check(count === 1, () => `Tech ${techId} is in ${count} zones`);
  }
  for (const techId of counts.keys()) {
    v.check(TECH_ID_SET.has(techId), () => `unknown Tech ${techId}`);
  }
}

function checkFireCards(state: GameState, v: Violations): void {
  const cards: FireModifier[] = [...state.hidden.fireDeck, ...state.fireDiscard];
  const firing = state.firing;
  if (firing !== null && firing.fireModifier !== null) {
    cards.push(firing.fireModifier);
  }
  if (firing !== null && firing.pendingExtraFire !== null) {
    cards.push(firing.pendingExtraFire.modifier);
  }
  const expected = [...FIRING.fireDeck].sort((a, b) => a - b);
  const actual = [...cards].sort((a, b) => a - b);
  v.check(
    expected.length === actual.length && expected.every((card, index) => card === actual[index]),
    () => `Fire cards are [${actual.join(",")}], expected [${expected.join(",")}]`,
  );
}

const VESSEL_CARD = /^(bowl|plate|washer|vase|censer)-(\d{2})$/;
const VESSEL_PROXY = /^(bowl|plate|washer|vase|censer)-proxy-([1-9][0-9]*)$/;

function checkVesselCards(state: GameState, ceramics: readonly CeramicState[], v: Violations): void {
  const physical: string[] = [];
  for (const shape of SHAPES) {
    for (const card of state.vesselSupply[shape]) {
      const match = VESSEL_CARD.exec(card);
      v.check(match !== null && match[1] === shape, () => `Vessel card ${card} is in the ${shape} supply`);
      physical.push(card);
    }
  }
  const proxies: string[] = [];
  for (const c of ceramics) {
    const card = c.vesselInstanceId;
    const physicalMatch = VESSEL_CARD.exec(card);
    const proxyMatch = VESSEL_PROXY.exec(card);
    if (physicalMatch !== null) {
      v.check(physicalMatch[1] === c.shape, () => `${c.id} (${c.shape}) holds Vessel card ${card}`);
      physical.push(card);
    } else if (proxyMatch !== null) {
      v.check(proxyMatch[1] === c.shape, () => `${c.id} (${c.shape}) holds proxy ${card}`);
      v.check(Number(proxyMatch[2]) < state.nextProxySequence, () => `proxy ${card} is not below nextProxySequence`);
      proxies.push(card);
    } else {
      v.add(`${c.id} holds malformed Vessel card ${card}`);
    }
  }
  const counts = tally(physical);
  for (const shape of SHAPES) {
    for (let index = 1; index <= GAME_CONFIG.shapeSupplyEach; index += 1) {
      const card = `${shape}-${String(index).padStart(2, "0")}`;
      const count = counts.get(card) ?? 0;
      v.check(count === 1, () => `Vessel card ${card} is in ${count} places`);
    }
  }
  v.check(physical.length === SHAPES.length * GAME_CONFIG.shapeSupplyEach, () => `${physical.length} physical Vessel cards`);
  for (const [proxy, count] of tally(proxies)) {
    v.check(count === 1, () => `proxy ${proxy} is held by ${count} ceramics`);
  }
}

// ── Ceramics, kilns, markers ─────────────────────────────────────────────────────────

function checkCeramics(state: GameState, ceramics: readonly CeramicState[], v: Violations): void {
  const imperialByOwner = new Map<PlayerId, number>();
  for (const c of ceramics) {
    const owner = lookup(state.players, c.ownerId);
    v.check(owner !== undefined, () => `${c.id} belongs to unseated ${c.ownerId}`);
    switch (c.stage) {
      case "shaped":
        break;
      case "loaded": {
        if (c.placement.kiln === "imperial") {
          imperialByOwner.set(c.ownerId, (imperialByOwner.get(c.ownerId) ?? 0) + 1);
          v.check(owner?.imperial.kilnGained === true, () => `${c.id} is in ${c.ownerId}'s Imperial Kiln, which is not gained`);
          v.check(FIRING.imperialModifiers.includes(c.placement.imperialModifier), () => `${c.id} has Imperial modifier ${String((c.placement as { imperialModifier: unknown }).imperialModifier)}`);
        } else {
          const space = lookup(state.sharedKiln.spaces, c.placement.spaceId);
          v.check(space !== undefined && space.ceramicIds.includes(c.id), () => `${c.id} is not listed in ${c.placement.kiln === "shared" ? c.placement.spaceId : ""}`);
        }
        break;
      }
      case "finished":
      case "delivered":
        // DESIGN §8.3: a Crackle ceramic is exactly Fine (the type says so; this checks casts).
        v.check(!c.crackle || c.quality === "fine", () => `Crackle ceramic ${c.id} is ${c.quality}`);
        if (c.stage === "delivered") {
          v.check((c.quality as string) !== "flawed", () => `delivered ${c.id} is Flawed`);
          const record = owner?.completedOrders.find((r) => r.orderId === c.orderId);
          v.check(record !== undefined && record.ceramicIds.includes(c.id), () => `delivered ${c.id} is not beneath ${c.orderId}`);
        }
        break;
      default:
        v.add(`${(c as { id: string }).id} has an unknown stage`);
    }
  }
  for (const [ownerId, count] of imperialByOwner) {
    v.check(count <= 1, () => `${ownerId}'s Imperial Kiln holds ${count} ceramics`);
  }
  for (const p of playersInOrder(state)) {
    for (const record of p.completedOrders) {
      for (const ceramicId of record.ceramicIds) {
        const c = lookup(state.ceramics, ceramicId);
        v.check(
          c !== undefined && c.stage === "delivered" && c.orderId === record.orderId && c.ownerId === p.id,
          () => `${record.orderId}'s ceramic ${ceramicId} is not a delivered ceramic of ${p.id}`,
        );
      }
      const order = lookup(ORDERS, record.orderId);
      v.check(order !== undefined && order.ceramics.length === record.ceramicIds.length, () => `${record.orderId} holds ${record.ceramicIds.length} ceramics`);
    }
  }
}

function checkKiln(state: GameState, ceramics: readonly CeramicState[], v: Violations): void {
  const active = activeKilnSpaces(state.playerCount);
  const markOwners: PlayerId[] = [];
  let furnitureTiles = 0;
  const listed = new Set<string>();
  for (const spaceId of KILN_SPACE_IDS) {
    const space = state.sharedKiln.spaces[spaceId];
    v.check(space.active === active.includes(spaceId), () => `${spaceId} active=${String(space.active)} at ${state.playerCount} players`);
    v.check(space.ceramicIds.length <= 2, () => `${spaceId} holds ${space.ceramicIds.length} ceramics`);
    v.check(space.active || space.ceramicIds.length === 0, () => `covered ${spaceId} holds a ceramic`);
    const loaded: LoadedCeramic[] = [];
    space.ceramicIds.forEach((ceramicId, index) => {
      v.check(!listed.has(ceramicId), () => `${ceramicId} is listed in two kiln spaces`);
      listed.add(ceramicId);
      const c = lookup(state.ceramics, ceramicId);
      if (c === undefined || c.stage !== "loaded" || c.placement.kiln !== "shared" || c.placement.spaceId !== spaceId) {
        v.add(`${spaceId} lists ${ceramicId}, which is not loaded there`);
        return;
      }
      loaded.push(c);
      const placement = c.placement;
      // The second ceramic got there only through Inverted Firing; the first was loaded into
      // an empty space — unless the ceramic beneath a stack was salvaged (step 11, L281), which
      // leaves the stacked one alone until the kiln empties (step 12). `stacked` records how a
      // ceramic was loaded (LoadPlacement JSDoc).
      const salvagedBeneath =
        index === 0 &&
        space.ceramicIds.length === 1 &&
        Object.values(state.firing?.ceramics ?? {}).some((record) => record?.salvaged === true && record.spaceId === spaceId);
      v.check(
        placement.stacked === (index === 1) || (placement.stacked && salvagedBeneath),
        () => `${ceramicId} in ${spaceId} has stacked=${String(placement.stacked)} at position ${index}`,
      );
    });
    const [below, above] = loaded;
    if (below !== undefined && above !== undefined) {
      v.check(below.ownerId === above.ownerId, () => `the stack in ${spaceId} has two owners`);
      const stackable: readonly Shape[] = TECHS.T21.params.shapes;
      v.check(stackable.includes(above.shape), () => `stacked ${above.id} is a ${above.shape}`);
      const owner = lookup(state.players, above.ownerId);
      v.check(owner !== undefined && ownsTech(owner, INVERTED_FIRING), () => `${above.ownerId} stacked in ${spaceId} without Inverted Firing`);
    }
    // Setter's Mark (T22, L630).
    const markOwner = space.setterMarkOwnerId;
    if (markOwner !== null) {
      markOwners.push(markOwner);
      v.check(space.active && space.ceramicIds.length === 0, () => `Setter's Mark on ${spaceId}, which is covered or holds a ceramic`);
      const owner = lookup(state.players, markOwner);
      v.check(owner !== undefined && ownsTech(owner, SETTERS_MARK), () => `${markOwner}'s Setter's Mark without ${SETTERS_MARK}`);
      v.check(!MARKLESS_PHASES.includes(state.phase.type), () => `Setter's Mark on ${spaceId} during ${state.phase.type}`);
    }
    // Kiln Furniture (T15, L628, R8).
    const furniture = space.kilnFurniture;
    if (furniture !== null) {
      furnitureTiles += 1;
      v.check(space.ceramicIds.includes(furniture.underCeramicId), () => `Kiln Furniture in ${spaceId} is not beneath one of its ceramics`);
      v.check(lookup(state.ceramics, furniture.underCeramicId)?.ownerId === furniture.ownerId, () => `Kiln Furniture in ${spaceId} is beneath another player's ceramic`);
      const owner = lookup(state.players, furniture.ownerId);
      v.check(owner !== undefined && ownsTech(owner, KILN_FURNITURE), () => `${furniture.ownerId}'s Kiln Furniture without ${KILN_FURNITURE}`);
      v.check(TECHS.T15.params.modifiers.includes(furniture.modifier), () => `Kiln Furniture modifier ${furniture.modifier}`);
    }
  }
  for (const [ownerId, count] of tally(markOwners)) {
    v.check(count <= 1, () => `${ownerId} has ${count} Setter's Marks on the kiln`);
  }
  v.check(furnitureTiles <= 1, () => `${furnitureTiles} Kiln Furniture tiles in the Shared Kiln`);
  for (const c of ceramics) {
    if (c.stage === "loaded" && c.placement.kiln === "shared") {
      v.check(listed.has(c.id), () => `${c.id} is loaded but no space lists it`);
    }
  }
}

function checkMarkers(state: GameState, ceramics: readonly CeramicState[], v: Violations): void {
  const ownMarkers: PlayerId[] = [];
  const kilnMasterCarriers: LoadedCeramic[] = [];
  const fireRevealed = state.firing !== null && state.firing.fireModifier !== null;
  for (const c of ceramics) {
    if (c.stage !== "loaded" || c.heatMarker === null) {
      continue;
    }
    const marker = c.heatMarker;
    if (marker.source === "own") {
      ownMarkers.push(c.ownerId);
    } else {
      kilnMasterCarriers.push(c);
    }
    if (marker.faceDown) {
      // Every face-down marker is turned or returned before the Fire card (L268, L677).
      v.check(!fireRevealed, () => `${c.id} still carries a face-down Heat marker after the Fire reveal`);
    } else {
      v.check(marker.value === 1 || marker.value === -1, () => `${c.id}'s Heat marker shows ${String(marker.value)}`);
    }
  }
  for (const [ownerId, count] of tally(ownMarkers)) {
    v.check(count <= 1, () => `${ownerId}'s Heat marker is on ${count} ceramics`);
  }
  v.check(kilnMasterCarriers.length <= 1, () => `${kilnMasterCarriers.length} Kiln Master markers in the game`);
  for (const carrier of kilnMasterCarriers) {
    const owner = lookup(state.players, carrier.ownerId);
    v.check(owner !== undefined && ownsTech(owner, KILN_MASTER), () => `Kiln Master marker on ${carrier.id}, whose owner lacks ${KILN_MASTER}`);
  }
  const phase = state.phase;
  if (phase.type === "firing_heat_markers") {
    // Players before the queue head have resolved their own marker (L268, L676).
    for (const playerId of phase.queue.actorIds.slice(0, phase.queue.index)) {
      const faceDown = ceramics.some(
        (c) => c.stage === "loaded" && c.ownerId === playerId && c.heatMarker?.source === "own" && c.heatMarker.faceDown,
      );
      v.check(!faceDown, () => `${playerId} acted in the Heat-marker step but still has a face-down marker`);
    }
  }
}

function checkFiringRecords(firing: FiringContext | null, label: string, v: Violations): void {
  if (firing === null) {
    return;
  }
  for (const [ceramicId, record] of Object.entries(firing.ceramics)) {
    if (record === undefined) {
      v.add(`${label}.ceramics.${ceramicId} is undefined`);
      continue;
    }
    v.check(record.ceramicId === ceramicId, () => `${label} record ${ceramicId} names ${record.ceramicId}`);
    // DESIGN §8.3: Crackle ⇒ exactly Fine, also in the firing record.
    v.check(!record.crackle || record.quality === "fine", () => `${label}: Crackle ${ceramicId} is ${String(record.quality)}`);
  }
}

// ── Players: Techs, personal spaces, Recognition, workers ────────────────────────────

function checkPlayers(state: GameState, players: readonly PlayerState[], v: Violations): void {
  v.check(players.length === state.playerOrder.length && players.length === state.playerCount, () => "playerOrder, players and playerCount disagree");
  v.check(Object.keys(state.players).length === state.playerOrder.length, () => "players has entries outside playerOrder");
  v.check(new Set(state.playerOrder).size === state.playerOrder.length, () => "playerOrder repeats a player");
  v.check(state.playerOrder.includes(state.firstPlayerId), () => `First Player ${state.firstPlayerId} is not seated`);
  const kilns: string[] = [];
  const centralCounts = new Map<string, number>();
  const sequences: number[] = [];
  players.forEach((p, seat) => {
    v.check(p.seatIndex === seat, () => `${p.id} has seatIndex ${p.seatIndex}, seat ${seat}`);
    if (p.kilnId !== null) {
      kilns.push(p.kilnId);
      v.check(KILN_IDS.includes(p.kilnId), () => `${p.id} has unknown Kiln ${p.kilnId}`);
    } else {
      v.check(state.phase.type === "setup_kiln_selection", () => `${p.id} has no Kiln after setup`);
      v.check(!p.kilnAbilityUsedThisRound, () => `${p.id} used a Kiln ability without a Kiln`);
    }

    // Techs: at most 3, at most 1 per discipline (L211, L375); no Tech without a limit is "used".
    v.check(p.techs.length <= GAME_CONFIG.techs.maxOwned, () => `${p.id} owns ${p.techs.length} Techs`);
    const disciplines = tally(p.techs.map((tech) => lookup(TECHS, tech.id)?.discipline ?? "unknown"));
    for (const [discipline, count] of disciplines) {
      v.check(count <= GAME_CONFIG.techs.maxPerDiscipline, () => `${p.id} owns ${count} ${discipline} Techs`);
    }
    for (const tech of p.techs) {
      const definition = lookup(TECHS, tech.id);
      v.check(definition !== undefined, () => `${p.id} owns unknown Tech ${tech.id}`);
      v.check(definition === undefined || definition.oncePerRound || !tech.usedThisRound, () => `${p.id}'s ${tech.id} has no per-round limit but is marked used`);
      v.check(tech.acquiredInRound <= state.round, () => `${p.id}'s ${tech.id} was acquired in a later round`);
    }

    // Personal spaces: space 0 open; space 1 open exactly when a matching Tech is owned (L212).
    for (const locationId of PERSONAL_LOCATION_IDS) {
      const spaces = p.personalSpaces[locationId];
      v.check(spaces.length === 2 && spaces[0].unlocked, () => `${p.id}'s first ${locationId} space is locked`);
      const unlockedByTech = p.techs.some((tech) => lookup(TECHS, tech.id)?.unlocks === locationId);
      v.check(spaces[1].unlocked === unlockedByTech, () => `${p.id}'s second ${locationId} space unlocked=${String(spaces[1].unlocked)}`);
    }

    // Recognition 0–4 and every milestone gained exactly once when reached (L429–440).
    const recognition = p.imperial.recognition;
    v.check(Number.isInteger(recognition) && recognition >= 0 && recognition <= 4, () => `${p.id} is at Recognition ${recognition}`);
    v.check(p.imperial.grantReceived === recognition >= 1, () => `${p.id}: Imperial Grant flag disagrees with Recognition ${recognition}`);
    v.check(p.imperial.kilnGained === recognition >= 2, () => `${p.id}: Imperial Kiln flag disagrees with Recognition ${recognition}`);
    v.check((p.imperial.priority === "on_track") === recognition < 3, () => `${p.id}: Imperial Priority is ${p.imperial.priority} at Recognition ${recognition}`);
    v.check(p.imperial.audienceReceived === recognition >= 4, () => `${p.id}: Imperial Audience flag disagrees with Recognition ${recognition}`);
    const audience = IMPERIAL_TRACK.track.find((space) => space.space === 4)?.reward;
    const audienceVp = audience?.kind === "vp" ? audience.vp : 0;
    v.check(p.score.imperialAudience === (p.imperial.audienceReceived ? audienceVp : 0), () => `${p.id} recorded ${p.score.imperialAudience} Imperial Audience VP`);
    // Tech VP is recorded when each Tech is gained (owner amendment A1) and no effect removes
    // a Tech, so the ledger always equals 1 VP per owned Tech.
    const techVp = p.techs.length * GAME_CONFIG.techs.vpEach;
    v.check(p.score.techs === techVp, () => `${p.id} recorded ${p.score.techs} Tech VP for ${p.techs.length} Techs`);
    for (const key of ["orders", "kilnAbilities", "recognitionOverflow", "imperialAudience", "techs"] as const) {
      v.check(Number.isSafeInteger(p.score[key]) && p.score[key] >= 0, () => `${p.id} recorded ${p.score[key]} ${key} VP`);
    }

    // Workers: 1 Shifu + 3 Apprentices with conventional IDs (L74, L109).
    const expectedIds = [`${p.id}:shifu`, ...Array.from({ length: GAME_CONFIG.workers.apprentices }, (_, i) => `${p.id}:apprentice:${i + 1}`)];
    const workerIds = Object.keys(p.workers);
    v.check(workerIds.length === expectedIds.length && expectedIds.every((id) => workerIds.includes(id)), () => `${p.id} has workers ${workerIds.join(", ")}`);
    const personalUsed = new Set<string>();
    for (const id of expectedIds) {
      const worker = lookup(p.workers, id);
      if (worker === undefined) {
        continue;
      }
      v.check(worker.id === id && worker.kind === (id.endsWith(":shifu") ? "shifu" : "apprentice"), () => `worker ${id} is malformed`);
      const placement = worker.placement;
      if (placement === null) {
        continue;
      }
      v.check(LOCATION_IDS.includes(placement.locationId), () => `${id} is at unknown location ${placement.locationId}`);
      sequences.push(placement.sequence);
      v.check(placement.sequence >= 0 && placement.sequence < state.placementSequence, () => `${id} has placement sequence ${placement.sequence}`);
      const expectedEffect = worker.kind === "shifu" || placement.viaSeniorApprentice ? "shifu" : "apprentice";
      v.check(placement.effect === expectedEffect, () => `${id} resolves the ${placement.effect} effect`);
      if (placement.viaSeniorApprentice) {
        const allowed: readonly string[] = TECHS.T18.params.locations;
        v.check(worker.kind === "apprentice" && allowed.includes(placement.locationId), () => `${id} used Senior Apprentice at ${placement.locationId}`);
        v.check(ownsTech(p, SENIOR_APPRENTICE), () => `${id} used Senior Apprentice without ${SENIOR_APPRENTICE}`);
      }
      const location = lookup(LOCATIONS, placement.locationId);
      if (location?.scope === "personal") {
        const locationId = placement.locationId as (typeof PERSONAL_LOCATION_IDS)[number];
        const index = placement.spaceIndex;
        const space = index === 0 || index === 1 ? p.personalSpaces[locationId][index] : undefined;
        v.check(space?.unlocked === true, () => `${id} is on locked or missing ${locationId} space ${index}`);
        const key = `${locationId}:${index}`;
        v.check(!personalUsed.has(key), () => `${p.id}'s ${key} is used twice this round`);
        personalUsed.add(key);
      } else if (location !== undefined) {
        centralCounts.set(placement.locationId, (centralCounts.get(placement.locationId) ?? 0) + 1);
      }
    }
  });
  for (const [kilnId, count] of tally(kilns)) {
    v.check(count === 1, () => `Kiln ${kilnId} is chosen ${count} times`);
  }
  for (const locationId of LOCATION_IDS) {
    if (LOCATIONS[locationId].scope !== "central") {
      continue;
    }
    const capacity = locationCapacity(locationId, state.playerCount);
    const count = centralCounts.get(locationId) ?? 0;
    v.check(capacity === null || count <= capacity, () => `${locationId} holds ${count} workers (capacity ${String(capacity)})`);
  }
  v.check(new Set(sequences).size === sequences.length, () => "two placements share a sequence number");
}

// ── Phase and actors ─────────────────────────────────────────────────────────────────

function checkPhaseShape(state: GameState, v: Violations): void {
  const seated = (id: PlayerId) => state.playerOrder.includes(id);
  const unique = (ids: readonly PlayerId[]) => new Set(ids).size === ids.length;
  const phase = state.phase;
  let prompt;
  try {
    prompt = decisionPrompt(state);
  } catch (error) {
    v.add(`decisionPrompt failed: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  v.check(prompt.actorIds.every(seated) && unique(prompt.actorIds), () => `prompt actors ${prompt.actorIds.join(",")} are not unique seated players`);
  switch (phase.type) {
    case "setup_kiln_selection":
      v.check(phase.selectionOrder.every(seated) && unique(phase.selectionOrder), () => "Kiln selection order is malformed");
      v.check(phase.index >= 0 && phase.index <= phase.selectionOrder.length, () => `Kiln selection index ${phase.index}`);
      break;
    case "round_start_setters_mark":
    case "firing_test_pieces":
    case "firing_heat_markers":
    case "firing_heat_adjustment":
    case "firing_after_quality":
      v.check(phase.queue.actorIds.every(seated) && unique(phase.queue.actorIds), () => `${phase.type} queue is malformed`);
      v.check(phase.queue.index >= 0 && phase.queue.index <= phase.queue.actorIds.length, () => `${phase.type} queue index ${phase.queue.index}`);
      break;
    case "work_turn":
      v.check(seated(phase.activePlayerId), () => `active player ${phase.activePlayerId} is not seated`);
      break;
    case "firing_contributions": {
      v.check(phase.eligiblePlayerIds.every(seated) && unique(phase.eligiblePlayerIds), () => "Contribution eligibility is malformed");
      v.check(unique(phase.submittedPlayerIds) && phase.submittedPlayerIds.every((id) => phase.eligiblePlayerIds.includes(id)), () => "a non-participant submitted a Contribution");
      const firing = state.firing;
      if (firing !== null) {
        v.check(firing.contributions === null, () => "Contributions are public while the window is open");
        v.check(firing.contributionWindowId === phase.windowId, () => "the Contribution window ID disagrees with the firing");
      }
      break;
    }
    case "firing_second_firing_jun":
      v.check(seated(phase.actorId), () => `Second Firing Jun actor ${phase.actorId} is not seated`);
      break;
    case "firing_salvage":
    case "cleanup_hand_limit":
      v.check(phase.pendingPlayerIds.every(seated) && unique(phase.pendingPlayerIds), () => `${phase.type} pending players are malformed`);
      break;
    case "orders":
      v.check(phase.turnOrder.every(seated) && unique(phase.turnOrder), () => "Order Phase turn order is malformed");
      v.check(phase.index >= 0 && phase.index <= phase.turnOrder.length, () => `Order Phase index ${phase.index}`);
      break;
    case "finished":
      break;
    default:
      v.add(`unknown phase ${(phase as { type: string }).type}`);
  }
  const peeks = state.hidden.firePeeks;
  for (const [playerId, peek] of Object.entries(peeks)) {
    v.check(peek !== undefined && peek.playerId === playerId && seated(playerId), () => `Test Pieces peek under ${playerId} is malformed`);
  }
  const look = state.hidden.pendingLook;
  v.check(look === null || seated(look.playerId), () => "a private look belongs to an unseated player");
}

// ── The public projection never carries hidden data (DESIGN §4.3) ─────────────────────

function collectStrings(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    out.add(value);
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const inner of value) {
      collectStrings(inner, out);
    }
    return;
  }
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out.add(key);
    collectStrings(inner, out);
  }
}

/**
 * The Order and Tech IDs a public projection may name: displayed or completed Orders, and
 * displayed or owned Techs. Anything else would be a hidden hand, deck, discard or look.
 */
export function publiclyVisibleIds(state: Omit<GameState, "hidden">): { orders: Set<string>; techs: Set<string> } {
  const orders = new Set<string>(state.market.display.filter((id): id is OrderId => id !== null));
  const techs = new Set<string>();
  for (const playerId of state.playerOrder) {
    const p = lookup(state.players, playerId);
    for (const record of p?.completedOrders ?? []) {
      orders.add(record.orderId);
    }
    for (const tech of p?.techs ?? []) {
      techs.add(tech.id);
    }
  }
  for (const discipline of DISCIPLINES) {
    for (const techId of state.techDisplay[discipline as TechDiscipline]) {
      techs.add(techId);
    }
  }
  return { orders, techs };
}

/** Order or Tech IDs in `value` that are not in `allowed` (a JSON-wide scan of strings and keys). */
export function hiddenIdsIn(value: unknown, allowed: { orders: ReadonlySet<string>; techs: ReadonlySet<string> }): string[] {
  const strings = new Set<string>();
  collectStrings(value, strings);
  const leaked: string[] = [];
  for (const text of strings) {
    if ((ORDER_ID_SET.has(text) && !allowed.orders.has(text)) || (TECH_ID_SET.has(text) && !allowed.techs.has(text))) {
      leaked.push(text);
    }
  }
  return leaked.sort();
}

function checkProjection(state: GameState, v: Violations): void {
  let projected;
  try {
    projected = projectPublicState(state);
  } catch (error) {
    v.add(`projectPublicState failed: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  v.check(!Object.hasOwn(projected, "hidden"), () => "the public projection carries `hidden`");
  const leaked = hiddenIdsIn(projected, publiclyVisibleIds(state));
  v.check(leaked.length === 0, () => `the public projection names hidden IDs ${leaked.join(", ")}`);
}

// ── Live tier: facts that hold between production-flow commands ──────────────────────

function checkLive(state: GameState, players: readonly PlayerState[], ceramics: readonly CeramicState[], v: Violations): void {
  const phase = state.phase;
  const prompt = decisionPrompt(state);
  const firing = state.firing;
  const look = state.hidden.pendingLook;

  // Every persisted window has an actor (§3.6); `finished` and the final result agree.
  v.check(phase.type === "finished" || prompt.actorIds.length > 0, () => `${phase.type} has no actor`);
  v.check((phase.type === "finished") === (state.finalResult !== null), () => `finalResult is ${state.finalResult === null ? "missing" : "present"} in ${phase.type}`);

  // The Kiln Die belongs to this round (rolled at every Start of Round, L126).
  if (phase.type !== "setup_kiln_selection") {
    v.check(state.kilnDie !== null && state.kilnDie.round === state.round, () => "the Kiln Die was not rolled this round");
  }

  // The firing exists exactly during the firing phases.
  const inFiring = FIRING_PHASES.includes(phase.type);
  v.check(inFiring === (firing !== null), () => `firing is ${firing === null ? "null" : "open"} in ${phase.type}`);
  if (firing !== null) {
    v.check(firing.round === state.round, () => `the open firing is from round ${firing.round}`);
    v.check(firing.participantIds.every((id) => firing.firingPlayerIds.includes(id)), () => "a Contribution participant has nothing in this firing");
    for (const c of ceramics) {
      if (c.stage === "loaded") {
        v.check(Object.hasOwn(firing.ceramics, c.id), () => `${c.id} is loaded but not in this firing`);
      }
    }
    for (const [ceramicId, record] of Object.entries(firing.ceramics)) {
      const c = lookup(state.ceramics, ceramicId);
      v.check(record?.salvaged === true ? c === undefined : c?.stage === "loaded", () => `firing record ${ceramicId} has no loaded ceramic`);
    }
    v.check(
      phase.type === "firing_second_firing_jun"
        ? firing.pendingExtraFire !== null && firing.pendingExtraFire.playerId === phase.actorId && firing.pendingExtraFire.ceramicId === phase.ceramicId
        : firing.pendingExtraFire === null,
      () => "Second Firing's extra card is pending outside the R7 Jun window",
    );
    const revealed = firing.contributions !== null;
    v.check(revealed === (firing.baseHeat !== null), () => "Base Heat and the Contribution reveal disagree");
    v.check(phase.type === "firing_contributions" ? !revealed : revealed, () => `Contributions revealed=${String(revealed)} in ${phase.type}`);
    const fired = firing.fireModifier !== null;
    v.check(
      fired === ["firing_heat_adjustment", "firing_after_quality", "firing_second_firing_jun", "firing_salvage"].includes(phase.type),
      () => `the Fire card is ${fired ? "revealed" : "hidden"} in ${phase.type}`,
    );
  } else {
    v.check(Object.keys(state.hidden.firePeeks).length === 0, () => "a Test Pieces peek outlived its firing");
  }
  if (KILN_EMPTY_PHASES.includes(phase.type)) {
    v.check(!ceramics.some((c) => c.stage === "loaded"), () => `a ceramic is still loaded in ${phase.type}`);
  }

  // Work-turn sub-steps and the private look agree (B2, B3).
  const step = phase.type === "work_turn" ? phase.step : null;
  const expectedLook =
    step?.kind === "commission_market" && step.awaiting === "look_choice"
      ? "commission_top_three"
      : step?.kind === "guild_inspection"
        ? "guild_inspection"
        : step?.kind === "colour_samples"
          ? "colour_samples"
          : null;
  v.check((look?.kind ?? null) === expectedLook, () => `pending look ${String(look?.kind)} during ${phase.type}/${String(step?.kind)}`);
  if (look !== null && phase.type === "work_turn") {
    v.check(look.playerId === phase.activePlayerId, () => "the pending look is not the active player's");
    if (step?.kind === "guild_inspection" && look.kind === "guild_inspection") {
      v.check(look.discipline === step.discipline && look.techIds.length === step.inspectedCount, () => "the Guild inspection disagrees with its step");
    }
    if (step?.kind === "colour_samples" && look.kind === "colour_samples") {
      v.check(look.orderIds.length === step.lookedCount && look.orderIds.length > 0, () => "the Colour Samples look disagrees with its step");
    }
  }
  if (phase.type === "work_turn" && step?.kind === "before_action") {
    const active = lookup(state.players, phase.activePlayerId);
    v.check(active !== undefined && Object.values(active.workers).some((w) => w.placement === null), () => `${phase.activePlayerId} has no worker to place`);
  }
  if (step?.kind === "commission_market") {
    v.check(step.reservationsMade <= step.maxReservations, () => "the Commission step exceeds its reservations");
  }
  const refill = state.market.refillPendingFor;
  v.check(refill === null || (phase.type === "work_turn" && phase.activePlayerId === refill), () => `a deferred refill is owed by ${String(refill)} outside their turn`);

  // Queue phases point at a real actor.
  if ("queue" in phase) {
    v.check(phase.queue.index < phase.queue.actorIds.length, () => `${phase.type} queue is exhausted`);
  }

  // Once-per-round flags match the board.
  for (const p of players) {
    const used = (techId: TechId) => p.techs.some((tech) => tech.id === techId && tech.usedThisRound);
    for (const spaceId of KILN_SPACE_IDS) {
      const space = state.sharedKiln.spaces[spaceId];
      if (space.setterMarkOwnerId === p.id) {
        v.check(used(SETTERS_MARK), () => `${p.id}'s Setter's Mark is out but ${SETTERS_MARK} is ready`);
      }
      if (space.kilnFurniture?.ownerId === p.id) {
        v.check(used(KILN_FURNITURE), () => `${p.id}'s Kiln Furniture is in the kiln but ${KILN_FURNITURE} is ready`);
      }
    }
    for (const c of ceramics) {
      if (c.stage !== "loaded" || c.ownerId !== p.id) {
        continue;
      }
      if (c.placement.kiln === "shared" && c.placement.stacked) {
        v.check(used(INVERTED_FIRING), () => `${c.id} is stacked but ${INVERTED_FIRING} is ready`);
      }
      if (c.heatMarker?.source === "kiln_master") {
        v.check(used(KILN_MASTER), () => `${c.id} carries the Kiln Master marker but ${KILN_MASTER} is ready`);
      }
      v.check(c.loadedInRound === state.round, () => `${c.id} was loaded in an earlier round`);
    }
    for (const worker of Object.values(p.workers)) {
      if (worker.placement?.viaSeniorApprentice === true) {
        v.check(used(SENIOR_APPRENTICE), () => `${worker.id} used Senior Apprentice but ${SENIOR_APPRENTICE} is ready`);
      }
    }
    // The ledger matches the completed Orders (DESIGN §8.3).
    const orderVp = p.completedOrders.reduce((sum, record) => sum + record.vp, 0);
    v.check(p.score.orders === orderVp, () => `${p.id} recorded ${p.score.orders} Order VP, completed Orders sum to ${orderVp}`);
    const kilnVp = p.completedOrders.reduce((sum, record) => sum + (record.kilnAbility?.vp ?? 0), 0);
    v.check(p.score.kilnAbilities === kilnVp, () => `${p.id} recorded ${p.score.kilnAbilities} Kiln VP, completed Orders sum to ${kilnVp}`);
    for (const record of p.completedOrders) {
      const order = lookup(ORDERS, record.orderId);
      v.check(
        order !== undefined && record.vp === order.vp && record.coins === order.coins && record.printedCrowns === order.crowns,
        () => `${p.id}'s record of ${record.orderId} disagrees with the printed Order`,
      );
      v.check(record.bonusCrowns === 0 || record.printedCrowns >= 1, () => `${record.orderId} gained a Tribute Ware Crown without a printed Crown`);
      v.check(record.round <= state.round, () => `${record.orderId} was completed in a later round`);
    }
    // Workers stay out until Cleanup (L303): none is placed before the Work Phase or after it.
    if (["setup_kiln_selection", "round_start_setters_mark", "cleanup_hand_limit", "finished"].includes(phase.type)) {
      v.check(Object.values(p.workers).every((w) => w.placement === null), () => `${p.id} has placed workers in ${phase.type}`);
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────────────

/** Every violated invariant, in a fixed order; `[]` when the state is sound. */
export function invariantViolations(state: GameState, options: InvariantOptions = {}): string[] {
  const v = new Violations();
  checkJsonSafe(state, "state", v);
  if (v.messages.length > 0) {
    return v.messages;
  }
  const players = playersInOrder(state);
  const ceramics = ceramicsBySequence(state, v);
  checkPlayers(state, players, v);
  checkResources(players, v);
  checkOrders(state, players, v);
  checkTechs(state, players, v);
  checkFireCards(state, v);
  checkVesselCards(state, ceramics, v);
  checkCeramics(state, ceramics, v);
  checkKiln(state, ceramics, v);
  checkMarkers(state, ceramics, v);
  checkFiringRecords(state.firing, "firing", v);
  checkFiringRecords(state.lastFiring, "lastFiring", v);
  checkPhaseShape(state, v);
  checkProjection(state, v);
  if (options.live === true && v.messages.length === 0) {
    checkLive(state, players, ceramics, v);
  }
  return v.messages;
}

/**
 * Throws an `InvariantError` listing every violation (DESIGN §8.3). The dispatcher calls this
 * with the structural tier when `EngineOptions.checkInvariants` is set; the fuzz and
 * legal-action tests pass `{ live: true }`.
 */
export function assertInvariants(state: GameState, options: InvariantOptions = {}): void {
  const violations = invariantViolations(state, options);
  if (violations.length > 0) {
    throw new InvariantError(`State invariants violated (revision ${state.revision}):\n- ${violations.join("\n- ")}`);
  }
}
