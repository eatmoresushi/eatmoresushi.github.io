/**
 * Fuel Ledger's Contribution cards through every store layer (DESIGN §4.6; v1.6.2 change 26): a
 * sealed Fuel Ledger Bank or Fuel Ledger Stoke card must survive the in-memory store, the
 * Supabase adapter's row mapping and payloads, and reach the engine's reveal as −2/+2. The
 * V1.6.2 secret Wood commitment (`fuelLedger`) is gone: a payload that still carries it is
 * refused, and neither the rows nor the payloads have the flag any more.
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
  expect(seeded.players["P2"]?.contributionCards).toEqual(["BANK", "TEND", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"]);
  const windowId = seeded.phase.windowId;
  await command(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "FUEL_LEDGER_STOKE" });
  const [stored] = await harness.store.loadPrivateSubmissions(harness.roomId, windowId);
  expect(stored).toEqual({
    roomId: harness.roomId,
    windowId,
    playerId: "P2",
    commandId: expect.any(String),
    card: "FUEL_LEDGER_STOKE",
    revealedRevision: null,
  });
  expect(await harness.store.findOwnPendingSubmission(harness.roomId, "P2")).toMatchObject({ card: "FUEL_LEDGER_STOKE" });
  const last = await command(harness, "P1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "BANK" });
  return last.events.find((event) => event.type === "CONTRIBUTIONS_REVEALED") as Extract<GameEvent, { type: "CONTRIBUTIONS_REVEALED" }> | undefined;
}

describe("Fuel Ledger's cards through the store layers", () => {
  it.each([false, true])("reveals a stored Fuel Ledger Stoke as +2 (jsonb key order: %s)", async (jsonbKeyOrder) => {
    const revealed = await fuelLedgerReveal(jsonbKeyOrder);
    expect(revealed?.contributions).toEqual({
      P1: { card: "BANK", heat: -1, woodPaid: 1 },
      // Fuel Ledger Stoke (v1.6.2 L289, L644): +2 for its printed 1 Wood.
      P2: { card: "FUEL_LEDGER_STOKE", heat: 2, woodPaid: 1 },
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
      // The V1.6.2 commitment flag is gone (change 26), whatever its value.
      { windowId: "w", card: "STOKE", fuelLedger: true, revealed: false },
      { windowId: "w", card: "TEND", fuelLedger: false, revealed: false },
      // The V1.4 cards are history.
      { windowId: "w", card: "BANK_2", revealed: false },
      { windowId: "w", card: "SMOTHER", revealed: false },
    ]) {
      await expect(
        harness.store.commitTransition({ ...input, privateSubmission } as unknown as CommitTransitionInput),
      ).rejects.toThrow("invalid private Contribution payload");
    }
    expect(harness.store.audit().privateSubmissions).toEqual([]);
    expect((await harness.store.loadHead(harness.roomId))?.revision).toBe(head.revision);
  });

  it("maps the Supabase rows and payloads with the card only", () => {
    const row = { roomId: "r", windowId: "w", playerId: "P1", commandId: "c", revealedRevision: null };
    for (const card of ["BANK", "TEND", "STOKE", "FUEL_LEDGER_BANK", "FUEL_LEDGER_STOKE"] as const) {
      expect(privateSubmissionFromRow({ ...row, card })).toEqual({ ...row, card });
      expect(privateSubmissionPayload({ windowId: "w", card, revealed: true })).toEqual({ windowId: "w", card, revealed: true });
    }
    expect(privateSubmissionPayload(null)).toBeNull();
  });

  it("sends and reads Fuel Ledger cards through the Supabase RPCs", async () => {
    const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
    const replies: Record<string, unknown> = {
      server_commit_transition: { status: "ok", value: {} },
      server_load_private_submissions: [
        { roomId: "r", windowId: "w", playerId: "P1", commandId: "c1", card: "FUEL_LEDGER_STOKE", revealedRevision: null },
        { roomId: "r", windowId: "w", playerId: "P2", commandId: "c2", card: "TEND", revealedRevision: null },
      ],
      server_find_own_pending: { roomId: "r", windowId: "w", playerId: "P1", commandId: "c1", card: "FUEL_LEDGER_BANK", revealedRevision: null },
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
      privateSubmission: { windowId: "w", card: "FUEL_LEDGER_STOKE", revealed: false },
    } as unknown as CommitTransitionInput);
    expect(calls[0]).toMatchObject({
      name: "server_commit_transition",
      body: { p_private_submission: { windowId: "w", card: "FUEL_LEDGER_STOKE", revealed: false } },
    });
    expect(calls[0]?.body["p_private_submission"]).not.toHaveProperty("fuelLedger");
    expect((await store.loadPrivateSubmissions("r", "w")).map((record) => [record.playerId, record.card])).toEqual([
      ["P1", "FUEL_LEDGER_STOKE"],
      ["P2", "TEND"],
    ]);
    expect(await store.findOwnPendingSubmission("r", "P1")).toMatchObject({ card: "FUEL_LEDGER_BANK" });
  });
});
