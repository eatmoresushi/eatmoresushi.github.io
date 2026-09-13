import { describe, expect, it } from "vitest";
import type { GameState, PlayerId } from "../../src/game/index.ts";
import { ONLINE_COMPUTER_POLICY_VERSION } from "../../src/multiplayer/computerPlayer.ts";
import {
  AuthoritativeGameService,
  InMemoryMultiplayerStore,
  projectPublicGameState,
} from "../../src/multiplayer/index.ts";
import type {
  CommandSuccess,
  ComputerAdvanceSuccess,
  MultiplayerResult,
  RoomConnection,
  SecurityProvider,
  StoredSeat,
} from "../../src/multiplayer/index.ts";

class TestSecurity implements SecurityProvider {
  private sequence = 0;

  randomId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  randomRoomCode(): string {
    this.sequence += 1;
    return `C${String(this.sequence).padStart(5, "0")}`;
  }

  randomSeatToken(): string {
    this.sequence += 1;
    return `computer-seat-token-${String(this.sequence).padStart(32, "0")}`;
  }

  randomSeed(): number {
    this.sequence += 1;
    return 126_000 + this.sequence;
  }

  async hashSecret(value: string): Promise<string> {
    return `secret:${value}`;
  }

  async hashJson(value: unknown): Promise<string> {
    return `state:${JSON.stringify(value)}`;
  }
}

interface Harness {
  service: AuthoritativeGameService;
  store: InMemoryMultiplayerStore;
  security: TestSecurity;
  host: RoomConnection;
  game: CommandSuccess;
  commandSequence: number;
}

function valueOf<T>(result: MultiplayerResult<T>): T {
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function commandId(harness: Harness, group = "9000"): string {
  harness.commandSequence += 1;
  return `00000000-0000-4000-${group}-${String(harness.commandSequence).padStart(12, "0")}`;
}

async function startedHarness(computerCount = 1): Promise<Harness> {
  const security = new TestSecurity();
  const store = new InMemoryMultiplayerStore();
  const service = new AuthoritativeGameService(store, security);
  const host = valueOf(await service.createRoom({ displayName: "Host", authUserId: "host-user" }));
  const harness = {
    service,
    store,
    security,
    host,
    game: null as unknown as CommandSuccess,
    commandSequence: 0,
  };
  for (let index = 0; index < computerCount; index += 1) {
    valueOf(await service.addComputerSeat({
      roomCode: host.room.code,
      seatToken: host.seatToken,
      commandId: commandId(harness, "9100"),
    }));
  }
  harness.game = valueOf(await service.startGame({
    roomCode: host.room.code,
    seatToken: host.seatToken,
    commandId: commandId(harness, "9200"),
  }));
  return harness;
}

async function seedAuthoritativeState(
  harness: Harness,
  mutate: (state: GameState) => void,
): Promise<void> {
  const previousHead = await harness.store.loadHead(harness.game.room.id);
  if (previousHead === null) throw new Error("Missing authoritative head");
  const state = previousHead.state;
  mutate(state);
  state.revision = previousHead.revision + 1;
  const nextHead = {
    ...previousHead,
    revision: state.revision,
    state,
    stateHash: await harness.security.hashJson(state),
  };
  const publicState = projectPublicGameState(state);
  const seededCommandId = commandId(harness, "9800");
  const response: CommandSuccess = {
    commandId: seededCommandId,
    room: { ...harness.game.room, latestRevision: state.revision },
    actorId: "P1",
    revision: state.revision,
    game: publicState,
    events: [],
    ownPendingContribution: null,
  };
  const committed = await harness.store.commitTransition({
    roomId: harness.game.room.id,
    commandId: seededCommandId,
    actorId: "P1",
    expectedRevision: previousHead.revision,
    command: { type: "TEST_SEED_V126_COMPUTER_STATE" },
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

function internalSeats(harness: Harness): StoredSeat[] {
  const seats = (harness.store as unknown as { seats: Map<string, StoredSeat[]> }).seats
    .get(harness.game.room.id);
  if (seats === undefined) throw new Error("Missing stored seats");
  return seats;
}

async function advance(
  harness: Harness,
  expectedRevision = harness.game.revision,
): Promise<MultiplayerResult<ComputerAdvanceSuccess>> {
  return harness.service.advanceComputerTurns({
    roomCode: harness.host.room.code,
    seatToken: harness.host.seatToken,
    expectedRevision,
  });
}

function seedStartingTechniqueRun(state: GameState, computerIds: PlayerId[]): void {
  for (const player of Object.values(state.players)) player.startingTechniqueId = null;
  state.phase = {
    type: "setup_starting_tech",
    decisionOrder: [...computerIds, "P1"],
    currentIndex: 0,
  };
}

function takeBowl(state: GameState): string {
  const vesselInstanceId = state.vesselSupply.bowl.shift();
  if (vesselInstanceId === undefined) throw new Error("Missing Bowl vessel");
  return vesselInstanceId;
}

function seedContributionWindow(state: GameState): void {
  const humanCeramicId = `${state.gameId}:computer-privacy:P1`;
  const computerCeramicId = `${state.gameId}:computer-privacy:P2`;
  state.ceramics[humanCeramicId] = {
    id: humanCeramicId,
    vesselInstanceId: takeBowl(state),
    ownerId: "P1",
    shape: "bowl",
    stage: "loaded",
    glaze: "celadon",
    decoration: "plain",
    kilnSpaceId: "middle_1",
  };
  state.ceramics[computerCeramicId] = {
    id: computerCeramicId,
    vesselInstanceId: takeBowl(state),
    ownerId: "P2",
    shape: "bowl",
    stage: "loaded",
    glaze: "moon_white",
    decoration: "plain",
    kilnSpaceId: "middle_2",
  };
  state.players["P1"]!.resources.wood = 2;
  state.players["P2"]!.resources.wood = 3;
  state.players["P2"]!.techniques = [{ id: "T12", exhausted: false }];
  state.phase = {
    type: "firing_contributions",
    windowId: `${state.gameId}:computer-contribution-window`,
    eligiblePlayerIds: ["P2", "P1"],
    submittedPlayerIds: [],
  };
  state.firingContext = null;
  state.privateFirePeeks = {};
}

describe("V1.2.6 authoritative computer-turn integration", () => {
  it("advances consecutive computer decisions and stops cleanly at the human turn", async () => {
    const harness = await startedHarness(2);
    await seedAuthoritativeState(harness, (state) => seedStartingTechniqueRun(state, ["P2", "P3"]));
    const beforeRevision = harness.game.revision;

    const result = valueOf(await advance(harness));

    expect(result.advancedActions).toBe(2);
    expect(result.actorIds).toEqual(["P2", "P3"]);
    expect(result.stoppedReason).toBe("human_turn");
    expect(result.revision).toBe(beforeRevision + 2);
    expect(result.game.phase).toEqual(expect.objectContaining({
      type: "setup_starting_tech",
      currentIndex: 2,
    }));
    expect(result.game.players["P1"]!.startingTechniqueId).toBeNull();
    expect(result.game.players["P2"]!.startingTechniqueId).not.toBeNull();
    expect(result.game.players["P3"]!.startingTechniqueId).not.toBeNull();
  });

  it("keeps a computer Fuel Ledger choice sealed from the requesting human until reveal", async () => {
    const harness = await startedHarness();
    await seedAuthoritativeState(harness, seedContributionWindow);
    const windowId = harness.game.game.phase.type === "firing_contributions"
      ? harness.game.game.phase.windowId
      : "";

    const computerResult = valueOf(await advance(harness));

    expect(computerResult.advancedActions).toBe(1);
    expect(computerResult.actorIds).toEqual(["P2"]);
    expect(computerResult.stoppedReason).toBe("human_turn");
    expect(computerResult.events).toEqual([{ type: "WOOD_SUBMITTED", playerId: "P2", windowId }]);
    expect(computerResult.ownPendingContribution).toBeNull();
    expect(JSON.stringify(computerResult.game)).not.toContain("STOKE");
    expect(JSON.stringify(computerResult.game)).not.toContain("useFuelLedger");

    const privateSubmission = harness.store.audit().privateSubmissions.find(
      (submission) => submission.playerId === "P2" && submission.windowId === windowId,
    );
    expect(privateSubmission).toEqual(expect.objectContaining({
      card: "STOKE",
      useFuelLedger: true,
      revealedRevision: null,
    }));

    const revealed = valueOf(await harness.service.executeCommand({
      roomCode: harness.host.room.code,
      seatToken: harness.host.seatToken,
      commandId: commandId(harness, "9300"),
      expectedRevision: computerResult.revision,
      command: {
        type: "SUBMIT_WOOD_CONTRIBUTION",
        windowId,
        card: "TEND",
        useFuelLedger: false,
      },
    }));
    expect(revealed.events).toContainEqual({
      type: "WOOD_REVEALED",
      contributions: { P2: "STOKE", P1: "TEND" },
      effectiveHeatAdjustments: { P2: 2, P1: 0 },
    });
    expect(harness.store.audit().privateSubmissions.find(
      (submission) => submission.playerId === "P2" && submission.windowId === windowId,
    )?.revealedRevision).toBe(revealed.revision);
  });

  it("commits a concurrent computer decision at most once and rejects an explicitly stale retry", async () => {
    const harness = await startedHarness();
    await seedAuthoritativeState(harness, (state) => seedStartingTechniqueRun(state, ["P2"]));
    const beforeRevision = harness.game.revision;

    const concurrent = await Promise.all([
      advance(harness, beforeRevision),
      advance(harness, beforeRevision),
    ]);
    const successfulActions = concurrent.reduce((sum, result) =>
      sum + (result.ok ? result.value.advancedActions : 0), 0);
    expect(successfulActions).toBe(1);
    for (const result of concurrent) {
      if (!result.ok) expect(result.error.code).toBe("STALE_REVISION");
    }

    const head = await harness.store.loadHead(harness.game.room.id);
    expect(head?.revision).toBe(beforeRevision + 1);
    expect(head?.state.players["P2"]!.startingTechniqueId).not.toBeNull();
    const committedSelections = harness.store.audit().commands.filter(
      (record) => record.actorId === "P2" && (record.command as { type?: string }).type === "SELECT_STARTING_TECH",
    );
    expect(committedSelections).toHaveLength(1);

    const stale = await advance(harness, beforeRevision);
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.code).toBe("STALE_REVISION");
      expect(stale.error.currentRevision).toBe(beforeRevision + 1);
    }
  });

  it("continues after the 24-action safety limit when another authoritative request is made", async () => {
    const harness = await startedHarness();
    // Product rooms always retain a human. Turning the host into a configured computer is a
    // test-only way to keep an actor available long enough to exercise the service safety cap.
    const hostSeat = internalSeats(harness).find((seat) => seat.playerId === "P1");
    if (hostSeat === undefined) throw new Error("Missing host seat");
    hostSeat.isComputer = true;
    hostSeat.aiPolicyVersion = ONLINE_COMPUTER_POLICY_VERSION;
    hostSeat.aiSeed = 126_999;

    const first = valueOf(await advance(harness));
    expect(first.advancedActions).toBe(24);
    expect(first.stoppedReason).toBe("action_limit");

    const second = valueOf(await advance(harness, first.revision));
    expect(second.advancedActions).toBeGreaterThan(0);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(second.actorIds.length).toBe(second.advancedActions);
  });

  it("leaves state untouched on policy failure and can retry after the seat is repaired", async () => {
    const harness = await startedHarness();
    await seedAuthoritativeState(harness, (state) => seedStartingTechniqueRun(state, ["P2"]));
    const beforeRevision = harness.game.revision;
    const computerSeat = internalSeats(harness).find((seat) => seat.playerId === "P2");
    if (computerSeat === undefined) throw new Error("Missing computer seat");
    computerSeat.aiPolicyVersion = null;

    const failed = await advance(harness, beforeRevision);
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error.code).toBe("COMPUTER_TURN_FAILED");
      expect(failed.error.currentRevision).toBe(beforeRevision);
    }
    expect((await harness.store.loadHead(harness.game.room.id))?.revision).toBe(beforeRevision);
    expect(harness.store.audit().commands.some((record) => record.actorId === "P2")).toBe(false);

    computerSeat.aiPolicyVersion = ONLINE_COMPUTER_POLICY_VERSION;
    const recovered = valueOf(await advance(harness, beforeRevision));
    expect(recovered.advancedActions).toBe(1);
    expect(recovered.stoppedReason).toBe("human_turn");
    expect(recovered.revision).toBe(beforeRevision + 1);
  });
});
