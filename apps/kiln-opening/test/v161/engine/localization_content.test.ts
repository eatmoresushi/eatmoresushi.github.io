import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRIBUTION_CARD_IDS,
  DECORATIONS,
  DISCIPLINES,
  GLAZES,
  IMPERIAL_TRACK,
  KILN_IDS,
  KILN_SPACE_IDS,
  KILNS,
  LOCATION_IDS,
  LOCATIONS,
  ORDER_IDS,
  ORDERS,
  QUALITIES,
  SHAPES,
  TECH_IDS,
  TECHS,
  contributionCard,
} from "../../../src/game/content.ts";
import {
  DECORATION_TEXT,
  DISCIPLINE_TEXT,
  GLAZE_TEXT,
  PHASE_TEXT,
  QUALITY_TEXT,
  RESOURCE_TEXT,
  RULE_ERROR_TEXT,
  SHAPE_TEXT,
  detailLabel,
  formatRuleError,
} from "../../../src/game/ruleErrorText.ts";
import {
  GLOSSARY_LINES,
  RETIRED_TERMS,
  ROOT,
  brToNewline,
  cellsOf,
  glossaryParagraph,
  glossaryRow,
  glossaryTableAfter,
  glossaryTerm,
  withoutApparatus,
} from "../support/glossary.ts";
import type {
  CeramicState,
  GameRuleErrorCode,
  GameState,
  KilnSpaceId,
  PlayerState,
  SharedKilnSpaceState,
  TechId,
} from "../../../src/game/types.ts";

/**
 * EN/ZH content (AGENTS.md "English/Simplified Chinese rendering from the same stable IDs",
 * DESIGN §8.2): every stable ID resolves to English and Chinese text through the content and
 * rule-error layers; the Chinese uses the fixed terms of docs/GLOSSARY_ZH_V1.6.1.md and none of
 * the retired V1.4 vocabulary; rendering either language never touches game state.
 */

const TYPES = readFileSync(join(ROOT, "src/game/types.ts"), "utf8");

// ── Every stable ID has EN and ZH text ──────────────────────────────────────────────────

const nonEmpty = (text: string | null | undefined): boolean => typeof text === "string" && text.trim().length > 0;

const ERROR_CODES = [...(TYPES.split("export type GameRuleErrorCode =")[1]?.split(";")[0] ?? "").matchAll(/"([A-Z_]+)"/g)]
  .map((match) => match[1] as GameRuleErrorCode);
const PHASE_TYPES = [...(TYPES.split("export type GamePhase =")[1]?.split("export type GamePhaseType")[0] ?? "")
  .matchAll(/type: "([a-z_]+)"/g)].map((match) => match[1] ?? "");

describe("every stable ID resolves to English and Chinese text", () => {
  it.each(ORDER_IDS)("Order %s", (id) => {
    expect(nonEmpty(ORDERS[id].requirements) && nonEmpty(ORDERS[id].requirementsZh)).toBe(true);
  });

  it.each(TECH_IDS)("Tech %s", (id) => {
    const tech = TECHS[id];
    for (const text of [tech.name, tech.nameZh, tech.ability, tech.abilityZh, tech.shortText, tech.shortTextZh]) expect(nonEmpty(text)).toBe(true);
  });

  it.each(KILN_IDS)("Kiln %s", (id) => {
    const kiln = KILNS[id];
    for (const text of [kiln.name, kiln.nameZh, kiln.abilityName, kiln.abilityNameZh, kiln.ability, kiln.abilityZh, kiln.shortText, kiln.shortTextZh]) {
      expect(nonEmpty(text)).toBe(true);
    }
  });

  it.each(LOCATION_IDS)("location %s", (id) => {
    const location = LOCATIONS[id];
    for (const text of [location.name, location.nameZh, location.apprenticeText, location.apprenticeTextZh, location.shifuText, location.shifuTextZh]) {
      expect(nonEmpty(text)).toBe(true);
    }
    expect(detailLabel("locationId", id, "en")).toBe(location.name);
    expect(detailLabel("locationId", id, "zh")).toBe(location.nameZh);
  });

  it.each(IMPERIAL_TRACK.track.map((space) => [space.space, space] as const))("Recognition space %s", (_, space) => {
    expect(nonEmpty(space.title) && nonEmpty(space.titleZh)).toBe(true);
    expect(space.rewardText === null).toBe(space.rewardTextZh === null);
    if (space.reward !== null) expect(nonEmpty(space.rewardText) && nonEmpty(space.rewardTextZh)).toBe(true);
  });

  it.each(ERROR_CODES)("rule error %s", (code) => {
    const en = formatRuleError({ code, details: {} }, "en");
    const zh = formatRuleError({ code, details: {} }, "zh");
    expect(nonEmpty(en) && nonEmpty(zh)).toBe(true);
    expect(en).not.toMatch(/[{}]/);
    expect(zh).not.toMatch(/[{}]/);
    expect(formatRuleError({ code, details: {} }, "zh-CN")).toBe(zh);
  });

  it("names every Contribution card, kiln space, phase and vocabulary value in both languages", () => {
    for (const id of CONTRIBUTION_CARD_IDS) {
      expect(nonEmpty(contributionCard(id).name) && nonEmpty(contributionCard(id).nameZh)).toBe(true);
      expect(detailLabel("card", id, "zh")).toBe(contributionCard(id).nameZh);
    }
    for (const id of KILN_SPACE_IDS) {
      expect(detailLabel("spaceId", id, "en")).not.toBe(id);
      expect(detailLabel("spaceId", id, "zh")).not.toBe(id);
    }
    expect(Object.keys(PHASE_TEXT).sort()).toEqual([...PHASE_TYPES].sort());
    for (const phase of PHASE_TYPES) {
      expect(detailLabel("phase", phase, "en")).not.toBe(phase);
      expect(detailLabel("phase", phase, "zh")).not.toBe(phase);
    }
    for (const value of [...SHAPES, ...GLAZES, ...DECORATIONS, ...QUALITIES, ...DISCIPLINES, "clay", "wood", "coins"]) {
      expect(detailLabel("value", value, "en"), value).not.toBe(value);
      expect(detailLabel("value", value, "zh"), value).not.toBe(value);
    }
    for (const id of TECH_IDS) expect(detailLabel("techId", id, "zh")).toBe(TECHS[id].nameZh);
    for (const id of KILN_IDS) expect(detailLabel("kilnId", id, "zh")).toBe(KILNS[id].nameZh);
  });

  it("interpolates details into both languages", () => {
    const full = formatRuleError({ code: "INSUFFICIENT_RESOURCES", details: { resource: "coins", needed: 3, have: 1 } }, "zh");
    expect(full).toBe("铜钱不足：需3，现有1");
    expect(formatRuleError({ code: "INSUFFICIENT_RESOURCES", details: {} }, "zh")).toBe("资源不足");
    expect(formatRuleError({ code: "LOCATION_FULL", details: { locationId: "guild_hall", capacity: 2 } }, "en")).toBe("Guild Hall is full.");
    // Owner decision D7: a second personal space is added by learning a Tech, never "unlocked".
    expect(formatRuleError({ code: "PERSONAL_SPACE_LOCKED", details: { locationId: "glaze_load" } }, "zh"))
      .toBe("习得釉作技艺即添此工位");
    expect(formatRuleError({ code: "PERSONAL_SPACE_LOCKED", details: { locationId: "form_decorate" } }, "en"))
      .toBe("Learn a Form & Decorate Tech to add this space.");
    expect(formatRuleError({ code: "TECH_ALREADY_USED", details: { techId: "T13" } }, "zh")).toBe("火照本轮已用");
    expect(formatRuleError({ code: "WORKER_UNAVAILABLE", details: { workerId: "p1:shifu" } }, "zh")).toBe("你没有可派的师傅");
    expect(formatRuleError({ code: "NOT_YOUR_DECISION", details: { waitingFor: "p2" } }, "zh", { playerName: () => "乙" }))
      .toBe("尚未轮到你，请等候乙");
    expect(formatRuleError({ code: "ORDER_REQUIREMENTS_NOT_MET", details: { orderId: "O13", reason: "crackle_not_masterpiece" } }, "zh"))
      .toBe("所选器物不满足委托O13的要求：开片器永远不是臻品");
    expect(formatRuleError({ code: "KILN_SPACE_UNAVAILABLE", details: { spaceId: "low_2" } }, "zh")).toBe("低温区2号窑位不可用：已被盖住或已有器物");
    expect(formatRuleError({ code: "TECH_LIMIT", details: { maxOwned: 3 } }, "zh")).toBe("你已拥有3项技艺");
    // Revision 4: Ge takes a Fine or Standard ceramic (change 29); only a Flawed ceramic is sold (R20).
    expect(formatRuleError({ code: "INVALID_TARGET", details: { ceramicId: "c1", reason: "not_fine_or_standard" } }, "en"))
      .toBe("That target is not allowed: the ceramic is not Fine or Standard.");
    expect(formatRuleError({ code: "INVALID_TARGET", details: { ceramicId: "c1", reason: "not_fine_or_standard" } }, "zh")).toBe("此目标不合法：器物不是上品或良品");
    expect(formatRuleError({ code: "INVALID_TARGET", details: { ceramicId: "c1", reason: "not_flawed" } }, "zh")).toBe("此目标不合法：器物不是瑕品");
    // Only a Select returns RESERVATION_LIMIT, and a Colour Samples Select is a Tech effect, not an
    // action (v1.6.2 L646): the text names the Select and reads for a limit of 1 as well as 2.
    expect(formatRuleError({ code: "RESERVATION_LIMIT", details: { limit: 1, requested: 2 } }, "en"))
      .toBe("This Select reserves at most 1; you chose 2 Orders.");
    expect(formatRuleError({ code: "RESERVATION_LIMIT", details: { limit: 2, requested: 3 } }, "zh")).toBe("这次精选至多承接2张，你选了3张");
    expect(formatRuleError({ code: "RESERVATION_LIMIT", details: { limit: 1 } }, "en")).toBe("This Select reserves at most 1.");
    expect(formatRuleError({ code: "RESERVATION_LIMIT", details: {} }, "zh")).toBe("这次精选不能再承接委托");
  });
});

// ── Glossary terms (docs/GLOSSARY_ZH_V1.6.1.md) ──────────────────────────────────────────

describe("Chinese text uses the glossary terms", () => {
  it("names locations, Kilns and Techs as glossary §2.4, §3 fix them", () => {
    for (const id of LOCATION_IDS) expect(LOCATIONS[id].nameZh, id).toBe(glossaryTerm(LOCATIONS[id].name));
    for (const id of KILN_IDS) {
      const kiln = KILNS[id];
      const [, nameZh, abilityNameZh, short] = glossaryRow(`${kiln.name} — ${kiln.abilityName}`);
      expect([kiln.nameZh, kiln.abilityNameZh, kiln.shortTextZh], id).toEqual([nameZh, abilityNameZh, brToNewline(short ?? "")]);
    }
    for (const id of TECH_IDS) {
      const tech = TECHS[id];
      const [, nameZh, cost, short] = glossaryRow(tech.name);
      expect([tech.nameZh, tech.cost, tech.shortTextZh], id).toEqual([nameZh, Number(cost), brToNewline(short ?? "")]);
    }
  });

  it("uses the glossary's full Tech and Kiln texts", () => {
    for (const id of TECH_IDS) expect(TECHS[id].abilityZh, id).toBe(withoutApparatus(glossaryParagraph(TECHS[id].nameZh)));
    for (const id of KILN_IDS) {
      expect(KILNS[id].abilityZh, id).toBe(withoutApparatus(glossaryParagraph(`${KILNS[id].nameZh} · ${KILNS[id].abilityNameZh}`)));
    }
  });

  it("uses the glossary's location texts (§4)", () => {
    for (const id of LOCATION_IDS) {
      const rows = glossaryTableAfter(`### 4.${LOCATION_IDS.indexOf(id) + 1} ${LOCATIONS[id].nameZh}`);
      const apprentice = rows.find((cells) => cells[0] === "学徒");
      const shifu = rows.find((cells) => cells[0] === "师傅");
      expect(LOCATIONS[id].apprenticeTextZh, id).toBe(withoutApparatus(apprentice?.[2] ?? ""));
      expect(LOCATIONS[id].shifuTextZh, id).toBe(withoutApparatus(shifu?.[2] ?? ""));
    }
  });

  it("uses the glossary's Recognition, Contribution and phase names", () => {
    const track = glossaryTableAfter("### 4.8 御府声望奖励");
    for (const space of IMPERIAL_TRACK.track) {
      const row = track.find((cells) => cells[0] === String(space.space));
      expect(space.titleZh).toBe(row?.[1]);
    }
    expect(IMPERIAL_TRACK.track[1]?.rewardTextZh).toBe(track.find((cells) => cells[0] === "1")?.[3]);
    expect(IMPERIAL_TRACK.track[4]?.rewardTextZh).toBe(track.find((cells) => cells[0] === "4")?.[3]);
    // The Imperial Gift formula keeps every term the English reward names (L433: Kiln Die result + Fire + the modifier
    // chosen when loading). Like the English, it leaves the Heat marker to the Imperial Kiln rules (owner wording, 2026-10-16).
    expect(IMPERIAL_TRACK.track[2]?.rewardTextZh).toContain("实际火候 = 窑骰点数 + 窑火修正 + 装窑时选定的御窑修正");
    for (const id of CONTRIBUTION_CARD_IDS) expect(contributionCard(id).nameZh).toBe(glossaryTerm(contributionCard(id).name));
    const roundStructure = JSON.parse(readFileSync(join(ROOT, "data/round_structure.json"), "utf8")) as {
      phases: Array<{ order: number; name: string; nameZh: string }>;
    };
    for (const phase of roundStructure.phases) {
      expect(phase.nameZh, phase.name).toBe(glossaryTerm(`Phase ${phase.order} ${phase.name}`));
    }
  });

  it("uses the glossary's Shape, Glaze, Decoration, Quality, resource and discipline terms", () => {
    const english: Record<string, string> = { washer: "Brush Washer", grey_green: "Grey-Green", moon_white: "Moon White" };
    const name = (value: string): string => english[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
    for (const shape of SHAPES) expect(SHAPE_TEXT[shape].zh, shape).toBe(glossaryTerm(name(shape)));
    for (const glaze of GLAZES) expect(GLAZE_TEXT[glaze].zh, glaze).toBe(glossaryTerm(name(glaze)));
    for (const decoration of DECORATIONS) expect(DECORATION_TEXT[decoration].zh, decoration).toBe(glossaryTerm(name(decoration)));
    for (const quality of QUALITIES) expect(QUALITY_TEXT[quality].zh, quality).toBe(glossaryTerm(name(quality)));
    for (const resource of ["clay", "wood", "coins"] as const) expect(RESOURCE_TEXT[resource].zh).toBe(glossaryTerm(name(resource)));
    expect(DISCIPLINE_TEXT.workshop.zh).toBe(glossaryTerm("Form & Decorate (discipline)"));
    // Owner decision D11 / amendment A2: the English discipline name is Form & Decorate (ID `workshop`).
    expect(DISCIPLINE_TEXT.workshop.en).toBe("Form & Decorate");
    expect(DISCIPLINE_TEXT.glazing_loading.zh).toBe(glossaryTerm("Glazing & Loading (discipline)"));
    expect(DISCIPLINE_TEXT.firing.zh).toBe(glossaryTerm("Firing (discipline)"));
    expect(DECORATION_TEXT.painted.zh).toBe("画花");
  });

  it("translates every Order requirement with the glossary §5 phrases", () => {
    const phrases = new Map<string, string>();
    for (const [en = "", zh = ""] of glossaryTableAfter("### 5.1 句式对照")) {
      if (en.includes("`")) continue;
      const enParts = en.replace(/（[^）]*）/g, "").split(" / ").map((part) => part.trim());
      const zhParts = zh.split("／").map((part) => part.trim());
      if (enParts.length === zhParts.length) enParts.forEach((part, index) => phrases.set(part, zhParts[index] ?? ""));
    }
    const term = (english: string): string => glossaryTerm(english);
    const translatePart = (part: string): string => {
      const fixed = phrases.get(part);
      if (fixed !== undefined && !/^(both|one) /.test(part) && !part.includes(" + ")) return fixed;
      const both = /^both (.+)$/.exec(part);
      if (both !== null) return `均为${term(both[1] ?? "")}`;
      if (part.startsWith("one ")) return `${part.split(", ").map((item) => term(item.slice(4))).join("、")}各1件`;
      if (part.includes(" + ")) return part.split(" + ").map(term).join(" + ");
      return term(part);
    };
    for (const id of ORDER_IDS) {
      const { requirements, requirementsZh } = ORDERS[id];
      const single = requirements.split(" · ");
      const expected = single.length === 3
        ? single.map(translatePart).join(" · ")
        : requirements.split("; ").map(translatePart).join("；");
      expect(requirementsZh, id).toBe(expected);
    }
  });

  it("matches the glossary §5.2 Order examples, rewards included", () => {
    const examples = glossaryTableAfter("### 5.2 示例");
    expect(examples.length).toBeGreaterThanOrEqual(6);
    for (const [id = "", requirementsZh, qualityZh, rewards = ""] of examples) {
      const order = ORDERS[id as keyof typeof ORDERS];
      expect(order.requirementsZh, id).toBe(requirementsZh);
      expect(qualityZh?.startsWith(`${QUALITY_TEXT[order.minQuality].zh}${order.minQuality === "masterpiece" ? "" : "以上"}`)
        || qualityZh?.startsWith(`均${QUALITY_TEXT[order.minQuality].zh}以上`), id).toBe(true);
      const crowns = order.crowns === 0 ? "" : ` · 👑×${order.crowns}`;
      expect(rewards, id).toBe(`${order.vp}分 · ${order.coins}铜钱${crowns}`);
    }
  });

  it("uses the glossary §7 error sentences", () => {
    const normalise = (text: string): string => text.replace(/\{[A-Za-z]+\}/g, "#").replace(/\d+/g, "#");
    const rows = GLOSSARY_LINES.filter((line) => line.startsWith("| `")).map(cellsOf);
    expect(rows.length).toBeGreaterThan(40);
    const covered = new Set<string>();
    for (const [codes = "", , sentence = ""] of rows) {
      for (const code of [...codes.matchAll(/`([A-Z_]+)`/g)].map((match) => match[1] as GameRuleErrorCode)) {
        const entry = RULE_ERROR_TEXT[code];
        const templates = [entry, ...(entry.fallbacks ?? [])].map((template) => normalise(template.zh));
        expect(templates, code).toContain(normalise(sentence));
        covered.add(code);
      }
    }
    // Codes the glossary does not list still read in the same register.
    for (const code of ERROR_CODES.filter((candidate) => !covered.has(candidate))) {
      expect(RULE_ERROR_TEXT[code].zh, code).not.toMatch(/[!！]/);
    }
  });

  it("carries the Chinese Tech clarifications word for word (glossary §8, Chinese Appendix B 技艺通则)", () => {
    const rulebookZh = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.2_ZH.md"), "utf8").split("\n");
    const bulletsAfter = (lines: readonly string[], heading: string): string[] => {
      const start = lines.findIndex((line) => line.startsWith(heading));
      const end = lines.findIndex((line, index) => index > start && (line.startsWith("#") || line === "---"));
      return lines.slice(start + 1, end).filter((line) => line.startsWith("- "));
    };
    const glossary = bulletsAfter(GLOSSARY_LINES, "## 8. 技艺通则");
    expect(glossary).toHaveLength(9);
    expect(glossary).toEqual(bulletsAfter(rulebookZh, "### 技艺通则"));
  });

  it("names the Colour Samples swap 换单, as the Chinese rulebook does (changes 22 and 25, Chinese lines 34, 37 and 648)", () => {
    expect(glossaryTerm("Colour Samples swap (once per round)")).toBe("换单");
    const rulebookZh = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.2_ZH.md"), "utf8");
    expect(rulebookZh).toContain("色样簿增加每轮一次的换单");
    // Owner revision 3: the swap is a Select 3 (精选3), and its discarded Order is still 换单时弃置的主委托.
    expect(rulebookZh).toContain("每轮一次的换单也是精选3");
    expect(rulebookZh).toContain("换单时弃置的主委托放入主委托弃牌堆");
    // The clarifications name it the same way.
    expect(TECHS.T10.clarifications.filter((item) => item.zh.includes("换单")).length).toBeGreaterThan(3);
  });

  it("keeps Tech and Kiln reminders to one line of at most 96 characters (glossary §3, owner ruling R18: four printed lines of 24)", () => {
    for (const definition of [...TECH_IDS.map((id) => TECHS[id]), ...KILN_IDS.map((id) => KILNS[id])]) {
      expect(definition.shortTextZh, definition.id).not.toContain("\n");
      expect([...definition.shortTextZh].length, `${definition.id}: ${definition.shortTextZh}`).toBeLessThanOrEqual(96);
    }
  });
});

// ── No retired vocabulary or punctuation in any Chinese string ───────────────────────────

/** Every `…Zh` string of every data file, plus the rule-error and label tables. */
function chineseStrings(): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
    else if (value !== null && typeof value === "object") {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        // `…Zh` text fields, and the `zh` half of every D10 clarification.
        if ((key.endsWith("Zh") || (key === "zh" && path.includes(".clarifications"))) && typeof item === "string") found.push([`${path}.${key}`, item]);
        else walk(item, `${path}.${key}`);
      }
    }
  };
  for (const file of readdirSync(join(ROOT, "data")).filter((name) => name.endsWith(".json"))) {
    walk(JSON.parse(readFileSync(join(ROOT, "data", file), "utf8")), file);
  }
  for (const [code, entry] of Object.entries(RULE_ERROR_TEXT)) {
    [entry, ...(entry.fallbacks ?? [])].forEach((template, index) => found.push([`error ${code}#${index}`, template.zh]));
  }
  for (const table of [SHAPE_TEXT, GLAZE_TEXT, DECORATION_TEXT, QUALITY_TEXT, RESOURCE_TEXT, DISCIPLINE_TEXT, PHASE_TEXT]) {
    for (const [key, label] of Object.entries(table)) found.push([`label ${key}`, label.zh]);
  }
  return found;
}

describe("Chinese strings avoid retired terms and follow the glossary's punctuation", () => {
  const strings = chineseStrings();

  it("collects the Chinese text of every data file", () => {
    expect(strings.length).toBeGreaterThan(300);
    // Every D10 clarification's Chinese half is checked too (170 items in the V1.6.2 clarifications doc).
    expect(strings.filter(([path]) => path.includes(".clarifications")).length).toBe(170);
  });

  it("uses none of the retired or banned terms (glossary §1.5, §6)", () => {
    const offences = strings.flatMap(([path, text]) =>
      RETIRED_TERMS.filter(([term]) => text.includes(term)).map(([term, replacement]) => `${path}: "${term}" → ${replacement}`));
    expect(offences).toEqual([]);
  });

  it("uses 交货 only in the phase name 交货阶段", () => {
    const offences = strings.filter(([, text]) => /交货(?!阶段)/.test(text)).map(([path]) => path);
    expect(offences).toEqual([]);
  });

  it("never treats Crackle as a printed Decoration in an Order", () => {
    for (const id of ORDER_IDS) {
      expect(ORDERS[id].requirementsZh, id).not.toContain("开片");
      expect(ORDERS[id].requirementsZh.includes("画花"), id).toBe(ORDERS[id].requirements.includes("Painted"));
    }
  });

  it("follows glossary §1.2 punctuation and number style", () => {
    const offences: string[] = [];
    for (const [path, text] of strings) {
      if (/\d\s+[\u4e00-\u9fff]/.test(text)) offences.push(`${path}: space between a number and its unit`);
      if (/\d坯/.test(text)) offences.push(`${path}: count Shaped vessels with 件`);
      if (/[,;:()!?]/.test(text.replace(/\{[A-Za-z]+\}/g, ""))) offences.push(`${path}: ASCII punctuation`);
      if (text.includes("/")) offences.push(`${path}: ASCII slash, use ／`);
      if (text.includes("＋")) offences.push(`${path}: fullwidth plus`);
      if (/(^|[^\w])-\d/.test(text)) offences.push(`${path}: ASCII minus, use −`);
    }
    expect(offences).toEqual([]);
  });
});

// ── Rendering either language never touches game state ───────────────────────────────────

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

function player(id: string, seatIndex: number, kilnId: PlayerState["kilnId"], techs: TechId[]): PlayerState {
  return {
    id,
    seatIndex,
    displayName: id === "p1" ? "Ana" : "Bo",
    kilnId,
    resources: { clay: 2, wood: 1, coins: 4 },
    workers: {
      [`${id}:shifu`]: { id: `${id}:shifu`, kind: "shifu", placement: null },
      [`${id}:apprentice:1`]: {
        id: `${id}:apprentice:1`,
        kind: "apprentice",
        placement: { locationId: seatIndex === 0 ? "guild_hall" : "form_decorate", spaceIndex: 0, effect: "apprentice", viaSeniorApprentice: false, sequence: seatIndex + 1 },
      },
      [`${id}:apprentice:2`]: { id: `${id}:apprentice:2`, kind: "apprentice", placement: null },
      [`${id}:apprentice:3`]: { id: `${id}:apprentice:3`, kind: "apprentice", placement: null },
    },
    personalSpaces: {
      form_decorate: [{ unlocked: true }, { unlocked: techs.some((tech) => TECHS[tech].discipline === "workshop") }],
      glaze_load: [{ unlocked: true }, { unlocked: techs.some((tech) => TECHS[tech].discipline === "glazing_loading") }],
    },
    techs: techs.map((tech) => ({ id: tech, acquiredInRound: 1, usedThisRound: false })),
    contributionCards: ["BANK", "TEND", "STOKE", ...(techs.includes("T12") ? (["FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const) : [])],
    kilnAbilityUsedThisRound: false,
    imperial: { recognition: 2, grantReceived: true, kilnGained: true, priority: "on_track", audienceReceived: false },
    completedOrders: [{
      orderId: "S02", ceramicIds: ["c1"], round: 1, canalBargeCoins: 0, vp: 3, coins: 4,
      printedCrowns: 0, bonusCrowns: 0, crackleDeclarations: [], kilnAbility: null,
    }],
    score: { orders: 3, kilnAbilities: 0, recognitionOverflow: 0, imperialAudience: 0 },
  };
}

function sampleState(): GameState {
  const ceramics: Record<string, CeramicState> = {
    c1: { id: "c1", ownerId: "p1", vesselInstanceId: "bowl-01", shape: "bowl", decoration: "plain", formedInRound: 1, formedBy: "form_decorate",
      stage: "delivered", glaze: "celadon", firedInRound: 1, orderId: "S02", deliveredInRound: 1, crackle: false, quality: "masterpiece" },
    c2: { id: "c2", ownerId: "p2", vesselInstanceId: "vase-01", shape: "vase", decoration: "painted", formedInRound: 1, formedBy: "form_decorate",
      stage: "finished", glaze: "moon_white", firedInRound: 1, crackle: true, quality: "fine" },
    c3: { id: "c3", ownerId: "p1", vesselInstanceId: "plate-01", shape: "plate", decoration: "impressed", formedInRound: 2, formedBy: "ding_extra",
      stage: "loaded", glaze: "white", loadedInRound: 2, loadedBy: "glaze_load",
      placement: { kiln: "shared", spaceId: "high_1", stacked: false }, kilnMasterMarker: null },
    c4: { id: "c4", ownerId: "p2", vesselInstanceId: "censer-01", shape: "censer", decoration: "carved", formedInRound: 2, formedBy: "prepared_clay",
      stage: "shaped" },
    c5: { id: "c5", ownerId: "p1", vesselInstanceId: "washer-01", shape: "washer", decoration: "carved", formedInRound: 2, formedBy: "form_decorate",
      stage: "loaded", glaze: "grey_green", loadedInRound: 2, loadedBy: "imperial_priority",
      placement: { kiln: "imperial", imperialModifier: -1 }, kilnMasterMarker: null },
  };
  const space = (id: KilnSpaceId): SharedKilnSpaceState => ({
    active: ["high_1", "high_2", "middle_1", "low_1"].includes(id),
    ceramicIds: id === "high_1" ? ["c3"] : [],
    setterMarkOwnerId: id === "middle_1" ? "p2" : null,
    kilnFurniture: null,
  });
  return {
    schemaVersion: 9,
    rulesVersion: "1.6.2",
    gameId: "localization",
    revision: 12,
    eventSequence: 40,
    nextCeramicSequence: 6,
    nextProxySequence: 1,
    placementSequence: 2,
    playerCount: 2,
    round: 2,
    playerOrder: ["p1", "p2"],
    firstPlayerId: "p2",
    phase: { type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } },
    players: { p1: player("p1", 0, "DI", ["T17", "T23", "T13"]), p2: player("p2", 1, "GE", ["T19"]) },
    ceramics,
    vesselSupply: { bowl: ["bowl-02"], plate: ["plate-02"], washer: ["washer-02"], vase: ["vase-02"], censer: ["censer-02"] },
    sharedKiln: { spaces: Object.fromEntries(KILN_SPACE_IDS.map((id) => [id, space(id)])) as Record<KilnSpaceId, SharedKilnSpaceState> },
    market: { display: ["O13", "O17", "O23", null, "O39", "O46"], refillPendingFor: "p1" },
    techDisplay: { workshop: ["T16", "T01"], glazing_loading: ["T21"], firing: ["T24", "T25"] },
    fireDiscard: [-1, 2],
    kilnDie: { round: 2, value: 3 },
    firing: null,
    lastFiring: null,
    finalResult: null,
    hidden: {
      orderHands: { p1: ["S07", "O40"], p2: ["S04", "S08", "O48"] },
      mainDeck: ["O01", "O02"],
      mainDiscard: ["O31"],
      startingBox: ["S01"],
      techDecks: { workshop: ["T05", "T18"], glazing_loading: ["T10", "T20", "T15", "T22"], firing: ["T11", "T12", "T14"] },
      fireDeck: [0, 1, -2, 0],
      fireBuried: 0,
      pendingLook: null,
      firePeeks: {},
    },
  };
}

/** A plain-text rendering of a state in one language, through content and rule-error text only. */
function renderState(state: GameState, locale: "en" | "zh"): string[] {
  const zh = locale === "zh";
  const lines: string[] = [detailLabel("phase", state.phase.type, locale)];
  for (const playerId of state.playerOrder) {
    const p = state.players[playerId];
    if (p === undefined) continue;
    if (p.kilnId !== null) lines.push(zh ? `${KILNS[p.kilnId].nameZh} · ${KILNS[p.kilnId].abilityNameZh}` : `${KILNS[p.kilnId].name} — ${KILNS[p.kilnId].abilityName}`);
    for (const tech of p.techs) lines.push(zh ? TECHS[tech.id].shortTextZh : TECHS[tech.id].shortText);
    for (const worker of Object.values(p.workers)) {
      if (worker.placement !== null) lines.push(detailLabel("locationId", worker.placement.locationId, locale));
    }
    const recognition = IMPERIAL_TRACK.track[p.imperial.recognition];
    if (recognition !== undefined) lines.push(zh ? recognition.titleZh : recognition.title);
    for (const orderId of state.hidden.orderHands[playerId] ?? []) lines.push(zh ? ORDERS[orderId].requirementsZh : ORDERS[orderId].requirements);
    for (const record of p.completedOrders) lines.push(zh ? ORDERS[record.orderId].requirementsZh : ORDERS[record.orderId].requirements);
  }
  for (const orderId of state.market.display) if (orderId !== null) lines.push(zh ? ORDERS[orderId].requirementsZh : ORDERS[orderId].requirements);
  for (const discipline of DISCIPLINES) {
    lines.push(detailLabel("discipline", discipline, locale));
    for (const tech of state.techDisplay[discipline]) lines.push(zh ? TECHS[tech].nameZh : TECHS[tech].name);
  }
  for (const ceramic of Object.values(state.ceramics)) {
    lines.push([ceramic.shape, ceramic.decoration, ceramic.stage].map((value) => detailLabel("value", value, locale)).join(" "));
    if (ceramic.stage !== "shaped") lines.push(detailLabel("value", ceramic.glaze, locale));
    if (ceramic.stage === "finished" || ceramic.stage === "delivered") lines.push(detailLabel("value", ceramic.quality, locale));
  }
  for (const spaceId of KILN_SPACE_IDS) if (state.sharedKiln.spaces[spaceId].active) lines.push(detailLabel("spaceId", spaceId, locale));
  for (const location of LOCATION_IDS) lines.push(zh ? LOCATIONS[location].nameZh : LOCATIONS[location].name);
  lines.push(formatRuleError({ code: "KILN_SPACE_MARKED", details: { spaceId: "middle_1", ownerId: "p2" } }, locale, {
    playerName: (id) => state.players[id]?.displayName ?? id,
  }));
  lines.push(formatRuleError({ code: "TECH_ALREADY_USED", details: { techId: "T13" } }, locale));
  return lines;
}

describe("rendering from stable IDs", () => {
  it("renders a deep-frozen GameState in English and Chinese without changing it", () => {
    const state = deepFreeze(sampleState());
    const before = JSON.stringify(state);
    const en = renderState(state, "en");
    const zh = renderState(state, "zh");
    expect(JSON.stringify(state)).toBe(before);
    expect(en).toHaveLength(zh.length);
    expect(en.every(nonEmpty) && zh.every(nonEmpty)).toBe(true);
    expect(zh.join("\n")).not.toMatch(/\b(?:Ding|Ge Kiln|Canal Barge|Painted|Masterpiece)\b/);
    expect(zh).toContain("定窑 · 范制成器");
    expect(zh).toContain("此窑位本轮已由Bo的窑位签占用");
    expect(en).toContain("Ding Kiln — Moulded Production");
    // Same IDs, same rendering: rendering is a pure function of state and locale.
    expect(renderState(state, "zh")).toEqual(zh);
  });
});

// ── Owner decision D7: no lock/unlock in player-facing text ─────────────────────────────

describe("player-facing text never says lock or unlock (owner decision D7)", () => {
  const ENGLISH = /\b(un)?lock(s|ed|ing)?\b/i;
  const CHINESE = /锁|封条|启封|封存/;

  /** Every string value of every data file, except stable IDs (e.g. the component ID `lock_tokens`). */
  function dataTexts(): Array<[string, string]> {
    const found: Array<[string, string]> = [];
    const walk = (value: unknown, path: string, key: string): void => {
      if (typeof value === "string") {
        if (!/^(id|.*Id|.*Ids)$/.test(key)) found.push([path, value]);
      } else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      else if (value !== null && typeof value === "object") {
        for (const [child, item] of Object.entries(value as Record<string, unknown>)) walk(item, `${path}.${child}`, child);
      }
    };
    for (const file of readdirSync(join(ROOT, "data")).filter((name) => name.endsWith(".json"))) {
      walk(JSON.parse(readFileSync(join(ROOT, "data", file), "utf8")), file, "");
    }
    return found;
  }

  function errorTexts(): Array<[string, string]> {
    return Object.entries(RULE_ERROR_TEXT).flatMap(([code, entry]) =>
      [entry, ...(entry.fallbacks ?? [])].flatMap((template, index): Array<[string, string]> => [
        [`error ${code}#${index} en`, template.en],
        [`error ${code}#${index} zh`, template.zh],
      ]));
  }

  it("collects the text fields of every data file and every rule-error template", () => {
    expect(dataTexts().length).toBeGreaterThan(600);
    expect(errorTexts().length).toBe(2 * Object.values(RULE_ERROR_TEXT).reduce((n, entry) => n + 1 + (entry.fallbacks ?? []).length, 0));
  });

  it("no data text field or rule-error template says lock, locked, unlock, 封条, 启封, 封存 or 锁", () => {
    const offences = [...dataTexts(), ...errorTexts()]
      .filter(([, text]) => ENGLISH.test(text) || CHINESE.test(text))
      .map(([path, text]) => `${path}: ${text}`);
    expect(offences).toEqual([]);
  });

  it("the guard catches the retired wording", () => {
    expect(ENGLISH.test("This space is still locked; acquire a Tech to unlock it.")).toBe(true);
    expect(ENGLISH.test("Lock tokens")).toBe(true);
    expect(ENGLISH.test("Passes clockwise each round.")).toBe(false);
    expect(CHINESE.test("此工位尚有封条，习得釉作技艺后启封")).toBe(true);
  });

  it("keeps the internal identifiers (wording only, not a rule change)", () => {
    expect(RULE_ERROR_TEXT.PERSONAL_SPACE_LOCKED.detailKeys).toEqual(expect.arrayContaining(["locationId", "discipline", "spaceIndex"]));
    expect(LOCATIONS.form_decorate.personalSpaces).toEqual({ total: 2, unlockedAtStart: 1 });
    expect(TECH_IDS.filter((id) => TECHS[id].unlocks !== null)).toHaveLength(12);
  });
});
