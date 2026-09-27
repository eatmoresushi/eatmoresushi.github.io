import { describe, expect, it } from "vitest";
import { DECORATIONS, MAIN_ORDERS, ORDER_DEFINITIONS, findGeGlazes, matchesOrder, matchesOrderWithGe, orderAdmitsRuBonus } from "../../src/game/index.ts";
import type { Decoration, FinishedCeramic, Glaze, Shape } from "../../src/game/index.ts";

function ceramic(id: string, shape: Shape, glaze: Glaze, decoration: Decoration): FinishedCeramic {
  return { id, ownerId: "P1", vesselInstanceId: id, stage: "finished", shape, glaze, decoration, quality: "masterpiece", firedInRound: 1 };
}

describe("V1.4 Glaze-agency Order constraints", () => {
  it.each(["O10", "O22"])("%s accepts all three specialised Decorations and excludes Plain", (id) => {
    for (const decoration of DECORATIONS) {
      expect(matchesOrder(ORDER_DEFINITIONS[id]!, [ceramic("a", "bowl", "celadon", decoration)]), decoration).toBe(decoration !== "plain");
    }
    expect(orderAdmitsRuBonus(ORDER_DEFINITIONS[id]!)).toBe(false);
  });

  it.each([
    ["O34", "bowl", "vase", "white", "celadon"],
    ["O37", "bowl", "censer", "grey_green", "celadon"],
    ["O42", "washer", "censer", "white", "celadon"],
  ] as const)("%s requires identical non-Plain Decorations", (id, first, second, firstGlaze, secondGlaze) => {
    for (const a of DECORATIONS) for (const b of DECORATIONS) {
      const selected = [ceramic("a", first, firstGlaze, a), ceramic("b", second, secondGlaze, b)];
      expect(matchesOrder(ORDER_DEFINITIONS[id]!, selected), `${a}/${b}`).toBe(a === b && a !== "plain");
    }
    expect(orderAdmitsRuBonus(ORDER_DEFINITIONS[id]!)).toBe(false);
  });

  it("O39 needs Painted plus a different Decoration, with Plain allowed", () => {
    for (const a of DECORATIONS) for (const b of DECORATIONS) {
      const selected = [ceramic("a", "vase", "moon_white", a), ceramic("b", "censer", "celadon", b)];
      expect(matchesOrder(ORDER_DEFINITIONS["O39"]!, selected), `${a}/${b}`).toBe(a !== b && (a === "painted" || b === "painted"));
    }
  });

  it("O43 and O44 enforce their named Glaze multisets independently from Shapes", () => {
    const a = ceramic("a", "bowl", "white", "plain");
    const b = ceramic("b", "plate", "celadon", "plain");
    const c = ceramic("c", "vase", "grey_green", "carved");
    expect(matchesOrder(ORDER_DEFINITIONS["O43"]!, [a, b, c])).toBe(true);
    expect(matchesOrder(ORDER_DEFINITIONS["O43"]!, [a, b, { ...c, glaze: "moon_white" }])).toBe(false);
    expect(matchesOrder(ORDER_DEFINITIONS["O43"]!, [a, b, { ...c, decoration: "plain" }])).toBe(false);
    expect(matchesOrder(ORDER_DEFINITIONS["O44"]!, [a, b, c])).toBe(false);
    expect(matchesOrder(ORDER_DEFINITIONS["O44"]!, [{ ...a, glaze: "moon_white" }, b, c])).toBe(true);
    expect(matchesOrder(ORDER_DEFINITIONS["O44"]!, [{ ...a, glaze: "moon_white" }, b, { ...c, glaze: "celadon" }])).toBe(false);
  });

  it("lets three Crackle ceramics make separate consistent Glaze substitutions for one Order", () => {
    const ceramics = [ceramic("a", "censer", "white", "carved"), ceramic("b", "plate", "white", "impressed"), ceramic("c", "vase", "white", "painted")].map((piece) => ({ ...piece, quality: "fine" as const, crackle: true }));
    expect(matchesOrder(ORDER_DEFINITIONS["O46"]!, ceramics)).toBe(false);
    const choices = findGeGlazes(ORDER_DEFINITIONS["O46"]!, ceramics);
    expect(choices).toHaveLength(3);
    expect(new Set(choices!.map(({ glaze }) => glaze))).toEqual(new Set(["celadon", "grey_green", "moon_white"]));
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O46"]!, ceramics, choices!)).toBe(true);
    expect(ceramics.every(({ glaze }) => glaze === "white")).toBe(true);
    expect(ceramics.map(({ decoration }) => decoration)).toEqual(["carved", "impressed", "painted"]);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O46"]!, ceramics.map((piece) => ({ ...piece, decoration: "plain" })), choices!)).toBe(false);
  });

  it("keeps the approved deck composition and allows Plain only where unrestricted", () => {
    expect(MAIN_ORDERS.map(({ crowns }) => crowns).reduce((counts, crowns) => { counts[crowns] = (counts[crowns] ?? 0) + 1; return counts; }, {} as Record<number, number>)).toEqual({ 0: 28, 1: 12, 2: 6, 3: 2 });
    const plain = ceramic("a", "bowl", "white", "plain");
    const painted = ceramic("b", "plate", "white", "painted");
    expect(matchesOrder(ORDER_DEFINITIONS["O25"]!, [plain, painted])).toBe(true);
    expect(matchesOrder(ORDER_DEFINITIONS["O25"]!, [plain, { ...painted, decoration: "plain" }])).toBe(false);
  });
});
