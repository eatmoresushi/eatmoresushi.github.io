/**
 * V1.6.1 content layer (DESIGN §6, package P1). Layer 1: imports only types.
 *
 * Every rule value the engine reads comes from `data/*.json` through this module. The JSON is
 * validated when the module loads (DESIGN §6.9) and the module throws on any mismatch, so an
 * engine never runs on content that disagrees with the V1.6.1 rulebook's counts and tables.
 * The exported definitions are deep-frozen: content is never mutated at runtime.
 *
 * Iteration order: the exported ID lists (`TECH_IDS`, `KILN_SPACE_IDS`, `DISCIPLINES`, …) are
 * the canonical orders for rules, events and enumeration. Never derive order from the keys of
 * a content or state `Record` (DESIGN §2.3).
 */
import actionLocationsJson from "../../data/action_locations.json" with { type: "json" };
import firingJson from "../../data/firing.json" with { type: "json" };
import gameConfigJson from "../../data/game_config.json" with { type: "json" };
import imperialProgressJson from "../../data/imperial_progress.json" with { type: "json" };
import kilnsJson from "../../data/kilns.json" with { type: "json" };
import ordersJson from "../../data/orders.json" with { type: "json" };
import techniquesJson from "../../data/techniques.json" with { type: "json" };
import type {
  CentralLocationId,
  ClarificationDefinition,
  ContributionCardDefinition,
  ContributionCardId,
  Decoration,
  FiringDefinition,
  GameConfigDefinition,
  Glaze,
  ImperialTrackDefinition,
  KilnDefinition,
  KilnId,
  KilnSpaceId,
  KilnZone,
  LocationDefinition,
  LocationId,
  MainOrderId,
  OrderDefinition,
  OrderId,
  PersonalLocationId,
  PlayerCount,
  Quality,
  RulesVersion,
  Shape,
  StartingOrderId,
  TechDefinition,
  TechDiscipline,
  TechId,
  ZoneModifier,
} from "./types.ts";

// ── File shapes (DESIGN §6.3–6.6) ────────────────────────────────────────────────────────────

export interface ActionLocationsFile {
  rulesVersion: RulesVersion;
  locations: LocationDefinition[];
}

export interface KilnsFile {
  rulesVersion: RulesVersion;
  kilns: KilnDefinition[];
}

export interface TechniquesFile {
  rulesVersion: RulesVersion;
  advanced: TechDefinition[];
}

export interface OrdersFile {
  rulesVersion: RulesVersion;
  /** D10 clarifications for Orders in general: `starting` (S01–S16) and `main` (O01–O48). */
  clarifications: OrderClarifications;
  starting: OrderDefinition[];
  main: OrderDefinition[];
}

export interface OrderClarifications {
  starting: ClarificationDefinition[];
  main: ClarificationDefinition[];
}

/** The seven mechanical data files, as loaded. `validateContentFiles` checks any such set. */
export interface ContentFiles {
  gameConfig: GameConfigDefinition;
  firing: FiringDefinition;
  actionLocations: ActionLocationsFile;
  kilns: KilnsFile;
  techniques: TechniquesFile;
  orders: OrdersFile;
  imperialProgress: ImperialTrackDefinition;
}

// ── Canonical vocabulary and ID orders ──────────────────────────────────────────────────────

export const RULES_VERSION: RulesVersion = "1.6.1";

/** Shapes in Clay-cost order (L321–327). */
export const SHAPES: readonly Shape[] = Object.freeze(["bowl", "plate", "washer", "vase", "censer"] as const);
/** Glazes coolest to hottest (L346–351). */
export const GLAZES: readonly Glaze[] = Object.freeze(["white", "celadon", "grey_green", "moon_white"] as const);
/** Decorations (L335–340). Painted replaced Crackle (change 19). */
export const DECORATIONS: readonly Decoration[] = Object.freeze(["plain", "carved", "impressed", "painted"] as const);
/** Disciplines in rulebook order (L374); also the setup shuffle order (DESIGN §7). */
export const DISCIPLINES: readonly TechDiscipline[] = Object.freeze(["workshop", "glazing_loading", "firing"] as const);
/** Qualities lowest to highest. */
export const QUALITIES: readonly Quality[] = Object.freeze(["flawed", "standard", "fine", "masterpiece"] as const);
/** Quality order for "at least" comparisons: Flawed 0 < Standard 1 < Fine 2 < Masterpiece 3. */
export const QUALITY_RANK: Readonly<Record<Quality, number>> = Object.freeze({
  flawed: 0,
  standard: 1,
  fine: 2,
  masterpiece: 3,
});

/** Kiln Player Boards in rulebook order (L73). All five are selectable (R1). */
export const KILN_IDS: readonly KilnId[] = Object.freeze(["RU", "GU", "GE", "DI", "JU"] as const);

/** The 18 Advanced Techs in Appendix B order (Form & Decorate, Glazing & Loading, Firing). */
export const TECH_IDS: readonly TechId[] = Object.freeze([
  "T01", "T16", "T05", "T17", "T18", "T19",
  "T10", "T20", "T15", "T21", "T22", "T23",
  "T11", "T12", "T13", "T14", "T24", "T25",
] as const);

/** Central locations (L49, L71). */
export const CENTRAL_LOCATION_IDS: readonly CentralLocationId[] = Object.freeze([
  "materials_yard",
  "commission_market",
  "guild_hall",
  "canal_wharf",
  "magistrates_hall",
] as const);

/** Personal locations on each Kiln Player Board (L50). */
export const PERSONAL_LOCATION_IDS: readonly PersonalLocationId[] = Object.freeze(["form_decorate", "glaze_load"] as const);

/** All seven locations in rulebook section order (L158–233; Appendix E action summary). */
export const LOCATION_IDS: readonly LocationId[] = Object.freeze([
  "materials_yard",
  "form_decorate",
  "glaze_load",
  "commission_market",
  "guild_hall",
  "canal_wharf",
  "magistrates_hall",
] as const);

/** Shared Kiln spaces: 3 High, 3 Middle, 2 Low (L72). Iterate this, never `sharedKiln.spaces`. */
export const KILN_SPACE_IDS: readonly KilnSpaceId[] = Object.freeze([
  "high_1", "high_2", "high_3",
  "middle_1", "middle_2", "middle_3",
  "low_1", "low_2",
] as const);

/** The 16 Starting Orders (A0, L519–540). */
export const STARTING_ORDER_IDS: readonly StartingOrderId[] = Object.freeze(
  Array.from({ length: 16 }, (_, index) => `S${String(index + 1).padStart(2, "0")}` as StartingOrderId),
);

/** The 48 Main Orders (A1–A3, L542–605). */
export const MAIN_ORDER_IDS: readonly MainOrderId[] = Object.freeze(
  Array.from({ length: 48 }, (_, index) => `O${String(index + 1).padStart(2, "0")}` as MainOrderId),
);

/** Every Order: Starting first, then Main. */
export const ORDER_IDS: readonly OrderId[] = Object.freeze([...STARTING_ORDER_IDS, ...MAIN_ORDER_IDS]);

/** Contribution cards (L253–259). */
export const CONTRIBUTION_CARD_IDS: readonly ContributionCardId[] = Object.freeze(["BANK", "TEND", "STOKE"] as const);

const PLAYER_COUNT_KEYS = ["2", "3", "4"] as const;
type PlayerCountKey = (typeof PLAYER_COUNT_KEYS)[number];

/** Expected unlock per discipline (L212, L376). */
const DISCIPLINE_UNLOCKS: Readonly<Record<TechDiscipline, PersonalLocationId | null>> = {
  workshop: "form_decorate",
  glazing_loading: "glaze_load",
  firing: null,
};

/** Shared Kiln zone layout by player count: High-Middle-Low (L100). */
const ACTIVE_ZONE_COUNTS: Readonly<Record<PlayerCountKey, Record<KilnZone, number>>> = {
  "2": { high: 2, middle: 1, low: 1 },
  "3": { high: 2, middle: 2, low: 2 },
  "4": { high: 3, middle: 3, low: 2 },
};

const ZONE_MODIFIERS: Readonly<Record<KilnZone, ZoneModifier>> = { high: 1, middle: 0, low: -1 };

// ── Validation (DESIGN §6.9) ────────────────────────────────────────────────────────────────

function sameMembers(actual: readonly unknown[], expected: readonly unknown[]): boolean {
  return actual.length === expected.length && new Set(actual).size === actual.length
    && expected.every((value) => actual.includes(value));
}

function sameSequence(actual: readonly unknown[], expected: readonly unknown[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Collects every display string (key `name`, `…Zh`, `…Text`, `ability…`, …) for the
 * non-empty text check. A `null` text is allowed only where the type allows it. */
const TEXT_KEY = /^(name|nameZh|ability|abilityZh|abilityName|abilityNameZh|shortText|shortTextZh|apprenticeText|apprenticeTextZh|shifuText|shifuTextZh|title|titleZh|rewardText|rewardTextZh|requirements|requirementsZh)$/;

function collectTextProblems(value: unknown, path: string, problems: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTextProblems(item, `${path}[${index}]`, problems));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const itemPath = `${path}.${key}`;
    if (TEXT_KEY.test(key)) {
      const nullable = key === "rewardText" || key === "rewardTextZh";
      if (item === null && nullable) continue;
      if (typeof item !== "string" || item.trim().length === 0) problems.push(`${itemPath}: display text must be a non-empty string`);
    } else {
      collectTextProblems(item, itemPath, problems);
    }
  }
}

// ── Clarifications and short text (owner decision D10, UI architecture K15) ──────────────────

/**
 * One source tag of a clarification (`docs/KILN_OPENING_v1.6.1_CLARIFICATIONS.md`, "Source
 * tags"): `L124` rulebook line, `A1` amendment, `R1`–`R13` and `B1`–`B3` owner rulings,
 * `ED L124` editorial correction, `INT <name>` recorded interpretation, `P1`–`P3` provisional
 * ruling, `D7` owner UI decision. A `source` joins one or more tags with " · ".
 */
export const CLARIFICATION_TAG = /^(?:L[1-9]\d{0,3}|A[1-9]\d?|R(?:[1-9]|1[0-3])|B[1-3]|ED L[1-9]\d{0,3}|INT [A-Z][^·]*[^\s·]|P[1-3]|D(?:[1-9]|1[01]))$/;

/** The kind of a source tag, which the UI labels (Rulebook, Owner amendment, Owner ruling, …). */
export type ClarificationSourceKind = "rulebook" | "amendment" | "ruling" | "editorial" | "interpretation" | "provisional" | "wording";

/** The tags of a clarification `source`, in order ("L376 · D7" → ["L376", "D7"]). */
export function clarificationTags(source: string): string[] {
  return source.split(" · ");
}

/** The kind of one well-formed source tag. Throws on a malformed tag (content is validated at load). */
export function clarificationSourceKind(tag: string): ClarificationSourceKind {
  if (!CLARIFICATION_TAG.test(tag)) throw new Error(`Malformed clarification source tag "${tag}"`);
  if (tag.startsWith("ED ")) return "editorial";
  if (tag.startsWith("INT ")) return "interpretation";
  switch (tag.charAt(0)) {
    case "L": return "rulebook";
    case "A": return "amendment";
    case "R":
    case "B": return "ruling";
    case "P": return "provisional";
    default: return "wording";
  }
}

function validateClarifications(items: unknown, where: string, problems: string[], allowEmpty = false): void {
  if (!Array.isArray(items)) {
    problems.push(`${where}: clarifications must be an array`);
    return;
  }
  if (items.length === 0 && !allowEmpty) problems.push(`${where}: needs at least 1 clarification (D10)`);
  for (const [index, item] of items.entries()) {
    const record = item as Partial<ClarificationDefinition> | null;
    const at = `${where}.clarifications[${index}]`;
    if (record === null || typeof record !== "object" || Object.keys(record).sort().join() !== "en,source,zh") {
      problems.push(`${at}: must be exactly { en, zh, source }`);
      continue;
    }
    for (const key of ["en", "zh", "source"] as const) {
      const value = record[key];
      if (typeof value !== "string" || value.trim() !== value || value.length === 0) problems.push(`${at}.${key}: must be a trimmed non-empty string`);
    }
    if (typeof record.source === "string" && !clarificationTags(record.source).every((tag) => CLARIFICATION_TAG.test(tag))) {
      problems.push(`${at}.source: malformed tag in "${record.source}"`);
    }
  }
}

/**
 * Secondary labels of the short component text (`docs/KILN_OPENING_v1.6.1_COMPONENT_TEXT_SOURCE.md`,
 * "Format rules"). The timing clause runs to the first colon; after it, these labels open a
 * second clause (Colour Samples' "Ongoing:", Ge's "Orders:"). The UI bolds both.
 */
export const SHORT_TEXT_SECONDARY_LABELS: readonly string[] = Object.freeze(["Ongoing:", "Orders:", "持续：", "完成委托时："]);

/**
 * Splits a plain-text `shortText` / `shortTextZh` into runs for display: the timing clause up to
 * and including the first ":" or "：" is emphasised, and so is each secondary label that follows
 * it. The text carries no Markdown; joining the runs gives the text back unchanged.
 */
export function shortTextSegments(text: string): Array<{ text: string; emphasis: boolean }> {
  const colon = text.search(/[:：]/);
  if (colon < 0) return [{ text, emphasis: false }];
  const segments: Array<{ text: string; emphasis: boolean }> = [{ text: text.slice(0, colon + 1), emphasis: true }];
  let rest = text.slice(colon + 1);
  while (rest.length > 0) {
    const hits = SHORT_TEXT_SECONDARY_LABELS
      .map((label) => ({ label, at: rest.indexOf(label) }))
      .filter((hit) => hit.at >= 0)
      .sort((left, right) => left.at - right.at);
    const next = hits[0];
    if (next === undefined) {
      segments.push({ text: rest, emphasis: false });
      break;
    }
    if (next.at > 0) segments.push({ text: rest.slice(0, next.at), emphasis: false });
    segments.push({ text: next.label, emphasis: true });
    rest = rest.slice(next.at + next.label.length);
  }
  return segments;
}

function validateOrder(order: OrderDefinition, deck: "starting" | "main", problems: string[]): void {
  const where = `order ${order.id}`;
  if (order.deck !== deck) problems.push(`${where}: deck must be "${deck}"`);
  if (!Array.isArray(order.ceramics) || order.ceramics.length < 1 || order.ceramics.length > 3) {
    problems.push(`${where}: 1–3 ceramic slots required`);
    return;
  }
  for (const [index, slot] of order.ceramics.entries()) {
    if (slot.shape !== undefined && !SHAPES.includes(slot.shape)) problems.push(`${where} slot ${index}: unknown shape`);
    if (slot.shapes !== undefined && (slot.shapes.length < 2 || slot.shapes.some((shape) => !SHAPES.includes(shape)))) {
      problems.push(`${where} slot ${index}: shapes must list 2+ known Shapes`);
    }
    if (slot.shape !== undefined && slot.shapes !== undefined) problems.push(`${where} slot ${index}: shape and shapes are exclusive`);
    if (slot.glaze !== undefined && !GLAZES.includes(slot.glaze)) problems.push(`${where} slot ${index}: unknown glaze`);
    if (slot.decoration !== undefined && !DECORATIONS.includes(slot.decoration)) problems.push(`${where} slot ${index}: unknown decoration`);
  }
  const slotIndices = order.ceramics.map((_, index) => index);
  for (const relation of order.relations ?? []) {
    switch (relation.type) {
      case "required_glazes":
        if (relation.values.length > order.ceramics.length || relation.values.some((glaze) => !GLAZES.includes(glaze))) {
          problems.push(`${where}: required_glazes must list at most one known Glaze per slot`);
        }
        break;
      case "required_decorations":
        if (relation.values.length > order.ceramics.length || relation.values.some((decoration) => !DECORATIONS.includes(decoration))) {
          problems.push(`${where}: required_decorations must list at most one known Decoration per slot`);
        }
        break;
      case "at_least_n_quality":
        if (!QUALITIES.includes(relation.quality) || !isNonNegativeInteger(relation.count) || relation.count < 1
          || relation.count > order.ceramics.length) {
          problems.push(`${where}: at_least_n_quality needs a known Quality and 1..slots count`);
        }
        break;
      case "at_least_n_distinct_decorations":
        if (!isNonNegativeInteger(relation.count) || relation.count < 2 || relation.count > order.ceramics.length) {
          problems.push(`${where}: at_least_n_distinct_decorations count out of range`);
        }
        if (!sameSequence(relation.indices, slotIndices)) problems.push(`${where}: ${relation.type} indices must name every slot`);
        break;
      default:
        if (!sameSequence(relation.indices, slotIndices)) problems.push(`${where}: ${relation.type} indices must name every slot`);
        if (order.ceramics.length < 2) problems.push(`${where}: ${relation.type} needs 2+ slots`);
    }
  }
  if (!QUALITIES.includes(order.minQuality) || (order.minQuality as Quality) === "flawed") problems.push(`${where}: minQuality must be standard, fine or masterpiece`);
  if (!isNonNegativeInteger(order.vp) || order.vp < 1) problems.push(`${where}: vp must be a positive integer`);
  if (!isNonNegativeInteger(order.coins)) problems.push(`${where}: coins must be a non-negative integer`);
  if (![0, 1, 2, 3].includes(order.crowns)) problems.push(`${where}: crowns must be 0–3`);
  if (deck === "starting") {
    if (order.crowns !== 0) problems.push(`${where}: Starting Orders have no Crowns (L521)`);
    if (order.minQuality !== "standard") problems.push(`${where}: every Starting Order accepts Standard (L521)`);
  }
}

/**
 * Returns every problem found in a set of content files (empty = valid). Pure; the module
 * runs it on the checked-in files at load and throws on any problem.
 */
export function validateContentFiles(files: ContentFiles): string[] {
  const problems: string[] = [];
  const { gameConfig, firing, actionLocations, kilns, techniques, orders, imperialProgress } = files;

  // Versions.
  const versions: Array<[string, unknown]> = [
    ["game_config", gameConfig.rulesVersion],
    ["firing", firing.rulesVersion],
    ["action_locations", actionLocations.rulesVersion],
    ["kilns", kilns.rulesVersion],
    ["techniques", techniques.rulesVersion],
    ["orders", orders.rulesVersion],
    ["imperial_progress", imperialProgress.rulesVersion],
  ];
  for (const [file, version] of versions) {
    if (version !== RULES_VERSION) problems.push(`${file}: rulesVersion must be "${RULES_VERSION}"`);
  }

  // Game configuration.
  if (gameConfig.players.min !== 2 || gameConfig.players.max !== 4) problems.push("game_config: players must be 2–4");
  if (gameConfig.rounds !== 5) problems.push("game_config: rounds must be 5");
  for (const value of Object.values(gameConfig.startingResources)) {
    if (!isNonNegativeInteger(value)) problems.push("game_config: startingResources must be non-negative integers");
  }
  if (!sameMembers(Object.keys(gameConfig.shapes), SHAPES)) problems.push("game_config: shapes must list the five Shapes");
  if (!sameMembers(Object.keys(gameConfig.glazes), GLAZES)) problems.push("game_config: glazes must list the four Glazes");
  if (!sameMembers(Object.keys(gameConfig.decorations), DECORATIONS)) problems.push("game_config: decorations must list the four Decorations");
  for (const value of [...Object.values(gameConfig.shapes), ...Object.values(gameConfig.decorations), ...Object.values(gameConfig.glazes)]) {
    if (!isNonNegativeInteger(value)) problems.push("game_config: Shape, Decoration and Glaze values must be non-negative integers");
  }
  if (gameConfig.techs.perDiscipline * DISCIPLINES.length !== TECH_IDS.length) problems.push("game_config: techs.perDiscipline × 3 must equal 18");
  for (const key of PLAYER_COUNT_KEYS) {
    const active = gameConfig.sharedKiln.activeSpacesByPlayerCount[key];
    if (!Array.isArray(active) || new Set(active).size !== active.length || active.some((id) => !KILN_SPACE_IDS.includes(id))) {
      problems.push(`game_config: active spaces for ${key} players must be distinct known spaces`);
      continue;
    }
    const zones: Record<KilnZone, number> = { high: 0, middle: 0, low: 0 };
    for (const id of active) zones[zoneOfId(id)] += 1;
    const expected = ACTIVE_ZONE_COUNTS[key];
    if (zones.high !== expected.high || zones.middle !== expected.middle || zones.low !== expected.low) {
      problems.push(`game_config: ${key} players must use ${expected.high}-${expected.middle}-${expected.low} active spaces (L100)`);
    }
  }

  // Firing.
  if (!sameSequence(firing.kilnSpaces.map((space) => space.id), KILN_SPACE_IDS)) problems.push("firing: kilnSpaces must be the 8 spaces in canonical order");
  for (const space of firing.kilnSpaces) {
    if (space.zone !== zoneOfId(space.id)) problems.push(`firing: ${space.id} zone mismatch`);
    if (space.modifier !== ZONE_MODIFIERS[space.zone]) problems.push(`firing: ${space.id} modifier must be ${ZONE_MODIFIERS[space.zone]}`);
  }
  if (!sameSequence(firing.kilnDie.faces, [1, 1, 2, 2, 3, 3])) problems.push("firing: Kiln Die faces must be 1,1,2,2,3,3 (L93)");
  if (firing.baseHeat.minimum !== 0 || firing.baseHeat.maximum !== 5) problems.push("firing: Base Heat clamps to 0–5 (L249)");
  const fireCounts = [-2, -1, 0, 1, 2].map((modifier) => firing.fireDeck.filter((card) => card === modifier).length);
  if (firing.fireDeck.length !== 12 || !sameSequence(fireCounts, [1, 3, 4, 3, 1])) problems.push("firing: Fire deck must be −2×1, −1×3, 0×4, +1×3, +2×1 (L660–666)");
  const qualities = firing.qualityByHeatDifference;
  if (!sameSequence(qualities.map((row) => row.quality), ["masterpiece", "fine", "standard", "flawed"])
    || !sameSequence(qualities.map((row) => row.maxDifference), [0, 1, 2, null])) {
    problems.push("firing: Quality table must be 0 Masterpiece, 1 Fine, 2 Standard, 3+ Flawed (L274–279)");
  }
  if (!sameSequence(firing.contributionCards.map((card) => card.id), CONTRIBUTION_CARD_IDS)) problems.push("firing: contribution cards must be BANK, TEND, STOKE");
  if (!sameSequence(firing.imperialModifiers, [-1, 0, 1])) problems.push("firing: Imperial modifiers must be −1, 0, +1");
  if (!isNonNegativeInteger(firing.salvageCoins)) problems.push("firing: salvageCoins must be a non-negative integer");

  // Locations.
  const locationIds = actionLocations.locations.map((location) => location.id);
  if (!sameSequence(locationIds, LOCATION_IDS)) problems.push("action_locations: must list the 7 locations in canonical order");
  for (const location of actionLocations.locations) {
    const personal = (PERSONAL_LOCATION_IDS as readonly LocationId[]).includes(location.id);
    if (location.scope !== (personal ? "personal" : "central")) problems.push(`action_locations: ${location.id} scope mismatch`);
    if (personal) {
      if (location.capacity !== null) problems.push(`action_locations: ${location.id} has no central capacity`);
      if (location.personalSpaces === null || location.personalSpaces.total !== 2 || location.personalSpaces.unlockedAtStart !== 1) {
        problems.push(`action_locations: ${location.id} must have 2 spaces with 1 unlocked at start (L73)`);
      }
    } else {
      if (location.capacity === null || !PLAYER_COUNT_KEYS.every((key) => key in (location.capacity ?? {}))) {
        problems.push(`action_locations: ${location.id} needs a capacity for 2/3/4 players`);
      } else {
        for (const key of PLAYER_COUNT_KEYS) {
          const value = location.capacity[key];
          if (value !== null && (!isNonNegativeInteger(value) || value < 1)) problems.push(`action_locations: ${location.id} capacity must be positive or null`);
        }
      }
      if (location.personalSpaces !== null) problems.push(`action_locations: ${location.id} is not personal`);
    }
    if (location.usableAtRecognition !== null && location.id !== "magistrates_hall") {
      problems.push(`action_locations: only the Magistrate's Hall has a Recognition gate`);
    }
  }

  // Kilns.
  if (!sameSequence(kilns.kilns.map((kiln) => kiln.id), KILN_IDS)) problems.push("kilns: must list RU, GU, GE, DI, JU");
  for (const kiln of kilns.kilns) {
    if (kiln.oncePerRound !== true) problems.push(`kilns: ${kiln.id} is once per round`);
    if (kiln.params === null || typeof kiln.params !== "object") problems.push(`kilns: ${kiln.id} needs params`);
  }

  // Techs.
  if (!sameSequence(techniques.advanced.map((tech) => tech.id), TECH_IDS)) problems.push("techniques: must list the 18 Tech IDs in Appendix B order");
  for (const discipline of DISCIPLINES) {
    const count = techniques.advanced.filter((tech) => tech.discipline === discipline).length;
    if (count !== gameConfig.techs.perDiscipline) problems.push(`techniques: ${discipline} must have ${gameConfig.techs.perDiscipline} Techs`);
  }
  for (const tech of techniques.advanced) {
    if (!DISCIPLINES.includes(tech.discipline)) problems.push(`techniques: ${tech.id} unknown discipline`);
    else if (tech.unlocks !== DISCIPLINE_UNLOCKS[tech.discipline]) problems.push(`techniques: ${tech.id} unlocks must follow its discipline (L212)`);
    if (!isNonNegativeInteger(tech.cost) || tech.cost < 1) problems.push(`techniques: ${tech.id} cost must be a positive integer`);
    if (typeof tech.oncePerRound !== "boolean") problems.push(`techniques: ${tech.id} oncePerRound must be boolean`);
    if (tech.params === null || typeof tech.params !== "object") problems.push(`techniques: ${tech.id} needs params`);
  }

  // Orders.
  if (!sameSequence(orders.starting.map((order) => order.id), STARTING_ORDER_IDS)) problems.push("orders: starting must be S01–S16 in order");
  if (!sameSequence(orders.main.map((order) => order.id), MAIN_ORDER_IDS)) problems.push("orders: main must be O01–O48 in order");
  for (const order of orders.starting) validateOrder(order, "starting", problems);
  for (const order of orders.main) validateOrder(order, "main", problems);

  // Imperial track.
  const track = imperialProgress.track;
  if (!sameSequence(track.map((space) => space.space), [0, 1, 2, 3, 4])) problems.push("imperial_progress: track must be Recognition 0–4");
  if (!sameSequence(track.map((space) => space.id), ["local_workshop", "imperial_grant", "imperial_gift", "imperial_priority", "imperial_audience"])) {
    problems.push("imperial_progress: track milestone IDs out of order");
  }
  if (!sameSequence(track.map((space) => space.reward?.kind ?? null), [null, "resources", "imperial_kiln", "imperial_priority", "vp"])) {
    problems.push("imperial_progress: rewards must be none, resources, Imperial Kiln, Imperial Priority, VP (L429–436)");
  }
  if (!isNonNegativeInteger(imperialProgress.overflowVpPerCrown)) problems.push("imperial_progress: overflowVpPerCrown must be a non-negative integer");
  if (imperialProgress.exhibition.minimumQuality !== "standard") problems.push("imperial_progress: Exhibition accepts Standard or better (L444)");

  // Clarifications (D10): prose, outside the rules fingerprint; only their shape is checked here.
  for (const location of actionLocations.locations) validateClarifications(location.clarifications, `action_locations: ${location.id}`, problems);
  for (const kiln of kilns.kilns) validateClarifications(kiln.clarifications, `kilns: ${kiln.id}`, problems);
  for (const tech of techniques.advanced) validateClarifications(tech.clarifications, `techniques: ${tech.id}`, problems);
  for (const space of track) {
    validateClarifications(space.clarifications, `imperial_progress: ${space.id}`, problems, space.reward === null);
  }
  validateClarifications(imperialProgress.clarifications?.imperial_overflow, "imperial_progress: imperial_overflow", problems);
  validateClarifications(orders.clarifications?.starting, "orders: starting", problems);
  validateClarifications(orders.clarifications?.main, "orders: main", problems);

  // Short component text: plain text with a timing clause ending in a colon (component text source).
  for (const definition of [...kilns.kilns, ...techniques.advanced]) {
    for (const text of [definition.shortText, definition.shortTextZh]) {
      if (typeof text === "string" && (!/[:：]/.test(text) || /[*_`#]/.test(text) || text.includes("\n"))) {
        problems.push(`${definition.id}: short text must be one plain line with a timing clause ending in a colon`);
      }
    }
  }

  // Display text, Chinese included.
  collectTextProblems(firing.contributionCards, "firing.contributionCards", problems);
  collectTextProblems(actionLocations.locations, "action_locations", problems);
  collectTextProblems(kilns.kilns, "kilns", problems);
  collectTextProblems(techniques.advanced, "techniques", problems);
  collectTextProblems([...orders.starting, ...orders.main], "orders", problems);
  collectTextProblems(track, "imperial_progress.track", problems);

  return problems;
}

/** `high_2` → `high`, from the canonical ID shape (validated against `firing.json`). */
function zoneOfId(id: KilnSpaceId): KilnZone {
  if (id.startsWith("high_")) return "high";
  if (id.startsWith("middle_")) return "middle";
  return "low";
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

// ── Load, validate, freeze ──────────────────────────────────────────────────────────────────

const FILES: ContentFiles = {
  gameConfig: gameConfigJson as unknown as GameConfigDefinition,
  firing: firingJson as unknown as FiringDefinition,
  actionLocations: actionLocationsJson as unknown as ActionLocationsFile,
  kilns: kilnsJson as unknown as KilnsFile,
  techniques: techniquesJson as unknown as TechniquesFile,
  orders: ordersJson as unknown as OrdersFile,
  imperialProgress: imperialProgressJson as unknown as ImperialTrackDefinition,
};

const LOAD_PROBLEMS = validateContentFiles(FILES);
if (LOAD_PROBLEMS.length > 0) {
  throw new Error(`Invalid V1.6.1 content (data/*.json):\n- ${LOAD_PROBLEMS.join("\n- ")}`);
}
deepFreeze(FILES);

export const GAME_CONFIG: GameConfigDefinition = FILES.gameConfig;
export const FIRING: FiringDefinition = FILES.firing;
export const IMPERIAL_TRACK: ImperialTrackDefinition = FILES.imperialProgress;

function byId<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  return Object.freeze(Object.fromEntries(items.map((item) => [item.id, item])));
}

export const LOCATIONS: { readonly [K in LocationId]: LocationDefinition<K> } =
  byId(FILES.actionLocations.locations) as unknown as { readonly [K in LocationId]: LocationDefinition<K> };

export const KILNS: { readonly [K in KilnId]: KilnDefinition<K> } =
  byId(FILES.kilns.kilns) as unknown as { readonly [K in KilnId]: KilnDefinition<K> };

export const TECHS: { readonly [K in TechId]: TechDefinition<K> } =
  byId(FILES.techniques.advanced) as unknown as { readonly [K in TechId]: TechDefinition<K> };

export const ORDERS: Readonly<Record<OrderId, OrderDefinition>> =
  byId([...FILES.orders.starting, ...FILES.orders.main]) as Readonly<Record<OrderId, OrderDefinition>>;

/** D10 clarifications for Starting Orders and for Main Orders in general (prose). */
export const ORDER_CLARIFICATIONS: Readonly<OrderClarifications> = FILES.orders.clarifications;

const CONTRIBUTION_CARDS = byId(FILES.firing.contributionCards) as Readonly<Record<ContributionCardId, ContributionCardDefinition>>;
const KILN_SPACES = byId(FILES.firing.kilnSpaces) as Readonly<Record<KilnSpaceId, FiringDefinition["kilnSpaces"][number]>>;

const TECHS_BY_DISCIPLINE: Readonly<Record<TechDiscipline, readonly TechId[]>> = Object.freeze({
  workshop: Object.freeze(TECH_IDS.filter((id) => TECHS[id].discipline === "workshop")),
  glazing_loading: Object.freeze(TECH_IDS.filter((id) => TECHS[id].discipline === "glazing_loading")),
  firing: Object.freeze(TECH_IDS.filter((id) => TECHS[id].discipline === "firing")),
});

const ACTIVE_KILN_SPACES: Readonly<Record<PlayerCountKey, readonly KilnSpaceId[]>> = Object.freeze({
  "2": Object.freeze(KILN_SPACE_IDS.filter((id) => GAME_CONFIG.sharedKiln.activeSpacesByPlayerCount["2"].includes(id))),
  "3": Object.freeze(KILN_SPACE_IDS.filter((id) => GAME_CONFIG.sharedKiln.activeSpacesByPlayerCount["3"].includes(id))),
  "4": Object.freeze(KILN_SPACE_IDS.filter((id) => GAME_CONFIG.sharedKiln.activeSpacesByPlayerCount["4"].includes(id))),
});

function playerCountKey(playerCount: PlayerCount): PlayerCountKey {
  const key = String(playerCount);
  if (key !== "2" && key !== "3" && key !== "4") throw new Error(`Unsupported player count: ${key}`);
  return key;
}

// ── Derived lookups ─────────────────────────────────────────────────────────────────────────

/** Preferred Heat of a Glaze: White 1, Celadon 2, Grey-Green 3, Moon White 4 (L60, L346–351). */
export function preferredHeat(glaze: Glaze): number {
  return GAME_CONFIG.glazes[glaze];
}

/** Clay cost to form a Shape (L321–327). */
export function shapeClay(shape: Shape): number {
  return GAME_CONFIG.shapes[shape];
}

/** Printed Coin cost of a Decoration before discounts: 2 each (L333–340). */
export function decorationCost(decoration: Decoration): number {
  return GAME_CONFIG.decorations[decoration];
}

/** The zone of a Shared Kiln space (L72). */
export function zoneOf(space: KilnSpaceId): KilnZone {
  return KILN_SPACES[space].zone;
}

/** The printed zone modifier of a Shared Kiln space: High +1, Middle 0, Low −1 (L72, L245). */
export function zoneModifier(space: KilnSpaceId): ZoneModifier {
  return KILN_SPACES[space].modifier;
}

/** Active (uncovered) Shared Kiln spaces for a player count, in `KILN_SPACE_IDS` order (L100). */
export function activeKilnSpaces(playerCount: PlayerCount): readonly KilnSpaceId[] {
  return ACTIVE_KILN_SPACES[playerCountKey(playerCount)];
}

/**
 * Absolute capacity of a central location for a player count (L146–156): a number, or `null`
 * for the uncapped Canal Wharf. Personal locations have no shared capacity — their spaces are
 * per player (`PlayerState.personalSpaces`) — so asking for one is an engine bug and throws.
 */
export function locationCapacity(locationId: LocationId, playerCount: PlayerCount): number | null {
  const capacity = LOCATIONS[locationId].capacity;
  if (capacity === null) throw new Error(`${locationId} is a personal location and has no central capacity`);
  return capacity[playerCountKey(playerCount)];
}

/**
 * Quality for a Heat Difference (L274–279): 0 Masterpiece, 1 Fine, 2 Standard, 3+ Flawed.
 * The difference is absolute (L64); a signed value is taken by its absolute value.
 */
export function qualityForDifference(difference: number): Quality {
  if (!Number.isInteger(difference)) throw new Error(`Heat Difference must be an integer, got ${difference}`);
  const absolute = Math.abs(difference);
  for (const row of FIRING.qualityByHeatDifference) {
    if (row.maxDifference === null || absolute <= row.maxDifference) return row.quality;
  }
  throw new Error("Quality table has no open-ended row");
}

/** Wood cost and Heat of a Contribution card (L253–259). Fuel Ledger's ±1 lives in T12 params. */
export function contributionCard(id: ContributionCardId): ContributionCardDefinition {
  return CONTRIBUTION_CARDS[id];
}

/** The six Techs of a discipline, in `TECH_IDS` order (L374). */
export function techsOfDiscipline(discipline: TechDiscipline): readonly TechId[] {
  return TECHS_BY_DISCIPLINE[discipline];
}

/** True for S01–S16. Discarded Starting Orders return to the box, never the Main discard (L304). */
export function isStartingOrderId(orderId: OrderId): orderId is StartingOrderId {
  return ORDERS[orderId].deck === "starting";
}
