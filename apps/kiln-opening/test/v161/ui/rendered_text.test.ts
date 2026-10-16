/**
 * Rendered text of the full `GameScreen` (UI_V1.6.1_ARCHITECTURE §6.4, §9.2 `rendered_text`).
 * Owner: B6.
 *
 * For every scripted scenario and played moment, in English and Chinese, the whole screen —
 * top bar, world sections, decision pane, rules-details panels included — is scanned on its text
 * nodes and its `aria-label`, `title` and `alt` values (never class names or `data-*`):
 * - **D7:** no "lock"/"unlock" in English; none of 锁, 封条, 启封, 封存, 上锁, 解锁 and no 封 next
 *   to 窑位 or 工位 in Chinese;
 * - **obsolete mechanics** (AGENTS.md): no V1.4 term;
 * - **Chinese punctuation** (§6.3) on each Chinese text node;
 * - **D3/D4:** no Fire-deck count; no heat value on any ceramic or kiln space; none of odds,
 *   chance, probability, ladder, preview or expected, "cards left", "cards remaining" or "left in
 *   the deck", nor 概率, 几率, 余张, 预估, 预览, 剩余火牌 or 牌堆剩余; "ledger" and 柴簿 only as the
 *   Fuel Ledger's name. The rules-details panels quote the rulebook ("reveal 1 Fire card",
 *   "Actual Heat"), so the heat and deck checks skip them (B3 note); the banned words do not;
 * - **D9:** no ceramic or worker ID;
 * - **secrets:** none of that fixture's `secrets.json` Order and Tech IDs anywhere in the markup;
 * - **stable IDs:** English and Chinese give identical `data-*` attributes, and rendering leaves
 *   the view unchanged.
 */
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { allFixtures, fixture, fixtureSource, secretIds } from "./support/fixtures.ts";
import { renderScreen } from "./support/render.tsx";

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#x27;": "'", "&#39;": "'" };
const decode = (text: string): string => text.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity] ?? entity);

/** Each text node, decoded (inline emphasis joined to its sentence). */
function textNodes(html: string): string[] {
  return html
    .replace(/<\/?(?:strong|b|em)\b[^>]*>/g, "")
    .split(/<[^>]*>/)
    .map((text) => decode(text).replace(/\s+/g, " ").trim())
    .filter((text) => text !== "");
}

/** The `aria-label`, `title` and `alt` values. */
function labels(html: string): string[] {
  return [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => decode(match[1] ?? ""));
}

const perceivable = (html: string): string[] => [...textNodes(html), ...labels(html)];

/** The outer HTML of every element whose opening tag matches, balanced by tag name. */
function elements(html: string, opening: RegExp): Array<{ start: number; end: number }> {
  const found: Array<{ start: number; end: number }> = [];
  const global = new RegExp(opening.source, "g");
  for (let match = global.exec(html); match !== null; match = global.exec(html)) {
    const start = match.index;
    const tag = /^<(\w+)/.exec(html.slice(start))?.[1];
    if (tag === undefined) continue;
    const pattern = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
    pattern.lastIndex = start;
    let depth = 0;
    for (let inner = pattern.exec(html); inner !== null; inner = pattern.exec(html)) {
      if (inner[2] === "/") continue;
      depth += inner[1] === "/" ? -1 : 1;
      if (depth === 0) {
        found.push({ start, end: inner.index + inner[0].length });
        global.lastIndex = inner.index + inner[0].length;
        break;
      }
    }
  }
  return found;
}

/** The markup without the rules-details panel bodies (rulebook quotations, D10). */
function withoutRulesPanels(html: string): string {
  let out = html;
  for (;;) {
    const [first] = elements(out, /<div class="rd"/);
    if (first === undefined) return out;
    out = out.slice(0, first.start) + out.slice(first.end);
  }
}

/** The text of every ceramic and kiln-space element (art, chips, kiln cells). */
function pieceTexts(html: string): string[] {
  const html2 = withoutRulesPanels(html);
  return [
    ...elements(html2, /<[a-z]+[^>]*\sdata-ceramic-art="/),
    ...elements(html2, /<[a-z]+[^>]*\sdata-space="/),
  ].flatMap((range) => perceivable(html2.slice(range.start, range.end)));
}

const D7_EN = /\b(un)?lock/i;
const D7_ZH = /锁|封条|启封|封存|上锁|解锁|封(?:窑位|工位)|(?:窑位|工位)封/;
const OBSOLETE_EN = /Kiln Yard|Refin(?:ed Clay|ing House)|Starting Tech|\bHire\b|\bTrain(?:ed)?\b|specialist|Imperial (?:Court|Progress|Seal)|\bOffice\b|Glaze Palette|Dipping Vats|Measuring Calipers|White Slip|Drying Frames|Standardised Moulds|five[- ]player|overfill|Potter's Wheel|Decoration Workshop/i;
const OBSOLETE_ZH = /窑坊|练泥坊|精泥|起始技艺|雇佣|培训|朝廷赞助|御印|御玺|釉彩盘|浸釉缸|五人|超放|超容量|陶车坊|纹饰坊/;
const BANNED_EN = /\b(?:odds|chance|probability|ladder|preview|expected)\b|cards (?:left|remaining)|left in the deck/i;
const BANNED_ZH = /概率|几率|余张|预估|预览|剩余火牌|牌堆剩余/;
const FIRE_DECK_COUNT_EN = /Fire deck\W{0,3}\d|\d+\s+(?:Fire )?cards? (?:in|left in) the Fire deck|Fire cards? (?:left|remaining)/i;
const FIRE_DECK_COUNT_ZH = /窑火牌堆(?:余|剩余?|共|还有|[：:（(]|\s)*\d/;
const HEAT_VALUE_EN = /Actual Heat|Heat difference|heat \d|\bHeat [−+-]?\d/i;
const HEAT_VALUE_ZH = /实际火候|火候差|火候[−+-]?\d/;
const HAN = "\\u4e00-\\u9fff";

/** §6.3 on one Chinese text node: full-width punctuation next to Chinese, `／`, `……`, no `＋`. */
function zhPunctuationProblems(text: string): string[] {
  const found: string[] = [];
  if (new RegExp(`[${HAN}][,;:!?]|[,;:!?][${HAN}]`).test(text)) found.push("half-width punctuation next to Chinese");
  if (new RegExp(`[${HAN}]/|/[${HAN}]`).test(text)) found.push("ASCII slash next to Chinese; use ／");
  if (/(?<!…)…(?!…)/.test(text)) found.push("single …; use ……");
  if (text.includes("＋")) found.push("full-width plus");
  return found;
}

function dataAttributes(html: string): string[] {
  return [...html.matchAll(/\sdata-[\w-]+="[^"]*"/g)].map((match) => match[0]);
}

describe("detectors", () => {
  it("catch what they are for", () => {
    expect(D7_EN.test("Unlocked by Prepared Clay")).toBe(true);
    expect(D7_ZH.test("工位已解锁")).toBe(true);
    expect(D7_ZH.test("封工位")).toBe(true);
    expect(BANNED_EN.test("3 cards left")).toBe(true);
    expect(BANNED_ZH.test("剩余火牌3张")).toBe(true);
    expect(FIRE_DECK_COUNT_EN.test("Fire deck: 9")).toBe(true);
    expect(FIRE_DECK_COUNT_ZH.test("窑火牌堆：9")).toBe(true);
    expect(FIRE_DECK_COUNT_ZH.test("窑火牌堆余9张")).toBe(true);
    expect(FIRE_DECK_COUNT_ZH.test("另翻1张窑火牌代原牌重算")).toBe(false);
    expect(FIRE_DECK_COUNT_ZH.test("私看窑火牌堆顶1张")).toBe(false);
    expect(HEAT_VALUE_EN.test("Actual Heat 3")).toBe(true);
    expect(HEAT_VALUE_ZH.test("火候+1")).toBe(true);
    expect(zhPunctuationProblems("泥,柴")).not.toEqual([]);
    expect(zhPunctuationProblems("泥／柴")).toEqual([]);
    expect(withoutRulesPanels('<p>a</p><div class="rd" data-rules="tech"><p>Actual Heat</p><div>x</div></div><p>b</p>')).toBe("<p>a</p><p>b</p>");
  });
});

describe("rendered text of the full GameScreen (§9.2)", () => {
  it.each(allFixtures().map((entry) => [entry.id] as const))("%s", (id) => {
    const before = structuredClone(fixture(id).playerView);
    const en = renderScreen(fixtureSource(id), { locale: "en" });
    const zh = renderScreen(fixtureSource(id), { locale: "zh-CN" });
    expect(isDeepStrictEqual(fixture(id).playerView, before), "rendering leaves the view unchanged").toBe(true);

    const problems: string[] = [];
    const scan = (locale: "en" | "zh", html: string) => {
      const all = perceivable(html);
      const outsidePanels = perceivable(withoutRulesPanels(html)).join("\n");
      for (const text of all) {
        if (locale === "en" ? D7_EN.test(text) : D7_ZH.test(text)) problems.push(`${locale} D7: ${text}`);
        if (locale === "en" ? OBSOLETE_EN.test(text) : OBSOLETE_ZH.test(text)) problems.push(`${locale} obsolete: ${text}`);
        if (locale === "en" ? BANNED_EN.test(text) : BANNED_ZH.test(text)) problems.push(`${locale} D3/D4 word: ${text}`);
        // "ledger" only as the Fuel Ledger's name (its Chinese name, 柴簿, is the only use of 柴簿).
        if (locale === "en" && /ledger/i.test(text.replace(/Fuel Ledger/g, ""))) problems.push(`en ledger outside the Fuel Ledger name: ${text}`);
        if (locale === "zh") for (const problem of zhPunctuationProblems(text)) problems.push(`zh punctuation (${problem}): ${text}`);
        if (/\bc\d+\b/.test(text)) problems.push(`${locale} ceramic ID: ${text}`);
        if (/\b[pP]\d+:(?:shifu|apprentice)/.test(text)) problems.push(`${locale} worker ID: ${text}`);
      }
      if (locale === "en" ? FIRE_DECK_COUNT_EN.test(outsidePanels) : FIRE_DECK_COUNT_ZH.test(outsidePanels)) problems.push(`${locale} D4 Fire-deck count`);
      for (const text of pieceTexts(html)) if (locale === "en" ? HEAT_VALUE_EN.test(text) : HEAT_VALUE_ZH.test(text)) problems.push(`${locale} D3 heat on a piece: ${text}`);
      for (const secret of secretIds(id)) if (new RegExp(`\\b${secret}\\b`).test(html)) problems.push(`${locale} secret ${secret}`);
    };
    scan("en", en);
    scan("zh", zh);
    expect([...new Set(problems)]).toEqual([]);
    expect(dataAttributes(zh), "stable data-* IDs in both languages").toEqual(dataAttributes(en));
  });
});
