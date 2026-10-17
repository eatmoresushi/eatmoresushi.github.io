/**
 * Version and fingerprint gate (DIG; DESIGN §4.6; ENGINE_V1.6.2_DELTA.md §9): only V1.6.2
 * rooms with the server's own r30 fingerprint and schema-7 saves continue. Anything else — a
 * V1.6.1 or V1.4 room, an older fingerprint inside the same version string (r29 included), a
 * missing fingerprint, a schema-6 or schema-5 save — is refused, never reinterpreted or
 * relabelled.
 */

import { describe, expect, it } from "vitest";
import { RULES_BEHAVIOUR_REVISION, rulesFingerprint } from "../../../src/game/index.ts";
import { CURRENT_ROOM_FINGERPRINT_PATTERN } from "../../../src/multiplayer/index.ts";
import type { StoredRoom } from "../../../src/multiplayer/index.ts";
import { advance, headState, lobby, started, tryCommand, valueOf, type Harness } from "./support.ts";

function storedRooms(harness: Harness): Map<string, StoredRoom> {
  return (harness.store as unknown as { rooms: Map<string, StoredRoom> }).rooms;
}

function relabel(harness: Harness, change: (room: StoredRoom) => void): void {
  for (const room of storedRooms(harness).values()) change(room);
}

describe("rules fingerprint gate", () => {
  it("stamps a new room with V1.6.2 and the r30 fingerprint the server runs", async () => {
    const harness = await lobby();
    expect(RULES_BEHAVIOUR_REVISION).toBe(30);
    const room = [...storedRooms(harness).values()][0]!;
    expect(room).toMatchObject({ rulesVersion: "1.6.2", contentVersion: "1.6.2", contentDigest: rulesFingerprint() });
    expect(room.contentDigest).toMatch(CURRENT_ROOM_FINGERPRINT_PATTERN);
    expect(room.contentDigest).toMatch(/^r30-/);
    expect(harness.host.room.rulesVersion).toBe("1.6.2");
  });

  it.each([23, 24, 25, 26, 27, 28, 29])("refuses an r%s fingerprint on reconnect, commands and computer turns", async (revision) => {
    const { harness } = await started();
    const previous = rulesFingerprint().replace(/^r\d+-/, `r${revision}-`);
    relabel(harness, (room) => {
      room.contentDigest = previous;
    });
    const reconnect = await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken });
    expect(reconnect.ok ? null : reconnect.error).toMatchObject({
      code: "RULES_FINGERPRINT_MISMATCH",
      details: { roomFingerprint: previous, serverFingerprint: rulesFingerprint() },
    });
    const commandResult = await tryCommand(harness, "P1", { type: "SELECT_KILN", kilnId: "RU" });
    expect(commandResult.ok ? null : commandResult.error.code).toBe("RULES_FINGERPRINT_MISMATCH");
    const computers = await advance(harness);
    expect(computers.ok ? null : computers.error.code).toBe("RULES_FINGERPRINT_MISMATCH");
    expect([...storedRooms(harness).values()].every((room) => room.contentDigest === previous)).toBe(true);
  });

  const fingerprintDamage: ReadonlyArray<readonly [string, (room: StoredRoom) => void]> = [
    ["missing", (room) => {
      delete (room as Partial<StoredRoom>).contentDigest;
    }],
    ["null", (room) => {
      room.contentDigest = null;
    }],
    ["foreign digest", (room) => {
      room.contentDigest = "r30-0000000000000000";
    }],
  ];

  it.each(fingerprintDamage)("fails closed on a %s fingerprint", async (_label, change) => {
    const { harness } = await started();
    relabel(harness, change);
    const reconnect = await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken });
    expect(reconnect.ok ? null : reconnect.error.code).toBe("RULES_FINGERPRINT_MISMATCH");
  });

  it("refuses a V1.6.1 room with its r29 fingerprint by version (never migrated)", async () => {
    const { harness } = await started();
    relabel(harness, (room) => {
      room.rulesVersion = "1.6.1";
      room.contentVersion = "1.6.1";
      room.contentDigest = rulesFingerprint().replace(/^r\d+-/, "r29-");
    });
    for (const result of [
      await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken }),
      await tryCommand(harness, "P1", { type: "SELECT_KILN", kilnId: "RU" }),
      await advance(harness),
    ]) {
      expect(result.ok ? null : result.error.code).toBe("UNSUPPORTED_RULES_VERSION");
    }
    expect([...storedRooms(harness).values()].every((room) => room.rulesVersion === "1.6.1")).toBe(true);
  });

  it("refuses a V1.4 room by version before looking at its fingerprint", async () => {
    const { harness } = await started();
    relabel(harness, (room) => {
      room.rulesVersion = "1.4";
      room.contentVersion = "1.4";
      room.contentDigest = "r28-0123456789abcdef";
    });
    for (const result of [
      await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken }),
      await tryCommand(harness, "P1", { type: "SELECT_KILN", kilnId: "RU" }),
      await advance(harness),
    ]) {
      expect(result.ok ? null : result.error.code).toBe("UNSUPPORTED_RULES_VERSION");
    }
  });

  it.each([
    [6, "1.6.1"],
    [6, "1.6.2"],
    [7, "1.6.1"],
  ] as const)("refuses a schema-%i %s save even inside a current room", async (schemaVersion, rulesVersion) => {
    const { harness } = await started();
    const heads = (harness.store as unknown as { heads: Map<string, { state: { schemaVersion: number; rulesVersion: string } }> }).heads;
    for (const head of heads.values()) {
      head.state.schemaVersion = schemaVersion;
      head.state.rulesVersion = rulesVersion;
    }
    const reconnect = await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken });
    expect(reconnect.ok ? null : reconnect.error.code).toBe("UNSUPPORTED_RULES_VERSION");
    const commandResult = await tryCommand(harness, "P1", { type: "SELECT_KILN", kilnId: "RU" });
    expect(commandResult.ok ? null : commandResult.error.code).toBe("UNSUPPORTED_RULES_VERSION");
  });

  it("refuses a schema-5 save even inside a current room", async () => {
    const { harness } = await started();
    const heads = (harness.store as unknown as { heads: Map<string, { state: { schemaVersion: number; rulesVersion: string } }> }).heads;
    for (const head of heads.values()) {
      head.state.schemaVersion = 5;
      head.state.rulesVersion = "1.4";
    }
    const reconnect = await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken });
    expect(reconnect.ok ? null : reconnect.error.code).toBe("UNSUPPORTED_RULES_VERSION");
    const commandResult = await tryCommand(harness, "P1", { type: "SELECT_KILN", kilnId: "RU" });
    expect(commandResult.ok ? null : commandResult.error.code).toBe("UNSUPPORTED_RULES_VERSION");
  });

  it.each(["1.4", "missing", "stale"])("refuses joining an incompatible %s lobby before creating a seat", async (kind) => {
    const harness = await lobby({ humans: 1 });
    relabel(harness, (room) => {
      if (kind === "1.4") room.rulesVersion = "1.4";
      else room.contentDigest = kind === "missing" ? null : "r28-0000000000000000";
    });
    const join = await harness.service.joinRoom({ roomCode: harness.roomCode, displayName: "Guest", authUserId: "late" });
    expect(join.ok).toBe(false);
    expect(await harness.store.getSeats(harness.roomId)).toHaveLength(1);
  });

  it("starts a game only with schema 7 and V1.6.2 and never relabels the room", async () => {
    const { harness } = await started();
    const state = await headState(harness);
    expect(state).toMatchObject({ schemaVersion: 7, rulesVersion: "1.6.2" });
    const reconnect = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: harness.host.seatToken }));
    expect(reconnect.room.rulesVersion).toBe("1.6.2");
    expect(reconnect.game).toMatchObject({ schemaVersion: 7, rulesVersion: "1.6.2" });
  });
});
