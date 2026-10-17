/**
 * Fuel Ledger through every store layer (DESIGN §4.6): the secret commitment must survive
 * the in-memory store, the Supabase adapter's row mapping and payloads, and reach the
 * engine's reveal as −2/+2. Dropping it anywhere would silently resolve it as −1/+1.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SupabaseMultiplayerStore,
  privateSubmissionFromRow,
  privateSubmissionPayload,
} from "../../../supabase/functions/_shared/supabaseStore.ts";
import type { GameEvent } from "../../../src/game/index.ts";
import { projectPublicGameState } from "../../../src/multiplayer/index.ts";
import type { CommitTransitionInput } from "../../../src/multiplayer/index.ts";
import { command, openedFiringState, seedState, started } from "./support.ts";

afterEach(() => vi.unstubAllGlobals());

async function fuelLedgerReveal(jsonbKeyOrder: boolean): Promise<Extract<GameEvent, { type: "CONTRIBUTIONS_REVEALED" }> | undefined> {
  const { harness } = await started({ store: { jsonbKeyOrder } });
  const seeded = await seedState(harness, (gameId) =>
    openedFiringState({
      gameId,
      players: [
        { id: "P1", resources: { wood: 3 } },
        { id: "P2", techs: ["T12"], resources: { wood: 3 } },
      ],
      ceramics: [
        { owner: "P1", stage: "loaded", shape: "bowl", glaze: "grey_green", at: "middle_1" },
        { owner: "P2", stage: "loaded", shape: "vase", glaze: "grey_green", at: "high_1" },
      ],
    }),
  );
  if (seeded.phase.type !== "firing_contributions") throw new Error("Expected the Contribution window");
  const windowId = seeded.phase.windowId;
  await command(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "STOKE", fuelLedger: true });
  const [stored] = await harness.store.loadPrivateSubmissions(harness.roomId, windowId);
  expect(stored).toMatchObject({ playerId: "P2", card: "STOKE", fuelLedger: true, revealedRevision: null });
  expect(await harness.store.findOwnPendingSubmission(harness.roomId, "P2")).toMatchObject({ fuelLedger: true });
  const last = await command(harness, "P1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "BANK", fuelLedger: false });
  return last.events.find((event) => event.type === "CONTRIBUTIONS_REVEALED") as Extract<GameEvent, { type: "CONTRIBUTIONS_REVEALED" }> | undefined;
}

describe("Fuel Ledger through the store layers", () => {
  it.each([false, true])("reveals a stored +2 commitment as +2 (jsonb key order: %s)", async (jsonbKeyOrder) => {
    const revealed = await fuelLedgerReveal(jsonbKeyOrder);
    expect(revealed?.contributions).toEqual({
      P1: { card: "BANK", fuelLedger: false, heat: -1, woodPaid: 1 },
      // Fuel Ledger (v1.6.2 L629): the owner's Stoke costs no Wood, the commitment 1.
      P2: { card: "STOKE", fuelLedger: true, heat: 2, woodPaid: 1 },
    });
  });

  it("refuses an impossible private payload instead of storing it", async () => {
    const { harness } = await started();
    const head = await harness.store.loadHead(harness.roomId);
    if (head === null) throw new Error("No head");
    const state = structuredClone(head.state);
    state.revision += 1;
    const publicState = projectPublicGameState(state);
    const input = {
      roomId: harness.roomId,
      commandId: "00000000-0000-4000-9600-000000000001",
      actorId: "P1",
      expectedRevision: head.revision,
      command: { type: "SUBMIT_CONTRIBUTION" },
      previousHead: head,
      nextHead: { ...head, revision: state.revision, state, stateHash: "next" },
      fullEvents: [],
      publicEvents: [],
      publicState,
      response: { commandId: "c", room: harness.host.room, actorId: "P1", revision: state.revision, game: publicState, events: [], ownPrivateView: null, ownSecrets: [] },
    } satisfies Omit<CommitTransitionInput, "privateSubmission">;
    for (const privateSubmission of [
      { windowId: "w", card: "TEND", fuelLedger: true, revealed: false },
      { windowId: "w", card: "BANK_2", fuelLedger: false, revealed: false },
    ]) {
      await expect(
        harness.store.commitTransition({ ...input, privateSubmission } as unknown as CommitTransitionInput),
      ).rejects.toThrow("invalid private Contribution payload");
    }
    expect(harness.store.audit().privateSubmissions).toEqual([]);
    expect((await harness.store.loadHead(harness.roomId))?.revision).toBe(head.revision);
  });

  it("maps the Supabase rows' use_fuel_ledger column both ways", () => {
    const row = { roomId: "r", windowId: "w", playerId: "P1", commandId: "c", card: "BANK" as const, revealedRevision: null };
    expect(privateSubmissionFromRow({ ...row, fuelLedger: true }).fuelLedger).toBe(true);
    expect(privateSubmissionFromRow({ ...row, fuelLedger: false }).fuelLedger).toBe(false);
    expect(privateSubmissionFromRow({ ...row, fuelLedger: null }).fuelLedger).toBe(false);
    expect(privateSubmissionFromRow(row).fuelLedger).toBe(false);
    expect(privateSubmissionPayload({ windowId: "w", card: "STOKE", fuelLedger: true, revealed: true })).toEqual({
      windowId: "w",
      card: "STOKE",
      fuelLedger: true,
      revealed: true,
    });
    expect(privateSubmissionPayload(null)).toBeNull();
  });

  it("sends and reads the commitment through the Supabase RPCs", async () => {
    const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
    const replies: Record<string, unknown> = {
      server_commit_transition: { status: "ok", value: {} },
      server_load_private_submissions: [
        { roomId: "r", windowId: "w", playerId: "P1", commandId: "c1", card: "STOKE", fuelLedger: true, revealedRevision: null },
        { roomId: "r", windowId: "w", playerId: "P2", commandId: "c2", card: "TEND", fuelLedger: false, revealedRevision: null },
      ],
      server_find_own_pending: { roomId: "r", windowId: "w", playerId: "P1", commandId: "c1", card: "BANK", fuelLedger: true, revealedRevision: null },
    };
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      const name = url.split("/rpc/")[1]!;
      calls.push({ name, body: JSON.parse(init.body) as Record<string, unknown> });
      return new Response(JSON.stringify(replies[name] ?? null), { status: 200 });
    });
    const store = new SupabaseMultiplayerStore("https://example.supabase.co", "service-role-key");
    await store.commitTransition({
      roomId: "r",
      commandId: "c1",
      actorId: "P1",
      expectedRevision: 4,
      command: { type: "SUBMIT_CONTRIBUTION" },
      previousHead: { stateHash: "before" },
      nextHead: { revision: 5, state: {}, rngState: 1, rootSeed: 2, stateHash: "after" },
      fullEvents: [],
      publicEvents: [],
      publicState: {},
      response: {},
      privateSubmission: { windowId: "w", card: "STOKE", fuelLedger: true, revealed: false },
    } as unknown as CommitTransitionInput);
    expect(calls[0]).toMatchObject({
      name: "server_commit_transition",
      body: { p_private_submission: { windowId: "w", card: "STOKE", fuelLedger: true, revealed: false } },
    });
    expect((await store.loadPrivateSubmissions("r", "w")).map((record) => [record.playerId, record.card, record.fuelLedger])).toEqual([
      ["P1", "STOKE", true],
      ["P2", "TEND", false],
    ]);
    expect(await store.findOwnPendingSubmission("r", "P1")).toMatchObject({ card: "BANK", fuelLedger: true });
  });
});
