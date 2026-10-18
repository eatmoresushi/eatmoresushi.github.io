/**
 * List formatting (`i18n/format.ts`, glossary §1.2): `list` for lists after a colon or a label,
 * `andList` for lists inside a sentence ("A and B"; 「A与B」, as the rulebook writes 压火与添柴).
 */
import { describe, expect, it } from "vitest";
import { andList, list } from "../../../../src/app/i18n/format.ts";

describe("list and andList", () => {
  it("list joins with a comma in English and 、 in Chinese", () => {
    expect(list(["O11", "O33"], "en")).toBe("O11, O33");
    expect(list(["O11", "O33"], "zh-CN")).toBe("O11、O33");
  });

  it("andList joins the last two items with “and” / 与 inside a sentence", () => {
    expect(andList([], "en")).toBe("");
    expect(andList(["O11"], "en")).toBe("O11");
    expect(andList(["O11"], "zh-CN")).toBe("O11");
    expect(andList(["Bank the Fire", "Stoke the Fire"], "en")).toBe("Bank the Fire and Stoke the Fire");
    expect(andList(["压火", "添柴"], "zh-CN")).toBe("压火与添柴");
    expect(andList(["Lin", "Wen", "Zhao"], "en")).toBe("Lin, Wen and Zhao");
    expect(andList(["Lin", "Wen", "Zhao"], "zh-CN")).toBe("Lin、Wen与Zhao");
  });
});
