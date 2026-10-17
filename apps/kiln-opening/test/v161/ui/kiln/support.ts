/**
 * Helpers for B3's kiln, firing and results tests (owner: B3): markup slicing and the expected
 * rules-details text of a component (D10).
 */
import { expect } from "vitest";
import type { KilnId, Recognition, TechId } from "../../../../src/game/index.ts";
import { kilnText, recognitionMilestones, rulesClarifications, techText } from "../../../../src/app/i18n/content.ts";
import type { ClarificationText, RulesRef } from "../../../../src/app/i18n/content.ts";
import type { Locale } from "../../../../src/app/i18n/translator.ts";

export { activeKilnSpaces, firingRecapView, firingStageView, kilnLayout, settersMarkOptions } from "../../../../src/game/index.ts";

/** React's text escaping (`renderToStaticMarkup`). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

/** Text nodes plus `aria-label`, `title` and `alt` values: what a player can perceive. */
export function perceivable(html: string): string {
  const attributes = [...html.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((match) => match[1]);
  const text = html.replace(/<[^>]*>/g, " ");
  return [text, ...attributes].join(" ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, "\"");
}

/** The outer HTML of the first element whose opening tag matches `opening` (balanced by tag name). */
export function elementAt(html: string, opening: RegExp): string {
  const start = html.search(opening);
  if (start < 0) throw new Error(`no element ${String(opening)}`);
  const tag = /^<(\w+)/.exec(html.slice(start))?.[1];
  if (tag === undefined) throw new Error("not a tag");
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match !== null; match = pattern.exec(html)) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  return html.slice(start);
}

/** The markup without the rules-details panels (their rulebook text is not game state). */
export function withoutRulesPanels(html: string): string {
  let out = html;
  for (let index = out.indexOf('<div class="rd"'); index >= 0; index = out.indexOf('<div class="rd"')) {
    const panel = elementAt(out.slice(index), /<div class="rd"/);
    out = out.slice(0, index) + out.slice(index + panel.length);
  }
  return out;
}

/** One Shared Kiln space cell (div or target button). */
export function spaceCell(html: string, spaceId: string): string {
  return elementAt(html, new RegExp(`<(?:div|button)[^>]*data-space="${spaceId}"`));
}

/** What a component's rules-details panel must contain (D10). */
/** What a component's rules details must show: its full rule and its clarifications, as text. */
export interface RulesCheck {
  texts: string[];
}

/** The panel shows the full rule and the clarifications only (owner review, 2026-10-17): no card text, no source labels. */
function checkOf(_short: string | null, full: string | null, clarifications: readonly ClarificationText[], _locale: Locale): RulesCheck {
  return { texts: [...(full === null ? [] : [full]), ...clarifications.map((item) => item.text)] };
}

const clarificationsOf = (ref: RulesRef, locale: Locale) => rulesClarifications(ref, locale);

export const techRulesCheck = (id: TechId, locale: Locale): RulesCheck => {
  const text = techText(id, locale);
  return checkOf(text.short, text.ability, clarificationsOf({ kind: "tech", id }, locale), locale);
};
export const kilnRulesCheck = (id: KilnId, locale: Locale): RulesCheck => {
  const text = kilnText(id, locale);
  return checkOf(text.short, text.ability, clarificationsOf({ kind: "kiln", id }, locale), locale);
};
export const milestoneRulesCheck = (space: Recognition, locale: Locale): RulesCheck => {
  const milestone = recognitionMilestones(locale).find((entry) => entry.space === space);
  return checkOf(null, milestone?.reward ?? null, clarificationsOf({ kind: "recognition", space }, locale), locale);
};

/** Asserts the markup contains every text and source label of a rules check. */
export function tagged(html: string, check: RulesCheck): void {
  for (const text of check.texts) expect(html, text).toContain(escapeHtml(text.trim()).split("\n")[0]);
  expect(html).not.toMatch(/Source:|出处：/);
}
