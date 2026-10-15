/**
 * One scenario per Advanced Tech and Kiln Tradition (DESIGN §8.2 `tech_matrix`,
 * `optional_abilities`). Each case builds a table at a decision where the ability can be
 * used, and names the canonical command that uses it and (for optional abilities) the
 * command of the same decision that declines it. The tests find both commands through
 * `legalCommands(view, {mode: "canonical"})`, so they also prove that the enumerator offers
 * every optional ability both used and declined (DESIGN §5.2).
 */

import { computeFinalResult } from "../../../src/game/scoring.ts";
import { player } from "../../../src/game/state.ts";
import { techReady } from "../../../src/game/techs.ts";
import type { AuthoritativeCommand, GameEvent, GameState, KilnId, PlayerId, TechId } from "../../../src/game/types.ts";
import { buildState, type StateSpec } from "./support/fixtures.ts";
import { openFiringTable, tendAll } from "./support/firing.ts";
import { LocalTable } from "./support/localTable.ts";

export interface AbilityCase {
  ability: TechId | KilnId;
  /** Why the ability has no "declined" command (automatic or mandatory, R4), if so. */
  notOptional?: string;
  /** A table at the decision where the ability may be used; `actor` decides now. */
  table(): LocalTable;
  actor: PlayerId;
  /** The canonical command that uses the ability. */
  uses(command: AuthoritativeCommand): boolean;
  /** The canonical command of the same decision that declines it (optional abilities). */
  declines?(command: AuthoritativeCommand): boolean;
  /** Runs anything still needed after the command before the evidence shows (e.g. the
   * other players' Contributions); returns the extra events. */
  after?(table: LocalTable): GameEvent[];
  /** The ability resolved, from the events of the command (and `after`). */
  used(events: readonly GameEvent[], state: GameState): boolean;
  /** The once-per-round use is still available (R4). */
  ready(state: GameState): boolean;
}

const P1 = "p1";

function hasEvent(events: readonly GameEvent[], predicate: (event: GameEvent) => boolean): boolean {
  return events.some(predicate);
}

function techUsed(events: readonly GameEvent[], techId: TechId): boolean {
  return hasEvent(events, (e) => e.type === "TECH_USED" && e.techId === techId && e.playerId === P1);
}

function kilnUsed(events: readonly GameEvent[], kilnId: KilnId): boolean {
  return hasEvent(events, (e) => e.type === "KILN_ABILITY_USED" && e.kilnId === kilnId && e.playerId === P1);
}

function techIsReady(techId: TechId): (state: GameState) => boolean {
  return (state) => techReady(player(state, P1), techId);
}

function kilnIsReady(state: GameState): boolean {
  return !player(state, P1).kilnAbilityUsedThisRound;
}

function workTable(spec: StateSpec): LocalTable {
  return new LocalTable(buildState(spec));
}

/** The Order Phase with p1 to act; the hand-over at its end halts, so no new round readies
 * abilities behind the test's back. */
function ordersTable(spec: StateSpec): LocalTable {
  return new LocalTable(buildState({ ...spec, phase: { type: "orders", turnOrder: ["p1", "p2"], index: 0 } }), { flow: "halt", pass: ["worker_action_done"] });
}

/** A firing table after everyone has submitted Tend; Base Heat 2, first Fire card 0. */
function firedTable(spec: StateSpec): LocalTable {
  const table = openFiringTable({ fireDeck: [0, 0], ...spec });
  tendAll(table);
  return table;
}

const RICH = { clay: 9, wood: 9, coins: 9 };

const isType =
  <T extends AuthoritativeCommand["type"]>(type: T, predicate: (command: Extract<AuthoritativeCommand, { type: T }>) => boolean = () => true) =>
  (command: AuthoritativeCommand): boolean =>
    command.type === type && predicate(command as Extract<AuthoritativeCommand, { type: T }>);

/**
 * Two players, p1 First Player. Kilns default to p1 = RU, p2 = GU unless a case says otherwise.
 * Ceramic temperatures at Base Heat 2 + Fire 0: Celadon Middle → Masterpiece, White Middle →
 * Fine, Moon White Middle → Standard, Moon White Low → Flawed.
 */
export const ABILITY_CASES: readonly AbilityCase[] = [
  // ── Workshop ─────────────────────────────────────────────────────────────────────
  {
    ability: "T01",
    actor: P1,
    table: () => workTable({ players: [{ techs: ["T01"], resources: { clay: 1, coins: 2 } }, {}] }),
    uses: isType("PLACE_FORM_DECORATE", (a) => a.useLargeThrowingWheel === true),
    declines: isType("PLACE_FORM_DECORATE", (a) => a.useLargeThrowingWheel !== true),
    used: (events) => techUsed(events, "T01"),
    ready: techIsReady("T01"),
  },
  {
    ability: "T16",
    actor: P1,
    table: () => workTable({ players: [{ techs: ["T16"], resources: { clay: 1, coins: 2 } }, {}] }),
    uses: isType("PLACE_FORM_DECORATE", (a) => a.decoratorsKitVesselIndex !== undefined),
    declines: isType("PLACE_FORM_DECORATE", (a) => a.decoratorsKitVesselIndex === undefined && a.vessels.some((v) => v.decoration !== "plain")),
    used: (events) => techUsed(events, "T16"),
    ready: techIsReady("T16"),
  },
  {
    ability: "T05",
    actor: P1,
    table: () => workTable({ players: [{ techs: ["T05"] }, {}], ceramics: [{ owner: P1, stage: "shaped", shape: "vase" }] }),
    uses: isType("PLACE_GLAZE_LOAD", (a) => a.loads.some((load) => load.reworkShape !== undefined)),
    declines: isType("PLACE_GLAZE_LOAD", (a) => a.loads.every((load) => load.reworkShape === undefined)),
    used: (events) => techUsed(events, "T05") && hasEvent(events, (e) => e.type === "CERAMIC_RESHAPED"),
    ready: techIsReady("T05"),
  },
  {
    ability: "T17",
    actor: P1,
    table: () => workTable({ players: [{ techs: ["T17"], resources: RICH }, {}] }),
    uses: isType("PLACE_MATERIALS_YARD", (a) => a.preparedClay !== undefined),
    declines: isType("PLACE_MATERIALS_YARD", (a) => a.preparedClay === undefined),
    used: (events) => techUsed(events, "T17") && hasEvent(events, (e) => e.type === "CERAMIC_FORMED" && e.formedBy === "prepared_clay"),
    ready: techIsReady("T17"),
  },
  {
    ability: "T18",
    actor: P1,
    table: () => workTable({ players: [{ techs: ["T18"] }, {}] }),
    uses: isType("PLACE_MATERIALS_YARD", (a) => a.seniorApprentice === true),
    declines: isType("PLACE_MATERIALS_YARD", (a) => a.seniorApprentice !== true && a.workerId.includes("apprentice")),
    used: (events) => techUsed(events, "T18") && hasEvent(events, (e) => e.type === "WORKER_PLACED" && e.viaSeniorApprentice && e.effect === "shifu"),
    ready: techIsReady("T18"),
  },
  {
    ability: "T19",
    notOptional: "Connoisseur's Cabinet scores automatically at game end (L620)",
    actor: P1,
    table: () =>
      new LocalTable(
        buildState({
          players: [{ techs: ["T19"] }, {}],
          ceramics: [
            { owner: P1, stage: "finished", shape: "bowl", glaze: "white", quality: "fine" },
            { owner: P1, stage: "finished", shape: "plate", glaze: "celadon", quality: "masterpiece" },
          ],
        }),
      ),
    uses: () => false,
    used: (_events, state) => (computeFinalResult(state).scores[P1]?.connoisseur ?? 0) === 2,
    ready: () => true,
  },
  // ── Glazing & Loading ────────────────────────────────────────────────────────────
  {
    ability: "T10",
    notOptional: "Colour Samples' reservation is mandatory when a Main Order can be looked at (R4)",
    actor: P1,
    table: () => workTable({ players: [{ resources: RICH }, {}], techDisplay: { glazing_loading: ["T10", "T20"] } }),
    uses: isType("PLACE_GUILD_HALL", (a) => a.choice.kind === "buy_face_up" && a.choice.techId === "T10"),
    used: (events) => hasEvent(events, (e) => e.type === "PRIVATE_LOOK_OPENED" && e.kind === "colour_samples"),
    ready: () => true,
  },
  {
    ability: "T20",
    notOptional: "Kiln Tending is automatic after the first Glaze & Load action each round (INT)",
    actor: P1,
    table: () => workTable({ players: [{ techs: ["T20"] }, {}], ceramics: [{ owner: P1, stage: "shaped", shape: "bowl" }] }),
    uses: isType("PLACE_GLAZE_LOAD"),
    used: (events) => techUsed(events, "T20") && hasEvent(events, (e) => e.type === "RESOURCES_CHANGED" && e.reason === "kiln_tending"),
    ready: techIsReady("T20"),
  },
  {
    ability: "T15",
    actor: P1,
    table: () => workTable({ players: [{ techs: ["T15"] }, {}], ceramics: [{ owner: P1, stage: "shaped", shape: "bowl" }] }),
    uses: isType("PLACE_GLAZE_LOAD", (a) => a.loads.some((l) => l.destination.kiln === "shared" && l.destination.kilnFurniture !== undefined)),
    declines: isType("PLACE_GLAZE_LOAD", (a) => a.loads.every((l) => l.destination.kiln === "shared" && l.destination.kilnFurniture === undefined)),
    used: (events) => techUsed(events, "T15") && hasEvent(events, (e) => e.type === "KILN_FURNITURE_PLACED"),
    ready: techIsReady("T15"),
  },
  {
    ability: "T21",
    actor: P1,
    table: () =>
      workTable({
        players: [{ techs: ["T21"] }, {}],
        ceramics: [
          { owner: P1, stage: "loaded", shape: "plate", glaze: "white", at: "low_1" },
          { owner: P1, stage: "shaped", shape: "bowl" },
        ],
      }),
    uses: isType("PLACE_GLAZE_LOAD", (a) => a.loads.some((l) => l.destination.kiln === "shared" && l.destination.invertedFiring === true)),
    declines: isType("PLACE_GLAZE_LOAD", (a) => a.loads.every((l) => l.destination.kiln === "shared" && l.destination.invertedFiring !== true)),
    used: (events) => techUsed(events, "T21") && hasEvent(events, (e) => e.type === "CERAMIC_LOADED" && e.placement.kiln === "shared" && e.placement.stacked),
    ready: techIsReady("T21"),
  },
  {
    ability: "T22",
    actor: P1,
    table: () => workTable({ players: [{ techs: ["T22"] }, {}], phase: { type: "round_start_setters_mark", queue: { actorIds: [P1], index: 0 } } }),
    uses: isType("PLACE_SETTERS_MARK", (a) => a.spaceId !== null),
    declines: isType("PLACE_SETTERS_MARK", (a) => a.spaceId === null),
    used: (events) => techUsed(events, "T22") && hasEvent(events, (e) => e.type === "SETTERS_MARK_PLACED" && e.spaceId !== null),
    ready: techIsReady("T22"),
  },
  {
    ability: "T23",
    actor: P1,
    table: () =>
      workTable({
        players: [{ techs: ["T23"], hand: ["O01"] }, {}],
        ceramics: [{ owner: P1, stage: "finished", shape: "bowl", glaze: "white", quality: "standard" }],
      }),
    uses: isType("USE_CANAL_BARGE"),
    declines: isType("PLACE_CANAL_WHARF"),
    used: (events) => techUsed(events, "T23") && hasEvent(events, (e) => e.type === "ORDER_COMPLETED" && e.record.via === "canal_barge"),
    ready: techIsReady("T23"),
  },
  // ── Firing ───────────────────────────────────────────────────────────────────────
  {
    ability: "T11",
    actor: P1,
    table: () =>
      firedTable({
        players: [{ techs: ["T11"] }, {}],
        ceramics: [{ owner: P1, stage: "loaded", shape: "bowl", glaze: "moon_white", at: "middle_1" }],
      }),
    uses: isType("USE_PROTECTIVE_SAGGARS"),
    declines: isType("END_AFTER_QUALITY"),
    used: (events) => techUsed(events, "T11") && hasEvent(events, (e) => e.type === "QUALITY_IMPROVED" && e.cause === "protective_saggars"),
    ready: techIsReady("T11"),
  },
  {
    ability: "T12",
    actor: P1,
    table: () =>
      openFiringTable({
        players: [{ techs: ["T12"] }, {}],
        ceramics: [
          { owner: P1, stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
          { owner: "p2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
        ],
      }),
    uses: isType("SUBMIT_CONTRIBUTION", (c) => c.fuelLedger),
    declines: isType("SUBMIT_CONTRIBUTION", (c) => !c.fuelLedger && c.card !== "TEND"),
    after: (table) => tendAll(table),
    used: (events) => hasEvent(events, (e) => e.type === "CONTRIBUTIONS_REVEALED" && Math.abs(e.contributions[P1]?.heat ?? 0) === 2),
    ready: (state) => player(state, P1).techs.some((t) => t.id === "T12" && !t.usedThisRound),
  },
  {
    ability: "T13",
    actor: P1,
    table: () =>
      firedTable({
        players: [{ techs: ["T13"] }, {}],
        ceramics: [{ owner: P1, stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" }],
      }),
    uses: isType("TEST_PIECES_DECIDE", (a) => a.peek),
    declines: isType("TEST_PIECES_DECIDE", (a) => !a.peek),
    used: (events) => techUsed(events, "T13") && hasEvent(events, (e) => e.type === "TEST_PIECES_PEEKED"),
    ready: techIsReady("T13"),
  },
  {
    ability: "T14",
    actor: P1,
    table: () =>
      firedTable({
        players: [{ techs: ["T14"] }, {}],
        ceramics: [{ owner: P1, stage: "loaded", shape: "bowl", glaze: "moon_white", at: "middle_1" }],
      }),
    uses: isType("USE_SECOND_FIRING"),
    declines: isType("END_AFTER_QUALITY"),
    used: (events) => techUsed(events, "T14") && hasEvent(events, (e) => e.type === "SECOND_FIRING_REVEALED"),
    ready: techIsReady("T14"),
  },
  {
    ability: "T24",
    actor: P1,
    table: () =>
      firedTable({
        players: [{ techs: ["T24"] }, {}],
        ceramics: [{ owner: P1, stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" }],
      }),
    uses: isType("RESOLVE_HEAT_MARKERS", (a) => a.kilnMaster !== undefined),
    declines: isType("RESOLVE_HEAT_MARKERS", (a) => a.kilnMaster === undefined),
    used: (events) => techUsed(events, "T24") && hasEvent(events, (e) => e.type === "KILN_MASTER_PLACED"),
    ready: techIsReady("T24"),
  },
  {
    ability: "T25",
    actor: P1,
    table: () =>
      ordersTable({
        players: [{ techs: ["T25"], kilnId: "GE", hand: ["O18"] }, { kilnId: "DI" }],
        ceramics: [{ owner: P1, stage: "finished", shape: "vase", glaze: "celadon", quality: "fine" }],
      }),
    uses: isType("COMPLETE_ORDER", (a) => a.declineTributeWare !== true),
    declines: isType("COMPLETE_ORDER", (a) => a.declineTributeWare === true),
    used: (events) => techUsed(events, "T25") && hasEvent(events, (e) => e.type === "RECOGNITION_ADVANCED" && e.source === "tribute_crown"),
    ready: techIsReady("T25"),
  },
  // ── Kiln Traditions ─────────────────────────────────────────────────────────────
  {
    ability: "RU",
    actor: P1,
    table: () =>
      ordersTable({
        players: [{ kilnId: "RU", hand: ["O22"] }, { kilnId: "GU" }],
        ceramics: [{ owner: P1, stage: "finished", shape: "bowl", glaze: "celadon", decoration: "plain", quality: "masterpiece" }],
      }),
    uses: isType("COMPLETE_ORDER", (a) => a.declineKilnAbility !== true),
    declines: isType("COMPLETE_ORDER", (a) => a.declineKilnAbility === true),
    used: (events, state) => kilnUsed(events, "RU") && player(state, P1).score.kilnAbilities === 4,
    ready: kilnIsReady,
  },
  {
    ability: "GU",
    actor: P1,
    table: () =>
      ordersTable({
        players: [{ kilnId: "GU", hand: ["O18"] }, { kilnId: "RU" }],
        ceramics: [{ owner: P1, stage: "finished", shape: "vase", glaze: "celadon", quality: "fine" }],
      }),
    uses: isType("COMPLETE_ORDER", (a) => a.declineKilnAbility !== true),
    declines: isType("COMPLETE_ORDER", (a) => a.declineKilnAbility === true),
    used: (events) => kilnUsed(events, "GU") && hasEvent(events, (e) => e.type === "RESOURCES_CHANGED" && e.reason === "guan"),
    ready: kilnIsReady,
  },
  {
    ability: "GE",
    actor: P1,
    table: () =>
      firedTable({
        players: [{ kilnId: "GE" }, { kilnId: "RU" }],
        ceramics: [{ owner: P1, stage: "loaded", shape: "bowl", glaze: "moon_white", at: "middle_1" }],
      }),
    uses: isType("USE_GE_CRACKLE"),
    declines: isType("END_AFTER_QUALITY"),
    used: (events) => kilnUsed(events, "GE") && hasEvent(events, (e) => e.type === "CRACKLE_APPLIED"),
    ready: kilnIsReady,
  },
  {
    ability: "DI",
    actor: P1,
    table: () => workTable({ players: [{ kilnId: "DI", resources: RICH }, { kilnId: "RU" }] }),
    uses: isType("PLACE_FORM_DECORATE", (a) => a.dingExtra !== undefined),
    declines: isType("PLACE_FORM_DECORATE", (a) => a.dingExtra === undefined && a.vessels.some((v) => v.shape === "bowl")),
    used: (events) => kilnUsed(events, "DI") && hasEvent(events, (e) => e.type === "CERAMIC_FORMED" && e.formedBy === "ding_extra"),
    ready: kilnIsReady,
  },
  {
    ability: "JU",
    actor: P1,
    table: () =>
      firedTable({
        players: [{ kilnId: "JU" }, { kilnId: "RU" }],
        ceramics: [{ owner: P1, stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" }],
      }),
    uses: isType("RESOLVE_JUN", (a) => a.adjustment !== null),
    declines: isType("RESOLVE_JUN", (a) => a.adjustment === null),
    used: (events) => kilnUsed(events, "JU") && hasEvent(events, (e) => e.type === "JUN_ADJUSTED"),
    ready: kilnIsReady,
  },
];

/** Applies a Contribution or an action on a `LocalTable`. */
export function applyCommand(table: LocalTable, actorId: PlayerId, command: AuthoritativeCommand): GameEvent[] {
  if (command.type === "SUBMIT_CONTRIBUTION") {
    return table.contribute(actorId, command.card, command.fuelLedger);
  }
  return table.act(actorId, command);
}
