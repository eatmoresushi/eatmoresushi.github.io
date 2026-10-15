// @vitest-environment happy-dom
/**
 * Drafts against the real session store and service (UI_V1.6.1_ARCHITECTURE §3.5, §3.7, §9.2):
 * - a half-made Contribution survives another player's submission;
 * - `STALE_REVISION` recovery keeps (and revalidates) the draft;
 * - this client's own success resets it;
 * - a half-made hand trim survives another player's parallel trim.
 * The forms are the toy draft models of `support/toyWindows.tsx`; the store, client hooks,
 * merge rules and service are the real ones.
 */
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GameState, OrderId } from "../../../../src/game/index.ts";
import type { RoomConnection } from "../../../../src/multiplayer/index.ts";
import { DecisionPane } from "../../../../src/app/decision/DecisionPane.tsx";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { LAST_ROOM_KEY, seatKey } from "../../../../src/app/session/savedSeat.ts";
import { SessionStore } from "../../../../src/app/session/sessionStore.ts";
import { GameProvider } from "../../../../src/app/state/hooks.ts";
import { command as harnessCommand, openedFiringState, seatState, seedState, started } from "../../platform/support.ts";
import type { Harness } from "../../platform/support.ts";
import { FakeClock, MemoryStorage, ServiceGameApi, settle } from "../session/fakeGameApi.ts";
import { TOY_WINDOWS } from "../support/toyWindows.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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

function mount(store: SessionStore): void {
  act(() =>
    root.render(
      <I18nProvider defaultLocale="en" strict>
        <GameProvider source={store} session={store} registry={TOY_WINDOWS} devTools={false}>
          <DecisionPane />
        </GameProvider>
      </I18nProvider>,
    ),
  );
}

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const found = container.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};

async function settleUi(): Promise<void> {
  await act(async () => {
    await settle();
  });
}

describe("drafts and the session (§3.5, §3.7)", () => {
  it("keeps a half-made Contribution across another player's submission and a stale recovery, and resets on own success", async () => {
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
    mount(p1.store);
    expect($("form[data-window]").getAttribute("data-window")).toBe("contributions");

    act(() => $<HTMLInputElement>('input[name="card"][value="STOKE"]').click());
    const revision = p1.store.getSnapshot().view!.game.revision;

    await harnessCommand(harness, "P2", { type: "SUBMIT_CONTRIBUTION", windowId, card: "TEND", fuelLedger: false });
    p1.api.ping();
    await settleUi();
    expect(p1.store.getSnapshot().view!.game.revision).toBe(revision + 1);
    expect($<HTMLInputElement>('input[name="card"][value="STOKE"]').checked).toBe(true);

    p1.api.fault("executeCommand", { kind: "error", code: "STALE_REVISION" });
    await act(async () => {
      $<HTMLButtonElement>('[data-action="confirm"]').click();
      await settle();
    });
    expect(p1.api.callsOf("executeCommand")).toHaveLength(1);
    expect(p1.store.getSnapshot().status).toMatchObject({ sending: false, unsent: null, error: null });
    expect($<HTMLInputElement>('input[name="card"][value="STOKE"]').checked).toBe(true);

    await act(async () => {
      $<HTMLButtonElement>('[data-action="confirm"]').click();
      await settle();
    });
    expect(p1.store.getSnapshot().view!.own!.pendingContribution).toMatchObject({ card: "STOKE", windowId });
    expect($("form[data-window]").getAttribute("data-window")).toBe("waiting");
    p1.store.dispose();
  });

  it("keeps a half-made hand trim across another player's parallel trim", async () => {
    const { harness } = await started({ humans: 2 });
    let p2Discard: OrderId[] = [];
    await seedState(harness, (gameId, revision): GameState => {
      const probe = seatState(2, { gameId });
      const [a, b, c, d, e, f, g, h, i, j] = probe.hidden.mainDeck as OrderId[];
      p2Discard = [f!];
      return seatState(2, {
        gameId,
        players: [
          { id: "P1", hand: [a!, b!, c!, d!, e!] },
          { id: "P2", hand: [f!, g!, h!, i!, j!] },
        ],
        phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["P1", "P2"], openedAtRevision: revision },
      });
    });
    const p1 = await clientFor(harness, harness.humans[0] as RoomConnection);
    mount(p1.store);
    expect($("form[data-window]").getAttribute("data-window")).toBe("hand_limit");
    const first = $<HTMLInputElement>('input[name="orderIds"]');
    act(() => first.click());
    expect(first.checked).toBe(true);

    await harnessCommand(harness, "P2", { type: "DISCARD_TO_HAND_LIMIT", orderIds: p2Discard });
    p1.api.ping();
    await settleUi();
    const phase = p1.store.getSnapshot().view!.game.phase;
    expect(phase.type === "cleanup_hand_limit" ? phase.pendingPlayerIds : []).toEqual(["P1"]);
    expect($<HTMLInputElement>(`input[name="orderIds"][value="${first.value}"]`).checked).toBe(true);
    expect($('[data-action="confirm"]').getAttribute("aria-disabled")).toBeNull();
    p1.store.dispose();
  });
});
