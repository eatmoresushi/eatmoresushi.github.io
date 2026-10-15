/**
 * B4's slice of the window registry (UI_V1.6.1_ARCHITECTURE §3.4, §3.5). Owner: B4 (work and
 * setup decisions). `decision/windows.ts` merges it with B5's slice and never changes in phase B.
 *
 * Phase A stubs created by A2: every spec names its final component and draft model; the titles
 * are the engine phase names until B4 adds its `work` catalogue keys, and no spec has a table
 * adapter yet (B4 adds Place shortcuts, kiln targets and display-slot targets).
 *
 * The `work` window covers both the before-action step and the after-action window
 * (`window.step`); `WorkTurn` composes `ActionWindow` for the latter.
 */
import { phaseName } from "../../i18n/content.ts";
import { defineWindow } from "../../state/draftStore.ts";
import type { WindowSpecFor, WindowText } from "../../state/draftStore.ts";
import type { GameModel } from "../../state/model.ts";
import { KilnSelection } from "../setup/KilnSelection.tsx";
import { kilnSelectionDraft } from "../setup/KilnSelection.draft.ts";
import { SettersMark } from "../setup/SettersMark.tsx";
import { settersMarkDraft } from "../setup/SettersMark.draft.ts";
import { ColourSamples } from "./ColourSamples.tsx";
import { colourSamplesDraft } from "./ColourSamples.draft.ts";
import { CommissionStep } from "./CommissionStep.tsx";
import { commissionDraft } from "./CommissionStep.draft.ts";
import { GuildInspection } from "./GuildInspection.tsx";
import { guildInspectionDraft } from "./GuildInspection.draft.ts";
import { WorkTurn } from "./WorkTurn.tsx";
import { workDraft } from "./workDraft.ts";

/** The window kinds this slice covers. */
export type WorkWindowKind = "kiln_selection" | "setters_mark" | "work" | "commission" | "guild_inspection" | "colour_samples";

/** The engine phase's name as a heading ("the Work Phase" → "Work Phase"): the stub title until B4 lands its own. */
const phaseTitle = (model: GameModel): WindowText => (t) => {
  const name = phaseName(model.phaseType, t.locale);
  if (t.locale !== "en") return name;
  const bare = name.replace(/^the /, "");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
};

export const WORK_WINDOWS: { readonly [K in WorkWindowKind]: WindowSpecFor<K> } = {
  kiln_selection: defineWindow({ kind: "kiln_selection", Component: KilnSelection, draft: kilnSelectionDraft, title: phaseTitle }),
  setters_mark: defineWindow({ kind: "setters_mark", Component: SettersMark, draft: settersMarkDraft, title: phaseTitle }),
  work: defineWindow({ kind: "work", Component: WorkTurn, draft: workDraft, title: phaseTitle }),
  commission: defineWindow({ kind: "commission", Component: CommissionStep, draft: commissionDraft, title: phaseTitle }),
  guild_inspection: defineWindow({ kind: "guild_inspection", Component: GuildInspection, draft: guildInspectionDraft, title: phaseTitle }),
  colour_samples: defineWindow({ kind: "colour_samples", Component: ColourSamples, draft: colourSamplesDraft, title: phaseTitle }),
};
