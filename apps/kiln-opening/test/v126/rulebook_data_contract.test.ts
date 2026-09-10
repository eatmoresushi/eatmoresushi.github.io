import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KILN_DEFINITIONS,
  MAIN_ORDERS,
  STARTING_ORDERS,
  STARTING_TECHNIQUES,
  TECHNIQUES,
} from "../../src/game/index.ts";

const EN_SOURCE = readFileSync(
  join(import.meta.dirname, "../../docs/KILN_OPENING_v1.2.6_EN_SOURCE.md"),
  "utf8",
);
const ZH_SOURCE = readFileSync(
  join(import.meta.dirname, "../../docs/KILN_OPENING_v1.2.6_ZH_SOURCE.md"),
  "utf8",
);

function clean(value: string): string {
  return value.replaceAll("**", "").replace(/\s+/g, " ").trim();
}

function cleanChinese(value: string): string {
  return clean(value).replaceAll(" ", "");
}

function tableCells(line: string): string[] {
  return line.split("|").slice(1, -1).map(clean);
}

function orderRows(source: string): Map<string, string[]> {
  return new Map(source.split("\n")
    .filter((line) => /^\|\s*[SO]\d{2}\s*\|/.test(line))
    .map((line) => {
      const cells = tableCells(line);
      return [cells[0]!, cells] as const;
    }));
}

function namedTableRow(source: string, name: string): string[] {
  const row = source.split("\n").find((line) => {
    const cells = tableCells(line);
    return cells[0] === name;
  });
  if (row === undefined) throw new Error(`Missing rulebook table row for ${name}`);
  return tableCells(row);
}

describe("V1.2.6 checked-in data matches both adopted rulebooks", () => {
  it("matches every English and Chinese Order row exactly", () => {
    const english = orderRows(EN_SOURCE);
    const chinese = orderRows(ZH_SOURCE);
    const orders = [...STARTING_ORDERS, ...MAIN_ORDERS];
    expect(english.size).toBe(64);
    expect(chinese.size).toBe(64);

    for (const order of orders) {
      const en = english.get(order.id);
      const zh = chinese.get(order.id);
      expect(en, `${order.id} English row`).toBeDefined();
      expect(zh, `${order.id} Chinese row`).toBeDefined();
      if (en === undefined || zh === undefined) continue;

      expect(en[1], `${order.id} English requirements`).toBe(order.requirements);
      expect(zh[1], `${order.id} Chinese requirements`).toBe(order.requirementsZh);
      expect(Number(en[3]), `${order.id} VP`).toBe(order.vp);
      expect(Number(en[4]), `${order.id} Coins`).toBe(order.coins);
      expect((en[5]?.match(/👑/g) ?? []).length, `${order.id} Crowns`).toBe(order.crowns);
      const quality = order.minQuality === "standard"
        ? "Standard"
        : order.minQuality === "fine"
          ? "Fine"
          : "Masterpiece";
      expect(en[2]?.startsWith(quality), `${order.id} minimum Quality`).toBe(true);
    }
  });

  it("matches all four Starting Tech and fifteen Advanced Tech table rows", () => {
    for (const technique of [...STARTING_TECHNIQUES, ...TECHNIQUES]) {
      const en = namedTableRow(EN_SOURCE, technique.name);
      const zh = namedTableRow(ZH_SOURCE, technique.nameZh);
      const advanced = "cost" in technique;
      expect(en[advanced ? 2 : 1], `${technique.id} English ability`).toBe(clean(technique.ability));
      expect(zh[advanced ? 2 : 1], `${technique.id} Chinese ability`).toBe(clean(technique.abilityZh));
      if (advanced) {
        expect(Number(en[1]), `${technique.id} English cost`).toBe(technique.cost);
        expect(Number(zh[1]), `${technique.id} Chinese cost`).toBe(technique.cost);
      }
    }
  });

  it("keeps every Kiln Tradition's bilingual name and full ability in the sources", () => {
    const normalizedEnglish = clean(EN_SOURCE);
    const normalizedChinese = cleanChinese(ZH_SOURCE);
    for (const kiln of Object.values(KILN_DEFINITIONS)) {
      expect(normalizedEnglish).toContain(clean(`${kiln.name} / ${kiln.nameZh} — ${kiln.abilityName}`));
      expect(normalizedEnglish).toContain(clean(kiln.ability));
      expect(normalizedChinese).toContain(cleanChinese(`${kiln.nameZh} — ${kiln.abilityNameZh}`));
      expect(normalizedChinese).toContain(cleanChinese(kiln.abilityZh));
    }
  });
});
