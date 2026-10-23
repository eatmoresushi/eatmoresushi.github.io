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
 *   Shifu's optional Crown Order on the display (`orderTargets` keyed `slot:<i>`, rev. 4 L241,
 *   R21); the held Orders the Colour Samples swap may give up (`orderTargets` keyed by OrderId);
 *   a Sell button on each Flawed ceramic the viewer may sell now (`sellTargets`, change 30, R20);
 *   the chosen vessels highlighted;
 * - **kiln_selection:** the display's Main Orders (`slot:<i>`), one taken with the Kiln (rev. 4
 *   L122, R23);
 * - **setters_mark:** the open kiln spaces;
 * - **commission**, **colour_samples** and **colour_samples_swap** (every Select N, v1.6.2 L64,
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
 * appears with the chosen placement. The abilities that may come before the worker action
 * (`workDraft.options().modes` other than `place`) are the hidden pane's openers: each chooses its
 * mode, which brings the pane back with that ability's form. The heading then follows the pane's
 * content (`HEADING_TITLE`): "Before your worker action" while the step's choice names the
 * ability, the ability's own name when it is open alone.
 */
import type { CeramicId, LocationId, PlacementWorkerOption } from "../../../game/index.ts";
import { msg } from "../../i18n/translator.ts";
import type { MessageKey } from "../../i18n/translator.ts";
import { PANE_SHOWN, defineWindow } from "../../state/draftStore.ts";
import type { PaneOpener, PanePresence, WindowSpecFor } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { displaySlotKey, placementWorkerKey, tableSelection } from "../../state/tableSelection.ts";
import type { OrderTarget, OrderTargetReason, TableAction, TableSelectionData } from "../../state/tableSelection.ts";
import type { OrderId } from "../../../game/index.ts";
import { KilnSelection } from "../setup/KilnSelection.tsx";
import { kilnSelectionDraft } from "../setup/KilnSelection.draft.ts";
import type { KilnSelectionAction } from "../setup/KilnSelection.draft.ts";
import { SettersMark } from "../setup/SettersMark.tsx";
import { settersMarkDraft } from "../setup/SettersMark.draft.ts";
import type { SettersMarkAction } from "../setup/SettersMark.draft.ts";
import { colourSamplesSwapDraft } from "./ColourSamplesSwap.draft.ts";
import { placements } from "./context.ts";
import { GuildInspection } from "./GuildInspection.tsx";
import { SelectStep } from "./SelectStep.tsx";
import { lookPickKey, selectActionFor, selectDraft } from "./SelectStep.draft.ts";
import type { SelectAction, SelectDraft } from "./SelectStep.draft.ts";
import { guildInspectionDraft, inspectionReturnOnly, inspectionTechChooser } from "./GuildInspection.draft.ts";
import type { GuildInspectionAction } from "./GuildInspection.draft.ts";
import { kilnTargetsOf, pendingLoads } from "./locations/GlazeLoad.draft.ts";
import { techChooserOf } from "./locations/GuildHall.draft.ts";
import { crownTargetsOf } from "./locations/MagistratesHall.draft.ts";
import { saleOffered, saleTargets } from "../sale/sellFlawed.ts";
import type { GlazeLoadDraft } from "./locations/GlazeLoad.draft.ts";
import { WorkTurn } from "./WorkTurn.tsx";
import { activePlacement, workDraft } from "./workDraft.ts";
import type { WorkAction, WorkDraft, WorkHeading, WorkMode } from "./workDraft.ts";

/** The window kinds this slice covers. */
export type WorkWindowKind = "kiln_selection" | "setters_mark" | "work" | "commission" | "guild_inspection" | "colour_samples" | "colour_samples_swap";

function workStep(model: GameModel): "before_action" | "after_action" {
  return model.window.kind === "work" ? model.window.step : "before_action";
}

/**
 * The work window's heading (and phone sheet strip), after what the pane shows (owner review,
 * 2026-10-17; `workDraft.options().heading`): placing a worker; before the worker action, while an
 * ability's form is open (the step's choice names the ability), or the ability itself when it is
 * open alone (nothing placed, no other ability: no step choice); after the worker action.
 */
const HEADING_TITLE = {
  place: "work.title.work",
  before_action: "work.title.beforeAction",
  after_action: "work.title.afterAction",
  imperial_priority: "work.work.mode.imperialPriority",
  colour_samples_swap: "work.work.mode.colourSamplesSwap",
  sell_flawed: "work.work.mode.sellFlawed",
} as const satisfies Readonly<Record<WorkHeading, MessageKey>>;

/** Each ability that may come before the worker action, as the hidden pane's opener names it. */
const OPENER_TITLE = {
  imperial_priority: "work.work.mode.imperialPriority",
  colour_samples_swap: "work.work.mode.colourSamplesSwap",
  sell_flawed: "work.work.mode.sellFlawed",
} as const satisfies Readonly<Record<Exclude<WorkMode, "place" | "end_turn">, MessageKey>>;

/**
 * The work window's pane (owner review, 2026-10-17): hidden during the viewer's before-action step
 * while no placement is chosen, with the bar's cue ("Your turn: place a worker · 3 left", always)
 * and an opener per ability that may come first ("Or first: [Imperial Priority]"); shown
 * otherwise (a chosen placement, an ability's form, the after-action window).
 */
export function workPane(draft: WorkDraft, model: GameModel, engine: EngineView): PanePresence<WorkAction> {
  if (!model.viewerActs || model.window.kind !== "work" || model.window.step !== "before_action") return PANE_SHOWN;
  if (draft.mode !== "place" || activePlacement(draft, model, engine) !== null) return PANE_SHOWN;
  const options = workDraft.options(draft, model, engine);
  const openers = options.modes.flatMap(({ mode }): PaneOpener<WorkAction>[] =>
    mode === "place" || mode === "end_turn" ? [] : [{ key: mode, label: msg(OPENER_TITLE[mode]), action: { type: "mode", mode } }],
  );
  return {
    hidden: true,
    lead: msg("work.work.hidden.place", { n: options.workersLeft }),
    openersLabel: openers.length === 0 ? null : msg("work.work.hidden.orFirst"),
    openers,
  };
}

/**
 * A Select's targets (every Select N: the Commission Market, Colour Samples when acquired and its
 * swap, v1.6.2 L64): each display slot (`slot:<i>`) and looked card (OrderId), chosen or not.
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
    // The Main Order taken with the Kiln (rev. 4 L122, R23): the display's Choose toggles.
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
    title: (model, engine, draft) => msg(HEADING_TITLE[workDraft.options(draft, model, engine).heading]),
    alternative: (_draft, model) => (workStep(model) === "after_action" ? { label: msg("common.verb.endTurn"), command: { type: "END_TURN" } } : null),
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
          // The Magistrate's Hall Shifu's optional Crown Order (rev. 4 L241, R21): the display's
          // Crown Orders get a Choose toggle (none for the Apprentice, or with none showing).
          selection = { ...selection, orderTargets: crownTargetsOf(draft.perLocation.magistrates_hall, context) };
        }
        if (draft.mode === "imperial_priority") {
          const ip = draft.imperialPriority;
          if (ip.ceramicId !== null) highlighted.add(ip.ceramicId);
          if (ip.ceramicId !== null && ip.glaze !== null) selection = { ...selection, pendingCeramics: [{ ceramicId: ip.ceramicId, glaze: ip.glaze, at: "imperial" }] };
        }
        // A Sell button on each Flawed ceramic the viewer may sell now (change 30, R20).
        const selling = draft.mode === "sell_flawed" ? draft.sell : null;
        if (selling !== null) highlighted.add(selling);
        selection = { ...selection, sellTargets: saleTargets(engine, selling) };
        return tableSelection({ ...selection, highlightedCeramicIds: highlighted });
      },
      act(draft, action, model, engine): WorkAction | null {
        switch (action.type) {
          case "place":
            return workStep(model) === "before_action" ? { type: "place", locationId: action.locationId, workerKey: action.workerKey } : null;
          case "kilnSpace":
            return draft.mode === "place" && draft.locationId === "glaze_load" ? { type: "sub", locationId: "glaze_load", action: { type: "kilnSpace", spaceId: action.spaceId } } : null;
          case "order": {
            if (draft.mode === "place" && draft.locationId === "magistrates_hall") {
              const context = activePlacement(draft, model, engine);
              const target = context === null ? undefined : crownTargetsOf(draft.perLocation.magistrates_hall, context).get(action.key);
              if (target === undefined || context === null) return null;
              const slotIndex = Number(action.key.slice("slot:".length));
              return { type: "sub", locationId: "magistrates_hall", action: { type: "crown", slotIndex: target.state === "chosen" ? null : slotIndex } };
            }
            if (draft.mode !== "colour_samples_swap") return null;
            const discard = colourSamplesSwapDraft.options(draft.swap, model, engine).discards.find((candidate) => candidate.orderId === action.key && candidate.legal);
            return discard === undefined ? null : { type: "swap", action: { type: "discard", orderId: discard.orderId } };
          }
          case "sell":
            return saleOffered(engine, action.ceramicId) ? { type: "sell", ceramicId: action.ceramicId } : null;
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
    table: SELECT_TABLE,
  }),

  colour_samples_swap: defineWindow({
    kind: "colour_samples_swap",
    Component: SelectStep,
    draft: selectDraft,
    title: (model) => msg("work.title.colourSamplesSwap", { n: selectOf(model).n }),
    table: SELECT_TABLE,
  }),
};

/** Re-exported for tests: the Place shortcut key of a worker entry. */
export { placementWorkerKey };
