/**
 * "End the turn afterwards" over the authoritative service (owner UI decision D21;
 * ENGINE_V1.6.2_DELTA.md §16.24): the optional `endTurn` on a confirming command ends the turn in
 * the same command, so the room moves one revision and every other seat sees one change, the
 * turn's end, exactly as the two-command path would leave it. The field is shape-checked where
 * commands enter (the service, so also the Edge Function and the local backend, which pass the
 * command through unparsed), and the computer players never send it. A seat that reconnects in the
 * middle of the worker action gets its own pending request back with its look.
 */

import { describe, expect, it } from "vitest";
import { endTurnOptions } from "../../../src/game/index.ts";
import type { AuthoritativeCommand, GameAction, GameState, PlayerCount } from "../../../src/game/index.ts";
import { CANONICAL_COMPUTER_POLICY, chooseStrategicCommand, fallbackComputerCommands } from "../../../src/multiplayer/index.ts";
import type { CommandSuccess, MultiplayerResult, PublicGameState, RoomConnection } from "../../../src/multiplayer/index.ts";
import { LocalBackendV161 } from "../../../tools/localBackendV161.ts";
import type { StateSpec } from "../engine/support/fixtures.ts";
import { playEngineTable } from "./computer_support.ts";
import { command, connectionFor, headState, seatState, seedState, started, tryCommand, valueOf, type Harness } from "./support.ts";

const WHARF: GameAction = { type: "PLACE_CANAL_WHARF", workerId: "P1:apprentice:1" };

/** P1 holds a Finished Flawed bowl, so the after-action step would open after any placement
 * (R27), and S08 with a Standard plate it completes. */
const SPEC: Omit<StateSpec, "players"> & { players: StateSpec["players"] } = {
  players: [{ id: "P1", hand: ["S08"] }, { id: "P2" }],
  ceramics: [
    { owner: "P1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" },
    { owner: "P1", stage: "finished", shape: "plate", glaze: "white", quality: "standard" },
  ],
};

async function seededRoom(spec: Omit<StateSpec, "players"> & { players?: StateSpec["players"] } = SPEC): Promise<Harness> {
  const { harness } = await started();
  await seedState(harness, (gameId) => seatState(2, { gameId, ...spec }));
  return harness;
}

/** The public projection without the fields that differ between two rooms of the same game:
 * the room's game ID and the revision (one command apart). */
function comparable(game: PublicGameState | null | undefined): unknown {
  if (game === null || game === undefined) return null;
  const { gameId: _gameId, revision: _revision, ...rest } = game;
  return rest;
}

async function otherSeatView(harness: Harness): Promise<PublicGameState> {
  const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
  if (reconnect.game === null) throw new Error("No game for P2");
  return reconnect.game;
}

async function publicEventsAfter(harness: Harness, sequence: number): Promise<unknown[]> {
  return (await harness.store.listPublicEvents(harness.roomId, sequence)).map((row) => row.event);
}

describe("one command, one revision, one change for the other seats", () => {
  it("Place · end turn: the Work turn ends in the placement's own command, as the two-command path would leave it", async () => {
    const single = await seededRoom();
    const double = await seededRoom();
    const startRevision = single.revision;
    const startSequence = (await headState(single)).eventSequence;

    const ended = await command(single, "P1", { ...WHARF, endTurn: true });
    expect(ended.revision).toBe(startRevision + 1);
    expect(ended.events.map((event) => event.type).slice(-2)).toEqual(["WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(ended.events.find((event) => event.type === "WORK_TURN_ENDED")).toEqual({ type: "WORK_TURN_ENDED", playerId: "P1", automatic: false });
    expect(ended.game.phase).toEqual({ type: "work_turn", activePlayerId: "P2", step: { kind: "before_action" } });

    const placed = await command(double, "P1", WHARF);
    expect(placed.game.phase).toMatchObject({ activePlayerId: "P1", step: { kind: "after_action" } });
    const endTurn = await command(double, "P1", { type: "END_TURN" });
    expect(endTurn.revision).toBe(startRevision + 2);

    // The other seat's projection and the public log are those of the two-command path.
    expect(comparable(await otherSeatView(single))).toEqual(comparable(await otherSeatView(double)));
    expect(await publicEventsAfter(single, startSequence)).toEqual(await publicEventsAfter(double, startSequence));
    // No public state of the one-command room ever showed P1's after-action step, and nothing
    // public carries the request.
    const singleStates = single.store.audit().publicStates;
    expect(singleStates.some((state) => state.phase.type === "work_turn" && state.phase.step.kind === "after_action")).toBe(false);
    expect(JSON.stringify(singleStates)).not.toContain("endTurn");
    expect(JSON.stringify(await publicEventsAfter(single, 0))).not.toContain("endTurn");
  });

  it("a request remembered through the Commission Market Select is public and names no card; the Select ends the turn", async () => {
    const harness = await seededRoom();
    const startRevision = harness.revision;
    const placed = await command(harness, "P1", { type: "PLACE_COMMISSION_MARKET", workerId: "P1:apprentice:1", endTurn: true });
    expect(placed.revision).toBe(startRevision + 1);
    expect(placed.game.phase).toMatchObject({ activePlayerId: "P1", step: { kind: "commission_market" }, endTurnAfterAction: true });
    const look = placed.ownPrivateView?.pendingLook;
    if (look === null || look === undefined || look.kind === "guild_inspection") throw new Error("No Commission look");
    const seen = await otherSeatView(harness);
    expect(seen.phase).toMatchObject({ endTurnAfterAction: true });
    for (const orderId of look.orderIds) expect(JSON.stringify(seen)).not.toContain(`"${orderId}"`);

    const chosen = await command(harness, "P1", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[0]! }] });
    expect(chosen.revision).toBe(startRevision + 2);
    expect(chosen.game.phase).toEqual({ type: "work_turn", activePlayerId: "P2", step: { kind: "before_action" } });
    expect(chosen.events.find((event) => event.type === "WORK_TURN_ENDED")).toEqual({ type: "WORK_TURN_ENDED", playerId: "P1", automatic: false });
  });

  it("the actor's own reconnect mid-Select restores its pending request and its look; nothing is written; the Select still ends the turn", async () => {
    const harness = await seededRoom();
    const placed = await command(harness, "P1", { type: "PLACE_COMMISSION_MARKET", workerId: "P1:apprentice:1", endTurn: true });
    const look = placed.ownPrivateView?.pendingLook;
    if (look === null || look === undefined || look.kind === "guild_inspection") throw new Error("No Commission look");

    const headBefore = await harness.store.loadHead(harness.roomId);
    const auditBefore = harness.store.audit();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const own = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P1").seatToken }));
      expect(own.seat).toEqual(connectionFor(harness, "P1").seat);
      if (own.game === null) throw new Error("No game for P1");
      expect(own.game.revision).toBe(placed.revision);
      expect(own.game.phase).toMatchObject({ activePlayerId: "P1", step: { kind: "commission_market" }, endTurnAfterAction: true });
      expect(own.ownPrivateView?.pendingLook).toEqual(look);
      // The client rebuilds its split button from the reconnected view alone.
      expect(endTurnOptions({ viewerId: "P1", game: own.game, own: own.ownPrivateView })).toMatchObject({
        stage: "worker_action",
        commandTypes: ["SELECT_CHOOSE"],
        requested: true,
      });
    }
    expect(await harness.store.loadHead(harness.roomId)).toEqual(headBefore);
    expect(harness.store.audit()).toEqual(auditBefore);

    const chosen = await command(harness, "P1", { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look.orderIds[0]! }] });
    expect(chosen.revision).toBe(placed.revision + 1);
    expect(chosen.game.phase).toEqual({ type: "work_turn", activePlayerId: "P2", step: { kind: "before_action" } });
    expect(chosen.events.find((event) => event.type === "WORK_TURN_ENDED")).toEqual({ type: "WORK_TURN_ENDED", playerId: "P1", automatic: false });
  });

  it("Deliver · done: an Order Phase turn ends in the delivery's own command", async () => {
    const orders = { ...SPEC, round: 2 as const, phase: { type: "orders" as const, turnOrder: ["P1", "P2"], index: 0 } };
    const single = await seededRoom(orders);
    const double = await seededRoom(orders);
    const startSequence = (await headState(single)).eventSequence;
    const deliver: GameAction = { type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: ["c2"] };

    const done = await command(single, "P1", { ...deliver, endTurn: true });
    expect(done.revision).toBe(single.revision);
    expect(done.events.find((event) => event.type === "ORDER_TURN_ENDED")).toEqual({ type: "ORDER_TURN_ENDED", playerId: "P1", automatic: false });
    await command(double, "P1", deliver);
    await command(double, "P1", { type: "END_ORDER_TURN" });
    expect(double.revision).toBe(single.revision + 1);
    expect(comparable(await otherSeatView(single))).toEqual(comparable(await otherSeatView(double)));
    expect(await publicEventsAfter(single, startSequence)).toEqual(await publicEventsAfter(double, startSequence));
  });
});

describe("validation where commands enter", () => {
  async function refused(harness: Harness, candidate: unknown): Promise<{ code: string; details: unknown }> {
    const before = await harness.store.loadHead(harness.roomId);
    const result = await tryCommand(harness, "P1", candidate);
    expect(result.ok).toBe(false);
    expect(await harness.store.loadHead(harness.roomId)).toEqual(before);
    if (result.ok) throw new Error("accepted");
    return { code: result.error.code, details: result.error.details };
  }

  it("the service refuses a non-boolean endTurn, and endTurn on a command that does not take it, as shape errors", async () => {
    const harness = await seededRoom();
    for (const value of ["true", 1, null]) {
      expect(await refused(harness, { ...WHARF, endTurn: value })).toEqual({ code: "MALFORMED_ACTION", details: { field: "endTurn" } });
    }
    expect(await refused(harness, { type: "END_TURN", endTurn: true })).toEqual({ code: "MALFORMED_ACTION", details: { field: "endTurn" } });
    expect(await refused(harness, { type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId: "S08", endTurn: true })).toEqual({
      code: "MALFORMED_ACTION",
      details: { field: "endTurn" },
    });
  });

  it("the service refuses endTurn: true on a free action before the worker action (WORKER_ACTION_REQUIRED) and accepts false", async () => {
    const harness = await seededRoom();
    const sell = { type: "SELL_FLAWED", ceramicId: "c1" } as const;
    expect(await refused(harness, { ...sell, endTurn: true })).toEqual({
      code: "WORKER_ACTION_REQUIRED",
      details: { field: "endTurn", actionType: "SELL_FLAWED", step: "before_action" },
    });
    const sold = await command(harness, "P1", { ...sell, endTurn: false });
    expect(sold.game.phase).toMatchObject({ activePlayerId: "P1", step: { kind: "before_action" } });
  });

  it("the local backend (the Edge Function's path: the command passes through unparsed) checks the field too", async () => {
    const backend = new LocalBackendV161({ policy: "canonical", log: () => undefined });
    let counter = 0;
    const commandId = (): string => `00000000-0000-4000-b000-${String((counter += 1)).padStart(12, "0")}`;
    const ok = <T>(result: unknown): T => {
      const typed = result as MultiplayerResult<T>;
      if (!typed.ok) throw new Error(JSON.stringify(typed.error));
      return typed.value;
    };
    const host = ok<RoomConnection>(await backend.handle({ operation: "create_room", displayName: "Lin" }, "user-host"));
    ok(await backend.handle({ operation: "add_computer", roomCode: host.room.code, seatToken: host.seatToken, commandId: commandId() }, "user-host"));
    const start = ok<CommandSuccess>(await backend.handle({ operation: "start_game", roomCode: host.room.code, seatToken: host.seatToken, commandId: commandId() }, "user-host"));
    const result = (await backend.handle(
      {
        operation: "game_action",
        roomCode: host.room.code,
        seatToken: host.seatToken,
        commandId: commandId(),
        expectedRevision: start.revision,
        command: { type: "PLACE_CANAL_WHARF", workerId: `${host.seat.playerId}:apprentice:1`, endTurn: "yes" },
      },
      "user-host",
    )) as MultiplayerResult<CommandSuccess>;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "MALFORMED_ACTION", details: { field: "endTurn" } });
  });
});

describe("computer players are unaffected", () => {
  /** Every command a seat proposed, and every fallback candidate it was offered. */
  function recordGame(playerCount: PlayerCount, seed: number, strategic: boolean): { state: GameState; proposals: AuthoritativeCommand[]; fallbacks: AuthoritativeCommand[] } {
    const proposals: AuthoritativeCommand[] = [];
    const fallbacks: AuthoritativeCommand[] = [];
    const result = playEngineTable({
      seed,
      playerCount,
      chooserFor: (playerId) => (view) => {
        const choice = strategic
          ? chooseStrategicCommand(view, { playerId, displayName: playerId, aiSeed: seed, aiPolicyVersion: null })
          : (CANONICAL_COMPUTER_POLICY.chooseCommand(view, { playerId, displayName: playerId, aiSeed: seed, aiPolicyVersion: null }) as AuthoritativeCommand | null);
        if (choice !== null) proposals.push(choice);
        return choice;
      },
      observe: (_state, _playerId, view) => {
        fallbacks.push(...fallbackComputerCommands(view));
      },
    });
    return { state: result.state, proposals, fallbacks };
  }

  it.each([2, 3, 4] as const)("strategic and canonical seats never send endTurn (%i players)", (playerCount) => {
    for (const strategic of [true, false]) {
      const { state, proposals, fallbacks } = recordGame(playerCount, 31_000 + playerCount * 10 + (strategic ? 1 : 0), strategic);
      expect(state.phase.type).toBe("finished");
      expect(proposals.length).toBeGreaterThan(0);
      expect(proposals.filter((proposal) => Object.hasOwn(proposal, "endTurn"))).toEqual([]);
      expect(fallbacks.filter((candidate) => Object.hasOwn(candidate, "endTurn"))).toEqual([]);
    }
  }, 120_000);
});
