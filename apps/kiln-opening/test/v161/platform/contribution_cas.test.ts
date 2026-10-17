/**
 * Secret simultaneous Contributions through the service (DESIGN §4.6): sealed per seat,
 * revealed atomically on the last submission, compare-and-swap on the head and on the
 * window, idempotent retries.
 */

import { describe, expect, it } from "vitest";
import type { GameEvent, GameState } from "../../../src/game/index.ts";
import {
  command,
  connectionFor,
  headState,
  openedFiringState,
  seedState,
  started,
  tryCommand,
  valueOf,
  type Harness,
} from "./support.ts";

/** Both seats have a Shared Kiln ceramic; P1 owns Fuel Ledger (T12). */
async function contributionWindow(harness: Harness): Promise<{ windowId: string; state: GameState }> {
  const state = await seedState(harness, (gameId) =>
    openedFiringState({
      gameId,
      players: [
        { id: "P1", techs: ["T12"], resources: { wood: 3 } },
        { id: "P2", resources: { wood: 3 } },
      ],
      ceramics: [
        { owner: "P1", stage: "loaded", shape: "bowl", glaze: "celadon", at: "middle_1" },
        { owner: "P2", stage: "loaded", shape: "plate", glaze: "celadon", at: "high_1" },
      ],
    }),
  );
  if (state.phase.type !== "firing_contributions") throw new Error(`Expected the Contribution window, got ${state.phase.type}`);
  return { windowId: state.phase.windowId, state };
}

function revealedOf(events: readonly { type: string }[]): Extract<GameEvent, { type: "CONTRIBUTIONS_REVEALED" }> | undefined {
  return events.find((event) => event.type === "CONTRIBUTIONS_REVEALED") as Extract<GameEvent, { type: "CONTRIBUTIONS_REVEALED" }> | undefined;
}

describe("V1.6.2 Contribution window over the service", () => {
  it("seals a Fuel Ledger −2 per seat until every participant submits, then reveals and pays atomically", async () => {
    const { harness } = await started();
    const { windowId } = await contributionWindow(harness);

    const first = await command(harness, "P1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "BANK", fuelLedger: true });
    expect(first.events).toEqual([{ type: "CONTRIBUTION_SUBMITTED", playerId: "P1", windowId }]);
    expect(first.ownPrivateView?.pendingContribution).toEqual({ card: "BANK", fuelLedger: true, windowId });
    expect(first.game.phase).toMatchObject({ type: "firing_contributions", submittedPlayerIds: ["P1"] });
    expect(first.game.firing?.contributions).toBeNull();
    expect(JSON.stringify(first.game)).not.toContain('"fuelLedger"');
    expect(JSON.stringify(first.events)).not.toContain("BANK");

    const p2View = valueOf(await harness.service.reconnect({ roomCode: harness.roomCode, seatToken: connectionFor(harness, "P2").seatToken }));
    expect(p2View.ownPrivateView?.pendingContribution).toBeNull();
    expect(JSON.stringify(p2View)).not.toContain('"fuelLedger"');
    expect(harness.store.audit().privateSubmissions).toEqual([
      expect.objectContaining({ playerId: "P1", windowId, card: "BANK", fuelLedger: true, revealedRevision: null }),
    ]);

    const second = await command(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "STOKE", fuelLedger: false });
    expect(revealedOf(second.events)?.contributions).toEqual({
      // Fuel Ledger (v1.6.2 L637): the owner's Bank costs no Wood, the commitment 1.
      P1: { card: "BANK", fuelLedger: true, heat: -2, woodPaid: 1 },
      P2: { card: "STOKE", fuelLedger: false, heat: 1, woodPaid: 1 },
    });
    expect(second.events).toContainEqual(expect.objectContaining({ type: "BASE_HEAT_DETERMINED", kilnDie: 2, contributionSum: -1, baseHeat: 1 }));
    expect(second.game.players["P1"]?.resources.wood).toBe(2);
    expect(second.game.players["P2"]?.resources.wood).toBe(2);
    expect(second.ownPrivateView?.pendingContribution).toBeNull();
    expect(harness.store.audit().privateSubmissions.map((row) => row.revealedRevision)).toEqual([second.revision, second.revision]);
  });

  it("commits concurrent submissions once each and reveals exactly once", async () => {
    const { harness } = await started();
    const { windowId } = await contributionWindow(harness);
    const revision = harness.revision;
    const results = await Promise.all([
      tryCommand(harness, "P1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "STOKE", fuelLedger: true }, revision),
      tryCommand(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND", fuelLedger: false }, revision),
    ]);
    const successes = results.map(valueOf);
    expect(successes.map((success) => success.revision).sort()).toEqual([revision + 1, revision + 2]);
    expect(successes.filter((success) => revealedOf(success.events) !== undefined)).toHaveLength(1);
    const revealed = successes.map((success) => revealedOf(success.events)).find((event) => event !== undefined);
    expect(revealed?.contributions).toEqual({
      P1: { card: "STOKE", fuelLedger: true, heat: 2, woodPaid: 1 },
      P2: { card: "TEND", fuelLedger: false, heat: 0, woodPaid: 0 },
    });
    expect((await headState(harness)).revision).toBe(revision + 2);
    const rows = harness.store.audit().privateSubmissions;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.revealedRevision))).toEqual(new Set([revision + 2]));
  });

  it("rejects a second sealed choice, a wrong window and a late submission; replays an accepted one", async () => {
    const { harness } = await started();
    const { windowId } = await contributionWindow(harness);
    const commandId = "00000000-0000-4000-9500-000000000001";
    const submission = { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND", fuelLedger: false } as const;
    const first = valueOf(await tryCommand(harness, "P1", submission, harness.revision, commandId));

    const replay = valueOf(await tryCommand(harness, "P1", submission, first.revision - 1, commandId));
    expect(replay).toEqual(first);
    const stolen = await tryCommand(harness, "P2", submission, first.revision, commandId);
    expect(stolen.ok ? null : stolen.error.code).toBe("DUPLICATE_COMMAND");

    const again = await tryCommand(harness, "P1", { ...submission, card: "STOKE" });
    expect(again.ok ? null : again.error.code).toBe("CONTRIBUTION_ALREADY_SUBMITTED");
    const wrongWindow = await tryCommand(harness, "P2", { ...submission, windowId: `${windowId}:other` });
    expect(wrongWindow.ok ? null : wrongWindow.error.code).toBe("PRIVATE_WINDOW_MISMATCH");
    const noLedger = await tryCommand(harness, "P2", { ...submission, card: "BANK", fuelLedger: true });
    expect(noLedger.ok).toBe(false);
    expect(harness.store.audit().privateSubmissions).toHaveLength(1);

    const last = valueOf(await tryCommand(harness, "P2", submission));
    expect(revealedOf(last.events)).toBeDefined();
    const late = await tryCommand(harness, "P1", submission);
    expect(late.ok ? null : late.error.code).toBe("PRIVATE_WINDOW_MISMATCH");
    expect(harness.store.audit().commands.filter((record) => (record.command as { type?: string }).type === "SUBMIT_CONTRIBUTION")).toHaveLength(2);
  });

  it("accepts a submission based on any revision of the open window, never a future one", async () => {
    const { harness } = await started();
    const { windowId } = await contributionWindow(harness);
    const opened = harness.revision;
    await command(harness, "P1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND", fuelLedger: false });
    const future = await tryCommand(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND", fuelLedger: false }, opened + 5);
    expect(future.ok ? null : future.error.code).toBe("STALE_REVISION");
    const fromOpening = await tryCommand(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND", fuelLedger: false }, opened);
    expect(fromOpening.ok).toBe(true);
  });
});
