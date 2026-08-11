import { KILN_IDS, TECHNIQUES } from "../game/index.ts";

export type StrategicScenarioKind = "technique" | "kiln" | "route" | "opponent" | "terminal";

export interface StrategicScenarioDefinition {
  id: string;
  kind: StrategicScenarioKind;
  subjectId: string;
  competency: string;
  expectedSignal: "buy_or_use" | "decline" | "advance_route" | "take_tempo" | "convert";
  positiveFixture?: string;
  declineFixture?: string;
}

const TECHNIQUE_COMPETENCIES: Record<string, string> = {
  T01: "buy before repeated Vase or Censer forming",
  T02: "buy before repeated mixed-shape forming",
  T03: "buy when Clay is scarce and Coins are safely substitutable",
  T04: "buy before repeated Order-matching forms",
  T05: "buy before repeated Carved decoration costs",
  T06: "buy before repeated Impressed decoration costs",
  T08: "buy early enough to filter several Office displays",
  T09: "buy with a loaded portfolio whose zone quality can improve",
  T10: "buy with future quality salvage demand and activation Coins",
  T11: "buy with a multi-ceramic firing portfolio near a heat threshold",
  T12: "buy with repeated natural exact-match chances",
  T13: "buy with a dense Masterpiece-capable portfolio",
  T14: "buy with surplus Masterpieces and future Office windows",
  T15: "buy only with a Fine-quality destination and another firing remaining",
  T16: "buy with vulnerable valuable ceramics and two-coin activation cover",
};

const KILN_COMPETENCIES: Record<string, string> = {
  RU: "coordinate Celadon Plain Masterpieces without distorting Order plans",
  GU: "use the fourth hand slot and decoration waiver only on legal Imperial completion",
  GE: "accept Crackle only when the forced decoration preserves route value",
  DI: "use paid duplicate forming only when vessel, Clay, and destination remain",
  JU: "adjust heat only when the quality or Order benefit is positive",
};

export const STRATEGIC_SCENARIO_CATALOG: readonly StrategicScenarioDefinition[] = [
  ...TECHNIQUES.map(({ id }) => ({
    id: `technique-${id.toLowerCase()}-positive-window`,
    kind: "technique" as const,
    subjectId: id,
    competency: TECHNIQUE_COMPETENCIES[id] ?? `evaluate ${id} from public future-use windows`,
    expectedSignal: "buy_or_use" as const,
    positiveFixture: `${id}: enough recurring public trigger windows to repay acquisition and activation costs`,
    declineFixture: `${id}: round five with no trigger window or destination remaining`,
  })),
  ...KILN_IDS.map((id) => ({
    id: `kiln-${id.toLowerCase()}-timing`,
    kind: "kiln" as const,
    subjectId: id,
    competency: KILN_COMPETENCIES[id] ?? `use ${id} only when its public counterfactual is positive`,
    expectedSignal: "buy_or_use" as const,
    positiveFixture: `${id}: legal ability improves route value or final quality after full cost`,
    declineFixture: `${id}: legal ability is neutral, harmful, or consumes a scarce once-per-round window`,
  })),
  {
    id: "route-multi-round-order-budget",
    kind: "route",
    subjectId: "orders",
    competency: "prefer a completable multi-round Order portfolio over higher printed but stranded value",
    expectedSignal: "advance_route",
  },
  {
    id: "opponent-last-location-space",
    kind: "opponent",
    subjectId: "action-board",
    competency: "take a needed contested location before opponents can fill it",
    expectedSignal: "take_tempo",
  },
  {
    id: "terminal-convert-before-new-pipeline",
    kind: "terminal",
    subjectId: "round-5",
    competency: "convert glazed and loaded ceramics instead of starting undeliverable work",
    expectedSignal: "convert",
  },
];

export function strategicScenarioCoverage(): {
  techniqueIds: string[];
  kilnIds: string[];
  missingTechniqueIds: string[];
  missingKilnIds: string[];
} {
  const techniqueIds = STRATEGIC_SCENARIO_CATALOG.filter(({ kind }) => kind === "technique").map(({ subjectId }) => subjectId).sort();
  const kilnIds = STRATEGIC_SCENARIO_CATALOG.filter(({ kind }) => kind === "kiln").map(({ subjectId }) => subjectId).sort();
  return {
    techniqueIds,
    kilnIds,
    missingTechniqueIds: TECHNIQUES.map(({ id }) => id).filter((id) => !techniqueIds.includes(id)),
    missingKilnIds: KILN_IDS.filter((id) => !kilnIds.includes(id)),
  };
}
