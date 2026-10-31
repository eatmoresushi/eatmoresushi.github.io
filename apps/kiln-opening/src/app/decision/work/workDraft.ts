/**
 * The draft model of the work turn (UI_V1.6.1_ARCHITECTURE §3.4, §3.5; wireframe `decWork`,
 * `workSummary`). Owner: B4.
 *
 * One draft serves the `work` window's two steps:
 * - **before the worker action:** place a worker (worker entry × location × that location's
 *   sub-draft), or first take a free action or use the Colour Samples swap;
 * - **after the worker action:** a free action, the Colour Samples swap, or End turn.
 * The free actions (owner revision 5, change 36, rev. 5 L168–176; owner ruling R26) are open in
 * both steps, any number, one per Confirm, and are never worker actions, so the step stays as it
 * was afterwards: complete a held Order (`complete_order`, the shared completion model of
 * `orders/orderCompletion.ts` over `completableOrders`), sell a Flawed ceramic (`sell_flawed`,
 * from `sellFlawedOptions`) and spend Imperial Priority (`imperial_priority`). Rewards gained
 * before the placement count for it (the engine's placement options are re-read). The Colour
 * Samples swap (v1.6.2 L632) is not a free action but shares the same before/after timing.
 *
 * **Owner UI decision D21:** free actions are never a step of their own. Before placing they are
 * the turn line's chips and the pieces' own buttons, each choosing its form (`freeAction`, in
 * `freeActionItems`' order), and placing is how the turn moves on: nothing has to be dismissed.
 * After the worker action the same list is the pane's choice, with nothing chosen at first: every
 * entry spends something for good, so it takes the player's own press, and End turn is the default.
 *
 * The worker and the location are chosen on the table (owner review, 2026-10-17): the work
 * window's table adapter turns a Place shortcut into the `place` action, and a Guild Hall Tech or
 * deck on the Tech display into the Guild Hall sub-draft's action. The `worker` and `location`
 * actions remain for tests and tools. The work turn keeps **one sub-draft per location**
 * (`perLocation`, §3.5), so moving between locations never discards a sub-editor's choices; only
 * the active location's sub-draft is revalidated and built. Worker entries and legality come from `placementOptions` (memoised
 * per view), Imperial Priority from `imperialPriorityOptions`, the Colour Samples swap from
 * `colourSamplesSwapOptions` (both composed here as sub-drafts, `imperialPriority` and `swap`).
 *
 * `initial` pre-selects nothing unless only one choice exists: the only placement left opens by
 * itself, unless a free action or the swap could come first (its chips must stay up, D21).
 * `reduce(revalidate)` drops any choice the new options no longer offer and keeps the very same
 * draft when nothing changed.
 */
import { imperialPriorityOptions } from "../../../game/index.ts";
import type {
  AuthoritativeCommand,
  CeramicId,
  GameRuleError,
  LocationId,
  PlacementOption,
  PlacementWorkerOption,
  SellFlawedOptions,
  WorkerKind,
} from "../../../game/index.ts";
import { locationName, workerKindName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { MessageParam, RichMessage, Translator } from "../../i18n/translator.ts";
import { REVALIDATE } from "../../state/draftStore.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { placementWorkerKey } from "../../state/tableSelection.ts";
import { imperialPriorityDraft } from "./ImperialPriority.draft.ts";
import type { ImperialPriorityAction, ImperialPriorityDraft, ImperialPriorityOptions } from "./ImperialPriority.draft.ts";
import { colourSamplesSwapDraft, swapUsable } from "./ColourSamplesSwap.draft.ts";
import { saleCommand, saleOf, saleOffered, saleOptions, saleSummary } from "../sale/sellFlawed.ts";
import { EMPTY_COMPLETION, buildCompletion, completionFromCommand, completionOptions, reduceCompletion, settleCompletion } from "../orders/orderCompletion.ts";
import type { CompletionAction, CompletionDraft, CompletionOptions } from "../orders/orderCompletion.ts";
import { COMPLETABLE, completionSummary } from "../orders/orderDraft.ts";
import { deliverKey, freeActionItems } from "../freeActions.ts";
import type { FreeActionItem, FreeActionKey } from "../freeActions.ts";
import type { ColourSamplesSwapAction, ColourSamplesSwapDraft, ColourSamplesSwapOptions } from "./ColourSamplesSwap.draft.ts";
import { keepIfSame, placementOf, placements, viewMemo, workContext, workerEntry } from "./context.ts";
import type { WorkContext } from "./context.ts";
import { canalWharfDraft } from "./locations/CanalWharf.draft.ts";
import type { CanalWharfAction, CanalWharfDraft, CanalWharfOptions } from "./locations/CanalWharf.draft.ts";
import { commissionMarketDraft } from "./locations/CommissionMarket.draft.ts";
import type { CommissionMarketAction, CommissionMarketDraft, CommissionMarketOptions } from "./locations/CommissionMarket.draft.ts";
import { placementLocationOf } from "./locations/editor.ts";
import type { LocationDraftModel, PlacementCommandOf, PlacementContext } from "./locations/editor.ts";
import { formDecorateDraft } from "./locations/FormDecorate.draft.ts";
import type { FormDecorateAction, FormDecorateDraft, FormDecorateOptions } from "./locations/FormDecorate.draft.ts";
import { glazeLoadDraft } from "./locations/GlazeLoad.draft.ts";
import type { GlazeLoadAction, GlazeLoadDraft, GlazeLoadOptions } from "./locations/GlazeLoad.draft.ts";
import { guildHallDraft } from "./locations/GuildHall.draft.ts";
import type { GuildHallAction, GuildHallDraft, GuildHallOptions } from "./locations/GuildHall.draft.ts";
import { magistratesHallDraft } from "./locations/MagistratesHall.draft.ts";
import type { MagistratesHallAction, MagistratesHallDraft, MagistratesHallOptions } from "./locations/MagistratesHall.draft.ts";
import { materialsYardDraft } from "./locations/MaterialsYard.draft.ts";
import type { MaterialsYardAction, MaterialsYardDraft, MaterialsYardOptions } from "./locations/MaterialsYard.draft.ts";

// ── Location sub-drafts ───────────────────────────────────────────────────────────────────

/** Each location's sub-draft, action and options types. */
export interface LocationTypes {
  materials_yard: { draft: MaterialsYardDraft; action: MaterialsYardAction; options: MaterialsYardOptions };
  form_decorate: { draft: FormDecorateDraft; action: FormDecorateAction; options: FormDecorateOptions };
  glaze_load: { draft: GlazeLoadDraft; action: GlazeLoadAction; options: GlazeLoadOptions };
  commission_market: { draft: CommissionMarketDraft; action: CommissionMarketAction; options: CommissionMarketOptions };
  guild_hall: { draft: GuildHallDraft; action: GuildHallAction; options: GuildHallOptions };
  canal_wharf: { draft: CanalWharfDraft; action: CanalWharfAction; options: CanalWharfOptions };
  magistrates_hall: { draft: MagistratesHallDraft; action: MagistratesHallAction; options: MagistratesHallOptions };
}

export type PerLocation = { readonly [L in LocationId]: LocationTypes[L]["draft"] };

type ModelOf<L extends LocationId> = LocationDraftModel<L, LocationTypes[L]["draft"], LocationTypes[L]["action"], LocationTypes[L]["options"]>;

export const LOCATION_MODELS: { readonly [L in LocationId]: ModelOf<L> } = {
  materials_yard: materialsYardDraft,
  form_decorate: formDecorateDraft,
  glaze_load: glazeLoadDraft,
  commission_market: commissionMarketDraft,
  guild_hall: guildHallDraft,
  canal_wharf: canalWharfDraft,
  magistrates_hall: magistratesHallDraft,
};

/** The active location with its sub-draft and options (a union narrowed by `locationId`). */
export type ActiveLocation = {
  [L in LocationId]: { locationId: L; draft: LocationTypes[L]["draft"]; options: LocationTypes[L]["options"]; context: PlacementContext };
}[LocationId];

/** A sub-editor's action, addressed to its location. */
export type SubAction = { [L in LocationId]: { readonly type: "sub"; readonly locationId: L; readonly action: LocationTypes[L]["action"] } }[LocationId];

// ── The work draft ────────────────────────────────────────────────────────────────────────

export type WorkMode = "place" | "imperial_priority" | "colour_samples_swap" | "sell_flawed" | "complete_order" | "end_turn";
export type WorkStep = "before_action" | "after_action";

export interface WorkDraft {
  /** What this command does; null until chosen (after the action, with several choices). */
  readonly mode: WorkMode | null;
  /** `shifu`, `apprentice` or `apprentice-senior` (`placementWorkerKey`); never a worker ID. */
  readonly workerKey: string | null;
  readonly locationId: LocationId | null;
  readonly perLocation: PerLocation;
  readonly imperialPriority: ImperialPriorityDraft;
  /** The Colour Samples swap's held Order to discard (v1.6.2 L632). */
  readonly swap: ColourSamplesSwapDraft;
  /** The Flawed ceramic to sell (`sell_flawed`, a free action), or null. */
  readonly sell: CeramicId | null;
  /** The held Order to complete and its ceramics (`complete_order`, a free action). */
  readonly completion: CompletionDraft;
}

export type WorkAction =
  | { readonly type: "mode"; readonly mode: WorkMode }
  | { readonly type: "worker"; readonly workerKey: string }
  | { readonly type: "location"; readonly locationId: LocationId }
  | { readonly type: "place"; readonly locationId: LocationId; readonly workerKey: string }
  | SubAction
  | { readonly type: "imperialPriority"; readonly action: ImperialPriorityAction }
  | { readonly type: "swap"; readonly action: ColourSamplesSwapAction }
  /** One entry of the free-action list: a chip, the after-action choice, a piece's button (D21). */
  | { readonly type: "freeAction"; readonly key: FreeActionKey }
  /** Sell this Flawed ceramic (the pane's choice, or a Sell button on the table). */
  | { readonly type: "sell"; readonly ceramicId: CeramicId }
  /** Complete a held Order (its ceramics, or a completable Order in the hand). */
  | { readonly type: "complete"; readonly action: CompletionAction };

export interface WorkModeOption {
  mode: WorkMode;
}

/**
 * What the pane's heading names (owner review, 2026-10-17; D21), after what the pane shows: placing
 * a worker; an ability's own name while its form is open before the worker action; the after-action
 * window.
 */
export type WorkHeading = "place" | "after_action" | Exclude<WorkMode, "place" | "end_turn">;

export interface WorkerChoice {
  /** `placementWorkerKey`: the input value (never a worker ID, D9). */
  key: string;
  kind: WorkerKind;
  senior: boolean;
  /** How many workers of this kind are available. */
  available: number;
  /** Legal at some location now. */
  legal: boolean;
}

export interface LocationChoice {
  locationId: LocationId;
  placement: PlacementOption;
  /** The chosen worker's entry here (null when this location does not offer it). */
  entry: PlacementWorkerOption | null;
  /** Legal for the chosen worker (or, before a worker is chosen, for some worker). */
  legal: boolean;
  /** The engine's reason when not legal, with its details (§5 gap 12). */
  error: GameRuleError | null;
}

export interface WorkOptions {
  step: WorkStep;
  modes: readonly WorkModeOption[];
  /** What the viewer can do right now (D21): the chips before placing, the pane's list after. */
  freeActions: readonly FreeActionItem[];
  /** The list's entry the draft has chosen, or null. */
  freeAction: FreeActionKey | null;
  /** What the pane's heading and the phone sheet strip name now (the window spec's `title`). */
  heading: WorkHeading;
  /** An ability's form is open before the worker action: its way back to placing (D14). */
  backToPlacing: boolean;
  workers: readonly WorkerChoice[];
  locations: readonly LocationChoice[];
  active: ActiveLocation | null;
  imperialPriority: ImperialPriorityOptions | null;
  /** The Colour Samples swap's discard choices while it may be used, else null. */
  swap: ColourSamplesSwapOptions | null;
  /** The Flawed ceramics the viewer may sell now, else null. */
  sale: SellFlawedOptions | null;
  /** The completion's lists while a held Order can be completed now, else null. */
  completion: CompletionOptions | null;
  workersLeft: number;
}

function stepOf(model: GameModel): WorkStep {
  return model.window.kind === "work" ? model.window.step : "before_action";
}

function blankPerLocation(): PerLocation {
  return {
    materials_yard: materialsYardDraft.blank(),
    form_decorate: formDecorateDraft.blank(),
    glaze_load: glazeLoadDraft.blank(),
    commission_market: commissionMarketDraft.blank(),
    guild_hall: guildHallDraft.blank(),
    canal_wharf: canalWharfDraft.blank(),
    magistrates_hall: magistratesHallDraft.blank(),
  };
}

function imperialUsable(engine: EngineView): boolean {
  return viewMemo(engine.view, "imperialPriorityOptions", () => imperialPriorityOptions(engine.view)).usable;
}

/** The held Orders the viewer may complete now, a free action (`freeActionOptions`), in hand order. */
export function completableNow(engine: EngineView): readonly string[] {
  return freeActionItems(engine).flatMap((item) => (item.kind === "deliver" ? [item.orderId] : []));
}

/** The draft's modes, in D21's order (Deliver, Sell, Imperial Priority, the swap). */
function modesOf(model: GameModel, engine: EngineView): WorkMode[] {
  const step = stepOf(model);
  const modes: WorkMode[] = step === "before_action" ? ["place"] : [];
  if (completableNow(engine).length > 0) modes.push("complete_order");
  if (saleOptions(engine) !== null) modes.push("sell_flawed");
  if (imperialUsable(engine)) modes.push("imperial_priority");
  if (swapUsable(engine)) modes.push("colour_samples_swap");
  if (step === "after_action") modes.push("end_turn");
  return modes;
}

/** Every worker entry offered anywhere, in Shifu, Apprentice, Apprentice-as-Shifu order. */
function workerChoices(context: WorkContext): WorkerChoice[] {
  const all = placements(context.view);
  const workers = context.view.game.players[context.playerId]?.workers ?? {};
  const kinds = context.me.availableWorkerIds.map((id) => workers[id]?.kind).filter((kind): kind is WorkerKind => kind !== undefined);
  const choices: WorkerChoice[] = [];
  for (const placement of all) {
    for (const worker of placement.workers) {
      const key = placementWorkerKey(worker);
      let choice = choices.find((candidate) => candidate.key === key);
      if (choice === undefined) {
        choice = { key, kind: worker.kind, senior: worker.seniorApprentice, available: kinds.filter((kind) => kind === worker.kind).length, legal: false };
        choices.push(choice);
      }
      if (worker.legal) choice.legal = true;
    }
  }
  const rank = (choice: WorkerChoice) => (choice.kind === "shifu" ? 0 : choice.senior ? 2 : 1);
  return choices.sort((a, b) => rank(a) - rank(b));
}

function locationChoices(context: WorkContext, workerKey: string | null): LocationChoice[] {
  return placements(context.view).map((placement) => {
    if (workerKey === null) {
      return { locationId: placement.locationId, placement, entry: null, legal: placement.legal, error: placement.legal ? null : placement.workers[0]?.error ?? null };
    }
    const entry = workerEntry(placement, workerKey);
    return {
      locationId: placement.locationId,
      placement,
      entry,
      legal: entry?.legal === true,
      error: entry === null ? null : entry.error,
    };
  });
}

/** A location may stay chosen: legal for the chosen worker, or for some worker before one is chosen. */
function locationValid(context: WorkContext, locationId: LocationId, workerKey: string | null): boolean {
  const placement = placementOf(context.view, locationId);
  if (placement === null) return false;
  return workerKey === null ? placement.legal : workerEntry(placement, workerKey)?.legal === true;
}

function placementContext(context: WorkContext, locationId: LocationId | null, workerKey: string | null): PlacementContext | null {
  if (locationId === null || workerKey === null) return null;
  const placement = placementOf(context.view, locationId);
  const worker = workerEntry(placement, workerKey);
  if (placement === null || worker === null || !worker.legal) return null;
  return { ...context, placement, worker };
}

/** Calls one location's model with its own types (the union is resolved by `locationId`). */
function withModel<R>(locationId: LocationId, run: <L extends LocationId>(model: ModelOf<L>, id: L) => R): R {
  return run(LOCATION_MODELS[locationId] as ModelOf<typeof locationId>, locationId);
}

function subDraft<L extends LocationId>(draft: WorkDraft, locationId: L): LocationTypes[L]["draft"] {
  return draft.perLocation[locationId] as LocationTypes[L]["draft"];
}

function withSub<L extends LocationId>(draft: WorkDraft, locationId: L, sub: LocationTypes[L]["draft"]): WorkDraft {
  if (draft.perLocation[locationId] === sub) return draft;
  return { ...draft, perLocation: { ...draft.perLocation, [locationId]: sub } };
}

/** Revalidates (or prepares) the active location's sub-draft. */
function settleActive(draft: WorkDraft, context: WorkContext, how: "revalidate" | "prepare"): WorkDraft {
  const placement = placementContext(context, draft.locationId, draft.workerKey);
  if (placement === null || draft.locationId === null) return draft;
  return withModel(draft.locationId, (model, id) => {
    const sub = subDraft(draft, id);
    const next = how === "prepare" ? model.prepare(sub, placement) : model.reduce(sub, REVALIDATE, placement);
    return withSub(draft, id, next);
  });
}

function revalidate(draft: WorkDraft, model: GameModel, engine: EngineView): WorkDraft {
  const context = workContext(model, engine);
  if (context === null) return draft;
  const modes = modesOf(model, engine);
  const step = stepOf(model);
  let mode = draft.mode;
  if (mode !== null && !modes.includes(mode)) mode = step === "before_action" ? "place" : null;
  const workerKey = draft.workerKey !== null && workerChoices(context).some((choice) => choice.key === draft.workerKey) ? draft.workerKey : null;
  const locationId = draft.locationId !== null && locationValid(context, draft.locationId, workerKey) ? draft.locationId : null;
  let next: WorkDraft = { ...draft, mode, workerKey, locationId };
  if (mode === "place") next = settleActive(next, context, "revalidate");
  if (mode === "imperial_priority") next = { ...next, imperialPriority: imperialPriorityDraft.reduce(next.imperialPriority, REVALIDATE, model, engine) };
  if (mode === "colour_samples_swap") next = { ...next, swap: colourSamplesSwapDraft.reduce(next.swap, REVALIDATE, model, engine) };
  if (next.sell !== null && (mode !== "sell_flawed" || !saleOffered(engine, next.sell))) next = { ...next, sell: null };
  // A draft seeded without `completion` (tests, the gallery) has none chosen.
  const completion = next.completion ?? EMPTY_COMPLETION;
  const settled = mode === "complete_order" ? settleCompletion(completion, engine, COMPLETABLE) : EMPTY_COMPLETION;
  if (settled !== next.completion) next = { ...next, completion: settled };
  return keepIfSame(draft, next);
}

/** The draft with this list entry chosen: its form open, its only choice made (§3.5). */
function chooseFreeAction(draft: WorkDraft, item: FreeActionItem, engine: EngineView): WorkDraft {
  switch (item.kind) {
    case "deliver":
      return { ...draft, mode: "complete_order", completion: reduceCompletion(EMPTY_COMPLETION, { type: "order", orderId: item.orderId }, engine, COMPLETABLE) };
    case "sell": {
      const ids = saleOptions(engine)?.ceramicIds ?? [];
      return { ...draft, mode: "sell_flawed", sell: ids.length === 1 ? (ids[0] ?? null) : draft.sell };
    }
    case "imperial_priority":
      return { ...draft, mode: "imperial_priority" };
    case "swap":
      return { ...draft, mode: "colour_samples_swap" };
  }
}

/** The list's entry the draft has chosen, or null. */
function chosenFreeAction(draft: WorkDraft): FreeActionKey | null {
  switch (draft.mode) {
    case "complete_order":
      return draft.completion?.orderId == null ? null : deliverKey(draft.completion.orderId);
    case "sell_flawed":
      return "sell_flawed";
    case "imperial_priority":
      return "imperial_priority";
    case "colour_samples_swap":
      return "colour_samples_swap";
    default:
      return null;
  }
}

/** A location chosen by the player: also takes its only legal worker when none is chosen yet. */
function chooseLocation(draft: WorkDraft, context: WorkContext, locationId: LocationId, workerKey: string | null): WorkDraft {
  let key = workerKey ?? draft.workerKey;
  if (key === null) {
    const placement = placementOf(context.view, locationId);
    const legal = placement?.workers.filter((worker) => worker.legal) ?? [];
    const only = legal.length === 1 ? legal[0] : undefined;
    if (only !== undefined) key = placementWorkerKey(only);
  }
  if (!locationValid(context, locationId, key)) return draft;
  return settleActive({ ...draft, mode: "place", workerKey: key, locationId }, context, "prepare");
}

function blankDraft(model: GameModel, engine: EngineView): WorkDraft {
  return {
    mode: null,
    workerKey: null,
    locationId: null,
    perLocation: blankPerLocation(),
    imperialPriority: imperialPriorityDraft.initial(model, engine),
    swap: colourSamplesSwapDraft.initial(model, engine),
    sell: null,
    completion: EMPTY_COMPLETION,
  };
}

function placementCommand(draft: WorkDraft, context: WorkContext): AuthoritativeCommand | null {
  const placement = placementContext(context, draft.locationId, draft.workerKey);
  if (placement === null || draft.locationId === null) return null;
  return withModel(draft.locationId, (model, id) => model.build(subDraft(draft, id), placement));
}

function workerWords(workerKey: string): (t: Translator) => string {
  return (t) => {
    const senior = workerKey.endsWith("-senior");
    const kind: WorkerKind = workerKey.startsWith("shifu") ? "shifu" : "apprentice";
    const name = workerKindName(kind, t.locale);
    return senior ? t("work.work.workerSenior", { worker: name, shifu: workerKindName("shifu", t.locale) }) : name;
  };
}

export const workDraft: DraftModel<WorkDraft, WorkAction, WorkOptions> = {
  initial(model, engine) {
    const blank = blankDraft(model, engine);
    const context = workContext(model, engine);
    if (context === null) return blank;
    // After the worker action nothing is chosen: End turn is the choice beside every entry (D21).
    if (stepOf(model) === "after_action") return blank;
    let draft: WorkDraft = { ...blank, mode: "place" };
    const workers = workerChoices(context);
    const only = workers.length === 1 ? workers[0] : undefined;
    if (only === undefined) return draft;
    draft = { ...draft, workerKey: only.key };
    // Something could come first: the pane stays hidden, so the turn line keeps its chips (D21).
    if (freeActionItems(engine).length > 0) return draft;
    const legal = locationChoices(context, only.key).filter((choice) => choice.legal);
    const single = legal.length === 1 ? legal[0] : undefined;
    return single === undefined ? draft : chooseLocation(draft, context, single.locationId, only.key);
  },

  reduce(draft, action, model, engine) {
    if (action.type === "revalidate") return revalidate(draft, model, engine);
    const context = workContext(model, engine);
    if (context === null) return draft;
    switch (action.type) {
      case "mode": {
        if (!modesOf(model, engine).includes(action.mode)) return draft;
        return revalidate({ ...draft, mode: action.mode }, model, engine);
      }
      case "freeAction": {
        const item = freeActionItems(engine).find((candidate) => candidate.key === action.key);
        return item === undefined ? draft : chooseFreeAction(draft, item, engine);
      }
      case "worker": {
        if (!workerChoices(context).some((choice) => choice.key === action.workerKey)) return draft;
        const next: WorkDraft = { ...draft, mode: "place", workerKey: action.workerKey };
        if (next.locationId !== null && !locationValid(context, next.locationId, action.workerKey)) return { ...next, locationId: null };
        return settleActive(next, context, "prepare");
      }
      case "location":
        return chooseLocation(draft, context, action.locationId, null);
      case "place":
        return chooseLocation(draft, context, action.locationId, action.workerKey);
      case "sub": {
        const placement = placementContext(context, action.locationId, draft.workerKey);
        if (placement === null || draft.locationId !== action.locationId) return draft;
        return withModel(action.locationId, (sub, id) => withSub(draft, id, sub.reduce(subDraft(draft, id), action.action as never, placement)));
      }
      case "imperialPriority":
        return { ...draft, mode: "imperial_priority", imperialPriority: imperialPriorityDraft.reduce(draft.imperialPriority, action.action, model, engine) };
      case "swap":
        if (!modesOf(model, engine).includes("colour_samples_swap")) return draft;
        return { ...draft, mode: "colour_samples_swap", swap: colourSamplesSwapDraft.reduce(draft.swap, action.action, model, engine) };
      case "sell":
        if (!saleOffered(engine, action.ceramicId)) return draft;
        return { ...draft, mode: "sell_flawed", sell: action.ceramicId };
      case "complete": {
        if (!modesOf(model, engine).includes("complete_order")) return draft;
        const from = draft.mode === "complete_order" ? (draft.completion ?? EMPTY_COMPLETION) : EMPTY_COMPLETION;
        return { ...draft, mode: "complete_order", completion: reduceCompletion(from, action.action, engine, COMPLETABLE) };
      }
    }
  },

  options(draft, model, engine) {
    const step = stepOf(model);
    const context = workContext(model, engine);
    const modes = modesOf(model, engine).map((mode) => ({ mode }));
    if (context === null) {
      const heading: WorkHeading = step === "after_action" ? "after_action" : "place";
      return { step, modes, freeActions: [], freeAction: null, heading, backToPlacing: false, workers: [], locations: [], active: null, imperialPriority: null, swap: null, sale: null, completion: null, workersLeft: 0 };
    }
    const placement = draft.mode === "place" ? placementContext(context, draft.locationId, draft.workerKey) : null;
    const ability =
      step === "before_action" && (draft.mode === "imperial_priority" || draft.mode === "colour_samples_swap" || draft.mode === "sell_flawed" || draft.mode === "complete_order") ? draft.mode : null;
    const heading: WorkHeading = step === "after_action" ? "after_action" : (ability ?? "place");
    // The draft keeps a worker and a location while an ability is open: going back returns to them.
    const backToPlacing = ability !== null;
    const active: ActiveLocation | null =
      placement === null || draft.locationId === null
        ? null
        : withModel(draft.locationId, (sub, id) => ({ locationId: id, draft: subDraft(draft, id), options: sub.options(subDraft(draft, id), placement), context: placement }) as ActiveLocation);
    const usable = imperialUsable(engine);
    const swap = swapUsable(engine);
    return {
      step,
      modes,
      freeActions: freeActionItems(engine),
      freeAction: chosenFreeAction(draft),
      heading,
      backToPlacing,
      workers: step === "before_action" ? workerChoices(context) : [],
      locations: step === "before_action" ? locationChoices(context, draft.workerKey) : [],
      active,
      imperialPriority: usable ? imperialPriorityDraft.options(draft.imperialPriority, model, engine) : null,
      swap: swap ? colourSamplesSwapDraft.options(draft.swap, model, engine) : null,
      sale: saleOptions(engine),
      completion: completableNow(engine).length > 0 ? completionOptions(draft.mode === "complete_order" ? (draft.completion ?? EMPTY_COMPLETION) : EMPTY_COMPLETION, engine, COMPLETABLE) : null,
      workersLeft: context.me.availableWorkerIds.length,
    };
  },

  build(draft, model, engine) {
    const context = workContext(model, engine);
    if (context === null) return null;
    switch (draft.mode) {
      case "place":
        return stepOf(model) === "before_action" ? placementCommand(draft, context) : null;
      case "imperial_priority":
        return imperialPriorityDraft.build(draft.imperialPriority, model, engine);
      case "colour_samples_swap":
        return colourSamplesSwapDraft.build(draft.swap, model, engine);
      case "sell_flawed":
        return saleCommand(engine, draft.sell);
      case "complete_order":
        return buildCompletion("COMPLETE_ORDER", draft.completion ?? EMPTY_COMPLETION, engine, COMPLETABLE);
      case "end_turn":
        return stepOf(model) === "after_action" ? { type: "END_TURN" } : null;
      case null:
        return null;
    }
  },

  fromCommand(command, model, engine) {
    const context = workContext(model, engine);
    if (context === null) return null;
    const blank = blankDraft(model, engine);
    if (command.type === "END_TURN") return stepOf(model) === "after_action" ? { ...blank, mode: "end_turn" } : null;
    if (command.type === "USE_IMPERIAL_PRIORITY") {
      const sub = imperialPriorityDraft.fromCommand(command, model, engine);
      return sub === null ? null : { ...blank, mode: "imperial_priority", imperialPriority: sub };
    }
    if (command.type === "USE_COLOUR_SAMPLES_SWAP") {
      const sub = colourSamplesSwapDraft.fromCommand(command, model, engine);
      return sub === null ? null : { ...blank, mode: "colour_samples_swap", swap: sub };
    }
    const sale = saleOf(command);
    if (sale !== null) return { ...blank, mode: "sell_flawed", sell: sale };
    const completion = completionFromCommand("COMPLETE_ORDER", command);
    if (completion !== null) return { ...blank, mode: "complete_order", completion };
    const locationId = placementLocationOf(command);
    if (locationId === null || stepOf(model) !== "before_action" || !("workerId" in command)) return null;
    const senior = "seniorApprentice" in command && command.seniorApprentice === true;
    const entry = placementOf(context.view, locationId)?.workers.find((worker) => worker.workerId === command.workerId && worker.seniorApprentice === senior && worker.legal);
    if (entry === undefined) return null;
    const workerKey = placementWorkerKey(entry);
    const placement = placementContext(context, locationId, workerKey);
    if (placement === null) return null;
    return withModel(locationId, (sub, id) => {
      const expressed = sub.fromCommand(command as PlacementCommandOf<typeof id>, placement);
      return expressed === null ? null : withSub({ ...blank, mode: "place", workerKey, locationId }, id, expressed);
    });
  },

  summary(draft, model, engine): RichMessage | null {
    const context = workContext(model, engine);
    if (context === null) return null;
    switch (draft.mode) {
      case null:
        // After the worker action: End turn is the only button until a free action is chosen.
        return freeActionItems(engine).length === 0 ? null : msg("orders.turn.pick");
      case "end_turn":
        return msg("work.summary.endTurn");
      case "imperial_priority":
        return imperialPriorityDraft.summary(draft.imperialPriority, model, engine);
      case "colour_samples_swap":
        return colourSamplesSwapDraft.summary(draft.swap, model, engine);
      case "sell_flawed":
        return draft.sell === null ? msg("common.sale.pick") : saleSummary(model, engine, draft.sell);
      case "complete_order":
        return completionSummary(draft.completion ?? EMPTY_COMPLETION, model, engine, COMPLETABLE);
      case "place": {
        if (draft.workerKey === null && draft.locationId === null) return msg("work.summary.incomplete");
        if (draft.workerKey === null) return msg("work.summary.chooseWorker");
        if (draft.locationId === null) return msg("work.summary.chooseLocation");
        const placement = placementContext(context, draft.locationId, draft.workerKey);
        const locationId = draft.locationId;
        const worker = workerWords(draft.workerKey);
        const location = (t: Translator) => locationName(locationId, t.locale);
        if (placement === null) return msg("work.summary.place", { worker, location });
        const detail: MessageParam | null = withModel(locationId, (sub, id) => sub.detail(subDraft(draft, id), placement));
        if (detail === null) return msg("work.summary.place", { worker, location });
        return msg("work.summary.placeDetail", { worker, location, detail });
      }
    }
  },
};

/** The placement context of the draft's active location (table adapters, components). */
export function activePlacement(draft: WorkDraft, model: GameModel, engine: EngineView): PlacementContext | null {
  const context = workContext(model, engine);
  if (context === null || draft.mode !== "place") return null;
  return placementContext(context, draft.locationId, draft.workerKey);
}

/** Sets a whole sub-draft (tests, the gallery). */
export function withLocationDraft<L extends LocationId>(draft: WorkDraft, locationId: L, sub: LocationTypes[L]["draft"]): WorkDraft {
  return withSub(draft, locationId, sub);
}
