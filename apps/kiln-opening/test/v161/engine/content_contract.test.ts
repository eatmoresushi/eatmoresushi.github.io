import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CENTRAL_LOCATION_IDS,
  CONTRIBUTION_CARD_IDS,
  DECORATIONS,
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_TRACK,
  KILN_IDS,
  KILN_SPACE_IDS,
  KILNS,
  LOCATION_IDS,
  LOCATIONS,
  MAIN_ORDER_IDS,
  ORDER_CLARIFICATIONS,
  ORDER_IDS,
  ORDERS,
  PERSONAL_LOCATION_IDS,
  QUALITY_RANK,
  SHAPES,
  STARTING_ORDER_IDS,
  TECH_IDS,
  TECHS,
  CLARIFICATION_TAG,
  SHORT_TEXT_SECONDARY_LABELS,
  activeKilnSpaces,
  clarificationSourceKind,
  clarificationTags,
  contributionCard,
  decorationCost,
  isStartingOrderId,
  locationCapacity,
  preferredHeat,
  qualityForDifference,
  shapeClay,
  shortTextSegments,
  techsOfDiscipline,
  validateContentFiles,
  zoneModifier,
  zoneOf,
  type ContentFiles,
} from "../../../src/game/content.ts";
import { COMMON_DETAIL_KEYS, RULE_ERROR_TEXT } from "../../../src/game/ruleErrorText.ts";
import type {
  ClarificationDefinition,
  Decoration,
  Glaze,
  GameRuleErrorCode,
  KilnZone,
  LocationId,
  OrderDefinition,
  OrderRelationDefinition,
  OrderSlotDefinition,
  PlayerCount,
  Quality,
  Shape,
  TechDiscipline,
  TechId,
} from "../../../src/game/types.ts";

/**
 * P1 content contract (DESIGN §6, §8.2): every value in `data/*.json` is checked against the
 * V1.6.1 rulebook itself. The tables are parsed from the checked-in source, so a transcription
 * error on either side fails here. The Tech ID mapping is checked against the `TechId` JSDoc
 * in `types.ts`, and Tech, Kiln and location parameters against the DESIGN §6.3–6.5 tables.
 */

const ROOT = join(import.meta.dirname, "../../..");
const SOURCE = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_EN_SOURCE.md"), "utf8");
const DESIGN = readFileSync(join(ROOT, "docs/ENGINE_V1.6.1_DESIGN.md"), "utf8");
const AUDIT = readFileSync(join(ROOT, "docs/RULEBOOK_AUDIT_V1.6.1.md"), "utf8");
const TYPES = readFileSync(join(ROOT, "src/game/types.ts"), "utf8");
/** The Chinese rulebook edition, translated to match the English rulebook sentence for sentence. */
const SOURCE_ZH = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_ZH.md"), "utf8");
const COMPONENT_TEXT = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_COMPONENT_TEXT_SOURCE.md"), "utf8");
const CLARIFICATIONS_DOC = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_CLARIFICATIONS.md"), "utf8");
const OWNER_DECISIONS = readFileSync(join(ROOT, "docs/ui-v1.6.1/OWNER_DECISIONS.md"), "utf8");

const clean = (text: string): string => text.replaceAll("**", "").replace(/\s+/g, " ").trim();
const cellsOf = (line: string): string[] => line.split("|").slice(1, -1).map(clean);
const numbersIn = (text: string): number[] => [...text.matchAll(/\b(\d+)\b/g)].map((match) => Number(match[1]));

/** The text from a heading line up to the next heading of the same or a higher level. */
function section(heading: string, source = SOURCE): string {
  const start = source.indexOf(`${heading}\n`);
  if (start < 0) throw new Error(`Missing section ${heading}`);
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  const rest = source.slice(start + heading.length + 1);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, next);
}

/** Table rows (no header separator) of a block of Markdown. */
function tableRows(block: string): string[][] {
  return block.split("\n").filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line)).map(cellsOf);
}

function row(block: string, first: string): string[] {
  const found = tableRows(block).find((cells) => cells[0] === first);
  if (found === undefined) throw new Error(`Missing table row "${first}"`);
  return found;
}

/** Parses a DESIGN-doc object literal such as `{clayReduction:2, triggerShapes:["vase"]}`. */
function designLiteral(text: string): unknown {
  const json = text.replace(/([{,]\s*)([A-Za-z]+)\s*:/g, '$1"$2":').replace(/'/g, '"');
  return JSON.parse(json);
}

// ── Appendix A: an independent parser for the printed requirement text ──────────────────

const SHAPE_NAMES: Record<string, Shape> = { Bowl: "bowl", Plate: "plate", "Brush Washer": "washer", Vase: "vase", Censer: "censer" };
const GLAZE_NAMES: Record<string, Glaze> = { White: "white", Celadon: "celadon", "Grey-Green": "grey_green", "Moon White": "moon_white" };
const DECORATION_NAMES: Record<string, Decoration> = { Plain: "plain", Carved: "carved", Impressed: "impressed", Painted: "painted" };

function lookup<T>(table: Record<string, T>, name: string): T {
  const value = table[name.trim()];
  if (value === undefined) throw new Error(`Unknown printed term "${name}"`);
  return value;
}

/** "one White, one Moon White" → ["white", "moon_white"]. */
function oneEach<T>(table: Record<string, T>, text: string): T[] {
  return text.split(", ").map((part) => {
    if (!part.startsWith("one ")) throw new Error(`Unreadable list "${text}"`);
    return lookup(table, part.slice(4));
  });
}

interface ParsedOrder {
  ceramics: OrderSlotDefinition[];
  relations: OrderRelationDefinition[];
}

function parseRequirements(text: string): ParsedOrder {
  const singleParts = text.split(" · ");
  if (singleParts.length === 3) {
    const [shapeText = "", glazeText = "", decorationText = ""] = singleParts;
    const slot: OrderSlotDefinition = {};
    const pick = /^(.+), (.+) or (.+)$/.exec(shapeText) ?? /^(.+) or (.+)$/.exec(shapeText);
    if (shapeText === "any Shape") {
      // no Shape requirement
    } else if (pick !== null) {
      slot.shapes = pick.slice(1).map((name) => lookup(SHAPE_NAMES, name));
    } else {
      slot.shape = lookup(SHAPE_NAMES, shapeText);
    }
    if (glazeText !== "any Glaze") slot.glaze = lookup(GLAZE_NAMES, glazeText);
    if (decorationText !== "any Decoration") slot.decoration = lookup(DECORATION_NAMES, decorationText);
    return { ceramics: [slot], relations: [] };
  }

  const [shapeText = "", glazeText = "", decorationText = ""] = text.split("; ");
  const relations: OrderRelationDefinition[] = [];
  let ceramics: OrderSlotDefinition[];
  const differentShapes = /^(\d) different Shapes$/.exec(shapeText);
  if (differentShapes !== null) {
    const count = Number(differentShapes[1]);
    ceramics = Array.from({ length: count }, () => ({}));
    relations.push({ type: count === 2 ? "different_shape" : "all_different_shape", indices: ceramics.map((_, i) => i) });
  } else if (shapeText === "2 ceramics of the same Shape") {
    ceramics = [{}, {}];
    relations.push({ type: "same_shape", indices: [0, 1] });
  } else {
    ceramics = shapeText.split(" + ").map((name) => ({ shape: lookup(SHAPE_NAMES, name) }));
  }
  const all = ceramics.map((_, i) => i);
  const count = ceramics.length;

  if (glazeText === "same Glaze") relations.push({ type: "same_glaze", indices: all });
  else if (glazeText === "different Glazes") relations.push({ type: "different_glaze", indices: all });
  else if (glazeText === "3 different Glazes") relations.push({ type: "all_different_glaze", indices: all });
  else if (glazeText.startsWith("both ")) relations.push({ type: "required_glazes", values: Array(count).fill(lookup(GLAZE_NAMES, glazeText.slice(5))) });
  else if (glazeText.startsWith("one ")) relations.push({ type: "required_glazes", values: oneEach(GLAZE_NAMES, glazeText) });
  else if (glazeText !== "any Glazes") throw new Error(`Unreadable Glaze requirement "${glazeText}"`);

  const atLeastOne = /^at least one (\w+), other Decoration any$/.exec(decorationText);
  const atLeastDistinct = /^at least (\d) different Decorations$/.exec(decorationText);
  if (decorationText === "same Decoration") relations.push({ type: "same_decoration", indices: all });
  else if (decorationText === "different Decorations" || decorationText === `${count} different Decorations`) {
    relations.push({ type: "different_decoration", indices: all });
  } else if (atLeastOne !== null) relations.push({ type: "required_decorations", values: [lookup(DECORATION_NAMES, atLeastOne[1] ?? "")] });
  else if (atLeastDistinct !== null) relations.push({ type: "at_least_n_distinct_decorations", indices: all, count: Number(atLeastDistinct[1]) });
  else if (decorationText.startsWith("both ")) relations.push({ type: "required_decorations", values: Array(count).fill(lookup(DECORATION_NAMES, decorationText.slice(5))) });
  else if (decorationText.startsWith("one ")) relations.push({ type: "required_decorations", values: oneEach(DECORATION_NAMES, decorationText) });
  else if (decorationText !== "any Decorations") throw new Error(`Unreadable Decoration requirement "${decorationText}"`);

  return { ceramics, relations };
}

function parseQuality(text: string): { minQuality: Exclude<Quality, "flawed">; masterpieces: number } {
  const match = /^(Standard\+|Fine\+|Masterpiece)(?: each| all)?(?:; ≥(\d) Masterpieces?)?$/.exec(text);
  if (match === null) throw new Error(`Unreadable Quality "${text}"`);
  const minQuality = match[1] === "Standard+" ? "standard" : match[1] === "Fine+" ? "fine" : "masterpiece";
  return { minQuality, masterpieces: Number(match[2] ?? 0) };
}

const appendixA = section("## Appendix A — Order Decks: 16 Starting + 48 Main");
const orderRows = tableRows(appendixA).filter((cells) => /^[SO]\d{2}$/.test(cells[0] ?? ""));

describe("Appendix A: all 16 Starting and 48 Main Orders", () => {
  it("prints exactly the Order IDs the data defines", () => {
    expect(orderRows.map((cells) => cells[0])).toEqual([...ORDER_IDS]);
    expect(STARTING_ORDER_IDS).toHaveLength(16);
    expect(MAIN_ORDER_IDS).toHaveLength(48);
  });

  it.each(orderRows.map((cells) => [cells[0] ?? "", cells] as const))("%s matches its printed row", (id, cells) => {
    const order = ORDERS[id as keyof typeof ORDERS];
    const starting = id.startsWith("S");
    const [, requirements = "", qualityText = "", vp = "", coins = "", crowns = "—"] = cells;
    const quality = parseQuality(qualityText);
    const parsed = parseRequirements(requirements);
    const masterpieceRelations: OrderRelationDefinition[] = quality.masterpieces === 0
      ? []
      : [{ type: "at_least_n_quality", quality: "masterpiece", count: quality.masterpieces }];

    expect(order.id).toBe(id);
    expect(order.deck).toBe(starting ? "starting" : "main");
    expect(isStartingOrderId(order.id)).toBe(starting);
    expect(order.requirements).toBe(requirements);
    expect(order.minQuality).toBe(quality.minQuality);
    expect(order.vp).toBe(Number(vp));
    expect(order.coins).toBe(Number(coins));
    expect(order.crowns).toBe(starting ? 0 : crowns === "—" ? 0 : Number(crowns));
    expect(order.ceramics).toEqual(parsed.ceramics);
    expect(order.relations ?? []).toEqual([...parsed.relations, ...masterpieceRelations]);
  });

  it("applies the seven V1.6.1 value changes and the R3 rulings as printed", () => {
    expect(ORDERS.S10.vp).toBe(4);
    expect([ORDERS.S14.vp, ORDERS.S14.coins]).toEqual([3, 3]);
    expect([ORDERS.S16.vp, ORDERS.S16.coins]).toEqual([2, 3]);
    expect([ORDERS.S01.coins, ORDERS.S02.coins, ORDERS.S03.coins]).toEqual([4, 4, 4]);
    expect([ORDERS.O16.vp, ORDERS.O21.vp, ORDERS.O31.vp, ORDERS.O32.vp, ORDERS.O33.vp, ORDERS.O40.vp]).toEqual([9, 9, 12, 15, 14, 15]);
  });

  it("uses Painted where Crackle used to be a Decoration (change 19)", () => {
    expect(ORDERS.S13.ceramics).toEqual([{ decoration: "painted" }]);
    expect(ORDERS.O13.ceramics).toEqual([{ decoration: "painted" }]);
    expect(ORDERS.O17.ceramics).toEqual([{ shape: "washer", glaze: "white", decoration: "painted" }]);
    expect(ORDERS.O23.ceramics).toEqual([{ shape: "vase", glaze: "grey_green", decoration: "painted" }]);
    expect(ORDERS.O39.relations).toContainEqual({ type: "required_decorations", values: ["plain", "painted"] });
    expect(ORDERS.O40.relations).toContainEqual({ type: "required_decorations", values: ["impressed", "painted"] });
    expect(ORDERS.O46.relations).toContainEqual({ type: "required_decorations", values: ["carved", "impressed", "painted"] });
    expect(ORDERS.O31.relations).toContainEqual({ type: "required_decorations", values: ["plain"] });
    expect(ORDERS.O48.relations).toContainEqual({ type: "at_least_n_distinct_decorations", indices: [0, 1, 2], count: 2 });
    expect(JSON.stringify(Object.values(ORDERS))).not.toContain("crackle");
  });

  it("keeps the Starting deck crownless and Standard+ (L521)", () => {
    for (const id of STARTING_ORDER_IDS) {
      expect(ORDERS[id]).toMatchObject({ deck: "starting", crowns: 0, minQuality: "standard" });
    }
  });
});

// ── Appendix B: all 18 Advanced Techs ────────────────────────────────────────────────────

const B_SECTIONS: ReadonlyArray<readonly [TechDiscipline, string]> = [
  ["workshop", "### B1. Form & Decorate — 6"],
  ["glazing_loading", "### B2. Glazing & Loading — 6"],
  ["firing", "### B3. Firing — 6"],
];

const techRows = B_SECTIONS.flatMap(([discipline, heading]) =>
  tableRows(section(heading)).filter((cells) => /^\d+$/.test(cells[1] ?? "")).map((cells) => ({ discipline, cells })));

function techByPrintedName(printed: string): { id: TechId; nameZh: string | null } {
  const zh = /\s([\u4e00-\u9fff]+)$/.exec(printed);
  const name = zh === null ? printed : printed.slice(0, zh.index);
  const id = TECH_IDS.find((techId) => TECHS[techId].name === name);
  if (id === undefined) throw new Error(`No Tech named "${name}"`);
  return { id, nameZh: zh?.[1] ?? null };
}

/** `| T01 | workshop | Large Throwing Wheel | 2 | L615 | kept |` rows of the TechId JSDoc. */
const techIdTable = TYPES.split("\n")
  .map((line) => line.replace(/^\s*\*\s?/, ""))
  .filter((line) => /^\|\s*T\d{2}\s*\|/.test(line))
  .map(cellsOf);

/** DESIGN §6.5: `| T01 | yes | form_decorate_action | `{...}` |`. */
const designTechRows = tableRows(section("### 6.5 `techniques.json` → `{rulesVersion, advanced: TechDefinition[18]}`", DESIGN))
  .filter((cells) => /^T\d{2}$/.test(cells[0] ?? ""));

describe("Appendix B: all 18 Advanced Techs", () => {
  it("prints 18 tiles, 6 per discipline, and the data has exactly those", () => {
    expect(techRows).toHaveLength(18);
    for (const discipline of DISCIPLINES) {
      expect(techRows.filter((entry) => entry.discipline === discipline)).toHaveLength(6);
      expect(techsOfDiscipline(discipline)).toHaveLength(GAME_CONFIG.techs.perDiscipline);
    }
    expect(new Set(techRows.map((entry) => techByPrintedName(entry.cells[0] ?? "").id))).toEqual(new Set(TECH_IDS));
  });

  it.each(techRows.map((entry) => [entry.cells[0] ?? "", entry] as const))("%s matches its printed row", (_, entry) => {
    const { id, nameZh } = techByPrintedName(entry.cells[0] ?? "");
    const tech = TECHS[id];
    expect(tech.discipline).toBe(entry.discipline);
    expect(tech.cost).toBe(Number(entry.cells[1]));
    expect(tech.ability).toBe(entry.cells[2]);
    expect(tech.oncePerRound).toBe(tech.ability.startsWith("Once per round"));
    expect(tech.unlocks).toBe(entry.discipline === "workshop" ? "form_decorate" : entry.discipline === "glazing_loading" ? "glaze_load" : null);
    if (nameZh !== null) expect(tech.nameZh).toBe(nameZh);
  });

  it("follows the Tech ID mapping of the TechId contract (audit: Stable IDs)", () => {
    expect(techIdTable).toHaveLength(18);
    for (const [id = "", discipline, name, cost] of techIdTable) {
      const tech = TECHS[id as TechId];
      expect(tech, id).toBeDefined();
      expect(tech.discipline, id).toBe(discipline);
      expect(tech.name, id).toBe(name?.replace(/\s[\u4e00-\u9fff]+$/, ""));
      expect(tech.cost, id).toBe(Number(cost));
    }
    for (const retired of ["T02", "T03", "T04", "T06", "T07", "T08", "T09", "ST01", "ST02", "ST03", "ST04"]) {
      expect(TECH_IDS as readonly string[]).not.toContain(retired);
    }
  });

  it("matches the DESIGN §6.5 timing and parameter table", () => {
    expect(designTechRows).toHaveLength(18);
    for (const [id = "", once, timing, params = ""] of designTechRows) {
      const tech = TECHS[id as TechId];
      expect(tech.oncePerRound, id).toBe(once === "yes");
      expect(tech.timing, id).toBe(timing);
      expect(tech.params, id).toEqual(designLiteral(params.replaceAll("`", "")));
    }
  });

  it("names exactly the printed Shapes, Decorations, locations and Qualities in Tech parameters", () => {
    expect(TECHS.T01.ability).toContain("Vase or Censer");
    expect(TECHS.T01.params.triggerShapes).toEqual(["vase", "censer"]);
    expect(TECHS.T16.ability).toContain("Carved, Impressed or Painted");
    expect(TECHS.T16.params.decorations).toEqual(["carved", "impressed", "painted"]);
    expect(TECHS.T21.ability).toContain("Bowl, Plate or Brush Washer");
    expect(TECHS.T21.params.shapes).toEqual(["bowl", "plate", "washer"]);
    expect(TECHS.T18.ability).toContain("Materials Yard or Commission Market");
    expect(TECHS.T18.params.locations).toEqual(["materials_yard", "commission_market"]);
    expect(TECHS.T19.ability).toContain("Fine or Masterpiece");
    expect(TECHS.T19.params.qualities).toEqual(["fine", "masterpiece"]);
    expect(TECHS.T15.params.modifiers).toEqual([...FIRING.imperialModifiers]);
  });
});

// ── Printed numbers equal the parameters (successor of the V1.2.7 printed-number guard) ──

const abs = (values: readonly number[]): number[] => values.map((value) => Math.abs(value));
const fd = LOCATIONS.form_decorate.effects;
const gl = LOCATIONS.glaze_load.effects;
const cm = LOCATIONS.commission_market.effects;
const gh = LOCATIONS.guild_hall.effects;
const my = LOCATIONS.materials_yard.effects;
const mh = LOCATIONS.magistrates_hall.effects;
const cw = LOCATIONS.canal_wharf.effects;
const anyGain = [cm.apprentice.gainAfterEach, cm.apprentice.gainAfterEach, cm.apprentice.gainAfterEach];
const stoke = contributionCard("STOKE").heat;

/** [label, printed English text, the exact number sequence the data implies]. */
const PRINTED_NUMBERS: Array<[string, string, number[]]> = [
  ["T01", TECHS.T01.ability, [1, TECHS.T01.params.clayReduction, 0]],
  ["T16", TECHS.T16.ability, [1, TECHS.T16.params.coinReduction]],
  ["T05", TECHS.T05.ability, []],
  ["T17", TECHS.T17.ability, [1, TECHS.T17.params.claySurcharge]],
  ["T18", TECHS.T18.ability, [1]],
  ["T19", TECHS.T19.ability, [TECHS.T19.params.vpPerCeramic, TECHS.T19.params.maxVp]],
  ["T10", TECHS.T10.ability, [TECHS.T10.params.lookSize, 1, TECHS.T10.params.handLimit]],
  ["T20", TECHS.T20.ability, [1, TECHS.T20.params.clay, TECHS.T20.params.wood]],
  ["T15", TECHS.T15.ability, [1, ...abs(TECHS.T15.params.modifiers)]],
  ["T21", TECHS.T21.ability, [1]],
  ["T22", TECHS.T22.ability, []],
  ["T23", TECHS.T23.ability, [1]],
  ["T11", TECHS.T11.ability, [TECHS.T11.params.wood, 1]],
  ["T12", TECHS.T12.ability, [TECHS.T12.params.extraWood, stoke + TECHS.T12.params.heat, stoke + TECHS.T12.params.heat]],
  ["T13", TECHS.T13.ability, [1, TECHS.T13.params.wood]],
  ["T14", TECHS.T14.ability, [1, 1]],
  ["T24", TECHS.T24.ability, [...abs(TECHS.T24.params.values), 1]],
  ["T25", TECHS.T25.ability, [KILNS.GU.params.minPrintedCrowns, TECHS.T25.params.bonusCrowns]],
  ["RU", KILNS.RU.ability, [KILNS.RU.params.vp]],
  ["GU", KILNS.GU.ability, [KILNS.GU.params.minPrintedCrowns, KILNS.GU.params.coins, KILNS.GU.params.vp]],
  ["GE", KILNS.GE.ability, [1]],
  ["DI", KILNS.DI.ability, [KILNS.DI.params.clay, KILNS.DI.params.coins, KILNS.DI.params.coins, fd.shifu.maxVessels]],
  ["JU", KILNS.JU.ability, [KILNS.JU.params.wood, ...abs(KILNS.JU.params.deltas)]],
  ["materials_yard.apprentice", LOCATIONS.materials_yard.apprenticeText, [my.apprentice.resources]],
  ["materials_yard.shifu", LOCATIONS.materials_yard.shifuText, [my.shifu.resources, my.shifu.bonus.coins, my.shifu.bonus.clay, my.shifu.bonus.wood]],
  ["form_decorate.apprentice", LOCATIONS.form_decorate.apprenticeText, [fd.apprentice.maxVessels]],
  ["form_decorate.shifu", LOCATIONS.form_decorate.shifuText, [fd.shifu.maxVessels, fd.shifu.maxVessels, fd.shifu.twoVesselDecorationDiscount]],
  ["glaze_load.apprentice", LOCATIONS.glaze_load.apprenticeText, [gl.apprentice.maxLoads]],
  ["glaze_load.shifu", LOCATIONS.glaze_load.shifuText, [gl.shifu.maxLoads, 1]],
  ["commission_market.apprentice", LOCATIONS.commission_market.apprenticeText, [cm.apprentice.maxReservations, ...anyGain]],
  ["commission_market.shifu", LOCATIONS.commission_market.shifuText,
    [cm.shifu.maxReservations, cm.shifu.topThreeLooks, cm.shifu.lookSize, 1, ...anyGain]],
  ["guild_hall.apprentice", LOCATIONS.guild_hall.apprenticeText, [1]],
  ["guild_hall.shifu", LOCATIONS.guild_hall.shifuText, [1, gh.shifu.inspectCount, 1, 1, gh.shifu.discount, 0]],
  ["canal_wharf.apprentice", LOCATIONS.canal_wharf.apprenticeText, [cw.apprentice.coins]],
  ["canal_wharf.shifu", LOCATIONS.canal_wharf.shifuText, [cw.shifu.coins]],
  ["magistrates_hall.apprentice", LOCATIONS.magistrates_hall.apprenticeText, [mh.apprentice.coins, mh.apprentice.recognitionSteps]],
  ["magistrates_hall.shifu", LOCATIONS.magistrates_hall.shifuText, [mh.shifu.coins, mh.shifu.recognitionSteps]],
];

describe("printed numbers equal the data parameters", () => {
  it.each(PRINTED_NUMBERS)("%s", (_, text, expected) => {
    expect(numbersIn(text), text).toEqual(expected);
  });

  it("guards every Tech, Kiln and location text", () => {
    const labels = new Set(PRINTED_NUMBERS.map(([label]) => label));
    const missing = [
      ...TECH_IDS.filter((id) => !labels.has(id)),
      ...KILN_IDS.filter((id) => !labels.has(id)),
      ...LOCATION_IDS.flatMap((id) => [`${id}.apprentice`, `${id}.shifu`]).filter((label) => !labels.has(label)),
    ];
    expect(missing).toEqual([]);
  });

  it("prints the Imperial track rewards from the reward data", () => {
    const [local, grant, gift, priority, audience] = IMPERIAL_TRACK.track;
    expect(local?.rewardText).toBeNull();
    const grantReward = grant?.reward;
    expect(grantReward).toEqual({ kind: "resources", clay: 1, wood: 1, coins: 1 });
    if (grantReward?.kind === "resources") {
      expect(numbersIn(grant?.rewardText ?? "")).toEqual([grantReward.clay, grantReward.wood, grantReward.coins]);
    }
    expect(numbersIn(gift?.rewardText ?? "x")).toEqual([]);
    expect(numbersIn(priority?.rewardText ?? "")).toEqual([1]);
    const audienceReward = audience?.reward;
    expect(audienceReward?.kind === "vp" ? numbersIn(audience?.rewardText ?? "") : null)
      .toEqual(audienceReward?.kind === "vp" ? [audienceReward.vp, IMPERIAL_TRACK.overflowVpPerCrown] : null);
  });

  it("keeps every number of an English ability in its Chinese text", () => {
    const pairs: Array<[string, string, string]> = [
      ...TECH_IDS.map((id) => [id, TECHS[id].ability, TECHS[id].abilityZh] as [string, string, string]),
      ...KILN_IDS.map((id) => [id, KILNS[id].ability, KILNS[id].abilityZh] as [string, string, string]),
      ...LOCATION_IDS.flatMap((id) => [
        [`${id}.apprentice`, LOCATIONS[id].apprenticeText, LOCATIONS[id].apprenticeTextZh] as [string, string, string],
        [`${id}.shifu`, LOCATIONS[id].shifuText, LOCATIONS[id].shifuTextZh] as [string, string, string],
      ]),
      ...IMPERIAL_TRACK.track.map((space) => [space.id, space.rewardText ?? "", space.rewardTextZh ?? ""] as [string, string, string]),
    ];
    for (const [label, en, zh] of pairs) {
      const zhNumbers = new Set(numbersIn(zh));
      for (const number of new Set(numbersIn(en))) expect(zhNumbers.has(number), `${label}: ${number} missing from "${zh}"`).toBe(true);
    }
  });

  it("prints the same numbers in the English and Chinese reminder text", () => {
    // Chinese counts with a measure word where English says "a" ("a Shaped vessel" / 1件坯),
    // so the Chinese may add a 1 and nothing else.
    for (const definition of [...TECH_IDS.map((id) => TECHS[id]), ...KILN_IDS.map((id) => KILNS[id])]) {
      const en = new Set(numbersIn(definition.shortText));
      const zh = new Set(numbersIn(definition.shortTextZh));
      for (const number of en) expect(zh.has(number), `${definition.id}: ${number} missing from the Chinese`).toBe(true);
      for (const number of zh) expect(number === 1 || en.has(number), `${definition.id}: ${number} not in the English`).toBe(true);
    }
  });
});

// ── Kilns, locations, capacity ───────────────────────────────────────────────────────────

describe("Kiln Traditions (L453–477)", () => {
  it("defines all five selectable Kilns (R1) with their full printed abilities", () => {
    expect(KILN_IDS).toEqual(["RU", "GU", "GE", "DI", "JU"]);
    expect(SOURCE).toContain("| Kiln Player Boards | 5 | Ru, Guan, Ge, Ding and Jun.");
    for (const id of KILN_IDS) {
      const kiln = KILNS[id];
      const heading = `### ${kiln.name} / ${kiln.nameZh} — ${kiln.abilityName}`;
      const body = section(heading).trim().split(/\n\s*\n/).map(clean).join(" ");
      expect(kiln.ability, id).toBe(body);
      expect(kiln.oncePerRound).toBe(true);
      expect(kiln.ability.startsWith("Once per round")).toBe(true);
    }
  });

  it("matches the DESIGN §6.4 parameter table", () => {
    const rows = tableRows(section("### 6.4 `kilns.json` → `{rulesVersion, kilns: KilnDefinition[5]}`", DESIGN))
      .filter((cells) => KILN_IDS.includes((cells[0] ?? "") as never));
    expect(rows).toHaveLength(5);
    for (const [id = "", params = ""] of rows) {
      expect(KILNS[id as keyof typeof KILNS].params, id).toEqual(designLiteral(params.replaceAll("`", "")));
    }
    expect(KILNS.RU.ability).toContain("Masterpiece with Celadon Glaze and Plain Decoration");
    expect(KILNS.DI.ability).toContain("Bowl, Plate or Brush Washer");
    expect(KILNS.GE.ability).toContain("that is Standard: it develops Crackle and becomes Fine");
  });
});

const LOCATION_HEADINGS: Readonly<Record<LocationId, string>> = {
  materials_yard: "### Materials Yard",
  form_decorate: "### Form & Decorate (personal)",
  glaze_load: "### Glaze & Load (personal)",
  commission_market: "### Commission Market",
  guild_hall: "### Guild Hall",
  canal_wharf: "### Canal Wharf",
  magistrates_hall: "### Magistrate's Hall",
};

describe("locations and capacity (L145–232)", () => {
  it("defines the five central and two personal locations", () => {
    expect([...CENTRAL_LOCATION_IDS, ...PERSONAL_LOCATION_IDS].sort()).toEqual([...LOCATION_IDS].sort());
    expect(SOURCE).toContain("Materials Yard, Commission Market, Guild Hall, Canal Wharf, Magistrate's Hall.");
    for (const id of CENTRAL_LOCATION_IDS) expect(LOCATIONS[id].scope).toBe("central");
    for (const id of PERSONAL_LOCATION_IDS) expect(LOCATIONS[id].scope).toBe("personal");
  });

  it("matches the Capacity by Player Count table", () => {
    const rows = tableRows(section("### Capacity by Player Count")).filter((cells) => cells[0] !== "Location");
    expect(rows).toHaveLength(7);
    for (const [printedName = "", two, three, four] of rows) {
      const id = LOCATION_IDS.find((locationId) => printedName.startsWith(LOCATIONS[locationId].name));
      expect(id, printedName).toBeDefined();
      if (id === undefined) continue;
      const location = LOCATIONS[id];
      if (printedName.endsWith("(personal)")) {
        expect(two).toBe("1 space, +1 when unlocked");
        expect(location.capacity).toBeNull();
        expect(location.personalSpaces).toEqual({ total: 2, unlockedAtStart: 1 });
        expect(() => locationCapacity(id, 2)).toThrow();
        continue;
      }
      const printed = [two, three, four].map((cell) => (cell === "uncapped" ? null : Number(cell)));
      expect([2, 3, 4].map((n) => locationCapacity(id, n as PlayerCount)), id).toEqual(printed);
    }
  });

  it.each(LOCATION_IDS)("%s prints its Apprentice and Shifu effects", (id) => {
    const block = section(LOCATION_HEADINGS[id]);
    expect(LOCATIONS[id].name).toBe(LOCATION_HEADINGS[id].replace("### ", "").replace(" (personal)", ""));
    expect(LOCATIONS[id].apprenticeText).toBe(row(block, "Apprentice")[1]);
    expect(LOCATIONS[id].shifuText).toBe(row(block, "Shifu")[1]);
  });

  it("matches the DESIGN §6.3 effect table", () => {
    const rows = tableRows(section("### 6.3 `action_locations.json` → `{rulesVersion, locations: LocationDefinition[7]}`", DESIGN))
      .filter((cells) => /^`[a-z_]+`$/.test(cells[0] ?? ""));
    expect(rows).toHaveLength(7);
    for (const cells of rows) {
      const id = (cells[0] ?? "").replaceAll("`", "") as LocationId;
      const literals = [...(cells[3] ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
      expect(LOCATIONS[id].effects.apprentice, id).toEqual(designLiteral(literals[0] ?? ""));
      expect(LOCATIONS[id].effects.shifu, id).toEqual(designLiteral(literals[1] ?? ""));
    }
    expect(LOCATIONS.magistrates_hall.usableAtRecognition).toEqual([0, 1, 2]);
    expect(SOURCE).toContain("may be used while at Recognition 0, **1 or 2**");
    for (const id of LOCATION_IDS.filter((locationId) => locationId !== "magistrates_hall")) {
      expect(LOCATIONS[id].usableAtRecognition, id).toBeNull();
    }
  });

  it("matches the Appendix E action summary numbers", () => {
    const summary = section("### Action Summary");
    const expectations: Record<LocationId, [number[], number[]]> = {
      materials_yard: [[my.apprentice.resources], [my.shifu.resources, my.shifu.bonus.coins, my.shifu.bonus.clay, my.shifu.bonus.wood]],
      form_decorate: [[fd.apprentice.maxVessels], [fd.shifu.maxVessels, fd.shifu.maxVessels, fd.shifu.twoVesselDecorationDiscount]],
      glaze_load: [[gl.apprentice.maxLoads], [gl.shifu.maxLoads, 1]],
      commission_market: [[cm.apprentice.maxReservations, cm.apprentice.gainAfterEach],
        [cm.shifu.maxReservations, cm.shifu.topThreeLooks, cm.shifu.lookSize, cm.shifu.gainAfterEach]],
      guild_hall: [[1], [gh.shifu.inspectCount, 1, 1, gh.shifu.discount]],
      canal_wharf: [[cw.apprentice.coins], [cw.shifu.coins]],
      magistrates_hall: [
        [mh.apprentice.coins, mh.apprentice.recognitionSteps,
          ...(LOCATIONS.magistrates_hall.usableAtRecognition ?? []).flatMap((r) => [r, r + mh.apprentice.recognitionSteps])],
        [mh.shifu.coins],
      ],
    };
    for (const id of LOCATION_IDS) {
      const [, apprentice = "", shifu = ""] = row(summary, LOCATIONS[id].name);
      expect(numbersIn(apprentice), `${id} apprentice`).toEqual(expectations[id][0]);
      expect(numbersIn(shifu), `${id} shifu`).toEqual(expectations[id][1]);
    }
    expect(summary).toContain("Materials Yard, Commission Market and Guild Hall use 2 / 3 / 4 spaces in 2 / 3 / 4-player games");
    expect(summary).toContain("The Magistrate's Hall has 1 / 1 / 2 spaces, usable at Recognition 0–2");
  });
});

// ── Components, setup, firing and scoring values ─────────────────────────────────────────

describe("setup, production, firing and scoring values", () => {
  it("sets up as L97–111 prints", () => {
    expect(SOURCE).toContain(`**2–4 players`);
    expect(GAME_CONFIG.players).toEqual({ min: 2, max: 4 });
    expect(SOURCE).toContain(`The game lasts exactly **${GAME_CONFIG.rounds} rounds**.`);
    const { clay, wood, coins } = GAME_CONFIG.startingResources;
    expect(SOURCE).toContain(`Each player receives **${clay} Clay, ${wood} Wood and ${coins} Coins**.`);
    expect([clay, wood, coins]).toEqual([2, 2, 3]);
    expect(SOURCE).toContain(`takes ${GAME_CONFIG.workers.shifu} Shifu, ${GAME_CONFIG.workers.apprentices} Apprentices`);
    expect(SOURCE).toContain(`Deal each player **${GAME_CONFIG.setupDeal.startingOrders} Starting Orders and ${GAME_CONFIG.setupDeal.mainOrders} Main Order**.`);
    expect(SOURCE).toContain(`reveal **${GAME_CONFIG.mainMarket.displaySize} face-up Main Orders**`);
    expect(SOURCE).toContain(`reveal **${GAME_CONFIG.techs.faceUpPerDiscipline} face-up tiles from each**`);
    expect(SOURCE).toContain(`Discard the **${GAME_CONFIG.mainMarket.roundStartDiscard} leftmost face-up Main Orders**`);
    expect(SOURCE).toContain(`hand limit of **${GAME_CONFIG.handLimit.base}** (${TECHS.T10.params.handLimit} with Colour Samples)`);
    expect(SOURCE).toContain(`at most **${GAME_CONFIG.techs.maxOwned} Advanced Techs and at most ${GAME_CONFIG.techs.maxPerDiscipline} from each discipline**`);
    expect(SOURCE).toContain(`Exactly ${GAME_CONFIG.techs.perDiscipline} Form & Decorate, ${GAME_CONFIG.techs.perDiscipline} Glazing & Loading and ${GAME_CONFIG.techs.perDiscipline} Firing`);
  });

  it("scores each Tech's printed 1 VP when it is gained, per owner amendment A1 (L378, L492, L609, L755)", () => {
    const vp = GAME_CONFIG.techs.vpEach;
    expect(vp).toBe(1);
    // A1 is applied in the source itself (lines 378, 491, 492, 609, 755): scored on gain, never again at game end.
    const lines = SOURCE.split("\n");
    expect(lines[377]).toBe(`- Each Advanced Tech scores **${vp} VP immediately when you gain it**; it is not scored again at game end.`);
    expect(lines[490]).toContain(`**${vp} VP for each Advanced Tech** (scored when gained)`);
    expect(lines[491]).toBe(`2. nothing more for Advanced Techs: each already scored its **${vp} VP** when you gained it;`);
    expect(lines[608]).toContain(`Each Advanced Tech scores **${vp} VP immediately when you gain it**.`);
    expect(lines[754]).toBe(`- Advanced Techs: **${vp} VP each**, scored when you gain them.`);
    expect(SOURCE).not.toMatch(/Advanced Tech[^\n]*\*\*1 VP at game end\*\*/);
    // The audit records the amendment.
    const a1 = AUDIT.split("\n").find((line) => line.startsWith("| A1 |"));
    expect(a1).toBeDefined();
    const [id, date, amendment, overrides] = cellsOf(a1 ?? "");
    expect([id, date]).toEqual(["A1", "2026-10-15"]);
    expect(amendment).toContain(`Each Advanced Tech scores its ${vp} VP immediately when the player gains it`);
    expect(amendment).toContain("It is no longer added at game end.");
    expect(overrides).toContain("Lines 378, 492, 609, 755");
  });

  it("prices Shapes, Decorations and Glazes as L318–352 print", () => {
    const shapes = section("### Shapes and Forming Costs");
    for (const shape of SHAPES) {
      const [, clay, cards] = row(shapes, Object.keys(SHAPE_NAMES).find((name) => SHAPE_NAMES[name] === shape) ?? "");
      expect(shapeClay(shape), shape).toBe(Number(clay));
      expect(GAME_CONFIG.shapeSupplyEach).toBe(Number(cards));
    }
    const decorations = section("### Decorations");
    for (const decoration of DECORATIONS) {
      const [, cost] = row(decorations, Object.keys(DECORATION_NAMES).find((name) => DECORATION_NAMES[name] === decoration) ?? "");
      expect(`${decorationCost(decoration)} Coins`, decoration).toBe(cost);
    }
    const glazes = section("### Glazes and Preferred Heat");
    for (const glaze of GLAZES) {
      const [, heat] = row(glazes, Object.keys(GLAZE_NAMES).find((name) => GLAZE_NAMES[name] === glaze) ?? "");
      expect(preferredHeat(glaze), glaze).toBe(Number(heat));
    }
  });

  it("builds the Shared Kiln of L71 and covers spaces as L99 prints", () => {
    expect(SOURCE).toContain("Eight spaces: 3 High (+1), 3 Middle (0), 2 Low (−1).");
    const counts: Record<KilnZone, number> = { high: 0, middle: 0, low: 0 };
    for (const id of KILN_SPACE_IDS) counts[zoneOf(id)] += 1;
    expect(counts).toEqual({ high: 3, middle: 3, low: 2 });
    for (const id of KILN_SPACE_IDS) expect(zoneModifier(id)).toBe({ high: 1, middle: 0, low: -1 }[zoneOf(id)]);
    const layout = (n: PlayerCount): string => {
      const active = activeKilnSpaces(n);
      return (["high", "middle", "low"] as const).map((zone) => active.filter((id) => zoneOf(id) === zone).length).join("-");
    };
    expect([layout(2), layout(3), layout(4)]).toEqual(["2-1-1", "2-2-2", "3-3-2"]);
    expect(SOURCE).toContain("**3 players** use 6 spaces, covering 1 High and 1 Middle space (2-2-2)");
    expect(SOURCE).toContain("**2 players** use 4 spaces, covering 1 High, 2 Middle and 1 Low space (2-1-1)");
    expect([activeKilnSpaces(2).length, activeKilnSpaces(3).length, activeKilnSpaces(4).length]).toEqual([4, 6, 8]);
  });

  it("rolls the Kiln Die of L92 and clamps Base Heat to 0–5 (L248)", () => {
    expect(SOURCE).toContain(`Six-sided, faces ${FIRING.kilnDie.faces.join(", ")}.`);
    expect(FIRING.kilnDie.faces).toEqual([1, 1, 2, 2, 3, 3]);
    expect(SOURCE).toContain(`Clamp Base Heat to ${FIRING.baseHeat.minimum}–${FIRING.baseHeat.maximum}.`);
  });

  it("uses the Appendix C Fire deck", () => {
    const rows = tableRows(section("## Appendix C — Fire Deck")).filter((cells) => /^[−+]?\d$/.test(cells[0] ?? ""));
    expect(rows).toHaveLength(5);
    for (const [modifier = "", cards] of rows) {
      const value = Number(modifier.replace("−", "-"));
      expect(FIRING.fireDeck.filter((card) => card === value).length, modifier).toBe(Number(cards));
    }
    expect(FIRING.fireDeck).toHaveLength(12);
  });

  it("matches the Contribution card table (L254–258)", () => {
    const block = section("### Contribution Cards");
    expect(CONTRIBUTION_CARD_IDS).toEqual(["BANK", "TEND", "STOKE"]);
    for (const id of CONTRIBUTION_CARD_IDS) {
      const card = contributionCard(id);
      const [, wood, heat] = row(block, card.name);
      expect(card.woodCost, id).toBe(Number(wood));
      expect(card.heat, id).toBe(Number((heat ?? "").replace("−", "-").replace("+", "")));
    }
  });

  it("assigns Quality by the Quality table (L273–278)", () => {
    const block = section("### Quality Table");
    expect(row(block, "0")[1]).toBe("Masterpiece");
    expect(row(block, "1")[1]).toBe("Fine");
    expect(row(block, "2")[1]).toBe("Standard");
    expect(row(block, "3+")[1]).toBe("Flawed");
    expect([0, 1, 2, 3, 4, 7, -1, -2, -3].map(qualityForDifference))
      .toEqual(["masterpiece", "fine", "standard", "flawed", "flawed", "flawed", "fine", "standard", "flawed"]);
    expect(QUALITY_RANK.masterpiece > QUALITY_RANK.fine && QUALITY_RANK.fine > QUALITY_RANK.standard
      && QUALITY_RANK.standard > QUALITY_RANK.flawed).toBe(true);
    expect(SOURCE).toContain(`discard **1 ceramic that is still Flawed from this firing** to gain **${FIRING.salvageCoins} Coins**`);
    expect(SOURCE).toContain("choose a modifier of −1, 0 or +1");
    expect(FIRING.imperialModifiers).toEqual([-1, 0, 1]);
  });

  it("scores the Exhibition, Recognition and Coins as L428–494 print", () => {
    const exhibition = section("### End-game Exhibition");
    const vp = IMPERIAL_TRACK.exhibition.qualityVp;
    expect(row(exhibition, "Standard")[1]).toBe(String(vp.standard));
    expect(row(exhibition, "Fine")[1]).toBe(String(vp.fine));
    expect(row(exhibition, "Masterpiece")[1]).toBe(String(vp.masterpiece));
    const { distinctShapes, distinctGlazes } = IMPERIAL_TRACK.exhibition;
    expect(exhibition).toContain(`**+${distinctShapes.vp} VP** if your Exhibition contains at least **${distinctShapes.threshold} different Shapes**`);
    expect(exhibition).toContain(`**+${distinctGlazes.vp} VP** if it contains at least **${distinctGlazes.threshold} different Glazes**`);
    expect(SOURCE).toContain(`**1 VP per ${GAME_CONFIG.coinEndGame.coinsPerVp} Coins remaining**, maximum **${GAME_CONFIG.coinEndGame.maxVp} VP**`);

    const track = section("### Imperial Recognition Track");
    const titles = IMPERIAL_TRACK.track.map((space) => row(track, space.space === 0 ? "0" : `${space.space} (${space.space} Crown${space.space === 1 ? "" : "s"})`)[1]);
    expect(titles).toEqual(IMPERIAL_TRACK.track.map((space) => space.title));
    expect(row(track, "1 (1 Crown)")[2]).toBe(IMPERIAL_TRACK.track[1]?.rewardText);
    expect(row(track, "4 (4 Crowns)")[2]).toBe(`Gain ${(IMPERIAL_TRACK.track[4]?.reward as { vp: number }).vp} VP.`);
    expect(row(track, "Each further Crown")[2]).toBe(`+${IMPERIAL_TRACK.overflowVpPerCrown} VP`);

    const scoring = section("### Scoring");
    expect(scoring).toContain(`Standard ${vp.standard} / Fine ${vp.fine} / Masterpiece ${vp.masterpiece}`);
    expect(scoring).toContain(`Connoisseur's Cabinet +${TECHS.T19.params.vpPerCeramic} per Fine or Masterpiece, max +${TECHS.T19.params.maxVp}`);
    expect(scoring).toContain(`1 VP per ${GAME_CONFIG.coinEndGame.coinsPerVp}, maximum ${GAME_CONFIG.coinEndGame.maxVp}`);
  });
});

// ── Rule-error text table (DESIGN §6.10) ─────────────────────────────────────────────────

const ERROR_CODES = [...(TYPES.split("export type GameRuleErrorCode =")[1]?.split(";")[0] ?? "").matchAll(/"([A-Z_]+)"/g)]
  .map((match) => match[1] as GameRuleErrorCode);

describe("rule-error text", () => {
  it("has an entry for exactly the GameRuleErrorCode union", () => {
    expect(ERROR_CODES.length).toBeGreaterThan(40);
    expect(Object.keys(RULE_ERROR_TEXT).sort()).toEqual([...ERROR_CODES].sort());
  });

  it.each(ERROR_CODES)("%s has EN and ZH text whose placeholders are documented detail keys", (code) => {
    const entry = RULE_ERROR_TEXT[code];
    for (const template of [entry, ...(entry.fallbacks ?? [])]) {
      expect(template.en.trim().length).toBeGreaterThan(0);
      expect(template.zh.trim().length).toBeGreaterThan(0);
      const placeholders = (text: string): string[] => [...text.matchAll(/\{([A-Za-z]+)\}/g)].map((match) => match[1] ?? "");
      expect(placeholders(template.zh).sort()).toEqual(placeholders(template.en).sort());
      for (const key of placeholders(template.en)) expect(entry.detailKeys, `${code} uses {${key}}`).toContain(key);
    }
    for (const key of COMMON_DETAIL_KEYS) expect(entry.detailKeys).toContain(key);
    expect(new Set(entry.detailKeys).size).toBe(entry.detailKeys.length);
  });

  it("states the Magistrate's Hall gate with the location's data", () => {
    const usable = LOCATIONS.magistrates_hall.usableAtRecognition ?? [];
    const gate = [Math.min(...usable), Math.max(...usable), Math.max(...usable) + 2];
    expect(numbersIn(RULE_ERROR_TEXT.RECOGNITION_GATE.en)).toEqual(gate);
    expect(numbersIn(RULE_ERROR_TEXT.RECOGNITION_GATE.zh)).toEqual(gate);
  });
});

// ── Load-time validation (DESIGN §6.9) ───────────────────────────────────────────────────

function currentFiles(): ContentFiles {
  return structuredClone({
    gameConfig: GAME_CONFIG,
    firing: FIRING,
    actionLocations: { rulesVersion: "1.6.1", locations: LOCATION_IDS.map((id) => LOCATIONS[id]) },
    kilns: { rulesVersion: "1.6.1", kilns: KILN_IDS.map((id) => KILNS[id]) },
    techniques: { rulesVersion: "1.6.1", advanced: TECH_IDS.map((id) => TECHS[id]) },
    orders: {
      rulesVersion: "1.6.1",
      clarifications: ORDER_CLARIFICATIONS,
      starting: STARTING_ORDER_IDS.map((id) => ORDERS[id]),
      main: MAIN_ORDER_IDS.map((id) => ORDERS[id]),
    },
    imperialProgress: IMPERIAL_TRACK,
  }) as ContentFiles;
}

describe("content validation", () => {
  it("accepts the checked-in content and freezes it", () => {
    expect(validateContentFiles(currentFiles())).toEqual([]);
    expect(Object.isFrozen(ORDERS.O01)).toBe(true);
    expect(Object.isFrozen(ORDERS.O47.relations)).toBe(true);
    expect(Object.isFrozen(TECHS.T01.params.triggerShapes)).toBe(true);
    expect(Object.isFrozen(GAME_CONFIG.sharedKiln.activeSpacesByPlayerCount["2"])).toBe(true);
  });

  const mutations: Array<[string, (files: ContentFiles) => void]> = [
    ["a wrong rules version", (files) => { (files.orders as { rulesVersion: string }).rulesVersion = "1.4"; }],
    ["a missing Starting Order", (files) => { files.orders.starting.pop(); }],
    ["a Crown on a Starting Order", (files) => { (files.orders.starting[0] as { crowns: number }).crowns = 1; }],
    ["a relation that skips a slot", (files) => {
      const order = files.orders.main.find((candidate) => candidate.id === "O26") as OrderDefinition;
      order.relations = [{ type: "same_glaze", indices: [0] }];
    }],
    ["too many required Glazes", (files) => {
      const order = files.orders.main.find((candidate) => candidate.id === "O30") as OrderDefinition;
      order.relations = [{ type: "required_glazes", values: ["white", "moon_white", "celadon"] }];
    }],
    ["a seventh Form & Decorate Tech", (files) => { (files.techniques.advanced[6] as { discipline: string }).discipline = "workshop"; }],
    ["a Firing Tech that unlocks a space", (files) => {
      (files.techniques.advanced[12] as { unlocks: string | null }).unlocks = "glaze_load";
    }],
    ["a four-Kiln roster", (files) => { files.kilns.kilns.pop(); }],
    ["a fixed Fire deck", (files) => { files.firing.fireDeck[0] = 0; }],
    ["a six-sided ordinary die", (files) => { files.firing.kilnDie.faces = [1, 2, 3, 4, 5, 6] as never; }],
    ["a 3-2-3 Shared Kiln at 4 players", (files) => { files.firing.kilnSpaces[2] = { id: "high_3", zone: "low", modifier: -1 }; }],
    ["a 2-player layout that is not 2-1-1", (files) => {
      files.gameConfig.sharedKiln.activeSpacesByPlayerCount["2"] = ["high_1", "middle_1", "middle_2", "low_1"];
    }],
    ["a personal location with a central capacity", (files) => {
      (files.actionLocations.locations[1] as { capacity: unknown }).capacity = { 2: 1, 3: 1, 4: 1 };
    }],
    ["an empty Chinese name", (files) => { (files.techniques.advanced[0] as { nameZh: string }).nameZh = " "; }],
    ["an empty Chinese requirement", (files) => { (files.orders.main[0] as { requirementsZh: string }).requirementsZh = ""; }],
    ["a Tech without clarifications", (files) => { (files.techniques.advanced[4] as { clarifications: unknown }).clarifications = []; }],
    ["a malformed clarification source tag", (files) => {
      (files.kilns.kilns[1]?.clarifications[0] as { source: string }).source = "Rule 4";
    }],
    ["a clarification with an extra field", (files) => {
      (files.actionLocations.locations[0]?.clarifications[0] as unknown as Record<string, string>)["note"] = "x";
    }],
    ["missing Order clarifications", (files) => { (files.orders as { clarifications: unknown }).clarifications = undefined; }],
    ["a short text with Markdown", (files) => { (files.techniques.advanced[0] as { shortText: string }).shortText = "**Once per round:** x"; }],
    ["a short text with no timing clause", (files) => { (files.kilns.kilns[0] as { shortTextZh: string }).shortTextZh = "得4分"; }],
  ];

  it.each(mutations)("rejects %s", (_, mutate) => {
    const files = currentFiles();
    mutate(files);
    expect(validateContentFiles(files).length).toBeGreaterThan(0);
  });
});

// ── One source per value ─────────────────────────────────────────────────────────────────

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("one source per value", () => {
  const engineFiles = sourceFiles(join(ROOT, "src/game")).map((file) => relative(ROOT, file).replaceAll("\\", "/"));

  it("reads data/*.json only through content.ts and rulesFingerprint.ts (and the display-only round structure)", () => {
    const readers = engineFiles.filter((file) =>
      /from\s+["'][./]*data\/[a-z_]+\.json["']/.test(readFileSync(join(ROOT, file), "utf8")));
    // roundStructure.ts reads only data/round_structure.json: round-phase names and summaries
    // for display, no rule value and no fingerprint input (UI_V1.6.1_ARCHITECTURE §5 gap 17).
    expect(readers.sort()).toEqual(["src/game/content.ts", "src/game/roundStructure.ts", "src/game/rulesFingerprint.ts"]);
    const display = readFileSync(join(ROOT, "src/game/roundStructure.ts"), "utf8").match(/data\/[a-z_]+\.json/g);
    expect([...new Set(display)]).toEqual(["data/round_structure.json"]);
  });

  it("declares no Glaze heat literal outside content.ts", () => {
    const offenders: string[] = [];
    for (const file of engineFiles.filter((name) => name !== "src/game/content.ts")) {
      readFileSync(join(ROOT, file), "utf8").split("\n").forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (code.trimStart().startsWith("*")) return;
        if (/\b(white|celadon|grey_green|moon_white)\b\s*["']?\s*[:,=]\s*[0-5]\b/.test(code)) offenders.push(`${file}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

// ── Full ability text: the English rulebook and its Chinese edition ─────────────────────

describe("full Tech and Kiln abilities are the rulebook text in both languages", () => {
  const ZH_B_SECTIONS: ReadonlyArray<readonly [TechDiscipline, string]> = [
    ["workshop", "### B1. 坯作——6张"],
    ["glazing_loading", "### B2. 釉作——6张"],
    ["firing", "### B3. 火作——6张"],
  ];
  const zhTechRows = ZH_B_SECTIONS.flatMap(([discipline, heading]) =>
    tableRows(section(heading, SOURCE_ZH)).filter((cells) => /^\d+$/.test(cells[1] ?? "")).map((cells) => ({ discipline, cells })));

  it("the Chinese Appendix B prints the same 18 tiles, disciplines and costs", () => {
    expect(zhTechRows).toHaveLength(18);
    for (const { discipline, cells } of zhTechRows) {
      const id = TECH_IDS.find((techId) => TECHS[techId].nameZh === cells[0]);
      expect(id, cells[0]).toBeDefined();
      if (id === undefined) continue;
      expect(TECHS[id].discipline, id).toBe(discipline);
      expect(TECHS[id].cost, id).toBe(Number(cells[1]));
    }
  });

  it.each(TECH_IDS)("Tech %s: ability is the English Appendix B cell, abilityZh the Chinese one", (id) => {
    const tech = TECHS[id];
    const en = techRows.find((entry) => techByPrintedName(entry.cells[0] ?? "").id === id);
    const zh = zhTechRows.find((entry) => entry.cells[0] === tech.nameZh);
    expect(tech.ability).toBe(en?.cells[2]);
    expect(tech.abilityZh).toBe(zh?.cells[2]);
  });

  it.each(KILN_IDS)("Kiln %s: ability and abilityZh are the Kiln Tradition Abilities sections", (id) => {
    const kiln = KILNS[id];
    const paragraphs = (heading: string, source: string): string[] => section(heading, source).trim().split(/\n\s*\n/).map(clean);
    expect(kiln.ability).toBe(paragraphs(`### ${kiln.name} / ${kiln.nameZh} — ${kiln.abilityName}`, SOURCE).join(" "));
    expect(kiln.abilityZh).toBe(paragraphs(`### ${kiln.nameZh} · ${kiln.abilityNameZh}`, SOURCE_ZH).join(""));
  });

  it("the Chinese edition defers to the English rulebook", () => {
    expect(SOURCE_ZH.split("\n")[0]).toContain("v1.61");
    expect(SOURCE_ZH).toContain("规则以英文版规则书为准");
  });
});

// ── Short component text (docs/KILN_OPENING_v1.6.1_COMPONENT_TEXT_SOURCE.md) ──────────────

/** `### Name / 名 (T01)` sections with `- EN:` and `- ZH:` lines; the Review notes have none. */
function componentTexts(): Map<string, { heading: string; en?: string; zh?: string }> {
  const found = new Map<string, { heading: string; en?: string; zh?: string }>();
  let current: { heading: string; en?: string; zh?: string } | null = null;
  for (const line of COMPONENT_TEXT.split("\n")) {
    if (line.startsWith("## ")) current = null;
    const heading = /^### (.+) \(([A-Z0-9]{2,3})\)$/.exec(line);
    if (heading !== null) {
      current = { heading: heading[1] ?? "" };
      found.set(heading[2] ?? "", current);
      continue;
    }
    const text = /^- (EN|ZH): (.+)$/.exec(line);
    if (current !== null && text !== null) current[text[1] === "EN" ? "en" : "zh"] = text[2] ?? "";
  }
  return found;
}

describe("short component text (component text source)", () => {
  const texts = componentTexts();

  it("covers exactly the 18 Techs and 5 Kilns", () => {
    expect([...texts.keys()].sort()).toEqual([...TECH_IDS, ...KILN_IDS].sort());
  });

  it.each([...TECH_IDS, ...KILN_IDS])("%s: shortText and shortTextZh equal the doc lines", (id) => {
    const definition = (TECH_IDS as readonly string[]).includes(id) ? TECHS[id as TechId] : KILNS[id as keyof typeof KILNS];
    const entry = texts.get(id);
    expect(definition.shortText).toBe(entry?.en);
    expect(definition.shortTextZh).toBe(entry?.zh);
    const heading = "abilityName" in definition
      ? `${definition.name} / ${definition.nameZh} — ${definition.abilityName} / ${definition.abilityNameZh}`
      : `${definition.name} / ${definition.nameZh}`;
    expect(entry?.heading).toBe(heading);
  });

  it("is plain text whose timing clause and secondary labels the UI emphasises", () => {
    const emphasised = new Map<string, string[]>();
    for (const definition of [...TECH_IDS.map((id) => TECHS[id]), ...KILN_IDS.map((id) => KILNS[id])]) {
      for (const text of [definition.shortText, definition.shortTextZh]) {
        expect(text, definition.id).not.toMatch(/[*_`#\n]|<br>/);
        const segments = shortTextSegments(text);
        expect(segments.map((segment) => segment.text).join(""), definition.id).toBe(text);
        expect(segments[0]?.emphasis && /[:：]$/.test(segments[0].text), `${definition.id}: timing clause`).toBe(true);
        const labels = segments.slice(1).filter((segment) => segment.emphasis).map((segment) => segment.text);
        if (labels.length > 0) emphasised.set(`${definition.id}:${text === definition.shortText ? "en" : "zh"}`, labels);
      }
    }
    expect(Object.fromEntries(emphasised)).toEqual({
      "T10:en": ["Ongoing:"],
      "T10:zh": ["持续："],
      "GE:en": ["Orders:"],
      "GE:zh": ["完成委托时："],
    });
    expect(SHORT_TEXT_SECONDARY_LABELS).toEqual(["Ongoing:", "Orders:", "持续：", "完成委托时："]);
    expect(shortTextSegments("Game end: score.")).toEqual([{ text: "Game end:", emphasis: true }, { text: " score.", emphasis: false }]);
  });
});

// ── Clarifications (owner decision D10, UI architecture K15) ─────────────────────────────

/** `### <key> — <name>` sections of `- [source] English / 中文` items; header and Review notes skipped. */
function clarificationsDoc(): Map<string, { heading: string; items: ClarificationDefinition[] }> {
  const found = new Map<string, { heading: string; items: ClarificationDefinition[] }>();
  let current: { heading: string; items: ClarificationDefinition[] } | null = null;
  for (const line of CLARIFICATIONS_DOC.split("\n")) {
    if (line.startsWith("## ")) current = null;
    const heading = /^### (\S+) — (.+)$/.exec(line);
    if (heading !== null) {
      current = { heading: heading[2] ?? "", items: [] };
      found.set(heading[1] ?? "", current);
      continue;
    }
    if (current === null || !line.startsWith("- ")) continue;
    const item = /^- \[([^\]]+)\] (.+)$/.exec(line);
    const halves = item?.[2]?.split(" / ") ?? [];
    if (item === null || halves.length !== 2) throw new Error(`Malformed clarification line: ${line}`);
    current.items.push({ en: halves[0] ?? "", zh: halves[1] ?? "", source: item[1] ?? "" });
  }
  return found;
}

/** Every component's clarifications from data, keyed like the doc sections. */
function dataClarifications(): Map<string, { heading: string; items: readonly ClarificationDefinition[] }> {
  const found = new Map<string, { heading: string; items: readonly ClarificationDefinition[] }>();
  for (const id of TECH_IDS) found.set(id, { heading: `${TECHS[id].name} / ${TECHS[id].nameZh}`, items: TECHS[id].clarifications });
  for (const id of KILN_IDS) {
    const kiln = KILNS[id];
    found.set(id, { heading: `${kiln.name}, ${kiln.abilityName} / ${kiln.nameZh} · ${kiln.abilityNameZh}`, items: kiln.clarifications });
  }
  for (const id of LOCATION_IDS) found.set(id, { heading: `${LOCATIONS[id].name} / ${LOCATIONS[id].nameZh}`, items: LOCATIONS[id].clarifications });
  for (const space of IMPERIAL_TRACK.track) {
    if (space.reward !== null) found.set(space.id, { heading: `${space.title} / ${space.titleZh}`, items: space.clarifications });
  }
  found.set("imperial_overflow", { heading: "Crowns beyond Recognition 4 / 声望满后每个御令+1分", items: IMPERIAL_TRACK.clarifications.imperial_overflow });
  found.set("orders.starting", { heading: "Starting Orders / 起始委托", items: ORDER_CLARIFICATIONS.starting });
  found.set("orders.main", { heading: "Main Orders and Crown Orders / 主委托与御令委托", items: ORDER_CLARIFICATIONS.main });
  return found;
}

const AUDIT_SECTION = (heading: string): string => section(heading, AUDIT);

/** Where a source tag points, or null when it points nowhere. */
function resolveTag(tag: string): string | null {
  const lines = SOURCE.split("\n");
  const line = /^(?:ED )?L(\d+)$/.exec(tag);
  if (line !== null && !tag.startsWith("ED ")) {
    const text = lines[Number(line[1]) - 1] ?? "";
    return text.trim() === "" ? null : text;
  }
  if (line !== null) {
    const editorial = AUDIT_SECTION("### Editorial corrections (no rule change)");
    return editorial.split("\n").find((entry) => entry.startsWith(`- Line ${line[1]}:`)) ?? null;
  }
  if (/^A\d+$/.test(tag)) return tableRows(AUDIT_SECTION("## Owner amendments")).find((cells) => cells[0] === tag)?.join(" | ") ?? null;
  if (/^[RB]\d+$/.test(tag)) {
    return tableRows(AUDIT_SECTION("## Owner rulings (approved 2026-10-14)")).find((cells) => cells[0] === tag)?.join(" | ") ?? null;
  }
  if (/^P\d$/.test(tag)) {
    return AUDIT_SECTION("### Provisional defaults (edge cases the text leaves open; owner may overrule)").split("\n")
      .find((entry) => entry.startsWith(`- **${tag} —`)) ?? null;
  }
  if (/^D\d+$/.test(tag)) return tableRows(OWNER_DECISIONS).find((cells) => cells[0] === tag)?.join(" | ") ?? null;
  if (tag.startsWith("INT ")) {
    // The bold label of an "Interpretations of V1.6.1 text" bullet containing every word of the name.
    const words = tag.slice(4).toLowerCase().split(" ");
    return AUDIT_SECTION("### Interpretations of V1.6.1 text, recorded for implementers").split("\n")
      .filter((entry) => entry.startsWith("- **"))
      .find((entry) => {
        const label = (/^- \*\*([^*]+)\*\*/.exec(entry)?.[1] ?? "").toLowerCase();
        return words.every((word) => label.includes(word));
      }) ?? null;
  }
  return null;
}

/**
 * Clauses that start by quoting their cited rulebook line but deliberately adapt it, with the
 * reason. Any other clause that opens with six or more words of a cited line must match that
 * line exactly.
 */
const QUOTE_ADAPTATIONS: ReadonlyArray<readonly [string, string, string]> = [
  ["T18", "Because the display is not refilled until your turn ends, a second face-up reservation", "L198 says \"a Shifu's\"; here an Apprentice resolves the Shifu effect"],
  ["T10", "Starting Orders and reserved Main Orders both count toward the limit at Cleanup", "joins L199's last sentence to its Cleanup timing"],
  ["T12", "A ceramic in an Imperial Kiln gives no say over the shared fire", "L260 abridged"],
  ["JU", "Jun's adjustment applies on top of either a Heat marker or the Kiln Master marker", "L648's \"either\" named"],
  ["magistrates_hall", "You may place a worker only if you can perform at least 1 instance of the main action", "L141 \"that location's\" made specific"],
  ["orders.starting", "Starting Orders and reserved Main Orders both count toward your hand limit of 4", "L199 and L303 combined"],
  ["orders.main", "Starting Orders and reserved Main Orders both count toward your hand limit of 4", "L199 and L303 combined"],
];

describe("clarifications (owner decision D10, K15)", () => {
  const doc = clarificationsDoc();
  const data = dataClarifications();
  const all = [...data.entries()].flatMap(([key, entry]) => entry.items.map((item) => ({ key, item })));

  it("every doc item appears in data, in order, and vice versa", () => {
    const fromDoc = Object.fromEntries([...doc.entries()].map(([key, entry]) => [key, entry.items]));
    const fromData = Object.fromEntries([...data.entries()].map(([key, entry]) => [key, entry.items]));
    expect(fromData).toEqual(fromDoc);
    expect(all).toHaveLength(292);
    expect(IMPERIAL_TRACK.track.filter((space) => space.clarifications.length === 0).map((space) => space.id)).toEqual(["local_workshop"]);
  });

  it("keys every doc section to the component it names", () => {
    for (const [key, entry] of doc) expect(entry.heading, key).toBe(data.get(key)?.heading);
  });

  it("gives every item a well-formed source whose tags point at a rulebook line or an audit entry", () => {
    const unresolved: string[] = [];
    for (const { key, item } of all) {
      for (const tag of clarificationTags(item.source)) {
        expect(CLARIFICATION_TAG.test(tag), `${key}: ${tag}`).toBe(true);
        expect(() => clarificationSourceKind(tag)).not.toThrow();
        if (resolveTag(tag) === null) unresolved.push(`${key}: ${tag}`);
      }
      // Inline line references such as "(L211)" must exist too.
      for (const match of item.en.matchAll(/\(L(\d+)\)/g)) {
        if (resolveTag(`L${match[1]}`) === null) unresolved.push(`${key}: inline L${match[1]}`);
      }
    }
    expect(unresolved).toEqual([]);
    expect(clarificationSourceKind("L375")).toBe("rulebook");
    expect(clarificationSourceKind("ED L649")).toBe("editorial");
    expect(clarificationSourceKind("INT Ge Crackle")).toBe("interpretation");
    expect(clarificationSourceKind("P1")).toBe("provisional");
    expect(clarificationSourceKind("D7")).toBe("wording");
    expect(clarificationSourceKind("A1")).toBe("amendment");
    expect(clarificationSourceKind("B3")).toBe("ruling");
    for (const bad of ["L0", "R14", "B4", "P4", "INT", "ED 649", "l375"]) expect(CLARIFICATION_TAG.test(bad), bad).toBe(false);
    expect(resolveTag("L9999")).toBeNull();
    expect(resolveTag("INT Imaginary ruling")).toBeNull();
  });

  it("quotes cited rulebook sentences exactly", () => {
    const lines = SOURCE.split("\n");
    const mismatches: string[] = [];
    const adaptationsUsed = new Set<string>();
    for (const { key, item } of all) {
      const cited = clarificationTags(item.source).filter((tag) => /^L\d+$/.test(tag))
        .map((tag) => clean(lines[Number(tag.slice(1)) - 1] ?? "")).join(" ");
      if (cited === "") continue;
      const clauses = item.en.replace(/ \(L\d+\)/g, "").split(/(?<=\.) |; |: |, so /)
        .map((clause) => clause.trim().replace(/\.$/, "")).filter((clause) => clause.split(" ").length >= 6);
      for (const clause of clauses) {
        if (!cited.includes(clause.split(" ").slice(0, 6).join(" ")) || cited.includes(clause)) continue;
        const adaptation = QUOTE_ADAPTATIONS.find(([adaptedKey, start]) => adaptedKey === key && clause.startsWith(start));
        if (adaptation === undefined) mismatches.push(`${key} [${item.source}]: ${clause}`);
        else adaptationsUsed.add(`${adaptation[0]}:${adaptation[1]}`);
      }
    }
    expect(mismatches).toEqual([]);
    // Every recorded adaptation is still needed.
    expect(adaptationsUsed.size).toBe(QUOTE_ADAPTATIONS.length);
  });

  it("never repeats a component's own full rule text", () => {
    for (const id of TECH_IDS) for (const item of TECHS[id].clarifications) expect(item.en, id).not.toBe(TECHS[id].ability);
    for (const id of KILN_IDS) for (const item of KILNS[id].clarifications) expect(item.en, id).not.toBe(KILNS[id].ability);
  });
});
