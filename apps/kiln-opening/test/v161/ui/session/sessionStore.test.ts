/**
 * `SessionStore` against the real authoritative service (UI plan §3.1–3.9, §9.2 session
 * row): merging, event sequences, pings, reconnect, sending, resend, stale recovery,
 * computer advancement, parallel windows, privacy of storage, and saved seats.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decisionPrompt } from "../../../../src/game/index.ts";
import type { ActorView, AuthoritativeCommand, PlayerId } from "../../../../src/game/index.ts";
import { CANONICAL_COMPUTER_POLICY } from "../../../../src/multiplayer/index.ts";
import type { RoomConnection } from "../../../../src/multiplayer/index.ts";
import { LAST_ROOM_KEY, seatKey } from "../../../../src/app/session/savedSeat.ts";
import { SessionStore } from "../../../../src/app/session/sessionStore.ts";
import type { SessionStoreOptions } from "../../../../src/app/session/sessionStore.ts";
import {
  command as harnessCommand,
  exitCommand,
  lobby,
  openedFiringState,
  seedState,
  started,
  valueOf,
} from "../../platform/support.ts";
import type { Harness } from "../../platform/support.ts";
import { FakeClock, MemoryStorage, ServiceGameApi, actorViewOfStore, deferred, playerOf, settle } from "./fakeGameApi.ts";

interface Client {
  store: SessionStore;
  api: ServiceGameApi;
  clock: FakeClock;
  storage: MemoryStorage;
  playerId: PlayerId;
}

function storageWithSeat(connection: RoomConnection): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(seatKey(connection.room.code), JSON.stringify({ roomCode: connection.room.code, seatToken: connection.seatToken }));
  storage.setItem(LAST_ROOM_KEY, connection.room.code);
  storage.writes.length = 0;
  return storage;
}

/** A client of `connection`'s seat, resumed from its saved credential. */
async function clientFor(harness: Harness, connection: RoomConnection, options: Partial<SessionStoreOptions> = {}): Promise<Client> {
  const storage = storageWithSeat(connection);
  const api = new ServiceGameApi(harness.service, harness.store, `auth-${connection.seat.playerId}`);
  const clock = new FakeClock();
  const store = new SessionStore({ api, storage, clock, newCommandId: () => randomUUID(), ...options });
  const restored = await store.restore();
  expect(restored).toEqual({ ok: true });
  await settle();
  return { store, api, clock, storage, playerId: connection.seat.playerId };
}

/** The service's view of a seat, for acting on its behalf outside a store. */
async function serviceView(harness: Harness, connection: RoomConnection): Promise<ActorView> {
  const value = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connection.seatToken }));
  if (value.game === null || value.ownPrivateView === null) throw new Error("No game");
  return { viewerId: connection.seat.playerId, game: value.game, own: value.ownPrivateView };
}

function actorOf(client: Client): PlayerId | undefined {
  const view = client.store.getSnapshot().view;
  return view === null ? undefined : decisionPrompt(view.game).actorIds[0];
}

function exitFor(client: Client): AuthoritativeCommand {
  const commandToSend = exitCommand(actorViewOfStore(client.store));
  if (commandToSend === null) throw new Error("No exit command");
  return commandToSend;
}

function stripOwn(entries: readonly { sequence: number; revision: number; actorId: string; event: unknown }[]) {
  return entries.map(({ sequence, revision, actorId, event }) => ({ sequence, revision, actorId, event }));
}

describe("SessionStore: merging and the event log", () => {
  it("numbers the start's events from eventSequence, matching the store's records, with only own secrets attached", async () => {
    const harness = await lobby({ humans: 2 });
    const host = await clientFor(harness, harness.host);
    const guest = await clientFor(harness, harness.humans[1] as RoomConnection);
    expect(host.store.getSnapshot().view).toBeNull();

    expect(await host.store.start()).toEqual({ ok: true });
    const snapshot = host.store.getSnapshot();
    const records = await harness.store.listPublicEvents(harness.roomId, 0);
    expect(records.length).toBeGreaterThan(0);
    expect(snapshot.view?.game.eventSequence).toBe(records.length);
    expect(stripOwn(snapshot.log)).toEqual(stripOwn(records));
    expect(snapshot.lastBatch).toMatchObject({ origin: "self", firstSequence: 1, revision: snapshot.view?.game.revision });
    expect(snapshot.lastBatch?.events).toEqual(records.map((record) => record.event));

    const owned = snapshot.log.filter((entry) => entry.own !== undefined);
    expect(owned.length).toBeGreaterThan(0);
    for (const entry of owned) {
      expect((entry.own as { secret?: { visibleTo?: string } }).secret?.visibleTo).toBe(host.playerId);
      expect(entry.own?.type).toBe(entry.event.type);
    }
    // The public half never carries a secret.
    expect(snapshot.log.every((entry) => !("secret" in entry.event))).toBe(true);

    guest.api.ping();
    await settle();
    const remote = guest.store.getSnapshot();
    expect(remote.view?.game.revision).toBe(snapshot.view?.game.revision);
    expect(remote.lastBatch).toMatchObject({ origin: "remote", firstSequence: 1 });
    expect(stripOwn(remote.log)).toEqual(stripOwn(records));
    for (const entry of remote.log.filter((candidate) => candidate.own !== undefined)) {
      expect((entry.own as { secret?: { visibleTo?: string } }).secret?.visibleTo).toBe(guest.playerId);
    }
    expect(JSON.stringify(remote)).not.toContain(JSON.stringify(host.store.getSnapshot().view?.own?.orderHand));
  });

  it("reads events incrementally on a ping and reconnects only when there are new ones, or for the throttled status check", async () => {
    const { harness } = await started({ humans: 2 });
    const a = await clientFor(harness, harness.host);
    const b = await clientFor(harness, harness.humans[1] as RoomConnection);
    const cursor = a.store.getSnapshot().log.length;
    expect(cursor).toBe(a.store.getSnapshot().view?.game.eventSequence);

    const reconnectsBefore = a.api.callsOf("reconnect").length;
    a.api.ping();
    await settle();
    expect(a.api.callsOf("listPublicEvents").at(-1)?.args).toEqual([harness.roomId, cursor]);
    expect(a.api.callsOf("reconnect").length).toBe(reconnectsBefore);

    await a.clock.advance(5_000);
    a.api.ping();
    await settle();
    expect(a.api.callsOf("reconnect").length).toBe(reconnectsBefore + 1);

    // A move by the other client: one remote batch, one reconnect.
    const [actor, watcher] = actorOf(a) === a.playerId ? [a, b] : [b, a];
    const sent = await actor.store.submit(exitFor(actor));
    expect(sent.kind).toBe("success");
    const ownBatch = actor.store.getSnapshot().lastBatch;
    expect(ownBatch?.origin).toBe("self");

    const watcherReconnects = watcher.api.callsOf("reconnect").length;
    watcher.api.ping();
    await settle();
    const seen = watcher.store.getSnapshot();
    expect(watcher.api.callsOf("reconnect").length).toBe(watcherReconnects + 1);
    expect(seen.view?.game.revision).toBe(actor.store.getSnapshot().view?.game.revision);
    expect(seen.lastBatch).toMatchObject({ origin: "remote", firstSequence: ownBatch?.firstSequence, events: ownBatch?.events });

    // The actor's own batch is never announced again.
    actor.api.ping();
    await settle();
    expect(actor.store.getSnapshot().lastBatch).toBe(ownBatch);
  });

  it("keeps reconnect single-flight", async () => {
    const { harness } = await started({ humans: 2 });
    const a = await clientFor(harness, harness.host);
    const before = a.api.callsOf("reconnect").length;
    const gate = deferred();
    a.api.fault("reconnect", { kind: "hold_response", gate: gate.promise });
    const first = a.store.reconnect();
    const second = a.store.reconnect();
    await settle();
    expect(a.store.getSnapshot().status.reconnecting).toBe(true);
    expect(a.api.callsOf("reconnect").length).toBe(before + 1);
    gate.release();
    await Promise.all([first, second]);
    expect(a.api.callsOf("reconnect").length).toBe(before + 1);
    expect(a.store.getSnapshot().status.reconnecting).toBe(false);
  });

  it("runs the throttled room check quietly: only the player's Reconnect says Reconnecting", async () => {
    // Regression (owner review, 2026-10-17): the 5s room check showed the banner for one request,
    // which shifted the whole screen every few seconds.
    const { harness } = await started({ humans: 2 });
    const a = await clientFor(harness, harness.host);
    const before = a.api.callsOf("reconnect").length;
    const gate = deferred();
    a.api.fault("reconnect", { kind: "hold_response", gate: gate.promise });
    await a.clock.advance(5_000);
    a.api.ping();
    await settle();
    expect(a.api.callsOf("reconnect").length).toBe(before + 1);
    expect(a.store.getSnapshot().status.reconnecting).toBe(false);
    gate.release();
    await settle();
    expect(a.store.getSnapshot().status.reconnecting).toBe(false);
  });

  it("merges monotonically: an older response never replaces a newer view", async () => {
    const { harness } = await started({ humans: 2 });
    const a = await clientFor(harness, harness.host);
    const b = await clientFor(harness, harness.humans[1] as RoomConnection);
    const actor = actorOf(a) === a.playerId ? a : b;
    const gate = deferred();
    actor.api.fault("reconnect", { kind: "hold_response", gate: gate.promise });
    const late = actor.store.reconnect();
    await settle();
    const sent = await actor.store.submit(exitFor(actor));
    expect(sent.kind).toBe("success");
    const after = actor.store.getSnapshot();
    gate.release();
    await late;
    expect(actor.store.getSnapshot().view).toBe(after.view);
    expect(actor.store.getSnapshot().view?.game.revision).toBe(sent.kind === "success" ? sent.revision : -1);
  });

  it("creates a new view object on a same-revision reconnect, so `own` is never stale", async () => {
    const { harness } = await started({ humans: 2 });
    const a = await clientFor(harness, harness.host);
    const before = a.store.getSnapshot().view;
    await a.store.reconnect();
    const after = a.store.getSnapshot().view;
    expect(after?.game.revision).toBe(before?.game.revision);
    expect(after).not.toBe(before);
    expect(after).toEqual(before);
  });
});

describe("SessionStore: sending", () => {
  async function twoClients() {
    const { harness } = await started({ humans: 2 });
    const a = await clientFor(harness, harness.host);
    const b = await clientFor(harness, harness.humans[1] as RoomConnection);
    const actor = actorOf(a) === a.playerId ? a : b;
    return { harness, a, b, actor };
  }

  it("keeps a command whose response was lost as `unsent`, and Send again reuses its commandId and revision", async () => {
    const { harness, actor } = await twoClients();
    const revision = actor.store.getSnapshot().view?.game.revision ?? -1;
    actor.api.fault("executeCommand", { kind: "lose_response" });
    const first = await actor.store.submit(exitFor(actor));
    expect(first).toEqual({ kind: "unsent" });
    const unsent = actor.store.getSnapshot().status.unsent;
    expect(unsent).toMatchObject({ expectedRevision: revision });
    await settle();

    const resent = await actor.store.resend();
    expect(resent).toEqual({ kind: "success", revision: revision + 1 });
    const sends = actor.api.callsOf("executeCommand").map((call) => call.args[0] as { commandId: string; expectedRevision: number });
    expect(sends).toHaveLength(2);
    expect(sends[1]?.commandId).toBe(sends[0]?.commandId);
    expect(sends[1]?.expectedRevision).toBe(revision);
    // Committed exactly once.
    expect((await harness.store.loadHead(harness.roomId))?.revision).toBe(revision + 1);
    expect(actor.store.getSnapshot().status.unsent).toBeNull();
  });

  it("resends a command that never reached the service and commits it once", async () => {
    const { harness, actor } = await twoClients();
    const revision = actor.store.getSnapshot().view?.game.revision ?? -1;
    actor.api.fault("executeCommand", { kind: "throw" });
    expect(await actor.store.submit(exitFor(actor))).toEqual({ kind: "unsent" });
    expect((await harness.store.loadHead(harness.roomId))?.revision).toBe(revision);
    expect(await actor.store.resend()).toEqual({ kind: "success", revision: revision + 1 });
    expect(await actor.store.resend()).toEqual({ kind: "ignored" });
  });

  it("treats STALE_REVISION as nothing committed: reconnects, no error, no unsent", async () => {
    const { harness, actor } = await twoClients();
    const staleCommand = exitFor(actor);
    // The same seat moves elsewhere (another tab): the store does not know yet.
    const connection = harness.humans.find((human) => human.seat.playerId === actor.playerId) as RoomConnection;
    harness.revision = actor.store.getSnapshot().view?.game.revision ?? 0;
    await harnessCommand(harness, actor.playerId, staleCommand);
    const head = await harness.store.loadHead(harness.roomId);

    const outcome = await actor.store.submit(staleCommand);
    expect(outcome).toEqual({ kind: "stale" });
    const snapshot = actor.store.getSnapshot();
    expect(snapshot.view?.game.revision).toBe(head?.revision);
    expect(snapshot.status).toMatchObject({ sending: false, unsent: null, error: null });
    expect(connection.seat.playerId).toBe(actor.playerId);
  });

  it("stores a rule rejection as a code and keeps the view", async () => {
    const { a, b, actor } = await twoClients();
    const other = actor === a ? b : a;
    const view = other.store.getSnapshot().view;
    const outcome = await other.store.submit(exitFor(actor));
    expect(outcome.kind).toBe("rejected");
    const error = other.store.getSnapshot().status.error;
    expect(error?.kind).toBe("rule");
    expect(other.store.getSnapshot().view).toBe(view);
    other.store.clearError();
    expect(other.store.getSnapshot().status.error).toBeNull();
  });

  it("retries once with a new commandId on DUPLICATE_COMMAND", async () => {
    const { actor } = await twoClients();
    actor.api.fault("executeCommand", { kind: "error", code: "DUPLICATE_COMMAND" });
    const outcome = await actor.store.submit(exitFor(actor));
    expect(outcome.kind).toBe("success");
    const ids = actor.api.callsOf("executeCommand").map((call) => (call.args[0] as { commandId: string }).commandId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("ignores a second submit while one is in flight", async () => {
    const { actor } = await twoClients();
    const commandToSend = exitFor(actor);
    const first = actor.store.submit(commandToSend);
    expect(actor.store.getSnapshot().status.sending).toBe(true);
    expect(await actor.store.submit(commandToSend)).toEqual({ kind: "ignored" });
    expect((await first).kind).toBe("success");
    expect(actor.store.getSnapshot().status.sending).toBe(false);
  });

  it("routes SESSION_ENDED to the ended room", async () => {
    const { a, b } = await twoClients();
    expect(await a.store.endSession()).toEqual({ ok: true });
    expect(a.store.getSnapshot().room?.status).toBe("abandoned");
    const outcome = await b.store.submit({ type: "END_TURN" } as AuthoritativeCommand);
    expect(outcome).toEqual({ kind: "ended" });
    expect(b.store.getSnapshot().room?.status).toBe("abandoned");
    expect(b.store.getSnapshot().status.error).toEqual({ kind: "mp", code: "SESSION_ENDED" });
  });
});

describe("SessionStore: parallel and secret windows", () => {
  it("keeps the viewer's sealed Contribution across another player's submission, and never shows it to others", async () => {
    const { harness } = await started({ humans: 3 });
    const seeded = await seedState(harness, (gameId) =>
      openedFiringState({
        gameId,
        players: [
          { id: "P1", techs: ["T12"], resources: { wood: 4 } },
          { id: "P2", resources: { wood: 2 } },
          { id: "P3", resources: { wood: 2 } },
        ],
        ceramics: [
          { owner: "P1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
          { owner: "P2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_2" },
          { owner: "P3", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
        ],
      }),
    );
    if (seeded.phase.type !== "firing_contributions") throw new Error("Expected the Contribution window");
    const windowId = seeded.phase.windowId;
    const p1 = await clientFor(harness, harness.humans[0] as RoomConnection);
    const p3 = await clientFor(harness, harness.humans[2] as RoomConnection);
    expect(playerOf(p1.store)).toBe("P1");

    const sealed = await p1.store.submit({ type: "SUBMIT_CONTRIBUTION", windowId, card: "STOKE", fuelLedger: true });
    expect(sealed.kind).toBe("success");
    expect(p1.store.getSnapshot().view?.own?.pendingContribution).toEqual({ card: "STOKE", fuelLedger: true, windowId });

    await harnessCommand(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND", fuelLedger: false });
    p1.api.ping();
    p3.api.ping();
    await settle();

    const mine = p1.store.getSnapshot();
    expect(mine.lastBatch?.origin).toBe("remote");
    expect(JSON.stringify(mine.lastBatch?.events)).not.toContain("TEND");
    expect(mine.view?.own?.pendingContribution).toEqual({ card: "STOKE", fuelLedger: true, windowId });
    const phase = mine.view?.game.phase;
    expect(phase?.type === "firing_contributions" ? phase.submittedPlayerIds : []).toEqual(expect.arrayContaining(["P1", "P2"]));

    const theirs = p3.store.getSnapshot();
    expect(theirs.view?.own?.pendingContribution).toBeNull();
    expect(JSON.stringify(theirs)).not.toContain("STOKE");
  });
});

describe("SessionStore: computer seats", () => {
  const canonical = { service: { computerPolicy: CANONICAL_COMPUTER_POLICY } };

  /** Plays the human's exits until the store has asked the service to advance computers. */
  async function untilAdvanceCalled(client: Client): Promise<void> {
    for (let step = 0; step < 60; step += 1) {
      await settle();
      if (client.api.callsOf("advanceComputers").length > 0) return;
      const view = client.store.getSnapshot().view;
      if (view === null) throw new Error("No view");
      if (!decisionPrompt(view.game).actorIds.includes(client.playerId)) throw new Error("Neither the client nor a computer acts");
      expect((await client.store.submit(exitFor(client))).kind).toBe("success");
    }
    throw new Error("No computer decision reached");
  }

  async function hostWithComputer() {
    const harness = await lobby({ humans: 1, computers: 1, ...canonical });
    const host = await clientFor(harness, harness.host);
    const computers = new Set(host.store.getSnapshot().seats.filter((seat) => seat.isComputer).map((seat) => seat.playerId));
    expect(computers.size).toBe(1);
    return { harness, host, computers };
  }

  it("the host advances computers at once and the loop continues until a human acts", async () => {
    const { host, computers } = await hostWithComputer();
    expect(await host.store.start()).toEqual({ ok: true });
    await untilAdvanceCalled(host);
    await settle();
    const view = host.store.getSnapshot().view;
    expect(view).not.toBeNull();
    const actors = decisionPrompt(view!.game).actorIds;
    expect(actors.some((id) => computers.has(id))).toBe(false);
    expect(host.api.callsOf("advanceComputers").length).toBeGreaterThan(0);
    const computerBatch = host.store.getSnapshot().log.filter((entry) => computers.has(entry.actorId));
    expect(computerBatch.length).toBeGreaterThan(0);
    expect(host.store.getSnapshot().status).toMatchObject({ advancingComputers: false, computerFailure: null });
    // The log matches the store's authoritative records, actors and revisions included.
    const harnessRecords = await host.api.store.listPublicEvents(host.store.getSnapshot().room!.id, 0);
    expect(stripOwn(host.store.getSnapshot().log)).toEqual(stripOwn(harnessRecords));
  });

  it.each(["STALE_REVISION", "PERSISTENCE_CONFLICT", "DUPLICATE_COMMAND"] as const)(
    "%s from advance_computers reconnects without a latch, then retries after the backoff",
    async (code) => {
      const { host, computers } = await hostWithComputer();
      host.api.fault("advanceComputers", { kind: "error", code });
      expect(await host.store.start()).toEqual({ ok: true });
      const reconnects = host.api.callsOf("reconnect").length;
      await untilAdvanceCalled(host);
      await settle();
      expect(host.api.callsOf("advanceComputers").length).toBe(1);
      expect(host.api.callsOf("reconnect").length).toBe(reconnects + 1);
      expect(host.store.getSnapshot().status.computerFailure).toBeNull();
      expect(decisionPrompt(host.store.getSnapshot().view!.game).actorIds.some((id) => computers.has(id))).toBe(true);
      await host.clock.advance(1_999);
      expect(host.api.callsOf("advanceComputers").length).toBe(1);
      await host.clock.advance(1);
      await settle();
      expect(host.api.callsOf("advanceComputers").length).toBeGreaterThanOrEqual(2);
      expect(host.store.getSnapshot().status.computerFailure).toBeNull();
    },
  );

  it("latches COMPUTER_TURN_FAILED for its revision; Retry clears it", async () => {
    const { host } = await hostWithComputer();
    host.api.fault("advanceComputers", { kind: "error", code: "COMPUTER_TURN_FAILED" });
    expect(await host.store.start()).toEqual({ ok: true });
    await untilAdvanceCalled(host);
    await settle();
    const revision = host.store.getSnapshot().view?.game.revision;
    const failure = host.store.getSnapshot().status.computerFailure;
    expect(failure).toMatchObject({ revision, timedOut: false, error: { kind: "mp", code: "COMPUTER_TURN_FAILED" } });
    const calls = host.api.callsOf("advanceComputers").length;
    await host.clock.advance(30_000);
    host.api.ping();
    await settle();
    expect(host.api.callsOf("advanceComputers").length).toBe(calls);

    host.store.retryComputers();
    await settle();
    expect(host.api.callsOf("advanceComputers").length).toBe(calls + 1);
    expect(host.store.getSnapshot().status.computerFailure).toBeNull();
  });

  it("latches a timeout after 20s and aborts the request", async () => {
    const { host } = await hostWithComputer();
    host.api.fault("advanceComputers", { kind: "hang" });
    expect(await host.store.start()).toEqual({ ok: true });
    await untilAdvanceCalled(host);
    await settle();
    expect(host.store.getSnapshot().status.advancingComputers).toBe(true);
    await host.clock.advance(19_999);
    expect(host.store.getSnapshot().status.computerFailure).toBeNull();
    await host.clock.advance(1);
    await settle();
    expect(host.store.getSnapshot().status).toMatchObject({
      advancingComputers: false,
      computerFailure: { timedOut: true, error: { kind: "mp", code: "COMPUTER_TURN_FAILED" } },
    });
  });

  it("a non-host client waits 2s, and only advances if the revision is still current", async () => {
    const { harness } = await started({ humans: 2, computers: 1, ...canonical });
    const guest = await clientFor(harness, harness.humans[1] as RoomConnection);
    const computers = new Set(guest.store.getSnapshot().seats.filter((seat) => seat.isComputer).map((seat) => seat.playerId));
    // Play the humans' exits (the host through the service) until a computer acts.
    for (let step = 0; step < 60; step += 1) {
      const view = guest.store.getSnapshot().view!;
      const actors = decisionPrompt(view.game).actorIds;
      if (actors.some((id) => computers.has(id))) break;
      if (actors.includes(guest.playerId)) {
        expect((await guest.store.submit(exitFor(guest))).kind).toBe("success");
      } else {
        const hostView = await serviceView(harness, harness.host);
        harness.revision = hostView.game.revision;
        await harnessCommand(harness, harness.host.seat.playerId, exitCommand(hostView)!);
        guest.api.ping();
      }
      await settle();
    }
    expect(decisionPrompt(guest.store.getSnapshot().view!.game).actorIds.some((id) => computers.has(id))).toBe(true);
    expect(guest.api.callsOf("advanceComputers")).toHaveLength(0);
    await guest.clock.advance(1_999);
    expect(guest.api.callsOf("advanceComputers")).toHaveLength(0);
    await guest.clock.advance(1);
    await settle();
    expect(guest.api.callsOf("advanceComputers").length).toBeGreaterThan(0);
  });
});

describe("SessionStore: lobby, saved seats and storage", () => {
  function freshClient(harness: Harness, user: string, storage = new MemoryStorage()): Client {
    const api = new ServiceGameApi(harness.service, harness.store, user);
    const clock = new FakeClock();
    const store = new SessionStore({ api, storage, clock, newCommandId: () => randomUUID() });
    return { store, api, clock, storage, playerId: "" };
  }

  it("creates, joins, adds and removes computers, and sees seats join through the lobby status check", async () => {
    const harness = await lobby({ humans: 1 });
    const host = freshClient(harness, "auth-new-host");
    expect(await host.store.create("Lin")).toEqual({ ok: true });
    const room = host.store.getSnapshot().room!;
    expect(host.store.getSnapshot().seat?.isHost).toBe(true);
    expect(host.store.getSnapshot().savedRoomCode).toBe(room.code);

    const guest = freshClient(harness, "auth-new-guest");
    expect(await guest.store.join(room.code.toLowerCase(), "Zhao")).toEqual({ ok: true });
    expect(guest.store.getSnapshot().seats).toHaveLength(2);

    await host.clock.advance(1_000);
    host.api.ping();
    await settle();
    expect(host.store.getSnapshot().seats).toHaveLength(2);

    expect(await host.store.addComputer()).toEqual({ ok: true });
    const computer = host.store.getSnapshot().seats.find((seat) => seat.isComputer);
    expect(computer).toBeDefined();
    expect(await host.store.removeComputer(computer!.seatId)).toEqual({ ok: true });
    expect(host.store.getSnapshot().seats.some((seat) => seat.isComputer)).toBe(false);

    const notHost = await guest.store.addComputer();
    expect(notHost.ok).toBe(false);
    expect(guest.store.getSnapshot().status.error).toMatchObject({ kind: "mp", code: "HOST_ONLY" });
  });

  it("writes only the seat credential to storage, never hands, looks or secrets", async () => {
    const harness = await lobby({ humans: 1 });
    const client = freshClient(harness, "auth-storage");
    await client.store.create("Lin");
    const guest = freshClient(harness, "auth-storage-guest");
    await guest.store.join(client.store.getSnapshot().room!.code, "Su");
    await client.store.start();
    const self = { ...client, playerId: playerOf(client.store) };
    for (let step = 0; step < 6; step += 1) {
      if (actorOf(self) !== self.playerId) break;
      await self.store.submit(exitFor(self));
    }
    expect(client.store.getSnapshot().view?.own?.orderHand.length).toBeGreaterThan(0);
    const keys = new Set(client.storage.writes.map((write) => write.key));
    const code = client.store.getSnapshot().room!.code;
    expect([...keys].sort()).toEqual([LAST_ROOM_KEY, seatKey(code)].sort());
    for (const write of client.storage.writes) {
      if (write.key === LAST_ROOM_KEY) expect(write.value).toBe(code);
      else expect(Object.keys(JSON.parse(write.value) as object).sort()).toEqual(["roomCode", "seatToken"]);
    }
    const everything = JSON.stringify([...client.storage.map.entries()]);
    for (const orderId of client.store.getSnapshot().view!.own!.orderHand) expect(everything).not.toContain(orderId);
  });

  it.each(["AUTHENTICATION_FAILED", "ROOM_NOT_FOUND", "UNSUPPORTED_RULES_VERSION", "RULES_FINGERPRINT_MISMATCH"] as const)(
    "forgets the saved seat on %s",
    async (code) => {
      const { harness } = await started({ humans: 1, computers: 1 });
      const storage = storageWithSeat(harness.host);
      const api = new ServiceGameApi(harness.service, harness.store);
      api.fault("reconnect", { kind: "error", code });
      const store = new SessionStore({ api, storage, clock: new FakeClock() });
      expect(store.getSnapshot().savedRoomCode).toBe(harness.roomCode);
      const outcome = await store.restore();
      expect(outcome).toEqual({ ok: false, error: { kind: "mp", code, details: {} } });
      expect(storage.getItem(seatKey(harness.roomCode))).toBeNull();
      expect(storage.getItem(LAST_ROOM_KEY)).toBeNull();
      expect(store.getSnapshot()).toMatchObject({ room: null, view: null, savedRoomCode: null, status: { error: { code } } });
    },
  );

  it("keeps the saved seat after a transport failure and reports offline", async () => {
    const { harness } = await started({ humans: 1, computers: 1 });
    const storage = storageWithSeat(harness.host);
    const api = new ServiceGameApi(harness.service, harness.store);
    api.fault("reconnect", { kind: "throw" });
    const store = new SessionStore({ api, storage, clock: new FakeClock() });
    const outcome = await store.restore();
    expect(outcome?.ok).toBe(false);
    expect(storage.getItem(seatKey(harness.roomCode))).not.toBeNull();
    expect(store.getSnapshot()).toMatchObject({ savedRoomCode: harness.roomCode, status: { connection: "offline" } });
    expect(await store.resume()).toEqual({ ok: true });
    expect(store.getSnapshot().status.connection).toBe("live");
  });

  it("forgets a seat whose token the service rejects (no fault injection)", async () => {
    const { harness } = await started({ humans: 1, computers: 1 });
    const storage = storageWithSeat({ ...harness.host, seatToken: "x".repeat(40) });
    const store = new SessionStore({ api: new ServiceGameApi(harness.service, harness.store), storage, clock: new FakeClock() });
    const outcome = await store.restore();
    expect(outcome?.ok).toBe(false);
    expect(store.getSnapshot().savedRoomCode).toBeNull();
  });

  it("restores the full log once on resume, without announcing it", async () => {
    const { harness } = await started({ humans: 2 });
    const client = await clientFor(harness, harness.host);
    const snapshot = client.store.getSnapshot();
    expect(snapshot.log.length).toBe(snapshot.view?.game.eventSequence);
    expect(snapshot.lastBatch).toBeNull();
    expect(client.api.callsOf("listPublicEvents")[0]?.args).toEqual([harness.roomId, 0]);
    expect(snapshot.log.some((entry) => entry.own !== undefined)).toBe(true);
  });

  it("leave keeps the seat and unsubscribes; forgetSeat removes it", async () => {
    const { harness } = await started({ humans: 2 });
    const client = await clientFor(harness, harness.host);
    expect(client.api.subscriberCount()).toBe(1);
    client.store.leave();
    expect(client.api.subscriberCount()).toBe(0);
    expect(client.store.getSnapshot()).toMatchObject({ room: null, view: null, savedRoomCode: harness.roomCode });
    expect(await client.store.resume()).toEqual({ ok: true });
    expect(client.store.getSnapshot().view).not.toBeNull();
    client.store.forgetSeat();
    expect(client.store.getSnapshot()).toMatchObject({ room: null, savedRoomCode: null });
    expect(client.storage.getItem(seatKey(harness.roomCode))).toBeNull();
  });

  it("reconnects when the page becomes visible", async () => {
    const { harness } = await started({ humans: 2 });
    const client = await clientFor(harness, harness.host);
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
      document: {
        visibilityState: "visible",
        addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
        removeEventListener: (type: string) => listeners.delete(type),
      },
    };
    const detach = client.store.attachToWindow(target);
    const before = client.api.callsOf("reconnect").length;
    listeners.get("visibilitychange")?.();
    await settle();
    expect(client.api.callsOf("reconnect").length).toBe(before + 1);
    listeners.get("offline")?.();
    expect(client.store.getSnapshot().status.connection).toBe("offline");
    listeners.get("online")?.();
    await settle();
    expect(client.store.getSnapshot().status.connection).toBe("live");
    detach();
    expect(listeners.size).toBe(0);
  });

  it("serves the same snapshot to getServerSnapshot and replaces it on change", async () => {
    const { harness } = await started({ humans: 2 });
    const client = await clientFor(harness, harness.host);
    expect(client.store.getServerSnapshot()).toBe(client.store.getSnapshot());
    let notified = 0;
    const unsubscribe = client.store.subscribe(() => {
      notified += 1;
    });
    const before = client.store.getSnapshot();
    await client.store.reconnect();
    expect(notified).toBeGreaterThan(0);
    expect(client.store.getSnapshot()).not.toBe(before);
    expect(Object.isFrozen(client.store.getSnapshot())).toBe(true);
    unsubscribe();
  });
});
