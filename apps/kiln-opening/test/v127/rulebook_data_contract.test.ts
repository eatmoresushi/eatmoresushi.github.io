import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
  join(import.meta.dirname, "../../docs/KILN_OPENING_v1.2.7_EN_SOURCE.md"),
  "utf8",
);
const OWNER_AMENDMENTS = readFileSync(
  join(import.meta.dirname, "../../docs/RULEBOOK_AUDIT_V1.2.7.md"),
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

describe("V1.2.7 checked-in data matches the adopted English rulebook", () => {
  it("records the original provenance and separate current checksum for the owner-amended rulebook", () => {
    const currentDigest = createHash("sha256").update(EN_SOURCE).digest("hex");
    const originalDigest = "a0ec9271fba9be3583623d003683865aa649fdb39b288566c503da2b5c887253";
    const currentRecord = OWNER_AMENDMENTS.split("\n").find((line) => line.startsWith("- Current checked-in `KILN_OPENING_v1.2.7_EN_SOURCE.md`"));
    const originalRecord = OWNER_AMENDMENTS.split("\n").find((line) => line.startsWith("- Original supplied `KILN_OPENING_v1.2.7_EN_SOURCE.md`"));
    expect(currentRecord).toContain(`SHA-256 \`${currentDigest}\``);
    expect(originalRecord).toContain(`SHA-256 \`${originalDigest}\``);
    expect(currentDigest).not.toBe(originalDigest);
    const componentSource = readFileSync(join(import.meta.dirname, "../../docs/KILN_OPENING_v1.2.7_COMPONENT_TEXT_SOURCE.md"));
    expect(createHash("sha256").update(componentSource).digest("hex"))
      .toBe("8679fb6c70e8763ff98abfc95866faefc29513ce04222c95d5ea79d8bf7d6db1");
  });

  it("matches every English Order row exactly", () => {
    const english = orderRows(EN_SOURCE);
    const orders = [...STARTING_ORDERS, ...MAIN_ORDERS];
    expect(english.size).toBe(56);

    for (const order of orders) {
      const en = english.get(order.id);
      expect(en, `${order.id} English row`).toBeDefined();
      if (en === undefined) continue;

      expect(en[1], `${order.id} English requirements`).toBe(order.requirements);
      expect(Number(en[3]), `${order.id} VP`).toBe(order.vp);
      expect(Number(en[4]), `${order.id} Coins`).toBe(order.coins);
      expect((en[5]?.match(/👑/g) ?? []).length, `${order.id} Crowns`).toBe(order.crowns);
      const quality = order.minQuality === "standard"
        ? "Standard"
        : order.minQuality === "fine"
          ? "Fine"
          : "Masterpiece";
      expect(en[2]?.startsWith(quality), `${order.id} minimum Quality`).toBe(true);
      const minimumMasterpieces = Number(en[2]?.match(/≥(\d+) Masterpiece/)?.[1] ?? 0);
      const qualityRelations = (order.relations ?? []).filter((relation) => relation.type === "at_least_n_quality");
      expect(qualityRelations, `${order.id} additional Quality requirements`).toEqual(minimumMasterpieces === 0
        ? []
        : [{ type: "at_least_n_quality", quality: "masterpiece", count: minimumMasterpieces }]);
    }
  });

  it("matches all four Starting Tech and fifteen Advanced Tech table rows", () => {
    for (const technique of [...STARTING_TECHNIQUES, ...TECHNIQUES]) {
      const en = namedTableRow(EN_SOURCE, technique.name);
      const advanced = "cost" in technique;
      let ability = en[advanced ? 2 : 1]!;
      const stack = "This reduction stacks with the Shifu’s two-vessel discount.";
      if (technique.id === "T02") ability = ability.replace(stack, "");
      if (technique.id === "T01") ability += ` ${stack}`;
      expect(ability, `${technique.id} English ability`).toBe(clean(technique.ability));
      expect(technique.abilityZh.length).toBeGreaterThan(0);
      if (advanced) {
        expect(Number(en[1]), `${technique.id} English cost`).toBe(technique.cost);
      }
    }
  });

  it("keeps every Kiln Tradition's bilingual name and full ability in the sources or explicit owner amendment", () => {
    const normalizedEnglish = clean(EN_SOURCE);
    const geAmendment = clean(OWNER_AMENDMENTS.split("<!-- GE_OWNER_ABILITY_START -->")[1]!.split("<!-- GE_OWNER_ABILITY_END -->")[0]!);
    for (const kiln of Object.values(KILN_DEFINITIONS)) {
      expect(normalizedEnglish).toContain(clean(`${kiln.name} / ${kiln.nameZh} — ${kiln.abilityName}`));
      if (kiln.id === "GE") expect(clean(kiln.ability)).toBe(geAmendment);
      else expect(normalizedEnglish).toContain(clean(kiln.ability));
    }
  });
});
