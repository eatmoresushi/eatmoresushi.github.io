import { describe, expect, it } from "vitest";
import { currentDecisionActor } from "../../src/game/index.ts";
import type { GameAction, GameState, PlayerId } from "../../src/game/index.ts";
import {
  AuthoritativeGameService,
  InMemoryMultiplayerStore,
  projectPublicGameState,
} from "../../src/multiplayer/index.ts";
import type {
  CommandSuccess,
  MultiplayerResult,
  RoomConnection,
  SecurityProvider,
  SubmitWoodCommand,
} from "../../src/multiplayer/index.ts";

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
    return 12_200 + this.sequence;
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

async function startedHarness(): Promise<Harness> {
  const store = new InMemoryMultiplayerStore();
  const service = new AuthoritativeGameService(store, new TestSecurity());
  const host = valueOf(await service.createRoom({ displayName: "Host", authUserId: "host-auth" }));
  const guest = valueOf(await service.joinRoom({
    roomCode: host.room.code,
    displayName: "Guest",
    authUserId: "guest-auth",
  }));
  const game = valueOf(await service.startGame({
    roomCode: host.room.code,
    seatToken: host.seatToken,
    commandId: "00000000-0000-4000-9000-000000000001",
  }));
  return { service, store, connections: [host, guest], game, commandSequence: 1 };
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
  harness.game = valueOf(await harness.service.executeCommand({
    roomCode: connection.room.code,
    seatToken: connection.seatToken,
    commandId: `00000000-0000-4000-9000-${String(harness.commandSequence).padStart(12, "0")}`,
    expectedRevision: harness.game.revision,
    command: action,
  }));
  return harness.game;
}

async function selectKilns(harness: Harness): Promise<void> {
  const kilns = ["RU", "GU"] as const;
  let index = 0;
  while (harness.game.game.phase.type === "setup_kiln_selection") {
    const actorId = currentDecisionActor(harness.game.game.phase);
    if (actorId === null) throw new Error("Missing Kiln selector");
    await command(harness, actorId, { type: "SELECT_KILN", kilnId: kilns[index]! });
    index += 1;
  }
}

async function seedAuthoritativeState(harness: Harness, mutate: (state: GameState) => void): Promise<void> {
  const previousHead = await harness.store.loadHead(harness.game.room.id);
  if (previousHead === null) throw new Error("Missing authoritative head");
  const state = previousHead.state;
  mutate(state);
  state.revision += 1;
  const nextHead = {
    ...previousHead,
    revision: state.revision,
    state,
    stateHash: `state:${JSON.stringify(state)}`,
  };
  const publicState = projectPublicGameState(state);
  harness.commandSequence += 1;
  const commandId = `00000000-0000-4000-9800-${String(harness.commandSequence).padStart(12, "0")}`;
  const response: CommandSuccess = {
    commandId,
    room: { ...harness.game.room, latestRevision: state.revision },
    actorId: "P1",
    revision: state.revision,
    game: publicState,
    events: [],
    ownPendingContribution: null,
  };
  const committed = await harness.store.commitTransition({
    roomId: harness.game.room.id,
    commandId,
    actorId: "P1",
    expectedRevision: previousHead.revision,
    command: { type: "TEST_SEED_V122_STATE" },
    previousHead,
    nextHead,
    fullEvents: [],
    publicEvents: [],
    publicState,
    response,
    privateSubmission: null,
  });
  if (committed.status !== "ok") throw new Error(`Unable to seed state: ${committed.status}`);
  harness.game = committed.value;
}

function seedContributionWindow(state: GameState): void {
  for (const [index, playerId] of state.playerOrder.entries()) {
    const vesselInstanceId = state.vesselSupply.bowl.shift();
    if (vesselInstanceId === undefined) throw new Error("Missing Bowl vessel");
    const ceramicId = `${state.gameId}:privacy:${playerId}`;
    state.ceramics[ceramicId] = {
      id: ceramicId,
      vesselInstanceId,
      ownerId: playerId,
      shape: "bowl",
      stage: "loaded",
      glaze: index === 0 ? "grey_green" : "celadon",
      decoration: "plain",
      kilnSpaceId: index === 0 ? "middle_1" : "middle_2",
    };
  }
  state.players["P1"]!.techniques = [{ id: "T12", exhausted: false }];
  state.players["P1"]!.resources.wood = 3;
  state.players["P2"]!.resources.wood = 3;
  state.phase = {
    type: "firing_contributions",
    windowId: `${state.gameId}:privacy-window`,
    eligiblePlayerIds: ["P1", "P2"],
    submittedPlayerIds: [],
  };
  state.firingContext = null;
}

describe("V1.2.2 multiplayer privacy and reconnect", () => {
  it("keeps all four Starting Order offers private and never publishes returned cards", async () => {
    const harness = await startedHarness();
    await selectKilns(harness);
    expect(harness.game.game.phase.type).toBe("setup_starting_orders");
    if (harness.game.game.phase.type !== "setup_starting_orders") throw new Error("Expected setup choices");
    expect(harness.game.game.phase.offeredOrderIds).toEqual({});
    expect(harness.game.game.phase.initialOrderIds).toEqual({});
    expect(harness.game.game.decks).not.toHaveProperty("imperialRemaining");
    expect(harness.game.game.displays).not.toHaveProperty("imperial");
    expect(harness.game.game.discards).not.toHaveProperty("imperial");

    const head = await harness.store.loadHead(harness.game.room.id);
    if (head?.state.phase.type !== "setup_starting_orders") throw new Error("Missing private setup state");
    const offers = structuredClone(head.state.phase.offeredOrderIds);
    const p1 = connectionFor(harness, "P1");
    const p2 = connectionFor(harness, "P2");
    const p1Reconnect = valueOf(await harness.service.reconnect({ roomCode: p1.room.code, seatToken: p1.seatToken }));
    const p2Reconnect = valueOf(await harness.service.reconnect({ roomCode: p2.room.code, seatToken: p2.seatToken }));
    expect(p1Reconnect.ownPrivateDecision?.startingOrderIds).toEqual(offers["P1"]);
    expect(p2Reconnect.ownPrivateDecision?.startingOrderIds).toEqual(offers["P2"]);
    expect(p1Reconnect.ownPrivateDecision?.startingOrderIds).not.toEqual(offers["P2"]);

    while (harness.game.game.phase.type === "setup_starting_orders") {
      const actorId = currentDecisionActor(harness.game.game.phase);
      const offered = actorId === null ? undefined : offers[actorId];
      if (actorId === null || offered === undefined) throw new Error("Missing Starting Order choice");
      await command(harness, actorId, { type: "SUBMIT_STARTING_ORDERS", orderIds: offered.slice(0, 2) });
    }
    const returned = Object.entries(offers).flatMap(([playerId, orderIds]) =>
      orderIds.filter((orderId) => !harness.game.game.players[playerId]!.orderHand.includes(orderId)),
    );
    const publicJson = JSON.stringify(harness.game.game);
    for (const orderId of returned) expect(publicJson).not.toContain(`"${orderId}"`);
  });

  it("keeps Fuel Ledger sealed per seat, then reveals its effective Heat atomically", async () => {
    const harness = await startedHarness();
    await seedAuthoritativeState(harness, seedContributionWindow);
    const windowId = harness.game.game.phase.type === "firing_contributions"
      ? harness.game.game.phase.windowId
      : "";

    const first = await command(harness, "P1", {
      type: "SUBMIT_WOOD_CONTRIBUTION",
      windowId,
      card: "BANK",
      useFuelLedger: true,
    });
    expect(first.events).toEqual([{ type: "WOOD_SUBMITTED", playerId: "P1", windowId }]);
    expect(first.ownPendingContribution).toEqual({
      windowId,
      card: "BANK",
      useFuelLedger: true,
      submitted: true,
    });
    expect(JSON.stringify(first.game)).not.toContain("BANK");
    expect(JSON.stringify(first.game)).not.toContain("useFuelLedger");

    const p1 = connectionFor(harness, "P1");
    const p2 = connectionFor(harness, "P2");
    const ownReconnect = valueOf(await harness.service.reconnect({ roomCode: p1.room.code, seatToken: p1.seatToken }));
    const otherReconnect = valueOf(await harness.service.reconnect({ roomCode: p2.room.code, seatToken: p2.seatToken }));
    expect(ownReconnect.ownPendingContribution).toEqual(first.ownPendingContribution);
    expect(otherReconnect.ownPendingContribution).toBeNull();
    expect(otherReconnect.seat).toEqual(p2.seat);

    const revealed = await command(harness, "P2", {
      type: "SUBMIT_WOOD_CONTRIBUTION",
      windowId,
      card: "STOKE",
      useFuelLedger: false,
    });
    expect(revealed.events).toContainEqual({
      type: "WOOD_REVEALED",
      contributions: { P1: "BANK", P2: "STOKE" },
      effectiveHeatAdjustments: { P1: -2, P2: 1 },
    });
    expect(revealed.game.firingContext).toEqual(expect.objectContaining({
      contributions: { P1: "BANK", P2: "STOKE" },
      fuelLedgerUpgradedBy: ["P1"],
      baseHeat: 1,
    }));
    expect(revealed.game.players["P1"]!.resources.wood).toBe(1);
    expect(revealed.game.players["P2"]!.resources.wood).toBe(2);
    expect(revealed.ownPendingContribution).toBeNull();
  });

  it("rejects projection of pre-V1.2.2 or pre-schema-2 authoritative states", () => {
    const state = {
      schemaVersion: 1,
      rulesVersion: "1.1.6",
    } as unknown as GameState;
    expect(() => projectPublicGameState(state)).toThrow("Only schema-2 V1.2.2 games");
  });
});
