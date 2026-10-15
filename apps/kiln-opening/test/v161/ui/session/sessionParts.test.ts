/**
 * The pure parts of the session layer: event-log bookkeeping (§3.2), saved seats (§3.2,
 * §3.9) and computer-advance classification (§3.8).
 */

import { describe, expect, it } from "vitest";
import type { PublicGameEvent } from "../../../../src/game/index.ts";
import type { ComputerAdvanceSuccess, MultiplayerResult, PrivateEventRecord } from "../../../../src/multiplayer/index.ts";
import {
  COMPUTER_RACE_CODES,
  NON_HOST_ADVANCE_DELAY_MS,
  advanceDelayMs,
  classifyAdvanceResult,
  requestComputerAdvance,
} from "../../../../src/app/session/computerAdvance.ts";
import {
  attachSecrets,
  batchOf,
  contiguousCursor,
  entriesFromCommand,
  entriesFromComputerBatch,
  firstSequenceOf,
  mergeLog,
  mergeSecrets,
} from "../../../../src/app/session/eventLog.ts";
import type { LogEntry } from "../../../../src/app/session/gameSource.ts";
import {
  LAST_ROOM_KEY,
  LEGACY_V14_KEYS,
  REMOVE_LEGACY_V14_KEYS,
  SavedSeatStore,
  seatKey,
} from "../../../../src/app/session/savedSeat.ts";
import type { KeyValueStorage } from "../../../../src/app/session/savedSeat.ts";
import { FakeClock, MemoryStorage, failure, settle } from "./fakeGameApi.ts";

const event = (n: number): PublicGameEvent => ({ type: "WORKERS_RETURNED", round: n }) as unknown as PublicGameEvent;
const entry = (sequence: number, actorId = "P1", revision = 1): LogEntry => ({ sequence, revision, actorId, event: event(sequence) });
const secret = (sequence: number): PrivateEventRecord =>
  ({ roomId: "r", sequence, revision: 1, commandId: "c", actorId: "P1", event: { type: "ORDERS_DEALT", secret: { visibleTo: "P1" } } }) as unknown as PrivateEventRecord;

describe("eventLog", () => {
  it("numbers a command's events up to the game's eventSequence", () => {
    expect(firstSequenceOf({ eventSequence: 10 }, 3)).toBe(8);
    const entries = entriesFromCommand({ eventSequence: 10, revision: 4 }, [event(1), event(2), event(3)], "P2");
    expect(entries.map((e) => [e.sequence, e.revision, e.actorId])).toEqual([
      [8, 4, "P2"],
      [9, 4, "P2"],
      [10, 4, "P2"],
    ]);
  });

  it("takes a computer event's actor from its playerId, else the batch's first actor", () => {
    const named = { type: "WORKER_PLACED", playerId: "P3" } as unknown as PublicGameEvent;
    const entries = entriesFromComputerBatch({ eventSequence: 2, revision: 9 }, [named, event(2)], ["P2", "P3"]);
    expect(entries.map((e) => e.actorId)).toEqual(["P3", "P2"]);
  });

  it("adds only new sequences, keeps order, and returns the same array when nothing changes", () => {
    const log = [entry(1), entry(2)];
    const merged = mergeLog(log, [entry(2), entry(4), entry(3)], new Map());
    expect(merged.log.map((e) => e.sequence)).toEqual([1, 2, 3, 4]);
    expect(merged.added.map((e) => e.sequence)).toEqual([3, 4]);
    const again = mergeLog(merged.log, [entry(3), entry(4)], new Map());
    expect(again.log).toBe(merged.log);
    expect(again.added).toEqual([]);
  });

  it("lets authoritative records correct a synthesized entry without announcing it again", () => {
    const log = [entry(1, "P2", 5)];
    const corrected = mergeLog(log, [entry(1, "P3", 4)], new Map(), { authoritative: true });
    expect(corrected.added).toEqual([]);
    expect(corrected.log[0]).toMatchObject({ actorId: "P3", revision: 4 });
    expect(mergeLog(log, [entry(1, "P3", 4)], new Map()).log).toBe(log);
  });

  it("attaches own secrets by sequence, whichever arrives first", () => {
    const secrets = mergeSecrets(new Map(), [secret(2)]);
    const merged = mergeLog([], [entry(1), entry(2)], secrets);
    expect(merged.log[1]?.own?.type).toBe("ORDERS_DEALT");
    expect(merged.log[0]?.own).toBeUndefined();
    const later = mergeSecrets(secrets, [secret(1), secret(2)]);
    expect(later.size).toBe(2);
    expect(mergeSecrets(later, [secret(1)])).toBe(later);
    const attached = attachSecrets(merged.log, later);
    expect(attached[0]?.own?.type).toBe("ORDERS_DEALT");
    expect(attachSecrets(attached, later)).toBe(attached);
  });

  it("reads incrementally from the end of the contiguous run, so gaps are refetched", () => {
    expect(contiguousCursor([])).toBe(0);
    expect(contiguousCursor([entry(1), entry(2), entry(3)])).toBe(3);
    expect(contiguousCursor([entry(1), entry(2), entry(5), entry(6)])).toBe(2);
    expect(contiguousCursor([entry(4)])).toBe(0);
  });

  it("builds a batch only from added entries", () => {
    expect(batchOf([], "self", 3)).toBeNull();
    expect(batchOf([entry(7), entry(8)], "remote", 3)).toEqual({ revision: 3, firstSequence: 7, events: [event(7), event(8)], origin: "remote" });
  });
});

describe("savedSeat", () => {
  it("saves, finds and forgets a seat under the V1.6.1 keys", () => {
    const storage = new MemoryStorage();
    const seats = new SavedSeatStore(storage);
    expect(seats.last()).toBeNull();
    seats.save({ roomCode: "ab12c", seatToken: "token-1" });
    expect(storage.getItem(LAST_ROOM_KEY)).toBe("AB12C");
    expect(storage.getItem(seatKey("AB12C"))).toBe(JSON.stringify({ roomCode: "AB12C", seatToken: "token-1" }));
    expect(seats.last()).toEqual({ roomCode: "AB12C", seatToken: "token-1" });
    expect(seats.forRoom("ab12c")).toEqual({ roomCode: "AB12C", seatToken: "token-1" });
    seats.save({ roomCode: "ZZ999", seatToken: "token-2" });
    seats.forget("AB12C");
    expect(seats.last()).toEqual({ roomCode: "ZZ999", seatToken: "token-2" });
    seats.forget("ZZ999");
    expect(seats.last()).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("treats malformed values as no seat", () => {
    const storage = new MemoryStorage();
    storage.setItem(LAST_ROOM_KEY, "R1");
    const seats = new SavedSeatStore(storage);
    for (const raw of ["{", "null", "[]", JSON.stringify({ roomCode: "R1" }), JSON.stringify({ roomCode: "R1", seatToken: "" })]) {
      storage.setItem(seatKey("R1"), raw);
      expect(seats.last()).toBeNull();
    }
  });

  it("survives storage that throws or is missing", () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    for (const storage of [throwing, null]) {
      const seats = new SavedSeatStore(storage);
      expect(() => seats.save({ roomCode: "R1", seatToken: "t" })).not.toThrow();
      expect(seats.last()).toBeNull();
      expect(() => seats.forget("R1")).not.toThrow();
    }
  });

  it("leaves the V1.4 keys alone until cutover enables their removal", () => {
    expect(REMOVE_LEGACY_V14_KEYS).toBe(false);
    const storage = new MemoryStorage();
    for (const key of LEGACY_V14_KEYS) storage.setItem(key, "v14");
    const seats = new SavedSeatStore(storage);
    seats.removeLegacyKeys();
    expect(LEGACY_V14_KEYS.every((key) => storage.getItem(key) === "v14")).toBe(true);
    seats.removeLegacyKeys(true);
    expect(LEGACY_V14_KEYS.every((key) => storage.getItem(key) === null)).toBe(true);
  });
});

describe("computerAdvance", () => {
  it("classifies race codes, the ended session and failures", () => {
    expect([...COMPUTER_RACE_CODES].sort()).toEqual(["DUPLICATE_COMMAND", "PERSISTENCE_CONFLICT", "STALE_REVISION"]);
    for (const code of COMPUTER_RACE_CODES) expect(classifyAdvanceResult({ ok: false, error: failure(code) })).toEqual({ kind: "race" });
    expect(classifyAdvanceResult({ ok: false, error: failure("SESSION_ENDED") })).toEqual({ kind: "ended" });
    expect(classifyAdvanceResult({ ok: false, error: failure("COMPUTER_TURN_FAILED") })).toMatchObject({ kind: "failed", timedOut: false });
  });

  it("advances at once on the host and after 2s elsewhere", () => {
    expect(advanceDelayMs(true)).toBe(0);
    expect(advanceDelayMs(false)).toBe(NON_HOST_ADVANCE_DELAY_MS);
    expect(NON_HOST_ADVANCE_DELAY_MS).toBe(2_000);
  });

  it("turns a thrown transport error into a failure, never a throw", async () => {
    const outcome = await requestComputerAdvance({
      api: { advanceComputers: async () => Promise.reject(new TypeError("Failed to fetch")) },
      roomCode: "R",
      seatToken: "t",
      expectedRevision: 3,
      clock: new FakeClock(),
    });
    expect(outcome).toMatchObject({ kind: "failed", timedOut: false, error: { code: "SERVICE_UNAVAILABLE" } });
  });

  it("aborts and reports a timeout", async () => {
    const clock = new FakeClock();
    let aborted = false;
    const pending = requestComputerAdvance({
      api: {
        advanceComputers: (_room, _token, _revision, signal) =>
          new Promise<MultiplayerResult<ComputerAdvanceSuccess>>(() => {
            signal?.addEventListener("abort", () => {
              aborted = true;
            });
          }),
      },
      roomCode: "R",
      seatToken: "t",
      expectedRevision: 3,
      clock,
      timeoutMs: 20_000,
    });
    await settle();
    await clock.advance(20_000);
    expect(await pending).toMatchObject({ kind: "failed", timedOut: true, error: { code: "COMPUTER_TURN_FAILED", currentRevision: 3 } });
    expect(aborted).toBe(true);
    expect(clock.pending()).toBe(0);
  });
});
