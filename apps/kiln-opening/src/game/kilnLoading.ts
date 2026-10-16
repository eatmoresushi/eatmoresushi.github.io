/**
 * Kiln loading: R5 destinations, sequential load validation, loading, Reworking Table,
 * Setter's Mark return, Kiln Furniture and Inverted Firing (L177–185, L287–290, L617,
 * L628–630, L647, R5, R8, R11; DESIGN §2.4, §11 Q3).
 *
 * - **Destinations (R5).** (a) an empty active Shared Kiln space not marked by another
 *   player's Setter's Mark; (b) your own gained, empty Imperial Kiln; (c) with Inverted
 *   Firing (T21) ready, for a Bowl, Plate or Brush Washer, an active space holding exactly 1
 *   of your ceramics, including one loaded earlier by the same action (R8).
 * - **Sequential simulation (R8).** `validateLoads` checks the loads in array order against a
 *   simulated kiln, so a later load sees the earlier ones. Per load: the ceramic → the
 *   Reworking Table Shape (L617 "first") → the destination, incl. Inverted Firing's Shape test
 *   on the reworked Shape → Kiln Furniture (`LoadSpec` JSDoc).
 * - **Placement legality (§11 Q3 default, audit P3).** `hasAnyLegalLoad` looks only at each
 *   Shaped vessel's current Shape, never at a Shape Reworking Table could produce.
 * - **Kiln Furniture (R8)** sits on the space: every ceramic in that space uses its modifier.
 * - **Iteration order.** Spaces are iterated through `KILN_SPACE_IDS` and ceramics by
 *   sequence, never through `Record` keys (DESIGN §2.3).
 *
 * Layer 3 (imports layers 0–2 only).
 */

import { FIRING, GLAZES, KILN_SPACE_IDS, TECHS, zoneModifier } from "./content.ts";
import { invariant, ruleError } from "./errors.ts";
import {
  ceramic,
  ceramicsOf,
  emit,
  imperialKilnCeramic,
  lookup,
  player,
  returnVesselCard,
  takeVesselCard,
} from "./state.ts";
import { markTechUsed, ownsTech, techReady } from "./techs.ts";
import type {
  ActorView,
  CeramicId,
  GameRuleError,
  GameState,
  KilnFurnitureModifier,
  KilnSpaceId,
  LoadDestinationOption,
  LoadPlacement,
  LoadSpec,
  LoadedCeramic,
  PlayerId,
  PlayerState,
  PlayerView,
  PublicCore,
  ResolveContext,
  Shape,
  TechId,
} from "./types.ts";

const REWORKING_TABLE: TechId = "T05";
const KILN_FURNITURE: TechId = "T15";
const INVERTED_FIRING: TechId = "T21";

/** The Shapes Inverted Firing may stack (T21 params: Bowl, Plate, Brush Washer). */
function stackableShapes(): readonly Shape[] {
  return TECHS.T21.params.shapes;
}

// ── Destination tests (public information only) ──────────────────────────────────────

/**
 * R5a: the space is active, empty, and not held by another player's Setter's Mark (L630).
 * Your own Setter's Mark leaves the space open to you.
 */
export function sharedSpaceOpenFor(game: PublicCore, playerId: PlayerId, space: KilnSpaceId): boolean {
  const state = lookup(game.sharedKiln.spaces, space);
  if (state === undefined || !state.active || state.ceramicIds.length > 0) {
    return false;
  }
  return state.setterMarkOwnerId === null || state.setterMarkOwnerId === playerId;
}

/**
 * R5c / R8, space half: the space is active and holds exactly 1 ceramic, which is
 * `playerId`'s. Kiln Furniture in the space does not prevent stacking (R8: both ceramics
 * then use its modifier). Inverted Firing's readiness and the Bowl/Plate/Brush Washer test
 * are separate (`hasAnyLegalLoad`, `validateLoads`).
 */
export function invertedFiringTarget(game: PublicCore, playerId: PlayerId, space: KilnSpaceId): boolean {
  const state = lookup(game.sharedKiln.spaces, space);
  if (state === undefined || !state.active || state.ceramicIds.length !== 1) {
    return false;
  }
  const only = state.ceramicIds[0];
  return only !== undefined && lookup(game.ceramics, only)?.ownerId === playerId;
}

/** R5b: the player has gained the Imperial Kiln (L285) and it holds no ceramic this firing
 * (L184, L287). */
export function imperialKilnEmpty(game: PublicCore, playerId: PlayerId): boolean {
  return player(game, playerId).imperial.kilnGained && imperialKilnCeramic(game, playerId) === null;
}

/**
 * Glaze & Load placement legality (L183, R5): at least 1 Shaped vessel with a legal
 * destination (a), (b) or (c). Current Shapes only (DESIGN §11 Q3 default): a Vase that
 * Reworking Table could turn into a Bowl does not make an Inverted Firing target count.
 */
export function hasAnyLegalLoad(game: PublicCore, playerId: PlayerId): boolean {
  const shaped = ceramicsOf(game, playerId, "shaped");
  if (shaped.length === 0) {
    return false;
  }
  if (KILN_SPACE_IDS.some((space) => sharedSpaceOpenFor(game, playerId, space))) {
    return true;
  }
  if (imperialKilnEmpty(game, playerId)) {
    return true;
  }
  if (!techReady(player(game, playerId), INVERTED_FIRING)) {
    return false;
  }
  const stackable = stackableShapes();
  return (
    shaped.some((vessel) => stackable.includes(vessel.shape)) &&
    KILN_SPACE_IDS.some((space) => invertedFiringTarget(game, playerId, space))
  );
}

// ── Sequential load simulation (R8) ──────────────────────────────────────────────────

interface SimulatedSpace {
  active: boolean;
  /** Loading order. */
  ceramicIds: CeramicId[];
  setterMarkOwnerId: PlayerId | null;
  kilnFurniture: { ownerId: PlayerId; modifier: KilnFurnitureModifier } | null;
}

interface LoadSimulation {
  /** Looked up by key only, never iterated (DESIGN §2.3). */
  spaces: Partial<Record<KilnSpaceId, SimulatedSpace>>;
  imperialOccupied: boolean;
  reworkUsed: boolean;
  furnitureUsed: boolean;
  invertedUsed: boolean;
  /** Ceramics loaded by earlier loads of this command, in order. */
  loaded: CeramicId[];
}

function startSimulation(game: PublicCore, playerId: PlayerId): LoadSimulation {
  const spaces: Partial<Record<KilnSpaceId, SimulatedSpace>> = {};
  for (const id of KILN_SPACE_IDS) {
    const space = game.sharedKiln.spaces[id];
    spaces[id] = {
      active: space.active,
      ceramicIds: [...space.ceramicIds],
      setterMarkOwnerId: space.setterMarkOwnerId,
      kilnFurniture:
        space.kilnFurniture === null ? null : { ownerId: space.kilnFurniture.ownerId, modifier: space.kilnFurniture.modifier },
    };
  }
  return {
    spaces,
    imperialOccupied: imperialKilnCeramic(game, playerId) !== null,
    reworkUsed: false,
    furnitureUsed: false,
    invertedUsed: false,
    loaded: [],
  };
}

/** Owned, ready this round, and not already used by an earlier load of this command. */
function techUseError(p: PlayerState, techId: TechId, usedInCommand: boolean, field: string): GameRuleError | null {
  if (!ownsTech(p, techId)) {
    return ruleError("TECH_NOT_OWNED", `You do not own ${TECHS[techId].name}.`, { techId, field });
  }
  if (!techReady(p, techId) || usedInCommand) {
    return ruleError("TECH_ALREADY_USED", `${TECHS[techId].name} has already been used this round.`, { techId, field });
  }
  return null;
}

/** Checks one load against the simulation and, when legal, applies it to the simulation. */
function simulateLoad(
  game: PublicCore,
  playerId: PlayerId,
  sim: LoadSimulation,
  spec: LoadSpec,
  index: number,
  loadedBy: LoadedCeramic["loadedBy"],
): GameRuleError | null {
  const field = `loads[${index}]`;
  const p = player(game, playerId);

  // 1. The ceramic: your Shaped vessel, not already loaded by this command.
  const target = lookup(game.ceramics, spec.ceramicId);
  if (target === undefined) {
    return ruleError("CERAMIC_NOT_FOUND", "That ceramic does not exist.", { ceramicId: spec.ceramicId, field });
  }
  if (target.ownerId !== playerId) {
    return ruleError("CERAMIC_NOT_OWNED", "That ceramic is not yours.", { ceramicId: spec.ceramicId, field });
  }
  if (sim.loaded.includes(target.id)) {
    return ruleError("DUPLICATE_CERAMIC", "The same vessel cannot be loaded twice.", { ceramicId: target.id, field });
  }
  if (target.stage !== "shaped") {
    return ruleError("ILLEGAL_CERAMIC_STAGE", "Only a Shaped vessel can be glazed and loaded.", {
      ceramicId: target.id,
      stage: target.stage,
      expectedStage: "shaped",
      field,
    });
  }

  // 2. Reworking Table (T05, L617): the Shape every later check uses.
  let shape: Shape = target.shape;
  if (spec.reworkShape !== undefined) {
    const error = techUseError(p, REWORKING_TABLE, sim.reworkUsed, `${field}.reworkShape`);
    if (error !== null) {
      return error;
    }
    if (spec.reworkShape === target.shape) {
      return ruleError("INVALID_VESSEL_CHOICE", "Reworking Table changes the Shape to a different Shape.", {
        ceramicId: target.id,
        shape: spec.reworkShape,
        field: `${field}.reworkShape`,
      });
    }
    shape = spec.reworkShape;
  }

  // The Glaze is a free choice at loading (L344); only its value is checked.
  if (!GLAZES.includes(spec.glaze)) {
    return ruleError("INVALID_CHOICE", "Choose White, Celadon, Grey-Green or Moon White.", {
      value: String(spec.glaze),
      field: `${field}.glaze`,
    });
  }

  // 3. The destination (R5), incl. Inverted Firing's Shape test on the reworked Shape.
  const destination = spec.destination;
  let furnitureSpace: SimulatedSpace | null = null;
  if (destination.kiln === "imperial") {
    if (!p.imperial.kilnGained || sim.imperialOccupied) {
      return ruleError("IMPERIAL_KILN_UNAVAILABLE", "Your Imperial Kiln is not gained or already holds a ceramic.", {
        ceramicId: target.id,
        field: `${field}.destination`,
      });
    }
    if (!FIRING.imperialModifiers.includes(destination.imperialModifier)) {
      return ruleError("INVALID_CHOICE", "The Imperial modifier must be −1, 0 or +1.", {
        value: destination.imperialModifier,
        field: `${field}.destination.imperialModifier`,
      });
    }
    sim.imperialOccupied = true;
  } else {
    if (loadedBy === "imperial_priority") {
      return ruleError("INVALID_CHOICE", "Imperial Priority loads only into your Imperial Kiln.", {
        ceramicId: target.id,
        field: `${field}.destination`,
      });
    }
    const space = lookup(sim.spaces, destination.spaceId);
    if (space === undefined || !space.active) {
      return ruleError("KILN_SPACE_UNAVAILABLE", "That Shared Kiln space is covered.", {
        spaceId: String(destination.spaceId),
        field: `${field}.destination`,
      });
    }
    if (space.setterMarkOwnerId !== null && space.setterMarkOwnerId !== playerId) {
      return ruleError("KILN_SPACE_MARKED", "Another player's Setter's Mark holds this space this round.", {
        spaceId: destination.spaceId,
        ownerId: space.setterMarkOwnerId,
        field: `${field}.destination`,
      });
    }
    if (destination.invertedFiring === true) {
      const error = techUseError(p, INVERTED_FIRING, sim.invertedUsed, `${field}.destination.invertedFiring`);
      if (error !== null) {
        return error;
      }
      const below = space.ceramicIds.length === 1 ? space.ceramicIds[0] : undefined;
      if (below === undefined || lookup(game.ceramics, below)?.ownerId !== playerId) {
        return ruleError(
          "INVERTED_FIRING_INVALID",
          "Inverted Firing needs an active space holding exactly 1 of your ceramics.",
          { spaceId: destination.spaceId, ceramicId: target.id, field: `${field}.destination` },
        );
      }
      if (!stackableShapes().includes(shape)) {
        return ruleError("INVERTED_FIRING_INVALID", "Inverted Firing stacks only a Bowl, Plate or Brush Washer.", {
          spaceId: destination.spaceId,
          ceramicId: target.id,
          shape,
          field: `${field}.destination`,
        });
      }
      sim.invertedUsed = true;
    } else if (space.ceramicIds.length > 0) {
      return ruleError("KILN_SPACE_UNAVAILABLE", "That Shared Kiln space already holds a ceramic.", {
        spaceId: destination.spaceId,
        ceramicId: target.id,
        field: `${field}.destination`,
      });
    }

    // 4. Kiln Furniture (T15, L628, L647): Shared Kiln only, beneath this ceramic.
    if (destination.kilnFurniture !== undefined) {
      const error = techUseError(p, KILN_FURNITURE, sim.furnitureUsed, `${field}.destination.kilnFurniture`);
      if (error !== null) {
        return error;
      }
      if (!TECHS.T15.params.modifiers.includes(destination.kilnFurniture)) {
        return ruleError("INVALID_CHOICE", "Kiln Furniture's modifier must be −1, 0 or +1.", {
          value: destination.kilnFurniture,
          field: `${field}.destination.kilnFurniture`,
        });
      }
      // One tile per owner (L83). It is returned after every firing, so a ready tile is
      // normally in hand; refuse rather than move a tile that is still on the kiln.
      const tileOnKiln = KILN_SPACE_IDS.some((id) => lookup(sim.spaces, id)?.kilnFurniture?.ownerId === playerId);
      if (tileOnKiln) {
        return ruleError("TECH_ALREADY_USED", "Your Kiln Furniture tile is already in the kiln.", {
          techId: KILN_FURNITURE,
          field: `${field}.destination.kilnFurniture`,
        });
      }
      sim.furnitureUsed = true;
      furnitureSpace = space;
    }

    space.ceramicIds.push(target.id);
    if (space.setterMarkOwnerId === playerId) {
      space.setterMarkOwnerId = null;
    }
    if (furnitureSpace !== null && destination.kilnFurniture !== undefined) {
      furnitureSpace.kilnFurniture = { ownerId: playerId, modifier: destination.kilnFurniture };
    }
  }

  if (spec.reworkShape !== undefined) {
    sim.reworkUsed = true;
  }
  sim.loaded.push(target.id);
  return null;
}

function simulateLoads(
  game: PublicCore,
  playerId: PlayerId,
  loads: readonly LoadSpec[],
  loadedBy: LoadedCeramic["loadedBy"],
): { error: GameRuleError | null; sim: LoadSimulation } {
  const sim = startSimulation(game, playerId);
  for (const [index, spec] of loads.entries()) {
    const error = simulateLoad(game, playerId, sim, spec, index, loadedBy);
    if (error !== null) {
      return { error, sim };
    }
  }
  return { error: null, sim };
}

function validateLoadsFor(
  game: PublicCore,
  playerId: PlayerId,
  loads: readonly LoadSpec[],
  maxLoads: number,
  loadedBy: LoadedCeramic["loadedBy"],
): GameRuleError | null {
  if (loads.length === 0) {
    return ruleError("INVALID_CHOICE", "Load at least 1 vessel (\"up to\" means 1 or more, never 0).", {
      field: "loads",
      value: 0,
    });
  }
  if (loads.length > maxLoads) {
    return ruleError("TOO_MANY_VESSELS", `This action loads at most ${maxLoads} vessel(s).`, {
      limit: maxLoads,
      count: loads.length,
    });
  }
  return simulateLoads(game, playerId, loads, loadedBy).error;
}

/**
 * Validates 1–`maxLoads` loads for the viewer, in array order against a simulated kiln (R8).
 * Per load: ceramic → `reworkShape` → destination (incl. the Inverted Firing Shape test on the
 * reworked Shape) → Kiln Furniture. Reworking Table, Inverted Firing and Kiln Furniture may
 * each appear at most once across the loads. `loadedBy: "imperial_priority"` allows only the
 * Imperial Kiln (L293). Placement legality (`hasAnyLegalLoad`) is the caller's check.
 */
export function validateLoads(
  view: ActorView,
  loads: readonly LoadSpec[],
  maxLoads: number,
  loadedBy: LoadedCeramic["loadedBy"],
): GameRuleError | null {
  return validateLoadsFor(view.game, view.viewerId, loads, maxLoads, loadedBy);
}

// ── Resolution ───────────────────────────────────────────────────────────────────────

/**
 * Reworking Table (T05, L617): consumes its once-per-round use (`TECH_USED`), returns the
 * Vessel card (a proxy vanishes), takes one of the new Shape (or a proxy, L329) and changes
 * the Shape. No Clay is paid; the Decoration stays. Emits `CERAMIC_RESHAPED`. Callers validate
 * first (`validateLoads`, or Imperial Priority's validator, §11 Q1).
 */
export function reworkShape(draft: GameState, ceramicId: CeramicId, shape: Shape, ctx: ResolveContext): void {
  const target = ceramic(draft, ceramicId);
  invariant(target.stage === "shaped", `Only a Shaped vessel can be reworked, ${ceramicId} is ${target.stage}`);
  invariant(target.shape !== shape, `Reworking ${ceramicId} must change its Shape`);
  markTechUsed(draft, target.ownerId, REWORKING_TABLE, ctx);
  const from = target.shape;
  returnVesselCard(draft, target.vesselInstanceId);
  target.vesselInstanceId = takeVesselCard(draft, shape);
  target.shape = shape;
  emit(ctx, { type: "CERAMIC_RESHAPED", playerId: target.ownerId, ceramicId, from, to: shape });
}

/**
 * Loads one validated vessel and returns it. Events in order: Reworking Table (`TECH_USED`,
 * `CERAMIC_RESHAPED`); Inverted Firing (`TECH_USED`); `CERAMIC_LOADED` (the Imperial modifier
 * is public, R11); the owner's Setter's Mark returned when they load there
 * (`SETTERS_MARK_RETURNED`, L630); Kiln Furniture (`TECH_USED`, `KILN_FURNITURE_PLACED`).
 */
export function loadCeramic(
  draft: GameState,
  playerId: PlayerId,
  spec: LoadSpec,
  loadedBy: LoadedCeramic["loadedBy"],
  ctx: ResolveContext,
): LoadedCeramic {
  const before = ceramic(draft, spec.ceramicId);
  invariant(before.stage === "shaped" && before.ownerId === playerId, `${spec.ceramicId} is not ${playerId}'s Shaped vessel`);
  if (spec.reworkShape !== undefined) {
    reworkShape(draft, spec.ceramicId, spec.reworkShape, ctx);
  }
  const shaped = ceramic(draft, spec.ceramicId);
  invariant(shaped.stage === "shaped", `${spec.ceramicId} must still be Shaped`);

  const destination = spec.destination;
  let placement: LoadPlacement;
  if (destination.kiln === "imperial") {
    invariant(imperialKilnEmpty(draft, playerId), `${playerId}'s Imperial Kiln is not available`);
    placement = { kiln: "imperial", imperialModifier: destination.imperialModifier };
  } else {
    invariant(loadedBy === "glaze_load", "Only a Glaze & Load action loads into the Shared Kiln");
    const space = draft.sharedKiln.spaces[destination.spaceId];
    const stacked = destination.invertedFiring === true;
    invariant(space.active, `${destination.spaceId} is covered`);
    invariant(
      stacked ? invertedFiringTarget(draft, playerId, destination.spaceId) : space.ceramicIds.length === 0,
      `${destination.spaceId} cannot take ${spec.ceramicId}`,
    );
    if (stacked) {
      markTechUsed(draft, playerId, INVERTED_FIRING, ctx);
    }
    placement = { kiln: "shared", spaceId: destination.spaceId, stacked };
    space.ceramicIds.push(shaped.id);
  }

  const { stage: _stage, ...core } = shaped;
  const loaded: LoadedCeramic = {
    ...core,
    stage: "loaded",
    glaze: spec.glaze,
    loadedInRound: draft.round,
    loadedBy,
    placement,
    heatMarker: null,
  };
  draft.ceramics[loaded.id] = loaded;
  emit(ctx, {
    type: "CERAMIC_LOADED",
    playerId,
    ceramicId: loaded.id,
    glaze: loaded.glaze,
    placement: { ...placement },
    loadedBy,
  });

  if (destination.kiln === "shared") {
    const space = draft.sharedKiln.spaces[destination.spaceId];
    if (space.setterMarkOwnerId === playerId) {
      space.setterMarkOwnerId = null;
      emit(ctx, { type: "SETTERS_MARK_RETURNED", playerId, spaceId: destination.spaceId, cause: "loaded_there" });
    }
    if (destination.kilnFurniture !== undefined) {
      markTechUsed(draft, playerId, KILN_FURNITURE, ctx);
      space.kilnFurniture = { ownerId: playerId, modifier: destination.kilnFurniture, underCeramicId: loaded.id };
      emit(ctx, {
        type: "KILN_FURNITURE_PLACED",
        playerId,
        spaceId: destination.spaceId,
        modifier: destination.kilnFurniture,
      });
    }
  }
  return loaded;
}

// ── Options (re-exported by `selectors.ts`, DESIGN §5.4) ─────────────────────────────

function candidateDestinations(): Array<LoadSpec["destination"]> {
  const candidates: Array<LoadSpec["destination"]> = [];
  const furniture = TECHS.T15.params.modifiers;
  for (const spaceId of KILN_SPACE_IDS) {
    for (const invertedFiring of [false, true]) {
      const base = invertedFiring ? { kiln: "shared" as const, spaceId, invertedFiring } : { kiln: "shared" as const, spaceId };
      candidates.push(base);
      for (const kilnFurniture of furniture) {
        candidates.push({ ...base, kilnFurniture });
      }
    }
  }
  for (const imperialModifier of FIRING.imperialModifiers) {
    candidates.push({ kiln: "imperial", imperialModifier });
  }
  return candidates;
}

/**
 * Every destination `validateLoads` accepts for `ceramicId` after `earlierLoads` of the same
 * Glaze & Load action (R8), optionally after a Reworking Table Shape change. Order: Shared
 * spaces in `KILN_SPACE_IDS` order (plain, each Kiln Furniture modifier, then the Inverted
 * Firing variants), then the Imperial Kiln for each modifier. Empty when the earlier loads,
 * the ceramic or the rework are not legal. `modifier` is the one this ceramic would use: the
 * chosen Imperial or Kiln Furniture modifier, a Kiln Furniture tile already in the space
 * (R8), else the printed zone modifier.
 */
export function loadDestinationOptions(
  view: PlayerView,
  playerId: PlayerId,
  ceramicId: CeramicId,
  earlierLoads: readonly LoadSpec[],
  reworkShape?: Shape,
): LoadDestinationOption[] {
  const game = view.game;
  if (lookup(game.players, playerId) === undefined) {
    return [];
  }
  const earlier = simulateLoads(game, playerId, earlierLoads, "glaze_load");
  if (earlier.error !== null) {
    return [];
  }
  const options: LoadDestinationOption[] = [];
  for (const destination of candidateDestinations()) {
    const candidate: LoadSpec = {
      ceramicId,
      glaze: "white",
      destination,
      ...(reworkShape === undefined ? {} : { reworkShape }),
    };
    if (simulateLoads(game, playerId, [...earlierLoads, candidate], "glaze_load").error !== null) {
      continue;
    }
    if (destination.kiln === "imperial") {
      options.push({
        destination,
        modifier: destination.imperialModifier,
        requiresInvertedFiring: false,
        returnsSettersMark: false,
      });
      continue;
    }
    const space = earlier.sim.spaces[destination.spaceId];
    invariant(space !== undefined, `Unknown space ${destination.spaceId}`);
    options.push({
      destination,
      modifier: destination.kilnFurniture ?? space.kilnFurniture?.modifier ?? zoneModifier(destination.spaceId),
      requiresInvertedFiring: destination.invertedFiring === true,
      returnsSettersMark: space.setterMarkOwnerId === playerId,
    });
  }
  return options;
}
