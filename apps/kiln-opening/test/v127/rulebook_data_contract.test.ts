import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_LOCATION_PRICES,
  KILN_DEFINITIONS,
  LOCATION_DEFINITIONS,
  MAIN_ORDERS,
  STARTING_ORDERS,
  STARTING_TECHNIQUES,
  TECHNIQUES,
  TECHNIQUE_DEFINITIONS,
} from "../../src/game/index.ts";

const EN_SOURCE = readFileSync(
  join(import.meta.dirname, "../../docs/KILN_OPENING_v1.4_EN_SOURCE.md"),
  "utf8",
);
const OWNER_AMENDMENTS = readFileSync(
  join(import.meta.dirname, "../../docs/RULEBOOK_AUDIT_V1.4.md"),
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

describe("V1.4 checked-in data matches the adopted English rulebook", () => {
  it("records original provenance and the corrected current source checksum", () => {
    const currentDigest = createHash("sha256").update(EN_SOURCE).digest("hex");
    expect(OWNER_AMENDMENTS).toContain(`Current amended checked-in SHA-256: \`${currentDigest}\``);
    expect(OWNER_AMENDMENTS).toContain("Original SHA-256: `ace7e4ced95d82a259da504a11c6021626fad626da0a88d47a2ad457b821983c`");
  });

  it("records the approved 5-Coin Court cost and Glaze-only Crackle substitution", () => {
    expect(ACTION_LOCATION_PRICES.courtPatronageCoins).toBe(5);
    expect(EN_SOURCE).toContain("| Any worker | Pay **5 Coins** to advance your Imperial Recognition");
    const court = LOCATION_DEFINITIONS.court_patronage;
    expect(court.apprentice).toContain("Pay 5 Coins");
    expect(court.shifu).toContain("Pay 5 Coins");
    expect(court.apprenticeZh).toContain("支付5铜钱");
    expect(court.shifuZh).toContain("支付5铜钱");
    expect(KILN_DEFINITIONS.GE.ability).toContain("any one Glaze for that Order");
    expect(KILN_DEFINITIONS.GE.ability).toContain("does not provide a wild Decoration");
    expect(KILN_DEFINITIONS.GE.abilityZh).toContain("任意一种釉色");
    expect(KILN_DEFINITIONS.GE.abilityZh).toContain("开片不能替代纹饰");
    expect(OWNER_AMENDMENTS).toContain("### 7. Imperial Court cost and Ge Glaze substitution");
  });

  it("follows the replacement rulebook's Measuring Calipers and Dipping Vats", () => {
    expect(TECHNIQUE_DEFINITIONS["T02"]!.ability).toContain("if you have another vessel in your workshop, gain 2 Coins");
    expect(TECHNIQUE_DEFINITIONS["T02"]!.ability).not.toContain("different Shape");
    expect(TECHNIQUE_DEFINITIONS["T03"]!).toMatchObject({
      name: "Dipping Vats",
      nameZh: "浸釉缸",
      discipline: "forming",
      cost: 2,
      oncePerRound: true,
    });
    expect(TECHNIQUE_DEFINITIONS["T03"]!.ability).toContain("the Plain ceramics loaded by that action pay no Glazing cost");
    expect(EN_SOURCE).toContain("including one formed by the same action");
    expect(EN_SOURCE).toContain("**Dipping Vats** applies to one Kiln Yard action per round and covers every Plain ceramic that action loads, in either kiln");
    expect(EN_SOURCE).toContain("do not trigger **Kiln Tending** or **Dipping Vats**");
    expect(EN_SOURCE).toContain("**Applying a Glaze costs 1 Coin per ceramic** before waivers.");
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
      const ability = en[advanced ? 2 : 1]!;
      expect(ability, `${technique.id} English ability`).toBe(clean(technique.ability));
      expect(technique.abilityZh.length).toBeGreaterThan(0);
      if (advanced) {
        expect(Number(en[1]), `${technique.id} English cost`).toBe(technique.cost);
      }
    }
  });

  it("keeps every Kiln Tradition's bilingual name and full ability in the current source", () => {
    for (const kiln of Object.values(KILN_DEFINITIONS)) {
      const heading = `## ${kiln.name} / ${kiln.nameZh} — ${kiln.abilityName}`;
      expect(EN_SOURCE).toContain(heading);
      const body = EN_SOURCE.split(`${heading}\n`)[1]!.split("\n#")[0]!;
      const ability = body.split("\n").map((line) => line.replace(/^- /, "")).join(" ");
      expect(clean(kiln.ability)).toBe(clean(ability));
      expect(kiln.abilityZh.length).toBeGreaterThan(0);
    }
  });
});
