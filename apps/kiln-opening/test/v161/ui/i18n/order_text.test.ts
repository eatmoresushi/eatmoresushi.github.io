import { describe, expect, it } from "vitest";
import { ORDER_IDS, ORDERS } from "../../../../src/game/index.ts";
import { orderQualityLine } from "../../../../src/app/i18n/orderText.ts";
import { orderRequirements } from "../../../../src/app/i18n/content.ts";
import { glossaryTableAfter } from "../../support/glossary.ts";

/**
 * §5 gap 2 (ports test/v127 `tabletop_order_quality`): the Order quality line in the glossary §5.1
 * form, from `minQuality`, the slot count and `at_least_n_quality` relations.
 */
describe("Order quality line", () => {
  it("matches the glossary §5.2 examples exactly", () => {
    const examples = glossaryTableAfter("### 5.2 示例");
    expect(examples.map(([id]) => id)).toEqual(["S01", "S13", "O14", "O31", "O39", "O47"]);
    for (const [id = "", , quality] of examples) {
      expect(orderQualityLine(id as keyof typeof ORDERS, "zh-CN"), id).toBe(quality);
    }
  });

  it("uses the glossary §5.1 English forms", () => {
    expect(orderQualityLine("S01", "en")).toBe("Standard+");
    expect(orderQualityLine("O14", "en")).toBe("Fine+");
    expect(orderQualityLine("O11", "en")).toBe("Masterpiece");
    expect(orderQualityLine("O11", "zh-CN")).toBe("臻品");
    expect(orderQualityLine("O31", "en")).toBe("Fine+ each");
    expect(orderQualityLine("O32", "en")).toBe("Fine+ each; ≥1 Masterpiece");
    expect(orderQualityLine("O32", "zh-CN")).toBe("均上品以上，至少1件臻品");
    expect(orderQualityLine("O43", "en")).toBe("Standard+ all");
    expect(orderQualityLine("O47", "en")).toBe("Fine+ all; ≥2 Masterpieces");
    expect(orderQualityLine("O47", "zh-CN")).toBe("均上品以上，至少2件臻品");
  });

  it.each(ORDER_IDS)("%s renders requirements and quality in both languages", (id) => {
    for (const locale of ["en", "zh-CN"] as const) {
      const line = orderQualityLine(id, locale);
      const requirements = orderRequirements(id, locale);
      expect(line, `${id} ${locale}`).not.toMatch(/[{}]/);
      expect(line.trim(), `${id} ${locale}`).not.toBe("");
      expect(requirements.trim(), `${id} ${locale}`).not.toBe("");
    }
    expect(orderRequirements(id, "zh-CN")).toBe(ORDERS[id].requirementsZh);
  });
});
