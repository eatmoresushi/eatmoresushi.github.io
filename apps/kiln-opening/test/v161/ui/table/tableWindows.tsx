/**
 * Test-only window specs with table adapters (B2), so the table and board components can be
 * tested through `TableSelection` before B4 and B5 land their real adapters (§3.5, §9.2: "seen in
 * SSR with seeded drafts"). Every target comes from an engine selector; the components never see
 * these models, only the `TableSelection` they produce.
 *
 * - `work`: Place shortcuts. `placeTargets` carries every worker entry of `placementOptions`,
 *   legal or not (CR B2-3); the draft's location and worker are the active placement.
 * - `orders`: each held Order is completable or blocked (`completableOrders`); the chosen one is
 *   `chosen`, and its first matching group (`orderMatchOptions`) is highlighted.
 * - `hand_limit`: each held Order is choosable, or `discard` once chosen for the trim.
 * - `commission`: display slots that may be reserved now (`commissionOptions(...).faceUpSlots`).
 *
 * Also `withModelCeramics`, which simulates change request CR B2-1 (`GameModel.ceramics`) on a
 * fixture source, so the boards' ceramic chips can be tested before B6 lands it.
 */
import { commissionOptions, completableOrders, orderMatchOptions, placementOptions } from "../../../../src/game/index.ts";
import type { LocationId, OrderId } from "../../../../src/game/index.ts";
import { defineWindow } from "../../../../src/app/state/draftStore.ts";
import type { DraftModel, WindowRegistry } from "../../../../src/app/state/draftStore.ts";
import { displaySlotKey, placementWorkerKey, tableSelection } from "../../../../src/app/state/tableSelection.ts";
import type { OrderTargetState } from "../../../../src/app/state/tableSelection.ts";
import type { GameSource } from "../../../../src/app/session/gameSource.ts";
import { msg } from "../../../../src/app/i18n/translator.ts";
import { TOY_WINDOWS, trimDraft } from "../support/toyWindows.tsx";
import type { TrimAction, TrimDraft } from "../support/toyWindows.tsx";

function Nothing() {
  return null;
}

// ── Work: Place shortcuts ─────────────────────────────────────────────────────────────────

export interface PlaceDraft {
  locationId: LocationId | null;
  workerKey: string | null;
}

export type PlaceAction = { readonly type: "place"; readonly locationId: LocationId; readonly workerKey: string };

const placeDraft: DraftModel<PlaceDraft, PlaceAction> = {
  initial: () => ({ locationId: null, workerKey: null }),
  reduce: (draft, action) => (action.type === "revalidate" ? draft : { locationId: action.locationId, workerKey: action.workerKey }),
  options: () => null,
  build: () => null,
  fromCommand: () => null,
  summary: () => null,
};

// ── Orders: completable, blocked and chosen ───────────────────────────────────────────────

export interface PickDraft {
  orderId: OrderId | null;
}

export type PickAction = { readonly type: "pick"; readonly orderId: OrderId };

const pickDraft: DraftModel<PickDraft, PickAction> = {
  initial: () => ({ orderId: null }),
  reduce: (draft, action) => (action.type === "revalidate" ? draft : { orderId: action.orderId }),
  options: () => null,
  build: () => null,
  fromCommand: () => null,
  summary: () => null,
};

// ── Commission: display slots ─────────────────────────────────────────────────────────────

export interface SlotDraft {
  slot: number | null;
}

export type SlotAction = { readonly type: "slot"; readonly slot: number };

const slotDraft: DraftModel<SlotDraft, SlotAction> = {
  initial: () => ({ slot: null }),
  reduce: (draft, action) => (action.type === "revalidate" ? draft : { slot: action.slot }),
  options: () => null,
  build: () => null,
  fromCommand: () => null,
  summary: () => null,
};

const title = () => msg("common.verb.decide");

export const TABLE_WINDOWS: WindowRegistry = {
  ...TOY_WINDOWS,
  work: defineWindow({
    kind: "work",
    Component: Nothing,
    draft: placeDraft,
    title,
    table: {
      select: (draft, _model, engine) =>
        tableSelection({
          placeTargets: new Map(placementOptions(engine.view).map((option) => [option.locationId, option.workers])),
          activePlacement: draft.locationId === null || draft.workerKey === null ? null : { locationId: draft.locationId, workerKey: draft.workerKey },
        }),
      act: (_draft, action) => (action.type === "place" ? { type: "place", locationId: action.locationId, workerKey: action.workerKey } : null),
    },
  }),
  orders: defineWindow({
    kind: "orders",
    Component: Nothing,
    draft: pickDraft,
    title,
    table: {
      select: (draft, model, engine) => {
        const completable = new Set(completableOrders(engine.view).map((option) => option.orderId));
        const targets = new Map<string, { state: OrderTargetState; disabled: boolean }>();
        for (const orderId of model.hand) {
          const state: OrderTargetState = draft.orderId === orderId ? "chosen" : completable.has(orderId) ? "completable" : "blocked";
          targets.set(orderId, { state, disabled: state === "blocked" });
        }
        const group = draft.orderId === null ? [] : orderMatchOptions(engine.view, draft.orderId, 1)[0]?.ceramicIds ?? [];
        return tableSelection({ orderTargets: targets, highlightedCeramicIds: new Set(group) });
      },
      act: (_draft, action) => (action.type === "order" ? { type: "pick", orderId: action.key as OrderId } : null),
    },
  }),
  hand_limit: defineWindow({
    kind: "hand_limit",
    Component: Nothing,
    draft: trimDraft,
    title,
    table: {
      select: (draft: TrimDraft, model) =>
        tableSelection({
          orderTargets: new Map(model.hand.map((orderId) => [orderId, { state: draft.orderIds.includes(orderId) ? "discard" : "choosable", disabled: false }] as const)),
        }),
      act: (_draft, action): TrimAction | null => (action.type === "order" ? { type: "toggle", orderId: action.key as OrderId } : null),
    },
  }),
  commission: defineWindow({
    kind: "commission",
    Component: Nothing,
    draft: slotDraft,
    title,
    table: {
      select: (draft, model, engine) => {
        const window = model.window;
        const effect = window.kind === "commission" ? window.effect : "apprentice";
        const slots = commissionOptions(engine.view, effect).faceUpSlots;
        return tableSelection({
          orderTargets: new Map(slots.map((slot) => [displaySlotKey(slot), { state: draft.slot === slot ? "chosen" : "choosable", disabled: false }] as const)),
        });
      },
      act: (_draft, action) => {
        const slot = /^slot:(\d+)$/.exec(action.type === "order" ? action.key : "")?.[1];
        return slot === undefined ? null : { type: "slot", slot: Number(slot) };
      },
    },
  }),
};

/** The same windows with no table adapter at all: the table must be inert. */
export const INERT_WINDOWS: WindowRegistry = {
  ...TABLE_WINDOWS,
  work: defineWindow({ kind: "work", Component: Nothing, draft: placeDraft, title }),
  orders: defineWindow({ kind: "orders", Component: Nothing, draft: pickDraft, title }),
};

/** The worker key the table sends for a placement entry (re-exported for tests). */
export { placementWorkerKey };

/**
 * CR B2-1 has landed (`GameModel.ceramics`), so every source's model already carries the view's
 * ceramics. Kept as the identity so older call sites read unchanged.
 */
export function withModelCeramics<S extends GameSource>(source: S): S {
  return source;
}
