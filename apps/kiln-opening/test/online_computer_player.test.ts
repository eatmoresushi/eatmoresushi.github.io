import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPrivateFiringState, currentDecisionActor } from "../src/game/index.ts";
import { chooseOnlineComputerAction, nextOnlineDecisionActor } from "../src/multiplayer/computerPlayer.ts";
import {
  AuthoritativeGameService,
  InMemoryMultiplayerStore,
} from "../src/multiplayer/index.ts";
import type {
  MultiplayerResult,
  RoomConnection,
  SecurityProvider,
  StoredSeat,
} from "../src/multiplayer/index.ts";
import { startedGame } from "./helpers.ts";

class TestSecurity implements SecurityProvider {
  private sequence = 0;

  randomId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  randomRoomCode(): string {
    this.sequence += 1;
    return `A${String(this.sequence).padStart(5, "0")}`;
  }

  randomSeatToken(): string {
    this.sequence += 1;
    return `online-ai-seat-${String(this.sequence).padStart(32, "0")}`;
  }

  randomSeed(): number {
    this.sequence += 1;
    return 80_000 + this.sequence;
  }

  async hashSecret(value: string): Promise<string> {
    return `secret:${value}`;
  }

  async hashJson(value: unknown): Promise<string> {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}

function valueOf<T>(result: MultiplayerResult<T>): T {
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function createHost(): Promise<{
  service: AuthoritativeGameService;
  store: InMemoryMultiplayerStore;
  host: RoomConnection;
}> {
  const store = new InMemoryMultiplayerStore();
  const service = new AuthoritativeGameService(store, new TestSecurity());
  const host = valueOf(await service.createRoom({ displayName: "Host", authUserId: "host-user" }));
  return { service, store, host };
}

describe("online V003 computer seats", () => {
  it("lets the host add, remove, and restore multiple stable computer seats", async () => {
    const { service, store, host } = await createHost();
    let seats = host.seats;
    for (let index = 1; index <= 3; index += 1) {
      const update = valueOf(await service.addComputerSeat({
        roomCode: host.room.code,
        seatToken: host.seatToken,
        commandId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      }));
      seats = update.seats;
    }
    expect(seats).toHaveLength(4);
    expect(seats.filter((seat) => seat.isComputer)).toHaveLength(3);
    expect(seats.slice(1).map((seat) => seat.aiPolicyVersion)).toEqual([
      "selfplay-003",
      "selfplay-003",
      "selfplay-003",
    ]);
    expect(store.audit().credentials).toHaveLength(1);

    const full = await service.addComputerSeat({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      commandId: "10000000-0000-4000-8000-000000000099",
    });
    expect(full).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "ROOM_FULL" }),
    }));

    const removedSeat = seats[2]!;
    const removed = valueOf(await service.removeComputerSeat({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      computerSeatId: removedSeat.seatId,
    }));
    expect(removed.seats.map((seat) => seat.playerId)).toEqual(["P1", "P2", "P4"]);

    const restored = valueOf(await service.addComputerSeat({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      commandId: "10000000-0000-4000-8000-000000000100",
    }));
    expect(restored.seats.map((seat) => seat.playerId)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(restored.seats.find((seat) => seat.playerId === "P3")).toEqual(expect.objectContaining({
      isComputer: true,
      displayName: "Computer 2",
    }));
  });

  it("rejects guest management and never lets the host remove a human seat", async () => {
    const { service, host } = await createHost();
    const guest = valueOf(await service.joinRoom({
      roomCode: host.room.code,
      displayName: "Guest",
      authUserId: "guest-user",
    }));
    const guestAdd = await service.addComputerSeat({
      roomCode: guest.room.code,
      seatToken: guest.seatToken,
      commandId: "20000000-0000-4000-8000-000000000001",
    });
    expect(guestAdd).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "HOST_ONLY" }),
    }));
    const removeHuman = await service.removeComputerSeat({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      computerSeatId: guest.seat.seatId,
    });
    expect(removeHuman).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: "INVALID_REQUEST" }),
    }));
  });

  it("advances consecutive computer decisions exactly once and stops at the human turn", async () => {
    const { service, store, host } = await createHost();
    for (let index = 1; index <= 3; index += 1) {
      valueOf(await service.addComputerSeat({
        roomCode: host.room.code,
        seatToken: host.seatToken,
        commandId: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      }));
    }
    const started = valueOf(await service.startGame({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      commandId: "30000000-0000-4000-8000-000000000010",
    }));
    expect(currentDecisionActor(started.game.phase)).toBe("P4");

    const advanced = valueOf(await service.advanceComputerTurns({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      expectedRevision: started.revision,
    }));
    expect(advanced.advancedActions).toBe(3);
    expect(advanced.actorIds).toEqual(["P4", "P3", "P2"]);
    expect(advanced.stoppedReason).toBe("human_turn");
    expect(currentDecisionActor(advanced.game.phase)).toBe("P1");
    expect(advanced.revision).toBe(started.revision + 3);

    const accepted = store.audit().commands.slice(1);
    expect(accepted.map((command) => command.revision)).toEqual([1, 2, 3]);
    expect(new Set(accepted.map((command) => command.revision)).size).toBe(accepted.length);
    expect(accepted.every((command) => command.actorId !== "P1")).toBe(true);

    const noOp = valueOf(await service.advanceComputerTurns({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      expectedRevision: advanced.revision,
    }));
    expect(noOp.advancedActions).toBe(0);
    expect(noOp.revision).toBe(advanced.revision);
  });

  it("chooses identically when only hidden deck order changes", async () => {
    const { state } = startedGame(2, 47_003);
    if (state.phase.type !== "work") throw new Error("Expected a resolved setup fixture");
    const actorId = state.phase.activePlayerId;
    const hiddenChanged = structuredClone(state);
    hiddenChanged.marketDeck.reverse();
    hiddenChanged.imperialDeck.reverse();
    hiddenChanged.fireDeck.reverse();
    for (const deck of Object.values(hiddenChanged.techniqueDecks)) deck.reverse();
    const seat: StoredSeat = {
      seatId: "40000000-0000-4000-8000-000000000001",
      roomId: state.gameId,
      playerId: actorId,
      seatIndex: state.playerOrder.indexOf(actorId),
      displayName: "Computer 1",
      colour: "celadon",
      isHost: false,
      isComputer: true,
      aiPolicyVersion: "selfplay-003",
      authUserId: null,
      aiSeed: 47_003,
      aiCreatedCommandId: "40000000-0000-4000-8000-000000000002",
    };
    const originalAction = await chooseOnlineComputerAction(
      state,
      createPrivateFiringState(state),
      seat,
    );
    const changedAction = await chooseOnlineComputerAction(
      hiddenChanged,
      createPrivateFiringState(hiddenChanged),
      seat,
    );
    expect(changedAction).toEqual(originalAction);
  });

  it("completes an authoritative four-player game with one human-driven seat and three computers", async () => {
    const { service, store, host } = await createHost();
    for (let index = 1; index <= 3; index += 1) {
      valueOf(await service.addComputerSeat({
        roomCode: host.room.code,
        seatToken: host.seatToken,
        commandId: `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      }));
    }
    let game = valueOf(await service.startGame({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      commandId: "50000000-0000-4000-8000-000000000010",
    }));
    const virtualHumanPolicySeat: StoredSeat = {
      ...host.seat,
      isComputer: true,
      aiPolicyVersion: "selfplay-003",
      aiSeed: 99_001,
      aiCreatedCommandId: "50000000-0000-4000-8000-000000000011",
      authUserId: "host-user",
    };
    let commandSequence = 20;

    for (let guard = 0; guard < 2_000 && game.game.phase.type !== "finished"; guard += 1) {
      const computers = valueOf(await service.advanceComputerTurns({
        roomCode: host.room.code,
        seatToken: host.seatToken,
        expectedRevision: game.revision,
      }));
      game = {
        commandId: `computer-batch-${guard}`,
        room: computers.room,
        actorId: computers.actorIds.at(-1) ?? host.seat.playerId,
        revision: computers.revision,
        game: computers.game,
        events: computers.events,
        ownPendingContribution: computers.ownPendingContribution,
      };
      if (game.game.phase.type === "finished") break;

      const head = await store.loadHead(host.room.id);
      if (head === null) throw new Error("Missing authoritative head");
      const actorId = nextOnlineDecisionActor(head.state);
      expect(actorId).toBe(host.seat.playerId);
      let privateState = createPrivateFiringState(head.state);
      if (head.state.phase.type === "firing_contributions") {
        const submissions = await store.loadPrivateSubmissions(host.room.id, head.state.phase.windowId);
        privateState = {
          gameId: head.state.gameId,
          windowId: head.state.phase.windowId,
          contributions: Object.fromEntries(submissions.map((submission) => [submission.playerId, submission.amount])),
        };
      }
      const action = await chooseOnlineComputerAction(head.state, privateState, virtualHumanPolicySeat);
      commandSequence += 1;
      game = valueOf(await service.executeCommand({
        roomCode: host.room.code,
        seatToken: host.seatToken,
        commandId: `50000000-0000-4000-9000-${String(commandSequence).padStart(12, "0")}`,
        expectedRevision: head.revision,
        command: action,
      }));
    }

    expect(game.game.phase.type).toBe("finished");
    const audit = store.audit();
    expect(new Set(audit.commands.map((command) => command.actorId))).toEqual(
      new Set(["P1", "P2", "P3", "P4"]),
    );
    const revisions = audit.commands.map((command) => command.revision);
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(revisions.at(-1)).toBe(game.revision);
  }, 60_000);
});
