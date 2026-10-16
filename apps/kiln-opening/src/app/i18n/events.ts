/**
 * Event text templates (UI_V1.6.1_ARCHITECTURE §5 gap 4, §8.3). Owner: B1 (shell, log, lobby).
 * Source: wireframe `evText`.
 *
 * - `EVENT_TEXT`: one template per `GameEventType`, exhaustive by type (a new engine event fails
 *   `typecheck` here). A template reads only `PublicGameEvent` fields.
 * - `OWN_EVENT_TEXT`: the own-secret variants (`ORDERS_DEALT`, `ORDER_RESERVED`,
 *   `PRIVATE_LOOK_OPENED`, `LOOKED_ORDERS_DISCARDED`, `TECHS_RETURNED_TO_BOTTOM`,
 *   `TEST_PIECES_PEEKED`, `HAND_TRIMMED`), which read `LogEntry.own`. `eventText` uses one only
 *   when the secret's `visibleTo` is the viewer, so no seat ever reads another seat's secret.
 * - `eventText(entry, context)`: the log line for one entry, in the translator's language.
 *
 * The text lives in the `shell` namespace (`shell.ev.*`). Names come from content (Techs, Kilns,
 * locations, Recognition milestones, Contribution cards) and the vocabularies. Ceramics are
 * described with `ceramicLabel` (D9), never by ID; printed Order numbers (S01, O33) stay.
 *
 * D3/D4: the log is the public history. It states a Fire card once turned, Base Heat, Global
 * Heat, each recorded Quality and its Heat Difference, and Jun's adjusted Actual Heat, exactly as
 * the table announces them; it never states a Fire-deck size or a preview. This is the only file
 * of `src/app` that may read the heat-calculation fields of past events (§2).
 */
import type {
  GameEvent,
  GameEventType,
  KilnSpaceId,
  OrderId,
  PlayerId,
  PublicGameEvent,
  ResourceChangeReason,
  ResourceKind,
  TechId,
} from "../../game/index.ts";
import type { LogEntry } from "../session/gameSource.ts";
import { ceramicFacts, ceramicLabel, kilnSpaceName, playerDisplayName } from "./ceramicLabel.ts";
import type { CeramicFacts, CeramicLabelView } from "./ceramicLabel.ts";
import {
  RULE_NUMBERS,
  contributionCardName,
  disciplineName,
  kilnText,
  locationName,
  qualityName,
  recognitionMilestones,
  resourceName,
  shapeName,
  techName,
  workerKindName,
} from "./content.ts";
import { list, signed } from "./format.ts";
import type { Translator } from "./translator.ts";

export interface EventTextContext {
  t: Translator;
  /** For player names and ceramic descriptions. */
  view: CeramicLabelView;
  viewerId: PlayerId | null;
}

export type EventTemplate<T extends GameEventType = GameEventType> = (
  event: Extract<PublicGameEvent, { type: T }>,
  context: EventTextContext,
) => string;

export type OwnEventTemplate<T extends GameEventType = GameEventType> = (
  event: Extract<GameEvent, { type: T }>,
  context: EventTextContext,
) => string;

/** The event types with an own-secret variant (§5 gap 4). */
export const OWN_SECRET_TYPES = [
  "ORDERS_DEALT",
  "ORDER_RESERVED",
  "PRIVATE_LOOK_OPENED",
  "LOOKED_ORDERS_DISCARDED",
  "TECHS_RETURNED_TO_BOTTOM",
  "TEST_PIECES_PEEKED",
  "HAND_TRIMMED",
] as const satisfies readonly GameEventType[];

export type OwnSecretType = (typeof OWN_SECRET_TYPES)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────────────────

/** Content IDs the log names (lookups only; never rendered). */
const TECH = {
  preparedClay: "T17",
  reworkingTable: "T05",
  kilnTending: "T20",
  protectiveSaggars: "T11",
  fuelLedger: "T12",
  testPieces: "T13",
  secondFiring: "T14",
  tributeWare: "T25",
} as const satisfies Readonly<Record<string, TechId>>;

function name(playerId: PlayerId, context: EventTextContext): string {
  return playerDisplayName(playerId, context.view) || context.t("common.anotherPlayer");
}

/**
 * A ceramic in words. The line's subject owns most ceramics it names, so the owner is added
 * only for someone else's ceramic; the place only when two would read the same (D9). Quality is
 * left out: a line that changes Quality states it.
 */
function ceramic(id: string, context: EventTextContext, subject: PlayerId | null, hint?: Partial<CeramicFacts>): string {
  const known = ceramicFacts(id, context.view);
  const facts: CeramicFacts | null =
    known ?? (hint?.ownerId !== undefined && hint.shape !== undefined && hint.decoration !== undefined
      ? { ownerId: hint.ownerId, shape: hint.shape, decoration: hint.decoration, glaze: hint.glaze ?? null }
      : null);
  if (facts === null) return context.t("common.ceramic.unknown");
  return ceramicLabel(facts, context.view, {
    locale: context.t,
    withOwner: subject === null || facts.ownerId !== subject,
    withQuality: false,
    withPlace: known === null ? false : "auto",
  });
}

function orders(ids: readonly OrderId[], context: EventTextContext): string {
  return list(ids, context.t.locale);
}

function techs(ids: readonly TechId[], context: EventTextContext): string {
  return list(ids.map((id) => techName(id, context.t.locale)), context.t.locale);
}

function space(spaceId: KilnSpaceId, context: EventTextContext): string {
  return kilnSpaceName(spaceId, context.t);
}

function coins(amount: number, context: EventTextContext): string {
  return context.t("common.amount.coins", { n: amount });
}

function milestone(space: number, context: EventTextContext): string {
  return recognitionMilestones(context.t.locale).find((entry) => entry.space === space)?.title ?? "";
}

function kilnAbility(kilnId: "RU" | "GU" | "GE" | "DI" | "JU", context: EventTextContext): string {
  return kilnText(kilnId, context.t.locale).abilityName;
}

function reasonText(reason: ResourceChangeReason, context: EventTextContext): string {
  const { t } = context;
  const locale = t.locale;
  switch (reason) {
    case "materials_yard":
    case "materials_yard_bonus":
      return locationName("materials_yard", locale);
    case "form_decorate":
    case "commission_market":
    case "guild_hall":
    case "canal_wharf":
    case "magistrates_hall":
      return locationName(reason, locale);
    case "prepared_clay":
      return techName(TECH.preparedClay, locale);
    case "kiln_tending":
      return techName(TECH.kilnTending, locale);
    case "test_pieces":
      return techName(TECH.testPieces, locale);
    case "protective_saggars":
      return techName(TECH.protectiveSaggars, locale);
    case "ding_extra":
      return kilnAbility("DI", context);
    case "jun":
      return kilnAbility("JU", context);
    case "guan":
      return kilnAbility("GU", context);
    case "imperial_grant":
      return milestone(1, context);
    case "contribution":
      return t("shell.ev.why.contribution");
    case "salvage":
      return t("shell.ev.why.salvage");
    case "order_reward":
      return t("shell.ev.why.order");
  }
}

const RESOURCE_ORDER: readonly ResourceKind[] = ["clay", "wood", "coins"];

function resourceChanges(amounts: Readonly<Record<ResourceKind, number>>, context: EventTextContext): string {
  const { t } = context;
  const parts = RESOURCE_ORDER.filter((kind) => amounts[kind] !== 0).map((kind) => {
    const amount = amounts[kind];
    const res = resourceName(kind, t.locale, amount);
    return amount > 0 ? t("shell.ev.res.plus", { n: amount, res }) : t("shell.ev.res.minus", { n: Math.abs(amount), res });
  });
  return parts.join(t("shell.sep"));
}

// ── Public templates ──────────────────────────────────────────────────────────────────────

export const EVENT_TEXT: { readonly [T in GameEventType]: EventTemplate<T> } = {
  // Setup and rounds.
  GAME_CREATED: (event, c) => c.t("shell.ev.GAME_CREATED", { n: event.playerCount, name: name(event.firstPlayerId, c) }),
  ORDERS_DEALT: (event, c) =>
    c.t("shell.ev.ORDERS_DEALT", { name: name(event.playerId, c), starting: event.startingCount, main: event.mainCount }),
  KILN_SELECTED: (event, c) => c.t("shell.ev.KILN_SELECTED", { name: name(event.playerId, c), kiln: kilnText(event.kilnId, c.t.locale).name }),
  ROUND_STARTED: (event, c) => c.t("shell.ev.ROUND_STARTED", { n: event.round, name: name(event.firstPlayerId, c) }),
  KILN_DIE_ROLLED: (event, c) => c.t("shell.ev.KILN_DIE_ROLLED", { n: event.value }),
  MAIN_DISPLAY_ROTATED: (event, c) => c.t("shell.ev.MAIN_DISPLAY_ROTATED", { orders: orders(event.discardedOrderIds, c) }),
  DISPLAY_REFILLED: (event, c) =>
    event.revealedOrderIds.length === 0
      ? c.t("shell.ev.DISPLAY_REFILLED.none")
      : c.t("shell.ev.DISPLAY_REFILLED", { orders: orders(event.revealedOrderIds, c) }),
  MAIN_DECK_RESHUFFLED: (_event, c) => c.t("shell.ev.MAIN_DECK_RESHUFFLED"),
  ABILITIES_READIED: (_event, c) => c.t("shell.ev.ABILITIES_READIED"),
  SETTERS_MARK_PLACED: (event, c) =>
    event.spaceId === null
      ? c.t("shell.ev.SETTERS_MARK_PLACED.none", { name: name(event.playerId, c) })
      : c.t("shell.ev.SETTERS_MARK_PLACED", { name: name(event.playerId, c), space: space(event.spaceId, c) }),
  SETTERS_MARK_RETURNED: (event, c) => c.t("shell.ev.SETTERS_MARK_RETURNED", { name: name(event.playerId, c), space: space(event.spaceId, c) }),

  // Work.
  WORK_TURN_STARTED: (event, c) => c.t("shell.ev.WORK_TURN_STARTED", { name: name(event.playerId, c) }),
  WORKER_PLACED: (event, c) => {
    const location = locationName(event.locationId, c.t.locale);
    return event.viaSeniorApprentice
      ? c.t("shell.ev.WORKER_PLACED.senior", { name: name(event.playerId, c), location })
      : c.t("shell.ev.WORKER_PLACED", { name: name(event.playerId, c), worker: workerKindName(event.kind, c.t.locale), location });
  },
  RESOURCES_CHANGED: (event, c) => {
    const changes = resourceChanges({ clay: event.clay, wood: event.wood, coins: event.coins }, c);
    return c.t("shell.ev.res.lineWhy", { name: name(event.playerId, c), changes, why: reasonText(event.reason, c) });
  },
  CERAMIC_FORMED: (event, c) => {
    const described = ceramicLabel(
      { ownerId: event.playerId, shape: event.shape, decoration: event.decoration },
      c.view,
      { locale: c.t, withOwner: false, withPlace: false, withQuality: false },
    );
    const line = c.t("shell.ev.CERAMIC_FORMED", { name: name(event.playerId, c), ceramic: described });
    if (event.formedBy === "prepared_clay") return c.t("shell.ev.via", { line, via: techName(TECH.preparedClay, c.t.locale) });
    if (event.formedBy === "ding_extra") return c.t("shell.ev.via", { line, via: kilnAbility("DI", c) });
    return line;
  },
  CERAMIC_RESHAPED: (event, c) => {
    const line = c.t("shell.ev.CERAMIC_RESHAPED", {
      name: name(event.playerId, c),
      from: shapeName(event.from, c.t.locale),
      to: shapeName(event.to, c.t.locale),
    });
    return c.t("shell.ev.via", { line, via: techName(TECH.reworkingTable, c.t.locale) });
  },
  CERAMIC_LOADED: (event, c) => {
    const who = name(event.playerId, c);
    const described = ceramic(event.ceramicId, c, event.playerId, { ownerId: event.playerId, glaze: event.glaze });
    const line = event.placement.kiln === "imperial"
      ? c.t("shell.ev.CERAMIC_LOADED.imperial", { name: who, ceramic: described, modifier: signed(event.placement.imperialModifier) })
      : c.t("shell.ev.CERAMIC_LOADED", { name: who, ceramic: described, place: space(event.placement.spaceId, c) });
    return event.loadedBy === "imperial_priority" ? c.t("shell.ev.via", { line, via: milestone(3, c) }) : line;
  },
  KILN_FURNITURE_PLACED: (event, c) =>
    c.t("shell.ev.KILN_FURNITURE_PLACED", { name: name(event.playerId, c), modifier: signed(event.modifier), space: space(event.spaceId, c) }),
  HEAT_MARKER_PLACED: (event, c) => c.t("shell.ev.HEAT_MARKER_PLACED", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId) }),
  ORDER_RESERVED: (event, c) => {
    const who = name(event.playerId, c);
    switch (event.source) {
      case "face_up":
        return event.orderId === null
          ? c.t("shell.ev.ORDER_RESERVED.blind", { name: who })
          : c.t("shell.ev.ORDER_RESERVED.face_up", { name: who, order: event.orderId });
      case "blind":
        return c.t("shell.ev.ORDER_RESERVED.blind", { name: who });
      case "top_three":
        return c.t("shell.ev.ORDER_RESERVED.top_three", { name: who });
      case "colour_samples":
        return c.t("shell.ev.ORDER_RESERVED.colour_samples", { name: who });
    }
  },
  PRIVATE_LOOK_OPENED: (event, c) =>
    event.kind === "guild_inspection"
      ? c.t("shell.ev.PRIVATE_LOOK_OPENED.techs", {
          name: name(event.playerId, c),
          n: event.count,
          discipline: event.discipline === null ? "" : disciplineName(event.discipline, c.t.locale),
        })
      : c.t("shell.ev.PRIVATE_LOOK_OPENED.orders", { name: name(event.playerId, c), n: event.count }),
  LOOKED_ORDERS_DISCARDED: (event, c) => c.t("shell.ev.LOOKED_ORDERS_DISCARDED", { name: name(event.playerId, c), n: event.count }),
  TECH_ACQUIRED: (event, c) =>
    c.t("shell.ev.TECH_ACQUIRED", {
      name: name(event.playerId, c),
      tech: techName(event.techId, c.t.locale),
      cost: event.cost === 0 ? c.t("common.free") : c.t("common.payRes", { n: event.cost, res: resourceName("coins", c.t.locale, event.cost) }),
      vp: event.vp,
    }),
  TECHS_RETURNED_TO_BOTTOM: (event, c) =>
    c.t("shell.ev.TECHS_RETURNED_TO_BOTTOM", { name: name(event.playerId, c), n: event.count, discipline: disciplineName(event.discipline, c.t.locale) }),
  TECH_DISPLAY_REFILLED: (event, c) => {
    const discipline = disciplineName(event.discipline, c.t.locale);
    return event.revealedTechIds.length === 0
      ? c.t("shell.ev.TECH_DISPLAY_REFILLED.none", { discipline })
      : c.t("shell.ev.TECH_DISPLAY_REFILLED", { discipline, techs: techs(event.revealedTechIds, c) });
  },
  PERSONAL_SPACE_UNLOCKED: (event, c) =>
    c.t("shell.ev.PERSONAL_SPACE_UNLOCKED", { name: name(event.playerId, c), location: locationName(event.locationId, c.t.locale) }),
  TECH_USED: (event, c) => c.t("shell.ev.TECH_USED", { name: name(event.playerId, c), tech: techName(event.techId, c.t.locale) }),
  KILN_ABILITY_USED: (event, c) => c.t("shell.ev.KILN_ABILITY_USED", { name: name(event.playerId, c), ability: kilnAbility(event.kilnId, c) }),
  IMPERIAL_PRIORITY_USED: (event, c) =>
    c.t("shell.ev.IMPERIAL_PRIORITY_USED", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId) }),
  WORK_TURN_ENDED: (event, c) => c.t("shell.ev.WORK_TURN_ENDED", { name: name(event.playerId, c) }),
  WORK_PHASE_ENDED: (_event, c) => c.t("shell.ev.WORK_PHASE_ENDED"),

  // Imperial Recognition.
  RECOGNITION_ADVANCED: (event, c) => {
    const base = { name: name(event.playerId, c), from: event.from, to: event.to };
    switch (event.source) {
      case "printed_crown":
        return event.orderId === null
          ? c.t("shell.ev.RECOGNITION_ADVANCED", base)
          : c.t("shell.ev.RECOGNITION_ADVANCED.crown", { ...base, order: event.orderId });
      case "tribute_crown":
        return c.t("shell.ev.RECOGNITION_ADVANCED.tribute", { ...base, tech: techName(TECH.tributeWare, c.t.locale) });
      case "magistrates_hall":
        return c.t("shell.ev.RECOGNITION_ADVANCED.magistrate", { ...base, location: locationName("magistrates_hall", c.t.locale) });
    }
  },
  CROWN_OVERFLOW_VP: (event, c) =>
    c.t("shell.ev.CROWN_OVERFLOW_VP", { name: name(event.playerId, c), vp: event.vp, max: RULE_NUMBERS.recognitionMax }),
  IMPERIAL_GRANT_RECEIVED: (event, c) =>
    c.t("shell.ev.IMPERIAL_GRANT_RECEIVED", {
      name: name(event.playerId, c),
      milestone: milestone(1, c),
      gains: resourceChanges({ clay: event.clay, wood: event.wood, coins: event.coins }, c),
    }),
  IMPERIAL_KILN_GAINED: (event, c) => c.t("shell.ev.IMPERIAL_KILN_GAINED", { name: name(event.playerId, c) }),
  IMPERIAL_PRIORITY_GAINED: (event, c) => c.t("shell.ev.IMPERIAL_PRIORITY_GAINED", { name: name(event.playerId, c) }),
  IMPERIAL_AUDIENCE_GAINED: (event, c) =>
    c.t("shell.ev.IMPERIAL_AUDIENCE_GAINED", { name: name(event.playerId, c), milestone: milestone(4, c), vp: event.vp }),

  // Firing.
  FIRING_SKIPPED: (_event, c) => c.t("shell.ev.FIRING_SKIPPED"),
  FIRING_STARTED: (event, c) =>
    event.participantIds.length === 0
      ? c.t("shell.ev.FIRING_STARTED.none")
      : c.t("shell.ev.FIRING_STARTED", { names: list(event.participantIds.map((id) => name(id, c)), c.t.locale) }),
  CONTRIBUTION_SUBMITTED: (event, c) => c.t("shell.ev.CONTRIBUTION_SUBMITTED", { name: name(event.playerId, c) }),
  CONTRIBUTIONS_REVEALED: (event, c) => {
    const entries = Object.entries(event.contributions).flatMap(([playerId, revealed]) => (revealed === undefined ? [] : [[playerId, revealed] as const]));
    if (entries.length === 0) return c.t("shell.ev.CONTRIBUTIONS_REVEALED.none");
    const items = entries.map(([playerId, revealed]) => {
      const values = { name: name(playerId, c), card: contributionCardName(revealed.card, c.t.locale), heat: signed(revealed.heat) };
      return revealed.fuelLedger
        ? c.t("shell.ev.contribution.itemLedger", { ...values, ledger: techName(TECH.fuelLedger, c.t.locale) })
        : c.t("shell.ev.contribution.item", values);
    });
    return c.t("shell.ev.CONTRIBUTIONS_REVEALED", { list: list(items, c.t.locale) });
  },
  BASE_HEAT_DETERMINED: (event, c) => {
    const values = { heat: event.baseHeat, die: event.kilnDie, sum: signed(event.contributionSum) };
    return event.unclamped === event.baseHeat
      ? c.t("shell.ev.BASE_HEAT_DETERMINED", values)
      : c.t("shell.ev.BASE_HEAT_DETERMINED.clamped", { ...values, min: RULE_NUMBERS.baseHeatMin, max: RULE_NUMBERS.baseHeatMax });
  },
  TEST_PIECES_PEEKED: (event, c) => c.t("shell.ev.TEST_PIECES_PEEKED", { name: name(event.playerId, c) }),
  TEST_PIECES_USED: (event, c) =>
    event.buried
      ? c.t("shell.ev.TEST_PIECES_USED.buried", { name: name(event.playerId, c) })
      : c.t("shell.ev.TEST_PIECES_USED.kept", { name: name(event.playerId, c) }),
  HEAT_MARKER_TURNED: (event, c) =>
    c.t("shell.ev.HEAT_MARKER_TURNED", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId), value: signed(event.value) }),
  HEAT_MARKER_RETURNED: (event, c) =>
    c.t("shell.ev.HEAT_MARKER_RETURNED", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId) }),
  KILN_MASTER_PLACED: (event, c) =>
    c.t("shell.ev.KILN_MASTER_PLACED", { name: name(event.playerId, c), value: signed(event.value), ceramic: ceramic(event.ceramicId, c, event.playerId) }),
  FIRE_REVEALED: (event, c) => c.t("shell.ev.FIRE_REVEALED", { modifier: signed(event.modifier), heat: event.globalHeat }),
  FIRE_DECK_RESHUFFLED: (_event, c) => c.t("shell.ev.FIRE_DECK_RESHUFFLED"),
  ACTUAL_HEAT_CALCULATED: (event, c) => c.t("shell.ev.ACTUAL_HEAT_CALCULATED", { n: event.results.length }),
  JUN_ADJUSTED: (event, c) =>
    c.t("shell.ev.JUN_ADJUSTED", {
      name: name(event.playerId, c),
      ability: kilnAbility("JU", c),
      ceramic: ceramic(event.ceramicId, c, event.playerId),
      delta: signed(event.delta),
      heat: event.finalActualHeat,
    }),
  QUALITY_ASSIGNED: (event, c) => {
    const values = { ceramic: ceramic(event.ceramicId, c, null), quality: qualityName(event.quality, c.t.locale), difference: event.heatDifference };
    return event.cause === "second_firing" ? c.t("shell.ev.QUALITY_ASSIGNED.second", values) : c.t("shell.ev.QUALITY_ASSIGNED", values);
  },
  QUALITY_IMPROVED: (event, c) =>
    c.t("shell.ev.QUALITY_IMPROVED", {
      ceramic: ceramic(event.ceramicId, c, null),
      from: qualityName(event.from, c.t.locale),
      to: qualityName(event.to, c.t.locale),
      why: event.cause === "protective_saggars" ? techName(TECH.protectiveSaggars, c.t.locale) : kilnAbility("GE", c),
    }),
  SECOND_FIRING_REVEALED: (event, c) =>
    c.t("shell.ev.via", {
      line: c.t("shell.ev.SECOND_FIRING_REVEALED", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId), modifier: signed(event.modifier) }),
      via: techName(TECH.secondFiring, c.t.locale),
    }),
  CRACKLE_APPLIED: (event, c) =>
    c.t("shell.ev.via", {
      line: c.t("shell.ev.CRACKLE_APPLIED", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId) }),
      via: kilnAbility("GE", c),
    }),
  CERAMIC_SALVAGED: (event, c) =>
    c.t("shell.ev.CERAMIC_SALVAGED", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId), coins: coins(event.coins, c) }),
  FIRING_FINISHED: (event, c) => c.t("shell.ev.FIRING_FINISHED", { n: event.finishedCeramicIds.length }),

  // Orders.
  ORDER_TURN_STARTED: (event, c) => c.t("shell.ev.ORDER_TURN_STARTED", { name: name(event.playerId, c) }),
  ORDER_COMPLETED: (event, c) => {
    const record = event.record;
    const values = { name: name(event.playerId, c), order: record.orderId, vp: record.vp };
    const line = record.coins > 0
      ? c.t("shell.ev.ORDER_COMPLETED.coins", { ...values, coins: coins(record.coins, c) })
      : c.t("shell.ev.ORDER_COMPLETED", values);
    return record.via === "canal_barge" ? c.t("shell.ev.via", { line, via: techName("T23", c.t.locale) }) : line;
  },
  ORDER_TURN_ENDED: (event, c) =>
    event.automatic
      ? c.t("shell.ev.ORDER_TURN_ENDED.automatic", { name: name(event.playerId, c) })
      : c.t("shell.ev.ORDER_TURN_ENDED", { name: name(event.playerId, c) }),

  // Cleanup and end.
  WORKERS_RETURNED: (_event, c) => c.t("shell.ev.WORKERS_RETURNED"),
  HAND_TRIMMED: (event, c) => c.t("shell.ev.HAND_TRIMMED", { name: name(event.playerId, c), n: event.count }),
  FIRST_PLAYER_PASSED: (event, c) => c.t("shell.ev.FIRST_PLAYER_PASSED", { from: name(event.from, c), to: name(event.to, c) }),
  FINAL_SCORE_CALCULATED: (event, c) => {
    const result = event.result;
    const winners = list(result.winnerIds.map((id) => name(id, c)), c.t.locale);
    const first = result.winnerIds[0];
    const vp = first === undefined ? 0 : result.scores[first]?.total ?? 0;
    return result.resolvedBy === "shared_victory"
      ? c.t("shell.ev.FINAL_SCORE_CALCULATED.shared", { names: winners, vp })
      : c.t("shell.ev.FINAL_SCORE_CALCULATED", { names: winners, vp });
  },
};

// ── Own-secret templates ──────────────────────────────────────────────────────────────────

export const OWN_EVENT_TEXT: { readonly [T in OwnSecretType]: OwnEventTemplate<T> } = {
  ORDERS_DEALT: (event, c) =>
    c.t("shell.ev.ORDERS_DEALT.own", {
      name: name(event.playerId, c),
      orders: orders([...event.secret.startingOrderIds, ...event.secret.mainOrderIds], c),
    }),
  ORDER_RESERVED: (event, c) =>
    event.secret === undefined
      ? EVENT_TEXT.ORDER_RESERVED(event, c)
      : c.t("shell.ev.ORDER_RESERVED.own", { name: name(event.playerId, c), order: event.secret.orderId }),
  PRIVATE_LOOK_OPENED: (event, c) => {
    const cards = event.kind === "guild_inspection" ? techs(event.secret.techIds, c) : orders(event.secret.orderIds, c);
    return cards === ""
      ? c.t("shell.ev.PRIVATE_LOOK_OPENED.ownNone", { name: name(event.playerId, c) })
      : c.t("shell.ev.PRIVATE_LOOK_OPENED.own", { name: name(event.playerId, c), cards });
  },
  LOOKED_ORDERS_DISCARDED: (event, c) =>
    event.secret.orderIds.length === 0
      ? EVENT_TEXT.LOOKED_ORDERS_DISCARDED(event, c)
      : c.t("shell.ev.LOOKED_ORDERS_DISCARDED.own", { name: name(event.playerId, c), orders: orders(event.secret.orderIds, c) }),
  TECHS_RETURNED_TO_BOTTOM: (event, c) =>
    event.secret.techIds.length === 0
      ? EVENT_TEXT.TECHS_RETURNED_TO_BOTTOM(event, c)
      : c.t("shell.ev.TECHS_RETURNED_TO_BOTTOM.own", { name: name(event.playerId, c), techs: techs(event.secret.techIds, c) }),
  TEST_PIECES_PEEKED: (event, c) => c.t("shell.ev.TEST_PIECES_PEEKED.own", { name: name(event.playerId, c), modifier: signed(event.secret.modifier) }),
  HAND_TRIMMED: (event, c) =>
    event.secret.orderIds.length === 0
      ? EVENT_TEXT.HAND_TRIMMED(event, c)
      : c.t("shell.ev.HAND_TRIMMED.own", { name: name(event.playerId, c), orders: orders(event.secret.orderIds, c) }),
};

function isOwnSecretType(type: GameEventType): type is OwnSecretType {
  return (OWN_SECRET_TYPES as readonly GameEventType[]).includes(type);
}

/**
 * The own secret version of an entry, only when it belongs to the viewer: same type, and its
 * `secret.visibleTo` is the viewer. Anything else is ignored (it is never shown).
 */
export function ownSecretOf(entry: LogEntry, viewerId: PlayerId | null): Extract<GameEvent, { type: OwnSecretType }> | null {
  const own = entry.own;
  if (own === undefined || viewerId === null || own.type !== entry.event.type || !isOwnSecretType(own.type)) return null;
  const secret = (own as { secret?: { visibleTo?: unknown } }).secret;
  if (secret === undefined || secret.visibleTo !== viewerId) return null;
  return own as Extract<GameEvent, { type: OwnSecretType }>;
}

function publicText(event: PublicGameEvent, context: EventTextContext): string {
  const template = EVENT_TEXT[event.type] as EventTemplate;
  return template(event, context);
}

function ownText(event: Extract<GameEvent, { type: OwnSecretType }>, context: EventTextContext): string {
  const template = OWN_EVENT_TEXT[event.type] as unknown as OwnEventTemplate;
  return template(event, context);
}

/**
 * True when a log entry only repeats the line before it, so the log folds it away: the Coins
 * of an Order reward (`RESOURCES_CHANGED`, `order_reward`) directly after the same player's
 * `ORDER_COMPLETED`, whose line already states those Coins. Only the log folds; the event
 * stays in the history.
 */
export function repeatsPreviousEntry(entry: LogEntry, previous: LogEntry | undefined): boolean {
  const event = entry.event;
  if (event.type !== "RESOURCES_CHANGED" || event.reason !== "order_reward" || previous === undefined) return false;
  const before = previous.event;
  return (
    before.type === "ORDER_COMPLETED" &&
    before.playerId === event.playerId &&
    event.clay === 0 &&
    event.wood === 0 &&
    event.coins === before.record.coins
  );
}

/** The text of one public event. */
export function publicEventText(event: PublicGameEvent, context: EventTextContext): string {
  return publicText(event, context);
}

/** The log line for one entry: the viewer's own secret version when it has one, else the public one. */
export function eventText(entry: LogEntry, context: EventTextContext): string {
  const own = ownSecretOf(entry, context.viewerId);
  return own === null ? publicText(entry.event, context) : ownText(own, context);
}
