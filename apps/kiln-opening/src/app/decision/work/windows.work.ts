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
 *   Load destinations on the kiln (`kilnTargets`) with pending chips; display slots for the
 *   Commission Market's first reservation (`orderTargets`, `slot:<i>`); the chosen vessels
 *   highlighted;
 * - **setters_mark:** the open kiln spaces;
 * - **commission:** display slots (reservation) or the privately looked-at Orders (look);
 * - **colour_samples:** the privately looked-at Orders.
 *
 * The `work` window covers both the before-action step and the after-action window
 * (`window.step`); `WorkTurn` composes `ActionWindow` for the latter.
 */
import type { CeramicId, LocationId, PlacementWorkerOption } from "../../../game/index.ts";
import { msg } from "../../i18n/translator.ts";
import { defineWindow } from "../../state/draftStore.ts";
import type { WindowSpecFor } from "../../state/draftStore.ts";
import type { GameModel } from "../../state/model.ts";
import { displaySlotKey, placementWorkerKey, tableSelection } from "../../state/tableSelection.ts";
import type { OrderTargetState, TableSelectionData } from "../../state/tableSelection.ts";
import { KilnSelection } from "../setup/KilnSelection.tsx";
import { kilnSelectionDraft } from "../setup/KilnSelection.draft.ts";
import { SettersMark } from "../setup/SettersMark.tsx";
import { settersMarkDraft } from "../setup/SettersMark.draft.ts";
import type { SettersMarkAction } from "../setup/SettersMark.draft.ts";
import { ColourSamples } from "./ColourSamples.tsx";
import { colourSamplesDraft } from "./ColourSamples.draft.ts";
import type { ColourSamplesAction } from "./ColourSamples.draft.ts";
import { CommissionStep } from "./CommissionStep.tsx";
import { commissionDraft } from "./CommissionStep.draft.ts";
import type { CommissionAction } from "./CommissionStep.draft.ts";
import { placements } from "./context.ts";
import { GuildInspection } from "./GuildInspection.tsx";
import { guildInspectionDraft } from "./GuildInspection.draft.ts";
import { kilnTargetsOf, pendingLoads } from "./locations/GlazeLoad.draft.ts";
import { techChooserOf } from "./locations/GuildHall.draft.ts";
import type { GlazeLoadDraft } from "./locations/GlazeLoad.draft.ts";
import type { CommissionMarketDraft } from "./locations/CommissionMarket.draft.ts";
import { commissionMarketDraft } from "./locations/CommissionMarket.draft.ts";
import { WorkTurn } from "./WorkTurn.tsx";
import { activePlacement, workDraft } from "./workDraft.ts";
import type { WorkAction } from "./workDraft.ts";

/** The window kinds this slice covers. */
export type WorkWindowKind = "kiln_selection" | "setters_mark" | "work" | "commission" | "guild_inspection" | "colour_samples";

function workStep(model: GameModel): "before_action" | "after_action" {
  return model.window.kind === "work" ? model.window.step : "before_action";
}

function slotTargets(slots: ReadonlyArray<{ slotIndex: number }>, chosen: string | null): Map<string, { state: OrderTargetState; disabled: boolean }> {
  return new Map(slots.map((slot) => [displaySlotKey(slot.slotIndex), { state: displaySlotKey(slot.slotIndex) === chosen ? "chosen" : "choosable", disabled: false }]));
}

export const WORK_WINDOWS: { readonly [K in WorkWindowKind]: WindowSpecFor<K> } = {
  kiln_selection: defineWindow({
    kind: "kiln_selection",
    Component: KilnSelection,
    draft: kilnSelectionDraft,
    title: () => msg("work.title.kilnSelection"),
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
    title(model) {
      if (workStep(model) === "after_action") return msg("work.title.afterAction");
      return msg("work.title.work");
    },
    alternative: (_draft, model) => (workStep(model) === "after_action" ? { label: msg("common.verb.endTurn"), command: { type: "END_TURN" } } : null),
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
        if (context !== null && draft.locationId === "commission_market") {
          const sub: CommissionMarketDraft = draft.perLocation.commission_market;
          selection = { ...selection, orderTargets: slotTargets(commissionMarketDraft.options(sub, context).slots, sub.first) };
        }
        if (draft.mode === "imperial_priority") {
          const ip = draft.imperialPriority;
          if (ip.ceramicId !== null) highlighted.add(ip.ceramicId);
          if (ip.ceramicId !== null && ip.glaze !== null) selection = { ...selection, pendingCeramics: [{ ceramicId: ip.ceramicId, glaze: ip.glaze, at: "imperial" }] };
        }
        return tableSelection({ ...selection, highlightedCeramicIds: highlighted });
      },
      act(draft, action, model): WorkAction | null {
        switch (action.type) {
          case "place":
            return workStep(model) === "before_action" ? { type: "place", locationId: action.locationId, workerKey: action.workerKey } : null;
          case "kilnSpace":
            return draft.mode === "place" && draft.locationId === "glaze_load" ? { type: "sub", locationId: "glaze_load", action: { type: "kilnSpace", spaceId: action.spaceId } } : null;
          case "order":
            return draft.mode === "place" && draft.locationId === "commission_market" && action.key.startsWith("slot:")
              ? { type: "sub", locationId: "commission_market", action: { type: "first", first: action.key as `slot:${number}` } }
              : null;
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
    Component: CommissionStep,
    draft: commissionDraft,
    title: (model) => {
      const window = model.window;
      const awaiting = window.kind === "commission" ? window.awaiting : "reservation";
      if (awaiting === "look_choice") return msg("work.title.commission.look");
      if (awaiting === "resource") return msg("work.title.commission.resource");
      return msg("work.title.commission.reservation");
    },
    alternative: (draft, model, engine) =>
      commissionDraft.options(draft, model, engine).canStop ? { label: msg("work.cm.stop"), command: { type: "COMMISSION_STOP" } } : null,
    table: {
      select(draft, model, engine) {
        const options = commissionDraft.options(draft, model, engine);
        if (options.awaiting === "look_choice") {
          return tableSelection({ orderTargets: new Map(options.looked.map((orderId) => [orderId, { state: orderId === draft.looked ? "chosen" : "choosable", disabled: false }])) });
        }
        if (options.awaiting === "reservation") return tableSelection({ orderTargets: slotTargets(options.slots, draft.reserve) });
        return tableSelection({});
      },
      act(draft, action, model, engine): CommissionAction | null {
        if (action.type !== "order") return null;
        const options = commissionDraft.options(draft, model, engine);
        if (options.awaiting === "look_choice") {
          const orderId = options.looked.find((candidate) => candidate === action.key);
          return orderId === undefined ? null : { type: "looked", orderId };
        }
        if (options.awaiting === "reservation" && action.key.startsWith("slot:")) return { type: "reserve", reserve: action.key as `slot:${number}` };
        return null;
      },
    },
  }),

  guild_inspection: defineWindow({
    kind: "guild_inspection",
    Component: GuildInspection,
    draft: guildInspectionDraft,
    title: () => msg("work.title.guild"),
  }),

  colour_samples: defineWindow({
    kind: "colour_samples",
    Component: ColourSamples,
    draft: colourSamplesDraft,
    title: () => msg("work.title.colourSamples"),
    table: {
      select: (draft, model, engine) =>
        tableSelection({
          orderTargets: new Map(colourSamplesDraft.options(draft, model, engine).orderIds.map((orderId) => [orderId, { state: orderId === draft.orderId ? "chosen" : "choosable", disabled: false }])),
        }),
      act(_draft, action, model, engine): ColourSamplesAction | null {
        if (action.type !== "order") return null;
        const orderId = colourSamplesDraft.options({ orderId: null }, model, engine).orderIds.find((candidate) => candidate === action.key);
        return orderId === undefined ? null : { type: "order", orderId };
      },
    },
  }),
};

/** Re-exported for tests: the Place shortcut key of a worker entry. */
export { placementWorkerKey };
