/**
 * Shape costs (L321–327) and Vessel cards (L80, L329): 10 cards per Shape, not a gameplay
 * limit; a proxy is used when a Shape's cards are all in use; a returned card goes back to its
 * Shape's supply and a proxy simply vanishes.
 */

import { describe, expect, it } from "vitest";
import { GAME_CONFIG, SHAPES, shapeClay } from "../../../src/game/content.ts";
import { ceramic, ceramicsOf } from "../../../src/game/state.ts";
import type { CeramicSpec } from "./support/fixtures.ts";
import type { GameAction, Shape } from "../../../src/game/types.ts";
import { table, types } from "./workshop_support.ts";

const RICH = { resources: { clay: 20, wood: 0, coins: 20 } };
const fd = (workerId: string, shape: Shape, extra: Partial<Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>> = {}): GameAction => ({
  type: "PLACE_FORM_DECORATE",
  workerId,
  vessels: [{ shape, decoration: "plain" }],
  ...extra,
});

describe("Shape Clay costs (L321–327)", () => {
  it.each([
    ["bowl", 1],
    ["plate", 1],
    ["washer", 1],
    ["vase", 2],
    ["censer", 2],
  ] as const)("a %s costs %i Clay to form", (shape, clay) => {
    expect(shapeClay(shape)).toBe(clay);
    const t = table({ players: [RICH, {}] });
    const events = t.act("p1", fd("p1:apprentice:1", shape));
    expect(events[1]).toMatchObject({ type: "RESOURCES_CHANGED", clay: -clay, reason: "form_decorate" });
    expect(ceramic(t.state, "c1")).toMatchObject({ shape, vesselInstanceId: `${shape}-01` });
  });
});

describe("Vessel cards are not a limit (L80, L329)", () => {
  it("10 cards per Shape; forming takes the next card in the supply", () => {
    const t = table({ players: [RICH, {}] });
    expect(SHAPES.map((shape) => t.state.vesselSupply[shape].length)).toEqual(SHAPES.map(() => GAME_CONFIG.shapeSupplyEach));
    t.act("p1", fd("p1:shifu", "plate", { vessels: [{ shape: "plate", decoration: "plain" }, { shape: "plate", decoration: "carved" }] }));
    expect(ceramicsOf(t.state, "p1", "shaped").map((c) => c.vesselInstanceId)).toEqual(["plate-01", "plate-02"]);
    expect(t.state.vesselSupply.plate[0]).toBe("plate-03");
  });

  it("with all 10 cards of a Shape in use, a proxy is formed instead", () => {
    const tenBowls: CeramicSpec[] = Array.from({ length: 10 }, (_, index) => ({
      owner: index % 2 === 0 ? "p1" : "p2",
      shape: "bowl",
      stage: "finished",
      glaze: "white",
      quality: "standard",
    }));
    const t = table({ players: [{ ...RICH, kilnId: "DI" }, {}], ceramics: tenBowls });
    expect(t.state.vesselSupply.bowl).toEqual([]);
    const events = t.act("p1", fd("p1:apprentice:1", "bowl", { dingExtra: { copyOfVesselIndex: 0, decoration: "painted" } }));
    expect(types(events).filter((type) => type === "CERAMIC_FORMED")).toHaveLength(2);
    expect(ceramic(t.state, "c11")).toMatchObject({ shape: "bowl", vesselInstanceId: "bowl-proxy-1", formedBy: "form_decorate" });
    expect(ceramic(t.state, "c12")).toMatchObject({ shape: "bowl", vesselInstanceId: "bowl-proxy-2", formedBy: "ding_extra" });
    expect(t.state.nextProxySequence).toBe(3);
    expect(t.state.vesselSupply.bowl).toEqual([]);
  });

  it("Prepared Clay also uses the supply, then a proxy", () => {
    const tenVases: CeramicSpec[] = Array.from({ length: 10 }, () => ({ owner: "p2", shape: "vase", stage: "shaped" }));
    const t = table({ players: [{ ...RICH, techs: ["T17"] }, {}], ceramics: tenVases });
    t.act("p1", { type: "PLACE_MATERIALS_YARD", workerId: "p1:apprentice:1", clay: 3, wood: 0, preparedClay: { shape: "vase", decoration: "plain" } });
    expect(ceramic(t.state, "c11")).toMatchObject({ shape: "vase", vesselInstanceId: "vase-proxy-1", formedBy: "prepared_clay" });
  });

  it("Reworking Table returns the card to its supply, kept in order, and takes the new Shape's card (L617)", () => {
    const t = table({
      players: [{ ...RICH, techs: ["T05"] }, {}],
      ceramics: [
        { owner: "p1", shape: "censer", stage: "shaped" },
        { owner: "p1", shape: "censer", stage: "shaped" },
        { owner: "p2", shape: "censer", stage: "shaped" },
      ],
    });
    expect(t.state.vesselSupply.censer[0]).toBe("censer-04");
    t.act("p1", {
      type: "PLACE_GLAZE_LOAD",
      workerId: "p1:apprentice:1",
      loads: [{ ceramicId: "c2", glaze: "white", destination: { kiln: "shared", spaceId: "low_1" }, reworkShape: "washer" }],
    });
    expect(t.state.vesselSupply.censer.slice(0, 2)).toEqual(["censer-02", "censer-04"]);
    expect(ceramic(t.state, "c2")).toMatchObject({ shape: "washer", vesselInstanceId: "washer-01" });
  });
});
