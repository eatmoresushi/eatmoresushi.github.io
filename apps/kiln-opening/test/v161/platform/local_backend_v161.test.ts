/**
 * The V1.6.1 local backend (`tools/localBackendV161.ts`, UI plan §3.9): every
 * `TestHttpGameApi` operation including `list_private_events`, the seeded and policy-aware
 * `e2e_reset`, the `e2e_secret_ids` leak oracle, deterministic security, the HTTP middleware and
 * the Vite plugin hooks.
 */

import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  BrowserTestSecurity,
  LOCAL_BACKEND_V161_PATH,
  LocalBackendV161,
  localBackendV161Middleware,
  localBackendV161Plugin,
} from "../../../tools/localBackendV161.ts";
import { CANONICAL_COMPUTER_POLICY_VERSION, STRATEGIC_COMPUTER_POLICY } from "../../../src/multiplayer/index.ts";
import type {
  CommandSuccess,
  ComputerAdvanceSuccess,
  LobbySeatUpdateSuccess,
  MultiplayerResult,
  PrivateEventRecord,
  PublicEventRecord,
  RoomConnection,
} from "../../../src/multiplayer/index.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let commandCounter = 0;
const commandId = (): string => `00000000-0000-4000-a000-${String((commandCounter += 1)).padStart(12, "0")}`;

function ok<T>(result: unknown): T {
  const typed = result as MultiplayerResult<T>;
  expect(typed.ok, typed.ok ? undefined : JSON.stringify(typed.error)).toBe(true);
  if (!typed.ok) throw new Error(typed.error.code);
  return typed.value;
}

const silent = { log: () => undefined };

async function startedRoom(backend: LocalBackendV161) {
  const host = ok<RoomConnection>(await backend.handle({ operation: "create_room", displayName: "Lin" }, "user-host"));
  const lobby = ok<LobbySeatUpdateSuccess>(
    await backend.handle({ operation: "add_computer", roomCode: host.room.code, seatToken: host.seatToken, commandId: commandId() }, "user-host"),
  );
  const start = ok<CommandSuccess>(
    await backend.handle({ operation: "start_game", roomCode: host.room.code, seatToken: host.seatToken, commandId: commandId() }, "user-host"),
  );
  return { host, lobby, start };
}

describe("LocalBackendV161", () => {
  it("serves a room end to end, including list_private_events", async () => {
    const backend = new LocalBackendV161({ policy: "canonical", ...silent });
    const { host, lobby, start } = await startedRoom(backend);
    expect(host.room.code).toBe("T00001");
    expect(host.room.rulesVersion).toBe("1.6.2");
    expect(lobby.seats.find((seat) => seat.isComputer)?.aiPolicyVersion).toBe(CANONICAL_COMPUTER_POLICY_VERSION);
    expect(start.game.eventSequence).toBeGreaterThan(0);

    const publicEvents = ok<PublicEventRecord[]>(
      await backend.handle({ operation: "list_public_events", roomId: host.room.id, afterSequence: 0 }, "user-host"),
    );
    expect(publicEvents).toHaveLength(start.game.eventSequence);
    expect(JSON.stringify(publicEvents)).not.toContain("visibleTo");

    const secrets = ok<PrivateEventRecord[]>(
      await backend.handle({ operation: "list_private_events", roomCode: host.room.code, seatToken: host.seatToken, afterSequence: 0 }, "user-host"),
    );
    expect(secrets.length).toBeGreaterThan(0);
    expect(secrets.every((record) => (record.event as { secret?: { visibleTo?: string } }).secret?.visibleTo === host.seat.playerId)).toBe(true);
    expect(secrets.some((record) => record.event.type === "ORDERS_DEALT")).toBe(true);

    const reconnect = ok<{ game: { revision: number } }>(
      await backend.handle({ operation: "reconnect", roomCode: host.room.code, seatToken: host.seatToken }, "user-host"),
    );
    expect(reconnect.game.revision).toBe(start.game.revision);

    const advanced = await backend.handle(
      { operation: "advance_computers", roomCode: host.room.code, seatToken: host.seatToken, expectedRevision: start.game.revision },
      "user-host",
    );
    const advance = advanced as MultiplayerResult<ComputerAdvanceSuccess>;
    if (advance.ok) expect(advance.value.revision).toBeGreaterThanOrEqual(start.game.revision);
    else expect(["INVALID_REQUEST", "COMPUTER_TURN_FAILED"]).not.toContain(advance.error.code);

    const ended = await backend.handle(
      { operation: "end_session", roomCode: host.room.code, seatToken: host.seatToken, commandId: commandId() },
      "user-host",
    );
    expect(ok<{ room: { status: string } }>(ended).room.status).toBe("abandoned");
  });

  it("joins a second human and rejects a game action from a stale revision", async () => {
    const backend = new LocalBackendV161(silent);
    const host = ok<RoomConnection>(await backend.handle({ operation: "create_room", displayName: "Lin" }, "u1"));
    const guest = ok<RoomConnection>(await backend.handle({ operation: "join_room", roomCode: host.room.code, displayName: "Zhao" }, "u2"));
    expect(guest.seats).toHaveLength(2);
    const removed = await backend.handle(
      { operation: "remove_computer", roomCode: host.room.code, seatToken: host.seatToken, computerSeatId: guest.seat.seatId },
      "u1",
    );
    expect((removed as MultiplayerResult<unknown>).ok).toBe(false);
    ok(await backend.handle({ operation: "start_game", roomCode: host.room.code, seatToken: host.seatToken, commandId: commandId() }, "u1"));
    const stale = await backend.handle(
      { operation: "game_action", roomCode: host.room.code, seatToken: guest.seatToken, commandId: commandId(), expectedRevision: 0, command: { type: "END_TURN" } },
      "u2",
    );
    expect((stale as MultiplayerResult<unknown>).ok).toBe(false);
  });

  it("resets to a fresh store; the same seed deals the same game", async () => {
    const backend = new LocalBackendV161(silent);
    ok(await backend.handle({ operation: "e2e_reset", seed: 99, policy: "canonical" }, "x"));
    const first = (await startedRoom(backend)).start.game;
    ok(await backend.handle({ operation: "e2e_reset", seed: 99, policy: "canonical" }, "x"));
    const second = await startedRoom(backend);
    expect(second.host.room.code).toBe("T00001");
    expect(second.start.game).toEqual(first);
    ok(await backend.handle({ operation: "e2e_reset", seed: 100 }, "x"));
    const third = await startedRoom(backend);
    expect(third.lobby.seats.find((seat) => seat.isComputer)?.aiPolicyVersion).toBe(STRATEGIC_COMPUTER_POLICY.version);
    expect(third.start.game).not.toEqual(first);
  });

  it("e2e_secret_ids: another seat's hand and the decks are secret; the viewer's own hand and public IDs are not", async () => {
    const backend = new LocalBackendV161({ policy: "canonical", ...silent });
    const { host, start } = await startedRoom(backend);
    const reconnect = ok<RoomConnection>(await backend.handle({ operation: "reconnect", roomCode: host.room.code, seatToken: host.seatToken }, "user-host"));
    const hand = reconnect.ownPrivateView?.orderHand ?? [];
    expect(hand.length).toBeGreaterThan(0);
    const mine = ok<{ revision: number; ids: string[] }>(await backend.handle({ operation: "e2e_secret_ids", roomCode: host.room.code, viewerSeat: 0 }, "user-host"));
    const theirs = ok<{ revision: number; ids: string[] }>(await backend.handle({ operation: "e2e_secret_ids", roomCode: host.room.code.toLowerCase(), viewerSeat: 1 }, "user-host"));
    expect(mine.revision).toBe(start.game.revision);
    expect(mine.ids.length).toBeGreaterThan(20);
    for (const id of hand) {
      expect(mine.ids).not.toContain(id);
      expect(theirs.ids).toContain(id);
    }
    // Nothing public is secret: the display, the face-up Techs.
    const publicText = JSON.stringify(start.game);
    for (const id of mine.ids) expect(publicText).not.toMatch(new RegExp(`"${id}"`));
    expect(mine.ids).toEqual([...mine.ids].sort());
    expect((await backend.handle({ operation: "e2e_secret_ids", roomCode: "NOPE", viewerSeat: 0 }, "user-host")) as { ok: boolean }).toMatchObject({ ok: false });
    expect((await backend.handle({ operation: "e2e_secret_ids", roomCode: host.room.code, viewerSeat: 7 }, "user-host")) as { ok: boolean }).toMatchObject({ ok: false });
  });

  it("rejects an unknown policy and an unknown operation", async () => {
    const backend = new LocalBackendV161(silent);
    expect(await backend.handle({ operation: "e2e_reset", policy: "random" }, "x")).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(await backend.handle({ operation: "drop_tables" }, "x")).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });
});

describe("BrowserTestSecurity", () => {
  it("is deterministic per seed except for the seat-token nonce", async () => {
    const a = new BrowserTestSecurity(7, "nonce-a");
    const b = new BrowserTestSecurity(7, "nonce-b");
    expect([a.randomId(), a.randomRoomCode(), a.randomSeed()]).toEqual([b.randomId(), b.randomRoomCode(), b.randomSeed()]);
    expect(a.randomSeatToken()).not.toBe(b.randomSeatToken());
    expect(new BrowserTestSecurity(7).randomId()).toMatch(UUID);
    expect(a.randomSeed()).toBe(7);
    expect(await a.hashJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(await b.hashJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });
});

describe("local backend HTTP middleware and plugin", () => {
  it("answers POST JSON, refuses other methods and malformed bodies", async () => {
    const backend = new LocalBackendV161(silent);
    const middleware = localBackendV161Middleware(backend);
    const server = createServer((request, response) => middleware(request, response, () => undefined));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${LOCAL_BACKEND_V161_PATH}`;
    try {
      const created = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-e2e-user": "http-user" },
        body: JSON.stringify({ operation: "create_room", displayName: "Lin" }),
      });
      expect(created.status).toBe(200);
      expect(created.headers.get("content-type")).toBe("application/json");
      expect(((await created.json()) as { ok: boolean }).ok).toBe(true);

      const get = await fetch(url);
      expect(get.status).toBe(405);
      const malformed = await fetch(url, { method: "POST", body: "{nope" });
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
      const array = await fetch(url, { method: "POST", body: "[]" });
      expect(array.status).toBe(400);
    } finally {
      server.close();
    }
  });

  it("mounts at /test-api-v161 on both the dev and the preview server", () => {
    const plugin = localBackendV161Plugin(silent);
    const mounted: Array<[string, string]> = [];
    const fakeServer = (kind: string) => ({ middlewares: { use: (path: string) => mounted.push([kind, path]) } });
    expect(typeof plugin.configureServer).toBe("function");
    expect(typeof plugin.configurePreviewServer).toBe("function");
    (plugin.configureServer as unknown as (server: unknown) => void)(fakeServer("dev"));
    (plugin.configurePreviewServer as unknown as (server: unknown) => void)(fakeServer("preview"));
    expect(mounted).toEqual([
      ["dev", "/test-api-v161"],
      ["preview", "/test-api-v161"],
    ]);
  });
});
