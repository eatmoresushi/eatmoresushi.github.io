import { describe, expect, it } from "vitest";
import { currentDecisionActor } from "../src/game";
import type { GameAction, PlayerId, WoodContribution } from "../src/game";
import {
  AuthoritativeGameService,
  InMemoryMultiplayerStore,
} from "../src/multiplayer";
import type {
  CommandSuccess,
  MultiplayerResult,
  RoomConnection,
  SecurityProvider,
  SubmitWoodCommand,
} from "../src/multiplayer";

class TestSecurity implements SecurityProvider {
  private sequence = 0;

  randomId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  randomRoomCode(): string {
    this.sequence += 1;
    return `R${String(this.sequence).padStart(5, "0")}`;
  }

  randomSeatToken(): string {
    this.sequence += 1;
    return `test-seat-token-${String(this.sequence).padStart(32, "0")}`;
  }

  randomSeed(): number {
    this.sequence += 1;
    return 40_000 + this.sequence;
  }

  async hashSecret(value: string): Promise<string> {
    return `sha256:${value}`;
  }

  async hashJson(value: unknown): Promise<string> {
    return `state:${JSON.stringify(value)}`;
  }
}

interface Harness {
  service: AuthoritativeGameService;
  store: InMemoryMultiplayerStore;
  connections: RoomConnection[];
  game: CommandSuccess;
  commandSequence: number;
}

function valueOf<T>(result: MultiplayerResult<T>): T {
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function createLobby(playerCount: 2 | 3 | 4): Promise<{
  service: AuthoritativeGameService;
  store: InMemoryMultiplayerStore;
  connections: RoomConnection[];
}> {
  const store = new InMemoryMultiplayerStore();
  const service = new AuthoritativeGameService(store, new TestSecurity());
  const host = valueOf(await service.createRoom({ displayName: "Host", authUserId: "auth-host" }));
  const connections = [host];
  for (let index = 1; index < playerCount; index += 1) {
    connections.push(
      valueOf(
        await service.joinRoom({
          roomCode: host.room.code,
          displayName: `Player ${index + 1}`,
          authUserId: `auth-${index + 1}`,
        }),
      ),
    );
  }
  return { service, store, connections };
}

async function startHarness(playerCount: 2 | 3 | 4 = 2): Promise<Harness> {
  const lobby = await createLobby(playerCount);
  const host = lobby.connections[0]!;
  const game = valueOf(
    await lobby.service.startGame({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      commandId: "00000000-0000-4000-9000-000000000001",
    }),
  );
  return { ...lobby, game, commandSequence: 1 };
}

function connectionFor(harness: Harness, playerId: PlayerId): RoomConnection {
  const connection = harness.connections.find((candidate) => candidate.seat.playerId === playerId);
  if (connection === undefined) throw new Error(`Missing connection for ${playerId}`);
  return connection;
}

async function command(
  harness: Harness,
  playerId: PlayerId,
  action: GameAction | SubmitWoodCommand,
): Promise<CommandSuccess> {
  harness.commandSequence += 1;
  const connection = connectionFor(harness, playerId);
  const result = await harness.service.executeCommand({
    roomCode: connection.room.code,
    seatToken: connection.seatToken,
    commandId: `00000000-0000-4000-9000-${String(harness.commandSequence).padStart(12, "0")}`,
    expectedRevision: harness.game.revision,
    command: action,
  });
  const next = valueOf(result);
  harness.game = next;
  return next;
}

async function resolveSetup(harness: Harness): Promise<void> {
  const kilns = ["RU", "GU", "GE", "DI"] as const;
  let kilnIndex = 0;
  while (harness.game.game.phase.type === "setup_kiln_selection") {
    const actorId = currentDecisionActor(harness.game.game.phase);
    if (actorId === null) throw new Error("Missing Kiln selector");
    await command(harness, actorId, { type: "SELECT_KILN", kilnId: kilns[kilnIndex]! });
    kilnIndex += 1;
  }
  while (harness.game.game.phase.type === "setup_starting_orders") {
    const actorId = currentDecisionActor(harness.game.game.phase);
    if (actorId === null) throw new Error("Missing starting Order actor");
    await command(harness, actorId, { type: "KEEP_STARTING_ORDER" });
  }
}

function availableWorker(
  game: CommandSuccess["game"],
  playerId: PlayerId,
  kind: "shifu" | "apprentice",
): string {
  const player = game.players[playerId];
  const worker = player === undefined
    ? undefined
    : Object.values(player.workers).find(
        (candidate) => candidate.kind === kind && candidate.status === "available",
      );
  if (worker === undefined) throw new Error(`Missing ${kind} for ${playerId}`);
  return worker.id;
}

async function enterTwoContributorFiring(harness: Harness): Promise<{
  firstId: PlayerId;
  secondId: PlayerId;
  windowId: string;
}> {
  await resolveSetup(harness);
  const firstId = harness.game.game.firstPlayerId;
  const secondId = harness.game.game.playerOrder.find((id) => id !== firstId)!;
  await command(harness, firstId, {
    type: "FORM_CERAMICS",
    workerId: availableWorker(harness.game.game, firstId, "apprentice"),
    shapes: ["bowl"],
  });
  await command(harness, secondId, {
    type: "FORM_CERAMICS",
    workerId: availableWorker(harness.game.game, secondId, "apprentice"),
    shapes: ["bowl"],
  });
  const firstCeramic = Object.values(harness.game.game.ceramics).find(
    (ceramic) => ceramic.ownerId === firstId,
  )!;
  const secondCeramic = Object.values(harness.game.game.ceramics).find(
    (ceramic) => ceramic.ownerId === secondId,
  )!;
  await command(harness, firstId, {
    type: "GLAZE_CERAMICS",
    workerId: availableWorker(harness.game.game, firstId, "apprentice"),
    selections: [{ ceramicId: firstCeramic.id, glaze: "white", decoration: "plain" }],
    shifuMode: "normal",
  });
  await command(harness, secondId, {
    type: "GLAZE_CERAMICS",
    workerId: availableWorker(harness.game.game, secondId, "apprentice"),
    selections: [{ ceramicId: secondCeramic.id, glaze: "celadon", decoration: "plain" }],
    shifuMode: "normal",
  });
  await command(harness, firstId, {
    type: "USE_KILN_YARD",
    workerId: availableWorker(harness.game.game, firstId, "shifu"),
    gainWood: true,
    loads: [{ ceramicId: firstCeramic.id, kilnSpaceId: "middle_1" }],
  });
  await command(harness, secondId, {
    type: "USE_KILN_YARD",
    workerId: availableWorker(harness.game.game, secondId, "shifu"),
    gainWood: true,
    loads: [{ ceramicId: secondCeramic.id, kilnSpaceId: "middle_2" }],
  });
  if (harness.game.game.phase.type !== "firing_contributions") {
    throw new Error(`Expected Contributions, got ${harness.game.game.phase.type}`);
  }
  return { firstId, secondId, windowId: harness.game.game.phase.windowId };
}

describe("multiplayer rooms and stable seats", () => {
  it("creates, fills, reconnects, and preserves 2–4 stable seat identities", async () => {
    const { service, connections } = await createLobby(4);
    const host = connections[0]!;
    expect(connections.map((connection) => connection.seat.playerId)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(connections.map((connection) => connection.seat.seatIndex)).toEqual([0, 1, 2, 3]);

    const full = await service.joinRoom({
      roomCode: host.room.code,
      displayName: "Fifth",
      authUserId: "auth-fifth",
    });
    expect(full).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "ROOM_FULL" }) }));

    const third = connections[2]!;
    const reconnected = valueOf(
      await service.reconnect({ roomCode: host.room.code, seatToken: third.seatToken }),
    );
    expect(reconnected.seat).toEqual(third.seat);
    expect(reconnected.seats.map((seat) => seat.playerId)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(reconnected.game).toBeNull();
  });

  it("enforces host-only start, a 2-player minimum, and freezes joins after start", async () => {
    const onePlayerStore = new InMemoryMultiplayerStore();
    const onePlayerService = new AuthoritativeGameService(onePlayerStore, new TestSecurity());
    const loneHost = valueOf(
      await onePlayerService.createRoom({ displayName: "Solo", authUserId: null }),
    );
    const tooFew = await onePlayerService.startGame({
      roomCode: loneHost.room.code,
      seatToken: loneHost.seatToken,
      commandId: "00000000-0000-4000-9000-000000000010",
    });
    expect(tooFew).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_ENOUGH_PLAYERS" }) }),
    );

    const lobby = await createLobby(2);
    const guest = lobby.connections[1]!;
    const hostOnly = await lobby.service.startGame({
      roomCode: guest.room.code,
      seatToken: guest.seatToken,
      commandId: "00000000-0000-4000-9000-000000000011",
    });
    expect(hostOnly).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "HOST_ONLY" }) }));
    const host = lobby.connections[0]!;
    valueOf(
      await lobby.service.startGame({
        roomCode: host.room.code,
        seatToken: host.seatToken,
        commandId: "00000000-0000-4000-9000-000000000012",
      }),
    );
    const lateJoin = await lobby.service.joinRoom({
      roomCode: host.room.code,
      displayName: "Late",
      authUserId: null,
    });
    expect(lateJoin).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "GAME_ALREADY_STARTED" }) }),
    );
  });
});

describe("server authority, CAS, idempotency, and realtime", () => {
  it("derives the actor from the seat, commits one concurrent command, and replays an idempotent result", async () => {
    const harness = await startHarness();
    const phase = harness.game.game.phase;
    if (phase.type !== "setup_kiln_selection") throw new Error("Expected Kiln setup");
    const activeId = currentDecisionActor(phase)!;
    const active = connectionFor(harness, activeId);
    const expectedRevision = harness.game.revision;
    let notifications = 0;
    const unsubscribe = harness.store.subscribePublic(active.room.id, () => {
      notifications += 1;
    });
    const requests = ["RU", "GU"].map((kilnId, index) =>
      harness.service.executeCommand({
        roomCode: active.room.code,
        seatToken: active.seatToken,
        commandId: `00000000-0000-4000-9100-00000000000${index + 1}`,
        expectedRevision,
        command: { type: "SELECT_KILN", kilnId: kilnId as "RU" | "GU" },
      }),
    );
    const concurrent = await Promise.all(requests);
    const accepted = concurrent.find((result) => result.ok);
    const rejected = concurrent.find((result) => !result.ok);
    expect(accepted?.ok).toBe(true);
    expect(rejected).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "STALE_REVISION" }) }),
    );
    if (accepted === undefined || !accepted.ok) throw new Error("Missing accepted command");
    const repeat = await harness.service.executeCommand({
      roomCode: active.room.code,
      seatToken: active.seatToken,
      commandId: accepted.value.commandId,
      expectedRevision,
      command: { type: "SELECT_KILN", kilnId: "GE" },
    });
    expect(repeat).toEqual(accepted);

    const nextActiveId = currentDecisionActor(accepted.value.game.phase)!;
    const wrongSeat = harness.connections.find((connection) => connection.seat.playerId !== nextActiveId)!;
    const spoofed = await harness.service.executeCommand({
      roomCode: wrongSeat.room.code,
      seatToken: wrongSeat.seatToken,
      commandId: "00000000-0000-4000-9100-000000000099",
      expectedRevision: accepted.value.revision,
      command: { type: "SELECT_KILN", kilnId: "GE" },
      actorId: nextActiveId,
    } as Parameters<AuthoritativeGameService["executeCommand"]>[0] & { actorId: string });
    expect(spoofed).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "NOT_ACTIVE_PLAYER" }) }),
    );
    expect(notifications).toBe(1);
    unsubscribe();
  });

  it("stores authoritative snapshots and public events without exposing future deck order", async () => {
    const harness = await startHarness();
    const phase = harness.game.game.phase;
    if (phase.type !== "setup_kiln_selection") throw new Error("Expected setup");
    const actorId = currentDecisionActor(phase)!;
    await command(harness, actorId, { type: "SELECT_KILN", kilnId: "RU" });
    const audit = harness.store.audit();
    expect(audit.heads).toHaveLength(1);
    expect(audit.snapshots.length).toBeGreaterThanOrEqual(2);
    expect(audit.commands).toHaveLength(2);
    expect(audit.fullEvents).toHaveLength(1);
    expect(await harness.store.listPublicEvents(harness.game.room.id)).toHaveLength(1);
    expect(harness.game.game).not.toHaveProperty("marketDeck");
    expect(harness.game.game).not.toHaveProperty("fireDeck");
    expect(harness.game.game.decks.marketRemaining).toBeGreaterThan(0);
    expect(audit.heads[0]!.state.marketDeck).toBeInstanceOf(Array);
    expect(JSON.stringify(harness.game.game)).not.toContain("rootSeed");
  });
});

describe("private Wood Contributions and reconnect", () => {
  it("shows only submission status publicly and restores only the submitting seat's pending amount", async () => {
    const harness = await startHarness();
    const { firstId, secondId, windowId } = await enterTwoContributorFiring(harness);
    const firstConnection = connectionFor(harness, firstId);
    const secondConnection = connectionFor(harness, secondId);
    const woodBefore = harness.game.game.players[firstId]!.resources.wood;
    await command(harness, firstId, {
      type: "SUBMIT_WOOD_CONTRIBUTION",
      windowId,
      amount: 2,
    });
    expect(harness.game.game.phase).toEqual(
      expect.objectContaining({ type: "firing_contributions", submittedPlayerIds: [firstId] }),
    );
    expect(harness.game.game.players[firstId]!.resources.wood).toBe(woodBefore);
    expect(harness.game.events).toEqual([
      { type: "WOOD_SUBMITTED", playerId: firstId, windowId },
    ]);
    expect(JSON.stringify(harness.game.game)).not.toContain('"amount":2');
    expect(harness.game.ownPendingContribution?.amount).toBe(2);

    const firstReconnect = valueOf(
      await harness.service.reconnect({
        roomCode: firstConnection.room.code,
        seatToken: firstConnection.seatToken,
      }),
    );
    const secondReconnect = valueOf(
      await harness.service.reconnect({
        roomCode: secondConnection.room.code,
        seatToken: secondConnection.seatToken,
      }),
    );
    expect(firstReconnect.seat.playerId).toBe(firstId);
    expect(firstReconnect.ownPendingContribution).toEqual({ windowId, amount: 2, submitted: true });
    expect(secondReconnect.ownPendingContribution).toBeNull();
    expect(firstReconnect.game).toEqual(secondReconnect.game);

    const bad = await harness.service.executeCommand({
      roomCode: secondConnection.room.code,
      seatToken: secondConnection.seatToken,
      commandId: "00000000-0000-4000-9200-000000000001",
      expectedRevision: harness.game.revision,
      command: {
        type: "SUBMIT_WOOD_CONTRIBUTION",
        windowId,
        amount: 4 as WoodContribution,
      },
    });
    expect(bad).toEqual(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: "INVALID_CONTRIBUTION" }) }),
    );
    const revisionBeforeReveal = harness.game.revision;
    await command(harness, secondId, {
      type: "SUBMIT_WOOD_CONTRIBUTION",
      windowId,
      amount: 1,
    });
    expect(harness.game.revision).toBe(revisionBeforeReveal + 1);
    expect(harness.game.events.some((event) => event.type === "WOOD_REVEALED")).toBe(true);
    expect(harness.game.game.players[firstId]!.resources.wood).toBe(woodBefore - 2);
    expect(harness.store.audit().privateSubmissions.every((submission) => submission.revealedRevision !== null)).toBe(true);
  });

  it("accepts concurrent eligible submissions exactly once and reveals atomically once", async () => {
    const harness = await startHarness();
    const { firstId, secondId, windowId } = await enterTwoContributorFiring(harness);
    const expectedRevision = harness.game.revision;
    const submit = (playerId: PlayerId, amount: WoodContribution, suffix: string) => {
      const connection = connectionFor(harness, playerId);
      return harness.service.executeCommand({
        roomCode: connection.room.code,
        seatToken: connection.seatToken,
        commandId: `00000000-0000-4000-9300-${suffix}`,
        expectedRevision,
        command: { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, amount },
      });
    };
    const results = await Promise.all([
      submit(firstId, 1, "000000000001"),
      submit(secondId, 0, "000000000002"),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const reconnect = valueOf(
      await harness.service.reconnect({
        roomCode: harness.connections[0]!.room.code,
        seatToken: harness.connections[0]!.seatToken,
      }),
    );
    expect(reconnect.game?.revision).toBe(expectedRevision + 2);
    expect(reconnect.game?.phase.type).not.toBe("firing_contributions");
    expect(reconnect.ownPendingContribution).toBeNull();
    const publicEvents = await harness.store.listPublicEvents(harness.game.room.id);
    expect(publicEvents.filter((record) => record.event.type === "WOOD_REVEALED")).toHaveLength(1);
    expect(harness.store.audit().privateSubmissions).toHaveLength(2);
  });

  it("rejects a concurrent second submission by the same seat without mutating twice", async () => {
    const harness = await startHarness();
    const { firstId, windowId } = await enterTwoContributorFiring(harness);
    const connection = connectionFor(harness, firstId);
    const expectedRevision = harness.game.revision;
    const results = await Promise.all([
      harness.service.executeCommand({
        roomCode: connection.room.code,
        seatToken: connection.seatToken,
        commandId: "00000000-0000-4000-9400-000000000001",
        expectedRevision,
        command: { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, amount: 1 },
      }),
      harness.service.executeCommand({
        roomCode: connection.room.code,
        seatToken: connection.seatToken,
        commandId: "00000000-0000-4000-9400-000000000002",
        expectedRevision,
        command: { type: "SUBMIT_WOOD_CONTRIBUTION", windowId, amount: 2 },
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "CONTRIBUTION_ALREADY_SUBMITTED" }),
      }),
    );
    expect(harness.store.audit().privateSubmissions).toHaveLength(1);
    const head = await harness.store.loadHead(harness.game.room.id);
    expect(head?.revision).toBe(expectedRevision + 1);
  });
});
