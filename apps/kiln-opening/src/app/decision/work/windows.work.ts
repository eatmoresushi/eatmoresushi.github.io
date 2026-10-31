/**
 * B4's slice of the window registry (UI_V1.6.1_ARCHITECTURE §3.4, §3.5). Owner: B4 (work and
 * setup decisions). `decision/windows.ts` merges it with B5's slice and never changes in phase B.
 *
 * Each spec names its component, its draft model, its title (pane heading and phone sheet strip),
 * the ConfirmBar alternative where the window has one (Decline, End turn, Stop reserving), and a
 * table adapter (§3.5) where the table drives the draft:
 * - **work:** Place shortcuts and unavailable reasons on the location cards and the personal
 *   spaces (`placeTargets`, every entry legal or not, CR B2-3; `activePlacement`) — since the owner
 *   review of 2026-10-17 the only place a worker is placed from; the Guild Hall chooser on the
 *   Tech display (`techChooser`: a face-up Tech to buy, or a discipline to inspect); Glaze &
 *   Load destinations on the kiln (`kilnTargets`) with pending chips; the Magistrate's Hall
 *   Shifu's optional Crown Order on the display (`orderTargets` keyed `slot:<i>`, L259,
 *   R21); the held Orders the Colour Samples swap may give up (`orderTargets` keyed by OrderId);
 *   a Sell button on each Flawed ceramic the viewer may sell now (`sellTargets`, a free action);
 *   the held Orders the viewer may complete now (`orderTargets` keyed by OrderId, a free action,
 *   owner revision 5): their Deliver badge opens the completion in the pane; while it is open the
 *   other held Orders show blocked and the chosen group's ceramics are highlighted; Use on the
 *   viewer's Imperial Priority token (`imperialPriority`, D21); the chosen vessels highlighted;
 * - **kiln_selection:** the display's Main Orders (`slot:<i>`), one taken with the Kiln (L130,
 *   R23);
 * - **setters_mark:** the open kiln spaces;
 * - **commission**, **colour_samples** and **colour_samples_swap** (every Select N, v1.6.2 L80,
 *   change 25): the display slots reservable now (`slot:<i>`) and the privately looked-at Orders
 *   (keyed by OrderId), toggled into the reservation (`selectDraft`, one `SELECT_CHOOSE`);
 * - **guild_inspection:** the face-up Techs on the Tech display (`techChooser` in take mode), for
 *   the Shifu's first take and the second (none once both are made); the inspected Techs are
 *   private and only in the pane.
 *
 * The `work` window covers both the before-action step and the after-action window
 * (`window.step`); `WorkTurn` composes `ActionWindow` for the latter.
 *
 * **The pane hides** (owner review, 2026-10-17; `pane`, `state/pane.ts`) during the viewer's
 * before-action step while no placement is chosen: the worker is placed on the table, and the pane
 * appears with the chosen placement. What the viewer can do first (`freeActionItems`, owner UI
 * decision D21) are the hidden pane's "Free actions" chips: each chooses its form, which brings the
 * pane back, and its Confirm hides it again. The heading then follows the pane's content
 * (`workTitle`): the action's own name.
 *
 * **The split Confirm (D21; `decision/endTurn.ts`).** The worker action's last step sends the choice
 * of ending the turn with its command, on the windows' `confirmSplit`:
 * - a placement that finishes the action: Place · end turn / Place, then free actions. The
 *   Magistrate's Hall Shifu's Crown Order is part of the placement command, so with one chosen the
 *   same buttons read Reserve · end turn / Reserve, then free actions;
 * - a placement that opens a step (the Commission Market's Select, the Guild Hall inspection, the
 *   Apprentice's Colour Samples with its Select) has a plain Confirm: the choice sits on the last
 *   step, not earlier (`placementSplit`);
 * - every Select that brings an Order into the hand at the end of the action: Reserve · end turn /
 *   Reserve, then free actions (`selectSplit`). The swap's Select after the worker action is a
 *   free-action Confirm's kin: Reserve · end turn / Reserve. Before the worker action it has a plain
 *   Confirm: the placement is still due, and the selector does not list it. Colour Samples' Select
 *   inside a Guild Hall inspection that goes on has a plain Confirm too: it is not the last step;
 * - the Guild Hall inspection's take and stop (`inspectionSplit`), only when nothing follows: a take
 *   after which the Shifu still decides has a plain Confirm, so "· end turn" is always true;
 * - after the action, each free action: ⟨Action⟩ · end turn / ⟨Action⟩, with End turn the alternative.
 * The secondary button is left out where the after-action step certainly will not open
 * (the engine's `afterActionMayOpen`): the placement or the step says what it brings.
 * Nothing here reads the hand.
 */
import { afterActionMayOpen, commissionOptions, guildDecisionLeftAfterTake, guildDecisionLeftOnResume, guildInspectionOptions, magistratesHallQuote } from "../../../game/index.ts";
import type { ActionBrings, CeramicId, EndTurnCommandType, LocationId, OrderId, PlacementWorkerOption, PlayerView, TechId } from "../../../game/index.ts";
import { andList } from "../../i18n/format.ts";
import { msg } from "../../i18n/translator.ts";
import type { MessageKey } from "../../i18n/translator.ts";
import { PANE_SHOWN, defineWindow } from "../../state/draftStore.ts";
import type { ConfirmSplit, PanePresence, WindowSpecFor, WindowText } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { displaySlotKey, placementWorkerKey, tableSelection } from "../../state/tableSelection.ts";
import type { OrderTarget, OrderTargetReason, TableAction, TableSelectionData } from "../../state/tableSelection.ts";
import { KilnSelection } from "../setup/KilnSelection.tsx";
import { kilnSelectionDraft } from "../setup/KilnSelection.draft.ts";
import type { KilnSelectionAction } from "../setup/KilnSelection.draft.ts";
import { SettersMark } from "../setup/SettersMark.tsx";
import { settersMarkDraft } from "../setup/SettersMark.draft.ts";
import type { SettersMarkAction } from "../setup/SettersMark.draft.ts";
import { acceptsEndTurn, endTurnOf } from "../endTurn.ts";
import { deliverableNow, freeActionItems, freeActionLabel } from "../freeActions.ts";
import { COLOUR_SAMPLES, colourSamplesSwapDraft } from "./ColourSamplesSwap.draft.ts";
import { placements, viewMemo } from "./context.ts";
import { GuildInspection } from "./GuildInspection.tsx";
import { SelectStep } from "./SelectStep.tsx";
import { lookPickKey, selectActionFor, selectDraft } from "./SelectStep.draft.ts";
import type { SelectAction, SelectDraft } from "./SelectStep.draft.ts";
import { guildInspectionDraft, inspectionReturnOnly, inspectionTechChooser } from "./GuildInspection.draft.ts";
import type { GuildInspectionAction, GuildInspectionDraft } from "./GuildInspection.draft.ts";
import { kilnTargetsOf, pendingLoads } from "./locations/GlazeLoad.draft.ts";
import { techChooserOf } from "./locations/GuildHall.draft.ts";
import { crownTargetsOf } from "./locations/MagistratesHall.draft.ts";
import { saleOffered, saleTargets } from "../sale/sellFlawed.ts";
import type { GlazeLoadDraft } from "./locations/GlazeLoad.draft.ts";
import type { PlacementContext } from "./locations/editor.ts";
import { WorkTurn } from "./WorkTurn.tsx";
import { activePlacement, workDraft } from "./workDraft.ts";
import type { WorkAction, WorkDraft, WorkHeading } from "./workDraft.ts";

/** The window kinds this slice covers. */
export type WorkWindowKind = "kiln_selection" | "setters_mark" | "work" | "commission" | "guild_inspection" | "colour_samples" | "colour_samples_swap";

function workStep(model: GameModel): "before_action" | "after_action" {
  return model.window.kind === "work" ? model.window.step : "before_action";
}

/**
 * The work window's heading (and phone sheet strip), after what the pane shows (owner review,
 * 2026-10-17; `workDraft.options().heading`): placing a worker; the action's own name while its form
 * is open before the worker action ("Deliver O22"); after the worker action.
 */
const HEADING_TITLE = {
  place: "work.title.work",
  after_action: "work.title.afterAction",
  imperial_priority: "work.work.mode.imperialPriority",
  colour_samples_swap: "work.work.mode.colourSamplesSwap",
  sell_flawed: "work.work.mode.sellFlawed",
  complete_order: "work.work.mode.completeOrder",
} as const satisfies Readonly<Record<WorkHeading, MessageKey>>;

function workTitle(draft: WorkDraft, model: GameModel, engine: EngineView): WindowText {
  const heading = workDraft.options(draft, model, engine).heading;
  const orderId = draft.completion?.orderId ?? null;
  if (heading === "complete_order" && orderId !== null) return msg("work.work.chip.deliver", { order: orderId });
  return msg(HEADING_TITLE[heading]);
}

/**
 * The work window's pane (owner review, 2026-10-17; owner UI decision D21): hidden during the
 * viewer's before-action step while no placement is chosen, with the bar's cue ("Your turn: place a
 * worker · 3 left", always) and a chip per thing the viewer can do right now ("Free actions: [Deliver
 * O22] [Sell Flawed (+2 Coins)] [Imperial Priority] [Colour Samples swap]"); shown otherwise (a
 * chosen placement, an action's form, the after-action step).
 */
export function workPane(draft: WorkDraft, model: GameModel, engine: EngineView): PanePresence<WorkAction> {
  if (!model.viewerActs || model.window.kind !== "work" || model.window.step !== "before_action") return PANE_SHOWN;
  if (draft.mode !== "place" || activePlacement(draft, model, engine) !== null) return PANE_SHOWN;
  const options = workDraft.options(draft, model, engine);
  const openers = options.freeActions.map((item) => ({ key: item.key, label: freeActionLabel(item), action: { type: "freeAction", key: item.key } as WorkAction }));
  return {
    hidden: true,
    lead: msg("work.work.hidden.place", { n: options.workersLeft }),
    openersLabel: openers.length === 0 ? null : msg("common.freeActions"),
    openers,
  };
}

// ── The split Confirm (D21) ───────────────────────────────────────────────────────────────

/** Each location's placement command, the type `endTurnOptions` lists. */
const PLACEMENT_COMMAND = {
  materials_yard: "PLACE_MATERIALS_YARD",
  form_decorate: "PLACE_FORM_DECORATE",
  glaze_load: "PLACE_GLAZE_LOAD",
  commission_market: "PLACE_COMMISSION_MARKET",
  guild_hall: "PLACE_GUILD_HALL",
  canal_wharf: "PLACE_CANAL_WHARF",
  magistrates_hall: "PLACE_MAGISTRATES_HALL",
} as const satisfies Readonly<Record<LocationId, EndTurnCommandType>>;

/** What this placement brings that the after-action step opens on (R27, `afterActionMayOpen`). */
function placementBrings(draft: WorkDraft, context: PlacementContext): ActionBrings {
  switch (draft.locationId) {
    case "form_decorate":
      return { vessel: true };
    case "materials_yard":
      return { vessel: draft.perLocation.materials_yard.preparedClay !== null };
    case "canal_wharf":
      return { order: context.worker.effect === "shifu" };
    case "guild_hall":
      return { colourSamples: draft.perLocation.guild_hall.techId === (COLOUR_SAMPLES as TechId) };
    case "magistrates_hall":
      return {
        order: draft.perLocation.magistrates_hall.crownSlot !== null,
        recognition: viewMemo(context.view, `magistratesHallQuote:${context.worker.effect}`, () => magistratesHallQuote(context.view, context.worker.effect)).reachable,
      };
    default:
      return {};
  }
}

/** A Select can open now: Colour Samples' when-acquired look has something to reserve (B1). */
function selectWouldOpen(view: PlayerView): boolean {
  const options = viewMemo(view, "commissionOptions:apprentice", () => commissionOptions(view, "apprentice"));
  return options.lookCount > 0 || options.faceUpSlots.length > 0;
}

/** The action goes on after this placement: the choice waits for its last step, not earlier. */
function placementOpensStep(draft: WorkDraft, context: PlacementContext): boolean {
  if (draft.locationId === "commission_market") return true;
  if (draft.locationId !== "guild_hall") return false;
  if (context.worker.effect === "shifu") return true;
  return draft.perLocation.guild_hall.techId === (COLOUR_SAMPLES as TechId) && selectWouldOpen(context.view);
}

function placementSplit(draft: WorkDraft, context: PlacementContext, engine: EngineView): ConfirmSplit | null {
  const locationId = draft.locationId;
  if (locationId === null || placementOpensStep(draft, context) || !acceptsEndTurn(engine, PLACEMENT_COMMAND[locationId])) return null;
  const reserves = locationId === "magistrates_hall" && draft.perLocation.magistrates_hall.crownSlot !== null;
  const stay = afterActionMayOpen(context.view, placementBrings(draft, context));
  if (reserves) return { end: msg("common.confirm.reserveEnd"), stay: stay ? msg("common.confirm.reserveStay") : null };
  return { end: msg("common.confirm.placeEnd"), stay: stay ? msg("common.confirm.placeStay") : null };
}

/** A free action's Confirm after the worker action: ⟨Action⟩ · end turn beside ⟨Action⟩. */
function afterActionSplit(draft: WorkDraft, engine: EngineView): ConfirmSplit | null {
  switch (draft.mode) {
    case "complete_order":
      return acceptsEndTurn(engine, "COMPLETE_ORDER") ? { end: msg("common.confirm.deliverEnd"), stay: msg("common.confirm.deliver") } : null;
    case "sell_flawed":
      return acceptsEndTurn(engine, "SELL_FLAWED") ? { end: msg("common.confirm.sellEnd"), stay: msg("common.confirm.sell") } : null;
    case "imperial_priority":
      return acceptsEndTurn(engine, "USE_IMPERIAL_PRIORITY") ? { end: msg("common.confirm.priorityEnd"), stay: msg("common.confirm.priority") } : null;
    default:
      // The swap's first Confirm only opens its Select (`USE_COLOUR_SAMPLES_SWAP` refuses the field).
      return null;
  }
}

/**
 * Every Select's Reserve buttons. `SELECT_CHOOSE` during the worker action: Reserve · end turn /
 * Reserve, then free actions. Colour Samples' Select inside a Guild Hall inspection that goes on is
 * not the last step, so it has a plain Confirm. The swap's Select: the same, with plain "Reserve",
 * only after the worker action (the selector does not list it before).
 */
function selectSplit(engine: EngineView): ConfirmSplit | null {
  if (!acceptsEndTurn(engine, "SELECT_CHOOSE")) return null;
  if (guildDecisionLeftOnResume(engine.view)) return null;
  const swap = endTurnOf(engine)?.stage === "colour_samples_swap";
  const stay = afterActionMayOpen(engine.view, { order: true });
  return { end: msg("common.confirm.reserveEnd"), stay: !stay ? null : swap ? msg("common.verb.reserve") : msg("common.confirm.reserveStay") };
}

/**
 * The Guild Hall inspection's Confirm, when nothing follows it (D21): stopping, or a take that leaves
 * no decision. A take after which the Shifu still decides (2 inspected Techs to return, or another
 * Tech that might be taken), or one that opens Colour Samples' Select, has a plain Confirm.
 */
function inspectionSplit(draft: GuildInspectionDraft, engine: EngineView): ConfirmSplit | null {
  const choice = draft.choice;
  if (choice === null) return null;
  if (choice.kind === "finish") {
    if (!acceptsEndTurn(engine, "GUILD_FINISH")) return null;
    return { end: msg("common.confirm.finishEnd"), stay: afterActionMayOpen(engine.view) ? msg("common.confirm.finishStay") : null };
  }
  if (!acceptsEndTurn(engine, "GUILD_TAKE")) return null;
  if (guildInspectionOptions(engine.view) === null || guildDecisionLeftAfterTake(engine.view, choice.take)) return null;
  const colourSamples = choice.take.techId === (COLOUR_SAMPLES as TechId);
  if (colourSamples && selectWouldOpen(engine.view)) return null;
  return { end: msg("common.confirm.takeEnd"), stay: afterActionMayOpen(engine.view, { colourSamples }) ? msg("common.confirm.takeStay") : null };
}

// ── The private hint (D21) ────────────────────────────────────────────────────────────────

/**
 * "You can deliver this now": the Order about to be reserved matches the viewer's own Finished
 * ceramics (`deliverableNow`, their own view only). With two Orders chosen it names which.
 */
function deliverHint(orderIds: readonly OrderId[], engine: EngineView): WindowText | null {
  const ready = orderIds.filter((orderId) => deliverableNow(engine, orderId));
  if (ready.length === 0) return null;
  return orderIds.length === 1 ? msg("common.confirm.deliverNow") : msg("common.confirm.deliverNowNamed", { orders: (t) => andList(ready, t.locale) });
}

function selectHint(draft: SelectDraft, model: GameModel, engine: EngineView): WindowText | null {
  const options = selectDraft.options(draft, model, engine);
  const chosen = [...options.slots, ...options.looked].filter((choice) => draft.picks.includes(choice.key)).map((choice) => choice.orderId);
  return deliverHint(chosen, engine);
}

/**
 * A Select's targets (every Select N: the Commission Market, Colour Samples when acquired and its
 * swap, v1.6.2 L80): each display slot (`slot:<i>`) and looked card (OrderId), chosen or not.
 * With the Commission Market Shifu effect's 2 chosen, the others are greyed out with the pane's
 * own reason ("You have chosen 2 already."), so the table never refuses a tap in silence.
 */
/**
 * The open Select's N and reservation limit, from the window (the engine step's public `select`).
 * Each Select window's title is only asked for while that window is open.
 */
function selectOf(model: GameModel): { n: number; maxReservations: number } {
  const window = model.window;
  return "select" in window ? window.select : { n: 0, maxReservations: 1 };
}

function selectTargets(draft: SelectDraft, model: GameModel, engine: EngineView): Map<string, OrderTarget> {
  const options = selectDraft.options(draft, model, engine);
  const targets = new Map<string, OrderTarget>();
  const limit: OrderTargetReason = { kind: "message", message: msg("work.cm.limitReached", { n: options.maxReservations }) };
  const target = (chosen: boolean): OrderTarget => {
    const disabled = !chosen && options.full && options.maxReservations > 1;
    return { state: chosen ? "chosen" : "choosable", disabled, reason: disabled ? limit : null };
  };
  for (const slot of options.slots) targets.set(displaySlotKey(slot.slotIndex ?? 0), target(draft.picks.includes(slot.key)));
  for (const looked of options.looked) targets.set(looked.orderId, target(draft.picks.includes(looked.key)));
  return targets;
}

/** The table adapter of every Select window: the display's and the look row's Choose toggles. */
const SELECT_CONFIRM = {
  confirmSplit: (_draft: SelectDraft, _model: GameModel, engine: EngineView) => selectSplit(engine),
  confirmHint: selectHint,
};

const SELECT_TABLE = {
  select: (draft: SelectDraft, model: GameModel, engine: EngineView) => tableSelection({ orderTargets: selectTargets(draft, model, engine) }),
  act(draft: SelectDraft, action: TableAction, model: GameModel, engine: EngineView): SelectAction | null {
    if (action.type !== "order") return null;
    const options = selectDraft.options(draft, model, engine);
    const choice = action.key.startsWith("slot:")
      ? options.slots.find((slot) => slot.slotIndex !== null && displaySlotKey(slot.slotIndex) === action.key)
      : options.looked.find((looked) => looked.key === lookPickKey(action.key as OrderId));
    return choice === undefined ? null : selectActionFor(draft, options, choice.key);
  },
};

export const WORK_WINDOWS: { readonly [K in WorkWindowKind]: WindowSpecFor<K> } = {
  kiln_selection: defineWindow({
    kind: "kiln_selection",
    Component: KilnSelection,
    draft: kilnSelectionDraft,
    title: () => msg("work.title.kilnSelection"),
    // The Main Order taken with the Kiln (L130, R23): the display's Choose toggles.
    table: {
      select: (draft, model, engine) =>
        tableSelection({
          orderTargets: new Map(
            kilnSelectionDraft
              .options(draft, model, engine)
              .orders.map((order): [string, OrderTarget] => [displaySlotKey(order.slotIndex), { state: draft.slotIndex === order.slotIndex ? "chosen" : "choosable", disabled: false }]),
          ),
        }),
      act(draft, action, model, engine): KilnSelectionAction | null {
        if (action.type !== "order") return null;
        const order = kilnSelectionDraft.options(draft, model, engine).orders.find((candidate) => displaySlotKey(candidate.slotIndex) === action.key);
        return order === undefined ? null : { type: "order", slotIndex: order.slotIndex };
      },
    },
  }),

  setters_mark: defineWindow({
    kind: "setters_mark",
    Component: SettersMark,
    draft: settersMarkDraft,
    title: () => msg("work.title.settersMark"),
    alternative: () => ({ label: msg("common.verb.decline"), command: { type: "PLACE_SETTERS_MARK", spaceId: null } }),
    table: {
      select: (draft, model, engine) =>
        tableSelection({
          kilnTargets: new Map(settersMarkDraft.options(draft, model, engine).spaces.map((space) => [space.spaceId, { pressed: draft.choice === space.spaceId }])),
        }),
      act: (_draft, action): SettersMarkAction | null => (action.type === "kilnSpace" ? { type: "choose", choice: action.spaceId } : null),
    },
  }),

  work: defineWindow({
    kind: "work",
    Component: WorkTurn,
    draft: workDraft,
    title: (model, engine, draft) => workTitle(draft, model, engine),
    alternative: (_draft, model) => (workStep(model) === "after_action" ? { label: msg("common.verb.endTurn"), command: { type: "END_TURN" } } : null),
    // After the worker action, with nothing chosen, End turn is the only button (D21).
    alternativeOnly: (draft, model) => workStep(model) === "after_action" && (draft.mode === null || draft.mode === "end_turn"),
    alternativeTakesEnter: (_draft, _model, engine) => freeActionItems(engine).length === 0,
    confirmSplit(draft, model, engine) {
      if (!model.viewerActs) return null;
      if (workStep(model) === "after_action") return afterActionSplit(draft, engine);
      const context = draft.mode === "place" ? activePlacement(draft, model, engine) : null;
      return context === null ? null : placementSplit(draft, context, engine);
    },
    // The Magistrate's Hall Shifu's Crown Order about to be reserved.
    confirmHint(draft, model, engine) {
      const slot = draft.mode === "place" && draft.locationId === "magistrates_hall" ? draft.perLocation.magistrates_hall.crownSlot : null;
      const orderId = slot === null ? null : (engine.view.game.market.display[slot] ?? null);
      return orderId === null ? null : deliverHint([orderId], engine);
    },
    pane: workPane,
    table: {
      select(draft, model, engine): TableSelectionData {
        if (!model.viewerActs) return tableSelection({});
        const placeTargets = new Map<LocationId, readonly PlacementWorkerOption[]>();
        if (workStep(model) === "before_action") {
          // Every entry, legal or not (CR B2-3): the table offers Place only for legal ones
          // and shows the engine's reason where none is legal.
          for (const placement of placements(engine.view)) placeTargets.set(placement.locationId, placement.workers);
        }
        const activeLocation = draft.mode === "place" && draft.locationId !== null && draft.workerKey !== null ? { locationId: draft.locationId, workerKey: draft.workerKey } : null;
        const highlighted = new Set<CeramicId>();
        let selection: Partial<TableSelectionData> = { placeTargets, activePlacement: activeLocation };
        const context = activePlacement(draft, model, engine);
        if (context !== null && draft.locationId === "glaze_load") {
          const sub: GlazeLoadDraft = draft.perLocation.glaze_load;
          for (const load of sub.loads) if (load.ceramicId !== null) highlighted.add(load.ceramicId);
          selection = { ...selection, kilnTargets: kilnTargetsOf(sub, context), pendingCeramics: pendingLoads(sub) };
        }
        if (context !== null && draft.locationId === "guild_hall") {
          selection = { ...selection, techChooser: techChooserOf(draft.perLocation.guild_hall, context) };
        }
        if (draft.mode === "colour_samples_swap") {
          // The held Orders the swap may give up, on the table's hand row (marked for discard once chosen).
          const swap = colourSamplesSwapDraft.options(draft.swap, model, engine);
          selection = {
            ...selection,
            orderTargets: new Map(
              swap.discards.map((discard): [string, OrderTarget] => [
                discard.orderId,
                {
                  state: draft.swap.discardOrderId === discard.orderId ? "discard" : "choosable",
                  disabled: !discard.legal,
                  // The engine's reason, as the pane's option says it (never a silent grey toggle).
                  reason: discard.reason === null ? null : { kind: "rule", error: discard.reason },
                },
              ]),
            ),
          };
        }
        if (context !== null && draft.locationId === "magistrates_hall") {
          // The Magistrate's Hall Shifu's optional Crown Order (L259, R21): the display's
          // Crown Orders get a Choose toggle (none for the Apprentice, or with none showing).
          selection = { ...selection, orderTargets: crownTargetsOf(draft.perLocation.magistrates_hall, context) };
        }
        if (draft.mode !== "colour_samples_swap") {
          // The held Orders the viewer may complete now (a free action): a choice on the hand row
          // that opens the completion; while it is open, the rest show blocked and the chosen
          // group's ceramics are highlighted. Display slots (`slot:<i>`) never collide with them.
          const completion = workDraft.options(draft, model, engine).completion;
          if (completion !== null) {
            const open = draft.mode === "complete_order";
            const targets = new Map<string, OrderTarget>(selection.orderTargets ?? []);
            for (const order of completion.orders) {
              if (!order.completable && !open) continue;
              const state: OrderTarget["state"] = open && draft.completion.orderId === order.orderId ? "chosen" : order.completable ? "completable" : "blocked";
              targets.set(order.orderId, { state, disabled: !order.completable });
            }
            selection = { ...selection, orderTargets: targets };
            if (open) for (const ceramicId of draft.completion.ceramicIds ?? []) highlighted.add(ceramicId);
          }
        }
        if (draft.mode === "imperial_priority") {
          const ip = draft.imperialPriority;
          if (ip.ceramicId !== null) highlighted.add(ip.ceramicId);
          if (ip.ceramicId !== null && ip.glaze !== null) selection = { ...selection, pendingCeramics: [{ ceramicId: ip.ceramicId, glaze: ip.glaze, at: "imperial" }] };
        }
        // A Sell button on each Flawed ceramic the viewer may sell now (a free action, change 36).
        const selling = draft.mode === "sell_flawed" ? draft.sell : null;
        if (selling !== null) highlighted.add(selling);
        selection = { ...selection, sellTargets: saleTargets(engine, selling) };
        // Use on the viewer's Imperial Priority token (a free action, D21).
        if (freeActionItems(engine).some((item) => item.kind === "imperial_priority")) selection = { ...selection, imperialPriority: { pressed: draft.mode === "imperial_priority" } };
        return tableSelection({ ...selection, highlightedCeramicIds: highlighted });
      },
      act(draft, action, model, engine): WorkAction | null {
        switch (action.type) {
          case "place":
            return workStep(model) === "before_action" ? { type: "place", locationId: action.locationId, workerKey: action.workerKey } : null;
          case "kilnSpace":
            return draft.mode === "place" && draft.locationId === "glaze_load" ? { type: "sub", locationId: "glaze_load", action: { type: "kilnSpace", spaceId: action.spaceId } } : null;
          case "order": {
            if (draft.mode === "place" && draft.locationId === "magistrates_hall" && action.key.startsWith("slot:")) {
              const context = activePlacement(draft, model, engine);
              const target = context === null ? undefined : crownTargetsOf(draft.perLocation.magistrates_hall, context).get(action.key);
              if (target === undefined || context === null) return null;
              const slotIndex = Number(action.key.slice("slot:".length));
              return { type: "sub", locationId: "magistrates_hall", action: { type: "crown", slotIndex: target.state === "chosen" ? null : slotIndex } };
            }
            if (draft.mode !== "colour_samples_swap") {
              const completion = workDraft.options(draft, model, engine).completion;
              const order = completion?.orders.find((candidate) => candidate.orderId === action.key && candidate.completable);
              return order === undefined ? null : { type: "complete", action: { type: "order", orderId: order.orderId } };
            }
            const discard = colourSamplesSwapDraft.options(draft.swap, model, engine).discards.find((candidate) => candidate.orderId === action.key && candidate.legal);
            return discard === undefined ? null : { type: "swap", action: { type: "discard", orderId: discard.orderId } };
          }
          case "sell":
            return saleOffered(engine, action.ceramicId) ? { type: "sell", ceramicId: action.ceramicId } : null;
          case "imperial_priority":
            return freeActionItems(engine).some((item) => item.kind === "imperial_priority") ? { type: "freeAction", key: "imperial_priority" } : null;
          case "tech":
            return draft.mode === "place" && draft.locationId === "guild_hall" ? { type: "sub", locationId: "guild_hall", action: { type: "tech", techId: action.techId } } : null;
          case "inspect":
            return draft.mode === "place" && draft.locationId === "guild_hall"
              ? { type: "sub", locationId: "guild_hall", action: { type: "discipline", discipline: action.discipline } }
              : null;
        }
      },
    },
  }),

  commission: defineWindow({
    kind: "commission",
    Component: SelectStep,
    draft: selectDraft,
    // The keyword names the window (Select 2 / Select 3, change 25), with its limit when it is 2.
    title(model) {
      const { n, maxReservations } = selectOf(model);
      return maxReservations > 1 ? msg("work.title.commission.two", { n, max: maxReservations }) : msg("work.title.commission.one", { n });
    },
    ...SELECT_CONFIRM,
    table: SELECT_TABLE,
  }),

  guild_inspection: defineWindow({
    kind: "guild_inspection",
    Component: GuildInspection,
    draft: guildInspectionDraft,
    // After the second take only the bottom order is left (`inspectionReturnOnly`).
    title(model, engine, draft) {
      const options = guildInspectionDraft.options(draft, model, engine);
      if (options !== null && inspectionReturnOnly(options)) return msg("work.title.guildReturn");
      return model.window.kind === "guild_inspection" && model.window.takes > 0 ? msg("work.title.guildSecond") : msg("work.title.guild");
    },
    confirmSplit: (draft, _model, engine) => inspectionSplit(draft, engine),
    table: {
      // The face-up Techs on the Tech display, for the first take and the second (D14).
      select: (draft, model, engine) => tableSelection({ techChooser: inspectionTechChooser(draft, model, engine) }),
      act(_draft, action, model, engine): GuildInspectionAction | null {
        if (action.type !== "tech") return null;
        const target = inspectionTechChooser({ choice: null, bottomOrder: [] }, model, engine)?.techs.get(action.techId);
        return target?.legal === true ? { type: "take", take: { kind: "face_up", techId: action.techId } } : null;
      },
    },
  }),

  colour_samples: defineWindow({
    kind: "colour_samples",
    Component: SelectStep,
    draft: selectDraft,
    title: (model) => msg("work.title.colourSamples", { n: selectOf(model).n }),
    ...SELECT_CONFIRM,
    table: SELECT_TABLE,
  }),

  colour_samples_swap: defineWindow({
    kind: "colour_samples_swap",
    Component: SelectStep,
    draft: selectDraft,
    title: (model) => msg("work.title.colourSamplesSwap", { n: selectOf(model).n }),
    ...SELECT_CONFIRM,
    table: SELECT_TABLE,
  }),
};

/** Re-exported for tests: the Place shortcut key of a worker entry. */
export { placementWorkerKey };
