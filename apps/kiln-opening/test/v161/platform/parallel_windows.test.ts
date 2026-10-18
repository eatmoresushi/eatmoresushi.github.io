/**
 * Revision races in shared windows (DESIGN §3.4, §4.6). In a `parallel` window
 * (`firing_salvage`, `cleanup_hand_limit`) a human and a computer act independently; a
 * command based on any revision since the window opened is validated against the current
 * head, in either order and concurrently, without STALE_REVISION. Every other phase keeps
 * strict equality.
 */

import { describe, expect, it } from "vitest";
import type { GameState, OrderId } from "../../../src/game/index.ts";
import {
  advance,
  command,
  headState,
  lobby,
  nextCommandId,
  openedFiringState,
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

/** Both seats fire a White ceramic in a High space with a +2 Fire card: both Flawed. */
async function openSalvageWindow(harness: Harness): Promise<{ revision: number; humanCeramicId: string }> {
  const seeded = await seedState(harness, (gameId) =>
    openedFiringState({
      gameId,
      players: [{ id: "P1" }, { id: "P2" }],
      ceramics: [
        { owner: "P1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
        { owner: "P2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_2" },
      ],
      fireDeck: [2],
    }),
  );
  if (seeded.phase.type !== "firing_contributions") throw new Error("Expected the Contribution window");
  const windowId = seeded.phase.windowId;
  // The computer submits first; the human's submission reveals and opens the salvage window.
  const computer = valueOf(await advance(harness));
  expect(computer.actorIds).toEqual(["P2"]);
  const opened = await command(harness, "P1", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND" });
  expect(opened.game.phase).toMatchObject({ type: "firing_salvage", pendingPlayerIds: ["P1", "P2"], openedAtRevision: opened.revision });
  const humanCeramicId = Object.values(opened.game.ceramics).find((ceramic) => ceramic.ownerId === "P1")!.id;
  return { revision: opened.revision, humanCeramicId };
}

async function openHandLimitWindow(harness: Harness): Promise<{ revision: number; humanDiscard: OrderId[] }> {
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
    });
    humanDiscard = [a!];
    return state;
  });
  expect(seeded.phase.type).toBe("cleanup_hand_limit");
  return { revision: seeded.revision, humanDiscard };
}

describe("parallel windows: firing_salvage", () => {
  it("human first, then the computer", async () => {
    const harness = await humanAndComputer();
    const { revision, humanCeramicId } = await openSalvageWindow(harness);
    const human = await command(harness, "P1", { type: "SALVAGE_FLAWED", ceramicId: humanCeramicId }, revision);
    expect(human.game.phase).toMatchObject({ type: "firing_salvage", pendingPlayerIds: ["P2"] });
    const computer = valueOf(await advance(harness, human.revision));
    expect(computer.actorIds[0]).toBe("P2");
    const head = await headState(harness);
    expect(head.phase.type).not.toBe("firing_salvage");
    expect(head.lastFiring?.ceramics[humanCeramicId]?.salvaged).toBe(true);
  });

  it("computer first, then the human on the window's opening revision", async () => {
    const harness = await humanAndComputer();
    const { revision, humanCeramicId } = await openSalvageWindow(harness);
    const computer = valueOf(await advance(harness, revision));
    expect(computer.actorIds).toEqual(["P2"]);
    expect(computer.game.phase).toMatchObject({ type: "firing_salvage", pendingPlayerIds: ["P1"] });
    const human = await tryCommand(harness, "P1", { type: "SALVAGE_FLAWED", ceramicId: humanCeramicId }, revision);
    expect(human.ok, human.ok ? undefined : human.error.code).toBe(true);
    expect((await headState(harness)).phase.type).not.toBe("firing_salvage");
  });

  it("both at once on the same revision", async () => {
    const harness = await humanAndComputer();
    const { revision, humanCeramicId } = await openSalvageWindow(harness);
    const [human, computer] = await Promise.all([
      tryCommand(harness, "P1", { type: "SALVAGE_FLAWED", ceramicId: humanCeramicId }, revision),
      advance(harness, revision),
    ]);
    expect(human.ok, human.ok ? undefined : human.error.code).toBe(true);
    expect(computer.ok, computer.ok ? undefined : computer.error.code).toBe(true);
    const head = await headState(harness);
    expect(head.phase.type).not.toBe("firing_salvage");
    expect(head.lastFiring?.ceramics[humanCeramicId]?.salvaged).toBe(true);
  });

  it("still refuses a stale command from a seat that already acted", async () => {
    const harness = await humanAndComputer();
    const { revision, humanCeramicId } = await openSalvageWindow(harness);
    await command(harness, "P1", { type: "SALVAGE_FLAWED", ceramicId: null }, revision);
    const again = await tryCommand(harness, "P1", { type: "SALVAGE_FLAWED", ceramicId: humanCeramicId }, revision);
    expect(again.ok ? null : again.error.code).toBe("STALE_REVISION");
  });
});

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

describe("single-actor phases keep strict revisions", () => {
  it("rejects a command one revision behind outside a parallel window", async () => {
    const harness = await humanAndComputer();
    await seedState(harness, (gameId) => seatState(2, { gameId }));
    const stale = await tryCommand(harness, "P1", { type: "PLACE_CANAL_WHARF", workerId: "P1:apprentice:1" }, harness.revision - 1);
    expect(stale.ok ? null : stale.error.code).toBe("STALE_REVISION");
  });
});
