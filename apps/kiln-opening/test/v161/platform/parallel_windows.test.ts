/**
 * Revision races in shared windows (DESIGN §3.4, §4.6). In the `parallel` window
 * (`cleanup_hand_limit`, the only one since owner revision 4 removed the salvage step) a human
 * and a computer act independently; a command based on any revision since the window opened is
 * validated against the current head, in either order and concurrently, without
 * STALE_REVISION. Its only choice is the trim: Cleanup is not a free-action window (rev. 5 L176,
 * I1), so a sale there is refused like any other rule failure, tolerant revision or not. Every
 * other phase keeps strict equality.
 */

import { describe, expect, it } from "vitest";
import type { GameState, OrderId } from "../../../src/game/index.ts";
import {
  advance,
  command,
  headState,
  lobby,
  nextCommandId,
  scriptedPolicy,
  seatState,
  seedState,
  tryCommand,
  valueOf,
  type Harness,
} from "./support.ts";

async function humanAndComputer(): Promise<Harness> {
  const harness = await lobby({
    humans: 1,
    computers: 1,
    service: { computerPolicy: scriptedPolicy(), fallbackCommands: () => [] },
  });
  const start = valueOf(
    await harness.service.startGame({ roomCode: harness.roomCode, seatToken: harness.host.seatToken, commandId: nextCommandId(harness, "9200") }),
  );
  harness.revision = start.revision;
  return harness;
}

async function openHandLimitWindow(harness: Harness): Promise<{ revision: number; humanDiscard: OrderId[]; humanFlawed: string }> {
  let humanDiscard: OrderId[] = [];
  const seeded = await seedState(harness, (gameId, revision) => {
    const probe = seatState(2, { gameId });
    const [a, b, c, d, e, f, g, h, i, j] = probe.hidden.mainDeck as OrderId[];
    const state: GameState = seatState(2, {
      gameId,
      players: [
        { id: "P1", hand: [a!, b!, c!, d!, e!] },
        { id: "P2", hand: [f!, g!, h!, i!, j!] },
      ],
      phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["P1", "P2"], openedAtRevision: revision },
      // The human holds a Finished Flawed ceramic, which may not be sold while trimming (I1).
      ceramics: [{ owner: "P1", stage: "finished", shape: "bowl", glaze: "white", quality: "flawed" }],
    });
    humanDiscard = [a!];
    return state;
  });
  expect(seeded.phase.type).toBe("cleanup_hand_limit");
  const humanFlawed = Object.values(seeded.ceramics).find((ceramic) => ceramic.ownerId === "P1")!.id;
  return { revision: seeded.revision, humanDiscard, humanFlawed };
}

describe("parallel windows: cleanup_hand_limit", () => {
  it("human first, then the computer", async () => {
    const harness = await humanAndComputer();
    const { revision, humanDiscard } = await openHandLimitWindow(harness);
    const human = await command(harness, "P1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: humanDiscard }, revision);
    expect(human.game.phase).toMatchObject({ type: "cleanup_hand_limit", pendingPlayerIds: ["P2"] });
    expect(human.ownPrivateView?.orderHand).toHaveLength(4);
    valueOf(await advance(harness, human.revision));
    const head = await headState(harness);
    expect(head.round).toBe(2);
    expect(head.hidden.orderHands["P2"]).toHaveLength(4);
  });

  it("computer first, then the human on the window's opening revision", async () => {
    const harness = await humanAndComputer();
    const { revision, humanDiscard } = await openHandLimitWindow(harness);
    const computer = valueOf(await advance(harness, revision));
    expect(computer.actorIds).toEqual(["P2"]);
    const human = await tryCommand(harness, "P1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: humanDiscard }, revision);
    expect(human.ok, human.ok ? undefined : human.error.code).toBe(true);
    expect((await headState(harness)).round).toBe(2);
  });

  it("both at once on the same revision", async () => {
    const harness = await humanAndComputer();
    const { revision, humanDiscard } = await openHandLimitWindow(harness);
    const [human, computer] = await Promise.all([
      tryCommand(harness, "P1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: humanDiscard }, revision),
      advance(harness, revision),
    ]);
    expect(human.ok, human.ok ? undefined : human.error.code).toBe(true);
    expect(computer.ok, computer.ok ? undefined : computer.error.code).toBe(true);
    const head = await headState(harness);
    expect(head.round).toBe(2);
    expect(head.hidden.orderHands["P1"]).toHaveLength(4);
    expect(head.hidden.orderHands["P2"]).toHaveLength(4);
  });
});

describe("parallel windows: no sale in cleanup_hand_limit (rev. 5 L176, I1)", () => {
  it("a pending human's sale on the opening revision is refused (WRONG_PHASE); the human then trims on it, after the computer", async () => {
    const harness = await humanAndComputer();
    const { revision, humanDiscard, humanFlawed } = await openHandLimitWindow(harness);
    const computer = valueOf(await advance(harness, revision));
    expect(computer.actorIds).toEqual(["P2"]);
    const sale = await tryCommand(harness, "P1", { type: "SELL_FLAWED", ceramicId: humanFlawed }, revision);
    expect(sale.ok ? null : sale.error.code).toBe("WRONG_PHASE");
    const afterSale = await headState(harness);
    expect(afterSale.phase).toMatchObject({ type: "cleanup_hand_limit", pendingPlayerIds: ["P1"] });
    expect(afterSale.ceramics[humanFlawed]).toMatchObject({ stage: "finished", quality: "flawed" });
    const trim = await tryCommand(harness, "P1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: humanDiscard }, revision);
    expect(trim.ok, trim.ok ? undefined : trim.error.code).toBe(true);
    expect((await headState(harness)).round).toBe(2);
  });

  it("the human's refused sale and the computer's trim at once on the same revision", async () => {
    const harness = await humanAndComputer();
    const { revision, humanFlawed } = await openHandLimitWindow(harness);
    const [sale, computer] = await Promise.all([
      tryCommand(harness, "P1", { type: "SELL_FLAWED", ceramicId: humanFlawed }, revision),
      advance(harness, revision),
    ]);
    expect(sale.ok ? null : sale.error.code).toBe("WRONG_PHASE");
    expect(computer.ok, computer.ok ? undefined : computer.error.code).toBe(true);
    const head = await headState(harness);
    expect(head.phase).toMatchObject({ type: "cleanup_hand_limit", pendingPlayerIds: ["P1"] });
    expect(head.players["P1"]?.resources.coins).toBe(3);
  });

  it("still refuses a stale sale from a seat that already trimmed", async () => {
    const harness = await humanAndComputer();
    const { revision, humanDiscard, humanFlawed } = await openHandLimitWindow(harness);
    await command(harness, "P1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: humanDiscard }, revision);
    const again = await tryCommand(harness, "P1", { type: "SELL_FLAWED", ceramicId: humanFlawed }, revision);
    expect(again.ok ? null : again.error.code).toBe("STALE_REVISION");
  });
});

describe("single-actor phases keep strict revisions", () => {
  it("rejects a command one revision behind outside a parallel window", async () => {
    const harness = await humanAndComputer();
    await seedState(harness, (gameId) => seatState(2, { gameId }));
    const stale = await tryCommand(harness, "P1", { type: "PLACE_CANAL_WHARF", workerId: "P1:apprentice:1" }, harness.revision - 1);
    expect(stale.ok ? null : stale.error.code).toBe("STALE_REVISION");
  });
});
