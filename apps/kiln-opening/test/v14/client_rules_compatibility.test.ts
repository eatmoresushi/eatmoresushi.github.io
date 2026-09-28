import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameApi } from "../../src/multiplayer/client";
import { localizeMultiplayerError } from "../../src/ui/i18n";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), invoke: vi.fn() }));

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...await importOriginal<typeof import("@supabase/supabase-js")>(),
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

function snapshot(rulesVersion = "1.4", schemaVersion = 5) {
  return {
    ok: true,
    value: {
      room: { rulesVersion, latestRevision: 18 },
      game: {
        rulesVersion, schemaVersion, revision: 18,
        ceramics: { old: { shape: "bowl", glaze: "celadon", decoration: "crackle", quality: "standard" } },
      },
      ownPrivateDecision: { orderHand: ["PRIVATE_ORDER"] },
      seatToken: "private-seat-token",
    },
  };
}

function respondsWith(data: unknown) {
  mocks.invoke.mockResolvedValue({ data, error: null });
  return createGameApi();
}

describe("client-side rules compatibility", () => {
  it("rejects an older service's successful reconnect instead of rendering legacy Crackle as a Decoration", async () => {
    const response = snapshot("1.2.7", 4);
    const before = structuredClone(response);
    const result = await respondsWith(response).reconnect("ROOM01", "private-seat-token");

    expect(result).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_RULES_VERSION", currentRevision: 18 } });
    expect(result).not.toHaveProperty("value");
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_ORDER|private-seat-token|ceramics|crackle/);
    expect(response).toEqual(before);
    if (!result.ok) {
      expect(result.error.message).toContain("Update the game service");
      expect(localizeMultiplayerError("zh-CN", result.error.code, result.error.message)).toContain("不兼容的规则版本");
    }
  });

  it.each([
    { rulesVersion: "1.4", schemaVersion: 4 },
    { rulesVersion: "1.2.7", schemaVersion: 5 },
  ])("rejects incompatible game metadata even when the room claims V1.4: %j", async (metadata) => {
    const response = snapshot();
    Object.assign(response.value.game, metadata);
    const result = await respondsWith(response).startGame("ROOM01", "seat-token", "command-id");
    expect(result).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_RULES_VERSION" } });
  });

  it.each(["create", "join"] as const)("rejects an old-rules %s lobby before a game exists", async (operation) => {
    const api = respondsWith({ ok: true, value: { room: { rulesVersion: "1.2.7", latestRevision: 0 }, game: null } });
    const result = operation === "create" ? await api.createRoom("Host") : await api.joinRoom("ROOM01", "Player");
    expect(result).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_RULES_VERSION", currentRevision: 0 } });
  });

  it.each(["command", "computer"] as const)("does not install incompatible %s updates mid-session", async (operation) => {
    const api = respondsWith(snapshot("1.2.7", 4));
    const result = operation === "command"
      ? await api.executeCommand({ roomCode: "ROOM01", seatToken: "seat-token", commandId: "command-id", expectedRevision: 17, command: { type: "REVEAL_FIRE_CARD" } })
      : await api.advanceComputers("ROOM01", "seat-token", 17);
    expect(result).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_RULES_VERSION" } });
  });

  it.each([null, { rulesVersion: "1.4", schemaVersion: 5, revision: 18 }])("preserves compatible responses, including a lobby with no game (%j)", async (game) => {
    const response = { ok: true, value: { room: { rulesVersion: "1.4", latestRevision: 18 }, game } };
    expect(await respondsWith(response).reconnect("ROOM01", "seat-token")).toBe(response);
  });

  it("preserves typed server failures", async () => {
    const response = { ok: false, error: { code: "RULES_FINGERPRINT_MISMATCH", message: "Different room rules.", details: {}, currentRevision: null } };
    expect(await respondsWith(response).reconnect("ROOM01", "seat-token")).toBe(response);
  });
});
