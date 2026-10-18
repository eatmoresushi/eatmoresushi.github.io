// @vitest-environment happy-dom
/**
 * The secret Contribution through B5's real forms, the real session store and the authoritative
 * service (UI_V1.6.1_ARCHITECTURE §3.7, §10.3 B5 "the sealed Contribution after submit and on
 * reconnect"). Owner: B5.
 *
 * - A half-made Contribution survives another player's submission (the draft is revalidated).
 * - After Confirm, the pane is `waiting` and shows the viewer's own sealed card, marked "only
 *   you", from `own.pendingContribution`.
 * - Another seat sees only that the viewer has chosen, never the card.
 * - A fresh client for the same seat (a reconnect: the server rebuilds the sealed card) shows the
 *   same sealed card.
 */
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RoomConnection } from "../../../../src/multiplayer/index.ts";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { LAST_ROOM_KEY, seatKey } from "../../../../src/app/session/savedSeat.ts";
import { SessionStore } from "../../../../src/app/session/sessionStore.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { command as harnessCommand, openedFiringState, seedState, started } from "../../platform/support.ts";
import type { Harness } from "../../platform/support.ts";
import { FakeClock, MemoryStorage, ServiceGameApi, settle } from "../session/fakeGameApi.ts";
import { contributionCardLeaks } from "../support/sealedCards.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

beforeEach(() => {
  mounted.length = 0;
});

async function clientFor(harness: Harness, connection: RoomConnection): Promise<{ store: SessionStore; api: ServiceGameApi }> {
  const storage = new MemoryStorage();
  storage.setItem(seatKey(connection.room.code), JSON.stringify({ roomCode: connection.room.code, seatToken: connection.seatToken }));
  storage.setItem(LAST_ROOM_KEY, connection.room.code);
  const api = new ServiceGameApi(harness.service, harness.store, `auth-${connection.seat.playerId}`);
  const store = new SessionStore({ api, storage, clock: new FakeClock(), newCommandId: () => randomUUID() });
  expect(await store.restore()).toEqual({ ok: true });
  await settle();
  return { store, api };
}

function mount(store: SessionStore): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  act(() =>
    root.render(
      <I18nProvider defaultLocale="en" strict>
        <GameProvider source={store} session={store} registry={WINDOWS} devTools={false}>
          <DecisionPane />
        </GameProvider>
      </I18nProvider>,
    ),
  );
  return container;
}

function find<E extends Element = HTMLElement>(container: HTMLElement, selector: string): E {
  const found = container.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

async function settleUi(): Promise<void> {
  await act(async () => {
    await settle();
  });
}

describe("the sealed Contribution", () => {
  it("survives others' submissions, shows only to its owner after Confirm, and again after a reconnect", async () => {
    const { harness } = await started({ humans: 3 });
    const seeded = await seedState(harness, (gameId) =>
      openedFiringState({
        gameId,
        players: [
          { id: "P1", resources: { wood: 3 } },
          { id: "P2", resources: { wood: 2 } },
          { id: "P3", resources: { wood: 2 } },
        ],
        ceramics: [
          { owner: "P1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
          { owner: "P2", stage: "loaded", shape: "bowl", glaze: "white", at: "high_2" },
          { owner: "P3", stage: "loaded", shape: "bowl", glaze: "white", at: "middle_1" },
        ],
      }),
    );
    if (seeded.phase.type !== "firing_contributions") throw new Error("Expected the Contribution window");
    const windowId = seeded.phase.windowId;

    const p1 = await clientFor(harness, harness.humans[0] as RoomConnection);
    const p2 = await clientFor(harness, harness.humans[1] as RoomConnection);
    const one = mount(p1.store);
    const two = mount(p2.store);
    expect(find(one, "form[data-window]").getAttribute("data-window")).toBe("contributions");

    // A half-made choice survives P3's submission.
    act(() => find<HTMLInputElement>(one, 'input[name="card"][value="STOKE"]').click());
    await harnessCommand(harness, "P3", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND" });
    p1.api.ping();
    p2.api.ping();
    await settleUi();
    expect(find<HTMLInputElement>(one, 'input[name="card"][value="STOKE"]').checked).toBe(true);
    expect(find(one, ".confirm-summary").textContent).toBe("Submit Stoke the Fire in secret: Heat +1, 1 Wood at reveal");

    // Confirm: P1 now waits and sees its own sealed card, marked private.
    await act(async () => {
      find<HTMLButtonElement>(one, '[data-action="confirm"]').click();
      await settle();
    });
    expect(p1.store.getSnapshot().view!.own!.pendingContribution).toMatchObject({ card: "STOKE", windowId });
    expect(find(one, "form[data-window]").getAttribute("data-window")).toBe("waiting");
    expect(find(one, "[data-sealed-contribution]").textContent).toBe("Your sealed Contribution: Stoke the Fire");
    expect(one.textContent).toContain("Only you can see");
    expect(one.querySelector('[data-action="confirm"]')).toBeNull();

    // P2 sees who has chosen, never what.
    p2.api.ping();
    await settleUi();
    expect(find(two, "form[data-window]").getAttribute("data-window")).toBe("contributions");
    expect(two.querySelector("[data-sealed-contribution]")).toBeNull();
    const who = find(two, ".dw-queue").textContent ?? "";
    expect(who).toContain("chosen");
    expect(who).not.toContain("Stoke");
    // Every player's Contribution cards are public (v1.6.2 change 26); which one P1 (or P3) sealed
    // is not: no card ID anywhere else in P2's snapshot, in any shape.
    const p2Snapshot = p2.store.getSnapshot();
    expect(contributionCardLeaks(p2Snapshot)).toEqual([]);
    expect(contributionCardLeaks({ ...p2Snapshot, planted: { P1: "STOKE" } })).toEqual(["$.planted.P1"]);

    // A fresh client for P1's seat: the server rebuilds the sealed card.
    p1.store.dispose();
    const again = await clientFor(harness, harness.humans[0] as RoomConnection);
    const rejoined = mount(again.store);
    expect(find(rejoined, "form[data-window]").getAttribute("data-window")).toBe("waiting");
    expect(find(rejoined, "[data-sealed-contribution]").textContent).toBe("Your sealed Contribution: Stoke the Fire");
    again.store.dispose();
    p2.store.dispose();
  });
});
