/**
 * B5's slice of the window registry (UI_V1.6.1_ARCHITECTURE §3.4, §3.5). Owner: B5 (firing,
 * Order, Cleanup and Results decisions). `decision/windows.ts` merges it with B4's slice and
 * never changes in phase B.
 *
 * Phase A stubs created by A2: every spec names its final component and draft model; the titles
 * are the engine phase names until B5 adds its `firing` / `orders` catalogue keys, and no spec
 * has a table adapter yet. `final` and `waiting` never send a command (`noDraft()`).
 */
import { phaseName } from "../i18n/content.ts";
import { list } from "../i18n/format.ts";
import { msg } from "../i18n/translator.ts";
import { defineWindow, noDraft } from "../state/draftStore.ts";
import type { WindowSpecFor, WindowText } from "../state/draftStore.ts";
import type { GameModel } from "../state/model.ts";
import { HandTrim } from "./cleanup/HandTrim.tsx";
import { handTrimDraft } from "./cleanup/HandTrim.draft.ts";
import { AfterQuality } from "./firing/AfterQuality.tsx";
import { afterQualityDraft } from "./firing/AfterQuality.draft.ts";
import { Contributions } from "./firing/Contributions.tsx";
import { contributionsDraft } from "./firing/Contributions.draft.ts";
import { HeatMarkers } from "./firing/HeatMarkers.tsx";
import { heatMarkersDraft } from "./firing/HeatMarkers.draft.ts";
import { Jun } from "./firing/Jun.tsx";
import { junDraft } from "./firing/Jun.draft.ts";
import { Salvage } from "./firing/Salvage.tsx";
import { salvageDraft } from "./firing/Salvage.draft.ts";
import { TestPieces } from "./firing/TestPieces.tsx";
import { testPiecesDraft } from "./firing/TestPieces.draft.ts";
import { OrderTurn } from "./orders/OrderTurn.tsx";
import { orderDraft } from "./orders/orderDraft.ts";
import { FinalSummary } from "./results/FinalSummary.tsx";
import { Waiting } from "./Waiting.tsx";

/** The window kinds this slice covers. */
export type FiringWindowKind =
  | "contributions"
  | "test_pieces"
  | "heat_markers"
  | "jun"
  | "after_quality"
  | "salvage"
  | "orders"
  | "hand_limit"
  | "final"
  | "waiting";

/** The engine phase's name as a heading ("the Work Phase" → "Work Phase"): the stub title until B5 lands its own. */
const phaseTitle = (model: GameModel): WindowText => (t) => {
  const name = phaseName(model.phaseType, t.locale);
  if (t.locale !== "en") return name;
  const bare = name.replace(/^the /, "");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
};

/** "Waiting for Lin and Zhao…" from the prompt's actors. */
const waitingTitle = (model: GameModel): WindowText => {
  const names = model.window.actorIds.map((id) => model.players.find((summary) => summary.playerId === id)?.displayName ?? "").filter((name) => name !== "");
  if (names.length === 0) return msg("common.status.waitingForOthers");
  return msg("common.status.waitingFor", { name: (t) => list(names, t.locale) });
};

export const FIRING_WINDOWS: { readonly [K in FiringWindowKind]: WindowSpecFor<K> } = {
  contributions: defineWindow({ kind: "contributions", Component: Contributions, draft: contributionsDraft, title: phaseTitle }),
  test_pieces: defineWindow({ kind: "test_pieces", Component: TestPieces, draft: testPiecesDraft, title: phaseTitle }),
  heat_markers: defineWindow({ kind: "heat_markers", Component: HeatMarkers, draft: heatMarkersDraft, title: phaseTitle }),
  jun: defineWindow({ kind: "jun", Component: Jun, draft: junDraft, title: phaseTitle }),
  after_quality: defineWindow({ kind: "after_quality", Component: AfterQuality, draft: afterQualityDraft, title: phaseTitle }),
  salvage: defineWindow({ kind: "salvage", Component: Salvage, draft: salvageDraft, title: phaseTitle }),
  orders: defineWindow({ kind: "orders", Component: OrderTurn, draft: orderDraft, title: phaseTitle }),
  hand_limit: defineWindow({ kind: "hand_limit", Component: HandTrim, draft: handTrimDraft, title: phaseTitle }),
  final: defineWindow({ kind: "final", Component: FinalSummary, draft: noDraft(), title: phaseTitle }),
  waiting: defineWindow({ kind: "waiting", Component: Waiting, draft: noDraft(), title: waitingTitle }),
};
