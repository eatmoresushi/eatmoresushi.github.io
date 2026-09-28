import { describe, expect, it } from "vitest";
import { DECORATIONS, GLAZES, SHAPES, preferredHeat } from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { addLoaded, mustApply, startedGame } from "../v127/helpers.ts";

describe("Ge Crackle preserves the ceramic's actual finish", () => {
  it.each(GLAZES)("preserves %s and every Shape/Decoration through firing and public projection", (glaze) => {
    for (const shape of SHAPES) {
      for (const decoration of DECORATIONS) {
        const { state, rng } = startedGame(2, 28_943);
        state.firstPlayerId = "P1";
        state.players["P1"]!.kilnId = "GE";
        const ceramic = addLoaded(state, "P1", shape, glaze, decoration, "middle_1");
        // Two above the actual glaze's Preferred Heat produces Standard.
        const heat = preferredHeat(glaze) + 2;
        state.fireDeck = [heat > 5 ? 1 : 0];
        state.fireDiscard = [];
        state.phase = { type: "firing_reveal_fire", actorId: "P1" };
        state.firingContext = {
          round: 1, contributors: ["P1"], contributions: { P1: "TEND" },
          baseHeat: glaze === "white" ? 3 : glaze === "celadon" ? 4 : 5,
          fireModifier: null, globalHeat: null,
          kilnYardShifuAdjustments: [], ceramicResults: {},
        };
        const fired = mustApply(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);
        expect(fired.firingContext?.ceramicResults[ceramic.id]?.assignedQuality).toBe("standard");
        const cracked = mustApply(fired, "P1", { type: "RESOLVE_GE", ceramicId: ceramic.id }, rng);
        const expected = { shape, glaze, decoration, crackle: true, quality: "fine", stage: "finished" };
        expect(cracked.ceramics[ceramic.id]).toMatchObject(expected);
        expect(projectPublicGameState(cracked).ceramics[ceramic.id]).toMatchObject(expected);
        // Resolving the property does not overwrite the original state, either.
        expect(state.ceramics[ceramic.id]).toMatchObject({ shape, glaze, decoration, stage: "loaded" });
        expect(state.ceramics[ceramic.id]?.crackle).toBeUndefined();
      }
    }
  });
});
