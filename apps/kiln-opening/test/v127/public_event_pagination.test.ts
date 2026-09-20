import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicGameEvent } from "../../src/multiplayer/types";
import { createGameApi } from "../../src/multiplayer/client";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...await importOriginal<typeof import("@supabase/supabase-js")>(),
  createClient: mocks.createClient,
}));

interface EventRow {
  room_id: string;
  sequence: number;
  revision: number;
  command_id: string;
  actor_player_id: string;
  payload: PublicGameEvent;
}

function eventRow(sequence: number, roomId = "room-a"): EventRow {
  return {
    room_id: roomId,
    sequence,
    revision: sequence + 1,
    command_id: `command-${sequence}`,
    actor_player_id: "player-a",
    payload: { type: "FIRE_REVEALED", modifier: -1, baseHeat: 2, globalHeat: 1 },
  };
}

function publicEventApi(rows: EventRow[], options: { rowCap?: number; failPage?: number } = {}) {
  const pages: { roomId: string; cursor: number; limit: number }[] = [];
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: "session" } } });
  const from = vi.fn((table: string) => {
    expect(table).toBe("game_public_events");
    let roomId = "";
    let cursor = 0;
    const query = {
      select(columns: string) {
        expect(columns).toBe("room_id, sequence, revision, command_id, actor_player_id, payload");
        return query;
      },
      eq(column: string, value: string) {
        expect(column).toBe("room_id");
        roomId = value;
        return query;
      },
      gt(column: string, value: number) {
        expect(column).toBe("sequence");
        cursor = value;
        return query;
      },
      order(column: string, ordering: { ascending: boolean }) {
        expect(column).toBe("sequence");
        expect(ordering).toEqual({ ascending: true });
        return query;
      },
      async limit(limit: number) {
        pages.push({ roomId, cursor, limit });
        if (pages.length === options.failPage) return { data: null, error: new Error("Request failed") };
        return {
          data: rows
            .filter((row) => row.room_id === roomId && row.sequence > cursor)
            .sort((left, right) => left.sequence - right.sequence)
            .slice(0, Math.min(limit, options.rowCap ?? limit)),
          error: null,
        };
      },
    };
    return query;
  });
  mocks.createClient.mockReturnValue({ auth: { getSession }, from });
  return { api: createGameApi(), pages, getSession };
}

beforeEach(() => {
  vi.stubEnv("VITE_E2E_LOCAL_BACKEND", "0");
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  mocks.createClient.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("public event history pagination", () => {
  it("retrieves every page in sequence order with no duplicates and respects room and sequence filters", async () => {
    const rows = Array.from({ length: 1105 }, (_, index) => eventRow((index + 1) * 2)).reverse();
    const { api, pages, getSession } = publicEventApi([...rows, eventRow(9999, "room-b")]);

    const events = await api.listPublicEvents("room-a", 10);

    expect(events).toHaveLength(1100);
    expect(events.map((record) => record.sequence)).toEqual(Array.from({ length: 1100 }, (_, index) => (index + 6) * 2));
    expect(events[0]).toEqual({
      roomId: "room-a", sequence: 12, revision: 13, commandId: "command-12", actorId: "player-a",
      event: { type: "FIRE_REVEALED", modifier: -1, baseHeat: 2, globalHeat: 1 },
    });
    expect(pages).toEqual([10, 1010, 2010, 2210].map((cursor) => ({ roomId: "room-a", cursor, limit: 500 })));
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("keeps reading when the server caps pages below the requested size", async () => {
    const { api, pages } = publicEventApi(Array.from({ length: 9 }, (_, index) => eventRow(index + 1)), { rowCap: 4 });

    expect((await api.listPublicEvents("room-a")).map((record) => record.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pages.map((page) => page.cursor)).toEqual([0, 4, 8, 9]);
  });

  it("returns an empty history after one request when there are no matching events", async () => {
    const { api, pages } = publicEventApi([eventRow(1)]);

    expect(await api.listPublicEvents("room-a", 1)).toEqual([]);
    expect(pages).toHaveLength(1);
  });

  it.each([1, 2])("does not present partial history if page %i fails", async (failPage) => {
    const { api, pages } = publicEventApi([eventRow(1), eventRow(2), eventRow(3)], { rowCap: 2, failPage });

    expect(await api.listPublicEvents("room-a")).toEqual([]);
    expect(pages).toHaveLength(failPage);
  });
});
