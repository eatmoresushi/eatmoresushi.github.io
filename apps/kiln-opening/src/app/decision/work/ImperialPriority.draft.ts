/**
 * The draft model of Imperial Priority (UI_V1.6.1_ARCHITECTURE §3.4, §5 gap 16). Owner: B4.
 *
 * Before or after the worker action (L293, R10): spend the token to give one Shaped vessel a
 * Glaze and load it into your empty Imperial Kiln with a public −1/0/+1 Imperial modifier, free (no
 * Wood, rev. 4 L291); Reworking Table may change its Shape first (P1), and Kiln Master's +1/−1
 * marker may go on it, face up (T24, rev. 4 L628, R22: any loading). Every list comes from
 * `imperialPriorityOptions(view).ceramics` (per vessel: Glazes, Imperial modifiers, rework
 * Shapes); the combination is checked by `validateAction` in ConfirmBar.
 *
 * Composed by the work draft (`workDraft.ts`) as its `imperialPriority` sub-draft; it is a full
 * `DraftModel`, so it can be tested on its own.
 */
import { imperialPriorityOptions, kilnMasterOption } from "../../../game/index.ts";
import type { CeramicId, CeramicState, Glaze, HeatDelta, ImperialModifier, ImperialPriorityOptions as SelectorOptions, Shape } from "../../../game/index.ts";
import { glazeName, shapeName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView } from "../../state/model.ts";
import { keepIfSame, viewMemo } from "./context.ts";
import { signedModifier, vesselParam } from "./locations/shared.ts";

export interface ImperialPriorityDraft {
  readonly ceramicId: CeramicId | null;
  readonly glaze: Glaze | null;
  readonly modifier: ImperialModifier | null;
  /** Reworking Table's new Shape, or null to keep the vessel's. */
  readonly rework: Shape | null;
  /** Kiln Master's marker on this load (T24, R22), or null for none. */
  readonly kilnMaster: HeatDelta | null;
}

export type ImperialPriorityAction =
  | { readonly type: "vessel"; readonly ceramicId: CeramicId }
  | { readonly type: "glaze"; readonly glaze: Glaze }
  | { readonly type: "modifier"; readonly modifier: ImperialModifier }
  | { readonly type: "rework"; readonly shape: Shape | null }
  | { readonly type: "kilnMaster"; readonly value: HeatDelta | null };

export interface ImperialPriorityOptions {
  usable: boolean;
  vessels: ReadonlyArray<{ ceramicId: CeramicId; ceramic: CeramicState | null }>;
  glazes: readonly Glaze[];
  modifiers: readonly ImperialModifier[];
  reworkShapes: readonly Shape[];
  reworkTechId: "T05";
  /** Kiln Master's faces when its marker may go on this load (owned and ready), else null. */
  kilnMaster: { techId: "T24"; values: readonly HeatDelta[] } | null;
}

const BLANK: ImperialPriorityDraft = Object.freeze({ ceramicId: null, glaze: null, modifier: null, rework: null, kilnMaster: null });

function selectorOptions(engine: EngineView): SelectorOptions {
  return viewMemo(engine.view, "imperialPriorityOptions", () => imperialPriorityOptions(engine.view));
}

/** Kiln Master's faces when the selector says its marker may go on this load. */
function kilnMasterOf(engine: EngineView): ImperialPriorityOptions["kilnMaster"] {
  const selector = selectorOptions(engine);
  const viewerId = engine.view.viewerId;
  if (!selector.kilnMaster || viewerId === null) return null;
  const option = viewMemo(engine.view, `kilnMasterOption:${viewerId}`, () => kilnMasterOption(engine.view, viewerId));
  return option === null ? null : { techId: "T24", values: option.values };
}

function optionsOf(draft: ImperialPriorityDraft, engine: EngineView): ImperialPriorityOptions {
  const selector = selectorOptions(engine);
  const chosen = selector.ceramics.find((ceramic) => ceramic.ceramicId === draft.ceramicId) ?? null;
  return {
    usable: selector.usable,
    vessels: selector.ceramics.map((ceramic) => ({ ceramicId: ceramic.ceramicId, ceramic: engine.view.game.ceramics[ceramic.ceramicId] ?? null })),
    glazes: chosen?.glazes ?? [],
    modifiers: chosen?.imperialModifiers ?? [],
    reworkShapes: chosen?.reworkShapes ?? [],
    reworkTechId: "T05",
    kilnMaster: kilnMasterOf(engine),
  };
}

function revalidate(draft: ImperialPriorityDraft, engine: EngineView): ImperialPriorityDraft {
  const selector = selectorOptions(engine);
  const chosen = selector.usable ? selector.ceramics.find((ceramic) => ceramic.ceramicId === draft.ceramicId) ?? null : null;
  if (chosen === null) return keepIfSame(draft, BLANK);
  return keepIfSame(draft, {
    ceramicId: chosen.ceramicId,
    glaze: draft.glaze !== null && chosen.glazes.includes(draft.glaze) ? draft.glaze : null,
    modifier: draft.modifier !== null && chosen.imperialModifiers.includes(draft.modifier) ? draft.modifier : null,
    rework: draft.rework !== null && chosen.reworkShapes.includes(draft.rework) ? draft.rework : null,
    kilnMaster: draft.kilnMaster !== null && kilnMasterOf(engine)?.values.includes(draft.kilnMaster) === true ? draft.kilnMaster : null,
  });
}

export const imperialPriorityDraft: DraftModel<ImperialPriorityDraft, ImperialPriorityAction, ImperialPriorityOptions> = {
  initial(_model, engine) {
    const selector = selectorOptions(engine);
    const only = selector.ceramics.length === 1 ? selector.ceramics[0] : undefined;
    return only === undefined ? BLANK : revalidate({ ...BLANK, ceramicId: only.ceramicId }, engine);
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return revalidate(draft, engine);
      case "vessel":
        return draft.ceramicId === action.ceramicId ? draft : revalidate({ ...draft, ceramicId: action.ceramicId, rework: null }, engine);
      case "glaze":
        return revalidate({ ...draft, glaze: action.glaze }, engine);
      case "modifier":
        return revalidate({ ...draft, modifier: action.modifier }, engine);
      case "rework":
        return revalidate({ ...draft, rework: action.shape }, engine);
      case "kilnMaster":
        return revalidate({ ...draft, kilnMaster: action.value }, engine);
    }
  },
  options: (draft, _model, engine) => optionsOf(draft, engine),
  build(draft) {
    if (draft.ceramicId === null || draft.glaze === null || draft.modifier === null) return null;
    return {
      type: "USE_IMPERIAL_PRIORITY",
      ceramicId: draft.ceramicId,
      glaze: draft.glaze,
      imperialModifier: draft.modifier,
      ...(draft.rework === null ? {} : { reworkShape: draft.rework }),
      ...(draft.kilnMaster === null ? {} : { kilnMaster: draft.kilnMaster }),
    };
  },
  fromCommand(command) {
    if (command.type !== "USE_IMPERIAL_PRIORITY") return null;
    return { ceramicId: command.ceramicId, glaze: command.glaze, modifier: command.imperialModifier, rework: command.reworkShape ?? null, kilnMaster: command.kilnMaster ?? null };
  },
  summary(draft, _model, engine): RichMessage {
    if (draft.ceramicId === null) return msg("work.summary.chooseVessel");
    if (draft.glaze === null) return msg("work.summary.chooseGlaze");
    if (draft.modifier === null) return msg("work.summary.chooseModifier");
    const ceramic = vesselParam(engine.view, draft.ceramicId);
    const glaze = draft.glaze;
    const modifier = signedModifier(draft.modifier);
    const rework = draft.rework;
    const base =
      rework === null
        ? msg("work.summary.imperialPriority", { ceramic, glaze: (t) => glazeName(glaze, t.locale), modifier })
        : msg("work.summary.imperialPriorityRework", { ceramic, shape: (t) => shapeName(rework, t.locale), glaze: (t) => glazeName(glaze, t.locale), modifier });
    const km = draft.kilnMaster;
    if (km === null) return base;
    return msg("work.summary.withKilnMaster", { line: (t) => t.message(base), value: signedModifier(km) });
  },
};
