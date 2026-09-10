import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { rulesFingerprint } from "../../src/game/index.ts";
import { AuthoritativeGameService, InMemoryMultiplayerStore } from "../../src/multiplayer/index.ts";
import type { MultiplayerResult, RoomConnection, SecurityProvider } from "../../src/multiplayer/index.ts";

class TestSecurity implements SecurityProvider {
  private sequence = 0;
  randomId(): string { this.sequence += 1; return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`; }
  randomRoomCode(): string { this.sequence += 1; return `F${String(this.sequence).padStart(5, "0")}`; }
  randomSeatToken(): string { this.sequence += 1; return `fp-seat-${String(this.sequence).padStart(32, "0")}`; }
  randomSeed(): number { this.sequence += 1; return 90_000 + this.sequence; }
  async hashSecret(value: string): Promise<string> { return `secret:${value}`; }
  async hashJson(value: unknown): Promise<string> { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
}

function valueOf<T>(result: MultiplayerResult<T>): T {
  expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function host(): Promise<{ service: AuthoritativeGameService; store: InMemoryMultiplayerStore; room: RoomConnection }> {
  const store = new InMemoryMultiplayerStore();
  const service = new AuthoritativeGameService(store, new TestSecurity());
  const room = valueOf(await service.createRoom({ displayName: "Host", authUserId: "host-user" }));
  return { service, store, room };
}

/**
 * A room can carry the current rules *version* and still have been created under different
 * rules, because a change can land inside an unchanged version string -- Guan's hand limit
 * did, then Ding's extra-vessel cost and Jun's activation price. The version gate cannot see
 * it, so without the fingerprint an in-progress game is reinterpreted mid-session and
 * nothing is raised anywhere.
 */
describe("rules fingerprint gate", () => {
  it("stamps a new room with the fingerprint the server is running", async () => {
    const { store, room } = await host();
    const rooms = (store as unknown as { rooms: Map<string, { code: string; contentDigest: string | null }> }).rooms;
    const stored = [...rooms.values()].find((record) => record.code === room.room.code);
    expect(stored?.contentDigest).toBe(rulesFingerprint());
  });

  it("refuses a room created under a different ruleset rather than reinterpreting it", async () => {
    const { service, store, room } = await host();
    // Stand in for a room created before a rules change landed inside the same version.
    const stale = (store as unknown as { rooms: Map<string, { contentDigest: string | null }> }).rooms;
    for (const record of stale.values()) record.contentDigest = "r1-0000000000000000";

    const result = await service.reconnect({ roomCode: room.room.code, seatToken: room.seatToken });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RULES_FINGERPRINT_MISMATCH");
      expect(result.error.details).toMatchObject({ serverFingerprint: rulesFingerprint() });
    }
  });

  it("treats a missing fingerprint field as legacy rather than as a mismatch", async () => {
    // A room row returned without the column at all arrives as undefined, not null. Refusing
    // it would lock players out of a room whose rules never changed.
    const { service, store, room } = await host();
    const rooms = (store as unknown as { rooms: Map<string, Record<string, unknown>> }).rooms;
    for (const record of rooms.values()) delete record["contentDigest"];
    const result = await service.reconnect({ roomCode: room.room.code, seatToken: room.seatToken });
    expect(result.ok).toBe(true);
  });

  it("accepts a room predating fingerprinting, which cannot have one reconstructed", async () => {
    const { service, store, room } = await host();
    const legacy = (store as unknown as { rooms: Map<string, { contentDigest: string | null }> }).rooms;
    for (const record of legacy.values()) record.contentDigest = null;

    const result = await service.reconnect({ roomCode: room.room.code, seatToken: room.seatToken });
    expect(result.ok).toBe(true);
  });
});
