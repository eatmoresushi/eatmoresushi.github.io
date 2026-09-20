import { describe, expect, it } from "vitest";
import { currentDecisionActor } from "../../src/game/index.ts";
import type { GameAction, GameState, OrderId, PlayerId } from "../../src/game/index.ts";
import {
  AuthoritativeGameService,
  InMemoryMultiplayerStore,
  projectPublicGameState,
} from "../../src/multiplayer/index.ts";
import { addFinished, addGlazed, addLoaded, addShaped } from "./helpers.ts";
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
    command: { type: "TEST_SEED_V125_STATE" },
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
  state.firstPlayerId = "P2";
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

describe("V1.2.7 multiplayer privacy and reconnect", () => {
  it("reconnects all seats with the fixed public Shifu Heat marker and keeps Fire hidden until reveal", async () => {
    const harness = await startedHarness();
    let markedId = "";
    await seedAuthoritativeState(harness, (state) => {
      markedId = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1").id;
      state.players["P1"]!.kilnYardShifuUsedThisRound = true;
      state.players["P1"]!.kilnYardShifuCeramicId = markedId;
      state.players["P1"]!.resources.wood = 0;
      state.phase = { type: "firing_shifu_adjustment", queue: { actors: ["P1"], currentIndex: 0 } };
      state.firingContext = {
        round: state.round, contributors: ["P1"], contributions: { P1: "TEND" },
        fuelLedgerUpgradedBy: [], baseHeat: 2, fireModifier: null, globalHeat: null,
        kilnYardShifuAdjustments: [], ceramicResults: {},
      };
    });
    const result = await command(harness, "P1", { type: "RESOLVE_KILN_YARD_ADJUSTMENT", ceramicId: markedId, adjustment: -1 });
    expect(result.game.phase.type).toBe("firing_reveal_fire");
    for (const seat of harness.connections) {
      const connection = valueOf(await harness.service.reconnect({ roomCode: seat.room.code, seatToken: seat.seatToken }));
      expect(connection.game!.ceramics[markedId]).toMatchObject({ kilnSpaceId: "high_1", shifuHeatAdjustment: -1 });
      expect(connection.game!.players["P1"]!.kilnYardShifuCeramicId).toBeNull();
      expect(connection.game!.players["P1"]!.resources.wood).toBe(0);
      expect(connection.game!.firingContext).toMatchObject({
        baseHeat: 2, fireModifier: null, globalHeat: null,
        kilnYardShifuAdjustments: [{ playerId: "P1", ceramicId: markedId, adjustment: -1 }],
      });
    }
  });

  it("publishes every player's undelivered ceramic attributes to all seats on reconnect", async () => {
    const harness = await startedHarness();
    await seedAuthoritativeState(harness, (state) => {
      for (const [index, playerId] of state.playerOrder.entries()) {
        addShaped(state, playerId, "bowl");
        addGlazed(state, playerId, "plate", "white", "carved");
        addLoaded(state, playerId, "washer", "moon_white", "impressed", index === 0 ? "high_1" : "high_2", true);
        state.players[playerId]!.imperialKilnUnlocked = true;
        addLoaded(state, playerId, "censer", "grey_green", "crackle", "imperial");
        addFinished(state, playerId, "vase", "masterpiece", "celadon", "plain");
        addFinished(state, playerId, "bowl", "flawed", "white", "carved");
      }
    });
    const head = await harness.store.loadHead(harness.game.room.id);
    if (head === null) throw new Error("Missing authoritative game");
    expect(harness.game.game.ceramics).toEqual(head.state.ceramics);
    for (const seat of harness.connections) {
      const connection = valueOf(await harness.service.reconnect({ roomCode: seat.room.code, seatToken: seat.seatToken }));
      expect(connection.game!.ceramics).toEqual(head.state.ceramics);
      expect(Object.values(connection.game!.ceramics)).toHaveLength(12);
      for (const player of Object.values(connection.game!.players)) {
        expect(player.orderHand).toEqual([]);
        expect(player.orderHandCount).toBe(2);
      }
      expect(connection.ownPrivateDecision?.orderHand).toEqual(head.state.players[seat.seat.playerId]!.orderHand);
    }
  });

  it("keeps both dealt Orders private and restores only the authenticated seat's hand", async () => {
    const harness = await startedHarness();
    await selectKilns(harness);
    expect(harness.game.game.phase.type).toBe("setup_starting_tech");
    const head = await harness.store.loadHead(harness.game.room.id);
    if (head === null) throw new Error("Missing private game");
    for (const playerId of ["P1", "P2"]) {
      const seat = connectionFor(harness, playerId);
      const connection = valueOf(await harness.service.reconnect({ roomCode: seat.room.code, seatToken: seat.seatToken }));
      expect(connection.ownPrivateDecision?.orderHand).toEqual(head.state.players[playerId]!.orderHand);
      for (const player of Object.values(connection.game!.players)) {
        expect(player.orderHand).toEqual([]);
        expect(player.orderHandCount).toBe(2);
      }
      const json = JSON.stringify(connection.game);
      for (const player of Object.values(head.state.players)) for (const id of player.orderHand) expect(json).not.toContain(`"${id}"`);
    }
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
      fireModifier: null,
      globalHeat: null,
    }));
    expect(revealed.game.phase).toEqual({ type: "firing_reveal_fire", actorId: "P2" });
    expect(revealed.events.some((event) => event.type === "FIRE_REVEALED")).toBe(false);
    expect(revealed.game.players["P1"]!.resources.wood).toBe(1);
    expect(revealed.game.players["P2"]!.resources.wood).toBe(2);
    expect(revealed.ownPendingContribution).toBeNull();

    const denied = await harness.service.executeCommand({
      roomCode: p1.room.code,
      seatToken: p1.seatToken,
      commandId: "00000000-0000-4000-9001-000000000001",
      expectedRevision: revealed.revision,
      command: { type: "REVEAL_FIRE_CARD" },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("NOT_ACTIVE_PLAYER");

    const fired = await command(harness, "P2", { type: "REVEAL_FIRE_CARD" });
    expect(fired.events).toContainEqual(expect.objectContaining({
      type: "FIRE_REVEALED",
      baseHeat: 1,
    }));
  });

  it("reveals Colour Samples choices only to the acting player across reconnect", async () => {
    const harness = await startedHarness();
    let lookedAt: OrderId[] = [];
    await seedAuthoritativeState(harness, (state) => {
      lookedAt = state.marketDeck.splice(0, 3);
      const workerId = Object.keys(state.players["P1"]!.workers)[0];
      if (workerId === undefined || lookedAt.length !== 3) throw new Error("Missing private-choice fixture data");
      state.phase = {
        type: "work_office_orders",
        actorId: "P1",
        workerId,
        mode: "take_one",
        remainingTakes: 1,
        ordersTaken: 0,
        step: "colour_samples_choose",
        colourSamplesUsed: true,
        colourSamplesDeck: "market",
        colourSamplesChoices: [...lookedAt],
      };
    });

    if (harness.game.game.phase.type !== "work_office_orders") throw new Error("Missing public Colour Samples phase");
    expect(harness.game.game.phase.colourSamplesChoices).toEqual([]);
    for (const orderId of lookedAt) expect(JSON.stringify(harness.game.game)).not.toContain(`"${orderId}"`);

    const p1 = connectionFor(harness, "P1");
    const p2 = connectionFor(harness, "P2");
    const ownReconnect = valueOf(await harness.service.reconnect({ roomCode: p1.room.code, seatToken: p1.seatToken }));
    const otherReconnect = valueOf(await harness.service.reconnect({ roomCode: p2.room.code, seatToken: p2.seatToken }));
    expect(ownReconnect.ownPrivateDecision?.colourSamplesOrderIds).toEqual(lookedAt);
    expect(otherReconnect.ownPrivateDecision?.colourSamplesOrderIds).toEqual([]);
    for (const orderId of lookedAt) expect(JSON.stringify(otherReconnect)).not.toContain(`"${orderId}"`);
  });

  it("rejects projection of pre-V1.2.7 or pre-schema-4 authoritative states", () => {
    const state = {
      schemaVersion: 1,
      rulesVersion: "1.1.6",
    } as unknown as GameState;
    expect(() => projectPublicGameState(state)).toThrow("Only schema-4 V1.2.7 games");
  });
});
