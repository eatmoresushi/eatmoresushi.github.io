/**
 * The draft model of the Heat-marker step (UI_V1.6.1_ARCHITECTURE §3.4 `heat_markers`, §3.5;
 * wireframe `decHeatMarker`). Owner: B5.
 *
 * Firing step 5, in First Player order, one `RESOLVE_HEAT_MARKERS` per player:
 * - **own marker** (required when `heatMarkerStepOptions.ownMarkerCeramicId` is set): turn it to
 *   +1 or −1, or return it;
 * - **Kiln Master** (optional, R4): its marker (+1 or −1) on one of your ceramics in this
 *   firing without a marker. The targets come from the selector: `targets`, or
 *   `targetsIfOwnReturned` once you return your own marker (INT: a returned marker frees its
 *   ceramic). Not placing it is the default: the command then simply omits it.
 *
 * Each side is listed with `validateAction`'s verdict; the panel states only the rule effect
 * (D3/D4: no Quality preview, no Fire-deck information).
 */
import { heatMarkerStepOptions } from "../../../game/index.ts";
import type { AuthoritativeCommand, CeramicId, GameRuleError, HeatMarkerValue } from "../../../game/index.ts";
import { signed } from "../../i18n/format.ts";
import { techName } from "../../i18n/content.ts";
import { msg } from "../../i18n/translator.ts";
import type { RichMessage, Translator } from "../../i18n/translator.ts";
import type { DraftModel } from "../../state/draftStore.ts";
import type { EngineView, GameModel } from "../../state/model.ts";
import { B5_TECHS, ceramicWords, probe } from "./firingSupport.ts";

/** The two sides of a Heat marker (display order; the engine checks every value). */
export const HEAT_MARKER_SIDES = [1, -1] as const satisfies readonly HeatMarkerValue[];

export type OwnMarkerChoice = HeatMarkerValue | "return";

export interface HeatMarkersDraft {
  readonly own: OwnMarkerChoice | null;
  /** "none" = do not place the Kiln Master marker. */
  readonly kmTarget: CeramicId | "none" | null;
  readonly kmValue: HeatMarkerValue | null;
}

export type HeatMarkersAction =
  | { readonly type: "own"; readonly choice: OwnMarkerChoice }
  | { readonly type: "kmTarget"; readonly target: CeramicId | "none" }
  | { readonly type: "kmValue"; readonly value: HeatMarkerValue };

export interface HeatMarkersOptions {
  /** The viewer's face-down marker and its three choices, or null without one. */
  own: { ceramicId: CeramicId; choices: { choice: OwnMarkerChoice; error: GameRuleError | null }[] } | null;
  /** Kiln Master, if owned: its targets now (given the own-marker choice) and the sides. */
  kilnMaster: {
    ready: boolean;
    /** Every ceramic it could go on; `needsReturn` = only once your own marker is returned from it. */
    targets: { ceramicId: CeramicId; available: boolean; needsReturn: boolean }[];
    sides: readonly HeatMarkerValue[];
  } | null;
}

const OWN_CHOICES: readonly OwnMarkerChoice[] = [...HEAT_MARKER_SIDES, "return"];

function optionsFor(draft: HeatMarkersDraft, engine: EngineView): HeatMarkersOptions {
  const step = heatMarkerStepOptions(engine.view);
  if (step === null) return { own: null, kilnMaster: null };
  const ownId = step.ownMarkerCeramicId;
  const own =
    ownId === null
      ? null
      : {
          ceramicId: ownId,
          choices: OWN_CHOICES.map((choice) => ({ choice, error: probe(engine, { type: "RESOLVE_HEAT_MARKERS", ownMarker: choice }) })),
        };
  const km = step.kilnMaster;
  let kilnMaster: HeatMarkersOptions["kilnMaster"] = null;
  if (km !== null) {
    const now = draft.own === "return" ? km.targetsIfOwnReturned : km.targets;
    const all = [...km.targets, ...km.targetsIfOwnReturned.filter((id) => !km.targets.includes(id))];
    kilnMaster = {
      ready: km.ready,
      targets: all.map((ceramicId) => ({ ceramicId, available: km.ready && now.includes(ceramicId), needsReturn: !km.targets.includes(ceramicId) })),
      sides: HEAT_MARKER_SIDES,
    };
  }
  return { own, kilnMaster };
}

function settle(draft: HeatMarkersDraft, engine: EngineView): HeatMarkersDraft {
  const options = optionsFor(draft, engine);
  const own = options.own !== null && options.own.choices.some((entry) => entry.choice === draft.own && entry.error === null) ? draft.own : null;
  const withOwn = own === draft.own ? options : optionsFor({ ...draft, own }, engine);
  const km = withOwn.kilnMaster;
  let kmTarget = draft.kmTarget;
  if (km === null || !km.ready) kmTarget = "none";
  else if (kmTarget !== null && kmTarget !== "none" && !km.targets.some((target) => target.ceramicId === kmTarget && target.available)) kmTarget = null;
  const kmValue = kmTarget === "none" || km === null || draft.kmValue === null || !km.sides.includes(draft.kmValue) ? null : draft.kmValue;
  return own === draft.own && kmTarget === draft.kmTarget && kmValue === draft.kmValue ? draft : { own, kmTarget, kmValue };
}

function commandOf(draft: HeatMarkersDraft, engine: EngineView): AuthoritativeCommand | null {
  const options = optionsFor(draft, engine);
  if (options.own !== null && draft.own === null) return null;
  if (draft.kmTarget === null) return null;
  if (draft.kmTarget !== "none" && draft.kmValue === null) return null;
  return {
    type: "RESOLVE_HEAT_MARKERS",
    ...(options.own === null || draft.own === null ? {} : { ownMarker: draft.own }),
    ...(draft.kmTarget === "none" || draft.kmValue === null ? {} : { kilnMaster: { ceramicId: draft.kmTarget, value: draft.kmValue } }),
  };
}

function summaryOf(draft: HeatMarkersDraft, model: GameModel, engine: EngineView): RichMessage | null {
  const options = optionsFor(draft, engine);
  const kiln = (t: Translator) => techName(B5_TECHS.kilnMaster, t.locale);
  let first: RichMessage | null = null;
  if (options.own !== null) {
    const ownId = options.own.ceramicId;
    const ceramic = (t: Translator) => ceramicWords(model, engine, ownId, t, undefined, false);
    if (draft.own === null) return msg("firing.hm.pick");
    if (draft.own === "return") first = msg("firing.hm.sumReturn", { ceramic });
    else first = msg("firing.hm.sumTurn", { ceramic, value: signed(draft.own) });
  }
  let second: RichMessage | null = null;
  if (options.kilnMaster !== null && options.kilnMaster.ready) {
    if (draft.kmTarget === "none") {
      if (first === null) second = msg("firing.km.sumNone", { tech: kiln });
    } else if (draft.kmTarget === null || draft.kmValue === null) return msg("firing.km.pickTarget", { tech: kiln });
    else {
      const target = draft.kmTarget;
      second = msg("firing.km.sum", { tech: kiln, value: signed(draft.kmValue), ceramic: (t) => ceramicWords(model, engine, target, t) });
    }
  }
  if (first !== null && second !== null) return msg("firing.hm.sumBoth", { first, second });
  if (first !== null) return first;
  return second;
}

export const heatMarkersDraft: DraftModel<HeatMarkersDraft, HeatMarkersAction, HeatMarkersOptions> = {
  initial(_model, engine) {
    return settle({ own: null, kmTarget: "none", kmValue: null }, engine);
  },
  reduce(draft, action, _model, engine) {
    switch (action.type) {
      case "revalidate":
        return settle(draft, engine);
      case "own":
        return settle({ ...draft, own: action.choice }, engine);
      case "kmTarget":
        return settle({ ...draft, kmTarget: action.target, kmValue: action.target === "none" ? null : draft.kmValue }, engine);
      case "kmValue":
        return settle({ ...draft, kmValue: action.value, kmTarget: draft.kmTarget === "none" ? null : draft.kmTarget }, engine);
    }
  },
  options(draft, _model, engine) {
    return optionsFor(draft, engine);
  },
  build(draft, _model, engine) {
    return commandOf(draft, engine);
  },
  fromCommand(command) {
    if (command.type !== "RESOLVE_HEAT_MARKERS") return null;
    return {
      own: command.ownMarker ?? null,
      kmTarget: command.kilnMaster?.ceramicId ?? "none",
      kmValue: command.kilnMaster?.value ?? null,
    };
  },
  summary(draft, model, engine) {
    return summaryOf(draft, model, engine);
  },
};

export function isHeatMarkerSide(value: string): HeatMarkerValue | null {
  const number = Number(value);
  return HEAT_MARKER_SIDES.find((side) => side === number) ?? null;
}
