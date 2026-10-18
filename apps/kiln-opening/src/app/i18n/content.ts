/**
 * Content names and rules text by stable ID (UI_V1.6.1_ARCHITECTURE §6.2).
 *
 * Every player-facing name or rule text of a location, Tech, Kiln, Order, round phase or
 * Recognition milestone comes from `data/*.json` through the engine's content exports; the
 * vocabularies (Shapes, Glazes, Decorations, Qualities, resources, workers, disciplines, zones,
 * stages, phases) come from `src/game/ruleErrorText.ts`. Nothing here is translated by hand, so
 * English and Chinese always render from the same IDs (AGENTS.md).
 *
 * `RULE_NUMBERS` fills catalogue placeholders from content (§5 gap 19): catalogue strings carry
 * no literal rule numbers.
 *
 * In development and tests an empty Chinese field throws; in production it falls back to the
 * English text with a warning (§6.1).
 */
import {
  CONTRIBUTION_CARD_IDS,
  DECORATION_TEXT,
  DISCIPLINE_TEXT,
  FIRING,
  GAME_CONFIG,
  GLAZE_TEXT,
  IMPERIAL_TRACK,
  KILNS,
  LOCATIONS,
  ORDERS,
  ORDER_CLARIFICATIONS,
  PHASE_TEXT,
  QUALITY_TEXT,
  RESOURCE_TEXT,
  ROUND_STRUCTURE,
  SHAPE_TEXT,
  STAGE_TEXT,
  TECHS,
  TECH_IDS,
  WORKER_TEXT,
  ZONE_TEXT,
  clarificationTags,
  contributionCard,
} from "../../game/index.ts";
import type {
  CeramicStage,
  ClarificationDefinition,
  ContributionCardId,
  Decoration,
  GamePhaseType,
  Glaze,
  ImperialModifier,
  KilnId,
  KilnZone,
  LocationId,
  OrderId,
  PersonalLocationId,
  Quality,
  Recognition,
  ResourceKind,
  RoundPhaseId,
  Shape,
  TechDiscipline,
  TechId,
  WorkerEffect,
  WorkerKind,
} from "../../game/index.ts";
import { CATALOG } from "./index.ts";
import { MissingTranslationError, defaultStrict } from "./translator.ts";
import type { Locale } from "./translator.ts";

/** English or Chinese text of one content field; an empty Chinese field is an error (§6.1). */
export function pickText(en: string, zh: string, locale: Locale, what: string): string {
  if (locale === "en") return en;
  if (zh.trim() !== "") return zh;
  if (defaultStrict()) throw new MissingTranslationError(`empty Chinese text for ${what}`);
  console.warn(`[i18n] empty Chinese text for ${what}`);
  return en;
}

type Pair = { readonly en: string; readonly zh: string };
const pair = (label: Pair, locale: Locale, what: string): string => pickText(label.en, label.zh, locale, what);

// ── Vocabulary (ruleErrorText.ts) ─────────────────────────────────────────────────────────

export const shapeName = (shape: Shape, locale: Locale): string => pair(SHAPE_TEXT[shape], locale, `shape ${shape}`);
export const glazeName = (glaze: Glaze, locale: Locale): string => pair(GLAZE_TEXT[glaze], locale, `glaze ${glaze}`);
export const decorationName = (decoration: Decoration, locale: Locale): string =>
  pair(DECORATION_TEXT[decoration], locale, `decoration ${decoration}`);
export const qualityName = (quality: Quality, locale: Locale): string => pair(QUALITY_TEXT[quality], locale, `quality ${quality}`);
export const disciplineName = (discipline: TechDiscipline, locale: Locale): string =>
  pair(DISCIPLINE_TEXT[discipline], locale, `discipline ${discipline}`);
export const zoneName = (zone: KilnZone, locale: Locale): string => pair(ZONE_TEXT[zone], locale, `zone ${zone}`);
export const stageName = (stage: CeramicStage, locale: Locale): string => pair(STAGE_TEXT[stage], locale, `stage ${stage}`);
export const phaseName = (phase: GamePhaseType, locale: Locale): string => pair(PHASE_TEXT[phase], locale, `phase ${phase}`);
export const workerKindName = (kind: WorkerKind | WorkerEffect, locale: Locale): string =>
  pair(WORKER_TEXT[kind], locale, `worker ${kind}`);

/** Singular English resource names, for a count of exactly 1 (Chinese has no plural). */
const RESOURCE_ONE: Readonly<Record<ResourceKind, string>> = { clay: "Clay", wood: "Wood", coins: "Coin" };

/** A resource name; pass `count` to get "1 Coin" vs "2 Coins" right in English. */
export function resourceName(kind: ResourceKind, locale: Locale, count?: number): string {
  if (locale === "en" && count !== undefined && Math.abs(count) === 1) return RESOURCE_ONE[kind];
  return pair(RESOURCE_TEXT[kind], locale, `resource ${kind}`);
}

export function contributionCardName(id: ContributionCardId, locale: Locale): string {
  const card = contributionCard(id);
  return pickText(card.name, card.nameZh, locale, `contribution card ${id}`);
}

export const CONTRIBUTION_CARDS: readonly ContributionCardId[] = CONTRIBUTION_CARD_IDS;

/**
 * The Techs whose printed text makes this Contribution card cost no Wood (Fuel Ledger's Bank and
 * Stoke: T12 `freeCards`, v1.6.2 L634); [] for a card no Tech changes. A fact the tile prints, so
 * the Contribution form can name the owned Tech that makes a card free.
 */
export function techsFreeingContributionCard(card: ContributionCardId): readonly TechId[] {
  return TECH_IDS.filter((id) => {
    const params: object = TECHS[id].params;
    return "freeCards" in params && Array.isArray(params.freeCards) && params.freeCards.includes(card);
  });
}

// ── Locations ─────────────────────────────────────────────────────────────────────────────

export function locationName(id: LocationId, locale: Locale): string {
  const location = LOCATIONS[id];
  return pickText(location.name, location.nameZh, locale, `location ${id}`);
}

/** The full printed effect text for one worker effect at a location. */
export function locationEffectText(id: LocationId, effect: WorkerEffect, locale: Locale): string {
  const location = LOCATIONS[id];
  return effect === "shifu"
    ? pickText(location.shifuText, location.shifuTextZh, locale, `location ${id} shifuText`)
    : pickText(location.apprenticeText, location.apprenticeTextZh, locale, `location ${id} apprenticeText`);
}

/** The catalogue key of a location's one-line summary (§5 gap 1). */
export function locationSummaryKey(id: LocationId, effect: WorkerEffect): `locationSummary.${LocationId}.${WorkerEffect}` {
  return `locationSummary.${id}.${effect}`;
}

// ── Techs and Kilns ───────────────────────────────────────────────────────────────────────

export interface TechText {
  name: string;
  short: string;
  ability: string;
}

export function techName(id: TechId, locale: Locale): string {
  const tech = TECHS[id];
  return pickText(tech.name, tech.nameZh, locale, `tech ${id}`);
}

export function techText(id: TechId, locale: Locale): TechText {
  const tech = TECHS[id];
  return {
    name: pickText(tech.name, tech.nameZh, locale, `tech ${id} name`),
    short: pickText(tech.shortText, tech.shortTextZh, locale, `tech ${id} shortText`),
    ability: pickText(tech.ability, tech.abilityZh, locale, `tech ${id} ability`),
  };
}

export interface KilnText {
  name: string;
  abilityName: string;
  short: string;
  ability: string;
}

export function kilnName(id: KilnId, locale: Locale): string {
  const kiln = KILNS[id];
  return pickText(kiln.name, kiln.nameZh, locale, `kiln ${id}`);
}

/** The seat-chip name: "Ru" in English, "汝窑" in Chinese (wireframe `kshort`). */
export function kilnShortName(id: KilnId, locale: Locale): string {
  const kiln = KILNS[id];
  return locale === "en" ? kiln.name.replace(/ Kiln$/, "") : pickText(kiln.name, kiln.nameZh, locale, `kiln ${id}`);
}

export function kilnText(id: KilnId, locale: Locale): KilnText {
  const kiln = KILNS[id];
  return {
    name: pickText(kiln.name, kiln.nameZh, locale, `kiln ${id} name`),
    abilityName: pickText(kiln.abilityName, kiln.abilityNameZh, locale, `kiln ${id} abilityName`),
    short: pickText(kiln.shortText, kiln.shortTextZh, locale, `kiln ${id} shortText`),
    ability: pickText(kiln.ability, kiln.abilityZh, locale, `kiln ${id} ability`),
  };
}

// ── Orders ────────────────────────────────────────────────────────────────────────────────

/** The printed requirement line (glossary §5.1 form in Chinese). */
export function orderRequirements(id: OrderId, locale: Locale): string {
  const order = ORDERS[id];
  return pickText(order.requirements, order.requirementsZh, locale, `order ${id} requirements`);
}

// ── Round phases and Recognition ──────────────────────────────────────────────────────────

export interface RoundPhaseText {
  id: RoundPhaseId;
  order: number;
  name: string;
  summary: string;
}

/** The five round phases in play order (`ROUND_STRUCTURE`, §5 gap 17). */
export function roundPhases(locale: Locale): RoundPhaseText[] {
  return ROUND_STRUCTURE.phases.map((phase) => ({
    id: phase.id,
    order: phase.order,
    name: pickText(phase.name, phase.nameZh, locale, `round phase ${phase.id} name`),
    summary: pickText(phase.summary, phase.summaryZh, locale, `round phase ${phase.id} summary`),
  }));
}

export interface RecognitionMilestoneText {
  space: Recognition;
  title: string;
  reward: string | null;
}

/** The Imperial Recognition track spaces 0–4 with their rewards (`IMPERIAL_TRACK`). */
export function recognitionMilestones(locale: Locale): RecognitionMilestoneText[] {
  return IMPERIAL_TRACK.track.map((space) => ({
    space: space.space,
    title: pickText(space.title, space.titleZh, locale, `recognition ${space.space} title`),
    reward: space.rewardText === null || space.rewardTextZh === null
      ? null
      : pickText(space.rewardText, space.rewardTextZh, locale, `recognition ${space.space} rewardText`),
  }));
}

// ── Rule numbers for catalogue placeholders (§5 gap 19) ───────────────────────────────────

const recognitionMax = Math.max(...IMPERIAL_TRACK.track.map((space) => space.space));

/**
 * Numbers that catalogue templates take as placeholders, read from content so no catalogue
 * string repeats a rule value. The firing-step count is the length of the `kiln` namespace's
 * step list (glossary §2.11), owned by B3 (`firingStepCount()`).
 */
export const RULE_NUMBERS = Object.freeze({
  rounds: GAME_CONFIG.rounds,
  playersMin: GAME_CONFIG.players.min,
  playersMax: GAME_CONFIG.players.max,
  workers: GAME_CONFIG.workers.shifu + GAME_CONFIG.workers.apprentices,
  handLimit: GAME_CONFIG.handLimit.base,
  displaySize: GAME_CONFIG.mainMarket.displaySize,
  techsMaxOwned: GAME_CONFIG.techs.maxOwned,
  techsPerDiscipline: GAME_CONFIG.techs.maxPerDiscipline,
  techsFaceUp: GAME_CONFIG.techs.faceUpPerDiscipline,
  coinsPerVp: GAME_CONFIG.coinEndGame.coinsPerVp,
  coinVpMax: GAME_CONFIG.coinEndGame.maxVp,
  baseHeatMin: FIRING.baseHeat.minimum,
  baseHeatMax: FIRING.baseHeat.maximum,
  salvageCoins: FIRING.salvageCoins,
  recognitionMax,
  overflowVpPerCrown: IMPERIAL_TRACK.overflowVpPerCrown,
  /** Canal Barge's Coins on your first completed Order each round (T23, v1.6.2 L622). */
  canalBargeCoins: TECHS.T23.params.coins,
  /** The Colour Samples swap's Select N: it looks at this many Main Orders (T10, v1.6.2 L622, change 25). */
  swapSelect: TECHS.T10.params.swapSelect,
  /** Second Firing turns this many extra Fire cards face up (T14, v1.6.2 L631). */
  secondFiringCards: TECHS.T14.params.extraCards,
});

export type RuleNumbers = typeof RULE_NUMBERS;

/**
 * The number of firing steps: the length of the `kiln` namespace's `step.<n>.full` list
 * (glossary §2.11, filled by B3). Zero until that list exists.
 */
export function firingStepCount(): number {
  return Object.keys(CATALOG.kiln.en).filter((key) => /^step\.\d+\.full$/.test(key)).length;
}

// ── Rules details (owner decision D10, K15; change requests CR B2-4, B3-2, B4-1, B5-1) ────
//
// What the shared rules-details panel (`rules/RulesDetail.tsx`) needs beyond names and rule
// text: each component's clarifications with their source tags, and the facts its card prints.
// Pure functions over content by stable ID; no rule is decided here.

/** A D10 clarification in the current language, with its raw source tags ("L376 · D7" → ["L376", "D7"]). */
export interface ClarificationText {
  readonly text: string;
  readonly tags: readonly string[];
}

/** The component whose rules details are shown. */
export type RulesRef =
  | { readonly kind: "tech"; readonly id: TechId }
  | { readonly kind: "kiln"; readonly id: KilnId }
  | { readonly kind: "location"; readonly id: LocationId }
  /** One Imperial Recognition milestone; the top one also carries the Crowns-beyond-it clarifications. */
  | { readonly kind: "recognition"; readonly space: Recognition }
  | { readonly kind: "order"; readonly id: OrderId };

function clarificationTexts(items: readonly ClarificationDefinition[], locale: Locale): ClarificationText[] {
  return items.map((item) => ({ text: locale === "en" ? item.en : item.zh, tags: clarificationTags(item.source) }));
}

/** The highest Recognition space (whose reward also opens Crown overflow). */
export const RECOGNITION_MAX: Recognition = IMPERIAL_TRACK.track.reduce<Recognition>((max, entry) => (entry.space > max ? entry.space : max), 0);

function milestoneSpace(kind: "imperial_kiln" | "imperial_priority" | "vp"): Recognition {
  const entry = IMPERIAL_TRACK.track.find((space) => space.reward !== null && space.reward.kind === kind);
  if (entry === undefined) throw new Error(`No Recognition milestone with a ${kind} reward`);
  return entry.space;
}

/** The Recognition space whose reward is the Imperial Kiln (Imperial Gift). */
export const IMPERIAL_KILN_RECOGNITION: Recognition = milestoneSpace("imperial_kiln");
/** The Recognition space whose reward is Imperial Priority. */
export const IMPERIAL_PRIORITY_RECOGNITION: Recognition = milestoneSpace("imperial_priority");
/** The Recognition space whose reward is Imperial Audience (VP). */
export const IMPERIAL_AUDIENCE_RECOGNITION: Recognition = milestoneSpace("vp");

/** The printed Imperial modifiers, in display order (the Imperial Kiln tile's −1 / 0 / +1 strip). */
export const IMPERIAL_MODIFIER_OPTIONS: readonly ImperialModifier[] = FIRING.imperialModifiers;

/**
 * The clarifications that apply to one component only (D10), in data order. The top
 * Recognition milestone also carries the Crowns-beyond-it clarifications (`imperial_overflow`);
 * an Order carries the Starting or Main Order clarifications of its deck.
 */
export function rulesClarifications(ref: RulesRef, locale: Locale): ClarificationText[] {
  switch (ref.kind) {
    case "tech":
      return clarificationTexts(TECHS[ref.id].clarifications, locale);
    case "kiln":
      return clarificationTexts(KILNS[ref.id].clarifications, locale);
    case "location":
      return clarificationTexts(LOCATIONS[ref.id].clarifications, locale);
    case "recognition": {
      const space = IMPERIAL_TRACK.track.find((entry) => entry.space === ref.space);
      const own = space === undefined ? [] : space.clarifications;
      const overflow = ref.space === RECOGNITION_MAX ? IMPERIAL_TRACK.clarifications.imperial_overflow : [];
      return clarificationTexts([...own, ...overflow], locale);
    }
    case "order":
      return clarificationTexts(ORDERS[ref.id].deck === "starting" ? ORDER_CLARIFICATIONS.starting : ORDER_CLARIFICATIONS.main, locale);
  }
}

/** The clarifications of Crowns beyond the top of the Recognition track (`imperial_overflow`). */
export function overflowClarifications(locale: Locale): ClarificationText[] {
  return clarificationTexts(IMPERIAL_TRACK.clarifications.imperial_overflow, locale);
}

/** Card facts a Tech tile prints (D10). */
export interface TechFacts {
  readonly discipline: TechDiscipline;
  readonly cost: number;
  readonly oncePerRound: boolean;
  /** The personal location whose second space it adds (D7 wording: "adds", never "unlocks"). */
  readonly adds: PersonalLocationId | null;
}

export function techFacts(id: TechId): TechFacts {
  const tech = TECHS[id];
  return { discipline: tech.discipline, cost: tech.cost, oncePerRound: tech.oncePerRound, adds: tech.unlocks };
}

/** Card facts a Kiln Player Board prints (read, never assumed). */
export interface KilnFacts {
  readonly oncePerRound: boolean;
}

export function kilnFacts(id: KilnId): KilnFacts {
  return { oncePerRound: KILNS[id].oncePerRound };
}

/** Card facts an Order card prints. A Crown Order is a Main Order with at least 1 printed Crown. */
export interface OrderFacts {
  readonly deck: "starting" | "main";
  readonly kind: "starting" | "commercial" | "crown";
  readonly vp: number;
  readonly coins: number;
  readonly crowns: number;
}

export function orderFacts(id: OrderId): OrderFacts {
  const order = ORDERS[id];
  const kind = order.deck === "starting" ? "starting" : order.crowns > 0 ? "crown" : "commercial";
  return { deck: order.deck, kind, vp: order.vp, coins: order.coins, crowns: order.crowns };
}

/** Facts a location prints: central or personal, its capacity for a player count, and Recognition limits. */
export interface LocationFacts {
  readonly scope: "central" | "personal";
  /** Central: the absolute capacity for this player count, or null for no limit. Personal: null. */
  readonly capacity: number | null;
  /** Magistrate's Hall: the Recognition values it may be used at. */
  readonly usableAtRecognition: readonly Recognition[] | null;
}

export function locationFacts(id: LocationId, playerCount: number): LocationFacts {
  const location = LOCATIONS[id];
  const key = String(playerCount) as "2" | "3" | "4";
  return {
    scope: location.scope,
    capacity: location.capacity === null ? null : (location.capacity[key] ?? null),
    usableAtRecognition: location.usableAtRecognition,
  };
}

/** Central or personal (`LOCATIONS[id].scope`). */
export function locationScope(id: LocationId): "central" | "personal" {
  return LOCATIONS[id].scope;
}
