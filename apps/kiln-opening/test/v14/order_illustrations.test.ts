import { describe, expect, it } from "vitest";
import { MAIN_ORDERS, STARTING_ORDERS, matchesOrder } from "../../src/game/index.ts";
import { orderIllustrationCeramics } from "../../src/ui/orderIllustrations.ts";

describe("Order ceramic illustrations", () => {
  it.each([...STARTING_ORDERS, ...MAIN_ORDERS])("illustrates a legal ceramic group for $id", (order) => {
    const group = orderIllustrationCeramics(order.id);
    expect(group).toHaveLength(order.ceramics.length);
    expect(matchesOrder(order, group)).toBe(true);
    expect(group.every((ceramic) => !ceramic.crackle)).toBe(true);
    expect(orderIllustrationCeramics(order.id)).toBe(group);
  });

  it("shows O20's Bowl, Moon White glaze and Carved decoration together", () => {
    expect(orderIllustrationCeramics("O20")).toEqual([
      expect.objectContaining({ shape: "bowl", glaze: "moon_white", decoration: "carved" }),
    ]);
  });

  it("shows O28's same Shape with Celadon and Moon White", () => {
    const group = orderIllustrationCeramics("O28");
    expect(new Set(group.map((ceramic) => ceramic.shape)).size).toBe(1);
    expect(group.map((ceramic) => ceramic.glaze).sort()).toEqual(["celadon", "moon_white"]);
  });

  it("shows O34's different Shapes and Glazes with the same non-Plain Decoration", () => {
    const group = orderIllustrationCeramics("O34");
    expect(new Set(group.map((ceramic) => ceramic.shape)).size).toBe(2);
    expect(new Set(group.map((ceramic) => ceramic.glaze)).size).toBe(2);
    expect(new Set(group.map((ceramic) => ceramic.decoration)).size).toBe(1);
    expect(group[0]?.decoration).not.toBe("plain");
  });

  it("shows O35's Bowl and Plate both in Celadon", () => {
    const group = orderIllustrationCeramics("O35");
    expect(group.map((ceramic) => ceramic.shape).sort()).toEqual(["bowl", "plate"]);
    expect(group.map((ceramic) => ceramic.glaze)).toEqual(["celadon", "celadon"]);
  });

  it("shows every required Shape, Glaze and Decoration on O46", () => {
    const group = orderIllustrationCeramics("O46");
    expect(group.map((ceramic) => ceramic.shape).sort()).toEqual(["censer", "plate", "vase"]);
    expect(group.map((ceramic) => ceramic.glaze).sort()).toEqual(["celadon", "grey_green", "moon_white"]);
    expect(group.map((ceramic) => ceramic.decoration).sort()).toEqual(["carved", "impressed", "painted"]);
  });

  it("shows three distinct Shapes, Glazes and Decorations on O47", () => {
    const group = orderIllustrationCeramics("O47");
    for (const attribute of ["shape", "glaze", "decoration"] as const) {
      expect(new Set(group.map((ceramic) => ceramic[attribute])).size).toBe(3);
    }
  });
});
