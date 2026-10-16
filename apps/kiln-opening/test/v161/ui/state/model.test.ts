/**
 * `GameModel` (UI_V1.6.1_ARCHITECTURE §3.3, K6): the table view carries no Fire-deck count and no
 * firing context, by type and at runtime; the model is memoised on the view's identity; every
 * field comes from the engine selectors.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { firingRecapView, firingStageView, handLimitStatus, kilnLayout, playerSummary } from "../../../../src/game/index.ts";
import type { PlayerView } from "../../../../src/game/index.ts";
import type { PublicSeat } from "../../../../src/multiplayer/types.ts";
import { buildGameModel, engineViewOf, gameModelOf, tableBoardView } from "../../../../src/app/state/model.ts";
import type { GameModel, TableBoardView, TableCounts } from "../../../../src/app/state/model.ts";
import { allFixtures, fixture } from "../support/fixtures.ts";

function seatsFor(view: PlayerView, computers: readonly string[] = []): PublicSeat[] {
  return view.game.playerOrder.map((playerId, seatIndex) => ({
    seatId: `s${seatIndex}`,
    roomId: "r",
    playerId,
    seatIndex,
    displayName: playerId,
    colour: "",
    isHost: seatIndex === 0,
    isComputer: computers.includes(playerId),
    aiPolicyVersion: null,
  }));
}

describe("TableBoardView (D3/D4 by type)", () => {
  it("has no firing key and its counts have no Fire-deck count", () => {
    expectTypeOf<TableBoardView>().not.toHaveProperty("firing");
    expectTypeOf<TableCounts>().not.toHaveProperty("fireDeck");
    expectTypeOf<GameModel>().not.toHaveProperty("lastFiring");
    expectTypeOf<GameModel["board"]>().toEqualTypeOf<TableBoardView>();
  });

  it.each(allFixtures().map((entry) => [entry.id, entry] as const))("%s: the model holds neither at runtime", (_, entry) => {
    const model = buildGameModel(entry.playerView, []);
    expect(Object.keys(model.board).sort()).toEqual(
      ["centralLocations", "counts", "fireDiscard", "firstPlayerId", "kilnDie", "kilnSpaces", "mainDisplay", "prompt", "refillPendingFor", "round", "techDisplay", "turnOrder"].sort(),
    );
    // CR B2-2: the deferred display refill, from the public market state.
    expect(model.board.refillPendingFor).toBe(entry.playerView.game.market.refillPendingFor);
    // CR B2-1: every public ceramic, as the view holds it.
    expect(model.ceramics).toBe(entry.playerView.game.ceramics);
    expect(Object.keys(model.board.counts).sort()).toEqual(["mainDeck", "mainDiscard", "orderHands", "pendingLook", "techDecks"]);
    const text = JSON.stringify(model);
    expect(text).not.toMatch(/"fireDeck"|"heatSources?"|"actualHeat"|"heatDifference"|"qualityByFire"|"heatPreviews"/);
  });

  it("picks the fields of boardView one by one", () => {
    const view = fixture("m3_heat_marker_step_3p").playerView;
    const picked = tableBoardView({ ...buildGameModel(view, []).board, firing: null, counts: { ...buildGameModel(view, []).board.counts, fireDeck: 9 } } as never);
    expect("firing" in picked).toBe(false);
    expect("fireDeck" in picked.counts).toBe(false);
  });
});

describe("buildGameModel", () => {
  it("reads every field from the engine selectors", () => {
    const view = fixture("m1_work_phase_r2_3p").playerView;
    const model = buildGameModel(view, seatsFor(view, ["p1"]));
    expect(model.revision).toBe(view.game.revision);
    expect(model.viewerId).toBe(view.viewerId);
    expect(model.round).toBe(view.game.round);
    expect(model.phaseType).toBe("work_turn");
    expect(model.roundPhase).toBe("work");
    expect(model.viewerActs).toBe(true);
    expect(model.players.map((p) => p.playerId)).toEqual(model.board.turnOrder);
    expect(model.players[0]).toEqual(playerSummary(view, model.board.turnOrder[0]!));
    expect(model.me?.playerId).toBe(view.viewerId);
    expect(model.hand).toEqual(view.own?.orderHand);
    for (const pid of view.game.playerOrder) expect(model.handLimits[pid]).toEqual(handLimitStatus(view, pid));
    expect(model.kilnLayout).toEqual(kilnLayout(view));
    expect(model.firingStage).toEqual(firingStageView(view));
    expect(model.firingRecap).toEqual(firingRecapView(view));
    expect(model.window.kind).toBe("work");
    expect([...model.computerSeatIds]).toEqual(["p1"]);
  });

  it("gives the firing stage during a firing and the recap between firings", () => {
    expect(buildGameModel(fixture("m3_heat_marker_step_3p").playerView, []).firingStage).not.toBeNull();
    expect(buildGameModel(fixture("m1_work_phase_r2_3p").playerView, []).firingStage).toBeNull();
    expect(buildGameModel(fixture("m1_work_phase_r2_3p").playerView, []).firingRecap).not.toBeNull();
  });

  it("gives the final result once finished", () => {
    const model = buildGameModel(fixture("t-final-2p").playerView, []);
    expect(model.roundPhase).toBe("final");
    expect(model.finalResult).not.toBeNull();
    expect(model.window.kind).toBe("final");
  });

  it("shows only the viewer's own look", () => {
    const own = buildGameModel(fixture("m2_commission_market_look_r3_4p").playerView, []);
    expect(own.look).not.toBeNull();
    const view = fixture("m2_commission_market_look_r3_4p").playerView;
    const spectator = buildGameModel({ viewerId: null, game: view.game, own: null }, []);
    expect(spectator.look).toBeNull();
    expect(spectator.hand).toEqual([]);
    expect(spectator.me).toBeNull();
  });
});

describe("memoisation (§3.3)", () => {
  it("returns the same model for the same view and seats, and a new one for a new view object", () => {
    const view = structuredClone(fixture("m1_work_phase_r2_3p").playerView);
    const seats = seatsFor(view);
    const first = gameModelOf(view, seats);
    expect(gameModelOf(view, seats)).toBe(first);
    expect(gameModelOf(view, [...seats])).toBe(first);
    const sameRevision: PlayerView = { ...view, own: view.own === null ? null : { ...view.own, orderHand: [] } };
    const replaced = gameModelOf(sameRevision, seats);
    expect(replaced).not.toBe(first);
    expect(replaced.revision).toBe(first.revision);
    expect(replaced.hand).toEqual([]);
  });

  it("rebuilds when the computer seats change", () => {
    const view = structuredClone(fixture("m1_work_phase_r2_3p").playerView);
    const first = gameModelOf(view, seatsFor(view));
    const second = gameModelOf(view, seatsFor(view, ["p2"]));
    expect(second).not.toBe(first);
    expect([...second.computerSeatIds]).toEqual(["p2"]);
  });

  it("memoises the engine view too", () => {
    const view = structuredClone(fixture("m1_work_phase_r2_3p").playerView);
    expect(engineViewOf(view)).toBe(engineViewOf(view));
    expect(engineViewOf(view).actor?.viewerId).toBe(view.viewerId);
  });
});
