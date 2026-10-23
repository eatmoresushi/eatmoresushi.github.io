import { describe, expect, it } from "vitest";
import { allStrings, bareText } from "./catalog_support.ts";

/**
 * §6.4 `zh_punctuation` (glossary §1.2–1.3, §6.3): full-width punctuation next to Chinese, no
 * space between a number or placeholder and a Chinese unit, `／` for compact alternatives,
 * `……` never `…`, U+2212 before a digit, `「」` around names.
 */
const HAN = "\\u4e00-\\u9fff";

function problems(text: string): string[] {
  const found: string[] = [];
  const bare = bareText(text);
  if (new RegExp(`[${HAN}][,;:()!?]|[,;:()!?][${HAN}]`).test(bare)) found.push("half-width punctuation next to Chinese");
  if (/[,;!?]/.test(bare)) found.push("half-width , ; ! ?");
  if (/(\d|\})\s+[一-鿿]/.test(text)) found.push("space between a number and a Chinese unit");
  if (/[一-鿿]\s+(\d|\{)/.test(text)) found.push("space between Chinese and a number");
  if (new RegExp(`[${HAN}]/|/[${HAN}]`).test(bare)) found.push("ASCII slash; use ／");
  if (/(?<!…)…(?!…)/.test(text)) found.push("single …; use ……");
  if (/(^|[^\w])-\d|-\{/.test(text)) found.push("ASCII minus; use −");
  if (text.includes("＋")) found.push("full-width plus");
  if (/["']/.test(bare)) found.push("ASCII quotes; use 「」 or “”");
  return found;
}

describe("Chinese punctuation and numbers", () => {
  const zh = allStrings().filter((entry) => entry.locale === "zh");

  it.each(zh.map((entry) => [entry.id, entry.text] as const))("%s", (_, text) => {
    expect(problems(text)).toEqual([]);
  });

  it("catches the common mistakes", () => {
    expect(problems("得2 泥")).not.toEqual([]);
    expect(problems("等候{name}…")).not.toEqual([]);
    expect(problems("泥,柴")).not.toEqual([]);
    expect(problems("-1铜钱")).not.toEqual([]);
    expect(problems("泥/柴")).not.toEqual([]);
    expect(problems("得{n}{res}")).toEqual([]);
    expect(problems("第<b>{n}</b>轮／共{total}轮")).toEqual([]);
  });
});
