/**
 * Number and list formatting (UI_V1.6.1_ARCHITECTURE §6.3, glossary §1.2).
 *
 * Only numbers and lists live here. The wireframe's concatenating helpers (`resDelta`, `vpN`,
 * `paren`, `sp`) are not ported: every phrase is a whole catalogue template (`common.gainRes`,
 * `common.vpN`, …) with numbers as placeholders.
 */
import { formatNumberParam } from "./translator.ts";
import type { Locale } from "./translator.ts";

/** A number as shown in text: half-width digits, U+2212 for negatives. Style with `.num`. */
export function num(value: number): string {
  return formatNumberParam(value);
}

/** A signed modifier: `+1`, `−1` (U+2212), `0`. */
export function signed(value: number): string {
  if (value > 0) return `+${String(value)}`;
  if (value < 0) return `−${String(Math.abs(value))}`;
  return "0";
}

/** A range with an en dash: `0–5`. */
export function range(low: number, high: number): string {
  return `${num(low)}–${num(high)}`;
}

/** A list: `、` in Chinese, `, ` in English (glossary §1.2). For lists after a colon or a label. */
export function list(items: readonly string[], locale: Locale): string {
  return items.join(locale === "zh-CN" ? "、" : ", ");
}

/**
 * A list inside a sentence, its last two items joined by "and" / 与: "A and B", "A, B and C";
 * 「A与B」, 「A、B与C」 (the rulebook's 柴簿压火与柴簿添柴, 压火与添柴). Use `list` after a colon.
 */
export function andList(items: readonly string[], locale: Locale): string {
  if (items.length < 2) return items.join("");
  const zh = locale === "zh-CN";
  const head = items.slice(0, -1).join(zh ? "、" : ", ");
  return `${head}${zh ? "与" : " and "}${items[items.length - 1]!}`;
}
