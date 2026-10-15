/**
 * Small real draft models for the frame tests (A2): a Kiln selection form and a Contribution
 * form, built only from engine selectors, with a table adapter, so the harness, the draft store
 * and table selection can be tested before B4 and B5 land the real windows. Test code only.
 */
import { contributionOptions, handLimitStatus, kilnSelectionOptions, settersMarkOptions } from "../../../../src/game/index.ts";
import type { ContributionCardId, KilnId, KilnSpaceId, OrderId } from "../../../../src/game/index.ts";
import { WINDOWS } from "../../../../src/app/decision/windows.ts";
import { useDraft, useGame } from "../../../../src/app/state/hooks.ts";
import { defineWindow } from "../../../../src/app/state/draftStore.ts";
import type { DraftModel, WindowRegistry } from "../../../../src/app/state/draftStore.ts";
import { tableSelection } from "../../../../src/app/state/tableSelection.ts";
import { msg } from "../../../../src/app/i18n/translator.ts";

// ── Kiln selection ────────────────────────────────────────────────────────────────────────

export interface KilnDraft {
  kilnId: KilnId | null;
}

export type KilnAction = { readonly type: "pick"; readonly kilnId: KilnId };

export const kilnDraft: DraftModel<KilnDraft, KilnAction, readonly KilnId[]> = {
  initial: () => ({ kilnId: null }),
  reduce(draft, action, _model, engine) {
    const offered = kilnSelectionOptions(engine.view).filter((option) => option.available).map((option) => option.kilnId);
    if (action.type === "revalidate") return draft.kilnId !== null && !offered.includes(draft.kilnId) ? { kilnId: null } : draft;
    return offered.includes(action.kilnId) ? { kilnId: action.kilnId } : draft;
  },
  options: (_draft, _model, engine) => kilnSelectionOptions(engine.view).filter((option) => option.available).map((option) => option.kilnId),
  build: (draft) => (draft.kilnId === null ? null : { type: "SELECT_KILN", kilnId: draft.kilnId }),
  fromCommand: (command) => (command.type === "SELECT_KILN" ? { kilnId: command.kilnId } : null),
  summary: (draft) => (draft.kilnId === null ? null : msg("common.verb.confirm")),
};

export function ToyKilnForm() {
  const [draft, dispatch] = useDraft<KilnDraft, KilnAction>();
  return (
    <fieldset data-toy="kiln">
      {(["RU", "GU", "GE", "DI", "JU"] as const).map((kilnId) => (
        <label key={kilnId}>
          <input type="radio" name="kilnId" value={kilnId} checked={draft.kilnId === kilnId} onChange={() => dispatch({ type: "pick", kilnId })} />
          {kilnId}
        </label>
      ))}
    </fieldset>
  );
}

// ── Setter's Mark, with a kiln-target table adapter ──────────────────────────────────────

export interface MarkDraft {
  spaceId: KilnSpaceId | null;
}

export type MarkAction = { readonly type: "space"; readonly spaceId: KilnSpaceId };

export const markDraft: DraftModel<MarkDraft, MarkAction, readonly KilnSpaceId[]> = {
  initial: () => ({ spaceId: null }),
  reduce(draft, action, _model, engine) {
    const offered = settersMarkOptions(engine.view);
    if (action.type === "revalidate") return draft.spaceId !== null && !offered.includes(draft.spaceId) ? { spaceId: null } : draft;
    return offered.includes(action.spaceId) ? { spaceId: action.spaceId } : draft;
  },
  options: (_draft, _model, engine) => settersMarkOptions(engine.view),
  build: (draft) => ({ type: "PLACE_SETTERS_MARK", spaceId: draft.spaceId }),
  fromCommand: (command) => (command.type === "PLACE_SETTERS_MARK" ? { spaceId: command.spaceId } : null),
  summary: () => null,
};

export function ToyMarkForm() {
  const [draft] = useDraft<MarkDraft, MarkAction>();
  return <output data-toy="mark">{draft.spaceId ?? "none"}</output>;
}

// ── Contributions ─────────────────────────────────────────────────────────────────────────

export interface ContributionDraft {
  card: ContributionCardId | null;
}

export type ContributionAction = { readonly type: "card"; readonly card: ContributionCardId };

export const contributionDraft: DraftModel<ContributionDraft, ContributionAction, readonly ContributionCardId[]> = {
  initial: () => ({ card: null }),
  reduce(draft, action, _model, engine) {
    const offered = contributionOptions(engine.view).filter((option) => option.affordable && !option.command.fuelLedger).map((option) => option.command.card);
    if (action.type === "revalidate") return draft.card !== null && !offered.includes(draft.card) ? { card: null } : draft;
    return offered.includes(action.card) ? { card: action.card } : draft;
  },
  options: (_draft, _model, engine) => contributionOptions(engine.view).filter((option) => option.affordable && !option.command.fuelLedger).map((option) => option.command.card),
  build: (draft, _model, engine) => contributionOptions(engine.view).find((option) => option.command.card === draft.card && !option.command.fuelLedger)?.command ?? null,
  fromCommand: (command) => (command.type === "SUBMIT_CONTRIBUTION" && !command.fuelLedger ? { card: command.card } : null),
  summary: () => null,
};

export function ToyContributionForm() {
  const [draft, dispatch] = useDraft<ContributionDraft, ContributionAction>();
  return (
    <fieldset data-toy="contribution">
      {(["TEND", "BANK", "STOKE"] as const).map((card) => (
        <label key={card}>
          <input type="radio" name="card" value={card} checked={draft.card === card} onChange={() => dispatch({ type: "card", card })} />
          {card}
        </label>
      ))}
    </fieldset>
  );
}

// ── Hand trim ─────────────────────────────────────────────────────────────────────────────

export interface TrimDraft {
  orderIds: readonly OrderId[];
}

export type TrimAction = { readonly type: "toggle"; readonly orderId: OrderId };

export const trimDraft: DraftModel<TrimDraft, TrimAction, readonly OrderId[]> = {
  initial: () => ({ orderIds: [] }),
  reduce(draft, action, model) {
    if (action.type === "revalidate") {
      const kept = draft.orderIds.filter((id) => model.hand.includes(id));
      return kept.length === draft.orderIds.length ? draft : { orderIds: kept };
    }
    if (!model.hand.includes(action.orderId)) return draft;
    return draft.orderIds.includes(action.orderId)
      ? { orderIds: draft.orderIds.filter((id) => id !== action.orderId) }
      : { orderIds: [...draft.orderIds, action.orderId] };
  },
  options: (_draft, model) => model.hand,
  build(draft, _model, engine) {
    const viewer = engine.view.viewerId;
    if (viewer === null) return null;
    return draft.orderIds.length === handLimitStatus(engine.view, viewer).mustDiscard ? { type: "DISCARD_TO_HAND_LIMIT", orderIds: [...draft.orderIds] } : null;
  },
  fromCommand: (command) => (command.type === "DISCARD_TO_HAND_LIMIT" ? { orderIds: [...command.orderIds] } : null),
  summary: () => null,
};

export function ToyTrimForm() {
  const [draft, dispatch] = useDraft<TrimDraft, TrimAction>();
  const hand = useGame().hand;
  return (
    <fieldset data-toy="trim">
      {hand.map((orderId) => (
        <label key={orderId}>
          <input type="checkbox" name="orderIds" value={orderId} checked={draft.orderIds.includes(orderId)} onChange={() => dispatch({ type: "toggle", orderId })} />
          {orderId}
        </label>
      ))}
    </fieldset>
  );
}

/** The app registry with the toy windows in place of four stubs. */
export const TOY_WINDOWS: WindowRegistry = {
  ...WINDOWS,
  kiln_selection: defineWindow({ kind: "kiln_selection", Component: ToyKilnForm, draft: kilnDraft, title: () => msg("common.verb.decide") }),
  setters_mark: defineWindow({
    kind: "setters_mark",
    Component: ToyMarkForm,
    draft: markDraft,
    title: () => msg("common.verb.decide"),
    alternative: () => ({ label: msg("common.verb.decline"), command: { type: "PLACE_SETTERS_MARK", spaceId: null } }),
    table: {
      select: (draft, _model, engine) =>
        tableSelection({ kilnTargets: new Map(settersMarkOptions(engine.view).map((spaceId) => [spaceId, { pressed: draft.spaceId === spaceId }])) }),
      act: (_draft, action) => (action.type === "kilnSpace" ? { type: "space", spaceId: action.spaceId } : null),
    },
  }),
  contributions: defineWindow({ kind: "contributions", Component: ToyContributionForm, draft: contributionDraft, title: () => msg("common.verb.chooseContribution") }),
  hand_limit: defineWindow({ kind: "hand_limit", Component: ToyTrimForm, draft: trimDraft, title: () => msg("common.verb.discard") }),
};
