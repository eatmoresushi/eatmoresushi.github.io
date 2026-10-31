/**
 * Event text templates (UI_V1.6.1_ARCHITECTURE §5 gap 4, §8.3). Owner: B1 (shell, log, lobby).
 * Source: wireframe `evText`.
 *
 * - `EVENT_TEXT`: one template per `GameEventType`, exhaustive by type (a new engine event fails
 *   `typecheck` here). A template reads only `PublicGameEvent` fields.
 * - `OWN_EVENT_TEXT`: the own-secret variants (`ORDERS_DEALT`, `ORDER_RESERVED`,
 *   `PRIVATE_LOOK_OPENED`, `LOOKED_ORDERS_DISCARDED`, `HELD_ORDER_DISCARDED`,
 *   `TECHS_RETURNED_TO_BOTTOM`, `TEST_PIECES_PEEKED`, `HAND_TRIMMED`), which read `LogEntry.own`. `eventText` uses one only
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
import { KILNS } from "../../game/index.ts";
import type {
  GameEvent,
  GameEventType,
  KilnId,
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
  /** The event happened in the last round (`lastRoundStart`): no firing follows it. */
  lastRound?: boolean;
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
  "HELD_ORDER_DISCARDED",
  "TECHS_RETURNED_TO_BOTTOM",
  "TEST_PIECES_PEEKED",
  "HAND_TRIMMED",
] as const satisfies readonly GameEventType[];

export type OwnSecretType = (typeof OWN_SECRET_TYPES)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────────────────

/** Content IDs the log names (lookups only; never rendered). */
const TECH = {
  colourSamples: "T10",
  canalBarge: "T23",
  preparedClay: "T17",
  reworkingTable: "T05",
  kilnTending: "T20",
  protectiveSaggars: "T11",
  testPieces: "T13",
  secondFiring: "T14",
  tributeWare: "T25",
  kilnFurniture: "T15",
  kilnMaster: "T24",
} as const satisfies Readonly<Record<string, TechId>>;

function name(playerId: PlayerId, context: EventTextContext): string {
  return playerDisplayName(playerId, context.view) || context.t("common.anotherPlayer");
}

/**
 * A ceramic in words. The line's subject owns most ceramics it names, so the owner is added
 * only for someone else's ceramic; the place only when two would read the same (D9): for the
 * subject's own ceramic, two of the subject's (the line names the owner). Quality is left out: a
 * line that changes Quality states it.
 * - `place: false` for a line about a ceramic of a firing that may since have left the kiln
 *   (Second Firing, a sale): a view of a later moment knows only where it is then ("finished",
 *   gone), which is not where the line happened.
 * - `crackle: false` for the line that gives the Crackle marker: it is not on the ceramic before.
 */
function ceramic(
  id: string,
  context: EventTextContext,
  subject: PlayerId | null,
  hint?: Partial<CeramicFacts>,
  options: { place?: boolean; crackle?: boolean } = {},
): string {
  const known = ceramicFacts(id, context.view);
  const facts: CeramicFacts | null =
    known ?? (hint?.ownerId !== undefined && hint.shape !== undefined && hint.decoration !== undefined
      ? { ownerId: hint.ownerId, shape: hint.shape, decoration: hint.decoration, glaze: hint.glaze ?? null }
      : null);
  if (facts === null) return context.t("common.ceramic.unknown");
  const owned = subject !== null && facts.ownerId === subject;
  return ceramicLabel(facts, context.view, {
    locale: context.t,
    withOwner: !owned,
    // The line's subject is the owner: only their own ceramics can read the same.
    ownerImplied: owned,
    withQuality: false,
    withPlace: known === null || options.place === false ? false : "auto",
    withCrackle: options.crackle !== false,
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

function kilnAbility(kilnId: KilnId, context: EventTextContext): string {
  return kilnText(kilnId, context.t.locale).abilityName;
}

/** Ding's extra vessel costs exactly this (v1.6.2 L473): its line states it, and the cost line folds. */
const DING_COST = Object.freeze({ clay: -KILNS.DI.params.clay, wood: 0, coins: -KILNS.DI.params.coins });

/** Jun's adjustment costs exactly this Wood (v1.6.2 L477): its line states it, and the cost line folds. */
const JUN_WOOD = KILNS.JU.params.wood;

function reasonText(reason: ResourceChangeReason, context: EventTextContext): string {
  const { t } = context;
  const locale = t.locale;
  switch (reason) {
    case "materials_yard":
      return locationName("materials_yard", locale);
    case "form_decorate":
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
    case "canal_barge":
      return techName(TECH.canalBarge, locale);
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
    case "flawed_sale":
      return t("shell.ev.why.sale");
    case "kiln_fuel":
      return t("shell.ev.why.kilnFuel");
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
  // Only Starting Orders are dealt (rev. 4 L115); the Main Order is taken face up with the Kiln.
  ORDERS_DEALT: (event, c) => c.t("shell.ev.ORDERS_DEALT", { name: name(event.playerId, c), n: event.startingCount }),
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
    // Ding's line states the extra vessel's cost; its Resources line folds away (`repeatsNextEntry`).
    if (event.formedBy === "ding_extra") {
      return c.t("shell.ev.CERAMIC_FORMED.ding", { name: name(event.playerId, c), ceramic: described, ability: kilnAbility("DI", c), cost: resourceChanges(DING_COST, c) });
    }
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
    // The line names where it went, so the ceramic needs no place of its own.
    const described = ceramic(event.ceramicId, c, event.playerId, { ownerId: event.playerId, glaze: event.glaze }, { place: false });
    const line = event.placement.kiln === "imperial"
      ? c.t("shell.ev.CERAMIC_LOADED.imperial", { name: who, ceramic: described, modifier: signed(event.placement.imperialModifier) })
      : c.t("shell.ev.CERAMIC_LOADED", { name: who, ceramic: described, place: space(event.placement.spaceId, c) });
    return event.loadedBy === "imperial_priority" ? c.t("shell.ev.via", { line, via: milestone(3, c) }) : line;
  },
  KILN_FURNITURE_PLACED: (event, c) =>
    c.t("shell.ev.KILN_FURNITURE_PLACED", { name: name(event.playerId, c), modifier: signed(event.modifier), space: space(event.spaceId, c) }),
  ORDER_RESERVED: (event, c) => {
    const who = name(event.playerId, c);
    switch (event.source) {
      case "face_up": {
        if (event.orderId === null) return c.t("shell.ev.ORDER_RESERVED.looked", { name: who });
        // The Setup take with the Kiln (rev. 4 L122, R23) and the Magistrate's Hall Shifu's Crown
        // Order (rev. 4 L241, R21) are public; every Select may take a face-up Order (v1.6.2 L64,
        // change 25): Colour Samples' say so.
        if (event.via === "setup") return c.t("shell.ev.ORDER_RESERVED.setup", { name: who, order: event.orderId });
        if (event.via === "magistrates_hall") {
          return c.t("shell.ev.ORDER_RESERVED.magistrate", { name: who, order: event.orderId, location: locationName("magistrates_hall", c.t.locale) });
        }
        const tech = techName(TECH.colourSamples, c.t.locale);
        if (event.via === "colour_samples") return c.t("shell.ev.ORDER_RESERVED.face_upColourSamples", { name: who, order: event.orderId, tech });
        if (event.via === "colour_samples_swap") return c.t("shell.ev.ORDER_RESERVED.face_upSwap", { name: who, order: event.orderId, tech });
        return c.t("shell.ev.ORDER_RESERVED.face_up", { name: who, order: event.orderId });
      }
      case "looked": {
        const tech = techName(TECH.colourSamples, c.t.locale);
        if (event.via === "colour_samples") return c.t("shell.ev.ORDER_RESERVED.colour_samples", { name: who, tech });
        if (event.via === "colour_samples_swap") return c.t("shell.ev.ORDER_RESERVED.swap", { name: who, tech });
        return c.t("shell.ev.ORDER_RESERVED.looked", { name: who });
      }
      case "deck_top":
        return c.t("shell.ev.ORDER_RESERVED.deck_top", { name: who });
    }
  },
  PRIVATE_LOOK_OPENED: (event, c) => {
    const who = name(event.playerId, c);
    if (event.kind !== "guild_inspection") {
      // B1: with the Main deck and discard both empty, a Commission look shows no card.
      return event.count === 0 ? c.t("shell.ev.PRIVATE_LOOK_OPENED.ordersNone", { name: who }) : c.t("shell.ev.PRIVATE_LOOK_OPENED.orders", { name: who, n: event.count });
    }
    const discipline = event.discipline === null ? "" : disciplineName(event.discipline, c.t.locale);
    return event.count === 0
      ? c.t("shell.ev.PRIVATE_LOOK_OPENED.techsNone", { name: who, discipline })
      : c.t("shell.ev.PRIVATE_LOOK_OPENED.techs", { name: who, n: event.count, discipline });
  },
  // A Select's looked cards not reserved are discarded face down (owner ruling R25).
  LOOKED_ORDERS_DISCARDED: (event, c) => c.t("shell.ev.LOOKED_ORDERS_DISCARDED", { name: name(event.playerId, c), n: event.count }),
  // The swap's discard (v1.6.2 L622): the line before it says "used Colour Samples to swap".
  HELD_ORDER_DISCARDED: (event, c) =>
    event.to === "box" ? c.t("shell.ev.HELD_ORDER_DISCARDED.box", { name: name(event.playerId, c) }) : c.t("shell.ev.HELD_ORDER_DISCARDED", { name: name(event.playerId, c) }),
  // No VP: gaining a Tech scores nothing (v1.6.2 change 27).
  TECH_ACQUIRED: (event, c) =>
    c.t("shell.ev.TECH_ACQUIRED", {
      name: name(event.playerId, c),
      tech: techName(event.techId, c.t.locale),
      cost: event.cost === 0 ? c.t("common.free") : c.t("common.payRes", { n: event.cost, res: resourceName("coins", c.t.locale, event.cost) }),
    }),
  // Fuel Ledger brings its 2 Contribution cards with the tile (v1.6.2 L634, change 26): public.
  CONTRIBUTION_CARDS_GAINED: (event, c) =>
    c.t("shell.ev.CONTRIBUTION_CARDS_GAINED", {
      name: name(event.playerId, c),
      tech: techName(event.techId, c.t.locale),
      cards: list(event.cards.map((card) => contributionCardName(card, c.t.locale)), c.t.locale),
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
  TECH_USED: (event, c) => {
    const values = { name: name(event.playerId, c), tech: techName(event.techId, c.t.locale) };
    // Colour Samples is used only by its swap (v1.6.2 L622); Canal Barge always pays its Coins
    // in the next event, which the log folds into this line (`repeatsPreviousEntry`).
    if (event.techId === TECH.colourSamples) return c.t("shell.ev.TECH_USED.swap", values);
    if (event.techId === TECH.canalBarge) return c.t("shell.ev.TECH_USED.coins", { ...values, coins: coins(RULE_NUMBERS.canalBargeCoins, c) });
    return c.t("shell.ev.TECH_USED", values);
  },
  // Ru and Guan score as the Order is completed (v1.6.2 L459, L463): the line states what they give, and
  // Guan's Coins line folds into it. Ding, Jun and Ge's lines fold into the line beside them,
  // which names the ability (`repeatsPreviousEntry`, `repeatsNextEntry`).
  KILN_ABILITY_USED: (event, c) => {
    const values = { name: name(event.playerId, c), ability: kilnAbility(event.kilnId, c) };
    if (event.kilnId === "RU") return c.t("shell.ev.KILN_ABILITY_USED.vp", { ...values, vp: KILNS.RU.params.vp });
    if (event.kilnId === "GU") return c.t("shell.ev.KILN_ABILITY_USED.vpCoins", { ...values, vp: KILNS.GU.params.vp, coins: coins(KILNS.GU.params.coins, c) });
    return c.t("shell.ev.KILN_ABILITY_USED", values);
  },
  // A free action (rev. 5 L174, L314): in the Order Phase its ceramic waits in the Imperial Kiln for
  // the next round's firing, and in the last round is never fired (R28), which the line says.
  IMPERIAL_PRIORITY_USED: (event, c) =>
    c.t(event.window !== "order_phase" ? "shell.ev.IMPERIAL_PRIORITY_USED" : c.lastRound === true ? "shell.ev.IMPERIAL_PRIORITY_USED.lastRound" : "shell.ev.IMPERIAL_PRIORITY_USED.afterFiring", {
      name: name(event.playerId, c),
      ceramic: ceramic(event.ceramicId, c, event.playerId),
    }),
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
    // Each card by its name, a Fuel Ledger card included (v1.6.2 change 26).
    const items = entries.map(([playerId, revealed]) =>
      c.t("shell.ev.contribution.item", { name: name(playerId, c), card: contributionCardName(revealed.card, c.t.locale), heat: signed(revealed.heat) }),
    );
    return c.t("shell.ev.CONTRIBUTIONS_REVEALED", { list: list(items, c.t.locale) });
  },
  BASE_HEAT_DETERMINED: (event, c) => {
    const values = { heat: event.baseHeat, die: event.kilnDie, sum: signed(event.contributionSum) };
    return event.unclamped === event.baseHeat
      ? c.t("shell.ev.BASE_HEAT_DETERMINED", values)
      : c.t("shell.ev.BASE_HEAT_DETERMINED.clamped", { ...values, min: RULE_NUMBERS.baseHeatMin, max: RULE_NUMBERS.baseHeatMax });
  },
  TEST_PIECES_PEEKED: (event, c) => c.t("shell.ev.TEST_PIECES_PEEKED", { name: name(event.playerId, c), tech: techName(TECH.testPieces, c.t.locale) }),
  TEST_PIECES_USED: (event, c) =>
    event.buried
      ? c.t("shell.ev.TEST_PIECES_USED.buried", { name: name(event.playerId, c) })
      : c.t("shell.ev.TEST_PIECES_USED.kept", { name: name(event.playerId, c) }),
  // Chosen face up as the ceramic is loaded (T24, rev. 4 L628, R22).
  KILN_MASTER_PLACED: (event, c) =>
    c.t("shell.ev.KILN_MASTER_PLACED", { name: name(event.playerId, c), value: signed(event.value), ceramic: ceramic(event.ceramicId, c, event.playerId) }),
  FIRE_REVEALED: (event, c) => c.t("shell.ev.FIRE_REVEALED", { modifier: signed(event.modifier), heat: event.globalHeat }),
  FIRE_DECK_RESHUFFLED: (event, c) =>
    event.buriedBelow > 0
      ? c.t("shell.ev.FIRE_DECK_RESHUFFLED.buried", { tech: techName(TECH.testPieces, c.t.locale) })
      : c.t("shell.ev.FIRE_DECK_RESHUFFLED"),
  ACTUAL_HEAT_CALCULATED: (event, c) => c.t("shell.ev.ACTUAL_HEAT_CALCULATED", { n: event.results.length }),
  // States Jun's Wood; the Resources line and "used Jun" fold away (`repeatsNextEntry`).
  JUN_ADJUSTED: (event, c) =>
    c.t("shell.ev.JUN_ADJUSTED", {
      name: name(event.playerId, c),
      ability: kilnAbility("JU", c),
      ceramic: ceramic(event.ceramicId, c, event.playerId),
      cost: c.t("common.amount.wood", { n: JUN_WOOD }),
      delta: signed(event.delta),
      heat: event.finalActualHeat,
    }),
  QUALITY_ASSIGNED: (event, c) => {
    const values = { ceramic: ceramic(event.ceramicId, c, null), quality: qualityName(event.quality, c.t.locale), difference: event.heatDifference };
    if (event.cause === "second_firing") return c.t("shell.ev.QUALITY_ASSIGNED.second", values);
    return event.saggarsFloor
      ? c.t("shell.ev.QUALITY_ASSIGNED.saggars", { ...values, tech: techName(TECH.protectiveSaggars, c.t.locale) })
      : c.t("shell.ev.QUALITY_ASSIGNED", values);
  },
  QUALITY_IMPROVED: (event, c) =>
    c.t("shell.ev.QUALITY_IMPROVED", {
      ceramic: ceramic(event.ceramicId, c, null),
      from: qualityName(event.from, c.t.locale),
      to: qualityName(event.to, c.t.locale),
      why: event.cause === "protective_saggars" ? techName(TECH.protectiveSaggars, c.t.locale) : kilnAbility("GE", c),
    }),
  // Self-contained (live announcements leave out "used Second Firing"): it names the Tech.
  SECOND_FIRING_REVEALED: (event, c) =>
    c.t("shell.ev.via", {
      line: c.t("shell.ev.SECOND_FIRING_REVEALED", {
        name: name(event.playerId, c),
        ceramic: ceramic(event.ceramicId, c, event.playerId, undefined, { place: false }),
        n: event.modifiers.length,
        cards: list(event.modifiers.map((modifier) => signed(modifier)), c.t.locale),
      }),
      via: techName(TECH.secondFiring, c.t.locale),
    }),
  SECOND_FIRING_CHOSEN: (event, c) =>
    c.t("shell.ev.via", {
      line: c.t("shell.ev.SECOND_FIRING_CHOSEN", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId, undefined, { place: false }), modifier: signed(event.modifier) }),
      via: techName(TECH.secondFiring, c.t.locale),
    }),
  CRACKLE_APPLIED: (event, c) =>
    c.t("shell.ev.via", {
      line: c.t("shell.ev.CRACKLE_APPLIED", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId, undefined, { crackle: false }) }),
      via: kilnAbility("GE", c),
    }),
  // A Flawed ceramic sold as a free action, in any of its owner's free-action windows (rev. 5 L172, R26).
  CERAMIC_SOLD: (event, c) =>
    c.t("shell.ev.CERAMIC_SOLD", { name: name(event.playerId, c), ceramic: ceramic(event.ceramicId, c, event.playerId, undefined, { place: false }), coins: coins(event.coins, c) }),
  FIRING_FINISHED: (event, c) => c.t("shell.ev.FIRING_FINISHED", { n: event.finishedCeramicIds.length }),

  // Orders.
  ORDER_TURN_STARTED: (event, c) => c.t("shell.ev.ORDER_TURN_STARTED", { name: name(event.playerId, c) }),
  // Ge's Crackle VP (rev. 4 L465): 1 VP per Crackle ceramic delivered, stated on the line.
  ORDER_COMPLETED: (event, c) => {
    const record = event.record;
    const values = { name: name(event.playerId, c), order: record.orderId, vp: record.vp };
    const line = record.coins > 0
      ? c.t("shell.ev.ORDER_COMPLETED.coins", { ...values, coins: coins(record.coins, c) })
      : c.t("shell.ev.ORDER_COMPLETED", values);
    // The engine always records it; a record without it means 0 (`CompletedOrderRecord.crackleVp`).
    const crackle = record.crackleVp ?? 0;
    return crackle > 0 ? c.t("shell.ev.ORDER_COMPLETED.crackle", { line, crackle }) : line;
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
  ORDERS_DEALT: (event, c) => c.t("shell.ev.ORDERS_DEALT.own", { name: name(event.playerId, c), orders: orders(event.secret.startingOrderIds, c) }),
  ORDER_RESERVED: (event, c) => {
    if (event.secret === undefined) return EVENT_TEXT.ORDER_RESERVED(event, c);
    const values = { name: name(event.playerId, c), order: event.secret.orderId };
    if (event.source === "deck_top") return c.t("shell.ev.ORDER_RESERVED.ownDeckTop", values);
    if (event.via === "colour_samples" || event.via === "colour_samples_swap") {
      return c.t("shell.ev.via", { line: c.t("shell.ev.ORDER_RESERVED.own", values), via: techName(TECH.colourSamples, c.t.locale) });
    }
    return c.t("shell.ev.ORDER_RESERVED.own", values);
  },
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
  HELD_ORDER_DISCARDED: (event, c) =>
    event.to === "box"
      ? c.t("shell.ev.HELD_ORDER_DISCARDED.ownBox", { name: name(event.playerId, c), order: event.secret.orderId })
      : c.t("shell.ev.HELD_ORDER_DISCARDED.own", { name: name(event.playerId, c), order: event.secret.orderId }),
  TECHS_RETURNED_TO_BOTTOM: (event, c) =>
    event.secret.techIds.length === 0
      ? EVENT_TEXT.TECHS_RETURNED_TO_BOTTOM(event, c)
      : c.t(event.secret.techIds.length === 1 ? "shell.ev.TECHS_RETURNED_TO_BOTTOM.ownOne" : "shell.ev.TECHS_RETURNED_TO_BOTTOM.own", {
          name: name(event.playerId, c),
          techs: techs(event.secret.techIds, c),
        }),
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

/** The player an event names, or null. */
function eventPlayer(event: PublicGameEvent): PlayerId | null {
  const value = (event as { playerId?: unknown }).playerId;
  return typeof value === "string" ? value : null;
}

/** The Kiln ability a line names in its own words (Ding's formed vessel, Jun's adjustment, Ge's Quality and Crackle lines, a cost line's "(ability)"), or null. */
function abilityNamedBy(event: PublicGameEvent): KilnId | null {
  switch (event.type) {
    case "RESOURCES_CHANGED":
      return event.reason === "ding_extra" ? "DI" : event.reason === "jun" ? "JU" : null;
    case "CERAMIC_FORMED":
      return event.formedBy === "ding_extra" ? "DI" : null;
    case "JUN_ADJUSTED":
      return "JU";
    case "QUALITY_IMPROVED":
      return event.cause === "ge_crackle" ? "GE" : null;
    case "CRACKLE_APPLIED":
      return "GE";
    default:
      return null;
  }
}

/**
 * The Tech a line names in its own words, for a "used ⟨Tech⟩" line directly before it: Kiln
 * Master's marker line ("placed the Kiln Master marker +1 on …", T24, rev. 4 L628), Kiln
 * Furniture's tile line ("set Kiln Furniture −1 on …", T15) and Kiln Tending's resources line
 * ("+1 Clay · +1 Wood (Kiln Tending)", T20); or null.
 */
function techNamedBy(event: PublicGameEvent): TechId | null {
  switch (event.type) {
    case "KILN_MASTER_PLACED":
      return TECH.kilnMaster;
    case "KILN_FURNITURE_PLACED":
      return TECH.kilnFurniture;
    case "RESOURCES_CHANGED":
      return event.reason === "kiln_tending" ? TECH.kilnTending : null;
    default:
      return null;
  }
}

/**
 * A Ding, Jun or Ge "used ⟨ability⟩" line beside a line of the same player that names that
 * ability; or a "used ⟨Tech⟩" line directly before such a line naming that Tech (`techNamedBy`).
 */
function namedBeside(entry: LogEntry, beside: LogEntry | undefined, side: "previous" | "next"): boolean {
  const event = entry.event;
  if (beside === undefined) return false;
  if (event.type === "TECH_USED") {
    if (side !== "next" || techNamedBy(beside.event) !== event.techId) return false;
  } else if (event.type !== "KILN_ABILITY_USED" || abilityNamedBy(beside.event) !== event.kilnId) {
    return false;
  }
  const owner = eventPlayer(beside.event);
  return owner === null || owner === event.playerId;
}

/**
 * True when a log entry only repeats the line before it, so the log folds it away. Only the log
 * (and the turn toasts) fold; the event stays in the history.
 * - The Coins of an Order reward (`RESOURCES_CHANGED`, `order_reward`) directly after the same
 *   player's `ORDER_COMPLETED`, whose line already states those Coins.
 * - Canal Barge's Coins (`RESOURCES_CHANGED`, `canal_barge`, v1.6.2 L622) directly after the
 *   same player's `TECH_USED` of Canal Barge, whose line already states them ("used Canal
 *   Barge: +2 Coins").
 * - Guan's Coins (`guan`) directly after the same player's `KILN_ABILITY_USED` of Guan, whose
 *   line states them ("used Imperial Patronage: +1 VP, +2 Coins").
 * - A sale's Coins (`flawed_sale`) directly after the same player's `CERAMIC_SOLD`, whose line
 *   states them ("sold … for 2 Coins").
 * - The Imperial Grant's resources (`imperial_grant`) directly after the same player's
 *   `IMPERIAL_GRANT_RECEIVED`, whose line states them.
 * - Jun's "used Kiln Transformation" (`KILN_ABILITY_USED`) directly after the same player's Jun
 *   Wood, which the `JUN_ADJUSTED` line right after it states.
 */
export function repeatsPreviousEntry(entry: LogEntry, previous: LogEntry | undefined): boolean {
  const event = entry.event;
  if (event.type === "KILN_ABILITY_USED") return namedBeside(entry, previous, "previous");
  if (event.type !== "RESOURCES_CHANGED" || previous === undefined) return false;
  const before = previous.event;
  if (event.reason === "imperial_grant") {
    return before.type === "IMPERIAL_GRANT_RECEIVED" && before.playerId === event.playerId && before.clay === event.clay && before.wood === event.wood && before.coins === event.coins;
  }
  if (event.clay !== 0 || event.wood !== 0) return false;
  if (event.reason === "order_reward") {
    return before.type === "ORDER_COMPLETED" && before.playerId === event.playerId && event.coins === before.record.coins;
  }
  if (event.reason === "canal_barge") {
    return before.type === "TECH_USED" && before.techId === TECH.canalBarge && before.playerId === event.playerId && event.coins === RULE_NUMBERS.canalBargeCoins;
  }
  if (event.reason === "guan") {
    return before.type === "KILN_ABILITY_USED" && before.kilnId === "GU" && before.playerId === event.playerId && event.coins === KILNS.GU.params.coins;
  }
  if (event.reason === "flawed_sale") {
    return before.type === "CERAMIC_SOLD" && before.playerId === event.playerId && event.coins === before.coins;
  }
  return false;
}

/**
 * True when a log entry only says what the line after it says, so the log folds it away. Each
 * pair comes from one move, so they always arrive together:
 * - a Guild Hall payment (`RESOURCES_CHANGED`, `guild_hall`) directly before the same player's
 *   `TECH_ACQUIRED`, whose line states the cost ("acquired Test Pieces: pay 3 Coins");
 * - Ding's cost (`ding_extra`) directly before the same player's Ding vessel (`CERAMIC_FORMED`,
 *   `ding_extra`), whose line states it ("formed a vessel: Plate · Plain (Moulded Production:
 *   −1 Clay · −1 Coin)");
 * - Jun's Wood (`jun`) directly before the same player's "used Kiln Transformation", which
 *   `JUN_ADJUSTED` follows at once and which states the Wood;
 * - a Ding, Jun or Ge "used ⟨ability⟩" (`KILN_ABILITY_USED`) directly before the same player's
 *   line naming that ability (Ding's cost or vessel, Jun's adjustment, Ge's Quality change).
 * - a "used Kiln Master", "used Kiln Furniture" or "used Kiln Tending" (`TECH_USED`) directly
 *   before the same player's line naming that Tech (Kiln Master's marker, the Kiln Furniture
 *   tile, Kiln Tending's resources), so a Glaze & Load turn with kiln fuel and Kiln Master fits
 *   the toast's 4 lines.
 */
export function repeatsNextEntry(entry: LogEntry, next: LogEntry | undefined): boolean {
  const event = entry.event;
  if (event.type === "KILN_ABILITY_USED" || event.type === "TECH_USED") return namedBeside(entry, next, "next");
  if (event.type !== "RESOURCES_CHANGED" || next === undefined) return false;
  const after = next.event;
  if (event.reason === "ding_extra") {
    return (
      after.type === "CERAMIC_FORMED" &&
      after.formedBy === "ding_extra" &&
      after.playerId === event.playerId &&
      event.clay === DING_COST.clay &&
      event.wood === DING_COST.wood &&
      event.coins === DING_COST.coins
    );
  }
  if (event.reason === "jun") {
    return after.type === "KILN_ABILITY_USED" && after.kilnId === "JU" && after.playerId === event.playerId && event.clay === 0 && event.coins === 0 && event.wood === -JUN_WOOD;
  }
  if (event.reason !== "guild_hall" || event.clay !== 0 || event.wood !== 0) return false;
  return after.type === "TECH_ACQUIRED" && after.playerId === event.playerId && after.cost === -event.coins;
}

/** True when the log folds the entry at `index` away (`repeatsPreviousEntry`, `repeatsNextEntry`). */
export function foldedEntry(log: readonly LogEntry[], index: number): boolean {
  const entry = log[index];
  return entry !== undefined && (repeatsPreviousEntry(entry, log[index - 1]) || repeatsNextEntry(entry, log[index + 1]));
}

/** The text of one public event. */
export function publicEventText(event: PublicGameEvent, context: EventTextContext): string {
  return publicText(event, context);
}

/** The sequence the log's last round starts at (its `ROUND_STARTED`), or null before it. */
export function lastRoundStart(log: readonly LogEntry[]): number | null {
  return log.find(({ event }) => event.type === "ROUND_STARTED" && event.round === RULE_NUMBERS.rounds)?.sequence ?? null;
}

/** The log line for one entry: the viewer's own secret version when it has one, else the public one. */
export function eventText(entry: LogEntry, context: EventTextContext): string {
  const own = ownSecretOf(entry, context.viewerId);
  return own === null ? publicText(entry.event, context) : ownText(own, context);
}
