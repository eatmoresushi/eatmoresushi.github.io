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
  PHASE_TEXT,
  QUALITY_TEXT,
  RESOURCE_TEXT,
  ROUND_STRUCTURE,
  SHAPE_TEXT,
  STAGE_TEXT,
  TECHS,
  WORKER_TEXT,
  ZONE_TEXT,
  contributionCard,
} from "../../game/index.ts";
import type {
  CeramicStage,
  ContributionCardId,
  Decoration,
  GamePhaseType,
  Glaze,
  KilnId,
  KilnZone,
  LocationId,
  OrderId,
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
  techVp: GAME_CONFIG.techs.vpEach,
  coinsPerVp: GAME_CONFIG.coinEndGame.coinsPerVp,
  coinVpMax: GAME_CONFIG.coinEndGame.maxVp,
  baseHeatMin: FIRING.baseHeat.minimum,
  baseHeatMax: FIRING.baseHeat.maximum,
  salvageCoins: FIRING.salvageCoins,
  recognitionMax,
  overflowVpPerCrown: IMPERIAL_TRACK.overflowVpPerCrown,
});

export type RuleNumbers = typeof RULE_NUMBERS;

/**
 * The number of firing steps: the length of the `kiln` namespace's `step.<n>.full` list
 * (glossary §2.11, filled by B3). Zero until that list exists.
 */
export function firingStepCount(): number {
  return Object.keys(CATALOG.kiln.en).filter((key) => /^step\.\d+\.full$/.test(key)).length;
}
