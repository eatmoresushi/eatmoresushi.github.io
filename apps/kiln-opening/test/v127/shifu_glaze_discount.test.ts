import { describe, expect, it } from "vitest";
import { applyAction } from "../../src/game/index.ts";
import type { Decoration, GameAction, TechniqueId, WorkerKind } from "../../src/game/index.ts";
import { addShaped, addTechnique, expectError, mustResult, startedGame, workerId } from "./helpers.ts";

const cases: { name: string; worker: WorkerKind; decorations: Decoration[]; owned?: TechniqueId[]; use?: TechniqueId[]; cost: number }[] = [
  { name: "one Plain", worker: "shifu", decorations: ["plain"], cost: 1 },
  { name: "one Carved", worker: "shifu", decorations: ["carved"], cost: 2 },
  { name: "one Impressed", worker: "shifu", decorations: ["impressed"], cost: 2 },
  { name: "one Crackle", worker: "shifu", decorations: ["crackle"], cost: 2 },
  { name: "two Plain", worker: "shifu", decorations: ["plain", "plain"], cost: 1 },
  { name: "Plain plus Crackle", worker: "shifu", decorations: ["plain", "crackle"], cost: 2 },
  { name: "Crackle plus Plain", worker: "shifu", decorations: ["crackle", "plain"], cost: 2 },
  { name: "Carved plus Impressed", worker: "shifu", decorations: ["carved", "impressed"], cost: 3 },
  { name: "two Carved with one waiver", worker: "shifu", decorations: ["carved", "carved"], owned: ["T07"], use: ["T07"], cost: 1 },
  { name: "Carved plus Plain with a waiver", worker: "shifu", decorations: ["carved", "plain"], owned: ["T07"], use: ["T07"], cost: 0 },
  { name: "two different waivers clamped at zero", worker: "shifu", decorations: ["carved", "crackle"], owned: ["T07", "T09"], use: ["T07", "T09"], cost: 0 },
  { name: "declined waiver preserved", worker: "shifu", decorations: ["carved", "carved"], owned: ["T07"], cost: 3 },
  { name: "one waived Decoration", worker: "shifu", decorations: ["impressed"], owned: ["T08"], use: ["T08"], cost: 0 },
  { name: "Apprentice normal cost", worker: "apprentice", decorations: ["crackle"], cost: 2 },
  { name: "Apprentice waiver", worker: "apprentice", decorations: ["crackle"], owned: ["T09"], use: ["T09"], cost: 0 },
];

describe("Shifu Glaze & Decoration two-vessel discount", () => {
  it.each(cases)("charges $cost Coins for $name", ({ worker, decorations, owned = [], use = [], cost }) => {
    const { state, rng } = startedGame(2, 20_920);
    for (const id of owned) addTechnique(state, "P1", id);
    const ceramics = decorations.map(() => addShaped(state, "P1", "bowl"));
    const action: Extract<GameAction, { type: "GLAZE_CERAMICS" }> = {
      type: "GLAZE_CERAMICS",
      workerId: workerId(state, "P1", worker),
      selections: ceramics.map((ceramic, i) => ({ ceramicId: ceramic.id, glaze: "white", decoration: decorations[i]! })),
      useTechniqueIds: use,
    };
    if (cost > 0) {
      state.players["P1"]!.resources.coins = cost - 1;
      const before = structuredClone(state);
      expectError(applyAction(state, "P1", action, rng), "INSUFFICIENT_RESOURCES");
      expect(state).toEqual(before);
    }
    state.players["P1"]!.resources.coins = cost;
    const result = mustResult(state, "P1", action, rng);
    expect(result.state.players["P1"]!.resources.coins).toBe(0);
    for (const ceramic of ceramics) expect(result.state.ceramics[ceramic.id]?.stage).toBe("glazed");
    for (const id of owned) {
      expect(result.state.players["P1"]!.techniques.find((tech) => tech.id === id)?.exhausted).toBe(use.includes(id));
    }
    const payments = result.events.filter((event) => event.type === "RESOURCES_CHANGED");
    expect(payments).toEqual(cost === 0 ? [] : [{ type: "RESOURCES_CHANGED", playerId: "P1", clay: 0, wood: 0, coins: -cost }]);
  });
});
