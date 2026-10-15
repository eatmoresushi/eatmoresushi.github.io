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

/** A list: `、` in Chinese, `, ` in English (glossary §1.2). */
export function list(items: readonly string[], locale: Locale): string {
  return items.join(locale === "zh-CN" ? "、" : ", ");
}
