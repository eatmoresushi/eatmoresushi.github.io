/**
 * The browser client: it refuses snapshots from any other rules version or schema (and
 * drops their private payload), and routes `advance_computers` on `decisionPrompt` alone
 * in every decision mode (DESIGN §3.4, §4.6).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectPublicState } from "../../../src/game/index.ts";
import type { GamePhase } from "../../../src/game/index.ts";
import { createGameApi, shouldAdvanceComputers, snapshotCompatibilityError } from "../../../src/multiplayer/client.ts";
import type { PublicSeat } from "../../../src/multiplayer/index.ts";
import { seatState } from "./support.ts";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), invoke: vi.fn() }));

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: mocks.createClient,
}));

beforeEach(() => {
  vi.stubEnv("VITE_E2E_LOCAL_BACKEND", "0");
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
  mocks.invoke.mockReset();
  mocks.createClient.mockReturnValue({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "session" } } }) },
    functions: { invoke: mocks.invoke },
  });
});

afterEach(() => vi.unstubAllEnvs());

function snapshot(rulesVersion = "1.6.2", schemaVersion = 7) {
  return {
    ok: true,
    value: {
      room: { rulesVersion, latestRevision: 18 },
      game: { rulesVersion, schemaVersion, revision: 18 },
      ownPrivateView: { orderHand: ["PRIVATE_ORDER"] },
      seatToken: "private-seat-token",
    },
  };
}

function respondsWith(data: unknown) {
  mocks.invoke.mockResolvedValue({ data, error: null });
  return createGameApi();
}

function seat(playerId: string, isComputer: boolean): PublicSeat {
  return {
    seatId: `seat-${playerId}`,
    roomId: "room",
    playerId,
    seatIndex: Number(playerId.slice(1)) - 1,
    displayName: playerId,
    colour: "ink",
    isHost: playerId === "P1",
    isComputer,
    aiPolicyVersion: isComputer ? "rules-v1.6.2-canonical-001" : null,
  };
}

describe("client rules compatibility", () => {
  it.each([
    ["1.4", 5],
    ["1.4", 6],
    ["1.6.1", 5],
    // V1.6.1 rooms and saves (schema 6) no longer continue (ENGINE_V1.6.2_DELTA.md §9).
    ["1.6.1", 6],
    ["1.6.2", 6],
    ["1.6.1", 7],
  ] as const)("refuses a %s / schema %i snapshot and drops its private payload", async (rulesVersion, schemaVersion) => {
    const response = snapshot(rulesVersion, schemaVersion);
    const result = await respondsWith(response).reconnect("ROOM01", "private-seat-token");
    expect(result).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_RULES_VERSION", currentRevision: 18 } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_ORDER|private-seat-token/);
  });

  it.each([null, { rulesVersion: "1.6.2", schemaVersion: 7, revision: 18 }])("keeps compatible responses (%j)", async (game) => {
    const response = { ok: true, value: { room: { rulesVersion: "1.6.2", latestRevision: 18 }, game } };
    expect(await respondsWith(response).reconnect("ROOM01", "seat-token")).toBe(response);
    expect(snapshotCompatibilityError(response)).toBeNull();
  });

  it("refuses an old-rules lobby before any game exists", async () => {
    const api = respondsWith({ ok: true, value: { room: { rulesVersion: "1.4", latestRevision: 0 }, game: null } });
    expect(await api.createRoom("Host")).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_RULES_VERSION", currentRevision: 0 } });
  });

  it("passes typed server failures through unchanged", async () => {
    const response = { ok: false, error: { code: "RULES_FINGERPRINT_MISMATCH", message: "Different room rules.", details: {}, currentRevision: null } };
    expect(await respondsWith(response).reconnect("ROOM01", "seat-token")).toBe(response);
  });
});

describe("client routing on decisionPrompt", () => {
  const seats = [seat("P1", false), seat("P2", true), seat("P3", true)];
  const players = [{ id: "P1" }, { id: "P2" }, { id: "P3" }];

  function publicWith(phase: GamePhase) {
    return projectPublicState(seatState(3, { players, phase }));
  }

  it.each<[string, GamePhase, boolean]>([
    ["single, human", { type: "work_turn", activePlayerId: "P1", step: { kind: "before_action" } }, false],
    ["single, computer", { type: "work_turn", activePlayerId: "P3", step: { kind: "before_action" } }, true],
    ["parallel, human and computer", { type: "cleanup_hand_limit", pendingPlayerIds: ["P1", "P2"], openedAtRevision: 1 }, true],
    ["parallel, human only", { type: "cleanup_hand_limit", pendingPlayerIds: ["P1"], openedAtRevision: 1 }, false],
    ["finished", { type: "finished" }, false],
  ])("%s", (_label, phase, expected) => {
    expect(shouldAdvanceComputers(publicWith(phase), seats)).toBe(expected);
  });

  it("advances computers in a simultaneous secret window while the human is still pending", () => {
    const state = seatState(3, {
      players,
      ceramics: [
        { owner: "P1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
        { owner: "P2", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_2" },
      ],
      phase: { type: "firing_contributions", windowId: "test-game:r1:contributions", eligiblePlayerIds: ["P1", "P2"], submittedPlayerIds: [] },
    });
    expect(shouldAdvanceComputers(projectPublicState(state), seats)).toBe(true);
    expect(shouldAdvanceComputers(null, seats)).toBe(false);
  });
});
