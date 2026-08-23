import { describe, expect, it } from "vitest";
import {
  GE_ACTIVATION_WOOD,
  JUN_ACTIVATION_WOOD,
  SHAPE_COSTS,
  applyAction,
} from "../src/game";
import { mustApply, setActive, startedGame, workerId } from "./helpers.ts";

/**
 * Ding's extra vessel and Jun's activation are the two Kiln costs most often retuned, and
 * until now neither had an active test: the suite that covered them is pinned to an older
 * ruleset and excluded in `vitest.config.ts`. Both were changed with nothing failing, which
 * is precisely the condition under which a repricing silently half-lands -- the engine
 * charges one number while the AI plans against another.
 */
describe("v1.1.5 Kiln Tradition costs", () => {
  it("charges Ding the normal Clay cost for the extra vessel", () => {
    const game = startedGame(3, 41_001);
    const actor = game.state.firstPlayerId;
    setActive(game.state, actor);
    game.state.players[actor]!.kilnId = "DI";
    game.state.players[actor]!.resources = { clay: 6, wood: 4, coins: 6 };
    const before = game.state.players[actor]!.resources.clay;

    const after = mustApply(
      game.state,
      actor,
      {
        type: "FORM_CERAMICS",
        workerId: workerId(game.state, actor, "apprentice"),
        shapes: ["bowl"],
        dingExtraShape: "bowl",
      },
      game.rng,
    );

    const ceramics = Object.values(after.ceramics).filter((c) => c.ownerId === actor);
    expect(ceramics).toHaveLength(2);
    // Two Bowls formed, two Bowls paid for -- the extra is no longer free.
    expect(before - after.players[actor]!.resources.clay).toBe(SHAPE_COSTS.bowl * 2);
  });

  it("prices Jun's activation at the shared constant, and refuses it below that", () => {
    expect(JUN_ACTIVATION_WOOD).toBeGreaterThan(0);
    expect(GE_ACTIVATION_WOOD).toBeGreaterThan(0);

    const game = startedGame(3, 41_002);
    const actor = game.state.firstPlayerId;
    game.state.players[actor]!.kilnId = "JU";
    game.state.players[actor]!.resources = { clay: 2, wood: JUN_ACTIVATION_WOOD - 1, coins: 12 };
    game.state.phase = { type: "firing_before_quality", queue: { actors: [actor], currentIndex: 0 } };

    // Plenty of Coins, one Wood short: the engine must refuse regardless of the Coin pile.
    const refused = applyAction(
      game.state,
      actor,
      { type: "RESOLVE_JUN", ceramicId: Object.keys(game.state.ceramics)[0] ?? "c1", delta: 1 },
      game.rng,
    );
    expect(refused.ok).toBe(false);
  });
});
